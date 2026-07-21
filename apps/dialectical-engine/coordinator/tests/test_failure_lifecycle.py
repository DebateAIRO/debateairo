"""W1 regression tests: bounded failure lifecycle.

Poison jobs must terminate at the DIALECTICAL_MAX_JOB_ATTEMPTS budget (worker
/fail path AND the deadline reaper), a terminally failed node-scoped job must
degrade the debate (node failed + stopping_reason, synthesis over survivors)
instead of killing it, and debate-level `failed` stays reserved for
root-generation and synthesize-class jobs. Scoring's stale-requeue channel is
bounded too. Timeout-class attempts (reaper expiries, worker-vanished
requeues) count at HALF weight, so a pure timeout loop terminates at twice
the configured budget while a pure crash loop terminates exactly at it.
"""
from __future__ import annotations

import asyncio
import json
from datetime import timedelta

import pytest
from sqlalchemy import select

from app.core.auth import hash_token
from app.main import app  # noqa: F401 - warm up the import graph
from app.models.entities import Debate, Job, Node, Worker, now_utc
from app.scoring.jobs import wake_pending_internal_scoring_job
from app.scoring.service import STALE_SCORING_JOB_ERROR
from app.services.dialectical_v2 import create_dialectical_debate, pending_branch_containers
from app.services.events import event_bus
from app.services.orchestrator import (
    claim_pending_job,
    complete_job,
    fail_job,
    job_attempts_exhausted,
)
from app.services.serialization import debate_to_dict, effective_debate_status


def _worker(db, *, name: str = "mac-mini", capabilities: list[str] | None = None) -> Worker:
    worker = Worker(
        name=name,
        token_hash=hash_token(f"{name}-token"),
        capabilities=capabilities or ["mock-local"],
        last_seen=now_utc(),
        status="online",
    )
    db.add(worker)
    db.commit()
    return worker


def _codex_worker(db, *, name: str = "codex-worker") -> Worker:
    return _worker(db, name=name, capabilities=["gpt-5.6sol-medium"])


def _decompose_result() -> dict:
    return {
        "root_claim": "Should cities ban cars?",
        "argument": "The root has been decomposed.",
        "children": [
            {"node_type": "PRO", "claim": "Cleaner air."},
            {"node_type": "CON", "claim": "Mobility loss."},
        ],
    }


def _complete_decompose(db, worker: Worker) -> Job:
    job = claim_pending_job(db, worker)
    assert job is not None and job.job_type == "decompose"
    asyncio.run(complete_job(db, job, _decompose_result(), {"latency_ms": 5}))
    return job


def _pov_output(worker: Worker, job_id: str, pov: str) -> dict:
    return {
        "title": f"{pov} assessment",
        "content": f"A concise assessment through the {pov} lens.",
        "strongest_pro": {
            "title": f"{pov} strongest pro",
            "content": "The strongest pro relies on the clearest relevant evidence.",
            "pro": {"title": "pro support", "content": "Supporting detail without padding."},
            "con": {"title": "pro limitation", "content": "Counter-detail that identifies uncertainty."},
        },
        "strongest_con": {
            "title": f"{pov} strongest con",
            "content": "The strongest con identifies the most important risk.",
            "pro": {"title": "con support", "content": "Supporting detail without padding."},
            "con": {"title": "con limitation", "content": "Counter-detail that identifies uncertainty."},
        },
        "provenance": {
            "model_id": "gpt-5.6sol-medium",
            "worker_id": worker.id,
            "prompt_id": f"prompt-{job_id}",
            "job_id": job_id,
        },
    }


def _synthesis_output(worker: Worker, job_id: str) -> dict:
    return {
        "title": "Synthesis",
        "content": "The surviving perspectives agree on evidence quality and diverge on uncertainty.",
        "provenance": {
            "model_id": "gpt-5.6sol-medium",
            "worker_id": worker.id,
            "prompt_id": f"prompt-{job_id}",
            "job_id": job_id,
        },
    }


def _reset_online(db, worker: Worker) -> None:
    worker.status = "online"
    db.commit()


