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

from app.core.config import bool_env, float_env, int_env
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
OUTCOME_BELOW_PRIORITY_FLOOR = "below_priority_floor"
# P1 Task 6: distinct from OUTCOME_BUDGET_EXHAUSTED on purpose. This pass's
# wave filled up; the debate's expansion budget was NOT reached and may be
# wide open. Annotating it "budget_exhausted" would render (via reason_copy)
# as expansion pausing "after reaching its budget for this debate" -- false.
OUTCOME_WAVE_FULL = "wave_full"

# debate.config stopped_because vocabulary (why growth stopped).
STOPPED_BUDGET_EXHAUSTED = "budget_exhausted"
STOPPED_NO_CATEGORICAL_SIGNALS = "no_categorical_signals"
STOPPED_QUIESCENT_NO_DECISIONS = "quiescent_no_decisions"
STOPPED_DEFERRED_NO_CAPACITY = "deferred_no_capacity"
STOPPED_GENERATION_EXHAUSTED = "generation_exhausted"
STOPPED_BELOW_PRIORITY_FLOOR = "below_priority_floor"
STOPPED_WAVE_FULL = "wave_full"

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


# P1 Task 6: frontier ordering.
#
# THE LAW IS UNCHANGED. Scalars here only RANK and TRUNCATE work that
# categorical grounding has already authorised. No scalar can cause a spawn
# that would not otherwise have happened -- signal_class is still the sole
# gate (see the dispatch loop below), and both knobs added here can only
# REMOVE a record from the wave, never add one. Ordering a legal set is not
# the same act as authorising it, which is why this is consistent with the
# categorical-only steering law rather than an exception to it.
#
# UNRANKED IS NOT LOW-RANKED. A record gets frontier_priority NULL and is
# EXEMPT from the floor whenever its merit could not be READ -- whether the
# node had no item in the decision's scoring run at all, or had one whose
# `scores` was missing, null, or non-numeric. Both are the same fact: nothing
# was measured. Refusing either as "below_priority_floor" would assert a merit
# measurement that never happened, and a schema drift renaming `scores` (or a
# run writing null scores) would then floor out every record and silently
# switch adaptive expansion off wholesale. The floor may only refuse a
# priority that actually exists; an unranked record still faces every
# pre-existing budget and capacity check, exactly as it did before this task.
# frontier_priority_or_none() is the rankability-aware form the dispatch loop
# uses; frontier_priority() stays a pure rank that answers 0.0.
EXPANSION_PRIORITY_FLOOR_ENV = "DIALECTICAL_EXPANSION_PRIORITY_FLOOR"
EXPANSION_WAVE_WIDTH_ENV = "DIALECTICAL_EXPANSION_WAVE_WIDTH"
# Measured, not guessed: across the 250 scored nodes in the 7 complete
# node_scoring runs on this deployment, impact x uncertainty has median
# 0.374 (p25 0.276, max 0.558) and 214/250 (86%) clear 0.15. The floor
# therefore trims the bottom band rather than gating the normal case. The one
# debate it bites hard is smoke4's f67ad244 (mean 0.101, 5/26 clearing) --
# the same low-impact tree P1 Task 5 measured dispersion on.
PRIORITY_FLOOR = 0.15
EXPANSION_WAVE_WIDTH = 12


def expansion_priority_floor() -> float:
    return float_env(EXPANSION_PRIORITY_FLOOR_ENV, PRIORITY_FLOOR, 0.0, 1.0)


def expansion_wave_width() -> int:
    return int_env(EXPANSION_WAVE_WIDTH_ENV, EXPANSION_WAVE_WIDTH, 1, 64)


def frontier_priority_or_none(score_item: dict[str, Any] | None) -> float | None:
    """The RANKABILITY-aware form: ``None`` means "never measured".

    Returns ``None`` -- not 0.0 -- when the item is absent, is not a dict, has
    no ``scores`` dict, or whose ``impact``/``uncertainty`` are missing or not
    real numbers. Every one of those is the same fact: this node's merit could
    not be read. The dispatch loop uses this form so the priority floor can
    only ever refuse a merit that actually exists (see the
    unranked-is-not-low-ranked note above).

    ``bool`` is excluded from the numeric test deliberately -- ``True`` is an
    ``int`` in Python, and a boolean landing in a score field is corrupt
    input, not an impact of 1.0.
    """
    if not isinstance(score_item, dict):
        return None
    scores = score_item.get("scores")
    if not isinstance(scores, dict):
        return None
    impact = scores.get("impact")
    uncertainty = scores.get("uncertainty")
    if not _is_real_number(impact) or not _is_real_number(uncertainty):
        return None
    spread = score_item.get("max_field_spread")
    spread_value = float(spread) if _is_real_number(spread) else 0.0
    return float(impact) * float(uncertainty) * (1.0 + spread_value)


def frontier_priority(score_item: dict[str, Any]) -> float:
    """impact x uncertainty x (1 + max cross-family field spread).

    The dispersion term is 1-based so an undisputed node is never pushed
    below its own impact x uncertainty merit -- disagreement promotes, it
    never demotes.

    This is a pure RANK, and it answers 0.0 for anything it cannot read.
    Whether a node was rankable AT ALL is a separate question, and 0.0 cannot
    express it: 0.0 here means "ranks last", never "measured as worthless".
    Callers that must tell those apart -- the dispatch loop does, because the
    floor may not refuse an unmeasured node -- use frontier_priority_or_none.
    """
    value = frontier_priority_or_none(score_item)
    return 0.0 if value is None else value


