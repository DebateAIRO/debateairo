"""W4: flag-gated adaptive expansion dispatch (categorical-only steering).

Design under test:
  - DIALECTICAL_ADAPTIVE_EXPANSION defaults OFF: dispatch is never invoked,
    debate.config gains no keys, synthesis prompts stay byte-identical.
  - Flag ON: the scoring-completion tail dispatches fresh authenticated
    lifecycle decisions into bounded real work through queue_v2_expand_job
    (challenge -> CON child, seek_evidence -> PRO child), idempotent on
    replay via the decision-record linkage in the job payload.
  - THE LAW: scalar-grounded (or unclassified legacy) decisions can never
    spawn -- they annotate only, even when eligible otherwise.
  - Budgets (rounds / per-node / per-debate) and capacity admission refuse
    with honest annotations, never silent drops.
  - Expand completion wakes a debate-scoped re-score; the loop terminates
    within the rounds budget; completed adaptive debates carry a non-empty
    stopped_because that reaches the synthesis prompt.
"""
from __future__ import annotations

import asyncio
import json
from datetime import timedelta
from types import SimpleNamespace

from sqlalchemy import select

from app.exploration import scoring_completion_lifecycle
from app.exploration.decision_repository import (
    LIFECYCLE_DECISION_SCHEMA_VERSION,
    LifecycleDecisionSnapshot,
    persist_lifecycle_decision,
)
from app.exploration.expansion_dispatch import (
    expansion_dispatch,
    maybe_queue_rescore_after_expansion,
)
from app.models.entities import AnalyzerRun, Debate, Generation, Job, LifecycleDecisionRecord, Node, now_utc
from app.scoring import queue_scoring_job
from app.scoring.jobs import drive_internal_scoring_for_debate, run_scoring_job_background
from app.services import dialectical_v2 as service
from app.services.dialectical_v2 import queue_v2_expand_job, render_v2_job_prompt
from app.services.orchestrator import claim_pending_job, complete_job, fail_job

from test_scoring_verdict_refresh import _judge_registry
from test_v2_expand import (
    argument_children,
    codex_worker,
    complete_pending_pov_jobs,
    expand_worker_result,
    first_pov_pro,
    make_v2_debate,
    synthesis_output,
    synthesize_jobs,
)


def _complete_debate(db, worker, debate) -> None:
    synthesis_job = claim_pending_job(db, worker)
    assert synthesis_job is not None and synthesis_job.job_type == "v2_synthesize"
    asyncio.run(
        complete_job(db, synthesis_job, synthesis_output(worker, synthesis_job.id), {"latency_ms": 5})
    )
    db.refresh(debate)
    assert debate.status == "complete"


def persist_decision(
    db,
    *,
    debate_id: str,
    node_id: str,
    decision: str = "challenge",
    signal_class: str = "categorical",
    run_id: str = "run-w4",
    reason: str = "high-severity contradiction should be challenged",
) -> LifecycleDecisionRecord:
    persistence = persist_lifecycle_decision(
        db,
        snapshot=LifecycleDecisionSnapshot(
            schema_version=LIFECYCLE_DECISION_SCHEMA_VERSION,
            idempotency_key=f"scoring-completion:{run_id}:{node_id}",
            debate_id=debate_id,
            node_id=node_id,
            decision=decision,
            stopping_reason=reason,
            path_status="active",
            stopping_status=decision,
            input_state="grounded",
            reason_codes=(),
            score_availability="present",
            score_freshness="fresh",
            evidence_availability="present",
            evidence_freshness="fresh",
            current_score_input_hash="a" * 64,
            scoring_contract_hash="b" * 64,
            score_record_id=f"score-row-{node_id}",
            score_run_id=run_id,
            score_run_sequence=1,
            evidence_snapshot_id=f"evidence-{node_id}",
            decision_timestamp=now_utc(),
            child_spawn_count=0,
            signal_class=signal_class,
        ),
    )
    db.commit()
    return persistence.record


def expand_jobs(db, debate_id: str) -> list[Job]:
    return list(
        db.scalars(
            select(Job)
            .where(Job.debate_id == debate_id, Job.job_type == "v2_expand")
            .order_by(Job.created_at.asc(), Job.id.asc())
        ).all()
    )


def score_jobs(db, debate_id: str) -> list[Job]:
    return list(
        db.scalars(
            select(Job).where(Job.debate_id == debate_id, Job.job_type == "score_debate")
        ).all()
    )


def adaptive_config(db, debate_id: str) -> dict:
    debate = db.get(Debate, debate_id)
    value = (debate.config or {}).get("adaptive_expansion")
    return value if isinstance(value, dict) else {}


