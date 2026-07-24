"""Task 22 Fix B: a panel-enabled scoring pass must reliably persist an
aggregated node_scoring run. From the 2026-07-24 smoke3 meta-debate (~50 nodes,
3 judges/node, panel on): both score_debate jobs failed on 'database is locked'
mid-generation, the pass exceeded the 30-min deadline, retries force_refresh=
True RESTARTED all nodes, and 0 aggregated node_scoring runs persisted.

Three sub-causes, each covered here:
1. deadline scales with node * active-judge count (single-judge stays at the
   30-min base -- byte-identical),
2. a retry resumes from the NodeScoringResult cache (force_refresh=False) AND
   the resumed pass persists a complete aggregated run -- the cache-hit nodes'
   judge artifacts are re-attributed to the resuming job so the durable-artifact
   guard passes,
3. the write-heavy panel pass is deferred until generation quiesces, so it never
   cold-starts into the generation write-storm. Single-judge fires immediately
   (byte-identical).
"""
from __future__ import annotations

import json

import pytest
from sqlalchemy import select

from app.models.entities import AnalyzerRun, Job, NodeScoringResult
from app.scoring import queue_scoring_job
from app.scoring.jobs import (
    SCORING_BACKGROUND_JOB_DEADLINE_SECONDS,
    SCORING_PANEL_PER_NODE_JUDGE_DEADLINE_SECONDS,
    compute_scoring_job_deadline_seconds,
    run_scoring_job_background,
)
from app.scoring.service import SCORING_ANALYZER_TYPE
from app.services import dialectical_v2 as service

from test_score_before_synthesis import (
    _CountingJudgeProvider,
    _add_node,
    _bare_debate,
    _counting_judge_registry,
)


# ---------------------------------------------------------------------------
# Sub-cause 1: panel/size-aware deadline
# ---------------------------------------------------------------------------


def test_single_judge_deadline_is_base_regardless_of_node_count() -> None:
    """Panel OFF (panel_judge_count == 0) -> the 30-min base for ANY node
    count. Single-judge deadline is byte-identical to before Fix B."""
    for node_count in (0, 1, 10, 50, 500):
        assert (
            compute_scoring_job_deadline_seconds(node_count=node_count, panel_judge_count=0)
            == SCORING_BACKGROUND_JOB_DEADLINE_SECONDS
        )


def test_panel_deadline_scales_with_node_and_judge_count() -> None:
    base = SCORING_BACKGROUND_JOB_DEADLINE_SECONDS
    per = SCORING_PANEL_PER_NODE_JUDGE_DEADLINE_SECONDS

    # Exact scaling law: base + node_count * panel_judge_count * per-node-judge.
    assert compute_scoring_job_deadline_seconds(node_count=50, panel_judge_count=2) == base + 50 * 2 * per

    # Strictly monotonic in BOTH node count and judge count.
    assert compute_scoring_job_deadline_seconds(node_count=50, panel_judge_count=2) > compute_scoring_job_deadline_seconds(
        node_count=25, panel_judge_count=2
    )
    assert compute_scoring_job_deadline_seconds(node_count=50, panel_judge_count=2) > compute_scoring_job_deadline_seconds(
        node_count=50, panel_judge_count=1
    )

    # The smoke3 shape (50 nodes, 2 panel judges beyond the primary) comfortably
    # exceeds the old 30-min blanket deadline that killed the pass.
    assert compute_scoring_job_deadline_seconds(node_count=50, panel_judge_count=2) > base


def test_panel_deadline_zero_nodes_is_base() -> None:
    assert (
        compute_scoring_job_deadline_seconds(node_count=0, panel_judge_count=3)
        == SCORING_BACKGROUND_JOB_DEADLINE_SECONDS
    )


# ---------------------------------------------------------------------------
# Sub-cause 2: a retry resumes from cache AND persists the aggregated run
# ---------------------------------------------------------------------------


class _PoisonThenHealProvider(_CountingJudgeProvider):
    """Judges normally but raises a raw (non-Provider) error whenever asked to
    judge ``fail_node_id`` -- simulating the mid-pass 'database is locked' crash
    that killed the smoke3 panel pass. Set ``fail_node_id = None`` to disarm for
    the retry."""

    def __init__(self, fail_node_id: str) -> None:
        super().__init__()
        self.fail_node_id: str | None = fail_node_id

    def judge_node(self, request):
        if self.fail_node_id is not None and request.claim.node_id == self.fail_node_id:
            self.judged_node_ids.append(request.claim.node_id)
            raise RuntimeError("database is locked")
        return super().judge_node(request)


def _complete_scoring_runs(db, debate_id: str) -> list[AnalyzerRun]:
    return list(
        db.scalars(
            select(AnalyzerRun).where(
                AnalyzerRun.debate_id == debate_id,
                AnalyzerRun.analyzer_type == SCORING_ANALYZER_TYPE,
                AnalyzerRun.status == "complete",
            )
        ).all()
    )


