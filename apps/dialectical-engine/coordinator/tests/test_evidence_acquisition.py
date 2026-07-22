"""Task 10 (P1.1): evidence-acquisition jobs (retrieval via worker CLIs).

Covers eligibility (empirical/causal only), per-node/per-debate budgets, the
flag gate, search-capable routing + failover confinement, the strict source
contract, EVIDENCE-node materialization with retrieval provenance, and the
AUXILIARY terminal-failure branch (never damages node/debate). NO live network
or CLI here -- fake providers/payloads only; the citation-fetch path lives in
test_evidence_citations.py.
"""
from __future__ import annotations

import asyncio
from datetime import timedelta

import pytest
from sqlalchemy import func, select

from app.models.entities import (
    Debate,
    DebateBranch,
    Generation,
    Job,
    JobTransition,
    Node,
    Worker,
    now_utc,
)
from app.services.orchestrator import claim_pending_job, complete_job

# Reuse the established v2 pipeline test fixtures for the end-to-end flows.
from tests.test_dialectical_v2 import (
    real_codex_worker,
    worker_pov_output_with_extractable_evidence,
)


EMPIRICAL_ARGUMENT = "A controlled study observed lower outcomes in the data across every measured cohort."
CAUSAL_ARGUMENT = "Congestion pricing causes a measurable drop that the policy triggers within a year."
NORMATIVE_ARGUMENT = "Cities should ban private cars downtown as a matter of basic fairness."


def _service():
    from app.services import dialectical_v2

    return dialectical_v2


def _online_worker(db, name: str, capabilities: list[str]) -> Worker:
    row = Worker(
        name=name,
        token_hash="test-token",
        capabilities=capabilities,
        last_seen=now_utc(),
        status="online",
    )
    db.add(row)
    db.commit()
    return row


def _debate_with_branch(db) -> tuple[Debate, Node, DebateBranch]:
    debate = Debate(topic="Does congestion pricing reduce traffic?", status="generating", config={})
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
    debate.root_node_id = root.id
    branch = DebateBranch(debate_id=debate.id, parent_branch_id=None, root_node_id=root.id, status="active")
    db.add(branch)
    db.commit()
    return debate, root, branch


def _claim_node(db, debate: Debate, root: Node, *, argument: str, position: int = 0) -> Node:
    worker = db.scalar(select(Worker).limit(1))
    if worker is None:
        worker = _online_worker(db, "author", ["author-model"])
    node = Node(
        debate_id=debate.id,
        parent_id=root.id,
        node_type="PRO",
        depth=1,
        position=position,
        claim=f"Claim {position}",
        status="complete",
        materialized_path=f"/0/{position}",
    )
    db.add(node)
    db.flush()
    generation = Generation(
        node_id=node.id,
        model_id="author-model",
        role="pro",
        argument=argument,
        worker_id=worker.id,
        is_active=True,
    )
    db.add(generation)
    db.flush()
    node.active_generation_id = generation.id
    db.commit()
    return node


def _count_evidence_jobs(db, debate_id: str, node_id: str | None = None) -> int:
    query = select(func.count()).select_from(Job).where(
        Job.debate_id == debate_id, Job.job_type == "v2_evidence"
    )
    if node_id is not None:
        query = query.where(Job.node_id == node_id)
    return int(db.scalar(query) or 0)


# ---------------------------------------------------------------------------
# Contract (pure): validate_evidence_contract mirrors validate_pov_contract.
# ---------------------------------------------------------------------------


def _source(**overrides) -> dict:
    base = {
        "url": "https://example.org/study",
        "quote": "Renewable capacity grew by 40 percent over the study window.",
        "publisher": "Example Org",
        "date": "2023-05-01",
        "retrieval_query": "renewable capacity growth 2023",
        "stance": "supports",
    }
    base.update(overrides)
    return base


def _payload(sources: list[dict]) -> dict:
    return {
        "sources": sources,
        "provenance": {
            "model_id": "claude-sonnet-5-high-loop",
            "worker_id": "worker-1",
            "prompt_id": "prompt-1",
            "job_id": "job-1",
        },
    }


def test_contract_accepts_valid_sources_and_normalizes() -> None:
    validated = _service().validate_evidence_contract(_payload([_source(), _source(stance="refutes")]))
    assert len(validated["sources"]) == 2
    assert validated["sources"][0]["url"] == "https://example.org/study"
    assert validated["sources"][0]["stance"] == "supports"
    assert validated["sources"][1]["stance"] == "refutes"
    assert validated["provenance"]["job_id"] == "job-1"


