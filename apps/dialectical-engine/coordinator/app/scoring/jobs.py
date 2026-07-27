from __future__ import annotations

import logging
import threading
import time
from collections.abc import Callable
from datetime import timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import bool_env
from app.core.db import SessionLocal
from app.core.oplog import log_event
from app.core.write_lock import commit_write, flush_write, hold_write_lock
from app.exploration.expansion_dispatch import adaptive_expansion_enabled, expansion_dispatch
from app.exploration.scoring_completion_lifecycle import reevaluate_lifecycle_after_scoring_completion
from app.models.entities import AnalyzerRun, Debate, DebateBranch, Job, JudgeOutputArtifact, next_analyzer_run_seq, now_utc
from app.protocol.runner import run_protocol_analysis
from app.providers import ProviderError, ProviderRegistry, detect_scoring_provider_config
from app.scoring.judge_panel import panel_model_ids
from app.services.job_ledger import record_job_transition
from app.services.orchestrator import max_job_attempts
from app.scoring.service import (
    JUDGE_OUTPUT_SOURCE,
    SCORING_ANALYZER_TYPE,
    STALE_SCORING_JOB_ERROR,
    RegistryScoringProvider,
    _debate_node_ids,
    queue_scoring_job,
    score_debate_with_provider_registry,
)

LOGGER = logging.getLogger(__name__)


# Base (and single-judge) background scoring deadline. Task 22 Fix B keeps this
# as the panel-OFF value byte-identical: a single-judge pass completes well
# within 30 min, so compute_scoring_job_deadline_seconds returns exactly this
# whenever no panel is configured.
SCORING_BACKGROUND_JOB_DEADLINE_SECONDS = 30 * 60
# Task 22 Fix B sub-cause 1: per node, per configured panel judge (BEYOND the
# primary the base already covers). A panel pass adds one in-coordinator CLI
# judge call per node per panel judge, each up to ~120s; the 50-node x 3-judge
# smoke3 pass blew straight through the 30-min blanket deadline. The deadline is
# scaled by node count x panel-judge count so a large panel pass gets the wall-
# clock it actually needs.
#
# Trade-off (noted per the brief): F2 startup recovery of a restart-orphaned
# score_debate job is deadline-gated (recover_orphaned_scoring_jobs only resets
# rows whose deadline is already PAST), and the reaper deliberately excludes
# score_debate. So a larger panel deadline lengthens the window before a
# restart-orphaned panel job is recovered. This is the accepted cost of not
# prematurely expiring a legitimately long panel pass; single-judge (the common
# case) keeps the original 30-min window exactly.
SCORING_PANEL_PER_NODE_JUDGE_DEADLINE_SECONDS = 120


def compute_scoring_job_deadline_seconds(*, node_count: int, panel_judge_count: int) -> int:
    """Panel/size-aware background scoring deadline in seconds.

    Pure function of the pass size so it is unit-testable without a DB. Panel
    OFF (``panel_judge_count <= 0``) -- or an empty tree -- returns the base
    30-min deadline unchanged (single-judge byte-identical). Otherwise scales
    linearly: base + node_count * panel_judge_count * per-node-judge budget.
    """
    if panel_judge_count <= 0 or node_count <= 0:
        return SCORING_BACKGROUND_JOB_DEADLINE_SECONDS
    return (
        SCORING_BACKGROUND_JOB_DEADLINE_SECONDS
        + node_count * panel_judge_count * SCORING_PANEL_PER_NODE_JUDGE_DEADLINE_SECONDS
    )


def _scoring_job_deadline_seconds(db: Session, debate: Debate) -> int:
    """Resolve the size-aware deadline for THIS debate's next scoring pass:
    the count of nodes that will be scored (_debate_node_ids -- the exact set
    the pass judges) times the configured panel-judge count. Panel off -> the
    base deadline, so the single-judge path is unchanged."""
    return compute_scoring_job_deadline_seconds(
        node_count=len(_debate_node_ids(db, debate.id)),
        panel_judge_count=len(panel_model_ids()),
    )


