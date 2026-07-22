"""Final-branch-review item 3: DIALECTICAL_ADVERSARIAL_POV and
DIALECTICAL_CROSS_EXAM enabled TOGETHER on the same debate.

Both features queue v2_expand CON children against the SAME kind of target
(an unscored branch's strongest_pro node): Task 14's adversarial attacker
does it at proposer-completion time, Task 15's cross-exam wave does it once
the tree is otherwise quiescent -- and both share queue_v2_expand_job's
next-free-slot position allocation and the single queue_v2_synthesize_job
seam (which itself dedupes via `existing_synthesis` and runs the wave INSIDE
that seam, before ever falling through to a real v2_synthesize job). The
individual flags are covered end-to-end by test_adversarial_pov.py and
test_cross_exam_wave.py; this is deliberately the ONE test proving the
combination is safe -- flagged by the whole-branch review as "structurally
reasoned but untested" ahead of flip-plan step 5.

Self-contained (mirrors test_cross_exam_wave.py's own stated preference for
per-file pipeline helpers over cross-importing another test file's, since
the shapes needed here differ from either single-flag file).
"""
from __future__ import annotations

import asyncio

from sqlalchemy import select

from app.models.entities import Debate, Job, Node, Worker, now_utc
from app.services import dialectical_v2 as service
from app.services.orchestrator import claim_pending_job, complete_job

ADVERSARIAL_FLAG = "DIALECTICAL_ADVERSARIAL_POV"
CROSS_EXAM_FLAG = "DIALECTICAL_CROSS_EXAM"
GPT = "gpt-5.6sol-medium"
TOPIC = "Should cities ban cars downtown?"


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------


def gpt_worker(db) -> Worker:
    row = Worker(
        name="gpt-worker",
        token_hash="test-token-gpt-worker",
        capabilities=[GPT],
        last_seen=now_utc(),
        status="online",
    )
    db.add(row)
    db.commit()
    return row


def make_two_branch_debate(db) -> Debate:
    """A debate with exactly 2 POV branches instead of the legacy quartet --
    the combination under test needs multiple branches (to prove no
    cross-branch position/target mixups) but not all 4; truncating
    POV_BRANCHES keeps the drive-to-completion below cheap and readable.
    Dynamic perspectives stay off (tests/conftest.py's own default), so
    create_dialectical_debate's `else: perspectives = list(POV_BRANCHES)`
    path is exactly what's exercised."""
    return service.create_dialectical_debate(db, TOPIC, {})


def branch_containers(db, debate: Debate) -> list[Node]:
    return list(
        db.scalars(
            select(Node)
            .where(
                Node.debate_id == debate.id,
                Node.parent_id == debate.root_node_id,
                Node.node_type != "EVIDENCE",
            )
            .order_by(Node.position.asc())
        ).all()
    )


def argument_children(db, parent_id: str) -> list[Node]:
    return list(
        db.scalars(
            select(Node)
            .where(Node.parent_id == parent_id, Node.node_type != "EVIDENCE")
            .order_by(Node.position)
        ).all()
    )


def all_expand_jobs(db, debate: Debate) -> list[Job]:
    return list(
        db.scalars(
            select(Job)
            .where(Job.debate_id == debate.id, Job.job_type == "v2_expand")
            .order_by(Job.created_at, Job.id)
        ).all()
    )


def attacker_jobs(db, debate: Debate) -> list[Job]:
    return [j for j in all_expand_jobs(db, debate) if isinstance(j.payload, dict) and j.payload.get("adversarial_pov") is True]


def wave_jobs(db, debate: Debate) -> list[Job]:
    return [j for j in all_expand_jobs(db, debate) if isinstance(j.payload, dict) and j.payload.get("cross_exam") is True]


def synth_jobs(db, debate: Debate) -> list[Job]:
    return list(db.scalars(select(Job).where(Job.debate_id == debate.id, Job.job_type == "v2_synthesize")).all())


def proposer_pov_output(job: Job, worker_row: Worker) -> dict:
    """3-card proposer payload (adversarial contract): PRO side only --
    identical shape to test_adversarial_pov.py's own fixture."""
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


def expand_output(job: Job, worker_row: Worker) -> dict:
    """The single {title, content} card v2_expand jobs produce, shared by
    adversarial attacker and cross-exam wave completions alike."""
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


def drain_pov_only(db, worker_row: Worker) -> None:
    while True:
        pending = db.scalar(select(Job.id).where(Job.job_type == "v2_pov", Job.status == "pending").limit(1))
        if pending is None:
            break
        job = claim_pending_job(db, worker_row)
        if job is None or job.job_type != "v2_pov":
            break
        asyncio.run(complete_job(db, job, proposer_pov_output(job, worker_row), {"latency_ms": 5}))


