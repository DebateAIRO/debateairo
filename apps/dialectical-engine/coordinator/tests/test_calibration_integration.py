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
from app.scoring.disagreement import dispersion_uncertainty
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


def test_calibration_flag_off_leaves_non_uncertainty_scores_byte_identical(db, monkeypatch) -> None:
    # Task 4 (uncertainty -> labeled drivers + dispersion-derived numeric,
    # docs/improvement-plan-2026-07-22.md Sec P2.1) amendment: this test
    # used to assert the WHOLE scores dict was byte identical to a direct
    # single-assessment reduce_assessments() call when the calibration flag
    # is off. dispersion_uncertainty now overrides scores.uncertainty
    # whenever >=2 independent persisted judge assessments exist --
    # unconditionally on DIALECTICAL_CALIBRATION_WEIGHTS (the brief's
    # dispersion condition never mentions that flag; it is a separate
    # feature from the flag-gated weighted aggregate below). This still
    # proves _weighted_aggregate_scores does not touch any field when the
    # flag is off (every OTHER field remains byte identical), and
    # separately proves uncertainty is now the measured dispersion value.
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
    primary_assessment = base_assessment(
        node_id=node.id,
        evidence=EvidenceAssessment(
            evidence_quality=0.8,
            evidence_relevance=0.8,
            evidence_sufficiency=0.8,
            source_reliability=0.8,
            freshness=0.8,
        ),
    )
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
    non_uncertainty_fields = {
        "strength",
        "impact",
        "evidence_quality",
        "relevance",
        "logical_validity",
        "assumption_risk",
        "counter_resilience",
    }
    for field in non_uncertainty_fields:
        assert item["scores"][field] == direct["scores"][field]

    expected_dispersion = dispersion_uncertainty(
        [
            {
                "judge_role": "primary_judge",
                "provider": "anthropic",
                "model": "claude-3-sonnet",
                "raw_output_sha256": "irrelevant-a",
                "assessment": primary_assessment.model_dump(mode="json"),
            },
            {
                "judge_role": "verifier_judge",
                "provider": "anthropic",
                "model": "claude-3-opus",
                "raw_output_sha256": "irrelevant-b",
                "assessment": verifier_assessment.model_dump(mode="json"),
            },
        ]
    )
    assert expected_dispersion is not None
    assert item["uncertainty_source"] == "dispersion"
    assert item["scores"]["uncertainty"] == expected_dispersion.uncertainty
    assert item["scores"]["uncertainty"] != direct["scores"]["uncertainty"]


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

    # Reviewer follow-up: this is exactly the risk combination -- calibration
    # weighting ON (flag-gated) AND >=2 persisted judgments (dispersion-eligible)
    # at once. dispersion_uncertainty is unconditional on the calibration flag
    # and is applied after _weighted_aggregate_scores in
    # _attach_plural_judge_provenance, so it must win for uncertainty
    # specifically even while calibrationApplied is True for strength above.
    expected_dispersion = dispersion_uncertainty(
        [
            {
                "judge_role": "primary_judge",
                "provider": "anthropic",
                "model": "claude-3-sonnet",
                "raw_output_sha256": "irrelevant-primary",
                "assessment": primary_assessment.model_dump(mode="json"),
            },
            {
                "judge_role": "verifier_judge",
                "provider": "anthropic",
                "model": "claude-3-opus",
                "raw_output_sha256": "irrelevant-verifier",
                "assessment": verifier_assessment.model_dump(mode="json"),
            },
            {
                "judge_role": "third_judge",
                "provider": "codex",
                "model": "gpt-5.2-codex",
                "raw_output_sha256": "irrelevant-third",
                "assessment": third_assessment.model_dump(mode="json"),
            },
        ]
    )
    assert expected_dispersion is not None
    assert item["uncertainty_source"] == "dispersion"
    assert item["scores"]["uncertainty"] == expected_dispersion.uncertainty
