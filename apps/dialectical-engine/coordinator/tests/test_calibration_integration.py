"""Phase 8 Task 2: flag-gated calibration-weight integration at the
plural-judge seam (``_attach_plural_judge_provenance`` in
``app/scoring/service.py``).

Reuses the real fixture pattern from
``test_score_node_with_provider_exposes_plural_provenance_from_distinct_persisted_judges``
in ``tests/test_node_scoring.py``: real ``Debate``/``Node``/``Generation``
rows, real fake ``ScoringProvider`` classes whose ``judge_node`` responses
persist real ``JudgeOutputArtifact`` rows via ``score_node_with_provider``,
never hand-built fake JSON standing in for a computation path.
"""

from __future__ import annotations

import json

from app.models.entities import Debate, Generation, Node, Worker
from app.scoring import (
    ClaimAssessment,
    ContextAssessment,
    CriticAssessment,
    EvidenceAssessment,
    NormalizedClaim,
    reduce_assessments,
    score_node_with_provider,
)
from app.scoring.judges import ScoringProviderResult
from app.scoring.normalizer import normalize_claim

from test_node_scoring import base_assessment


def _build_debate_and_node(db) -> tuple[Debate, Node]:
    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    worker = Worker(id="worker-a", name="Worker A", token_hash="hash", capabilities=["debate"])
    node = Node(
        id="node-1",
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves retention.",
        status="complete",
        materialized_path="/",
    )
    generation = Generation(
        id="generation-1",
        node=node,
        model_id="model-a",
        role="pro",
        argument="Employees are less likely to leave when commutes are removed.",
        worker_id=worker.id,
    )
    node.active_generation_id = generation.id
    db.add_all([debate, worker, node, generation])
    db.flush()
    debate.root_node_id = node.id
    db.commit()
    return debate, node


class _ClaudeJudgeProvider:
    provider = "anthropic"
    model = "claude-3-sonnet"

    def judge_node(self, request):
        return ScoringProviderResult(
            provider=self.provider,
            model=self.model,
            raw_output=json.dumps(
                base_assessment(
                    node_id=request.claim.node_id,
                    evidence=EvidenceAssessment(
                        evidence_quality=0.8,
                        evidence_relevance=0.8,
                        evidence_sufficiency=0.8,
                        source_reliability=0.8,
                        freshness=0.8,
                    ),
                ).model_dump(mode="json")
            ),
            latency_ms=10,
            checked_at="2026-07-07T10:15:30+00:00",
        )


class _ClaudeVerifierProvider:
    provider = "anthropic"
    model = "claude-3-opus"

    def judge_node(self, request):
        return ScoringProviderResult(
            provider=self.provider,
            model=self.model,
            raw_output=json.dumps(
                base_assessment(
                    node_id=request.claim.node_id,
                    evidence=EvidenceAssessment(
                        evidence_quality=0.3,
                        evidence_relevance=0.3,
                        evidence_sufficiency=0.3,
                        source_reliability=0.3,
                        freshness=0.3,
                    ),
                ).model_dump(mode="json")
            ),
            latency_ms=12,
            checked_at="2026-07-07T10:16:30+00:00",
        )


class _SoleJudgeProvider:
    provider = "anthropic"
    model = "claude-3-haiku"

    def judge_node(self, request):
        return ScoringProviderResult(
            provider=self.provider,
            model=self.model,
            raw_output=json.dumps(base_assessment(node_id=request.claim.node_id).model_dump(mode="json")),
            latency_ms=9,
            checked_at="2026-07-07T10:17:30+00:00",
        )


def test_calibration_metadata_always_recorded_flag_off(db, monkeypatch) -> None:
    monkeypatch.delenv("DIALECTICAL_CALIBRATION_WEIGHTS", raising=False)
    debate, node = _build_debate_and_node(db)

    score_node_with_provider(
        db,
        debate,
        node.id,
        _ClaudeJudgeProvider(),
        judge_role="primary_judge",
        force_refresh=True,
    )
    payload = score_node_with_provider(
        db,
        debate,
        node.id,
        _ClaudeVerifierProvider(),
        judge_role="verifier_judge",
        force_refresh=True,
    )

    item = payload["items"][0]
    assert item["score_provenance"]["calibrationApplied"] is False
    assert item["score_provenance"]["discountFactor"] == 0.5
    assert len(item["score_provenance"]["calibrationWeights"]["weights"]) == 2


def test_calibration_flag_off_leaves_scores_byte_identical(db, monkeypatch) -> None:
    monkeypatch.delenv("DIALECTICAL_CALIBRATION_WEIGHTS", raising=False)
    debate, node = _build_debate_and_node(db)

    score_node_with_provider(
        db,
        debate,
        node.id,
        _ClaudeJudgeProvider(),
        judge_role="primary_judge",
        force_refresh=True,
    )
    payload = score_node_with_provider(
        db,
        debate,
        node.id,
        _ClaudeVerifierProvider(),
        judge_role="verifier_judge",
        force_refresh=True,
    )

    item = payload["items"][0]

    claim = normalize_claim(node_id=node.id, raw_text=node.claim)
    verifier_assessment = base_assessment(
        node_id=node.id,
        evidence=EvidenceAssessment(
            evidence_quality=0.3,
            evidence_relevance=0.3,
            evidence_sufficiency=0.3,
            source_reliability=0.3,
            freshness=0.3,
        ),
    )
    direct = reduce_assessments(claim, verifier_assessment).model_dump(mode="json")
    assert item["scores"] == direct["scores"]


