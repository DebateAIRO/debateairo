# Phase 0: Runtime Lifecycle Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Workers and scoring jobs get product-grade lifecycle semantics: restarts never strand jobs, identity desync self-heals, readiness reports honest states.

**Architecture:** Worker registers/heartbeats BEFORE slow adapter probing (probes run concurrently); identity desync (401/404, name collision) recovers via token rotation instead of crashing; the coordinator requeues a polling worker's own orphaned job; readiness distinguishes `starting` workers from `online`; a read-only `dev-guardian` script reports the same truth model.

**Tech Stack:** Python 3.12, httpx, FastAPI, SQLAlchemy, pytest (worker suite: `cd worker && python -m pytest tests`; coordinator suite: `cd coordinator && python -m pytest tests`).

## Global Constraints

- Never fake green: guardian and readiness report real states only.
- No DB deletion as recovery — identity recovery uses token rotation (`rotate_token=True`), which already requeues that worker's jobs server-side.
- No wire DTO renames. New heartbeat statuses extend the existing `Literal` — additive only.
- Worker must never crash on coordinator-restart races or identity desync; it logs and recovers.
- Existing suites stay green with coverage floors (worker ≥70% on app/adapters, coordinator ≥70% on app/services): run `make test` at the end.
- Follow existing test patterns in `worker/tests/` and `coordinator/tests/` — reuse their fixtures/monkeypatch style; do not invent new bootstrap.

**Verified ground truth (dev @ 98071c7 lineage):**
- `worker/app/main.py:214-255` `worker_loop`: `detect_adapters()` runs BEFORE client creation/registration; probes are sequential (`codex` 10s, `gemini` 30s, `grok` 5s timeouts) → up to ~47s invisible window on every restart.
- `worker/app/client.py:52-71` `register()`: short-circuits when config has id+token; raises fatal `RuntimeError` when coordinator preserves an existing name's token (returns `worker_token: None`).
- `worker/app/main.py:92-97`: 401/404 are non-retryable → heartbeat/poll after DB reset crashes the worker permanently.
- `coordinator/app/services/orchestrator.py:669+` `claim_pending_job`: requeues deadline-expired jobs only; a job claimed by a restarted worker stays stuck until deadline while the worker heartbeats happily.
- `coordinator/app/api/workers.py:36-38` `HeartbeatRequest.status: Literal["online","offline","degraded"]`; `orchestrator.py:454-461` `capable_online_workers` excludes only `status != "offline"` + last_seen cutoff.
- `coordinator/app/api/workers.py:89-92`: `rotate_token=True` already calls `requeue_active_jobs_for_worker` — reuse, don't reinvent.

---

### Task 1: Concurrent adapter probes + register-before-probe

**Files:**
- Modify: `worker/app/capabilities.py` (`detect_adapters`)
- Modify: `worker/app/main.py` (`worker_loop`)
- Modify: `worker/app/config.py` (`WorkerConfig`, `load_config`, `save_config`)
- Test: `worker/tests/test_startup_lifecycle.py` (new)

**Interfaces:**
- Produces: `WorkerConfig.last_capabilities: list[str] | None` (persisted); `detect_adapters` unchanged signature but concurrent probing; `worker_loop` registers + heartbeats(`"starting"`) before probing whenever config already has `worker_id`, `worker_token`, and `last_capabilities`.

- [ ] **Step 1: Write failing tests**

```python
# worker/tests/test_startup_lifecycle.py
import asyncio

import pytest

from app.capabilities import detect_adapters
from app.config import WorkerConfig, load_config, save_config


def test_worker_config_persists_last_capabilities(tmp_path) -> None:
    path = tmp_path / "config.toml"
    config = WorkerConfig(worker_id="w1", worker_token="t1", last_capabilities=["model-a", "model-b"])
    save_config(config, path)
    loaded = load_config(path)
    assert loaded.last_capabilities == ["model-a", "model-b"]


@pytest.mark.asyncio
async def test_detect_adapters_probes_health_concurrently(monkeypatch) -> None:
    """Two fake adapters each wait for the other to start; only concurrent
    probing completes before the timeout."""
    started_a = asyncio.Event()
    started_b = asyncio.Event()

    class FakeAdapter:
        def __init__(self, model_id, my_event, other_event):
            self.model_id = model_id
            self.role_pool = {"proposer"}
            self._my = my_event
            self._other = other_event

        async def health_check(self) -> bool:
            self._my.set()
            await asyncio.wait_for(self._other.wait(), timeout=5)
            return True

    fake_a = FakeAdapter("fake-a", started_a, started_b)
    fake_b = FakeAdapter("fake-b", started_b, started_a)
    monkeypatch.setattr(
        "app.capabilities.candidate_adapters",
        lambda config: [fake_a, fake_b],
    )
    config = WorkerConfig(enable_mock=False, enable_real_adapters=True)
    adapters = await asyncio.wait_for(detect_adapters(config), timeout=10)
    assert set(adapters) == {"fake-a", "fake-b"}
```

