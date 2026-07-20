"""W2: judge scores exist before verdict-bearing analysis.

Covers the two halves of the wave's pipeline change:
1. The scoring-completion tail re-runs protocol analysis (appending a NEW
   protocol_analysis run whose taus come from the persisted judge scores;
   stored runs are never rewritten).
2. v2 completion internally triggers the debate-scoped scoring job via the
   existing waker machinery -- no browser poll needed -- with best-effort /
   bounded / idempotent discipline.
"""
from __future__ import annotations

import json

import pytest
from sqlalchemy import select

from app.models.entities import AnalyzerRun, Debate, Job, Node
from app.providers import AgentConfig, ProviderRegistry
from app.scoring import ScoringProviderResult, queue_scoring_job
from app.scoring import jobs as scoring_jobs
from app.scoring.jobs import (
    drive_internal_scoring_for_debate,
    run_scoring_job_background,
    wake_pending_internal_scoring_job,
)
from app.scoring.service import SCORING_ANALYZER_TYPE, STALE_SCORING_JOB_ERROR, UNAVAILABLE_SCORING_JOB_ERROR
from app.services import dialectical_v2 as service
from app.services.serialization import debate_to_dict

from test_dialectical_v2 import complete_worker_v2_pipeline, real_codex_worker
from test_node_scoring import base_assessment


class FakeJudgeProvider:
    provider = "codex"
    model = "codex-test-model"

    def __init__(self) -> None:
        self.calls = 0

    def judge_node(self, request):
        self.calls += 1
        return ScoringProviderResult(
            provider=self.provider,
            model=self.model,
            raw_output=json.dumps(
                base_assessment(node_id=request.claim.node_id).model_dump(mode="json")
            ),
            latency_ms=7,
            checked_at="2026-07-19T10:15:30+00:00",
            metadata={"provider_response_id": f"resp-w2-{self.calls}"},
        )


def _judge_registry() -> ProviderRegistry:
    return ProviderRegistry(
        agents={"judge": AgentConfig(provider="codex", model="codex-test-model", temperature=0.0)},
        providers={"codex": FakeJudgeProvider()},
    )


class _CollectedTasks:
    """Minimal BackgroundTasks stand-in for direct waker calls in tests."""

    def __init__(self) -> None:
        self.tasks: list[tuple] = []

    def add_task(self, func, *args) -> None:
        self.tasks.append((func, *args))


def _protocol_runs(db, debate_id: str) -> list[AnalyzerRun]:
    return list(
        db.scalars(
            select(AnalyzerRun)
            .where(
                AnalyzerRun.debate_id == debate_id,
                AnalyzerRun.analyzer_type == "protocol_analysis",
            )
            .order_by(AnalyzerRun.seq.asc())
        ).all()
    )


def _completed_v2_debate(db) -> Debate:
    worker = real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    complete_worker_v2_pipeline(db, debate, worker)
    db.refresh(debate)
    assert debate.status == "complete"
    return debate


def _minimal_debate(db) -> Debate:
    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    db.add(debate)
    db.commit()
    return debate


# ---------------------------------------------------------------------------
# 1. Post-scoring protocol re-run
# ---------------------------------------------------------------------------


