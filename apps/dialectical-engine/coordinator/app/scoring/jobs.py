from __future__ import annotations

from collections.abc import Callable
from datetime import timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import bool_env
from app.core.db import SessionLocal
from app.core.write_lock import commit_write
from app.exploration.scoring_completion_lifecycle import reevaluate_lifecycle_after_scoring_completion
from app.models.entities import AnalyzerRun, Debate, DebateBranch, Job, JudgeOutputArtifact, next_analyzer_run_seq, now_utc
from app.providers import ProviderError, ProviderRegistry, detect_scoring_provider_config
from app.services.orchestrator import max_job_attempts
from app.scoring.service import (
    JUDGE_OUTPUT_SOURCE,
    SCORING_ANALYZER_TYPE,
    STALE_SCORING_JOB_ERROR,
    RegistryScoringProvider,
    queue_scoring_job,
    score_debate_with_provider_registry,
)


SCORING_BACKGROUND_JOB_DEADLINE_SECONDS = 30 * 60
SCORING_JOB_COMPLETION_PERSISTENCE_ERROR = (
    "Failed to persist scoring job completion after judge artifacts were produced."
)
SCORING_JOB_MISSING_ARTIFACTS_ERROR = "No durable judge output artifacts were persisted for this scoring job."
SCORING_JOB_MISSING_NODE_ARTIFACTS_ERROR = "Missing durable judge output artifacts for scoring job nodes."
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
    db.flush()
    return branch


def run_scoring_job_background(
    job_id: str,
    debate_id: str,
    *,
    registry_factory: RegistryFactory = ProviderRegistry,
    scoring_runner: ScoringRunner = score_debate_with_provider_registry,
) -> None:
    with SessionLocal() as db:
        job = db.get(Job, job_id)
        debate = db.get(Debate, debate_id)
        if not job or not debate or debate.status == "archived":
            return
        registry = registry_factory()
        job.status = "running"
        job.deadline = now_utc() + timedelta(seconds=SCORING_BACKGROUND_JOB_DEADLINE_SECONDS)
        job.error = None
        commit_write(db)
        try:
            scoring_payload = scoring_runner(db, debate, registry, force_refresh=True)
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
            job.status = "complete"
            job.error = None
            try:
                commit_write(db)
            except Exception:
                db.rollback()
                _mark_scoring_job_failed(job_id, SCORING_JOB_COMPLETION_PERSISTENCE_ERROR)
                return
        except Exception as exc:
            db.rollback()
            job.status = "failed"
            job.error = str(exc)
            commit_write(db)
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
        reevaluate_lifecycle_after_scoring_completion(
            db,
            debate_id=debate.id,
            job_id=job.id,
            analyzer_run_id=new_run.id,
            **lifecycle_kwargs,
        )


def _mark_scoring_job_failed(job_id: str, error: str) -> None:
    with SessionLocal() as db:
        job = db.get(Job, job_id)
        if job is None:
            return
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
) -> Job | None:
    stale_jobs = db.scalars(
        select(Job).where(
            Job.debate_id == debate.id,
            Job.job_type == "score_debate",
            Job.status == "pending",
            Job.deadline < now_utc(),
        )
    ).all()
    for stale_job in stale_jobs:
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
        if _latest_retryable_stale_scoring_job(db, debate.id) is None:
            return None
        # W1 bounded failure lifecycle: stale expiries are timeout-class, so
        # the stale-requeue channel gets the doubled (half-weight) budget --
        # 2x DIALECTICAL_MAX_JOB_ATTEMPTS consecutive stale failures since the
        # last successful scoring run, then the channel stops requeuing.
        # Scores are advisory: nothing here ever touches debate.status.
        if _consecutive_stale_scoring_failures(db, debate.id) >= 2 * max_job_attempts():
            return None
    registry = registry_factory()
    scoring_config = detect_scoring_provider_config(
        registry.agents, role="judge", providers=registry.providers
    )
    if not scoring_config.available:
        return None
    if job is None:
        job = queue_scoring_job(db, debate, model_id=scoring_config.model or "", judge_role="judge")
    job.status = "claimed"
    job.deadline = now_utc() + timedelta(seconds=SCORING_BACKGROUND_JOB_DEADLINE_SECONDS)
    job.error = None
    commit_write(db)
    background_tasks.add_task(background_runner, job.id, debate.id)
    return job


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
