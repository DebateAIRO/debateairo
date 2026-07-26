"""2026-07-26 QueuePool exhaustion: background scoring fan-out must be bounded.

score_debate passes start from FIVE v2 completion sites (daemon threads), the
browser-poll wake (BackgroundTasks), startup restart-recovery, and the inline
GET ?force_refresh=true path -- with no bound on how many run at once. Each
running pass repeatedly checks a QueuePool connection out between its commits,
and every thread queued on the process-wide write lock holds its connection
while it waits (write_lock.py orders pool -> RLock, deliberately). Unbounded
passes therefore translate directly into pinned pool slots.

The contract pinned here: at most DIALECTICAL_SCORING_MAX_CONCURRENT_PASSES
scoring passes run concurrently, a pass waiting its turn holds NO pooled
connection, and the inline force_refresh pass waits for the same gate.
"""
from __future__ import annotations

import json
import threading

from fastapi import BackgroundTasks

import app.api.scoring as scoring_api
from app.core.db import engine
from app.models.entities import Debate, Generation, Job, Node, Worker
from app.providers import AgentConfig, ProviderRegistry
from app.scoring import ScoringProviderResult, queue_scoring_job
from app.scoring.jobs import run_scoring_job_background
from app.scoring.service import STALE_SCORING_JOB_ERROR

from test_node_scoring import base_assessment

WAIT = 15.0  # generous join/wait bound so a regression fails, never hangs


def _scorable_debate(db, *, suffix: str) -> Debate:
    """One complete debate with a single live scored-able node (the
    test_scoring_restart_recovery shape, with per-suffix worker names so a
    test can build several debates side by side)."""
    debate = Debate(topic=f"Should companies adopt remote work? ({suffix})", status="complete")
    worker = Worker(
        id=f"worker-{suffix}", name=f"Worker {suffix}", token_hash="hash", capabilities=["debate"]
    )
    root = Node(
        id=f"root-{suffix}",
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves retention.",
        status="complete",
        materialized_path="/",
    )
    generation = Generation(
        id=f"gen-{suffix}",
        node=root,
        model_id="model-a",
        role="pro",
        argument="Employees are less likely to leave when commutes are removed.",
        worker_id=worker.id,
    )
    root.active_generation_id = generation.id
    db.add_all([debate, worker, root, generation])
    db.flush()
    debate.root_node_id = root.id
    db.commit()
    return debate


class BlockingJudgeProvider:
    """Fake judge whose judge_node signals entry and blocks until released --
    the stand-in for a long judge CLI call."""

    provider = "codex"
    model = "codex-test-model"

    def __init__(self, name: str) -> None:
        self.name = name
        self.entered = threading.Event()
        self.release = threading.Event()
        self.calls = 0

    def judge_node(self, request):
        self.calls += 1
        self.entered.set()
        assert self.release.wait(timeout=WAIT), f"provider {self.name} never released"
        return ScoringProviderResult(
            provider=self.provider,
            model=self.model,
            raw_output=json.dumps(
                base_assessment(node_id=request.claim.node_id).model_dump(mode="json")
            ),
            latency_ms=7,
            checked_at="2026-07-26T10:15:30+00:00",
            metadata={"provider_response_id": f"resp-{self.name}-{self.calls}"},
        )


def _registry_for(provider: BlockingJudgeProvider) -> ProviderRegistry:
    return ProviderRegistry(
        agents={"judge": AgentConfig(provider="codex", model=provider.model, temperature=0.0)},
        providers={"codex": provider},
    )


