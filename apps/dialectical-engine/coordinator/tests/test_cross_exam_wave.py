"""Task 15 (P3.3): the pre-synthesis cross-examination round.

Design under test (flag DIALECTICAL_CROSS_EXAM, default OFF):
  - Flag OFF: queue_v2_synthesize_job's callers behave byte-identically to
    pre-Task-15 -- zero cross-exam jobs, synthesis queued directly.
  - Flag ON: at the moment synthesis would be queued (Task 8's single
    queue_v2_synthesize_job seam), the debate is otherwise quiescent -- the
    wave queues ONE v2_expand CHALLENGE job per completed POV branch instead,
    each against that branch's strongest claim (highest persisted strength;
    unscored fallback is strongest_pro), pinned to a healthy online model
    from a DIFFERENT family than the claim's author (choose_adversarial_
    attacker_model reuse), capped by DIALECTICAL_CROSS_EXAM_MAX_JOBS
    (strongest branches first by root strength, ties by node id). The wave's
    v2_expand jobs join V2_GENERATION_JOB_TYPES, so the EXISTING whole-tree
    quiescence check (pending_generation_nodes) holds synthesis until every
    wave job is terminal; only then does the seam fall through to real
    (rotation-aware) synthesis.
  - Persistence: cross-exam completions materialize CON children through the
    normal v2_expand path and carry a coordinator-authoritative cross_exam
    provenance mark, exposed via the existing provenance_records
    serialization channel.
  - Rescore affected: materialization fires Task 8's incremental scoring
    trigger; Task 3's children-digest input hash means a rescoring pass is a
    genuine cache miss for the attacked parent, not a stale hit.
  - Failure posture: v2_expand defaults to NODE_DEGRADABLE (would mark the
    fresh CON placeholder failed and treat it as a branch degradation), which
    is wrong for a wave job -- the attacked claim is a healthy, already-
    complete node elsewhere in the tree. Cross-exam-marked jobs take Task
    10's AUXILIARY terminal path instead: job-scoped ledger entry only, the
    attacked claim stays complete, the debate is never failed, and (since a
    cross-exam job's node_id IS a fresh, never-generated placeholder that
    held whole-tree quiescence while pending, unlike v2_evidence's job which
    targets an already-complete node) synthesis is re-checked and proceeds
    once the whole wave is terminal.
"""
from __future__ import annotations

import asyncio
import json

from sqlalchemy import select

from app.models.entities import (
    AnalyzerRun,
    Debate,
    Job,
    JobTransition,
    Node,
    ProvenanceRecord,
    Worker,
    now_utc,
)
from app.scoring import ScoringProviderResult
from app.scoring.service import JUDGE_OUTPUT_SOURCE, SCORING_ANALYZER_TYPE, score_node_with_provider
from app.services import dialectical_v2 as service
from app.services.dialectical_v2 import CROSS_EXAM_REASON, V2_CODEX_MODEL_ID
from app.services.orchestrator import (
    claim_pending_job,
    complete_job,
    fail_job,
    terminalize_job_failure,
    worker_can_claim_job,
)
from app.services.serialization import debate_to_dict

from test_node_scoring import base_assessment
from test_protocol_runner import _scoring_payload_for_node

FLAG = "DIALECTICAL_CROSS_EXAM"
CAP_ENV = "DIALECTICAL_CROSS_EXAM_MAX_JOBS"
GPT = "gpt-5.6sol-medium"
CLAUDE = "claude-sonnet-5-high-loop"
TOPIC = "Should cities ban cars downtown?"


# ---------------------------------------------------------------------------
# Fixtures / helpers (self-contained -- mirrors test_adversarial_pov.py's own
# style rather than cross-importing another test file's pipeline helpers,
# since the multi-branch / multi-worker shapes needed here differ).
# ---------------------------------------------------------------------------


def worker(db, name: str, capabilities: list[str]) -> Worker:
    row = Worker(
        name=name,
        token_hash=f"test-token-{name}",
        capabilities=capabilities,
        last_seen=now_utc(),
        status="online",
    )
    db.add(row)
    db.commit()
    return row


