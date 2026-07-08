import pytest

from app.protocol.triage import TriageDecision, triage_debate


def test_simple_empirical_claim_defaults_to_simple():
    decision = triage_debate("The Earth orbits the Sun.", None)
    assert decision.difficulty == "simple"
    assert decision.depth_budget == 1
    assert decision.verification_required is False
    assert decision.rationale  # non-empty
    assert decision.classifier_version == "triage-v1"


@pytest.mark.parametrize(
    "topic",
    [
        "Cities should ban cars downtown.",  # normative ("should")
        "Longer commutes cause lower job satisfaction.",  # causal ("cause")
        # original brief topic "Higher taxes cause lower investment." was swapped
        # because "tax"/"investment" are themselves stakes keywords (see
        # _STAKES_KEYWORDS), which pushed it to high_stakes instead of contested.
        "Inflation will rise by 2030.",  # prediction ("will")
    ],
)
def test_normative_causal_prediction_claims_are_contested(topic):
    decision = triage_debate(topic, None)
    assert decision.difficulty == "contested"
    assert decision.depth_budget == 2
    assert decision.verification_required is False


def test_hedge_flag_alone_pushes_to_contested():
    # "might" is a hedge marker with no other family match and no stakes-keyword
    # collision (confirmed via classify_claim_type + stakes-keyword check);
    # original brief topic "This policy is arguably fine." was swapped out because
    # "policy" is itself a stakes keyword, per Step 4's pre-authorized adjustment.
    decision = triage_debate("This restaurant might be the best in town.", None)
    assert decision.difficulty == "contested"
    assert any("hedge" in reason.lower() for reason in decision.rationale)


@pytest.mark.parametrize(
    "topic",
    [
        "Should this drug be approved for children?",  # health
        "Should this contract be enforced in court?",  # legal
        "Should the bank raise interest rates?",  # financial
        "Should this bridge safety inspection be skipped?",  # safety
        "Should the city change its zoning policy?",  # policy
    ],
)
def test_stakes_keywords_trigger_high_stakes_and_verification(topic):
    decision = triage_debate(topic, None)
    assert decision.difficulty == "high_stakes"
    assert decision.verification_required is True
    assert decision.depth_budget == 3


def test_config_override_wins_over_classification():
    decision = triage_debate(
        "The Earth orbits the Sun.",
        {"protocol": {"difficulty": "high_stakes", "depth_budget": 3}},
    )
    assert decision.difficulty == "high_stakes"
    assert decision.depth_budget == 3
    assert any("override" in reason.lower() for reason in decision.rationale)


def test_depth_budget_clamped_by_existing_max_depth():
    decision = triage_debate(
        "Should the bank raise interest rates?",  # would be high_stakes -> budget 3
        {"max_depth": 1},
    )
    assert decision.depth_budget == 1
    assert any("max_depth" in reason.lower() or "clamp" in reason.lower() for reason in decision.rationale)


def test_triage_is_deterministic_for_same_input():
    a = triage_debate("Cities should ban cars downtown.", {"max_depth": 2})
    b = triage_debate("Cities should ban cars downtown.", {"max_depth": 2})
    assert a == b


def test_classifier_version_is_pinned():
    decision = triage_debate("The Earth orbits the Sun.", None)
    assert decision.classifier_version == "triage-v1"


def test_decision_is_frozen():
    decision = triage_debate("The Earth orbits the Sun.", None)
    with pytest.raises(Exception):
        decision.difficulty = "simple"  # type: ignore[misc]


# ---------------------------------------------------------------------------
# Word-boundary collision regression tests (Opus review finding, P5a-1 fix).
#
# `_detect_stakes` and the hedge check previously used bare substring matching
# (`keyword in topic_lower`), which caused ordinary vocabulary containing a
# stakes/hedge keyword as a substring to silently escalate difficulty:
# law->lawn/flawless, tax->syntax, bank->riverbank, patient->impatient,
# contract->contractor, court->courteous, drug->drugstore, may->dismay/mayor.
# ---------------------------------------------------------------------------


def test_lawn_does_not_trigger_law_stakes_keyword():
    decision = triage_debate("The lawn needs mowing.", None)
    assert decision.difficulty == "simple"
    assert decision.verification_required is False


def test_flawless_syntax_does_not_trigger_law_or_tax_stakes_keywords():
    decision = triage_debate("Flawless syntax matters in code review.", None)
    assert decision.difficulty == "simple"
    assert decision.verification_required is False


def test_interest_rates_plural_still_triggers_stakes_keyword():
    # Word-boundary fix must preserve substring version's plural match:
    # "interest rate" (singular keyword) must still fire on "interest rates".
    decision = triage_debate("Interest rates should be lowered.", None)
    assert decision.difficulty == "high_stakes"
    assert decision.verification_required is True
    assert decision.depth_budget == 3


def test_dismay_and_mayors_do_not_trigger_may_hedge_keyword():
    decision = triage_debate("Dismay spread among mayors.", None)
    # "no hedge markers" (negative statement) is expected in rationale; a
    # false-positive hedge hit would instead say "hedge marker present".
    assert not any("hedge marker present" in reason.lower() for reason in decision.rationale)
    # This topic has no real hedge/stakes/contested marker, so it must resolve
    # to "simple", not be dragged to "contested" via a false "may" hedge hit
    # inside "dismay"/"mayors".
    assert decision.difficulty == "simple"


# ---------------------------------------------------------------------------
# -es plural regression tests (P5a triage follow-up fix).
#
# The word-boundary fix's trailing `s?` covers regular plurals (tax -> taxs
# would be wrong, but "law"->"laws" etc.) but misses real -es plurals for
# stakes vocabulary ending in a sibilant: "tax"->"taxes", "market crash"->
# "market crashes". "diagnosis"->"diagnoses" is a stem change no suffix
# pattern covers, so it needs its own explicit keyword entry.
# ---------------------------------------------------------------------------


def test_taxes_plural_triggers_tax_stakes_keyword():
    decision = triage_debate("Should we raise taxes next year?", None)
    assert decision.difficulty == "high_stakes"
    assert decision.verification_required is True
    assert any("tax" in reason.lower() for reason in decision.rationale)


def test_market_crashes_plural_triggers_market_crash_stakes_keyword():
    decision = triage_debate("Market crashes hurt savers.", None)
    assert decision.difficulty == "high_stakes"
    assert decision.verification_required is True