SCORING_JOB_COMPLETION_PERSISTENCE_ERROR = (
    "Failed to persist scoring job completion after judge artifacts were produced."
)
SCORING_JOB_MISSING_ARTIFACTS_ERROR = "No durable judge output artifacts were persisted for this scoring job."
SCORING_JOB_MISSING_NODE_ARTIFACTS_ERROR = "Missing durable judge output artifacts for scoring job nodes."
# F2 (2026-07-24 incident): terminal error stamped on a score_debate job that a
# coordinator restart orphaned in claimed/running -- see
# recover_orphaned_scoring_jobs.
SCORING_JOB_ORPHANED_BY_RESTART_ERROR = "orphaned by coordinator restart"
RegistryFactory = Callable[[], ProviderRegistry]
ScoringRunner = Callable[..., dict]


def current_scoring_branch(db: Session, debate: Debate) -> DebateBranch:
    branch = db.scalars(
        select(DebateBranch)
        .where(DebateBranch.debate_id == debate.id)
        .order_by(DebateBranch.created_at.desc(), DebateBranch.id.desc())
        .limit(1)
    ).first()
    if branch is not None:
        return branch
    branch = DebateBranch(debate_id=debate.id, root_node_id=debate.root_node_id, status="active")
    db.add(branch)
    flush_write(db)
    return branch