def gpt_worker(db) -> Worker:
    return worker(db, "gpt-worker", [GPT])


def claude_worker(db) -> Worker:
    return worker(db, "claude-worker", [CLAUDE])


def legacy_pov_output(job: Job, worker_row: Worker) -> dict:
    """Full 7-card self-play payload (adversarial POV stays off here)."""
    pov = job.required_role
    return {
        "title": f"{pov} assessment",
        "content": f"A concise {pov} assessment based on the strongest reasoning.",
        "strongest_pro": {
            "title": f"{pov} strongest pro",
            "content": f"The strongest {pov} pro relies on the clearest evidence.",
            "pro": {"title": f"{pov} pro support", "content": f"Detail strengthening the {pov} pro."},
            "con": {"title": f"{pov} pro limitation", "content": f"Detail limiting the {pov} pro."},
        },
        "strongest_con": {
            "title": f"{pov} strongest con",
            "content": f"The strongest {pov} con identifies the most important risk.",
            "pro": {"title": f"{pov} con support", "content": f"Detail strengthening the {pov} con."},
            "con": {"title": f"{pov} con limitation", "content": f"Detail limiting the {pov} con."},
        },
        "provenance": {
            "model_id": job.required_model,
            "worker_id": worker_row.id,
            "prompt_id": f"prompt-{job.id}",
            "job_id": job.id,
        },
    }


def attacker_output(job: Job, worker_row: Worker) -> dict:
    """The single {title, content} card a v2_expand cross-exam job produces."""
    return {
        "title": "Decision-changing objection",
        "content": "The strongest objection that would change the decision if it holds.",
        "provenance": {
            "model_id": job.required_model,
            "worker_id": worker_row.id,
            "prompt_id": f"prompt-{job.id}",
            "job_id": job.id,
        },
    }


def make_debate(db, topic: str = TOPIC) -> Debate:
    return service.create_dialectical_debate(db, topic, {})


def branch_containers(db, debate: Debate) -> list[Node]:
    return list(
        db.scalars(
            select(Node)
            .where(
                Node.debate_id == debate.id,
                Node.parent_id == debate.root_node_id,
                Node.node_type != "EVIDENCE",
            )
            .order_by(Node.position.asc())
        ).all()
    )


def argument_children(db, parent_id: str) -> list[Node]:
    return list(
        db.scalars(
            select(Node)
            .where(Node.parent_id == parent_id, Node.node_type != "EVIDENCE")
            .order_by(Node.position)
        ).all()
    )


def all_expand_jobs(db, debate: Debate) -> list[Job]:
    return list(
        db.scalars(
            select(Job)
            .where(Job.debate_id == debate.id, Job.job_type == "v2_expand")
            .order_by(Job.created_at, Job.id)
        ).all()
    )


def wave_jobs(db, debate: Debate) -> list[Job]:
    return [
        job
        for job in all_expand_jobs(db, debate)
        if isinstance(job.payload, dict) and job.payload.get("cross_exam") is True
    ]


def synth_jobs(db, debate: Debate) -> list[Job]:
    return list(
        db.scalars(select(Job).where(Job.debate_id == debate.id, Job.job_type == "v2_synthesize")).all()
    )


def drain_all_povs(db, workers: list[Worker]) -> None:
    """Complete every pending v2_pov job across the given online workers
    (legacy 7-card contract; adversarial POV stays off for these tests). The
    LAST completion is the one that triggers queue_v2_synthesize_job -- and,
    with the flag on, the wave -- so this is the natural point to stop."""
    while True:
        pending = db.scalar(select(Job.id).where(Job.job_type == "v2_pov", Job.status == "pending").limit(1))
        if pending is None:
            break
        progressed = False
        for w in workers:
            job = claim_pending_job(db, w)
            if job is None:
                continue
            assert job.job_type == "v2_pov"
            asyncio.run(complete_job(db, job, legacy_pov_output(job, w), {"latency_ms": 5}))
            progressed = True
            break
        if not progressed:
            break


