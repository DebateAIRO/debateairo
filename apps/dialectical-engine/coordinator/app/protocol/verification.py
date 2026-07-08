"""Deterministic verification-status classification for Phase 5.5.

v1 scope, stated honestly: this module classifies whether a claim is the
KIND of thing verification could apply to (by its already-computed claim
type). It does NOT fetch evidence, does NOT generate citations, and does NOT
decide whether a claim is actually true or false. Those responsibilities
belong to a future phase (P7). Marking a claim "pending_verification" here
means only "verification is in-kind and not yet attempted" -- never
"verified".
"""
from __future__ import annotations

from typing import Any

VERIFICATION_VERSION = "verification-v1"

_UNVERIFIABLE_BY_KIND = {"normative", "definitional"}
# empirical, causal, prediction, comparative, mixed, unknown all fall through
# to "pending_verification" -- conservative default so ambiguous claim types
# are never silently excluded from verification consideration.


def classify_verification(claim_type: str) -> str:
    if claim_type in _UNVERIFIABLE_BY_KIND:
        return "unverifiable_by_kind"
    return "pending_verification"


def verification_statuses(nodes_with_claims: list[dict[str, Any]]) -> dict[str, str]:
    """Build a node_id -> verification status map for a batch of claims."""
    return {
        node["id"]: classify_verification(node.get("claim_type", "unknown"))
        for node in nodes_with_claims
        if node.get("id")
    }
