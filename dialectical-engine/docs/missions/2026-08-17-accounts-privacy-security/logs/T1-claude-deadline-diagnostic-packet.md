# T1 Claude Opus diagnostic — uncensored 103-registration completion

Date: 2026-08-22 (Europe/Bucharest)
Owner: Codex-Router / V
Seat: one visible Claude Opus 5 CLI terminal
Kanban: `accounts-phase1` / `t_b225b2f2`

## 1. Authority and purpose

This is a bounded diagnostic seat, not a product implementation seat. The
frozen candidate failed the healthy-MTA burst twice at the existing 18-second
shared mail-permit deadline: `98/100` in FINAL2 and `96/100` in a fresh
process. It also failed the fresh live-mail N=3 bound at `973.0 ms > 430 ms`.

V has already ruled that registration cadence remains 45 ms, the first 100
simultaneous registrations are a hard availability requirement, and
registration capacity stops at 103 for now. The recommended implementation is
a registration-specific hard admission budget of 103 plus a separately ruled
registration wait deadline. Extending the current 18-second suspended-request
retention bound is a security tradeoff, so first measure the uncensored wait on
the exact current production bytes.

Your task is to add one temporary diagnostic test, run it in three independent
fresh Vitest processes, preserve complete receipts, and restore the governed
test byte-for-byte. Do not change any product, policy, schema, threshold, queue,
worker, or permanent test byte. Do not implement the 103 gate in this seat.

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

Before any temporary edit, write
`logs/T1-deadline-diagnostic-custody-pre.txt` with UTC time, HEAD, staged
paths, porcelain status, the 12 hashes, and size/mtime for the integration test.
Create a private byte-preserving backup under `/tmp/t1-deadline-diagnostic/`.
Stop on any mismatch; do not repair it.

Read completely before acting:

- `logs/T1-final2-custody-progress.log`
- `logs/T1-final2-pnpm-test.log`
- `logs/T1-recalibration1-progress.log`
- `logs/T1-recalibration1-capacity.log`
- this packet

## 3. Temporary test contract

Temporarily append exactly one test to
`tests/integration/registration-database.test.ts`, inside the existing top-level
suite, titled:

`T1 rework7 D1 measures uncensored 103-registration completion at a diagnostic 60s registration deadline`

It must use the real production `RegistrationService`, real process-owned
two-worker Argon2 pool, real PostgreSQL repository, 45 ms registration cadence,
32 concurrent mail permits, 96 shared queued permits, real password/audit KDFs,
600 ms clamp, 5.1-second registration reservation and a healthy mail sender
that waits 5 ms. The only override is a test-local immutable policy copy whose
`mailDispatchQueueWaitTimeoutMs` is 60,000 ms. This is diagnostic headroom, not
a proposed production value. No fake KDF, DB, timer, sleep, or delivery path.

Launch exactly 103 simultaneous unique registrations. Instrument without
logging any email, password, source, token, hash, or correlation identifier.
Measure and print one machine-readable line containing at least:

- successes, `AUTH_MAIL_BUSY`, unexpected errors, committed rows, and sends;
- reservation-wait p50/p95/p99/max;
- whole-registration p50/p95/p99/max;
- first and last completion time;
- maximum pool active workers, queued credential, queued audit, outstanding
  credential, outstanding audit, and outstanding total, sampled at <=10 ms;
- event-loop delay p99/max from a 1 ms heartbeat while work is pending;
- pool stats after `drainMailDispatches()`.

Non-vacuity assertions for every repeat:

- exactly 103 successes, commits, and sends;
- zero busy and zero unexpected errors;
- at least one measured reservation wait exceeds 15 seconds, proving this is
  not a small/fast-burst substitute; if this precondition is false, report it
  honestly rather than manufacturing delay;
- max pool active is exactly 2 and queued work is observed;
- after drain: zero active/queued/outstanding work and zero mail occupancy;
- no timeout, unhandled rejection, 40P01, PostgreSQL ERROR, or leaked process.

The diagnostic test timeout may be 180 seconds. Do not modify or neutralize any
existing test or assertion.

## 4. Three fresh-process receipts

Run this exact command three times, sequentially and in the foreground:

```text
node_modules/.bin/vitest run tests/integration/registration-database.test.ts -t "T1 rework7 D1 measures uncensored 103-registration completion at a diagnostic 60s registration deadline"
```

Each invocation must start a new Vitest process and embedded PostgreSQL. Write
complete output plus raw status to:

- `logs/T1-deadline-diagnostic-repeat-1.log` and `.status`
- `logs/T1-deadline-diagnostic-repeat-2.log` and `.status`
- `logs/T1-deadline-diagnostic-repeat-3.log` and `.status`

Continue through all three even if one is RED. Do not rerun a repeat.

## 5. Restore and report

Restore the integration test from the private byte-preserving backup. Prove its
SHA-256, size, and mtime match entry exactly. Recheck HEAD, empty index, all 12
hashes, and porcelain. A restore mismatch is `CODEX BLOCKED (custody)`; do not
attempt a second repair strategy.

Write `logs/T1-deadline-diagnostic-progress.log` containing:

- exact command/status/start/end/duration for all three repeats;
- every diagnostic metric line;
- host/process observations, clearly separated from causal claims;
- max and worst repeat for each timing metric;
- a proposed finite registration-only deadline calculated as the next whole
  second at or above `1.25 * worst observed reservation wait`, with a minimum
  of 20 seconds and a maximum diagnostic recommendation of 30 seconds;
- whether that proposal leaves at least 20% empirical margin in every repeat;
- whether a 30-second ceiling is sufficient; if not, state that Option A is
  disproved and scheduler/worker work is required;
- an explicit statement that this diagnostic does not repair or requalify
  N*=3, exact 103 admission, full-history timing, or release custody.

Finish with exactly one marker:

- `DIAGNOSTIC SUPPORTS BOUNDED REGISTRATION DEADLINE` only if all three are
  status 0, all non-vacuity assertions pass, and the calculated proposal is
  <=30 seconds; or
- `DIAGNOSTIC REQUIRES SCHEDULER OR WORKER REWORK` otherwise.

## 6. Hard stops

- No product, policy, schema, register row, migration, permanent test, queue,
  timeout, worker-count, cadence, clamp, or threshold change.
- No repository-wide `pnpm test`, stage, commit, push, or Kanban Done.
- No background test, watcher, completion helper, nested agent, Grok, Hermes
  model, Fable, or local model.
- Do not touch repository-parent `.claude/launch.json`, repository-parent
  `.gitignore`, `logs/run-claude-seat.sh`, or the observability-loop mission.
- Allowed durable writes are only the named diagnostic receipts and progress
  log. Temporary test bytes must be completely removed/restored before exit.