def run_scoring_job_background(
    job_id: str,
    debate_id: str,
    *,
    registry_factory: RegistryFactory = ProviderRegistry,
    scoring_runner: ScoringRunner = score_debate_with_provider_registry,
    force_refresh: bool = True,
) -> None:
    # force_refresh defaults True so every EXPLICIT caller (the user-facing
    # POST /{debate_id}/scoring/jobs start endpoint and the browser-poll wake,
    # both via app.api.scoring._run_scoring_job_background) is byte-identical.
    # The internal completion/incremental drive passes False (see
    # _run_internal_scoring_job) so an incremental pass only (re)judges
    # new/changed nodes via the NodeScoringResult input-hash cache instead of
    # fully re-judging every live node on every branch-completion trigger.
    with SessionLocal() as db:
        job = db.get(Job, job_id)
        debate = db.get(Debate, debate_id)
        if not job or not debate or debate.status == "archived":
            return
        registry = registry_factory()
        run_started = time.monotonic()
        record_job_transition(
            db, job, from_status=job.status, to_status="running", channel="scoring_run"
        )
        job.status = "running"
        job.deadline = now_utc() + timedelta(seconds=_scoring_job_deadline_seconds(db, debate))
        job.error = None
        commit_write(db)
        try:
            scoring_payload = scoring_runner(db, debate, registry, force_refresh=force_refresh)
            if _scoring_payload_requires_judge_artifacts(scoring_payload):
                _ensure_job_has_required_judge_artifacts(db, job.id, scoring_payload)
            branch = current_scoring_branch(db, debate)
            new_run = AnalyzerRun(
                debate_id=debate.id,
                branch_id=branch.id,
                analyzer_type=SCORING_ANALYZER_TYPE,
                status="complete",
                output=scoring_payload,
                provenance={
                    "scoring_source": JUDGE_OUTPUT_SOURCE,
                    # Scope artifact linking to exactly this scoring
                    # operation (see _link_judge_artifacts_to_analyzer_run).
                    "job_id": job.id,
                    "node_ids": [
                        item["node_id"]
                        for item in scoring_payload.get("items", [])
                        if isinstance(item, dict) and isinstance(item.get("node_id"), str)
                    ],
                },
            )
            # next_analyzer_run_seq assigns new_run.seq, db.add()s, and
            # db.flush()es as one lock-covered critical section (see
            # app.models.entities) -- do not db.add() this row separately.
            next_analyzer_run_seq(db, new_run)
            record_job_transition(
                db, job, from_status="running", to_status="complete", channel="scoring_complete"
            )
            job.status = "complete"
            job.error = None
            try:
                commit_write(db)
            except Exception:
                db.rollback()
                _mark_scoring_job_failed(job_id, SCORING_JOB_COMPLETION_PERSISTENCE_ERROR)
                return
            log_event(
                LOGGER,
                "scoring.run",
                debate_id=debate_id,
                job_id=job_id,
                job_type="score_debate",
                outcome="complete",
                duration_ms=int((time.monotonic() - run_started) * 1000),
            )
        except Exception as exc:
            db.rollback()
            record_job_transition(
                db,
                job,
                from_status="running",
                to_status="failed",
                channel="scoring_fail",
                reason=str(exc),
            )
            job.status = "failed"
            job.error = str(exc)
            commit_write(db)
            log_event(
                LOGGER,
                "scoring.run",
                debate_id=debate_id,
                job_id=job_id,
                job_type="score_debate",
                outcome="failed",
                duration_ms=int((time.monotonic() - run_started) * 1000),
            )
            return
        lifecycle_kwargs: dict[str, object] = {}
        if bool_env("DIALECTICAL_EVIDENCE_VERIFICATION", False):
            try:
                lifecycle_kwargs["verification_provider"] = RegistryScoringProvider(registry)
            except ProviderError:
                # Scoring truth is already durable. Missing verifier transport
                # must leave lifecycle inputs unavailable rather than inventing
                # a verdict or retroactively failing the scoring operation.
                pass
        try:
            reevaluate_lifecycle_after_scoring_completion(
                db,
                debate_id=debate.id,
                job_id=job.id,
                analyzer_run_id=new_run.id,
                **lifecycle_kwargs,
            )
        finally:
            # W2: judge scores are durable (committed above) -- re-run
            # protocol analysis so the next verdict read consumes real taus
            # (appends a NEW protocol_analysis run; stored runs are never
            # rewritten). Best-effort both ways: a re-run failure never breaks
            # scoring completion or the lifecycle tail, and a lifecycle-tail
            # exception (which still propagates, as before) never skips the
            # re-run. run_protocol_analysis is itself non-raising; the except
            # is defense-in-depth.
            try:
                run_protocol_analysis(db, debate)
            except Exception:
                LOGGER.exception(
                    "post-scoring protocol analysis re-run failed (non-fatal) debate=%s",
                    debate_id,
                )
            # W4: adaptive expansion dispatch consumes this run's fresh
            # authenticated lifecycle decisions AFTER both the reevaluation
            # and the protocol re-run. Flag-checked at the call site (a
            # disabled deployment never invokes dispatch at all) and
            # best-effort: a dispatch failure never breaks scoring
            # completion or the lifecycle tail.
            if adaptive_expansion_enabled():
                dispatch_started = time.monotonic()
                try:
                    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=new_run.id)
                except Exception:
                    LOGGER.exception(
                        "adaptive expansion dispatch failed (non-fatal) debate=%s",
                        debate_id,
                    )
                    log_event(
                        LOGGER,
                        "expansion.dispatch",
                        debate_id=debate_id,
                        analyzer_run_id=new_run.id,
                        outcome="error",
                        duration_ms=int((time.monotonic() - dispatch_started) * 1000),
                    )
                else:
                    log_event(
                        LOGGER,
                        "expansion.dispatch",
                        debate_id=debate_id,
                        analyzer_run_id=new_run.id,
                        outcome="completed",
                        duration_ms=int((time.monotonic() - dispatch_started) * 1000),
                    )


def _mark_scoring_job_failed(job_id: str, error: str) -> None:
    with SessionLocal() as db:
        job = db.get(Job, job_id)
        if job is None:
            return
        record_job_transition(
            db, job, from_status=job.status, to_status="failed", channel="scoring_fail", reason=error
        )
        job.status = "failed"
        job.error = error
        job.deadline = now_utc()
        commit_write(db)


def _scoring_payload_requires_judge_artifacts(scoring_payload: dict) -> bool:
    return bool(_required_judge_artifact_node_ids(scoring_payload))


