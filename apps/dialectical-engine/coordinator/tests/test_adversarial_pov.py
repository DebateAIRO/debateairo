"""P3.1: the adversarial POV pipeline (cross-model attacker).

Design under test (flag DIALECTICAL_ADVERSARIAL_POV, default OFF):
  - Flag OFF: the v2_pov contract, prompt, and materialization are byte-
    identical to the legacy self-play path (proposer authors the whole 7-card
    subtree; no attacker jobs).
  - Flag ON: the proposer writes ONLY the PRO side (lens card + strongest_pro +
    strongest_pro.pro = 3 cards). validate_pov_contract accepts that 3-card
    shape and REJECTS con-bearing / legacy 7-card payloads. On proposer
    materialization the completion tail queues TWO v2_expand CHALLENGE jobs
    from a DIFFERENT model family than the proposer:
      (a) against the lens claim -> materializes as the branch's top-level CON
          (position where strongest_con lives today),
      (b) against strongest_pro -> materializes as its CON child.
  - Completion semantics: the branch counts complete for synthesis quiescence
    only when proposer + both attacker jobs are terminal. Attacker terminal
    FAILURE degrades the branch honestly (the CON node is failed/absent, the
    debate is never failed) and the failure is listed in the synthesis failure
    manifest.
  - Interactions: evidence fires per materialized node (PRO at proposer time,
    CON at attacker time); the incremental scoring trigger fires after attacker
    materialization; a two-author branch (proposer PRO + attacker CON) round-
    trips through serialization with each node carrying its own author.
"""
from __future__ import annotations

import asyncio

import pytest
from sqlalchemy import select

from app.main import app  # noqa: F401 - warm the import cycle (import-order guard)
from app.models.entities import Debate, Generation, Job, Node, Worker, now_utc
from app.services import dialectical_v2 as service
from app.services.dialectical_v2 import (
    ADVERSARIAL_ATTACK_REASON,
    choose_adversarial_attacker_model,
    render_v2_job_prompt,
    validate_pov_contract,
)
from app.services.orchestrator import claim_pending_job, complete_job, fail_job
from app.services.serialization import debate_to_dict

FLAG = "DIALECTICAL_ADVERSARIAL_POV"
GPT = "gpt-5.6sol-medium"
CLAUDE = "claude-sonnet-5-high-loop"


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------


def worker(db, name: str, capabilities: list[str]) -> Worker:
    row = Worker(
        name=name,
        token_hash=f"test-token-{name}",
        capabilities=capabilities,
        last_seen=now_utc(),
        status="online",
    )
    db.add(row)
    db.commit()
    return row


def gpt_worker(db) -> Worker:
    return worker(db, "gpt-worker", [GPT])


def claude_worker(db) -> Worker:
    return worker(db, "claude-worker", [CLAUDE])


def legacy_pov_output(job: Job, worker_row: Worker) -> dict:
    """Full 7-card self-play payload (the pre-adversarial contract)."""
    pov = job.required_role
    return {
        "title": f"{pov} assessment",
        "content": f"A concise {pov} assessment based on the strongest reasoning.",
        "strongest_pro": {
            "title": f"{pov} strongest pro",
            "content": f"The strongest {pov} pro relies on the clearest evidence.",
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


def proposer_pov_output(job: Job, worker_row: Worker) -> dict:
    """3-card proposer payload (adversarial contract): PRO side only."""
    pov = job.required_role
    return {
        "title": f"{pov} assessment",
        "content": f"A concise {pov} assessment based on the strongest reasoning.",
        "strongest_pro": {
            "title": f"{pov} strongest pro",
            "content": f"The strongest {pov} pro relies on the clearest evidence.",
            "pro": {"title": f"{pov} pro support", "content": f"Detail strengthening the {pov} pro."},
        },
        "provenance": {
            "model_id": job.required_model,
            "worker_id": worker_row.id,
            "prompt_id": f"prompt-{job.id}",
            "job_id": job.id,
        },
    }


def attacker_result(job: Job, worker_row: Worker) -> dict:
    """The single {title, content} card a v2_expand attacker produces."""
    return {
        "title": "Decision-changing objection",
        "content": "The strongest objection that would change the decision if it holds.",
        "provenance": {
            "model_id": job.required_model,
            "worker_id": worker_row.id,
            "prompt_id": f"prompt-{job.id}",
            "job_id": job.id,
        },
    }


def make_debate(db) -> Debate:
    return service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})


def first_pov_container(db, debate: Debate) -> Node:
    node = db.scalar(
        select(Node).where(
            Node.debate_id == debate.id,
            Node.parent_id == debate.root_node_id,
            Node.position == 0,
        )
    )
    assert node is not None
    return node


