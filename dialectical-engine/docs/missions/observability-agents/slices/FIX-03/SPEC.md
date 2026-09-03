# FIX-03 — Runner job surface: a failed run's job is recorded with its real run identity, and the original error is never replaced

**FROZEN at creation — 2026-09-01, seat REQ-FIX (Fable 5.1). No agent edits this file. Scope changes are a new SPEC version ratified by V.**
Gate: **G1 capture** · Depends-on for dispatch: none · Depends-on for acceptance: **FIX-01 merged** (rows need the runtime) and the dev stack up (`pnpm dev:auth:up`, Hatchet on 7077).
Absorbs predecessor tickets: **S06 `t_5504afe0`** (runner binding — PARTIAL on `dev`: `apps/runner/src/main.ts:1` carries the installer import and `tests/integration/obs-l3-s06-runner-binding.test.ts` exists via `e8d99d33`, but `apps/runner/src/index.ts` contains no capture call — grep 2026-09-01) · **S03c** (declared-kind projection, `planning/L2-ADDENDUM-2-DECLARED-KINDS.md` §4 — ticket never minted; kind list V-ratified V-5(a) 2026-08-26) · **S07 `t_9f4e5bfb`'s `buildSchemaRepairPacket` region** (moved here; see FIX-02) · the OBS-R064 relocation (`planning/S07-ownership-ruling.md`).
D-criteria evidenced: **D1** (runner surface), **D2** (first half — identity: `run_ref`/`work_item_ref` are real ids, not placeholders), **D6** (no zone contact).
Seam obligations: O-1..O-4 do not apply (no sink code). Batch-7 (declared kinds, not shapes) and R-E4 (no user-linked ids) bind.

## 1. Intent
The runner is the product's core surface. Today a failed work item is recorded by `recordTerminalFailure` and, when that write fails, the ORIGINAL error is replaced by `RUNNER_FAILURE_STATE_NOT_RECORDED` (`apps/runner/src/index.ts` task-catch, verified 2026-09-01) — the system destroys the evidence of what failed exactly when it fails to record it. FIX-03 makes the task-catch capture the failure BEFORE the terminal-failure write, always re-throw the original, seed the ambient context with the dispatch's `runId`/`workItemId`, and land the declared-kind projection so those ids reach the row as real references.

## 2. Requirements
- **FIX-03-R01** In `declareHatchetWalkingSkeletonTask`'s catch, capture fires BEFORE `recordTerminalFailure`, inside an ambient context seeded with `run = dispatch.runId`, `work_item = dispatch.workItemId`, and the Hatchet attempt index.
- **FIX-03-R02** When `recordTerminalFailure` returns false, the ORIGINAL caught error is re-thrown (the `RUNNER_FAILURE_STATE_NOT_RECORDED` condition is emitted as its own occurrence with the original as `cause`, and never replaces it).
- **FIX-03-R03** Retries of one work item fold into one work unit: each occurrence carries `attempt_index`, and `obs.incident.distinct_work_unit_count` counts work items, not rows (asserted at FIX-09; the column is written here).
- **FIX-03-R04** `packages/obs-capture/src/kinds.ts` (new) holds the frozen six-kind list — `run`, `work_item`, `node`, `attempt`, `ledger_entry`, `at_seq` — one kind per column, one-to-one, transcribed from L2-ADDENDUM-2 §2.1; the test's expected list is transcribed from that document, never read from `kinds.ts`.
- **FIX-03-R05** The projection is a veto, not a vote: a value reaches `run_ref` only when a seam DECLARED it as kind `run`; a shape-valid UUID with no declaration lands as `UNKNOWN:DECLARED_KIND_REQUIRED`; a lawful kind in the wrong field is rejected; zone-context occurrences carry no correlation ref at all.
- **FIX-03-R06** `kinds.ts` has zero runtime imports (type-only import of `ObsContext`); a resolve-hook trace of `import("@debateai/obs-capture")` shows the pre-slice module set plus exactly `src/kinds.ts`, and still ZERO `pg`, ZERO `@debateai/db`, ZERO `apps/**`, ZERO `src/zone/*`.
- **FIX-03-R07** `buildSchemaRepairPacket` (`apps/runner/src/index.ts`) no longer interpolates the raw zod parse text into the provider message; it emits a stable code plus a safe-template id and enumerated template parameters, and the raw parse text never enters any prompt, row, or spool.
- **FIX-03-R08** The provider gateway seam (`createPostgresProviderGateway` region) seeds `run` into the ambient context for provider calls made on behalf of a run, so FIX-05's provider rows inherit it.
- **FIX-03-R09** A failed runner job yields exactly one `obs.occurrence` row per attempt with `runtime = 'runner'`, `capture_point = 'job'`, `run_ref` equal to the run's uuid and `work_item_ref` equal to the work item's uuid (joinable to `obs.run_correlation_v`), `capture_status = 'PERSISTED'`.
- **FIX-03-R10** No user-linked value is ever a lawful kind: `asker_id` and `session_id` are inexpressible (no kind exists), asserted by a test that attempts to declare them and observes rejection.
- **FIX-03-R11** The runner's exit code, Hatchet result payload, and the terminal-failure write are unchanged in every case where capture is off.
- **FIX-03-R12** A green suite is a milestone; Done is V's veto after §5.

