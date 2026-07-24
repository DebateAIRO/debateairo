"""F2 (2026-07-24 incident): restart-orphaned score_debate recovery.

score_debate runs in an in-coordinator daemon thread. A coordinator restart
kills the thread and strands the job row in claimed/running forever -- the
reaper deliberately excludes score_debate (reaping a *live* one would
resurrect scoring and flip complete debates), so nothing else recovers it. In
prod one such job sat "running" 9h after a restart with 0 nodes scored, and
the _active_scoring_job_exists guard then blocked any replacement.

recover_orphaned_scoring_jobs is a startup-only sweep, gated on a PAST
deadline (a genuinely live in-process job holds a future deadline), that
fails the orphan to a non-active terminal state and re-drives scoring once
for any affected debate that still needs it.
"""
from __future__ import annotations

import json
from datetime import timedelta

from sqlalchemy import select

from app.models.entities import AnalyzerRun, Debate, Generation, Job, Node, Worker, now_utc
from app.providers import AgentConfig, ProviderRegistry
from app.scoring import ScoringProviderResult, queue_scoring_job
from app.scoring.jobs import (
    drive_internal_scoring_for_debate,
    recover_orphaned_scoring_jobs,
    recover_orphaned_scoring_jobs_at_startup,
    run_scoring_job_background,
)
from app.services.dialectical_v2 import all_live_argument_nodes_scored

from test_node_scoring import base_assessment


class _FakeJudgeProvider:
    provider = "codex"
    model = "codex-test-model"

    def __init__(self) -> None:
        self.calls = 0

    def judge_node(self, request):
        self.calls += 1
        return ScoringProviderResult(
            provider=self.provider,
            model=self.model,
            raw_output=json.dumps(base_assessment(node_id=request.claim.node_id).model_dump(mode="json")),
            latency_ms=7,
            checked_at="2026-07-24T10:15:30+00:00",
            metadata={"provider_response_id": f"resp-f2-{self.calls}"},
        )


def _judge_registry() -> ProviderRegistry:
    return ProviderRegistry(
        agents={"judge": AgentConfig(provider="codex", model="codex-test-model", temperature=0.0)},
        providers={"codex": _FakeJudgeProvider()},
    )


def _debate_with_live_node(db, *, suffix: str) -> tuple[Debate, Node]:
    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    worker = Worker(id=f"worker-{suffix}", name="Worker", token_hash="hash", capabilities=["debate"])
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
    return debate, root


def _node_scoring_runs(db, debate_id: str) -> list[AnalyzerRun]:
    return list(
        db.scalars(
            select(AnalyzerRun).where(
                AnalyzerRun.debate_id == debate_id,
                AnalyzerRun.analyzer_type == "node_scoring",
            )
        ).all()
    )


def test_recovery_fails_orphaned_running_job_and_rescores_unscored_debate(db) -> None:
    debate, _root = _debate_with_live_node(db, suffix="orphan-unscored")
    assert not all_live_argument_nodes_scored(db, debate)

    job = queue_scoring_job(db, debate, model_id="codex-test-model")
    job.status = "running"
    job.deadline = now_utc() - timedelta(minutes=5)  # past deadline == orphaned by restart
    db.commit()

    # A single shared fake judge, bound into BOTH the wake-time availability
    # check AND the background runner. drive_internal_scoring_for_debate's
    # default runner (_run_internal_scoring_job) routes the actual scoring RUN
    # through run_scoring_job_background with the DEFAULT ProviderRegistry
    # (real codex CLI) -- so binding registry_factory only feeds the wake's
    # availability check, leaving the run non-hermetic. Bind the fake into the
    # runner too (idiom: test_scoring_verdict_refresh.py) and assert the fake's
    # call counter proves the fake path -- not the real CLI -- did the scoring.
    fake_judge = _FakeJudgeProvider()

    def registry_factory() -> ProviderRegistry:
        return ProviderRegistry(
            agents={"judge": AgentConfig(provider="codex", model="codex-test-model", temperature=0.0)},
            providers={"codex": fake_judge},
        )

    rescored = recover_orphaned_scoring_jobs(
        db,
        rescore=lambda debate_id: drive_internal_scoring_for_debate(
            debate_id,
            registry_factory=registry_factory,
            background_runner=lambda job_id, d_id: run_scoring_job_background(
                job_id, d_id, registry_factory=registry_factory
            ),
        ),
    )

    db.expire_all()
    refreshed = db.get(Job, job.id)
    assert refreshed.status == "failed"
    assert "orphan" in (refreshed.error or "").lower()
    # A fresh scoring pass ran THROUGH THE FAKE and actually scored the live node.
    assert debate.id in rescored
    assert fake_judge.calls > 0
    assert all_live_argument_nodes_scored(db, db.get(Debate, debate.id))


def test_recovery_leaves_live_running_job_with_future_deadline_untouched(db) -> None:
    debate, _root = _debate_with_live_node(db, suffix="live-future")
    job = queue_scoring_job(db, debate, model_id="codex-test-model")
    job.status = "running"
    # A genuinely live in-process job refreshes its deadline into the future.
    job.deadline = now_utc() + timedelta(minutes=25)
    db.commit()

    calls: list[str] = []
    rescored = recover_orphaned_scoring_jobs(db, rescore=lambda debate_id: calls.append(debate_id))

    db.expire_all()
    # Critical: recovery must never kill a healthy in-flight pass.
    assert db.get(Job, job.id).status == "running"
    assert calls == []
    assert rescored == []


def test_recovery_fails_orphaned_job_but_skips_rescore_when_already_scored(db) -> None:
    debate, _root = _debate_with_live_node(db, suffix="orphan-scored")

    # Score the debate for real first, so it is already fully scored.
    prep_job = queue_scoring_job(db, debate, model_id="codex-test-model")
    db.commit()
    run_scoring_job_background(prep_job.id, debate.id, registry_factory=_judge_registry)
    db.expire_all()
    assert all_live_argument_nodes_scored(db, db.get(Debate, debate.id))
    runs_before = len(_node_scoring_runs(db, debate.id))
    assert runs_before == 1

    # A redundant job was claimed then orphaned by a restart.
    orphan = queue_scoring_job(db, debate, model_id="codex-test-model")
    orphan.status = "claimed"
    orphan.deadline = now_utc() - timedelta(minutes=5)
    db.commit()

    calls: list[str] = []
    rescored = recover_orphaned_scoring_jobs(db, rescore=lambda debate_id: calls.append(debate_id))

    db.expire_all()
    assert db.get(Job, orphan.id).status == "failed"
    assert "orphan" in (db.get(Job, orphan.id).error or "").lower()
    # No duplicate node_scoring run; the complete debate is left untouched.
    assert calls == []
    assert rescored == []
    assert len(_node_scoring_runs(db, debate.id)) == runs_before


def test_startup_entrypoint_recovers_orphan_on_its_own_session(db) -> None:
    # The production entrypoint opens its own session (lifespan runs it off
    # the event loop). Use a node-less debate so "still needs scoring" is
    # False (empty tree == fully scored) and the default re-drive is never
    # invoked -- this keeps the test deterministic (no real provider) while
    # still exercising the real entrypoint's own-session job reset.
    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    db.add(debate)
    db.commit()
    job = queue_scoring_job(db, debate, model_id="codex-test-model")
    job.status = "running"
    job.deadline = now_utc() - timedelta(minutes=5)
    db.commit()

    recover_orphaned_scoring_jobs_at_startup()

    db.expire_all()
    refreshed = db.get(Job, job.id)
    assert refreshed.status == "failed"
    assert "orphan" in (refreshed.error or "").lower()
