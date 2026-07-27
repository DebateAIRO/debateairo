"""POST /api/jobs/{id}/complete, /stream, /fail: blocking DB work must run off
the event loop (2026-07-26 QueuePool exhaustion, the follow-up to path 6).

All three worker-facing job endpoints are `async def` (stream must read the
request body incrementally; the others share the module idiom), so their
bodies run ON uvicorn's single event loop -- and they called
require_job_for_worker / complete_job / append_stream_delta / fail_job
(blocking SQLAlchemy work, including up to pool_timeout=30s waiting for a
QueuePool slot on a saturated pool, and debate_to_dict's 1.3-2.1s
serialization on a 91-node debate) directly. Any such block freezes the
ENTIRE coordinator, exactly like the poll endpoint fixed in
tests/test_workers_poll.py.

The contract pinned here is stronger than probing individual call seams: an
engine-level before_cursor_execute listener records, for EVERY SQL statement
issued while the request is in flight, whether an event loop runs in the
executing thread. No statement at all may execute on the loop -- that covers
the obvious orchestrator calls AND the easy-to-miss expired-attribute refresh
SELECTs after a commit (e.g. reading job.status to build the /fail response).
The auth/session dependencies are sync `def`s, which FastAPI already runs in
the threadpool, so a clean run records False for those too.
"""
from __future__ import annotations

import asyncio
from copy import deepcopy
from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy import event, select

from app.core.auth import hash_token
from app.core.config import DEFAULT_ROUTING
from app.core.db import get_engine
from app.main import app
from app.models.entities import Debate, Generation, Job, Node, Worker, now_utc
from app.services.routing import routing_engine


def _loop_is_running_here() -> bool:
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return False
    return True


def _claimed_argue_job(db, *, worker_token: str = "worker-token") -> tuple[Worker, Debate, Node, Job]:
    routing_engine.roles = deepcopy(DEFAULT_ROUTING)
    routing_engine.counters.clear()
    worker = Worker(
        name="offloop-worker",
        token_hash=hash_token(worker_token),
        capabilities=["mock-local"],
        last_seen=now_utc(),
        status="online",
    )
    debate = Debate(topic="Should cities ban cars?", status="generating", config={"max_depth": 1, "branching": 2})
    db.add_all([worker, debate])
    db.flush()
    root = Node(
        debate_id=debate.id,
        node_type="ROOT_CLAIM",
        depth=0,
        position=0,
        claim=debate.topic,
        status="complete",
        materialized_path="/0",
    )
    db.add(root)
    db.flush()
    debate.root_node_id = root.id
    child = Node(
        debate_id=debate.id,
        parent_id=root.id,
        node_type="PRO",
        depth=1,
        position=0,
        claim="Cleaner air.",
        status="generating",
        materialized_path="/0/0",
    )
    db.add(child)
    db.flush()
    job = Job(
        debate_id=debate.id,
        node_id=child.id,
        job_type="argue",
        required_role="proposer",
        required_model="mock-local",
        status="running",
        worker_id=worker.id,
        claimed_at=now_utc(),
        deadline=now_utc() + timedelta(seconds=60),
    )
    db.add(job)
    db.flush()
    worker.current_job_id = job.id
    db.commit()
    return worker, debate, child, job


class _CursorLoopProbe:
    """Records (ran_on_loop, statement) for every statement the engine runs
    while attached. Attach around exactly one TestClient request so the log is
    that request's SQL and nothing else."""

    def __init__(self) -> None:
        self.records: list[tuple[bool, str]] = []

    def __call__(self, conn, cursor, statement, parameters, context, executemany) -> None:
        self.records.append((_loop_is_running_here(), " ".join(statement.split())[:90]))

    def __enter__(self) -> "_CursorLoopProbe":
        # get_engine(), not the module's `engine`: that export is a _LazyEngine
        # proxy, and event.listen against the proxy attaches to nothing.
        event.listen(get_engine(), "before_cursor_execute", self)
        return self

    def __exit__(self, *exc_info) -> None:
        event.remove(get_engine(), "before_cursor_execute", self)

    def on_loop_statements(self) -> list[str]:
        return [statement for ran_on_loop, statement in self.records if ran_on_loop]