## 3. States
Work item: `CLAIMED` → `EXECUTING` → `COMPLETED` | `FAILED(recorded)` | `FAILED(not recorded → original re-thrown, second occurrence with cause)`.
Correlation field: `DECLARED(kind, value)` → projected · `UNDECLARED` → `UNKNOWN:DECLARED_KIND_REQUIRED` · `NOT_APPLICABLE` (declared absent) · `ZONE_CONTEXT` → no ref.

## 4. Copy and vocabulary
"work unit" (one work item across its retries) · "declared kind" · "veto not vote" · "seam" (the code site that seeds context). Never "session" or "user" in any obs row.

## 5. Acceptance — V runs this personally (dev stack up; FIX-01 merged)
1. `pnpm dev:auth:up` in one terminal → the stack reports api/runner/ui up on :3000; Hatchet dashboard `http://localhost:8888` shows the runner worker registered.
2. Cause a real failed run through the product: from the UI at `https://localhost:3000`, start a debate whose configured provider endpoint is unreachable (V points the dev provider at a closed port in the register before step 1, or stops the vLLM/relay the runner uses) → the debate shows a failed state in the UI.
3. `docker exec debateai-v3-postgres-1 psql -U debateai -d debateai -At -c "SELECT runtime, capture_point, code, run_ref, work_item_ref, attempt_index, capture_status FROM obs.occurrence WHERE runtime='runner' ORDER BY occ_seq DESC LIMIT 3"` → rows with `runner|job|<code>|<uuid>|<uuid>|<n>|PERSISTED`; `run_ref` is a uuid, NOT `UNKNOWN:…`.
4. `docker exec debateai-v3-postgres-1 psql -U debateai -d debateai -At -c "SELECT count(*) FROM obs.run_correlation_v v JOIN obs.occurrence o ON o.run_ref = v.run_id::text WHERE o.runtime='runner'"` → ≥ 1 (the row joins to the real run without guessing).
5. `grep -n 'RUNNER_FAILURE_STATE_NOT_RECORDED' -B 6 -A 3 apps/runner/src/index.ts` → the catch captures before `recordTerminalFailure` and the final statement re-throws the ORIGINAL error.
6. `grep -n 'parseError' apps/runner/src/index.ts | grep -c '\${'` → `0` (no interpolation of parse text).
7. Retry fold: with `engineRetries` ≥ 1 in the dev register, one failed work item shows ≥ 2 occurrence rows with the same `work_item_ref` and increasing `attempt_index`, and (after FIX-09) one incident.
8. `docker exec debateai-v3-postgres-1 psql -U debateai -d debateai -At -c "SELECT count(*) FROM (SELECT o::text t FROM obs.occurrence o) s WHERE t ~ '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' AND t LIKE '%asker%'"` → `0`.
V vetoes Done only after steps 1–8 match; step 7 may be recorded as `PENDING FIX-09` for the incident half.

## 6. Out of scope
Provider exhaustion capture inside `packages/providers` (FIX-05) · kernel/db wrap sites (FIX-02) · node-level (`node_ref`) and `at_seq` seams (Tier B, no owner — recorded as gaps) · the runner's own product bugs (ticketed separately) · anything in `apps/api`.

## 7. File surface (single-writer) and parallel safety
Allowed: `apps/runner/src/index.ts` regions `task-catch` (`declareHatchetWalkingSkeletonTask`), `gateway-seam` (`createPostgresProviderGateway`), `buildSchemaRepairPacket` · `apps/runner/src/main.ts` (already imports the installer; may add context seeding only) · `packages/obs-capture/src/kinds.ts` (new) · `packages/obs-capture/src/redactor.ts` region `declared-kind-projection` (named region; ARCH anchors it by symbol) · tests `tests/integration/fix03-*.test.ts`, `tests/unit/fix03-*.test.ts`; the landed `tests/integration/obs-l3-s06-runner-binding.test.ts` may be amended by this slice only.
Read-only: `packages/obs-capture/src/{context,emit,index}.ts` · `packages/obs-capture/install/runner.ts` · `packages/kernel/src/index.ts` (FIX-02 owns it) · `packages/providers/src/index.ts` (FIX-05 owns it).
Forbidden: `packages/obs-capture/src/runtime/**` (FIX-01) · `packages/kernel/**`, `packages/db/**` (FIX-02) · `apps/api/**` · the zone.
Parallel-safe with: FIX-01, FIX-02, FIX-04, FIX-05 (files disjoint; FIX-05 and FIX-03 both touch `redactor.ts`? NO — FIX-05 does not; only FIX-03 owns the projection region), FIX-08+, FIX-16. Sequence note: FIX-01 and FIX-03 both write under `packages/obs-capture/src/` but disjoint files — lawful in parallel.
