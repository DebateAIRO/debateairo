from __future__ import annotations

import json
from json import JSONDecodeError
from typing import Literal

from pydantic import BaseModel, ValidationError

from app.scoring.models import ClaimAssessment


class JudgeParseResult(BaseModel):
    status: Literal["available", "unavailable"]
    assessment: ClaimAssessment | None = None
    reason: str | None = None


def parse_judge_json(payload: str) -> JudgeParseResult:
    try:
        raw = json.loads(payload)
    except JSONDecodeError:
        return JudgeParseResult(status="unavailable", reason="Judge output was not valid JSON.")
    try:
        return JudgeParseResult(status="available", assessment=ClaimAssessment.model_validate(raw))
    except ValidationError:
        return JudgeParseResult(status="unavailable", reason="Judge output did not match the scoring schema.")
