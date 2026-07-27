"""POST /api/workers/{id}/poll: the long-poll's blocking DB work must run off
the event loop (2026-07-26 QueuePool exhaustion, path 6).

`poll` is an `async def` endpoint, so its body runs ON uvicorn's single event
loop -- and it called claim_pending_job / commit_write / render_job_payload
(blocking SQLAlchemy work, including up to pool_timeout=30s waiting for a
QueuePool slot when the pool is saturated) directly. Every such block froze
the ENTIRE coordinator: no other request progressed, so every in-flight
request kept holding its own pool connection longer, which is exactly how a
transient hold amplified into all 15 slots pinned.

The contract pinned here: every blocking DB call the poll loop makes executes
on a worker thread (no running event loop in its thread), while the endpoint
itself stays async so the 1s poll cadence never occupies a threadpool thread
between iterations.
"""
from __future__ import annotations

import asyncio

from fastapi.testclient import TestClient

import app.api.workers as workers_api
from app.core.auth import hash_token
from app.main import app
from app.models.entities import Worker, now_utc
from copy import deepcopy

from app.core.config import DEFAULT_ROUTING
from app.services.orchestrator import create_debate
from app.services.routing import routing_engine


def _worker(db, *, name: str = "poll-worker", capabilities: list[str] | None = None) -> Worker:
    worker = Worker(
        name=name,
        token_hash=hash_token(f"{name}-token"),
        capabilities=capabilities or ["mock-local"],
        last_seen=now_utc(),
        status="online",
    )
    db.add(worker)
    db.commit()
    return worker


def _loop_is_running_here() -> bool:
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return False
    return True


def test_poll_blocking_db_work_runs_off_the_event_loop(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_WORKER_POLL_SECONDS", "1")
    worker = _worker(db)
    worker_id = worker.id
    db.rollback()

    on_loop: dict[str, list[bool]] = {"claim": [], "final_commit": []}

    real_claim = workers_api.claim_pending_job
    real_commit = workers_api.commit_write

    def probing_claim(session, w):
        on_loop["claim"].append(_loop_is_running_here())
        return real_claim(session, w)

    def probing_commit(session):
        on_loop["final_commit"].append(_loop_is_running_here())
        return real_commit(session)

    monkeypatch.setattr(workers_api, "claim_pending_job", probing_claim)
    monkeypatch.setattr(workers_api, "commit_write", probing_commit)

    client = TestClient(app)
    response = client.post(
        f"/api/workers/{worker_id}/poll",
        headers={"Authorization": "Bearer poll-worker-token", "X-Worker-ID": worker_id},
    )

    assert response.status_code == 200
    assert response.json() == {"job": None}
    assert on_loop["claim"] and on_loop["final_commit"], "poll never reached its DB calls"
    assert not any(on_loop["claim"]) and not any(on_loop["final_commit"]), (
        "poll ran blocking DB work directly on the event loop: any pool wait "
        "or slow query freezes every other request on the coordinator "
        f"(on_loop={on_loop})"
    )


def test_poll_returns_pending_job_off_the_event_loop(db, monkeypatch) -> None:
    """The job-found path: the claim hands back a payload rendered by
    render_job_payload (blocking DB reads, debate_to_dict for synthesize jobs)
    -- that render must run off the loop too, and the endpoint must still
    return the claimed job payload."""
    routing_engine.roles = deepcopy(DEFAULT_ROUTING)
    routing_engine.counters.clear()
    monkeypatch.setenv("DIALECTICAL_WORKER_POLL_SECONDS", "1")
    worker = _worker(db, name="poll-claimer")
    worker_id = worker.id
    create_debate(db, "Should cities ban cars?", {"max_depth": 1, "branching": 2})
    db.rollback()

    render_on_loop: list[bool] = []
    real_render = workers_api.render_job_payload

    def probing_render(session, job):
        render_on_loop.append(_loop_is_running_here())
        return real_render(session, job)

    monkeypatch.setattr(workers_api, "render_job_payload", probing_render)

    client = TestClient(app)
    response = client.post(
        f"/api/workers/{worker_id}/poll",
        headers={"Authorization": "Bearer poll-claimer-token", "X-Worker-ID": worker_id},
    )

    assert response.status_code == 200
    payload = response.json()["job"]
    assert payload is not None and payload["job_type"] == "decompose"
    assert payload["prompt"]["system"]
    assert render_on_loop == [False], (
        "render_job_payload ran on the event loop (it can serialize a whole "
        f"debate tree for synthesize jobs): on_loop={render_on_loop}"
    )
