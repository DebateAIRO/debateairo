from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, select

from app.core.db import Base
from app.evidence.lifecycle_input_repository import (
    EvidenceLifecycleSnapshotConflict,
    persist_evidence_lifecycle_snapshot,
    resolve_evidence_lifecycle_input,
)
from app.evidence.verification_evaluator import evaluate_evidence_verdict
from app.exploration.lifecycle_inputs import (
    SCHEMA_VERSION,
    EvidenceSourceIdentity,
    ExpectedLifecycleCorrelation,
    ScoringContractIdentity,
)
from app.models.entities import (
    Debate,
    DebateBranch,
    EvidenceLifecycleSnapshot,
    Generation,
    Node,
    Worker,
)
from app.scoring.judges import ScoringProviderResult


SOURCE = {
    "evidence_node_id": "evidence-node-1",
    "claim_node_id": "claim-node-1",
    "generation_id": "evidence-generation-1",
    "reference": "evidence-node:evidence-node-1",
    "content_sha256": hashlib.sha256(b"persisted evidence text").hexdigest(),
    "evidence_kind": "statistical",
}
CONTRACT_HASH = hashlib.sha256(b"judge contract").hexdigest()
SCORE_INPUT_HASH = hashlib.sha256(b"score input").hexdigest()


def _expected(*, evidence_max_age_seconds: int = 3600) -> ExpectedLifecycleCorrelation:
    from datetime import datetime, timezone

    return ExpectedLifecycleCorrelation(
        schema_version=SCHEMA_VERSION,
        debate_id="debate-1",
        node_id="claim-node-1",
        current_score_input_hash=SCORE_INPUT_HASH,
        active_scoring_contract=ScoringContractIdentity(
            judge_id="judge-1",
            judge_version="1",
            role="truth",
            rubric_version="rubric-v1",
            prompt_version="prompt-v1",
            output_schema_version="score-v1",
            reducer_version="reducer-v1",
            contract_hash=CONTRACT_HASH,
        ),
        expected_evidence_source=EvidenceSourceIdentity(**SOURCE),
        decision_timestamp=datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc),
        score_max_age_seconds=3600,
        evidence_max_age_seconds=evidence_max_age_seconds,
    )


def _provenance(*, run_id: str = "verification-run-1", sequence: int = 1) -> dict:
    return {
        "source_kind": "evidence_verification_run",
        "source_record_id": run_id,
        "run": {"run_id": run_id, "sequence": sequence},
        "producer": "evidence-verification-v1",
        "recorded_at": "2026-01-01T11:59:00Z",
        "checked_at": "2026-01-01T11:59:00Z",
    }


def _value(*, status: str = "grounded", entailment: str = "SUPPORTS") -> dict:
    return {
        "source": dict(SOURCE),
        "status": status,
        "base_score": 0.82,
        "uncertainty": 0.12,
        "entailment": entailment,
        "caveats": [],
        "evaluator_id": "verification-judge-1",
        "evaluator_version": "evidence-verification-v1",
    }


def _snapshot(
    *,
    availability: str = "present",
    observed_at: str | None = "2026-01-01T11:59:00Z",
    provenance: dict | None = None,
    value: dict | None = None,
    reason: str | None = None,
) -> dict:
    if provenance is None and availability != "absent":
        provenance = _provenance()
    if value is None and availability == "present":
        value = _value()
    return {
        "schema_version": SCHEMA_VERSION,
        "debate_id": "debate-1",
        "node_id": "claim-node-1",
        "source_identity": dict(SOURCE),
        "availability": availability,
        "observed_at": observed_at,
        "provenance": provenance,
        "value": value,
        "unavailability_reason": reason,
    }


def test_resolver_reports_explicit_missing_when_no_snapshot_exists(db) -> None:
    resolved = resolve_evidence_lifecycle_input(db, expected=_expected())

    assert resolved.state == "missing"
    assert resolved.reason_code == "evidence_missing"
    assert resolved.value is None
    assert resolved.grounded_for_abandonment is False


