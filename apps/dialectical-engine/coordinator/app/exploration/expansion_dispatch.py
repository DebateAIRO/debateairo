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
from datetime import datetime, timezone
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
# P1 Task 7: the two whole-debate stop conditions. A pass that stops for the
# debate refuses every record it was handed, so each one is annotated with the
# stop that refused it rather than left NULL -- see _annotate_and_stop.
OUTCOME_CONVERGED = "converged"
OUTCOME_WALL_CLOCK = "wall_clock"

# debate.config stopped_because vocabulary (why growth stopped).
STOPPED_BUDGET_EXHAUSTED = "budget_exhausted"
STOPPED_NO_CATEGORICAL_SIGNALS = "no_categorical_signals"
STOPPED_QUIESCENT_NO_DECISIONS = "quiescent_no_decisions"
STOPPED_DEFERRED_NO_CAPACITY = "deferred_no_capacity"
STOPPED_GENERATION_EXHAUSTED = "generation_exhausted"
STOPPED_BELOW_PRIORITY_FLOOR = "below_priority_floor"
STOPPED_WAVE_FULL = "wave_full"
STOPPED_CONVERGED = "converged"
STOPPED_WALL_CLOCK = "wall_clock"

# P1 Task 7: stop conditions beyond budget exhaustion. smoke4's post-scoring
# protocol run recorded converged=false, maxDelta=0.226 against epsilon=0.05 --
# scores still moving at 4.5x the stability threshold when the engine stopped.
# The convergence test existed, ran, and failed, and NOTHING consumed it; with
# 12 waves available the loop has to stop when the tree settles rather than
# when the budget runs out.
#
# debate.config["adaptive_expansion"] bookkeeping (flag-on writes only):
#   converged_waves        -- consecutive settled waves observed so far
#   converged_wave_run_id  -- the protocol run the count last consumed, so a
#                             replayed pass cannot read one wave as two
#   converged_wave_round   -- the rounds_completed value that count was taken
#                             at, so two readings with NO EXPANSION between
#                             them cannot be read as two waves
#   growth_started_at      -- ISO instant of the first flag-on dispatch pass
CONVERGED_WAVES_KEY = "converged_waves"
CONVERGED_WAVE_RUN_KEY = "converged_wave_run_id"
CONVERGED_WAVE_ROUND_KEY = "converged_wave_round"
GROWTH_STARTED_AT_KEY = "growth_started_at"

# Two consecutive settled waves, not one: a single wave under epsilon can be
# noise, and stopping a 12-wave budget on noise is the expensive mistake here.
REQUIRED_CONSECUTIVE_CONVERGED_WAVES = 2

# The runner's non-comparable `reason` values split in two, and the split is
# load-bearing (review finding 2):
#
#   * "strengths_unavailable" / "first_evaluation" -- the engine failed to
#     MEASURE. Silence about the drift is not evidence the drift was large.
#     The streak carries forward.
#   * "topology_changed" / "semantics_changed" -- positive evidence that the
#     COMPARISON BASIS itself changed. A topology change IS a further round
#     changing the graph, so letting a settled-before/settled-after pair
#     straddle one would make the stop's own claim ("further rounds were no
#     longer changing the conclusions") false at the moment it is asserted.
#     The streak resets. A tree whose shape keeps changing has not converged,
#     and that is exactly the case the loop is supposed to keep running on.
CONVERGENCE_BASIS_CHANGED_REASONS = frozenset({"topology_changed", "semantics_changed"})

DEBATE_WALL_CLOCK_SECONDS_ENV = "DIALECTICAL_DEBATE_WALL_CLOCK_SECONDS"
DEFAULT_DEBATE_WALL_CLOCK_SECONDS = 4 * 60 * 60

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


def debate_wall_clock_seconds() -> int:
    """Ceiling on how long one debate may keep growing, in seconds.

    The lower bound of 60 is deliberate: a value below it would mean "stop
    before the first wave can finish", which is a misconfiguration rather than
    an aggressive setting, and int_env clamps into range rather than honouring
    it.
    """
    return int_env(
        DEBATE_WALL_CLOCK_SECONDS_ENV, DEFAULT_DEBATE_WALL_CLOCK_SECONDS, 60, 24 * 60 * 60
    )