def complete_all_wave_jobs(db, debate: Debate, workers: list[Worker]) -> None:
    while True:
        pending_ids = {job.id for job in wave_jobs(db, debate) if job.status == "pending"}
        if not pending_ids:
            break
        progressed = False
        for w in workers:
            job = claim_pending_job(db, w)
            if job is None:
                continue
            assert job.job_type == "v2_expand" and job.id in pending_ids
            asyncio.run(complete_job(db, job, attacker_output(job, w), {"latency_ms": 5}))
            progressed = True
            break
        if not progressed:
            break


def _seed_scores(db, debate: Debate, node_strengths: list[tuple[Node, float]]) -> None:
    """Persist a node_scoring AnalyzerRun (real reducer payloads, matching
    Task 8's own _seed_tree_scoring pattern) covering exactly the given
    nodes -- lets a test control precisely which nodes read as "scored"
    (and at what strength) without running the real judge pipeline."""
    items = [
        _scoring_payload_for_node(node.id, node.claim or node.node_type, strength_override=strength)
        for node, strength in node_strengths
    ]
    branch = service.first_branch(db, debate.id)
    db.add(
        AnalyzerRun(
            debate_id=debate.id,
            branch_id=branch.id,
            analyzer_type=SCORING_ANALYZER_TYPE,
            output={"status": "available", "items": items},
            status="complete",
            provenance={"scoring_source": JUDGE_OUTPUT_SOURCE},
        )
    )
    db.commit()


# ---------------------------------------------------------------------------
# Flag OFF: byte-identical regression.
# ---------------------------------------------------------------------------


def test_flag_off_queues_no_wave_and_synthesis_is_queued_directly(db) -> None:
    g = gpt_worker(db)
    debate = make_debate(db)
    drain_all_povs(db, [g])
    assert wave_jobs(db, debate) == []
    assert all_expand_jobs(db, debate) == []
    queued = synth_jobs(db, debate)
    assert len(queued) == 1 and queued[0].status == "pending"


def test_zero_cap_disables_wave_even_with_flag_on(db, monkeypatch) -> None:
    monkeypatch.setenv(FLAG, "true")
    monkeypatch.setenv(CAP_ENV, "0")
    g = gpt_worker(db)
    debate = make_debate(db)
    drain_all_povs(db, [g])
    assert wave_jobs(db, debate) == []
    queued = synth_jobs(db, debate)
    assert len(queued) == 1 and queued[0].status == "pending"


# ---------------------------------------------------------------------------
# Flag ON -- the wave: one job per completed branch, holds synthesis.
# ---------------------------------------------------------------------------


def test_wave_queues_one_challenge_per_branch_and_holds_synthesis(db, monkeypatch) -> None:
    monkeypatch.setenv(FLAG, "true")
    g = gpt_worker(db)
    debate = make_debate(db)
    containers = branch_containers(db, debate)
    assert len(containers) == 4

    drain_all_povs(db, [g])

    jobs = wave_jobs(db, debate)
    assert len(jobs) == 4
    assert all(job.status == "pending" for job in jobs)
    assert all(job.payload["polarity"] == "CON" for job in jobs)
    assert all(job.payload["reason"] == CROSS_EXAM_REASON for job in jobs)
    assert all(job.payload["cross_exam"] is True for job in jobs)
    # Synthesis must NOT be queued while the wave is outstanding.
    assert synth_jobs(db, debate) == []
    # Directly: the EXISTING whole-tree quiescence check already treats the
    # wave's pending v2_expand jobs as blocking (v2_expand is in
    # V2_GENERATION_JOB_TYPES) -- this, not new gating logic, is what holds
    # synthesis while the wave is outstanding.
    pending = service.pending_generation_nodes(db, debate.id, debate.root_node_id)
    assert {n.id for n in pending} == {job.node_id for job in jobs}

    # Every branch is unscored -> each job targets that branch's
    # strongest_pro (position 0 PRO under the container) fallback.
    container_ids = {c.id for c in containers}
    targeted_parents = set()
    for job in jobs:
        child = db.get(Node, job.node_id)
        assert child.node_type == "CON"
        parent = db.get(Node, child.parent_id)
        assert parent.node_type == "PRO" and parent.position == 0
        assert parent.parent_id in container_ids
        targeted_parents.add(parent.parent_id)
    assert targeted_parents == container_ids

    # Completing every wave job then lets synthesis through.
    complete_all_wave_jobs(db, debate, [g])
    queued = synth_jobs(db, debate)
    assert len(queued) == 1 and queued[0].status == "pending"


