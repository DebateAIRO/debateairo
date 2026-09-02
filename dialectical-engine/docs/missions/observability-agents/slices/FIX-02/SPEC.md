# FIX-02 — Root survives the wrapper: the original error is reachable under every product wrap

**FROZEN at creation — 2026-09-01, seat REQ-FIX (Fable 5.1). No agent edits this file. Scope changes are a new SPEC version ratified by V.**
Gate: **G1 capture** · Depends-on for dispatch: none · Depends-on for acceptance: **FIX-01 merged** (a stored row is needed to look at).
Absorbs predecessor ticket: **S07 `t_9f4e5bfb`** (cause-chain retrofit) — MINUS the `buildSchemaRepairPacket` region of `apps/runner/src/index.ts`, which moves to FIX-03 so that the runner file has one writer (REQ-FIX decision, DECISIONS.md). Cites: D12 `t_40c2cc1b` comment 2026-08-27 ("D2 is not merely unproven, it is impossible").
D-criteria evidenced: **D2** (second half — the record preserves the ORIGINAL error under any wrapper; V lands on what failed, not what reported it).
Seam obligations: none of O-1..O-4 (no sink code). Batch-3 row 6 binds (no free text stored).

## 1. Intent
`packages/kernel/src/index.ts:283-288` — `TypedDomainError` takes `(code, message)` and calls `super(message)` with no `cause`, so every wrap in the product discards the original error before observability sees it (verified 2026-09-01). FIX-02 gives the product's typed error class a `cause`, makes the two DB wrap sites pass it instead of interpolating text, and proves on a stored row that the pg-level root is reachable beneath the product's wrapper.

## 2. Requirements
- **FIX-02-R01** `TypedDomainError` accepts `options?: { cause?: unknown }` and passes it to `super(message, options)`; `new TypedDomainError("X", "m", { cause: inner }).cause === inner`; existing two-argument callers compile unchanged.
- **FIX-02-R02** `typedPoolFailure` (`packages/db/src/index.ts`, the `wrapper` region — `:14-18` at `dc9fd57`, line numbers non-normative) constructs its error from a FIXED template and passes the pg error as `cause`; the text of the upstream error is never interpolated into the new message.
- **FIX-02-R03** `createPool`'s `pool.on("error")` path (`packages/db/src/index.ts` `wrapper` region, `:69-72` at `dc9fd57`) no longer writes the raw error to `console.error`; it reports through the capture layer's fixed-code DB-failure channel, which cannot recurse into the pool that failed.
- **FIX-02-R04** Walking `.cause` from the outermost product error reaches the original pg error object (identity, not text) through two real wrap levels at real call sites — proven by a test that throws a distinguishable inner error and asserts `outer.cause.cause === inner`.
- **FIX-02-R05** Async joins in the touched regions preserve every rejection, not only the first (`AggregateError` or equivalent carrying all causes).
- **FIX-02-R06** The stored record carries the chain: after a wrapped fault is captured through FIX-01's pipeline, `obs.occurrence.cause_relation` is non-null on the wrapper's row and `obs.occurrence_detail.cause_chain_codes` (human-only channel) lists the wrapper's registry code followed by the cause's code — codes only, never message text.
- **FIX-02-R07** Zero behaviour change for callers that do not pass a cause: the repo-wide `pnpm typecheck` diagnostic count in `packages/kernel/**` and `packages/db/**` is unchanged from the base.
- **FIX-02-R08** A green test suite is a worker milestone only; Done is V's veto after running §5.

## 3. States
Error object: `THROWN(inner)` → `WRAPPED(outer, cause=inner)` → `WRAPPED(outer2, cause=outer)`; the chain is a linked list terminating at the first error with `cause === undefined`.
Stored: wrapper row with `cause_relation = 'WRAPS'` (vocabulary from the registry; ARCH confirms the literal) and `parent_occurrence_ref` pointing at the cause's row where the cause was itself captured, else the sentinel `CAUSE_NOT_CAPTURED:<reason>`.

## 4. Copy and vocabulary
"cause chain" · "wrapper" vs "root" · "fixed template" (a message with no upstream text) · "chain codes" (the ordered registry codes of the chain). Never "stack trace" for what is stored (frames are normalized, repo-relative).

## 5. Acceptance — V runs this personally (repo root; FIX-01 merged)
1. `grep -n 'class TypedDomainError' -A 6 packages/kernel/src/index.ts` → the constructor accepts an options object with `cause` and passes it to `super`.
2. Run FIX-01 step 4's failing job (bad database name, planted password) → `exit=1`.
3. `docker exec debateai-v3-postgres-1 psql -U debateai -d debateai -At -c "SELECT o.code, o.cause_relation, d.cause_chain_codes FROM obs.occurrence o JOIN obs.occurrence_detail d ON d.occurrence_id = o.occurrence_id ORDER BY o.occ_seq DESC LIMIT 1"` → the wrapper's code first, then at least one further code from the pg layer in `cause_chain_codes` (a JSON array of ≥ 2 codes); `cause_relation` non-null.
4. `docker exec debateai-v3-postgres-1 psql -U debateai -d debateai -At -c "SELECT count(*) FROM (SELECT d::text t FROM obs.occurrence_detail d) s WHERE t LIKE '%no_such_database%' OR t LIKE '%PLANTED-SECRET-7731%'"` → `0` (codes, not text).
5. `grep -c 'console.error' packages/db/src/index.ts` → `0` in the `createPool` region (V opens the file at the `pool.on("error")` line and sees the capture channel call instead).
6. `pnpm typecheck; echo "exit=$?"` → the same exit code and the same count of diagnostics under `packages/kernel/**` and `packages/db/**` as the slice's recorded base (the handoff states both numbers).
V vetoes Done only after steps 1–6 match.

## 6. Out of scope
The runner's `buildSchemaRepairPacket` interpolation (FIX-03) · OBS-R064 re-throw-never-replaces (FIX-03, runner task-catch) · the CI wrapper-lint (FIX-16) · any sweep of the other 550+ `throw` sites (OBS-R022 inventory, FIX-16) · the `identity` re-export block and everything in the zone.

## 7. File surface (single-writer) and parallel safety
Allowed: `packages/kernel/src/index.ts` region `error-class` (`TypedDomainError`, EOF) · `packages/db/src/index.ts` regions `wrapper` (`typedPoolFailure`; `createPool` `pool.on("error")`) · tests `tests/unit/fix02-*.test.ts`, `tests/integration/fix02-*.test.ts`.
Read-only: `packages/obs-capture/src/registry/**` · `packages/obs-capture/src/health.ts` (the non-recursive channel).
Forbidden: `packages/db/src/index.ts` `obs-reexport` region and the identity re-export block · `apps/runner/src/index.ts` (all regions — FIX-03) · `packages/db/src/identity.ts` · `migrations/**`.
Parallel-safe with: every other slice (no file overlap). Acceptance order only: after FIX-01.
