from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import event

from app.core.auth import hash_token
from app.core.db import get_engine
from app.exploration.decision_repository import (
    LIFECYCLE_DECISION_SCHEMA_VERSION,
    LifecycleDecisionSnapshot,
    persist_lifecycle_decision,
)
from app.models.entities import AnalyzerRun, Debate, DebateBranch, Generation, Job, Node, Synthesis, Worker, now_utc
from app.scoring.verdict import verdict_summary
from app.services.serialization import debate_to_dict, iso, synthesis_to_dict


def test_iso_serializes_naive_datetimes_as_utc() -> None:
    assert iso(now_utc().replace(tzinfo=None)).endswith("+00:00")


def add_worker(db) -> Worker:
    worker = Worker(
        name="mac-mini",
        token_hash=hash_token("worker-token"),
        capabilities=["mock-local"],
        last_seen=now_utc(),
        status="online",
    )
    db.add(worker)
    db.flush()
    return worker


def test_debate_detail_includes_active_node_stream_snapshot(db) -> None:
    worker = add_worker(db)
    debate = Debate(topic="Should cities ban cars?", status="generating", config={"max_depth": 1})
    db.add(debate)
    db.flush()
    root = Node(
        debate_id=debate.id,
        parent_id=None,
        node_type="ROOT_CLAIM",
        depth=0,
        position=0,
        claim=debate.topic,
        status="complete",
        materialized_path="0",
    )
    db.add(root)
    db.flush()
    child = Node(
        debate_id=debate.id,
        parent_id=root.id,
        node_type="PRO",
        depth=1,
        position=0,
        claim="Fewer cars would reduce street danger.",
        status="pending",
        materialized_path="0/0",
    )
    db.add(child)
    db.flush()
    debate.root_node_id = root.id
    job = Job(
        debate_id=debate.id,
        node_id=child.id,
        job_type="argue",
        required_role="proposer",
        required_model="mock-local",
        status="running",
        worker_id=worker.id,
        claimed_at=now_utc(),
        stream_buffer="A partial streamed argument.",
    )
    db.add(job)
    db.commit()

    visible = debate_to_dict(db, db.get(Debate, debate.id))
    streamed = visible["tree"]["children"][0]

    assert streamed["argument_claim"] == {
        "id": child.id,
        "debate_id": debate.id,
        "parent_id": root.id,
        "node_type": "PRO",
        "depth": 1,
        "position": 0,
        "text": "Fewer cars would reduce street danger.",
        "status": "generating",
        "materialized_path": "0/0",
        "active_generation_id": child.active_generation_id,
    }
    assert streamed["claim"] == streamed["argument_claim"]["text"]
    assert streamed["status"] == "generating"
    assert streamed["active_generation_id"] == child.active_generation_id
    assert streamed["active_generation"] == {
        "id": f"stream:{job.id}",
        "job_id": job.id,
        "model_id": "mock-local",
        "role": "proposer",
        "argument": "A partial streamed argument.",
        "worker_id": worker.id,
        "worker_name": "mac-mini",
        "created_at": iso(job.claimed_at),
        "is_streaming": True,
    }
    assert visible["models"] == ["mock-local"]
    assert visible["workers"] == ["mac-mini"]


def test_debate_detail_includes_stale_abandoned_descendant(db) -> None:
    debate = Debate(topic="Should cities ban cars?", status="complete", config={"max_depth": 2})
    db.add(debate)
    db.flush()
    root = Node(
        debate_id=debate.id,
        parent_id=None,
        node_type="ROOT_CLAIM",
        depth=0,
        position=0,
        claim=debate.topic,
        status="complete",
        materialized_path="0",
    )
    db.add(root)
    db.flush()
    abandoned = Node(
        debate_id=debate.id,
        parent_id=root.id,
        node_type="CON",
        depth=1,
        position=0,
        claim="The downtown policy path was paused after weakening evidence.",
        status="stale",
        path_status="abandoned",
        stopping_status="abandoned",
        stopping_reason="low-strength path is inactive but visible",
        materialized_path="0/0",
    )
    db.add(abandoned)
    db.flush()
    debate.root_node_id = root.id
    db.commit()

    visible = debate_to_dict(db, db.get(Debate, debate.id))

    assert visible["node_count"] == 2
    child = visible["tree"]["children"][0]
    assert child["id"] == abandoned.id
    assert child["status"] == "stale"
    assert child["path_status"] == "abandoned"
    assert child["stopping_status"] == "abandoned"
    assert child["stopping_reason"] == "low-strength path is inactive but visible"


def test_debate_detail_includes_active_synthesis_stream_snapshot(db) -> None:
    worker = add_worker(db)
    debate = Debate(topic="Should schools ban phones?", status="generating", config={"max_depth": 1})
    db.add(debate)
    db.flush()
    job = Job(
        debate_id=debate.id,
        node_id=None,
        job_type="synthesize",
        required_role="synthesizer",
        required_model="mock-local",
        status="running",
        worker_id=worker.id,
        claimed_at=now_utc(),
        stream_buffer='{"strongest_pro":"Focus improves',
    )
    db.add(job)
    db.commit()

    visible = debate_to_dict(db, db.get(Debate, debate.id))

    assert visible["active_synthesis"] == {
        "id": f"stream:{job.id}",
        "job_id": job.id,
        "debate_id": debate.id,
        "model_id": "mock-local",
        "worker_id": worker.id,
        "worker_name": "mac-mini",
        "created_at": iso(job.claimed_at),
        # Fix 4: "raw" stays the literal buffer (never envelope-prose). The
        # web client parses this as JSON (partialJsonField in
        # DebatePageClient.tsx) and appends raw synthesis_token deltas to it
        # to drive the live synthesis preview -- prose here breaks that
        # parser. streaming_generation_summary's "argument" is the one field
        # that presents envelope prose; active_synthesis's "raw" is parser
        # input for the client, not display copy.
        "raw": job.stream_buffer,
        "is_streaming": True,
    }
    assert visible["models"] == ["mock-local"]
    assert visible["workers"] == ["mac-mini"]


def test_debate_detail_includes_completed_synthesis_worker_name(db) -> None:
    worker = add_worker(db)
    debate = Debate(topic="Should public transit be free?", status="complete", config={"max_depth": 1})
    db.add(debate)
    db.flush()
    synthesis = Synthesis(
        debate_id=debate.id,
        strongest_pro="It expands access.",
        strongest_con="It needs funding.",
        verdict="It depends on the tax design.",
        model_id="mock-local",
        worker_id=worker.id,
    )
    db.add(synthesis)
    db.flush()
    debate.synthesis_id = synthesis.id
    db.commit()

    visible = debate_to_dict(db, db.get(Debate, debate.id))

    assert visible["synthesis"]["worker_id"] == worker.id
    assert visible["synthesis"]["worker_name"] == "mac-mini"
    assert visible["models"] == ["mock-local"]
    assert visible["workers"] == ["mac-mini"]