# ---------------------------------------------------------------------------
# Flag ON -- attacker model selection (family helper reuse).
# ---------------------------------------------------------------------------


def test_wave_prefers_cross_family_attacker_with_reason_recorded(db, monkeypatch) -> None:
    monkeypatch.setenv(FLAG, "true")
    g = gpt_worker(db)
    debate = make_debate(db)  # single worker online -> every branch is gpt-authored
    # Bring a second-family worker online AFTER the pov jobs are queued: the
    # LAST pov completion (which triggers the wave) now sees a multi-family
    # pool, so every gpt-authored claim's cross-exam attacker is claude.
    claude_worker(db)
    drain_all_povs(db, [g])
    jobs = wave_jobs(db, debate)
    assert jobs
    for job in jobs:
        assert job.required_model == CLAUDE
        assert job.payload["cross_exam_attacker_reason"] == "cross_family"
        assert job.payload["cross_exam_author_model"] == GPT
        assert job.payload["cross_exam_attacker_model"] == CLAUDE


def test_wave_same_family_fallback_recorded_when_pool_single_family(db, monkeypatch) -> None:
    monkeypatch.setenv(FLAG, "true")
    g = gpt_worker(db)
    debate = make_debate(db)
    drain_all_povs(db, [g])
    jobs = wave_jobs(db, debate)
    assert jobs
    for job in jobs:
        assert job.required_model == GPT
        assert job.payload["cross_exam_attacker_reason"] == "same_family_fallback_single_family_pool"


# ---------------------------------------------------------------------------
# Flag ON -- strongest-claim selection, with and without scores.
# ---------------------------------------------------------------------------


def test_wave_picks_highest_scored_node_over_strongest_pro_when_branch_is_scored(db, monkeypatch) -> None:
    monkeypatch.setenv(FLAG, "true")
    g = gpt_worker(db)
    debate = make_debate(db)

    # Complete exactly one branch so its full 7-card subtree exists, then
    # seed scores so strongest_con reads stronger than strongest_pro.
    job = claim_pending_job(db, g)
    assert job is not None and job.job_type == "v2_pov"
    target_container = db.get(Node, job.node_id)
    asyncio.run(complete_job(db, job, legacy_pov_output(job, g), {"latency_ms": 5}))
    kids = argument_children(db, target_container.id)
    strongest_pro, strongest_con = kids[0], kids[1]
    assert strongest_pro.node_type == "PRO" and strongest_con.node_type == "CON"
    _seed_scores(db, debate, [(strongest_con, 0.95), (strongest_pro, 0.1)])

    drain_all_povs(db, [g])  # complete the remaining branches -> wave queues

    jobs = wave_jobs(db, debate)
    job_for_branch = next(j for j in jobs if j.payload["cross_exam_branch_container_id"] == target_container.id)
    child = db.get(Node, job_for_branch.node_id)
    assert child.parent_id == strongest_con.id


def test_wave_falls_back_to_strongest_pro_when_branch_unscored(db, monkeypatch) -> None:
    monkeypatch.setenv(FLAG, "true")
    g = gpt_worker(db)
    debate = make_debate(db)
    drain_all_povs(db, [g])
    jobs = wave_jobs(db, debate)
    for job in jobs:
        child = db.get(Node, job.node_id)
        parent = db.get(Node, child.parent_id)
        assert parent.node_type == "PRO" and parent.position == 0