NOTE: `capabilities.py` currently builds its candidate list inline. If no `candidate_adapters(config)` seam exists, extract one as part of this task (pure refactor: move the existing list construction into `candidate_adapters(config) -> list`, keep `detect_adapters` calling it) so the test can patch it. Adapt the fake's attributes to whatever `detect_adapters` reads from real adapters (check `capabilities.py` first).

- [ ] **Step 2: Run to verify failure**

Run: `cd worker && python -m pytest tests/test_startup_lifecycle.py -v`
Expected: FAIL (`last_capabilities` unexpected kwarg; concurrency test times out or errors)

- [ ] **Step 3: Implement**

`config.py`: add `last_capabilities: list[str] | None = None` to `WorkerConfig`; read it in `load_config`/`load_file_config` via `parse_model_list(data.get("last_capabilities"))` (no env override needed); write it in `save_config`'s data dict.

`capabilities.py`: extract candidate construction into `candidate_adapters(config)`; probe concurrently:

```python
async def detect_adapters(config: WorkerConfig) -> dict[str, ModelClient]:
    candidates = candidate_adapters(config)

    async def probe(adapter):
        try:
            return adapter, await adapter.health_check()
        except Exception:  # health probe failure = unhealthy, never fatal
            return adapter, False

    results = await asyncio.gather(*(probe(a) for a in candidates))
    adapters = {a.model_id: a for a, healthy in results if healthy}
    ...  # keep existing post-processing (allowed_models filter, aliases) unchanged
```

Preserve whatever ordering/filtering the current implementation applies after health checks — read the existing function fully first and keep its semantics; only the probing becomes concurrent.

`main.py` `worker_loop` — reorder startup:

```python
async def worker_loop(run_once: bool = False) -> None:
    config = load_config()
    client = CoordinatorClient(config)
    stop = asyncio.Event()
    ...  # signal handlers unchanged

    try:
        early_registered = False
        if config.worker_id and config.worker_token and config.last_capabilities:
            await register_with_backoff(client, config.last_capabilities, stop, status="starting")
            early_registered = True

        adapters = await detect_adapters(config)
        if not adapters:
            if early_registered:
                await client.heartbeat(config.last_capabilities, status="degraded")
            raise RuntimeError("No healthy model adapters detected")

        capabilities = sorted(adapters)
        if config.last_capabilities != capabilities:
            config.last_capabilities = capabilities
            save_config(config)
        if early_registered:
            await client.heartbeat(capabilities, status="online")
        else:
            await register_with_backoff(client, capabilities, stop)
        ...  # main poll loop unchanged
```

`register_with_backoff` gains `status: str = "online"` and passes it to the post-register heartbeat (`client.heartbeat(capabilities, status=status)`).

- [ ] **Step 4: Verify pass + suite green**

Run: `cd worker && python -m pytest tests -v`
Expected: new tests pass, all existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add worker/app/capabilities.py worker/app/main.py worker/app/config.py worker/tests/test_startup_lifecycle.py
git commit -m "feat(worker): register before probing; concurrent adapter health checks"
```

---

### Task 2: Self-healing worker identity

**Files:**
- Modify: `worker/app/client.py` (`register`)
- Modify: `worker/app/main.py` (`worker_loop` error handling; new `identity_desync_error`)
- Test: `worker/tests/test_identity_recovery.py` (new)

**Interfaces:**
- Consumes: Task 1's startup order.
- Produces: `identity_desync_error(exc) -> bool` in `main.py`; `register()` auto-retries name collisions with `rotate_token=True`; `worker_loop` recovers identity in the poll loop instead of crashing.

- [ ] **Step 1: Write failing tests**

```python
# worker/tests/test_identity_recovery.py
import httpx
import pytest