def test_scoring_completion_appends_protocol_rerun_with_judge_taus(db) -> None:
    debate = _completed_v2_debate(db)
    runs_before = _protocol_runs(db, debate.id)
    assert len(runs_before) == 1  # synthesis-time analysis, default taus
    first_run_id = runs_before[0].id
    first_output_snapshot = json.dumps(runs_before[0].output, sort_keys=True)
    first_provenance_snapshot = json.dumps(runs_before[0].provenance, sort_keys=True)
    assert runs_before[0].output["tauCoverage"] == 0.0

    job = queue_scoring_job(db, debate, model_id="codex-test-model")
    db.commit()
    run_scoring_job_background(job.id, debate.id, registry_factory=_judge_registry)

    db.expire_all()
    runs_after = _protocol_runs(db, debate.id)
    # Additive only: exactly one NEW row, and the stored synthesis-time run is
    # byte-unrewritten (output AND provenance).
    assert len(runs_after) == 2
    original = db.get(AnalyzerRun, first_run_id)
    assert json.dumps(original.output, sort_keys=True) == first_output_snapshot
    assert json.dumps(original.provenance, sort_keys=True) == first_provenance_snapshot

    new_run = next(run for run in runs_after if run.id != first_run_id)
    nodes = db.scalars(
        select(Node).where(Node.debate_id == debate.id, Node.status != "stale")
    ).all()
    argument_node_ids = [node.id for node in nodes if node.node_type != "EVIDENCE"]
    assert argument_node_ids
    # Judge scores flowed into the re-run's taus: every argument node's tau is
    # judge-sourced (asserted explicitly per node, never fingerprint-only).
    for node_id in argument_node_ids:
        assert new_run.output["tauSources"][node_id] == "judge_strength"
    assert new_run.output["tauCoverage"] == 1.0
    # Pinning discipline: still df-quad-v1, and convergence compared against
    # the synthesis-time run under the same semantics.
    assert new_run.output["semanticsVersion"] == "df-quad-v1"
    assert new_run.output["convergence"]["comparedAnalyzerRunId"] == first_run_id
    assert set(new_run.output["dialecticalStrengths"]) == {node.id for node in nodes}

    # The verdict now consumes real taus: real band beside real strength.
    detail = debate_to_dict(db, db.get(Debate, debate.id))
    strength = new_run.output["dialecticalStrengths"][debate.root_node_id]
    expected_band = (
        "supported" if strength >= 0.65 else "unsupported" if strength <= 0.35 else "contested"
    )
    assert detail["verdict"]["verdictBand"] == expected_band
    assert detail["verdict"]["verdictBand"] != "insufficient_scoring"
    assert detail["verdict"]["basis"]["dialecticalStrength"] == strength
    assert detail["verdict"]["basis"]["tauCoverage"] == 1.0
    assert detail["verdict"]["basis"]["tauSourceMajority"] == "judge_strength"


def test_rerun_failure_never_breaks_scoring_completion(db, monkeypatch) -> None:
    debate = _completed_v2_debate(db)
    job = queue_scoring_job(db, debate, model_id="codex-test-model")
    db.commit()

    def boom(*args, **kwargs):
        raise RuntimeError("protocol re-run exploded")

    monkeypatch.setattr("app.scoring.jobs.run_protocol_analysis", boom)
    run_scoring_job_background(job.id, debate.id, registry_factory=_judge_registry)  # must not raise

    db.expire_all()
    assert db.get(Job, job.id).status == "complete"
    scoring_runs = db.scalars(
        select(AnalyzerRun).where(
            AnalyzerRun.debate_id == debate.id,
            AnalyzerRun.analyzer_type == SCORING_ANALYZER_TYPE,
        )
    ).all()
    assert len(scoring_runs) == 1  # scoring truth stayed durable
    assert len(_protocol_runs(db, debate.id)) == 1  # only the synthesis-time run


def test_lifecycle_failure_does_not_skip_rerun(db, monkeypatch) -> None:
    debate = _completed_v2_debate(db)
    job = queue_scoring_job(db, debate, model_id="codex-test-model")
    db.commit()

    def boom(*args, **kwargs):
        raise RuntimeError("lifecycle reevaluation exploded")

    monkeypatch.setattr(
        "app.scoring.jobs.reevaluate_lifecycle_after_scoring_completion", boom
    )
    # Today's behavior: a lifecycle-tail exception propagates out of the
    # background task (scores are already durable). The re-run must still
    # have happened despite it.
    with pytest.raises(RuntimeError):
        run_scoring_job_background(job.id, debate.id, registry_factory=_judge_registry)

    db.expire_all()
    assert db.get(Job, job.id).status == "complete"
    assert len(_protocol_runs(db, debate.id)) == 2


