from __future__ import annotations

from app.core.auth import hash_token
from app.main import app as _app  # noqa: F401  (import order: warms app.scoring before app.services.orchestrator to avoid the pre-existing orchestrator<->scoring circular import, mirrors test_swarm_planner.py)
from app.models.entities import Debate, Job, Node, Worker, now_utc
from app.services.swarm_dispatch import dispatch_swarm_assignments, swarm_status


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


def _make_debate(db, *, config: dict) -> Debate:
    debate = Debate(topic="swarm dispatch topic", status="generating", config=config)
    db.add(debate)
    db.commit()
    return debate


def _make_root_node(db, debate: Debate) -> Node:
    root = Node(
        debate_id=debate.id,
        parent_id=None,
        node_type="ROOT_CLAIM",
        depth=0,
        position=0,
        claim=debate.topic,
        status="pending",
        materialized_path="/0",
    )
    db.add(root)
    db.commit()
    debate.root_node_id = root.id
    db.commit()
    return root


def _make_debate_with_swarm(db, *, assignments: list[dict]) -> Debate:
    debate = _make_debate(
        db,
        config={
            "swarm": {
                "version": "swarm-v1",
                "requestedPerspectives": len(assignments),
                "assignments": [dict(a) for a in assignments],
                "shortfall": 0,
            }
        },
    )
    _make_root_node(db, debate)
    return debate


def _make_debate_with_dispatched_swarm(db) -> Debate:
    debate = _make_debate_with_swarm(
        db,
        assignments=[
            {"index": 0, "workerId": "w0", "modelId": "m1"},
            {"index": 1, "workerId": "w1", "modelId": "m1"},
        ],
    )
    dispatch_swarm_assignments(db, debate)
    return debate


def test_dispatch_swarm_assignments_noop_when_no_swarm_key(db) -> None:
    debate = _make_debate(db, config={})
    assert dispatch_swarm_assignments(db, debate) is None


def test_dispatch_creates_one_real_job_per_assignment(db) -> None:
    debate = _make_debate_with_swarm(
        db,
        assignments=[
            {"index": 0, "workerId": "w0", "modelId": "m1"},
            {"index": 1, "workerId": "w1", "modelId": "m1"},
        ],
    )
    dispatch_swarm_assignments(db, debate)
    updated = debate.config["swarm"]["assignments"]
    assert all(a.get("jobId") for a in updated)
    assert all(a["status"] == "dispatched" for a in updated)
    # Confirm real Job rows exist:
    for a in updated:
        job = db.get(Job, a["jobId"])
        assert job is not None


def test_dispatch_is_best_effort_per_assignment_on_job_creation_failure(db, monkeypatch) -> None:
    # One assignment's model is not currently allowed by routing (simulates a
    # job-creation failure) -- the other assignment must still be dispatched.
    from app.services import orchestrator as orchestrator_module

    monkeypatch.setattr(orchestrator_module, "routing_allowed_models", lambda db: {"m1"})

    debate = _make_debate_with_swarm(
        db,
        assignments=[
            {"index": 0, "workerId": "w0", "modelId": "not-allowed-model"},
            {"index": 1, "workerId": "w1", "modelId": "m1"},
        ],
    )
    dispatch_swarm_assignments(db, debate)
    updated = debate.config["swarm"]["assignments"]
    failed = next(a for a in updated if a["index"] == 0)
    ok = next(a for a in updated if a["index"] == 1)
    assert failed["status"] == "dispatch_failed"
    assert failed.get("reason")
    assert "jobId" not in failed or failed.get("jobId") is None
    assert ok["status"] == "dispatched"
    assert ok.get("jobId")
    job = db.get(Job, ok["jobId"])
    assert job is not None


def test_dispatch_is_idempotent_skips_assignments_with_existing_job_id(db) -> None:
    debate = _make_debate_with_swarm(
        db,
        assignments=[{"index": 0, "workerId": "w0", "modelId": "m1"}],
    )
    dispatch_swarm_assignments(db, debate)
    first_job_id = debate.config["swarm"]["assignments"][0]["jobId"]

    # Calling again must not create a second Job for the same assignment.
    dispatch_swarm_assignments(db, debate)
    second_job_id = debate.config["swarm"]["assignments"][0]["jobId"]
    assert first_job_id == second_job_id


def test_swarm_status_reflects_real_job_states_including_failure(db) -> None:
    debate = _make_debate_with_dispatched_swarm(db)
    updated = debate.config["swarm"]["assignments"]
    job_a = db.get(Job, next(a for a in updated if a["index"] == 0)["jobId"])
    job_b = db.get(Job, next(a for a in updated if a["index"] == 1)["jobId"])
    job_a.status = "failed"
    job_b.status = "complete"
    db.commit()

    status = swarm_status(db, debate)
    statuses = {a["index"]: a["status"] for a in status["assignments"]}
    assert statuses[0] == "failed"
    assert statuses[1] == "complete"
    assert status["complete"] is True  # both terminal -- failure counts as terminal, not hidden


def test_swarm_status_not_complete_while_any_assignment_pending(db) -> None:
    debate = _make_debate_with_dispatched_swarm(db)
    updated = debate.config["swarm"]["assignments"]
    job_a = db.get(Job, next(a for a in updated if a["index"] == 0)["jobId"])
    job_b = db.get(Job, next(a for a in updated if a["index"] == 1)["jobId"])
    job_a.status = "complete"
    job_b.status = "pending"
    db.commit()

    status = swarm_status(db, debate)
    assert status["complete"] is False


def test_swarm_status_none_when_no_swarm_key(db) -> None:
    debate = _make_debate(db, config={})
    assert swarm_status(db, debate) is None


def test_dispatch_swarm_assignments_persists_across_fresh_session(db) -> None:
    debate = _make_debate_with_swarm(
        db,
        assignments=[
            {"index": 0, "workerId": "w0", "modelId": "m1"},
            {"index": 1, "workerId": "w1", "modelId": "m1"},
        ],
    )
    dispatch_swarm_assignments(db, debate)
    debate_id = debate.id

    # Re-fetch from a fresh session view to confirm the write was actually
    # persisted, not just held in the in-memory dict (pins the JSON
    # dirty-tracking bug -- see module docstring -- on the dispatch side,
    # mirroring test_swarm_status_persists_refreshed_statuses below).
    db.expire_all()
    reloaded = db.get(Debate, debate_id)
    updated = reloaded.config["swarm"]["assignments"]
    for a in updated:
        assert a.get("jobId")
        assert a["status"] == "dispatched"


def test_swarm_status_persists_refreshed_statuses(db) -> None:
    debate = _make_debate_with_dispatched_swarm(db)
    updated = debate.config["swarm"]["assignments"]
    job_a = db.get(Job, next(a for a in updated if a["index"] == 0)["jobId"])
    job_a.status = "running"
    db.commit()

    swarm_status(db, debate)

    # Re-fetch from DB to confirm the refreshed status was actually persisted,
    # not just held in the in-memory dict.
    db.expire_all()
    reloaded = db.get(Debate, debate.id)
    statuses = {a["index"]: a["status"] for a in reloaded.config["swarm"]["assignments"]}
    assert statuses[0] == "running"
