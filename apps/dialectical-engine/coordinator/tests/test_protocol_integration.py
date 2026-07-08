from __future__ import annotations

from unittest.mock import patch

from app.protocol.state import protocol_state_of
from app.services import dialectical_v2 as service

from test_dialectical_v2 import complete_worker_v2_pipeline, real_codex_worker


def test_new_debate_has_protocol_state_with_triage(db) -> None:
    real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    state = protocol_state_of(debate.config)
    assert state is not None
    assert state["triage"]["difficulty"] in ("simple", "contested", "high_stakes")
    assert state["phases"]["5.1_triage"] == "complete"


def test_decomposition_complete_and_generation_in_progress_after_pov_loop(db) -> None:
    real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    state = protocol_state_of(debate.config)
    assert state["phases"]["5.2_decomposition"] == "complete"
    assert state["phases"]["5.3_generation"] == "in_progress"
    # 5.4/5.5/5.6/5.7 are now implemented/registered phases (P5b/P5c Task 1/2)
    # and default to "pending" until the pipeline advances them.
    # FLAGGED: 5.7_convergence's expected value re-pinned from
    # "not_implemented" to "pending" now that Task 2 registers it --
    # NOT_IMPLEMENTED_PHASES is empty as of this task.
    assert state["phases"]["5.4_cross_exam"] == "pending"
    assert state["phases"]["5.5_verification"] == "pending"
    assert state["phases"]["5.6_qbaf_scoring"] == "pending"
    assert state["phases"]["5.7_convergence"] == "pending"


def test_generation_and_synthesis_markers_complete_after_worker_pipeline(db) -> None:
    worker = real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})

    complete_worker_v2_pipeline(db, debate, worker)

    db.refresh(debate)
    state = protocol_state_of(debate.config)
    assert state["phases"]["5.3_generation"] == "complete"
    assert state["phases"]["5.8_synthesis"] == "complete"


def test_marker_update_failure_does_not_fail_the_debate_creation(db) -> None:
    real_codex_worker(db)
    with patch(
        "app.services.dialectical_v2.initialize_protocol_state",
        side_effect=RuntimeError("simulated marker failure"),
    ):
        debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    assert debate.status == "generating"
    # best-effort: no protocol_state key at all rather than a crash
    assert protocol_state_of(debate.config) is None


def test_marker_update_failure_does_not_fail_synthesis_persistence(db) -> None:
    worker = real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    with patch(
        "app.services.dialectical_v2.advance_phase",
        side_effect=RuntimeError("simulated marker failure"),
    ):
        complete_worker_v2_pipeline(db, debate, worker)
    db.refresh(debate)
    assert debate.status == "complete"  # synthesis itself must still succeed