def test_scoring_failure_leaves_synthesis_analysis_standing(db) -> None:
    # Bounded degradation: a scoring failure keeps today's behavior -- the
    # synthesis-time analysis stands, no re-run, and the debate payload still
    # serves (honestly, as insufficient_scoring).
    debate = _completed_v2_debate(db)
    job = queue_scoring_job(db, debate, model_id="codex-test-model")
    db.commit()

    def failing_runner(*args, **kwargs):
        raise RuntimeError("judge transport died")

    run_scoring_job_background(
        job.id, debate.id, registry_factory=_judge_registry, scoring_runner=failing_runner
    )

    db.expire_all()
    assert db.get(Job, job.id).status == "failed"
    assert len(_protocol_runs(db, debate.id)) == 1  # synthesis-time run stands

    detail = debate_to_dict(db, db.get(Debate, debate.id))
    assert detail["verdict"]["verdictBand"] == "insufficient_scoring"
    assert isinstance(detail["verdict"]["basis"]["dialecticalStrength"], float)
    assert detail["verdict"]["basis"]["tauCoverage"] == 0.0


# ---------------------------------------------------------------------------
# 2. Internal scoring trigger at v2 completion
# ---------------------------------------------------------------------------


def test_persist_v2_synthesis_fires_internal_scoring_trigger(db, monkeypatch) -> None:
    calls: list[str] = []
    monkeypatch.setattr(
        service, "trigger_internal_scoring_after_completion", lambda debate_id: calls.append(debate_id)
    )
    debate = _completed_v2_debate(db)
    assert calls == [debate.id]


def test_trigger_failure_never_fails_completion(db, monkeypatch) -> None:
    def boom(debate_id):
        raise RuntimeError("trigger exploded")

    monkeypatch.setattr(service, "trigger_internal_scoring_after_completion", boom)
    debate = _completed_v2_debate(db)  # asserts debate.status == "complete"
    assert debate.synthesis_id is not None


def test_drive_internal_scoring_claims_and_runs_pending_job(db) -> None:
    debate = _minimal_debate(db)
    job = queue_scoring_job(db, debate, model_id="codex-test-model")
    db.commit()
    ran: list[tuple[str, str]] = []

    result = drive_internal_scoring_for_debate(
        debate.id,
        registry_factory=_judge_registry,
        background_runner=lambda job_id, debate_id: ran.append((job_id, debate_id)),
    )

    assert result == job.id
    assert ran == [(job.id, debate.id)]
    db.expire_all()
    assert db.get(Job, job.id).status == "claimed"

    # Idempotency: a concurrent browser poll arriving after the internal
    # claim finds nothing pending -- the same state-machine dedup, no
    # duplicate scoring run.
    tasks = _CollectedTasks()
    second = wake_pending_internal_scoring_job(
        db,
        db.get(Debate, debate.id),
        tasks,
        registry_factory=_judge_registry,
        background_runner=lambda job_id, debate_id: ran.append((job_id, debate_id)),
    )
    assert second is None
    assert tasks.tasks == []
    assert ran == [(job.id, debate.id)]


def test_drive_internal_scoring_degrades_silently_without_provider(db, monkeypatch) -> None:
    debate = _minimal_debate(db)
    job = queue_scoring_job(db, debate, model_id="codex-test-model")
    db.commit()

    # Make the DEFAULT registry provider-absent (the repo's agents.yaml does
    # configure a judge, so absence must be simulated at the config loader):
    # the drive must be a silent no-op that never even claims the job.
    monkeypatch.setattr("app.providers.registry.load_agent_configs", lambda path=None: {})
    result = drive_internal_scoring_for_debate(debate.id)

    assert result is None
    db.expire_all()
    assert db.get(Job, job.id).status == "pending"


def test_drive_respects_stale_failure_budget(db) -> None:
    # W1's bounded stale-requeue channel is the drive's budget too: at
    # 2 * DIALECTICAL_MAX_JOB_ATTEMPTS (default 8) consecutive stale
    # failures the wake refuses; below it, it still requeues.
    debate = _minimal_debate(db)
    for _ in range(7):
        stale = queue_scoring_job(db, debate, model_id="codex-test-model")
        stale.status = "failed"
        stale.error = STALE_SCORING_JOB_ERROR
    db.commit()
    ran: list[tuple[str, str]] = []

    requeued = drive_internal_scoring_for_debate(
        debate.id,
        registry_factory=_judge_registry,
        background_runner=lambda job_id, debate_id: ran.append((job_id, debate_id)),
    )
    assert requeued is not None  # 7 stale failures: still within budget
    assert len(ran) == 1
    db.expire_all()
    requeued_job = db.get(Job, requeued)
    requeued_job.status = "failed"
    requeued_job.error = STALE_SCORING_JOB_ERROR
    db.commit()

    refused = drive_internal_scoring_for_debate(
        debate.id,
        registry_factory=_judge_registry,
        background_runner=lambda job_id, debate_id: ran.append((job_id, debate_id)),
    )
    assert refused is None  # 8th consecutive stale failure: budget exhausted
    assert len(ran) == 1


