# Phase 11: created_at-Tie Fix + Minimal Swarm Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** (Part A, mandatory precondition) Eliminate the non-deterministic `created_at`-tie tiebreak at the three known "latest `AnalyzerRun`" read sites by introducing an application-assigned monotonic `seq` column, migrated in with a deterministic backfill, and switching all three sites' `order_by` to `seq.desc()`. (Part B, gated on Part A landing) Ship the smallest honest swarm slice: a pure planner that writes a `swarm` descriptor into `Debate.config` from REAL worker/model availability data (never fabricated), behind `DIALECTICAL_SWARM` (default OFF, flag-off byte-identical), plus an execution seam that dispatches the assignments through the existing job machinery and records honest per-assignment status. No evidence-verification wiring, no real-model verdict claims, no judge rotation/pool substrate — orchestration mechanics only, per the P10 review addendum's binding scope limit.

**Tech Stack:** Python 3.12, SQLAlchemy, Alembic, FastAPI, pytest (coordinator suite: `cd coordinator && python -m pytest tests`).

## UNVERIFIED — implementer must confirm before/while implementing

1. **Only three `AnalyzerRun.created_at.desc(), AnalyzerRun.id.desc()` sites were found in this pass** via targeted reads of the three named locations (`coordinator/app/scoring/service.py:130`, `coordinator/app/services/serialization.py:403`, `coordinator/app/protocol/runner.py:177`) plus the P10 decision doc's own enumeration. Implementer must run `grep -rn "created_at.desc(), AnalyzerRun.id.desc()\|AnalyzerRun.created_at.desc()" coordinator/app` immediately before Task 1 to confirm no 4th site exists and that these three still read exactly as quoted below (line numbers may have drifted).
2. **`commit_write`/`flush_write` (`coordinator/app/core/write_lock.py`) serialize via a single process-wide `threading.RLock`, not a DB-level transaction/advisory lock.** This was read in full (18 lines) and is a genuine single-process mutex around every `db.commit()`/`db.flush()` call in the coordinator. This plan's seq-assignment strategy (Option c below) depends on this lock actually wrapping the read-max-then-insert sequence for `AnalyzerRun` creation. Implementer must grep `AnalyzerRun(` construction call sites (expected: `service.py`'s scoring-run writer, `runner.py`'s protocol-run writer, possibly others) to confirm every one of them calls `commit_write`/`flush_write` (not a bare `db.commit()`/`db.session.commit()` that bypasses the lock) before relying on the lock for seq uniqueness — if any construction site commits without going through `write_lock.py`, that site must be fixed as part of Task 1 or flagged as a gap.
3. **No existing `swarm` concept of any kind was found anywhere in application code** (grep for `swarm` case-insensitive across the repo hit only planning/ledger docs and log files — zero hits in `coordinator/app` or `web/`). This plan's Part B therefore designs a wholly new descriptor shape; implementer must re-run `grep -rni swarm coordinator/app web` immediately before Task 2 to confirm this is still true (no other agent landed a swarm slice in the interim).
4. **The existing branch/POV fan-out model was inferred from `dialectical_v2.py`'s `create_job(db, debate.id, job_type, role, node_id, required_model=model_id)` call sites** (one job per role/POV per generation step) and `orchestrator.py`'s `capable_online_workers(db, model_id) -> list[Worker]` (filters by online status + last-seen cutoff + model capability, real DB query, no fabrication). This pass did NOT fully read `dialectical_v2.py`'s branch-creation entry point (only grepped `create_job`/`required_model` call sites, not the full function bodies) nor the `Worker` model's exact column list. Implementer must read the full branch-creation flow in `coordinator/app/services/dialectical_v2.py` (the function that creates PRO/CON branches at debate start) and `coordinator/app/models/entities.py`'s `Worker` class in full before Task 2, to confirm whether "one job per branch" already constitutes a form of multi-perspective dispatch that Task 3 should group/track rather than duplicate.
5. **`Debate.config` write/read conventions for nested feature-specific keys were not exhaustively cross-checked against every existing consumer** beyond confirming the column is `JSON, default=dict` (`entities.py:38`) and that `runner.py:181` already reads a nested `(debate.config or {}).get("protocol", {}).get(...)` shape as precedent. Implementer must grep `debate.config` read/write sites in full before Task 2 to confirm no naming collision with a `"swarm"` top-level key and that the nested-dict-read defensive style (`isinstance` guards, never raise on malformed config) is the house convention to replicate.
6. **Migration 0011's exact backfill SQL idiom (deterministic ordering by `created_at, id` for existing rows) was designed but not dry-run against a live SQLite file in this pass.** Implementer must test the migration against both an empty DB and a DB with pre-existing `analyzer_runs` rows (per house pattern established in 0009/0010) before considering Task 1 done.
7. **Whether any other code path reads `AnalyzerRun` ordered only by `created_at` (without the `id.desc()` tiebreak, and thus not one of the "three known sites" but still latent-affected) was not grepped in this pass.** Implementer should run a broader `grep -rn "AnalyzerRun.*order_by\|order_by.*AnalyzerRun" coordinator/app` before Task 1 Step 3 to confirm the three sites are exhaustive, not just the three the mission named.

