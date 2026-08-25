# T1 rework 4 — frozen final-review packet

## Authority and role

You are a fresh GPT-5.6 Sol xHigh reviewer. Review the exact frozen T1 candidate in the mission checkout:

`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`

Do not modify repository files, run tests, stage, commit, complete the Kanban ticket, or push. This is an independent read-only review. Return exactly one release verdict: `APPROVED` or `CHANGES REQUESTED`. Every blocking finding must include priority, exact code/test evidence, a concrete failing trace, and the smallest safe correction. Recheck HEAD, index, and all frozen hashes immediately before the verdict.

Grok is decommissioned for the week. Hermes/Fable models are not part of this mission. The local `hermes kanban` executable is only the board client.

## Frozen custody

- Review HEAD: `9801f85d97e4263a7c8311304e29d6a03c4a6d15`
- T1 parent/base: `694b8c06d7194ef5f3c3da5dee745beae847e605`
- Git index: empty
- Visible Claude Opus author session: `637b6a1c-074e-4b43-af85-06045905a270`, clean exit, `terminal_reason=completed`
- Author result: `docs/missions/2026-08-17-accounts-privacy-security/logs/T1-rework4-claude-result.json`
- Author progress: `docs/missions/2026-08-17-accounts-privacy-security/logs/T1-rework4-progress.log`
- Author packet: `docs/missions/2026-08-17-accounts-privacy-security/logs/T1-claude-rework4-packet.md`, SHA-256 `0a0b1ab8294c96deee186ce452a26859c13ff5aa680c61bd9fa74568a33066f9`

Frozen 12-path manifest:

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

Expected unrelated worktree dirt belongs to other lanes and must not be touched: repository-root `.claude/launch.json`, repository-root `.gitignore`, `docs/missions/2026-08-17-accounts-privacy-security/logs/run-claude-seat.sh`, and `docs/missions/2026-08-21-observability-loop/**`.

## Binding product decisions

- One process-owned Argon2 pool, two physical workers.
- Credential queue 32, audit queue 96, total 128; fail closed with typed retryable capacity.
- No main-thread Argon2 fallback.
- Conservative current clamp-absorption decision is versioned N*=3 at the unchanged 45 ms cadence; exact accepted-request capacity 103; N*=4 is not claimed; historical N*=2 remains sealed.
- No 256/320/1024 MiB operator RSS ceiling is published. The operator-ceiling waiver/rebaseline is a separate Router/user decision and must not be invented by the reviewer.
- Strict 2 MiB retention/leak gate remains and is isolated with a retained-allocation positive control.
- Full repository `pnpm test` is reserved for a fresh visible Claude Opus final-custody seat after peer approval.

## Rework 4 blocker and candidate design

The prior fresh dual review found a High rollover bug in refusal-audit persistence:

1. Before the W0 timer finalized, opening W1 could await W0 persistence on the public 429 path and discard W0 after a failed write.
2. If W0 was already in flight, rollover shallow-copied its queue but not its writer, permitting duplicate W0 writes, orphaned P1, or a drain that returned while P1 remained pending.

Claude replaced per-window ownership with one stable per-route `RefusalAuditCoordinator` in `apps/api/src/registration.ts`: ordered queue, one active window/timer, and one shared writer. Rollover enqueues the finalized predecessor once, advances the active window, and starts the shared pump fire-and-forget. The pump removes a head only after its durable write succeeds. Shutdown drains join the exact shared writer and preserve a failed head for retry.

Review this design adversarially, especially:

- all event-loop interleavings among timer finalization, public rollover, queue enqueue, writer settle/reject, concurrent drains, and route cleanup;
- whether any route/window aggregate can acquire zero or two owners;
- whether a drain can return while an owned write remains active or retryable work remains;
- whether cleanup can delete a coordinator that a stale callback, request, or writer still owns;
- whether retry, queue ordering, and error propagation can cause duplicate durable rows, lost rows, request latency leakage, unhandled rejection, or unbounded/avoidable retention;
- whether `main.ts` shutdown ordering and all existing T1 worker-pool lifecycle properties remain valid;
- whether the new tests are mechanism-tied and whether their seams/timeouts can pass vacuously.

## Raw author evidence

Pre-fix RED receipts under `/tmp/t1r4/red/`:

- `pre-timer-rollover-failure.log`: public 429 remains pending and recovery writes only one of W0/W1.
- `inflight-rollover-success.log`: two W0 write attempts.
- `inflight-rollover-failure.log`: drain resolves while predecessor P1 is still held.
- `superseded-window-guard.log`: supplementary frozen-byte receipt; its generic timeout is not the authoritative M8 proof.

Final GREEN receipts under `/tmp/t1r4/green/`, all on product hash `def4b254...` and test hash `a0cfd766...`:

- `rollover-battery.log`: 5/5, exit 0.
- `full-battery.log`: 3 files, 172/172, exit 0.
- `rework2-R1-R2-R3-R4.log`: exit 0.
- `rework3-RED1-RED2.log`: exit 0.
- `typecheck.log`, `lint.log`, `git-diff-check.log`: exit 0.

Mutation evidence:

- Driver: `/tmp/t1r4/vr10.mjs`
- Receipt: `/tmp/t1r4/vr10/campaign.log`
- Final result: 9 mutants, 9 killed, 0 surviving; product source restored to exact hash `def4b254...` after each.
- M8 deletes the stale/superseded-window guard. It initially survived. Claude added a mechanism test that invokes the same private finalization seam a timer uses after W1 supersedes W0; without the guard, the stale callback finalizes/disarms W1 and the drain recovers one row instead of two. Re-review equivalence/non-equivalence and the test's realism carefully.

No repository-wide suite or heavy PostgreSQL battery was run in the author seat.

## Required verdict format

Start with `APPROVED` or `CHANGES REQUESTED`.

Then state:

1. product findings, highest priority first;
2. test/evidence findings, distinguishing raw receipts from author transcript;
3. residual risks that are not acceptance blockers;
4. final HEAD, index state, and whether all 12 hashes still match.