def test_partial_pass_then_resume_persists_aggregated_run(db, monkeypatch) -> None:
    # The panel scenario: configured (the pass runs multi-judge in prod). Panel
    # members resolve to none in-test -- the resume mechanism is provider-count
    # independent.
    monkeypatch.setenv("DIALECTICAL_JUDGE_PANEL_MODELS", "panel-model-x")

    debate, root = _bare_debate(db)
    children = [
        _add_node(db, debate, root, node_type="CON" if i % 2 else "PRO", position=i + 1, claim=f"Child {i}")
        for i in range(4)
    ]
    db.commit()
    # Scoring order is materialized_path asc: root, child0, child1, child2,
    # child3. Poison the 3rd node overall (child1) so the pass dies partway.
    scoring_order = [root.id, *[c.id for c in children]]
    poison_id = children[1].id
    poison_index = scoring_order.index(poison_id)

    provider = _PoisonThenHealProvider(fail_node_id=poison_id)
    factory = _counting_judge_registry(provider)

    # Pass 1: dies on the poison node.
    job1 = queue_scoring_job(db, debate, model_id="codex-test-model")
    db.commit()
    run_scoring_job_background(job1.id, debate.id, registry_factory=factory, force_refresh=False)
    db.expire_all()
    assert db.get(Job, job1.id).status == "failed"
    # No aggregated run yet -- a pass that dies mid-way persists per-node cache
    # rows but NEVER the aggregated node_scoring run (the smoke3 failure).
    assert _complete_scoring_runs(db, debate.id) == []
    # ...but the head nodes (before the poison) were durably cached.
    cached_node_ids = set(
        db.scalars(select(NodeScoringResult.node_id).where(NodeScoringResult.debate_id == debate.id)).all()
    )
    assert set(scoring_order[:poison_index]) <= cached_node_ids

    # Retry: resume from cache (force_refresh=False), disarmed.
    provider.fail_node_id = None
    provider.judged_node_ids.clear()
    job2 = queue_scoring_job(db, debate, model_id="codex-test-model")
    db.commit()
    run_scoring_job_background(job2.id, debate.id, registry_factory=factory, force_refresh=False)
    db.expire_all()

    # The retry judged ONLY the tail (poison node onward); the head came from
    # the NodeScoringResult cache (resume, not restart).
    assert provider.judged_node_ids == scoring_order[poison_index:]
    # And the resumed pass persisted a COMPLETE aggregated run covering EVERY
    # node -- including the cache-served head nodes.
    assert db.get(Job, job2.id).status == "complete"
    runs = _complete_scoring_runs(db, debate.id)
    assert len(runs) >= 1
    latest = max(runs, key=lambda r: (r.seq or 0))
    scored_ids = {item["node_id"] for item in latest.output.get("items", [])}
    assert set(scoring_order) <= scored_ids


# ---------------------------------------------------------------------------
# Sub-cause 2 wiring: the browser-poll wake resumes (force_refresh=False),
# while the explicit user POST keeps force_refresh=True.
# ---------------------------------------------------------------------------


def test_browser_poll_wake_runner_resumes_with_cache_not_force_refresh(monkeypatch) -> None:
    """The browser-poll wake's background runner threads force_refresh=False so
    a retry of a partial/failed pass resumes from the cache rather than
    restarting all nodes (the T20 explicit-POST path keeps force_refresh=True)."""
    from app.api import scoring as scoring_api

    captured: dict = {}
    monkeypatch.setattr(
        scoring_api,
        "run_scoring_job_background",
        lambda job_id, debate_id, *, force_refresh=True, **kw: captured.update(force_refresh=force_refresh),
    )

    scoring_api._resume_scoring_job_background("job-x", "debate-y")

    assert captured.get("force_refresh") is False


def test_explicit_post_runner_keeps_force_refresh_true(monkeypatch) -> None:
    from app.api import scoring as scoring_api

    captured: dict = {}
    monkeypatch.setattr(
        scoring_api,
        "run_scoring_job_background",
        lambda job_id, debate_id, *, force_refresh=True, **kw: captured.update(force_refresh=force_refresh),
    )

    scoring_api._run_scoring_job_background("job-x", "debate-y")

    assert captured.get("force_refresh") is True


# ---------------------------------------------------------------------------
# Sub-cause 3: defer the panel pass until generation quiesces
# ---------------------------------------------------------------------------


def test_single_judge_pre_synthesis_scoring_fires_during_generation(monkeypatch) -> None:
    """Panel OFF: the pre-synthesis scoring trigger fires immediately, even
    while generation is still pending -- byte-identical overlap-with-generation
    behavior."""
    monkeypatch.setenv("DIALECTICAL_SCORE_BEFORE_SYNTHESIS", "1")
    monkeypatch.delenv("DIALECTICAL_JUDGE_PANEL_MODELS", raising=False)

    assert service.should_fire_pre_synthesis_scoring(generation_pending=True) is True
    assert service.should_fire_pre_synthesis_scoring(generation_pending=False) is True
    assert service.defer_panel_scoring_during_generation() is False


def test_panel_pre_synthesis_scoring_deferred_until_quiescent(monkeypatch) -> None:
    """Panel ON: the write-heavy pass is deferred while generation is pending
    and only fires once the tree quiesces."""
    monkeypatch.setenv("DIALECTICAL_SCORE_BEFORE_SYNTHESIS", "1")
    monkeypatch.setenv("DIALECTICAL_JUDGE_PANEL_MODELS", "panel-model-x")

    assert service.defer_panel_scoring_during_generation() is True
    assert service.should_fire_pre_synthesis_scoring(generation_pending=True) is False
    assert service.should_fire_pre_synthesis_scoring(generation_pending=False) is True


def test_pre_synthesis_scoring_never_fires_when_flag_off(monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_SCORE_BEFORE_SYNTHESIS", "false")
    monkeypatch.setenv("DIALECTICAL_JUDGE_PANEL_MODELS", "panel-model-x")

    assert service.should_fire_pre_synthesis_scoring(generation_pending=False) is False
    assert service.should_fire_pre_synthesis_scoring(generation_pending=True) is False
