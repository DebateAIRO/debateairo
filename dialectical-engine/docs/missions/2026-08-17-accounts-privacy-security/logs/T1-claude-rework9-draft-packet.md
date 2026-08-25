# T1 Rework9 — T9 cadence-blocked recalibration + exclusive-gate custody

> **DRAFT — NOT AUTHORIZED FOR CLAUDE LAUNCH OR EXECUTION.**
>
> This packet becomes executable only after V/user explicitly approves **Option
> 8A**, defined below, and Codex-Router creates a separate immutable
> `T1-rework9-authorization-receipt.json` binding this byte-frozen packet's final
> SHA-256. This packet is never edited to authorize itself. Until the external
> receipt exists: no source/test edit, Claude seat, test, supervisor bootstrap,
> mutation, commit, push, or Kanban completion is allowed.

## 1. Objective and decision boundary

Close the remaining T1 release-custody blocker without weakening the privacy
contract or inventing a Rework8 product defect.

The author must:

1. replace the cadence-confounded, single-window T9 mixed-contention statistical
   test with the counterbalanced, cadence-blocked contract in this packet;
2. add a clearing-only M16b negative control for password-reference custody;
3. author the static exclusive-gate controller/supervisor artifacts specified
   below, but **must not run the Router full-file gate**;
4. stop for Router and two fresh Sol xHigh reviews on stable bytes.

No resend, registration, crypto, database, policy, or other product change is
authorized. If the new live contract returns
`T9_RESEND_PRODUCT_REPAIR_REQUIRED`, the author must stop and return that marker;
it does not authorize a product repair in this seat.

**Option 8A** means exactly this packet's self-contained six-window T9
counterbalanced/cadence-blocked test contract, clearing-only M16b, and later
exclusive-gate design. It does not authorize a resend product repair, threshold
widening, unchanged-byte rerun, final full gate, commit, push, or ticket closure.

The external authorization receipt must contain: decision `8A_APPROVED`, user/V
authority, approval UTC, final packet SHA-256, required HEAD, ticket, permanent
and temporary file scope, and the explicit excluded authorities above.

## 2. Binding entry custody

