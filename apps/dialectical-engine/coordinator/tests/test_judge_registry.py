from app.scoring.judge_registry import (
    PRIMARY_NODE_SCORING_JUDGE,
    JudgeContract,
    active_contract,
    judge_panel_role,
    panel_contract,
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
    # Task 5 (strength composition honest for evidence-empty claims,
    # docs/improvement-plan-2026-07-22.md Sec P2.4) bumped this v2 -> v3.
    assert contract.reducer_version == "node-scoring-reducer-v3"
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
    #
    # Task 5 amendment: reducer_version has since moved again (v2 -> v3, see
    # the test below), so the live-value assertion here was updated to match
    # -- the property under test (today's hash differs from the pre-Task-3
    # all-v1 baseline) still holds transitively regardless of how many times
    # reducer_version has been bumped since.
    pre_bump_v1_contract = _contract()
    assert PRIMARY_NODE_SCORING_JUDGE.reducer_version == "node-scoring-reducer-v3"
    assert PRIMARY_NODE_SCORING_JUDGE.reducer_version != pre_bump_v1_contract.reducer_version
    assert PRIMARY_NODE_SCORING_JUDGE.contract_hash != pre_bump_v1_contract.contract_hash


def test_active_primary_judge_contract_hash_differs_from_pre_task5_reducer_v2_hash() -> None:
    # Task 5 (strength composition honest for evidence-empty claims,
    # docs/improvement-plan-2026-07-22.md Sec P2.4): reduce_assessments now
    # branches base_strength's composition on claim.claim_type
    # (argument-only renormalized weights for normative/definitional claims
    # that can never carry external evidence; unchanged evidence-weighted
    # composition for every other claim type) and stamps
    # NodeScoringPayload.strength_kind -- a real, semantic change to what
    # the reducer produces from the same inputs, so reducer_version was
    # bumped v2 -> v3 in app.scoring.reducer.REDUCER_VERSION (and,
    # transitively via that import,
    # app.scoring.judge_registry.PRIMARY_NODE_SCORING_JUDGE). Unlike the
    # Task 4 test above (which compares against the full pre-Task-3 all-v1
    # baseline), this pins every OTHER field at its current live value
    # (prompt_version is already Task 3's "scoring-provider-v2") so it
    # isolates exactly the Task 5 bump.
    pre_bump_v2_contract = _contract(
        prompt_version="scoring-provider-v2",
        reducer_version="node-scoring-reducer-v2",
    )
    assert PRIMARY_NODE_SCORING_JUDGE.reducer_version == "node-scoring-reducer-v3"
    assert PRIMARY_NODE_SCORING_JUDGE.reducer_version != pre_bump_v2_contract.reducer_version
    assert PRIMARY_NODE_SCORING_JUDGE.contract_hash != pre_bump_v2_contract.contract_hash


def test_active_contract_rejects_unknown_role() -> None:
    import pytest

    with pytest.raises(KeyError):
        active_contract("nonexistent_role")


# Task 6 (cross-family judge panel, docs/improvement-plan-2026-07-22.md
# §P2.2 point 3): "one JudgeContract per panel family (judge_id
# node_scoring.panel.<family>, same prompt/schema/reducer versions as
# primary -> distinct contract_hash per judge)".
def test_judge_panel_role_is_distinct_per_family() -> None:
    assert judge_panel_role("claude") == "judge_panel_claude"
    assert judge_panel_role("gemini") == "judge_panel_gemini"
    assert judge_panel_role("claude") != judge_panel_role("gemini")


def test_panel_contract_uses_the_documented_judge_id_shape() -> None:
    contract = panel_contract("claude")
    assert contract.judge_id == "node_scoring.panel.claude"
    assert contract.role == "judge"


def test_panel_contract_shares_primary_prompt_schema_and_reducer_versions() -> None:
    # Task 6 does not change prompt content or reducer math (brief's "Do
    # NOT change" list) -- a panel judge's contract must pin the exact same
    # rubric/prompt/schema/reducer versions as the primary, so it is scored
    # (and its cache invalidated) under identical rules.
    contract = panel_contract("gemini")
    assert contract.rubric_version == PRIMARY_NODE_SCORING_JUDGE.rubric_version
    assert contract.prompt_version == PRIMARY_NODE_SCORING_JUDGE.prompt_version
    assert contract.schema_version == PRIMARY_NODE_SCORING_JUDGE.schema_version
    assert contract.reducer_version == PRIMARY_NODE_SCORING_JUDGE.reducer_version


def test_panel_contract_hash_differs_from_primary_and_between_families() -> None:
    claude_contract = panel_contract("claude")
    gemini_contract = panel_contract("gemini")
    assert claude_contract.contract_hash != PRIMARY_NODE_SCORING_JUDGE.contract_hash
    assert gemini_contract.contract_hash != PRIMARY_NODE_SCORING_JUDGE.contract_hash
    assert claude_contract.contract_hash != gemini_contract.contract_hash


def test_panel_contract_is_deterministic_for_the_same_family() -> None:
    # Two independently-built contracts for the same family must be
    # value-equal (same contract_hash) even though they are not the same
    # object -- active_contract derives a panel contract on demand from the
    # role string rather than reading a pre-built singleton (see
    # test_active_contract_derives_panel_contract_from_role_prefix below).
    assert panel_contract("claude").contract_hash == panel_contract("claude").contract_hash


def test_active_contract_derives_panel_contract_from_role_prefix() -> None:
    contract = active_contract(judge_panel_role("claude"))
    assert contract.contract_hash == panel_contract("claude").contract_hash
    assert contract.judge_id == "node_scoring.panel.claude"


def test_active_contract_still_returns_primary_for_plain_judge_role() -> None:
    # Regression: the panel-role-prefix handling in active_contract must not
    # disturb the existing "judge" -> PRIMARY_NODE_SCORING_JUDGE lookup.
    assert active_contract("judge") is PRIMARY_NODE_SCORING_JUDGE


def test_active_contract_rejects_a_bare_panel_prefix_with_no_family() -> None:
    import pytest

    with pytest.raises(KeyError):
        active_contract("judge_panel_")