@pytest.mark.parametrize(
    ("snapshot", "expected_state", "expected_reason"),
    [
        (
            _snapshot(
                availability="in_progress",
                observed_at=None,
                value=None,
                reason="verification_pending",
            ),
            "pending",
            "verification_pending",
        ),
        (
            _snapshot(
                availability="terminal_unverifiable",
                value=None,
                reason="verification_judge_call_failed",
            ),
            "unverifiable",
            "verification_judge_call_failed",
        ),
        (
            _snapshot(provenance={**_provenance(), "producer": ""}),
            "malformed",
            "malformed_evidence_candidate:producer must be a non-empty string",
        ),
    ],
)
def test_resolver_preserves_explicit_non_grounded_states(
    db,
    snapshot: dict,
    expected_state: str,
    expected_reason: str,
) -> None:
    persist_evidence_lifecycle_snapshot(db, snapshot=snapshot, verification_status=expected_state)

    resolved = resolve_evidence_lifecycle_input(db, expected=_expected())

    assert resolved.state == expected_state
    assert resolved.reason_code == expected_reason
    assert resolved.value is None
    assert resolved.grounded_for_abandonment is False


def test_resolver_withholds_authoritative_but_contradicted_evidence(db) -> None:
    contradicted = _snapshot(value=_value(status="contradicted", entailment="REFUTES"))
    persist_evidence_lifecycle_snapshot(db, snapshot=contradicted, verification_status="contradicted")

    resolved = resolve_evidence_lifecycle_input(db, expected=_expected())

    assert resolved.state == "contradicted"
    assert resolved.reason_code == "evidence_semantic_status_contradicted"
    assert resolved.value is None
    assert resolved.grounded_for_abandonment is False


@pytest.mark.parametrize("verification_status", ["contradicted", "unverifiable", "pending"])
def test_non_supporting_persisted_verification_cannot_ground_a_supported_payload(
    db,
    verification_status: str,
) -> None:
    persist_evidence_lifecycle_snapshot(
        db,
        snapshot=_snapshot(),
        verification_status=verification_status,
    )

    resolved = resolve_evidence_lifecycle_input(db, expected=_expected())

    assert resolved.state == "mismatched"
    assert resolved.reason_code == (
        f"verification_status_{verification_status}_does_not_support_grounded_evidence"
    )
    assert resolved.value is None
    assert resolved.grounded_for_abandonment is False


def test_resolver_reports_stale_without_returning_the_stored_value(db) -> None:
    stale = _snapshot(observed_at="2026-01-01T11:00:00Z")
    persist_evidence_lifecycle_snapshot(db, snapshot=stale, verification_status="supported")

    resolved = resolve_evidence_lifecycle_input(db, expected=_expected(evidence_max_age_seconds=60))

    assert resolved.state == "stale"
    assert resolved.reason_code == "evidence_stale"
    assert resolved.value is None
    assert resolved.grounded_for_abandonment is False


def test_newer_pending_snapshot_supersedes_older_grounded_snapshot(db) -> None:
    older = _snapshot()
    newer = _snapshot(
        availability="in_progress",
        observed_at="2026-01-01T11:59:30Z",
        provenance=_provenance(run_id="verification-run-2", sequence=2),
        value=None,
        reason="newer_verification_pending",
    )
    persist_evidence_lifecycle_snapshot(db, snapshot=older, verification_status="supported")
    persist_evidence_lifecycle_snapshot(db, snapshot=newer, verification_status="pending")

    resolved = resolve_evidence_lifecycle_input(db, expected=_expected())

    assert resolved.state == "pending"
    assert resolved.reason_code == "newer_verification_pending"
    assert resolved.value is None
    assert resolved.grounded_for_abandonment is False


def test_legacy_snapshot_remains_unverifiable(db) -> None:
    legacy = _snapshot()
    legacy.pop("schema_version")
    persist_evidence_lifecycle_snapshot(db, snapshot=legacy, verification_status="supported")

    resolved = resolve_evidence_lifecycle_input(db, expected=_expected())

    assert resolved.state == "unverifiable"
    assert resolved.reason_code == "legacy_schema_version_missing"
    assert resolved.value is None
    assert resolved.grounded_for_abandonment is False