# ---------------------------------------------------------------------------
# Flag OFF: byte-identical behavior
# ---------------------------------------------------------------------------


def test_flag_off_dispatch_never_invoked_and_config_untouched(db, monkeypatch) -> None:
    import json

    from app.scoring import jobs as scoring_jobs

    dispatch_calls: list[tuple] = []
    monkeypatch.setattr(
        scoring_jobs,
        "expansion_dispatch",
        lambda *args, **kwargs: dispatch_calls.append((args, kwargs)),
    )
    worker = codex_worker(db)
    debate = make_v2_debate(db, worker)
    _complete_debate(db, worker, debate)
    config_before = json.dumps(debate.config, sort_keys=True)

    job = queue_scoring_job(db, debate, model_id="codex-test-model")
    db.commit()
    run_scoring_job_background(job.id, debate.id, registry_factory=_judge_registry)

    db.expire_all()
    assert dispatch_calls == []
    refreshed = db.get(Debate, debate.id)
    assert json.dumps(refreshed.config, sort_keys=True) == config_before
    assert "adaptive_expansion" not in (refreshed.config or {})
    assert expand_jobs(db, debate.id) == []
    # No decision record spawned anything (with verification off none can
    # even authenticate, so none exist -- and every count stays 0).
    records = db.scalars(select(LifecycleDecisionRecord)).all()
    assert all(record.child_spawn_count == 0 for record in records)
    assert all(record.dispatch_outcome is None for record in records)


def test_synthesis_prompt_pins_both_flag_states(db, monkeypatch) -> None:
    worker = codex_worker(db)
    debate = make_v2_debate(db, worker)
    synthesis_job = synthesize_jobs(db, debate.id)[0]
    # A stale adaptive key (e.g. written while the flag was on) must not
    # leak into flag-off renders.
    debate.config = {
        **debate.config,
        "adaptive_expansion": {"rounds_completed": 2, "stopped_because": "budget_exhausted"},
    }
    db.commit()

    _, user_off = render_v2_job_prompt(db, synthesis_job)
    assert "Adaptive expansion context" not in user_off

    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "true")
    _, user_on = render_v2_job_prompt(db, synthesis_job)
    assert "Adaptive expansion context: automatic tree growth" in user_on
    assert "stopped (reason: budget_exhausted)" in user_on

    # Flag ON without a recorded stop renders byte-identically to flag OFF.
    debate.config = {
        key: value for key, value in debate.config.items() if key != "adaptive_expansion"
    }
    db.commit()
    _, user_on_no_stop = render_v2_job_prompt(db, synthesis_job)
    assert user_on_no_stop == user_off


# ---------------------------------------------------------------------------
# Flag ON: dispatch spawns bounded real work from categorical decisions
# ---------------------------------------------------------------------------


def test_categorical_decisions_spawn_polarity_mapped_children_idempotently(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "true")
    worker = codex_worker(db)
    debate = make_v2_debate(db, worker)
    pro_parent = first_pov_pro(db, debate)
    con_parent = db.scalar(
        select(Node).where(
            Node.parent_id == pro_parent.parent_id, Node.node_type == "CON", Node.position == 1
        )
    )
    assert con_parent is not None and con_parent.status == "complete"
    challenge = persist_decision(db, debate_id=debate.id, node_id=pro_parent.id, decision="challenge")
    seek = persist_decision(
        db,
        debate_id=debate.id,
        node_id=con_parent.id,
        decision="seek_evidence",
        reason="empirical evidence is not grounded",
    )
    assert len(synthesize_jobs(db, debate.id)) == 1  # queued by the POV fan-in

    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id="run-w4")

    db.expire_all()
    jobs = expand_jobs(db, debate.id)
    assert len(jobs) == 2
    by_decision = {(job.payload or {}).get("decision_record_id"): job for job in jobs}
    assert set(by_decision) == {challenge.id, seek.id}
    challenge_child = db.get(Node, by_decision[challenge.id].node_id)
    seek_child = db.get(Node, by_decision[seek.id].node_id)
    # Decision -> work mapping: challenge probes with CON, seek_evidence adds PRO.
    assert challenge_child.node_type == "CON" and challenge_child.parent_id == pro_parent.id
    assert seek_child.node_type == "PRO" and seek_child.parent_id == con_parent.id
    # Reason text comes from the decision's recorded rationale.
    assert by_decision[challenge.id].payload["reason"] == (
        "high-severity contradiction should be challenged"
    )
    # Real spawn count lands on the audited record (no more inert 0).
    challenge_record = db.get(LifecycleDecisionRecord, challenge.id)
    seek_record = db.get(LifecycleDecisionRecord, seek.id)
    assert challenge_record.dispatch_outcome == "spawned"
    assert challenge_record.child_spawn_count == 1
    assert seek_record.dispatch_outcome == "spawned"
    assert seek_record.child_spawn_count == 1
    # Bookkeeping: one spawning pass -> one round; growth is not "stopped".
    state = adaptive_config(db, debate.id)
    assert state["rounds_completed"] == 1
    assert "stopped_because" not in state
    # The in-flight synthesis was superseded (W3 primitive semantics).
    assert [job.status for job in synthesize_jobs(db, debate.id)] == ["failed"]

    # Replaying the dispatch spawns nothing new and keeps the bookkeeping.
    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id="run-w4")
    db.expire_all()
    assert len(expand_jobs(db, debate.id)) == 2
    state = adaptive_config(db, debate.id)
    assert state["rounds_completed"] == 1
    assert "stopped_because" not in state