# ---------------------------------------------------------------------------
# Budget math
# ---------------------------------------------------------------------------


def test_weighted_attempt_budget_counts_timeouts_half() -> None:
    job = Job(debate_id="d", job_type="argue", required_role="proposer", required_model="mock-local")
    job.attempts = 3
    job.timeout_attempts = 2
    assert not job_attempts_exhausted(job)  # 3 - 1 = 2 < 4
    job.attempts = 4
    job.timeout_attempts = 0
    assert job_attempts_exhausted(job)  # pure crash loop terminates at the budget
    job.attempts = 7
    job.timeout_attempts = 7
    assert not job_attempts_exhausted(job)  # 3.5 < 4
    job.attempts = 8
    job.timeout_attempts = 8
    assert job_attempts_exhausted(job)  # pure timeout loop terminates at 2x budget
    job.attempts = 2
    job.timeout_attempts = None  # legacy rows backfilled as NULL
    assert not job_attempts_exhausted(job)


def test_max_job_attempts_env_knob(monkeypatch: pytest.MonkeyPatch) -> None:
    job = Job(debate_id="d", job_type="argue", required_role="proposer", required_model="mock-local")
    job.attempts = 1
    job.timeout_attempts = 0
    monkeypatch.setenv("DIALECTICAL_MAX_JOB_ATTEMPTS", "1")
    assert job_attempts_exhausted(job)
    monkeypatch.setenv("DIALECTICAL_MAX_JOB_ATTEMPTS", "2")
    assert not job_attempts_exhausted(job)


# ---------------------------------------------------------------------------
# Worker-reported (/fail) budget path
# ---------------------------------------------------------------------------


def test_retryable_node_job_goes_terminal_exactly_at_budget(db) -> None:
    worker = _worker(db)
    from app.services.orchestrator import create_debate

    debate = create_debate(db, "Should cities ban cars?", {"max_depth": 1})
    _complete_decompose(db, worker)

    poison = None
    for attempt in range(1, 5):
        _reset_online(db, worker)
        job = claim_pending_job(db, worker)
        assert job is not None
        if poison is None:
            poison = job
        assert job.id == poison.id, "The oldest pending (poison) job must keep being retried"
        assert job.attempts == attempt
        asyncio.run(fail_job(db, job, f"Adapter crash {attempt}", retryable=True))
        db.refresh(poison)
        if attempt < 4:
            assert poison.status == "pending", f"attempt {attempt} must requeue"
        else:
            assert poison.status == "failed", "attempt 4 (default budget) must go terminal"

    node = db.get(Node, poison.node_id)
    debate = db.get(Debate, debate.id)
    assert node.status == "failed"
    assert node.stopping_reason == "generation_exhausted"
    assert node.path_status == "abandoned"
    assert debate.status != "failed", "one poisoned leaf must degrade, not kill, the debate"

    # No further requeue: the only claimable job left is the sibling argue job.
    _reset_online(db, worker)
    next_job = claim_pending_job(db, worker)
    assert next_job is not None and next_job.id != poison.id


def test_terminal_node_failure_emits_terminal_node_failed_event(db) -> None:
    worker = _worker(db)
    from app.services.orchestrator import create_debate

    debate = create_debate(db, "Should cities ban cars?", {"max_depth": 1})
    _complete_decompose(db, worker)
    _reset_online(db, worker)
    job = claim_pending_job(db, worker)
    assert job is not None
    stream = event_bus.subscribe(debate.id, replay_history=False)

    async def fail_and_capture() -> str:
        try:
            assert await asyncio.wait_for(stream.__anext__(), timeout=0.1) == (
                "event: connected\ndata: {}\n\n"
            )
            await fail_job(db, job, "SYNTHETIC_PRIVATE_REASON_a1b2", retryable=False)
            return await asyncio.wait_for(stream.__anext__(), timeout=0.1)
        finally:
            await stream.aclose()

    event = asyncio.run(fail_and_capture())
    payload = json.loads(event.split("data: ", 1)[1])

    assert event.startswith("event: node_failed\n")
    assert payload == {
        "node_id": job.node_id,
        "code": "claim_generation_failed",
        "reason": "Claim generation failed",
        "terminal": True,
    }
    assert "SYNTHETIC_PRIVATE_REASON_a1b2" not in event