def test_valid_current_grounded_snapshot_is_the_only_value_returned(db) -> None:
    persisted = persist_evidence_lifecycle_snapshot(
        db,
        snapshot=_snapshot(),
        verification_status="supported",
    )

    resolved = resolve_evidence_lifecycle_input(db, expected=_expected())

    assert resolved.state == "grounded"
    assert resolved.reason_code == "evidence_grounded"
    assert resolved.value == _value()
    assert resolved.grounded_for_abandonment is True
    assert resolved.snapshot_id == persisted.id


def test_exact_source_row_remains_selected_when_other_source_reuses_run_pair(db) -> None:
    expected_row = persist_evidence_lifecycle_snapshot(
        db,
        snapshot=_snapshot(),
        verification_status="supported",
    )
    other_source = {
        **SOURCE,
        "evidence_node_id": "evidence-node-other",
        "generation_id": "evidence-generation-other",
        "reference": "evidence-node:evidence-node-other",
        "content_sha256": hashlib.sha256(b"different persisted evidence text").hexdigest(),
    }
    other_snapshot = _snapshot()
    other_snapshot["source_identity"] = other_source
    other_snapshot["value"] = {**_value(), "source": other_source}
    persist_evidence_lifecycle_snapshot(
        db,
        snapshot=other_snapshot,
        verification_status="supported",
    )

    resolved = resolve_evidence_lifecycle_input(db, expected=_expected())

    assert resolved.state == "grounded"
    assert resolved.reason_code == "evidence_grounded"
    assert resolved.value == _value()
    assert resolved.grounded_for_abandonment is True
    assert resolved.snapshot_id == expected_row.id


@pytest.mark.parametrize(
    "declared_schema",
    ["lifecycle-input-persistence/v2", f"{SCHEMA_VERSION} "],
)
def test_selected_snapshot_requires_exact_raw_schema_declaration(
    db,
    declared_schema: str,
) -> None:
    expected_row = persist_evidence_lifecycle_snapshot(
        db,
        snapshot=_snapshot(),
        verification_status="supported",
    )
    unsupported_twin = _snapshot()
    unsupported_twin["schema_version"] = declared_schema
    persist_evidence_lifecycle_snapshot(
        db,
        snapshot=unsupported_twin,
        verification_status="supported",
    )

    resolved = resolve_evidence_lifecycle_input(db, expected=_expected())

    assert resolved.state == "grounded"
    assert resolved.reason_code == "evidence_grounded"
    assert resolved.value == _value()
    assert resolved.grounded_for_abandonment is True
    assert resolved.snapshot_id == expected_row.id


def test_persistence_is_idempotent_and_rejects_same_identity_content_conflict(db) -> None:
    snapshot = _snapshot()
    first = persist_evidence_lifecycle_snapshot(db, snapshot=snapshot, verification_status="supported")
    repeated = persist_evidence_lifecycle_snapshot(db, snapshot=snapshot, verification_status="supported")

    assert repeated.id == first.id
    assert db.scalars(select(EvidenceLifecycleSnapshot)).all() == [first]

    conflicting = _snapshot(value={**_value(), "base_score": 0.25})
    with pytest.raises(EvidenceLifecycleSnapshotConflict, match="immutable evidence lifecycle snapshot"):
        persist_evidence_lifecycle_snapshot(db, snapshot=conflicting, verification_status="supported")


def test_create_all_and_alembic_have_matching_additive_snapshot_schema(tmp_path, monkeypatch) -> None:
    create_all_path = tmp_path / "create-all.sqlite3"
    migrated_path = tmp_path / "migrated.sqlite3"
    create_all_engine = create_engine(f"sqlite:///{create_all_path}", future=True)
    Base.metadata.create_all(create_all_engine)

    coordinator_dir = Path(__file__).resolve().parents[1]
    monkeypatch.setenv("DIALECTICAL_HOME", str(tmp_path / "migration-home"))
    monkeypatch.setenv("DIALECTICAL_DATABASE_URL", f"sqlite:///{migrated_path}")
    config = Config(str(coordinator_dir / "alembic.ini"))
    config.set_main_option("script_location", str(coordinator_dir / "migrations"))
    command.upgrade(config, "head")

    migrated_engine = create_engine(f"sqlite:///{migrated_path}", future=True)
    try:
        create_all_inspector = inspect(create_all_engine)
        migrated_inspector = inspect(migrated_engine)
        table_name = "evidence_lifecycle_snapshots"
        assert table_name in set(create_all_inspector.get_table_names())
        assert table_name in set(migrated_inspector.get_table_names())
        create_all_columns = {
            column["name"] for column in create_all_inspector.get_columns(table_name)
        }
        migrated_columns = {
            column["name"] for column in migrated_inspector.get_columns(table_name)
        }
        assert migrated_columns == create_all_columns
        create_all_indexes = {
            index["name"] for index in create_all_inspector.get_indexes(table_name)
        }
        migrated_indexes = {
            index["name"] for index in migrated_inspector.get_indexes(table_name)
        }
        assert migrated_indexes == create_all_indexes
        assert "ux_evidence_lifecycle_snapshots_identity" in migrated_indexes
    finally:
        create_all_engine.dispose()
        migrated_engine.dispose()


