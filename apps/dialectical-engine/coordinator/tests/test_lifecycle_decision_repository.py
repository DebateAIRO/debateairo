from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, func, inspect, select
from sqlalchemy.orm import Session

from app.exploration.decision_repository import (
    LifecycleDecisionSnapshot,
    persist_lifecycle_decision,
)
from app.models.entities import Base, Debate, LifecycleDecisionRecord


DECISION_TIME = datetime(2026, 7, 16, 12, 0, tzinfo=timezone.utc)


def _snapshot(**overrides: object) -> LifecycleDecisionSnapshot:
    values: dict[str, object] = {
        "schema_version": "lifecycle-decision-record/v1",
        "idempotency_key": "evaluation-1",
        "debate_id": "debate-1",
        "node_id": "node-1",
        "decision": "abandon",
        "stopping_reason": "grounded inputs resolve the path",
        "path_status": "abandoned",
        "stopping_status": "abandon",
        "input_state": "grounded",
        "reason_codes": (),
        "score_availability": "present",
        "score_freshness": "fresh",
        "evidence_availability": "present",
        "evidence_freshness": "fresh",
        "current_score_input_hash": "a" * 64,
        "scoring_contract_hash": "b" * 64,
        "score_record_id": "score-record-1",
        "score_run_id": "score-run-1",
        "score_run_sequence": 7,
        "evidence_snapshot_id": "evidence-snapshot-1",
        "decision_timestamp": DECISION_TIME,
        "child_spawn_count": 0,
    }
    values.update(overrides)
    return LifecycleDecisionSnapshot(**values)


def test_persists_one_explainable_normalized_lifecycle_decision(db) -> None:
    result = persist_lifecycle_decision(db, snapshot=_snapshot())
    db.flush()

    stored = db.scalar(select(LifecycleDecisionRecord))
    assert result.persistence_result == "created"
    assert stored is result.record
    assert stored.schema_version == "lifecycle-decision-record/v1"
    assert stored.idempotency_key == "evaluation-1"
    assert stored.debate_id == "debate-1"
    assert stored.node_id == "node-1"
    assert (stored.decision, stored.stopping_reason) == (
        "abandon",
        "grounded inputs resolve the path",
    )
    assert (stored.path_status, stored.stopping_status) == ("abandoned", "abandon")
    assert stored.input_state == "grounded"
    assert stored.reason_codes == []
    assert (stored.score_availability, stored.score_freshness) == ("present", "fresh")
    assert (stored.evidence_availability, stored.evidence_freshness) == ("present", "fresh")
    assert stored.current_score_input_hash == "a" * 64
    assert stored.scoring_contract_hash == "b" * 64
    assert (stored.score_record_id, stored.score_run_id, stored.score_run_sequence) == (
        "score-record-1",
        "score-run-1",
        7,
    )
    assert stored.evidence_snapshot_id == "evidence-snapshot-1"
    assert stored.decision_timestamp.replace(tzinfo=timezone.utc) == DECISION_TIME
    assert stored.child_spawn_count == 0


def test_exact_idempotent_replay_returns_the_original_decision_record(db) -> None:
    first = persist_lifecycle_decision(db, snapshot=_snapshot())

    replay = persist_lifecycle_decision(db, snapshot=_snapshot())

    assert replay.persistence_result == "replayed"
    assert replay.record.id == first.record.id
    assert db.scalar(select(func.count()).select_from(LifecycleDecisionRecord)) == 1


def test_caller_rollback_removes_the_pending_lifecycle_decision(db) -> None:
    pending = persist_lifecycle_decision(db, snapshot=_snapshot())
    pending_id = pending.record.id

    db.rollback()

    assert db.get(LifecycleDecisionRecord, pending_id) is None
    retried = persist_lifecycle_decision(db, snapshot=_snapshot())
    assert retried.persistence_result == "created"
    assert db.scalar(select(func.count()).select_from(LifecycleDecisionRecord)) == 1


def test_idempotency_identity_rejects_conflicting_accepted_input(db) -> None:
    persist_lifecycle_decision(db, snapshot=_snapshot())

    with pytest.raises(ValueError, match="conflicting input"):
        persist_lifecycle_decision(
            db,
            snapshot=_snapshot(
                decision="continue",
                path_status="active",
                stopping_status="continue",
            ),
        )


