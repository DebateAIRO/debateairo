from __future__ import annotations

from app.models.entities import AnalyzerRun, Debate, DebateBranch, Node
from app.scoring.qbaf_debug import qbaf_debug_block
from app.scoring.reducer import reduce_assessments
from app.scoring.service import debate_scoring_payload
from test_node_scoring import base_assessment, base_claim


def _make_debate(db) -> Debate:
    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    db.add(debate)
    db.commit()
    return debate


def _make_node(db, debate, *, node_type, parent=None, position=0, depth=None, path=None) -> Node:
    resolved_depth = depth if depth is not None else (0 if parent is None else parent.depth + 1)
    resolved_path = path if path is not None else ("/" if parent is None else f"{parent.materialized_path}{position:04d}/")
    node = Node(
        debate=debate,
        parent=parent,
        node_type=node_type,
        depth=resolved_depth,
        position=position,
        claim=f"claim-{node_type}-{position}",
        status="complete",
        materialized_path=resolved_path,
    )
    db.add(node)
    db.commit()
    return node


def test_qbaf_debug_block_with_scored_and_unscored_nodes(db):
    debate = _make_debate(db)
    root = _make_node(db, debate, node_type="ROOT_CLAIM", parent=None)
    pro = _make_node(db, debate, node_type="PRO", parent=root, position=0)
    con = _make_node(db, debate, node_type="CON", parent=root, position=1)

    scoring_payload = {
        "items": [
            {"node_id": pro.id, "scores": {"strength": 0.8}},
            # con intentionally has no scoring item -> must default, not crash
        ]
    }

    block = qbaf_debug_block(db, debate, scoring_payload)

    assert block is not None
    assert "unavailable_reason" not in block
    assert block["semantics"] == "df-quad-v1"
    assert set(block["strengths"]) == {root.id, pro.id, con.id}
    assert block["tau_sources"][pro.id] == "judge_strength"
    assert block["tau_sources"][con.id] == "default"
    assert isinstance(block["fingerprint"], str) and block["fingerprint"]
    # never leak raw judge output
    assert "raw_output" not in block
    assert "raw" not in block


def test_qbaf_debug_block_excludes_stale_nodes(db):
    debate = _make_debate(db)
    root = _make_node(db, debate, node_type="ROOT_CLAIM", parent=None)
    stale = _make_node(db, debate, node_type="PRO", parent=root, position=0)
    stale.status = "stale"
    db.add(stale)
    db.commit()

    block = qbaf_debug_block(db, debate, {"items": []})

    assert block is not None
    assert "unavailable_reason" not in block
    assert set(block["strengths"]) == {root.id}


def test_qbaf_debug_block_excludes_failed_and_abandoned_nodes(db):
    # T2 (P0.5): the qbaf_debug.py:23 mirror of _debate_node_ids must apply
    # the same failed/abandoned exclusion, not just the stale one.
    debate = _make_debate(db)
    root = _make_node(db, debate, node_type="ROOT_CLAIM", parent=None)
    failed = _make_node(db, debate, node_type="PRO", parent=root, position=0)
    failed.status = "failed"
    abandoned = _make_node(db, debate, node_type="CON", parent=root, position=1)
    abandoned.path_status = "abandoned"
    db.add_all([failed, abandoned])
    db.commit()

    block = qbaf_debug_block(db, debate, {"items": []})

    assert block is not None
    assert "unavailable_reason" not in block
    assert set(block["strengths"]) == {root.id}


def test_qbaf_debug_block_returns_unavailable_reason_on_cycle(db, monkeypatch):
    debate = _make_debate(db)
    _make_node(db, debate, node_type="ROOT_CLAIM", parent=None)

    def _boom(*_args, **_kwargs):
        raise ValueError("simulated adapter failure")

    monkeypatch.setattr("app.scoring.qbaf_debug.debate_argument_graph", _boom)

    block = qbaf_debug_block(db, debate, {"items": []})

    assert block is not None
    assert "unavailable_reason" in block
    assert "simulated adapter failure" in block["unavailable_reason"]
    assert "strengths" not in block


def test_qbaf_debug_block_never_raises_on_malformed_scoring_payload(db):
    debate = _make_debate(db)
    _make_node(db, debate, node_type="ROOT_CLAIM", parent=None)

    block = qbaf_debug_block(db, debate, {"items": "not-a-list"})

    assert block is not None
    assert "unavailable_reason" not in block
    assert block["semantics"] == "df-quad-v1"


def _make_scored_debate(db) -> Debate:
    """A debate with a completed judge-sourced AnalyzerRun so
    debate_scoring_payload takes the full-success return path (not an
    _unavailable_payload branch). Mirrors
    test_scoring_service_returns_stored_real_scoring_outputs in
    test_node_scoring.py.
    """
    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    node = Node(
        id="node-1",
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves productivity.",
        status="complete",
        materialized_path="/",
    )
    db.add_all([debate, node])
    db.flush()
    branch = DebateBranch(debate_id=debate.id, status="active")
    db.add(branch)
    db.flush()
    scoring_item = reduce_assessments(base_claim(node_id="node-1"), base_assessment()).model_dump(mode="json")
    db.add(
        AnalyzerRun(
            debate_id=debate.id,
            branch_id=branch.id,
            analyzer_type="node_scoring",
            output={
                "status": "available",
                "items": [scoring_item],
                "producer": "stored-judge-output",
            },
            status="complete",
            provenance={"scoring_source": "judge_outputs"},
        )
    )
    db.commit()
    return debate


def test_qbaf_debug_absent_when_flag_off(db, monkeypatch):
    monkeypatch.delenv("DIALECTICAL_QBAF_DEBUG", raising=False)
    debate = _make_scored_debate(db)

    payload = debate_scoring_payload(db, debate)

    assert payload["status"] == "available"
    assert "qbaf_debug" not in payload


def test_qbaf_debug_present_when_flag_on(db, monkeypatch):
    monkeypatch.setenv("DIALECTICAL_QBAF_DEBUG", "1")
    debate = _make_scored_debate(db)

    payload = debate_scoring_payload(db, debate)

    assert payload["status"] == "available"
    assert "qbaf_debug" in payload
    block = payload["qbaf_debug"]
    assert block.get("semantics") == "df-quad-v1" or "unavailable_reason" in block
