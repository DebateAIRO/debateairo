"""Immutable persistence for redacted lifecycle-decision audit records."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.write_lock import hold_write_lock
from app.exploration.policy import EXPANSION_ACTIONS
from app.models.entities import LifecycleDecisionRecord


LIFECYCLE_DECISION_SCHEMA_VERSION = "lifecycle-decision-record/v1"
_INPUT_STATES = {
    "grounded",
    "missing",
    "pending",
    "unverifiable",
    "stale",
    "mismatched",
    "malformed",
}
_PATH_STATUSES = {"active", "abandoned"}
_AVAILABILITIES = {"absent", "present", "in_progress", "terminal_unverifiable"}
_FRESHNESSES = {"unknown", "fresh", "stale"}
_COMPONENT_STATUS_PAIRS = {
    "absent": {"unknown"},
    "present": {"unknown", "fresh", "stale"},
    "in_progress": {"unknown"},
    "terminal_unverifiable": {"unknown"},
}
# W4: seek_evidence joined the child-spawning vocabulary -- the adaptive
# dispatcher's decision->work mapping spawns a PRO child for it (challenge
# spawns a CON child). Snapshots are still always persisted with
# child_spawn_count=0 at decision time; real counts are written by the
# dispatcher after it queues work.
_CHILD_SPAWNING_ACTIONS = {"continue", "deepen", "challenge", "seek_evidence"}
_SIGNAL_CLASSES = {"categorical", "scalar"}
_STOPPING_STATUSES = set(EXPANSION_ACTIONS) | {"active"}
_REASON_CODE_RE = re.compile(r"^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$")
_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")


@dataclass(frozen=True)
class LifecycleDecisionSnapshot:
    schema_version: str | None
    idempotency_key: str
    debate_id: str
    node_id: str
    decision: str
    stopping_reason: str
    path_status: str
    stopping_status: str
    input_state: str
    reason_codes: tuple[str, ...]
    score_availability: str | None
    score_freshness: str | None
    evidence_availability: str | None
    evidence_freshness: str | None
    current_score_input_hash: str | None
    scoring_contract_hash: str | None
    score_record_id: str | None
    score_run_id: str | None
    score_run_sequence: int | None
    evidence_snapshot_id: str | None
    decision_timestamp: datetime
    child_spawn_count: int
    # W4 additive fields. signal_class is the policy's structural
    # classification (fail-closed default "scalar" for legacy callers);
    # config_override is honest-but-empty provenance for a future explicit
    # scalar-override path that is deliberately NOT built yet -- nothing may
    # set it in W4.
    signal_class: str = "scalar"
    config_override: str | None = None


@dataclass(frozen=True)
class LifecycleDecisionPersistence:
    record: LifecycleDecisionRecord
    persistence_result: str


def _nonblank(value: object, field_name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field_name} must be a non-empty string")
    return value.strip()


def _optional_nonblank(value: object, field_name: str) -> str | None:
    if value is None:
        return None
    return _nonblank(value, field_name)


def _choice(value: object, field_name: str, allowed: set[str]) -> str:
    text = _nonblank(value, field_name)
    if text not in allowed:
        raise ValueError(f"{field_name} must be one of {sorted(allowed)}")
    return text


def _optional_sha256(value: object, field_name: str) -> str | None:
    if value is None:
        return None
    text = _nonblank(value, field_name)
    if _SHA256_RE.fullmatch(text) is None:
        raise ValueError(f"{field_name} must be SHA-256 lowercase hexadecimal")
    return text


def _optional_positive_int(value: object, field_name: str) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ValueError(f"{field_name} must be a positive integer or None")
    return value


def _nonnegative_int(value: object, field_name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(f"{field_name} must be a non-negative integer")
    return value


def _reason_codes(value: object) -> list[str]:
    if not isinstance(value, tuple):
        raise ValueError("reason_codes must be a tuple")
    normalized: list[str] = []
    for reason in value:
        text = _nonblank(reason, "reason_codes item")
        if _REASON_CODE_RE.fullmatch(text) is None:
            raise ValueError("reason_codes item must be normalized lower_snake_case")
        normalized.append(text)
    if len(set(normalized)) != len(normalized):
        raise ValueError("reason_codes must not contain duplicates")
    return normalized


def _component_status(
    availability: object,
    freshness: object,
    component: str,
) -> tuple[str, str]:
    normalized_availability = _choice(
        availability,
        f"{component}_availability",
        _AVAILABILITIES,
    )
    normalized_freshness = _choice(
        freshness,
        f"{component}_freshness",
        _FRESHNESSES,
    )
    if normalized_freshness not in _COMPONENT_STATUS_PAIRS[normalized_availability]:
        raise ValueError(f"{component} availability/freshness combination is invalid")
    return normalized_availability, normalized_freshness


def _utc(value: datetime) -> datetime:
    if not isinstance(value, datetime) or value.tzinfo is None:
        raise ValueError("decision_timestamp must be timezone-aware UTC")
    if value.utcoffset() != timezone.utc.utcoffset(value):
        raise ValueError("decision_timestamp must be timezone-aware UTC")
    return value.astimezone(timezone.utc)


def _normalized(snapshot: LifecycleDecisionSnapshot) -> dict[str, object]:
    if snapshot.schema_version != LIFECYCLE_DECISION_SCHEMA_VERSION:
        raise ValueError(
            f"schema_version must equal {LIFECYCLE_DECISION_SCHEMA_VERSION}"
        )

    decision = _nonblank(snapshot.decision, "decision")
    if decision not in EXPANSION_ACTIONS:
        raise ValueError(f"decision must be one of {sorted(EXPANSION_ACTIONS)}")

    score_run_sequence = _optional_positive_int(
        snapshot.score_run_sequence,
        "score_run_sequence",
    )
    child_spawn_count = _nonnegative_int(
        snapshot.child_spawn_count,
        "child_spawn_count",
    )
    reason_codes = _reason_codes(snapshot.reason_codes)
    path_status = _choice(snapshot.path_status, "path_status", _PATH_STATUSES)
    stopping_status = _choice(
        snapshot.stopping_status,
        "stopping_status",
        _STOPPING_STATUSES,
    )
    input_state = _choice(snapshot.input_state, "input_state", _INPUT_STATES)
    score_availability, score_freshness = _component_status(
        snapshot.score_availability,
        snapshot.score_freshness,
        "score",
    )
    evidence_availability, evidence_freshness = _component_status(
        snapshot.evidence_availability,
        snapshot.evidence_freshness,
        "evidence",
    )
    current_score_input_hash = _optional_sha256(
        snapshot.current_score_input_hash,
        "current_score_input_hash",
    )
    scoring_contract_hash = _optional_sha256(
        snapshot.scoring_contract_hash,
        "scoring_contract_hash",
    )
    score_record_id = _optional_nonblank(snapshot.score_record_id, "score_record_id")
    score_run_id = _optional_nonblank(snapshot.score_run_id, "score_run_id")
    evidence_snapshot_id = _optional_nonblank(
        snapshot.evidence_snapshot_id,
        "evidence_snapshot_id",
    )

    if decision == "abandon":
        if input_state != "grounded":
            raise ValueError("abandon requires grounded input")
        if path_status != "abandoned":
            raise ValueError("path_status must be abandoned for abandon")
        if stopping_status != decision:
            raise ValueError("stopping_status must equal decision")
    elif path_status == "active":
        preserves_unavailable_state = (
            input_state != "grounded"
            and stopping_status == "active"
            and child_spawn_count == 0
        )
        if stopping_status != decision and not preserves_unavailable_state:
            raise ValueError("stopping_status must equal decision")
    else:
        if input_state == "grounded" or stopping_status != "abandon":
            raise ValueError(
                "only unavailable input may preserve an existing abandoned path"
            )
        if child_spawn_count:
            raise ValueError("an abandoned path cannot spawn children")
    if decision not in _CHILD_SPAWNING_ACTIONS and child_spawn_count:
        raise ValueError(f"{decision} cannot spawn children")

    if input_state == "grounded":
        if reason_codes:
            raise ValueError("grounded input must not contain reason codes")
        if (score_availability, score_freshness) != ("present", "fresh") or (
            evidence_availability,
            evidence_freshness,
        ) != ("present", "fresh"):
            raise ValueError("grounded input requires present, fresh score and evidence")
        grounded_identities = {
            "current_score_input_hash": current_score_input_hash,
            "scoring_contract_hash": scoring_contract_hash,
            "score_record_id": score_record_id,
            "score_run_id": score_run_id,
            "score_run_sequence": score_run_sequence,
            "evidence_snapshot_id": evidence_snapshot_id,
        }
        for field_name, value in grounded_identities.items():
            if value is None:
                raise ValueError(f"grounded input requires {field_name}")

    if (score_run_id is None) != (score_run_sequence is None):
        raise ValueError("score_run_id and score_run_sequence must be present together")

    return {
        "schema_version": LIFECYCLE_DECISION_SCHEMA_VERSION,
        "idempotency_key": _nonblank(snapshot.idempotency_key, "idempotency_key"),
        "debate_id": _nonblank(snapshot.debate_id, "debate_id"),
        "node_id": _nonblank(snapshot.node_id, "node_id"),
        "decision": decision,
        "stopping_reason": _nonblank(snapshot.stopping_reason, "stopping_reason"),
        "path_status": path_status,
        "stopping_status": stopping_status,
        "input_state": input_state,
        "reason_codes": reason_codes,
        "score_availability": score_availability,
        "score_freshness": score_freshness,
        "evidence_availability": evidence_availability,
        "evidence_freshness": evidence_freshness,
        "current_score_input_hash": current_score_input_hash,
        "scoring_contract_hash": scoring_contract_hash,
        "score_record_id": score_record_id,
        "score_run_id": score_run_id,
        "score_run_sequence": score_run_sequence,
        "evidence_snapshot_id": evidence_snapshot_id,
        "decision_timestamp": _utc(snapshot.decision_timestamp),
        "child_spawn_count": child_spawn_count,
        "signal_class": _choice(snapshot.signal_class, "signal_class", _SIGNAL_CLASSES),
        "config_override": _optional_nonblank(snapshot.config_override, "config_override"),
    }


def _snapshot_sha256(values: dict[str, object]) -> str:
    # signal_class/config_override are excluded from the replay identity:
    # pre-W4 rows carry hashes computed without them, and (like
    # child_spawn_count) they belong to the dispatch lifecycle layered on top
    # of the decision, not to the decision's input identity.
    identity_values = {
        key: value
        for key, value in values.items()
        if key not in {"idempotency_key", "child_spawn_count", "signal_class", "config_override"}
    }
    identity_values["decision_timestamp"] = values["decision_timestamp"].isoformat()
    encoded = json.dumps(
        identity_values,
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def persist_lifecycle_decision(
    db: Session,
    *,
    snapshot: LifecycleDecisionSnapshot,
) -> LifecycleDecisionPersistence:
    """Persist one immutable normalized snapshot."""

    values = _normalized(snapshot)
    snapshot_sha256 = _snapshot_sha256(values)
    with hold_write_lock():
        existing = db.scalar(
            select(LifecycleDecisionRecord).where(
                LifecycleDecisionRecord.idempotency_key == values["idempotency_key"]
            )
        )
        if existing is not None:
            if existing.snapshot_sha256 != snapshot_sha256:
                raise ValueError(
                    "lifecycle decision idempotency identity has conflicting input"
                )
            return LifecycleDecisionPersistence(
                record=existing,
                persistence_result="replayed",
            )
        record = LifecycleDecisionRecord(
            **values,
            snapshot_sha256=snapshot_sha256,
        )
        db.add(record)
        db.flush()
    return LifecycleDecisionPersistence(record=record, persistence_result="created")