def _ensure_job_has_required_judge_artifacts(db: Session, job_id: str, scoring_payload: dict) -> None:
    required_node_ids = _required_judge_artifact_node_ids(scoring_payload)
    artifact_node_ids = set(
        db.scalars(
            select(JudgeOutputArtifact.node_id).where(
                JudgeOutputArtifact.job_id == job_id,
                JudgeOutputArtifact.node_id.in_(required_node_ids),
            )
        )
    )
    if not artifact_node_ids:
        raise RuntimeError(SCORING_JOB_MISSING_ARTIFACTS_ERROR)
    if any(node_id not in artifact_node_ids for node_id in required_node_ids):
        raise RuntimeError(SCORING_JOB_MISSING_NODE_ARTIFACTS_ERROR)


def _required_judge_artifact_node_ids(scoring_payload: dict) -> list[str]:
    node_ids = scoring_payload.get("node_ids")
    if not isinstance(node_ids, list):
        return []
    skipped_node_ids = {
        error.get("node_id")
        for error in scoring_payload.get("errors") or []
        if isinstance(error, dict)
        and isinstance(error.get("node_id"), str)
        and error.get("reason") == "Scoring node limit reached."
    }
    required_node_ids: list[str] = []
    seen: set[str] = set()
    for node_id in node_ids:
        if not isinstance(node_id, str) or node_id in skipped_node_ids or node_id in seen:
            continue
        required_node_ids.append(node_id)
        seen.add(node_id)
    return required_node_ids


def wake_pending_internal_scoring_job(
    db: Session,
    debate: Debate,
    background_tasks: Any,
    *,
    registry_factory: RegistryFactory = ProviderRegistry,
    background_runner: Callable[[str, str], None] = run_scoring_job_background,
    create_if_missing: bool = False,
) -> Job | None:
    # W2 idempotency: the find-and-claim below runs under the process-wide
    # write lock so the browser-poll thread(s) and the internal completion
    # trigger can never both observe the same pending job and double-run it.
    # The RLock is reentrant, so the nested commit_write/flush_write calls
    # inside this section are safe no-op re-entries.
    with hold_write_lock(db):
        # Establish a fresh read snapshot now that we hold the write lock. A
        # concurrent create+claim+commit (separate session) -- or a pass claimed
        # since this session's transaction began -- must be visible to the
        # find/active-job checks below, otherwise a second create_if_missing
        # caller (concurrent branch-completion trigger, or a trigger firing
        # while an earlier pass is still in flight) would miss the already-
        # claimed job and double-create. Under SQLite WAL a reader keeps its
        # pre-lock snapshot until its transaction ends, so drop it here. Safe:
        # callers hold no uncommitted writes at wake entry.
        db.rollback()
        stale_jobs = db.scalars(
            select(Job).where(
                Job.debate_id == debate.id,
                Job.job_type == "score_debate",
                Job.status == "pending",
                Job.deadline < now_utc(),
            )
        ).all()
        for stale_job in stale_jobs:
            record_job_transition(
                db,
                stale_job,
                from_status=stale_job.status,
                to_status="failed",
                channel="scoring_stale",
                reason=STALE_SCORING_JOB_ERROR,
            )
            stale_job.status = "failed"
            stale_job.error = STALE_SCORING_JOB_ERROR
        if stale_jobs:
            commit_write(db)

        job = db.scalars(
            select(Job)
            .where(
                Job.debate_id == debate.id,
                Job.job_type == "score_debate",
                Job.status == "pending",
                Job.deadline >= now_utc(),
            )
            .order_by(Job.created_at.desc(), Job.id.desc())
            .limit(1)
        ).first()
        if job is None:
            has_retryable_stale = _latest_retryable_stale_scoring_job(db, debate.id) is not None
            # Browser-poll semantics (create_if_missing False): only ever WAKE an
            # existing pending/stale job -- never create the first one. Cold-start
            # (create_if_missing True, the internal completion/incremental driver)
            # falls through to queue_scoring_job below so a fresh debate mid-
            # generation actually gets its first scoring pass.
            if not has_retryable_stale and not create_if_missing:
                return None
            # W1 bounded failure lifecycle: stale expiries are timeout-class, so
            # the stale-requeue channel gets the doubled (half-weight) budget --
            # 2x DIALECTICAL_MAX_JOB_ATTEMPTS consecutive stale failures since the
            # last successful scoring run, then the channel stops requeuing. This
            # budget still binds cold-start (a cold-start after a run of stale
            # failures must not bypass the exhausted budget); with no stale jobs
            # the count is 0, so a genuine cold-start proceeds. Scores are
            # advisory: nothing here ever touches debate.status.
            if _consecutive_stale_scoring_failures(db, debate.id) >= 2 * max_job_attempts():
                return None
            # Cold-start idempotency: create only when NO active (pending /
            # claimed / running) scoring job exists. A pending-only find misses a
            # pass that is already claimed or running, so without this guard a
            # concurrent branch-completion trigger -- or any trigger firing while
            # an earlier pass is still in flight -- would spin up a SECOND full
            # scoring pass (double judge cost, racing NodeScoringResult cache
            # writes). Runs under the write lock on a fresh snapshot (see the
            # db.rollback() above), so the check-then-create is atomic across
            # concurrent callers. Stale-requeue is unaffected: stale rows are
            # 'failed', never active.
            if create_if_missing and _active_scoring_job_exists(db, debate.id):
                return None
        registry = registry_factory()
        scoring_config = detect_scoring_provider_config(
            registry.agents, role="judge", providers=registry.providers
        )
        if not scoring_config.available:
            return None
        if job is None:
            job = queue_scoring_job(db, debate, model_id=scoring_config.model or "", judge_role="judge")
        record_job_transition(
            db, job, from_status=job.status, to_status="claimed", channel="scoring_wake"
        )
        job.status = "claimed"
        job.deadline = now_utc() + timedelta(seconds=_scoring_job_deadline_seconds(db, debate))
        job.error = None
        commit_write(db)
    background_tasks.add_task(background_runner, job.id, debate.id)
    return job