# ---------------------------------------------------------------------------
# Flag ON -- cap honored, strongest branches first by root strength, ties by
# node id.
# ---------------------------------------------------------------------------


def test_wave_cap_honored_strongest_branches_first_ties_by_node_id(db, monkeypatch) -> None:
    monkeypatch.setenv(FLAG, "true")
    monkeypatch.setenv(CAP_ENV, "2")
    g = gpt_worker(db)
    debate = make_debate(db)
    containers = branch_containers(db, debate)
    assert len(containers) == 4
    # Only container[0] is scored (definitely rank 1); the other three tie at
    # the unscored fallback (0.0) -- the tie-break must be the lowest node id.
    _seed_scores(db, debate, [(containers[0], 0.9)])
    unscored = containers[1:]
    expected_tiebreak_winner = min(unscored, key=lambda n: n.id)
    losers = [n for n in unscored if n.id != expected_tiebreak_winner.id]

    drain_all_povs(db, [g])

    jobs = wave_jobs(db, debate)
    assert len(jobs) == 2
    picked_container_ids = {job.payload["cross_exam_branch_container_id"] for job in jobs}
    assert picked_container_ids == {containers[0].id, expected_tiebreak_winner.id}
    for loser in losers:
        assert loser.id not in picked_container_ids


# ---------------------------------------------------------------------------
# Persistence: normal v2_expand materialization + cross_exam provenance mark.
# ---------------------------------------------------------------------------


def test_cross_exam_completion_materializes_con_child_with_provenance_mark(db, monkeypatch) -> None:
    monkeypatch.setenv(FLAG, "true")
    g = gpt_worker(db)
    debate = make_debate(db)
    drain_all_povs(db, [g])
    job = claim_pending_job(db, g)
    assert job is not None and job.job_type == "v2_expand"
    parent_before = db.get(Node, job.node_id).parent_id

    asyncio.run(complete_job(db, job, attacker_output(job, g), {"latency_ms": 5}))

    db.refresh(job)
    child = db.get(Node, job.node_id)
    assert child.status == "complete"
    assert child.node_type == "CON"
    assert child.parent_id == parent_before
    assert child.claim == "Decision-changing objection"

    record = db.scalar(
        select(ProvenanceRecord).where(
            ProvenanceRecord.artifact_kind == "expand_node", ProvenanceRecord.artifact_id == child.id
        )
    )
    assert record is not None
    assert record.metadata_json.get("cross_exam") is True


def test_scoring_trigger_fires_after_cross_exam_materialization(db, monkeypatch) -> None:
    monkeypatch.setenv(FLAG, "true")
    monkeypatch.setenv("DIALECTICAL_SCORE_BEFORE_SYNTHESIS", "true")
    calls: list[str] = []
    monkeypatch.setattr(
        "app.services.dialectical_v2.trigger_internal_scoring_after_completion",
        lambda debate_id: calls.append(debate_id),
    )
    g = gpt_worker(db)
    debate = make_debate(db)
    drain_all_povs(db, [g])
    calls.clear()  # ignore the branch-completion triggers; assert the wave's own

    job = claim_pending_job(db, g)
    assert job is not None and job.job_type == "v2_expand"
    asyncio.run(complete_job(db, job, attacker_output(job, g), {"latency_ms": 5}))
    assert debate.id in calls


# ---------------------------------------------------------------------------
# Rescore affected: Task 3's children digest makes the parent's input hash
# change, forcing a genuine rejudge (not a stale cache hit).
# ---------------------------------------------------------------------------


