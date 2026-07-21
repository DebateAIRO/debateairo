from __future__ import annotations

from types import SimpleNamespace

from app.api.nodes import generations
from app.models.entities import Debate, Generation, Node, Worker, now_utc


class _ScalarResult:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class _FakeDb:
    def __init__(self, node, debate, generations_rows, workers):
        self._node = node
        self._debate = debate
        self._generations = generations_rows
        self._workers = workers
        self.worker_gets = 0
        self.scalars_calls = 0

    def get(self, model, key):
        if model is Node and key == self._node.id:
            return self._node
        if model is Debate and key == self._debate.id:
            return self._debate
        if model is Worker:
            self.worker_gets += 1
            return self._workers.get(key)
        return None

    def scalars(self, _statement):
        self.scalars_calls += 1
        if self.scalars_calls == 1:
            return _ScalarResult(self._generations)
        return _ScalarResult(list(self._workers.values()))


def test_generations_batches_worker_name_lookup_without_per_row_gets() -> None:
    debate = Debate(id="debate-1", topic="Topic", status="generating", config={})
    node = Node(
        id="node-1",
        debate_id=debate.id,
        node_type="PRO",
        depth=1,
        position=0,
        claim="Claim",
        status="complete",
        materialized_path="0/0",
    )
    worker_a = Worker(
        id="worker-a",
        name="mac-mini",
        token_hash="hash",
        capabilities=[],
        last_seen=now_utc(),
    )
    worker_b = Worker(
        id="worker-b",
        name="adesso-mbp",
        token_hash="hash",
        capabilities=[],
        last_seen=now_utc(),
    )
    generation_rows = [
        Generation(
            id="generation-a",
            node_id=node.id,
            model_id="mock-local",
            role="proposer",
            argument="A",
            worker_id=worker_a.id,
            created_at=now_utc(),
        ),
        Generation(
            id="generation-b",
            node_id=node.id,
            model_id="gpt-5.6sol-medium",
            role="skeptic",
            argument="B",
            worker_id=worker_b.id,
            created_at=now_utc(),
        ),
    ]
    db = _FakeDb(node, debate, generation_rows, {worker_a.id: worker_a, worker_b.id: worker_b})

    payload = generations(node.id, db, SimpleNamespace())

    assert db.worker_gets == 0
    assert [item["worker_name"] for item in payload["items"]] == ["mac-mini", "adesso-mbp"]
