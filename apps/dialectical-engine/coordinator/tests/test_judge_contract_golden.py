"""Golden contract test: a fixture debate scored by the active judge produces
stable identity, correct provenance, and zero raw-output leakage.

This test locks the whole judge-contract chain end to end:
  - registry identity (PRIMARY_NODE_SCORING_JUDGE is the sole active "judge" contract)
  - every persisted JudgeOutputArtifact / NodeScoringResult row is stamped with
    node_scoring.primary / v1 / the contract's hash
  - the public scoring payload never leaks raw provider output or the internal
    "judge_id" wire name
"""
from __future__ import annotations

import json

import pytest
from sqlalchemy import select

from app.models.entities import Debate, Generation, JudgeOutputArtifact, Node, NodeScoringResult, Worker
from app.providers import AgentConfig, ProviderRegistry
from app.scoring import ScoringProviderResult
from app.scoring.jobs import run_scoring_job_background
from app.scoring.judge_registry import PRIMARY_NODE_SCORING_JUDGE, active_contract
from app.scoring.service import debate_scoring_payload, queue_scoring_job

from test_node_scoring import base_assessment


def test_active_judge_set_is_exactly_the_expected_registry() -> None:
    assert active_contract("judge") is PRIMARY_NODE_SCORING_JUDGE
    assert PRIMARY_NODE_SCORING_JUDGE.judge_id == "node_scoring.primary"
    assert PRIMARY_NODE_SCORING_JUDGE.judge_version == "v1"


@pytest.fixture()
def scored_fixture_debate(db):
    """Mock-provider end-to-end scoring fixture: a two-node debate scored via
    the real background scoring job pipeline (queue_scoring_job ->
    run_scoring_job_background -> score_debate_with_provider_registry),
    reusing the pattern from
    test_background_scoring_job_persists_judge_artifacts_before_public_analyzer_snapshot
    in test_node_scoring.py."""

    class GoldenFixtureProvider:
        provider = "test-golden-judge"
        model = "golden-test-model"

        def __init__(self) -> None:
            self.calls = 0

        def judge_node(self, request):
            self.calls += 1
            return ScoringProviderResult(
                provider=self.provider,
                model=self.model,
                raw_output=json.dumps(
                    {
                        **base_assessment(node_id=request.claim.node_id).model_dump(mode="json"),
                        "_private_test_marker": f"GOLDEN-RAW-OUTPUT-{self.calls}",
                    }
                ),
                latency_ms=21,
                checked_at="2026-06-18T10:15:30+00:00",
                metadata={"provider_response_id": f"resp-golden-{self.calls}"},
            )

    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    worker = Worker(id="worker-golden", name="Worker Golden", token_hash="hash", capabilities=["debate"])
    root = Node(
        id="golden-root-node",
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves retention.",
        status="complete",
        materialized_path="/",
    )
    root_generation = Generation(
        id="golden-generation-root",
        node=root,
        model_id="model-a",
        role="pro",
        argument="Employees are less likely to leave when commutes are removed.",
        worker_id=worker.id,
    )
    root.active_generation_id = root_generation.id
    child = Node(
        id="golden-child-node",
        debate=debate,
        parent=root,
        node_type="support",
        depth=1,
        position=0,
        claim="Remote work expands hiring pools.",
        status="complete",
        materialized_path="/0001",
    )
    child_generation = Generation(
        id="golden-generation-child",
        node=child,
        model_id="model-a",
        role="pro",
        argument="Removing geographic constraints widens the candidate pool.",
        worker_id=worker.id,
    )
    child.active_generation_id = child_generation.id
    db.add_all([debate, worker, root, root_generation, child, child_generation])
    db.flush()
    debate.root_node_id = root.id
    job = queue_scoring_job(db, debate, model_id="golden-test-model")
    db.commit()

    registry = ProviderRegistry(
        agents={"judge": AgentConfig(provider="golden", model="golden-test-model", temperature=0.0)},
        providers={"golden": GoldenFixtureProvider()},
    )

    run_scoring_job_background(job.id, debate.id, registry_factory=lambda: registry)

    db.expire_all()
    return debate


@pytest.fixture()
def scored_fixture_debate_payload(db, scored_fixture_debate):
    return debate_scoring_payload(db, scored_fixture_debate)


def test_scored_fixture_debate_produces_contract_stamped_rows(
    db, scored_fixture_debate  # reuse the mock-provider end-to-end fixture from existing service tests
) -> None:
    artifacts = db.scalars(select(JudgeOutputArtifact)).all()
    results = db.scalars(select(NodeScoringResult)).all()
    assert artifacts and results
    for row in [*artifacts, *results]:
        assert row.judge_id == "node_scoring.primary"
        assert row.judge_version == "v1"
        assert row.contract_hash == PRIMARY_NODE_SCORING_JUDGE.contract_hash


def test_public_payload_has_no_raw_output_leakage(db, scored_fixture_debate_payload) -> None:
    assert scored_fixture_debate_payload["status"] == "available"
    assert scored_fixture_debate_payload["items"]
    payload_text = json.dumps(scored_fixture_debate_payload)
    assert "raw_output" not in payload_text
    assert "GOLDEN-RAW-OUTPUT" not in payload_text
    # judge identity, when exposed publicly, must use DDD names only:
    assert "judge_id" not in payload_text  # wire name stays internal
