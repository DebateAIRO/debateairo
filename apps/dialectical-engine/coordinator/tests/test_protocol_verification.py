import pytest

from app.protocol.verification import (
    VERIFICATION_VERSION,
    classify_verification,
    verification_statuses,
)


@pytest.mark.parametrize("claim_type", ["empirical", "causal", "prediction", "comparative"])
def test_verifiable_kinds_are_pending_verification(claim_type):
    assert classify_verification(claim_type) == "pending_verification"


@pytest.mark.parametrize("claim_type", ["normative", "definitional"])
def test_unverifiable_kinds_are_unverifiable_by_kind(claim_type):
    assert classify_verification(claim_type) == "unverifiable_by_kind"


@pytest.mark.parametrize("claim_type", ["mixed", "unknown"])
def test_ambiguous_kinds_default_conservatively_to_pending_verification(claim_type):
    assert classify_verification(claim_type) == "pending_verification"


def test_verification_statuses_builds_per_node_map():
    nodes_with_claims = [
        {"id": "n1", "claim_type": "empirical"},
        {"id": "n2", "claim_type": "normative"},
    ]
    result = verification_statuses(nodes_with_claims)
    assert result == {"n1": "pending_verification", "n2": "unverifiable_by_kind"}


def test_verification_statuses_empty_input():
    assert verification_statuses([]) == {}


def test_version_is_pinned():
    assert VERIFICATION_VERSION == "verification-v1"
