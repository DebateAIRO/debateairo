# T1 Claude Opus rework 1 — resume 1 packet

## Authority

- Ticket: `accounts-phase1` / `t_b225b2f2` (T1).
- This is a fresh visible Claude Opus continuation seat after session `44891cbe-5012-48a4-b318-51b48b139ed7` exited normally at `2026-08-21T19:03:06Z` while its background integration battery was still running. Claude's terminal teardown killed that battery at 15 completed tests.
- Read `logs/T1-claude-rework1-packet.md` and this packet in full. The original packet remains binding except where this packet records the terminal interruption and exact continuation custody.
- Work only in `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`.
- Grok is decommissioned. Do not invoke Grok, Hermes, Fable, or local-model agents. `hermes kanban` is board-client-only.
- Do not stage, commit, complete, or push. Fresh GPT-5.6 Sol xHigh reviewers own approval after final-byte freeze.

## Continuation custody

- Required HEAD: `694b8c06d7194ef5f3c3da5dee745beae847e605`.
- Required index: empty.
- The interrupted integration log has no terminal `EXIT=`/Vitest summary and is **not an acceptance receipt**, although its first 15 tests were green. Preserve it as interruption evidence; start a fresh complete integration invocation.
- Verify these exact source/test bytes before doing anything else, and stop on mismatch:

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

`apps/api/src/index.ts` is now in the candidate because the binding review required the constant secret-free `503` at the Fastify/auth boundary. This is the only continuation scope addition beyond the original 11 paths.

## Exact continuation order

1. Claim/heartbeat the ticket for 43,200 seconds and post `REWORK1 RESUME1 WORKER CLAIM` with new session id, both packet hashes, HEAD, index result, and all 12 candidate hashes.
2. Confirm no integration/Vitest/PostgreSQL child from the exited seat remains. Do not kill unrelated processes. If no owned child remains, start a brand-new full `tests/integration/registration-database.test.ts` battery with durable command, start/end timestamps, exit status, full summary, and pre/post HEAD/index/12-path manifests. Keep the visible Claude process alive until the battery has truly ended; do not delegate it to a background task that dies when the Claude turn returns.
3. Only after the complete integration invocation exits: run `/tmp/t1r1/vr10-mutants.py`. Mutants edit the shared checkout, so they must never overlap any other test. Require all 32 intended named tests/assertions to go RED for the named mechanism, reject zero-test/wrong-test/wrong-mechanism exits, retain stdout/stderr, and prove per-mutant plus whole-battery restoration by path/hash/size/mtime.
4. Only after mutation restoration: run `/tmp/t1r1/s3b-calibration-repeats.py`. Require three consecutive isolated processes on the shipped 45 ms cadence, report N*=3 and first unabsorbed N, and prove the established approximately-103 accepted-request capacity on every repeat. Do not edit the sealed row.
5. Re-run lightweight custody gates after the mutation/calibration work: typecheck, lint/orphan audit, focused 111-test unit/architecture battery, `git diff --check`, HEAD/index and 12-path manifest. Do not run the repo-wide full suite.
6. If every pre-full-suite gate is green, freeze bytes and post `REWORK1 ROUTER DECISION READY` with exact receipts and the three V decisions. Explicitly record that the unchanged 2 MiB gate is now closed; the measured 317.9 MiB in-flight isolated pool-host peak invalidates the former provisional 256 MiB ceiling and is not itself an operator/whole-API ceiling.
7. Stop on any actual code/test blocker as `T1 REWORK1 RESUME1 CHANGES REQUESTED`; preserve exact bytes and evidence. Never self-approve.

## Already-green evidence to preserve

- Focused unit/architecture: 111/111.
- Typecheck, lint/orphan audit, and diff-check: exit 0.
- Hermetic RSS gate: `0.203 MiB <= 2.000 MiB`; retained-allocation positive control: `12.109 MiB > 2.000 MiB`.
- In-flight resource observation: two workers, peak active 2, queued 6, outstanding 8, peak RSS 317.9 MiB, zero live handles/jobs after close.
- The killed integration attempt: 15/15 encountered tests green, but not a valid final receipt.

