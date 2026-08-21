# T1 Claude Opus rework 1 — resume 2 packet

## Authority and reason for transfer

- Ticket: `accounts-phase1` / `t_b225b2f2` (T1).
- Fresh visible Claude Opus continuation seat. Read in full:
  1. `logs/T1-claude-rework1-packet.md`
  2. `logs/T1-claude-rework1-resume1-packet.md`
  3. this packet.
- Resume1 session `8e8bc966-57ae-412d-ad8d-72c6a04874b6` was retired because its print-mode turn did not ingest live Router corrections and twice launched a calibration known to emit no metrics. Router stopped only the owned read-only calibration tree and the unsteerable Claude process. No candidate file was changed by either abort.
- Work only in `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`.
- Grok is decommissioned. Do not invoke Grok, Hermes, Fable, or local-model agents. `hermes kanban` is board-client-only.
- Do not stage, commit, complete, or push. Final approval belongs to fresh GPT-5.6 Sol xHigh reviewers.

## Exact entry custody

- HEAD must be `694b8c06d7194ef5f3c3da5dee745beae847e605`; index must be empty.
- Verify these exact bytes before editing:

| Path | SHA-256 |
|---|---|
| `apps/api/src/index.ts` | `0172fc7e1dd44de560d467743f3e5ab7f6406bf52a5bbb302dd68685d64d679a` |
| `apps/api/src/main.ts` | `bb838089b7be0ecbc45eaa4193c7b7364fcc978bd7cde389f7dbdc10277de5fd` |
| `apps/api/src/registration.ts` | `bb640b7226983152d1288d59cb988a5d00284f70dce19521a65365cc3b0a0f55` |
| `packages/crypto/src/index.ts` | `66b20d2170a35667e75e4ba15e8adc016d44d252958527e2877b99bf9f6871e6` |
| `packages/crypto/src/argon2-worker.ts` | `c610b06ee13a87ec8d9a47c88b552edb5398b30cd9b49509d547eda36fdcb11b` |
| `packages/crypto/src/argon2-worker-pool.ts` | `af84e900a611f9719397fcf905a66cc157a8a06b47e24cea79dbace305563124` |
| `packages/db/src/identity.ts` | `2d92223b58c6f1af7c6b9bc544df5f2518e8e20404bf982fbabb0a50bc90e17f` |
| `packages/register/src/auth-policy.ts` | `8888ada84634d545ca1750a8e10f3f9004c61bb5e7cf326bdb66673650e35d04` |
| `tests/integration/registration-database.test.ts` | `68d016a26af31529573594229b864c668d5699158b0ecba2cbb995998d4563ac` |
| `tests/unit/registration.test.ts` | `ebfbfce79c0bdb5de9d2bb0855deabd7a1f95b29cc69667060d55feaa549e25b` |
| `tests/unit/argon2-worker-pool.test.ts` | `f7aa0df2f40e5e56bbdd3e18f90775109ba12a705ad371d3c4671270f0c5576b` |
| `tests/architecture/t1-argon2-worker-contract.test.ts` | `cde05328176109b01444af7927533b7ddfc60f426556a2e751683108c3228f76` |

## Accepted evidence already complete

- Durable full integration receipt: `55 passed / 1 frozen-decision failure / 56`, duration `1451.09s`, terminal exit and Vitest summary present, pre/post manifests exact. Sole failure is the sealed N=2 assertion seeing N=3 headroom `+104.375ms`.
- VR-10: `32/32` non-equivalent mutants RED, one single-guard mutant proved equivalent, stronger dual-guard mutant RED with four live handles versus two, `33/33` restored, exact manifests.
- Focused unit/architecture before final two test-evidence edits: `111/111`; typecheck/lint/diff-check green.
- Memory: unchanged 2 MiB gate green and deliberate retained positive control red. In-flight isolated pool-host peak `317.9 MiB`; the former provisional 256 MiB ceiling is invalid and must not be ratified.

## Two required test-evidence edits before any calibration

### 1. Make the frozen calibration failure occur last

In `tests/integration/registration-database.test.ts`, test `S3b keeps live-mail N=1/N=4/N=8 PostgreSQL arms below the separation ceiling` currently performs the frozen 45 ms/N=2 assertion block before `console.info` and before the opacity/audit/mail assertions. Therefore its expected N=3 failure prevents the metrics and downstream assertions from executing.

Make only an assertion-order/observability change:

- move the existing `if (registrationCadenceMs === 45) { ... }` frozen assertion block to the end of the test, after the unchanged metrics log and after every unchanged median/AUC/audit/postwork/mail assertion;
- do not change any arithmetic, expectation, cadence, policy, threshold, sealed value, sample size, or production code;
- the focused test must emit all five N cells, execute every non-frozen assertion, then fail exactly once at the unchanged frozen N=3 headroom expectation.

### 2. Replace the 120-second generic mutant backstop

In `tests/unit/argon2-worker-pool.test.ts`, test `fails readiness closed when no worker ever handshakes`, add a test-local `Promise.race` watchdog with a unique `READY_HANDSHAKE_HANG` error, comfortably above the real 20 ms/retry budget but far below Vitest's 120 seconds. Clear its timer in `finally`.

- Correct code must still reject with typed `ARGON2_POOL_UNAVAILABLE` before the watchdog.
- Mutant 24 (remove ready-handshake timer) must fail quickly and its retained output must contain `READY_HANDSHAKE_HANG`.
- Update `/tmp/t1r1/vr10-mutants.py` mutant 24 expected mechanism accordingly.

Run the focused unit test and mutant 24 immediately. Then rerun the complete 33-mutant campaign on the final test hashes; require the same 32 non-equivalent RED + one explicitly proved equivalent + 33 restored result, now without any generic 120-second timeout.

## Non-vacuous three-repeat calibration

Only after both edits and their focused gates are green:

1. Repair `/tmp/t1r1/s3b-calibration-repeats.py` to fail closed unless each of three fresh isolated 45 ms repeats has:
   - exactly one S3b test selected and exactly the one expected frozen assertion failure;
   - the full `[S3b REWORK1 LIVE TIMING]` line and exactly five parsed N cells `[1,2,3,4,8]`;
   - every unchanged opacity/audit/postwork/mail assertion executed before that final frozen failure;
   - median gap `<=100 ms` and AUC `<=80%` for every cell;
   - a derived largest absorbed and first unabsorbed concurrency;
   - a separate B4 process with exit 0, 100/100 success, and exactly 103 accepted/committed/sent at the larger bursts.
2. Require the largest-absorbed and first-unabsorbed results to be stable across all three repeats. Do not hard-code an answer or edit the sealed row; report the evidence honestly for Router/V.
3. Write each repeat to a distinct durable log/JSON receipt with command, timestamps, status, HEAD/index and final 12-path manifest. A killed, empty, missing-metrics, or extra-failure run is invalid.

## Final handoff

- Re-run typecheck, lint/orphan audit, `git diff --check`, and the final focused unit/architecture battery.
- Do not run the repo-wide full suite.
- Freeze exact final bytes and post `REWORK1 RESUME2 ROUTER DECISION READY` with receipts, exact hashes, and the three V decisions. The 2 MiB threshold is already resolved unchanged; do not present it as a V choice.
- Stop on any product/test blocker. Never self-approve, stage, commit, complete, or push.

