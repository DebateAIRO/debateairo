from __future__ import annotations

import pytest

from app.scoring.cache import SCORING_INPUT_HASH_VERSION, node_scoring_input_hash
from app.scoring.models import Scope
from app.scoring.normalizer import classify_claim_type, extract_scope, normalize_claim


# ---------------------------------------------------------------------------
# classify_claim_type: one family per test group, >=3 example sentences each
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "text",
    [
        "Remote work has higher retention than office-only work.",
        "This proposal is better than the previous policy.",
        "Solar power is now cheaper than coal in most markets.",
    ],
)
def test_classify_claim_type_comparative(text: str) -> None:
    claim_type, markers = classify_claim_type(text)
    assert claim_type == "comparative"
    assert markers


@pytest.mark.parametrize(
    "text",
    [
        "Remote work will increase hiring competition next year.",
        "Automation is going to displace millions of factory jobs.",
        "Global temperatures are expected to rise by 2050.",
    ],
)
def test_classify_claim_type_prediction(text: str) -> None:
    claim_type, markers = classify_claim_type(text)
    assert claim_type == "prediction"
    assert markers


@pytest.mark.parametrize(
    "text",
    [
        "Remote work causes higher employee retention.",
        "Poor sleep leads to reduced cognitive performance.",
        "The policy change was caused by public pressure.",
    ],
)
def test_classify_claim_type_causal(text: str) -> None:
    claim_type, markers = classify_claim_type(text)
    assert claim_type == "causal"
    assert markers


@pytest.mark.parametrize(
    "text",
    [
        "Teams should adopt remote work for better retention.",
        "Governments ought to regulate carbon emissions more strictly.",
        "It is wrong to ignore climate refugees.",
    ],
)
def test_classify_claim_type_normative(text: str) -> None:
    claim_type, markers = classify_claim_type(text)
    assert claim_type == "normative"
    assert markers


@pytest.mark.parametrize(
    "text",
    [
        "Remote work is defined as work done away from a central office.",
        "Inflation means that money loses purchasing power over time.",
        "A recession is when economic activity declines for two consecutive quarters.",
    ],
)
def test_classify_claim_type_definitional(text: str) -> None:
    claim_type, markers = classify_claim_type(text)
    assert claim_type == "definitional"
    assert markers


@pytest.mark.parametrize(
    "text",
    [
        "Studies show remote work retention is 8 percent higher.",
        "Research indicates that 42% of workers prefer hybrid schedules.",
        "The data shows a measured increase in productivity of 15%.",
    ],
)
def test_classify_claim_type_empirical(text: str) -> None:
    claim_type, markers = classify_claim_type(text)
    assert claim_type == "empirical"
    assert markers


# ---------------------------------------------------------------------------
# Ambiguity / hedging markers (recorded, do not change claim_type on their own)
# ---------------------------------------------------------------------------


def test_classify_claim_type_hedge_does_not_block_family_match() -> None:
    claim_type, markers = classify_claim_type("Remote work might cause higher retention.")
    assert claim_type == "causal"
    assert markers  # causal markers, not hedge markers


@pytest.mark.parametrize(
    ("text", "expected_hedge"),
    [
        ("Remote work might help some teams.", "might"),
        ("This policy may reduce costs.", "may"),
        ("The plan could improve morale.", "could"),
        ("Some say remote work harms culture.", "some say"),
        ("Arguably, remote work is the future.", "arguably"),
        ("This is probably the right call.", "probably"),
    ],
)
def test_normalize_claim_records_hedge_as_ambiguity_flag(text: str, expected_hedge: str) -> None:
    claim = normalize_claim(node_id="node-1", raw_text=text)
    assert expected_hedge in claim.ambiguity_flags


def test_normalize_claim_no_hedge_means_no_ambiguity_flags() -> None:
    claim = normalize_claim(node_id="node-1", raw_text="Remote work causes higher retention.")
    assert claim.ambiguity_flags == []


# ---------------------------------------------------------------------------
# Mixed and unknown outcomes
# ---------------------------------------------------------------------------


def test_classify_claim_type_mixed_when_two_families_match() -> None:
    # Causal ("leads to") AND comparative ("more ... than") both fire.
    text = "Remote work leads to more retention than office-only work."
    claim_type, markers = classify_claim_type(text)
    assert claim_type == "mixed"
    assert len(markers) >= 2


def test_classify_claim_type_unknown_when_nothing_matches() -> None:
    claim_type, markers = classify_claim_type("Maybe this matters somehow.")
    assert claim_type == "unknown"
    assert markers == []


def test_normalize_claim_defaults_vague_text_to_unknown_claim_type() -> None:
    claim = normalize_claim(node_id="node-1", raw_text="Maybe this matters somehow.")
    assert claim.claim_type == "unknown"


# ---------------------------------------------------------------------------
# implied_assumptions: mechanical derivations only
# ---------------------------------------------------------------------------


def test_implied_assumptions_for_causal_claim() -> None:
    claim = normalize_claim(node_id="node-1", raw_text="Remote work causes higher retention.")
    assert claim.implied_assumptions == [
        "correlation supports causation here",
        "no major confounder dominates",
    ]


