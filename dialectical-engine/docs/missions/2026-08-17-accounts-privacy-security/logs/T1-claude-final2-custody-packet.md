# T1 corrected-candidate final custody — two-phase visible Claude seat

## Authority and seat lifecycle

You are the fresh visible Claude Opus final-custody seat for Kanban
`accounts-phase1/t_b225b2f2` (T1). Codex is Router. Rework6 has two independent
GPT-5.6 Sol xHigh APPROVED verdicts. This packet is your only scope authority.

The outer visible Terminal wrapper owns the long command so the Terminal stays
open for the entire 26-minute class suite. You execute two phases in the same
Claude session:

- **Phase A / initial invocation:** read, verify, record preflight, then return
  exactly `PREFLIGHT READY: FINAL2`. Do not run any gate yourself.
- The outer wrapper runs every gate in the foreground. It never backgrounds a
  command.
- **Phase B / resumed invocation:** read the completed raw receipts, perform
  read-only post-custody analysis, write the durable verdict, then return
  `FINAL CUSTODY PASSED` or `CODEX BLOCKED (custody)`.

Do not edit product, tests, policy, auditor, or mission contracts. Do not stage,
commit, push, change Kanban, spawn agents, or invoke Grok, Hermes, Fable, or
local models. The operator-RSS waiver is a separate Router/user decision and
must not be interpreted here.

## Frozen candidate

Repository:
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
b990c3f866f9697b158e4040ffd9bb832341e31853a40d30e70deb57394c526d  packages/crypto/src/argon2-worker-pool.ts
2d92223b58c6f1af7c6b9bc544df5f2518e8e20404bf982fbabb0a50bc90e17f  packages/db/src/identity.ts
06056093071e7905342e3030b14c0ac11f14f4ee72a8bce11d7accf34bf5eb52  packages/register/src/auth-policy.ts
7f8a048afaa415f49f340fe2ef15aa2d4140af1bbf3916bddf5353797a295c58  tests/integration/registration-database.test.ts
ebfbfce79c0bdb5de9d2bb0855deabd7a1f95b29cc69667060d55feaa549e25b  tests/unit/registration.test.ts
93f1a3357ffe5b45fac047f77c16c9ae80322123a3eff97c30a7d7e7d2afb55b  tests/unit/argon2-worker-pool.test.ts
3548b93282011be73310efe8a2eec31638133dc69a1d92a0cf4ffbc36f253ca1  tests/architecture/t1-argon2-worker-contract.test.ts
```

Expected quarantined unrelated dirt:

- repository-parent `.claude/launch.json` and `.gitignore`;
- `logs/run-claude-seat.sh`;
- `docs/missions/2026-08-21-observability-loop/**`;
- existing untracked T1 governance packets/results/receipts.

Only this seat's final2 receipt/result/session/progress artifacts may be added.
Any product/test/auditor change beyond the frozen manifest is a stop.

## Required reading

Read in full during Phase A:

1. `docs/missions/2026-08-17-accounts-privacy-security/00-mission-charter.md`
2. `logs/T1-claude-implementation-packet.md`
3. `logs/T1-sol-rework6-final-review-packet.md`
4. this packet.

Both Sol reviewers approved the four-occurrence rename and require one fresh
repository-wide gate on these exact hashes. The earlier status-1 receipt cannot
be relabeled green. Its only three failures were repaired and their focused
RED/GREEN/mutant evidence is already complete; do not rerun or mutate them.

## Phase A — preflight only

Verify HEAD, empty index, complete status, and exact 12-path hashes/sizes/mtimes.
Write them with UTC timestamp to:

`logs/T1-final2-custody-pre.txt`

Record that the outer wrapper, not a Claude Bash tool, will run the gates. Do
not run a test, typecheck, lint, diff check, watcher, or background job. If every
precondition matches, return exactly `PREFLIGHT READY: FINAL2`. On mismatch,
write the exact issue to `logs/T1-final2-custody-progress.log` and return
`CODEX BLOCKED (custody)`.

## Outer-wrapper gate contract

After the preflight marker, the visible wrapper runs exactly one foreground
repository-wide invocation:

```text
pnpm test
```

Complete output and raw status:

- `logs/T1-final2-pnpm-test.log`
- `logs/T1-final2-pnpm-test.status`

Only if it exits zero, the wrapper runs once each in the foreground:

```text
pnpm typecheck
pnpm lint
git diff --check
```

Their receipt basenames are `T1-final2-typecheck`, `T1-final2-lint`, and
`T1-final2-diff-check`, each with `.log` and `.status`. The wrapper also captures
`logs/T1-final2-custody-post-shell.txt` before resuming you.

No failed command is rerun.

## Phase B — resumed readback and verdict

Read every final2 raw receipt completely. Independently recheck HEAD, index,
complete status, and the 12 hashes/sizes/mtimes. Compare against Phase A and the
frozen manifest. Do not run or rerun any gate.

A full-suite pass requires:

- raw status exactly 0;
- complete Vitest summary with all files/tests passing;
- no failed-test section, unhandled rejection/error banner, `ELIFECYCLE`,
  timeout, `40P01`, nonzero deadlock delta, or incomplete summary;
- the expected NOWAIT lock-probe PostgreSQL error may appear only when its own
  T9-C test passes and the final deadlock delta remains zero.

Conditional static gates must all have raw status 0. PRE/POST HEAD, index, all
12 hashes, sizes, and mtimes must match. Identify any residue; never delete or
repair it.

Append a self-contained report to `logs/T1-final2-custody-progress.log` with:

- session id and UTC start/end;
- exact commands and receipt paths;
- full file/test counts and duration;
- explicit scans for every marker above;
- PRE/POST manifest comparison and complete residue classification;
- `FINAL CUSTODY PASSED` only if every condition is green; otherwise
  `CODEX BLOCKED (custody)` with the first exact failure.

Do not stage, commit, push, move the ticket, or decide the RSS waiver.