from app.client import CoordinatorClient
from app.config import WorkerConfig
from app.main import identity_desync_error


def _http_status_error(status: int, url: str = "http://localhost:8000/api/workers/w1/heartbeat") -> httpx.HTTPStatusError:
    request = httpx.Request("POST", url)
    response = httpx.Response(status, request=request)
    return httpx.HTTPStatusError("boom", request=request, response=response)


def test_identity_desync_detects_401_and_404() -> None:
    assert identity_desync_error(_http_status_error(401)) is True
    assert identity_desync_error(_http_status_error(404)) is True
    assert identity_desync_error(_http_status_error(500)) is False
    assert identity_desync_error(ValueError("x")) is False


@pytest.mark.asyncio
async def test_register_name_collision_auto_rotates(monkeypatch, tmp_path) -> None:
    """Coordinator preserving an existing name's token must trigger one
    automatic rotate_token retry instead of a fatal RuntimeError."""
    calls: list[dict] = []

    async def fake_post(self, url, **kwargs):
        payload = kwargs.get("json") or {}
        calls.append(payload)
        request = httpx.Request("POST", url)
        if payload.get("rotate_token"):
            return httpx.Response(
                200,
                request=request,
                json={"worker_id": "w-new", "worker_token": "tok-new", "name": "mac-mini", "capabilities": ["m"]},
            )
        return httpx.Response(
            200,
            request=request,
            json={"worker_id": "w-old", "worker_token": None, "name": "mac-mini", "capabilities": ["m"]},
        )

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)
    config = WorkerConfig(user_token="user-tok", name="mac-mini")
    client = CoordinatorClient(config)
    await client.register(["m"], persist=True, save_path=tmp_path / "config.toml")
    assert config.worker_id == "w-new"
    assert config.worker_token == "tok-new"
    assert [c.get("rotate_token", False) for c in calls] == [False, True]
```

- [ ] **Step 2: Run to verify failure**

Run: `cd worker && python -m pytest tests/test_identity_recovery.py -v`
Expected: FAIL (`identity_desync_error` not defined; register raises RuntimeError)

- [ ] **Step 3: Implement**

`client.py` `register()` — replace the fatal branch:

```python
        if not payload.get("worker_token"):
            if rotate_token:
                raise RuntimeError(
                    "Coordinator refused to issue a worker token even with rotate_token; "
                    "check user_token permissions."
                )
            print(
                f"Worker name '{self.config.name}' already registered; rotating token to recover identity.",
                flush=True,
            )
            return await self.register(
                capabilities, persist=persist, save_path=save_path, rotate_token=True
            )
```

`main.py` — add the classifier and recovery in the poll loop:

```python
def identity_desync_error(exc: Exception) -> bool:
    if not isinstance(exc, httpx.HTTPStatusError):
        return False
    return exc.response.status_code in {401, 404}
```

In `worker_loop`'s poll-loop `except Exception as exc` block, BEFORE the retryable check:

```python
            except Exception as exc:
                if identity_desync_error(exc):
                    print(f"Worker identity desync ({exc}); re-registering with token rotation.", flush=True)
                    client.config.worker_id = None
                    client.config.worker_token = None
                    await register_with_backoff(client, capabilities, stop, rotate_token=True)
                    continue
                if not retryable_coordinator_error(exc):
                    raise
                ...
```

`register_with_backoff` gains `rotate_token: bool = False`, forwarded to `client.register(capabilities, rotate_token=rotate_token)`. Note `client.register` short-circuits on existing id+token UNLESS `rotate_token` — that existing behavior (client.py:52) already handles this correctly.

- [ ] **Step 4: Verify pass + suite green**

Run: `cd worker && python -m pytest tests -v`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add worker/app/client.py worker/app/main.py worker/tests/test_identity_recovery.py
git commit -m "feat(worker): self-heal identity desync via token rotation"
```

---

