# Bulletproof Job Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make debate generation survive slow, silent, crashed, or wedged workers of ANY model — uniformly — so a node only fails after every capable model has genuinely tried, and the UI never shows raw JSON or false "failed" banners.

**Architecture:** The coordinator (FastAPI + SQLite, `apps/dialectical-engine/coordinator`) hands jobs to workers over a claim/stream/complete HTTP protocol. Today a job's lease (~60–90s, `make_deadline()`) is only extended by stream deltas, so batch-style workers (claude/gemini/grok CLI loops, lmstudio) that go quiet for minutes get their claims torn away in a requeue doom-loop until the retry budget dies. This plan makes **any authenticated worker contact prove liveness** (poll/heartbeat/stream all slide the lease), adds a **hard 10-minute "stuck" cap** per assignment, lets a worker that finished late **re-adopt** its released claim, and adds a **cross-model failover ladder** so a stuck node is retried first by a fresh agent of the same model, then by the other models in the pool. The streaming JSON envelope is parsed server-side before it reaches the UI, and failure events become scope-honest.

**Tech Stack:** Python 3.13 / FastAPI / SQLAlchemy / Alembic (coordinator), pytest, Next.js + node:test source-pin tests (web), asyncio + subprocess (worker harnesses).

## Context an implementer needs (read this first)

- **Two worker styles exist and must be treated identically.**
  - The **codex worker** (`apps/dialectical-engine/worker/app/main.py`) streams tokens as they generate and already calls `client.heartbeat(...)` every 30s during a job (`handle_job_with_heartbeats`). Its jobs survive today only because stream deltas extend the lease.
  - The **loop harnesses** (`apps/dialectical-engine/scripts/subscription_loop.py`) claim a job, run a model CLI **synchronously and silently for minutes** (`claude_once` / `gemini_once` / `grok_once` use blocking `subprocess.run`), and only stream + complete at the end. The tmux "interactive claude" mode also polls on a timer while a job is in flight.
- **Where the bugs live** (all in `coordinator/app/services/orchestrator.py` unless noted):
  - `make_deadline()` = `now + max(worker_poll_seconds*2, job_fallback_seconds)` ≈ 60–90s.
  - `claim_pending_job(...)` requeues a worker's held job the moment that worker polls again ("Worker restarted while job was active") — even when the worker is mid-CLI-run.
  - The deadline sweep inside `claim_pending_job` requeues any claimed/running job past its deadline ("Job deadline expired").
  - `release_job_claim(...)` clears `job.worker_id`, so a worker that finishes after a requeue gets 403 from `require_job_for_worker` (`coordinator/app/api/jobs.py`) — finished answers are thrown away.
  - `fail_job(...)` retryable path publishes a `debate_failed` SSE event for v2 jobs (the frontend shows "Debate generation failed" forever on that event — `web/app/debate/[id]/DebatePageClient.tsx`, `debate_failed` listener).
  - `streaming_generation_summary(...)` (`coordinator/app/services/serialization.py`) serializes the raw `job.stream_buffer` (a JSON envelope `{"title": ..., "content": ...}`) as `argument` — that's the raw JSON users saw in the tree.
  - The debate header renders `debate.completion.humanReason`, which for `generation_exhausted` is the path-scoped copy "Generation failed after repeated attempts, so this path was set aside." (`coordinator/app/exploration/reason_copy.py`) — alarming next to a COMPLETE chip.
- **Test invocation (coordinator), run from `apps/dialectical-engine/coordinator`:**

  ```bash
  PYTHONPYCACHEPREFIX=/private/tmp/dialectical-test-pycache PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 \
  DYLD_LIBRARY_PATH=/opt/homebrew/opt/expat/lib ../.venv313/bin/python -m pytest \
  -p pytest_asyncio.plugin tests/<file> -q
  ```

- **Test style:** service-level, not HTTP. Use the `db` fixture from `tests/conftest.py` and mirror the `worker(db, name, capabilities)` helper from `tests/test_multi_model_generation.py` (creates a `Worker` ORM row directly). Async orchestrator functions are driven with `asyncio.run(...)`.
- **Web source-pin tests**, run from `apps/dialectical-engine/web`: `node --test 'app/**/*.source-test.mjs'`.
- **Commit style:** `feat(dialectical): ...` / `fix(dialectical): ...`, one commit per task, run the touched test file(s) plus `tests/test_orchestrator.py` before each commit.

## Global Constraints

- Uniformity: every rule applies to every model — no special-casing by model id (`score_debate` stays excluded; it has its own in-process state machine).
- All new knobs are env vars with bounded defaults read at decision time (match `int_env`/`bool_env` in `app/core/config.py`): `DIALECTICAL_JOB_STUCK_SECONDS` (default 600, bounds 60–3600), `DIALECTICAL_MODEL_FAILOVER` (default true).
- Never regress the W1 lifecycle contract: terminal v2_pov/v2_expand failures degrade only their branch (`terminalize_job_failure` NODE_DEGRADABLE path) and `_queue_synthesis_after_branch_failure` still fires.
- "Commit, then publish" event discipline: SSE events are emitted only after the DB commit that persists what they announce (see comments in `claim_pending_job`).
- TDD for every task: write the failing test, watch it fail, implement, watch it pass.
- No new Python dependencies.

## User-requirement → task map

| User requirement | Tasks |
|---|---|
| "Treat every AI the same" | 1, 3, 5 (uniform rules; codex heartbeats already exist and start counting via Task 1) |
| "Explicit InProgress + only stuck after 10 min + spawn another agent for that node" | 1, 2, 3 (liveness vs. stuck distinction), 5 (fresh same-model agent first, then other models) |
| "Raw JSON visible in frontend" | 6 |
| "Says Debate generation failed / alarming header" | 7 |
| "Multi-debate: workers know their nodeID, orchestrator tracks worker status, spawn as many workers as needed, only fail when nobody can do it" | 4, 5, 8, 9 (jobs already carry `node_id`/`debate_id` in the claim payload; slots add parallel workers; the failover ladder is the "only declare failure when no worker works" rule) |

**Scoped out (deliberately):** an auto-scaling supervisor that spawns/kills loop slots based on queue depth. Slots (Task 9) + failover (Task 5) already remove the single-worker bottleneck; auto-spawning CLI agents is unbounded spend and real ops surface. Revisit only if `/backends/status` shows sustained pending-job backlogs after this plan ships.

---

### Task 1: Any worker contact proves liveness

**Files:**
- Modify: `coordinator/app/services/orchestrator.py` (add `refresh_worker_job_leases`, call it in `claim_pending_job`)
- Modify: `coordinator/app/api/workers.py` (call it in the `heartbeat` endpoint)
- Test: `coordinator/tests/test_job_lifecycle.py` (new file)