def test_v1_terminal_leaf_failure_still_synthesizes_over_survivor(db) -> None:
    worker = _worker(db)
    from app.services.orchestrator import create_debate

    debate = create_debate(db, "Should cities ban cars?", {"max_depth": 1})
    _complete_decompose(db, worker)

    first = claim_pending_job(db, worker)
    assert first is not None and first.job_type == "argue"
    asyncio.run(complete_job(db, first, {"argument": "A concise argument."}, {"latency_ms": 5}))

    poison = claim_pending_job(db, worker)
    assert poison is not None and poison.job_type == "argue"
    asyncio.run(fail_job(db, poison, "Deterministic adapter crash", retryable=False))

    db.refresh(debate)
    assert debate.status != "failed"
    synthesis_job = db.scalar(
        select(Job).where(Job.debate_id == debate.id, Job.job_type == "synthesize", Job.status == "pending")
    )
    assert synthesis_job is not None, "terminal leaf failure must unblock synthesis over the survivor"

    _reset_online(db, worker)
    claimed = claim_pending_job(db, worker)
    assert claimed is not None and claimed.job_type == "synthesize"
    asyncio.run(
        complete_job(
            db,
            claimed,
            {"strongest_pro": "Pro.", "strongest_con": "Con.", "verdict": "Balanced."},
            {"latency_ms": 5},
        )
    )
    db.refresh(debate)
    assert debate.status == "complete"
    payload = debate_to_dict(db, debate)
    assert payload["status"] == "complete"
    failed_children = [child for child in payload["tree"]["children"] if child["status"] == "failed"]
    assert len(failed_children) == 1
    assert failed_children[0]["stopping_reason"] == "generation_exhausted"


def test_v1_all_leaves_failed_is_honest_terminal_failed(db) -> None:
    worker = _worker(db)
    from app.services.orchestrator import create_debate

    debate = create_debate(db, "Should cities ban cars?", {"max_depth": 1})
    _complete_decompose(db, worker)

    for _ in range(2):
        _reset_online(db, worker)
        job = claim_pending_job(db, worker)
        assert job is not None and job.job_type == "argue"
        asyncio.run(fail_job(db, job, "Deterministic adapter crash", retryable=False))

    db.refresh(debate)
    synthesis_job = db.scalar(select(Job).where(Job.debate_id == debate.id, Job.job_type == "synthesize"))
    assert synthesis_job is None, "no survivors -> never synthesize over nothing"
    assert effective_debate_status(db, debate) == "failed"


# ---------------------------------------------------------------------------
# Deadline-reaper budget path
# ---------------------------------------------------------------------------


def test_reaper_expiries_go_terminal_at_doubled_budget(db) -> None:
    worker_a = _worker(db, name="worker-a")
    worker_b = _worker(db, name="worker-b")
    debate = Debate(topic="Should cities ban cars?", status="generating", config={"max_depth": 1, "branching": 2})
    db.add(debate)
    db.flush()
    root = Node(
        debate_id=debate.id,
        parent_id=None,
        node_type="ROOT_CLAIM",
        depth=0,
        position=0,
        claim="Should cities ban cars?",
        status="complete",
        materialized_path="/0",
    )
    db.add(root)
    db.flush()
    debate.root_node_id = root.id
    child = Node(
        debate_id=debate.id,
        parent_id=root.id,
        node_type="PRO",
        depth=1,
        position=0,
        claim="Cleaner air.",
        status="pending",
        materialized_path="/0/0",
    )
    db.add(child)
    db.flush()
    poison = Job(
        debate_id=debate.id,
        node_id=child.id,
        job_type="argue",
        required_role="proposer",
        required_model="mock-local",
        status="pending",
        deadline=now_utc() + timedelta(minutes=5),
    )
    db.add(poison)
    db.commit()

    job = claim_pending_job(db, worker_a)
    assert job is not None and job.job_type == "argue"
    poison_id = job.id
    workers = [worker_a, worker_b]
    for expiry in range(1, 9):
        job.deadline = now_utc() - timedelta(seconds=1)
        db.commit()
        claimer = workers[expiry % 2]
        reclaimed = claim_pending_job(db, claimer)
        refreshed = db.get(Job, poison_id)
        assert refreshed.timeout_attempts == expiry
        if expiry < 8:
            assert reclaimed is not None and reclaimed.id == poison_id, f"expiry {expiry} must requeue"
            job = reclaimed
        else:
            # 8th expiry: weighted attempts reach the default budget of 4.
            assert refreshed.status == "failed"
            assert reclaimed is None or reclaimed.id != poison_id

    node = db.get(Node, refreshed.node_id)
    db.refresh(debate)
    assert node.status == "failed"
    assert node.stopping_reason == "generation_exhausted"
    assert debate.status != "failed"
    assert refreshed.error, "terminal reaper failure must carry a non-empty reason"