def argument_children(db, parent_id: str) -> list[Node]:
    return list(
        db.scalars(
            select(Node)
            .where(Node.parent_id == parent_id, Node.node_type != "EVIDENCE")
            .order_by(Node.position)
        ).all()
    )


def expand_jobs(db, debate: Debate) -> list[Job]:
    return list(
        db.scalars(
            select(Job)
            .where(Job.debate_id == debate.id, Job.job_type == "v2_expand")
            .order_by(Job.created_at, Job.id)
        ).all()
    )


def synth_jobs(db, debate: Debate) -> list[Job]:
    return list(
        db.scalars(select(Job).where(Job.debate_id == debate.id, Job.job_type == "v2_synthesize")).all()
    )


def complete_one_pending_pov(db, worker_row: Worker, output_fn) -> Job:
    job = claim_pending_job(db, worker_row)
    assert job is not None and job.job_type == "v2_pov"
    asyncio.run(complete_job(db, job, output_fn(job, worker_row), {"latency_ms": 5}))
    return job


def drain_generation(db, workers: list[Worker], *, pov_fn) -> None:
    """Complete every pending v2_pov (via pov_fn) and v2_expand (attacker) job
    across the given workers. Synthesis is queued only after all generation is
    terminal (claim is oldest-first, so no synthesize job is ever pending while
    a generation job still is), so this drains generation and stops cleanly."""
    while True:
        pending_generation = db.scalar(
            select(Job.id)
            .where(Job.job_type.in_(("v2_pov", "v2_expand")), Job.status == "pending")
            .limit(1)
        )
        if pending_generation is None:
            break
        progressed = False
        for w in workers:
            job = claim_pending_job(db, w)
            if job is None:
                continue
            if job.job_type == "v2_pov":
                asyncio.run(complete_job(db, job, pov_fn(job, w), {"latency_ms": 5}))
                progressed = True
                break
            if job.job_type == "v2_expand":
                asyncio.run(complete_job(db, job, attacker_result(job, w), {"latency_ms": 5}))
                progressed = True
                break
        if not progressed:
            break


# ---------------------------------------------------------------------------
# Flag OFF regression
# ---------------------------------------------------------------------------


def test_flag_off_accepts_legacy_7_card_contract(db) -> None:
    job = Job(id="j1", debate_id="d1", job_type="v2_pov", required_role="Utilitarian", required_model=GPT)
    w = Worker(id="w1", name="x", token_hash="t", capabilities=[GPT])
    out = legacy_pov_output(job, w)
    validated = validate_pov_contract(out)
    assert validated["strongest_con"]["title"] == "Utilitarian strongest con"
    assert validated["strongest_pro"]["con"]["title"] == "Utilitarian pro limitation"


def test_flag_off_materializes_full_subtree_and_no_attackers(db) -> None:
    w = gpt_worker(db)
    debate = make_debate(db)
    complete_one_pending_pov(db, w, legacy_pov_output)
    container = first_pov_container(db, debate)
    kids = argument_children(db, container.id)
    assert [(n.node_type, n.position) for n in kids] == [("PRO", 0), ("CON", 1)]
    # No attacker jobs queued when the flag is off.
    assert expand_jobs(db, debate) == []


def test_flag_off_pov_prompt_contains_con_contract(db) -> None:
    w = gpt_worker(db)
    debate = make_debate(db)
    job = db.scalar(select(Job).where(Job.debate_id == debate.id, Job.job_type == "v2_pov"))
    _system, user = render_v2_job_prompt(db, job)
    assert "strongest_con" in user
    assert "one strongest Pro and one strongest Con" in user


# ---------------------------------------------------------------------------
# Flag ON — proposer contract
# ---------------------------------------------------------------------------


def test_flag_on_accepts_3_card_proposer_contract(db, monkeypatch) -> None:
    monkeypatch.setenv(FLAG, "true")
    job = Job(id="j1", debate_id="d1", job_type="v2_pov", required_role="Utilitarian", required_model=GPT)
    w = Worker(id="w1", name="x", token_hash="t", capabilities=[GPT])
    validated = validate_pov_contract(proposer_pov_output(job, w))
    assert "strongest_con" not in validated
    assert "con" not in validated["strongest_pro"]
    assert validated["strongest_pro"]["pro"]["title"] == "Utilitarian pro support"
    assert validated["title"] == "Utilitarian assessment"


