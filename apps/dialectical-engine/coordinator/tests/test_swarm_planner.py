from __future__ import annotations

from app.core.auth import hash_token
from app.main import app as _app  # noqa: F401  (import order: warms app.scoring before app.services.orchestrator to avoid the pre-existing orchestrator<->scoring circular import, mirrors test_worker_lifecycle_states.py)
from app.models.entities import Worker, now_utc
from app.services import dialectical_v2
from app.services.orchestrator import SWARM_DEFAULT_MODEL_ID, create_debate
from app.services.swarm_planner import SWARM_VERSION, plan_swarm


def make_worker(db, *, id: str, capabilities: list[str] | None = None, status: str = "online") -> Worker:
    worker = Worker(
        id=id,
        name=f"worker-{id}",
        token_hash=hash_token(f"{id}-token"),
        capabilities=capabilities if capabilities is not None else ["mock-local"],
        last_seen=now_utc(),
        status=status,
    )
    db.add(worker)
    db.commit()
    return worker


def test_plan_swarm_full_assignment_when_enough_workers(db) -> None:
    workers = [make_worker(db, id=f"w{i}") for i in range(3)]
    result = plan_swarm(requested_perspectives=3, capable_workers=workers)
    assert result["version"] == SWARM_VERSION
    assert result["requestedPerspectives"] == 3
    assert len(result["assignments"]) == 3
    assert result["shortfall"] == 0


def test_plan_swarm_honest_partial_assignment_when_fewer_workers(db) -> None:
    workers = [make_worker(db, id="w0"), make_worker(db, id="w1")]
    result = plan_swarm(requested_perspectives=5, capable_workers=workers)
    assert len(result["assignments"]) == 2
    assert result["shortfall"] == 3
    # Never fabricates a 3rd/4th/5th worker:
    assert {a["workerId"] for a in result["assignments"]} == {"w0", "w1"}


def test_plan_swarm_zero_workers_never_fabricates(db) -> None:
    result = plan_swarm(requested_perspectives=4, capable_workers=[])
    assert result["assignments"] == []
    assert result["shortfall"] == 4


def test_plan_swarm_zero_requested_is_honest_noop(db) -> None:
    workers = [make_worker(db, id="w0")]
    result = plan_swarm(requested_perspectives=0, capable_workers=workers)
    assert result["assignments"] == []
    assert result["shortfall"] == 0


def test_plan_swarm_negative_requested_clamps_shortfall_to_zero(db) -> None:
    workers = [make_worker(db, id="w0")]
    result = plan_swarm(requested_perspectives=-3, capable_workers=workers)
    assert result["assignments"] == []
    assert result["shortfall"] == 0


def test_plan_swarm_assignment_shape_and_deterministic_order(db) -> None:
    workers = [make_worker(db, id="w0"), make_worker(db, id="w1")]
    result = plan_swarm(requested_perspectives=2, capable_workers=workers)
    assert result["assignments"] == [
        {"index": 0, "workerId": "w0", "modelId": "mock-local"},
        {"index": 1, "workerId": "w1", "modelId": "mock-local"},
    ]


def test_plan_swarm_never_exceeds_len_capable_workers(db) -> None:
    # Hard honesty invariant: assignments length is always <= len(capable_workers).
    for requested in (0, 1, 2, 3, 10):
        workers = [make_worker(db, id=f"cap{requested}-{i}") for i in range(2)]
        result = plan_swarm(requested_perspectives=requested, capable_workers=workers)
        assert len(result["assignments"]) <= len(workers)


def test_create_debate_flag_off_writes_no_swarm_key(db, monkeypatch) -> None:
    monkeypatch.delenv("DIALECTICAL_SWARM", raising=False)
    make_worker(db, id="off-w0")
    debate = create_debate(db, "topic", config={"swarm": {"requestedPerspectives": 3}})
    assert "swarm" not in (debate.config or {})


