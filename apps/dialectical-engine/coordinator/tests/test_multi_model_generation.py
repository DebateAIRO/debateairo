"""Multi-model collaboration for v2 generation (DIALECTICAL_MULTI_MODEL_GENERATION).

Design under test:
  - v2_generation_model_pool: the codex anchor model first (creation stays
    readiness-gated on it), then every other routing-allowed model advertised
    by an online real worker, sorted for determinism. Mock/deterministic
    workers and mock-looking model ids never enter the pool.
  - POV jobs round-robin across the pool, so all working models argue the
    debate instead of a single provider debating itself.
  - v2_synthesize stays pinned to the anchor model regardless of which model
    completed last (integration needs the strongest configured model, and the
    queue site must not inherit the completing job's model).
  - Expansions prefer a challenger: a model different from the node author,
    drawn from the pool (falls back to the author when the pool has no
    alternative).
  - Flag off -> pool is exactly [anchor]; single-worker deployments behave
    byte-identically with the flag on (pool of one).
"""
from __future__ import annotations

import asyncio

from sqlalchemy import select

from app.exploration.expansion_dispatch import _expansion_model_for
from app.models.entities import Debate, Job, Node, Worker, now_utc
from app.services import dialectical_v2 as service
from app.services.dialectical_v2 import V2_CODEX_MODEL_ID, v2_generation_model_pool
from app.services.orchestrator import claim_pending_job, complete_job

FLAG = "DIALECTICAL_MULTI_MODEL_GENERATION"

CLAUDE = "claude-sonnet-5-high-loop"
GEMINI = "gemini-3.5-flash-loop"


def worker(db, name: str, capabilities: list[str]) -> Worker:
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


def pov_job_models(db, debate: Debate) -> list[str]:
    return [
        job.required_model
        for job in db.scalars(
            select(Job)
            .where(Job.debate_id == debate.id, Job.job_type == "v2_pov")
            .order_by(Job.created_at)
        ).all()
    ]


def pov_output(worker_row: Worker, job: Job) -> dict:
    pov = job.required_role
    return {
        "title": f"{pov} assessment",
        "content": f"A concise {pov} assessment based on the strongest available reasoning.",
        "strongest_pro": {
            "title": f"{pov} strongest pro",
            "content": f"The strongest {pov} pro relies on the clearest relevant evidence.",
            "pro": {"title": f"{pov} pro support", "content": f"Detail strengthening the {pov} pro."},
            "con": {"title": f"{pov} pro limitation", "content": f"Detail limiting the {pov} pro."},
        },
        "strongest_con": {
            "title": f"{pov} strongest con",
            "content": f"The strongest {pov} con identifies the most important risk.",
            "pro": {"title": f"{pov} con support", "content": f"Detail strengthening the {pov} con."},
            "con": {"title": f"{pov} con limitation", "content": f"Detail limiting the {pov} con."},
        },
        "provenance": {
            "model_id": job.required_model,
            "worker_id": worker_row.id,
            "prompt_id": f"prompt-{job.id}",
            "job_id": job.id,
        },
    }


# ---------------------------------------------------------------------------
# Pool derivation
# ---------------------------------------------------------------------------


def test_pool_is_anchor_only_with_a_single_codex_worker(db) -> None:
    worker(db, "codex-worker", [V2_CODEX_MODEL_ID])
    assert v2_generation_model_pool(db) == [V2_CODEX_MODEL_ID]


def test_pool_collects_all_online_real_worker_models_anchor_first(db) -> None:
    worker(db, "codex-worker", [V2_CODEX_MODEL_ID])
    worker(db, "gemini-loop", [GEMINI])
    worker(db, "claude-loop", [CLAUDE])
    assert v2_generation_model_pool(db) == [V2_CODEX_MODEL_ID, CLAUDE, GEMINI]


def test_pool_excludes_mock_workers_and_mock_model_ids(db) -> None:
    worker(db, "codex-worker", [V2_CODEX_MODEL_ID, "mock-local"])
    worker(db, "mock-claude", [CLAUDE])  # mock worker name -> excluded entirely
    assert v2_generation_model_pool(db) == [V2_CODEX_MODEL_ID]


