# T1 recalibration 1 — fresh-process attribution packet

Date: 2026-08-22 (Europe/Bucharest)
Owner: Codex-Router / V
Author seat: one visible Claude Opus 5 CLI terminal
Kanban: `accounts-phase1` / `t_b225b2f2`

## 1. Mission

Classify the five live timing/capacity failures from FINAL2 without changing any
product, policy, test, threshold, cadence, queue, worker, or database byte.

This is a diagnostic/calibration seat, not an implementation seat. Run each
exact failed title in its own fresh Vitest process. Fresh process means a new
embedded PostgreSQL instance and a new process-owned Argon2 worker pool at
entry; process exit is the quiescence boundary. Preserve every raw receipt.

Do not reinterpret a focused green as release acceptance. It can establish only
the fresh-process condition. FINAL2 remains the authoritative preconditioned,
shared-pool/full-history RED.

## 2. Frozen custody

Required HEAD:
`9801f85d97e4263a7c8311304e29d6a03c4a6d15`

Required index: empty.

Frozen 12-path manifest:

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

Stop immediately on HEAD, index, or manifest mismatch. Do not repair it.

## 3. Authoritative FINAL2 failure receipt

Read completely:

- `logs/T1-final2-custody-progress.log`
- `logs/T1-final2-pnpm-test.log`
- `logs/T1-final2-pnpm-test.status`
- `logs/T1-final2-custody-pre.txt`
- `logs/T1-final2-custody-post-shell.txt`
- `logs/T1-final2-claude-final-result.json`

FINAL2 facts:

- raw status `1`; 111/112 files and 976/981 tests passed; five failures;
- deep resend nontransport maxima `714.1/734.4 ms > 600 ms`;
- healthy-MTA burst acceptance `98/84/80` at sizes `100/128/160`,
  rather than `100/103/103`;
- slow-transport R1 at 1000 ms: new `601.6`, duplicate `777.2`,
  delta `175.6 > 100 ms`;
- S3b live-mail N=4 median gap `224.2 > 100 ms`; same receipt logged
  N=3 hash/provision max `1264.7 ms` and clamp headroom `-799.7 ms`;
- domain-separated audit KDF call `280.7 ms > 250 ms`;
- all T9/deadlock gates green; all deadlock deltas zero; no unhandled rejection;
- all 12 frozen bytes/sizes/mtimes unchanged.

The policy's own first-unchanged-code-RED-at-45ms recalibration trigger has
fired. Rework6's four-occurrence private rename is dual-reviewed and causally
irrelevant; its S08/S11/S13 orphan-audit failures are closed.

## 4. Exact fresh-process commands

The wrapper, not Claude, owns these foreground commands after Phase A. Do not
run, rerun, duplicate, background, or replace them from the Claude session.

Each command is exactly:

```text
node_modules/.bin/vitest run tests/integration/registration-database.test.ts -t <exact title>
```

Titles, in this order:

1. `S3d rework3 B1/B3 probes deep-queue slack and the following audit window`
2. `S3d rework2 B4 measures healthy-MTA burst cost and the frozen S3b margin`
3. `keeps new-vs-existing timing within the ruled tolerance for slow 0/400/1000ms transports`
4. `S3b keeps live-mail N=1/N=4/N=8 PostgreSQL arms below the separation ceiling`
5. `S3 rework4 B4 derives stable domain-separated IP and UA Argon2id hashes without request-id hashes`

The wrapper records one log and one raw status for each filter, plus a small
host snapshot before each command. Continue through all five even if one fails.

## 5. Phase A duty

Read this packet and all FINAL2 receipts listed above. Verify HEAD, empty index,
and all 12 hashes. Write:

`logs/T1-recalibration1-custody-pre.txt`

It must include UTC time, HEAD, staged paths, `git status --short`, 12 hashes,
sizes, mtimes, and an explicit statement that no governed byte was edited.

Then return exactly:

`PREFLIGHT READY: T1 RECALIBRATION1`

Do not run a test in Phase A.

## 6. Phase B duty

After the wrapper resumes the same session, read this packet again and read
every `logs/T1-recalibration1-*` receipt. Do not run or rerun a command.

Write:

`logs/T1-recalibration1-progress.log`

Report, for every filter:

- raw status and exact command;
- the full metric line(s) and assertion result;
- start/end/duration;
- fresh-process PostgreSQL startup/shutdown and worker-pool close evidence;
- host snapshot facts without claiming causation;
- error/unhandled/deadlock/40P01 scan;
- comparison with FINAL2 and with `logs/T1-final-pnpm-test.log`;
- whether fresh-process evidence is green or red;
- what it does and does not establish about the full-history condition.

Perform a fresh post-custody HEAD/index/manifest/status comparison. Do not alter,
delete, restore, stage, commit, push, or move the ticket.

Return one exact terminal marker:

- `RECALIBRATION1 FRESH CONDITION GREEN` if all five raw statuses are 0 and
  their ruled metric lines satisfy the frozen limits; or
- `RECALIBRATION1 FRESH CONDITION RED` otherwise.

## 7. Hard stops

- No product, policy, test, migration, packet, threshold, cadence, queue, worker,
  timeout, or register-row edit.
- No threshold waiver or recalibration decision in this seat.
- No full suite or full registration-file run.
- No background jobs.
- No Grok, Hermes model, Fable, or local-model subagent.
- No stage, commit, push, or Kanban Done.
- Do not touch repository-parent `.claude/launch.json`, repository-parent
  `.gitignore`, `logs/run-claude-seat.sh`, or the observability-loop mission.

The only allowed writes are this seat's named receipt/result/session/progress
artifacts under the mission log directory.
