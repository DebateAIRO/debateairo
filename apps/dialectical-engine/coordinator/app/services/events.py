from __future__ import annotations

import asyncio
import json
import threading
from collections import defaultdict, deque
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any


@dataclass
class Event:
    event: str
    data: dict[str, Any]

    def encode(self) -> str:
        return f"event: {self.event}\ndata: {json.dumps(self.data, default=str)}\n\n"


class EventBus:
    def __init__(self, queue_size: int = 200) -> None:
        self._queue_size = queue_size
        self._history: dict[str, deque[Event]] = defaultdict(lambda: deque(maxlen=queue_size))
        self._subscribers: dict[
            str,
            dict[asyncio.Queue[Event], asyncio.AbstractEventLoop],
        ] = defaultdict(dict)
        self._state_lock = threading.RLock()

    @staticmethod
    def _offer(queue: asyncio.Queue[Event], payload: Event) -> None:
        try:
            queue.put_nowait(payload)
        except asyncio.QueueFull:
            try:
                queue.get_nowait()
            except asyncio.QueueEmpty:
                pass
            try:
                queue.put_nowait(payload)
            except asyncio.QueueFull:
                pass

    def _publish(self, debate_id: str, event: str, data: dict[str, Any]) -> None:
        payload = Event(event=event, data=data)
        with self._state_lock:
            self._history[debate_id].append(payload)
            subscribers = tuple(self._subscribers.get(debate_id, {}).items())
        try:
            current_loop = asyncio.get_running_loop()
        except RuntimeError:
            current_loop = None
        for queue, subscriber_loop in subscribers:
            if subscriber_loop is current_loop:
                self._offer(queue, payload)
                continue
            if subscriber_loop.is_closed():
                continue
            try:
                subscriber_loop.call_soon_threadsafe(self._offer, queue, payload)
            except RuntimeError:
                continue

    async def publish(self, debate_id: str, event: str, data: dict[str, Any]) -> None:
        self._publish(debate_id, event, data)

    def publish_from_sync(self, debate_id: str, event: str, data: dict[str, Any]) -> None:
        """Publish safely from synchronous worker threads."""

        self._publish(debate_id, event, data)

    async def subscribe(self, debate_id: str, replay_history: bool = True) -> AsyncIterator[str]:
        queue: asyncio.Queue[Event] = asyncio.Queue(maxsize=self._queue_size)
        subscriber_loop = asyncio.get_running_loop()
        with self._state_lock:
            history = list(self._history.get(debate_id, ())) if replay_history else []
            self._subscribers[debate_id][queue] = subscriber_loop
        try:
            yield "event: connected\ndata: {}\n\n"
            for event in history:
                yield event.encode()
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=15)
                    yield event.encode()
                except asyncio.TimeoutError:
                    yield ": heartbeat\n\n"
        finally:
            with self._state_lock:
                self._subscribers[debate_id].pop(queue, None)


event_bus = EventBus()
