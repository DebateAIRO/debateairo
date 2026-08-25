# T1 Claude Opus rework6 — unique worker-pool call name

## Role and authority

You are the fresh visible Claude Opus author seat for Kanban ticket
`accounts-phase1/t_b225b2f2` (T1). Codex is Router. The sole final-custody
`pnpm test` ran once on the exact frozen rework5 candidate and ended 978/981:
only three architecture reachability assertions failed. Codex and one fresh
GPT-5.6 Sol xHigh reviewer independently traced all three to one new T1 method
name collision. A second Sol attribution audit is running read-only.

This packet is your only scope authority. Mandatory RED -> GREEN -> REFACTOR.
Do not background any command, arm a completion watcher, or exit while a child
command is running. Remain in the visible Terminal through the complete handoff.
Do not stage, commit, push, move Kanban, invoke agents, or run the repository-wide
`pnpm test`. Do not invoke Grok, Hermes, Fable, or any local-model worker.

## Frozen entry custody

Required HEAD:
`9801f85d97e4263a7c8311304e29d6a03c4a6d15`

Required index: empty.

Only product file you may edit:

```text
e92f2ab13667a705d12e617ede7ede773c7d56f4e14e3210125450f02c7ea72c  packages/crypto/src/argon2-worker-pool.ts
```

The three existing RED tests are frozen and must not change:

```text
tests/architecture/s08-contract.test.ts
tests/architecture/s11-contract.test.ts
tests/architecture/s13-contract.test.ts
```

The rest of the final 12-path T1 manifest must stay byte-identical to the
rework5 review packet. Existing unrelated dirty paths and mission packets are
quarantined; do not touch or clean them. Use `/tmp/t1r6` only for temporary
snapshots/mutants/receipts. Stop `CODEX BLOCKED (custody)` on any precondition
mismatch.

## Exact blocker

`tools/orphan-audit/src/index.ts` derives production reachability using a
call-name map. For a dynamically-dispatched call it follows the method only
when that call name has exactly one declaration. `buildApi` calls
`options.application.submit(...)`; before T1, `PostgresAskApplication.submit`
was the unique production candidate.

T1 added private `Argon2WorkerPool.submit` at approximately line 828 with three
`this.submit(...)` call sites. That second declaration makes `submit` ambiguous
to the audit and disconnects the entire API ask path. The exact downstream loss
matches the only three full-suite failures:

- S08: `assertMakerAdmission` becomes UNATTACHED;
- S11: `LivenessRepository.recordQuery` becomes UNATTACHED;
- S13: `MemoryRepository.recordQuestionAndMatch` and `matchQuestionKeys` become
  UNATTACHED.

The final custody receipt is:
`docs/missions/2026-08-17-accounts-privacy-security/logs/T1-final-pnpm-test.log`
with raw status `T1-final-pnpm-test.status` = 1, 109/112 files and 978/981 tests,
duration 1550.12 s. All T1 runtime, PostgreSQL, opacity, capacity, and T9 gates in
that run passed; do not rerun them in this author seat.

## Required RED

Before editing, capture HEAD/index/source hash and run in the foreground:

```text
pnpm exec vitest run tests/architecture/s08-contract.test.ts tests/architecture/s11-contract.test.ts tests/architecture/s13-contract.test.ts
```

Preserve complete raw output and status under `/tmp/t1r6/red/`. It must fail
exactly the three named attachment assertions above. Any different failure is a
stop.

## Required repair

Make a pure private rename in `packages/crypto/src/argon2-worker-pool.ts`:

- `private submit(...)` -> a unique, intention-revealing name such as
  `private submitArgon2Job(...)`;
- update exactly its three `this.submit(...)` call sites;
- do not change parameters, return types, bodies, scheduling, limits, errors,
  timing, protocol validation, or any other behavior.

Do not edit the orphan auditor or any test. Do not add a compatibility alias
named `submit`; that would preserve the collision.

## Required GREEN and mutation evidence

On stable final bytes, run every command in the foreground with complete raw
output/status and pre/post source hashes:

1. the three-file architecture command above — exactly 3 files green;
2. `pnpm exec vitest run tests/unit/argon2-worker-pool.test.ts tests/architecture/t1-argon2-worker-contract.test.ts`;
3. `pnpm typecheck`;
4. `pnpm lint`;
5. `git diff --check`.

Then perform one bounded VR-10 mutation in `/tmp/t1r6/vr10`: temporarily restore
the colliding private name `submit` and its three call sites on the final file,
run only the frozen three architecture tests, and require the exact three named
RED failures. Restore the final file byte-for-byte and prove hash, size, mtime,
HEAD, index, and porcelain equality. A timeout, zero-test run, generic failure,
survivor, or restore mismatch is a stop.

## Handoff

Append exact RED/GREEN/VR-10/custody receipts to
`docs/missions/2026-08-17-accounts-privacy-security/logs/T1-rework6-progress.log`.
Finish `REWORK READY FOR PEER REVIEW` only when:

- the only repository product diff introduced by this seat is the private
  rename in `packages/crypto/src/argon2-worker-pool.ts`;
- all required focused/static gates pass;
- the collision mutant fails for the exact three named mechanisms;
- HEAD and empty index are unchanged and the full 12-path manifest differs only
  at the authorized pool file.

Otherwise finish `CODEX BLOCKED (worker-blocked)` with the first exact failure.
Do not stage, commit, complete, push, or run a full suite.