def test_debate_detail_reports_stale_generating_synthesis_as_complete(db) -> None:
    worker = add_worker(db)
    debate = Debate(
        topic="Xbox or PS5?",
        status="generating",
        config={"max_depth": 1},
        completed_at=now_utc(),
    )
    db.add(debate)
    db.flush()
    root = Node(
        debate_id=debate.id,
        parent_id=None,
        node_type="ROOT_CLAIM",
        depth=0,
        position=0,
        claim=debate.topic,
        status="complete",
        materialized_path="0",
    )
    db.add(root)
    db.flush()
    synthesis = Synthesis(
        debate_id=debate.id,
        strongest_pro="Synthesis",
        strongest_con="",
        verdict="Choose based on preferred games and budget.",
        model_id="mock-local",
        worker_id=worker.id,
    )
    db.add(synthesis)
    db.flush()
    debate.root_node_id = root.id
    debate.synthesis_id = synthesis.id
    db.commit()

    visible = debate_to_dict(db, db.get(Debate, debate.id))

    assert visible["status"] == "complete"
    assert visible["completed_at"]
    assert visible["synthesis"]["verdict"] == "Choose based on preferred games and budget."


def test_debate_detail_batches_worker_name_lookup(db) -> None:
    workers = [
        Worker(
            name="mac-mini",
            token_hash=hash_token("worker-a-token"),
            capabilities=["mock-local"],
            last_seen=now_utc(),
            status="online",
        ),
        Worker(
            name="adesso-mbp",
            token_hash=hash_token("worker-b-token"),
            capabilities=["mock-beta"],
            last_seen=now_utc(),
            status="online",
        ),
        Worker(
            name="spare-mac",
            token_hash=hash_token("worker-c-token"),
            capabilities=["mock-gamma"],
            last_seen=now_utc(),
            status="online",
        ),
    ]
    db.add_all(workers)
    db.flush()
    worker_ids = [worker.id for worker in workers]

    debate = Debate(topic="Should cities add night buses?", status="generating", config={"max_depth": 1})
    db.add(debate)
    db.flush()
    root = Node(
        debate_id=debate.id,
        parent_id=None,
        node_type="ROOT_CLAIM",
        depth=0,
        position=0,
        claim=debate.topic,
        status="complete",
        materialized_path="0",
    )
    db.add(root)
    db.flush()
    child = Node(
        debate_id=debate.id,
        parent_id=root.id,
        node_type="PRO",
        depth=1,
        position=0,
        claim="Night buses improve access.",
        status="complete",
        materialized_path="0/0",
    )
    db.add(child)
    db.flush()
    root_generation = Generation(
        node_id=root.id,
        model_id="mock-local",
        role="decomposer",
        argument="Root argument.",
        worker_id=worker_ids[0],
    )
    child_generation = Generation(
        node_id=child.id,
        model_id="mock-beta",
        role="proposer",
        argument="Child argument.",
        worker_id=worker_ids[1],
    )
    synthesis = Synthesis(
        debate_id=debate.id,
        strongest_pro="Access improves.",
        strongest_con="Funding is hard.",
        verdict="Pilot it.",
        model_id="mock-gamma",
        worker_id=worker_ids[2],
    )
    db.add_all([root_generation, child_generation, synthesis])
    db.flush()
    root.active_generation_id = root_generation.id
    child.active_generation_id = child_generation.id
    debate.root_node_id = root.id
    debate.synthesis_id = synthesis.id
    db.add(
        Job(
            debate_id=debate.id,
            node_id=child.id,
            job_type="argue",
            required_role="skeptic",
            required_model="mock-local",
            status="running",
            worker_id=worker_ids[0],
            claimed_at=now_utc(),
            stream_buffer="Streaming counterpoint.",
        )
    )
    db.commit()
    db.expire_all()

    worker_selects = 0

    def count_worker_select(conn, cursor, statement, parameters, context, executemany) -> None:
        nonlocal worker_selects
        if "FROM workers" in statement:
            worker_selects += 1

    db_engine = get_engine()
    event.listen(db_engine, "before_cursor_execute", count_worker_select)
    try:
        visible = debate_to_dict(db, db.get(Debate, debate.id))
    finally:
        event.remove(db_engine, "before_cursor_execute", count_worker_select)

    assert worker_selects == 1
    assert visible["workers"] == ["adesso-mbp", "mac-mini", "spare-mac"]
    assert visible["tree"]["active_generation"]["worker_name"] == "mac-mini"
    assert visible["tree"]["children"][0]["active_generation"]["worker_name"] == "mac-mini"
    assert visible["synthesis"]["worker_name"] == "spare-mac"


def _root_with_branch(db, debate: Debate) -> tuple[Node, DebateBranch]:
    root = Node(
        debate_id=debate.id,
        parent_id=None,
        node_type="ROOT_CLAIM",
        depth=0,
        position=0,
        claim=debate.topic,
        status="complete",
        materialized_path="0",
    )
    db.add(root)
    db.flush()
    debate.root_node_id = root.id
    branch = DebateBranch(debate_id=debate.id, root_node_id=root.id, status="active")
    db.add(branch)
    db.flush()
    return root, branch


def test_debate_detail_verdict_matches_verdict_summary_for_latest_protocol_analysis_run(db) -> None:
    # Phase 9 Task 1: detail["verdict"] is ADDITIVE -- assert it is present
    # AND every pre-existing key from the module docstring/Verified Ground
    # Truth ("tree", "analyzer_runs", "branch_lineage", ...) remains intact.
    #
    # created_at is set EXPLICITLY (not left to wall-clock `now_utc()`
    # defaults) with a deliberate gap between the two rows. This sidesteps
    # the documented tie hazard in the debate_to_dict "latest protocol_analysis"
    # lookup (created_at.desc(), id.desc() -- see the comment at its call site
    # and tests/test_protocol_runner.py::_other_protocol_analysis_run's
    # docstring): created_at is coarse wall-clock (especially on Windows) and
    # id is a random UUID4, so two rows created back-to-back in the same test
    # can otherwise land in the same timestamp tick and make the id-desc
    # tiebreak pick either row non-deterministically.
    older_created_at = now_utc()
    newer_created_at = older_created_at + timedelta(seconds=5)

    debate = Debate(topic="Should cities ban cars?", status="complete", config={"max_depth": 1})
    db.add(debate)
    db.flush()
    root, branch = _root_with_branch(db, debate)

    # An OLDER protocol_analysis run (must be superseded by the newer one).
    older_run = AnalyzerRun(
        debate_id=debate.id,
        branch_id=branch.id,
        analyzer_type="protocol_analysis",
        output={
            "dialecticalStrengths": {root.id: 0.1},
            "verificationStatuses": {root.id: "pending_verification"},
            "convergence": {"converged": None, "reason": "first_evaluation", "epsilon": 0.05},
        },
        status="complete",
        provenance={"scoring_source": "protocol_analysis", "debate_id": debate.id},
        created_at=older_created_at,
    )
    db.add(older_run)
    db.commit()

    # A NEWER protocol_analysis run -- this is the one detail["verdict"] must
    # reflect (real dialecticalStrengths/verificationStatuses/convergence,
    # shaped exactly like app/protocol/runner.py persists them).
    latest_run = AnalyzerRun(
        debate_id=debate.id,
        branch_id=branch.id,
        analyzer_type="protocol_analysis",
        output={
            "dialecticalStrengths": {root.id: 0.8},
            "tauCoverage": 1.0,
            "verificationStatuses": {root.id: "verified"},
            "convergence": {"converged": True, "reason": None, "epsilon": 0.05},
        },
        status="complete",
        provenance={"scoring_source": "protocol_analysis", "debate_id": debate.id},
        created_at=newer_created_at,
    )
    db.add(latest_run)
    db.commit()

    visible = debate_to_dict(db, db.get(Debate, debate.id))

    expected = verdict_summary(
        latest_run.output,
        root_node_id=root.id,
        evidence_presence="none",
    )
    assert visible["verdict"] == expected
    assert visible["verdict"]["verdictBand"] == "supported"

    # Additive: every pre-existing top-level key must remain present/unchanged.
    assert visible["tree"]["id"] == root.id
    assert len(visible["analyzer_runs"]) == 2
    assert visible["branch_lineage"][0]["id"] == branch.id
    assert visible["node_count"] == 1