class _FakeProvider:
    provider = "codex"
    model = "gpt-5.2-codex"

    def judge_node(self, request):
        del request
        return ScoringProviderResult(
            provider=self.provider,
            model=self.model,
            raw_output=json.dumps({"verdict": "supported"}),
            latency_ms=12,
            checked_at="2026-01-01T11:59:00+00:00",
        )


def test_evaluator_hook_persists_provenance_without_fabricating_grounded_values(
    db,
    monkeypatch,
) -> None:
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_VERIFICATION", "true")
    debate = Debate(id="debate-hook", topic="Evidence hook", status="running")
    worker = Worker(id="worker-hook", name="Worker Hook", token_hash="hash", capabilities=[])
    branch = DebateBranch(id="branch-hook", debate_id=debate.id, status="active")
    db.add_all([debate, worker, branch])
    db.flush()
    claim = Node(
        id="claim-hook",
        debate_id=debate.id,
        node_type="PRO",
        depth=1,
        position=0,
        claim="The claim",
        status="complete",
        path_status="active",
        materialized_path="/0",
    )
    evidence = Node(
        id="evidence-hook",
        debate_id=debate.id,
        parent_id=claim.id,
        node_type="EVIDENCE",
        depth=2,
        position=1000,
        claim="persisted evidence text",
        status="completed",
        path_status="active",
        materialized_path="/0/1000",
        evidence_metadata={"evidenceKind": "statistical"},
    )
    db.add_all([claim, evidence])
    db.flush()
    claim_generation = Generation(
        id="claim-generation-hook",
        node_id=claim.id,
        model_id="claude-sonnet-5-high-loop",
        role="pro",
        argument="The argument",
        worker_id=worker.id,
    )
    evidence_generation = Generation(
        id="evidence-generation-hook",
        node_id=evidence.id,
        model_id="claude-sonnet-5-high-loop",
        role="pro",
        argument=evidence.claim,
        worker_id=worker.id,
    )
    db.add_all([claim_generation, evidence_generation])
    db.flush()
    claim.active_generation_id = claim_generation.id
    evidence.active_generation_id = evidence_generation.id
    db.commit()

    result = evaluate_evidence_verdict(db, debate, claim, evidence, _FakeProvider())

    assert result == {"status": "supported", "reason": None}
    row = db.scalars(select(EvidenceLifecycleSnapshot)).one()
    assert row.verification_status == "supported"
    assert row.payload["availability"] == "terminal_unverifiable"
    assert row.payload["value"] is None
    assert row.payload["unavailability_reason"] == (
        "verification_supported_without_authoritative_evidence_values"
    )
    assert row.payload["source_identity"] == {
        "evidence_node_id": evidence.id,
        "claim_node_id": claim.id,
        "generation_id": evidence_generation.id,
        "reference": f"evidence-node:{evidence.id}",
        "content_sha256": hashlib.sha256(evidence.claim.encode("utf-8")).hexdigest(),
        "evidence_kind": "statistical",
    }
    assert row.payload["provenance"]["source_record_id"]
    assert row.payload["provenance"]["run"]["sequence"] > 0
    serialized = json.dumps(row.payload, sort_keys=True)
    assert "base_score" not in serialized
    assert "uncertainty" not in serialized