**Interfaces:**
- Produces: `refresh_worker_job_leases(db: Session, worker: Worker) -> None` — slides `job.deadline` to `make_deadline()` for every claimed/running job held by `worker`. Tasks 2 and 8 rely on this exact name.

- [ ] **Step 1: Write the failing tests**

```python
"""Uniform job-lifecycle liveness: any authenticated worker contact (poll,
heartbeat, stream) proves the worker is alive and slides the lease of every
job it holds. The deadline sweep then only fires for genuinely silent
workers; the hard stuck cap (Task 3) bounds total time per assignment."""
from __future__ import annotations

from datetime import timedelta

from app.models.entities import Debate, Job, Node, Worker, now_utc
from app.services.orchestrator import (
    claim_pending_job,
    make_deadline,
    refresh_worker_job_leases,
)


def worker(db, name: str, capabilities: list[str]) -> Worker:
    row = Worker(
        name=name,
        token_hash="test-token",
        capabilities=capabilities,
        last_seen=now_utc(),
        status="online",
    )
    db.add(row)
    db.commit()
    return row


def make_debate_with_job(db, model: str = "gpt-5.6sol-medium") -> tuple[Debate, Job]:
    debate = Debate(topic="Liveness semantics for slow workers", status="generating", config={})
    db.add(debate)
    db.flush()
    node = Node(
        debate_id=debate.id,
        node_type="SCIENTIFIC_POV",
        depth=1,
        position=0,
        claim="Test POV",
        status="pending",
        materialized_path="0",
    )
    db.add(node)
    db.flush()
    job = Job(
        debate_id=debate.id,
        node_id=node.id,
        job_type="v2_pov",
        required_role="Test POV",
        required_model=model,
        status="pending",
        deadline=make_deadline(),
        idempotency_key=f"test-{debate.id}",
        stream_buffer="",
        attempts=0,
    )
    db.add(job)
    db.commit()
    return debate, job


def test_refresh_worker_job_leases_slides_held_job_deadlines(db):
    w = worker(db, "loop-1", ["claude-sonnet-5-high-loop"])
    _, job = make_debate_with_job(db, "claude-sonnet-5-high-loop")
    claimed = claim_pending_job(db, w)
    assert claimed is not None and claimed.id == job.id
    job.deadline = now_utc() - timedelta(seconds=5)
    db.commit()
    refresh_worker_job_leases(db, w)
    db.commit()
    db.refresh(job)
    assert job.deadline > now_utc()


def test_refresh_ignores_jobs_held_by_other_workers(db):
    w1 = worker(db, "loop-1", ["claude-sonnet-5-high-loop"])
    w2 = worker(db, "loop-2", ["gpt-5.6sol-medium"])
    _, job = make_debate_with_job(db, "claude-sonnet-5-high-loop")
    claim_pending_job(db, w1)
    stale = now_utc() - timedelta(seconds=5)
    job.deadline = stale
    db.commit()
    refresh_worker_job_leases(db, w2)
    db.commit()
    db.refresh(job)
    assert job.deadline == stale
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `coordinator/`): the standard pytest invocation with `tests/test_job_lifecycle.py -q`
Expected: FAIL — `ImportError: cannot import name 'refresh_worker_job_leases'`

- [ ] **Step 3: Implement `refresh_worker_job_leases` and wire it**

In `coordinator/app/services/orchestrator.py`, next to `release_job_claim`:

```python
def refresh_worker_job_leases(db: Session, worker: Worker) -> None:
    """Any authenticated contact from a worker (poll, heartbeat, stream)
    proves liveness for every job it holds: slide those leases so the
    deadline sweep only fires for workers that have actually gone silent.
    The hard stuck cap still bounds total time per assignment."""
    held = db.scalars(
        select(Job).where(Job.worker_id == worker.id, Job.status.in_(["claimed", "running"]))
    ).all()
    for job in held:
        job.deadline = make_deadline()
```

Wire into `claim_pending_job` — at the very top of the function body (before the orphan-check block), add:

```python
    refresh_worker_job_leases(db, worker)
```

Wire into the heartbeat endpoint in `coordinator/app/api/workers.py` — inside `heartbeat(...)`, after `worker.last_seen = now_utc()` and before `commit_write(db)`:

```python
    refresh_worker_job_leases(db, worker)
```

(import it alongside the other orchestrator imports at the top of the file).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `tests/test_job_lifecycle.py tests/test_orchestrator.py -q`
Expected: PASS, no other failures.

- [ ] **Step 5: Commit**

```bash
git add coordinator/app/services/orchestrator.py coordinator/app/api/workers.py coordinator/tests/test_job_lifecycle.py
git commit -m "feat(dialectical): worker contact slides held-job leases (uniform liveness)"
```

---

### Task 2: Polling while busy no longer yanks the job; real restarts declare themselves

**Files:**
- Modify: `coordinator/app/services/orchestrator.py` (`claim_pending_job` orphan block)
- Modify: `coordinator/app/api/workers.py` (`RegisterRequest` + `register` handler)
- Modify: `worker/app/client.py` (`register` sends `fresh_start=True`)
- Test: `coordinator/tests/test_job_lifecycle.py` (extend)

**Interfaces:**
- Consumes: `refresh_worker_job_leases` from Task 1.
- Produces: register payload field `fresh_start: bool = False`. A `fresh_start=True` registration from a worker holding a job requeues that job immediately ("Worker restarted while job was active"); polls never do.

- [ ] **Step 1: Write the failing tests** (append to `tests/test_job_lifecycle.py`)

```python
def test_poll_while_busy_returns_none_and_keeps_the_job(db):
    """A loop harness polls on a timer while its CLI is still thinking.
    That poll must NOT tear the in-flight job away (the old behavior
    requeued it as 'Worker restarted while job was active')."""
    w = worker(db, "loop-1", ["claude-sonnet-5-high-loop"])
    _, job = make_debate_with_job(db, "claude-sonnet-5-high-loop")
    first = claim_pending_job(db, w)
    assert first is not None
    second = claim_pending_job(db, w)  # worker polls again mid-run
    assert second is None
    db.refresh(job)
    assert job.status == "running"
    assert job.worker_id == w.id
    assert (job.timeout_attempts or 0) == 0


def test_expired_held_job_is_still_requeued_on_poll(db):
    w = worker(db, "loop-1", ["claude-sonnet-5-high-loop"])
    _, job = make_debate_with_job(db, "claude-sonnet-5-high-loop")
    claim_pending_job(db, w)
    job.deadline = now_utc() - timedelta(seconds=5)
    db.commit()
    # Bypass the Task 1 refresh (which would resurrect the lease) by
    # expiring the job and having a DIFFERENT worker trigger the sweep.
    other = worker(db, "sweeper", ["gpt-5.6sol-medium"])
    claim_pending_job(db, other)
    db.refresh(job)
    assert job.status == "pending"
    assert (job.timeout_attempts or 0) == 1
