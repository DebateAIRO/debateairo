"""Task 8 (P3.4 + P4.2): score-before-synthesis deferral, score-informed
synthesis prompt payload, and synthesizer rotation.

The v2_synthesize flags default OFF in the test baseline (see conftest.py);
each test here opts the relevant one back in via monkeypatch.setenv so it
exercises the production-default behavior in isolation.
"""
from __future__ import annotations

import asyncio
import inspect
import json
import threading
from datetime import timedelta

import pytest
from sqlalchemy import func, select

from app.models.entities import (
    AnalyzerRun,
    Debate,
    DebateBranch,
    Generation,
    Job,
    Node,
    Worker,
    now_utc,
)
from app.protocol.runner import run_protocol_analysis
from app.providers import AgentConfig, ProviderRegistry
from app.scoring import ScoringProviderResult, queue_scoring_job
from app.scoring.jobs import (
    drive_internal_scoring_for_debate,
    run_scoring_job_background,
    wake_pending_internal_scoring_job,
)
from app.scoring.lineage import lineage_family
from app.scoring.service import JUDGE_OUTPUT_SOURCE, SCORING_ANALYZER_TYPE
from app.services import dialectical_v2 as service
from app.services import orchestrator
from app.services.dialectical_v2 import V2_CODEX_MODEL_ID
from app.services.orchestrator import claim_pending_job, complete_job, worker_can_claim_job

from test_dialectical_v2 import real_codex_worker, worker_non_adjudicating_synthesis
from test_node_scoring import base_assessment
from test_protocol_runner import (
    _latest_protocol_analysis_run,
    _other_protocol_analysis_run,
    _scoring_payload_for_node,
)

CLAUDE = "claude-sonnet-5-high-loop"
GEMINI = "gemini-3.5-flash-loop"
GROK = "grok-4.5-high-loop"
TOPIC = "Should cities ban cars downtown?"


class _FakeJudgeProvider:
    """In-process judge that returns a valid ClaimAssessment for ANY node --
    including ROOT_CLAIM and POV containers -- so the real scoring pipeline
    yields items (never errors) for every live argument node."""

    provider = "codex"
    model = "codex-test-model"

    def judge_node(self, request):
        return ScoringProviderResult(
            provider=self.provider,
            model=self.model,
            raw_output=json.dumps(base_assessment(node_id=request.claim.node_id).model_dump(mode="json")),
            latency_ms=7,
            checked_at="2026-07-19T10:15:30+00:00",
        )


def _fake_judge_registry() -> ProviderRegistry:
    return ProviderRegistry(
        agents={"judge": AgentConfig(provider="codex", model="codex-test-model", temperature=0.0)},
        providers={"codex": _FakeJudgeProvider()},
    )


class _CountingJudgeProvider(_FakeJudgeProvider):
    """Fake judge that also records the node_id of every judge_node call, so a
    test can distinguish nodes actually (re)judged from nodes served by the
    NodeScoringResult input-hash cache."""

    def __init__(self) -> None:
        self.judged_node_ids: list[str] = []

    def judge_node(self, request):
        self.judged_node_ids.append(request.claim.node_id)
        return super().judge_node(request)


def _counting_judge_registry(provider: _CountingJudgeProvider):
    """A registry_factory bound to a SHARED counting provider, so its call log
    accumulates across the passes a single test drives."""

    def factory() -> ProviderRegistry:
        return ProviderRegistry(
            agents={"judge": AgentConfig(provider="codex", model="codex-test-model", temperature=0.0)},
            providers={"codex": provider},
        )

    return factory


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _online_worker(db, name: str, capabilities: list[str]) -> Worker:
    worker = Worker(
        name=name,
        token_hash="test-token",
        capabilities=capabilities,
        last_seen=now_utc(),
        status="online",
    )
    db.add(worker)
    db.commit()
    return worker


def _pov_output(worker: Worker, job: Job) -> dict:
    pov = job.required_role
    return {
        "title": f"{pov} assessment",
        "content": f"A concise {pov} assessment based on the strongest available reasoning.",
        "strongest_pro": {
            "title": f"{pov} strongest pro",
            "content": f"The strongest {pov} pro relies on the clearest relevant evidence.",
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
            "worker_id": worker.id,
            "prompt_id": f"prompt-{job.id}",
            "job_id": job.id,
        },
    }


def _complete_all_povs(db, debate: Debate, worker: Worker) -> None:
    """Claim + complete exactly the debate's pending v2_pov jobs, stopping
    before the queued v2_synthesize job is claimed."""
    n = int(
        db.scalar(
            select(func.count()).select_from(Job).where(
                Job.debate_id == debate.id, Job.job_type == "v2_pov"
            )
        )
        or 0
    )
    assert n > 0
    for _ in range(n):
        job = claim_pending_job(db, worker)
        assert job is not None and job.job_type == "v2_pov", job
        asyncio.run(complete_job(db, job, _pov_output(worker, job), {"latency_ms": 5}))


