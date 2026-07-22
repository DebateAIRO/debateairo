"""Model-level regression guards for app.scoring.models.

Final-branch-review item 1: NodeScoringPayload.score_provenance's
default_factory used to hardcode reducer_version="node-scoring-reducer-v1"
(and rubric_version="debateai-rubric-v1") as string literals, so a bare
construction (no explicit score_provenance=...) could silently mint
provenance claiming stale reducer math even after app.scoring.reducer's
REDUCER_VERSION moved on (v1 -> v2 -> v3, see reducer.py's own Task 4/Task 5
version-bump commentary). The real reduce_assessments() pipeline never hit
this -- it always stamps ScoreProvenance explicitly with the live
REDUCER_VERSION/RUBRIC_VERSION (app/scoring/reducer.py) -- but any OTHER
bare construction (test fixtures included: see
explicit_depth_pressure_payload in test_node_scoring.py) silently inherited
whatever the model's own default said, independent of the live contract.
"""
from __future__ import annotations

from app.scoring.models import (
    NodeScores,
    NodeScoringPayload,
    NormalizedClaim,
    ScoreLabels,
    ScoreRationale,
)
from app.scoring.reducer import REDUCER_VERSION, RUBRIC_VERSION


def _bare_payload() -> NodeScoringPayload:
    """A minimal, valid NodeScoringPayload built WITHOUT score_provenance=...,
    so the field's default_factory is what actually runs."""
    return NodeScoringPayload(
        node_id="node-1",
        claim=NormalizedClaim(node_id="node-1", raw_text="x", core_claim="x"),
        scores=NodeScores(
            strength=0.5,
            uncertainty=0.5,
            impact=0.5,
            evidence_quality=0.5,
            relevance=0.5,
            logical_validity=0.5,
            assumption_risk=0.5,
            counter_resilience=0.5,
        ),
        labels=ScoreLabels(strength_label="mixed", uncertainty_label="medium", impact_label="medium"),
        holes=[],
        fatal_flags=[],
        score_caps=[],
        judge_disagreements=[],
        recommended_investigations=[],
        rationale=ScoreRationale(
            short="x",
            why_not_higher="x",
            why_not_lower="x",
            weakest_link="x",
        ),
    )


def test_default_score_provenance_matches_live_reducer_contract() -> None:
    payload = _bare_payload()

    # The structural guarantee that matters: the default reads the SAME
    # constants reducer.py's own reduce_assessments() stamps, so the two can
    # never drift apart -- a future REDUCER_VERSION/RUBRIC_VERSION bump is
    # automatically reflected here without touching this test or the model.
    assert payload.score_provenance.reducer_version == REDUCER_VERSION
    assert payload.score_provenance.rubric_version == RUBRIC_VERSION

    # Pinned today's values too, so a regression back to a hardcoded literal
    # (e.g. re-introducing "node-scoring-reducer-v1") fails loudly here even
    # if REDUCER_VERSION itself were (wrongly) left unbumped elsewhere.
    assert payload.score_provenance.reducer_version == "node-scoring-reducer-v3"
    assert payload.score_provenance.rubric_version == "debateai-rubric-v1"