def test_reaper_leaves_score_debate_jobs_alone(db) -> None:
    worker = _worker(db)
    debate = Debate(topic="Should cities ban cars?", status="complete", config={})
    db.add(debate)
    db.flush()
    scoring_job = Job(
        debate_id=debate.id,
        job_type="score_debate",
        required_role="judge",
        required_model="mock-local",
        status="running",
        deadline=now_utc() - timedelta(seconds=1),
    )
    db.add(scoring_job)
    db.commit()

    claimed = claim_pending_job(db, worker)

    db.refresh(scoring_job)
    db.refresh(debate)
    assert claimed is None
    assert scoring_job.status == "running", "the worker reaper must not fight the scoring state machine"
    assert debate.status == "complete", "reaping a scoring job must never flip debate.status"


# ---------------------------------------------------------------------------
# v2: one poisoned lens degrades; synthesis runs over survivors
# ---------------------------------------------------------------------------


def _v2_debate_with_poisoned_lens(db, worker: Worker, *, poison_last: bool):
    """Create a 4-lens v2 debate, poison one lens (first or last resolved).

    Jobs are claimed and resolved one at a time; the poison lens is targeted
    by required_role so the test does not depend on claim ordering.
    """
    debate = create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    poison_job_id: str | None = None
    resolved: list[Job] = []
    for _ in range(4):
        job = claim_pending_job(db, worker)
        assert job is not None and job.job_type == "v2_pov"
        is_last = len(resolved) == 3
        poison_here = is_last if poison_last else len(resolved) == 0
        if poison_here:
            poison_job_id = job.id
            asyncio.run(fail_job(db, job, "Poisoned lens payload", retryable=False))
        else:
            asyncio.run(complete_job(db, job, _pov_output(worker, job.id, job.required_role), {"latency_ms": 5}))
        resolved.append(job)
        _reset_online(db, worker)
    assert poison_job_id is not None
    return debate, db.get(Job, poison_job_id)


@pytest.mark.parametrize("poison_last", [False, True])
def test_v2_poisoned_lens_degrades_and_synthesizes_over_survivors(db, poison_last: bool) -> None:
    worker = _codex_worker(db)
    debate, poison_job = _v2_debate_with_poisoned_lens(db, worker, poison_last=poison_last)

    db.refresh(debate)
    assert debate.status != "failed"
    poison_node = db.get(Node, poison_job.node_id)
    assert poison_node.status == "failed"
    assert poison_node.stopping_reason == "generation_exhausted"
    assert pending_branch_containers(db, debate.id, debate.root_node_id) == []

    synthesis_job = db.scalar(
        select(Job).where(Job.debate_id == debate.id, Job.job_type == "v2_synthesize", Job.status == "pending")
    )
    assert synthesis_job is not None, "a terminally failed branch must stop blocking synthesis"

    claimed = claim_pending_job(db, worker)
    assert claimed is not None and claimed.job_type == "v2_synthesize"
    asyncio.run(complete_job(db, claimed, _synthesis_output(worker, claimed.id), {"latency_ms": 5}))

    db.refresh(debate)
    assert debate.status == "complete"
    payload = debate_to_dict(db, debate)
    assert payload["status"] == "complete"
    assert payload["synthesis"] is not None
    branch_statuses = sorted(child["status"] for child in payload["tree"]["children"])
    assert branch_statuses == ["complete", "complete", "complete", "failed"]
    failed_branch = next(child for child in payload["tree"]["children"] if child["status"] == "failed")
    assert failed_branch["stopping_reason"] == "generation_exhausted"