@pytest.mark.parametrize(
    ("overrides", "expected_error"),
    (
        ({"schema_version": None}, "schema_version must equal"),
        ({"schema_version": "lifecycle-decision-record/v2"}, "schema_version must equal"),
        ({"score_run_sequence": 1.5}, "score_run_sequence must be a positive integer"),
        ({"child_spawn_count": 1.5}, "child_spawn_count must be a non-negative integer"),
        ({"reason_codes": "XY"}, "reason_codes must be a tuple"),
        ({"reason_codes": ("Score Missing",)}, "reason_codes item must be normalized"),
        ({"path_status": "parked"}, "path_status must be one of"),
        ({"stopping_status": "stop"}, "stopping_status must be one of"),
        ({"input_state": "available"}, "input_state must be one of"),
        ({"score_availability": "available"}, "score_availability must be one of"),
        ({"score_freshness": "current"}, "score_freshness must be one of"),
        (
            {"score_availability": "absent", "score_freshness": "stale"},
            "score availability/freshness combination is invalid",
        ),
        (
            {"decision": "abandon", "path_status": "active"},
            "path_status must be abandoned for abandon",
        ),
        (
            {"decision": "abandon", "stopping_status": "continue"},
            "stopping_status must equal decision",
        ),
        ({"decision": "abandon", "child_spawn_count": 1}, "cannot spawn children"),
        ({"current_score_input_hash": "not-a-hash"}, "current_score_input_hash must be SHA-256"),
        ({"scoring_contract_hash": "not-a-hash"}, "scoring_contract_hash must be SHA-256"),
        ({"input_state": "grounded", "reason_codes": ("score_missing",)}, "grounded input"),
        ({"current_score_input_hash": None}, "grounded input requires current_score_input_hash"),
        ({"scoring_contract_hash": None}, "grounded input requires scoring_contract_hash"),
        ({"score_record_id": None}, "grounded input requires score_record_id"),
        ({"score_run_id": None}, "grounded input requires score_run_id"),
        ({"score_run_sequence": None}, "grounded input requires score_run_sequence"),
        ({"evidence_snapshot_id": None}, "grounded input requires evidence_snapshot_id"),
        (
            {
                "input_state": "missing",
                "reason_codes": ("score_missing",),
                "score_availability": "absent",
                "score_freshness": "unknown",
                "evidence_availability": "absent",
                "evidence_freshness": "unknown",
                "score_record_id": None,
                "score_run_id": None,
                "score_run_sequence": None,
                "evidence_snapshot_id": None,
            },
            "abandon requires grounded input",
        ),
    ),
)
def test_rejects_unapproved_or_incoherent_snapshot_before_partial_persistence(
    db,
    overrides,
    expected_error,
) -> None:
    before = db.scalar(select(func.count()).select_from(LifecycleDecisionRecord))

    with pytest.raises(ValueError, match=expected_error):
        persist_lifecycle_decision(db, snapshot=_snapshot(**overrides))

    assert db.scalar(select(func.count()).select_from(LifecycleDecisionRecord)) == before


def test_unavailable_input_preserves_an_existing_active_path_state(db) -> None:
    result = persist_lifecycle_decision(
        db,
        snapshot=_snapshot(
            decision="continue",
            path_status="active",
            stopping_status="active",
            input_state="missing",
            reason_codes=("score_missing", "evidence_source_missing"),
            score_availability="absent",
            score_freshness="unknown",
            evidence_availability="absent",
            evidence_freshness="unknown",
            score_record_id=None,
            score_run_id=None,
            score_run_sequence=None,
            evidence_snapshot_id=None,
        ),
    )

    assert result.record.decision == "continue"
    assert (result.record.path_status, result.record.stopping_status) == (
        "active",
        "active",
    )
    assert result.record.child_spawn_count == 0


def test_unavailable_input_preserves_an_existing_abandoned_path_state(db) -> None:
    result = persist_lifecycle_decision(
        db,
        snapshot=_snapshot(
            decision="continue",
            path_status="abandoned",
            stopping_status="abandon",
            input_state="missing",
            reason_codes=("score_missing", "evidence_source_missing"),
            score_availability="absent",
            score_freshness="unknown",
            evidence_availability="absent",
            evidence_freshness="unknown",
            score_record_id=None,
            score_run_id=None,
            score_run_sequence=None,
            evidence_snapshot_id=None,
        ),
    )

    assert result.record.decision == "continue"
    assert (result.record.path_status, result.record.stopping_status) == (
        "abandoned",
        "abandon",
    )
    assert result.record.child_spawn_count == 0