### Task 3: Coordinator requeues a polling worker's orphaned job

**Files:**
- Modify: `coordinator/app/services/orchestrator.py` (`claim_pending_job`, ~line 669)
- Test: `coordinator/tests/test_orphaned_job_requeue.py` (new)

**Interfaces:**
- Consumes: nothing new.
- Produces: a worker that polls while `worker.current_job_id` references a `claimed`/`running` job it owns gets that job released to `pending` first (reason recorded in `job.error`), so restarts never strand jobs until deadline.

- [ ] **Step 1: Write failing test**

```python
# coordinator/tests/test_orphaned_job_requeue.py
# Reuse the session fixture + factory helpers used by existing orchestrator
# tests (search coordinator/tests for tests exercising claim_pending_job and
# copy their setup for Debate/Node/Job/Worker rows).
from app.services.orchestrator import claim_pending_job


def test_polling_worker_with_orphaned_running_job_requeues_it_first(db_session, seeded_debate) -> None:
    worker = make_worker(db_session, capabilities=["model-a"])
    job = make_job(db_session, required_model="model-a", status="running", worker=worker)
    worker.current_job_id = job.id
    db_session.flush()

    claimed = claim_pending_job(db_session, worker)

    db_session.refresh(job)
    # The orphaned job was released; the worker may then re-claim it (fine) —
    # what must never happen is the job staying claimed/running for a worker
    # that is polling for new work.
    assert job.error == "Worker restarted while job was active"
    assert (claimed is None and job.status == "pending" and job.worker_id is None) or (
        claimed is not None and claimed.id == job.id and job.claimed_at is not None
    )


def test_polling_worker_does_not_touch_other_workers_jobs(db_session, seeded_debate) -> None:
    worker_a = make_worker(db_session, capabilities=["model-a"], name="a")
    worker_b = make_worker(db_session, capabilities=["model-b"], name="b")
    job_b = make_job(db_session, required_model="model-b", status="running", worker=worker_b)
    worker_b.current_job_id = job_b.id
    db_session.flush()

    claim_pending_job(db_session, worker_a)

    db_session.refresh(job_b)
    assert job_b.status == "running"
    assert job_b.worker_id == worker_b.id
```

- [ ] **Step 2: Run to verify failure**

Run: `cd coordinator && python -m pytest tests/test_orphaned_job_requeue.py -v`
Expected: FAIL (job stays `running`, no error recorded)

- [ ] **Step 3: Implement**

At the top of `claim_pending_job`, before the deadline-expiry sweep:

```python
    if worker.current_job_id:
        orphaned = db.get(Job, worker.current_job_id)
        if (
            orphaned is not None
            and orphaned.worker_id == worker.id
            and orphaned.status in {"claimed", "running"}
        ):
            orphaned.status = "pending"
            release_job_claim(db, orphaned)
            reset_job_target_for_retry(db, orphaned)
            orphaned.stream_buffer = ""
            orphaned.error = "Worker restarted while job was active"
            orphaned.deadline = make_deadline()
        else:
            worker.current_job_id = None
```

(This mirrors the existing deadline-expiry block a few lines below — same release/reset/buffer/deadline sequence, different reason string. Do NOT refactor the two into a helper in this task; note it for the final review instead.)

- [ ] **Step 4: Verify pass + suite green**

Run: `cd coordinator && python -m pytest tests/test_orphaned_job_requeue.py -v` then `cd coordinator && python -m pytest tests -v -k "orchestrator or claim or job"`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add coordinator/app/services/orchestrator.py coordinator/tests/test_orphaned_job_requeue.py
git commit -m "feat(coordinator): requeue a polling worker's orphaned job"
```

---

### Task 4: Honest lifecycle states in heartbeat + readiness

**Files:**
- Modify: `coordinator/app/api/workers.py` (`HeartbeatRequest.status` Literal)
- Modify: `coordinator/app/services/orchestrator.py` (`capable_online_workers`)
- Test: `coordinator/tests/test_worker_lifecycle_states.py` (new)

**Interfaces:**
- Consumes: Task 1 sends `status="starting"` / `"degraded"` heartbeats.
- Produces: heartbeat accepts `Literal["online", "offline", "degraded", "starting", "recovering_identity", "blocked_auth"]`; `capable_online_workers` counts ONLY `status == "online"` workers (plus the existing last_seen cutoff) — a `starting`/`recovering_identity`/`blocked_auth`/`degraded`/`offline` worker can never satisfy V2 readiness.

- [ ] **Step 1: Write failing tests**

```python
# coordinator/tests/test_worker_lifecycle_states.py
# Reuse existing fixtures for workers (see tests exercising capable_online_workers
# or backends/status). Two API-level tests + one service-level test:

