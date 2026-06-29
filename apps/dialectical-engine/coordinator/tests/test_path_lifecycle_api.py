from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import _public_hits, app
from app.models.entities import Debate, Node


def test_abandoned_path_remains_queryable_with_stopping_reason(db) -> None:
    _public_hits.clear()
    debate = Debate(topic="Should cities ban cars?", status="complete", config={"max_depth": 2})
    db.add(debate)
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
    abandoned = Node(
        debate_id=debate.id,
        parent_id=root.id,
        node_type="PRO",
        depth=1,
        position=0,
        claim="Cleaner air benefits are too small under this policy design.",
        status="complete",
        path_status="abandoned",
        stopping_status="abandoned",
        stopping_reason="low-strength low-impact path is resolved enough to pause",
        materialized_path="/0/0",
    )
    db.add(abandoned)
    db.flush()
    debate.root_node_id = root.id
    db.commit()

    response = TestClient(app).get(f"/api/debates/{debate.id}")

    assert response.status_code == 200
    child = response.json()["tree"]["children"][0]
    assert child["id"] == abandoned.id
    assert child["path_status"] == "abandoned"
    assert child["stopping_status"] == "abandoned"
    assert child["stopping_reason"] == "low-strength low-impact path is resolved enough to pause"
