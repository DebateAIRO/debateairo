"""Execution seam: dispatch swarm assignments through existing job machinery.

HARD GATE (P11.3 review): NOT safe to wire to any production caller yet. The
created jobs reuse job_type='v2_pov' and are CLAIMABLE but NOT COMPLETABLE:
node_id targets the ROOT_CLAIM node (v2_pov's completion contract requires a
dedicated POV node), and orchestrator.create_debate debates carry no
DebateBranch, so complete_v2_worker_job raises at first_branch(); completing
against the root would corrupt the root claim via materialize_pov_branch.
Before wiring ANY caller: create a per-assignment POV Node (child of root) +
ensure a DebateBranch exists, mirroring create_dialectical_debate's per-POV
loop.

Honesty laws enforced here (binding, non-negotiable):
  - Dispatch reuses the EXISTING `create_job(...)` path (same one
    `dialectical_v2.queue_v2_job`/`orchestrator.create_debate` already use for
    every other job in the system) -- no new job type, no new worker
    protocol, no new `Job` columns. Jobs created here are claimed/processed
    by the exact same worker-claim path (`worker_can_claim_job`,
    `capable_online_workers`) as any other job.
  - One job per assignment. Dispatch is best-effort per assignment: one
    assignment's job-creation failure is recorded on that assignment
    (`"status": "dispatch_failed"`, `"reason": ...`) and must never abort
    dispatch of the remaining assignments.
  - Status tracking mirrors REAL `Job` rows. `swarm_status` always reads the
    actual `Job.status` value from the DB for each dispatched assignment --
    never a cached/guessed/optimistic status, never a hidden failure.
    Completion means ALL assignments are terminal (`"complete"` or
    `"failed"`); a failed assignment counts as terminal, never masked.
  - This module is orchestration-only. It does not touch evidence
    verification, judge rotation, or the P7 hard-gate overlay
    (`compositionNote` / `runner.py`'s QBAF/evidence overlay).

Implementation note: every assignment/config dict below is rebuilt fresh
(never mutated in place) before being written back to `debate.config`. This
mirrors `orchestrator.create_debate`'s own `debate.config = {**debate.config,
"swarm": swarm_descriptor}` whole-dict-reassignment convention, and is not
just a style preference here: mutating the nested dicts already referenced
by `debate.config` in place, then reassigning an outer dict built from those
same (already-mutated) nested objects, makes the "new" value structurally
identical to what the attribute already held. SQLAlchemy's ORM-level history
tracking for a plain (non-`MutableDict`) JSON column can then fail to flag
the attribute dirty on commit, silently dropping the write. Building fresh
dict/list objects for anything that changed avoids that pitfall entirely.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.core.write_lock import commit_write, flush_write
from app.models.entities import Debate, Job

# The existing single-perspective dispatch path (dialectical_v2.queue_v2_job /
# dialectical_v2.create_dialectical_debate's per-branch dispatch) uses
# job_type "v2_pov" for per-POV/per-perspective argument generation dispatched
# at debate start (see create_dialectical_debate's per-branch
# queue_v2_job(db, debate, "v2_pov", label, model_id, pov_node.id) call --
# this is the existing multi-perspective fan-out UNVERIFIED #4 asked to
# confirm). Swarm assignments are additional perspectives dispatched through
# that exact same job machinery, so they reuse the identical job_type rather
# than inventing a new one -- role is the assignment's own index-derived
# label (there is no branch/POV node for a swarm assignment to attach to, so
# node_id is the debate's root node, matching how orchestrator.create_debate
# itself dispatches its own root-scoped "decompose" job against root_node_id).
SWARM_JOB_TYPE = "v2_pov"
SWARM_ROLE_PREFIX = "swarm_perspective"

_TERMINAL_STATUSES = ("complete", "failed")


def _swarm_role(index: int) -> str:
    return f"{SWARM_ROLE_PREFIX}_{index}"


def dispatch_swarm_assignments(db: Session, debate: Debate) -> dict | None:
    """Dispatch one real Job per not-yet-dispatched swarm assignment.

    No-op (returns None) when the debate has no "swarm" descriptor at all --
    matches the flag-off/no-swarm-requested state exactly. Reuses the
    existing create_job(...) path; never invents a new job type. Idempotent:
    an assignment that already has a jobId is left untouched (never
    double-dispatched). Best-effort per assignment: a job-creation failure on
    one assignment is recorded honestly on that assignment
    ("status": "dispatch_failed", "reason": ...) and never aborts dispatch of
    the others.
    """
    # Local import: create_job lives in orchestrator.py, which itself imports
    # (transitively, via serialization -> scoring -> scoring.service)
    # app.services.orchestrator.create_job back -- a pre-existing circular
    # import in this codebase (see test_swarm_planner.py's own
    # `from app.main import app` warm-up comment). Importing at module load
    # time here would trip that cycle for any caller that imports
    # swarm_dispatch before app.main has run once; a local import defers
    # resolution until first call, by which point the app has always
    # finished importing.
    from app.services.orchestrator import create_job

    config = debate.config or {}
    swarm = config.get("swarm")
    if not isinstance(swarm, dict):
        return None

    original_assignments = swarm.get("assignments") or []
    new_assignments: list[dict[str, Any]] = []
    changed = False
    for assignment in original_assignments:
        if assignment.get("jobId"):
            new_assignments.append(assignment)
            continue  # already dispatched -- idempotent, never double-dispatch.
        try:
            job = create_job(
                db,
                debate.id,
                SWARM_JOB_TYPE,
                _swarm_role(assignment["index"]),
                debate.root_node_id,
                required_model=assignment.get("modelId"),
            )
            # create_job(...) does not flush/commit itself (mirrors
            # dialectical_v2.queue_v2_job's own create_job-then-flush_write
            # pattern) -- job.id (a flush-time default) is only populated
            # after this flush.
            flush_write(db)
            new_assignments.append({**assignment, "jobId": job.id, "status": "dispatched"})
        except Exception as exc:
            # Fail closed for THIS assignment only -- never abort the others.
            new_assignments.append({**assignment, "status": "dispatch_failed", "reason": str(exc)})
        changed = True

    if changed:
        debate.config = {**config, "swarm": {**swarm, "assignments": new_assignments}}
        commit_write(db)

    return debate.config["swarm"]


def swarm_status(db: Session, debate: Debate) -> dict | None:
    """Refresh and return honest per-assignment status from real Job rows.

    No-op (returns None) when the debate has no "swarm" descriptor. For each
    assignment with a jobId, reads the real Job.status from the DB and
    writes it back verbatim (never reinterpreted). "complete" is True only
    when EVERY assignment is terminal (complete or failed) -- a failed
    assignment counts as terminal and is never hidden or silently retried.
    Persists the refreshed statuses via commit_write before returning.
    """
    config = debate.config or {}
    swarm = config.get("swarm")
    if not isinstance(swarm, dict):
        return None

    original_assignments = swarm.get("assignments") or []
    new_assignments: list[dict[str, Any]] = []
    for assignment in original_assignments:
        job_id = assignment.get("jobId")
        job = db.get(Job, job_id) if job_id else None
        if job is None:
            new_assignments.append(assignment)
            continue
        new_assignments.append({**assignment, "status": job.status})

    all_terminal = bool(new_assignments) and all(a.get("status") in _TERMINAL_STATUSES for a in new_assignments)

    updated_swarm = {**swarm, "assignments": new_assignments, "complete": all_terminal}
    debate.config = {**config, "swarm": updated_swarm}
    commit_write(db)

    return debate.config["swarm"]
