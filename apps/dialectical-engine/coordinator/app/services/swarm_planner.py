"""Pure swarm descriptor planner.

Honesty laws enforced here (binding, non-negotiable):
  - Assignments are derived ONLY from the real `capable_workers` list the
    caller passes in (expected to come from `capable_online_workers(db,
    model_id)` in `orchestrator.py`, which already enforces `status ==
    "online"` + last-seen liveness + capability filtering). This module
    NEVER queries a DB, NEVER reads an env var, and NEVER fabricates a
    worker that isn't in the input list.
  - `len(assignments) <= len(capable_workers)` always -- the hard honesty
    invariant tests must pin. If fewer real capable workers exist than
    `requested_perspectives`, the shortfall is recorded honestly via the
    `"shortfall"` key rather than padded with invented workers.
  - `plan_swarm` is a pure function: no I/O, no DB access, deterministic
    given its inputs -- mirrors `app.scoring.calibration`'s purity
    discipline. Assignment ordering is exactly the input order of
    `capable_workers` (no re-sorting), so the same `capable_workers` list
    always yields the same `assignments` list.
"""

from __future__ import annotations

from typing import Any

SWARM_VERSION = "swarm-v1"


def plan_swarm(*, requested_perspectives: int, capable_workers: list[Any]) -> dict:
    """Return an honest swarm descriptor for `requested_perspectives` POVs.

    `capable_workers` must already be the real, caller-queried list of
    online + capable `Worker` rows (this function never re-derives or
    re-filters it). Assignments are built in the input order of
    `capable_workers` (deterministic ordering key: input list order, which
    itself derives from the caller's DB query order -- no re-sorting is
    performed here), one per worker actually assigned, up to
    `min(requested_perspectives, len(capable_workers))`. Never invents a
    worker beyond what `capable_workers` actually contains.
    """
    safe_requested = max(0, requested_perspectives)
    assignment_count = min(safe_requested, len(capable_workers))
    shortfall = max(0, requested_perspectives - len(capable_workers))

    assignments = []
    for index in range(assignment_count):
        worker = capable_workers[index]
        model_id = _worker_model_id(worker)
        assignments.append({"index": index, "workerId": worker.id, "modelId": model_id})

    return {
        "version": SWARM_VERSION,
        "requestedPerspectives": requested_perspectives,
        "assignments": assignments,
        "shortfall": shortfall,
    }


def _worker_model_id(worker: Any) -> str | None:
    """Best-effort real capability string for the assigned worker.

    Never fabricates a model: if the worker has no capabilities recorded,
    `modelId` is honestly `None` rather than a guessed value.
    """
    capabilities = getattr(worker, "capabilities", None) or []
    for capability in capabilities:
        text = str(capability).strip()
        if text:
            return text
    return None
