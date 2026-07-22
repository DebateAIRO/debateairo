from __future__ import annotations

from app.scoring.lineage import lineage_family, judge_lineage_metadata, panel_vendor_family


def test_lineage_family_recognizes_claude() -> None:
    assert lineage_family("claude-sonnet-5-high-loop") == "claude"
    assert lineage_family("claude-opus-4-1") == "claude"


def test_lineage_family_recognizes_gpt_and_codex() -> None:
    assert lineage_family("gpt-5.2-codex") == "gpt"
    assert lineage_family("gpt-4o") == "gpt"


def test_lineage_family_recognizes_gemini() -> None:
    assert lineage_family("gemini-2.5-pro") == "gemini"


def test_lineage_family_unknown_model_returns_raw_lowercased_string_not_none() -> None:
    # Honest: we don't recognize the vendor, but we still have a concrete
    # model string -- it must not collapse to None or a shared "unknown" bucket.
    assert lineage_family("some-future-model-x9") == "some-future-model-x9"


def test_lineage_family_of_none_or_empty_is_none() -> None:
    assert lineage_family(None) is None
    assert lineage_family("") is None


def test_judge_lineage_metadata_flags_independent_when_families_differ() -> None:
    meta = judge_lineage_metadata(
        arguer_model_id="claude-sonnet-5-high-loop",
        judge_provider="codex",
        judge_model_id="gpt-5.2-codex",
    )
    assert meta["judgeLineage"] == {"provider": "codex", "model": "gpt-5.2-codex", "family": "gpt"}
    assert meta["arguerLineage"] == {"model": "claude-sonnet-5-high-loop", "family": "claude"}
    assert meta["independent"] is True
    assert meta["independenceReason"] == "independent_lineage"


def test_judge_lineage_metadata_flags_not_independent_when_families_match() -> None:
    meta = judge_lineage_metadata(
        arguer_model_id="claude-opus-4-1",
        judge_provider="anthropic",
        judge_model_id="claude-sonnet-5-high-loop",
    )
    assert meta["independent"] is False
    assert meta["independenceReason"] == "same_lineage"


def test_judge_lineage_metadata_honest_null_when_arguer_lineage_unknown() -> None:
    meta = judge_lineage_metadata(
        arguer_model_id=None,
        judge_provider="codex",
        judge_model_id="gpt-5.2-codex",
    )
    assert meta["arguerLineage"] is None
    assert meta["independent"] is None
    assert meta["independenceReason"] == "arguer_lineage_unknown"


# Task 6 (cross-family judge panel, docs/improvement-plan-2026-07-22.md
# §P2.2): panel_vendor_family is a DIFFERENT "family" concept from
# lineage_family above -- see its docstring. It exists only for the
# sole_judge_family_matches_author comparison in
# app.scoring.service._attach_plural_judge_provenance, so its vocabulary is
# the brief's exact vendor-brand mapping (gpt*/codex -> openai, claude* ->
# anthropic, gemini* -> google, grok* -> xai, lmstudio* -> local), never
# lineage_family's claude/gpt/gemini buckets.
def test_panel_vendor_family_recognizes_gpt_and_codex_as_openai() -> None:
    assert panel_vendor_family("gpt-5.6sol-medium") == "openai"
    assert panel_vendor_family("gpt-4o") == "openai"
    assert panel_vendor_family("codex-test-model") == "openai"


def test_panel_vendor_family_recognizes_claude_as_anthropic() -> None:
    assert panel_vendor_family("claude-sonnet-5-high-loop") == "anthropic"


def test_panel_vendor_family_recognizes_gemini_as_google() -> None:
    assert panel_vendor_family("gemini-3.5-flash-loop") == "google"


def test_panel_vendor_family_recognizes_grok_as_xai() -> None:
    assert panel_vendor_family("grok-4.5-high-loop") == "xai"


def test_panel_vendor_family_recognizes_lmstudio_as_local() -> None:
    assert panel_vendor_family("lmstudio:google_gemma-4-e4b-it") == "local"


def test_panel_vendor_family_unrecognized_model_is_literal_unknown_string() -> None:
    # Unlike lineage_family (which returns the raw lowercased string for an
    # unrecognized-but-concrete model id), panel_vendor_family always
    # collapses to the literal string "unknown" -- the brief's mapping ends
    # "unknown -> 'unknown'", and sole_judge_family_matches_author needs a
    # concrete value on both sides of its comparison, not an unbounded set
    # of one-off bucket names.
    assert panel_vendor_family("some-future-model-x9") == "unknown"


def test_panel_vendor_family_of_none_or_empty_is_literal_unknown_string() -> None:
    # Also unlike lineage_family (None for None/empty input): this helper
    # never returns None, because sole_judge_family_matches_author always
    # needs a concrete value to compare against.
    assert panel_vendor_family(None) == "unknown"
    assert panel_vendor_family("") == "unknown"
    assert panel_vendor_family("   ") == "unknown"