def test_calibration_single_judgment_never_applies_discount(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_CALIBRATION_WEIGHTS", "true")
    debate, node = _build_debate_and_node(db)

    payload = score_node_with_provider(
        db,
        debate,
        node.id,
        _SoleJudgeProvider(),
        judge_role="judge",
        force_refresh=True,
    )

    item = payload["items"][0]
    assert item["score_provenance"]["calibrationApplied"] is False
    assert item["score_provenance"]["calibrationWeights"]["applicable"] is False


def test_calibration_weighted_aggregate_applied_when_flag_on_and_plural(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_CALIBRATION_WEIGHTS", "true")
    debate, node = _build_debate_and_node(db)

    class ClaudePrimaryProvider:
        provider = "anthropic"
        model = "claude-3-sonnet"

        def judge_node(self, request):
            return ScoringProviderResult(
                provider=self.provider,
                model=self.model,
                raw_output=json.dumps(
                    base_assessment(
                        node_id=request.claim.node_id,
                        evidence=EvidenceAssessment(
                            evidence_quality=0.9,
                            evidence_relevance=0.9,
                            evidence_sufficiency=0.9,
                            source_reliability=0.9,
                            freshness=0.9,
                        ),
                    ).model_dump(mode="json")
                ),
                latency_ms=10,
                checked_at="2026-07-07T10:15:30+00:00",
            )

    class ClaudeVerifierProvider:
        provider = "anthropic"
        model = "claude-3-opus"

        def judge_node(self, request):
            return ScoringProviderResult(
                provider=self.provider,
                model=self.model,
                raw_output=json.dumps(
                    base_assessment(
                        node_id=request.claim.node_id,
                        critic=CriticAssessment(
                            logical_validity=0.3,
                            assumption_risk=0.6,
                            counterargument_strength=0.4,
                        ),
                        evidence=EvidenceAssessment(
                            evidence_quality=0.1,
                            evidence_relevance=0.2,
                            evidence_sufficiency=0.1,
                            source_reliability=0.1,
                            freshness=0.1,
                        ),
                    ).model_dump(mode="json")
                ),
                latency_ms=12,
                checked_at="2026-07-07T10:16:30+00:00",
            )

    class GptJudgeProvider:
        provider = "codex"
        model = "gpt-5.2-codex"

        def judge_node(self, request):
            return ScoringProviderResult(
                provider=self.provider,
                model=self.model,
                raw_output=json.dumps(
                    base_assessment(
                        node_id=request.claim.node_id,
                        context=ContextAssessment(relevance=0.5, impact=0.5, dependency_weight=0.5),
                    ).model_dump(mode="json")
                ),
                latency_ms=14,
                checked_at="2026-07-07T10:17:30+00:00",
            )

    score_node_with_provider(
        db, debate, node.id, ClaudePrimaryProvider(), judge_role="primary_judge", force_refresh=True
    )
    score_node_with_provider(
        db, debate, node.id, ClaudeVerifierProvider(), judge_role="verifier_judge", force_refresh=True
    )
    payload = score_node_with_provider(
        db, debate, node.id, GptJudgeProvider(), judge_role="third_judge", force_refresh=True
    )

    item = payload["items"][0]
    assert item["score_provenance"]["calibrationApplied"] is True

    claim = normalize_claim(node_id=node.id, raw_text=node.claim)
    primary_assessment = base_assessment(
        node_id=node.id,
        evidence=EvidenceAssessment(
            evidence_quality=0.9,
            evidence_relevance=0.9,
            evidence_sufficiency=0.9,
            source_reliability=0.9,
            freshness=0.9,
        ),
    )
    verifier_assessment = base_assessment(
        node_id=node.id,
        critic=CriticAssessment(logical_validity=0.3, assumption_risk=0.6, counterargument_strength=0.4),
        evidence=EvidenceAssessment(
            evidence_quality=0.1,
            evidence_relevance=0.2,
            evidence_sufficiency=0.1,
            source_reliability=0.1,
            freshness=0.1,
        ),
    )
    third_assessment = base_assessment(
        node_id=node.id,
        context=ContextAssessment(relevance=0.5, impact=0.5, dependency_weight=0.5),
    )

    primary_strength = reduce_assessments(claim, primary_assessment).scores.strength
    verifier_strength = reduce_assessments(claim, verifier_assessment).scores.strength
    third_strength = reduce_assessments(claim, third_assessment).scores.strength

    # Weights [1.0, 0.5, 1.0] / effectiveWeightTotal 2.5, per the worked
    # example in Task 1 (same-family repeat = claude, claude; gpt is a
    # fresh family so it keeps full weight).
    expected_strength = round(
        (1.0 * primary_strength + 0.5 * verifier_strength + 1.0 * third_strength) / 2.5,
        4,
    )
    assert item["scores"]["strength"] == expected_strength
