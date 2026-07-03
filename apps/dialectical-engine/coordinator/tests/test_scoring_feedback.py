from __future__ import annotations

from sqlalchemy import select
from fastapi.testclient import TestClient

from app.main import app
from app.models import entities
from app.models.entities import Debate, Job, Node, NodeScoringResult


USER_HEADERS = {"Authorization": "Bearer user_test_token"}


def test_node_feedback_vote_hashes_identity_and_upserts_current_vote(db) -> None:
    NodeFeedbackVote = getattr(entities, "NodeFeedbackVote", None)
    assert NodeFeedbackVote is not None

    debate = Debate(topic="Should public transit be free?", status="complete")
    node = Node(
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Free transit increases ridership.",
        status="complete",
        materialized_path="/",
    )
    db.add_all([debate, node])
    db.flush()
    scoring_result = NodeScoringResult(
        debate_id=debate.id,
        node_id=node.id,
        input_hash="input-hash",
        judge_role="judge",
        provider="codex",
        model="gpt-test",
        provider_metadata={},
        status="available",
        result={"items": []},
    )
    db.add(scoring_result)
    db.flush()

    raw_token = "user-secret-token"
    first_vote = NodeFeedbackVote.upsert(
        db,
        debate_id=debate.id,
        node_id=node.id,
        raw_user_token=raw_token,
        vote="up",
        scoring_result_id=scoring_result.id,
    )
    db.commit()

    db.expire_all()
    stored_vote = db.scalars(select(NodeFeedbackVote)).one()
    assert stored_vote.id == first_vote.id
    assert stored_vote.debate_id == debate.id
    assert stored_vote.node_id == node.id
    assert stored_vote.scoring_result_id == scoring_result.id
    assert stored_vote.vote == "up"
    assert stored_vote.user_identity_hash == NodeFeedbackVote.hash_user_identity(raw_token)
    assert stored_vote.user_identity_hash != raw_token
    assert raw_token not in str(stored_vote.__dict__)

    updated_vote = NodeFeedbackVote.upsert(
        db,
        debate_id=debate.id,
        node_id=node.id,
        raw_user_token=raw_token,
        vote="down",
    )
    db.commit()

    db.expire_all()
    votes = db.scalars(select(NodeFeedbackVote)).all()
    assert len(votes) == 1
    assert votes[0].id == updated_vote.id == first_vote.id
    assert votes[0].vote == "down"
    assert votes[0].scoring_result_id == scoring_result.id


def test_node_feedback_vote_keeps_one_vote_per_user_per_debate_node(db) -> None:
    NodeFeedbackVote = getattr(entities, "NodeFeedbackVote", None)
    assert NodeFeedbackVote is not None

    debate = Debate(topic="Should cities ban cars?", status="complete")
    node = Node(
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Car bans improve air quality.",
        status="complete",
        materialized_path="/",
    )
    db.add_all([debate, node])
    db.flush()

    NodeFeedbackVote.upsert(
        db,
        debate_id=debate.id,
        node_id=node.id,
        raw_user_token="first-user-token",
        vote="up",
    )
    NodeFeedbackVote.upsert(
        db,
        debate_id=debate.id,
        node_id=node.id,
        raw_user_token="second-user-token",
        vote="down",
    )
    db.commit()

    votes = db.scalars(select(NodeFeedbackVote).order_by(NodeFeedbackVote.vote)).all()
    assert [vote.vote for vote in votes] == ["down", "up"]
    assert len({vote.user_identity_hash for vote in votes}) == 2


def test_scoring_feedback_api_accepts_up_down_and_change_vote_without_raw_token_or_rescoring(db) -> None:
    NodeFeedbackVote = getattr(entities, "NodeFeedbackVote", None)
    assert NodeFeedbackVote is not None
    debate = Debate(topic="Should public transit be free?", status="complete")
    node = Node(
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Free transit increases ridership.",
        status="complete",
        materialized_path="/",
    )
    db.add_all([debate, node])
    db.commit()

    client = TestClient(app)
    up_response = client.post(
        f"/api/debates/{debate.id}/scoring/nodes/{node.id}/feedback",
        headers=USER_HEADERS,
        json={"vote": "up"},
    )
    down_response = client.post(
        f"/api/debates/{debate.id}/scoring/nodes/{node.id}/feedback",
        headers=USER_HEADERS,
        json={"vote": "down"},
    )

    assert up_response.status_code == 200
    assert up_response.json() == {
        "debate_id": debate.id,
        "node_id": node.id,
        "vote": "up",
        "current_user_vote": "up",
        "feedback_summary": {"node_id": node.id, "up": 1, "down": 0},
    }
    assert down_response.status_code == 200
    assert down_response.json() == {
        "debate_id": debate.id,
        "node_id": node.id,
        "vote": "down",
        "current_user_vote": "down",
        "feedback_summary": {"node_id": node.id, "up": 0, "down": 1},
    }
    votes = db.scalars(select(NodeFeedbackVote)).all()
    assert len(votes) == 1
    assert votes[0].vote == "down"
    assert votes[0].user_identity_hash == NodeFeedbackVote.hash_user_identity("user_test_token")
    assert "user_test_token" not in str(votes[0].__dict__)
    assert db.scalars(select(Job).where(Job.debate_id == debate.id)).all() == []


def test_scoring_feedback_api_rejects_stale_and_missing_nodes(db) -> None:
    debate = Debate(topic="Should cities ban cars?", status="complete")
    stale_node = Node(
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Car bans improve air quality.",
        status="stale",
        materialized_path="/",
    )
    db.add_all([debate, stale_node])
    db.commit()

    client = TestClient(app)
    stale_response = client.post(
        f"/api/debates/{debate.id}/scoring/nodes/{stale_node.id}/feedback",
        headers=USER_HEADERS,
        json={"vote": "up"},
    )
    missing_response = client.post(
        f"/api/debates/{debate.id}/scoring/nodes/not-a-node/feedback",
        headers=USER_HEADERS,
        json={"vote": "down"},
    )

    assert stale_response.status_code == 404
    assert stale_response.json()["detail"] == "Debate node not found"
    assert missing_response.status_code == 404
    assert missing_response.json()["detail"] == "Debate node not found"


def test_scoring_payload_includes_feedback_summary_and_authenticated_current_vote(db) -> None:
    debate = Debate(topic="Should public transit be free?", status="complete")
    node = Node(
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Free transit increases ridership.",
        status="complete",
        materialized_path="/",
    )
    db.add_all([debate, node])
    db.commit()

    client = TestClient(app)
    client.post(
        f"/api/debates/{debate.id}/scoring/nodes/{node.id}/feedback",
        headers=USER_HEADERS,
        json={"vote": "up"},
    )
    public_response = client.get(f"/api/debates/{debate.id}/scoring")
    authenticated_response = client.get(f"/api/debates/{debate.id}/scoring", headers=USER_HEADERS)

    assert public_response.status_code == 200
    assert public_response.json()["feedback_summary"] == [{"node_id": node.id, "up": 1, "down": 0}]
    assert "current_user_votes" not in public_response.json()
    assert authenticated_response.status_code == 200
    assert authenticated_response.json()["feedback_summary"] == [{"node_id": node.id, "up": 1, "down": 0}]
    assert authenticated_response.json()["current_user_votes"] == [{"node_id": node.id, "vote": "up"}]
