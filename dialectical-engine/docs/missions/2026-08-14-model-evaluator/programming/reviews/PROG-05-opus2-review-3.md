# PROG-05 — Opus2 reviewer (seat substituting Grok), review 3 (codex/eval-05-harvest @ 8764ac6)

Reviewer: Opus2 (second independent reviewer), 2026-08-15. Read-only review of
`8764ac6 "fix(evaluator): make settlement harvest time-safe"` over the round-2
head `720303d`, in
`/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-05-harvest`.
Binding docs as before. No other PROG-05 review file was read.

## VERDICT: PASS

B3 is genuinely fixed at the root, not papered over: the settlement
observation's `observed_at` is now an order-safe harvest clock
(`max(harvest observedAt, prior consensus observed_at)`) while the resolver's
true `resolved_at` is preserved in both `outcome_json` and `provenance_json`, so
no measurement is lost and nothing is invented. All three of my round-2 live
reproductions now pass, the round-1 green surface is intact, and the clock
dependency in the lane's own fixtures is gone structurally rather than by luck.

---

## 1. Correction to the round-3 brief

The brief states "it is now past 12:00Z". It is not — I ran the gates at
**2026-08-15 10:36 UTC** (`date -u`), i.e. still ~1.5 h before the round-2 time
bomb would have detonated. A green suite therefore proves nothing on its own
today, so I did not rely on it. I established the fix three independent ways:

1. **Structural pinning.** `addExternalOutcome` now takes a required
   `resolvedAt` parameter (`tests/integration/evaluator-harvest-rework.test.ts:140`),
   the hardcoded `new Date("2026-08-15T12:00:00.000Z")` is gone, and three
   pinned constants (`SETTLED_AT` 07:00Z, `HARVESTED_AT` 09:00Z, `RECONCILED_AT`
   10:00Z, `:18-20`) are threaded through every harvest and reconcile call in
   that file. I checked every call site: none falls back to the default
   `new Date()`. `tests/integration/evaluator-database.test.ts` likewise passes
   an explicit `observedAt`.
2. **Wall clock moved forward.** I re-ran `evaluator-harvest-rework`,
   `evaluator-database` and `evaluator-harvest` under a process clock pinned to
   **2026-12-01T00:00:00Z** (my own vitest config + setup file in scratchpad,
   overriding `Date`/`Date.now`; I proved the setup actually executes by making
   it throw under an env flag). **35/35 pass.** Under round 2 that same run
   would have raised `OBSERVATION_SUPERSESSION_INVALID`.
3. **My own reproductions**, which never depended on wall clock (below).

## 2. My three round-2 reproductions, re-run live on embedded PostgreSQL

Same harness as reviews 1–2 (independent fixtures, real embedded PostgreSQL 18,
full `migrate()`, `globalThis.fetch` replaced by a throwing stub).

| Round-2 blocker case | Round 2 | Round 3 |
|---|---|---|
| Late settlement with **backdated** `resolved_at` (harvest 09:00Z, resolved 07:00Z) | `OBSERVATION_SUPERSESSION_INVALID`, harvest thrown away | **PASS** — `SETTLEMENTS_RECONCILED`, settlement row written with a supersession link, receipts `[…SUCCEEDED, STARTED, SKIPPED/SETTLEMENT_RECONCILIATION_SUCCEEDED]` |
| Run **already settled before first harvest**, earlier `resolved_at` | first harvest threw; run ended with **zero** observations | **PASS** — `HARVESTED`, 3 rows: consensus `authoring.artifact.v1`, consensus `prowess.outcome.v1`, settlement `prowess.outcome.v1` with `supersedes_observation_id` set |
| Batch containing such a run | exception propagated, whole batch aborted | **PASS** — batch completes |

Additional round-3 checks I wrote for this commit:

| Check | Result |
|---|---|
| H1 settlement `observed_at` never precedes the row it supersedes | PASS (both 09:00:00Z — equality is what the §3.4 guard allows) |
| H2 supersession link written on the very first pass | PASS |
| H3 true `resolved_at` preserved in `outcome_json` **and** `provenance_json` | PASS (`2026-08-15T07:00:00.000Z` in both) |
| H4 settlement row links the real `answer_outcome_id` | PASS |
| I1 two accepted settlements for one identity: both rows retained, exactly one supersession link (UNIQUE respected) | PASS |
| I2 the unlinked settlement is receipted, not silent (`SUPERSESSION_PRIOR_UNAVAILABLE:<outcome>`) | PASS |
| J1 poisoned run (my own INSERT-raising trigger) is isolated; the healthy run in the same batch still harvests | PASS — results `["HARVESTED","FAILED"]` |
| J2 circuit breaker stops selecting a run after 3 consecutive failures | PASS — exactly 3 FAILED receipts, then not selected |
| J4 a direct harvest of that run still succeeds once the cause is removed | PASS |

