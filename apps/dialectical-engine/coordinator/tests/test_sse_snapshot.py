"""W5b: SSE snapshot-on-subscribe.

The event bus is in-memory; a coordinator restart leaves reconnecting
subscribers blind until a poll. Every subscribe now emits an additive
`snapshot` event (right after `connected`, before history/live events),
derived from the DB, so clients can trigger their existing refresh path.
"""
from __future__ import annotations

import json

import pytest

from app.api.debates import debate_events
from app.models.entities import Debate, Node, now_utc
from app.services.events import event_bus
from app.services.serialization import iso


def _debate_with_root(db, *, status: str = "generating") -> tuple[Debate, Node]:
    debate = Debate(
        topic="Should cities ban cars?",
        status=status,
        config={"max_depth": 1},
        completed_at=now_utc() if status == "complete" else None,
    )
    db.add(debate)
    db.flush()
    root = Node(
        debate_id=debate.id,
        node_type="ROOT_CLAIM",
        depth=0,
        position=0,
        claim="Should cities ban cars?",
        status="pending",
        materialized_path="/0",
    )
    db.add(root)
    db.flush()
    debate.root_node_id = root.id
    db.commit()
    return debate, root


def _parse_sse(chunk: str) -> tuple[str, dict]:
    lines = chunk.strip().splitlines()
    assert lines[0].startswith("event: ") and lines[1].startswith("data: ")
    return lines[0].removeprefix("event: "), json.loads(lines[1].removeprefix("data: "))


@pytest.mark.asyncio
async def test_subscribe_after_restart_emits_db_derived_snapshot(db) -> None:
    """Fresh event bus (= post-restart: no history) still delivers a snapshot."""
    debate, _ = _debate_with_root(db)
    response = await debate_events(debate.id, db, replay_history=True)
    stream = response.body_iterator
    try:
        connected = await anext(stream)
        assert connected == "event: connected\ndata: {}\n\n"
        event_name, payload = _parse_sse(await anext(stream))
        assert event_name == "snapshot"
        assert payload == {
            "debate_id": debate.id,
            "status": "generating",
            "node_count": 1,
            "synthesis_id": None,
            "completed_at": None,
        }
    finally:
        await stream.aclose()


@pytest.mark.asyncio
async def test_snapshot_precedes_replayed_history(db) -> None:
    debate, root = _debate_with_root(db)
    await event_bus.publish(debate.id, "node_started", {"node_id": root.id})

    response = await debate_events(debate.id, db, replay_history=True)
    stream = response.body_iterator
    try:
        assert (await anext(stream)).startswith("event: connected\n")
        snapshot_chunk = await anext(stream)
        assert snapshot_chunk.startswith("event: snapshot\n"), (
            "snapshot must arrive before any replayed history"
        )
        history_chunk = await anext(stream)
        assert history_chunk.startswith("event: node_started\n")
    finally:
        await stream.aclose()


@pytest.mark.asyncio
async def test_snapshot_reflects_completed_debate_state(db) -> None:
    debate, _ = _debate_with_root(db, status="complete")

    response = await debate_events(debate.id, db, replay_history=False)
    stream = response.body_iterator
    try:
        await anext(stream)  # connected
        event_name, payload = _parse_sse(await anext(stream))
        assert event_name == "snapshot"
        assert payload["status"] == "complete"
        assert payload["completed_at"] == iso(debate.completed_at)
    finally:
        await stream.aclose()