def test_concurrent_scoring_passes_are_bounded(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_SCORING_MAX_CONCURRENT_PASSES", "1")
    debate_a = _scorable_debate(db, suffix="gate-a")
    debate_b = _scorable_debate(db, suffix="gate-b")
    job_a = queue_scoring_job(db, debate_a, model_id="codex-test-model")
    job_b = queue_scoring_job(db, debate_b, model_id="codex-test-model")
    db.commit()
    job_a_id, debate_a_id = job_a.id, debate_a.id
    job_b_id, debate_b_id = job_b.id, debate_b.id
    # Release the fixture session's read transaction so the pool probe below
    # counts only the scoring passes' checkouts.
    db.rollback()

    provider_a = BlockingJudgeProvider("a")
    provider_b = BlockingJudgeProvider("b")

    thread_a = threading.Thread(
        target=run_scoring_job_background,
        args=(job_a_id, debate_a_id),
        kwargs={"registry_factory": lambda: _registry_for(provider_a)},
        daemon=True,
    )
    thread_a.start()
    assert provider_a.entered.wait(timeout=WAIT), "pass A never reached its judge call"

    thread_b = threading.Thread(
        target=run_scoring_job_background,
        args=(job_b_id, debate_b_id),
        kwargs={"registry_factory": lambda: _registry_for(provider_b)},
        daemon=True,
    )
    thread_b.start()

    try:
        # With the bound at 1 and pass A mid-judge, pass B must be queued at the
        # gate, not judging.
        assert not provider_b.entered.wait(timeout=0.5), (
            "a second scoring pass entered its judge call while the first was "
            "still running despite DIALECTICAL_SCORING_MAX_CONCURRENT_PASSES=1"
        )
        # And neither the running pass (committed before its judge CLI, the F1
        # discipline) nor the queued pass (gate acquired before any session
        # opens) may hold a pooled connection right now.
        assert engine.pool.checkedout() == 0, (
            "a scoring pass held a pooled connection while judging or while "
            f"queued for the pass gate (checkedout={engine.pool.checkedout()})"
        )
    finally:
        provider_a.release.set()
        provider_b.release.set()

    thread_a.join(timeout=WAIT)
    thread_b.join(timeout=WAIT)
    assert not thread_a.is_alive() and not thread_b.is_alive()
    assert provider_b.calls > 0, "pass B never ran after the gate freed up"

    db.expire_all()
    assert db.get(Job, job_a_id).status == "complete"
    assert db.get(Job, job_b_id).status == "complete"


def test_force_refresh_inline_pass_waits_for_the_gate_without_a_connection(db, monkeypatch) -> None:
    """GET /{debate_id}/scoring?force_refresh=true runs a full pass inline on
    the request session. It must (1) count against the same process-wide pass
    gate as the background passes, and (2) hold no pooled connection while it
    waits its turn -- the request session has already read (auth + debate
    lookup), and a read is enough to pin a QueuePool slot until the
    transaction ends."""
    from app.scoring import jobs as scoring_jobs

    monkeypatch.setenv("DIALECTICAL_SCORING_MAX_CONCURRENT_PASSES", "1")
    debate = _scorable_debate(db, suffix="inline-gate")
    debate_id = debate.id
    db.rollback()

    entered = threading.Event()
    finished = threading.Event()
    responses: list[dict] = []

    def fake_pass(db_, debate_, registry, *, force_refresh):
        entered.set()
        return {"debate_id": debate_.id, "status": "unavailable", "items": [], "reason": "test"}

    monkeypatch.setattr(scoring_api, "score_debate_with_provider_registry", fake_pass)

    gate = scoring_jobs.scoring_pass_gate()
    assert gate.acquire(timeout=WAIT)
    try:

        def request_thread() -> None:
            responses.append(
                scoring_api.get_debate_scoring(
                    debate_id,
                    BackgroundTasks(),
                    db,
                    authorization="Bearer user_test_token",
                    force_refresh=True,
                )
            )
            finished.set()

        waiter = threading.Thread(target=request_thread, daemon=True)
        waiter.start()

        assert not entered.wait(timeout=0.5), (
            "the inline force_refresh pass ran while the scoring pass gate was "
            "fully held: inline refreshes bypass the concurrency bound"
        )
        assert engine.pool.checkedout() == 0, (
            "the inline force_refresh request held its pooled connection while "
            f"queued for the pass gate (checkedout={engine.pool.checkedout()})"
        )
    finally:
        gate.release()

    assert finished.wait(timeout=WAIT), "inline pass never completed after the gate freed up"
    assert entered.is_set()
    assert responses and responses[0]["debate_id"] == debate_id


def test_background_pass_skips_job_that_went_terminal_while_queued(db) -> None:
    """A pass can now wait at the gate; if a status poll expires the job stale
    (or it completes elsewhere) in the meantime, the runner must not resurrect
    a terminal job into 'running' and burn a full judge pass on it."""
    debate = _scorable_debate(db, suffix="terminal")
    job = queue_scoring_job(db, debate, model_id="codex-test-model")
    job.status = "failed"
    job.error = STALE_SCORING_JOB_ERROR
    db.commit()
    job_id, debate_id = job.id, debate.id

    provider = BlockingJudgeProvider("terminal")
    provider.release.set()  # never block; it must simply never be called

    run_scoring_job_background(
        job_id, debate_id, registry_factory=lambda: _registry_for(provider)
    )

    db.expire_all()
    assert provider.calls == 0, "a terminal job was resurrected into a fresh judge pass"
    refreshed = db.get(Job, job_id)
    assert refreshed.status == "failed"
    assert refreshed.error == STALE_SCORING_JOB_ERROR