def test_contract_accepts_empty_sources_as_honest_no_result() -> None:
    validated = _service().validate_evidence_contract(_payload([]))
    assert validated["sources"] == []


def test_contract_truncates_quote_to_max_length() -> None:
    long_quote = "x" * 900
    validated = _service().validate_evidence_contract(_payload([_source(quote=long_quote)]))
    assert 0 < len(validated["sources"][0]["quote"]) <= 300


def test_contract_keeps_iso_dates_and_nulls_non_iso() -> None:
    svc = _service()
    assert svc.validate_evidence_contract(_payload([_source(date="2023-05-01")]))["sources"][0]["date"] == "2023-05-01"
    assert (
        svc.validate_evidence_contract(_payload([_source(date="2023-05-01T12:30:00Z")]))["sources"][0]["date"]
        == "2023-05-01T12:30:00Z"
    )
    # Non-ISO free text and impossible dates become null, not junk metadata.
    assert svc.validate_evidence_contract(_payload([_source(date="last Tuesday")]))["sources"][0]["date"] is None
    assert svc.validate_evidence_contract(_payload([_source(date="05/01/2023")]))["sources"][0]["date"] is None
    assert svc.validate_evidence_contract(_payload([_source(date="2023-13-45")]))["sources"][0]["date"] is None
    assert svc.validate_evidence_contract(_payload([_source(date=None)]))["sources"][0]["date"] is None


@pytest.mark.parametrize(
    "payload",
    [
        "not a dict",
        {"provenance": {"model_id": "m", "worker_id": "w", "prompt_id": "p", "job_id": "j"}},  # no sources
        {"sources": "nope", "provenance": {"model_id": "m", "worker_id": "w", "prompt_id": "p", "job_id": "j"}},
    ],
)
def test_contract_rejects_structurally_malformed(payload) -> None:
    with pytest.raises(ValueError):
        _service().validate_evidence_contract(payload)


def test_contract_rejects_more_than_three_sources() -> None:
    with pytest.raises(ValueError):
        _service().validate_evidence_contract(_payload([_source() for _ in range(4)]))


def test_contract_rejects_missing_url() -> None:
    with pytest.raises(ValueError):
        _service().validate_evidence_contract(_payload([_source(url="")]))


def test_contract_rejects_non_http_url() -> None:
    with pytest.raises(ValueError):
        _service().validate_evidence_contract(_payload([_source(url="ftp://example.org/x")]))


def test_contract_rejects_bad_stance() -> None:
    with pytest.raises(ValueError):
        _service().validate_evidence_contract(_payload([_source(stance="winner")]))


def test_contract_rejects_missing_quote() -> None:
    with pytest.raises(ValueError):
        _service().validate_evidence_contract(_payload([_source(quote="")]))


def test_contract_rejects_missing_provenance() -> None:
    with pytest.raises(ValueError):
        _service().validate_evidence_contract({"sources": [_source()]})


# ---------------------------------------------------------------------------
# Eligibility + flag gate.
# ---------------------------------------------------------------------------