class _CollectedBackgroundTasks:
    """Minimal BackgroundTasks stand-in for the internal (no-request) drive:
    collect tasks during the wake, run them after the driving session closed
    -- the same run-after-response discipline FastAPI applies."""

    def __init__(self) -> None:
        self._tasks: list[tuple[Callable[..., None], tuple[Any, ...]]] = []

    def add_task(self, func: Callable[..., None], *args: Any) -> None:
        self._tasks.append((func, args))

    def run_all(self) -> None:
        for func, args in self._tasks:
            func(*args)


def _run_internal_scoring_job(job_id: str, debate_id: str) -> None:
    """Default background runner for the internal completion/incremental drive.

    Passes force_refresh=False so each incremental/completion pass only
    (re)judges new or changed nodes through the NodeScoringResult input-hash
    cache -- the T8 trigger fires on every branch completion, and re-judging
    every live node on each of those would multiply judge-provider cost/quota
    for no benefit (the cache already invalidates honestly on content/children/
    question changes). Explicit user-facing scoring keeps force_refresh=True
    (run_scoring_job_background's default; see that function's note).
    """
    run_scoring_job_background(job_id, debate_id, force_refresh=False)


def drive_internal_scoring_for_debate(
    debate_id: str,
    *,
    registry_factory: RegistryFactory = ProviderRegistry,
    background_runner: Callable[[str, str], None] = _run_internal_scoring_job,
) -> str | None:
    """One bounded wake of the debate's scoring state machine -- no HTTP.

    Reuses wake_pending_internal_scoring_job end-to-end: same pending-job
    claim dedup, same W1 stale-failure budget, same provider-absence bail-out
    (a test env without a scoring provider degrades to a silent no-op).
    As the internal completion/incremental driver it cold-starts
    (create_if_missing=True): a fresh debate mid-generation with no scoring job
    yet gets its FIRST one created + claimed here, rather than silently no-op'ing
    (the browser-poll waker keeps the create_if_missing=False default and only
    ever wakes an existing job). Exactly one wake per call -- retries stay owned
    by later browser polls. Returns the claimed scoring job's id, or None when
    nothing was woken.
    """
    tasks = _CollectedBackgroundTasks()
    with SessionLocal() as db:
        debate = db.get(Debate, debate_id)
        if debate is None or debate.status == "archived":
            return None
        job = wake_pending_internal_scoring_job(
            db,
            debate,
            tasks,
            registry_factory=registry_factory,
            background_runner=background_runner,
            create_if_missing=True,
        )
        job_id = job.id if job is not None else None
    tasks.run_all()
    return job_id