def _seed_tree_scoring(db, debate: Debate, *, node_ids: list[str] | None = None) -> None:
    """Persist a node_scoring AnalyzerRun (real reducer payloads) covering the
    given node ids (default: every live argument node)."""
    if node_ids is None:
        nodes = service.live_argument_nodes(db, debate.id)
    else:
        nodes = [db.get(Node, node_id) for node_id in node_ids]
    items = [_scoring_payload_for_node(node.id, node.claim or node.node_type) for node in nodes]
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


def _pending_synthesize_job(db, debate: Debate) -> Job | None:
    return db.scalar(
        select(Job).where(
            Job.debate_id == debate.id,
            Job.job_type == "v2_synthesize",
            Job.status == "pending",
        )
    )


def _bare_debate(db, topic: str = TOPIC) -> tuple[Debate, Node]:
    """A v2 debate skeleton (root + branch) with NO POV scaffolding, for
    precise per-node payload/rotation fixtures."""
    debate = Debate(topic=topic, status="generating", config={})
    db.add(debate)
    db.flush()
    root = Node(
        debate_id=debate.id,
        node_type="ROOT_CLAIM",
        depth=0,
        position=0,
        claim=topic,
        status="complete",
        materialized_path="/0",
    )
    db.add(root)
    db.flush()
    debate.root_node_id = root.id
    db.add(DebateBranch(debate_id=debate.id, root_node_id=root.id, status="active"))
    db.flush()
    return debate, root


def _add_node(
    db,
    debate: Debate,
    parent: Node,
    *,
    node_type: str,
    position: int,
    claim: str,
    status: str = "complete",
    model_id: str | None = None,
    worker_id: str | None = None,
    argument: str = "",
    stopping_reason: str | None = None,
) -> Node:
    node = Node(
        debate_id=debate.id,
        parent_id=parent.id,
        node_type=node_type,
        depth=parent.depth + 1,
        position=position,
        claim=claim,
        status=status,
        materialized_path=f"{parent.materialized_path}/{position}",
        stopping_reason=stopping_reason,
    )
    db.add(node)
    db.flush()
    if model_id is not None and worker_id is not None:
        generation = Generation(
            node_id=node.id,
            model_id=model_id,
            role=node_type,
            argument=argument,
            is_active=True,
            worker_id=worker_id,
        )
        db.add(generation)
        db.flush()
        node.active_generation_id = generation.id
        db.flush()
    return node


# ---------------------------------------------------------------------------
# Bounded synthesis deferral (claim eligibility)
# ---------------------------------------------------------------------------


