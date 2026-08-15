# PROG-05 — Opus2 reviewer (seat substituting Grok), review 4 (codex/eval-05-harvest @ 1859b75)

Reviewer: Opus2 (second independent reviewer), 2026-08-15. Narrow-delta review of
`1859b75 "fix(evaluator): bound prepare-phase harvest failures"` over the round-3
head `8764ac6`. Scope set by the coordinator: Hermes's withheld stage approval
(phase-1 failures returned `FAILED` to the batch but persisted no countable
strike, so such a run never parked). I read `PROG-05-hermes-stage-verdict.md`;
no peer-seat review file was read.

## VERDICT: PASS

The gap Hermes named is closed at the right place — validation, the prepare
transaction, and the write transaction now all sit inside the one `try` whose
`catch` persists the durable `TERMINAL_HARVEST_FAILED` strike
(`packages/evaluator/src/index.ts:1292-1310`, `:1466-1483`), with a synthetic
`sha256` input hash when the failure happened before the real hash existed. I
reproduced a phase-1 failure with my own mechanism (not the lane's), and the run
parks after exactly three attempts while a healthy run in the same batch
harvests untouched. No regression to my round-3 surface.

---

## 1. Independent phase-1 reproduction

The lane's new regression forces the failure by raising on the `STARTED`
`pipeline_event` insert. I deliberately used a *different* and more realistic
mechanism, so the fix is not verified against its own shape: **corrupt input at
the snapshot/projection stage**. I inserted an accepted external outcome with
`resolved_at = 'infinity'::timestamptz`, which `pg` hands back as an
unrepresentable date; the projector's `settlement.resolvedAt.toISOString()`
(`packages/evaluator/src/index.ts:1234`) then throws while
`harvestInputHash(snapshot)` is being computed — inside the prepare transaction,
before any `STARTED` receipt can exist. No triggers, no DDL: just data the
harvester cannot project.

| Check (real embedded PostgreSQL 18, own fixtures, `fetch` stubbed to throw) | Result |
|---|---|
| R4-1 corrupt input fails in phase 1 | PASS — `RangeError: Invalid time value` |
| R4-2 that failure persists a countable strike | PASS — receipt trail is exactly `[FAILED / TERMINAL_HARVEST_FAILED]`, no STARTED (there could not be one) |
| R4-3 strike carries a well-formed synthetic hash | PASS — matches `^[0-9a-f]{64}$`, satisfying the 0023 CHECK |
| R4-4 healthy run in the same batch still harvests | PASS — 1 observation, `HARVESTED` |
| R4-5 poisoned run is reported `FAILED` by the batch, not thrown | PASS |
| R4-6 each batch attempt adds exactly one durable strike | PASS — passes 1/2/3 each report `FAILED`; 3 strikes total |
| R4-7 the run parks after exactly three attempts | PASS — pass 4 does not select it; strike count stays 3 |
| R4-8 parking is stable across further passes | PASS |
| R4-9 a parked run wrote no partial observations | PASS — 0 rows |
| R4-10 direct harvest recovers it once the input is corrected | PASS — `HARVESTED`, 2 observations |
| R4-11 a SUCCEEDED receipt reopens the strike window | PASS |

R4-9 matters as much as the strike counting: the two-transaction shape means a
phase-1 failure leaves nothing behind but the receipt — no half-projected run.

## 2. No regression to the round-3 surface

- My round-2 reproduction harness: **23/23 PASS** — including both time-safety
  cases (backdated late settlement reconciles; run already settled before first
  harvest yields consensus + settlement), batch isolation, exact consensus row
  set and per-step actor attribution, authoritative/NULL domain, evaluator and
  version-less exclusion with `MODEL_IDENTITY_INCOMPLETE` receipt, zero provider
  calls, worker metering and cost cells, idempotency, mid-flight run untouched,
  append-only refusal, Q59 never written.
- My round-3 addendum: **10/10 PASS** — settlement `observed_at` never precedes
  the row it supersedes, true `resolved_at` preserved in both JSON fields, two
  settlements → both retained with exactly one link plus
  `SUPERSESSION_PRIOR_UNAVAILABLE`, batch isolation, three-strike parking, and
  direct recovery.
- Wall clock forced to **2026-12-01**: the three evaluator test files pass
  **36/36**, so the round-2 time bomb remains defused (my scratchpad vitest
  config + setup file, previously proven to execute).
- Repository gates at 2026-08-15 10:52 UTC: `pnpm run typecheck` clean;
  `npx vitest run` **645 tests passing**; `pnpm run lint` → `violations: []`,
  `blocking: []`. Worktree clean, branch local-only, no BOUND state, no API-key
  material.

## 3. One new non-blocking observation

Moving validation inside the strike-bearing `try` means a **caller-input bug now
consumes a run's retry budget**. I confirmed it: calling
`harvestTerminalRun(runId, new Date("nope"))` throws
`EVALUATOR_HARVEST_TIME_INVALID` *and* leaves a `FAILED /
TERMINAL_HARVEST_FAILED` receipt on an otherwise healthy run. Three such calls
would park a run that has nothing wrong with it. The batch path always passes a
valid date, so nothing is broken today; before ticket 06/11 or any scheduler
wires more callers, prefer validating arguments *before* the try, or record a
distinct reason (e.g. `HARVEST_INPUT_INVALID`) that the selector does not count
as a run strike.

Carry-forwards from review 3 remain open and remain non-blocking: no reset or
alert surface for parked runs (board already assigns this to ticket 11);
`input_hash` is per-attempt, not a stable source-set fingerprint (and phase-1
strikes now carry a synthetic hash, which is honest but a third hash flavour);
the snapshot is captured in the prepare transaction; evaluator exclusion rests
solely on call-site evidence; calls whose artifact lacks a model version stay
invisible to metering; `NO_NEW_SETTLEMENTS` receipts are unbounded; and lane 07
must replace — never pool — the consensus row named by
`supersedes_observation_id`.

Nothing above blocks merge from my seat.
