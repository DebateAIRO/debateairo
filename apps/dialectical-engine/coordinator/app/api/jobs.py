from __future__ import annotations

from typing import Annotated, Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from starlette.requests import ClientDisconnect

from app.core.auth import require_worker_header
from app.core.db import get_db
from app.models.entities import Job, Worker
from app.services.orchestrator import (
    MUTABLE_JOB_STATUSES,
    StaleJobMutationError,
    StreamOffsetError,
    append_stream_delta_sync,
    complete_job_sync,
    fail_job_sync,
    readopt_job_claim,
)

# 2026-07-26 pool-exhaustion follow-up (same defect class as workers.poll,
# path 6 of that sweep): these endpoints are async -- /stream must consume
# request.stream() on the event loop -- so any DB call made directly in their
# bodies runs ON the loop, where a single pool wait (up to pool_timeout=30s on
# a saturated pool) or complete_job's 1.3-2.1s debate_to_dict freezes every
# other request on the coordinator. Every blocking call below therefore runs
# via run_in_threadpool: the job lookup, the orchestrator cores, and the
# post-commit attribute reads (a commit expires ORM instances, so even
# `job.status` afterwards is a refresh SELECT). The calls within one request
# are strictly sequential, so sharing the request session across threadpool
# hops is safe. Pinned by tests/test_jobs_offloop.py.

router = APIRouter(prefix="/api/jobs", tags=["jobs"])
MAX_FAIL_REASON_CHARS = 2_000


class StreamRequest(BaseModel):
    delta: str
    offset: Optional[int] = Field(default=None, ge=0)


class CompleteRequest(BaseModel):
    result: Any
    tokens_in: Optional[int] = Field(default=None, ge=0)
    tokens_out: Optional[int] = Field(default=None, ge=0)
    latency_ms: Optional[int] = Field(default=None, ge=0)


class FailRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=MAX_FAIL_REASON_CHARS)
    retryable: bool = True


def require_job_for_worker(job_id: str, worker: Worker, db: Session) -> Job:
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.worker_id != worker.id:
        if not readopt_job_claim(db, job, worker):
            raise HTTPException(status_code=403, detail="Job is not claimed by this worker")
    if job.status not in MUTABLE_JOB_STATUSES:
        raise HTTPException(status_code=409, detail=f"Job is {job.status} and cannot be mutated")
    return job


@router.post("/{job_id}/stream")
async def stream_delta(
    job_id: str,
    request: Request,
    worker: Annotated[Worker, Depends(require_worker_header)],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, str]:
    job = await run_in_threadpool(require_job_for_worker, job_id, worker, db)
    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        payload = StreamRequest.model_validate(await request.json())
        try:
            await run_in_threadpool(append_stream_delta_sync, db, job, payload.delta, payload.offset)
        except StaleJobMutationError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except StreamOffsetError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=413, detail=str(exc)) from exc
    else:
        try:
            # The chunk reads stay on the loop (genuinely async I/O); each
            # chunk's claim-check/buffer-write/commit goes to the threadpool.
            async for chunk in request.stream():
                if chunk:
                    try:
                        await run_in_threadpool(
                            append_stream_delta_sync, db, job, chunk.decode("utf-8", errors="replace")
                        )
                    except StaleJobMutationError as exc:
                        raise HTTPException(status_code=409, detail=str(exc)) from exc
                    except ValueError as exc:
                        raise HTTPException(status_code=413, detail=str(exc)) from exc
        except ClientDisconnect:
            return {"status": "client_disconnected"}
    return {"status": "ok"}


@router.post("/{job_id}/complete")
async def complete(
    job_id: str,
    payload: CompleteRequest,
    worker: Annotated[Worker, Depends(require_worker_header)],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    job = await run_in_threadpool(require_job_for_worker, job_id, worker, db)
    metadata = {
        "tokens_in": payload.tokens_in,
        "tokens_out": payload.tokens_out,
        "latency_ms": payload.latency_ms or 0,
    }
    try:
        return await run_in_threadpool(complete_job_sync, db, job, payload.result, metadata)
    except StaleJobMutationError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/{job_id}/fail")
async def fail(
    job_id: str,
    payload: FailRequest,
    worker: Annotated[Worker, Depends(require_worker_header)],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, str]:
    job = await run_in_threadpool(require_job_for_worker, job_id, worker, db)
    try:
        return {"status": await run_in_threadpool(_fail_job_and_report, db, job, payload.reason, payload.retryable)}
    except StaleJobMutationError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


def _fail_job_and_report(db: Session, job: Job, reason: str, retryable: bool) -> str:
    fail_job_sync(db, job, reason, retryable)
    # A retryable failure may still land terminal when the job's attempt
    # budget is exhausted -- report the real outcome, not the request's wish.
    # Read job.status HERE: fail_job_sync committed, expiring the ORM
    # instance, so this read is a refresh SELECT that must stay on the worker
    # thread (same idiom as workers._claim_pending_job_warm).
    return "queued" if job.status == "pending" else "failed"
