"""W5b: read-only ops endpoints.

GET /api/ops/jobs: recent job transitions + current job counts, bounded.
GET /api/ops/verdict-shadow: evidence-gate shadow aggregates over the most
recent completed debates, derived on demand through the single verdict
derivation path -- never raises, skips bad debates with a counted error.
Both gate on the user token like the existing admin-ish settings surface.
"""
from __future__ import annotations

import asyncio
from datetime import timedelta

from fastapi.testclient import TestClient

from app.core.auth import hash_token
from app.main import app
from app.models.entities import AnalyzerRun, Debate, DebateBranch, Job, Node, Worker, now_utc
from app.services.orchestrator import claim_pending_job, create_debate, fail_job

AUTH = {"Authorization": "Bearer user_test_token"}


def _worker(db, *, name: str = "ops-worker") -> Worker:
    worker = Worker(
        name=name,
        token_hash=hash_token(f"{name}-token"),
        capabilities=["mock-local"],
        last_seen=now_utc(),
        status="online",
    )
    db.add(worker)
    db.commit()
    return worker


def _completed_debate(db, *, topic: str, offset_s: int) -> tuple[Debate, Node, DebateBranch]:
    debate = Debate(
        topic=topic,
        status="complete",
        config={"max_depth": 1},
        completed_at=now_utc() - timedelta(seconds=offset_s),
    )
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
    branch = DebateBranch(debate_id=debate.id, root_node_id=root.id, status="active")
    db.add(branch)
    db.commit()
    return debate, root, branch


def _protocol_run(db, debate: Debate, branch: DebateBranch, root: Node, output: dict) -> None:
    db.add(
        AnalyzerRun(
            debate_id=debate.id,
            branch_id=branch.id,
            analyzer_type="protocol_analysis",
            output=output,
            status="complete",
            provenance={"scoring_source": "protocol_analysis", "debate_id": debate.id},
        )
    )
    db.commit()


# ---------------------------------------------------------------------------
# /api/ops/jobs
# ---------------------------------------------------------------------------


def test_ops_jobs_requires_user_token(db) -> None:
    client = TestClient(app)
    assert client.get("/api/ops/jobs").status_code == 401
    assert client.get("/api/ops/jobs", headers={"Authorization": "Bearer wrong"}).status_code == 403
    assert client.get("/api/ops/verdict-shadow").status_code == 401


def test_ops_jobs_returns_bounded_transitions_and_counts(db) -> None:
    worker = _worker(db)
    create_debate(db, "Should cities ban cars?")
    job = claim_pending_job(db, worker)
    assert job is not None
    asyncio.run(fail_job(db, job, "provider unavailable", retryable=False))

    client = TestClient(app)
    payload = client.get("/api/ops/jobs", headers=AUTH).json()

    channels = [row["channel"] for row in payload["transitions"]]
    assert channels[0] == "terminalize", "newest first"
    assert {"create", "claim", "terminalize"} <= set(channels)
    row = payload["transitions"][0]
    assert row["job_id"] == job.id
    assert row["from_status"] == "running" and row["to_status"] == "failed"
    assert row["created_at"]
    assert payload["job_counts"] == [{"job_type": "decompose", "status": "failed", "count": 1}]
    assert payload["job_counts_by_status"] == {"failed": 1}

    bounded = client.get("/api/ops/jobs?limit=2", headers=AUTH).json()
    assert len(bounded["transitions"]) == 2 and bounded["limit"] == 2
    assert client.get("/api/ops/jobs?limit=0", headers=AUTH).status_code == 422
    assert client.get("/api/ops/jobs?limit=501", headers=AUTH).status_code == 422


# ---------------------------------------------------------------------------
# /api/ops/verdict-shadow
# ---------------------------------------------------------------------------