def _as_utc(value: datetime) -> datetime:
    """Stamp a NAIVE datetime as UTC; pass an aware one through unchanged.

    Both forms genuinely occur here and mixing them raises ``TypeError: can't
    subtract offset-naive and offset-aware datetimes`` -- which, at the
    wall-clock gate, would take down EVERY dispatch pass. Verified empirically
    against this deployment's database rather than assumed, for BOTH sources
    (review finding 3 asked for exactly this on the value we now write
    ourselves):

    * ``Debate.created_at`` comes back **naive**, despite the column being
      declared ``DateTime(timezone=True)``. SQLAlchemy's SQLite DATETIME drops
      the offset on the way in and never restores it on the way out; the stored
      text is the UTC wall clock with no zone.
    * ``growth_started_at`` is a string in a JSON column, so it round-trips
      byte-for-byte and ``datetime.fromisoformat`` returns it **aware**
      (``now_utc().isoformat()`` carries ``+00:00``).

    Naive values are stamped UTC, never read as local time -- the stored wall
    clock IS UTC, and reading it as local would be wrong by a whole offset.
    Both facts are pinned by tests so a driver or serialisation change fails
    loudly instead of silently.
    """
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def growth_clock_started_at(debate: Debate) -> datetime | None:
    """The stamped start of this debate's GROWTH clock, or None if unusable.

    Answers None for an absent, non-string, blank, or unparseable value, so a
    corrupt stamp degrades to the ``created_at`` fallback rather than raising
    inside the dispatch gate.
    """
    raw = adaptive_expansion_state(debate).get(GROWTH_STARTED_AT_KEY)
    if not isinstance(raw, str) or not raw.strip():
        return None
    try:
        return datetime.fromisoformat(raw.strip())
    except ValueError:
        return None


def _mark_growth_started(debate: Debate) -> None:
    """Start the growth clock on the FIRST flag-on dispatch pass; then never
    move it again (mutates debate.config only -- no flush, no commit)."""
    from app.models.entities import now_utc

    if growth_clock_started_at(debate) is not None:
        return
    state = adaptive_expansion_state(debate)
    state[GROWTH_STARTED_AT_KEY] = now_utc().isoformat()
    _write_adaptive_expansion_state(debate, state)


def growth_elapsed_seconds(debate: Debate) -> float:
    """Seconds this debate has been allowed to GROW -- not the age of its row.

    The ceiling bounds how long a debate may keep growing. Measuring total
    debate age instead would mean that on the day the flag is flipped, every
    pre-existing debate in production is already past four hours and the very
    first dispatch pass stamps ``wall_clock`` before adaptive expansion does
    anything at all (review finding 3, project-owner ruling). The clock
    therefore starts at the first flag-on dispatch pass
    (``_mark_growth_started``, called immediately before this is read, so a
    debate's first pass always measures ~0 no matter how old the row is).

    ``debate.created_at`` is the fallback for a MISSING or CORRUPT stamp only
    -- for a debate mid-flight when this shipped, or config that lost the key.
    It is deliberately not the primary source.

    A debate with neither answers 0.0: an unmeasurable age must not stop growth
    against a ceiling nothing was compared to.
    """
    from app.models.entities import now_utc

    started_at = growth_clock_started_at(debate) or debate.created_at
    if started_at is None:
        return 0.0
    return (now_utc() - _as_utc(started_at)).total_seconds()


def _latest_convergence(db: Session, debate_id: str) -> tuple[str | None, dict[str, Any]]:
    """The newest complete protocol run's convergence block, with its run id.

    Ordered by ``seq`` first (then created_at, then id), matching
    app/scoring/service.py's latest-AnalyzerRun read: ``id`` is a random UUID4
    and ``created_at`` is coarse wall-clock, so same-tick runs are routine and
    neither can order them (see AnalyzerRun.seq's own docstring). This IS a
    genuine "latest" read -- unlike the frontier ranker above, which reads the
    decision's OWN grounding run by primary key. There is no grounding run in
    scope here: convergence is debate-level state, read at dispatch time.

    Answers ``{}`` for anything unreadable, which the caller treats as "this
    wave said nothing" rather than as movement.
    """
    from app.models.entities import AnalyzerRun
    from app.protocol.runner import PROTOCOL_ANALYSIS_TYPE

    run = db.scalars(
        select(AnalyzerRun)
        .where(
            AnalyzerRun.debate_id == debate_id,
            AnalyzerRun.analyzer_type == PROTOCOL_ANALYSIS_TYPE,
            AnalyzerRun.status == "complete",
        )
        .order_by(AnalyzerRun.seq.desc(), AnalyzerRun.created_at.desc(), AnalyzerRun.id.desc())
        .limit(1)
    ).first()
    if run is None:
        return None, {}
    output = getattr(run, "output", None)
    convergence = output.get("convergence") if isinstance(output, dict) else None
    return run.id, (convergence if isinstance(convergence, dict) else {})


