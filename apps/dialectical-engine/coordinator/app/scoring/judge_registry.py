"""Immutable judge contracts.

A JudgeContract pins every semantic input of a persisted score: rubric,
prompt, output schema, and reducer versions, plus the ClaimAssessment JSON
schema itself. Its contract_hash is persisted on artifacts and cache rows
so old outputs can never be silently reinterpreted by newer code.
"""
from __future__ import annotations

import hashlib
import json
from functools import cached_property

from pydantic import BaseModel, ConfigDict

from app.scoring.models import ClaimAssessment
from app.scoring.reducer import REDUCER_VERSION, RUBRIC_VERSION

CLAIM_ASSESSMENT_SCHEMA_VERSION = "claim-assessment-v1"
# Task 3 (tree-aware judge payload, docs/improvement-plan-2026-07-22.md
# §P2.3): bumped v1 -> v2 because render_single_node_judge_prompt's payload
# and instructions changed (debate_question + real PRO/CON children now sent
# to the judge; context.relevance and critic.counterargument_strength are
# now scored against them instead of nothing/imagined counters). Keep this in
# sync with app.scoring.judges.ScoringProviderRequest.prompt_version's
# default -- both are bumped together by design so contract_hash changes and
# every cached NodeScoringResult/JudgeOutputArtifact invalidates.
SCORING_PROMPT_VERSION = "scoring-provider-v2"


class JudgeContract(BaseModel):
    model_config = ConfigDict(frozen=True)

    judge_id: str
    judge_version: str
    role: str
    rubric_version: str
    prompt_version: str
    schema_version: str
    reducer_version: str

    def hash_payload(self) -> str:
        payload = {
            "judge_id": self.judge_id,
            "judge_version": self.judge_version,
            "role": self.role,
            "rubric_version": self.rubric_version,
            "prompt_version": self.prompt_version,
            "schema_version": self.schema_version,
            "reducer_version": self.reducer_version,
            "claim-assessment-schema": ClaimAssessment.model_json_schema(),
        }
        return json.dumps(payload, sort_keys=True, separators=(",", ":"))

    @cached_property
    def contract_hash(self) -> str:
        return hashlib.sha256(self.hash_payload().encode("utf-8")).hexdigest()


PRIMARY_NODE_SCORING_JUDGE = JudgeContract(
    judge_id="node_scoring.primary",
    judge_version="v1",
    role="judge",
    rubric_version=RUBRIC_VERSION,
    prompt_version=SCORING_PROMPT_VERSION,
    schema_version=CLAIM_ASSESSMENT_SCHEMA_VERSION,
    reducer_version=REDUCER_VERSION,
)

_ACTIVE_CONTRACTS: dict[str, JudgeContract] = {
    PRIMARY_NODE_SCORING_JUDGE.role: PRIMARY_NODE_SCORING_JUDGE,
}


def active_contract(role: str) -> JudgeContract:
    return _ACTIVE_CONTRACTS[role]