def test_debate_detail_unscored_protocol_run_serves_insufficient_scoring(db) -> None:
    # W2: a stored protocol run WITHOUT tauCoverage (every pre-existing
    # artifact -- computed over all-default taus) must serve the honest
    # insufficient_scoring band, with the real strength still in the basis.
    debate = Debate(topic="Should cities ban cars?", status="complete", config={"max_depth": 1})
    db.add(debate)
    db.flush()
    root, branch = _root_with_branch(db, debate)
    db.add(
        AnalyzerRun(
            debate_id=debate.id,
            branch_id=branch.id,
            analyzer_type="protocol_analysis",
            output={
                "dialecticalStrengths": {root.id: 0.97},
                "verificationStatuses": {root.id: "pending_verification"},
                "convergence": {"converged": None, "reason": "first_evaluation", "epsilon": 0.05},
            },
            status="complete",
            provenance={"scoring_source": "protocol_analysis", "debate_id": debate.id},
        )
    )
    db.commit()

    visible = debate_to_dict(db, db.get(Debate, debate.id))

    assert visible["verdict"]["verdictBand"] == "insufficient_scoring"
    assert visible["verdict"]["basis"]["dialecticalStrength"] == 0.97
    assert visible["verdict"]["basis"]["tauCoverage"] == 0.0
    assert visible["verdict"]["basis"]["tauSourceMajority"] == "default"


def test_debate_detail_verdict_unavailable_when_no_protocol_analysis_run(db) -> None:
    debate = Debate(topic="Should cities ban cars?", status="generating", config={"max_depth": 1})
    db.add(debate)
    db.flush()
    _root_with_branch(db, debate)
    db.commit()

    visible = debate_to_dict(db, db.get(Debate, debate.id))

    assert visible["verdict"]["verdictBand"] == "unavailable"
    assert visible["analyzer_runs"] == []


# ---------------------------------------------------------------------------
# P4.1: debate_to_dict["lean"] -- see app.scoring.lean.compute_lean.
# ---------------------------------------------------------------------------


def _pro_con_child(db, debate: Debate, root: Node, node_type: str, position: int, status: str = "complete") -> Node:
    child = Node(
        debate_id=debate.id,
        parent_id=root.id,
        node_type=node_type,
        depth=1,
        position=position,
        claim=f"{node_type} claim {position}",
        status=status,
        materialized_path=f"0/{position}",
    )
    db.add(child)
    db.flush()
    return child


def test_debate_detail_lean_dialectical_when_protocol_analysis_has_usable_strengths(db) -> None:
    debate = Debate(topic="Should cities ban cars?", status="complete", config={"max_depth": 1})
    db.add(debate)
    db.flush()
    root, branch = _root_with_branch(db, debate)
    pro = _pro_con_child(db, debate, root, "PRO", 0)
    con = _pro_con_child(db, debate, root, "CON", 1)
    db.add(
        AnalyzerRun(
            debate_id=debate.id,
            branch_id=branch.id,
            analyzer_type="protocol_analysis",
            output={
                "dialecticalStrengths": {root.id: 0.7, pro.id: 0.9, con.id: 0.3},
                "tauCoverage": 1.0,
            },
            status="complete",
            provenance={"scoring_source": "protocol_analysis", "debate_id": debate.id},
        )
    )
    db.commit()

    visible = debate_to_dict(db, db.get(Debate, debate.id))

    assert visible["lean"] == {"source": "dialectical", "pct": 75, "label": "Pro"}


def test_debate_detail_lean_structural_when_no_protocol_analysis_run(db) -> None:
    debate = Debate(topic="Should cities ban cars?", status="complete", config={"max_depth": 1})
    db.add(debate)
    db.flush()
    root, _branch = _root_with_branch(db, debate)
    _pro_con_child(db, debate, root, "PRO", 0)
    _pro_con_child(db, debate, root, "CON", 1)
    db.commit()

    visible = debate_to_dict(db, db.get(Debate, debate.id))

    assert visible["analyzer_runs"] == []
    assert visible["lean"] == {"source": "structural", "pct": 50, "label": "Even (structural)"}


def test_debate_detail_lean_excludes_failed_node_from_dialectical_mass(db) -> None:
    debate = Debate(topic="Should cities ban cars?", status="complete", config={"max_depth": 1})
    db.add(debate)
    db.flush()
    root, branch = _root_with_branch(db, debate)
    live_pro = _pro_con_child(db, debate, root, "PRO", 0, status="complete")
    dead_pro = _pro_con_child(db, debate, root, "PRO", 1, status="failed")
    con = _pro_con_child(db, debate, root, "CON", 2, status="complete")
    db.add(
        AnalyzerRun(
            debate_id=debate.id,
            branch_id=branch.id,
            analyzer_type="protocol_analysis",
            output={
                # The failed node's strength is deliberately huge -- if it
                # ever leaked into pro_mass the lean would read "Pro", not
                # the "Even" this test asserts.
                "dialecticalStrengths": {root.id: 0.5, live_pro.id: 0.5, dead_pro.id: 0.99, con.id: 0.5},
                "tauCoverage": 1.0,
            },
            status="complete",
            provenance={"scoring_source": "protocol_analysis", "debate_id": debate.id},
        )
    )
    db.commit()

    visible = debate_to_dict(db, db.get(Debate, debate.id))

    assert visible["lean"] == {"source": "dialectical", "pct": 50, "label": "Even"}