def test_pool_respects_flag_off(db, monkeypatch) -> None:
    monkeypatch.setenv(FLAG, "false")
    worker(db, "codex-worker", [V2_CODEX_MODEL_ID])
    worker(db, "claude-loop", [CLAUDE])
    assert v2_generation_model_pool(db) == [V2_CODEX_MODEL_ID]


# ---------------------------------------------------------------------------
# POV assignment round-robins across the pool
# ---------------------------------------------------------------------------


def test_pov_jobs_round_robin_across_the_pool(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_DYNAMIC_PERSPECTIVES", "true")
    worker(db, "codex-worker", [V2_CODEX_MODEL_ID])
    worker(db, "claude-loop", [CLAUDE])
    worker(db, "gemini-loop", [GEMINI])

    # Normative topic -> 5 composed lenses (family + Practical anchor).
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})

    assert pov_job_models(db, debate) == [V2_CODEX_MODEL_ID, CLAUDE, GEMINI, V2_CODEX_MODEL_ID, CLAUDE]


def test_single_worker_deployment_is_unchanged_with_flag_on(db) -> None:
    worker(db, "codex-worker", [V2_CODEX_MODEL_ID])

    debate = service.create_dialectical_debate(db, "Does social media use cause depression?", {})

    assert set(pov_job_models(db, debate)) == {V2_CODEX_MODEL_ID}


# ---------------------------------------------------------------------------
# Synthesis stays pinned to the anchor model
# ---------------------------------------------------------------------------


def test_synthesis_job_is_pinned_to_anchor_even_when_another_model_finishes_last(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_DYNAMIC_PERSPECTIVES", "false")
    codex = worker(db, "codex-worker", [V2_CODEX_MODEL_ID])
    claude = worker(db, "claude-loop", [CLAUDE])

    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    assert sorted(set(pov_job_models(db, debate))) == sorted({V2_CODEX_MODEL_ID, CLAUDE})

    # Drain codex-assigned POVs first so a CLAUDE completion is the one that
    # closes the tree and queues synthesis.
    for worker_row in (codex, codex, codex, claude, claude):
        job = claim_pending_job(db, worker_row)
        if job is None:
            continue
        assert job.job_type == "v2_pov"
        asyncio.run(complete_job(db, job, pov_output(worker_row, job), {"latency_ms": 5}))

    synthesis = db.scalar(
        select(Job).where(Job.debate_id == debate.id, Job.job_type == "v2_synthesize")
    )
    assert synthesis is not None
    assert synthesis.required_model == V2_CODEX_MODEL_ID


# ---------------------------------------------------------------------------
# Expansions prefer a challenger model
# ---------------------------------------------------------------------------


def test_expansion_prefers_a_model_other_than_the_node_author(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_DYNAMIC_PERSPECTIVES", "false")
    codex = worker(db, "codex-worker", [V2_CODEX_MODEL_ID])
    worker(db, "claude-loop", [CLAUDE])

    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    # Complete one codex-assigned POV so its PRO child exists (author: codex).
    job = claim_pending_job(db, codex)
    assert job is not None and job.required_model == V2_CODEX_MODEL_ID
    asyncio.run(complete_job(db, job, pov_output(codex, job), {"latency_ms": 5}))

    container = db.scalar(
        select(Node).where(Node.debate_id == debate.id, Node.parent_id == debate.root_node_id, Node.status == "complete")
    )
    pro = db.scalar(select(Node).where(Node.parent_id == container.id, Node.node_type == "PRO"))
    assert pro is not None and pro.active_generation_id is not None

    assert _expansion_model_for(db, pro) == CLAUDE


def test_expansion_falls_back_to_author_when_pool_has_no_alternative(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_DYNAMIC_PERSPECTIVES", "false")
    codex = worker(db, "codex-worker", [V2_CODEX_MODEL_ID])

    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    job = claim_pending_job(db, codex)
    asyncio.run(complete_job(db, job, pov_output(codex, job), {"latency_ms": 5}))

    container = db.scalar(
        select(Node).where(Node.debate_id == debate.id, Node.parent_id == debate.root_node_id, Node.status == "complete")
    )
    pro = db.scalar(select(Node).where(Node.parent_id == container.id, Node.node_type == "PRO"))

    assert _expansion_model_for(db, pro) == V2_CODEX_MODEL_ID
