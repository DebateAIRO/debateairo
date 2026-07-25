"""Adaptive expansion dispatch (W4): flag-gated, categorical-only steering.

Behind ``DIALECTICAL_ADAPTIVE_EXPANSION`` (bool env, default OFF -- flag off
means byte-identical behavior everywhere), the scoring-completion tail hands
this module the scoring run's fresh AUTHENTICATED lifecycle decisions and it
turns them into bounded real work through the W3 primitive
(``queue_v2_expand_job``).

The categorical-only steering LAW (machine-checked here, at the dispatch
boundary): there is no calibrated ground truth for scalar judge scores
(``app/scoring/calibration.py``), so a decision may spawn work ONLY when its
persisted ``signal_class`` is ``"categorical"`` (P1 Task 4: at least one of
its grounding reasons is categorical, each being independently sufficient to
fire the action -- see ``app.exploration.policy``). Scalar or
unclassified (legacy NULL) decisions annotate only; the ``config_override``
escape hatch is deliberately NOT implemented (the record field exists and
stays honestly empty). Decision->work mapping: ``challenge`` spawns a CON
child under the decided node; ``seek_evidence`` spawns a PRO child. Every
refusal is annotated on the audited record (never a silent drop).

Evidence-verification interlock (see scoring_completion_lifecycle): with
``DIALECTICAL_EVIDENCE_VERIFICATION`` off, no authenticated decision can
exist at all, so the only live categorical steering source is explicit user
approval (the approvals endpoint reuses ``admit_and_spawn`` below).
"""
from __future__ import annotations

import logging
from typing import Any, Callable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import bool_env, int_env
from app.core.write_lock import commit_write
from app.models.entities import Debate, Generation, Job, LifecycleDecisionRecord, Node

LOGGER = logging.getLogger(__name__)

ADAPTIVE_EXPANSION_FLAG = "DIALECTICAL_ADAPTIVE_EXPANSION"

# Budget knobs, read at decision time. Conservative documented defaults
# (pending the economics review): at most 2 adaptive dispatch rounds per
# debate, 2 expansions under any single node, 6 expansions per debate.
EXPANSION_MAX_ROUNDS_ENV = "DIALECTICAL_EXPANSION_MAX_ROUNDS"
EXPANSION_MAX_PER_NODE_ENV = "DIALECTICAL_EXPANSION_MAX_PER_NODE"
EXPANSION_MAX_PER_DEBATE_ENV = "DIALECTICAL_EXPANSION_MAX_PER_DEBATE"
DEFAULT_EXPANSION_MAX_ROUNDS = 2
DEFAULT_EXPANSION_MAX_PER_NODE = 2
DEFAULT_EXPANSION_MAX_PER_DEBATE = 6

# debate.config additive bookkeeping (written ONLY with the flag on):
# {"adaptive_expansion": {"rounds_completed": int, "stopped_because": str}}.
ADAPTIVE_EXPANSION_CONFIG_KEY = "adaptive_expansion"
ROUNDS_COMPLETED_KEY = "rounds_completed"
STOPPED_BECAUSE_KEY = "stopped_because"

# LifecycleDecisionRecord.dispatch_outcome vocabulary. Non-dispatchable
# actions (continue/deepen/abandon/reopen) keep a NULL outcome -- they are
# not expansion-bearing decisions.
OUTCOME_SPAWNED = "spawned"
OUTCOME_SCALAR_ANNOTATE_ONLY = "annotate_only_scalar_signal"
OUTCOME_BUDGET_EXHAUSTED = "budget_exhausted"
OUTCOME_DEFERRED_NO_CAPACITY = "deferred_no_capacity"
OUTCOME_TARGET_NOT_EXPANDABLE = "target_not_expandable"

# debate.config stopped_because vocabulary (why growth stopped).
STOPPED_BUDGET_EXHAUSTED = "budget_exhausted"
STOPPED_NO_CATEGORICAL_SIGNALS = "no_categorical_signals"
STOPPED_QUIESCENT_NO_DECISIONS = "quiescent_no_decisions"
STOPPED_DEFERRED_NO_CAPACITY = "deferred_no_capacity"
STOPPED_GENERATION_EXHAUSTED = "generation_exhausted"

# Decision -> work mapping: challenge probes the decided node with a
# challenging (CON) child; the seek_evidence/support family adds a
# supporting (PRO) child.
DECISION_POLARITY = {"challenge": "CON", "seek_evidence": "PRO"}


