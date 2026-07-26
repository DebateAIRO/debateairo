from __future__ import annotations

import hashlib
import threading
from types import SimpleNamespace

import pytest
from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.write_lock import hold_write_lock
from app.exploration import scoring_completion_lifecycle
from app.models.entities import AnalyzerRun, Debate, DebateBranch, Job, JudgeOutputArtifact, Node, now_utc
from app.providers import ProviderRegistry
from app.scoring import jobs as scoring_jobs
from app.scoring.service import queue_scoring_job


def _seed_scoring_job(db) -> tuple[str, str, str]:
    debate = Debate(topic="Lifecycle after durable scoring", status="complete")
    node = Node(
        id="lifecycle-root",
        debate=debate,
        node_type="ROOT_CLAIM",
        depth=0,
        position=0,
        claim="Durable scores should trigger lifecycle reevaluation.",
        status="complete",
        materialized_path="/",
    )
    db.add_all([debate, node])
    db.flush()
    debate.root_node_id = node.id
    job = queue_scoring_job(db, debate, model_id="fixture-model")
    db.commit()
    return debate.id, node.id, job.id


def _scoring_runner_for(job_id: str, node_id: str):
    def scoring_runner(db, debate, _registry, **_kwargs):
        raw_output = '{"fixture":"durable"}'
        db.add(
            JudgeOutputArtifact(
                debate_id=debate.id,
                node_id=node_id,
                job_id=job_id,
                input_hash="fixture-input-hash",
                judge_role="judge",
                provider="fixture-provider",
                model="fixture-model",
                raw_output=raw_output,
                raw_output_sha256=hashlib.sha256(raw_output.encode("utf-8")).hexdigest(),
                parse_status="unavailable",
                assessment=None,
                checked_at=now_utc(),
            )
        )
        db.flush()
        return {
            "debate_id": debate.id,
            "status": "available",
            "node_ids": [node_id],
            "items": [{"node_id": node_id}],
            "errors": [],
        }

    return scoring_runner


def _add_artifact(db, *, debate_id: str, node_id: str, job_id: str) -> None:
    raw_output = f'{{"job_id":"{job_id}","node_id":"{node_id}"}}'
    db.add(
        JudgeOutputArtifact(
            debate_id=debate_id,
            node_id=node_id,
            job_id=job_id,
            input_hash=f"input-{job_id}-{node_id}",
            judge_role="judge",
            provider="fixture-provider",
            model="fixture-model",
            raw_output=raw_output,
            raw_output_sha256=hashlib.sha256(raw_output.encode("utf-8")).hexdigest(),
            parse_status="unavailable",
            assessment=None,
            checked_at=now_utc(),
        )
    )


def _persist_completed_operation(db) -> tuple[str, str, str, dict[str, Node]]:
    debate = Debate(topic="Exact lifecycle operation", status="complete")
    other_debate = Debate(topic="Unrelated debate", status="complete")
    nodes = {
        "root": Node(id="eligible-root", debate=debate, node_type="ROOT_CLAIM", depth=0, position=0, claim="Root", status="complete"),
        "pro": Node(id="eligible-pro", debate=debate, node_type="PRO", depth=1, position=0, claim="Pro", status="complete"),
        "con": Node(id="eligible-con", debate=debate, node_type="CON", depth=1, position=1, claim="Con", status="complete"),
        "stale": Node(id="stale-pro", debate=debate, node_type="PRO", depth=1, position=2, claim="Stale", status="stale"),
        "evidence": Node(id="evidence-node", debate=debate, node_type="EVIDENCE", depth=1, position=3, claim="Evidence", status="complete"),
        "cross_debate": Node(id="cross-debate-pro", debate=other_debate, node_type="PRO", depth=0, position=0, claim="Other", status="complete"),
    }
    db.add_all([debate, other_debate, *nodes.values()])
    db.flush()
    debate.root_node_id = nodes["root"].id
    branch = DebateBranch(debate_id=debate.id, root_node_id=nodes["root"].id, status="active")
    job = queue_scoring_job(db, debate, model_id="fixture-model")
    job.status = "complete"
    db.add(branch)
    db.flush()
    for key in ("root", "pro", "con", "stale", "evidence"):
        _add_artifact(db, debate_id=debate.id, node_id=nodes[key].id, job_id=job.id)
    db.flush()
    run = AnalyzerRun(
        debate_id=debate.id,
        branch_id=branch.id,
        analyzer_type="node_scoring",
        status="complete",
        output={"debate_id": debate.id, "items": []},
        provenance={
            "scoring_source": "judge_outputs",
            "job_id": job.id,
            "node_ids": [
                nodes["root"].id,
                nodes["pro"].id,
                nodes["root"].id,
                nodes["con"].id,
                nodes["stale"].id,
                nodes["evidence"].id,
                nodes["cross_debate"].id,
                "missing-node",
                "",
                7,
            ],
        },
        seq=1,
    )
    db.add(run)
    db.commit()
    return debate.id, job.id, run.id, nodes


def test_scoring_completion_invokes_lifecycle_reevaluation_after_durable_commit(db, monkeypatch) -> None:
    debate_id, node_id, job_id = _seed_scoring_job(db)
    calls: list[tuple[str, str, str]] = []

    def lifecycle_hook(_db, *, debate_id: str, job_id: str, analyzer_run_id: str) -> None:
        with SessionLocal() as probe:
            durable_job = probe.get(Job, job_id)
            durable_run = probe.get(AnalyzerRun, analyzer_run_id)
            durable_artifact = probe.scalar(
                select(JudgeOutputArtifact).where(
                    JudgeOutputArtifact.debate_id == debate_id,
                    JudgeOutputArtifact.node_id == node_id,
                    JudgeOutputArtifact.job_id == job_id,
                    JudgeOutputArtifact.analyzer_run_id == analyzer_run_id,
                )
            )
            assert durable_job is not None and durable_job.status == "complete"
            assert durable_run is not None and durable_run.status == "complete"
            assert durable_run.provenance["job_id"] == job_id
            assert durable_artifact is not None
        calls.append((debate_id, job_id, analyzer_run_id))

    monkeypatch.setattr(
        scoring_jobs,
        "reevaluate_lifecycle_after_scoring_completion",
        lifecycle_hook,
        raising=False,
    )

    scoring_jobs.run_scoring_job_background(
        job_id,
        debate_id,
        registry_factory=lambda: ProviderRegistry(agents={}, providers={}),
        scoring_runner=_scoring_runner_for(job_id, node_id),
    )

    assert len(calls) == 1
    assert calls[0][:2] == (debate_id, job_id)