def test_verdict_shadow_aggregates_scored_unscored_and_gate_shadowed(db, monkeypatch) -> None:
    # (a) gate-shadowed: empirical claim, judge-covered scoring, NO evidence
    # nodes -> shadow wouldSuppress (a real flip candidate).
    shadowed, shadowed_root, shadowed_branch = _completed_debate(
        db, topic="Empirical and evidence-free", offset_s=10
    )
    _protocol_run(
        db,
        shadowed,
        shadowed_branch,
        shadowed_root,
        {
            "dialecticalStrengths": {shadowed_root.id: 0.8},
            "tauCoverage": 1.0,
            "verificationStatuses": {shadowed_root.id: "verified"},
            "convergence": {"converged": True, "reason": None, "epsilon": 0.05},
            "claimTypes": {shadowed_root.id: "empirical"},
            "claimTypeSource": {shadowed_root.id: "protocol"},
        },
    )
    # (b) scored, non-empirical claim -> never suppressed.
    scored, scored_root, scored_branch = _completed_debate(
        db, topic="Normative and contested", offset_s=20
    )
    _protocol_run(
        db,
        scored,
        scored_branch,
        scored_root,
        {
            "dialecticalStrengths": {scored_root.id: 0.5},
            "tauCoverage": 0.6,
            "verificationStatuses": {scored_root.id: "verified"},
            "convergence": {"converged": True, "reason": None, "epsilon": 0.05},
            "claimTypes": {scored_root.id: "normative"},
            "claimTypeSource": {scored_root.id: "protocol"},
        },
    )
    # (c) unscored: completed debate with no protocol run at all.
    _completed_debate(db, topic="Never scored", offset_s=30)

    client = TestClient(app)
    payload = client.get("/api/ops/verdict-shadow", headers=AUTH).json()

    assert payload["sampled"] == 3 and payload["errors"] == 0
    assert payload["gateEnabled"] is False
    by_id = {row["debateId"]: row for row in payload["debates"]}

    shadowed_row = by_id[shadowed.id]
    assert shadowed_row["verdictBand"] == "supported"
    assert shadowed_row["preGateVerdictBand"] == "supported"
    assert shadowed_row["wouldSuppress"] is True and shadowed_row["suppressed"] is False
    assert shadowed_row["tauCoverage"] == 1.0
    assert shadowed_row["claimType"] == "empirical"

    scored_row = by_id[scored.id]
    assert scored_row["verdictBand"] == "contested"
    assert scored_row["wouldSuppress"] is False
    assert scored_row["tauCoverage"] == 0.6
    assert scored_row["claimType"] == "normative"

    unscored_row = by_id[[key for key in by_id if key not in (shadowed.id, scored.id)][0]]
    assert unscored_row["verdictBand"] == "unavailable"
    assert unscored_row["tauCoverage"] is None
    assert unscored_row["wouldSuppress"] is False

    aggregates = payload["aggregates"]
    assert aggregates["bandHistogram"] == {"contested": 1, "supported": 1, "unavailable": 1}
    assert aggregates["preGateBandHistogram"] == {"contested": 1, "supported": 1, "unavailable": 1}
    assert aggregates["wouldFlipCount"] == 1
    assert aggregates["coverageHistogram"] == {"0.50-0.75": 1, "1.00": 1, "unavailable": 1}
    assert aggregates["claimTypeHistogram"] == {"empirical": 1, "normative": 1, "unknown": 1}


def test_verdict_shadow_bounded_and_ordered_by_recency(db) -> None:
    for index in range(4):
        _completed_debate(db, topic=f"Debate {index}", offset_s=index * 60)

    client = TestClient(app)
    payload = client.get("/api/ops/verdict-shadow?limit=2", headers=AUTH).json()

    assert payload["sampled"] == 2
    completed = [row["completedAt"] for row in payload["debates"]]
    assert completed == sorted(completed, reverse=True), "most recent completed debates first"
    assert client.get("/api/ops/verdict-shadow?limit=0", headers=AUTH).status_code == 422


def test_verdict_shadow_never_raises_and_counts_bad_debates(db, monkeypatch) -> None:
    good, good_root, good_branch = _completed_debate(db, topic="Healthy debate", offset_s=10)
    bad, _, _ = _completed_debate(db, topic="Poisoned debate", offset_s=20)

    from app.api import ops as ops_module

    real_derive = ops_module.derive_debate_verdict

    def _derive(db_arg, debate, **kwargs):
        if debate.id == bad.id:
            raise RuntimeError("corrupted stored analysis")
        return real_derive(db_arg, debate, **kwargs)

    monkeypatch.setattr(ops_module, "derive_debate_verdict", _derive)

    client = TestClient(app)
    response = client.get("/api/ops/verdict-shadow", headers=AUTH)

    assert response.status_code == 200
    payload = response.json()
    assert payload["sampled"] == 1 and payload["errors"] == 1
    assert [row["debateId"] for row in payload["debates"]] == [good.id]