def _reset_streak(debate: Debate, state: dict[str, Any], count: int) -> int:
    """Break the hysteresis streak; always answers 0.

    Deliberately leaves ``converged_wave_run_id`` / ``converged_wave_round``
    alone: a reset is not a count, so it must not mark a wave consumed and
    block a later legitimate increment. Skips the write when the streak is
    already 0 so a quiet debate does not rewrite debate.config every pass.
    """
    if count:
        state[CONVERGED_WAVES_KEY] = 0
        _write_adaptive_expansion_state(debate, state)
    return 0


def _record_convergence_wave(
    debate: Debate, run_id: str | None, convergence: dict[str, Any]
) -> int:
    """Advance (or reset) the hysteresis counter; returns CONSECUTIVE settled waves.

    A "wave" is an EXPANSION ROUND followed by a fresh measurement of the
    drift it caused -- NOT merely a dispatch pass. Those are not the same
    thing, and conflating them is how a debate that never expanded once gets
    annotated "the analysis had settled: further rounds were no longer
    changing the conclusions" (review finding 1). ``run_protocol_analysis``
    appends a run on EVERY scoring completion (app/scoring/jobs.py), and
    scoring completions arrive from paths that have nothing to do with
    adaptive expansion -- pre-synthesis scoring, cold start, the API. Two of
    those measure near-zero drift on a tree nobody grew, and without the round
    guard below they would trip the stop and overwrite the honest diagnosis
    the pass would otherwise have recorded.

    THE ONE PRINCIPLE (review round 2): **the round guard exists to stop
    double-COUNTING a single wave, and it has no business suppressing a RESET.**
    Divergence is divergence whether or not a round advanced. So the increment
    is gated and the reset is not, which makes the guarantee honest in both
    directions -- the counter can never over-count a wave, and it can never
    carry a settled streak across observed movement.

    That asymmetry is load-bearing because ``rounds_completed`` is advanced
    ONLY by ``expansion_dispatch``'s own tail, never by ``admit_and_spawn``.
    Growth driven purely by user approval (app/api/scoring.py) therefore leaves
    the round counter frozen. With a gated reset, every reading during such an
    interlude was swallowed before it ever reached the ``maxDelta`` test, so
    real divergence neither reset the streak nor was recorded anywhere -- and a
    stale pre-interlude count could later combine with one fresh measurement to
    present itself as "two consecutive settled waves" while the graph was in
    fact still growing.

    Do NOT reach for the basis-changed reason as a safety net here. The runner
    classifies a run ``topology_changed`` only when the two node-strength key
    sets have ZERO intersection, or when an evidence-verifier tau edge appeared
    or disappeared (app/protocol/runner.py). Ordinary node addition -- exactly
    what ``admit_and_spawn`` produces -- leaves the intersection non-empty and
    is classified COMPARABLE. The ungated reset below, not the reason check, is
    what actually catches user-approved growth.

    In order:

    1. **The comparison basis changed** (``reason`` in
       ``CONVERGENCE_BASIS_CHANGED_REASONS``) -- reset to 0. The wave is not
       marked consumed, so a real measurement later in the same round is still
       counted.
    2. **The run could not MEASURE the drift** (no real ``maxDelta`` /
       ``epsilon``) -- the runner's ``first_evaluation`` /
       ``strengths_unavailable`` branches. The count carries forward untouched:
       resetting would treat silence as movement, incrementing would invent a
       measurement neither the runner nor this module made.
    3. **The drift EXCEEDED epsilon** -- reset to 0, unconditionally. Not gated
       on the round, not gated on the run id: the scores were observed moving,
       and no bookkeeping question changes that fact.
    4. Only now, for a SETTLED reading, the anti-double-count gates on the
       increment:
       a. ``rounds_completed == 0`` -- nothing ever grew, so nothing can have
          settled.
       b. same ``run_id`` as the last counted wave -- one reading, not two.
          Dispatch is best-effort at its call site and so is the protocol
          re-run before it, so a retried tail can hand over the same run twice.
       c. ``rounds_completed <= converged_wave_round`` -- no round since the
          last counted wave. (b) and (c) answer different questions and neither
          subsumes the other: a round CAN advance while the protocol re-run
          fails, leaving the same stale run as "latest".

    The settled predicate is ``max_delta <= epsilon`` -- byte-for-byte the one
    app/protocol/runner.py uses to write ``converged`` on the same payload, so
    the stop condition and the reported convergence flag can never disagree at
    the boundary.

    Mutates only ``debate.config`` (no flush, no commit) -- the write joins the
    caller's transaction, which is what keeps this off the "hold a SQLite write
    transaction across a CLI call" path entirely.
    """
    state = adaptive_expansion_state(debate)
    previous = state.get(CONVERGED_WAVES_KEY)
    count = (
        previous
        if isinstance(previous, int) and not isinstance(previous, bool) and previous >= 0
        else 0
    )

    reason = convergence.get("reason")
    if isinstance(reason, str) and reason in CONVERGENCE_BASIS_CHANGED_REASONS:
        return _reset_streak(debate, state, count)

    max_delta = convergence.get("maxDelta")
    epsilon = convergence.get("epsilon")
    if not (_is_real_number(max_delta) and _is_real_number(epsilon)):
        return count
    if float(max_delta) > float(epsilon):
        # Observed movement. UNGATED on purpose -- see THE ONE PRINCIPLE above.
        # The wave is deliberately not marked consumed: a reset is not a count.
        return _reset_streak(debate, state, count)

    rounds = rounds_completed(debate)
    if rounds == 0:
        return count
    if run_id is not None and run_id == state.get(CONVERGED_WAVE_RUN_KEY):
        return count
    last_round = state.get(CONVERGED_WAVE_ROUND_KEY)
    if isinstance(last_round, int) and not isinstance(last_round, bool) and rounds <= last_round:
        return count

    count += 1
    state[CONVERGED_WAVES_KEY] = count
    state[CONVERGED_WAVE_RUN_KEY] = run_id
    state[CONVERGED_WAVE_ROUND_KEY] = rounds
    _write_adaptive_expansion_state(debate, state)
    return count


