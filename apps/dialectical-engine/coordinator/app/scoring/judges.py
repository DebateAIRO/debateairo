from __future__ import annotations

from typing import Any, Protocol, TypeVar

from pydantic import BaseModel, Field

from app.scoring.models import NormalizedClaim


AssessmentT = TypeVar("AssessmentT", bound=BaseModel)


class ScoringProviderRequest(BaseModel):
    claim: NormalizedClaim
    argument_text: str | None = None
    judge_role: str
    prompt_version: str = "scoring-provider-v1"
    timeout_seconds: int = 30
    metadata: dict[str, Any] = Field(default_factory=dict)


class ScoringProviderResult(BaseModel):
    provider: str
    model: str
    raw_output: str
    latency_ms: int | None = None
    checked_at: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class ScoringProvider(Protocol):
    def judge_node(self, request: ScoringProviderRequest) -> ScoringProviderResult:
        ...


class JudgeStrategy(Protocol[AssessmentT]):
    name: str

    def assess(self, claim: NormalizedClaim) -> AssessmentT:
        ...