def test_v2_all_lenses_failed_is_honest_terminal_failed(db) -> None:
    worker = _codex_worker(db)
    debate = create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    for _ in range(4):
        job = claim_pending_job(db, worker)
        assert job is not None and job.job_type == "v2_pov"
        asyncio.run(fail_job(db, job, "Poisoned lens payload", retryable=False))
        _reset_online(db, worker)

    db.refresh(debate)
    synthesis_job = db.scalar(select(Job).where(Job.debate_id == debate.id, Job.job_type == "v2_synthesize"))
    assert synthesis_job is None, "no surviving branches -> never synthesize over nothing"
    assert effective_debate_status(db, debate) == "failed"


# ---------------------------------------------------------------------------
# Debate-scoped families keep honest terminal `failed`
# ---------------------------------------------------------------------------


def test_synthesize_budget_exhaustion_fails_debate(db) -> None:
    worker = _worker(db)
    from app.services.orchestrator import create_debate

    debate = create_debate(db, "Should cities ban cars?", {"max_depth": 1})
    _complete_decompose(db, worker)
    for _ in range(2):
        _reset_online(db, worker)
        job = claim_pending_job(db, worker)
        assert job is not None and job.job_type == "argue"
        asyncio.run(complete_job(db, job, {"argument": "A concise argument."}, {"latency_ms": 5}))

    for attempt in range(1, 5):
        _reset_online(db, worker)
        job = claim_pending_job(db, worker)
        assert job is not None and job.job_type == "synthesize"
        asyncio.run(fail_job(db, job, f"Synthesis crash {attempt}", retryable=True))
        db.refresh(job)
        if attempt < 4:
            assert job.status == "pending"

    db.refresh(debate)
    assert job.status == "failed"
    assert debate.status == "failed", "synthesize-class terminal failure genuinely dooms the debate"


def test_decompose_terminal_failure_fails_debate(db) -> None:
    worker = _worker(db)
    from app.services.orchestrator import create_debate

    debate = create_debate(db, "Should cities ban cars?", {"max_depth": 1})
    job = claim_pending_job(db, worker)
    assert job is not None and job.job_type == "decompose"

    asyncio.run(fail_job(db, job, "Malformed decomposition JSON", retryable=False))

    db.refresh(debate)
    node = db.get(Node, job.node_id)
    assert debate.status == "failed", "root-generation terminal failure genuinely dooms the debate"
    assert node.status == "failed"


# ---------------------------------------------------------------------------
# Scoring: stale-requeue channel is bounded, debate.status untouched
# ---------------------------------------------------------------------------


class _RecordingBackgroundTasks:
    def __init__(self) -> None:
        self.tasks: list[tuple] = []

    def add_task(self, fn, *args) -> None:
        self.tasks.append((fn, *args))


def _seed_stale_scoring_failures(db, debate: Debate, count: int) -> None:
    for _ in range(count):
        db.add(
            Job(
                debate_id=debate.id,
                job_type="score_debate",
                required_role="judge",
                required_model="mock-local",
                status="failed",
                error=STALE_SCORING_JOB_ERROR,
                deadline=now_utc() - timedelta(minutes=5),
            )
        )
    db.commit()


def _scoring_registry_factory():
    from app.providers import AgentConfig, ProviderRegistry

    class _FakeProvider:
        provider = "mock"
        model = "mock-judge"

    return lambda: ProviderRegistry(
        agents={"judge": AgentConfig(provider="mock", model="mock-judge", temperature=0.0)},
        providers={"mock": _FakeProvider()},
    )