def test_implied_assumptions_for_prediction_claim() -> None:
    claim = normalize_claim(node_id="node-1", raw_text="Remote work will increase hiring competition next year.")
    assert claim.implied_assumptions == ["current trend continues"]


def test_implied_assumptions_for_comparative_claim() -> None:
    claim = normalize_claim(node_id="node-1", raw_text="Remote work has higher retention than office-only work.")
    assert claim.implied_assumptions == ["comparison baseline is well-defined"]


def test_implied_assumptions_empty_for_definitional_claim() -> None:
    claim = normalize_claim(node_id="node-1", raw_text="Remote work is defined as work done away from a central office.")
    assert claim.implied_assumptions == []


# ---------------------------------------------------------------------------
# evidence_refs: URL extraction only
# ---------------------------------------------------------------------------


def test_normalize_claim_extracts_url_evidence_refs() -> None:
    text = "Remote work causes higher retention (see https://example.com/study-2024 for details)."
    claim = normalize_claim(node_id="node-1", raw_text=text)
    assert claim.evidence_refs == ["https://example.com/study-2024"]


def test_normalize_claim_no_url_means_empty_evidence_refs() -> None:
    claim = normalize_claim(node_id="node-1", raw_text="Remote work causes higher retention.")
    assert claim.evidence_refs == []


def test_normalize_claim_extracts_multiple_url_evidence_refs() -> None:
    text = "See http://a.example.com/one and https://b.example.org/two for sources."
    claim = normalize_claim(node_id="node-1", raw_text=text)
    assert claim.evidence_refs == ["http://a.example.com/one", "https://b.example.org/two"]


# ---------------------------------------------------------------------------
# extract_scope: conservative, fixed-vocabulary extraction
# ---------------------------------------------------------------------------


def test_extract_scope_timeframe_year() -> None:
    scope = extract_scope("By 2030, remote work will dominate white-collar hiring.")
    assert scope.timeframe == "2030"


def test_extract_scope_timeframe_since() -> None:
    scope = extract_scope("Since 2020, remote work adoption has tripled.")
    assert scope.timeframe == "since 2020"


def test_extract_scope_timeframe_over_last_n_years() -> None:
    scope = extract_scope("Over the last 5 years, remote work adoption has tripled.")
    assert scope.timeframe == "over the last 5 years"


def test_extract_scope_geography_fixed_vocabulary_match() -> None:
    scope = extract_scope("Remote work adoption in Germany has tripled since 2020.")
    assert scope.geography == "Germany"


def test_extract_scope_geography_no_match_stays_none() -> None:
    scope = extract_scope("Remote work adoption in Springfield has tripled.")
    assert scope.geography is None


def test_extract_scope_population_among_pattern() -> None:
    scope = extract_scope("Remote work is more popular among software engineers.")
    assert scope.population == "software engineers"


def test_extract_scope_unmatched_fields_stay_none() -> None:
    scope = extract_scope("Remote work improves retention.")
    assert scope.timeframe is None
    assert scope.geography is None
    assert scope.population is None
    assert scope.domain is None


def test_extract_scope_combines_multiple_fields() -> None:
    scope = extract_scope("Since 2020, remote work adoption among software engineers in Germany has tripled.")
    assert scope.timeframe == "since 2020"
    assert scope.geography == "Germany"
    assert scope.population == "software engineers"


def test_normalize_claim_wires_scope_into_result() -> None:
    claim = normalize_claim(
        node_id="node-1",
        raw_text="Since 2020, remote work adoption in Germany has tripled.",
    )
    assert isinstance(claim.scope, Scope)
    assert claim.scope.timeframe == "since 2020"
    assert claim.scope.geography == "Germany"


# ---------------------------------------------------------------------------
# core_claim passthrough (existing behavior, must not regress)
# ---------------------------------------------------------------------------


def test_normalize_claim_preserves_actual_text_as_core_claim() -> None:
    claim = normalize_claim(node_id="node-1", raw_text="  Remote work improves productivity.  ")
    assert claim.node_id == "node-1"
    assert claim.raw_text == "  Remote work improves productivity.  "
    assert claim.core_claim == "Remote work improves productivity."


# ---------------------------------------------------------------------------
# key_terms: explicitly out of scope, must remain empty
# ---------------------------------------------------------------------------


def test_normalize_claim_key_terms_remains_empty() -> None:
    claim = normalize_claim(node_id="node-1", raw_text="Remote work causes higher retention among engineers.")
    assert claim.key_terms == []


# ---------------------------------------------------------------------------
# Input-hash version bump: same claim/argument, hash differs after the bump
# ---------------------------------------------------------------------------


def test_input_hash_version_is_bumped_to_v2() -> None:
    assert SCORING_INPUT_HASH_VERSION == "node-scoring-input-v2"


def test_node_scoring_input_hash_changes_from_v1_baseline_for_same_claim() -> None:
    claim = normalize_claim(node_id="node-1", raw_text="Remote work causes higher retention.")
    v1_payload_hash = __import__("hashlib").sha256(
        __import__("json").dumps(
            {
                "version": "node-scoring-input-v1",
                "claim": claim.model_dump(mode="json"),
                "argument_text": "Retention improved by 12%.",
            },
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()
    v2_hash = node_scoring_input_hash(claim=claim, argument_text="Retention improved by 12%.")
    assert v2_hash != v1_payload_hash