def recover_orphaned_scoring_jobs(
    db: Session,
    *,
    rescore: Callable[[str], Any] = drive_internal_scoring_for_debate,
) -> list[str]:
    """F2 (2026-07-24 incident): recover score_debate jobs orphaned by a
    coordinator restart.

    score_debate runs in an in-coordinator daemon thread
    (trigger_internal_scoring_after_completion -> drive_internal_scoring_for_
    debate -> run_scoring_job_background). A restart kills the thread and
    strands the row in claimed/running: the reaper deliberately EXCLUDES
    score_debate (reaping a *live* one would resurrect scoring and flip a
    complete debate back to "generating" -- see services/reaper.py), and
    _expire_stale_scoring_jobs only fails pending rows, so nothing else ever
    recovers it. In prod one such job sat "running" 9h after a restart with 0
    nodes scored, and _active_scoring_job_exists then blocked any replacement.

    Startup-only sweep, gated on a PAST deadline: a genuinely live in-process
    job holds a FUTURE deadline (run start refreshes it to now +
    SCORING_BACKGROUND_JOB_DEADLINE_SECONDS), so only truly orphaned rows are
    reset -- a healthy in-flight pass is never killed. Each orphan is failed
    to a non-active terminal state so _active_scoring_job_exists no longer
    counts it and a fresh pass can be created; then, for each affected debate
    that still needs scoring (not archived, not already fully scored --
    honoring the reaper's do-not-flip-complete-debates warning), scoring is
    re-driven once.

    Best-effort and bounded: each job and each re-drive is wrapped so one
    failure never aborts the rest, and this never raises (startup must not be
    blocked or crashed by recovery). Returns the debate ids re-driven.
    """
    now = now_utc()
    orphaned = db.scalars(
        select(Job).where(
            Job.job_type == "score_debate",
            Job.status.in_(("claimed", "running")),
            Job.deadline < now,
        )
    ).all()
    affected_debate_ids: list[str] = []
    for job in orphaned:
        try:
            record_job_transition(
                db,
                job,
                from_status=job.status,
                to_status="failed",
                channel="scoring_restart_recovery",
                reason=SCORING_JOB_ORPHANED_BY_RESTART_ERROR,
            )
            job.status = "failed"
            job.error = SCORING_JOB_ORPHANED_BY_RESTART_ERROR
            job.deadline = now
            commit_write(db)
        except Exception:  # noqa: BLE001 -- one job's failure must not abort recovery of the rest
            LOGGER.exception("failed to reset restart-orphaned scoring job %s", job.id)
            db.rollback()
            continue
        if job.debate_id not in affected_debate_ids:
            affected_debate_ids.append(job.debate_id)
    rescored: list[str] = []
    for debate_id in affected_debate_ids:
        try:
            if not _debate_still_needs_scoring(db, debate_id):
                continue
            rescore(debate_id)
            rescored.append(debate_id)
        except Exception:  # noqa: BLE001 -- one debate's re-drive failure must not abort the rest
            LOGGER.exception("restart scoring recovery re-drive failed for debate %s", debate_id)
            continue
    if orphaned:
        log_event(
            LOGGER,
            "scoring.restart_recovery",
            orphaned_job_count=len(orphaned),
            rescored_debate_count=len(rescored),
        )
    return rescored