```

Note the wrinkle the second test encodes: with Task 1 in place, a worker's own poll refreshes its held lease first, so its held job can never look expired to itself — expiry is detected by the shared sweep, which any other worker's poll runs. That is the intended design.

- [ ] **Step 2: Run to verify the first test fails**

Expected: `test_poll_while_busy_returns_none_and_keeps_the_job` FAILS — today the second poll requeues the held job (`timeout_attempts == 1`, status `pending`).

- [ ] **Step 3: Implement**

In `claim_pending_job`, replace the orphan block:

```python
    if worker.current_job_id:
        orphaned = db.get(Job, worker.current_job_id)
        if (
            orphaned is not None
            and orphaned.worker_id == worker.id
            and orphaned.status in {"claimed", "running"}
        ):
            terminal_events.extend(
                requeue_or_terminalize_timed_out_job(db, orphaned, "Worker restarted while job was active")
            )
        else:
            worker.current_job_id = None
```

with:

```python
    if worker.current_job_id:
        held = db.get(Job, worker.current_job_id)
        if (
            held is not None
            and held.worker_id == worker.id
            and held.status in {"claimed", "running"}
        ):
            # The worker is polling while its job is in flight (loop
            # harnesses poll on a timer). Its lease was just refreshed by
            # refresh_worker_job_leases above, so nothing is wrong: report
            # busy instead of yanking the job. Genuine restarts announce
            # themselves via fresh_start registration; genuinely dead
            # workers stop contacting and the deadline sweep reclaims.
            mark_worker_seen(worker, now_utc())
            commit_write(db)
            return None
        worker.current_job_id = None
```

In `coordinator/app/api/workers.py`, add `fresh_start: bool = False` to the `RegisterRequest` model, and in the `register` handler, immediately after the existing worker row is resolved (both the found-existing and re-auth paths — wherever `worker` is bound and before the response is built):

```python
    if payload.fresh_start and worker.current_job_id:
        held = db.get(Job, worker.current_job_id)
        if held is not None and held.worker_id == worker.id and held.status in {"claimed", "running"}:
            terminal_events = requeue_or_terminalize_timed_out_job(
                db, held, "Worker restarted while job was active"
            )
            commit_write(db)
            if terminal_events:
                _publish_events_sync(terminal_events)
        worker.current_job_id = None
```

(import `requeue_or_terminalize_timed_out_job` and `_publish_events_sync` from `app.services.orchestrator`; `Job` from `app.models.entities`.)

In `worker/app/client.py`, `CoordinatorClient.register(...)`: add `"fresh_start": True` to the JSON payload it sends (the codex worker registers once per process start, so registration there always means a restart). `scripts/subscription_loop.py`'s `ensure_loop_worker` re-registers every iteration by design and must NOT send it — it goes through its own registration call; verify it does not set the flag (default `False` covers it).

- [ ] **Step 4: Run the tests**

Run: `tests/test_job_lifecycle.py tests/test_orchestrator.py tests/test_multi_model_generation.py -q`
Expected: PASS. Also run the worker harness suite from `worker/`: `python -m pytest tests/ -q` — `test_registration_scripts.py` / `test_startup_lifecycle.py` may pin the register payload; update pins to include `fresh_start: True`.

- [ ] **Step 5: Commit**

```bash
git add coordinator/app/services/orchestrator.py coordinator/app/api/workers.py worker/app/client.py coordinator/tests/test_job_lifecycle.py worker/tests/
git commit -m "fix(dialectical): busy polls keep in-flight jobs; restarts declare fresh_start"
```

---

### Task 3: Hard stuck cap — no answer in 10 minutes means reassign

**Files:**
- Modify: `coordinator/app/services/orchestrator.py` (add `job_stuck_seconds`, extend the sweep in `claim_pending_job`)
- Test: `coordinator/tests/test_job_lifecycle.py` (extend)

**Interfaces:**
- Produces: `job_stuck_seconds() -> int` (env `DIALECTICAL_JOB_STUCK_SECONDS`, default 600, bounds 60–3600). Sweep requeues claimed/running non-`score_debate` jobs whose `claimed_at` is older than the cap with reason `"No answer within the stuck window"`. Task 5 hooks failover onto this reason.

- [ ] **Step 1: Write the failing test** (append to `tests/test_job_lifecycle.py`)

```python
def test_stuck_job_is_requeued_even_with_a_fresh_lease(db, monkeypatch):
    """A wedged worker that keeps heartbeating must not hold a node hostage:
    after DIALECTICAL_JOB_STUCK_SECONDS with no completion the assignment is
    taken back regardless of lease freshness."""
    monkeypatch.setenv("DIALECTICAL_JOB_STUCK_SECONDS", "60")
    w = worker(db, "loop-1", ["claude-sonnet-5-high-loop"])
    _, job = make_debate_with_job(db, "claude-sonnet-5-high-loop")
    claim_pending_job(db, w)
    job.claimed_at = now_utc() - timedelta(seconds=120)
    job.deadline = now_utc() + timedelta(seconds=60)  # lease is fresh
    db.commit()
    other = worker(db, "sweeper", ["gpt-5.6sol-medium"])
    claim_pending_job(db, other)
    db.refresh(job)
    assert job.status == "pending"
    assert job.error == "No answer within the stuck window"
```

- [ ] **Step 2: Run to verify it fails**

Expected: FAIL — job stays `running` (nothing enforces a stuck cap today).

- [ ] **Step 3: Implement**

In `orchestrator.py` next to `max_job_attempts()`:

```python
def job_stuck_seconds() -> int:
    """Hard per-assignment cap: a claim that has produced no completion
    within this window is taken back even if the worker is still
    heartbeating -- alive but wedged is still stuck."""
    return int_env("DIALECTICAL_JOB_STUCK_SECONDS", 600, 60, 3600)
```

In `claim_pending_job`, extend the existing expiry sweep (the block that queries `Job.deadline < now`) by adding, immediately after it:

```python
    stuck_cutoff = now - timedelta(seconds=job_stuck_seconds())
    stuck = db.scalars(
        select(Job).where(
            Job.status.in_(["claimed", "running"]),
            Job.claimed_at.isnot(None),
            Job.claimed_at < stuck_cutoff,
            Job.job_type != "score_debate",
        )
    ).all()
    for job in stuck:
        terminal_events.extend(
            requeue_or_terminalize_timed_out_job(db, job, "No answer within the stuck window")
        )