def test_scoring_completion_reevaluates_only_exact_eligible_run_nodes(db, monkeypatch) -> None:
    debate_id, job_id, run_id, nodes = _persist_completed_operation(db)
    decided_node_ids: list[str] = []

    def fail_safe_decision(_db, *, debate, node, decision_timestamp):
        assert debate.id == debate_id
        assert decision_timestamp.tzinfo is not None
        decided_node_ids.append(node.id)
        return SimpleNamespace(authentic_policy_decision=False)

    monkeypatch.setattr(
        scoring_completion_lifecycle,
        "decide_lifecycle_for_node",
        fail_safe_decision,
        raising=False,
    )

    scoring_completion_lifecycle.reevaluate_lifecycle_after_scoring_completion(
        db,
        debate_id=debate_id,
        job_id=job_id,
        analyzer_run_id=run_id,
    )

    assert set(decided_node_ids) == {nodes["root"].id, nodes["pro"].id, nodes["con"].id}
    assert len(decided_node_ids) == 3


def _another_thread_can_take_the_write_lock(timeout: float = 2.0) -> bool:
    """Can any OTHER in-process writer make progress right now?

    The write lock is an RLock, so asking on THIS thread would always say yes
    (re-entry). A worker heartbeat's `UPDATE workers SET last_seen`, a job
    lease refresh and a generation completion all run on other threads, and
    they are what a long hold starves -- so the probe has to be one of them.
    """

    outcome: dict[str, bool] = {}

    def probe() -> None:
        try:
            with hold_write_lock():
                outcome["acquired"] = True
        except Exception:  # pragma: no cover - defensive
            outcome["acquired"] = False

    thread = threading.Thread(target=probe, daemon=True)
    thread.start()
    thread.join(timeout)
    return outcome.get("acquired", False)


def test_the_decision_loop_does_not_hold_the_process_write_lock_across_nodes(db, monkeypatch) -> None:
    """FW3 (I-6): the decision phase must not run inside one write-lock hold.

    The lock was taken around the WHOLE per-node loop on the (since
    disproved) theory that it protected a read snapshot. Under the real
    mechanism it protects nothing there -- persist_lifecycle_decision takes
    the same lock itself, around exactly the check-then-insert that needs it
    -- while the hold scaled with eligible-node count (34 on the live
    debate), blocking every other in-process writer for the whole span. Since
    POST /api/workers/{id}/poll is an `async def` doing blocking SQLite on the
    event loop, that hold stalls SSE and every async endpoint with it.
    """

    debate_id, job_id, run_id, nodes = _persist_completed_operation(db)
    lock_free_during_decision: list[bool] = []

    def probing_decision(_db, *, debate, node, decision_timestamp):
        lock_free_during_decision.append(_another_thread_can_take_the_write_lock())
        return SimpleNamespace(authentic_policy_decision=False)

    monkeypatch.setattr(
        scoring_completion_lifecycle,
        "decide_lifecycle_for_node",
        probing_decision,
    )

    scoring_completion_lifecycle.reevaluate_lifecycle_after_scoring_completion(
        db,
        debate_id=debate_id,
        job_id=job_id,
        analyzer_run_id=run_id,
    )

    assert len(lock_free_during_decision) == 3
    assert all(lock_free_during_decision)


def test_scoring_completion_rejects_noncanonical_lowercase_node_kind(db, monkeypatch) -> None:
    debate_id, job_id, run_id, nodes = _persist_completed_operation(db)
    nodes["root"].node_type = "root_claim"
    db.commit()
    decided_node_ids: list[str] = []

    def fail_safe_decision(_db, *, debate, node, decision_timestamp):
        decided_node_ids.append(node.id)
        return SimpleNamespace(authentic_policy_decision=False)

    monkeypatch.setattr(
        scoring_completion_lifecycle,
        "decide_lifecycle_for_node",
        fail_safe_decision,
    )

    scoring_completion_lifecycle.reevaluate_lifecycle_after_scoring_completion(
        db,
        debate_id=debate_id,
        job_id=job_id,
        analyzer_run_id=run_id,
    )

    assert decided_node_ids == [nodes["pro"].id, nodes["con"].id]
    run = db.get(AnalyzerRun, run_id)
    assert run is not None
    assert run.provenance["lifecycle_reevaluation"]["node_ids"] == decided_node_ids