def test_debate_detail_lean_none_when_no_pro_con_nodes_yet(db) -> None:
    debate = Debate(topic="Should cities ban cars?", status="generating", config={"max_depth": 1})
    db.add(debate)
    db.flush()
    _root_with_branch(db, debate)
    db.commit()

    visible = debate_to_dict(db, db.get(Debate, debate.id))

    assert visible["lean"] is None


def test_debate_to_dict_includes_evidence_presence_and_state(db) -> None:
    debate = Debate(topic="Should cities ban cars?", status="complete", config={"max_depth": 1})
    db.add(debate)
    db.flush()
    root = Node(
        debate_id=debate.id,
        parent_id=None,
        node_type="ROOT_CLAIM",
        depth=0,
        position=0,
        claim=debate.topic,
        status="complete",
        materialized_path="0",
    )
    db.add(root)
    db.flush()
    evidence = Node(
        debate_id=debate.id,
        parent_id=root.id,
        node_type="EVIDENCE",
        depth=1,
        position=0,
        claim="A transport study reported fewer collisions after a car ban.",
        status="complete",
        materialized_path="0/0",
    )
    db.add(evidence)
    db.flush()
    debate.root_node_id = root.id

    no_evidence_debate = Debate(topic="Should schools ban phones?", status="complete", config={"max_depth": 0})
    db.add(no_evidence_debate)
    db.flush()
    no_evidence_root = Node(
        debate_id=no_evidence_debate.id,
        parent_id=None,
        node_type="ROOT_CLAIM",
        depth=0,
        position=0,
        claim=no_evidence_debate.topic,
        status="complete",
        materialized_path="0",
    )
    db.add(no_evidence_root)
    db.flush()
    no_evidence_debate.root_node_id = no_evidence_root.id
    db.commit()

    visible = debate_to_dict(db, db.get(Debate, debate.id))
    no_evidence_visible = debate_to_dict(db, db.get(Debate, no_evidence_debate.id))

    assert visible["evidencePresence"] == "extracted_unresolved"
    assert "evidence_state" not in visible["tree"]
    evidence_child = visible["tree"]["children"][0]
    assert evidence_child["id"] == evidence.id
    assert evidence_child["evidence_state"] == "extracted_source_unresolved"
    assert no_evidence_visible["evidencePresence"] == "none"
    assert no_evidence_visible["tree"]["id"] == no_evidence_root.id


# ---------------------------------------------------------------------------
# Task 13 (P1.5): evidence independence bookkeeping wiring. Pure-function
# coverage (domain heuristic, per-leaf record, aggregation) lives in
# test_evidence_independence.py -- these tests prove debate_to_dict attaches
# the per-claim aggregate to (and only to) claim nodes with real EVIDENCE
# children, reading each one's real evidence_metadata + generating model.
# ---------------------------------------------------------------------------


def _evidence_node(
    db,
    debate: Debate,
    parent: Node,
    *,
    position: int,
    claim: str,
    evidence_metadata: dict | None,
    model_id: str | None = None,
    worker_id: str | None = None,
) -> Node:
    """An EVIDENCE child node with optional metadata and an optional
    attributed generation, mirroring app.evidence.extraction's real node
    shapes closely enough for evidence_leaf_record's inputs to be real."""
    node = Node(
        debate_id=debate.id,
        parent_id=parent.id,
        node_type="EVIDENCE",
        depth=parent.depth + 1,
        position=position,
        claim=claim,
        status="complete",
        materialized_path=f"{parent.materialized_path}/{position}",
        evidence_metadata=evidence_metadata,
    )
    db.add(node)
    db.flush()
    if model_id:
        generation = Generation(
            node_id=node.id,
            model_id=model_id,
            role="evidence_retriever",
            argument=claim,
            worker_id=worker_id,
        )
        db.add(generation)
        db.flush()
        node.active_generation_id = generation.id
    return node


def _pro_child(db, debate: Debate, root: Node) -> Node:
    pro = Node(
        debate_id=debate.id,
        parent_id=root.id,
        node_type="PRO",
        depth=1,
        position=0,
        claim="Fewer cars would reduce street danger.",
        status="complete",
        materialized_path="0/0",
    )
    db.add(pro)
    db.flush()
    return pro


def test_debate_to_dict_evidence_independence_absent_without_evidence_children(db) -> None:
    debate = Debate(topic="Should cities ban cars?", status="complete", config={"max_depth": 1})
    db.add(debate)
    db.flush()
    root = _root(db, debate)
    _pro_child(db, debate, root)
    db.commit()

    visible = debate_to_dict(db, db.get(Debate, debate.id))

    assert "evidence_independence" not in visible["tree"]
    assert "evidence_independence" not in visible["tree"]["children"][0]


def test_debate_to_dict_evidence_independence_counts_distinct_retrieval_domains(db) -> None:
    worker = add_worker(db)
    debate = Debate(topic="Should cities ban cars?", status="complete", config={"max_depth": 1})
    db.add(debate)
    db.flush()
    root = _root(db, debate)
    pro = _pro_child(db, debate, root)
    _evidence_node(
        db,
        debate,
        pro,
        position=2000,
        claim="A study reported fewer collisions.",
        evidence_metadata={
            "method": "retrieval",
            "url": "https://www.reuters.com/world/article",
            "quote": "collisions fell",
            "retrieval_query": "car ban collisions",
            "publisher": "Reuters",
            "date": None,
            "stance": "supports",
            "resolution_status": "pending",
        },
        model_id="claude-sonnet-5-high-loop",
        worker_id=worker.id,
    )
    _evidence_node(
        db,
        debate,
        pro,
        position=2001,
        claim="Another outlet reported the same trend.",
        evidence_metadata={
            "method": "retrieval",
            "url": "https://apnews.com/article/car-ban",
            "quote": "trend confirmed",
            "retrieval_query": "car ban collisions",
            "publisher": "AP",
            "date": None,
            "stance": "supports",
            "resolution_status": "pending",
        },
        model_id="gemini-2.5-pro",
        worker_id=worker.id,
    )
    db.commit()

    visible = debate_to_dict(db, db.get(Debate, debate.id))
    pro_dict = visible["tree"]["children"][0]

    assert pro_dict["evidence_independence"] == {
        "distinct_source_count": 2,
        "pairs": [["apnews.com", "retrieval"], ["reuters.com", "retrieval"]],
    }
    # Scoped to THIS node's own direct EVIDENCE children -- the root has no
    # direct evidence children of its own (they belong to the PRO node).
    assert "evidence_independence" not in visible["tree"]