def test_create_debate_flag_off_explicit_false_writes_no_swarm_key(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_SWARM", "false")
    make_worker(db, id="off2-w0")
    debate = create_debate(db, "topic", config={"swarm": {"requestedPerspectives": 3}})
    assert "swarm" not in (debate.config or {})


def test_create_debate_flag_on_no_request_writes_no_swarm_key(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_SWARM", "true")
    make_worker(db, id="norequest-w0")
    debate = create_debate(db, "topic", config={"max_depth": 1})
    assert "swarm" not in (debate.config or {})


def test_create_debate_flag_on_writes_real_worker_derived_swarm(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_SWARM", "true")
    make_worker(db, id="on-w0", capabilities=["codex-gpt-5.5"])
    make_worker(db, id="on-w1", capabilities=["codex-gpt-5.5"])

    debate = create_debate(db, "topic", config={"swarm": {"requestedPerspectives": 2}})
    assert debate.config["swarm"]["version"] == "swarm-v1"
    assert len(debate.config["swarm"]["assignments"]) <= 2
    assert debate.config["swarm"]["requestedPerspectives"] == 2
    assert debate.config["swarm"]["shortfall"] == 0
    assert {a["workerId"] for a in debate.config["swarm"]["assignments"]} == {"on-w0", "on-w1"}


def test_create_debate_flag_on_honest_shortfall_when_fewer_real_workers(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_SWARM", "true")
    make_worker(db, id="short-w0", capabilities=["codex-gpt-5.5"])

    debate = create_debate(db, "topic", config={"swarm": {"requestedPerspectives": 4}})
    swarm = debate.config["swarm"]
    assert len(swarm["assignments"]) == 1
    assert swarm["shortfall"] == 3
    assert swarm["assignments"][0]["workerId"] == "short-w0"


def test_create_debate_flag_on_zero_workers_empty_assignments_debate_still_created(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_SWARM", "true")
    # No workers registered at all.
    debate = create_debate(db, "topic", config={"swarm": {"requestedPerspectives": 3}})
    swarm = debate.config["swarm"]
    assert swarm["assignments"] == []
    assert swarm["shortfall"] == 3
    # Debate creation must still succeed -- swarm is a descriptor, not a blocker.
    assert debate.id
    assert debate.status == "generating"


def test_create_debate_flag_on_invalid_requested_perspectives_defaults_honestly(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_SWARM", "true")
    make_worker(db, id="invalid-w0")
    debate = create_debate(db, "topic", config={"swarm": {"requestedPerspectives": "not-a-number"}})
    swarm = debate.config["swarm"]
    # Invalid input falls back to a default (mirrors convergence_epsilon's
    # invalid -> default + honest note pattern), never raises, never silently
    # fabricates a worker count.
    assert isinstance(swarm["requestedPerspectives"], int)
    assert swarm["requestedPerspectives"] >= 0


def test_swarm_default_model_id_matches_v2_codex_model_id_drift_guard() -> None:
    # orchestrator.SWARM_DEFAULT_MODEL_ID is a duplicated literal (not an
    # import, to avoid a circular import with dialectical_v2) that must stay
    # in lockstep with dialectical_v2.V2_CODEX_MODEL_ID -- the real default
    # arguer model. This test pins that the two constants never drift apart.
    assert SWARM_DEFAULT_MODEL_ID == dialectical_v2.V2_CODEX_MODEL_ID


def test_create_debate_flag_on_mixed_online_offline_workers_only_assigns_online(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_SWARM", "true")
    make_worker(db, id="mixed-online", capabilities=[SWARM_DEFAULT_MODEL_ID], status="online")
    make_worker(db, id="mixed-offline", capabilities=[SWARM_DEFAULT_MODEL_ID], status="offline")

    debate = create_debate(db, "topic", config={"swarm": {"requestedPerspectives": 2}})
    swarm = debate.config["swarm"]
    assert len(swarm["assignments"]) == 1
    assert swarm["assignments"][0]["workerId"] == "mixed-online"
    assert swarm["shortfall"] == 1
