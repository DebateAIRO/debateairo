from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import bearer_token, require_user_token
from app.core.db import get_db
from app.core.write_lock import commit_write
from app.exploration.expansion_dispatch import adaptive_expansion_enabled, admit_and_spawn
from app.models.entities import Debate, Job, Node, NodeFeedbackVote, NodeScoringResult, now_utc
from app.providers import ProviderRegistry, detect_codex_scoring_config
from app.scoring import AdaptiveDepthDryRunItem, DebateScoringResponse
from app.scoring import get_adaptive_depth_dry_run as get_adaptive_depth_dry_run_payload
from app.scoring import get_debate_scoring as get_debate_scoring_payload
from app.scoring import queue_scoring_job
from app.scoring import record_approved_adaptive_expansion
from app.scoring import score_debate_with_provider_registry
from app.scoring.jobs import run_scoring_job_background, wake_pending_internal_scoring_job
from app.scoring.models import ManualInvestigationRequest, ManualInvestigationResponse
from app.scoring.service import (
    ACTIVE_SCORING_JOB_STATUSES,
    STALE_SCORING_JOB_ERROR,
    UNAVAILABLE_SCORING_JOB_ERROR,
    attach_feedback_to_scoring_payload,
    fail_unavailable_scoring_job,
    feedback_summary_for_nodes,
)
from app.services.job_ledger import record_job_transition
from app.services.orchestrator import regenerate_node

router = APIRouter(prefix="/api/debates", tags=["scoring"])

MAX_ADAPTIVE_DEPTH_APPROVAL_EXPANSIONS = 3


class AdaptiveDepthApprovalRequest(BaseModel):
    debate_id: str
    selected_node_ids: list[str] = Field(min_length=1)
    approval_reason: str | None = None


class ScoringFeedbackRequest(BaseModel):
    vote: Literal["up", "down"]


class ScoringFeedbackSummary(BaseModel):
    node_id: str
    up: int
    down: int


class CurrentUserScoringFeedbackVote(BaseModel):
    node_id: str
    vote: Literal["up", "down"]


class DebateScoringWithFeedbackResponse(DebateScoringResponse):
    feedback_summary: list[ScoringFeedbackSummary] | None = None
    current_user_votes: list[CurrentUserScoringFeedbackVote] | None = None


def scoring_provider_registry_dependency() -> ProviderRegistry:
    return ProviderRegistry()


def public_scoring_job_status(status: str) -> str:
    if status == "pending":
        return "queued"
    if status in {"claimed", "running"}:
        return "running"
    if status in {"complete", "failed"}:
        return status
    return "failed"