def adaptive_expansion_enabled() -> bool:
    """NEW flag, default OFF (binding: new feature flags default OFF)."""
    return bool_env(ADAPTIVE_EXPANSION_FLAG, False)


# W7 per-debate budgets: debate.config["adaptive_expansion"] may carry any of
# the three knobs; a valid value overrides the env default for THAT debate
# only, clamped to the same bounds as the env knob. merged_debate_config
# sanitizes the client-supplied dict at creation time (only these keys, only
# bounded ints), so runtime bookkeeping keys can never be injected.
BUDGET_BOUNDS: dict[str, tuple[int, int]] = {
    "max_rounds": (0, 20),
    "max_per_node": (0, 20),
    "max_per_debate": (0, 100),
}


def _config_budget(debate: Debate | None, key: str, env_value: int) -> int:
    if debate is None:
        return env_value
    minimum, maximum = BUDGET_BOUNDS[key]
    raw = adaptive_expansion_state(debate).get(key)
    if isinstance(raw, int) and not isinstance(raw, bool) and minimum <= raw <= maximum:
        return raw
    return env_value


def expansion_max_rounds(debate: Debate | None = None) -> int:
    return _config_budget(
        debate, "max_rounds", int_env(EXPANSION_MAX_ROUNDS_ENV, DEFAULT_EXPANSION_MAX_ROUNDS, 0, 20)
    )


def expansion_max_per_node(debate: Debate | None = None) -> int:
    return _config_budget(
        debate, "max_per_node", int_env(EXPANSION_MAX_PER_NODE_ENV, DEFAULT_EXPANSION_MAX_PER_NODE, 0, 20)
    )


def expansion_max_per_debate(debate: Debate | None = None) -> int:
    return _config_budget(
        debate, "max_per_debate", int_env(EXPANSION_MAX_PER_DEBATE_ENV, DEFAULT_EXPANSION_MAX_PER_DEBATE, 0, 100)
    )


def adaptive_expansion_state(debate: Debate) -> dict[str, Any]:
    config = debate.config if isinstance(debate.config, dict) else {}
    state = config.get(ADAPTIVE_EXPANSION_CONFIG_KEY)
    return dict(state) if isinstance(state, dict) else {}


def _write_adaptive_expansion_state(debate: Debate, state: dict[str, Any]) -> None:
    debate.config = {**(debate.config or {}), ADAPTIVE_EXPANSION_CONFIG_KEY: state}


def rounds_completed(debate: Debate) -> int:
    value = adaptive_expansion_state(debate).get(ROUNDS_COMPLETED_KEY)
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else 0


def record_adaptive_stop(db: Session, debate: Debate, reason: str, *, overwrite: bool = True) -> None:
    """Record why growth stopped on debate.config (additive; no commit --
    the write joins the caller's transaction). Callers gate on the flag."""
    state = adaptive_expansion_state(debate)
    if not overwrite and str(state.get(STOPPED_BECAUSE_KEY) or "").strip():
        return
    state[STOPPED_BECAUSE_KEY] = reason
    _write_adaptive_expansion_state(debate, state)


def stopped_because_of(debate: Debate) -> str | None:
    value = adaptive_expansion_state(debate).get(STOPPED_BECAUSE_KEY)
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def debate_expand_jobs(db: Session, debate_id: str) -> list[Job]:
    """Every v2_expand job ever created for the debate, ANY status: a failed
    expansion consumed budget too (bounded growth beats retry-spawn loops)."""
    return list(
        db.scalars(
            select(Job).where(Job.debate_id == debate_id, Job.job_type == "v2_expand")
        ).all()
    )


def _job_payload(job: Job) -> dict[str, Any]:
    return job.payload if isinstance(job.payload, dict) else {}


def _existing_job_for_decision(jobs: list[Job], record_id: str) -> Job | None:
    for job in jobs:
        if _job_payload(job).get("decision_record_id") == record_id:
            return job
    return None


def _expand_job_count_for_node(jobs: list[Job], node_id: str) -> int:
    return sum(1 for job in jobs if _job_payload(job).get("parent_node_id") == node_id)


def _node_expandable(debate: Debate, node: Node | None) -> bool:
    # Mirrors queue_v2_expand_job's validations plus the W3 rule that an
    # abandoned path is never re-expanded.
    return (
        node is not None
        and node.debate_id == debate.id
        and node.node_type in {"PRO", "CON"}
        and node.status == "complete"
        and bool(node.active_generation_id)
        and node.path_status != "abandoned"
    )


