from __future__ import annotations

import asyncio
import contextlib
import time
from collections import defaultdict, deque
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import debates, jobs, nodes, ops, qbaf, scoring, settings, workers
from app.core.auth import ensure_user_token
from app.core.config import load_settings
from app.core.db import SessionLocal, get_engine, init_db
from app.core.instance_lock import acquire_single_instance_lock, release_single_instance_lock
from app.scoring.jobs import recover_orphaned_scoring_jobs_at_startup
from app.services.reaper import reaper_loop

settings_obj = load_settings()
RATE_LIMIT_WINDOW_SECONDS = 60


def run_startup_tasks() -> None:
    init_db()
    with SessionLocal() as db:
        settings.apply_persisted_runtime_settings(db)
        token = ensure_user_token(db, settings_obj.user_token)
    if token:
        print("Dialectical Engine user token (shown once):", token, flush=True)


@asynccontextmanager
async def lifespan(app_: FastAPI) -> AsyncIterator[None]:
    # W5b single-instance guard: refuse to become a second writer on this
    # database BEFORE touching the schema. Raising here fails startup fast
    # with the lock error (override: DIALECTICAL_ALLOW_MULTI_INSTANCE=1).
    instance_lock_key = acquire_single_instance_lock(str(get_engine().url))
    reaper_stop = asyncio.Event()
    reaper_task: asyncio.Task[None] | None = None
    recovery_task: asyncio.Task[list[str]] | None = None
    try:
        run_startup_tasks()
        # W5b reaper: with zero polling workers an expired claim would sit
        # forever (the claim-path reaper only runs when a worker polls).
        reaper_task = asyncio.create_task(reaper_loop(reaper_stop), name="dialectical-reaper")
        app_.state.reaper_task = reaper_task
        # F2: recover score_debate jobs orphaned by a prior coordinator
        # restart (the reaper deliberately excludes score_debate, so nothing
        # else does). One-shot, off the event loop so its blocking DB work and
        # possible re-score never delay serving; best-effort and non-fatal.
        recovery_task = asyncio.create_task(
            asyncio.to_thread(recover_orphaned_scoring_jobs_at_startup),
            name="dialectical-scoring-recovery",
        )
        app_.state.scoring_recovery_task = recovery_task
        yield
    finally:
        reaper_stop.set()
        if reaper_task is not None:
            try:
                await asyncio.wait_for(reaper_task, timeout=5)
            except (asyncio.TimeoutError, TimeoutError):  # pragma: no cover - hung sweep
                reaper_task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await reaper_task
        if recovery_task is not None and not recovery_task.done():  # pragma: no cover - fast shutdown
            recovery_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await recovery_task
        release_single_instance_lock(instance_lock_key)


app = FastAPI(title="Dialectical Engine Coordinator", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings_obj.web_origin, "http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(debates.router)
app.include_router(nodes.router)
app.include_router(workers.router)
app.include_router(jobs.router)
app.include_router(settings.router)
app.include_router(qbaf.router)
app.include_router(scoring.router)
app.include_router(ops.router)

_public_hits: dict[str, deque[float]] = defaultdict(deque)


def public_client_ip(request: Request) -> str:
    cloudflare_ip = request.headers.get("cf-connecting-ip")
    if cloudflare_ip:
        return cloudflare_ip.strip()
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip()
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else "unknown"


def is_public_read_path(path: str) -> bool:
    if path == "/api/debates" or path == "/api/backends/status":
        return True
    if not path.startswith("/api/debates/"):
        return False
    return path.endswith("/events") or path.endswith("/export.md") or path.endswith("/scoring") or path.count("/") == 3


def prune_public_hits(now: float) -> None:
    for client, bucket in list(_public_hits.items()):
        while bucket and bucket[0] < now - RATE_LIMIT_WINDOW_SECONDS:
            bucket.popleft()
        if not bucket:
            _public_hits.pop(client, None)


@app.middleware("http")
async def public_rate_limit(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    public_read = request.method == "GET" and is_public_read_path(request.url.path)
    if public_read:
        client = public_client_ip(request)
        now = time.monotonic()
        prune_public_hits(now)
        bucket = _public_hits[client]
        while bucket and bucket[0] < now - RATE_LIMIT_WINDOW_SECONDS:
            bucket.popleft()
        if len(bucket) >= settings_obj.public_rate_limit_per_minute:
            return JSONResponse({"detail": "Rate limit exceeded"}, status_code=429)
        bucket.append(now)
    return await call_next(request)


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}