```

(`timedelta` is already imported in the module.)

- [ ] **Step 4: Run the tests**

Run: `tests/test_job_lifecycle.py tests/test_orchestrator.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add coordinator/app/services/orchestrator.py coordinator/tests/test_job_lifecycle.py
git commit -m "feat(dialectical): hard stuck cap reassigns silent claims after 10 minutes"
```

---

### Task 4: Late completions are rescued, not thrown away

**Files:**
- Create: `coordinator/migrations/versions/0016_job_last_worker.py`
- Modify: `coordinator/app/models/entities.py` (Job: `last_worker_id` column)
- Modify: `coordinator/app/services/orchestrator.py` (`release_job_claim` remembers, add `readopt_job_claim`)
- Modify: `coordinator/app/api/jobs.py` (`require_job_for_worker` re-adopts)
- Test: `coordinator/tests/test_job_lifecycle.py` (extend)

**Interfaces:**
- Consumes: `refresh_worker_job_leases` (Task 1) untouched; `release_job_claim` behavior extended.
- Produces: `Job.last_worker_id: str | None`; `readopt_job_claim(db, job, worker) -> bool` — returns True after re-claiming a pending job for its most recent holder WITHOUT incrementing `attempts` (transition channel `"readopt"`). `require_job_for_worker` calls it before rejecting with 403.

- [ ] **Step 1: Write the failing tests** (append to `tests/test_job_lifecycle.py`)

```python
from app.api.jobs import require_job_for_worker
from app.services.orchestrator import requeue_or_terminalize_timed_out_job


def test_last_claimant_readopts_a_requeued_job(db):
    """The doom-loop's cruelest step: grok finished its answer, but the
    claim had been requeued, so posting got 403/400 and the finished work
    was discarded. The last claimant must be able to re-adopt a pending
    job and complete it without burning attempt budget."""
    w = worker(db, "grok-loop", ["grok-4.5-high-loop"])
    _, job = make_debate_with_job(db, "grok-4.5-high-loop")
    claim_pending_job(db, w)
    attempts_before = job.attempts
    requeue_or_terminalize_timed_out_job(db, job, "Job deadline expired")
    db.commit()
    db.refresh(job)
    assert job.status == "pending" and job.worker_id is None
    resolved = require_job_for_worker(job.id, w, db)
    assert resolved.id == job.id
    db.refresh(job)
    assert job.status == "running"
    assert job.worker_id == w.id
    assert job.attempts == attempts_before  # readoption is free


def test_other_workers_cannot_adopt_a_released_job(db):
    import pytest
    from fastapi import HTTPException

    w = worker(db, "grok-loop", ["grok-4.5-high-loop"])
    intruder = worker(db, "other", ["grok-4.5-high-loop"])
    _, job = make_debate_with_job(db, "grok-4.5-high-loop")
    claim_pending_job(db, w)
    requeue_or_terminalize_timed_out_job(db, job, "Job deadline expired")
    db.commit()
    with pytest.raises(HTTPException):
        require_job_for_worker(job.id, intruder, db)
```

- [ ] **Step 2: Run to verify they fail**

Expected: first test FAILS with `HTTPException` (403 "Job is not claimed by this worker").

- [ ] **Step 3: Implement**

Migration `coordinator/migrations/versions/0016_job_last_worker.py`:

```python
"""jobs.last_worker_id: remember the most recent claimant across a release
so a worker that finishes late can re-adopt its claim (late-completion
rescue)."""
import sqlalchemy as sa
from alembic import op

revision = "0016_job_last_worker"
down_revision = "0015_job_transitions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("jobs", sa.Column("last_worker_id", sa.String(36), nullable=True))


def downgrade() -> None:
    op.drop_column("jobs", "last_worker_id")
```

(Confirm the exact `revision` string of 0015 by opening `migrations/versions/0015_job_transitions.py` and copying its `revision` value into `down_revision`.)

`coordinator/app/models/entities.py`, class `Job`, next to `worker_id`:

```python
    last_worker_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
```

`orchestrator.py` — `release_job_claim`, before `job.worker_id = None`:

```python
    if job.worker_id:
        job.last_worker_id = job.worker_id
```

`orchestrator.py` — add next to `release_job_claim`:

```python
def readopt_job_claim(db: Session, job: Job, worker: Worker) -> bool:
    """Hand a released job back to the worker that last held it, free of
    attempt budget: a late completion is the cheapest possible recovery --
    the answer is already paid for. Only the most recent claimant may
    re-adopt, and only while the job is still pending."""
    if job.status != "pending" or job.last_worker_id != worker.id:
        return False
    job.worker_id = worker.id
    job.claimed_at = now_utc()
    job.status = "running"
    job.deadline = make_deadline()
    worker.current_job_id = job.id
    record_job_transition(
        db,
        job,
        from_status="pending",
        to_status="running",
        channel="readopt",
        reason=f"late completion re-adopted by worker {worker.id}",
    )
    commit_write(db)
    return True
```

`coordinator/app/api/jobs.py` — `require_job_for_worker`, replace the worker check:

```python
    if job.worker_id != worker.id:
        if not readopt_job_claim(db, job, worker):
            raise HTTPException(status_code=403, detail="Job is not claimed by this worker")
```

(import `readopt_job_claim` from `app.services.orchestrator`.)

- [ ] **Step 4: Run the tests**

Run: `tests/test_job_lifecycle.py tests/test_orchestrator.py tests/test_v2_expand.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add coordinator/migrations/versions/0016_job_last_worker.py coordinator/app/models/entities.py coordinator/app/services/orchestrator.py coordinator/app/api/jobs.py coordinator/tests/test_job_lifecycle.py
git commit -m "feat(dialectical): late-completion rescue via claim re-adoption"
```

---

### Task 5: Cross-model failover ladder — a node fails only when nobody can do it

**Files:**
- Modify: `coordinator/app/services/orchestrator.py` (`model_failover_enabled`, `next_failover_model`, `try_failover_job`; hook into `requeue_or_terminalize_timed_out_job` and `fail_job`)
- Test: `coordinator/tests/test_model_failover.py` (new file)

**Interfaces:**
- Consumes: `v2_generation_model_pool(db)` from `app.services.dialectical_v2` (lazy import — orchestrator↔dialectical_v2 has an import cycle), `online_capabilities(db)`, `bool_env` from `app.core.config`.
- Produces: `try_failover_job(db, job, reason) -> list[tuple[str, str, dict]]` — on success mutates the job to `pending` under the next untried online pool model with reset budgets and returns a `node_retrying` event tuple list; returns `[]` when failover is off/exhausted/not applicable. `payload["tried_models"]` accumulates. Event name `node_retrying` with payload keys `node_id, job_id, job_type, model_id, tried_models, retry_in_s` — Task 7's frontend work consumes this.

- [ ] **Step 1: Write the failing tests**

```python
"""Cross-model failover: when one model's retry budget dies (or it is
repeatedly stuck), the SAME job is re-queued under the next untried model
from the generation pool. Terminal branch failure now means "every capable
model tried and none delivered" -- exactly the promise the product makes."""
from __future__ import annotations

from datetime import timedelta