## Global Constraints

- **No commits.** Do not run `git add`/`git commit` for this phase; stop after tests are green and report status.
- **Anti-stall clause:** Run tests as ONE foreground Bash call with the `timeout` parameter set; never `run_in_background`, never `Monitor`. If it times out once, report BLOCKED — do not retry in a loop.
- **Pytest flags (always append):** `--basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`
- **Pre-existing known failures may exist in the coordinator suite** (environment-harness + foreign guardian WIP, 17 failed/1356 passed/4 skipped baseline at P9 close per the P10 decision doc). Re-baseline the count once at the start of this phase (run the full suite once before touching code) rather than trusting any stale number; do not attempt to fix them; do not let their presence block a "suite green" claim for the tests this phase owns.
- **Forbidden files — do not create, modify, or delete:** `Makefile`, `scripts/dev_guardian.py`, `scripts/start_dev.ps1`.
- **No DB deletion** of any kind, including in tests (use in-memory/session-scoped fixtures per existing test patterns).
- **No fake runtime data** — tests must use real fixture rows (real `Debate`/`Node`/`AnalyzerRun`/`Worker`-shaped rows via existing fixtures/factories), not hardcoded fake "looks-like-a-response" JSON standing in for a real computation path.
- **TDD strictly:** for every task, write the failing test first, run it and confirm the failure, then implement, then confirm green. Do not write implementation before a failing test exists for it.
- **DDD naming:** any new public strings/keys must use claim/debate-domain camelCase language consistent with the rest of the codebase at the JSON/pydantic-alias boundary (e.g. `requestedPerspectives`, `assignments`, `jobId`, `shortfall`). Internal Python stays snake_case per existing file convention; only JSON-facing payload keys need camelCase.
- **No schema migrations unless proven necessary.** Task 1 is the one proven exception in this phase (a genuinely new monotonic column is required — no existing column can carry ordering semantics, per the Part A strategy below). Part B (Tasks 2-3) MUST NOT add any schema migration — `Debate.config` (JSON, already persisted) is sufficient to carry the swarm descriptor.
- **Honesty laws (binding, non-negotiable, apply to every task):**
  - NEVER fabricate worker/model availability. Swarm assignments in Task 2 MUST be derived from a real `capable_online_workers(db, model_id)` query result at planning time — never a hardcoded worker list, never an assumed count.
  - If fewer real capable workers exist than `requestedPerspectives`, record the honest partial assignment plus an explicit `"shortfall": k` count — never pad with fake workers, never silently truncate the request without recording why.
  - Per-assignment job status in Task 3 is always the REAL status of the real `Job` row dispatched for that assignment — never a guessed/optimistic status, never hidden failures. Completion means ALL assignments are terminal (`complete` OR `failed`); a failed assignment is recorded as `failed` with its real error, never omitted or silently retried into invisibility.
  - Flag-gate all swarm behavior behind `DIALECTICAL_SWARM` (`bool_env`, default `False`). Flag-off must be byte-identical to current debate-creation/dispatch behavior — no `swarm` key written to `Debate.config`, no extra jobs created, when the flag is off.
  - This phase MUST NOT wire `evaluate_evidence_verdict` as a production caller, MUST NOT claim real-model verdicts were produced or judged, and MUST NOT add judge rotation or any judge-pool substrate. If any task's own investigation reveals a temptation to touch the runner's QBAF/evidence overlay, STOP and flag it — do not touch the P7 hard-gate surface (`compositionNote`, evidence-verdict overlay) in this phase.
- **Marker/flag safety on unexpected crash:** if swarm planning or dispatch raises an exception not anticipated by the specific try/excepts described below, debate creation and the existing job-dispatch flow must not be made LESS safe than today — fail closed (no swarm descriptor written, no swarm jobs created, existing non-swarm flow proceeds untouched) rather than fail open (a half-written swarm descriptor or an orphaned job with no tracking).
- **Reuse existing job machinery, do not fork it.** Task 3 dispatches swarm assignments through the existing `create_job(...)`/`Job` model/worker-claim path exactly as today's branch fan-out does — no new worker protocol, no new job-claim semantics, no new `Job` columns.
- **Allowed files per task** are listed under each task below; do not touch files outside those lists without stopping and flagging why in the final report.