def test_flag_on_rejects_legacy_7_card_payload(db, monkeypatch) -> None:
    monkeypatch.setenv(FLAG, "true")
    job = Job(id="j1", debate_id="d1", job_type="v2_pov", required_role="Utilitarian", required_model=GPT)
    w = Worker(id="w1", name="x", token_hash="t", capabilities=[GPT])
    with pytest.raises(ValueError):
        validate_pov_contract(legacy_pov_output(job, w))


def test_flag_on_rejects_con_bearing_strongest_pro(db, monkeypatch) -> None:
    monkeypatch.setenv(FLAG, "true")
    job = Job(id="j1", debate_id="d1", job_type="v2_pov", required_role="Utilitarian", required_model=GPT)
    w = Worker(id="w1", name="x", token_hash="t", capabilities=[GPT])
    payload = proposer_pov_output(job, w)
    payload["strongest_pro"]["con"] = {"title": "sneaky con", "content": "the proposer should not write this"}
    with pytest.raises(ValueError):
        validate_pov_contract(payload)


def test_flag_on_proposer_prompt_omits_con_cards(db, monkeypatch) -> None:
    monkeypatch.setenv(FLAG, "true")
    w = gpt_worker(db)
    debate = make_debate(db)
    job = db.scalar(select(Job).where(Job.debate_id == debate.id, Job.job_type == "v2_pov"))
    _system, user = render_v2_job_prompt(db, job)
    assert "strongest_con" not in user
    assert "Do not" in user or "Do NOT" in user  # explicit no-con instruction


# ---------------------------------------------------------------------------
# Flag ON — attacker model selection
# ---------------------------------------------------------------------------


def test_choose_attacker_prefers_different_family(db) -> None:
    gpt_worker(db)
    claude_worker(db)
    model, reason = choose_adversarial_attacker_model(db, GPT)
    assert model == CLAUDE
    assert reason == "cross_family"


def test_choose_attacker_same_family_fallback_when_pool_single_family(db) -> None:
    gpt_worker(db)
    model, reason = choose_adversarial_attacker_model(db, GPT)
    assert model == GPT
    assert reason == "same_family_fallback_single_family_pool"


# ---------------------------------------------------------------------------
# Flag ON — materialization + attacker queueing
# ---------------------------------------------------------------------------


def test_proposer_materializes_pro_side_and_queues_two_attackers(db, monkeypatch) -> None:
    monkeypatch.setenv(FLAG, "true")
    w = gpt_worker(db)
    debate = make_debate(db)
    completed = complete_one_pending_pov(db, w, proposer_pov_output)
    container = db.get(Node, completed.node_id)

    # Proposer wrote the PRO side (complete); the attacker CON placeholder
    # already exists (pending) at the legacy strongest_con position.
    kids = argument_children(db, container.id)
    assert [(n.node_type, n.position, n.status) for n in kids] == [
        ("PRO", 0, "complete"),
        ("CON", 1, "pending"),
    ]
    strongest_pro = kids[0]
    pro_kids = argument_children(db, strongest_pro.id)
    assert [(n.node_type, n.position, n.status) for n in pro_kids] == [
        ("PRO", 0, "complete"),
        ("CON", 1, "pending"),
    ]

    # Exactly two attacker jobs, both CON challenges, targeting the container
    # and strongest_pro, carrying the adversarial reason + payload markers.
    jobs = expand_jobs(db, debate)
    assert len(jobs) == 2
    targets = {}
    for job in jobs:
        assert job.job_type == "v2_expand"
        assert job.payload["reason"] == ADVERSARIAL_ATTACK_REASON
        assert job.payload["polarity"] == "CON"
        assert job.payload["adversarial_pov"] is True
        child = db.get(Node, job.node_id)
        assert child.node_type == "CON"
        targets[job.payload["adversarial_target"]] = child

    assert set(targets) == {"lens_claim", "strongest_pro"}
    # (a) lens-claim attack -> top-level CON at position 1 under the container.
    assert targets["lens_claim"].parent_id == container.id
    assert targets["lens_claim"].position == 1
    # (b) strongest_pro attack -> CON child at position 1 under strongest_pro.
    assert targets["strongest_pro"].parent_id == strongest_pro.id
    assert targets["strongest_pro"].position == 1


def test_attacker_jobs_pinned_to_different_family(db, monkeypatch) -> None:
    monkeypatch.setenv(FLAG, "true")
    g = gpt_worker(db)
    claude_worker(db)
    debate = make_debate(db)
    # Complete a gpt-pinned proposer; its attackers must be cross-family (claude).
    job = claim_pending_job(db, g)
    assert job is not None and job.required_model == GPT
    asyncio.run(complete_job(db, job, proposer_pov_output(job, g), {"latency_ms": 5}))
    jobs = [j for j in expand_jobs(db, debate) if j.payload.get("parent_node_id")]
    assert jobs
    for j in jobs:
        assert j.required_model == CLAUDE
        assert j.payload["adversarial_attacker_reason"] == "cross_family"


