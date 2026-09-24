# The database-backed suites — run on 2026-09-23 (no Docker needed after all)

*Written 2026-09-22 as "the Docker window", rewritten 2026-09-23 by the coordinator after the measurement. The premise was wrong: every database-backed suite in this repository starts its own embedded PostgreSQL (`tests/support/testDatabase.ts` → `startWithEmbedded`; the testcontainers path is "DEFERRED BY DR-121" and the only two mentions of it in the tests pin that fact). The packages' "NOT RUN (Docker)" notes were assumptions. Docker Desktop is needed for the development stack and the server rehearsals, not for any test. Plain-language mirror: [PLAIN-STATUS.md](PLAIN-STATUS.md); checklist line 6 of [GO-LIVE-CHECKLIST.md](GO-LIVE-CHECKLIST.md).*

## 1. The run

From `dialectical-engine/`, on the release-candidate commit, on a QUIET machine (three timing rows in `registration-database` go red under load):

```bash
pnpm run test:s00
```

`acceptance/` is not part of it: that is the ceremony harness that drives real model relays and belongs to the owner's confirmation run. A failure is a finding, not a reason to edit the test.

## 2. What was measured on 2026-09-23

First full run, on the third-sync tip `3030ac20`, 46 minutes: **471 files, 7414 tests — 7353 passed, 60 failed, 1 skipped.** The 60:

| Group | Count | Cause | What happened |
|---|---|---|---|
| The known-red list | 8 | recorded entries (5 inherited from `dev`, 3 `dev`-owned rows split so nothing of ours hides behind them) | unchanged |
| `tests/integration/database.test.ts` | 28 | the suite's fake vendor answered a placeholder model id; Task 9's model-identity check refuses it (never seen: the suite had never run) | fixed in the fixture — SYNC3-B (`492fb87c`), 95/95 |
| Eight rows only on our branch, four files | 8 | KEK-rotation suite never ran `migrate`; the V-28 spend helper's cast hid three values `core.run` refuses; T17's fake vendor keyed failures on the exact request text (our per-call fence markers reset it) plus the placeholder model id; OBS-07 expected pre-DL7-F3 notify addresses; **and one real product defect: the observation agent's zsh launcher declared a local named `path` (bound to PATH in zsh) in our DL7-F5 change, so the agent could never start** | fixed — SYNC3-C (`267c3329`…`2ba24ce0`); the launcher fix is test-first with a new gate check |
| `dev`'s own | 2 | `dev` moved the sealed development-v4 snapshot constant (`6a05a0d0`) without the fixture it describes — `production-database-principals` "emergency off" and `register-support-publication`'s database row | recorded for `dev`'s author; needs a ruling on a sealed value |
| This machine's environment | 10 | the development-stack suites expect the local CLIs and a dev environment (`dev-api-process` ×5 `DEV_API_PROCESS_ENVIRONMENT_INVALID`, `dev-api-environment`, `dev-provider-panel` exit 2, `dev-ui-process`), `evaluator-addon-database` "twelve same-run invocations above pool max", `t16-algorithm-register` seeding — all fail identically on pristine `dev@25a0069f` | recorded; not ours |
| Load-sensitive | 4 | `registration-database` rework rows (pass alone in 98–315 s; red only under concurrent runs) and `dev`'s memory tripwire (3.45 MiB against a 2 MiB limit even on a quiet machine) | recorded; the tripwire is `dev`'s test |

## 3. Results table

| Commit | Date | Command | Totals | Failures |
|---|---|---|---|---|
| `3030ac20` (sync tip before the fixes) | 2026-09-23 | `pnpm run test:s00` | 471 files; 7353 passed / 60 failed / 1 skipped | the table above |
| `492fb87c` | 2026-09-23 | `vitest run tests/integration/database.test.ts` ×3 | 95 passed each | none |
| `2ba24ce0` | 2026-09-23 | the five SYNC3-C files together | 27 passed / 1 skipped (pre-existing placeholder) | none |
| `8692c4dc` (integration tip, pushed) | 2026-09-23 | clean checkout: typecheck, acceptance tsc, gate, audit, UI typecheck/tests/build, s5, S06, the six fixed integration files | gate new=0 known=8 stale=0; UI 134/134; six files 122 passed / 1 skipped | none of ours; the `dev`-owned and environment rows of §2 stand |
