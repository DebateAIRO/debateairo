from __future__ import annotations

import hashlib
import json

from fastapi.testclient import TestClient

from app.main import app
from app.models.entities import Debate, Generation, JudgeOutputArtifact, Node, NodeScoringResult, Worker, now_utc
from app.scoring.cache import node_scoring_input_hash
from app.scoring.judge_registry import PRIMARY_NODE_SCORING_JUDGE
from app.scoring.normalizer import normalize_claim
from app.scoring.reducer import reduce_assessments
from app.scoring.service import (
    _hydrate_node_scoring_item_from_judge_artifact,
    scoring_result_payload,
)

from test_node_scoring import (
    _assert_public_payload_has_no_private_judge_output,
    base_assessment,
    explicit_depth_pressure_payload,
)


def _assert_same_on_common_keys(left: dict, right: dict) -> None:
    """Assert ``left`` and ``right`` agree on every key present in both.

    Recurses into nested dicts. This tolerates the HTTP response model
    serializing with e.g. ``exclude_none``/``exclude_defaults`` (so a raw
    stored fixture's ``claim.scope`` sub-keys or ``debug.judge_outputs: None``
    may be absent from the served JSON) without masking a real mismatch on
    any key that *is* present on both sides.
    """
    for key in left.keys() & right.keys():
        left_value, right_value = left[key], right[key]
        if isinstance(left_value, dict) and isinstance(right_value, dict):
            _assert_same_on_common_keys(left_value, right_value)
        else:
            assert left_value == right_value, f"{key!r}: {left_value!r} != {right_value!r}"


def _seed_debate_with_node(db, *, node_id: str = "node-hydration-guard"):
    debate = Debate(topic="Should companies adopt remote work?", status="complete", config={})
    worker = Worker(id="worker-hydration-guard", name="Worker HG", token_hash="hash", capabilities=["debate"])
    node = Node(
        id=node_id,
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves retention.",
        status="complete",
        materialized_path="/",
    )
    generation = Generation(
        id=f"generation-{node_id}",
        node=node,
        model_id="model-hydration-guard",
        role="pro",
        argument="Employees are less likely to leave when commutes are removed.",
        worker_id=worker.id,
    )
    node.active_generation_id = generation.id
    db.add_all([debate, worker, node, generation])
    db.flush()
    debate.root_node_id = node.id
    input_hash = node_scoring_input_hash(
        claim=normalize_claim(node_id=node.id, raw_text=node.claim),
        argument_text=generation.argument,
        # `node` is given no PRO/CON children here, so this must match
        # app.scoring.service._node_children_for_judge's real result for it.
        debate_question=debate.topic,
        children=[],
    )
    return debate, node, input_hash


def _add_artifact(
    db,
    *,
    debate: Debate,
    node: Node,
    input_hash: str,
    raw_output: str,
    assessment: dict | None,
    contract_hash: str | None,
    judge_role: str = "judge",
    parse_status: str = "available",
) -> JudgeOutputArtifact:
    artifact = JudgeOutputArtifact(
        debate_id=debate.id,
        node_id=node.id,
        input_hash=input_hash,
        judge_role=judge_role,
        provider="codex",
        model="codex-test-model",
        contract_hash=contract_hash,
        raw_output=raw_output,
        raw_output_sha256=hashlib.sha256(raw_output.encode("utf-8")).hexdigest(),
        parse_status=parse_status,
        assessment=assessment,
        checked_at=now_utc(),
    )
    db.add(artifact)
    db.flush()
    return artifact


def stored_result_item_fixture(node_id: str) -> dict:
    return explicit_depth_pressure_payload(node_id=node_id).model_dump(mode="json")


def test_artifact_with_matching_contract_hydrates(db) -> None:
    debate, node, input_hash = _seed_debate_with_node(db)
    raw_output = json.dumps(base_assessment(node_id=node.id).model_dump(mode="json"))
    _add_artifact(
        db,
        debate=debate,
        node=node,
        input_hash=input_hash,
        raw_output=raw_output,
        assessment=base_assessment(node_id=node.id).model_dump(mode="json"),
        contract_hash=PRIMARY_NODE_SCORING_JUDGE.contract_hash,
    )
    db.commit()

    item, metadata, source = _hydrate_node_scoring_item_from_judge_artifact(db, debate, node.id)

    assert item is not None
    assert metadata is not None
    assert item["node_id"] == node.id


def test_artifact_with_null_contract_is_not_reduced_through_current_reducer(db) -> None:
    debate, node, input_hash = _seed_debate_with_node(db, node_id="node-legacy-null-contract")
    raw_output = json.dumps(base_assessment(node_id=node.id).model_dump(mode="json"))
    _add_artifact(
        db,
        debate=debate,
        node=node,
        input_hash=input_hash,
        raw_output=raw_output,
        assessment=base_assessment(node_id=node.id).model_dump(mode="json"),
        contract_hash=None,
    )
    db.commit()

    item, metadata, source = _hydrate_node_scoring_item_from_judge_artifact(db, debate, node.id)

    assert item is None
    assert metadata is None