def test_attacker_same_family_fallback_recorded(db, monkeypatch) -> None:
    monkeypatch.setenv(FLAG, "true")
    g = gpt_worker(db)
    debate = make_debate(db)
    job = complete_one_pending_pov(db, g, proposer_pov_output)  # noqa: F841
    jobs = expand_jobs(db, debate)
    assert jobs
    for j in jobs:
        assert j.required_model == GPT
        assert j.payload["adversarial_attacker_reason"] == "same_family_fallback_single_family_pool"


def test_attacker_completion_materializes_con_at_legacy_positions(db, monkeypatch) -> None:
    monkeypatch.setenv(FLAG, "true")
    g = gpt_worker(db)
    debate = make_debate(db)
    # All proposers first (claim is oldest-first, so proposers precede
    # attackers), then capture the first branch and complete every attacker.
    drain_pov_only(db, g)
    container = first_pov_container(db, debate)
    strongest_pro = argument_children(db, container.id)[0]
    drain_generation(db, [g], pov_fn=proposer_pov_output)

    container_kids = argument_children(db, container.id)
    assert [(n.node_type, n.position, n.status) for n in container_kids] == [
        ("PRO", 0, "complete"),
        ("CON", 1, "complete"),
    ]
    pro_kids = argument_children(db, strongest_pro.id)
    assert [(n.node_type, n.position, n.status) for n in pro_kids] == [
        ("PRO", 0, "complete"),
        ("CON", 1, "complete"),
    ]


# ---------------------------------------------------------------------------
# Flag ON — completion semantics (synthesis quiescence)
# ---------------------------------------------------------------------------


def test_synthesis_waits_for_attacker_jobs(db, monkeypatch) -> None:
    monkeypatch.setenv(FLAG, "true")
    g = gpt_worker(db)
    debate = make_debate(db)
    # Complete every proposer. Each queues two attacker jobs -> synthesis must
    # NOT be queued while any attacker job is still outstanding.
    drain_pov_only(db, g)
    assert synth_jobs(db, debate) == []
    outstanding = expand_jobs(db, debate)
    assert len(outstanding) == 2 * pov_count(db, debate)
    assert all(j.status == "pending" for j in outstanding)

    # Complete every attacker; only then does synthesis become queued.
    drain_generation(db, [g], pov_fn=proposer_pov_output)
    queued = synth_jobs(db, debate)
    assert len(queued) == 1 and queued[0].status == "pending"


def test_attacker_terminal_failure_degrades_branch_and_lists_manifest(db, monkeypatch) -> None:
    monkeypatch.setenv(FLAG, "true")
    monkeypatch.setenv("DIALECTICAL_MAX_JOB_ATTEMPTS", "1")
    g = gpt_worker(db)
    debate = make_debate(db)
    drain_pov_only(db, g)  # all proposers done; only attacker jobs remain pending

    # Fail one attacker terminally (single-attempt budget -> immediate terminal).
    job = claim_pending_job(db, g)
    assert job is not None and job.job_type == "v2_expand"
    failed_child_id = job.node_id
    asyncio.run(fail_job(db, job, "poisoned attack", True))

    db.refresh(job)
    assert job.status == "failed"
    failed_child = db.get(Node, failed_child_id)
    assert failed_child.status == "failed"
    assert failed_child.stopping_reason == "generation_exhausted"
    # The debate is never failed by an attacker's death.
    db.refresh(debate)
    assert debate.status != "failed"

    manifest = service._synthesis_failure_manifest(db, debate)
    attacker_failures = manifest.get("attacker_failures") or []
    assert any(entry["node_id"] == failed_child_id for entry in attacker_failures)
    entry = next(entry for entry in attacker_failures if entry["node_id"] == failed_child_id)
    assert entry["stopping_reason"] == "generation_exhausted"
    assert entry["target"] in {"lens_claim", "strongest_pro"}


# ---------------------------------------------------------------------------
# Flag ON — scoring trigger after attacker materialization
# ---------------------------------------------------------------------------


