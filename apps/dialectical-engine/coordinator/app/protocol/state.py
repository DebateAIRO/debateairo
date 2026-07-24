"""Persisted epistemic-protocol phase state, stored inside Debate.config.

No schema change: the state lives at debate_config["protocol_state"], a
plain JSON-serializable dict. This module only produces/reads/updates plain
dicts — it never touches the ORM or a session directly (integration call
sites in dialectical_v2.py own the Debate/session plumbing).

No-false-green law: phases in NOT_IMPLEMENTED_PHASES do not exist in this
slice and must always report "not_implemented" — attempting to move one to
any other status raises.
"""
from __future__ import annotations

from typing import Any

from app.protocol.triage import triage_debate

PROTOCOL_VERSION = "protocol-v1"

PHASE_NAMES: tuple[str, ...] = (
    "5.1_triage",
    "5.2_decomposition",
    "5.3_generation",
    "5.4_cross_exam",
    "5.5_verification",
    "5.6_qbaf_scoring",
    "5.7_convergence",
    "5.8_synthesis",
)

NOT_IMPLEMENTED_PHASES: frozenset[str] = frozenset()

_VALID_STATUSES = {"pending", "in_progress", "complete", "not_implemented", "failed"}


def initialize_protocol_state(topic: str, config: dict[str, Any] | None) -> dict[str, Any]:
    """Run triage and build the initial protocol_state dict for a new debate.

    Returns a plain, JSON-serializable dict meant to be merged into
    Debate.config under the "protocol_state" key by the caller.
    """
    decision = triage_debate(topic, config)
    phases: dict[str, str] = {name: "pending" for name in PHASE_NAMES}
    phases["5.1_triage"] = "complete"
    for phase in NOT_IMPLEMENTED_PHASES:
        phases[phase] = "not_implemented"

    return {
        "version": PROTOCOL_VERSION,
        "triage": {
            "difficulty": decision.difficulty,
            # ADVISORY ONLY -- nothing reads this back as a budget. Enforced depth
            # control lives in app.services.dialectical_v2.expansion_depth_limit(), and
            # the frontier's real bound is the priority floor (P1 Task 6). This value
            # records the triage classifier's difficulty read, nothing more. Do not
            # reintroduce it as a control input without wiring an enforcement site.
            "depth_budget": decision.depth_budget,
            "verification_required": decision.verification_required,
            "rationale": list(decision.rationale),
            "classifier_version": decision.classifier_version,
        },
        "phases": phases,
    }


def advance_phase(state: dict[str, Any], phase: str, status: str) -> dict[str, Any]:
    """Return a NEW protocol_state dict with `phase` set to `status`.

    Never mutates `state`. Raises ValueError for an unknown phase name, an
    unknown status literal, or any attempt to move a not-yet-implemented
    phase (see NOT_IMPLEMENTED_PHASES) away from "not_implemented"
    (no-false-green law).
    """
    if phase not in PHASE_NAMES:
        raise ValueError(f"Unknown protocol phase: {phase!r}")
    if status not in _VALID_STATUSES:
        raise ValueError(f"Unknown protocol phase status: {status!r}")
    if phase in NOT_IMPLEMENTED_PHASES and status != "not_implemented":
        raise ValueError(
            f"Refusing to change {phase!r} away from not_implemented to {status!r}: "
            "this phase has no real implementation registered in this slice "
            "(no-false-green law) — implement and register the phase in "
            "NOT_IMPLEMENTED_PHASES/state.py first."
        )

    new_phases = dict(state.get("phases", {}))
    new_phases[phase] = status
    return {**state, "phases": new_phases}


def protocol_state_of(debate_config: dict[str, Any] | None) -> dict[str, Any] | None:
    """Read the protocol_state dict back out of a Debate.config-shaped dict."""
    if not debate_config:
        return None
    state = debate_config.get("protocol_state")
    return state if isinstance(state, dict) else None