def _is_real_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _score_items_by_node(
    db: Session, debate_id: str, analyzer_run_id: str, node_ids: set[str]
) -> dict[str, dict[str, Any]]:
    """Items of THE DECISION'S OWN scoring run for ``node_ids``, keyed by node
    id, each annotated with the node's widest cross-family field spread (P1
    Task 5) so frontier_priority can read both from one dict.

    Reads ``analyzer_run_id`` by primary key rather than re-deriving "the
    latest complete node_scoring run". The records being ranked were already
    selected by ``score_run_id == analyzer_run_id`` (see the caller), so the
    run that GROUNDED each decision is in hand -- and every audited
    frontier_priority is then provably derived from the same scores that
    grounded the decision it ranks. Re-deriving "latest" would rank a
    decision on numbers it was never made from whenever a newer run landed in
    between, and would carry a stale-run hazard (same-tick ``seq`` ties) that
    reading by id does not have at all.

    Defensive on type: a run that is not a complete ``node_scoring`` run
    yields ``{}``, i.e. every record is honestly UNRANKED (and so exempt from
    the floor) rather than ranked off some other analyzer's payload.

    ``node_ids`` bounds the per-node judge-evidence reads to the records
    actually being ranked, rather than every scored node in the run.
    """
    from app.models.entities import AnalyzerRun
    from app.scoring.disagreement import field_spreads
    from app.scoring.service import latest_judge_evidence_for_node

    if not node_ids:
        return {}
    run = db.get(AnalyzerRun, analyzer_run_id)
    if (
        run is None
        or run.debate_id != debate_id
        or run.analyzer_type != "node_scoring"
        or run.status != "complete"
    ):
        return {}
    output = getattr(run, "output", None)
    items = output.get("items") if isinstance(output, dict) else None
    if not isinstance(items, list):
        return {}

    by_node: dict[str, dict[str, Any]] = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        node_id = item.get("node_id")
        if not node_id or str(node_id) not in node_ids:
            continue
        spreads = field_spreads(
            latest_judge_evidence_for_node(db, debate_id=debate_id, node_id=str(node_id))
        )
        enriched = dict(item)
        enriched["max_field_spread"] = max(spreads.values()) if spreads else 0.0
        by_node[str(node_id)] = enriched
    return by_node


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
    # Defensively mapped, currently unreachable BY CONSTRUCTION: the wave
    # width is clamped to >= 1, so OUTCOME_WAVE_FULL can only be appended
    # after at least one spawn, and a pass that spawned never asks for a
    # stopped_because at all (see expansion_dispatch's bookkeeping tail). It
    # is mapped anyway so a future change to either invariant cannot leak a
    # pass whose growth stopped at the wave into the wrong reason -- the same
    # defensive discipline reason_copy.py already documents for the
    # lifecycle-resolver component codes.
    if OUTCOME_WAVE_FULL in outcomes:
        return STOPPED_WAVE_FULL
    if OUTCOME_BELOW_PRIORITY_FLOOR in outcomes:
        return STOPPED_BELOW_PRIORITY_FLOOR
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

    # P1 Task 6: rank the ALREADY-AUTHORISED set, then take the wave. Scalar
    # records stay in the list so they still receive their honest
    # annotate_only outcome below -- ordering must not silence them, and the
    # signal_class gate below still runs BEFORE either knob, so neither the
    # floor nor the wave width can ever admit a record THE LAW refuses.
    score_items = _score_items_by_node(
        db, debate_id, analyzer_run_id, {record.node_id for record in dispatchable}
    )
    for record in dispatchable:
        # NULL whenever the merit could not be READ -- no item for the node,
        # or an item whose scores are missing/null/non-numeric. Both mean
        # "never measured", not "measured zero" (see the
        # unranked-is-not-low-ranked note above), and only a non-NULL value
        # may be refused by the floor.
        record.frontier_priority = frontier_priority_or_none(score_items.get(record.node_id))
    dispatchable.sort(key=lambda r: (-(r.frontier_priority or 0.0), r.created_at, r.id))
    floor = expansion_priority_floor()
    width = expansion_wave_width()

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
            if record.frontier_priority is not None and record.frontier_priority < floor:
                # Ranked, and ranked low enough that spending an expansion
                # here is not "spend where the families disagree" -- refused,
                # annotated. An UNRANKED record (NULL) is never refused here:
                # the floor may only refuse a priority that actually exists.
                record.dispatch_outcome = OUTCOME_BELOW_PRIORITY_FLOOR
                outcomes.append(OUTCOME_BELOW_PRIORITY_FLOOR)
                continue
            if spawned >= width:
                # The wave is full -- NOT the debate's budget, which may be
                # wide open. `spawned` IS the admitted count (the two only
                # ever advance together), so a record refused downstream by a
                # budget or by capacity never consumes wave width.
                record.dispatch_outcome = OUTCOME_WAVE_FULL
                outcomes.append(OUTCOME_WAVE_FULL)
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