def test_scalar_or_unclassified_decisions_never_spawn(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "true")
    worker = codex_worker(db)
    debate = make_v2_debate(db, worker)
    parent = first_pov_pro(db, debate)
    # Eligible otherwise: complete node, capable online worker, open budgets.
    scalar_record = persist_decision(
        db, debate_id=debate.id, node_id=parent.id, decision="challenge", signal_class="scalar"
    )

    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id="run-w4")

    db.expire_all()
    assert expand_jobs(db, debate.id) == []
    record = db.get(LifecycleDecisionRecord, scalar_record.id)
    assert record.dispatch_outcome == "annotate_only_scalar_signal"
    assert record.child_spawn_count == 0
    assert adaptive_config(db, debate.id)["stopped_because"] == "no_categorical_signals"

    # A legacy record with no classification at all (pre-W4 NULL) is treated
    # as scalar -- fail closed.
    legacy = persist_decision(
        db, debate_id=debate.id, node_id=parent.id, decision="challenge", run_id="run-w4-legacy"
    )
    db.get(LifecycleDecisionRecord, legacy.id).signal_class = None
    db.commit()
    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id="run-w4-legacy")
    db.expire_all()
    assert expand_jobs(db, debate.id) == []
    assert db.get(LifecycleDecisionRecord, legacy.id).dispatch_outcome == (
        "annotate_only_scalar_signal"
    )


def test_budget_refusals_annotate_honestly(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "true")
    monkeypatch.setenv("DIALECTICAL_EXPANSION_MAX_PER_DEBATE", "0")
    worker = codex_worker(db)
    debate = make_v2_debate(db, worker)
    parent = first_pov_pro(db, debate)
    record = persist_decision(db, debate_id=debate.id, node_id=parent.id)

    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id="run-w4")

    db.expire_all()
    assert expand_jobs(db, debate.id) == []
    assert db.get(LifecycleDecisionRecord, record.id).dispatch_outcome == "budget_exhausted"
    assert db.get(LifecycleDecisionRecord, record.id).child_spawn_count == 0
    assert adaptive_config(db, debate.id)["stopped_because"] == "budget_exhausted"

    # Rounds budget: with rounds already exhausted no decision may spawn,
    # even with the per-debate budget open again.
    monkeypatch.setenv("DIALECTICAL_EXPANSION_MAX_PER_DEBATE", "6")
    exhausted = db.get(Debate, debate.id)
    exhausted.config = {
        **exhausted.config,
        "adaptive_expansion": {"rounds_completed": 2},
    }
    db.commit()
    rounds_record = persist_decision(
        db, debate_id=debate.id, node_id=parent.id, run_id="run-w4-rounds"
    )
    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id="run-w4-rounds")
    db.expire_all()
    assert expand_jobs(db, debate.id) == []
    assert db.get(LifecycleDecisionRecord, rounds_record.id).dispatch_outcome == "budget_exhausted"
    assert adaptive_config(db, debate.id)["stopped_because"] == "budget_exhausted"


def test_no_capable_online_worker_defers_honestly(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "true")
    worker = codex_worker(db)
    debate = make_v2_debate(db, worker)
    parent = first_pov_pro(db, debate)
    record = persist_decision(db, debate_id=debate.id, node_id=parent.id)
    worker.last_seen = now_utc() - timedelta(days=1)
    db.commit()

    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id="run-w4")

    db.expire_all()
    assert expand_jobs(db, debate.id) == []
    assert db.get(LifecycleDecisionRecord, record.id).dispatch_outcome == "deferred_no_capacity"
    assert adaptive_config(db, debate.id)["stopped_because"] == "deferred_no_capacity"


