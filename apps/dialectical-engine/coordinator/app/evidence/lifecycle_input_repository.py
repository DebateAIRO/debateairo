"""Immutable persistence and honest resolution for evidence lifecycle input.

The database boundary stores exact JSON-like v1 candidate envelopes.  It
does not reinterpret provider/verifier output, fill score fields, or invent a
grounded evidence value.  Candidate validation and run arbitration remain in
the pure LIP-00 mapper; this module only loads persisted candidates and
withholds every result that is unavailable or semantically non-grounded.
"""
from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
import math
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.write_lock import flush_write
from app.exploration.lifecycle_inputs import (
    ExpectedLifecycleCorrelation,
    map_lifecycle_inputs,
)
from app.models.entities import EvidenceLifecycleSnapshot


class EvidenceLifecycleSnapshotConflict(ValueError):
    """Raised when an immutable full identity is repeated with new content."""


@dataclass(frozen=True)
class EvidenceLifecycleResolution:
    state: str
    reason_code: str
    value: Mapping[str, Any] | None
    grounded_for_abandonment: bool
    snapshot_id: str | None = None


def _plain_json(value: object, *, field_name: str = "snapshot") -> Any:
    if isinstance(value, Mapping):
        result: dict[str, Any] = {}
        for key, item in value.items():
            if not isinstance(key, str):
                raise ValueError(f"{field_name} keys must be strings")
            result[key] = _plain_json(item, field_name=f"{field_name}.{key}")
        return result
    if isinstance(value, (list, tuple)):
        return [_plain_json(item, field_name=field_name) for item in value]
    if value is None or isinstance(value, (str, bool, int)):
        return value
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError(f"{field_name} must not contain non-finite numbers")
        return value
    raise ValueError(f"{field_name} contains a non-JSON value")


def _canonical_bytes(value: object) -> bytes:
    return json.dumps(
        value,
        allow_nan=False,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


def _sha256(value: object) -> str:
    return hashlib.sha256(_canonical_bytes(value)).hexdigest()


def _non_empty_or_none(value: object) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


def _positive_int_or_none(value: object) -> int | None:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        return None
    return value


def _mapping_or_empty(value: object) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _utc_or_none(value: object) -> datetime | None:
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str):
        text = value.strip()
        if text.endswith("Z"):
            text = f"{text[:-1]}+00:00"
        try:
            parsed = datetime.fromisoformat(text)
        except ValueError:
            return None
    else:
        return None
    if parsed.tzinfo is None or parsed.utcoffset() != timezone.utc.utcoffset(parsed):
        return None
    return parsed.astimezone(timezone.utc)


def _rfc3339_utc(value: datetime | str | None) -> str | None:
    parsed = _utc_or_none(value)
    if parsed is None:
        return None
    return parsed.isoformat().replace("+00:00", "Z")


def _identity_document(snapshot: Mapping[str, Any]) -> dict[str, Any]:
    provenance = _mapping_or_empty(snapshot.get("provenance"))
    run = _mapping_or_empty(provenance.get("run"))
    return {
        "component": "evidence",
        "schema_version": snapshot.get("schema_version"),
        "debate_id": snapshot.get("debate_id"),
        "node_id": snapshot.get("node_id"),
        "source_identity": snapshot.get("source_identity"),
        "run": {"run_id": run.get("run_id"), "sequence": run.get("sequence")},
    }


