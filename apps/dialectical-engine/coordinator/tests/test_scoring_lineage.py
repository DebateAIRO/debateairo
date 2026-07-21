from __future__ import annotations

from app.scoring.lineage import lineage_family, judge_lineage_metadata


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