def _debate_still_needs_scoring(db: Session, debate_id: str) -> bool:
    # Lazy import: app.services.dialectical_v2 imports this module at top level
    # (trigger_internal_scoring_after_completion), so a module-level import
    # here would be circular. Reuses the exact "all live argument nodes
    # scored" check the score-before-synthesis gate uses, so recovery never
    # re-scores a debate whose latest node_scoring run already covers its live
    # nodes (reaper.py:93 do-not-flip-complete-debates warning).
    from app.services.dialectical_v2 import all_live_argument_nodes_scored

    debate = db.get(Debate, debate_id)
    if debate is None or debate.status == "archived":
        return False
    return not all_live_argument_nodes_scored(db, debate)


def recover_orphaned_scoring_jobs_at_startup() -> list[str]:
    """Startup entrypoint for F2 recovery: open a session and sweep.

    Wraps recover_orphaned_scoring_jobs in its own session and a top-level
    guard so a coordinator restart's recovery can NEVER raise into or block
    lifespan startup -- the coordinator must always come up even if recovery
    fails. Intended to run off the event loop (it does blocking DB work and
    may re-drive a full scoring pass)."""
    try:
        with SessionLocal() as db:
            return recover_orphaned_scoring_jobs(db)
    except Exception:
        LOGGER.exception("restart scoring recovery sweep failed (non-fatal)")
        return []


def trigger_internal_scoring_after_completion(debate_id: str) -> threading.Thread | None:
    """Fire-and-forget internal scoring trigger for v2 completion (W2, B6).

    Best-effort is binding: never raises and never blocks the caller beyond
    starting a daemon thread -- completion/synthesis persistence must not be
    failed or delayed by scoring. On any failure (including inside the
    thread) the debate simply keeps the synthesis-time analysis. Returns the
    started thread (production callers ignore it; tests join it).
    """

    def _run() -> None:
        try:
            drive_internal_scoring_for_debate(debate_id)
        except Exception:
            LOGGER.exception(
                "internal scoring drive failed (non-fatal) debate=%s", debate_id
            )

    try:
        thread = threading.Thread(
            target=_run,
            name=f"internal-scoring-{debate_id}",
            daemon=True,
        )
        thread.start()
        return thread
    except Exception:
        LOGGER.exception(
            "internal scoring trigger failed (non-fatal) debate=%s", debate_id
        )
        return None


def _consecutive_stale_scoring_failures(db: Session, debate_id: str) -> int:
    """Stale-failed scoring jobs since the last successful scoring run."""
    last_complete_at = db.scalar(
        select(func.max(Job.created_at)).where(
            Job.debate_id == debate_id,
            Job.job_type == "score_debate",
            Job.status == "complete",
        )
    )
    query = (
        select(func.count())
        .select_from(Job)
        .where(
            Job.debate_id == debate_id,
            Job.job_type == "score_debate",
            Job.status == "failed",
            Job.error == STALE_SCORING_JOB_ERROR,
        )
    )
    if last_complete_at is not None:
        query = query.where(Job.created_at > last_complete_at)
    return int(db.scalar(query) or 0)


def _latest_retryable_stale_scoring_job(db: Session, debate_id: str) -> Job | None:
    return db.scalars(
        select(Job)
        .where(
            Job.debate_id == debate_id,
            Job.job_type == "score_debate",
            Job.status == "failed",
            Job.error == STALE_SCORING_JOB_ERROR,
        )
        .order_by(Job.created_at.desc(), Job.id.desc())
        .limit(1)
    ).first()


def _active_scoring_job_exists(db: Session, debate_id: str) -> bool:
    """True when a score_debate job for this debate is pending, claimed, or
    running -- i.e. a scoring pass is already queued or in flight. Used to keep
    cold-start (create_if_missing) from spinning up a duplicate concurrent pass;
    must be read on a fresh snapshot under the write lock (see
    wake_pending_internal_scoring_job)."""
    return (
        db.scalar(
            select(Job.id)
            .where(
                Job.debate_id == debate_id,
                Job.job_type == "score_debate",
                Job.status.in_(("pending", "claimed", "running")),
            )
            .limit(1)
        )
        is not None
    )