def persist_evidence_lifecycle_snapshot(
    db: Session,
    *,
    snapshot: Mapping[str, Any],
    verification_status: str | None,
) -> EvidenceLifecycleSnapshot:
    """Persist one immutable candidate, returning an existing exact repeat.

    Malformed and legacy envelopes are intentionally preservable: the pure
    mapper must classify them rather than the repository silently repairing
    or dropping them.  Only the storage-required debate/node keys and JSON
    representability are enforced here.
    """

    payload = _plain_json(snapshot)
    assert isinstance(payload, dict)
    debate_id = _non_empty_or_none(payload.get("debate_id"))
    node_id = _non_empty_or_none(payload.get("node_id"))
    if debate_id is None or node_id is None:
        raise ValueError("snapshot debate_id and node_id must be non-empty strings")
    clean_verification_status = _non_empty_or_none(verification_status)
    if verification_status is not None and clean_verification_status is None:
        raise ValueError("verification_status must be a non-empty string or None")

    identity_sha256 = _sha256(_identity_document(payload))
    payload_sha256 = _sha256(
        {"snapshot": payload, "verification_status": clean_verification_status}
    )
    existing = db.scalar(
        select(EvidenceLifecycleSnapshot).where(
            EvidenceLifecycleSnapshot.identity_sha256 == identity_sha256
        )
    )
    if existing is not None:
        if existing.payload_sha256 == payload_sha256:
            return existing
        raise EvidenceLifecycleSnapshotConflict(
            "immutable evidence lifecycle snapshot identity has conflicting content"
        )

    source = _mapping_or_empty(payload.get("source_identity"))
    provenance = _mapping_or_empty(payload.get("provenance"))
    run = _mapping_or_empty(provenance.get("run"))
    row = EvidenceLifecycleSnapshot(
        schema_version=_non_empty_or_none(payload.get("schema_version")),
        debate_id=debate_id,
        node_id=node_id,
        evidence_node_id=_non_empty_or_none(source.get("evidence_node_id")),
        claim_node_id=_non_empty_or_none(source.get("claim_node_id")),
        generation_id=_non_empty_or_none(source.get("generation_id")),
        reference=_non_empty_or_none(source.get("reference")),
        content_sha256=_non_empty_or_none(source.get("content_sha256")),
        evidence_kind=_non_empty_or_none(source.get("evidence_kind")),
        availability=_non_empty_or_none(payload.get("availability")),
        verification_status=clean_verification_status,
        unavailability_reason=_non_empty_or_none(payload.get("unavailability_reason")),
        source_kind=_non_empty_or_none(provenance.get("source_kind")),
        source_record_id=_non_empty_or_none(provenance.get("source_record_id")),
        run_id=_non_empty_or_none(run.get("run_id")),
        sequence=_positive_int_or_none(run.get("sequence")),
        producer=_non_empty_or_none(provenance.get("producer")),
        observed_at=_utc_or_none(payload.get("observed_at")),
        recorded_at=_utc_or_none(provenance.get("recorded_at")),
        checked_at=_utc_or_none(provenance.get("checked_at")),
        payload=payload,
        payload_sha256=payload_sha256,
        identity_sha256=identity_sha256,
    )
    db.add(row)
    flush_write(db)
    return row


def load_evidence_lifecycle_candidates(
    db: Session,
    *,
    debate_id: str,
    node_id: str,
) -> tuple[Mapping[str, Any], ...]:
    """Load plain candidate mappings without applying timestamp ordering."""

    rows = db.scalars(
        select(EvidenceLifecycleSnapshot)
        .where(
            EvidenceLifecycleSnapshot.debate_id == debate_id,
            EvidenceLifecycleSnapshot.node_id == node_id,
        )
        .order_by(EvidenceLifecycleSnapshot.identity_sha256.asc())
    ).all()
    return tuple(_plain_json(row.payload) for row in rows)


def _selected_snapshot_id(
    rows: list[EvidenceLifecycleSnapshot],
    *,
    expected: ExpectedLifecycleCorrelation,
    run_id: str | None,
    sequence: int | None,
) -> str | None:
    source = expected.expected_evidence_source
    if source is None:
        return None
    matches = [
        row
        for row in rows
        if row.run_id == run_id
        and row.sequence == sequence
        and isinstance(row.payload, Mapping)
        and row.payload.get("schema_version") == expected.schema_version
        and row.evidence_node_id == source.evidence_node_id
        and row.claim_node_id == source.claim_node_id
        and row.generation_id == source.generation_id
        and row.reference == source.reference
        and row.content_sha256 == source.content_sha256
        and row.evidence_kind == source.evidence_kind
    ]
    return matches[0].id if len(matches) == 1 else None