## Verified Ground Truth

- **Site 1 (confirmed flake root cause):** `coordinator/app/scoring/service.py:130` — `.order_by(AnalyzerRun.created_at.desc(), AnalyzerRun.id.desc()).limit(1)` selecting the latest `complete` scoring `AnalyzerRun` for a debate, inside the function building the public scoring payload (`node_scoring` read path).
- **Site 2 (served detail):** `coordinator/app/services/serialization.py:400-405` — `latest_protocol_analysis_run` query, identical `order_by(AnalyzerRun.created_at.desc(), AnalyzerRun.id.desc()).limit(1)` shape. A code comment at lines 389-399 already documents this exact hazard verbatim: "if two protocol_analysis runs for the same debate land in the same timestamp tick, this id-desc tiebreak can pick either row non-deterministically... not solved here, only inherited and documented." This confirms the bug is pre-acknowledged, not newly discovered.
- **Site 3 (write-time safe today, same shape):** `coordinator/app/protocol/runner.py:174-179` — `previous_run` query, same `order_by(AnalyzerRun.created_at.desc(), AnalyzerRun.id.desc()).limit(1)` shape, queried deliberately BEFORE the new `AnalyzerRun` is constructed/added this call (comment at lines 168-173 explains this sidesteps autoflush ambiguity, not the tie itself).
- `coordinator/app/models/entities.py:197-207` — `AnalyzerRun`: `id` is `String(36)` PK default `uuid_str` (random UUID4, confirmed non-sequential); `debate_id`, `branch_id` FKs; `analyzer_type: String(80)`; `output: JSON`; `status: String(24)` default `"complete"`; `provenance: JSON`; `created_at: DateTime(timezone=True)` default `now_utc`. No existing column carries monotonic ordering semantics — `id` is random, `created_at` is coarse wall-clock (explicitly called out as especially coarse on Windows in the serialization.py comment).
- `coordinator/app/core/write_lock.py` (full file, 18 lines) — `_write_lock = RLock()` (module-level, process-wide, `threading.RLock`, not a DB advisory lock). `flush_write(db)` and `commit_write(db)` both acquire this lock around `db.flush()`/`db.commit()` respectively. This is the ONLY serialization primitive found; it is process-local (does not span multiple coordinator processes, consistent with D2's "single-writer, local-first" framing in the P10 decision doc).
- `coordinator/migrations/versions/0010_node_evidence_metadata.py` (full file, 52 lines) is the current migration chain HEAD (`down_revision = "0009_contract_keyed_cache_identity"`); no `0011` exists yet. It establishes the house pattern this plan's Task 1 migration must follow: inspector-guarded (`sa.inspect(bind)`), `has_table`/`get_columns` existence checks before `op.add_column`, idempotent (safe to run twice), symmetric `downgrade()` using `op.batch_alter_table` for SQLite-safe column drop.
- `coordinator/app/services/orchestrator.py:454-461` — `capable_online_workers(db, model_id) -> list[Worker]`: real query — filters `routing_allowed_models`, `Worker.last_seen >= cutoff` (from `settings.worker_offline_seconds`), `Worker.status == "online"`, then Python-side filters by `model_id in worker_capability_set(worker)`. This is the ONLY sanctioned source of "real available workers" data; confirmed no fabrication, no hardcoded worker lists anywhere near it. `worker_can_claim_job` (line 501) and `reroute_unavailable_pending_jobs` (line 577) both call it as the load-bearing "is there real capacity" check.
- `coordinator/app/services/dialectical_v2.py:545` — `create_job(db, debate.id, job_type, role, node_id, required_model=model_id)` is the existing job-creation call used for branch/POV generation dispatch (also called at `orchestrator.py:200` area for other job types). `Job.required_model`, `Job.required_role`, `Job.status` (`"pending"|"claimed"|"running"|"complete"|"failed"`, inferred from `orchestrator.py:448`'s `.in_(["pending", "claimed", "running"])` filter and `:572`'s `"failed"` assignment) are the existing job lifecycle fields this plan's Task 3 must reuse as-is.
- `coordinator/app/models/entities.py:32-41` — `Debate`: `id: String(36)` PK, `topic: Text`, `status: String(24)` default `"draft"`, `config: JSON` default `dict`, `root_node_id`, `synthesis_id`, `created_at`. `config` is already the house convention for nested feature-scoped debate settings (`runner.py:181` reads `(debate.config or {}).get("protocol", {}).get("convergence_epsilon")` as precedent for defensive nested-dict access with a validated-or-default fallback, never raising on malformed input).
- `coordinator/app/services/orchestrator.py:203` — `create_debate(db: Session, topic: str, config: dict[str, Any] | None = None) -> Debate` is the existing debate-creation entry point; Task 2's planner call must be threaded in here (or immediately after, same transaction) without changing its signature's default behavior when the flag is off.
- Zero hits for `swarm` (case-insensitive) anywhere in `coordinator/app` or `web/` — confirmed via repo-wide grep in this pass; all 22 hits were planning docs (`docs/superpowers/plans/...`), Hermes ledger files, or Codex log files, none of which are application code. Task 2 is designing a wholly new concept, not extending an existing one.
- `coordinator/app/core/config.py` (per Phase 8 plan's Verified Ground Truth, reused here) — `bool_env(name, default)`: reads fresh per call, no caching. This is the exact convention `DIALECTICAL_SWARM` must use.

---

### Task 1: Migration 0011 — monotonic `seq` column on `analyzer_runs` + 3-site tiebreak fix

**Part A strategy (picked, with rationale):** Application-assigned monotonic `seq` (Option c from the mission brief) — NOT SQLite `AUTOINCREMENT` (illegal on a non-INTEGER-PK table; `AnalyzerRun.id` is `String(36)`), NOT a SQLAlchemy `Sequence`/server-side sequence (SQLite has no native sequence object), NOT raw `rowid` mapping (portability/ORM-mapping complexity not justified for a single-process, single-writer deployment per D2). Instead: add `seq: Mapped[int] = mapped_column(Integer, nullable=True, index=True)` to `AnalyzerRun`, assigned at construction time as `seq = (db.scalar(select(func.max(AnalyzerRun.seq))) or 0) + 1`, computed and set on the new `AnalyzerRun` instance BEFORE the surrounding `commit_write(db)` call — since every write path funnels through the single process-wide `RLock` in `write_lock.py` (per UNVERIFIED #2, to be confirmed), the read-max-then-assign-then-commit sequence is race-free within this process, which matches D2's already-accepted single-writer deployment model exactly (no new operational assumption is introduced beyond what D2 already ratified). All three read sites switch their `order_by` to `AnalyzerRun.seq.desc()` with a `AnalyzerRun.created_at.desc(), AnalyzerRun.id.desc()` fallback tuple retained as a secondary sort key ONLY for legacy rows where `seq IS NULL` (should not occur after backfill, but keeps the query defensively correct if a row is ever inserted through a path that forgets to set `seq` — fail toward the old, already-accepted-safe-enough behavior, not toward a crash). The migration backfills `seq` for all existing rows deterministically ordered by `(created_at ASC, id ASC)` so historical relative order is preserved as best-effort (ties among pre-existing same-timestamp rows are broken by `id` once, permanently, at migration time — this is acceptable because it only needs to happen once, not on every read).

**Files:**
- Create: `coordinator/migrations/versions/0011_analyzer_run_seq.py`
- Modify: `coordinator/app/models/entities.py` (add `seq` column to `AnalyzerRun`)
- Modify: `coordinator/app/scoring/service.py` (site 1, ~line 130; assign `seq` at `AnalyzerRun` construction if this is a construction site — confirm via UNVERIFIED #2's grep)
- Modify: `coordinator/app/services/serialization.py` (site 2, ~lines 400-405 — read-only site, `order_by` change only)
- Modify: `coordinator/app/protocol/runner.py` (site 3, ~lines 174-179 — read-only site, `order_by` change only; also confirm/patch the `AnalyzerRun(...)` construction call elsewhere in this file to assign `seq`)
- Create: `coordinator/tests/test_analyzer_run_seq.py`
- Create/modify: `coordinator/tests/test_migrations.py` (or wherever 0009/0010 migration tests live — grep first)

**Interfaces:**
- `AnalyzerRun.seq: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)` — nullable at the schema level (SQLite `ALTER TABLE ADD COLUMN` requires nullable-or-defaulted for existing rows; nullability is defensive, not semantic — every row written after this migration must have a real integer `seq`).
- A small helper, e.g. `next_analyzer_run_seq(db: Session) -> int` in `coordinator/app/models/entities.py` or a new `coordinator/app/scoring/seq.py` (implementer's call — prefer co-locating with `AnalyzerRun` if no circular-import issue, else a tiny leaf module): `return (db.scalar(select(func.max(AnalyzerRun.seq))) or 0) + 1`. Called at every `AnalyzerRun(...)` construction site, before `flush_write`/`commit_write`.
- All three read sites: `.order_by(AnalyzerRun.seq.desc(), AnalyzerRun.created_at.desc(), AnalyzerRun.id.desc()).limit(1)`.
- Migration `0011_analyzer_run_seq.py`: `down_revision = "0010_node_evidence_metadata"`. `upgrade()`: inspector-guarded `add_column` (mirrors 0010's `_has_column` idiom exactly), then a deterministic backfill — `SELECT id FROM analyzer_runs ORDER BY created_at ASC, id ASC`, assign `seq = 1, 2, 3, ...` in that order via individual `UPDATE` statements (or a single connection-level loop — implementer's call, small tables expected at dev/local scale per D2). `downgrade()`: inspector-guarded `batch_alter_table` column drop, mirrors 0010.

- [ ] **Step 1: Re-baseline the suite**

Run once, before touching any code: `cd coordinator && python -m pytest tests -q --basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider` (foreground, with `timeout`). Record the pass/fail/skip counts as this phase's baseline (expected near the P9-close baseline of 17 failed/1356 passed/4 skipped, but do not assume — use the actual fresh number).

- [ ] **Step 2: Re-verify the 3 sites and grep for a 4th**

Run `grep -rn "AnalyzerRun.*order_by\|order_by.*AnalyzerRun\|created_at.desc(), AnalyzerRun.id.desc()" coordinator/app` (per UNVERIFIED #1 and #7) and `grep -rn "AnalyzerRun(" coordinator/app` to enumerate every construction site that will need `seq` assignment (per UNVERIFIED #2). Confirm current line numbers for all three named sites. If a 4th read site or a construction site bypassing `commit_write`/`flush_write` is found, flag it in the final report and extend this task's file list before proceeding.

- [ ] **Step 3: Write failing tests first**

Create `coordinator/tests/test_analyzer_run_seq.py`:

```python
from datetime import datetime, timezone

from app.models.entities import AnalyzerRun
# import next_analyzer_run_seq from wherever it is placed (confirm module path per Step 2's findings)


def test_seq_is_assigned_monotonically_on_construction(db) -> None:
    # Real Debate + branch fixtures (reuse existing factory helpers -- grep
    # conftest.py for the debate/branch fixture used by existing AnalyzerRun
    # tests, e.g. test_node_scoring.py, before hand-building).
    run_a = _make_analyzer_run(db, debate, branch, analyzer_type="scoring")
    run_b = _make_analyzer_run(db, debate, branch, analyzer_type="scoring")
    assert run_b.seq == run_a.seq + 1


def test_same_created_at_tick_resolved_by_seq_not_random_id(db) -> None:
    # Force two AnalyzerRun rows to share the identical created_at timestamp
    # (construct both with an explicit, equal created_at= override -- this is
    # the deterministic repro for the flake: a same-tick collision).
    frozen = datetime.now(timezone.utc)
    run_a = _make_analyzer_run(db, debate, branch, analyzer_type="scoring", created_at=frozen)
    run_b = _make_analyzer_run(db, debate, branch, analyzer_type="scoring", created_at=frozen)
    # The real read-site query (import and call the actual function from
    # service.py/serialization.py/runner.py -- do not reimplement the query
    # inline) must deterministically select run_b (higher seq), regardless of
    # what id.desc() alone would have picked (random UUID4 ordering).
    latest = _latest_via_real_read_site(db, debate.id)
    assert latest.id == run_b.id


def test_migration_backfills_seq_deterministically_for_existing_rows(db) -> None:
    # Exercise via existing migration-test pattern (grep test_migrations.py or
    # equivalent for the 0009/0010 precedent -- run migrations against a fresh
    # SQLite file, insert rows pre-migration with only created_at/id, run 0011,
    # assert seq values are 1..N in created_at,id order).
    ...
```

(Implementer: replace `_make_analyzer_run`/`_latest_via_real_read_site` placeholders with real calls to existing fixtures and the actual production functions at the three sites — do not hand-roll a parallel query, the point of this test is to exercise the real read-site code.)

- [ ] **Step 4: Run to verify failure**

Run: `cd coordinator && python -m pytest tests/test_analyzer_run_seq.py -v --basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`
Expected: FAIL (`seq` column/attribute does not exist yet; migration 0011 does not exist yet).

- [ ] **Step 5: Implement**

5a. Add `seq` column to `AnalyzerRun` in `entities.py`. 5b. Write migration `0011_analyzer_run_seq.py` per the Interfaces section, modeled on 0010's inspector-guarded style. 5c. Add the `next_analyzer_run_seq(db)` helper. 5d. Patch every `AnalyzerRun(...)` construction site found in Step 2 to set `seq=next_analyzer_run_seq(db)` before the surrounding `flush_write`/`commit_write`. 5e. Patch all three read sites' `order_by` clauses to `AnalyzerRun.seq.desc(), AnalyzerRun.created_at.desc(), AnalyzerRun.id.desc()`.

- [ ] **Step 6: Verify pass + regression check**

Run (single foreground call): `cd coordinator && python -m pytest tests/test_analyzer_run_seq.py tests/test_node_scoring.py tests/test_protocol_runner.py -v --basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider` (add/adjust the serialization test file name once confirmed in Step 2).
Expected: all pass except pre-existing known failures from Step 1's baseline. If a NEW failure appears, fix the root cause before reporting done.

- [ ] **Step 7: Report status (no commit).** Flag: confirmed construction-site list and whether any bypassed `commit_write` (UNVERIFIED #2), confirmation no 4th read site exists (UNVERIFIED #1/#7), migration dry-run result against both empty and populated SQLite files. This task is a hard precondition for Task 2/3 — do not proceed to Part B until this task's tests are green.

---

### Task 2: Swarm descriptor — pure planner + flag-gated persistence at debate creation

**Files:**
- Create: `coordinator/app/services/swarm_planner.py`
- Modify: `coordinator/app/services/orchestrator.py` (`create_debate`, ~line 203 — call the planner behind the flag, immediately after/around existing debate construction, same transaction)
- Modify: `coordinator/app/core/config.py` (only if `DIALECTICAL_SWARM` needs a dedicated helper beyond direct `bool_env` call — likely no change, call `bool_env` at the call site per house convention)
- Create: `coordinator/tests/test_swarm_planner.py`

**Interfaces:**
- `SWARM_VERSION = "swarm-v1"` (module constant).
- `plan_swarm(*, requested_perspectives: int, capable_workers: list[Worker]) -> dict`: pure function, no I/O, no DB access — caller passes in the already-queried `capable_workers` list (from `capable_online_workers(db, model_id)`, called by the orchestrator, not by this function — keeps `swarm_planner.py` pure and testable without a DB, mirroring `calibration.py`'s precedent).
  - Returns `{"version": SWARM_VERSION, "requestedPerspectives": requested_perspectives, "assignments": [...], "shortfall": k}` where `assignments` is a list of `{"index": i, "workerId": worker.id, "modelId": <model used>}` dicts, one per real worker actually assigned (up to `min(requested_perspectives, len(capable_workers))`), in the input order of `capable_workers` (deterministic, no re-sorting).
  - `shortfall = max(0, requested_perspectives - len(capable_workers))`. When `shortfall == 0`, still include the key (`"shortfall": 0`) — honest, not omitted.
  - `requested_perspectives <= 0` or `capable_workers == []`: return `{"version": SWARM_VERSION, "requestedPerspectives": requested_perspectives, "assignments": [], "shortfall": requested_perspectives}` (or `0` if `requested_perspectives <= 0` — no negative shortfall; clamp to `max(0, ...)`).
  - NEVER invents a worker: `assignments` length is always `<= len(capable_workers)` — this is the hard honesty invariant tests must pin.
- Orchestrator integration in `create_debate(db, topic, config=None)`: after the existing debate row is constructed (before or as part of the same `commit_write`), if `bool_env("DIALECTICAL_SWARM", False)` is `True` AND the caller-supplied `config` (or a new optional parameter, e.g. `requested_perspectives: int | None = None` — implementer's call based on how callers currently invoke `create_debate`, confirm call sites first) requests a swarm, call `capable_online_workers(db, model_id)` for whatever `model_id` the debate's default arguer model is (confirm this value's source — likely `V2_CODEX_MODEL_ID` or a config-supplied model, grep `create_debate` callers), then `plan_swarm(...)`, then write the result into `debate.config["swarm"] = {...}`. If the flag is off, or no swarm was requested, `debate.config` gets no `"swarm"` key at all — byte-identical to today.

- [ ] **Step 1: Write failing tests first**

Create `coordinator/tests/test_swarm_planner.py`:

```python
from app.services.swarm_planner import SWARM_VERSION, plan_swarm


def test_plan_swarm_full_assignment_when_enough_workers(make_worker) -> None:
    workers = [make_worker(id=f"w{i}") for i in range(3)]
    result = plan_swarm(requested_perspectives=3, capable_workers=workers)
    assert result["version"] == SWARM_VERSION
    assert result["requestedPerspectives"] == 3
    assert len(result["assignments"]) == 3
    assert result["shortfall"] == 0


def test_plan_swarm_honest_partial_assignment_when_fewer_workers(make_worker) -> None:
    workers = [make_worker(id="w0"), make_worker(id="w1")]
    result = plan_swarm(requested_perspectives=5, capable_workers=workers)
    assert len(result["assignments"]) == 2
    assert result["shortfall"] == 3
    # Never fabricates a 3rd/4th/5th worker:
    assert {a["workerId"] for a in result["assignments"]} == {"w0", "w1"}


def test_plan_swarm_zero_workers_never_fabricates(make_worker) -> None:
    result = plan_swarm(requested_perspectives=4, capable_workers=[])
    assert result["assignments"] == []
    assert result["shortfall"] == 4


def test_plan_swarm_zero_requested_is_honest_noop(make_worker) -> None:
    workers = [make_worker(id="w0")]
    result = plan_swarm(requested_perspectives=0, capable_workers=workers)
    assert result["assignments"] == []
    assert result["shortfall"] == 0


def test_create_debate_flag_off_writes_no_swarm_key(db, monkeypatch) -> None:
    monkeypatch.delenv("DIALECTICAL_SWARM", raising=False)
    debate = create_debate(db, "topic", config={"swarm": {"requestedPerspectives": 3}})
    assert "swarm" not in (debate.config or {})


def test_create_debate_flag_on_writes_real_worker_derived_swarm(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_SWARM", "true")
    # Real Worker fixtures (online, capable) persisted first, per house
    # capable_online_workers test precedent -- grep existing worker-lifecycle
    # tests for the fixture helper before hand-building.
    ...
    debate = create_debate(db, "topic", config={"swarm": {"requestedPerspectives": 2}})
    assert debate.config["swarm"]["version"] == "swarm-v1"
    assert len(debate.config["swarm"]["assignments"]) <= 2
```

(Implementer: confirm `create_debate`'s actual call sites/config shape conventions per UNVERIFIED #5 before finalizing the `requested_perspectives` plumbing — it may arrive via `config["swarm"]["requestedPerspectives"]` on input, as sketched above, or via a separate parameter; pick whichever matches how other feature-scoped config is threaded through `create_debate` today, document the choice.)

- [ ] **Step 2: Run to verify failure**

Run: `cd coordinator && python -m pytest tests/test_swarm_planner.py -v --basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`
Expected: FAIL (`ModuleNotFoundError` — `swarm_planner.py` does not exist yet).

- [ ] **Step 3: Implement**

Implement `plan_swarm` per the Interfaces section (pure, no DB/env access — mirrors `calibration.py`'s purity discipline). Wire the flag-gated call into `create_debate` in `orchestrator.py`, reading `DIALECTICAL_SWARM` via `bool_env` at the call site (not inside `swarm_planner.py`).

- [ ] **Step 4: Verify pass**

Run: `cd coordinator && python -m pytest tests/test_swarm_planner.py -v --basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`
Expected: all pass.

- [ ] **Step 5: Report status (no commit).** Flag: the exact shape used to request a swarm at `create_debate` call time (confirms/refutes UNVERIFIED #5's assumption), confirmation flag-off is byte-identical (dedicated test above). Move to Task 3.

---

### Task 3: Execution seam — dispatch swarm assignments through existing job machinery, honest status tracking

**Files:**
- Modify: `coordinator/app/services/swarm_planner.py` (add dispatch/status-tracking helpers alongside the pure planner — or split into a second module, e.g. `swarm_dispatch.py`, if `orchestrator.py`-style DB access would otherwise pollute the pure-function file; implementer's call, document it)
- Modify: `coordinator/app/services/orchestrator.py` or `dialectical_v2.py` (wherever the real job-dispatch call for a new debate's initial branches happens today — confirm exact site per UNVERIFIED #4 before editing)
- Create: `coordinator/tests/test_swarm_dispatch.py`

**Interfaces:**
- First, per UNVERIFIED #4: read the full existing branch/POV fan-out flow. If it's confirmed that today's "one job per role per branch" dispatch already IS a form of multi-perspective fan-out (multiple arguer jobs per debate), this task's job is the MINIMAL delta: group the jobs already created for a swarm-flagged debate's assignments and track them as a unit, rather than inventing a parallel dispatch path. Document this decision explicitly in the report regardless of which way it resolves.
- `dispatch_swarm_assignments(db: Session, debate: Debate) -> dict | None`: if `debate.config.get("swarm")` is absent, return `None` (no-op, matches flag-off/no-swarm-requested state). Otherwise, for each assignment in `debate.config["swarm"]["assignments"]` without a `jobId` yet, call the existing `create_job(db, debate.id, job_type, role, node_id, required_model=assignment["modelId"])` (reusing whichever `job_type`/`role`/`node_id` values the existing single-perspective dispatch path already computes for a new debate — no new job type), then record `assignment["jobId"] = job.id` and `assignment["status"] = "dispatched"` back into `debate.config["swarm"]["assignments"][i]`, and `commit_write(db)`.
- `swarm_status(db: Session, debate: Debate) -> dict | None`: if no `swarm` key, return `None`. Otherwise, for each assignment with a `jobId`, look up the real `Job.status` (`db.get(Job, assignment["jobId"])`), map to `"pending"|"running"|"complete"|"failed"` (pass through the real `Job.status` value, do not reinterpret), write it back into `assignment["status"]`. Compute `"complete": all(a["status"] in ("complete", "failed") for a in assignments)` — completion means ALL assignments terminal, failures included honestly, never masked. Persist the refreshed statuses via `commit_write(db)` before returning.
- No new `Job` columns, no new worker-facing protocol — `Job` rows created here are claimed/processed by the exact same worker-claim path (`worker_can_claim_job`, `capable_online_workers`) as any other job.

- [ ] **Step 1: Write failing tests first**

Create `coordinator/tests/test_swarm_dispatch.py`:

```python
def test_dispatch_swarm_assignments_noop_when_no_swarm_key(db) -> None:
    debate = _make_debate(db, config={})
    assert dispatch_swarm_assignments(db, debate) is None


def test_dispatch_creates_one_real_job_per_assignment(db) -> None:
    # Real debate with a swarm descriptor (from Task 2's plan_swarm output,
    # or hand-built matching shape) with 2 assignments, no jobId yet.
    debate = _make_debate_with_swarm(db, assignments=[{"index": 0, "workerId": "w0", "modelId": "m1"}, {"index": 1, "workerId": "w1", "modelId": "m1"}])
    dispatch_swarm_assignments(db, debate)
    updated = debate.config["swarm"]["assignments"]
    assert all(a.get("jobId") for a in updated)
    assert all(a["status"] == "dispatched" for a in updated)
    # Confirm real Job rows exist:
    for a in updated:
        job = db.get(Job, a["jobId"])
        assert job is not None


def test_swarm_status_reflects_real_job_states_including_failure(db) -> None:
    debate = _make_debate_with_dispatched_swarm(db)  # jobs already created
    # Force one real Job row to status="failed", another to "complete".
    ...
    status = swarm_status(db, debate)
    statuses = {a["index"]: a["status"] for a in status["assignments"]}
    assert statuses[0] == "failed"
    assert statuses[1] == "complete"
    assert status["complete"] is True  # both terminal -- failure counts as terminal, not hidden


def test_swarm_status_not_complete_while_any_assignment_pending(db) -> None:
    debate = _make_debate_with_dispatched_swarm(db)
    # Leave at least one underlying Job at status="pending" or "running".
    status = swarm_status(db, debate)
    assert status["complete"] is False
```

(Implementer: fill in `_make_debate`/`_make_debate_with_swarm`/`_make_debate_with_dispatched_swarm` using real fixtures matching whatever `job_type`/`role`/`node_id` values the confirmed dispatch site from UNVERIFIED #4 actually needs.)

- [ ] **Step 2: Run to verify failure**

Run: `cd coordinator && python -m pytest tests/test_swarm_dispatch.py -v --basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`
Expected: FAIL (`dispatch_swarm_assignments`/`swarm_status` not defined yet).

- [ ] **Step 3: Implement**

Implement `dispatch_swarm_assignments` and `swarm_status` per the Interfaces section, reusing `create_job` and `commit_write` exactly as today's single-perspective path does. Do not touch `runner.py`'s QBAF/evidence overlay or `compositionNote` — this task is orchestration-only.

- [ ] **Step 4: Verify pass + full regression**

Run (single foreground call, one shot): `cd coordinator && python -m pytest tests/test_analyzer_run_seq.py tests/test_swarm_planner.py tests/test_swarm_dispatch.py tests/test_node_scoring.py tests/test_protocol_runner.py -v --basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`
Expected: all pass except the Step-1-of-Task-1 baseline known failures. If a NEW failure appears, fix the root cause before reporting done — do not weaken a pre-existing test. If it times out once, report BLOCKED, do not retry in a loop.

- [ ] **Step 5: Report status (no commit)**

Do not commit. Report: file paths touched, test results, and explicitly flag as follow-on/deferred work:
- Whether UNVERIFIED #4 resolved to "new dispatch path" or "group/track existing fan-out" — state which, and why.
- That evidence verification, judge rotation, and the P7 hard-gate overlay were NOT touched (re-confirm `compositionNote` string is unchanged).
- That `DIALECTICAL_SWARM` flag-off leaves `Debate.config`, job creation, and dispatch behavior byte-identical to pre-phase behavior.
- Any operational gaps found (e.g. no UI/API surface to request a swarm yet — this phase only wires the planner + dispatch + status, not a user-facing trigger, unless UNVERIFIED #5's investigation reveals an existing config-request surface that already covers it).