@router.get("/{debate_id}/scoring/jobs/{job_id}")
def get_scoring_job_status(
    debate_id: str,
    job_id: str,
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    debate = db.get(Debate, debate_id)
    if not debate or debate.status == "archived":
        raise HTTPException(status_code=404, detail="Scoring job not found")
    job = db.get(Job, job_id)
    if not job or job.debate_id != debate.id or job.job_type != "score_debate":
        raise HTTPException(status_code=404, detail="Scoring job not found")
    _expire_stale_scoring_job(db, job)
    payload = {
        "debate_id": debate.id,
        "job_id": job.id,
        "status": public_scoring_job_status(job.status),
    }
    if job.status == "failed" and job.error:
        payload["error"] = job.error
    return payload


def _expire_stale_scoring_job(db: Session, job: Job) -> None:
    if job.status not in ACTIVE_SCORING_JOB_STATUSES or job.deadline >= now_utc():
        return
    record_job_transition(
        db,
        job,
        from_status=job.status,
        to_status="failed",
        channel="scoring_stale",
        reason=STALE_SCORING_JOB_ERROR,
    )
    job.status = "failed"
    job.error = STALE_SCORING_JOB_ERROR
    commit_write(db)


@router.post("/{debate_id}/scoring/jobs", status_code=status.HTTP_202_ACCEPTED)
def start_scoring_job(
    debate_id: str,
    background_tasks: BackgroundTasks,
    db: Annotated[Session, Depends(get_db)],
    authorization: Annotated[str | None, Header()] = None,
) -> dict:
    require_user_token(bearer_token(authorization), db)
    debate = db.get(Debate, debate_id)
    if not debate or debate.status == "archived":
        raise HTTPException(status_code=404, detail="Debate not found")
    registry = scoring_provider_registry_dependency()
    scoring_config = detect_codex_scoring_config(registry.agents, role="judge")
    if not scoring_config.available or scoring_config.model is None:
        job = fail_unavailable_scoring_job(
            db,
            debate,
            model_id=scoring_config.model or "",
            reason=UNAVAILABLE_SCORING_JOB_ERROR,
        )
    else:
        job = queue_scoring_job(db, debate, model_id=scoring_config.model)
    commit_write(db)
    if job.status != "failed":
        background_tasks.add_task(_run_scoring_job_background, job.id, debate.id)
    payload = {
        "debate_id": debate.id,
        "job_id": job.id,
        "status": public_scoring_job_status(job.status),
    }
    if job.status == "failed" and job.error:
        payload["error"] = job.error
    return payload


def _run_scoring_job_background(job_id: str, debate_id: str) -> None:
    # The EXPLICIT user-invoked POST /{debate_id}/scoring/jobs start: force a
    # full refresh (run_scoring_job_background's default force_refresh=True) --
    # the user asked for a fresh judging of every node (T20).
    run_scoring_job_background(
        job_id,
        debate_id,
        registry_factory=scoring_provider_registry_dependency,
        scoring_runner=score_debate_with_provider_registry,
    )


def _resume_scoring_job_background(job_id: str, debate_id: str) -> None:
    # Task 22 Fix B sub-cause 2: the browser-poll wake is a RETRY of an existing
    # pending/stale scoring job (a partial or failed prior pass), NOT a fresh
    # user request. Resume from the NodeScoringResult input-hash cache
    # (force_refresh=False) so a retry re-judges only the uncached tail instead
    # of RESTARTING every node -- cumulative passes then converge and the final
    # one persists the aggregated run, rather than each retry re-hitting the
    # deadline from scratch. A cold cache still judges every node (cache miss),
    # so the FIRST pass of a never-scored debate is unaffected. The explicit
    # POST above keeps force_refresh=True.
    run_scoring_job_background(
        job_id,
        debate_id,
        registry_factory=scoring_provider_registry_dependency,
        scoring_runner=score_debate_with_provider_registry,
        force_refresh=False,
    )


def _wake_pending_internal_scoring_job(db: Session, debate: Debate, background_tasks: BackgroundTasks) -> Job | None:
    return wake_pending_internal_scoring_job(
        db,
        debate,
        background_tasks,
        registry_factory=scoring_provider_registry_dependency,
        background_runner=_resume_scoring_job_background,
    )


@router.get("/{debate_id}/scoring", response_model=DebateScoringWithFeedbackResponse, response_model_exclude_none=True)
def get_debate_scoring(
    debate_id: str,
    background_tasks: BackgroundTasks,
    db: Annotated[Session, Depends(get_db)],
    authorization: Annotated[str | None, Header()] = None,
    force_refresh: bool = Query(False),
) -> dict:
    raw_user_token = None
    if authorization is not None:
        raw_user_token = bearer_token(authorization)
        require_user_token(raw_user_token, db)
    if force_refresh:
        # Transitional manual refresh path; user-facing real scoring refreshes
        # should move through queued job/status endpoints.
        require_user_token(raw_user_token or bearer_token(authorization), db)
        debate = db.get(Debate, debate_id)
        if not debate or debate.status == "archived":
            raise HTTPException(status_code=404, detail="Debate not found")
        provider_registry = scoring_provider_registry_dependency()
        payload = score_debate_with_provider_registry(db, debate, provider_registry, force_refresh=True)
        commit_write(db)
        return attach_feedback_to_scoring_payload(db, payload, raw_user_token=raw_user_token)
    debate = db.get(Debate, debate_id)
    if not debate or debate.status == "archived":
        raise HTTPException(status_code=404, detail="Debate not found")
    _wake_pending_internal_scoring_job(db, debate, background_tasks)
    payload = get_debate_scoring_payload(db, debate_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Debate not found")
    return attach_feedback_to_scoring_payload(db, payload, raw_user_token=raw_user_token)


@router.post("/{debate_id}/scoring/nodes/{node_id}/feedback")
def submit_scoring_feedback(
    debate_id: str,
    node_id: str,
    payload: ScoringFeedbackRequest,
    db: Annotated[Session, Depends(get_db)],
    authorization: Annotated[str | None, Header()] = None,
) -> dict:
    raw_user_token = bearer_token(authorization)
    require_user_token(raw_user_token, db)
    debate = db.get(Debate, debate_id)
    node = db.get(Node, node_id)
    if not debate or debate.status == "archived" or not node or node.debate_id != debate.id or node.status == "stale":
        raise HTTPException(status_code=404, detail="Debate node not found")
    scoring_result_id = _latest_node_scoring_result_id(db, debate_id=debate.id, node_id=node.id)
    NodeFeedbackVote.upsert(
        db,
        debate_id=debate.id,
        node_id=node.id,
        raw_user_token=raw_user_token,
        vote=payload.vote,
        scoring_result_id=scoring_result_id,
    )
    commit_write(db)
    summary = feedback_summary_for_nodes(db, [node.id])
    return {
        "debate_id": debate.id,
        "node_id": node.id,
        "vote": payload.vote,
        "current_user_vote": payload.vote,
        "feedback_summary": summary[0] if summary else {"node_id": node.id, "up": 0, "down": 0},
    }


def _latest_node_scoring_result_id(db: Session, *, debate_id: str, node_id: str) -> str | None:
    return db.scalar(
        select(NodeScoringResult.id)
        .where(NodeScoringResult.debate_id == debate_id, NodeScoringResult.node_id == node_id)
        .order_by(NodeScoringResult.updated_at.desc(), NodeScoringResult.created_at.desc(), NodeScoringResult.id.desc())
        .limit(1)
    )


@router.post(
    "/{debate_id}/scoring/manual-investigations",
    response_model=ManualInvestigationResponse,
    response_model_exclude_none=False,
)
async def start_manual_investigation(
    debate_id: str,
    payload: ManualInvestigationRequest,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
    authorization: Annotated[str | None, Header()] = None,
) -> dict:
    require_user_token(bearer_token(authorization), db)
    if payload.debate_id != debate_id:
        raise HTTPException(status_code=400, detail="Request debate_id does not match path")
    debate = db.get(Debate, debate_id)
    node = db.get(Node, payload.node_id)
    if not debate or debate.status == "archived" or not node or node.debate_id != debate.id or node.status == "stale":
        raise HTTPException(status_code=404, detail="Debate node not found")
    if payload.action == "ask_user":
        return _manual_investigation_unavailable(
            payload,
            "No existing backend orchestration path is wired for ask_user.",
        )

    scoring_payload = get_debate_scoring_payload(db, debate_id)
    if not _scoring_payload_contains_requested_hole(scoring_payload, payload):
        return _manual_investigation_unavailable(
            payload,
            "Requested scoring hole is not available for this node.",
        )
    try:
        job = await regenerate_node(db, node)
    except ValueError as exc:
        return _manual_investigation_unavailable(payload, str(exc))

    response.status_code = status.HTTP_202_ACCEPTED
    return ManualInvestigationResponse(
        debate_id=payload.debate_id,
        node_id=payload.node_id,
        action=payload.action,
        status="queued",
        job_id=job.id,
    ).model_dump(mode="json")


def _manual_investigation_unavailable(payload: ManualInvestigationRequest, reason: str) -> dict:
    return ManualInvestigationResponse(
        debate_id=payload.debate_id,
        node_id=payload.node_id,
        action=payload.action,
        status="unavailable",
        reason=reason,
    ).model_dump(mode="json")


def _scoring_payload_contains_requested_hole(scoring_payload: dict | None, payload: ManualInvestigationRequest) -> bool:
    if not scoring_payload or scoring_payload.get("status") not in {"available", "partial"}:
        return False
    requested_hole = payload.hole.model_dump(mode="json")
    for item in scoring_payload.get("items") or []:
        if not isinstance(item, dict) or item.get("node_id") != payload.node_id:
            continue
        holes = item.get("holes")
        if isinstance(holes, list) and requested_hole in holes:
            return True
    return False


@router.get("/{debate_id}/scoring/adaptive-depth/dry-run")
def get_adaptive_depth_dry_run(
    debate_id: str,
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    payload = get_adaptive_depth_dry_run_payload(db, debate_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Debate not found")
    return payload


# Default 200 (the W0/B4 honesty fix): with DIALECTICAL_ADAPTIVE_EXPANSION
# off, nothing is "accepted for processing" -- the approval is recorded
# synchronously and no work runs. With the flag on, W4 queues real
# v2_expand work and the applied path answers 202 explicitly.
@router.post("/{debate_id}/scoring/adaptive-depth/approvals", status_code=status.HTTP_200_OK)
async def approve_adaptive_depth_expansion(
    debate_id: str,
    payload: AdaptiveDepthApprovalRequest,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
    authorization: Annotated[str | None, Header()] = None,
) -> dict:
    require_user_token(bearer_token(authorization), db)
    if payload.debate_id != debate_id:
        raise HTTPException(status_code=400, detail="Request debate_id does not match path")
    debate = db.get(Debate, debate_id)
    if not debate or debate.status == "archived":
        raise HTTPException(status_code=404, detail="Debate not found")

    dry_run = get_adaptive_depth_dry_run_payload(db, debate_id)
    if dry_run is None:
        raise HTTPException(status_code=404, detail="Debate not found")
    if dry_run.get("status") not in {"available", "partial"}:
        response.status_code = status.HTTP_200_OK
        return _adaptive_depth_approval_unavailable(payload, str(dry_run.get("reason") or "No dry-run plan is available."))

    requested_node_ids = _unique_nonempty_node_ids(payload.selected_node_ids)
    selectable_items = _selected_adaptive_expand_items(dry_run, requested_node_ids)
    if len(selectable_items) != len(requested_node_ids):
        response.status_code = status.HTTP_200_OK
        return _adaptive_depth_approval_unavailable(
            payload,
            "Selected nodes are not available as adaptive expand recommendations.",
            unavailable_node_ids=requested_node_ids,
        )
    if len(selectable_items) > MAX_ADAPTIVE_DEPTH_APPROVAL_EXPANSIONS:
        response.status_code = status.HTTP_200_OK
        return _adaptive_depth_approval_unavailable(
            payload,
            _adaptive_depth_approval_limit_reason(MAX_ADAPTIVE_DEPTH_APPROVAL_EXPANSIONS),
            unavailable_node_ids=requested_node_ids,
        )

    recorded_items = []
    unavailable_node_ids = []
    for item in selectable_items:
        node = db.get(Node, item.node_id)
        if not node or node.debate_id != debate.id or node.status == "stale":
            unavailable_node_ids.append(item.node_id)
            continue
        recorded_items.append(item)

    if not recorded_items:
        response.status_code = status.HTTP_200_OK
        return _adaptive_depth_approval_unavailable(
            payload,
            "No selected adaptive depth nodes could be approved for expansion.",
            unavailable_node_ids=requested_node_ids,
        )

    audit_record = record_approved_adaptive_expansion(
        db,
        debate,
        recorded_items,
        approval_reason=payload.approval_reason,
    )
    commit_write(db)
    if not adaptive_expansion_enabled():
        # W0 honesty fix (B4): approved "expand" items are recorded for audit
        # but deliberately queue NO work. The old route (regenerate_node) was
        # not an expansion -- it staled the node's whole subtree and rerouted
        # v2 debates through the destructive v1 argue/synthesize pipeline.
        # W4's real expansion path below is flag-gated (default OFF); with
        # the flag off the outcome stays exactly this honest W0 shape.
        response.status_code = status.HTTP_200_OK
        return {
            "debate_id": debate.id,
            "status": "recorded",
            "selected_node_ids": requested_node_ids,
            "queued_node_ids": [],
            "unavailable_node_ids": unavailable_node_ids,
            "jobs": [],
            "outcomes": [
                {"node_id": item.node_id, "applied": False, "reason": "expansion_not_yet_supported"}
                for item in recorded_items
            ],
            "audit_record_id": audit_record.id,
        }

    # W4 (flag ON): explicit user approval is categorical grounding -- queue
    # REAL v2_expand jobs through the same primitive, budgets, and capacity
    # admission as the adaptive dispatcher. The dry-run's depth-pressure
    # reasons are scrutiny signals (unanswered challenges, high-severity
    # holes), so an approved expansion probes the node with a CON child.
    outcomes: list[dict] = []
    jobs_payload: list[dict] = []
    queued_node_ids: list[str] = []
    for item in recorded_items:
        node = db.get(Node, item.node_id)
        job, outcome = admit_and_spawn(
            db,
            debate,
            node,
            polarity="CON",
            reason=_user_approved_expansion_reason(item, payload.approval_reason),
        )
        if job is None:
            outcomes.append({"node_id": item.node_id, "applied": False, "reason": outcome})
            continue
        # Audit linkage travels with the job (additive payload key).
        job.payload = {**(job.payload or {}), "approval_audit_id": audit_record.id}
        queued_node_ids.append(item.node_id)
        jobs_payload.append({"node_id": item.node_id, "job_id": job.id, "status": "queued"})
        outcomes.append(
            {"node_id": item.node_id, "applied": True, "reason": "expansion_queued", "job_id": job.id}
        )
    # Real applied outcomes join the audit record written above.
    audit_record.metadata_json = {**audit_record.metadata_json, "applied_outcomes": outcomes}
    commit_write(db)

    if not queued_node_ids:
        refusals = sorted({str(outcome.get("reason")) for outcome in outcomes})
        response.status_code = status.HTTP_200_OK
        return {
            "debate_id": debate.id,
            "status": "unavailable",
            "selected_node_ids": requested_node_ids,
            "queued_node_ids": [],
            "unavailable_node_ids": unavailable_node_ids or requested_node_ids,
            "jobs": [],
            "outcomes": outcomes,
            "audit_record_id": audit_record.id,
            "reason": "No approved expansion could be queued ({}).".format(", ".join(refusals)),
        }
    response.status_code = status.HTTP_202_ACCEPTED
    return {
        "debate_id": debate.id,
        "status": "queued" if len(queued_node_ids) == len(recorded_items) and not unavailable_node_ids else "partial",
        "selected_node_ids": requested_node_ids,
        "queued_node_ids": queued_node_ids,
        "unavailable_node_ids": unavailable_node_ids,
        "jobs": jobs_payload,
        "outcomes": outcomes,
        "audit_record_id": audit_record.id,
    }


def _user_approved_expansion_reason(item: AdaptiveDepthDryRunItem, approval_reason: str | None) -> str:
    parts = [reason.strip() for reason in item.reasons if isinstance(reason, str) and reason.strip()]
    summary = "; ".join(parts) or "adaptive depth pressure flagged this node for expansion"
    approved = (approval_reason or "").strip()
    if approved:
        return f"User-approved adaptive expansion ({approved}): {summary}"
    return f"User-approved adaptive expansion: {summary}"


def _unique_nonempty_node_ids(node_ids: list[str]) -> list[str]:
    selected = []
    seen = set()
    for node_id in node_ids:
        if not isinstance(node_id, str):
            continue
        normalized = node_id.strip()
        if normalized and normalized not in seen:
            seen.add(normalized)
            selected.append(normalized)
    return selected


def _selected_adaptive_expand_items(dry_run: dict, selected_node_ids: list[str]) -> list[AdaptiveDepthDryRunItem]:
    selected = set(selected_node_ids)
    plan = dry_run.get("plan") if isinstance(dry_run.get("plan"), dict) else {}
    items = plan.get("items") if isinstance(plan.get("items"), list) else []
    expand_items = []
    for item in items:
        validated = AdaptiveDepthDryRunItem.model_validate(item)
        if validated.node_id in selected and validated.expansion_hint == "expand":
            expand_items.append(validated)
    return [item for node_id in selected_node_ids for item in expand_items if item.node_id == node_id]


def _adaptive_depth_approval_unavailable(
    payload: AdaptiveDepthApprovalRequest,
    reason: str,
    *,
    unavailable_node_ids: list[str] | None = None,
) -> dict:
    selected_node_ids = _unique_nonempty_node_ids(payload.selected_node_ids)
    return {
        "debate_id": payload.debate_id,
        "status": "unavailable",
        "selected_node_ids": selected_node_ids,
        "queued_node_ids": [],
        "unavailable_node_ids": unavailable_node_ids or selected_node_ids,
        "jobs": [],
        "audit_record_id": None,
        "reason": reason,
    }


def _adaptive_depth_approval_limit_reason(max_expansions: int) -> str:
    expansion_label = "expansion" if max_expansions == 1 else "expansions"
    return f"Adaptive depth approval is limited to {max_expansions} {expansion_label} per request."