def resolve_evidence_lifecycle_input(
    db: Session,
    *,
    expected: ExpectedLifecycleCorrelation,
) -> EvidenceLifecycleResolution:
    """Resolve current evidence and expose values only for semantic grounding."""

    rows = db.scalars(
        select(EvidenceLifecycleSnapshot)
        .where(
            EvidenceLifecycleSnapshot.debate_id == expected.debate_id,
            EvidenceLifecycleSnapshot.node_id == expected.node_id,
        )
        .order_by(EvidenceLifecycleSnapshot.identity_sha256.asc())
    ).all()
    candidates = tuple(_plain_json(row.payload) for row in rows)
    mapped = map_lifecycle_inputs(
        expected=expected,
        score_candidates=(),
        evidence_candidates=candidates,
    )
    resolution = mapped.evidence_resolution
    provenance = resolution.provenance
    snapshot_id = None
    if provenance is not None:
        snapshot_id = _selected_snapshot_id(
            rows,
            expected=expected,
            run_id=provenance.run.run_id,
            sequence=provenance.run.sequence,
        )
    if resolution.state != "grounded":
        return EvidenceLifecycleResolution(
            state=resolution.state,
            reason_code=resolution.reason_code,
            value=None,
            grounded_for_abandonment=False,
            snapshot_id=snapshot_id,
        )

    selected = next((row for row in rows if row.id == snapshot_id), None)
    value = selected.payload.get("value") if selected is not None else None
    if not isinstance(value, Mapping):
        return EvidenceLifecycleResolution(
            state="malformed",
            reason_code="present_value_missing",
            value=None,
            grounded_for_abandonment=False,
            snapshot_id=snapshot_id,
        )
    semantic_status = value.get("status")
    if semantic_status == "grounded" and selected.verification_status != "supported":
        verification_status = selected.verification_status or "missing"
        return EvidenceLifecycleResolution(
            state="mismatched",
            reason_code=(
                f"verification_status_{verification_status}_does_not_support_grounded_evidence"
            ),
            value=None,
            grounded_for_abandonment=False,
            snapshot_id=snapshot_id,
        )
    if semantic_status != "grounded":
        status = semantic_status if isinstance(semantic_status, str) else "non_grounded"
        return EvidenceLifecycleResolution(
            state=status,
            reason_code=f"evidence_semantic_status_{status}",
            value=None,
            grounded_for_abandonment=False,
            snapshot_id=snapshot_id,
        )
    return EvidenceLifecycleResolution(
        state="grounded",
        reason_code="evidence_grounded",
        value=_plain_json(value, field_name="evidence_value"),
        grounded_for_abandonment=True,
        snapshot_id=snapshot_id,
    )


def build_verification_lifecycle_snapshot(
    *,
    debate_id: str,
    claim_node_id: str,
    evidence_node_id: str,
    evidence_generation_id: str,
    evidence_text: str,
    evidence_kind: str,
    verification_run_id: str,
    sequence: int,
    verification_status: str,
    verification_reason: str | None,
    recorded_at: datetime,
    checked_at: datetime | str | None,
    authoritative_evidence: Mapping[str, Any] | None = None,
) -> Mapping[str, Any]:
    """Project only complete facts established by the verifier response."""

    recorded_text = _rfc3339_utc(recorded_at)
    if recorded_text is None:
        raise ValueError("recorded_at must be timezone-aware UTC")
    checked_text = _rfc3339_utc(checked_at)
    source_identity = {
        "evidence_node_id": evidence_node_id,
        "claim_node_id": claim_node_id,
        "generation_id": evidence_generation_id,
        # This is an internal persisted-source reference, not a claim of an
        # external citation.  It is derived from the actual row ID.
        "reference": f"evidence-node:{evidence_node_id}",
        "content_sha256": hashlib.sha256(evidence_text.encode("utf-8")).hexdigest(),
        "evidence_kind": evidence_kind,
    }
    value = None
    availability = "terminal_unverifiable"
    reason = verification_reason
    if verification_status == "supported" and authoritative_evidence is not None:
        value = {"source": source_identity, **_plain_json(authoritative_evidence)}
        availability = "present"
        reason = None
    elif reason is None:
        reason = f"verification_{verification_status}_without_authoritative_evidence_values"
    return {
        "schema_version": "lifecycle-input-persistence/v1",
        "debate_id": debate_id,
        "node_id": claim_node_id,
        "source_identity": source_identity,
        "availability": availability,
        "observed_at": recorded_text,
        "provenance": {
            "source_kind": "evidence_verification_run",
            "source_record_id": verification_run_id,
            "run": {"run_id": verification_run_id, "sequence": sequence},
            "producer": "evidence-verification-v1",
            "recorded_at": recorded_text,
            "checked_at": checked_text,
        },
        "value": value,
        "unavailability_reason": reason,
    }