def test_stale_scoring_requeue_channel_is_bounded(db) -> None:
    debate = Debate(topic="Should cities ban cars?", status="complete", config={})
    db.add(debate)
    db.commit()
    _seed_stale_scoring_failures(db, debate, 8)
    background = _RecordingBackgroundTasks()

    job = wake_pending_internal_scoring_job(
        db,
        debate,
        background,
        registry_factory=_scoring_registry_factory(),
        background_runner=lambda *_: None,
    )

    db.refresh(debate)
    assert job is None, "8 consecutive stale scoring failures (2x budget) must stop the requeue channel"
    assert background.tasks == []
    assert debate.status == "complete"


def test_stale_scoring_requeue_still_allowed_below_budget(db) -> None:
    debate = Debate(topic="Should cities ban cars?", status="complete", config={})
    db.add(debate)
    db.commit()
    _seed_stale_scoring_failures(db, debate, 7)
    background = _RecordingBackgroundTasks()

    job = wake_pending_internal_scoring_job(
        db,
        debate,
        background,
        registry_factory=_scoring_registry_factory(),
        background_runner=lambda *_: None,
    )

    assert job is not None, "below the doubled budget the stale channel may still requeue"
    assert len(background.tasks) == 1


# ---------------------------------------------------------------------------
# Fix round 1: commit-before-publish ordering.
#
# requeue_active_jobs_for_worker and claim_pending_job's orphan-release
# branch used to publish their terminal events before their caller's
# transaction committed. A refresh()-triggering terminal node_failed SSE
# could then race a not-yet-committed tree, and a rollback after publish
# would emit a phantom terminal-failure event. Both now collect events and
# return/accumulate them for the caller to publish only after commit_write,
# matching the expired-jobs path's existing pattern.
# ---------------------------------------------------------------------------


