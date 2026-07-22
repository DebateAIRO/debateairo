from __future__ import annotations

from typing import Any, Literal, Protocol, TypeVar

from pydantic import BaseModel, Field

from app.scoring.models import NormalizedClaim


AssessmentT = TypeVar("AssessmentT", bound=BaseModel)

JudgeChildStance = Literal["support", "attack"]


class JudgeChildContext(BaseModel):
    """A scored node's direct PRO/CON child, offered to the judge as a real
    counter or supporting argument (Task 3, tree-aware judge payload --
    docs/improvement-plan-2026-07-22.md §P2.3) instead of the imagined
    counters the pre-Task-3 judge scored counter_resilience against. Built by
    app.scoring.service._node_children_for_judge from the live debate tree.
    EVIDENCE children are a different subsystem (the "verifier" judge role)
    and never appear here; neither does any other node_type (e.g. the
    POV-branch label nodes dynamic perspectives create as direct ROOT_CLAIM
    children) -- only real PRO/CON arguments are counters or support.
    """

    node_id: str
    stance: JudgeChildStance
    claim: str
    argument_excerpt: str | None = None
    truncated: bool = False


class ScoringProviderRequest(BaseModel):
    claim: NormalizedClaim
    argument_text: str | None = None
    judge_role: str
    prompt_version: str = "scoring-provider-v2"
    timeout_seconds: int = 30
    metadata: dict[str, Any] = Field(default_factory=dict)
    # Task 3 (tree-aware judge payload): the debate's actual question and the
    # node's real PRO/CON children, so context.relevance and
    # critic.counterargument_strength are judged against real context instead
    # of an imagined one (docs/improvement-plan-2026-07-22.md §P2.3). Both
    # default to "absent" (None / empty list) so every existing caller --
    # including the "verifier" judge role, which never sets them -- keeps
    # working unchanged.
    debate_question: str | None = None
    children: list[JudgeChildContext] = Field(default_factory=list)


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