from app.models.entities import Debate, Job, Node, Worker, now_utc
from app.services import orchestrator
from app.services.orchestrator import (
    claim_pending_job,
    make_deadline,
    requeue_or_terminalize_timed_out_job,
)

from tests.test_job_lifecycle import make_debate_with_job, worker


def exhaust_budget(db, job) -> None:
    job.attempts = 8
    job.timeout_attempts = 8
    db.commit()


def test_exhausted_job_fails_over_to_next_pool_model(db, monkeypatch):
    monkeypatch.setenv("DIALECTICAL_MULTI_MODEL_GENERATION", "true")
    worker(db, "codex", ["gpt-5.6sol-medium"])
    w_claude = worker(db, "claude-loop", ["claude-sonnet-5-high-loop"])
    _, job = make_debate_with_job(db, "claude-sonnet-5-high-loop")
    claim_pending_job(db, w_claude)
    exhaust_budget(db, job)
    events = requeue_or_terminalize_timed_out_job(db, job, "Job deadline expired")
    db.commit()
    db.refresh(job)
    assert job.status == "pending"
    assert job.required_model == "gpt-5.6sol-medium"
    assert job.attempts == 0 and (job.timeout_attempts or 0) == 0
    assert (job.payload or {}).get("tried_models") == ["claude-sonnet-5-high-loop"]
    assert any(name == "node_retrying" for _, name, _ in events)


def test_pool_exhaustion_is_finally_terminal(db, monkeypatch):
    monkeypatch.setenv("DIALECTICAL_MULTI_MODEL_GENERATION", "true")
    w_claude = worker(db, "claude-loop", ["claude-sonnet-5-high-loop"])
    _, job = make_debate_with_job(db, "claude-sonnet-5-high-loop")
    claim_pending_job(db, w_claude)
    payload = dict(job.payload or {})
    payload["tried_models"] = ["gpt-5.6sol-medium"]  # everyone else already tried
    job.payload = payload
    exhaust_budget(db, job)
    requeue_or_terminalize_timed_out_job(db, job, "Job deadline expired")
    db.commit()
    db.refresh(job)
    assert job.status == "failed"


def test_failover_disabled_keeps_terminal_behavior(db, monkeypatch):
    monkeypatch.setenv("DIALECTICAL_MODEL_FAILOVER", "false")
    worker(db, "codex", ["gpt-5.6sol-medium"])
    w_claude = worker(db, "claude-loop", ["claude-sonnet-5-high-loop"])
    _, job = make_debate_with_job(db, "claude-sonnet-5-high-loop")
    claim_pending_job(db, w_claude)
    exhaust_budget(db, job)
    requeue_or_terminalize_timed_out_job(db, job, "Job deadline expired")
    db.commit()
    db.refresh(job)
    assert job.status == "failed"
```

Note: `make_debate_with_job` seeds no `perspective_derivation`, so the debate uses the default pool. `v2_generation_model_pool` requires online real workers — that's why the codex worker row exists in the first test.

- [ ] **Step 2: Run to verify they fail**

Expected: first test FAILS — job goes terminal `failed` instead of failing over.

- [ ] **Step 3: Implement**

In `orchestrator.py` (import `bool_env` alongside `int_env` from `app.core.config`):

```python
FAILOVER_JOB_TYPES = {"v2_pov", "v2_expand", "v2_synthesize", "argue", "synthesize"}


def model_failover_enabled() -> bool:
    return bool_env("DIALECTICAL_MODEL_FAILOVER", True)


def next_failover_model(db: Session, job: Job) -> str | None:
    from app.services.dialectical_v2 import v2_generation_model_pool

    tried = set((job.payload or {}).get("tried_models") or []) | {job.required_model}
    online = online_capabilities(db)
    for model in v2_generation_model_pool(db):
        if model not in tried and model in online:
            return model
    return None


def try_failover_job(db: Session, job: Job, reason: str) -> list[tuple[str, str, dict[str, Any]]]:
    """Re-queue the SAME job under the next untried online pool model with a
    fresh budget. Terminal failure is reserved for 'every capable model
    tried' -- one flaky provider must not kill a branch."""
    if job.job_type not in FAILOVER_JOB_TYPES or not model_failover_enabled():
        return []
    candidate = next_failover_model(db, job)
    if candidate is None:
        return []
    payload = dict(job.payload or {})
    tried = [*(payload.get("tried_models") or [])]
    if job.required_model not in tried:
        tried.append(job.required_model)
    payload["tried_models"] = tried
    job.payload = payload
    record_job_transition(
        db,
        job,
        from_status=job.status,
        to_status="pending",
        channel="failover",
        reason=f"{reason}; reassigned from {job.required_model} to {candidate}",
    )
    job.required_model = candidate
    job.status = "pending"
    job.attempts = 0
    job.timeout_attempts = 0
    job.error = reason
    job.stream_buffer = ""
    release_job_claim(db, job)
    reset_job_target_for_retry(db, job)
    job.deadline = make_deadline()
    return [
        (
            job.debate_id,
            "node_retrying",
            {
                "node_id": job.node_id,
                "job_id": job.id,
                "job_type": job.job_type,
                "model_id": candidate,
                "tried_models": tried,
                "retry_in_s": 5,
            },
        )
    ]
```

Hook in `requeue_or_terminalize_timed_out_job` — replace:

```python
    if job_attempts_exhausted(job):
        return terminalize_job_failure(db, job, f"{reason} (retry budget exhausted)")
```

with:

```python
    if job_attempts_exhausted(job):
        failover_events = try_failover_job(db, job, f"{reason} (model budget exhausted)")
        if failover_events:
            return failover_events
        return terminalize_job_failure(db, job, f"{reason} (retry budget exhausted)")
```

Hook in `fail_job` — in the terminal path (the final `events = terminalize_job_failure(...)` branch), insert the same attempt first:

```python
    failover_events = try_failover_job(db, job, job.error or "Job failed")
    if failover_events:
        commit_write(db)
        for debate_id, event, payload in failover_events:
            await event_bus.publish(debate_id, event, payload)
        return
    events = terminalize_job_failure(db, job, job.error or "Job failed")
