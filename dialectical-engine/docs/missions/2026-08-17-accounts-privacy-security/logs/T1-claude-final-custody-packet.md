# T1 Claude Opus final-custody packet

## Role and authority

You are the fresh, visible Claude Opus final-custody seat for Kanban ticket
`accounts-phase1/t_b225b2f2` (T1). Codex is Router. Two independent GPT-5.6 Sol
xHigh reviewers have approved the frozen candidate and its evidence. Your job is
read-only integration custody: verify the exact frozen bytes, run the sole
repository-wide gate, preserve raw receipts, and hand the result back to Codex.

This packet is your only scope authority. Do not edit product, test, policy, or
mission-contract bytes. Do not stage, commit, push, change Kanban state, spawn
agents, or invoke Grok, Hermes, Fable, or local models. `hermes kanban` is a
Router-only board client. If any frozen byte, HEAD, or index precondition differs,
stop immediately with `CODEX BLOCKED (custody)` and report the exact mismatch.

## Frozen entry custody

Repository root:
`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`

Required HEAD:
`9801f85d97e4263a7c8311304e29d6a03c4a6d15`

Required index: empty.

Required 12-path manifest:

```text
0172fc7e1dd44de560d467743f3e5ab7f6406bf52a5bbb302dd68685d64d679a  apps/api/src/index.ts
4dae1f79496a0a8cca7b2ee03a30f922564ce6cace3331539d0406e60973b26f  apps/api/src/main.ts
0b75f99df102d9a7915a22f1d5b28e278352dfcb2936ac5bffe7b3f3afc01fd7  apps/api/src/registration.ts
66b20d2170a35667e75e4ba15e8adc016d44d252958527e2877b99bf9f6871e6  packages/crypto/src/index.ts
c610b06ee13a87ec8d9a47c88b552edb5398b30cd9b49509d547eda36fdcb11b  packages/crypto/src/argon2-worker.ts
e92f2ab13667a705d12e617ede7ede773c7d56f4e14e3210125450f02c7ea72c  packages/crypto/src/argon2-worker-pool.ts
2d92223b58c6f1af7c6b9bc544df5f2518e8e20404bf982fbabb0a50bc90e17f  packages/db/src/identity.ts
06056093071e7905342e3030b14c0ac11f14f4ee72a8bce11d7accf34bf5eb52  packages/register/src/auth-policy.ts
7f8a048afaa415f49f340fe2ef15aa2d4140af1bbf3916bddf5353797a295c58  tests/integration/registration-database.test.ts
ebfbfce79c0bdb5de9d2bb0855deabd7a1f95b29cc69667060d55feaa549e25b  tests/unit/registration.test.ts
93f1a3357ffe5b45fac047f77c16c9ae80322123a3eff97c30a7d7e7d2afb55b  tests/unit/argon2-worker-pool.test.ts
3548b93282011be73310efe8a2eec31638133dc69a1d92a0cf4ffbc36f253ca1  tests/architecture/t1-argon2-worker-contract.test.ts
```

The following unrelated dirty paths are quarantined and must remain untouched:

- repository-parent `.claude/launch.json`
- repository-parent `.gitignore`
- `docs/missions/2026-08-17-accounts-privacy-security/logs/run-claude-seat.sh`
- `docs/missions/2026-08-21-observability-loop/**`

Existing untracked T1 packets/results are governance artifacts and are not a
custody mismatch. The final-custody packet/result/session/progress files created
by this seat are also allowed. No other new or changed path is allowed.

## Required gates

Read these in full before running anything:

1. `docs/missions/2026-08-17-accounts-privacy-security/mission.md`
2. `docs/missions/2026-08-17-accounts-privacy-security/logs/T1-claude-implementation-packet.md`
3. `docs/missions/2026-08-17-accounts-privacy-security/logs/T1-sol-rework5-final-review-packet.md`
4. this packet

Capture pre-custody HEAD, empty-index status, full `git status --short`, exact
12-path hashes, sizes, and mtimes in
`docs/missions/2026-08-17-accounts-privacy-security/logs/T1-final-custody-pre.txt`.

Then run exactly one repository-wide test invocation on the frozen bytes:

```text
pnpm test
```

Capture complete stdout/stderr and raw exit status in:

- `logs/T1-final-pnpm-test.log`
- `logs/T1-final-pnpm-test.status`

Do not rerun a failing full suite. Diagnose the receipt read-only and report the
first concrete failure. A nonzero exit, timeout, unhandled rejection/error banner,
incomplete summary, PostgreSQL gate failure, or custody drift is a failed gate.

If and only if the full suite exits zero, run once each and capture complete
output plus raw status:

```text
pnpm typecheck
pnpm lint
git diff --check
```

Use `T1-final-typecheck`, `T1-final-lint`, and `T1-final-diff-check` as the receipt
basenames under the same logs directory, with `.log` and `.status` files.

Finally capture post-custody HEAD, empty-index status, full status, exact 12-path
hashes, sizes, and mtimes in `logs/T1-final-custody-post.txt`. Compare PRE and
POST: HEAD, index, and all 12 hashes/sizes/mtimes must be identical. The gate
commands may create only expected ignored/transient test outputs; identify any
porcelain change rather than deleting or repairing it.

## Required handoff

Append a concise report to `logs/T1-final-custody-progress.log` containing:

- UTC start/end timestamps and exact commands;
- pre/post HEAD, index result, and manifest comparison;
- each raw receipt/status path;
- the full test summary counts and duration;
- explicit scan results for unhandled rejection/error banners, `40P01`, failed
  tests, timeout, and incomplete-summary markers;
- any changed/untracked residue;
- `FINAL CUSTODY PASSED` only when every requirement above is green, otherwise
  `CODEX BLOCKED (custody)` with the first exact failure.

Do not interpret or ratify an operator RSS ceiling. The Router owns that separate
user decision. Do not stage, commit, push, or move the ticket.