def test_dispatch_refuses_archived_debates(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "true")
    worker = codex_worker(db)
    debate = make_v2_debate(db, worker)
    parent = first_pov_pro(db, debate)
    record = persist_decision(db, debate_id=debate.id, node_id=parent.id)
    debate.status = "archived"
    db.commit()

    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id="run-w4")

    db.expire_all()
    assert expand_jobs(db, debate.id) == []
    assert db.get(LifecycleDecisionRecord, record.id).dispatch_outcome is None
    assert adaptive_config(db, debate.id) == {}


# ---------------------------------------------------------------------------
# The full loop: scoring completion -> dispatch -> expand -> re-score ->
# quiescence -> synthesis with stopped_because
# ---------------------------------------------------------------------------


def test_adaptive_loop_spawns_rescores_and_terminates_within_rounds(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "true")
    registry = _judge_registry()
    # ensure_default_scoring at completion must see the fake judge registry
    # so the pending debate-scoped scoring job is queued deterministically.
    monkeypatch.setattr(service, "ProviderRegistry", lambda: registry)
    worker = codex_worker(db)
    debate = make_v2_debate(db, worker)
    _complete_debate(db, worker, debate)
    # First-completion backstop: honest quiescent state before any dispatch.
    assert adaptive_config(db, debate.id)["stopped_because"] == "quiescent_no_decisions"

    target = first_pov_pro(db, debate)
    target_id = target.id
    mode = {"value": "challenge"}

    def scripted_decision(inner_db, *, debate, node, decision_timestamp):
        if mode["value"] != "challenge" or node.id != target_id:
            return SimpleNamespace(authentic_policy_decision=False)
        run = inner_db.scalars(
            select(AnalyzerRun)
            .where(
                AnalyzerRun.debate_id == debate.id,
                AnalyzerRun.analyzer_type == "node_scoring",
            )
            .order_by(AnalyzerRun.seq.desc())
        ).first()
        return SimpleNamespace(
            authentic_policy_decision=True,
            input_state="grounded",
            action="challenge",
            keeps_path_active=True,
            stopping_reason="high-severity contradiction should be challenged",
            score_run_id=run.id,
            score_run_sequence=run.seq,
            score_record_id="score-row-target",
            evidence_snapshot_id="evidence-snap-target",
            current_score_input_hash="a" * 64,
            scoring_contract_hash="b" * 64,
            decision_timestamp=decision_timestamp,
            reason_codes=(),
            signal_class="categorical",
        )

    monkeypatch.setattr(scoring_completion_lifecycle, "decide_lifecycle_for_node", scripted_decision)

    # Round 1: the completion-queued pending scoring job is driven through
    # the W2 internal machinery -> reevaluation persists the categorical
    # challenge -> dispatch spawns exactly one bounded CON child.
    children_before = {node.id for node in argument_children(db, target_id)}
    driven_round_1 = drive_internal_scoring_for_debate(
        debate.id,
        registry_factory=lambda: registry,
        background_runner=lambda job_id, d_id: run_scoring_job_background(
            job_id, d_id, registry_factory=lambda: registry
        ),
    )
    assert driven_round_1 is not None

    db.expire_all()
    jobs = expand_jobs(db, debate.id)
    assert len(jobs) == 1
    child = db.get(Node, jobs[0].node_id)
    assert child.parent_id == target_id and child.node_type == "CON"
    assert {node.id for node in argument_children(db, target_id)} == children_before | {child.id}
    record = db.scalars(select(LifecycleDecisionRecord)).one()
    assert record.node_id == target_id
    assert record.signal_class == "categorical"
    assert record.dispatch_outcome == "spawned"
    assert record.child_spawn_count == 1
    assert jobs[0].payload["decision_record_id"] == record.id
    state = adaptive_config(db, debate.id)
    assert state["rounds_completed"] == 1
    assert "stopped_because" not in state
    run1_id = record.score_run_id

    # Replaying the dispatch spawns nothing new.
    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run1_id)
    db.expire_all()
    assert len(expand_jobs(db, debate.id)) == 1
    assert adaptive_config(db, debate.id)["rounds_completed"] == 1

    # The completed expansion wakes a debate-scoped re-score (and queues the
    # re-synthesis, per W3).
    triggered: list[str] = []
    monkeypatch.setattr(
        service, "trigger_internal_scoring_after_completion", lambda debate_id: triggered.append(debate_id)
    )
    mode["value"] = "quiet"
    claimed = claim_pending_job(db, worker)
    assert claimed is not None and claimed.job_type == "v2_expand"
    asyncio.run(complete_job(db, claimed, expand_worker_result(worker, claimed.id), {"latency_ms": 5}))

    assert triggered == [debate.id]
    pending_synthesis = [job for job in synthesize_jobs(db, debate.id) if job.status == "pending"]
    assert len(pending_synthesis) == 1
    assert any(job.status == "pending" for job in score_jobs(db, debate.id))

    # Round 2: drive the woken re-score; no categorical signals remain, so
    # dispatch records why growth stopped and spawns nothing.
    driven = drive_internal_scoring_for_debate(
        debate.id,
        registry_factory=lambda: registry,
        background_runner=lambda job_id, d_id: run_scoring_job_background(
            job_id, d_id, registry_factory=lambda: registry
        ),
    )
    assert driven is not None
    db.expire_all()
    assert len(expand_jobs(db, debate.id)) == 1
    state = adaptive_config(db, debate.id)
    assert state["rounds_completed"] == 1
    assert state["stopped_because"] == "quiescent_no_decisions"

    # The stopping context reaches the synthesis prompt, and the debate
    # completes carrying it.
    _, user_prompt = render_v2_job_prompt(db, pending_synthesis[0])
    assert "stopped (reason: quiescent_no_decisions)" in user_prompt
    _complete_debate(db, worker, db.get(Debate, debate.id))
    db.expire_all()
    assert adaptive_config(db, debate.id)["stopped_because"] == "quiescent_no_decisions"
    # Loop terminated within the rounds budget: one expansion, two scorings.
    assert len(expand_jobs(db, debate.id)) == 1
    assert len([job for job in score_jobs(db, debate.id) if job.status == "complete"]) == 2