def test_scoring_completion_root_filter_uses_production_root_claim_vocabulary(db, monkeypatch) -> None:
    # W0 (B5): every production creation site writes node_type "ROOT_CLAIM"
    # (orchestrator.create_debate, dialectical_v2.create_dialectical_debate,
    # single_shot); "ROOT" exists nowhere. The node-type filter must pass the
    # real root and must not resurrect the dead legacy "ROOT" literal.
    debate = Debate(topic="Root vocabulary", status="complete")
    real_root = Node(
        id="real-root",
        debate=debate,
        node_type="ROOT_CLAIM",
        depth=0,
        position=0,
        claim="Real production root",
        status="complete",
    )
    legacy_root = Node(
        id="legacy-root",
        debate=debate,
        node_type="ROOT",
        depth=0,
        position=1,
        claim="Fictional legacy root type",
        status="complete",
    )
    db.add_all([debate, real_root, legacy_root])
    db.flush()
    debate.root_node_id = real_root.id
    branch = DebateBranch(debate_id=debate.id, root_node_id=real_root.id, status="active")
    job = queue_scoring_job(db, debate, model_id="fixture-model")
    job.status = "complete"
    db.add(branch)
    db.flush()
    for node_id in (real_root.id, legacy_root.id):
        _add_artifact(db, debate_id=debate.id, node_id=node_id, job_id=job.id)
    db.flush()
    run = AnalyzerRun(
        debate_id=debate.id,
        branch_id=branch.id,
        analyzer_type="node_scoring",
        status="complete",
        output={"debate_id": debate.id, "items": []},
        provenance={
            "scoring_source": "judge_outputs",
            "job_id": job.id,
            "node_ids": [real_root.id, legacy_root.id],
        },
        seq=1,
    )
    db.add(run)
    db.commit()
    decided_node_ids: list[str] = []

    def fail_safe_decision(_db, *, debate, node, decision_timestamp):
        decided_node_ids.append(node.id)
        return SimpleNamespace(authentic_policy_decision=False)

    monkeypatch.setattr(
        scoring_completion_lifecycle,
        "decide_lifecycle_for_node",
        fail_safe_decision,
    )

    scoring_completion_lifecycle.reevaluate_lifecycle_after_scoring_completion(
        db,
        debate_id=debate.id,
        job_id=job.id,
        analyzer_run_id=run.id,
    )

    assert decided_node_ids == [real_root.id]
    refreshed_run = db.get(AnalyzerRun, run.id)
    assert refreshed_run is not None
    assert refreshed_run.provenance["lifecycle_reevaluation"]["node_ids"] == [real_root.id]


def test_scoring_completion_fail_safe_preserves_existing_lifecycle_and_spawns_nothing(db, monkeypatch) -> None:
    debate_id, job_id, run_id, nodes = _persist_completed_operation(db)
    root = nodes["root"]
    root.path_status = "abandoned"
    root.stopping_status = "abandon"
    root.stopping_reason = "Prior authentic lifecycle decision"
    db.commit()
    node_ids_before = set(db.scalars(select(Node.id)).all())
    job_ids_before = set(db.scalars(select(Job.id)).all())

    monkeypatch.setattr(
        scoring_completion_lifecycle,
        "decide_lifecycle_for_node",
        lambda *_args, **_kwargs: SimpleNamespace(
            authentic_policy_decision=False,
            action="reopen",
            keeps_path_active=True,
            stopping_reason="Unverifiable result must not overwrite state",
            score_run_id=run_id,
            score_run_sequence=1,
        ),
    )

    scoring_completion_lifecycle.reevaluate_lifecycle_after_scoring_completion(
        db,
        debate_id=debate_id,
        job_id=job_id,
        analyzer_run_id=run_id,
    )

    db.refresh(root)
    assert (root.path_status, root.stopping_status, root.stopping_reason) == (
        "abandoned",
        "abandon",
        "Prior authentic lifecycle decision",
    )
    assert set(db.scalars(select(Node.id)).all()) == node_ids_before
    assert set(db.scalars(select(Job.id)).all()) == job_ids_before


@pytest.mark.parametrize(
    ("action", "keeps_path_active"),
    [("continue", False), ("abandon", True)],
)
def test_scoring_completion_rejects_incoherent_action_path_pairs(
    db,
    monkeypatch,
    action: str,
    keeps_path_active: bool,
) -> None:
    debate_id, job_id, run_id, nodes = _persist_completed_operation(db)
    root = nodes["root"]
    root.path_status = "active"
    root.stopping_status = "active"
    root.stopping_reason = "Existing lifecycle state"
    db.commit()

    def incoherent_decision(_db, *, debate, node, decision_timestamp):
        if node.id != root.id:
            return SimpleNamespace(authentic_policy_decision=False)
        return SimpleNamespace(
            authentic_policy_decision=True,
            input_state="grounded",
            action=action,
            keeps_path_active=keeps_path_active,
            stopping_reason="Incoherent policy result must fail closed",
            score_run_id=run_id,
            score_run_sequence=1,
            score_record_id="score-row-root",
            evidence_snapshot_id="evidence-root",
            current_score_input_hash="input-root",
            scoring_contract_hash="contract-root",
            decision_timestamp=decision_timestamp,
            reason_codes=(),
        )

    monkeypatch.setattr(
        scoring_completion_lifecycle,
        "decide_lifecycle_for_node",
        incoherent_decision,
    )

    scoring_completion_lifecycle.reevaluate_lifecycle_after_scoring_completion(
        db,
        debate_id=debate_id,
        job_id=job_id,
        analyzer_run_id=run_id,
    )

    db.refresh(root)
    assert (root.path_status, root.stopping_status, root.stopping_reason) == (
        "active",
        "active",
        "Existing lifecycle state",
    )