# ---------------------------------------------------------------------------
# /api/ops/expansion (FW2 P0.4)
#
# The flip plan directs the operator to /api/ops/* and there was nothing
# there for adaptive expansion at all: whether growth is running, why it
# stopped, where the frontier sat relative to the floor, and which records
# won the budget were all reconstructable only by hand-querying SQLite on a
# live box.
# ---------------------------------------------------------------------------


def test_ops_expansion_requires_user_token(db) -> None:
    client = TestClient(app)
    assert client.get("/api/ops/expansion").status_code == 401
    assert (
        client.get("/api/ops/expansion", headers={"Authorization": "Bearer wrong"}).status_code
        == 403
    )


def test_ops_expansion_reports_state_histogram_and_frontier_head(
    db, monkeypatch, categorical_decisions_factory
) -> None:
    from app.exploration.expansion_dispatch import expansion_dispatch

    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "1")
    monkeypatch.setenv("DIALECTICAL_EXPANSION_WAVE_WIDTH", "2")
    debate, _records, run_id = categorical_decisions_factory(
        db, priorities=[0.9, 0.7, 0.5, 0.01]
    )
    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run_id)

    client = TestClient(app)
    payload = client.get(f"/api/ops/expansion?debate_id={debate.id}", headers=AUTH).json()

    assert payload["adaptiveExpansionEnabled"] is True
    assert payload["floor"] == 0.15
    assert payload["waveWidth"] == 2
    assert len(payload["debates"]) == 1
    row = payload["debates"][0]
    assert row["debateId"] == debate.id
    assert row["roundsCompleted"] == 1
    assert row["growthStartedAt"]
    assert row["growthElapsedSeconds"] >= 0
    # The three stop-rail-adjacent diagnostics the flip plan needs.
    assert row["frontierPriorityDistribution"]["n_ranked"] == 4
    assert row["frontierPriorityDistribution"]["n_below_floor"] == 1
    assert row["wavePolarity"] == {"PRO": 0, "CON": 2}
    assert row["dispatchOutcomeHistogram"] == {
        "spawned": 2,
        "wave_full": 1,
        "below_priority_floor": 1,
    }
    # Frontier head, priority-descending: the order budget was spent in.
    priorities = [record["frontierPriority"] for record in row["topRecords"]]
    assert priorities == sorted(priorities, reverse=True)
    assert priorities[0] == 0.9
    assert row["topRecords"][0]["dispatchOutcome"] == "spawned"
    assert row["topRecords"][0]["signalClass"] == "categorical"


def test_ops_expansion_is_bounded_and_read_only(
    db, monkeypatch, categorical_decisions_factory
) -> None:
    from app.exploration.expansion_dispatch import expansion_dispatch

    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "1")
    debate, _records, run_id = categorical_decisions_factory(db, priorities=[0.9, 0.7, 0.5])
    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run_id)
    before = dict(db.get(Debate, debate.id).config or {})

    client = TestClient(app)
    bounded = client.get("/api/ops/expansion?top=1&limit=1", headers=AUTH).json()

    assert len(bounded["debates"]) == 1
    assert len(bounded["debates"][0]["topRecords"]) == 1
    assert client.get("/api/ops/expansion?limit=0", headers=AUTH).status_code == 422
    assert client.get("/api/ops/expansion?top=0", headers=AUTH).status_code == 422
    # Read-only discipline, like the two endpoints above: serving the surface
    # must never mutate the state it reports.
    db.expire_all()
    assert dict(db.get(Debate, debate.id).config or {}) == before


def test_ops_expansion_reports_a_debate_that_never_dispatched(db) -> None:
    """A debate with no adaptive-expansion state is reported honestly --
    nulls, not fabricated zeros -- so "never ran" and "ran and found nothing"
    stay distinguishable."""
    debate, _root, _branch = _completed_debate(db, topic="Untouched debate", offset_s=5)

    client = TestClient(app)
    row = client.get(f"/api/ops/expansion?debate_id={debate.id}", headers=AUTH).json()["debates"][0]

    assert row["roundsCompleted"] == 0
    assert row["stoppedBecause"] is None
    # Not the debate's ROW AGE: the growth clock was never stamped, and
    # reporting age as growth time on this surface would read as a debate
    # that has been growing for as long as it has existed.
    assert row["growthStartedAt"] is None
    assert row["growthElapsedSeconds"] is None
    assert row["frontierPriorityDistribution"] is None
    assert row["wavePolarity"] is None
    assert row["dispatchOutcomeHistogram"] == {}
    assert row["topRecords"] == []
