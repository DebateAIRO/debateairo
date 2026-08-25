# T1 Claude Opus diagnostic — N=3 critical-path attribution

Date: 2026-08-22 (Europe/Bucharest)
Owner: Codex-Router / V
Seat: one visible Claude Opus 5 CLI terminal
Kanban: `accounts-phase1` / `t_b225b2f2`

## 1. Mission

Attribute the unchanged-byte N=3 registration timing failure without changing
product, policy, permanent tests, thresholds, cadence, queueing, workers, KDF,
database behavior, or the pending Rework7 authorization decision.

Current evidence:

- historical version-2 isolated evidence reported N=3 <=389.6 ms and ruled it
  at 430 ms;
- FINAL2 later observed N=3 hash/provision maximum 1,264.7 ms;
- fresh Recalibration1 observed 973.0 ms;
- privacy/AUC/classifier gates at N=3 were green in those RED receipts;
- cap 103 and a 28-second queued deadline cannot affect N=3, because three
  requests are far below the cap and receive immediate mail permits.

Determine whether the observed critical path is dominated by password/audit
worker service or queueing, initial repository lookup, audit preparation,
PostgreSQL transaction/provisioning, response clamp/timers, event-loop delay,
or a mixed/variable combination. This is diagnostic evidence only; do not
select or implement a repair.

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

The visible wrapper verifies this packet's audited SHA-256 and the governed
test's entry SHA-256 before launch, creates a unique `mktemp -d` backup, exports
its directory as `T1_N3_BACKUP_DIR`, and installs terminate/reap-before-restore
signal/EXIT custody. Verify that fresh backup before editing; do not create or
trust a fixed/stale backup path. Write
`logs/T1-n3-attribution-custody-pre.txt` with UTC, HEAD, staged paths,
porcelain, all hashes, integration-test size/mtime, exported backup path and
backup SHA/size/mtime/`cmp`. Stop on mismatch; do not repair.

Read completely before editing:

- `logs/T1-final2-custody-progress.log`
- `logs/T1-final2-pnpm-test.log`
- `logs/T1-recalibration1-progress.log`
- `logs/T1-recalibration1-live_mail.log`
- `logs/T1-deadline-diagnostic-progress.log`
- this packet

## 3. Temporary diagnostic test

Temporarily add exactly one test inside the existing integration suite titled:

`T1 rework8 D1 attributes the real N=3 registration critical path`

It must exercise the real production `RegistrationService`, real PostgreSQL
repository/transactions, the one process-owned two-worker Argon pool, real
64-MiB password KDFs, real 19-MiB audit KDFs, 45 ms cadence, 600 ms clamp, and
normal mail-permit path. Do not override any policy. Use a healthy sender and
drain all work.

Reproduce the original S3b ordering rather than a clean substitute. First run
the same N=1 cell and N=2 cell history, including their existing-address seeds,
alternating existing/missing waves and drains. Then construct the N=3 cell with
three seeded existing addresses and the same four-wave arm order/drains as the
original test. Instrument both N=3 arms separately: 12 existing and 12 missing
request observations. Use the original unique source-IP and ordinary
user-agent patterns. Clear metrics only after N1/N2 history and the N3 seed are
complete and drained.

Use a temporary test-only
`AsyncLocalStorage<{ ordinal: number; arm: "existing" | "missing"; phase:
"request" | "critical-provision" | "postresponse" }>` so every instrumented
async stage is attributable without logging an email, source, password, token,
hash, correlation ID, ciphertext, user ID or request ID. Wrap the original
`createPendingAccount` call inside a nested `critical-provision` ALS phase.
Record repository `prepareAuditContext`, `transaction` and their audit KDFs as
critical-path evidence only while that phase is active. Explicitly tag delivery
and duplicate postresponse work as `postresponse`, or freeze the critical
timeline at register settlement before drain; never rely on `setImmediate`
winning a timing race. Report postresponse counts separately after drain.

Test-only wrappers must call the original implementation exactly once and
preserve arguments/results/errors/`this`. Instrument these stages:

- whole `register` call;
- initial `findAuditIdentityByBlindIndex`;
- `reserveMailDispatchPermit` wait-to-grant;
- `scheduleRegistrationHash` promise settlement;
- pool `hashPassword` enqueue-to-settle;
- pool `hashAuditContext` enqueue-to-settle, with IP/UA distinguished only by
  invocation order within each request (first/second), never by value;
- repository `prepareAuditContext`;
- repository `transaction`;
- repository `createPendingAccount`;
- service `provisionPendingAccount`;
- `holdRegistrationEnumerationClamp` requested and actual wait.

Sample `Argon2WorkerPool.stats()` at <=5 ms while the three requests are
pending. Run a 1 ms event-loop heartbeat during the same interval. For each
request ordinal print monotonic start/end/duration for every stage, plus one
machine-readable aggregate line with:

- success/busy/unexpected, commits and sends;
- whole-register p50/max;
- initial lookup, reservation, registration-hash, password KDF, IP audit KDF,
  UA audit KDF, prepare-audit, transaction, create-account, provision and clamp
  p50/max;
- maximum pool active, queued/outstanding per lane and total;
- event-loop p99/max;
- after-drain pool/mail occupancy.

For each arm, reproduce the original comparable measurement exactly:

```text
hash_provision_max_ms = max(request start -> provisionPendingAccount return)
clamp_headroom_ms = 600 - (hash_provision_max_ms + 3 * 45)
```