def test_scoring_completion_authentic_decision_updates_lifecycle_without_spawning_children(db, monkeypatch) -> None:
    debate_id, job_id, run_id, nodes = _persist_completed_operation(db)
    node_ids_before = set(db.scalars(select(Node.id)).all())
    job_ids_before = set(db.scalars(select(Job.id)).all())

    def decision(_db, *, debate, node, decision_timestamp):
        if node.id == nodes["root"].id:
            return SimpleNamespace(
                authentic_policy_decision=True,
                input_state="grounded",
                action="abandon",
                keeps_path_active=False,
                stopping_reason="Authenticated completed-run decision",
                score_run_id=run_id,
                score_run_sequence=1,
                score_record_id="score-row-root",
                evidence_snapshot_id="evidence-root",
                current_score_input_hash="a" * 64,
                scoring_contract_hash="b" * 64,
                decision_timestamp=decision_timestamp,
                reason_codes=(),
            )
        if node.id == nodes["pro"].id:
            return SimpleNamespace(
                authentic_policy_decision=True,
                input_state="grounded",
                action="abandon",
                keeps_path_active=False,
                stopping_reason="Wrong run must fail closed",
                score_run_id="other-run",
                score_run_sequence=1,
                score_record_id="score-row-pro",
                evidence_snapshot_id="evidence-pro",
                current_score_input_hash="input-pro",
                scoring_contract_hash="contract-pro",
                decision_timestamp=decision_timestamp,
                reason_codes=(),
            )
        return SimpleNamespace(authentic_policy_decision=False)

    monkeypatch.setattr(scoring_completion_lifecycle, "decide_lifecycle_for_node", decision)

    scoring_completion_lifecycle.reevaluate_lifecycle_after_scoring_completion(
        db,
        debate_id=debate_id,
        job_id=job_id,
        analyzer_run_id=run_id,
    )

    db.refresh(nodes["root"])
    db.refresh(nodes["pro"])
    assert (nodes["root"].path_status, nodes["root"].stopping_status, nodes["root"].stopping_reason) == (
        "abandoned",
        "abandon",
        "Authenticated completed-run decision",
    )
    assert (nodes["pro"].path_status, nodes["pro"].stopping_status, nodes["pro"].stopping_reason) == (
        "active",
        "active",
        None,
    )
    assert set(db.scalars(select(Node.id)).all()) == node_ids_before
    assert set(db.scalars(select(Job.id)).all()) == job_ids_before


@pytest.mark.parametrize(
    ("action", "keeps_path_active", "expected_path_status"),
    [("continue", True, "active"), ("abandon", False, "abandoned")],
)
def test_scoring_completion_authentic_outcome_persists_one_correlated_decision(
    db,
    monkeypatch,
    action: str,
    keeps_path_active: bool,
    expected_path_status: str,
) -> None:
    from app.models.entities import LifecycleDecisionRecord

    debate_id, job_id, run_id, nodes = _persist_completed_operation(db)
    root = nodes["root"]
    expected_decision_timestamp = now_utc()

    def decision(_db, *, debate, node, decision_timestamp):
        if node.id != root.id:
            return SimpleNamespace(authentic_policy_decision=False)
        return SimpleNamespace(
            authentic_policy_decision=True,
            input_state="grounded",
            action=action,
            keeps_path_active=keeps_path_active,
            stopping_reason=f"Authenticated completed-run {action}",
            score_run_id=run_id,
            score_run_sequence=1,
            score_record_id="score-row-root",
            evidence_snapshot_id="evidence-root",
            current_score_input_hash="a" * 64,
            scoring_contract_hash="b" * 64,
            decision_timestamp=decision_timestamp,
            reason_codes=(),
        )

    monkeypatch.setattr(scoring_completion_lifecycle, "decide_lifecycle_for_node", decision)
    monkeypatch.setattr(scoring_completion_lifecycle, "now_utc", lambda: expected_decision_timestamp)

    scoring_completion_lifecycle.reevaluate_lifecycle_after_scoring_completion(
        db,
        debate_id=debate_id,
        job_id=job_id,
        analyzer_run_id=run_id,
    )

    records = db.scalars(select(LifecycleDecisionRecord)).all()
    assert len(records) == 1
    record = records[0]
    assert (
        record.debate_id,
        record.node_id,
        record.decision,
        record.path_status,
        record.stopping_status,
        record.child_spawn_count,
    ) == (debate_id, root.id, action, expected_path_status, action, 0)
    assert record.idempotency_key == f"scoring-completion:{run_id}:{root.id}"
    assert record.score_run_id == run_id
    assert record.score_run_sequence == 1
    assert record.decision_timestamp.replace(tzinfo=expected_decision_timestamp.tzinfo) == expected_decision_timestamp


def test_scoring_completion_created_record_emits_one_redacted_event_after_commit(
    db,
    monkeypatch,
) -> None:
    import json

    from app.models.entities import LifecycleDecisionRecord

    debate_id, job_id, run_id, nodes = _persist_completed_operation(db)
    root = nodes["root"]
    published: list[tuple[str, str, dict]] = []

    class RecordingEventBus:
        def publish_from_sync(self, published_debate_id: str, event: str, data: dict) -> None:
            with SessionLocal() as probe:
                durable_record = probe.get(LifecycleDecisionRecord, data["record_id"])
                durable_run = probe.get(AnalyzerRun, run_id)
                assert durable_record is not None
                assert durable_run is not None
                assert durable_run.provenance["lifecycle_reevaluation"]["status"] == "complete"
            published.append((published_debate_id, event, data))

    def decision(_db, *, debate, node, decision_timestamp):
        if node.id != root.id:
            return SimpleNamespace(authentic_policy_decision=False)
        return SimpleNamespace(
            authentic_policy_decision=True,
            input_state="grounded",
            action="abandon",
            keeps_path_active=False,
            stopping_reason="Authenticated completed-run abandonment",
            score_run_id=run_id,
            score_run_sequence=1,
            score_record_id="score-row-root",
            evidence_snapshot_id="evidence-root",
            current_score_input_hash="a" * 64,
            scoring_contract_hash="b" * 64,
            decision_timestamp=decision_timestamp,
            reason_codes=(),
        )

    monkeypatch.setattr(scoring_completion_lifecycle, "decide_lifecycle_for_node", decision)
    monkeypatch.setattr(scoring_completion_lifecycle, "event_bus", RecordingEventBus(), raising=False)

    scoring_completion_lifecycle.reevaluate_lifecycle_after_scoring_completion(
        db,
        debate_id=debate_id,
        job_id=job_id,
        analyzer_run_id=run_id,
    )
    scoring_completion_lifecycle.reevaluate_lifecycle_after_scoring_completion(
        db,
        debate_id=debate_id,
        job_id=job_id,
        analyzer_run_id=run_id,
    )

    record = db.scalars(select(LifecycleDecisionRecord)).one()
    assert published == [
        (
            debate_id,
            "dialectical_exploration",
            {
                "schema_version": "lifecycle-decision-record/v1",
                "record_id": record.id,
                "idempotency_key": f"scoring-completion:{run_id}:{root.id}",
                "debate_id": debate_id,
                "node_id": root.id,
                "decision": "abandon",
                "stopping_reason": "Authenticated completed-run abandonment",
                "input_states": {
                    "aggregate": "grounded",
                    "score": {"availability": "present", "freshness": "fresh"},
                    "evidence": {"availability": "present", "freshness": "fresh"},
                },
                "path_status": "abandoned",
                "stopping_status": "abandon",
                "persistence_result": "created",
                "child_spawn_count": 0,
            },
        )
    ]
    assert all(
        forbidden not in json.dumps(published[0][2]).lower()
        for forbidden in ("prompt", "model_output", "evidence_text", "secret")
    )


