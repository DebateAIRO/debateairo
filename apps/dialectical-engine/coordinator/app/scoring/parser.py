from __future__ import annotations

import json
import re
from json import JSONDecodeError
from typing import Any, Literal

from pydantic import BaseModel, ValidationError

from app.scoring.models import ClaimAssessment


class JudgeParseResult(BaseModel):
    status: Literal["available", "unavailable"]
    assessment: ClaimAssessment | None = None
    reason: str | None = None


# Task 22 Fix A (2026-07-24 smoke3): some judge-panel CLI providers wrap their
# JSON in a markdown code fence, which a bare json.loads rejects. Matches an
# opening fence with an optional language tag (```json / ```) through the first
# closing fence; DOTALL so the JSON body may span lines, non-greedy so a
# trailing prose line after the close is excluded. `.search()` (not `.match()`)
# tolerates a stray prose line before the fence.
_FENCED_BLOCK_RE = re.compile(r"```[^\n`]*\r?\n(.*?)```", re.DOTALL)


def parse_judge_json(payload: str) -> JudgeParseResult:
    raw, parsed = _coerce_judge_json(payload)
    if not parsed:
        return JudgeParseResult(status="unavailable", reason="Judge output was not valid JSON.")
    try:
        return JudgeParseResult(status="available", assessment=ClaimAssessment.model_validate(raw))
    except ValidationError:
        # A payload that parsed as JSON (bare, fenced, or extracted) but does
        # not match the schema keeps the schema-mismatch reason -- fence/prose
        # tolerance must never mask a real schema failure as a parse failure.
        return JudgeParseResult(status="unavailable", reason="Judge output did not match the scoring schema.")


def _coerce_judge_json(payload: str) -> tuple[Any, bool]:
    """Return (parsed_object, True) for the first strategy that yields valid
    JSON, else (None, False). Each fallback runs ONLY after the prior fails, so
    clean bare JSON (the primary judge, which emits an unfenced object) is
    parsed byte-identically and is never altered by fence/prose handling.
    """
    # 1. Bare JSON. json.loads already tolerates surrounding whitespace, so the
    #    unfenced primary-judge path is unchanged.
    try:
        return json.loads(payload), True
    except JSONDecodeError:
        pass
    # 2. Strip a surrounding markdown fence and retry.
    fenced = _FENCED_BLOCK_RE.search(payload)
    if fenced is not None:
        try:
            return json.loads(fenced.group(1)), True
        except JSONDecodeError:
            pass
    # 3. Last resort: extract the first balanced {...} object substring (prose-
    #    wrapped JSON with no fence, or a fence whose body carried trailing prose
    #    inside it) and retry.
    balanced = _first_balanced_object(payload)
    if balanced is not None:
        try:
            return json.loads(balanced), True
        except JSONDecodeError:
            pass
    return None, False


def _first_balanced_object(payload: str) -> str | None:
    """The first brace-balanced ``{...}`` substring, or None. String literals
    (and their escapes) are respected so a brace inside a JSON string never
    miscounts depth; an unbalanced/never-closing brace yields None rather than
    a bogus slice."""
    start = payload.find("{")
    if start == -1:
        return None
    depth = 0
    in_string = False
    escaped = False
    for index in range(start, len(payload)):
        char = payload[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return payload[start : index + 1]
    return None