def test_rescore_degrades_silently_without_provider_and_never_wedges(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "true")
    monkeypatch.setattr("app.providers.registry.load_agent_configs", lambda path=None: {})
    triggered: list[str] = []
    monkeypatch.setattr(
        service, "trigger_internal_scoring_after_completion", lambda debate_id: triggered.append(debate_id)
    )
    worker = codex_worker(db)
    debate = make_v2_debate(db, worker, complete_povs=3)
    parent = first_pov_pro(db, debate)
    job = queue_v2_expand_job(db, debate, parent, "CON", "Challenge coverage is thin.")
    complete_pending_pov_jobs(db, worker, debate, 1)

    claimed = claim_pending_job(db, worker)
    assert claimed is not None and claimed.id == job.id
    asyncio.run(complete_job(db, claimed, expand_worker_result(worker, claimed.id), {"latency_ms": 5}))

    # No provider: no scoring job minted, no trigger fired -- and synthesis
    # still proceeds (the loop can never wedge the debate).
    assert triggered == []
    assert score_jobs(db, debate.id) == []
    pending_synthesis = [job for job in synthesize_jobs(db, debate.id) if job.status == "pending"]
    assert len(pending_synthesis) == 1


def test_terminal_expand_failure_records_generation_exhausted_and_synthesis_proceeds(
    db, monkeypatch
) -> None:
    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "true")
    monkeypatch.setenv("DIALECTICAL_MAX_JOB_ATTEMPTS", "1")
    worker = codex_worker(db)
    debate = make_v2_debate(db, worker, complete_povs=3)
    parent = first_pov_pro(db, debate)
    job = queue_v2_expand_job(db, debate, parent, "CON", "Challenge coverage is thin.")
    complete_pending_pov_jobs(db, worker, debate, 1)

    claimed = claim_pending_job(db, worker)
    assert claimed is not None and claimed.id == job.id
    asyncio.run(fail_job(db, claimed, "poisoned output", True))

    db.expire_all()
    assert db.get(Job, job.id).status == "failed"
    # The failed round ended growth honestly; synthesis proceeds over the
    # survivors and its prompt carries the stopping context.
    assert adaptive_config(db, debate.id)["stopped_because"] == "generation_exhausted"
    pending_synthesis = [item for item in synthesize_jobs(db, debate.id) if item.status == "pending"]
    assert len(pending_synthesis) == 1
    _, user_prompt = render_v2_job_prompt(db, pending_synthesis[0])
    assert "stopped (reason: generation_exhausted)" in user_prompt

    worker.status = "online"
    worker.last_seen = now_utc()
    db.commit()
    _complete_debate(db, worker, debate)
    assert adaptive_config(db, debate.id)["stopped_because"] == "generation_exhausted"