def complete_n_pending_v2_expand(db, worker_row: Worker, count: int) -> list[Job]:
    """Claim + complete exactly `count` CURRENTLY-pending v2_expand jobs, one
    at a time (attacker and wave completions share the same {title, content,
    provenance} contract). Used to get a clean checkpoint between draining
    the 4 adversarial attacker jobs and draining the 2 wave jobs the last
    attacker completion spawns -- both are job_type=="v2_expand", so a
    naive "drain everything pending" loop would silently run both phases
    together and hide the intermediate state this test needs to inspect."""
    completed: list[Job] = []
    for _ in range(count):
        job = claim_pending_job(db, worker_row)
        assert job is not None and job.job_type == "v2_expand"
        asyncio.run(complete_job(db, job, expand_output(job, worker_row), {"latency_ms": 5}))
        completed.append(job)
    return completed


# ---------------------------------------------------------------------------
# The combined test.
# ---------------------------------------------------------------------------


def test_adversarial_attackers_and_cross_exam_wave_combine_without_collision(db, monkeypatch) -> None:
    monkeypatch.setenv(ADVERSARIAL_FLAG, "true")
    monkeypatch.setenv(CROSS_EXAM_FLAG, "true")
    monkeypatch.setattr(service, "POV_BRANCHES", service.POV_BRANCHES[:2])
    g = gpt_worker(db)
    debate = make_two_branch_debate(db)

    containers = branch_containers(db, debate)
    assert len(containers) == 2

    # --- Phase 1: drain the 2 proposer (v2_pov) jobs. Adversarial POV makes
    # each queue 2 attacker v2_expand jobs on completion -- 4 total. Neither
    # synthesis nor the wave may fire while any generation job is pending.
    drain_pov_only(db, g)
    assert len(attacker_jobs(db, debate)) == 4
    assert wave_jobs(db, debate) == []
    assert synth_jobs(db, debate) == []

    # --- Phase 2: drain exactly the 4 attacker jobs (not more -- the wave
    # doesn't exist yet, so there is nothing else pending to accidentally
    # claim). The LAST completion is the one whose quiescence check finds the
    # tree otherwise done and reaches queue_v2_synthesize_job -- which, with
    # CROSS_EXAM on, queues the wave INSTEAD of synthesis (Task 15's seam).
    complete_n_pending_v2_expand(db, g, 4)
    assert synth_jobs(db, debate) == []
    wjobs = wave_jobs(db, debate)
    assert len(wjobs) == 2  # one per branch
    assert all(job.status == "pending" for job in wjobs)
    assert all(job.payload["polarity"] == "CON" for job in wjobs)

    # --- Structural check (the point of this test): no position collision.
    # Every attacker CON is still exactly where Task 14 materialized it, and
    # each wave CON landed on its OWN slot under the same fallback target
    # (strongest_pro, since nothing is scored) instead of overwriting it.
    for container in containers:
        kids = argument_children(db, container.id)
        assert [(n.node_type, n.position, n.status) for n in kids] == [
            ("PRO", 0, "complete"),  # strongest_pro (proposer)
            ("CON", 1, "complete"),  # attacker's lens-claim attack
        ], "the attacker's top-level CON must be untouched by the wave"
        strongest_pro = kids[0]

        pro_kids = argument_children(db, strongest_pro.id)
        assert [(n.node_type, n.position) for n in pro_kids] == [
            ("PRO", 0),  # nested_pro (proposer's strongest_pro.pro)
            ("CON", 1),  # attacker's strongest_pro attack -- own slot
            ("CON", 2),  # wave's CON -- next free slot, no collision
        ]
        assert pro_kids[1].status == "complete"  # attacker's CON already materialized
        assert pro_kids[2].status == "pending"  # wave's CON not completed yet

        wave_job_for_branch = next(j for j in wjobs if j.node_id == pro_kids[2].id)
        assert wave_job_for_branch.payload["cross_exam"] is True
        assert wave_job_for_branch.payload["cross_exam_branch_container_id"] == container.id

    # --- Phase 3: drain the wave. Only then does real synthesis get queued
    # -- exactly once, via the shared queue_v2_synthesize_job seam, carrying
    # rotation provenance (proof it went through that seam and not some
    # other direct-queue path).
    complete_n_pending_v2_expand(db, g, 2)
    queued = synth_jobs(db, debate)
    assert len(queued) == 1
    assert queued[0].status == "pending"
    rotation = queued[0].payload.get("synthesizer_rotation")
    assert rotation is not None
    assert rotation.get("rotation_reason") is not None

    # --- No generation job left dangling anywhere (attacker or wave).
    all_generation_jobs = list(
        db.scalars(
            select(Job).where(Job.debate_id == debate.id, Job.job_type.in_(("v2_pov", "v2_expand")))
        ).all()
    )
    assert all_generation_jobs  # sanity: the debate actually did generation
    assert all(job.status not in ("pending", "claimed", "running") for job in all_generation_jobs)
    assert len(wave_jobs(db, debate)) == 2  # the wave still ran exactly once (no second wave)
