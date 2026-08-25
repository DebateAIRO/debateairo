# T1 rework 4 — Claude Opus coding-seat packet

## Authority and role

You are the fresh visible Claude Opus coding seat for `accounts-phase1/t_b225b2f2` (T1). Codex is Router. Read this packet in full before any action; it is your only scope authority.

Mandatory RED -> GREEN -> REFACTOR. Reproduce the exact rollover failures on frozen entry bytes before product edits, with raw receipts. Do not self-approve, update Kanban, stage, commit, push, run repository-wide `pnpm test`, or invoke Grok/Hermes/Fable/local-model agents.

## Entry custody

Repository: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`

Expected HEAD `9801f85d97e4263a7c8311304e29d6a03c4a6d15`; parent `694b8c06d7194ef5f3c3da5dee745beae847e605`; index empty.

```text
0172fc7e1dd44de560d467743f3e5ab7f6406bf52a5bbb302dd68685d64d679a  apps/api/src/index.ts
4dae1f79496a0a8cca7b2ee03a30f922564ce6cace3331539d0406e60973b26f  apps/api/src/main.ts
1f1ee2b636a7769b04aa84f676cadd03d679c3787f478eaf32d8a0ed9d7f04b9  apps/api/src/registration.ts
66b20d2170a35667e75e4ba15e8adc016d44d252958527e2877b99bf9f6871e6  packages/crypto/src/index.ts
c610b06ee13a87ec8d9a47c88b552edb5398b30cd9b49509d547eda36fdcb11b  packages/crypto/src/argon2-worker.ts
e92f2ab13667a705d12e617ede7ede773c7d56f4e14e3210125450f02c7ea72c  packages/crypto/src/argon2-worker-pool.ts
2d92223b58c6f1af7c6b9bc544df5f2518e8e20404bf982fbabb0a50bc90e17f  packages/db/src/identity.ts
06056093071e7905342e3030b14c0ac11f14f4ee72a8bce11d7accf34bf5eb52  packages/register/src/auth-policy.ts
7f8a048afaa415f49f340fe2ef15aa2d4140af1bbf3916bddf5353797a295c58  tests/integration/registration-database.test.ts
ebfbfce79c0bdb5de9d2bb0855deabd7a1f95b29cc69667060d55feaa549e25b  tests/unit/registration.test.ts
93f1a3357ffe5b45fac047f77c16c9ae80322123a3eff97c30a7d7e7d2afb55b  tests/unit/argon2-worker-pool.test.ts
f78fc4210cfbf68dfd99240a16356d47c74c3abb600102f09593d983dfe137ce  tests/architecture/t1-argon2-worker-contract.test.ts
3c79a812a088c10dc1ffb7b6f38adca081afea184d50f6eca9d715721bc58ed5  docs/missions/2026-08-17-accounts-privacy-security/logs/T1-sol-rework3-final-review-packet.md
```

Verify every hash and the empty index before edits. Stop as `CODEX BLOCKED (custody)` on mismatch. Quarantined unrelated dirt remains root `.claude/launch.json`, root `.gitignore`, `logs/run-claude-seat.sh`, and `docs/missions/2026-08-21-observability-loop/**`.

## Touch-only contract

- Product: `apps/api/src/registration.ts`
- Test: `tests/architecture/t1-argon2-worker-contract.test.ts`
- Append-only log: `docs/missions/2026-08-17-accounts-privacy-security/logs/T1-rework4-progress.log`
- Raw runners/receipts/snapshots: `/tmp/t1r4/**`

No other repository file may change. In particular, the accepted late-death fix and its pool test are frozen. Stop and request widening before touching anything else.

All broader T1 properties remain frozen: 2 workers; 32/96/128 limits; no main-thread fallback; CLOSING barrier; exact response binding; auth opacity; post-response drain ordering; N*=3 / 45 ms / 430 ms / 35 ms / exact 103; historical N*=2; no N*=4; 2 MiB retention gate. Publish no RSS ceiling.

## Binding High blocker — rollover has two owners or no owner

Two independent fresh GPT-5.6 Sol xHigh reviewers returned `CHANGES REQUESTED`.

### Trace A: W0 rolls to W1 before W0 timer finalizes

`aggregateRefusal()` snapshots W0 and replaces limiter state with W1. `refuseRateLimit()` then directly **awaits** W0 persistence and catches/discards failure. `scheduleRefusalAuditFlush()` cancels/deletes W0's pending entry but copies only `active.unpersisted`, still empty. W0 has no owner; later drain can persist W1 and falsely report success.

The direct await also violates the public-path contract: an ordinary opaque 429 must not wait for database persistence.

### Trace B: W0 persistence is in flight while W1 rolls over

The W0 closure owns `[W0]` and in-flight write P1. The W1 scheduler shallow-copies W0 into a new array but does not join P1. A drain can start P2 over the copy and return while orphan P1 remains unresolved. If P1 later succeeds, W0 is written twice; if it fails, it settles after shutdown was reported drained.

`recordRateLimitRefusal()` has no deduplication key; duplicate calls append duplicate audit rows.

## Required architecture

Use one stable, route-owned persistence coordinator across all windows:

- one ordered aggregate queue per route;
- one shared in-flight write promise/owner per route;
- one active window/timer that may advance without replacing/copying the queue or its writer;
- the W0 snapshot returned during rollover is enqueued into that same coordinator exactly once and its background pump is started fire-and-forget; the public 429 never awaits it;
- the old timer may later observe that W0 is no longer current and must not enqueue it twice;
- a timer or explicit shutdown drain finalizes the current window once, enqueues it, and joins the same pump;
- remove an aggregate only after its unique write succeeds; preserve it on rejection for retry;
- shutdown drain must join the exact shared writer, include every queued/current window, reject on failure, and never return while a route writer remains in flight;
- concurrent drains coalesce; recovery writes each retained window exactly once, in deterministic window order;
- coordinator cleanup is allowed only when no active window, queued aggregate, or in-flight promise remains.

Do not solve this with an ever-growing map or source literals, and do not add repository/database dedupe schema in T1.

## Mandatory RED receipts on frozen bytes

Before editing product code, add tests and run them against the exact entry product hash `1f1ee2b6...`. Raw command output must be captured under `/tmp/t1r4/red/`, with command, start/end time, raw exit status, pre/post HEAD+index+hashes.

1. `pre-timer-rollover-failure.log`: W0 pending but not finalized; W1 begins; W0 persistence rejects. Prove W1's public result is prompt, opaque typed 429 while the repository promise is deferred/rejected; drain rejects; after recovery, drain writes W0 and W1 exactly once with exact window/count/source content.
2. `inflight-rollover-success.log`: W0 write is held behind a real promise barrier when W1 begins. Start drain(s). Prove no second W0 write starts, no drain resolves while P1 is held, then release P1 and prove W0/W1 each write once and teardown can finish.
3. `inflight-rollover-failure.log`: P1 rejects after W1 rollover. Prove no orphan/false drain; recover and write W0/W1 exactly once.

At least the assertions representing each current defect must fail on frozen product bytes for the named mechanism. A passing preservation control is fine, but no all-green or vacuous RED receipt. Preserve these raw logs; do not rely only on a prose transcript.

## GREEN, regressions, and VR-10

After the RED receipts, implement the smallest coordinator repair.

Required raw final-byte receipts under `/tmp/t1r4/green/`:

- focused new rollover battery;
- full `tests/architecture/t1-argon2-worker-contract.test.ts`, `tests/unit/argon2-worker-pool.test.ts`, and `tests/unit/registration.test.ts` battery;
- rework2 R1/R2/R3/R4 filters and rework3 RED1/RED2 filters;
- `pnpm typecheck`, `pnpm lint`, `git diff --check` with raw exit statuses.

Do not run repository-wide `pnpm test` or heavy PostgreSQL B4/S3b; their frozen paths did not change.

Run a fresh delta VR-10 campaign for rollover assertions. At minimum kill non-equivalent mutants that:

- discard the `aggregate.finalized` rollover snapshot;
- await the background pump in the public path;
- replace/copy the route queue on W1;
- sever/ignore the predecessor/shared in-flight promise;
- dequeue before successful write;
- let drain resolve while a writer is held;
- duplicate W0 on success or lose W0 on failure/recovery.

Every mutant must go RED via the intended named mechanism, restore hash+size exactly, and record before/mutated/after hash+size+mtime. Fix surviving mutants/tests; do not waive them casually.

## Handoff

Append exact custody, RED, GREEN, VR-10, residue, and final manifest evidence to `T1-rework4-progress.log`. Finish with `REWORK READY FOR PEER REVIEW` or `CHANGES REQUESTED`. Nothing staged, committed, completed, or pushed. The full suite remains reserved for fresh final Claude custody after Sol approval.

The separate operator-RSS waiver remains Router/V's decision; do not block this rework on it and do not invent 256/320/1024 MiB.