def test_only_supported_outcome_classes_create_new_lifecycle_evaluations(db) -> None:
    decisions = (
        "continue",
        "deepen",
        "seek_evidence",
        "challenge",
        "abandon",
        "reopen",
    )
    for index, decision in enumerate(decisions, start=1):
        path_status = "abandoned" if decision == "abandon" else "active"
        persist_lifecycle_decision(
            db,
            snapshot=_snapshot(
                idempotency_key=f"evaluation-{index}",
                decision=decision,
                stopping_status=decision,
                path_status=path_status,
            ),
        )

    with pytest.raises(ValueError, match="decision must be one of"):
        persist_lifecycle_decision(
            db,
            snapshot=_snapshot(
                idempotency_key="evaluation-unknown",
                decision="silently_stop",
            ),
        )

    assert db.scalar(select(func.count()).select_from(LifecycleDecisionRecord)) == len(decisions)


def test_additive_migration_matches_create_all_and_keeps_legacy_tables(
    tmp_path,
    monkeypatch,
) -> None:
    db_path = tmp_path / "lifecycle-decisions.sqlite3"
    coordinator_dir = Path(__file__).resolve().parents[1]
    monkeypatch.setenv("DIALECTICAL_HOME", str(tmp_path))
    monkeypatch.setenv("DIALECTICAL_DATABASE_URL", f"sqlite:///{db_path}")
    config = Config(str(coordinator_dir / "alembic.ini"))
    config.set_main_option("script_location", str(coordinator_dir / "migrations"))

    command.upgrade(config, "0012_lifecycle_evidence_snapshots")
    migrated_engine = create_engine(f"sqlite:///{db_path}", future=True)
    try:
        legacy_tables = set(inspect(migrated_engine).get_table_names())
        with Session(migrated_engine) as legacy_session:
            legacy_session.add(
                Debate(
                    id="legacy-debate",
                    topic="A lifecycle debate created before decision records existed.",
                    status="generating",
                    config={"max_depth": 2, "branching": 2},
                )
            )
            legacy_session.commit()
    finally:
        migrated_engine.dispose()

    command.upgrade(config, "head")
    migrated_engine = create_engine(f"sqlite:///{db_path}", future=True)
    try:
        inspector = inspect(migrated_engine)
        assert legacy_tables <= set(inspector.get_table_names())
        assert "lifecycle_decision_records" in set(inspector.get_table_names())
        with Session(migrated_engine) as migrated_session:
            assert migrated_session.get(Debate, "legacy-debate") is not None
        migrated_columns = {
            column["name"]: column for column in inspector.get_columns("lifecycle_decision_records")
        }
        model_columns = {
            column.name: column for column in LifecycleDecisionRecord.__table__.columns
        }
        assert set(migrated_columns) == set(model_columns)
        assert migrated_columns["schema_version"]["nullable"] is True
        assert migrated_columns["snapshot_sha256"]["nullable"] is True
        migrated_indexes = {
            index["name"]: (tuple(index["column_names"]), index["unique"])
            for index in inspector.get_indexes("lifecycle_decision_records")
        }
        model_indexes = {
            index.name: (tuple(column.name for column in index.columns), index.unique)
            for index in LifecycleDecisionRecord.__table__.indexes
        }
        assert migrated_indexes == model_indexes
    finally:
        migrated_engine.dispose()

    create_all_path = tmp_path / "lifecycle-decisions-create-all.sqlite3"
    create_all_engine = create_engine(f"sqlite:///{create_all_path}", future=True)
    try:
        Base.metadata.create_all(create_all_engine)
        create_all_inspector = inspect(create_all_engine)
        create_all_columns = {
            column["name"]: column
            for column in create_all_inspector.get_columns("lifecycle_decision_records")
        }
        create_all_indexes = {
            index["name"]: (tuple(index["column_names"]), index["unique"])
            for index in create_all_inspector.get_indexes("lifecycle_decision_records")
        }
        assert set(create_all_columns) == set(migrated_columns)
        assert {
            column_name: column["nullable"]
            for column_name, column in create_all_columns.items()
        } == {
            column_name: column["nullable"]
            for column_name, column in migrated_columns.items()
        }
        assert create_all_indexes == migrated_indexes
    finally:
        create_all_engine.dispose()