def test_cross_exam_attack_child_forces_parent_rejudge_via_input_hash_change(db, monkeypatch) -> None:
    monkeypatch.setenv(FLAG, "true")
    g = gpt_worker(db)
    debate = make_debate(db)
    drain_all_povs(db, [g])
    job = claim_pending_job(db, g)
    assert job is not None and job.job_type == "v2_expand"
    attacked_claim_id = db.get(Node, job.node_id).parent_id

    class CapturingProvider:
        provider = "test-provider"
        model = "test-model"

        def __init__(self) -> None:
            self.requests = []

        def judge_node(self, request):
            self.requests.append(request)
            return ScoringProviderResult(
                provider=self.provider,
                model=self.model,
                raw_output=json.dumps(base_assessment(node_id=request.claim.node_id).model_dump(mode="json")),
                latency_ms=7,
                checked_at="2026-07-22T10:15:30+00:00",
            )

    provider = CapturingProvider()

    # 1) Score the attacked claim BEFORE the cross-exam child materializes.
    # queue_v2_expand_job creates the pending placeholder CHILD atomically at
    # QUEUE time (not at completion time), so it already counts as a child
    # for the judge's tree-aware payload -- with generic placeholder text and
    # no real content yet (_node_children_for_judge has no status filter).
    first = score_node_with_provider(db, debate, attacked_claim_id, provider)
    assert first["cache"]["hit"] is False
    assert len(provider.requests) == 1
    first_child_claims = [c.claim for c in provider.requests[0].children]
    assert any("Additional challenging argument" in claim for claim in first_child_claims)

    # Rescoring with nothing changed is a cache hit (no new provider call).
    unchanged = score_node_with_provider(db, debate, attacked_claim_id, provider)
    assert unchanged["cache"]["hit"] is True
    assert len(provider.requests) == 1

    # 2) The cross-exam attack materializes real content onto that SAME
    # child node (create_completed_node completes it in place).
    asyncio.run(complete_job(db, job, attacker_output(job, g), {"latency_ms": 5}))

    # 3) Rescoring the SAME claim after the attack lands is a genuine cache
    # MISS -- the judge now sees the attack's real content, not the
    # placeholder, so this is NOT a stale hit on the old (children-blind, or
    # here placeholder-blind) hash.
    rescored = score_node_with_provider(db, debate, attacked_claim_id, provider)
    assert rescored["cache"]["hit"] is False
    assert len(provider.requests) == 2
    second_child_claims = [c.claim for c in provider.requests[1].children]
    assert "Decision-changing objection" in second_child_claims
    assert second_child_claims != first_child_claims


# ---------------------------------------------------------------------------
# Failure posture: AUXILIARY terminal path, target claim stays complete,
# synthesis proceeds.
# ---------------------------------------------------------------------------


def test_cross_exam_ladder_exhaustion_is_auxiliary_not_node_degraded(db, monkeypatch) -> None:
    monkeypatch.setenv(FLAG, "true")
    g = gpt_worker(db)
    debate = make_debate(db)
    drain_all_povs(db, [g])
    job = wave_jobs(db, debate)[0]
    child = db.get(Node, job.node_id)
    parent = db.get(Node, child.parent_id)

    # Everyone tried -> failover finds no candidate -> terminal (mirrors
    # test_evidence_acquisition.py's own AUXILIARY test construction).
    job.status = "claimed"
    job.payload = {**(job.payload or {}), "tried_models": [job.required_model]}
    job.attempts = 8
    job.timeout_attempts = 8
    db.commit()

    events = terminalize_job_failure(db, job, "Cross-exam model exhausted")
    db.commit()
    db.refresh(job)
    db.refresh(child)
    db.refresh(parent)
    db.refresh(debate)

    assert job.status == "failed"
    # The attacked (healthy) claim is untouched -- stays complete.
    assert parent.status == "complete"
    # The fresh, never-generated placeholder is invisibly abandoned (not
    # publicly "failed") so it neither lingers as a ghost pending node nor
    # taxes the score-before-synthesis wait on a node that can never score.
    assert child.status == "stale"
    assert debate.status == "generating"
    # Verify both halves of that claim directly, not just by status value:
    # excluded from the "must be scored" live-argument-node set, and
    # invisible in the serialized tree (never a permanently-loading ghost).
    assert child.id not in {n.id for n in service.live_argument_nodes(db, debate.id)}

    def _flatten(node: dict) -> list[dict]:
        out = [node]
        for kid in node.get("children") or []:
            out.extend(_flatten(kid))
        return out

    serialized_ids = {n["id"] for n in _flatten(debate_to_dict(db, debate)["tree"])}
    assert child.id not in serialized_ids
    assert parent.id in serialized_ids

    event_names = {name for _, name, _ in events}
    assert "node_failed" not in event_names
    assert "debate_failed" not in event_names
    assert "cross_exam_unavailable" in event_names

    ledger = db.scalars(
        select(JobTransition).where(JobTransition.job_id == job.id, JobTransition.to_status == "failed")
    ).all()
    assert ledger, "terminal auxiliary failure must still record a job-ledger entry"