def test_scoring_completion_replay_is_idempotent_and_later_run_can_reevaluate(db, monkeypatch) -> None:
    from app.models.entities import LifecycleDecisionRecord

    debate_id, job_id, run_id, nodes = _persist_completed_operation(db)
    decided_node_ids: list[str] = []
    published: list[tuple[str, str, dict]] = []
    current_run: dict[str, object] = {
        "id": run_id,
        "seq": 1,
        "action": "continue",
    }

    def authentic_decision(_db, *, debate, node, decision_timestamp):
        decided_node_ids.append(node.id)
        if node.id != nodes["root"].id:
            return SimpleNamespace(authentic_policy_decision=False)
        action = current_run["action"]
        return SimpleNamespace(
            authentic_policy_decision=True,
            input_state="grounded",
            action=action,
            keeps_path_active=action == "continue",
            stopping_reason=f"Authenticated scoring run {current_run['seq']}",
            score_run_id=current_run["id"],
            score_run_sequence=current_run["seq"],
            score_record_id=f"score-row-{current_run['seq']}",
            evidence_snapshot_id=f"evidence-{current_run['seq']}",
            current_score_input_hash="a" * 64,
            scoring_contract_hash="b" * 64,
            decision_timestamp=decision_timestamp,
            reason_codes=(),
        )

    monkeypatch.setattr(scoring_completion_lifecycle, "decide_lifecycle_for_node", authentic_decision)
    monkeypatch.setattr(
        scoring_completion_lifecycle,
        "event_bus",
        SimpleNamespace(
            publish_from_sync=lambda debate_id, event, data: published.append(
                (debate_id, event, data)
            )
        ),
    )

    for _ in range(2):
        scoring_completion_lifecycle.reevaluate_lifecycle_after_scoring_completion(
            db,
            debate_id=debate_id,
            job_id=job_id,
            analyzer_run_id=run_id,
        )

    assert len(decided_node_ids) == 3
    first_run = db.get(AnalyzerRun, run_id)
    assert first_run is not None
    assert first_run.provenance["lifecycle_reevaluation"] == {
        "schema_version": "scoring-completion-lifecycle/v1",
        "status": "complete",
        "job_id": job_id,
        "analyzer_run_id": run_id,
        "node_ids": [nodes["root"].id, nodes["pro"].id, nodes["con"].id],
    }

    debate = db.get(Debate, debate_id)
    assert debate is not None
    later_job = queue_scoring_job(db, debate, model_id="fixture-model")
    later_job.status = "complete"
    db.flush()
    _add_artifact(db, debate_id=debate_id, node_id=nodes["root"].id, job_id=later_job.id)
    db.flush()
    later_run = AnalyzerRun(
        debate_id=debate_id,
        branch_id=first_run.branch_id,
        analyzer_type="node_scoring",
        status="complete",
        output={"debate_id": debate_id, "items": []},
        provenance={
            "scoring_source": "judge_outputs",
            "job_id": later_job.id,
            "node_ids": [nodes["root"].id],
        },
        seq=2,
    )
    db.add(later_run)
    db.commit()
    current_run.update({"id": later_run.id, "seq": 2, "action": "abandon"})

    scoring_completion_lifecycle.reevaluate_lifecycle_after_scoring_completion(
        db,
        debate_id=debate_id,
        job_id=later_job.id,
        analyzer_run_id=later_run.id,
    )

    assert decided_node_ids.count(nodes["root"].id) == 2
    assert len(decided_node_ids) == 4
    records = db.scalars(
        select(LifecycleDecisionRecord).order_by(LifecycleDecisionRecord.score_run_sequence)
    ).all()
    assert [record.idempotency_key for record in records] == [
        f"scoring-completion:{run_id}:{nodes['root'].id}",
        f"scoring-completion:{later_run.id}:{nodes['root'].id}",
    ]
    assert [record.decision for record in records] == ["continue", "abandon"]
    assert [(debate, event, data["record_id"]) for debate, event, data in published] == [
        (debate_id, "dialectical_exploration", records[0].id),
        (debate_id, "dialectical_exploration", records[1].id),
    ]


