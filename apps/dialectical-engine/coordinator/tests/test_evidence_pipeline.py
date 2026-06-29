from __future__ import annotations

import pytest

from app.evidence import (
    EntailmentLabel,
    EvidenceStatus,
    EvidenceValidationPipeline,
    SourceRecord,
    classify_entailment,
)
from app.qbaf import ClaimNode


def test_retracted_source_caps_evidence_score_near_zero() -> None:
    pipeline = EvidenceValidationPipeline()
    source = SourceRecord(
        reference="doi:10/retracted",
        text="A clinical trial reports remote work improves productivity.",
        retracted=True,
        quality_grade="high",
    )

    result = pipeline.score_claim_source("Remote work improves productivity", source)

    assert result.base_score == pytest.approx(0.02)
    assert result.status == EvidenceStatus.RETRACTED
    assert "Source is retracted." in result.caveats
    assert result.entailment == EntailmentLabel.SUPPORTS


def test_noinfo_source_collapses_support() -> None:
    pipeline = EvidenceValidationPipeline()
    source = SourceRecord(
        reference="pmid:unrelated",
        text="This paper discusses urban planning and street lighting.",
        quality_grade="high",
    )

    result = pipeline.score_claim_source("Remote work improves productivity", source)

    assert result.base_score == pytest.approx(0.05)
    assert result.status == EvidenceStatus.NO_INFO
    assert "Source does not contain information for the claim." in result.caveats
    assert result.entailment == EntailmentLabel.NOINFO


def test_supported_source_uses_quality_corroboration_and_statistical_caveats() -> None:
    pipeline = EvidenceValidationPipeline()
    source = SourceRecord(
        reference="doi:10/support",
        text="A randomized trial reports remote work improves productivity with fewer interruptions.",
        quality_grade="low",
        corroboration_count=3,
        statistical_flags=["small n", "missing effect size"],
    )

    result = pipeline.score_claim_source("Remote work improves productivity", source)

    assert result.base_score == pytest.approx(0.42)
    assert result.status == EvidenceStatus.GROUNDED
    assert "Low quality evidence multiplier applied." in result.caveats
    assert "Statistical red flag: small n" in result.caveats
    assert "Statistical red flag: missing effect size" in result.caveats
    assert result.entailment == EntailmentLabel.SUPPORTS


def test_entailment_classifier_distinguishes_support_refute_and_noinfo() -> None:
    assert (
        classify_entailment(
            "Remote work improves productivity",
            "A study reports remote work improves productivity.",
        )
        == EntailmentLabel.SUPPORTS
    )
    assert (
        classify_entailment(
            "Remote work improves productivity",
            "The study refutes that remote work improves productivity.",
        )
        == EntailmentLabel.REFUTES
    )
    assert (
        classify_entailment(
            "Remote work improves productivity",
            "This article is about urban planning.",
        )
        == EntailmentLabel.NOINFO
    )


def test_pipeline_grounds_only_evidence_leaf_nodes() -> None:
    pipeline = EvidenceValidationPipeline()
    source = SourceRecord(
        reference="doi:10/support",
        text="A study reports remote work improves productivity.",
        quality_grade="high",
    )
    leaf = ClaimNode(
        id="e1",
        text="Remote work improves productivity",
        type="evidence_leaf",
    )

    grounded = pipeline.ground_leaf(leaf, source)

    assert grounded.base_score == pytest.approx(0.85)
    assert grounded.final_strength == pytest.approx(0.85)
    assert grounded.status == "grounded"
    assert grounded.caveats == []

    with pytest.raises(ValueError, match="evidence_leaf"):
        pipeline.ground_leaf(ClaimNode(id="root", text="Root", type="root"), source)


def test_pipeline_marks_refuted_retracted_and_noinfo_leaves_as_not_grounded() -> None:
    pipeline = EvidenceValidationPipeline()
    leaf = ClaimNode(
        id="e1",
        text="Remote work improves productivity",
        type="evidence_leaf",
    )

    cases = [
        (
            SourceRecord(
                reference="doi:10/refute",
                text="The study refutes that remote work improves productivity.",
                quality_grade="high",
            ),
            EvidenceStatus.REFUTED,
        ),
        (
            SourceRecord(
                reference="doi:10/retracted",
                text="Remote work improves productivity.",
                retracted=True,
                quality_grade="high",
            ),
            EvidenceStatus.RETRACTED,
        ),
        (
            SourceRecord(
                reference="doi:10/noinfo",
                text="This article discusses urban planning.",
                quality_grade="high",
            ),
            EvidenceStatus.NO_INFO,
        ),
    ]

    for source, expected_status in cases:
        grounded = pipeline.ground_leaf(leaf, source)

        assert grounded.status == expected_status.value
        assert grounded.base_score < 0.10
        assert grounded.final_strength < 0.10
        assert grounded.uncertainty >= 0.90


def test_pipeline_can_mark_missing_evidence_without_fake_grounding() -> None:
    pipeline = EvidenceValidationPipeline()
    leaf = ClaimNode(
        id="e1",
        text="Remote work improves productivity",
        type="evidence_leaf",
        transcript=[{"reference": "doi:10/missing"}],
    )

    missing = pipeline.mark_missing_leaf(leaf, "doi:10/missing")

    assert missing.status == EvidenceStatus.MISSING.value
    assert missing.base_score == 0.0
    assert missing.final_strength == 0.0
    assert missing.uncertainty == 1.0
    assert missing.caveats == ["Evidence source is missing or unavailable for doi:10/missing."]