def _expansion_model_for(db: Session, node: Node) -> str:
    """Challenger-preferred expansion model: the next pool model after the
    node's author (wrapping), so a DIFFERENT provider stress-tests the
    argument whenever the deployment has one. Falls back to the author (or
    the anchor) when the pool offers no alternative."""
    from app.services.dialectical_v2 import V2_CODEX_MODEL_ID, v2_generation_model_pool

    generation = db.get(Generation, node.active_generation_id) if node.active_generation_id else None
    author = str(getattr(generation, "model_id", "") or "") or V2_CODEX_MODEL_ID
    pool = v2_generation_model_pool(db)
    start = (pool.index(author) + 1) % len(pool) if author in pool else 0
    for offset in range(len(pool)):
        candidate = pool[(start + offset) % len(pool)]
        if candidate != author:
            return candidate
    return author


def admit_and_spawn(
    db: Session,
    debate: Debate,
    node: Node | None,
    *,
    polarity: str,
    reason: str,
    decision_record_id: str | None = None,
    jobs: list[Job] | None = None,
) -> tuple[Job | None, str]:
    """Budget + capacity admission, then spawn through the W3 primitive.

    Returns (job, outcome): outcome is OUTCOME_SPAWNED with the committed Job,
    or an honest refusal code with None. Shared by the adaptive dispatcher and
    the user-approval path (same budgets, same capacity admission).
    """
    from app.services.dialectical_v2 import queue_v2_expand_job
    from app.services.orchestrator import capable_online_workers

    if jobs is None:
        jobs = debate_expand_jobs(db, debate.id)
    if not _node_expandable(debate, node):
        return None, OUTCOME_TARGET_NOT_EXPANDABLE
    assert node is not None
    if len(jobs) >= expansion_max_per_debate(debate):
        return None, OUTCOME_BUDGET_EXHAUSTED
    if _expand_job_count_for_node(jobs, node.id) >= expansion_max_per_node(debate):
        return None, OUTCOME_BUDGET_EXHAUSTED
    # Capacity admission: spawn only when a capable online worker exists for
    # the expansion's model; otherwise defer honestly (no spawn, eligible
    # again on a later pass). The model is chosen once here (challenger-
    # preferred) and passed through so admission and queueing agree.
    expansion_model = _expansion_model_for(db, node)
    if not capable_online_workers(db, expansion_model):
        return None, OUTCOME_DEFERRED_NO_CAPACITY
    try:
        job = queue_v2_expand_job(
            db,
            debate,
            node,
            polarity,
            reason,
            expansion_model,
            decision_record_id=decision_record_id,
        )
    except ValueError as exc:
        # Defensive backstop: _node_expandable mirrors the primitive's
        # validations, so this should not fire in practice.
        LOGGER.warning(
            "adaptive expansion target refused by queue_v2_expand_job debate=%s node=%s: %s",
            debate.id,
            node.id,
            exc,
        )
        return None, OUTCOME_TARGET_NOT_EXPANDABLE
    return job, OUTCOME_SPAWNED


def _stopped_because_for_pass(outcomes: list[str]) -> str:
    if OUTCOME_BUDGET_EXHAUSTED in outcomes:
        return STOPPED_BUDGET_EXHAUSTED
    if OUTCOME_DEFERRED_NO_CAPACITY in outcomes:
        return STOPPED_DEFERRED_NO_CAPACITY
    if OUTCOME_SCALAR_ANNOTATE_ONLY in outcomes:
        return STOPPED_NO_CATEGORICAL_SIGNALS
    return STOPPED_QUIESCENT_NO_DECISIONS


