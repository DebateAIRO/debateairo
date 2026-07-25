"""W5a: the shared reason-code -> human-copy map.

One map, coordinator-side, translates internal reason codes (adaptive
dispatch's stopped_because vocabulary, the terminal-failure engine's
generation_exhausted, the lifecycle-input resolver's component codes) into
plain-language copy. Unknown codes get an honest generic fallback -- never
fabricated specifics -- and anything that is not a bare lower_snake_case code
(already-human policy prose) passes through unchanged so real ExplorationPolicy
sentences are never mangled.
"""
from __future__ import annotations

from app.exploration.reason_copy import (
    DEFAULT_REASON_HUMAN_COPY,
    REASON_CODE_HUMAN_COPY,
    humanize_reason,
)


def test_none_and_blank_map_to_none() -> None:
    assert humanize_reason(None) is None
    assert humanize_reason("") is None
    assert humanize_reason("   ") is None


def test_known_codes_map_to_plain_language_copy() -> None:
    for code in (
        "generation_exhausted",
        "budget_exhausted",
        # FW1 (I1): the two stop rails split out of budget_exhausted. Each
        # must have its OWN copy -- a shared sentence is what made a
        # rounds-exhausted stop claim an untouched debate budget was spent.
        "rounds_exhausted",
        "node_budget_exhausted",
        # FW2: promoted from defensive to live -- STOPPED_DEPTH_LIMIT now
        # derives a real stopped_because, so this copy reaches the wire.
        "depth_limit",
        "deferred_no_capacity",
        "no_categorical_signals",
        "quiescent_no_decisions",
        "score_stale",
        "evidence_stale",
        "debate_generation_failed",
    ):
        mapped = humanize_reason(code)
        assert mapped == REASON_CODE_HUMAN_COPY[code]
        assert mapped != code
        assert mapped.strip()


def test_unknown_bare_code_gets_the_honest_generic_fallback_not_fabrication() -> None:
    assert humanize_reason("some_future_unmapped_code") == DEFAULT_REASON_HUMAN_COPY


def test_whitespace_is_trimmed_before_lookup() -> None:
    assert humanize_reason("  generation_exhausted  ") == REASON_CODE_HUMAN_COPY["generation_exhausted"]


def test_already_human_prose_passes_through_unchanged() -> None:
    # Real ExplorationPolicy stopping_reason text (has spaces/punctuation) --
    # never mangled into the generic fallback.
    prose = "evidence refutes or contradicts the claim"
    assert humanize_reason(prose) == prose
    prose_with_colon = "authenticated lifecycle policy action: continue"
    assert humanize_reason(prose_with_colon) == prose_with_colon


def test_no_raw_semicolon_joined_codes_reach_the_mapped_copy() -> None:
    # A legacy fail-safe reason_text shape ("lifecycle inputs unavailable:
    # score_stale; evidence_stale") is not a bare code (it has spaces/colon),
    # so it passes through as prose rather than crashing or being silently
    # dropped -- but it must never be confused with a mapped code either.
    joined = "lifecycle inputs unavailable: score_stale; evidence_stale"
    result = humanize_reason(joined)
    assert result == joined