def test_v2_completion_trigger_thread_degrades_without_provider(db, monkeypatch) -> None:
    # Acceptance: a v2 debate completing WITHOUT any browser poll, in an env
    # with no scoring provider, must complete normally -- the real trigger
    # thread runs and degrades silently. Provider absence is simulated at the
    # config loader (the repo's agents.yaml configures a judge), so BOTH the
    # synthesis-time ensure call and the trigger thread's default registry
    # honestly report unavailable.
    monkeypatch.setattr("app.providers.registry.load_agent_configs", lambda path=None: {})
    threads = []
    original = scoring_jobs.trigger_internal_scoring_after_completion

    def capturing(debate_id):
        thread = original(debate_id)
        threads.append(thread)
        return thread

    monkeypatch.setattr(service, "trigger_internal_scoring_after_completion", capturing)
    debate = _completed_v2_debate(db)
    debate_id = debate.id

    assert len(threads) == 1 and threads[0] is not None
    threads[0].join(timeout=10)
    assert not threads[0].is_alive()

    db.expire_all()
    refreshed = db.get(Debate, debate_id)
    assert refreshed.status == "complete"
    scoring_jobs_rows = db.scalars(
        select(Job).where(Job.debate_id == debate_id, Job.job_type == "score_debate")
    ).all()
    # ensure_default_scoring queued the honest failed-unavailable job; the
    # trigger added nothing and ran nothing (no provider).
    assert [job.status for job in scoring_jobs_rows] == ["failed"]
    assert scoring_jobs_rows[0].error == UNAVAILABLE_SCORING_JOB_ERROR
    assert len(_protocol_runs(db, debate_id)) == 1


def test_v2_completion_without_browser_scores_and_reruns(db, monkeypatch) -> None:
    # Acceptance: with a scoring provider available, completion alone (no
    # browser poll) drives the whole chain: pending job queued at synthesis,
    # internally claimed and run, judge scores persisted, protocol analysis
    # re-run, verdict consuming real taus. The trigger is run synchronously
    # here (the thread hop is covered separately above).
    registry = _judge_registry()
    monkeypatch.setattr(service, "ProviderRegistry", lambda: registry)

    def sync_trigger(debate_id: str):
        return drive_internal_scoring_for_debate(
            debate_id,
            registry_factory=lambda: registry,
            background_runner=lambda job_id, d_id: run_scoring_job_background(
                job_id, d_id, registry_factory=lambda: registry
            ),
        )

    monkeypatch.setattr(service, "trigger_internal_scoring_after_completion", sync_trigger)

    debate = _completed_v2_debate(db)

    db.expire_all()
    scoring_jobs_rows = db.scalars(
        select(Job).where(Job.debate_id == debate.id, Job.job_type == "score_debate")
    ).all()
    assert [job.status for job in scoring_jobs_rows] == ["complete"]
    scoring_runs = db.scalars(
        select(AnalyzerRun).where(
            AnalyzerRun.debate_id == debate.id,
            AnalyzerRun.analyzer_type == SCORING_ANALYZER_TYPE,
        )
    ).all()
    assert len(scoring_runs) == 1
    protocol_runs = _protocol_runs(db, debate.id)
    assert len(protocol_runs) == 2
    assert protocol_runs[0].output["tauCoverage"] == 0.0
    assert protocol_runs[1].output["tauCoverage"] == 1.0

    detail = debate_to_dict(db, db.get(Debate, debate.id))
    assert detail["verdict"]["verdictBand"] != "insufficient_scoring"
    assert detail["verdict"]["basis"]["tauCoverage"] == 1.0
    assert detail["verdict"]["basis"]["tauSourceMajority"] == "judge_strength"