def test_debate_to_dict_evidence_independence_counts_model_claim_spans_as_one_pair(db) -> None:
    worker = add_worker(db)
    debate = Debate(topic="Should cities ban cars?", status="complete", config={"max_depth": 1})
    db.add(debate)
    db.flush()
    root = _root(db, debate)
    pro = _pro_child(db, debate, root)
    for index in range(3):
        _evidence_node(
            db,
            debate,
            pro,
            position=1000 + index,
            claim=f"Extracted span {index}.",
            evidence_metadata={"evidenceKind": "statistical", "method": "model-claim"},
            model_id="claude-sonnet-5-high-loop",
            worker_id=worker.id,
        )
    db.commit()

    visible = debate_to_dict(db, db.get(Debate, debate.id))
    pro_dict = visible["tree"]["children"][0]

    assert pro_dict["evidence_independence"] == {
        "distinct_source_count": 1,
        "pairs": [[None, "model-claim"]],
    }


def test_debate_to_dict_evidence_independence_mixes_retrieval_and_model_claim(db) -> None:
    worker = add_worker(db)
    debate = Debate(topic="Should cities ban cars?", status="complete", config={"max_depth": 1})
    db.add(debate)
    db.flush()
    root = _root(db, debate)
    pro = _pro_child(db, debate, root)
    _evidence_node(
        db,
        debate,
        pro,
        position=1000,
        claim="Extracted span.",
        evidence_metadata={"evidenceKind": "statistical", "method": "model-claim"},
        model_id="claude-sonnet-5-high-loop",
        worker_id=worker.id,
    )
    _evidence_node(
        db,
        debate,
        pro,
        position=2000,
        claim="Retrieved source.",
        evidence_metadata={
            "method": "retrieval",
            "url": "https://x.com/a",
            "quote": "q",
            "retrieval_query": "r",
            "publisher": "X",
            "date": None,
            "stance": "supports",
            "resolution_status": "pending",
        },
        model_id="gemini-2.5-pro",
        worker_id=worker.id,
    )
    db.commit()

    visible = debate_to_dict(db, db.get(Debate, debate.id))
    pro_dict = visible["tree"]["children"][0]

    assert pro_dict["evidence_independence"] == {
        "distinct_source_count": 2,
        "pairs": [[None, "model-claim"], ["x.com", "retrieval"]],
    }


def test_debate_to_dict_evidence_independence_survives_evidence_with_no_generation_or_metadata(db) -> None:
    # Defensive: an EVIDENCE node with no attached generation and no
    # evidence_metadata (e.g. a legacy/pre-Task-10 row) must not crash
    # serialization -- it degrades to an honest (None, None) pair rather
    # than a fabricated guess or a stack trace.
    debate = Debate(topic="Should cities ban cars?", status="complete", config={"max_depth": 1})
    db.add(debate)
    db.flush()
    root = _root(db, debate)
    evidence = Node(
        debate_id=debate.id,
        parent_id=root.id,
        node_type="EVIDENCE",
        depth=1,
        position=0,
        claim="A transport study reported fewer collisions after a car ban.",
        status="complete",
        materialized_path="0/0",
    )
    db.add(evidence)
    db.commit()

    visible = debate_to_dict(db, db.get(Debate, debate.id))

    assert visible["tree"]["evidence_independence"] == {
        "distinct_source_count": 1,
        "pairs": [[None, None]],
    }


def test_synthesis_verdict_gate_mirrors_top_level_verdict_state(db, monkeypatch, caplog) -> None:
    monkeypatch.setenv("DIALECTICAL_VERDICT_EVIDENCE_GATE", "1")
    caplog.set_level("INFO", logger="app.services.serialization")
    worker = add_worker(db)
    debate = Debate(
        topic="Measured global surface temperature data show a warming trend.",
        status="complete",
        config={"max_depth": 1},
    )
    db.add(debate)
    db.flush()
    root, branch = _root_with_branch(db, debate)
    synthesis = Synthesis(
        debate_id=debate.id,
        strongest_pro="The measurements are consistent across datasets.",
        strongest_con="Historical coverage is uneven.",
        verdict="The persisted synthesis text must remain unchanged.",
        model_id="mock-local",
        worker_id=worker.id,
    )
    db.add(synthesis)
    db.flush()
    debate.synthesis_id = synthesis.id
    db.add(
        AnalyzerRun(
            debate_id=debate.id,
            branch_id=branch.id,
            analyzer_type="protocol_analysis",
            output={
                "dialecticalStrengths": {root.id: 0.8},
                "claimTypes": {root.id: "empirical"},
                "claimTypeSource": {root.id: "root_claim_text"},
            },
            status="complete",
            provenance={"scoring_source": "protocol_analysis", "debate_id": debate.id},
        )
    )
    db.commit()

    payload = debate_to_dict(db, db.get(Debate, debate.id))

    assert payload["verdict"]["verdictState"] == "suppressed_no_evidence"
    assert payload["synthesis"]["verdict_gate"]["state"] == payload["verdict"]["verdictState"]
    assert payload["synthesis"]["verdict_gate"]["reason"] == payload["verdict"]["suppressionReason"]
    # W2: verdict_gate mirrors the served band too (additive key; verdictBand
    # stays the band's sole wire key NAME, mirrored from the single
    # verdict_summary derivation -- never derived separately).
    assert payload["synthesis"]["verdict_gate"]["verdictBand"] == payload["verdict"]["verdictBand"]
    assert payload["synthesis"]["verdict"] == "The persisted synthesis text must remain unchanged."
    assert (
        f"verdict.evidence_gate debate={debate.id} state=suppressed_no_evidence "
        "would_suppress=true evidence=none claim_type=empirical "
        "claim_type_source=root_claim_text"
    ) in caplog.messages


# ---------------------------------------------------------------------------
# W6: flag-ON honesty, exercised through the real env var (not just the pure
# verdict_summary(gate_enabled=...) param) at the serialization boundary --
# closing the gap between the unit-level pins in tests/test_verdict.py and
# what actually ships on the wire when DIALECTICAL_VERDICT_EVIDENCE_GATE=1.
# No flag default changes here; the env var is scoped to each test only.
# ---------------------------------------------------------------------------