def _annotate_and_stop(
    db: Session,
    debate: Debate,
    dispatchable: list[LifecycleDecisionRecord],
    *,
    reason: str,
    outcome: str,
) -> None:
    """Record a whole-debate stop, annotating every record it refused.

    The stop returns before the dispatch loop, so without this every record the
    pass was handed would keep a NULL dispatch_outcome -- a silent drop, and
    the pre-change code would have annotated each of them. Only NULLs are
    filled: a record that genuinely spawned on an earlier pass keeps
    ``spawned``, because overwriting it would have the audit trail deny an
    expansion whose job is sitting in the jobs table.
    """
    for record in dispatchable:
        if record.dispatch_outcome is None:
            record.dispatch_outcome = outcome
    record_adaptive_stop(db, debate, reason)
    commit_write(db)


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

    P1 Task 7: two WHOLE-DEBATE stop conditions run before the per-record
    dispatch loop -- the debate's wall clock, and convergence hysteresis (two
    consecutive waves whose max strength drift stayed within epsilon). Either
    one ends growth for the debate rather than for this pass, so each records
    its own stopped_because AND annotates every record it declined to
    consider; neither leaves an audited record silently un-outcomed.
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

    # P1 Task 7: whole-debate stop conditions, checked BEFORE any ranking (the
    # ranker's per-node judge-evidence reads are pointless on a pass that is
    # stopping) but AFTER the records are in hand, so the early return can
    # still annotate everything it refuses instead of dropping it silently.
    #
    # Wall clock first, and it returns WITHOUT touching the convergence
    # counter. The counter measures consecutive settled waves as OBSERVED by
    # the dispatcher; a pass that never looked at the frontier observed no
    # wave, and recording one would corrupt the streak of a debate that is
    # ending for an unrelated reason anyway.
    #
    # The stamp goes in BEFORE the read, not after: the clock bounds how long
    # a debate may keep GROWING, so a debate's first flag-on pass must measure
    # ~0 however old its row is. Reading first would make the flag flip stop
    # every pre-existing debate in production on its first pass.
    _mark_growth_started(debate)
    if growth_elapsed_seconds(debate) >= debate_wall_clock_seconds():
        _annotate_and_stop(
            db, debate, dispatchable, reason=STOPPED_WALL_CLOCK, outcome=OUTCOME_WALL_CLOCK
        )
        return

    convergence_run_id, convergence = _latest_convergence(db, debate_id)
    if _record_convergence_wave(debate, convergence_run_id, convergence) >= (
        REQUIRED_CONSECUTIVE_CONVERGED_WAVES
    ):
        _annotate_and_stop(
            db, debate, dispatchable, reason=STOPPED_CONVERGED, outcome=OUTCOME_CONVERGED
        )
        return
    # Not stopping: the counter's mutation stays uncommitted here and joins
    # this pass's own commit at the tail of the dispatch loop below (or is
    # rolled back with it). adaptive_expansion_state re-reads debate.config, so
    # the tail's bookkeeping preserves it rather than clobbering it.

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