- Repository: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`
- Branch: `dev`
- Required HEAD: `7918f4f8bff33909792afc01dc38d402972b4ccd`
- Required staged paths: zero
- Ticket: `accounts-phase1/t_b225b2f2`
- Grok, Hermes-model, Fable: decommissioned; do not launch.
- Hermes CLI may be used only as the Kanban client.
- No commit, push, ticket completion, or branch mutation.

Required governed manifest at entry:

```text
0172fc7e1dd44de560d467743f3e5ab7f6406bf52a5bbb302dd68685d64d679a  apps/api/src/index.ts
91bf0e695ef847b0864bedd030c2ed94f4431d3864fa5e5a7e540aeec011342b  apps/api/src/main.ts
1021340613a3839b2379f8b1af2fe139112d1bb029c6bfddf54caa7425f4da03  apps/api/src/registration.ts
66b20d2170a35667e75e4ba15e8adc016d44d252958527e2877b99bf9f6871e6  packages/crypto/src/index.ts
c610b06ee13a87ec8d9a47c88b552edb5398b30cd9b49509d547eda36fdcb11b  packages/crypto/src/argon2-worker.ts
b990c3f866f9697b158e4040ffd9bb832341e31853a40d30e70deb57394c526d  packages/crypto/src/argon2-worker-pool.ts
2d92223b58c6f1af7c6b9bc544df5f2518e8e20404bf982fbabb0a50bc90e17f  packages/db/src/identity.ts
f8e406f1cd35393aa20eac5ef5679ed31dd8f9213ee2c727a5aacd9d706a4216  packages/register/src/auth-policy.ts
fec8beaf47843e61d0674e7879be7172181facf26666794baa0c9fa58762078d  tests/integration/registration-database.test.ts
baa9254edaf65965402b8d6714efcb63dcde4961f99268573b9bdc9903b0de53  tests/unit/registration.test.ts
93f1a3357ffe5b45fac047f77c16c9ae80322123a3eff97c30a7d7e7d2afb55b  tests/unit/argon2-worker-pool.test.ts
4896587d1fafc0d52c2389c3bd6336a05798ea1a89cadaa42280b6a0039fb18d  tests/architecture/t1-argon2-worker-contract.test.ts
```

The author must record all twelve pre/post hashes, HEAD, and staged-path count in
`logs/T1-rework9-progress.log`.

## 3. Preserved evidence and non-negotiable interpretation

Preserve these receipts byte-for-byte:

- `T1-rework8-router-full-registration.log` / `.status`: raw `0`, 56/56,
  13:49:45Z–14:15:06Z.
- `T1-rework8-router-full-registration-attempt2.log` / `.status`: raw `1`,
  55/56, 14:01:09Z–14:26:26Z.

They overlapped for 13m57s. Neither is exclusive acceptance evidence. Attempt2's
T9 AUC failure remains a terminal RED and must not be waived, averaged, deleted,
or rerun unchanged. The first receipt's green statistic is descriptive evidence,
not a vote that overrides the RED.

The evidence does **not** establish a Rework8 product defect. All Rework8
lifecycle, focused, architecture, capacity, and other full-file assertions passed.

## 4. Permanent file scope

Permanent governed edit allowed:

- `tests/integration/registration-database.test.ts`

Temporary mutation-only edits allowed, with mandatory byte-exact restoration:

- `apps/api/src/registration.ts` — M16b and the T9 25ms direction-control mutant
  only; never both at once.

Evidence/supervisor artifacts may be created only under:

- `docs/missions/2026-08-17-accounts-privacy-security/logs/T1-rework9-*`

Later Router execution alone receives one exception for the exact global lock:

- `docs/missions/2026-08-17-accounts-privacy-security/logs/.T1-full-registration.exclusive.lock/`

The author may describe but must not create or acquire that lock.

All other product/test paths are read-only. A need to widen scope is a stop.

## 5. T9 replacement contract

Replace only the current mixed-contention equivalence test body (entry source is
near lines 5255–5369). Do not alter the shared same-arm helper used by other
tests. Keep the exact public route, real PostgreSQL, production registration
service/repository, and ruled cadence derivation.

### 5.1 Six precommitted windows

Use three replicate pairs. Each pair contains:

- window AB: existing at first/even cadence position, missing second/odd;
- window BA: missing at first/even cadence position, existing second/odd.

Each of the six windows must contain exactly 32 existing and 32 missing requests,
with unique IPs and unique address/account namespaces. Each window receives a
fresh mail sender, flow, API, pending account, clock namespace, and limiter. Drain
registration delivery before the window and fully drain/close it before the next
window. Windows must not overlap.

Retain the precommitted 357ms cadence formula. Do not choose order, seeds, or
window count after observing data.

Match cadence slot `s` in AB with slot `s` in BA as one four-observation block.
Pool AB+BA for that replicate: 64 existing and 64 missing observations.

### 5.2 Restricted randomization null

Add a T9-local helper; do not change the shared null helper.

- Draws: exactly 4,095; add-one denominator 4,096.
- Seeds: `0x79a0b001`, `0x79a0b002`, `0x79a0b003`.
- PRNG: xorshift32.
- For each draw/replicate, one 32-bit mask controls the 32 cadence blocks.
- A set bit flips both AB/BA label assignments inside matched slot `s`; an unset
  bit preserves them.
- Never move an observation across cadence slots, windows, or replicate pairs.

For each replicate calculate:

- folded cross-arm AUC;
- best single-threshold classification accuracy;
- directed, unfolded AUC for sign diagnostics.

### 5.3 Family-wise inference

The inferential family contains exactly six endpoints: AUC and accuracy for each
of three replicate pairs.

Use conservative `>=` permutation tails. The transformation multiset `G` is the
identity transformation `g0` plus exactly 4,095 seeded masks. Duplicate masks
remain in `G` and are never redrawn. For endpoint `j` and transformation `g`:

```text
p_j(g) = count{h in G: T_j(h) >= T_j(g)} / 4096
m(g) = min over the six endpoints p_j(g)
p_FWER = count{g in G: m(g) <= m(g0)} / 4096
```

Apply this single-step Westfall–Young minP adjustment over all six endpoints.
Record all raw `p_j(g0)`, adjusted family p-value, seeds, exact transformation
count, duplicate-mask count, endpoint count, and null-integrity assertions.

Statistical green requires `p_FWER > 0.01`. Per-endpoint q99 values may be printed
as diagnostics but must not be independent acceptance gates.

Within each replicate, apply Holm correction over its two raw `p_j(g0)` values at
0.05. A replicate rejects locally iff at least one endpoint survives Holm;
equivalently its smaller raw p-value is `<= 0.025`.

### 5.4 Terminal statistical classification

Emit exactly one of:

- `T9_RESEND_EQUIVALENCE_GREEN`
- `T9_RESEND_PRODUCT_REPAIR_REQUIRED`
- `T9_TEST_CONTRACT_INCONCLUSIVE`

`T9_RESEND_PRODUCT_REPAIR_REQUIRED` requires both:

1. `p_FWER <= 0.01`; and
2. at least two of three replicate pairs reject locally after Holm, share the
   same nonzero directed-AUC sign, and both AB and BA constituent windows carry
   that same sign.

A global rejection without this replication, or replicated nominal separation
without global rejection, is `T9_TEST_CONTRACT_INCONCLUSIVE`. Both non-green
markers block handoff; neither permits an unchanged rerun.

### 5.5 Hard functional/security conjunction

Every window must independently prove:

- existing 32/32 and missing 32/32 return exact HTTP 202;
- exact public `RESEND_BODY` and no database/internal error leakage;
- zero rejections and deadlock delta zero;
- after drained bootstrap: exactly one mail and one credential;
- after timing: exactly two mails and two credentials, for one and only one resend
  delta; the seeded credential row remains byte-identical; both live credentials
  retain their individual ruled TTL; the seeded token still activates afterward;
- audit rows associated by the registered account's actor token are exactly:
  - existing: 32 rows — 1 `ALLOW/success=true`, 31
    `DENY/success=false/RESEND_COOLDOWN`;
  - missing: 32 rows — all `DENY/success=false/RESEND_NOT_APPLICABLE`;
- no rate-limit refusal;
- one audit-chain root, full depth, valid chain;
- chain verification occurs after the seeded-token activation audit;
- per-window median gap `<= 100ms`;
- pooled-pair median gap `<= 100ms`.

These gates are outside the statistical family and are a hard conjunction. The
100ms value is frozen and may not be raised.

### 5.6 Deterministic controls

Before live timing, add controls that execute the same evaluator:

All three controls and the live six-window evaluator remain inside the one
existing named T9 test. The permanent integration file must still contain exactly
56 tests; controls do not create extra top-level `it` cases.

Use these exact, immutable fixtures:

```text
base(slot) = 500 + (slot mod 4)
cadence-only score = base + (first_position ? 32 : 0)
arm-effect score = base + (first_position ? 8 : 0) + (missing ? 32 : 0)
blocked-power score = 500 + 1000*slot + (missing ? 10 : 0)
```

1. Cadence-only: no arm bias. Its acceptance assertion expects
   `T9_RESEND_EQUIVALENCE_GREEN`. When first wired through the legacy AB-only
   evaluator it must exit nonzero because that evaluator reports separation; no
   unchanged live T9 run occurs. The same named control must turn green through
   the final AB/BA blocked evaluator.
2. Arm effect: it must give crisp AUC/accuracy power, `p_FWER <= 0.01`, and the
   exact product-repair marker while remaining under the 100ms median limit.
3. Blocked power: the blocked method must detect the 10ms within-block arm effect.

### 5.7 Contract mutants

Each mutant must select at least one named test, fail by an intended assertion,
avoid compiler-only/zero-selection/timeout-only/unhandled kills, and restore exact
bytes before the next mutant:

1. Replace BA order with AB — cadence-only control fails.
2. Replace matched-block flips with global relabeling — blocked-power control fails.
3. Reduce one arm from 32 to 16 — exact cardinality fails.
4. Remove AUC or accuracy from the six-endpoint family — family assertion fails.
5. Temporarily introduce `identityFound=false`, set it from the resend identity
   lookup, and after `holdEnumerationFloor(startedAt)` but before final
   dispatch/release execute `if (identityFound) await this.sleep(25)`. The live
   contract must return exact product-repair classification while
   body/deadlock/audit/median gates stay green. A pre-floor delay is invalid
   because the enumeration floor can absorb it.

Mutant 5 is temporary product mutation only if the final reviewed line location is
inside the already-authorized `apps/api/src/registration.ts` mutation scope. If a
second product location is required, stop for scope authority.

## 6. M16b clearing-only negative control

Starting from the Rework8 product bytes, temporarily delete only the
`dropPasswordReference();` call in the queued-cancellation path. Preserve queue
removal and rejection consumption exactly.

Run only the saturated queued-hash test title. Required RED:

- exactly one selected test;
- queue-removal assertions pass;
- first relevant failure is password references `expected 1 to be 0`;
- raw nonzero status with assertion failure;
- no timeout, compiler error, zero-selection, or unhandled rejection;
- byte-exact product restoration before any other action.

## 7. Author-run evidence and runtime

The author may run only RED-first, deterministic controls, named focused tests,
M16b, the five contract mutants, typecheck/lint/diff-check, and exact restoration
checks. The author must not run the complete registration file or repo-wide suite.

The new live test timeout is 420,000ms. Six observed windows budget about 249s.
Record actual runtime; do not raise the timeout in response to a failure.

Required durable outputs:

- complete stdout+stderr log and raw `.status` for every command;
- exact command, selected test count, start/end UTC, HEAD/index/hashes before/after;
- one progress entry per RED, control, mutant, restore, and final focused gate;
- a final manifest containing hash, size, and mtime for all twelve governed paths.

Author terminal marker on fully green focused evidence:

```text
ROUTER FULL SUITE REQUIRED
```

Any live replicated separation or hard functional failure:

```text
CODEX BLOCKED reason=T9_RESEND_PRODUCT_REPAIR_REQUIRED
```

Any statistical conflict/control/null-integrity issue:

```text
CODEX BLOCKED reason=T9_TEST_CONTRACT_INCONCLUSIVE
```

The author must never emit peer-review readiness, run the final full gate, commit,
push, or complete the ticket.

## 8. Exclusive-gate supervisor artifacts

The author must statically create a later Router-run controller/supervisor design.
It is not executed in the author seat.

### 8.1 Global atomic lock

Before process inspection or receipt creation, the future bootstrap launcher must
acquire and then transfer to the controller:

```text
logs/.T1-full-registration.exclusive.lock
```

using one atomic `mkdir`. This lock is global across attempt names. Failure is
`EXCLUSIVE_LOCK_CONFLICT`. Never reclaim automatically from a PID file, absent
status, stale heartbeat, `kill -0`, or failed `ps`.

The retained receipt directory is:

```text
logs/T1-rework9-gate-<run_id>/
```

All JSON/JSONL, streams, snapshots, and viewer files live there. Its immutable
`owner.json` must bind a lowercase UUID run ID, random 256-bit ownership-token
hash, ticket, exact argv/cwd, HEAD, empty index, external
authorization-receipt hash, fresh execution-packet hash, final Rework9 packet
hash, exact launcher/controller/worker/both-plist/viewer hashes, all 12 governed
hash/size/mtime tuples, launchd labels, expected `1` test file / `56` tests, and
UTC plus monotonic creation times.

The lock contains only `claim.json`, binding run ID, token hash, persistent
`owner.json` hash, and lock device/inode. The bootstrap launcher acquires the lock
before creating any runtime artifact or bootstrapping either service, then
transfers token custody to the controller. Before exact `rmdir`, only the known
`claim.json` may be unlinked; never recursively delete or erase retained receipts.
`release.json` is written afterward in the retained receipt directory.

### 8.2 launchd ownership; Terminal is only a viewer

Use unique per-run GUI launchd labels:

- `com.debateai.t1gate.controller.<run_id>`
- `com.debateai.t1gate.worker.<run_id>`

Use `ProcessType=Standard`, `AbandonProcessGroup=false`, and fixed streams. The
worker has `KeepAlive=false`. The controller may restart only after abnormal exit.
Before worker `launchctl bootstrap`, the first controller epoch must atomically create
`worker-bootstrap-requested.json` with O_EXCL semantics. Every later controller
epoch is recovery-only: once the sentinel exists it may watch the exact existing
worker label or finalize an interruption, but it must never bootstrap/rebootstrap
a worker. Failed or permission-denied label lookup is `UNKNOWN_HELD`.

The worker durably records the test's raw result, then exits launchd status zero so
a normal test failure is not treated as a worker crash. The worker spawns exact
argv with `detached:false`; do not use `setopt MONITOR`, `setsid`, detached
children, or child-created process groups.

Set a unique run-local `TMPDIR` and `T1_GATE_RUN_ID`. Terminal is only a viewer.
After successfully opening the log, it writes `viewer.ready.json` containing run
ID, a one-time controller challenge, viewer PID/TTY, and UTC. The controller
validates those fields before worker bootstrap; validation failure aborts while
retaining custody. Closing Terminal/Codex must not own or signal the
controller/worker.

### 8.3 Heavy-lane preflight

After lock acquisition and immediately before bootstrap:

- capture complete process and launchd-service snapshots;
- reject unexplained Vitest, Claude, mutation supervisor, Router gate, pg_ctl, or
  PostgreSQL processes;
- bind allowed PostgreSQL processes to an explicit packet baseline;
- verify no other T1 worker service;
- reverify token, cwd, argv, HEAD, empty index, external authorization-receipt
  hash, fresh execution-packet hash, final Rework9 packet hash, exact
  launcher/controller/worker/both-plist/viewer hashes, and all twelve governed
  tuples.

Any permission denial, partial/truncated snapshot, unavailable launchctl, or
ambiguous identity is `PREFLIGHT_LIVENESS_UNKNOWN`; do not launch.

Persist the exact snapshots as `process-pre.txt` and `launchd-pre.txt`, plus
`preflight.json` containing their hashes, completeness checks, explicit allowed
PostgreSQL baseline, and the final bootstrap decision.

### 8.4 Heartbeat, cleanup, and terminal receipts

Atomically write/fsync/rename:

- immutable `owner.json`;
- O_EXCL `worker-bootstrap-requested.json`;
- sequenced `events.jsonl`;
- `heartbeat.json` every 15s with UTC+monotonic times, phase, controller epoch,
  worker label, diagnostic PID, log bytes, and last-output time;
- `worker-terminal.json` after the child close event;
- `postflight.json` after cleanup and custody checks;
- write-once `terminal.json` only after cleanup/postflight;
- `release.json` only after token/inode-verified lock removal.

Numeric PID/PGID values are telemetry, never authority. Signal only the exact
unique launchd label or a still-owned unreaped child handle. Never signal an ID
read from a receipt. An escaped PostgreSQL process may be stopped only after a
successful process snapshot proves its full command names an exact data directory
under the unique run-local `TMPDIR` and its start time falls within the run. Any
mismatch, ambiguity, or permission denial is `CLEANUP_UNKNOWN`; do not signal it
and retain the lock.

Recompute HEAD/index/all twelve tuples regardless of test status. Only proven
worker bootout, no run-owned descendants, global heavy-lane re-scan, exact
postflight, and token/inode match permit non-recursive lock removal.

### 8.5 Read-only monitor semantics

- `RUNNING`: no terminal receipt and heartbeat advances within 45s.
- `STALLED/UNKNOWN`: stale heartbeat; never evidence of death or authority to
  replace the run.
- `TERMINAL_PASS`: raw0 + exact expected test count + cleanup/postflight/release.
- `TERMINAL_FAIL`: complete nonzero receipt + cleanup/postflight/release.
- `INTERRUPTED`: explicit recovery receipt proving termination, cleanup,
  postflight, and release without test terminal result.
- `UNKNOWN_HELD`: any ambiguity; lock stays held.

The monitor never signals, removes locks, or bootstraps a replacement.
Router waits for matching `terminal.json` **and** `release.json`. A raw `.status`,
inactive launchd label, stale heartbeat, or lock absence by itself never completes
or interrupts the gate.

## 9. Stable handoff and review

On author completion:

1. close the visible Claude seat;
2. verify no author child remains;
3. freeze new 12-path hashes and all evidence/supervisor artifact hashes;
4. obtain two **fresh** GPT-5.6 Sol xHigh read-only reviews:
   - statistics/test/mutant/evidence;
   - controller/process/custody/security;
5. if either requests changes, launch a new visible Claude Opus rework seat;
6. only dual approval allows Router to create a fresh execution packet for one
   exclusive full registration-file gate on the changed integration-test bytes.

That execution packet must bind: external authorization-receipt hash; final
Rework9 packet hash; launcher, controller, worker, both plist, and viewer hashes;
final twelve hash/size/mtime tuples; exact absolute argv/cwd; expected `1` test
file / `56` tests; explicit allowed-process/PostgreSQL baseline; exact global lock
path; and unique run ID.

No third run on hash `fec8beaf...` is allowed.

## 10. Eventual publication rule

No push is authorized. Before any future push, Router must pull/integrate the
latest `dev` locally again, resolve custody, run the required repo-wide gate, and
obtain explicit publication authority.