def test_requeue_active_jobs_for_worker_commits_before_publishing_terminal_event(
    db, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Worker token-rotation channel (POST /workers/register, rotate_token)
    drives a poisoned argue job to the doubled timeout-class budget via
    requeue_active_jobs_for_worker. The terminal node_failed event must
    publish exactly once, only after register_worker's commit_write call
    persists the terminal node/job state -- never before."""
    import app.api.workers as workers_module
    from app.api.workers import RegisterRequest, register_worker
    from app.core.auth import AuthContext
    from app.services.orchestrator import create_debate

    worker = _worker(db)
    debate = create_debate(db, "Should cities ban cars?", {"max_depth": 1})
    _complete_decompose(db, worker)

    job = claim_pending_job(db, worker)
    assert job is not None and job.job_type == "argue"
    poison_id = job.id

    def rotate() -> None:
        register_worker(
            RegisterRequest(name=worker.name, capabilities=worker.capabilities, rotate_token=True),
            db,
            AuthContext(token="user_test_token"),
        )

    # Each rotation is one timeout-class requeue (half budget weight);
    # reclaim in between so attempts keeps pace with timeout_attempts -- a
    # pure timeout loop terminates at DOUBLE the configured budget (8 cycles
    # at the default of 4), mirroring the reaper's own doubled-budget test.
    for cycle in range(1, 8):
        rotate()
        refreshed = db.get(Job, poison_id)
        db.refresh(refreshed)
        assert refreshed.status == "pending", f"cycle {cycle} must requeue, not terminalize"
        reclaimed = claim_pending_job(db, worker)
        assert reclaimed is not None and reclaimed.id == poison_id

    # Final (8th) rotation exhausts the budget. Record call order for JUST
    # this call to prove commit_write precedes _publish_events_sync.
    call_order: list[str] = []
    real_commit_write = workers_module.commit_write
    real_publish = workers_module._publish_events_sync

    def recording_commit(session):
        call_order.append("commit")
        return real_commit_write(session)

    def recording_publish(events):
        call_order.append("publish")
        return real_publish(events)

    monkeypatch.setattr(workers_module, "commit_write", recording_commit)
    monkeypatch.setattr(workers_module, "_publish_events_sync", recording_publish)

    rotate()

    assert call_order.count("publish") == 1, "terminal event must publish exactly once"
    assert call_order.index("commit") < call_order.index(
        "publish"
    ), "must commit the terminal state before publishing its event"

    refreshed = db.get(Job, poison_id)
    node = db.get(Node, refreshed.node_id)
    db.refresh(debate)
    assert refreshed.status == "failed"
    assert node.status == "failed"
    assert node.stopping_reason == "generation_exhausted"
    assert node.path_status == "abandoned"
    assert debate.status != "failed", "one poisoned branch must degrade, not kill, the debate"


def test_fresh_start_registration_commits_before_publishing_terminal_event(
    db, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The orphan-release trigger moved from a bare poll to fresh_start=True
    registration (job-lifecycle plan Task 2: a worker reconnecting while its
    previous claim is still marked claimed/running -- e.g. the worker
    process restarted -- now must say so explicitly). Repeated fresh_start
    registrations drive a poisoned argue job to the doubled timeout-class
    budget. The terminal node_failed event must publish exactly once, only
    after register_worker's commit_write call persists the terminal
    node/job state -- never before."""
    import app.api.workers as workers_module
    from app.api.workers import RegisterRequest, register_worker
    from app.core.auth import AuthContext
    from app.services.orchestrator import create_debate

    worker = _worker(db)
    debate = create_debate(db, "Should cities ban cars?", {"max_depth": 1})
    _complete_decompose(db, worker)

    # Isolate a single branch: resolve the sibling so the poison job is the
    # only claimable job across every fresh_start cycle below.
    sibling = claim_pending_job(db, worker)
    assert sibling is not None and sibling.job_type == "argue"
    asyncio.run(complete_job(db, sibling, {"argument": "A concise argument."}, {"latency_ms": 5}))
    _reset_online(db, worker)

    job = claim_pending_job(db, worker)
    assert job is not None and job.job_type == "argue"
    poison_id = job.id

    def fresh_start_register() -> None:
        register_worker(
            RegisterRequest(name=worker.name, capabilities=worker.capabilities, fresh_start=True),
            db,
            AuthContext(token="user_test_token"),
        )

    # Each fresh_start registration is one timeout-class requeue (half
    # budget weight); reclaim in between so attempts keeps pace with
    # timeout_attempts -- a pure timeout loop terminates at DOUBLE the
    # configured budget (8 cycles at the default of 4), mirroring the
    # reaper's own doubled-budget test and the token-rotation channel's test
    # above.
    for cycle in range(1, 8):
        fresh_start_register()
        refreshed = db.get(Job, poison_id)
        db.refresh(refreshed)
        assert refreshed.status == "pending", f"cycle {cycle} must requeue, not terminalize"
        reclaimed = claim_pending_job(db, worker)
        assert reclaimed is not None and reclaimed.id == poison_id

    # Final (8th) fresh_start registration exhausts the budget. Record call
    # order for JUST this call to prove commit_write precedes
    # _publish_events_sync.
    call_order: list[str] = []
    real_commit_write = workers_module.commit_write
    real_publish = workers_module._publish_events_sync

    def recording_commit(session):
        call_order.append("commit")
        return real_commit_write(session)

    def recording_publish(events):
        call_order.append("publish")
        return real_publish(events)

    monkeypatch.setattr(workers_module, "commit_write", recording_commit)
    monkeypatch.setattr(workers_module, "_publish_events_sync", recording_publish)

    fresh_start_register()

    assert call_order.count("publish") == 1, "terminal event must publish exactly once"
    assert call_order.index("commit") < call_order.index(
        "publish"
    ), "must commit the terminal state before publishing its event"

    refreshed = db.get(Job, poison_id)
    node = db.get(Node, refreshed.node_id)
    db.refresh(debate)
    assert refreshed.status == "failed"
    assert node.status == "failed"
    assert node.stopping_reason == "generation_exhausted"
    assert node.path_status == "abandoned"
    assert debate.status != "failed", "one poisoned branch must degrade, not kill, the debate"
