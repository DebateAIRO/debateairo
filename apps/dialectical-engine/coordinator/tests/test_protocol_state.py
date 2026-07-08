import pytest

from app.protocol import state as protocol_state_module
from app.protocol.state import (
    NOT_IMPLEMENTED_PHASES,
    PROTOCOL_VERSION,
    advance_phase,
    initialize_protocol_state,
    protocol_state_of,
)


def test_initialize_includes_triage_and_honest_not_implemented_phases():
    state = initialize_protocol_state("Cities should ban cars downtown.", None)
    assert state["version"] == PROTOCOL_VERSION
    assert state["triage"]["difficulty"] == "contested"
    assert state["triage"]["classifier_version"] == "triage-v1"
    phases = state["phases"]
    assert phases["5.1_triage"] == "complete"
    assert phases["5.2_decomposition"] == "pending"
    assert phases["5.3_generation"] == "pending"
    assert phases["5.4_cross_exam"] == "pending"
    assert phases["5.5_verification"] == "pending"
    assert phases["5.6_qbaf_scoring"] == "pending"
    # 5.7 is now registered/implemented (Task 2 of Phase 5c) and defaults to
    # "pending" like every other implemented phase -- re-pinned from the
    # prior "not_implemented" expectation now that NOT_IMPLEMENTED_PHASES is
    # empty (FLAGGED: this assertion's expected value changed in Task 2).
    assert phases["5.7_convergence"] == "pending"
    assert phases["5.8_synthesis"] == "pending"


def test_advance_phase_is_pure_and_does_not_mutate_input():
    state = initialize_protocol_state("The Earth orbits the Sun.", None)
    original_phases = dict(state["phases"])
    new_state = advance_phase(state, "5.2_decomposition", "complete")
    assert state["phases"] == original_phases  # untouched
    assert new_state["phases"]["5.2_decomposition"] == "complete"
    assert new_state is not state


def test_advance_phase_round_trips_through_plain_dict():
    state = initialize_protocol_state("The Earth orbits the Sun.", None)
    state = advance_phase(state, "5.2_decomposition", "complete")
    debate_config: dict = {"max_depth": 2, "protocol_state": state}
    loaded = protocol_state_of(debate_config)
    assert loaded == state
    assert loaded["phases"]["5.2_decomposition"] == "complete"


def test_protocol_state_of_returns_none_when_absent():
    assert protocol_state_of({"max_depth": 2}) is None
    assert protocol_state_of(None) is None


def test_advance_unknown_phase_raises_value_error():
    state = initialize_protocol_state("The Earth orbits the Sun.", None)
    with pytest.raises(ValueError):
        advance_phase(state, "5.99_nonexistent", "complete")


@pytest.mark.parametrize("phase", sorted(NOT_IMPLEMENTED_PHASES))
def test_no_false_green_cannot_mark_not_implemented_phase_complete(phase):
    state = initialize_protocol_state("The Earth orbits the Sun.", None)
    with pytest.raises(ValueError, match="not_implemented"):
        advance_phase(state, phase, "complete")


@pytest.mark.parametrize("phase", sorted(NOT_IMPLEMENTED_PHASES))
@pytest.mark.parametrize("status", ["in_progress", "pending", "failed"])
def test_not_implemented_phase_cannot_move_to_any_other_status(phase, status):
    state = initialize_protocol_state("The Earth orbits the Sun.", None)
    with pytest.raises(ValueError, match="not_implemented"):
        advance_phase(state, phase, status)


# --- Synthetic-freeze guard coverage (Phase 5c Task 2 fix wave) ---
#
# NOT_IMPLEMENTED_PHASES is currently an empty frozenset, so the two
# parametrized tests above collect zero cases and are silently skipped.
# The no-false-green guard in advance_phase (state.py) must stay verified
# independent of whether any phase is currently frozen. These tests
# monkeypatch the module-level NOT_IMPLEMENTED_PHASES to a synthetic,
# clearly-fake freeze of a real registered phase key ("5.6_qbaf_scoring")
# and assert the guard still fires -- and that "not_implemented" itself
# remains allowed. Do not delete or modify the pre-existing parametrized
# tests above: they reactivate automatically if a phase is ever re-frozen.