```

- [ ] **Step 4: Run the tests**

Run: `tests/test_model_failover.py tests/test_job_lifecycle.py tests/test_orchestrator.py tests/test_multi_model_generation.py tests/test_v2_expand.py tests/test_dialectical_v2.py -q`
Expected: PASS. If any existing test pinned "budget exhaustion ⇒ terminal", update it to seed `tried_models` with the rest of the pool (pool exhaustion) or set `DIALECTICAL_MODEL_FAILOVER=false` — choose per what the test is actually about.

- [ ] **Step 5: Commit**

```bash
git add coordinator/app/services/orchestrator.py coordinator/tests/test_model_failover.py coordinator/tests/
git commit -m "feat(dialectical): cross-model failover ladder before terminal branch failure"
```

---

### Task 6: Streamed JSON envelope never reaches readers raw

**Files:**
- Modify: `coordinator/app/services/serialization.py` (add `presentable_stream_text`, use in `streaming_generation_summary` and `active_synthesis_summary`)
- Test: `coordinator/tests/test_serialization_stream.py` (new file)

**Interfaces:**
- Produces: `presentable_stream_text(raw: str) -> str` — plain text passes through; a (possibly truncated) JSON envelope yields `title` + extracted-so-far `content`; an envelope with nothing extractable yet yields `"Drafting…"`.

- [ ] **Step 1: Write the failing tests**

```python
"""Workers stream the v2 JSON envelope ({"title": ..., "content": ...});
readers must see prose. presentable_stream_text extracts whatever prefix is
already parseable instead of dumping raw JSON into the tree."""
from app.services.serialization import presentable_stream_text


def test_plain_text_passes_through():
    assert presentable_stream_text("Thinking about ethics…") == "Thinking about ethics…"


def test_partial_envelope_extracts_title_and_content_prefix():
    raw = '{"title":"Ethical Viability","content":"Convergence is not the same as tru'
    out = presentable_stream_text(raw)
    assert "Ethical Viability" in out
    assert "Convergence is not the same as tru" in out
    assert "{" not in out


def test_envelope_with_no_fields_yet_shows_drafting():
    assert presentable_stream_text('{"ti') == "Drafting…"


def test_escapes_are_unescaped():
    raw = '{"title":"A \\"quoted\\" claim","content":"line one\\nline two'
    out = presentable_stream_text(raw)
    assert '"quoted"' in out
    assert "line one\nline two" in out


def test_empty_buffer_stays_empty():
    assert presentable_stream_text("") == ""
```

- [ ] **Step 2: Run to verify they fail**

Expected: FAIL — `ImportError: cannot import name 'presentable_stream_text'`.

- [ ] **Step 3: Implement**

In `serialization.py` (add `import re` and `import json` if not present):

```python
_STREAM_TITLE_RE = re.compile(r'"title"\s*:\s*"((?:[^"\\]|\\.)*)')
_STREAM_CONTENT_RE = re.compile(r'"content"\s*:\s*"((?:[^"\\]|\\.)*)')


def _unescape_json_fragment(fragment: str) -> str:
    try:
        return json.loads(f'"{fragment}"')
    except ValueError:
        return fragment.replace('\\"', '"').replace("\\n", "\n")


def presentable_stream_text(raw: str) -> str:
    """Workers stream the v2 JSON envelope; readers should see prose.
    Extract the fields that have arrived so far instead of showing raw
    JSON. Plain-text streams pass through untouched."""
    text = (raw or "").strip()
    if not text.startswith("{"):
        return raw or ""
    parts = []
    for pattern in (_STREAM_TITLE_RE, _STREAM_CONTENT_RE):
        match = pattern.search(text)
        if match and match.group(1):
            parts.append(_unescape_json_fragment(match.group(1)))
    return "\n\n".join(parts) or "Drafting…"
```

In `streaming_generation_summary`, change `"argument": job.stream_buffer or ""` to `"argument": presentable_stream_text(job.stream_buffer or "")`.
In `active_synthesis_summary`, change `"raw": job.stream_buffer or ""` to `"raw": presentable_stream_text(job.stream_buffer or "")`.

- [ ] **Step 4: Run the tests**

Run: `tests/test_serialization_stream.py tests/test_dialectical_v2.py tests/test_orchestrator.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add coordinator/app/services/serialization.py coordinator/tests/test_serialization_stream.py
git commit -m "fix(dialectical): render streamed v2 envelopes as prose, never raw JSON"
```

---

### Task 7: Honest failure events, banner, and header copy

**Files:**
- Modify: `coordinator/app/services/orchestrator.py` (`fail_job` retryable path; terminal `debate_failed` payloads gain `"terminal": True`)
- Modify: `coordinator/app/services/serialization.py` (debate-level completion copy)
- Modify: `web/app/debate/[id]/DebatePageClient.tsx` (banner logic + `node_retrying` listener)
- Test: `coordinator/tests/test_job_lifecycle.py` (extend), `web/app/debateFailureEvents.source-test.mjs` (new)

**Interfaces:**
- Consumes: `node_retrying` event shape from Task 5.
- Produces: retryable v2 failures publish `node_retrying` (never `debate_failed`); every remaining `debate_failed` payload carries `"terminal": True`. Debate-level completion `human_reason` for `generation_exhausted` becomes "Some branches were set aside after repeated failures; the debate completed with the rest."

- [ ] **Step 1: Write the failing coordinator test** (append to `tests/test_job_lifecycle.py`)

```python
import asyncio


def test_retryable_v2_failure_publishes_node_retrying_not_debate_failed(db, monkeypatch):
    from app.services import orchestrator as orch

    published: list[tuple[str, str, dict]] = []

    async def capture(debate_id, event, payload):
        published.append((debate_id, event, payload))

    monkeypatch.setattr(orch.event_bus, "publish", capture)
    w = worker(db, "claude-loop", ["claude-sonnet-5-high-loop"])
    _, job = make_debate_with_job(db, "claude-sonnet-5-high-loop")
    claim_pending_job(db, w)
    asyncio.run(orch.fail_job(db, job, "CLI crashed once", retryable=True))
    names = [name for _, name, _ in published]
    assert "node_retrying" in names
    assert "debate_failed" not in names
```

- [ ] **Step 2: Run to verify it fails**

Expected: FAIL — today the retryable v2 path publishes `debate_failed`.

- [ ] **Step 3: Implement coordinator side**

In `fail_job`'s retryable branch, replace the `else` arm (the one publishing `debate_failed`) with:

```python
        else:
            await event_bus.publish(
                job.debate_id,
                "node_retrying",
                {
                    "node_id": job.node_id,
                    "job_id": job.id,
                    "job_type": job.job_type,
                    "model_id": job.required_model,
                    "retry_in_s": 5,
                },
            )
```

In `terminalize_job_failure`, add `"terminal": True` to the `debate_failed` payload dict (the non-degradable fall-through path).

In `serialization.py`, find where the debate `completion` block's human reason is produced (grep for `humanize_reason` / `human_reason` in this file) and, for the **debate-level** reason only, map `generation_exhausted` to completion-scoped copy before falling back to `humanize_reason`:

```python
_COMPLETION_REASON_OVERRIDES = {
    "generation_exhausted": "Some branches were set aside after repeated failures; the debate completed with the rest.",
}
```

applied as `_COMPLETION_REASON_OVERRIDES.get(code) or humanize_reason(code)` at the debate-completion call site (node-level `stopping_reason_human` keeps the existing path-scoped copy).

- [ ] **Step 4: Write the failing web source test** — `web/app/debateFailureEvents.source-test.mjs`

```javascript
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