def test_heartbeat_accepts_lifecycle_states(client_with_worker) -> None:
    for status in ("starting", "recovering_identity", "blocked_auth", "degraded", "online"):
        response = post_heartbeat(client_with_worker, status=status)
        assert response.status_code == 200, status
        assert response.json()["status"] == status


def test_non_online_workers_do_not_satisfy_capability_readiness(db_session) -> None:
    from app.services.orchestrator import capable_online_workers

    for status in ("starting", "recovering_identity", "blocked_auth", "degraded", "offline"):
        worker = make_worker(db_session, capabilities=["gpt-5.6sol-medium"], name=f"w-{status}")
        worker.status = status
        worker.last_seen = now_utc()
    online = make_worker(db_session, capabilities=["gpt-5.6sol-medium"], name="w-online")
    online.status = "online"
    online.last_seen = now_utc()
    db_session.flush()

    result = capable_online_workers(db_session, "gpt-5.6sol-medium")
    assert [w.name for w in result] == ["w-online"]
```

BEHAVIOR CHANGE NOTE: today `degraded` workers count as capable (filter is `status != "offline"`). This task intentionally tightens to `status == "online"` per the lifecycle contract ("dead/stale worker cannot satisfy real V2 readiness"). If any existing test asserts degraded workers are routable, that test's expectation must be updated to the new contract — flag it in the report rather than weakening this rule silently.

- [ ] **Step 2: Run to verify failure**

Run: `cd coordinator && python -m pytest tests/test_worker_lifecycle_states.py -v`
Expected: FAIL (422 on new statuses; degraded/starting workers included)

- [ ] **Step 3: Implement**

`workers.py`:

```python
class HeartbeatRequest(BaseModel):
    capabilities: Optional[list[str]] = None
    status: Literal["online", "offline", "degraded", "starting", "recovering_identity", "blocked_auth"] = "online"
```

`orchestrator.py` `capable_online_workers` (and the identical filter at ~line 132 if present — check both sites found by `grep -n 'status != "offline"' coordinator/app/services/orchestrator.py`):

```python
    workers = db.scalars(select(Worker).where(Worker.last_seen >= cutoff, Worker.status == "online")).all()
