from __future__ import annotations

from datetime import timedelta

from sqlalchemy import event

from app.core.auth import hash_token
from app.core.db import get_engine
from app.models.entities import AnalyzerRun, Debate, DebateBranch, Generation, Job, Node, Synthesis, Worker, now_utc
from app.scoring.verdict import verdict_summary
from app.services.serialization import debate_to_dict, iso


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
        "raw": '{"strongest_pro":"Focus improves',
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

    expected = verdict_summary(latest_run.output, root_node_id=root.id)
    assert visible["verdict"] == expected
    assert visible["verdict"]["verdictBand"] == "supported"

    # Additive: every pre-existing top-level key must remain present/unchanged.
    assert visible["tree"]["id"] == root.id
    assert len(visible["analyzer_runs"]) == 2
    assert visible["branch_lineage"][0]["id"] == branch.id
    assert visible["node_count"] == 1


def test_debate_detail_verdict_unavailable_when_no_protocol_analysis_run(db) -> None:
    debate = Debate(topic="Should cities ban cars?", status="generating", config={"max_depth": 1})
    db.add(debate)
    db.flush()
    _root_with_branch(db, debate)
    db.commit()

    visible = debate_to_dict(db, db.get(Debate, debate.id))

    assert visible["verdict"]["verdictBand"] == "unavailable"
    assert visible["analyzer_runs"] == []