def expansion_dispatch(db: Session, *, debate_id: str, analyzer_run_id: str) -> None:
    """One dispatch pass over the scoring run's fresh authenticated decisions.

    Called from the scoring-completion tail AFTER the lifecycle reevaluation
    and the protocol re-run, only when the flag is on. Idempotent on replay
    (keyed on the decision record id carried in the spawned job's payload).
    Budget bookkeeping is derived from committed Job rows, so the N-commits
    shape of queue_v2_expand_job cannot overspawn on a mid-loop retry.
    Commits its annotations; raises only unexpected errors (the caller wraps
    the call best-effort).
    """
    debate = db.get(Debate, debate_id)
    if debate is None or debate.status == "archived":
        # Dispatch validation: archived debates are refused wholesale (the
        # W3 primitive does not check this itself).
        return
    from app.services.orchestrator import debate_uses_v2_pipeline

    if not debate_uses_v2_pipeline(db, debate_id):
        return

    records = list(
        db.scalars(
            select(LifecycleDecisionRecord)
            .where(
                LifecycleDecisionRecord.debate_id == debate_id,
                LifecycleDecisionRecord.score_run_id == analyzer_run_id,
                LifecycleDecisionRecord.input_state == "grounded",
            )
            .order_by(LifecycleDecisionRecord.created_at.asc(), LifecycleDecisionRecord.id.asc())
        ).all()
    )
    dispatchable = [record for record in records if record.decision in DECISION_POLARITY]

    spawned = 0
    replayed = 0
    outcomes: list[str] = []
    rounds_exhausted = rounds_completed(debate) >= expansion_max_rounds(debate)
    try:
        for record in dispatchable:
            jobs = debate_expand_jobs(db, debate_id)
            existing = _existing_job_for_decision(jobs, record.id)
            if existing is not None:
                # Idempotent replay: the decision already spawned. Heal the
                # audited record if a crash landed between the job commit and
                # the annotation commit; never spawn again.
                record.dispatch_outcome = OUTCOME_SPAWNED
                record.child_spawn_count = 1
                replayed += 1
                continue
            if record.signal_class != "categorical":
                # THE LAW: scalar-grounded (or unclassified legacy NULL)
                # decisions are structurally unable to spawn -- annotate only.
                record.dispatch_outcome = OUTCOME_SCALAR_ANNOTATE_ONLY
                outcomes.append(OUTCOME_SCALAR_ANNOTATE_ONLY)
                continue
            if rounds_exhausted:
                record.dispatch_outcome = OUTCOME_BUDGET_EXHAUSTED
                outcomes.append(OUTCOME_BUDGET_EXHAUSTED)
                continue
            node = db.get(Node, record.node_id)
            # Write the real spawn outcome BEFORE the primitive's internal
            # commit so job + audited record land atomically; reset on refusal.
            record.dispatch_outcome = OUTCOME_SPAWNED
            record.child_spawn_count = 1
            job, outcome = admit_and_spawn(
                db,
                debate,
                node,
                polarity=DECISION_POLARITY[record.decision],
                reason=record.stopping_reason,
                decision_record_id=record.id,
                jobs=jobs,
            )
            outcomes.append(outcome)
            if job is None:
                record.dispatch_outcome = outcome
                record.child_spawn_count = 0
                continue
            spawned += 1

        state = adaptive_expansion_state(debate)
        if spawned:
            state[ROUNDS_COMPLETED_KEY] = rounds_completed(debate) + 1
            # Growth resumed: a stale stop reason would be dishonest.
            state.pop(STOPPED_BECAUSE_KEY, None)
            _write_adaptive_expansion_state(debate, state)
        elif replayed and not outcomes:
            # Pure replay pass: nothing changed, leave the bookkeeping alone.
            pass
        else:
            state[STOPPED_BECAUSE_KEY] = _stopped_because_for_pass(outcomes)
            _write_adaptive_expansion_state(debate, state)
        commit_write(db)
    except Exception:
        db.rollback()
        raise


def maybe_queue_rescore_after_expansion(
    db: Session,
    debate: Debate,
    *,
    registry_factory: Callable[[], Any] | None = None,
) -> Job | None:
    """Ensure the W2 waker has a pending debate-scoped scoring job to claim.

    Called from the v2_expand completion tail (flag ON, quiescent tree only).
    Returns the pending Job the trigger should wake, or None when scoring is
    already in flight or no provider is configured (silent degrade -- same
    W2 discipline; no fake failed jobs are minted here). Commits when it
    queues.
    """
    from app.providers import ProviderRegistry, detect_scoring_provider_config
    from app.scoring.service import queue_scoring_job

    active = db.scalars(
        select(Job)
        .where(
            Job.debate_id == debate.id,
            Job.job_type == "score_debate",
            Job.status.in_(["pending", "claimed", "running"]),
        )
        .order_by(Job.created_at.desc(), Job.id.desc())
        .limit(1)
    ).first()
    if active is not None:
        # A pending job just needs the wake; an in-flight one needs nothing.
        return active if active.status == "pending" else None
    registry = (registry_factory or ProviderRegistry)()
    scoring_config = detect_scoring_provider_config(
        registry.agents, role="judge", providers=registry.providers
    )
    if not scoring_config.available:
        return None
    job = queue_scoring_job(db, debate, model_id=scoring_config.model or "", judge_role="judge")
    commit_write(db)
    return job
