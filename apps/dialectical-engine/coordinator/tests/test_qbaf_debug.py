from __future__ import annotations

from app.models.entities import AnalyzerRun, Debate, DebateBranch, Node, next_analyzer_run_seq
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


def test_qbaf_debug_block_excludes_failed_but_keeps_abandoned_complete_nodes(db):
    # T2 (P0.5), narrowed per controller decision after Task 2 self-review
    # (see task-2-report.md): the qbaf_debug.py:23 mirror of
    # _debate_node_ids excludes status=="failed" only. An abandoned-but-
    # status=="complete" node must stay in the graph -- excluding it would
    # make the exploration-policy reopen lifecycle unreachable for it.
    debate = _make_debate(db)
    root = _make_node(db, debate, node_type="ROOT_CLAIM", parent=None)
    failed = _make_node(db, debate, node_type="PRO", parent=root, position=0)
    failed.status = "failed"
    abandoned_but_complete = _make_node(db, debate, node_type="CON", parent=root, position=1)
    abandoned_but_complete.path_status = "abandoned"
    db.add_all([failed, abandoned_but_complete])
    db.commit()

    block = qbaf_debug_block(db, debate, {"items": []})

    assert block is not None
    assert "unavailable_reason" not in block
    assert set(block["strengths"]) == {root.id, abandoned_but_complete.id}


def test_qbaf_debug_block_reflects_verified_evidence_edges(db):
    # Task 12 (P1.3), brief point 5: qbaf_debug.py's output must reflect the
    # new evidence edges, exactly like the real protocol_analysis path.
    debate = _make_debate(db)
    root = _make_node(db, debate, node_type="ROOT_CLAIM", parent=None)
    pro = _make_node(db, debate, node_type="PRO", parent=root, position=0)
    evidence = _make_node(db, debate, node_type="EVIDENCE", parent=pro, position=0)
    branch = DebateBranch(debate_id=debate.id, status="active")
    db.add(branch)
    db.flush()
    run = AnalyzerRun(
        debate_id=debate.id,
        branch_id=branch.id,
        analyzer_type="evidence_verification",
        output={
            "evidenceNodeId": evidence.id,
            "claimNodeId": pro.id,
            "status": "supported",
            "reason": None,
            "evaluatorVersion": "evidence-verification-v1",
            "baseScore": 0.88,
        },
        status="complete",
        provenance={"judge_role": "verifier"},
    )
    next_analyzer_run_seq(db, run)
    db.commit()

    block = qbaf_debug_block(db, debate, {"items": []})

    assert block is not None
    assert "unavailable_reason" not in block
    assert (evidence.id, pro.id) in block["supports"]
    assert block["tau_sources"][evidence.id] == "verifier_evidence"
    assert block["strengths"][evidence.id] == 0.88


def test_qbaf_debug_block_ignores_evidence_verification_lookup_failure(db, monkeypatch):
    # The evidence-verification enrichment is best-effort: a failure fetching
    # it must degrade to "no evidence edges", never take down the whole
    # debug block (unlike a genuine qbaf computation failure, which DOES
    # report unavailable_reason -- see the cycle test below).
    debate = _make_debate(db)
    root = _make_node(db, debate, node_type="ROOT_CLAIM", parent=None)
    pro = _make_node(db, debate, node_type="PRO", parent=root, position=0)
    _make_node(db, debate, node_type="EVIDENCE", parent=pro, position=0)

    def _boom(*_args, **_kwargs):
        raise RuntimeError("simulated verdict lookup failure")

    # qbaf_debug.py imports this LOCALLY (function-scoped, to avoid a
    # circular import -- see its docstring), so patch it at its source
    # module rather than as a qbaf_debug module-level attribute.
    monkeypatch.setattr(
        "app.evidence.verification_evaluator.latest_evidence_verdicts_for_debate", _boom
    )

    block = qbaf_debug_block(db, debate, {"items": []})

    assert block is not None
    assert "unavailable_reason" not in block
    # PRO still supports root (ordinary, non-evidence edge, unaffected by
    # the simulated lookup failure); the EVIDENCE node gets none -- the
    # failure degraded cleanly to "no evidence edges" rather than crashing.
    assert block["supports"] == [(pro.id, root.id)]


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