Print a monotonic per-request timeline that allows overlap/queue time to be
checked directly. Do not sum overlapping durations and call the sum a critical
path. Public pool wrappers measure worker-lane enqueue-to-settle only; they do
not distinguish queue dwell from dispatch-to-worker service. Therefore lawful
worker conclusions are `credential worker enqueue-to-settle` or `audit worker
enqueue-to-settle`, never queue-versus-service attribution. Classification must
use non-overlapping spans for the breached request: initial lookup, credential
enqueue-to-settle, critical audit preparation (with its two nested audit
enqueue-to-settle intervals), DB transaction, residual provision overhead and
actual clamp wait. State overlap and uncertainty honestly.

Non-vacuity assertions:

- all 24 measured N3 requests (12 per arm) return the generic success response;
  the missing arm adds exactly 12 committed accounts and 12 measured sends,
  while the existing arm adds no account/send and does execute its expected
  duplicate postwork; zero busy/unexpected;
- exactly 24 initial lookups, password hashes, critical preparations,
  transactions and provisions, and exactly 48 critical audit KDF calls after
  metrics are cleared; postresponse counts are separately tagged/asserted and
  cannot enter these totals;
- pool active reaches 2 and queued work is observed;
- every request has a complete ordinal timeline;
- after drain, pool active/queued/outstanding and mail occupancy are zero;
- no timeout, unhandled rejection, 40P01, PostgreSQL ERROR/FATAL, secret log or
  leaked process.

The temporary test timeout may be 240 seconds. Do not modify or neutralize any
existing test/assertion.

Install test-local identifier-safe `console.error`/`console.warn` capture before
the N1/N2 preconditioning and every N3 seed, retain it through the final drain,
and restore it in `finally`. Never emit captured text verbatim. Assert against
all generated input literals and identifier patterns that no email, IP, source,
password, token, hash, correlation/channel/user/request ID or ciphertext would
reach the durable receipts; print only whitelisted error-code counts. Catch
per-request product failures into code-only outcomes so a RED does not cause
Vitest to serialize a secret-bearing object.

Before the first run, preserve the exact secret-free temporary unified diff
against the wrapper-owned entry backup (not against Git HEAD) and
temporary integration-test SHA-256 under:

- `logs/T1-n3-attribution-temp-test.patch`
- `logs/T1-n3-attribution-temp-test.sha256`

Every repeat log header must include that same temporary SHA-256. These
artifacts are required for later independent non-vacuity review.

## 4. Three fresh-process runs

Run this exact command three times, sequentially, in the foreground, with no
rerun:

```text
node_modules/.bin/vitest run tests/integration/registration-database.test.ts -t "T1 rework8 D1 attributes the real N=3 registration critical path"
```

Preserve complete output and raw status under mission logs:

- `logs/T1-n3-attribution-repeat-1.log` / `.status`
- `logs/T1-n3-attribution-repeat-2.log` / `.status`
- `logs/T1-n3-attribution-repeat-3.log` / `.status`

Each must be a distinct Vitest process with a distinct embedded PostgreSQL
instance. Continue through all three even if one is RED.

## 5. Restore and report

Restore the integration test from the wrapper-owned fresh byte-preserving backup and prove
SHA-256, size, mtime and `cmp` equality. Recheck HEAD, empty index, all 12
hashes and porcelain. A mismatch is `CODEX BLOCKED (custody)`.

Write `logs/T1-n3-attribution-progress.log` containing exact commands,
statuses, times, every metric/timeline, cross-repeat table, clean-error scan,
host observations separated from causal claims, and one ranked conclusion:

1. credential worker enqueue-to-settle;
2. audit worker enqueue-to-settle;
3. PostgreSQL transaction/provisioning;
4. initial lookup;
5. clamp/event-loop scheduling;
6. mixed/variable/inconclusive.

For the leading component, cite exact per-request start/end overlap and explain
which repair class would test the hypothesis (third worker, bounded
critical-vs-postwork audit sublanes, DB work, or target-host qualification),
without authorizing or implementing it. State whether all three repeats agree.
`CONSISTENT` requires every repeat to be status 0, every count/drain/secret guard
to pass, the comparable cross-arm N3 cell to reproduce the failure (maximum
request-start-to-provision-end across existing and missing >430 ms, with its
derived clamp headroom negative), the breached request to be identified, and
the same quantitatively dominant non-overlapping component for that breached
request in all three repeats. If any repeat does
not reproduce, differs in dominant component, or leaves overlapping evidence
ambiguous, the only lawful result is `MIXED OR INCONCLUSIVE / NOT REPRODUCED`.

Finish with exactly one marker:

- `N3 ATTRIBUTION CONSISTENT: <COMPONENT>` only when every quantitative rule
  above is satisfied; or
- `N3 ATTRIBUTION MIXED OR INCONCLUSIVE` otherwise.

## 6. Hard stops

- No product, policy, schema, migration, permanent test, threshold, cadence,
  queue, worker, KDF, DB or Rework7 packet change.
- No full registration file, repository-wide suite, stage, commit, push or
  Kanban Done.
- No background command/watcher, nested agent, Grok, Hermes model, Fable or
  local model.
- Do not touch repository-parent `.claude/launch.json`, repository-parent
  `.gitignore`, `logs/run-claude-seat.sh`, or the observability-loop mission.
- Only named diagnostic receipts/progress are durable writes. Temporary test
  bytes must be removed and restored before exit.