def test_maybe_queue_rescore_reuses_active_scoring_jobs(db) -> None:
    debate = Debate(topic="Rescore bookkeeping", status="complete")
    db.add(debate)
    db.commit()
    pending = queue_scoring_job(db, debate, model_id="codex-test-model")
    db.commit()

    # A pending job just needs the wake -- returned, not duplicated.
    assert maybe_queue_rescore_after_expansion(db, debate, registry_factory=_judge_registry) is pending
    assert len(score_jobs(db, debate.id)) == 1

    # An in-flight job needs nothing.
    pending.status = "running"
    db.commit()
    assert maybe_queue_rescore_after_expansion(db, debate, registry_factory=_judge_registry) is None
    assert len(score_jobs(db, debate.id)) == 1


# ---------------------------------------------------------------------------
# User-approved expansions go real (flag ON) -- W0 carried item
# ---------------------------------------------------------------------------


def _seed_expand_dry_run(db, debate, node) -> None:
    from app.scoring.models import RecommendedInvestigation, ScoringHole
    from app.services.dialectical_v2 import first_branch

    from test_node_scoring import explicit_depth_pressure_payload

    item = explicit_depth_pressure_payload(
        node_id=node.id,
        holes=[
            ScoringHole(
                type="assumption_risk",
                severity="high",
                description="The argument depends on an unstated adoption assumption.",
                source="critic",
            )
        ],
        impact=0.75,
        uncertainty=0.5,
        recommended_investigations=[
            RecommendedInvestigation(
                action="challenge",
                reason="A priority-one challenge marks an unanswered attack.",
                priority=1,
                target_node_id=node.id,
            )
        ],
    ).model_dump(mode="json")
    db.add(
        AnalyzerRun(
            debate_id=debate.id,
            branch_id=first_branch(db, debate.id).id,
            analyzer_type="node_scoring",
            output={"status": "available", "items": [item], "producer": "stored-judge-output"},
            status="complete",
            provenance={"scoring_source": "judge_outputs"},
        )
    )
    db.commit()


def test_user_approved_expansion_queues_real_v2_expand_job_flag_on(db, monkeypatch) -> None:
    from fastapi.testclient import TestClient

    from app.main import app
    from app.models.entities import ProvenanceRecord

    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "true")
    worker = codex_worker(db)
    debate = make_v2_debate(db, worker)
    target = first_pov_pro(db, debate)
    _seed_expand_dry_run(db, debate, target)

    response = TestClient(app).post(
        f"/api/debates/{debate.id}/scoring/adaptive-depth/approvals",
        headers={"Authorization": "Bearer user_test_token"},
        json={
            "debate_id": debate.id,
            "selected_node_ids": [target.id],
            "approval_reason": "Reviewer approved the expand recommendation.",
        },
    )

    assert response.status_code == 202
    body = response.json()
    assert body["status"] == "queued"
    assert body["queued_node_ids"] == [target.id]
    assert body["unavailable_node_ids"] == []
    assert len(body["jobs"]) == 1 and body["jobs"][0]["status"] == "queued"
    assert body["outcomes"] == [
        {
            "node_id": target.id,
            "applied": True,
            "reason": "expansion_queued",
            "job_id": body["jobs"][0]["job_id"],
        }
    ]
    db.expire_all()
    jobs = expand_jobs(db, debate.id)
    assert [job.id for job in jobs] == [body["jobs"][0]["job_id"]]
    payload = jobs[0].payload or {}
    # User approval is categorical grounding: real work, CON polarity, audit
    # linkage and the approval rationale in the payload.
    assert payload["parent_node_id"] == target.id
    assert payload["polarity"] == "CON"
    assert payload["approval_audit_id"] == body["audit_record_id"]
    assert payload["reason"].startswith(
        "User-approved adaptive expansion (Reviewer approved the expand recommendation.)"
    )
    child = db.get(Node, jobs[0].node_id)
    assert child.parent_id == target.id and child.node_type == "CON" and child.status == "pending"
    audit = db.get(ProvenanceRecord, body["audit_record_id"])
    assert audit.metadata_json["applied_outcomes"] == body["outcomes"]


