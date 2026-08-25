# T1 rework 5 — exact in-flight aggregate identity

## Role and authority

You are the fresh visible Claude Opus coding seat for T1 rework 5 in:

`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`

This packet is your only scope authority. Read it completely before doing anything. Use strict RED -> GREEN -> REFACTOR. Reproduce the defect on frozen entry product bytes before editing product code. Do not stage, commit, complete the Kanban ticket, or push. Do not run the repository-wide `pnpm test` or any heavy PostgreSQL battery; those remain reserved for a later exclusive final-custody seat.

No Grok, Hermes, Fable, or other agent/model may be launched. `hermes kanban` is only the local board client. Work only in the mission checkout, never the scratch workspace.

## Frozen entry custody

- HEAD: `9801f85d97e4263a7c8311304e29d6a03c4a6d15`
- T1 parent/base: `694b8c06d7194ef5f3c3da5dee745beae847e605`
- Git index: empty
- Rework4 review packet: `docs/missions/2026-08-17-accounts-privacy-security/logs/T1-sol-rework4-final-review-packet.md`, SHA-256 `cc6a0eef8cb196c3ae4447931802cfac0c94d42e64481134d1a55790fe00ef59`

Exact 12-path manifest at entry:

```text
0172fc7e1dd44de560d467743f3e5ab7f6406bf52a5bbb302dd68685d64d679a  apps/api/src/index.ts
4dae1f79496a0a8cca7b2ee03a30f922564ce6cace3331539d0406e60973b26f  apps/api/src/main.ts
def4b2548ae11511d25d7be7fbbdf9d8731bdf6551fcaa57a6125a7b098890c0  apps/api/src/registration.ts
66b20d2170a35667e75e4ba15e8adc016d44d252958527e2877b99bf9f6871e6  packages/crypto/src/index.ts
c610b06ee13a87ec8d9a47c88b552edb5398b30cd9b49509d547eda36fdcb11b  packages/crypto/src/argon2-worker.ts
e92f2ab13667a705d12e617ede7ede773c7d56f4e14e3210125450f02c7ea72c  packages/crypto/src/argon2-worker-pool.ts
2d92223b58c6f1af7c6b9bc544df5f2518e8e20404bf982fbabb0a50bc90e17f  packages/db/src/identity.ts
06056093071e7905342e3030b14c0ac11f14f4ee72a8bce11d7accf34bf5eb52  packages/register/src/auth-policy.ts
7f8a048afaa415f49f340fe2ef15aa2d4140af1bbf3916bddf5353797a295c58  tests/integration/registration-database.test.ts
ebfbfce79c0bdb5de9d2bb0855deabd7a1f95b29cc69667060d55feaa549e25b  tests/unit/registration.test.ts
93f1a3357ffe5b45fac047f77c16c9ae80322123a3eff97c30a7d7e7d2afb55b  tests/unit/argon2-worker-pool.test.ts
a0cfd766551a06a96c954fdff9287174356fb10e62eca54f1c46a323ba8f19ab  tests/architecture/t1-argon2-worker-contract.test.ts
```

Quarantine and do not touch unrelated worktree dirt: repository-root `.claude/launch.json`, repository-root `.gitignore`, `docs/missions/2026-08-17-accounts-privacy-security/logs/run-claude-seat.sh`, and `docs/missions/2026-08-21-observability-loop/**`.

## Touch-only contract

You may modify only:

1. `apps/api/src/registration.ts`
2. `tests/architecture/t1-argon2-worker-contract.test.ts`
3. `docs/missions/2026-08-17-accounts-privacy-security/logs/T1-rework5-progress.log`
4. `/tmp/t1r5/**`

STOP with `CODEX BLOCKED (worker-blocked)` rather than widening this list.

## Binding dual-Sol finding

Two fresh independent GPT-5.6 Sol xHigh reviewers returned `CHANGES REQUESTED` on the same High issue and found no other lifecycle blocker.

Current code sorts finalized aggregates by `windowStartedAt` in `enqueueRefusalAggregate()`. `pumpRefusalAuditQueue()` reads `coordinator.queue[0]`, awaits its repository write, then blindly executes `coordinator.queue.shift()`. The object at index zero may change across that await.

Production-reachable trace:

1. W1 is finalized and P1 begins a held write of W1.
2. The process wall clock steps backward (NTP correction, manual adjustment, or VM restore), and a real later refusal opens older W0.
3. A timer or shutdown drain finalizes W0. Sorted insertion places W0 before the still-in-flight W1.
4. P1 lands W1, but blind `shift()` removes unwritten W0.
5. The loop writes W1 again. W0 is lost, W1 is duplicated, and the drain may report success. `recordRateLimitRefusal()` has no deduplication key.