Round-1/2 green surface re-verified unbroken (22/22 in my regression harness):
exact consensus row set with correct actor per step; authoritative
`question_domain` and NULL when untagged; evaluator call-site exclusion for a
null-run-scoped artifact that authored a node; version-less identity skipped
with a `MODEL_IDENTITY_INCOMPLETE:<artifact>` receipt; zero `fetch` calls and
unchanged `MODEL_CALL` count across harvest; worker-owned metering (LOCAL_VLLM
cost 0 vs paid 1.0, UNMETERED judge) and cost cells; re-harvest idempotency
(`ALREADY_HARVESTED`, no duplicates) including the settlement pass; mid-flight
run neither harvested nor receipted; forced-failure run leaves `[STARTED,
FAILED]` and retries cleanly; append-only UPDATE/DELETE refusal; Q59 never
written.

Repository gates at 10:36 UTC: `pnpm run typecheck` clean; `npx vitest run`
**87 files / 644 tests passing**; `pnpm run lint` → `violations: []`,
`blocking: []`. Worktree clean, branch local-only (no push), no BOUND state, no
board mutation, no API-key material (DR-179).

## 3. Why I accept the fix as sound, not just green

- The order rule is enforced **twice**: in the pure projector
  (`packages/evaluator/src/index.ts:1230-1233`, `max(snapshot.observedAt,
  prior.observedAt)`) and again against the live prior row inside the write
  transaction (`:1361-1376`), which drops the link and receipts
  `SUPERSESSION_ORDER_INVALID` rather than letting the trigger abort the
  transaction. Belt and braces, and the failure mode is now a receipt rather
  than data loss.
- Nothing is fabricated: `observed_at` means "when the evaluator observed it",
  and the resolver's timestamp survives verbatim in two JSON fields (H3), so an
  auditor can still reconstruct real-world resolution order. DR-115 intact.
- The `supersedes_observation_id` UNIQUE constraint is respected by design, not
  by accident: the projector consumes each prior once, the write path re-checks
  "not already superseded", and the leftover settlement stays as auditable
  evidence with a typed receipt (I1/I2).
- Q59 separation, boundary tables, blinding (still no model call anywhere in
  harvest), Option E landing, and FR-0.7 identity granularity are all unchanged
  by this commit and re-verified.
- Round-2 non-blocking items 1 and 3 were also addressed: the metering outer
  failure now reports `METERING_RECONCILIATION_FAILED` with `callsFailed: 0`
  instead of a fabricated `1`, and the snapshot is read once per harvest.

## 4. Non-blocking findings carried into integration / lane 07

1. **The circuit breaker has no reset or alert surface.** After three
   consecutive FAILED receipts a run is excluded from batch selection
   permanently; I confirmed it is *not* re-selected even after the cause is
   removed (J3), and only a direct `harvestTerminalRun` recovers it (J4). Three
   passes during a transient outage would silently drop a run from collection.
   Before any scheduled wiring, add an operator surface (or count only failures
   since the last attempt-time window).
2. **`input_hash` is no longer a stable source-set identifier.** It now folds in
   `observed_at`, `value` and the JSON payloads
   (`packages/evaluator/src/index.ts:1277-1286`), so two attempts over an
   identical source set hash differently. STARTED and its terminal receipt do
   match, which was the goal; idempotency rests on the natural key and receipts,
   not the hash. Worth one line in the README so nobody later treats it as a
   content fingerprint.
3. **Snapshot is captured in the prepare transaction**, before the
   `ALREADY_HARVESTED` check and outside the write lock; artifacts landing
   between the two transactions are only picked up by a later settlement pass
   (other families would need a pipeline-version bump). Acceptable while dark,
   worth naming in the integration report.
4. Carry-forward, still open and still non-blocking: evaluator exclusion rests
   solely on call-site evidence (a provider-ref/maker check would be cheap
   defence in depth); OK calls whose artifact lacks a model version remain
   invisible to metering, not even counted as unmetered; every re-harvest of a
   never-settling run appends a `NO_NEW_SETTLEMENTS` receipt (it now doubles as
   the circuit-breaker reset, so it earns its keep, but it is unbounded).
5. **Lane 07 hand-off, now documented in the README and worth ratifying:** a
   settlement row *replaces* the consensus row named by
   `supersedes_observation_id` and must not be pooled or averaged with it; the
   two share `prowess.outcome.v1` but carry different quantities (propagated
   strength vs binary resolved outcome).

Nothing above blocks merge from my seat.