def test_scoring_completion_hook_failure_preserves_durable_scoring_truth(db, monkeypatch) -> None:
    from app.models.entities import LifecycleDecisionRecord

    published: list[tuple] = []
    debate = Debate(topic="Hook failure preserves scoring truth", status="complete")
    root = Node(
        id="failure-root",
        debate=debate,
        node_type="ROOT_CLAIM",
        depth=0,
        position=0,
        claim="Root survives hook rollback.",
        status="complete",
        materialized_path="/",
    )
    pro = Node(
        id="failure-pro",
        debate=debate,
        parent_id=root.id,
        node_type="PRO",
        depth=1,
        position=0,
        claim="Pro triggers the hook failure.",
        status="complete",
        materialized_path="/0",
    )
    db.add_all([debate, root, pro])
    db.flush()
    debate.root_node_id = root.id
    job = queue_scoring_job(db, debate, model_id="fixture-model")
    db.commit()
    debate_id, job_id = debate.id, job.id
    node_ids = [root.id, pro.id]

    def scoring_runner(scoring_db, scoring_debate, _registry, **_kwargs):
        for node_id in node_ids:
            _add_artifact(scoring_db, debate_id=debate_id, node_id=node_id, job_id=job_id)
        scoring_db.flush()
        return {
            "debate_id": debate_id,
            "status": "available",
            "node_ids": node_ids,
            "items": [{"node_id": node_id} for node_id in node_ids],
            "errors": [],
        }

    decision_calls = 0

    def first_update_then_fail(decision_db, *, debate, node, decision_timestamp):
        nonlocal decision_calls
        decision_calls += 1
        if decision_calls == 2:
            raise RuntimeError("simulated lifecycle hook failure")
        completed_run = decision_db.scalars(
            select(AnalyzerRun).where(
                AnalyzerRun.debate_id == debate_id,
                AnalyzerRun.analyzer_type == "node_scoring",
                AnalyzerRun.status == "complete",
            )
        ).one()
        return SimpleNamespace(
            authentic_policy_decision=True,
            input_state="grounded",
            action="abandon",
            keeps_path_active=False,
            stopping_reason="Must roll back with the failed hook",
            score_run_id=completed_run.id,
            score_run_sequence=completed_run.seq,
            score_record_id=f"score-{node.id}",
            evidence_snapshot_id=f"evidence-{node.id}",
            current_score_input_hash="a" * 64,
            scoring_contract_hash="b" * 64,
            decision_timestamp=decision_timestamp,
            reason_codes=(),
        )

    monkeypatch.setattr(scoring_completion_lifecycle, "decide_lifecycle_for_node", first_update_then_fail)
    monkeypatch.setattr(
        scoring_completion_lifecycle,
        "event_bus",
        SimpleNamespace(publish_from_sync=lambda *args: published.append(args)),
    )

    with pytest.raises(RuntimeError, match="simulated lifecycle hook failure"):
        scoring_jobs.run_scoring_job_background(
            job_id,
            debate_id,
            registry_factory=lambda: ProviderRegistry(agents={}, providers={}),
            scoring_runner=scoring_runner,
        )

    db.expire_all()
    durable_job = db.get(Job, job_id)
    durable_run = db.scalars(
        select(AnalyzerRun).where(
            AnalyzerRun.debate_id == debate_id,
            AnalyzerRun.analyzer_type == "node_scoring",
        )
    ).one()
    durable_artifacts = db.scalars(
        select(JudgeOutputArtifact).where(
            JudgeOutputArtifact.debate_id == debate_id,
            JudgeOutputArtifact.job_id == job_id,
            JudgeOutputArtifact.analyzer_run_id == durable_run.id,
        )
    ).all()
    assert durable_job is not None
    assert (durable_job.status, durable_job.error) == ("complete", None)
    assert durable_run.status == "complete"
    assert "lifecycle_reevaluation" not in durable_run.provenance
    assert {artifact.node_id for artifact in durable_artifacts} == set(node_ids)
    assert (db.get(Node, root.id).path_status, db.get(Node, root.id).stopping_status) == ("active", "active")
    assert (db.get(Node, pro.id).path_status, db.get(Node, pro.id).stopping_status) == ("active", "active")
    assert db.scalars(select(LifecycleDecisionRecord)).all() == []
    assert published == []
    assert db.scalars(select(Job).where(Job.node_id.in_(node_ids))).all() == []


