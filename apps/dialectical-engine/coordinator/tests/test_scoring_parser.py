"""Task 22 Fix A: parse_judge_json must tolerate markdown-fenced and
prose-wrapped JSON WITHOUT weakening schema validation.

From the 2026-07-24 smoke3 run: the coordinator panel providers
(claude_cli --output-format text, gemini_cli agy) return valid JSON wrapped
in a markdown code fence, which the bare json.loads rejected -- judge_panel_
claude scored 0/23, judge_panel_gemini 13/21. The primary judge (codex,
--output-last-message) returns bare JSON and must stay byte-identical.

Fixtures mirror the REAL stored raw_output shapes (the steelman/context/critic
ClaimAssessment object), so these prove the actual production case, not a toy.
"""
from __future__ import annotations

import json

from app.scoring.parser import parse_judge_json

# A realistic ClaimAssessment payload matching the smoke3 stored raw_output
# shape (steelman/critic/evidence/context/fallacy). Built as a dict so each
# fixture can wrap the SAME object in a different envelope (fence, prose, bare).
SMOKE3_ASSESSMENT = {
    "steelman": {
        "charitable_strength": 0.62,
        "confidence": 0.55,
        "improved_claim": "Remote work improves measured productivity for knowledge workers.",
        "strongest_points": ["Fewer commute interruptions", "Longer focus blocks"],
        "required_assumptions": ["productivity is measurable"],
        "recommended_investigations": [],
    },
    "critic": {
        "logical_validity": 0.7,
        "assumption_risk": 0.45,
        "counterargument_strength": 0.4,
        "findings": ["Generalizes across very different job types"],
        "fatal_flags": [],
        "recommended_investigations": [],
    },
    "evidence": {
        "evidence_quality": 0.3,
        "evidence_relevance": 0.4,
        "evidence_sufficiency": 0.25,
        "source_reliability": 0.3,
        "freshness": 0.35,
        "support_status": "missing",
        "missing_evidence": ["No controlled study was cited."],
        "fatal_flags": [],
        "recommended_investigations": [],
    },
    "context": {
        "relevance": 0.8,
        "impact": 0.65,
        "dependency_weight": 0.5,
        "relation_to_root": "supports",
        "why_it_matters": "Directly bears on the root claim.",
    },
    "fallacy": {
        "logical_consistency": 0.78,
        "detected_fallacies": [],
        "contradiction_flags": [],
        "fatal_flags": [],
    },
}


def _assessment_json() -> str:
    return json.dumps(SMOKE3_ASSESSMENT)


def test_parses_json_language_fenced_smoke3_shape() -> None:
    """(a) + real smoke3 shape: ```json\\n{...}\\n``` parses to the assessment."""
    payload = f"```json\n{_assessment_json()}\n```"

    result = parse_judge_json(payload)

    assert result.status == "available"
    assert result.reason is None
    assert result.assessment is not None
    assert result.assessment.steelman.charitable_strength == 0.62


def test_parses_bare_fence_without_language_tag() -> None:
    """(b) bare ```\\n{...}\\n``` (no language tag) parses."""
    payload = f"```\n{_assessment_json()}\n```"

    result = parse_judge_json(payload)

    assert result.status == "available"
    assert result.assessment is not None


def test_parses_fence_with_trailing_prose_after_closing_fence() -> None:
    """(c) a trailing prose line after the closing fence is ignored."""
    payload = f"```json\n{_assessment_json()}\n```\nNote: scores are approximate."

    result = parse_judge_json(payload)

    assert result.status == "available"
    assert result.assessment is not None


def test_parses_fence_with_leading_prose_line_before_fence() -> None:
    """A stray prose line BEFORE the fence is tolerated."""
    payload = f"Here is my assessment:\n```json\n{_assessment_json()}\n```"

    result = parse_judge_json(payload)

    assert result.status == "available"
    assert result.assessment is not None


def test_parses_prose_wrapped_json_without_any_fence() -> None:
    """Last-resort balanced-object extraction: JSON embedded in prose with no
    fence at all still parses (the first balanced {...} is extracted)."""
    payload = f"Sure! Here is the scoring object: {_assessment_json()} -- hope that helps."

    result = parse_judge_json(payload)

    assert result.status == "available"
    assert result.assessment is not None


def test_bare_unfenced_json_still_parses_codex_regression() -> None:
    """(d) codex primary judge returns bare JSON -- must stay byte-identical."""
    payload = _assessment_json()

    result = parse_judge_json(payload)

    assert result.status == "available"
    assert result.assessment is not None


def test_genuinely_non_json_returns_not_valid_json_reason() -> None:
    """(e) truly non-JSON prose -> the "not valid JSON" reason (unchanged)."""
    result = parse_judge_json("The judge could not evaluate this claim.")

    assert result.status == "unavailable"
    assert result.assessment is None
    assert result.reason == "Judge output was not valid JSON."


def test_prose_with_unbalanced_brace_returns_not_valid_json() -> None:
    """A stray '{' that never closes is not rescued into a false parse."""
    result = parse_judge_json("Analysis follows { but this never closes")

    assert result.status == "unavailable"
    assert result.assessment is None
    assert result.reason == "Judge output was not valid JSON."


def test_fenced_valid_json_wrong_schema_returns_schema_mismatch_not_parse() -> None:
    """(f) a fence-extracted payload that is valid JSON but the WRONG schema
    must return the schema-mismatch reason -- a fence must never mask a real
    schema failure as a parse failure."""
    payload = '```json\n{"score": "high", "findings": "unsupported"}\n```'

    result = parse_judge_json(payload)

    assert result.status == "unavailable"
    assert result.assessment is None
    assert result.reason == "Judge output did not match the scoring schema."


def test_bare_valid_json_wrong_schema_still_schema_mismatch() -> None:
    """Regression: bare valid-JSON-wrong-schema keeps the schema reason
    (bare parse must win before any fallback ever runs)."""
    result = parse_judge_json(json.dumps({"score": "high"}))

    assert result.status == "unavailable"
    assert result.reason == "Judge output did not match the scoring schema."