def test_user_approved_expansion_refuses_budget_honestly_flag_on(db, monkeypatch) -> None:
    from fastapi.testclient import TestClient

    from app.main import app

    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "true")
    monkeypatch.setenv("DIALECTICAL_EXPANSION_MAX_PER_DEBATE", "0")
    worker = codex_worker(db)
    debate = make_v2_debate(db, worker)
    target = first_pov_pro(db, debate)
    _seed_expand_dry_run(db, debate, target)

    response = TestClient(app).post(
        f"/api/debates/{debate.id}/scoring/adaptive-depth/approvals",
        headers={"Authorization": "Bearer user_test_token"},
        json={"debate_id": debate.id, "selected_node_ids": [target.id]},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "unavailable"
    assert body["queued_node_ids"] == []
    assert body["jobs"] == []
    assert body["outcomes"] == [
        {"node_id": target.id, "applied": False, "reason": "budget_exhausted"}
    ]
    assert "budget_exhausted" in body["reason"]
    assert body["audit_record_id"] is not None
    db.expire_all()
    assert expand_jobs(db, debate.id) == []


# ---------------------------------------------------------------------------
# Task 16 (P3.2): adaptive-expansion activation readiness -- end-to-end proof
# with BOTH DIALECTICAL_ADAPTIVE_EXPANSION and DIALECTICAL_EVIDENCE_
# VERIFICATION on, driving the REAL chain (no scripted decide_lifecycle_for_
# node anywhere): scoring completion -> evidence verification (a fake
# judge-provider response, exactly like the real worker transport) ->
# lifecycle reevaluation -> a real, categorically-grounded challenge/
# seek_evidence decision -> expansion_dispatch -> a real v2_expand job
# queued -> LifecycleDecisionRecord persisted with dispatch_outcome, and the
# decision exposed on the serialized debate payload (lifecycleDecisions).
# ---------------------------------------------------------------------------


def _neutral_claim_assessment():
    from app.scoring import ClaimAssessment, ContextAssessment, CriticAssessment, EvidenceAssessment, FallacyAssessment, SteelmanAssessment

    return ClaimAssessment(
        steelman=SteelmanAssessment(charitable_strength=0.5, confidence=0.7),
        critic=CriticAssessment(logical_validity=0.6, assumption_risk=0.2, counterargument_strength=0.3),
        evidence=EvidenceAssessment(
            evidence_quality=0.5,
            evidence_relevance=0.5,
            evidence_sufficiency=0.5,
            source_reliability=0.5,
            freshness=0.5,
            missing_evidence=[],
            fatal_flags=[],
        ),
        context=ContextAssessment(relevance=0.5, impact=0.2, dependency_weight=0.2),
        fallacy=FallacyAssessment(logical_consistency=0.8),
    )


def _add_evidence_child(db, worker, target: Node, *, id_suffix: str) -> Node:
    evidence = Node(
        id=f"e2e-evidence-{id_suffix}",
        debate_id=target.debate_id,
        parent_id=target.id,
        node_type="EVIDENCE",
        depth=target.depth + 1,
        position=5000,
        claim="A cited source appears to address the claim.",
        status="completed",
        path_status="active",
        materialized_path=f"{target.materialized_path}/5000",
        evidence_metadata={"evidenceKind": "citation"},
    )
    db.add(evidence)
    db.flush()
    evidence_generation = Generation(
        id=f"e2e-evidence-generation-{id_suffix}",
        node_id=evidence.id,
        model_id="gpt-5.6sol-medium",
        role="pro",
        argument=evidence.claim,
        worker_id=worker.id,
    )
    db.add(evidence_generation)
    db.flush()
    evidence.active_generation_id = evidence_generation.id
    db.commit()
    return evidence


def _verifier_fake_registry(verdict: str):
    from app.providers import AgentConfig, ProviderRegistry
    from app.scoring.judges import ScoringProviderResult

    class FakeProvider:
        provider = "fixture-judge"
        # A DIFFERENT model family than codex_worker's "gpt-5.6sol-medium"
        # (the argument's author, per generic_pov_output's provenance) --
        # judge_lineage_metadata refuses to call the provider at all for a
        # same-family judge (see app.scoring.lineage), so the verifier must
        # be cross-family for evaluate_evidence_verdict to ever reach it.
        model = "claude-sonnet-5-high-loop"

        def judge_node(self, request):
            if request.judge_role == "verifier":
                raw_output = json.dumps({"verdict": verdict})
            else:
                raw_output = _neutral_claim_assessment().model_dump_json()
            return ScoringProviderResult(
                provider=self.provider,
                model=self.model,
                raw_output=raw_output,
                latency_ms=5,
                checked_at=now_utc().isoformat(),
            )

    provider = FakeProvider()
    registry = ProviderRegistry(
        agents={"judge": AgentConfig(provider=provider.provider, model=provider.model, temperature=0.0)},
        providers={provider.provider: provider},
    )
    return provider, registry


def test_real_contradicted_verifier_verdict_authenticates_challenge_and_dispatches_expand_job(
    db, monkeypatch
) -> None:
    from app.services.serialization import debate_to_dict

    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "true")
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_VERIFICATION", "true")
    # P1 Task 6: this fixture's fake judge emits impact 0.2 / uncertainty 0.3,
    # so its frontier priority is 0.06 -- genuinely below the 0.15 production
    # floor (which 86% of the 250 real scored nodes on this deployment clear).
    # This test is about verifier-verdict AUTHENTICATION reaching a real
    # dispatch, not about ranking, so the floor is pinned off rather than the
    # fixture's numbers being inflated to dodge it.
    monkeypatch.setenv("DIALECTICAL_EXPANSION_PRIORITY_FLOOR", "0")
    worker = codex_worker(db)
    debate = make_v2_debate(db, worker)
    target = first_pov_pro(db, debate)
    _add_evidence_child(db, worker, target, id_suffix="challenge")
    provider, registry = _verifier_fake_registry("contradicted")

    job = queue_scoring_job(db, debate, model_id=provider.model)
    db.commit()
    run_scoring_job_background(job.id, debate.id, registry_factory=lambda: registry)

    db.expire_all()
    record = db.scalars(
        select(LifecycleDecisionRecord).where(LifecycleDecisionRecord.node_id == target.id)
    ).one()
    assert record.decision == "challenge"
    assert record.signal_class == "categorical"
    assert record.input_state == "grounded"
    assert record.dispatch_outcome == "spawned"
    assert record.child_spawn_count == 1

    jobs = expand_jobs(db, debate.id)
    assert len(jobs) == 1
    assert jobs[0].job_type == "v2_expand"
    assert jobs[0].payload["decision_record_id"] == record.id
    child = db.get(Node, jobs[0].node_id)
    assert child.parent_id == target.id and child.node_type == "CON"
    assert adaptive_config(db, debate.id)["rounds_completed"] == 1

    # lifecycleDecisions on the wire (brief point 2): the debate payload
    # exposes exactly this persisted decision for the target node.
    payload = debate_to_dict(db, db.get(Debate, debate.id))
    wire_decisions = {entry["nodeId"]: entry for entry in payload["lifecycleDecisions"]}
    assert wire_decisions[target.id]["decision"] == "challenge"
    assert wire_decisions[target.id]["signalClass"] == "categorical"
    assert wire_decisions[target.id]["outcome"] == "spawned"
    assert wire_decisions[target.id]["childSpawnCount"] == 1