def _assert_no_sql_on_loop(probe: _CursorLoopProbe, endpoint: str) -> None:
    assert probe.records, f"{endpoint} never reached the database"
    offenders = probe.on_loop_statements()
    assert not offenders, (
        f"{endpoint} ran blocking DB work directly on the event loop: any pool "
        "wait or slow query freezes every other request on the coordinator "
        f"(statements on loop: {offenders})"
    )


def test_complete_blocking_db_work_runs_off_the_event_loop(db) -> None:
    worker, debate, child, job = _claimed_argue_job(db)
    headers = {"Authorization": "Bearer worker-token", "X-Worker-ID": worker.id}
    client = TestClient(app)

    with _CursorLoopProbe() as probe:
        response = client.post(
            f"/api/jobs/{job.id}/complete",
            headers=headers,
            json={"result": {"argument": "Cleaner air improves public health."}, "latency_ms": 5},
        )

    assert response.status_code == 200
    assert response.json()["id"] == debate.id
    _assert_no_sql_on_loop(probe, "/complete")
    db.expire_all()
    assert db.get(Job, job.id).status == "complete"
    generations = db.scalars(select(Generation).where(Generation.node_id == child.id)).all()
    assert [generation.argument for generation in generations] == ["Cleaner air improves public health."]


def test_stream_json_blocking_db_work_runs_off_the_event_loop(db) -> None:
    worker, _debate, _child, job = _claimed_argue_job(db)
    headers = {"Authorization": "Bearer worker-token", "X-Worker-ID": worker.id}
    client = TestClient(app)

    with _CursorLoopProbe() as probe:
        response = client.post(
            f"/api/jobs/{job.id}/stream",
            headers=headers,
            json={"delta": "first tokens"},
        )

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    _assert_no_sql_on_loop(probe, "/stream (json)")
    db.expire_all()
    assert db.get(Job, job.id).stream_buffer == "first tokens"


def test_stream_raw_body_blocking_db_work_runs_off_the_event_loop(db) -> None:
    """The non-JSON branch reads the body chunkwise via request.stream() --
    genuinely async, so it must stay ON the loop -- while each chunk's
    append_stream_delta (claim check + buffer write + commit) must not."""
    worker, _debate, _child, job = _claimed_argue_job(db)
    headers = {
        "Authorization": "Bearer worker-token",
        "X-Worker-ID": worker.id,
        "Content-Type": "text/plain",
    }
    client = TestClient(app)

    with _CursorLoopProbe() as probe:
        response = client.post(f"/api/jobs/{job.id}/stream", headers=headers, content=b"raw tokens")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    _assert_no_sql_on_loop(probe, "/stream (raw body)")
    db.expire_all()
    assert db.get(Job, job.id).stream_buffer == "raw tokens"


def test_fail_blocking_db_work_runs_off_the_event_loop(db) -> None:
    """The retryable-failure path, including the response derivation: fail_job
    commits (expiring the ORM instance), so the endpoint's `job.status` read
    triggers a refresh SELECT -- that read must happen off-loop too, which the
    cursor-level probe catches where a call-seam probe would not."""
    worker, _debate, child, job = _claimed_argue_job(db)
    headers = {"Authorization": "Bearer worker-token", "X-Worker-ID": worker.id}
    client = TestClient(app)

    with _CursorLoopProbe() as probe:
        response = client.post(
            f"/api/jobs/{job.id}/fail",
            headers=headers,
            json={"reason": "provider timed out", "retryable": True},
        )

    assert response.status_code == 200
    assert response.json() == {"status": "queued"}
    _assert_no_sql_on_loop(probe, "/fail")
    db.expire_all()
    refreshed = db.get(Job, job.id)
    assert refreshed.status == "pending"
    assert refreshed.worker_id is None
    assert db.get(Node, child.id).status == "pending"
    assert db.get(Worker, worker.id).current_job_id is None