Reviewer evidence is in the completed `t1_rework4_code_review` and `t1_rework4_evidence_review` verdicts conveyed by the Router. Treat the trace above as binding.

## Required RED

Before changing product code, add a real `RegistrationService` / real `InProcessAuthRateLimiter` regression using only the repository write as a controllable Promise barrier, consistent with the rework4 seam.

The test must:

- start a newer aggregate write and prove that exact aggregate is held in flight;
- drive a real later refusal with a retrograde wall-clock window;
- finalize/enqueue the older aggregate through a real drain or the shipped finalization path while the newer write remains held;
- non-vacuously prove the older aggregate moved ahead of the in-flight one (through externally visible write/order behavior, not by asserting private array contents alone);
- release the original writer and show frozen product bytes lose the older aggregate and/or attempt the already-landed newer aggregate twice;
- fail by a named assertion for that identity mismatch, with a short ruled timeout only as an outer backstop;
- record raw command, UTC/epoch start and end, exit status, Vitest summary/failing assertion, and PRE/POST HEAD, staged paths, SHA-256 and byte size of both touchable source/test files;
- keep the product hash exactly `def4b2548ae11511d25d7be7fbbdf9d8731bdf6551fcaa57a6125a7b098890c0` before and after the RED run.

Do not accept a generic Vitest timeout as the RED mechanism.

## Smallest product correction

Capture the exact aggregate object selected for the write before the `await`. After the write succeeds, remove that exact object—not whatever happens to be `queue[0]` at settlement time. An explicit non-reorderable in-flight slot is also acceptable if it is demonstrably smaller/safer. Preserve all existing semantics:

- one stable coordinator per route;
- one shared writer promise;
- timestamp ordering for work not already in flight;
- remove only after successful durable write;
- preserve the exact failed object for retry;
- public 429 never awaits persistence;
- concurrent drains coalesce and cannot return while the shared writer or queued work remains;
- route cleanup never drops an active/retryable owner.

Do not add a database/schema deduplication key in this rework.

## Required GREEN and VR-10

On final stable bytes, preserve all rework2/rework3/rework4 tests and add the retrograde-window test. Run raw, custody-wrapped receipts for:

1. the new retrograde-window focused test;
2. all rework4 tests;
3. the same three-file focused battery previously producing 172/172;
4. rework2 filters across architecture + pool tests;
5. rework3 filters across architecture + pool tests;
6. `pnpm typecheck`;
7. `pnpm lint`;
8. `git diff --check`.

Add a non-equivalent mutant that restores the unsafe blind `shift()`/removal of the current head. The retrograde-window mechanism test must kill it by a named assertion. Re-run every mutation whose substitution overlaps changed source/test bytes, with exact per-mutant byte restoration and final baseline hash equality.

Correct the M8 evidence classification from rework4:

- The standalone superseded-window guard removal is equivalent under the current shipped call graph because `clearTimeout` prevents a not-yet-running callback and the synchronous finalizer cannot interleave with rollover once it has begun.
- Keep the guard as defense-in-depth and its direct seam test if useful, but do not call that private-seam invocation a production stale-timer trace.
- Record the standalone M8 equivalent proof explicitly.
- Add or retain a non-equivalent combined mutant that removes both predecessor timer cancellation and the exact-active-window guard; this must go RED through a realistic delayed predecessor callback, or simplify the code/test proof if the combined mutation is not needed for the final security contract.

No survivor may be silently waived. No author transcript may substitute for raw final receipts.

## Frozen product decisions

- Two physical Argon2 workers; 32 credential / 96 audit / 128 total capacity; no main-thread fallback.
- Versioned N*=3 at unchanged 45 ms; exact accepted-request capacity 103; N*=4 not claimed; historical N*=2 sealed.
- No 256/320/1024 MiB operator RSS ceiling is published; the waiver/rebaseline is a separate Router/user decision.
- Strict isolated 2 MiB retention gate remains.

## Exit and handoff

Append durable progress throughout and heartbeat the Kanban ticket at least every ten minutes. End with exactly `REWORK READY FOR PEER REVIEW` only if:

- the pre-fix RED is credible and raw;
- the smallest identity-safe correction is present;
- every required GREEN and mutation gate passes on one stable final manifest;
- HEAD remains `9801f85...`, index remains empty, and all out-of-scope hashes remain exact;
- nothing was staged, committed, completed, or pushed.

Otherwise end `CODEX BLOCKED (worker-blocked)` with exact evidence.