def test_artifact_with_mismatched_contract_falls_back_to_stored_public_result(db) -> None:
    debate, node, input_hash = _seed_debate_with_node(db, node_id="node-legacy-mismatched-contract")
    raw_output = json.dumps(base_assessment(node_id=node.id).model_dump(mode="json"))
    _add_artifact(
        db,
        debate=debate,
        node=node,
        input_hash=input_hash,
        raw_output=raw_output,
        assessment=base_assessment(node_id=node.id).model_dump(mode="json"),
        contract_hash="stale-contract-hash-from-a-retired-judge-version",
    )
    stored_item = stored_result_item_fixture(node.id)
    stored_payload = scoring_result_payload(
        debate_id=debate.id,
        node_ids=[node.id],
        items=[stored_item],
        errors=[],
        model_metadata={
            "provider": "codex",
            "model": "codex-test-model",
            "checked_at": "2026-06-18T10:15:30+00:00",
            "status": "available",
        },
    )
    db.add(
        NodeScoringResult(
            debate_id=debate.id,
            node_id=node.id,
            input_hash=input_hash,
            judge_role="judge",
            provider="codex",
            model="codex-test-model",
            status="available",
            result=stored_payload,
        )
    )
    db.commit()

    item, metadata, source = _hydrate_node_scoring_item_from_judge_artifact(db, debate, node.id)

    assert item is not None
    assert item == stored_item
    assert metadata is not None


def test_historical_fallback_picks_matching_node_item_from_multi_item_payload(db) -> None:
    debate, node, input_hash = _seed_debate_with_node(db, node_id="node-legacy-multi-item-payload")
    raw_output = json.dumps(base_assessment(node_id=node.id).model_dump(mode="json"))
    _add_artifact(
        db,
        debate=debate,
        node=node,
        input_hash=input_hash,
        raw_output=raw_output,
        assessment=base_assessment(node_id=node.id).model_dump(mode="json"),
        contract_hash="stale-contract-hash-from-a-retired-judge-version",
    )
    decoy_item = stored_result_item_fixture("other-node")
    real_item = stored_result_item_fixture(node.id)
    stored_payload = scoring_result_payload(
        debate_id=debate.id,
        node_ids=["other-node", node.id],
        items=[decoy_item, real_item],
        errors=[],
        model_metadata={
            "provider": "codex",
            "model": "codex-test-model",
            "checked_at": "2026-06-18T10:15:30+00:00",
            "status": "available",
        },
    )
    db.add(
        NodeScoringResult(
            debate_id=debate.id,
            node_id=node.id,
            input_hash=input_hash,
            judge_role="judge",
            provider="codex",
            model="codex-test-model",
            status="available",
            result=stored_payload,
        )
    )
    db.commit()

    item, metadata, source = _hydrate_node_scoring_item_from_judge_artifact(db, debate, node.id)

    assert item is not None
    assert item == real_item
    assert item["node_id"] == node.id
    assert item != decoy_item
    assert metadata is not None


def test_scoring_api_serves_historical_result_for_mismatched_contract_artifact(db) -> None:
    debate, node, input_hash = _seed_debate_with_node(db, node_id="node-rj05-e2e-mismatch")
    raw_output = json.dumps(base_assessment(node_id=node.id).model_dump(mode="json"))
    _add_artifact(
        db,
        debate=debate,
        node=node,
        input_hash=input_hash,
        raw_output=raw_output,
        assessment=base_assessment(node_id=node.id).model_dump(mode="json"),
        contract_hash="stale-contract-hash",
    )
    decoy_item = stored_result_item_fixture("other-node")
    real_item = stored_result_item_fixture(node.id)
    stored_payload = scoring_result_payload(
        debate_id=debate.id,
        node_ids=["other-node", node.id],
        items=[decoy_item, real_item],
        errors=[],
        model_metadata={
            "provider": "codex",
            "model": "codex-test-model",
            "checked_at": "2026-06-18T10:15:30+00:00",
            "status": "available",
        },
    )
    db.add(
        NodeScoringResult(
            debate_id=debate.id,
            node_id=node.id,
            input_hash=input_hash,
            judge_role="judge",
            provider="codex",
            model="codex-test-model",
            status="available",
            result=stored_payload,
        )
    )
    db.commit()
    debate_id = debate.id
    node_id = node.id
    db.close()

    response = TestClient(app).get(f"/api/debates/{debate_id}/scoring")

    assert response.status_code == 200
    body = response.json()
    assert body["debate_id"] == debate_id
    assert body["status"] == "available"
    assert body["node_ids"] == [node_id]
    assert [item["node_id"] for item in body["items"]] == [node_id]
    served_item = body["items"][0]
    # The HTTP response model may serialize with exclude_none/exclude_defaults,
    # so some keys present on the raw stored fixture (e.g. `claim.scope`
    # sub-keys, `debug.judge_outputs`) can be absent from the served JSON.
    # Compare on whatever keys both sides share instead of requiring
    # byte-for-byte dict equality with the stored fixture.
    _assert_same_on_common_keys(served_item, real_item)
    assert served_item["node_id"] == real_item["node_id"] != decoy_item["node_id"]
    assert served_item["claim"]["node_id"] == real_item["claim"]["node_id"] != decoy_item["claim"]["node_id"]
    assert body["producer"] == "historical-scoring-cache"
    assert body["cache"] == {"hit": False}
    assert "active_scoring_job_id" not in body
    assert "active_scoring_job_status" not in body
    _assert_public_payload_has_no_private_judge_output(body, "stale-contract-hash")


def test_malformed_legacy_artifact_stays_private(db) -> None:
    debate, node, input_hash = _seed_debate_with_node(db, node_id="node-malformed-legacy")
    private_marker = "HYDRATION-GUARD-PRIVATE-RAW-MARKER"
    raw_output = f"not json; {private_marker}"
    _add_artifact(
        db,
        debate=debate,
        node=node,
        input_hash=input_hash,
        raw_output=raw_output,
        assessment=None,
        contract_hash=None,
        parse_status="unavailable",
    )
    db.commit()

    item, metadata, source = _hydrate_node_scoring_item_from_judge_artifact(db, debate, node.id)

    assert item is None
    assert metadata is None
    serialized = json.dumps({"item": item, "metadata": metadata})
    assert private_marker not in serialized
    assert "raw_output" not in serialized