```

- [ ] **Step 4: Verify pass + suite green**

Run: `cd coordinator && python -m pytest tests -v`
Expected: all pass (update any test that asserted the old degraded-is-routable behavior, per the note above).

- [ ] **Step 5: Commit**

```bash
git add coordinator/app/api/workers.py coordinator/app/services/orchestrator.py coordinator/tests/test_worker_lifecycle_states.py
git commit -m "feat(coordinator): honest worker lifecycle states gate readiness"
```

---

### Task 5: dev-guardian (Track A)

**Files:**
- Create: `scripts/dev_guardian.py`
- Modify: `Makefile` (new `dev-guardian` target, near the existing `dev:` target)
- Test: `coordinator/tests/test_dev_guardian.py` (new — the script is import-tested like other scripts; follow the pattern of existing `scripts/*.py` tests such as `test_verify_worker_visible.py`)

**Interfaces:**
- Consumes: `/api/backends/status` (which already marks stale workers offline and requeues their jobs server-side — the guardian triggers truth, it does not invent it).
- Produces: `python scripts/dev_guardian.py --base-url URL [--interval-seconds N] [--once]` — polls backends/status + v2 readiness, prints one honest status line per tick, exit code 0 only when readiness is `ready`; `make dev-guardian`.

- [ ] **Step 1: Write failing tests**

```python
# coordinator/tests/test_dev_guardian.py
import importlib.util
import sys
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "dev_guardian.py"


def load_module():
    spec = importlib.util.spec_from_file_location("dev_guardian", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_summarize_reports_ready_state() -> None:
    module = load_module()
    line = module.summarize_status(
        {
            "v2_generation_readiness": {"ready": True, "reason": "Real gpt-5.6sol-medium worker is online.", "reason_code": "ready"},
            "workers": [{"name": "w1", "status": "online", "current_job_id": None, "capabilities": ["gpt-5.6sol-medium"]}],
        }
    )
    assert "ready" in line
    assert "w1:online" in line


def test_summarize_reports_blocked_states_honestly() -> None:
    module = load_module()
    line = module.summarize_status(
        {
            "v2_generation_readiness": {"ready": False, "reason": "A real gpt-5.6sol-medium worker is known but stale or not currently online.", "reason_code": "stale_real_worker"},
            "workers": [{"name": "w1", "status": "starting", "current_job_id": "j1", "capabilities": ["gpt-5.6sol-medium"]}],
        }
    )
    assert "NOT READY" in line
    assert "stale_real_worker" in line
    assert "w1:starting" in line
    assert "job=j1" in line


def test_exit_code_contract() -> None:
    module = load_module()
    assert module.exit_code_for({"v2_generation_readiness": {"ready": True}}) == 0
    assert module.exit_code_for({"v2_generation_readiness": {"ready": False}}) == 1
    assert module.exit_code_for({}) == 2  # unknown state is an error, never fake green
```

- [ ] **Step 2: Run to verify failure**

Run: `cd coordinator && python -m pytest tests/test_dev_guardian.py -v`
Expected: FAIL (script missing)

- [ ] **Step 3: Implement**

```python
# scripts/dev_guardian.py
"""Local dev guardian: honest worker/readiness truth on a loop.

Read-only by design: it calls /api/backends/status, whose server-side logic
already marks stale workers offline and requeues their jobs. The guardian
reports; it never fakes green and never mutates state client-side.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.request


def fetch_status(base_url: str, token: str | None) -> dict:
    request = urllib.request.Request(f"{base_url.rstrip('/')}/api/backends/status")
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


def summarize_status(payload: dict) -> str:
    readiness = payload.get("v2_generation_readiness") or {}
    workers = payload.get("workers") or []
    worker_bits = []
    for worker in workers:
        bit = f"{worker.get('name')}:{worker.get('status')}"
        if worker.get("current_job_id"):
            bit += f" job={worker['current_job_id']}"
        worker_bits.append(bit)
    state = "ready" if readiness.get("ready") else f"NOT READY ({readiness.get('reason_code', 'unknown')})"
    reason = readiness.get("reason", "")
    workers_text = ", ".join(worker_bits) if worker_bits else "no workers"
    return f"[dev-guardian] {state} — {reason} — workers: {workers_text}"


def exit_code_for(payload: dict) -> int:
    readiness = payload.get("v2_generation_readiness")
    if not isinstance(readiness, dict) or "ready" not in readiness:
        return 2
    return 0 if readiness.get("ready") else 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Honest local readiness guardian")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--user-token", default=None)
    parser.add_argument("--interval-seconds", type=float, default=15.0)
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()

    while True:
        try:
            payload = fetch_status(args.base_url, args.user_token)
        except Exception as exc:  # noqa: BLE001 - guardian reports, never crashes the loop
            print(f"[dev-guardian] COORDINATOR UNREACHABLE — {exc}", flush=True)
            payload = {}
        print(summarize_status(payload) if payload else "", flush=True)
        if args.once:
            return exit_code_for(payload)
        time.sleep(args.interval_seconds)


if __name__ == "__main__":
    sys.exit(main())
```

Makefile (after the `dev:` target block, matching existing style):

```make
dev-guardian:
	$(PYTHON_ENV) "$(PYTHON)" scripts/dev_guardian.py --base-url "$(COORDINATOR_URL)" --user-token "$$DIALECTICAL_USER_TOKEN"
```

- [ ] **Step 4: Verify pass**

Run: `cd coordinator && python -m pytest tests/test_dev_guardian.py -v`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add scripts/dev_guardian.py Makefile coordinator/tests/test_dev_guardian.py
git commit -m "feat(dev): dev-guardian honest readiness loop (Track A)"
```