def test_eligible_empirical_claim_queues_job_when_flag_on(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_ACQUISITION", "true")
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_SEARCH_MODELS", "search-a")
    debate, root, _ = _debate_with_branch(db)
    node = _claim_node(db, debate, root, argument=EMPIRICAL_ARGUMENT)

    job = _service().maybe_queue_evidence_job(db, debate, node)
    db.commit()

    assert job is not None
    assert job.job_type == "v2_evidence"
    assert job.node_id == node.id
    assert job.required_model == "search-a"
    assert _count_evidence_jobs(db, debate.id) == 1


def test_eligible_causal_claim_queues_job(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_ACQUISITION", "true")
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_SEARCH_MODELS", "search-a")
    debate, root, _ = _debate_with_branch(db)
    node = _claim_node(db, debate, root, argument=CAUSAL_ARGUMENT)

    assert _service().maybe_queue_evidence_job(db, debate, node) is not None


def test_normative_claim_is_not_eligible(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_ACQUISITION", "true")
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_SEARCH_MODELS", "search-a")
    debate, root, _ = _debate_with_branch(db)
    node = _claim_node(db, debate, root, argument=NORMATIVE_ARGUMENT)

    assert _service().maybe_queue_evidence_job(db, debate, node) is None
    assert _count_evidence_jobs(db, debate.id) == 0


def test_flag_off_queues_nothing(db, monkeypatch) -> None:
    monkeypatch.delenv("DIALECTICAL_EVIDENCE_ACQUISITION", raising=False)
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_SEARCH_MODELS", "search-a")
    debate, root, _ = _debate_with_branch(db)
    node = _claim_node(db, debate, root, argument=EMPIRICAL_ARGUMENT)

    assert _service().maybe_queue_evidence_job(db, debate, node) is None
    assert _count_evidence_jobs(db, debate.id) == 0


# ---------------------------------------------------------------------------
# Budgets.
# ---------------------------------------------------------------------------


def test_per_node_budget_caps_jobs_for_one_node(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_ACQUISITION", "true")
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_SEARCH_MODELS", "search-a")
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_MAX_PER_NODE", "2")
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_MAX_PER_DEBATE", "100")
    debate, root, _ = _debate_with_branch(db)
    node = _claim_node(db, debate, root, argument=EMPIRICAL_ARGUMENT)

    results = [_service().maybe_queue_evidence_job(db, debate, node) for _ in range(3)]
    db.commit()

    assert sum(1 for r in results if r is not None) == 2
    assert results[2] is None
    assert _count_evidence_jobs(db, debate.id, node.id) == 2


def test_per_debate_budget_caps_total_jobs(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_ACQUISITION", "true")
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_SEARCH_MODELS", "search-a")
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_MAX_PER_NODE", "1")
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_MAX_PER_DEBATE", "3")
    debate, root, _ = _debate_with_branch(db)
    nodes = [
        _claim_node(db, debate, root, argument=EMPIRICAL_ARGUMENT, position=i) for i in range(5)
    ]

    for node in nodes:
        _service().maybe_queue_evidence_job(db, debate, node)
    db.commit()

    assert _count_evidence_jobs(db, debate.id) == 3


# ---------------------------------------------------------------------------
# Routing: round-robin over online search-capable models; offline -> pending;
# failover stays within the search set.
# ---------------------------------------------------------------------------


def test_jobs_round_robin_over_online_search_models(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_ACQUISITION", "true")
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_SEARCH_MODELS", "search-a,search-b")
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_MAX_PER_NODE", "100")
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_MAX_PER_DEBATE", "100")
    _online_worker(db, "loop-a", ["search-a"])
    _online_worker(db, "loop-b", ["search-b"])
    debate, root, _ = _debate_with_branch(db)
    node = _claim_node(db, debate, root, argument=EMPIRICAL_ARGUMENT)

    models = []
    for _ in range(4):
        job = _service().maybe_queue_evidence_job(db, debate, node)
        db.commit()
        models.append(job.required_model)

    assert models == ["search-a", "search-b", "search-a", "search-b"]


def test_all_search_models_offline_leaves_job_pending_without_reroute(db, monkeypatch) -> None:
    from app.services.orchestrator import make_deadline, reroute_unavailable_pending_jobs

    monkeypatch.setenv("DIALECTICAL_EVIDENCE_ACQUISITION", "true")
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_SEARCH_MODELS", "search-a,search-b")
    # A non-search model IS online -- reroute must not hijack the evidence job onto it.
    _online_worker(db, "gen-only", ["gpt-5.6sol-medium"])
    debate, root, _ = _debate_with_branch(db)
    node = _claim_node(db, debate, root, argument=EMPIRICAL_ARGUMENT)

    job = _service().maybe_queue_evidence_job(db, debate, node)
    db.commit()
    assert job is not None
    assert job.required_model == "search-a"
    assert job.status == "pending"

    # Force it past its deadline and run the reroute sweep: it must stay pinned
    # to the offline search model (evidence jobs never reroute to non-search).
    job.deadline = now_utc() - timedelta(hours=1)
    db.commit()
    reroute_unavailable_pending_jobs(db, now_utc())
    db.commit()
    db.refresh(job)
    assert job.required_model == "search-a"
    assert job.status == "pending"


def test_failover_stays_within_search_capable_set(db, monkeypatch) -> None:
    from app.services.orchestrator import next_failover_model

    monkeypatch.setenv("DIALECTICAL_MODEL_FAILOVER", "true")
    monkeypatch.setenv("DIALECTICAL_MULTI_MODEL_GENERATION", "true")
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_SEARCH_MODELS", "search-a,search-b")
    _online_worker(db, "loop-a", ["search-a"])
    _online_worker(db, "loop-b", ["search-b"])
    _online_worker(db, "gen-only", ["gpt-5.6sol-medium"])  # online but NOT search-capable
    debate, root, _ = _debate_with_branch(db)
    node = _claim_node(db, debate, root, argument=EMPIRICAL_ARGUMENT)

    job = Job(
        debate_id=debate.id,
        node_id=node.id,
        job_type="v2_evidence",
        required_role="v2_evidence",
        required_model="search-a",
        status="claimed",
        payload={"tried_models": ["search-a"]},
    )
    db.add(job)
    db.commit()

    candidate = next_failover_model(db, job)
    assert candidate == "search-b"  # the other SEARCH model, never gen-only


# ---------------------------------------------------------------------------
# Materialization + completion path.
# ---------------------------------------------------------------------------


def _evidence_payload(worker: Worker, job_id: str, count: int = 2) -> dict:
    return {
        "sources": [
            {
                "url": f"https://example.org/source-{i}",
                "quote": f"Verbatim source quote number {i} bearing on the claim.",
                "publisher": "Example Publisher",
                "date": "2023-05-01",
                "retrieval_query": "congestion pricing traffic reduction study",
                "stance": "supports" if i % 2 == 0 else "refutes",
            }
            for i in range(count)
        ],
        "provenance": {
            "model_id": "search-a",
            "worker_id": worker.id,
            "prompt_id": f"prompt-{job_id}",
            "job_id": job_id,
        },
    }


def test_completion_materializes_evidence_nodes_with_retrieval_metadata(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_ACQUISITION", "true")
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_SEARCH_MODELS", "search-a")
    service = _service()

    triggered: list[tuple[str, list[str]]] = []
    monkeypatch.setattr(
        service, "trigger_citation_resolution", lambda debate_id, node_ids: triggered.append((debate_id, list(node_ids)))
    )

    worker = _online_worker(db, "search-worker", ["search-a"])
    debate, root, _ = _debate_with_branch(db)
    node = _claim_node(db, debate, root, argument=EMPIRICAL_ARGUMENT)
    job = service.maybe_queue_evidence_job(db, debate, node)
    db.commit()

    claimed = claim_pending_job(db, worker)
    assert claimed is not None and claimed.id == job.id

    asyncio.run(complete_job(db, claimed, _evidence_payload(worker, claimed.id, count=2), {"latency_ms": 5}))

    evidence_children = db.scalars(
        select(Node).where(Node.parent_id == node.id, Node.node_type == "EVIDENCE")
    ).all()
    assert len(evidence_children) == 2
    for child in evidence_children:
        assert child.status == "complete"
        assert child.active_generation_id is not None
        meta = child.evidence_metadata
        assert meta["method"] == "retrieval"
        assert meta["url"].startswith("https://example.org/source-")
        assert meta["quote"].startswith("Verbatim source quote")
        assert meta["stance"] in {"supports", "refutes"}
        assert meta["retrieval_query"]
        assert meta["resolution_status"] == "pending"
        gen = db.get(Generation, child.active_generation_id)
        assert gen.model_id == "search-a"

    # Fire-and-forget citation resolution was triggered with the new node ids.
    assert len(triggered) == 1
    assert triggered[0][0] == debate.id
    assert set(triggered[0][1]) == {child.id for child in evidence_children}


# ---------------------------------------------------------------------------
# Controller addition (binding, Task 12): v2_evidence completion must fire
# the existing incremental scoring trigger (Task 8's
# trigger_internal_scoring_after_completion) so late-arriving evidence gets
# picked up by the NEXT scoring pass -> verification -> protocol re-analysis
# -> DF-QuAD evidence edges, without waiting on some other unrelated event
# to re-score the debate. Gated on the evidence-acquisition flag alone (the
# same flag that gates v2_evidence jobs existing at all), best-effort/
# fire-and-forget like the other trigger sites (v2_pov, v2_expand).
# ---------------------------------------------------------------------------


def test_evidence_completion_fires_internal_scoring_trigger_when_flag_on(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_ACQUISITION", "true")
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_SEARCH_MODELS", "search-a")
    service = _service()
    monkeypatch.setattr(service, "trigger_citation_resolution", lambda debate_id, node_ids: None)
    calls: list[str] = []
    monkeypatch.setattr(service, "trigger_internal_scoring_after_completion", lambda debate_id: calls.append(debate_id))

    worker = _online_worker(db, "search-worker", ["search-a"])
    debate, root, _ = _debate_with_branch(db)
    node = _claim_node(db, debate, root, argument=EMPIRICAL_ARGUMENT)
    job = service.maybe_queue_evidence_job(db, debate, node)
    db.commit()
    claimed = claim_pending_job(db, worker)

    asyncio.run(complete_job(db, claimed, _evidence_payload(worker, claimed.id, count=1), {"latency_ms": 5}))

    assert calls == [debate.id]


def test_evidence_completion_does_not_fire_internal_scoring_trigger_when_flag_off(db, monkeypatch) -> None:
    # The v2_evidence job itself can only exist because the flag was on at
    # queue time; flip it off before COMPLETION to prove the completion-site
    # gate is real (not merely inherited from "the job wouldn't exist").
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_ACQUISITION", "true")
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_SEARCH_MODELS", "search-a")
    service = _service()
    monkeypatch.setattr(service, "trigger_citation_resolution", lambda debate_id, node_ids: None)
    calls: list[str] = []
    monkeypatch.setattr(service, "trigger_internal_scoring_after_completion", lambda debate_id: calls.append(debate_id))

    worker = _online_worker(db, "search-worker", ["search-a"])
    debate, root, _ = _debate_with_branch(db)
    node = _claim_node(db, debate, root, argument=EMPIRICAL_ARGUMENT)
    job = service.maybe_queue_evidence_job(db, debate, node)
    db.commit()
    claimed = claim_pending_job(db, worker)

    monkeypatch.setenv("DIALECTICAL_EVIDENCE_ACQUISITION", "false")
    asyncio.run(complete_job(db, claimed, _evidence_payload(worker, claimed.id, count=1), {"latency_ms": 5}))

    assert calls == []


def test_completion_caps_materialized_nodes_at_three(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_ACQUISITION", "true")
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_SEARCH_MODELS", "search-a")
    service = _service()
    monkeypatch.setattr(service, "trigger_citation_resolution", lambda debate_id, node_ids: None)

    worker = _online_worker(db, "search-worker", ["search-a"])
    debate, root, _ = _debate_with_branch(db)
    node = _claim_node(db, debate, root, argument=EMPIRICAL_ARGUMENT)
    job = service.maybe_queue_evidence_job(db, debate, node)
    db.commit()
    claimed = claim_pending_job(db, worker)

    asyncio.run(complete_job(db, claimed, _evidence_payload(worker, claimed.id, count=3), {"latency_ms": 5}))

    evidence_children = db.scalars(
        select(Node).where(Node.parent_id == node.id, Node.node_type == "EVIDENCE")
    ).all()
    assert len(evidence_children) == 3
    # Retrieval evidence positions never collide with extractor evidence (1000+)
    # or argument children (0,1): they live in their own 2000+ namespace.
    positions = sorted(child.position for child in evidence_children)
    assert positions == [2000, 2001, 2002]


def test_malformed_completion_payload_raises_valueerror(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_ACQUISITION", "true")
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_SEARCH_MODELS", "search-a")
    service = _service()
    monkeypatch.setattr(service, "trigger_citation_resolution", lambda debate_id, node_ids: None)

    worker = _online_worker(db, "search-worker", ["search-a"])
    debate, root, _ = _debate_with_branch(db)
    node = _claim_node(db, debate, root, argument=EMPIRICAL_ARGUMENT)
    job = service.maybe_queue_evidence_job(db, debate, node)
    db.commit()
    claimed = claim_pending_job(db, worker)

    with pytest.raises(ValueError):
        asyncio.run(complete_job(db, claimed, {"garbage": True}, {"latency_ms": 5}))


# ---------------------------------------------------------------------------
# AUXILIARY terminal failure: never damages node/debate.
# ---------------------------------------------------------------------------


def test_terminal_evidence_failure_is_auxiliary(db, monkeypatch) -> None:
    from app.services.orchestrator import requeue_or_terminalize_timed_out_job

    monkeypatch.setenv("DIALECTICAL_EVIDENCE_SEARCH_MODELS", "search-a,search-b")
    debate, root, _ = _debate_with_branch(db)
    node = _claim_node(db, debate, root, argument=EMPIRICAL_ARGUMENT)

    job = Job(
        debate_id=debate.id,
        node_id=node.id,
        job_type="v2_evidence",
        required_role="v2_evidence",
        required_model="search-a",
        status="claimed",
        # Everyone tried -> failover finds no candidate -> terminal.
        payload={"tried_models": ["search-a", "search-b"]},
        attempts=8,
        timeout_attempts=8,
    )
    db.add(job)
    db.commit()

    events = requeue_or_terminalize_timed_out_job(db, job, "Job deadline expired")
    db.commit()
    db.refresh(job)
    db.refresh(node)
    db.refresh(debate)

    assert job.status == "failed"
    # Node and debate untouched -- auxiliary failure never damages the debate.
    assert node.status == "complete"
    assert debate.status == "generating"
    event_names = {name for _, name, _ in events}
    assert "debate_failed" not in event_names
    assert "node_failed" not in event_names
    # A ledger entry was written for the terminal transition.
    ledger = db.scalars(
        select(JobTransition).where(JobTransition.job_id == job.id, JobTransition.to_status == "failed")
    ).all()
    assert ledger, "terminal auxiliary failure must still record a job-ledger entry"


# ---------------------------------------------------------------------------
# End-to-end through materialize_pov_branch: flag gate + eligibility + budgets.
# ---------------------------------------------------------------------------


def test_pov_completion_queues_evidence_for_eligible_argument_nodes(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_ACQUISITION", "true")
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_SEARCH_MODELS", "search-a")
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_MAX_PER_DEBATE", "100")
    service = _service()
    monkeypatch.setattr(service, "trigger_citation_resolution", lambda debate_id, node_ids: None)

    worker = real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    job = claim_pending_job(db, worker)
    payload = worker_pov_output_with_extractable_evidence(worker, job.id, job.required_role)
    asyncio.run(complete_job(db, job, payload, {"latency_ms": 12}))

    # The evidence-bearing prose is empirical -> every argument node under the
    # branch is eligible, so evidence jobs were queued (target an argument node).
    evidence_jobs = db.scalars(select(Job).where(Job.debate_id == debate.id, Job.job_type == "v2_evidence")).all()
    assert evidence_jobs
    argument_node_ids = {
        n.id
        for n in db.scalars(
            select(Node).where(Node.debate_id == debate.id, Node.node_type.in_(["PRO", "CON"]))
        ).all()
    }
    assert all(j.node_id in argument_node_ids for j in evidence_jobs)


def test_pov_completion_queues_no_evidence_when_flag_off(db, monkeypatch) -> None:
    monkeypatch.delenv("DIALECTICAL_EVIDENCE_ACQUISITION", raising=False)
    service = _service()
    worker = real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    job = claim_pending_job(db, worker)
    payload = worker_pov_output_with_extractable_evidence(worker, job.id, job.required_role)
    asyncio.run(complete_job(db, job, payload, {"latency_ms": 12}))

    assert _count_evidence_jobs(db, debate.id) == 0


# ---------------------------------------------------------------------------
# Extractor nodes get method "model-claim" (companion to retrieval method).
# ---------------------------------------------------------------------------


def test_extractor_evidence_nodes_stamped_model_claim_method(db) -> None:
    from app.evidence.extraction import persist_evidence_nodes

    debate = Debate(topic="Does transit help?", status="generating")
    worker = Worker(id="w-extract", name="w", token_hash="h", capabilities=["m"])
    claim = Node(
        id="claim-extract",
        debate=debate,
        node_type="PRO",
        depth=1,
        position=0,
        claim="Transit helps.",
        status="complete",
        materialized_path="/0",
    )
    generation = Generation(
        id="gen-extract",
        node=claim,
        model_id="model-a",
        role="pro",
        argument="A 2023 study found that 40% of participants reported improved outcomes.",
        prompt_version="v1",
        worker_id="w-extract",
    )
    claim.active_generation_id = generation.id
    db.add_all([debate, worker, claim, generation])
    db.commit()

    nodes = persist_evidence_nodes(db, debate, claim, generation)
    assert nodes
    for node in nodes:
        assert node.evidence_metadata["method"] == "model-claim"
        assert node.evidence_metadata["evidenceKind"]  # existing classification preserved
