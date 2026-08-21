# S00 · CLAUDE REVIEW (rev 2) — APPROVED

Reviewer: Claude lane (Opus 5 subagent), 2026-08-08. Independent verification:
typecheck 0 · lint 0 (27 rows clean, source audit empty) · build 0 (codegen +
tsc + next 7/7) · `pnpm test:s00` 0 — 14 files / 49 tests green vs embedded
PostgreSQL 18.4, reproducing the orchestrator's evidence incl. all four runner
lifecycle tests.

## Per-blocker disposition (rev-1 findings 1–7): ALL FIXED

1. **FIXED** — real roots: `apps/api/src/main.ts` (`loadApiEnvironment()` →
   pool → gateway → application → `api.listen(...)`) and
   `apps/runner/src/main.ts` (`loadRunnerEnvironment()` → Hatchet worker
   `registerWorkflows` + `start()`); `start` scripts present; no doubles
   reachable; process.env still confined to the register.
2. **FIXED** — `SERVE_BLOCKED_BEFORE_COMPOSITION` gone; BLOCK flows through
   `ServeRepository.persist` (`servedNumber: null`, `serve_state='BLOCKED'`,
   TERMINAL progress event, `outcome='BLOCKED'` ledger row, settlement). DB
   test asserts `{state: DONE, terminal: BLOCKED, serve_state: BLOCKED,
   composed_text_id: null}` + exactly one TERMINAL event.
3. **FIXED** — battery evidence real: §6 section locators verified against all
   12 doc headers; typed per-row `predicateInputs` matching the doc verbatim
   (Q1/Q2/Q5/R2/R9/Q61 spot-checked); Q14/Q40/R6 file typed
   `ABSENT/PREDICATE_UNWRITTEN` exactly per §7.3; Q62 `PARTIAL`; Q61 carries
   the register-configured settlement-watch handle (blank throws).
4. **FIXED** — `ledger.reduced_judgement` gained `number_kind, source_ref,
   producer, replay_handle` (migration:181–184, NOT NULL + non-blank CHECKs);
   `readNodesForRun` reads base_score from the judgement LATERAL, strength
   from the propagation LATERAL — no borrowing; DB test asserts distinct
   provenance from the database.
5. **FIXED** — row 19 matches §3.2 exactly (memory/liveness removed); row 4
   renamed `battery-decision`; 27 rows match §3.1 row-for-row.
6. **FIXED** — server major asserted against
   `loadBootstrapRegister().values.postgresMajorVersion`; register consumed.
7. **FIXED** — four behavioral real-DB runner tests (happy 5-call DOWNGRADED
   with DB-read provenance; pre-compose BLOCK 1-call; redelivery same
   answerId no extra call; exhausted 0-call FAILED/CALL_BUDGET_EXHAUSTED); a
   claim-law regression would fail the happy path via
   `assertNoOpenWriteTransaction` wired into the gateway. These tests caught
   a real 42804 during rework.

Non-blocking 8, 9, 14, 15, 16, 21 confirmed fixed. Deferrals 10, 12, 13, 17,
18, 19, 20 verified honest and safe (raw-BEGIN sites contain no provider
callback; arrow_order re-derivation value-equal for one-node graphs today).

## Verdict

CLAUDE REVIEW (rev 2): APPROVED
- SOLID: greenlight — thin composition apex; injected collaborators; ISP slip closed.
- DDD: greenlight — provenance owned by its producing aggregate; BLOCKED a first-class terminal value.
- TDD: greenlight — headline artifact behaviorally tested; caught a real DB bug; 49/49.
- Patterns: greenlight — P9 restored; P1 exact; P18 practiced; P13/P14 gaps explicitly deferred.
- DR-115: greenlight — no fabricated artifact on any runtime path; every labeled number traces to a register value or persisted row.

## New non-blocking findings (carry to S01+ hygiene)

1. `loadProviderEnvironment`/`loadHatchetEnvironment` are dead exports
   (runner env inlines both) and missing from the neverCalled list — delete or
   share shapes.
2. Composition-root scaffold test asserts file text, not behavior;
   `PostgresAskApplication`/`HatchetDispatcher` constructed only in main.ts,
   integration-uncovered.
3. `predicateInputsByRow[id] ?? []` truthful today; a future battery row
   without a map entry would file silent empty absence — make it loud.
4. Redelivery test covers only the OK artifact; the `IN ('OK','BLOCKED')`
   widening deserves a BLOCKED-redelivery case.
5. web/ edge row 25 vacuously satisfied; kept-UI proxy defaults now recorded
   as an explicit S14-deferred exception (correct posture).
6. Rev-1 deferrals 10/12/13/17/18/19/20 carried, honest, non-blocking.