def test_cross_exam_full_wave_failure_still_lets_synthesis_proceed(db, monkeypatch) -> None:
    monkeypatch.setenv(FLAG, "true")
    monkeypatch.setenv("DIALECTICAL_MAX_JOB_ATTEMPTS", "1")
    g = gpt_worker(db)
    debate = make_debate(db)
    drain_all_povs(db, [g])
    jobs = wave_jobs(db, debate)
    assert jobs
    assert synth_jobs(db, debate) == []

    for _ in jobs:
        # fail_job(..., retryable=True) marks the worker "degraded" on the
        # way through (independent of whether its attempt budget is actually
        # exhausted) -- reconnect it before each claim, matching what a real
        # worker's next heartbeat would do.
        g.status = "online"
        db.commit()
        job = claim_pending_job(db, g)
        assert job is not None and job.job_type == "v2_expand"
        target = db.get(Node, job.node_id)
        parent = db.get(Node, target.parent_id)
        asyncio.run(fail_job(db, job, "cross-exam model exhausted", True))
        db.refresh(job)
        assert job.status == "failed"
        db.refresh(target)
        db.refresh(parent)
        assert parent.status == "complete"
        assert target.status == "stale"

    db.refresh(debate)
    assert debate.status != "failed"

    queued = synth_jobs(db, debate)
    assert len(queued) == 1 and queued[0].status == "pending"
    assert queued[0].required_model == V2_CODEX_MODEL_ID


def test_wave_runs_exactly_once_per_debate(db, monkeypatch) -> None:
    monkeypatch.setenv(FLAG, "true")
    g = gpt_worker(db)
    debate = make_debate(db)
    drain_all_povs(db, [g])
    first_wave = {job.id for job in wave_jobs(db, debate)}
    assert first_wave

    complete_all_wave_jobs(db, debate, [g])

    # Real synthesis queued; no second wave ever appears.
    queued = synth_jobs(db, debate)
    assert len(queued) == 1
    assert {job.id for job in wave_jobs(db, debate)} == first_wave


# ---------------------------------------------------------------------------
# Budget/ordering: the synthesis score-wait deferral applies unchanged after
# the wave resolves (resolution 6).
# ---------------------------------------------------------------------------


def test_deferral_still_applies_to_synthesis_queued_after_cross_exam_wave(db, monkeypatch) -> None:
    monkeypatch.setenv(FLAG, "true")
    monkeypatch.setenv("DIALECTICAL_SCORE_BEFORE_SYNTHESIS", "true")
    monkeypatch.setenv("DIALECTICAL_SYNTHESIS_SCORE_WAIT_SECONDS", "3600")
    g = gpt_worker(db)
    debate = make_debate(db)
    drain_all_povs(db, [g])
    complete_all_wave_jobs(db, debate, [g])

    queued = synth_jobs(db, debate)
    assert len(queued) == 1
    synth_job = queued[0]
    # Nothing in the tree has been scored -> the deferral gate must hold,
    # exactly as it would for any other v2_synthesize job (Task 8, unchanged
    # by cross-exam queueing it via the same seam).
    assert worker_can_claim_job(db, g, synth_job, now_utc()) is False