// Failure-event honesty: the debate page must only raise the failure banner
// on a TERMINAL debate_failed event, must listen for node_retrying (scoped
// retry chatter), and must clear the banner when generation makes progress.
const source = readFileSync(join(process.cwd(), "app", "debate", "[id]", "DebatePageClient.tsx"), "utf8");

test("debate_failed banner requires the terminal flag", () => {
  const handler = source.split('addEventListener("debate_failed"')[1]?.slice(0, 400) ?? "";
  assert.match(handler, /terminal/, "banner must check payload.terminal");
});

test("node_retrying is handled and clears the stale banner", () => {
  assert.match(source, /addEventListener\("node_retrying"/, "must listen for node_retrying");
  const handler = source.split('addEventListener("node_retrying"')[1]?.slice(0, 400) ?? "";
  assert.match(handler, /setError\(null\)/, "retry progress must clear the failure banner");
});
```

Run from `web/`: `node --test 'app/**/*.source-test.mjs'` — the two new tests FAIL.

- [ ] **Step 5: Implement web side**

In `DebatePageClient.tsx`, replace the `debate_failed` listener:

```typescript
      events.addEventListener("debate_failed", (event) => {
        const payload = parseEventData(event) as { terminal?: boolean } | null;
        if (payload?.terminal) setError("Debate generation failed");
      });
      events.addEventListener("node_retrying", () => {
        setError(null);
        refresh();
      });
```

and in the existing `debate_complete` listener add `setError(null);` before `refresh()`.

- [ ] **Step 6: Run everything**

Coordinator: `tests/test_job_lifecycle.py tests/test_status_report.py -q` → PASS.
Web: `node --test 'app/**/*.source-test.mjs'` → all pass. Then `pnpm --dir web build` → clean.

- [ ] **Step 7: Commit**

```bash
git add coordinator/app/services/orchestrator.py coordinator/app/services/serialization.py coordinator/tests/test_job_lifecycle.py "web/app/debate/[id]/DebatePageClient.tsx" web/app/debateFailureEvents.source-test.mjs
git commit -m "fix(dialectical): scope failure events honestly; banner only on terminal failure"
```

---

### Task 8: Loop harnesses heartbeat while their CLI thinks

**Files:**
- Modify: `apps/dialectical-engine/scripts/subscription_loop.py` (add `run_cli_with_liveness`; use it in `claude_once`, `gemini_once`, `grok_once`)
- Test: `coordinator/tests/test_subscription_loop.py` (extend)

**Interfaces:**
- Consumes: `CoordinatorClient.heartbeat(capabilities, status)` from `worker/app/client.py` (obtained via the existing `worker_runtime()` indirection); coordinator side already extends leases on heartbeat (Task 1).
- Produces: `run_cli_with_liveness(config, command, *, capabilities, timeout_seconds, env=None, heartbeat_seconds=30.0) -> subprocess.CompletedProcess` — runs the CLI in a thread while heartbeating on a timer.

- [ ] **Step 1: Write the failing test** (append to `coordinator/tests/test_subscription_loop.py`, following that file's existing import pattern for the script module)

```python
def test_run_cli_with_liveness_heartbeats_during_the_run(monkeypatch):
    import asyncio

    loop_module = load_subscription_loop_module()  # reuse this file's existing loader helper

    beats: list[list[str]] = []

    class FakeClient:
        def __init__(self, config):
            pass

        async def heartbeat(self, capabilities, status="online"):
            beats.append(list(capabilities))

        async def aclose(self):
            pass

    monkeypatch.setattr(
        loop_module,
        "worker_runtime",
        lambda: (FakeClient, None, lambda path: object(), None),
    )
    process = asyncio.run(
        loop_module.run_cli_with_liveness(
            config=object(),
            command=["sleep", "1"],
            capabilities=["claude-sonnet-5-high-loop"],
            timeout_seconds=10,
            heartbeat_seconds=0.2,
        )
    )
    assert process.returncode == 0
    assert len(beats) >= 2, "CLI ran ~1s with 0.2s cadence; expected multiple heartbeats"
```

If `test_subscription_loop.py` has no module-loader helper, add one at the top mirroring how that file already imports the script (check its existing imports first — reuse, don't invent).

- [ ] **Step 2: Run to verify it fails**

Expected: FAIL — `run_cli_with_liveness` does not exist.

- [ ] **Step 3: Implement**

In `scripts/subscription_loop.py`:

```python
async def run_cli_with_liveness(
    config: Any,
    command: list[str],
    *,
    capabilities: list[str],
    timeout_seconds: int,
    env: dict[str, str] | None = None,
    heartbeat_seconds: float = 30.0,
) -> subprocess.CompletedProcess:
    """Run the model CLI while proving liveness to the coordinator. The CLI
    thinks silently for minutes; without heartbeats the job lease expires
    mid-run and the claim is torn away (the doom-loop that killed 4 of 7
    branches in debate 90bad9c5)."""
    CoordinatorClient, _, _, _ = worker_runtime()
    client = CoordinatorClient(config)
    stop = asyncio.Event()

    async def beat() -> None:
        while not stop.is_set():
            try:
                await asyncio.wait_for(stop.wait(), timeout=heartbeat_seconds)
            except asyncio.TimeoutError:
                try:
                    await client.heartbeat(capabilities)
                except Exception as exc:  # noqa: BLE001 - CLI run must survive
                    print(f"[loop] heartbeat failed (non-fatal): {exc!r}", flush=True)

    heartbeat_task = asyncio.create_task(beat())
    run_kwargs: dict[str, Any] = dict(
        cwd=ROOT, text=True, capture_output=True, timeout=timeout_seconds, check=False
    )
    if env:
        run_kwargs["env"] = {**os.environ, **env}
    try:
        return await asyncio.to_thread(subprocess.run, command, **run_kwargs)
    finally:
        stop.set()
        await heartbeat_task
        await client.aclose()
```

(`import os` and `import asyncio` are already present; verify.) Then in `claude_once`, `gemini_once`, `grok_once`, replace each blocking `process = subprocess.run(command, ...)` with:

```python
    process = await run_cli_with_liveness(
        config,
        command,
        capabilities=[advertised],
        timeout_seconds=args.timeout_seconds,
    )
```

where `advertised` is the model id each `*_once` already registered with (`args.advertised_model` for claude; the gemini/grok equivalents are visible in their `ensure_loop_worker` calls — pass the same value). For `gemini_once`, whose command builder returns `(command, env)`, pass `env=env`.

- [ ] **Step 4: Run the tests**

Run: `tests/test_subscription_loop.py -q` from `coordinator/`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/subscription_loop.py coordinator/tests/test_subscription_loop.py
git commit -m "feat(dialectical): loop harnesses heartbeat while their CLI runs"
```

---

### Task 9: Parallel loop slots and collision-free job files

**Files:**
- Modify: `apps/dialectical-engine/scripts/subscription_loop.py` (`--slots` on the three `start-*-loop` subcommands; job files keyed by job id)
- Test: `coordinator/tests/test_subscription_loop.py` (extend)

**Interfaces:**
- Produces: `start_claude_loop` / `start_grok_loop` / `start_gemini_loop` accept `--slots N` (default 1) and create one tmux session **and one distinctly-named worker** per slot (`<worker-name>-s2`, `-s3`, …; slot 1 keeps the base name so existing deployments are unchanged). `write_job_file` filenames embed the job id.

- [ ] **Step 1: Write the failing tests** (append to `coordinator/tests/test_subscription_loop.py`)

```python
def test_job_files_are_keyed_by_job_id(tmp_path):
    loop_module = load_subscription_loop_module()
    job = {"id": "job-abc123", "job_type": "v2_pov", "prompt": {"system": "s", "user": "u", "max_tokens": 100}}
    job_file, response_file = loop_module.write_job_file(
        provider="claude",
        config_path=tmp_path / "config.json",
        job=job,
        state_dir=tmp_path,
    )
    assert "job-abc123" in job_file.name
    assert "job-abc123" in response_file.name


def test_slot_names_are_unique_and_slot_one_keeps_the_base_name():
    loop_module = load_subscription_loop_module()
    assert loop_module.slot_worker_name("claude-sonnet-loop", 1) == "claude-sonnet-loop"
    assert loop_module.slot_worker_name("claude-sonnet-loop", 3) == "claude-sonnet-loop-s3"
```

(Adapt `write_job_file`'s keyword names to its actual signature — open the function first; if it already keys by job id, keep the test as a pin and skip that change.)

- [ ] **Step 2: Run to verify they fail**

Expected: FAIL — `slot_worker_name` missing (and possibly non-keyed filenames).

- [ ] **Step 3: Implement**

```python
def slot_worker_name(base: str, slot: int) -> str:
    """Slot 1 keeps the base name so existing single-slot deployments keep
    their worker identity (and their coordinator-side history)."""
    return base if slot <= 1 else f"{base}-s{slot}"
```

In `write_job_file`, make the generated filenames include `job["id"]` (e.g. `f"{provider}-{job['id']}-job.json"` / `f"{provider}-{job['id']}-response.txt"`) so concurrent slots on one host never collide.

In each `start_*_loop`: add `--slots` (`type=int`, `default=1`) to the corresponding argparse subparser, then loop:

```python
    for slot in range(1, max(1, int(args.slots)) + 1):
        session = f"{base_session}-s{slot}" if slot > 1 else base_session
        name = slot_worker_name(args.worker_name, slot)
        # build the per-slot loop command exactly as before, substituting
        # `name` for args.worker_name and a per-slot config path
        # (f"{args.config}.s{slot}" for slot > 1), then:
        if not tmux_session_exists(session):
            start_tmux_session(session, command)
```

Distinct per-slot config paths matter: each slot registers as its own worker and must persist its own `worker_id`/token (the config file caches the identity).

- [ ] **Step 4: Run the tests**

Run: `tests/test_subscription_loop.py -q` → PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/subscription_loop.py coordinator/tests/test_subscription_loop.py
git commit -m "feat(dialectical): parallel loop worker slots with collision-free job files"
```

---

### Task 10: Migrate, deploy, and shake down live

**Files:** none new — operations.

- [ ] **Step 1: Full test sweep**

From `coordinator/`: run the whole suite (`tests/ -q`) with the standard invocation → all green.
From `web/`: `node --test 'app/**/*.source-test.mjs'` and `pnpm --dir web build` → clean.
From `worker/`: `python -m pytest tests/ -q` → green.

- [ ] **Step 2: Merge and push**

Fast-forward `dev` → `main` as usual for this repo and push both.

- [ ] **Step 3: Migrate the production DB and restart services**

```bash
launchctl bootout gui/501/com.dialectical.coordinator
cd apps/dialectical-engine/coordinator && ../.venv313/bin/python -m alembic upgrade head
launchctl bootstrap gui/501 ~/Library/LaunchAgents/com.dialectical.coordinator.plist
launchctl kickstart -k gui/501/com.dialectical.web
```

(If bootstrap returns error 5, retry once — it has flaked before.) No new env vars are required: `DIALECTICAL_JOB_STUCK_SECONDS` and `DIALECTICAL_MODEL_FAILOVER` have safe defaults. Restart the loop tmux sessions so they pick up the new `subscription_loop.py`.

- [ ] **Step 4: Live shakedown**

Create one Deep debate on dezbatere.ro/new, then watch:

```bash
sqlite3 -readonly ~/.dialectical/db.sqlite3 "SELECT job_type, required_model, status, attempts, timeout_attempts FROM jobs WHERE debate_id='<id>' ORDER BY created_at"
sqlite3 -readonly ~/.dialectical/db.sqlite3 "SELECT created_at, to_status, channel, substr(reason,1,80) FROM job_transitions WHERE debate_id='<id>' ORDER BY created_at"
```

Success criteria: no `timeout_requeue` storms while loop workers are mid-run; slow models complete on attempt 1–2 or fail over (`channel='failover'`) instead of dying; no raw JSON in the tree while streaming; no failure banner unless the debate itself terminally fails; header copy stays calm on a partial completion.

- [ ] **Step 5: Rollback levers (document in the deploy message)**

`DIALECTICAL_MODEL_FAILOVER=false` (disable the ladder), `DIALECTICAL_JOB_STUCK_SECONDS` (tune the cap), `DIALECTICAL_MULTI_MODEL_GENERATION=false` (single-model generation, the big red switch).

---

## Self-review notes

- **Spec coverage:** uniform treatment (Tasks 1/3/5 apply by job, never by model id); explicit in-progress + 10-min stuck + same-type respawn (claim transition already records "InProgress"; Task 3 the cap; Task 5 ladder starts with a fresh same-model agent because the requeue hands it back to the same worker pool before rotating); raw JSON (Task 6); false failure banner + header (Task 7); multi-debate (`node_id`/`debate_id` already ride in every claim payload — verified in `render_job_payload`; Tasks 4/8/9 make concurrent work safe; Task 5 is "fail only when nobody can").
- **Known interplay encoded in tests:** a worker's own poll can't expire its own job (Task 2 second test); a wedged-but-heartbeating worker is caught by the stuck cap, not the deadline sweep (Task 3 test); re-adoption is free of budget (Task 4 test).
- **Deliberate scope-outs:** auto-scaling supervisor (see intro); v1 `argue` failover rides along via `FAILOVER_JOB_TYPES` but v1-specific routing constraints (`not_same_as_claim_author`) are untouched — failover picks from the v2 pool, which respects the allowlist.