@pytest.mark.parametrize("status", ["complete", "in_progress"])
def test_synthetic_frozen_phase_cannot_move_to_other_status(monkeypatch, status):
    monkeypatch.setattr(
        protocol_state_module,
        "NOT_IMPLEMENTED_PHASES",
        frozenset({"5.6_qbaf_scoring"}),
    )
    state = initialize_protocol_state("The Earth orbits the Sun.", None)
    with pytest.raises(ValueError) as exc_info:
        advance_phase(state, "5.6_qbaf_scoring", status)
    message = str(exc_info.value)
    assert "not_implemented" in message
    assert "5.6_qbaf_scoring" in message
    assert "no-false-green law" in message


def test_synthetic_frozen_phase_can_still_be_set_to_not_implemented(monkeypatch):
    monkeypatch.setattr(
        protocol_state_module,
        "NOT_IMPLEMENTED_PHASES",
        frozenset({"5.6_qbaf_scoring"}),
    )
    state = initialize_protocol_state("The Earth orbits the Sun.", None)
    new_state = advance_phase(state, "5.6_qbaf_scoring", "not_implemented")
    assert new_state["phases"]["5.6_qbaf_scoring"] == "not_implemented"


def test_cross_exam_and_verification_are_no_longer_not_implemented():
    state = initialize_protocol_state("The Earth orbits the Sun.", None)
    assert state["phases"]["5.4_cross_exam"] == "pending"
    assert state["phases"]["5.5_verification"] == "pending"
    assert "5.4_cross_exam" not in NOT_IMPLEMENTED_PHASES
    assert "5.5_verification" not in NOT_IMPLEMENTED_PHASES


def test_cross_exam_and_verification_can_advance_to_complete():
    state = initialize_protocol_state("The Earth orbits the Sun.", None)
    state = advance_phase(state, "5.4_cross_exam", "complete")
    state = advance_phase(state, "5.5_verification", "complete")
    assert state["phases"]["5.4_cross_exam"] == "complete"
    assert state["phases"]["5.5_verification"] == "complete"


def test_qbaf_scoring_is_no_longer_not_implemented():
    state = initialize_protocol_state("The Earth orbits the Sun.", None)
    assert state["phases"]["5.6_qbaf_scoring"] == "pending"
    assert "5.6_qbaf_scoring" not in NOT_IMPLEMENTED_PHASES
    # 5.7 is now registered in Task 2 as well -- re-pinned from the prior
    # "still not_implemented until Task 2" expectation (FLAGGED: this
    # assertion's expected value changed in Task 2).
    assert state["phases"]["5.7_convergence"] == "pending"
    assert "5.7_convergence" not in NOT_IMPLEMENTED_PHASES


def test_qbaf_scoring_can_advance_to_complete():
    state = initialize_protocol_state("The Earth orbits the Sun.", None)
    state = advance_phase(state, "5.6_qbaf_scoring", "complete")
    assert state["phases"]["5.6_qbaf_scoring"] == "complete"


def test_convergence_can_advance_to_complete():
    state = initialize_protocol_state("The Earth orbits the Sun.", None)
    state = advance_phase(state, "5.7_convergence", "complete")
    assert state["phases"]["5.7_convergence"] == "complete"


def test_not_implemented_phases_is_now_empty():
    # 5.7 was the last phase in NOT_IMPLEMENTED_PHASES (Phase 5c Task 2);
    # all 8 protocol phases are now registered/implemented in this slice.
    assert NOT_IMPLEMENTED_PHASES == frozenset()


def test_version_is_pinned():
    state = initialize_protocol_state("The Earth orbits the Sun.", None)
    assert state["version"] == "protocol-v1"


def test_advance_phase_accepts_in_progress_status():
    state = initialize_protocol_state("The Earth orbits the Sun.", None)
    new_state = advance_phase(state, "5.3_generation", "in_progress")
    assert new_state["phases"]["5.3_generation"] == "in_progress"