def test_real_unverifiable_verifier_verdict_authenticates_seek_evidence_and_dispatches_expand_job(
    db, monkeypatch
) -> None:
    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "true")
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_VERIFICATION", "true")
    # P1 Task 6: this fixture's fake judge emits impact 0.2 / uncertainty 0.3,
    # so its frontier priority is 0.06 -- genuinely below the 0.15 production
    # floor (which 86% of the 250 real scored nodes on this deployment clear).
    # This test is about verifier-verdict AUTHENTICATION reaching a real
    # dispatch, not about ranking, so the floor is pinned off rather than the
    # fixture's numbers being inflated to dodge it.
    monkeypatch.setenv("DIALECTICAL_EXPANSION_PRIORITY_FLOOR", "0")
    worker = codex_worker(db)
    debate = make_v2_debate(db, worker)
    target = first_pov_pro(db, debate)
    # requires_evidence in app.exploration.policy is gated on the REAL
    # deterministic claim-type classifier (app.scoring.normalizer), which
    # runs against node.claim during the real scoring pass -- so, unlike the
    # unit-level test_lifecycle_decision_service.py test, the claim text
    # itself (not a score-item field) must classify empirical.
    target.claim = "A study reports a measured 12 percent adoption rate among surveyed users."
    db.commit()
    _add_evidence_child(db, worker, target, id_suffix="seek-evidence")
    provider, registry = _verifier_fake_registry("unverifiable")

    job = queue_scoring_job(db, debate, model_id=provider.model)
    db.commit()
    run_scoring_job_background(job.id, debate.id, registry_factory=lambda: registry)

    db.expire_all()
    record = db.scalars(
        select(LifecycleDecisionRecord).where(LifecycleDecisionRecord.node_id == target.id)
    ).one()
    assert record.decision == "seek_evidence"
    assert record.signal_class == "categorical"
    assert record.input_state == "grounded"
    assert record.dispatch_outcome == "spawned"
    assert record.child_spawn_count == 1

    jobs = expand_jobs(db, debate.id)
    assert len(jobs) == 1
    assert jobs[0].job_type == "v2_expand"
    assert jobs[0].payload["decision_record_id"] == record.id
    child = db.get(Node, jobs[0].node_id)
    assert child.parent_id == target.id and child.node_type == "PRO"
    assert adaptive_config(db, debate.id)["rounds_completed"] == 1