def test_env_gate_on_preserves_pregate_band_for_suppressed_scored_debate(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_VERDICT_EVIDENCE_GATE", "1")
    debate = Debate(
        topic="Measured rainfall totals rose across the basin this decade.",
        status="complete",
        config={"max_depth": 0},
    )
    db.add(debate)
    db.flush()
    root, branch = _root_with_branch(db, debate)
    db.add(
        AnalyzerRun(
            debate_id=debate.id,
            branch_id=branch.id,
            analyzer_type="protocol_analysis",
            output={
                "dialecticalStrengths": {root.id: 0.8},
                "tauCoverage": 1.0,
                "claimTypes": {root.id: "empirical"},
                "claimTypeSource": {root.id: "root_claim_text"},
            },
            status="complete",
            provenance={"scoring_source": "protocol_analysis", "debate_id": debate.id},
        )
    )
    db.commit()

    visible = debate_to_dict(db, db.get(Debate, debate.id))
    verdict = visible["verdict"]

    # Scored (tauCoverage above threshold) -> the pre-gate read is the real
    # "supported" band; the gate then withholds it. The honest basis for a
    # withheld verdict never loses the pre-gate reading.
    assert verdict["basis"]["preGateVerdictBand"] == "supported"
    assert verdict["verdictBand"] == "suppressed"
    assert verdict["verdictState"] == "suppressed_no_evidence"
    assert verdict["basis"]["dialecticalStrength"] == 0.8


def test_env_gate_on_never_suppresses_unknown_claim_type(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_VERDICT_EVIDENCE_GATE", "1")
    debate = Debate(
        topic="Should the city widen Elm Street?",
        status="complete",
        config={"max_depth": 0},
    )
    db.add(debate)
    db.flush()
    root, branch = _root_with_branch(db, debate)
    db.add(
        AnalyzerRun(
            debate_id=debate.id,
            branch_id=branch.id,
            analyzer_type="protocol_analysis",
            output={
                "dialecticalStrengths": {root.id: 0.8},
                "tauCoverage": 1.0,
                # No claimTypes entry at all for the root -- an unclassified
                # claim type must never be treated as gate-eligible.
            },
            status="complete",
            provenance={"scoring_source": "protocol_analysis", "debate_id": debate.id},
        )
    )
    db.commit()

    visible = debate_to_dict(db, db.get(Debate, debate.id))
    verdict = visible["verdict"]

    assert verdict["verdictBand"] == "supported"
    assert verdict["verdictState"] == "endorsed_with_caveat"
    assert verdict["suppressionReason"] is None
    assert [caveat["code"] for caveat in verdict["caveats"]] == ["claim_type_unknown"]


def test_env_gate_on_and_unscored_debate_compose_without_contradiction(db, monkeypatch) -> None:
    # The precedence itself is already pinned at the pure-function level
    # (test_verdict.py::test_evidence_gate_suppression_still_wins_over_insufficient_scoring);
    # this pins the SAME composition through the real env var at the actual
    # wire boundary, on a debate that never received judge scores at all.
    monkeypatch.setenv("DIALECTICAL_VERDICT_EVIDENCE_GATE", "1")
    debate = Debate(
        topic="Measured river discharge fell below the historical average.",
        status="complete",
        config={"max_depth": 0},
    )
    db.add(debate)
    db.flush()
    root, branch = _root_with_branch(db, debate)
    db.add(
        AnalyzerRun(
            debate_id=debate.id,
            branch_id=branch.id,
            analyzer_type="protocol_analysis",
            output={
                "dialecticalStrengths": {root.id: 0.97},
                # No tauCoverage key -- an unscored debate reads as 0.0
                # coverage, i.e. the pre-gate band is "insufficient_scoring".
                "claimTypes": {root.id: "empirical"},
                "claimTypeSource": {root.id: "root_claim_text"},
            },
            status="complete",
            provenance={"scoring_source": "protocol_analysis", "debate_id": debate.id},
        )
    )
    db.commit()

    visible = debate_to_dict(db, db.get(Debate, debate.id))
    verdict = visible["verdict"]

    assert verdict["basis"]["preGateVerdictBand"] == "insufficient_scoring"
    assert verdict["verdictBand"] == "suppressed"
    assert verdict["verdictState"] == "suppressed_no_evidence"
    assert verdict["basis"]["dialecticalStrength"] == 0.97


def test_synthesis_to_dict_without_verdict_gate_param_keeps_legacy_shape(db) -> None:
    worker = add_worker(db)
    debate = Debate(topic="Should public transit be free?", status="complete", config={})
    db.add(debate)
    db.flush()
    synthesis = Synthesis(
        debate_id=debate.id,
        strongest_pro="It expands access.",
        strongest_con="It needs funding.",
        verdict="Pilot it.",
        model_id="mock-local",
        worker_id=worker.id,
    )
    db.add(synthesis)
    db.flush()

    payload = synthesis_to_dict(db, synthesis)

    assert payload is not None
    assert payload["verdict"] == "Pilot it."
    assert "verdict_gate" not in payload


# ---------------------------------------------------------------------------
# W5a: decision provenance -- lifecycleDecisions, completion, and the
# pre/post additive-only key-diff proof.
# ---------------------------------------------------------------------------


def _lifecycle_snapshot(
    *,
    idempotency_key: str,
    node_id: str,
    debate_id: str,
    decision_timestamp: datetime,
    decision: str = "challenge",
    stopping_reason: str = "evidence refutes or contradicts the claim",
    signal_class: str = "categorical",
    child_spawn_count: int = 0,
) -> LifecycleDecisionSnapshot:
    return LifecycleDecisionSnapshot(
        schema_version=LIFECYCLE_DECISION_SCHEMA_VERSION,
        idempotency_key=idempotency_key,
        debate_id=debate_id,
        node_id=node_id,
        decision=decision,
        stopping_reason=stopping_reason,
        path_status="active",
        stopping_status=decision,
        input_state="grounded",
        reason_codes=(),
        score_availability="present",
        score_freshness="fresh",
        evidence_availability="present",
        evidence_freshness="fresh",
        current_score_input_hash="a" * 64,
        scoring_contract_hash="b" * 64,
        score_record_id="score-record-1",
        score_run_id="score-run-1",
        score_run_sequence=1,
        evidence_snapshot_id="evidence-snapshot-1",
        decision_timestamp=decision_timestamp,
        child_spawn_count=child_spawn_count,
        signal_class=signal_class,
    )


def _root(db, debate: Debate) -> Node:
    root = Node(
        debate_id=debate.id,
        parent_id=None,
        node_type="ROOT_CLAIM",
        depth=0,
        position=0,
        claim=debate.topic,
        status="complete",
        materialized_path="0",
    )
    db.add(root)
    db.flush()
    debate.root_node_id = root.id
    return root


def test_lifecycle_decisions_bounded_to_latest_per_node(db) -> None:
    debate = Debate(topic="Should cities ban cars?", status="generating", config={})
    db.add(debate)
    db.flush()
    root = _root(db, debate)
    node = Node(
        debate_id=debate.id,
        parent_id=root.id,
        node_type="PRO",
        depth=1,
        position=0,
        claim="Fewer cars would reduce street danger.",
        status="complete",
        materialized_path="0/0",
    )
    db.add(node)
    db.flush()
    db.commit()

    persist_lifecycle_decision(
        db,
        snapshot=_lifecycle_snapshot(
            idempotency_key="eval-1",
            node_id=node.id,
            debate_id=debate.id,
            decision="continue",
            stopping_reason="no expansion pressure crosses policy thresholds",
            signal_class="scalar",
            decision_timestamp=datetime(2026, 7, 1, tzinfo=timezone.utc),
        ),
    )
    persist_lifecycle_decision(
        db,
        snapshot=_lifecycle_snapshot(
            idempotency_key="eval-2",
            node_id=node.id,
            debate_id=debate.id,
            decision="challenge",
            stopping_reason="evidence refutes or contradicts the claim",
            signal_class="categorical",
            decision_timestamp=datetime(2026, 7, 2, tzinfo=timezone.utc),
        ),
    )
    db.commit()

    payload = debate_to_dict(db, db.get(Debate, debate.id))

    decisions = payload["lifecycleDecisions"]
    assert len(decisions) == 1  # bounded: latest only, not the full audit trail
    entry = decisions[0]
    assert entry["nodeId"] == node.id
    assert entry["decision"] == "challenge"
    assert entry["signalClass"] == "categorical"
    assert entry["reason"] == "evidence refutes or contradicts the claim"
    assert entry["childSpawnCount"] == 0
    assert entry["outcome"] == "annotate_only"
    assert entry["decidedAt"]


def test_lifecycle_decisions_outcome_buckets_are_honest(db) -> None:
    debate = Debate(topic="Should cities ban cars?", status="generating", config={})
    db.add(debate)
    db.flush()
    root = _root(db, debate)
    node_ids: dict[str, str] = {}
    for label in ("spawned", "budget", "capacity", "annotate"):
        node = Node(
            debate_id=debate.id,
            parent_id=root.id,
            node_type="PRO",
            depth=1,
            position=len(node_ids),
            claim=f"{label} branch",
            status="complete",
            materialized_path=f"0/{len(node_ids)}",
        )
        db.add(node)
        db.flush()
        node_ids[label] = node.id
    db.commit()

    records = {}
    for label, node_id in node_ids.items():
        persistence = persist_lifecycle_decision(
            db,
            snapshot=_lifecycle_snapshot(
                idempotency_key=f"eval-{label}",
                node_id=node_id,
                debate_id=debate.id,
                decision="seek_evidence",
                stopping_reason="empirical evidence is not grounded",
                signal_class="categorical",
                decision_timestamp=datetime(2026, 7, 1, tzinfo=timezone.utc),
            ),
        )
        records[label] = persistence.record
    # child_spawn_count/dispatch_outcome are written by the adaptive
    # dispatcher AFTER decision-time persistence (W4) -- mirror that here.
    records["spawned"].dispatch_outcome = "spawned"
    records["spawned"].child_spawn_count = 1
    records["budget"].dispatch_outcome = "budget_exhausted"
    records["capacity"].dispatch_outcome = "deferred_no_capacity"
    records["annotate"].dispatch_outcome = "annotate_only_scalar_signal"
    db.commit()

    payload = debate_to_dict(db, db.get(Debate, debate.id))
    outcome_by_node = {entry["nodeId"]: entry["outcome"] for entry in payload["lifecycleDecisions"]}

    assert outcome_by_node[node_ids["spawned"]] == "spawned"
    assert outcome_by_node[node_ids["budget"]] == "budget_exhausted"
    assert outcome_by_node[node_ids["capacity"]] == "deferred_no_capacity"
    assert outcome_by_node[node_ids["annotate"]] == "annotate_only"


def test_lifecycle_decisions_empty_when_debate_has_none(db) -> None:
    debate = Debate(topic="Should cities ban cars?", status="complete", config={})
    db.add(debate)
    db.commit()

    payload = debate_to_dict(db, db.get(Debate, debate.id))

    assert payload["lifecycleDecisions"] == []


def test_completion_block_plain_complete_debate_has_no_reason(db) -> None:
    debate = Debate(topic="Xbox or PS5?", status="complete", config={})
    db.add(debate)
    db.commit()

    payload = debate_to_dict(db, db.get(Debate, debate.id))

    assert payload["completion"] == {"state": "complete", "reasonCode": None, "humanReason": None}


def test_completion_block_complete_with_failed_branch_maps_generation_exhausted(db) -> None:
    worker = add_worker(db)
    debate = Debate(
        topic="Should cities ban cars?",
        status="generating",
        config={"max_depth": 1},
        completed_at=now_utc(),
    )
    db.add(debate)
    db.flush()
    root = _root(db, debate)
    failed_child = Node(
        debate_id=debate.id,
        parent_id=root.id,
        node_type="PRO",
        depth=1,
        position=0,
        claim="A failed branch",
        status="failed",
        stopping_status="stop",
        stopping_reason="generation_exhausted",
        path_status="abandoned",
        materialized_path="0/0",
    )
    db.add(failed_child)
    db.flush()
    synthesis = Synthesis(
        debate_id=debate.id,
        strongest_pro="",
        strongest_con="",
        verdict="Complete over survivors.",
        model_id="mock-local",
        worker_id=worker.id,
    )
    db.add(synthesis)
    db.flush()
    debate.synthesis_id = synthesis.id
    db.commit()

    payload = debate_to_dict(db, db.get(Debate, debate.id))

    assert payload["status"] == "complete"
    assert payload["completion"]["state"] == "complete-with-failed-branches"
    assert payload["completion"]["reasonCode"] == "generation_exhausted"
    # Fix 3: the completed-style override copy is only honest here, where
    # synthesis actually completed over the survivors.
    assert payload["completion"]["humanReason"] == (
        "Some branches were set aside after repeated failures; the debate completed with the rest."
    )


def test_completion_block_reason_pick_is_deterministic_across_multiple_failed_nodes(db) -> None:
    # `nodes` is queried without an ORDER BY (debate_to_dict); the reason
    # scan must not depend on incidental DB row order. Two failed nodes with
    # DISTINCT reasons (an artificial fixture -- every reachable pipeline
    # path today writes the identical "generation_exhausted" to every failed
    # node, but the pick must still be well-defined and stable) prove the
    # earlier materialized_path always wins, regardless of insertion order.
    worker = add_worker(db)
    debate = Debate(
        topic="Should cities ban cars?",
        status="generating",
        config={"max_depth": 1},
        completed_at=now_utc(),
    )
    db.add(debate)
    db.flush()
    root = _root(db, debate)
    # Insert the LATER-path node first, so an unsorted scan of insertion
    # order would pick it (and its reason) over the earlier one.
    later_child = Node(
        debate_id=debate.id,
        parent_id=root.id,
        node_type="CON",
        depth=1,
        position=1,
        claim="A second failed branch",
        status="failed",
        stopping_status="stop",
        stopping_reason="a_later_reason",
        path_status="abandoned",
        materialized_path="0/1",
    )
    db.add(later_child)
    db.flush()
    earlier_child = Node(
        debate_id=debate.id,
        parent_id=root.id,
        node_type="PRO",
        depth=1,
        position=0,
        claim="A failed branch",
        status="failed",
        stopping_status="stop",
        stopping_reason="generation_exhausted",
        path_status="abandoned",
        materialized_path="0/0",
    )
    db.add(earlier_child)
    db.flush()
    synthesis = Synthesis(
        debate_id=debate.id,
        strongest_pro="",
        strongest_con="",
        verdict="Complete over survivors.",
        model_id="mock-local",
        worker_id=worker.id,
    )
    db.add(synthesis)
    db.flush()
    debate.synthesis_id = synthesis.id
    db.commit()

    payload = debate_to_dict(db, db.get(Debate, debate.id))

    assert payload["completion"]["reasonCode"] == "generation_exhausted"


def test_completion_block_failed_debate_carries_the_node_reason(db) -> None:
    debate = Debate(topic="Should cities ban cars?", status="generating", config={"max_depth": 1})
    db.add(debate)
    db.flush()
    root = _root(db, debate)
    failed_child = Node(
        debate_id=debate.id,
        parent_id=root.id,
        node_type="PRO",
        depth=1,
        position=0,
        claim="A failed branch",
        status="failed",
        stopping_status="stop",
        stopping_reason="generation_exhausted",
        path_status="abandoned",
        materialized_path="0/0",
    )
    db.add(failed_child)
    db.flush()
    db.add(
        Job(
            debate_id=debate.id,
            node_id=failed_child.id,
            job_type="argue",
            required_role="proposer",
            required_model="mock-local",
            status="failed",
            error="Job deadline expired (retry budget exhausted)",
        )
    )
    db.commit()

    payload = debate_to_dict(db, db.get(Debate, debate.id))

    assert payload["status"] == "failed"
    assert payload["completion"]["state"] == "failed"
    assert payload["completion"]["reasonCode"] == "generation_exhausted"
    assert payload["completion"]["humanReason"]
    # Fix 3: a FAILED debate must never get the complete-with-failed-branches
    # override copy just because it shares the same node-level reason code
    # (generation_exhausted) -- that copy claims synthesis completed over the
    # survivors, which is false here (payload["status"] == "failed").
    assert payload["completion"]["humanReason"] != (
        "Some branches were set aside after repeated failures; the debate completed with the rest."
    )
    assert payload["completion"]["humanReason"] == (
        "Generation failed after repeated attempts, so this path was set aside."
    )


def test_completion_block_failed_debate_without_node_reason_uses_the_honest_generic_code(db) -> None:
    debate = Debate(topic="Should cities ban cars?", status="generating", config={"max_depth": 1})
    db.add(debate)
    db.flush()
    root = _root(db, debate)
    db.add(
        Job(
            debate_id=debate.id,
            node_id=root.id,
            job_type="decompose",
            required_role="decomposer",
            required_model="mock-local",
            status="failed",
            error="some private worker exception text that must never leak",
        )
    )
    db.commit()

    payload = debate_to_dict(db, db.get(Debate, debate.id))

    assert payload["status"] == "failed"
    assert payload["completion"] == {
        "state": "failed",
        "reasonCode": "debate_generation_failed",
        "humanReason": "Debate generation failed and could not be completed.",
    }
    assert "some private worker exception text" not in str(payload["completion"])


def test_completion_block_adaptive_stopped_because(db) -> None:
    debate = Debate(
        topic="Should cities ban cars?",
        status="complete",
        config={"adaptive_expansion": {"rounds_completed": 1, "stopped_because": "budget_exhausted"}},
    )
    db.add(debate)
    db.commit()

    payload = debate_to_dict(db, db.get(Debate, debate.id))

    assert payload["completion"]["state"] == "complete"
    assert payload["completion"]["reasonCode"] == "budget_exhausted"
    assert payload["completion"]["humanReason"]


# The exact top-level debate_to_dict / node_to_dict key sets as they existed
# immediately before this wave (captured from git history at HEAD -- see
# w5a-report.md). W5a is additive-only: every one of these keys must still be
# present, unchanged, and the ONLY new keys allowed are the ones this wave
# introduces.
_PRE_W5A_DEBATE_KEYS = {
    "id", "topic", "status", "config", "direct_answer", "root_node_id", "synthesis_id",
    "created_at", "completed_at", "tree", "synthesis", "active_synthesis", "branch_lineage",
    "analyzer_runs", "verdict", "selected_skills", "selected_agents", "agent_outputs",
    "agent_runs", "skills_used", "provenance_records", "workers", "models", "node_count",
    "evidencePresence",
}
_PRE_W5A_NODE_KEYS = {
    "id", "debate_id", "parent_id", "node_type", "depth", "position", "claim", "status",
    "materialized_path", "active_generation_id", "label", "argument_claim", "path_status",
    "stopping_status", "stopping_reason", "active_generation", "children",
}


def test_debate_payload_pre_existing_keys_are_byte_identical(db) -> None:
    worker = add_worker(db)
    debate = Debate(
        topic="Should cities ban cars?",
        status="generating",
        config={"max_depth": 1},
        completed_at=now_utc(),
    )
    db.add(debate)
    db.flush()
    root = _root(db, debate)
    child = Node(
        debate_id=debate.id,
        parent_id=root.id,
        node_type="PRO",
        depth=1,
        position=0,
        claim="Fewer cars would reduce street danger.",
        status="complete",
        materialized_path="0/0",
    )
    db.add(child)
    db.flush()
    synthesis = Synthesis(
        debate_id=debate.id,
        strongest_pro="P",
        strongest_con="C",
        verdict="V",
        model_id="mock-local",
        worker_id=worker.id,
    )
    db.add(synthesis)
    db.flush()
    debate.synthesis_id = synthesis.id
    db.commit()

    payload = debate_to_dict(db, db.get(Debate, debate.id))

    top_level_keys = set(payload.keys())
    assert _PRE_W5A_DEBATE_KEYS <= top_level_keys
    # P4.1 additive: "lean" (see app.scoring.lean.compute_lean), alongside
    # W5a's own two additions.
    assert top_level_keys - _PRE_W5A_DEBATE_KEYS == {"lifecycleDecisions", "completion", "lean"}

    root_keys = set(payload["tree"].keys())
    assert _PRE_W5A_NODE_KEYS <= root_keys
    assert root_keys - _PRE_W5A_NODE_KEYS == {"stopping_reason_human"}

    child_keys = set(payload["tree"]["children"][0].keys())
    assert _PRE_W5A_NODE_KEYS <= child_keys
    assert child_keys - _PRE_W5A_NODE_KEYS == {"stopping_reason_human"}

    # Pre-existing VALUES stay exactly what they always were.
    assert payload["status"] == "complete"
    assert payload["tree"]["stopping_reason"] is None
    assert payload["tree"]["children"][0]["stopping_reason"] is None
    # New keys carry honest absence for a debate with nothing to report.
    assert payload["tree"]["stopping_reason_human"] is None
    assert payload["lifecycleDecisions"] == []
    assert payload["completion"] == {"state": "complete", "reasonCode": None, "humanReason": None}
    assert "derivation" not in payload
