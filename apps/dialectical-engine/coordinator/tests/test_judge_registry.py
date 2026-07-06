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
    assert contract.reducer_version == "node-scoring-reducer-v1"
    assert contract.rubric_version == "debateai-rubric-v1"


def test_active_contract_rejects_unknown_role() -> None:
    import pytest

    with pytest.raises(KeyError):
        active_contract("nonexistent_role")
