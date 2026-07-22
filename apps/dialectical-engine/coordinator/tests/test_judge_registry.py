from app.scoring.judge_registry import (
    PRIMARY_NODE_SCORING_JUDGE,
    JudgeContract,
    active_contract,
)


def _contract(**overrides) -> JudgeContract:
    base = dict(
        judge_id="node_scoring.primary",
        judge_version="v1",
        role="judge",
        rubric_version="debateai-rubric-v1",
        prompt_version="scoring-provider-v1",
        schema_version="claim-assessment-v1",
        reducer_version="node-scoring-reducer-v1",
    )
    base.update(overrides)
    return JudgeContract(**base)


def test_contract_hash_is_stable_for_identical_contracts() -> None:
    assert _contract().contract_hash == _contract().contract_hash
    assert len(_contract().contract_hash) == 64  # sha256 hex


def test_contract_hash_changes_when_prompt_version_changes() -> None:
    assert _contract().contract_hash != _contract(prompt_version="scoring-provider-v2").contract_hash


def test_contract_hash_changes_when_rubric_version_changes() -> None:
    assert _contract().contract_hash != _contract(rubric_version="debateai-rubric-v2").contract_hash


def test_contract_hash_changes_when_reducer_version_changes() -> None:
    assert _contract().contract_hash != _contract(reducer_version="node-scoring-reducer-v2").contract_hash


def test_contract_hash_covers_claim_assessment_schema() -> None:
    # Hash input embeds the ClaimAssessment JSON schema, so schema drift changes identity.
    payload = _contract().hash_payload()
    assert '"claim-assessment-schema"' in payload or "claim-assessment-schema" in payload


def test_active_contract_returns_primary_judge_for_judge_role() -> None:
    contract = active_contract("judge")
    assert contract is PRIMARY_NODE_SCORING_JUDGE
    assert contract.judge_id == "node_scoring.primary"
    assert contract.judge_version == "v1"
    assert contract.reducer_version == "node-scoring-reducer-v2"
    assert contract.rubric_version == "debateai-rubric-v1"


def test_active_primary_judge_contract_hash_differs_from_pre_bump_v1_hash() -> None:
    # Task 3 (tree-aware judge payload, docs/improvement-plan-2026-07-22.md
    # §P2.3): the judge prompt changed (debate_question + real children now
    # sent to the judge), so prompt_version was bumped v1 -> v2 in BOTH
    # app.scoring.judges.ScoringProviderRequest and
    # app.scoring.judge_registry.SCORING_PROMPT_VERSION. _contract()'s
    # defaults above (rubric/schema/reducer versions + judge identity) are
    # exactly the pre-bump v1 identity, so this regression-proofs the judge
    # contract system's whole reason for existing: a prompt change MUST
    # change contract_hash so every cached NodeScoringResult/
    # JudgeOutputArtifact invalidates by design. If SCORING_PROMPT_VERSION
    # were ever reverted to v1 by accident, the two hashes would collide and
    # this test would catch it.
    pre_bump_v1_contract = _contract()
    assert PRIMARY_NODE_SCORING_JUDGE.prompt_version == "scoring-provider-v2"
    assert PRIMARY_NODE_SCORING_JUDGE.prompt_version != pre_bump_v1_contract.prompt_version
    assert PRIMARY_NODE_SCORING_JUDGE.contract_hash != pre_bump_v1_contract.contract_hash


def test_active_primary_judge_contract_hash_differs_from_pre_task4_reducer_v1_hash() -> None:
    # Task 4 (uncertainty -> labeled drivers + dispersion-derived numeric,
    # docs/improvement-plan-2026-07-22.md Sec P2.1): reduce_assessments now
    # emits uncertainty_drivers/uncertainty_source on every NodeScoringPayload,
    # so reducer_version was bumped v1 -> v2 in both app.scoring.reducer.
    # REDUCER_VERSION and (transitively, via that import)
    # app.scoring.judge_registry.PRIMARY_NODE_SCORING_JUDGE. _contract()'s
    # defaults above are exactly the pre-bump v1 identity (prompt_version is
    # even still pinned at its own pre-Task-3 "scoring-provider-v1" default,
    # which is irrelevant here -- only reducer_version changes in this
    # task), so this regression-proofs the same invariant as the Task 3
    # prompt_version test above: a reducer change MUST change contract_hash
    # so every cached NodeScoringResult/JudgeOutputArtifact invalidates.
    pre_bump_v1_contract = _contract()
    assert PRIMARY_NODE_SCORING_JUDGE.reducer_version == "node-scoring-reducer-v2"
    assert PRIMARY_NODE_SCORING_JUDGE.reducer_version != pre_bump_v1_contract.reducer_version
    assert PRIMARY_NODE_SCORING_JUDGE.contract_hash != pre_bump_v1_contract.contract_hash


def test_active_contract_rejects_unknown_role() -> None:
    import pytest

    with pytest.raises(KeyError):
        active_contract("nonexistent_role")