def test_normal_scoring_completion_verifies_evidence_and_persists_one_abandonment(
    db,
    monkeypatch,
) -> None:
    import json

    from app.models.entities import (
        EvidenceLifecycleSnapshot,
        Generation,
        LifecycleDecisionRecord,
        NodeScoringResult,
        Worker,
    )
    from app.providers import AgentConfig, ProviderRegistry
    from app.scoring import (
        ClaimAssessment,
        ContextAssessment,
        CriticAssessment,
        EvidenceAssessment,
        FallacyAssessment,
        ScoringProviderResult,
        SteelmanAssessment,
    )
    from app.scoring.service import RegistryScoringProvider

    monkeypatch.setenv("DIALECTICAL_EVIDENCE_VERIFICATION", "true")
    published: list[tuple[str, str, dict]] = []
    monkeypatch.setattr(
        scoring_completion_lifecycle,
        "event_bus",
        SimpleNamespace(
            publish_from_sync=lambda debate_id, event, data: published.append((debate_id, event, data))
        ),
    )

    class CompletionProvider:
        provider = "fixture-judge"
        model = "gpt-5.6-sol"

        def __init__(self) -> None:
            self.verifier_calls = 0

        def judge_node(self, request):
            if request.judge_role == "verifier":
                self.verifier_calls += 1
                raw_output = json.dumps(
                    {
                        "verdict": "supported",
                        "evidence": {
                            "status": "grounded",
                            "base_score": 0.82,
                            "uncertainty": 0.1,
                            "entailment": "SUPPORTS",
                            "caveats": [],
                        },
                    }
                )
            else:
                assessment = ClaimAssessment(
                    steelman=SteelmanAssessment(charitable_strength=0.1, confidence=0.9),
                    critic=CriticAssessment(
                        logical_validity=0.0,
                        assumption_risk=1.0,
                        counterargument_strength=1.0,
                    ),
                    evidence=EvidenceAssessment(
                        evidence_quality=0.3,
                        evidence_relevance=0.3,
                        evidence_sufficiency=0.3,
                        source_reliability=0.3,
                        freshness=0.3,
                        missing_evidence=[],
                        fatal_flags=[],
                    ),
                    context=ContextAssessment(relevance=0.25, impact=0.1, dependency_weight=0.1),
                    fallacy=FallacyAssessment(logical_consistency=0.8),
                )
                raw_output = assessment.model_dump_json()
            return ScoringProviderResult(
                provider=self.provider,
                model=self.model,
                raw_output=raw_output,
                latency_ms=12,
                checked_at=now_utc().isoformat(),
            )

    debate = Debate(topic="Reachable evidence-qualified lifecycle", status="complete")
    worker = Worker(
        id="completion-worker",
        name="Completion Worker",
        token_hash="hash",
        capabilities=["debate"],
    )
    claim = Node(
        id="completion-claim",
        debate=debate,
        node_type="ROOT_CLAIM",
        depth=0,
        position=0,
        claim="A study at https://example.com reports 10% adoption.",
        status="complete",
        path_status="active",
        materialized_path="/",
    )
    evidence = Node(
        id="completion-evidence",
        debate=debate,
        parent_id=claim.id,
        node_type="EVIDENCE",
        depth=1,
        position=0,
        claim="The cited study reports 10% adoption.",
        status="completed",
        path_status="active",
        materialized_path="/0",
        evidence_metadata={"evidenceKind": "statistical"},
    )
    db.add_all([debate, worker, claim, evidence])
    db.flush()
    branch = DebateBranch(debate_id=debate.id, root_node_id=claim.id, status="active")
    db.add(branch)
    db.flush()
    claim_generation = Generation(
        id="completion-claim-generation",
        node_id=claim.id,
        model_id="claude-sonnet-5-high-loop",
        role="pro",
        argument=claim.claim,
        worker_id=worker.id,
    )
    evidence_generation = Generation(
        id="completion-evidence-generation",
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
    debate.root_node_id = claim.id
    job = queue_scoring_job(db, debate, model_id="gpt-5.6-sol")
    db.commit()

    provider = CompletionProvider()
    registry = ProviderRegistry(
        agents={
            "judge": AgentConfig(
                provider=provider.provider,
                model=provider.model,
                temperature=0.0,
            )
        },
        providers={provider.provider: provider},
    )

    scoring_jobs.run_scoring_job_background(
        job.id,
        debate.id,
        registry_factory=lambda: registry,
    )

    db.expire_all()
    completed_run = db.scalars(
        select(AnalyzerRun).where(
            AnalyzerRun.debate_id == debate.id,
            AnalyzerRun.analyzer_type == "node_scoring",
        )
    ).one()
    # Task 11 (P1.2) end-to-end proof: the real verdict evaluate_evidence_verdict
    # persists above must flow through the 5.5 overlay's latest-per-evidence-node
    # rollup (protocol/runner.py, re-run in run_scoring_job_background's finally
    # block) into verificationStatuses/verificationSource -- the whole activation
    # path wired jobs.py -> lifecycle -> evaluator -> protocol overlay, not just
    # proven per hop by narrower unit tests.
    from app.protocol.runner import PROTOCOL_ANALYSIS_TYPE

    protocol_run = db.scalars(
        select(AnalyzerRun)
        .where(AnalyzerRun.debate_id == debate.id, AnalyzerRun.analyzer_type == PROTOCOL_ANALYSIS_TYPE)
        .order_by(AnalyzerRun.seq.desc(), AnalyzerRun.created_at.desc(), AnalyzerRun.id.desc())
    ).first()
    assert protocol_run is not None
    assert protocol_run.output["verificationStatuses"][claim.id] == "supported"
    assert protocol_run.output["verificationSource"][claim.id] == "real_verdict"
    snapshot = db.scalars(select(EvidenceLifecycleSnapshot)).one()
    score_row = db.scalars(
        select(NodeScoringResult).where(NodeScoringResult.node_id == claim.id)
    ).one()
    score_item = score_row.result["items"][0]
    assert score_item["scores"]["strength"] < 0.2, score_item
    assert score_item["scores"]["impact"] < 0.2, score_item
    assert score_item["scores"]["uncertainty"] <= 0.2, score_item
    outcome = scoring_completion_lifecycle.decide_lifecycle_for_node(
        db,
        debate=db.get(Debate, debate.id),
        node=db.get(Node, claim.id),
        decision_timestamp=now_utc(),
    )
    assert outcome.authentic_policy_decision is True, outcome
    assert outcome.action == "abandon", outcome
    decision = db.scalars(select(LifecycleDecisionRecord)).one()
    persisted_claim = db.get(Node, claim.id)
    assert provider.verifier_calls == 1
    assert snapshot.verification_status == "supported"
    assert snapshot.payload["availability"] == "present"
    assert snapshot.payload["value"]["status"] == "grounded"
    assert snapshot.payload["value"]["entailment"] == "SUPPORTS"
    assert decision.decision == "abandon"
    assert decision.evidence_snapshot_id == snapshot.id
    assert persisted_claim is not None
    assert (persisted_claim.path_status, persisted_claim.stopping_status) == ("abandoned", "abandon")
    assert len(published) == 1
    assert published[0][0:2] == (debate.id, "dialectical_exploration")
    assert published[0][2]["record_id"] == decision.id
    assert published[0][2]["decision"] == "abandon"
    assert published[0][2]["path_status"] == "abandoned"

    scoring_completion_lifecycle.reevaluate_lifecycle_after_scoring_completion(
        db,
        debate_id=debate.id,
        job_id=job.id,
        analyzer_run_id=completed_run.id,
        verification_provider=RegistryScoringProvider(registry),
    )

    assert provider.verifier_calls == 1
    assert len(db.scalars(select(EvidenceLifecycleSnapshot)).all()) == 1
    assert len(db.scalars(select(LifecycleDecisionRecord)).all()) == 1
    assert len(published) == 1


# ---------------------------------------------------------------------------
# Task 11 (P1.2) ordering/eligibility guard: verification must skip evidence
# nodes whose resolution_status is "unreachable" -- the coordinator could not
# even fetch the cited page, so there is nothing for the judge to compare the
# claim against. "resolved_quote_missing" (fetched, quote absent) and
# "pending"/absent (not yet resolved, or a model-claim node with no
# resolution_status key at all) remain verifier-eligible.
#
# The pure eligibility predicate itself
# (app.evidence.verification_evaluator.evidence_node_verification_eligible)
# is tested in test_verification_evaluator.py -- it is shared between this
# module's query-time guard (below) and protocol/runner.py's read-time
# re-check (see test_protocol_runner.py), so its unit tests live next to its
# canonical definition rather than here.
# ---------------------------------------------------------------------------


def test_scoring_completion_skips_unreachable_evidence_from_verification(db, monkeypatch) -> None:
    import json

    from app.models.entities import Generation, Worker
    from app.scoring.judges import ScoringProviderResult

    debate = Debate(topic="Evidence eligibility guard", status="complete")
    worker = Worker(id="eligibility-worker", name="Eligibility Worker", token_hash="hash", capabilities=["debate"])
    claim = Node(
        id="eligibility-claim",
        debate=debate,
        node_type="ROOT_CLAIM",
        depth=0,
        position=0,
        claim="A study found congestion pricing reduces downtown traffic.",
        status="complete",
        path_status="active",
        materialized_path="/",
    )
    reachable_evidence = Node(
        id="eligibility-evidence-reachable",
        debate=debate,
        parent_id=claim.id,
        node_type="EVIDENCE",
        depth=1,
        position=2000,
        claim="Congestion pricing cut traffic by 15%.",
        status="complete",
        path_status="active",
        materialized_path="/2000",
        # "resolved_quote_missing" is deliberately still eligible -- the judge
        # itself may mark it contradicted/unverifiable; the coordinator only
        # pre-filters fetchability, never the verdict.
        evidence_metadata={"method": "retrieval", "resolution_status": "resolved_quote_missing"},
    )
    unreachable_evidence = Node(
        id="eligibility-evidence-unreachable",
        debate=debate,
        parent_id=claim.id,
        node_type="EVIDENCE",
        depth=1,
        position=2001,
        claim="A source that could not be fetched.",
        status="complete",
        path_status="active",
        materialized_path="/2001",
        evidence_metadata={"method": "retrieval", "resolution_status": "unreachable"},
    )
    db.add_all([debate, worker, claim, reachable_evidence, unreachable_evidence])
    db.flush()
    debate.root_node_id = claim.id
    branch = DebateBranch(debate_id=debate.id, root_node_id=claim.id, status="active")
    db.add(branch)
    db.flush()

    claim_generation = Generation(
        id="eligibility-claim-generation",
        node_id=claim.id,
        model_id="claude-sonnet-5-high-loop",
        role="pro",
        argument=claim.claim,
        worker_id=worker.id,
    )
    reachable_generation = Generation(
        id="eligibility-reachable-generation",
        node_id=reachable_evidence.id,
        model_id="claude-sonnet-5-high-loop",
        role="evidence_retriever",
        argument=reachable_evidence.claim,
        worker_id=worker.id,
    )
    unreachable_generation = Generation(
        id="eligibility-unreachable-generation",
        node_id=unreachable_evidence.id,
        model_id="claude-sonnet-5-high-loop",
        role="evidence_retriever",
        argument=unreachable_evidence.claim,
        worker_id=worker.id,
    )
    db.add_all([claim_generation, reachable_generation, unreachable_generation])
    db.flush()
    claim.active_generation_id = claim_generation.id
    reachable_evidence.active_generation_id = reachable_generation.id
    unreachable_evidence.active_generation_id = unreachable_generation.id

    job = queue_scoring_job(db, debate, model_id="fixture-model")
    job.status = "complete"
    db.flush()
    _add_artifact(db, debate_id=debate.id, node_id=claim.id, job_id=job.id)
    db.flush()
    run = AnalyzerRun(
        debate_id=debate.id,
        branch_id=branch.id,
        analyzer_type="node_scoring",
        status="complete",
        output={"debate_id": debate.id, "items": []},
        provenance={"scoring_source": "judge_outputs", "job_id": job.id, "node_ids": [claim.id]},
        seq=1,
    )
    db.add(run)
    db.commit()

    class RecordingVerifierProvider:
        # Same provider/model pairing app.evidence tests use as a proven-
        # independent lineage against "claude-sonnet-5-high-loop", so the
        # provider actually gets called instead of failing closed on lineage.
        provider = "codex"
        model = "gpt-5.2-codex"

        def __init__(self) -> None:
            self.requests = []

        def judge_node(self, request):
            self.requests.append(request)
            return ScoringProviderResult(
                provider=self.provider,
                model=self.model,
                raw_output=json.dumps({"verdict": "unverifiable"}),
                checked_at=now_utc().isoformat(),
            )

    provider = RecordingVerifierProvider()
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_VERIFICATION", "true")
    monkeypatch.setattr(
        scoring_completion_lifecycle,
        "decide_lifecycle_for_node",
        lambda *_args, **_kwargs: SimpleNamespace(authentic_policy_decision=False),
    )

    scoring_completion_lifecycle.reevaluate_lifecycle_after_scoring_completion(
        db,
        debate_id=debate.id,
        job_id=job.id,
        analyzer_run_id=run.id,
        verification_provider=provider,
    )

    verified_evidence_texts = {request.metadata["evidence_text"] for request in provider.requests}
    assert reachable_evidence.claim in verified_evidence_texts
    assert unreachable_evidence.claim not in verified_evidence_texts
    assert len(provider.requests) == 1

    verification_runs = db.scalars(
        select(AnalyzerRun).where(AnalyzerRun.analyzer_type == "evidence_verification")
    ).all()
    assert {verification_run.output["evidenceNodeId"] for verification_run in verification_runs} == {
        reachable_evidence.id
    }