def test_synthesis_not_claimable_while_live_nodes_unscored_within_budget(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_SCORE_BEFORE_SYNTHESIS", "true")
    worker = real_codex_worker(db)
    debate = service.create_dialectical_debate(db, TOPIC, {})
    _complete_all_povs(db, debate, worker)

    # Synthesis is queued, but scoring never ran (autouse stub) so no live node
    # has a scoring result -> the pending synthesize job is not claimable yet.
    assert _pending_synthesize_job(db, debate) is not None
    assert claim_pending_job(db, worker) is None

    still_pending = _pending_synthesize_job(db, debate)
    assert still_pending is not None
    assert still_pending.attempts == 0  # skipped, not a burned attempt


def test_synthesis_claimable_once_all_live_nodes_scored(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_SCORE_BEFORE_SYNTHESIS", "true")
    worker = real_codex_worker(db)
    debate = service.create_dialectical_debate(db, TOPIC, {})
    _complete_all_povs(db, debate, worker)

    _seed_tree_scoring(db, debate)  # every live argument node now scored

    claimed = claim_pending_job(db, worker)
    assert claimed is not None and claimed.job_type == "v2_synthesize"


def test_synthesis_claimable_after_budget_expiry_with_partial_scores(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_SCORE_BEFORE_SYNTHESIS", "true")
    monkeypatch.setenv("DIALECTICAL_SYNTHESIS_SCORE_WAIT_SECONDS", "0")  # no wait budget
    worker = real_codex_worker(db)
    debate = service.create_dialectical_debate(db, TOPIC, {})
    _complete_all_povs(db, debate, worker)

    # No scoring at all (fully partial), but the wait budget is exhausted, so
    # synthesis proceeds rather than wedging.
    claimed = claim_pending_job(db, worker)
    assert claimed is not None and claimed.job_type == "v2_synthesize"


def test_synthesis_immediately_claimable_when_flag_off(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_SCORE_BEFORE_SYNTHESIS", "false")
    worker = real_codex_worker(db)
    debate = service.create_dialectical_debate(db, TOPIC, {})
    _complete_all_povs(db, debate, worker)

    claimed = claim_pending_job(db, worker)
    assert claimed is not None and claimed.job_type == "v2_synthesize"


def test_real_scoring_pipeline_opens_deferral_gate_before_budget(db, monkeypatch) -> None:
    """End-to-end: the REAL scoring path (fake judge, whole debate) must yield
    items -- not errors -- for ROOT_CLAIM and POV-container nodes, so
    condition (a) (all live argument nodes scored) opens the deferral gate
    WITHOUT waiting out the budget. Uses run_scoring_job_background (the actual
    pipeline the deferral checks against), not hand-seeded scoring items."""
    monkeypatch.setenv("DIALECTICAL_SCORE_BEFORE_SYNTHESIS", "true")
    monkeypatch.setenv("DIALECTICAL_SYNTHESIS_SCORE_WAIT_SECONDS", "3600")  # far from expiry
    worker = real_codex_worker(db)
    debate = service.create_dialectical_debate(db, TOPIC, {})
    _complete_all_povs(db, debate, worker)  # root + POV containers + PRO/CON tree

    synth = _pending_synthesize_job(db, debate)
    assert synth is not None
    # Gate CLOSED before scoring: nothing scored, budget nowhere near expiry.
    assert service.all_live_argument_nodes_scored(db, debate) is False
    assert worker_can_claim_job(db, worker, synth, now_utc()) is False

    # Run the REAL scoring pipeline over the whole debate with the fake judge.
    scoring_job = queue_scoring_job(db, debate, model_id="codex-test-model")
    db.commit()
    run_scoring_job_background(scoring_job.id, debate.id, registry_factory=_fake_judge_registry)
    db.expire_all()

    # The real path produced a scoring item for every live argument node --
    # ROOT_CLAIM and the POV containers included -> condition (a) opens the gate
    # long before the 3600s budget could have expired.
    assert service.all_live_argument_nodes_scored(db, debate) is True
    synth = _pending_synthesize_job(db, debate)
    assert synth is not None
    assert worker_can_claim_job(db, worker, synth, now_utc()) is True


# ---------------------------------------------------------------------------
# Incremental scoring trigger at branch completion
# ---------------------------------------------------------------------------


def test_branch_completion_triggers_scoring_when_enabled(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_SCORE_BEFORE_SYNTHESIS", "true")
    calls: list[str] = []
    monkeypatch.setattr(
        "app.services.dialectical_v2.trigger_internal_scoring_after_completion",
        lambda debate_id: calls.append(debate_id),
    )
    worker = real_codex_worker(db)
    debate = service.create_dialectical_debate(db, TOPIC, {})

    job = claim_pending_job(db, worker)
    assert job is not None and job.job_type == "v2_pov"
    asyncio.run(complete_job(db, job, _pov_output(worker, job), {"latency_ms": 5}))

    assert calls == [debate.id]  # fired on this branch completion


def test_branch_completion_does_not_trigger_scoring_when_flag_off(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_SCORE_BEFORE_SYNTHESIS", "false")
    calls: list[str] = []
    monkeypatch.setattr(
        "app.services.dialectical_v2.trigger_internal_scoring_after_completion",
        lambda debate_id: calls.append(debate_id),
    )
    worker = real_codex_worker(db)
    debate = service.create_dialectical_debate(db, TOPIC, {})

    job = claim_pending_job(db, worker)
    assert job is not None and job.job_type == "v2_pov"
    asyncio.run(complete_job(db, job, _pov_output(worker, job), {"latency_ms": 5}))

    assert calls == []


# ---------------------------------------------------------------------------
# Cold-start incremental scoring (soak fix A / P3.4 regression)
# ---------------------------------------------------------------------------


class _MinimalTasks:
    """BackgroundTasks stand-in for direct wake calls: records add_task calls."""

    def __init__(self) -> None:
        self.added: list[tuple] = []

    def add_task(self, func, *args) -> None:
        self.added.append((func, args))


def _score_debate_job_count(db, debate: Debate) -> int:
    return int(
        db.scalar(
            select(func.count()).select_from(Job).where(
                Job.debate_id == debate.id, Job.job_type == "score_debate"
            )
        )
        or 0
    )


def test_drive_cold_starts_scoring_when_no_job_exists(db) -> None:
    """A fresh debate mid-generation has NO score_debate job. The internal
    completion driver must be able to create the FIRST one (cold-start), claim
    it, and run it -- not silently no-op like the browser-poll waker does."""
    worker = real_codex_worker(db)
    debate = service.create_dialectical_debate(db, TOPIC, {})
    _complete_all_povs(db, debate, worker)  # live nodes; autouse stub => no scoring job

    assert _score_debate_job_count(db, debate) == 0
    assert service.all_live_argument_nodes_scored(db, debate) is False

    job_id = drive_internal_scoring_for_debate(
        debate.id,
        registry_factory=_fake_judge_registry,
        background_runner=lambda job_id, d_id: run_scoring_job_background(
            job_id, d_id, registry_factory=_fake_judge_registry
        ),
    )

    assert job_id is not None
    db.expire_all()
    created = db.get(Job, job_id)
    assert created is not None and created.job_type == "score_debate"
    assert created.status == "complete"  # created, claimed, AND run
    scoring_runs = db.scalars(
        select(AnalyzerRun).where(
            AnalyzerRun.debate_id == debate.id,
            AnalyzerRun.analyzer_type == SCORING_ANALYZER_TYPE,
        )
    ).all()
    assert len(scoring_runs) == 1  # scoring items persisted
    assert service.all_live_argument_nodes_scored(db, debate) is True


def test_wake_without_create_if_missing_stays_noop_without_jobs(db) -> None:
    """Regression guard: the browser-poll waker (default create_if_missing
    False) must NOT create the first scoring job -- it only ever wakes an
    existing pending/stale one. Byte-identical to pre-fix behavior."""
    worker = real_codex_worker(db)
    debate = service.create_dialectical_debate(db, TOPIC, {})
    _complete_all_povs(db, debate, worker)
    assert _score_debate_job_count(db, debate) == 0

    tasks = _MinimalTasks()
    result = wake_pending_internal_scoring_job(
        db, debate, tasks, registry_factory=_fake_judge_registry
    )

    assert result is None
    assert tasks.added == []
    assert _score_debate_job_count(db, debate) == 0  # nothing created


def test_v2_pov_completion_cold_starts_scoring_and_opens_gate(db, monkeypatch) -> None:
    """End-to-end fast-path: with DIALECTICAL_SCORE_BEFORE_SYNTHESIS on, a REAL
    v2_pov branch completion drives cold-start scoring (real completion path,
    fake judge in the trigger thread) so a scoring job exists BEFORE the debate
    completes, and -- once the passes run -- condition (a) opens the synthesis
    deferral gate WITHOUT waiting out the wait budget."""
    monkeypatch.setenv("DIALECTICAL_SCORE_BEFORE_SYNTHESIS", "true")
    monkeypatch.setenv("DIALECTICAL_SYNTHESIS_SCORE_WAIT_SECONDS", "3600")  # far from expiry
    threads: list[threading.Thread] = []

    def _thread_trigger(debate_id: str) -> threading.Thread:
        # Mirror the real trigger's daemon-thread hop, but drive with the
        # in-process fake judge (there is no real judge CLI in tests). Returns
        # the started Thread so the test can join it deterministically.
        def _run() -> None:
            drive_internal_scoring_for_debate(
                debate_id,
                registry_factory=_fake_judge_registry,
                background_runner=lambda job_id, d_id: run_scoring_job_background(
                    job_id, d_id, registry_factory=_fake_judge_registry
                ),
            )

        thread = threading.Thread(target=_run, name=f"test-scoring-{debate_id}", daemon=True)
        thread.start()
        threads.append(thread)
        return thread

    monkeypatch.setattr(
        "app.services.dialectical_v2.trigger_internal_scoring_after_completion",
        _thread_trigger,
    )

    worker = real_codex_worker(db)
    debate = service.create_dialectical_debate(db, TOPIC, {})

    # Complete POVs one at a time, joining each completion's trigger thread
    # before the next: exercises the real Thread hop while keeping the SQLite
    # writers serialized (deterministic).
    n = int(
        db.scalar(
            select(func.count()).select_from(Job).where(
                Job.debate_id == debate.id, Job.job_type == "v2_pov"
            )
        )
        or 0
    )
    assert n > 0
    scored_before_completion = False
    for _ in range(n):
        job = claim_pending_job(db, worker)
        assert job is not None and job.job_type == "v2_pov", job
        asyncio.run(complete_job(db, job, _pov_output(worker, job), {"latency_ms": 5}))
        for thread in list(threads):
            thread.join(timeout=15)
            assert not thread.is_alive()
        db.expire_all()
        if _score_debate_job_count(db, debate) > 0:
            scored_before_completion = True

    assert scored_before_completion  # a scoring job was cold-started mid-generation
    db.refresh(debate)
    assert debate.status != "complete"  # synthesis still pending, debate not done

    # The passes scored every live argument node -> condition (a) opens the
    # deferral gate long before the 3600s budget could have expired.
    assert service.all_live_argument_nodes_scored(db, debate) is True
    synth = _pending_synthesize_job(db, debate)
    assert synth is not None
    assert worker_can_claim_job(db, worker, synth, now_utc()) is True


# ---------------------------------------------------------------------------
# Cold-start idempotency: never double-create a concurrent scoring pass
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("in_flight_status", ["claimed", "running"])
def test_drive_does_not_double_create_while_pass_in_flight(db, in_flight_status: str) -> None:
    """A trigger firing while a scoring pass is already claimed/running must NOT
    cold-start a second one -- the pending-only find misses an in-flight job, so
    the active-job guard must catch it."""
    worker = real_codex_worker(db)
    debate = service.create_dialectical_debate(db, TOPIC, {})
    _complete_all_povs(db, debate, worker)
    in_flight = queue_scoring_job(db, debate, model_id="codex-test-model")
    in_flight.status = in_flight_status
    in_flight.deadline = now_utc() + timedelta(seconds=600)
    db.commit()
    ran: list[str] = []

    result = drive_internal_scoring_for_debate(
        debate.id,
        registry_factory=_fake_judge_registry,
        background_runner=lambda job_id, d_id: ran.append(job_id),
    )

    assert result is None  # in-flight pass -> cold-start suppressed
    assert ran == []
    db.expire_all()
    jobs = db.scalars(
        select(Job).where(Job.debate_id == debate.id, Job.job_type == "score_debate")
    ).all()
    assert len(jobs) == 1 and jobs[0].id == in_flight.id  # no duplicate row


def test_concurrent_cold_start_creates_exactly_one_scoring_job(db) -> None:
    """Two genuinely concurrent cold-start triggers (barrier-released) must
    create exactly ONE score_debate row -- the write lock + fresh-snapshot read
    make the check-then-create atomic, so the loser sees the winner's claimed
    job and creates nothing."""
    worker = real_codex_worker(db)
    debate = service.create_dialectical_debate(db, TOPIC, {})
    _complete_all_povs(db, debate, worker)
    assert _score_debate_job_count(db, debate) == 0

    barrier = threading.Barrier(2)
    ran: list[str] = []
    ran_lock = threading.Lock()

    def _record(job_id: str, _debate_id: str) -> None:
        with ran_lock:
            ran.append(job_id)

    def _drive() -> None:
        barrier.wait()  # release both threads into the wake at once
        drive_internal_scoring_for_debate(
            debate.id,
            registry_factory=_fake_judge_registry,
            background_runner=_record,
        )

    threads = [threading.Thread(target=_drive, daemon=True) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=15)
        assert not thread.is_alive()

    db.expire_all()
    jobs = db.scalars(
        select(Job).where(Job.debate_id == debate.id, Job.job_type == "score_debate")
    ).all()
    assert len(jobs) == 1  # exactly one row despite the concurrent double-trigger
    assert ran == [jobs[0].id]  # only the winner ran; the loser cold-started nothing


# ---------------------------------------------------------------------------
# Incremental passes use the input-hash cache; explicit refresh forces
# ---------------------------------------------------------------------------


def _incremental_runner_for(factory):
    def _run(job_id: str, debate_id: str) -> None:
        run_scoring_job_background(job_id, debate_id, registry_factory=factory, force_refresh=False)

    return _run


def test_internal_drive_default_runner_uses_cache_not_force_refresh(db, monkeypatch) -> None:
    """The internal completion/incremental drive's DEFAULT background runner
    threads force_refresh=False, so incremental passes ride the cache instead of
    fully re-judging every node on every branch-completion trigger."""
    from app.scoring import jobs as scoring_jobs

    default_runner = (
        inspect.signature(scoring_jobs.drive_internal_scoring_for_debate)
        .parameters["background_runner"]
        .default
    )
    captured: dict = {}
    monkeypatch.setattr(
        scoring_jobs,
        "run_scoring_job_background",
        lambda job_id, debate_id, *, force_refresh=True, **kw: captured.update(force_refresh=force_refresh),
    )

    default_runner("job-x", "debate-y")

    assert captured.get("force_refresh") is False


def test_incremental_pass_serves_unchanged_nodes_from_cache(db) -> None:
    worker = real_codex_worker(db)
    debate = service.create_dialectical_debate(db, TOPIC, {})
    _complete_all_povs(db, debate, worker)
    provider = _CountingJudgeProvider()
    factory = _counting_judge_registry(provider)
    runner = _incremental_runner_for(factory)

    drive_internal_scoring_for_debate(debate.id, registry_factory=factory, background_runner=runner)
    assert provider.judged_node_ids  # first pass judged the live nodes
    assert service.all_live_argument_nodes_scored(db, debate) is True

    provider.judged_node_ids.clear()
    drive_internal_scoring_for_debate(debate.id, registry_factory=factory, background_runner=runner)
    assert provider.judged_node_ids == []  # nothing changed -> every node served from cache


def test_incremental_pass_rejudges_new_node_but_not_unchanged_siblings(db) -> None:
    worker = real_codex_worker(db)
    debate = service.create_dialectical_debate(db, TOPIC, {})
    _complete_all_povs(db, debate, worker)
    provider = _CountingJudgeProvider()
    factory = _counting_judge_registry(provider)
    runner = _incremental_runner_for(factory)

    drive_internal_scoring_for_debate(debate.id, registry_factory=factory, background_runner=runner)
    full_pass_count = len(provider.judged_node_ids)
    assert full_pass_count > 1

    # A new attack child appears under an existing live argument node.
    parent = service.live_argument_nodes(db, debate.id)[0]
    new_child = _add_node(db, debate, parent, node_type="CON", position=99, claim="A fresh counter-argument.")
    db.commit()

    provider.judged_node_ids.clear()
    drive_internal_scoring_for_debate(debate.id, registry_factory=factory, background_runner=runner)

    assert new_child.id in provider.judged_node_ids  # the new node IS judged
    # ...but this is an INCREMENTAL pass: unchanged subtrees are cache hits, so
    # far fewer than a full re-judge.
    assert len(provider.judged_node_ids) < full_pass_count


def test_explicit_scoring_pass_forces_rejudge_despite_warm_cache(db) -> None:
    """The explicit user-facing POST start endpoint (run_scoring_job_background's
    default force_refresh=True) re-judges every node even when the cache is warm
    and nothing changed. (Task 22 Fix B moved the browser-poll wake to
    force_refresh=False so a retry RESUMES from cache instead of restarting.)"""
    worker = real_codex_worker(db)
    debate = service.create_dialectical_debate(db, TOPIC, {})
    _complete_all_povs(db, debate, worker)
    provider = _CountingJudgeProvider()
    factory = _counting_judge_registry(provider)

    # Warm the cache with an incremental (force_refresh=False) pass.
    job1 = queue_scoring_job(db, debate, model_id="codex-test-model")
    db.commit()
    run_scoring_job_background(job1.id, debate.id, registry_factory=factory, force_refresh=False)
    full_count = len(provider.judged_node_ids)
    assert full_count > 0

    provider.judged_node_ids.clear()
    job2 = queue_scoring_job(db, debate, model_id="codex-test-model")
    db.commit()
    run_scoring_job_background(job2.id, debate.id, registry_factory=factory)  # default force_refresh=True

    assert len(provider.judged_node_ids) == full_count  # cache bypassed: full re-judge


# ---------------------------------------------------------------------------
# Score-informed synthesis prompt payload
# ---------------------------------------------------------------------------


def test_failure_manifest_surfaces_dead_perspective_with_tried_models(db) -> None:
    debate, root = _bare_debate(db)
    dead = _add_node(
        db,
        debate,
        root,
        node_type="STATISTICAL_POV",
        position=1,
        claim="Statistical POV",
        status="failed",
        stopping_reason="generation_exhausted",
    )
    db.add(
        Job(
            debate_id=debate.id,
            node_id=dead.id,
            job_type="v2_pov",
            required_role="Statistical POV",
            required_model=GROK,
            status="failed",
            payload={"tried_models": [V2_CODEX_MODEL_ID, CLAUDE]},
        )
    )
    db.commit()

    manifest = service._synthesis_failure_manifest(db, debate)
    assert manifest["died_count"] == 1
    perspective = manifest["perspectives"][0]
    assert perspective["node_id"] == dead.id
    assert perspective["label"] == "Statistical POV"
    # tried_models = job.payload["tried_models"] + the last required_model.
    assert perspective["tried_models"] == [V2_CODEX_MODEL_ID, CLAUDE, GROK]
    assert perspective["stopping_reason"] == "generation_exhausted"


def test_node_scores_honest_partial_signal_for_scored_and_unscored(db) -> None:
    debate, root = _bare_debate(db)
    scored = _add_node(db, debate, root, node_type="SCIENTIFIC_POV", position=0, claim="Scientific POV")
    unscored = _add_node(db, debate, root, node_type="ETHICAL_POV", position=2, claim="Ethical POV")
    db.commit()

    _seed_tree_scoring(db, debate, node_ids=[scored.id])  # only one node judged

    node_scores = service._synthesis_node_scores(db, debate)
    by_id = {entry["node_id"]: entry for entry in node_scores["nodes"]}

    assert by_id[scored.id]["scored"] is True
    assert isinstance(by_id[scored.id]["strength"], (int, float))
    assert by_id[scored.id]["strength_kind"] in {"argument_only", "evidence_weighted"}
    assert by_id[scored.id]["uncertainty_source"] in {"dispersion", "heuristic"}
    assert isinstance(by_id[scored.id]["uncertainty_drivers"], list)
    assert len(by_id[scored.id]["uncertainty_drivers"]) <= 3

    assert by_id[unscored.id]["scored"] is False
    assert by_id[unscored.id]["reason"]

    # root + scored + unscored are all live argument nodes; one is scored.
    assert node_scores["live_argument_node_count"] == 3
    assert node_scores["scored_node_count"] == 1
    assert node_scores["reason"]  # honest partial signal


def test_verification_statuses_honest_when_no_protocol_run(db) -> None:
    debate, root = _bare_debate(db)
    _add_node(db, debate, root, node_type="SCIENTIFIC_POV", position=0, claim="Scientific POV")
    db.commit()

    verification = service._synthesis_verification_statuses(db, debate)
    assert verification["available"] is False
    assert verification["reason"]
    assert verification["statuses"] == []


def test_verification_statuses_read_from_protocol_rollup(db) -> None:
    debate, root = _bare_debate(db)
    pro = _add_node(db, debate, root, node_type="PRO", position=0, claim="Downtown bans cut congestion.")
    con = _add_node(db, debate, root, node_type="CON", position=1, claim="Bans burden delivery access.")
    db.commit()
    _seed_tree_scoring(db, debate)
    run_protocol_analysis(db, debate)

    verification = service._synthesis_verification_statuses(db, debate)
    assert verification["available"] is True
    node_ids = {entry["node_id"] for entry in verification["statuses"]}
    assert pro.id in node_ids and con.id in node_ids
    assert all("status" in entry and "source" in entry for entry in verification["statuses"])


def test_unresolved_attacks_flags_con_child_at_least_as_strong(db) -> None:
    debate, root = _bare_debate(db)
    parent = _add_node(db, debate, root, node_type="PRO", position=0, claim="Bans help downtown.")
    attacker = _add_node(db, debate, parent, node_type="CON", position=1, claim="But access suffers.")
    supporter = _add_node(db, debate, parent, node_type="PRO", position=0, claim="And air quality improves.")
    items = [
        _scoring_payload_for_node(parent.id, parent.claim, strength_override=0.4),
        _scoring_payload_for_node(attacker.id, attacker.claim, strength_override=0.7),
        _scoring_payload_for_node(supporter.id, supporter.claim, strength_override=0.9),
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

    unresolved = service._synthesis_unresolved_attacks(db, debate)
    assert "definition" in unresolved
    by_id = {entry["node_id"]: entry for entry in unresolved["nodes"]}
    assert parent.id in by_id
    entry = by_id[parent.id]
    # The PRO supporter is not an attack; only the CON attacker counts, and it
    # is at least as strong as the parent (0.7 >= 0.4) -> unresolved.
    assert entry["attack_child_count"] == 1
    assert entry["unresolved_attack_ids"] == [attacker.id]
    assert entry["unresolved_attack_count"] == 1


def test_unresolved_attacks_counts_all_when_parent_unscored(db) -> None:
    debate, root = _bare_debate(db)
    parent = _add_node(db, debate, root, node_type="PRO", position=0, claim="Bans help downtown.")
    attacker = _add_node(db, debate, parent, node_type="CON", position=1, claim="But access suffers.")
    db.commit()
    _seed_tree_scoring(db, debate, node_ids=[attacker.id])  # parent left unscored

    unresolved = service._synthesis_unresolved_attacks(db, debate)
    by_id = {entry["node_id"]: entry for entry in unresolved["nodes"]}
    assert by_id[parent.id]["unresolved_attack_ids"] == [attacker.id]


def test_synthesize_prompt_includes_measured_standing_and_keeps_no_winner(db) -> None:
    worker = real_codex_worker(db)
    debate = service.create_dialectical_debate(db, TOPIC, {})
    _complete_all_povs(db, debate, worker)
    _seed_tree_scoring(db, debate)
    run_protocol_analysis(db, debate)

    synth = _pending_synthesize_job(db, debate)
    assert synth is not None
    _system, user = service.render_v2_job_prompt(db, synth)

    assert "Do not declare a winner" in user  # dissent contract preserved
    assert "Ground the synthesis in the measured_standing" in user
    for key in ("measured_standing", "node_scores", "verification_statuses", "unresolved_attacks", "failure_manifest"):
        assert key in user


# ---------------------------------------------------------------------------
# Synthesizer rotation
# ---------------------------------------------------------------------------


def test_majority_author_family_from_completed_branches(db) -> None:
    author = _online_worker(db, "codex-worker", [V2_CODEX_MODEL_ID])
    debate, root = _bare_debate(db)
    _add_node(db, debate, root, node_type="SCIENTIFIC_POV", position=0, claim="A", model_id=V2_CODEX_MODEL_ID, worker_id=author.id)
    _add_node(db, debate, root, node_type="STATISTICAL_POV", position=1, claim="B", model_id=CLAUDE, worker_id=author.id)
    _add_node(db, debate, root, node_type="ETHICAL_POV", position=2, claim="C", model_id=V2_CODEX_MODEL_ID, worker_id=author.id)
    # An INCOMPLETE branch authored by a third family must not count.
    _add_node(db, debate, root, node_type="PRACTICAL_POV", position=3, claim="D", status="pending", model_id=GEMINI, worker_id=author.id)
    db.commit()

    assert service._majority_author_family(db, debate) == "gpt"


def test_rotation_disabled_pins_anchor_with_reason(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_SYNTHESIZER_ROTATION", "false")
    author = _online_worker(db, "codex-worker", [V2_CODEX_MODEL_ID])
    _online_worker(db, "claude-loop", [CLAUDE])
    debate, root = _bare_debate(db)
    _add_node(db, debate, root, node_type="SCIENTIFIC_POV", position=0, claim="A", model_id=V2_CODEX_MODEL_ID, worker_id=author.id)
    db.commit()

    model, provenance = service.choose_synthesizer_model(db, debate)
    assert model == V2_CODEX_MODEL_ID
    assert provenance["rotation_reason"] == "rotation_disabled"
    assert provenance["chosen_model"] == V2_CODEX_MODEL_ID
    assert provenance["family"] == "gpt"


def test_rotation_prefers_different_family_when_online(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_SYNTHESIZER_ROTATION", "true")
    author = _online_worker(db, "codex-worker", [V2_CODEX_MODEL_ID])
    _online_worker(db, "claude-loop", [CLAUDE])
    debate, root = _bare_debate(db)
    # Majority author family = gpt (2 of 3 completed branches).
    _add_node(db, debate, root, node_type="SCIENTIFIC_POV", position=0, claim="A", model_id=V2_CODEX_MODEL_ID, worker_id=author.id)
    _add_node(db, debate, root, node_type="STATISTICAL_POV", position=1, claim="B", model_id=V2_CODEX_MODEL_ID, worker_id=author.id)
    _add_node(db, debate, root, node_type="ETHICAL_POV", position=2, claim="C", model_id=CLAUDE, worker_id=author.id)
    db.commit()

    model, provenance = service.choose_synthesizer_model(db, debate)
    assert provenance["author_family_majority"] == "gpt"
    assert provenance["rotation_reason"] == "rotated_off_author_family"
    assert model == CLAUDE  # only non-anchor family online
    assert model != V2_CODEX_MODEL_ID
    assert lineage_family(model) != provenance["author_family_majority"]


def test_rotation_anchor_fallback_when_pool_single_family(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_SYNTHESIZER_ROTATION", "true")
    author = _online_worker(db, "codex-worker", [V2_CODEX_MODEL_ID])  # only gpt online
    debate, root = _bare_debate(db)
    _add_node(db, debate, root, node_type="SCIENTIFIC_POV", position=0, claim="A", model_id=V2_CODEX_MODEL_ID, worker_id=author.id)
    db.commit()

    model, provenance = service.choose_synthesizer_model(db, debate)
    assert model == V2_CODEX_MODEL_ID
    assert provenance["rotation_reason"] == "anchor_fallback"
    assert provenance["author_family_majority"] == "gpt"


def test_synthesis_job_rotates_off_author_family_end_to_end(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_SYNTHESIZER_ROTATION", "true")
    monkeypatch.setenv("DIALECTICAL_DYNAMIC_PERSPECTIVES", "true")  # 5 lenses -> gpt clear majority
    # One real worker advertising two families -> pool is [anchor, claude].
    worker = _online_worker(db, "codex-worker", [V2_CODEX_MODEL_ID, CLAUDE])
    debate = service.create_dialectical_debate(db, TOPIC, {})
    _complete_all_povs(db, debate, worker)

    synth = _pending_synthesize_job(db, debate)
    assert synth is not None
    rotation = synth.payload["synthesizer_rotation"]
    assert rotation["author_family_majority"] == "gpt"
    assert rotation["rotation_reason"] == "rotated_off_author_family"
    assert synth.required_model == CLAUDE
    assert synth.required_model == rotation["chosen_model"]
    assert synth.required_model != V2_CODEX_MODEL_ID


def test_synthesis_provenance_records_rotation_end_to_end(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_SYNTHESIZER_ROTATION", "false")
    worker = real_codex_worker(db)
    debate = service.create_dialectical_debate(db, TOPIC, {})
    _complete_all_povs(db, debate, worker)

    synth = claim_pending_job(db, worker)
    assert synth is not None and synth.job_type == "v2_synthesize"
    asyncio.run(complete_job(db, synth, worker_non_adjudicating_synthesis(worker, synth.id), {"latency_ms": 5}))

    db.refresh(debate)
    from app.models.entities import Synthesis

    synthesis = db.scalar(select(Synthesis).where(Synthesis.debate_id == debate.id))
    assert synthesis is not None
    rotation = synthesis.provenance["synthesizer_rotation"]
    assert rotation["rotation_reason"] == "rotation_disabled"
    assert rotation["chosen_model"] == V2_CODEX_MODEL_ID


def test_synthesize_is_queued_only_through_the_shared_helper() -> None:
    source = inspect.getsource(service)
    # The anchor/model queue_v2_job call for synthesis exists exactly once --
    # inside queue_v2_synthesize_job -- so all four completion tails route
    # through the single selection+rotation helper (never copied).
    assert source.count('queue_v2_job(db, debate, "v2_synthesize"') == 1
    assert source.count('"v2_synthesize", "v2_synthesizer"') == 1
    helper_source = inspect.getsource(service.queue_v2_synthesize_job)
    assert 'queue_v2_job(db, debate, "v2_synthesize"' in helper_source

    # Task 15 fix: orchestrator._queue_synthesis_after_branch_failure used to
    # queue v2_synthesize directly (bypassing rotation AND, once it existed,
    # the P3.3 cross-exam wave) whenever synthesis became reachable via a
    # branch's terminal failure rather than a completion tail's success --
    # the dialectical_v2-only source scan above could never catch that.
    # Guard it directly so any FUTURE direct v2_synthesize queueing anywhere
    # in orchestrator.py fails this test too.
    orchestrator_source = inspect.getsource(orchestrator)
    assert 'queue_v2_job(db, debate, "v2_synthesize"' not in orchestrator_source
    assert '"v2_synthesize", "v2_synthesizer"' not in orchestrator_source


# ---------------------------------------------------------------------------
# Convergence compares like with like (resolution 6)
# ---------------------------------------------------------------------------


def test_convergence_compares_like_with_like_when_scoring_precedes_synthesis(db) -> None:
    worker = real_codex_worker(db)
    debate = service.create_dialectical_debate(db, TOPIC, {})
    _complete_all_povs(db, debate, worker)

    # New flow: scoring precedes synthesis. Seed judge scores, then run the
    # pre-synthesis protocol analysis (the post-scoring predecessor).
    _seed_tree_scoring(db, debate)
    run_protocol_analysis(db, debate)
    predecessor = _latest_protocol_analysis_run(db, debate.id)
    assert predecessor.output["tauCoverage"] > 0.0  # judge-sourced, not default tau

    # Complete synthesis -> persist_v2_synthesis runs protocol analysis again,
    # which (because scoring already ran) is ALSO judge-sourced.
    synth = claim_pending_job(db, worker)
    assert synth is not None and synth.job_type == "v2_synthesize"
    asyncio.run(complete_job(db, synth, worker_non_adjudicating_synthesis(worker, synth.id), {"latency_ms": 5}))

    synth_run = _other_protocol_analysis_run(db, debate.id, excluding_id=predecessor.id)
    assert synth_run.output["tauCoverage"] > 0.0  # like-with-like: both judge-sourced
    convergence = synth_run.output["convergence"]
    assert convergence["comparedAnalyzerRunId"] == predecessor.id
    assert convergence["converged"] is not None  # a real numeric comparison ran
