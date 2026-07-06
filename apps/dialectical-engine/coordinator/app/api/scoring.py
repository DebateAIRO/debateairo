from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import bearer_token, require_user_token
from app.core.db import get_db
from app.core.write_lock import commit_write
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
    run_scoring_job_background(
        job_id,
        debate_id,
        registry_factory=scoring_provider_registry_dependency,
        scoring_runner=score_debate_with_provider_registry,
    )


def _wake_pending_internal_scoring_job(db: Session, debate: Debate, background_tasks: BackgroundTasks) -> Job | None:
    return wake_pending_internal_scoring_job(
        db,
        debate,
        background_tasks,
        registry_factory=scoring_provider_registry_dependency,
        background_runner=_run_scoring_job_background,
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


@router.post("/{debate_id}/scoring/adaptive-depth/approvals", status_code=status.HTTP_202_ACCEPTED)
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

    jobs = []
    queued_items = []
    unavailable_node_ids = []
    for item in selectable_items:
        node = db.get(Node, item.node_id)
        if not node or node.debate_id != debate.id or node.status == "stale":
            unavailable_node_ids.append(item.node_id)
            continue
        try:
            job = await regenerate_node(db, node)
        except ValueError:
            unavailable_node_ids.append(item.node_id)
            continue
        queued_items.append(item)
        jobs.append({"node_id": item.node_id, "job_id": job.id, "status": public_scoring_job_status(job.status)})

    if not jobs:
        response.status_code = status.HTTP_200_OK
        return _adaptive_depth_approval_unavailable(
            payload,
            "No selected adaptive depth nodes could be queued for expansion.",
            unavailable_node_ids=requested_node_ids,
        )

    audit_record = record_approved_adaptive_expansion(
        db,
        debate,
        queued_items,
        approval_reason=payload.approval_reason,
    )
    commit_write(db)
    return {
        "debate_id": debate.id,
        "status": "queued" if not unavailable_node_ids else "partial",
        "selected_node_ids": requested_node_ids,
        "queued_node_ids": [item.node_id for item in queued_items],
        "unavailable_node_ids": unavailable_node_ids,
        "jobs": jobs,
        "audit_record_id": audit_record.id,
    }


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