def test_scoring_trigger_fires_after_attacker_materialization(db, monkeypatch) -> None:
    monkeypatch.setenv(FLAG, "true")
    monkeypatch.setenv("DIALECTICAL_SCORE_BEFORE_SYNTHESIS", "true")
    calls: list[str] = []
    monkeypatch.setattr(
        "app.services.dialectical_v2.trigger_internal_scoring_after_completion",
        lambda debate_id: calls.append(debate_id),
    )
    g = gpt_worker(db)
    debate = make_debate(db)
    drain_pov_only(db, g)  # all proposers done; only attacker jobs remain pending
    calls.clear()  # ignore the proposer-branch triggers; assert the attacker one

    job = claim_pending_job(db, g)
    assert job is not None and job.job_type == "v2_expand"
    asyncio.run(complete_job(db, job, attacker_result(job, g), {"latency_ms": 5}))
    assert debate.id in calls


def test_scoring_trigger_absent_when_flag_off_on_expand(db, monkeypatch) -> None:
    # An ordinary (non-adversarial) v2_expand completion does not fire the
    # score-before-synthesis trigger — the adaptive path owns its own trigger.
    monkeypatch.setenv("DIALECTICAL_SCORE_BEFORE_SYNTHESIS", "true")
    calls: list[str] = []
    monkeypatch.setattr(
        "app.services.dialectical_v2.trigger_internal_scoring_after_completion",
        lambda debate_id: calls.append(debate_id),
    )
    g = gpt_worker(db)
    debate = make_debate(db)
    # All legacy proposers first (flag off -> no attacker jobs), then a manual
    # (non-adversarial) expand whose completion must NOT fire the trigger.
    while True:
        pending = db.scalar(
            select(Job.id).where(Job.job_type == "v2_pov", Job.status == "pending").limit(1)
        )
        if pending is None:
            break
        job = claim_pending_job(db, g)
        assert job is not None and job.job_type == "v2_pov"
        asyncio.run(complete_job(db, job, legacy_pov_output(job, g), {"latency_ms": 5}))
    container = first_pov_container(db, debate)
    pro = argument_children(db, container.id)[0]
    service.queue_v2_expand_job(db, debate, pro, "PRO", "Manual expansion coverage.")
    calls.clear()
    job = claim_pending_job(db, g)
    assert job is not None and job.job_type == "v2_expand"
    asyncio.run(complete_job(db, job, attacker_result(job, g), {"latency_ms": 5}))
    assert debate.id not in calls


# ---------------------------------------------------------------------------
# Flag ON — two-author serialization round-trip
# ---------------------------------------------------------------------------


def test_two_author_branch_serialization_roundtrips(db, monkeypatch) -> None:
    monkeypatch.setenv(FLAG, "true")
    g = gpt_worker(db)
    c = claude_worker(db)
    debate = make_debate(db)
    # Drain all generation. The anchor-first pool [gpt, claude] round-robins the
    # POV proposers, so container 0 is gpt-authored and its cross-family
    # attackers are claude.
    drain_generation(db, [g, c], pov_fn=proposer_pov_output)
    container = first_pov_container(db, debate)

    payload = debate_to_dict(db, debate)
    # Debate-level model set carries BOTH authors (no one-model-per-branch
    # assumption collapses them).
    assert GPT in payload["models"]
    assert CLAUDE in payload["models"]

    # Each node carries its own author: the proposer's PRO -> gpt, the
    # attacker's CON -> claude, in the same branch.
    con = db.scalar(select(Node).where(Node.parent_id == container.id, Node.node_type == "CON"))
    pro = db.scalar(select(Node).where(Node.parent_id == container.id, Node.node_type == "PRO"))
    pro_gen = db.get(Generation, pro.active_generation_id)
    con_gen = db.get(Generation, con.active_generation_id)
    assert pro_gen.model_id == GPT
    assert con_gen.model_id == CLAUDE


# ---------------------------------------------------------------------------
# Small local helpers used above
# ---------------------------------------------------------------------------


def pov_count(db, debate: Debate) -> int:
    return int(
        db.scalar(
            select(service.func.count()).select_from(Job).where(
                Job.debate_id == debate.id, Job.job_type == "v2_pov"
            )
        )
        or 0
    )


def drain_pov_only(db, worker_row: Worker) -> None:
    while True:
        has_pending = (
            db.scalar(
                select(Job.id)
                .where(Job.debate_id.is_not(None), Job.job_type == "v2_pov", Job.status == "pending")
                .limit(1)
            )
            is not None
        )
        if not has_pending:
            break
        job = claim_pending_job(db, worker_row)
        if job is None or job.job_type != "v2_pov":
            break
        asyncio.run(complete_job(db, job, proposer_pov_output(job, worker_row), {"latency_ms": 5}))
