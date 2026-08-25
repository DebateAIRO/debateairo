# S10 VR-10 execution record

This record describes the final-byte S10 verification campaign. It is an
engineering receipt, not a legal-compliance or anonymity determination. The
technical outcome and residual vocabulary remain defined by
`S10-erasure-evidence-artifact.md`.

## Custody and mutation restoration

An earlier mutation run lost the recoverable copy of migration 0040 after a
mixed-public/legacy mutant. Every earlier receipt that depended on an exact
0040 restoration was invalidated. At the custody-recovery checkpoint, the
migration was audited line-by-line against the then-current intended design,
repaired for replay-safe `CREATE OR REPLACE` behavior, applied fresh from 0001
through 0040, replayed, and frozen with a recoverable copy before further
mutations.

- Mutation-checkpoint migration: `migrations/0040_account_erasure.sql`
- Historical checkpoint copy:
  `/private/tmp/s10-vr10-0040-final-replay-safe-20260824T2332.sql`
- Checkpoint SHA-256 for both:
  `72078463faf727e3476f1cad0a9f83900f1a3889889f9f22103ddc864cb1982e`
- Checkpoint byte comparison: exact match.

All 17 matrix rows that mutate 0040 were then rerun one at a time from that
checkpoint baseline. Each produced its required focused RED, restored from the
checkpoint copy, matched the checkpoint SHA-256, and passed its exact
restoration gate. Non-0040 rows retained their valid per-file restoration
receipts. No mutant was left in the working tree.

Subsequent full-gate findings required legitimate 0040 denial-path and
evaluator/identity boundary repairs. The terminal migration is therefore not
byte-identical to that historical checkpoint copy. Its final SHA-256 is
`6309d34d37f79b2ff616df5e054bc8634efa9c2ec3d9907e3bc94ef4a7012df6`.
Those later edits received fresh migration apply/replay and focused denial,
evaluator, T9, S6/S7/S8, and terminal-full coverage; the historical copy is not
claimed as a restore source for the terminal bytes.

## Post-scan bounded-history repair

The app-backed Codex Security diff scan found one reportable occurrence:

- Scan ID: `aaa31460-f883-4d6a-9cf3-67e9c629a8fd`
- Snapshot:
  `codex-security-snapshot/v1:sha256:423a08ec843eb0aa6db67134842c8e9f5cdc572d732747e05ffd2d34aa02561e`
- Finding: `csf_25bea213e7f8444fa7ddaedf`
- Occurrence: `occ_89c065b707d6a456da124d0d`
- Classification: MEDIUM, CWE-400.

The vulnerable owner-scoped liveness and memory queries decrypted every
historical candidate before an ordinary ask could proceed. The restored
boundary exports one policy, `MAX_OWNER_PRIVATE_HISTORY_SCAN = 128`; each
repository deterministically requests at most 129 rows and rejects the 129th
with `OWNER_PRIVATE_HISTORY_SCAN_SATURATED` before any content lease, key
load, decrypt, provider invocation, write, or output. The adjacent owner-wide
answer-index page is capped at the same policy boundary.

The first bounded repair still had a concurrency gap at exactly N=128: two
asks could pass liveness before either created a capacity-counted run, and one
could then fail a later memory scan after it had already provisioned a run.
The final Option C boundary takes a dedicated-session, owner-scoped PostgreSQL
advisory admission lease from liveness through the durable `startRun` commit.
The server path holds the lock and executes provision-intent prepare plus run
create on the same content-provision backend; the legacy path holds the lock
and executes `BEGIN`, run inserts, and `COMMIT` on the same runtime-credential
backend. A committed run itself consumes the owner-history capacity, so a
successor rechecks the higher count before starting another provision saga.
The lock is released before memory-question insertion, work enqueue, and
dispatcher I/O; arbitrary post-create failures are outside this admission
fence.

Server and legacy admission use explicit, separately constructed pools that
are not aliased to their ordinary query/provision pools. Waiters can exhaust
an admission pool without consuming the ordinary query capacity the holder
uses for liveness; the holder needs no second admission connection to commit
the run. Server owner UUIDs and exact legacy asker scopes use disjoint
normalized keys, different owners proceed independently, and backend death
before the count-changing commit kills the same client. If commit response is
ambiguous but the run exists, its durable row is the fence and the successor
saturates before external key or run provisioning.

Non-vacuous PostgreSQL evidence proves N=128 retains normal behavior and
N=129 records zero content leases, key preparations, decrypts, or writes. A
maxed same-owner schedule fills a three-connection admission pool with one
holder and two followers: the holder commits exactly one run, then both
followers recheck and receive typed saturation before provisioning. Separate
receipts prove the exact held PID/client performs server prepare/create and
legacy BEGIN/INSERT/COMMIT, different owners proceed concurrently, killed
backends release the lease, and an ambiguous committed create causes successor
saturation with no second key. A one-at-a-time mutation routing server prepare
through a different pool turned the exact-backend witness RED; source bytes
were restored to the pre-mutant SHA-256 before the GREEN rerun. The post-scan
fix report is stored at the scan bundle's visible `artifacts/fix_report.md`;
the sealed discovery report remains historical.

A subsequent bounded audit found the acceptance composition still relied on
the class's old aliased constructor defaults. The final constructor now
requires explicit admission pools and rejects identity aliasing against the
ordinary query pool, provision pool, or each other. The primary API remains
separate and role-attested. Acceptance creates two additional pool instances,
verifies both report its exact runtime principal, injects them explicitly,
and closes them with the API lifecycle. A one-at-a-time mutation disabling
the constructor guard turned the alias negative RED before exact restoration.

Final Option C custody receipts:

- focused PostgreSQL 6/6:
  `/private/tmp/s10-owner-admission-option-c-focused-final.json`, SHA-256
  `28f6596478442a999fe995f18f1338a9395fb952bc9f0fb3cf7d819e01ba9d3e`;
- same-client mutant RED 0/1:
  `/private/tmp/s10-owner-admission-same-client-mutant-red.json`, SHA-256
  `1c4d74cb19d2b4fd1e12ff2f30cc2db45b8beb773d6988cf800f20e819656aa1`;
- exact restored same-client GREEN 1/1:
  `/private/tmp/s10-owner-admission-same-client-restored-green.json`, SHA-256
  `190c61206f3583bb43fa687432993e66150277955be2695015f210116656f8a7`;
- restored `packages/db/src/index.ts` SHA-256:
  `15d57c20bafac4b7a43c46730fdc5882a173b4f3fdf0a3a4c58054d6305b1a43`;
- visible post-scan fix report SHA-256:
  `ec7e0d4dbbaaed9c665bd8a8302780214ee9000aed6a0176f706917dbe246d42`.

## Restored proportional gates

The final bounded-history bytes passed:

- actual PostgreSQL Option C admission group: 6/6;
- complete S6 PostgreSQL: 47/47;
- S7 plus memory PostgreSQL: 15/15;
- complete S8 plus T9 PostgreSQL: 31/31;
- affected API/memory/liveness unit: 34/34;
- focused final admission architecture/API: 2/2;
- full unit: 821/821 across 83 files, run in three bounded shards; an initial
  sandbox-only loopback `EPERM` was rerun by exact title and full affected
  shard with listener permission before counting the restored result;
- full architecture: 158/158 across 23 files;
- final evidence architecture: 3/3;
- contract generation and root typecheck;
- architecture/source lint and `git diff --check`;
- root/web and duplicate-UI production builds.

Post-composition-root receipts additionally passed the constructor alias unit
and all-callsite architecture titles 2/2, complete S7 12/12, and exact
database/evaluator constructor callsites 2/2. The dedicated acceptance suite
was 2/3: its mono-panel executable completed through the live API/runner and
the refusal control passed; the remaining ceremony passed authentication and
ask admission, then failed at the unrelated downstream
`NODE_REVIEW_UNAVAILABLE` runner seam. That downstream failure is not counted
as an admission GREEN and was not hidden by weakening its assertion.

Both framework production builds compiled and ran their built-in lint/type
validation successfully. A clean standalone TypeScript 7 invocation against
either duplicate Next app reports the same pre-existing TS2882 declaration
gap for the side-effect import of `globals.css`; no S10 source was weakened to
mask that base/toolchain mismatch.

Before the post-scan repair, the final S10 substrate also passed complete S7,
S8, and T9 database suites and render/UI suites. The post-scan fix changes no
erasure-migration, UI, notification, publication, or key-store semantics. The
final contract, typecheck, lint, build, evidence, residue, and diff gates above
were rerun on the repaired bytes before the release freeze.

## Eight-surface security self-review

The final repaired diff was reread across eight independent attack surfaces:

1. authentication and session binding: destructive routes derive identity
   from the cookie-bound session and exact step-up grant;
2. authorization and database principals: runtime, authorization, erasure,
   content-provision, publication-cleanup, replay, and PUBLIC capabilities
   remain mutually bounded and boot-attested;
3. input and transport: exact confirmation/action/target discriminants,
   CSRF/origin checks, and same-origin API-base normalization remain closed;
4. private-data cryptography: envelopes, attestation, QBI/derived-locator
   retirement, parse diagnostics, external key destruction, and zeroization
   retain their carrier-specific controls;
5. concurrency and lifecycle: T9 lock order, run/publication/notification
   leases, provision/cleanup intents, and the owner ask-admission lease have
   crash, exact-client, pool-saturation, and both-order witnesses;
6. availability and resource bounds: owner-history MAX+1 refusal, retry-fair
   erasure work, bounded notification reconciliation, and poison isolation
   fail closed before a successor provision saga; the admission guarantee
   ends at the accepted run's durable commit;
7. audit and retained references: canonical single-head append, event-local C4
   classification, source minimization, chain verification, and post-delete
   expansion attacks remain bounded;
8. product and evidence surfaces: account/private routes, duplicate UIs,
   notification lifecycle, public/legacy controls, runbook, and artifact use
   the same typed states and explicitly retain the ruled residuals.

No additional reportable P0/P1 was found in this final self-review. The review
does not expand the legal or residual claims below.

## Residual scope

The campaign does not claim universal deletion, anonymity, or legal
compliance. Legacy plaintext, retained current-public copies and provider
copies, event-local database-controller correlation, WAL/replicas/backups,
and transient process memory retain the classifications and controls stated
in `S10-erasure-evidence-artifact.md`. The bounded-history limit and
owner-admission lease are availability, key-exposure, and pre-provision
admission guards: they fail closed rather than truncating or returning a
partial semantic match. The admission fence ends at durable `startRun` commit;
it does not claim to roll back arbitrary later memory, work-enqueue, dispatch,
or provider failures.

## Sole-full registration follow-up: successor-labelled dispatch timing

The authorized sole full gate exposed a real successor-labelled registration
timing signal and several independent stale-fixture failures. The timing repair
uses the following final order:

1. finish the password hash before entering the mail permit queue;
2. activate the permit immediately when it is granted and retain the monotonic
   `activatedAt` receipt;
3. provision and durably commit the pending account while the exact 5,700 ms
   reservation is active;
4. register the verification dispatch, or an idempotent reservation hold on
   failure, immediately after the durable provision result; and
5. release admission only after the handoff/hold is visible and both the
   request-start and activation-anchored 600 ms floors have completed.

The 5,700 ms reservation is the exact sum of the 600 ms ruled healthy-storage
pretransport budget, 5,000 ms transport timeout, and 100 ms scheduler
tolerance. The 28,000 ms registration permit wait remains the declared
availability deadline. Fresh hash-first saturation evidence admitted and
delivered 103 operations, observed a 5,942.1 ms maximum accepted wait, and
left 22,057.9 ms (78.78%) deadline margin. This capacity receipt is availability
evidence only; it is not used as an opacity proof. The prior 5,100 ms decision
remains byte-preserved as superseded v3 history, while v4 is the active policy.

The restored paired successor experiment scored 32 existing and 32 missing
accounts with zero pretransport-budget overruns in either arm. Existing and
missing medians were 5,701.3 ms and 5,701.6 ms; permit-to-activation medians
were both 0 ms. Cross-arm AUC was 0.5195 against a calibrated 0.7676 ceiling,
best-threshold accuracy was 0.5938 against 0.75, sharp-window AUC was 0.5137
against 0.7598, and sharp accuracy was 0.5625 against 0.75. Exact paired
permutation p-values were 0.865082, 0.962677, 0.882111, and 0.999878 under the
declared familywise endpoint alpha 0.0025. The deep shared-dispatch controls
also restored GREEN: 32 active plus 96 queued, mixed registration/resend FIFO,
the following audit window, grant-to-grant timing, and the 28-second refusal
deadline.

Three one-at-a-time mutants own the structural non-vacuity:

- moving activation after provisioning made the gated-DEK witness RED because
  activation remained zero while the store was held;
- reserving before a forced 700 ms password hash completed made the hash gate
  RED because the permit was reserved while hashing; and
- changing the exact registration reservation from 5,700 ms to 5,100 ms made
  the call-path assertion RED with the observed value 5,100.

Each mutant was restored to the exact pre-mutant source bytes. The statistical
paired experiment happened to remain GREEN for the activation-order and
5,100-ms mutations, so it is not claimed as evidence for those structural
invariants; the permanent gated-store, hash-gate, and exact call-path witnesses
are. Final restored `apps/api/src/registration.ts` SHA-256 is
`b5792c394f211e94de16e8ef1ac95eadce6fd5243a2b6cd2e70db6d9fc05523e`.

The timing claim remains deliberately bounded. Scored opacity covers healthy
database and key-store provisioning that completes within the ruled 600 ms
budget. Longer storage stalls, database/key-store failures, and external-DEK
versus database-COMMIT ambiguity remain observable operational residuals and
are signalled; they are not hidden by this evidence and do not inherit an
anonymity claim. At this repair checkpoint the authorized full gate had not
yet been rerun; this section records the bounded repair and restored focused
receipts, not a second-full GREEN claim.

## Sole-full failure inventory: isolated restoration receipts

At this checkpoint the first authorized full run was the only full
`pnpm test` execution after the S10 freeze. Its eight authoritative failed
files had each been rerun to completion on the restored bytes, individually
and without a broad fallback:

- `registration-database.test.ts`: 66/66, receipt
  `/private/tmp/s3d-final-complete-registration-green.json`;
- `session-database.test.ts`: 11/11, receipt
  `/private/tmp/s10-full-repair-session-database.json`;
- `database.test.ts`: 59/59, receipt
  `/private/tmp/s10-full-repair-database.json`;
- `evaluator-addon-database.test.ts`: 9/9, receipt
  `/private/tmp/s10-full-repair-evaluator-addon.json`;
- `evaluator-consumer-database.test.ts`: 6/6, receipt
  `/private/tmp/s10-full-repair-evaluator-consumer.json`;
- `evaluator-database.test.ts`: 21/21, receipt
  `/private/tmp/s10-full-repair-evaluator-database.json`;
- `evaluator-harvest-rework.test.ts`: 10/10, receipt
  `/private/tmp/s10-full-repair-evaluator-harvest.json`; and
- `acceptance/ceremony.test.ts`: 2/2 under its required acceptance Vitest
  configuration, receipt
  `/private/tmp/s10-full-repair-acceptance-ceremony.json`.

The complete proportional S6/S7/S8/T9 PostgreSQL control then passed 90/90
(47/47, 12/12, 26/26, and 5/5 respectively) in
`/private/tmp/s10-full-repair-s6-s7-s8-t9.json`; S6 includes fresh migration
application and replay of `0040_account_erasure.sql`. The only repair found by
these complete-file reruns after the production fixes was test-state isolation:
two late session fixtures reused globally unique token-hash constants retained
by earlier rows. They now use domain-labelled SHA-256 fixture values; no
production function or migration changed.

The registration file's six formerly cascading titles also passed together
6/6 in `/private/tmp/s3d-six-failures-streaming-scalars.json`. Its RSS title is now
explicitly a **post-hash main-process refusal-retention** tripwire: it warms and
attests two production-configured Argon2 workers, waits for zero outstanding
work and zero restarts, closes the hasher and pool, asserts zero live handles,
then measures 8,512 real lookup/completed-hash calls against an exactly full
32-active/96-queued dispatcher. Every call returns `AUTH_MAIL_BUSY`; admission,
audit, provision, DEK, mail, user-row, and closed-pool counters remain zero, and
the reused two-row limiter key stays at exactly two occupied slots. The clean
child measured a 0.156 MiB null envelope and a 0.219 MiB plateau against the
unchanged 2 MiB tripwire. An otherwise identical 4 MiB-per-wave control retained
64 MiB and measured a 12.125 MiB plateau, failing that same ceiling. The exact
verbose receipt is `/private/tmp/s3d-rss-streaming-scalars.log`.

Capacity diagnostics are parsed while emitted into exactly three scalar values:
recognized-signal count, summed refusal count, and unrelated-signal count. No
capacity message strings or per-refusal count array survives in the scored
interval; both the clean and positive-control children assert exactly 8,512
recognized signals, a summed count of 8,512, and zero unrelated signals.

This evidence deliberately does **not** relabel the live-worker experiment as
GREEN. The earlier live-worker null envelope was 66.703 MiB and the per-sample
worker-first-touch variant reached its 600-second watchdog; those attempts are
retained as the reason the secondary RSS gate is scoped to post-hash
main-process state. Separate real-worker, queued-password-reference, worker
timeout, and teardown witnesses remain responsible for worker behavior. The
complete restored registration-file receipt before the final evidence-only
scalar repair was 66/66 in 1,954,610.486 ms. After that repair, the exact changed
RSS title passed 1/1 and its six-title coexistence group passed 6/6; the other 60
registration titles were not rerun because their code and fixtures were
unchanged. No second full `pnpm test` had been run at that evidence-only
boundary, so those isolated receipts did not claim a full-suite GREEN result.

## Full-suite closure and terminal freeze

This section supersedes the earlier temporal statements that no second full
gate had run. It does not erase either RED run or reinterpret focused receipts
as a full-suite result.

The first authorized full gate was RED across eight authoritative files:
registration, session, database, evaluator add-on, evaluator consumer,
evaluator database, evaluator harvest, and the acceptance ceremony. The
failure-by-failure disposition is recorded in the preceding section. It found
five genuine conditional-`RECORD` denial-path defects in migration 0040, the
registration successor-labelled timing defect, and evaluator add-on/scope/
harvest binding defects. The remaining failures were behavior-honest fixture,
audit-attribution, lifecycle, or statistical-evidence repairs. Each of the
eight files later passed completely under its owning configuration; those
isolated receipts remain evidence of the repairs, not a retroactive GREEN for
the first full run.

The sole authorized second full gate was also RED and is retained at
`/private/tmp/s10-second-full-final.json`, SHA-256
`b7e3bfbea4abd8211b172d4e63268c12743b18dffeacf335a16fbc2e2426a9c5`.
It completed 137/139 files and 1,343/1,345 tests. Its only two failures were
strict but stale tests: the S6 architecture contract still expected a nested
evaluator pool checkout that the shared content-lease client intentionally
removed, and the identity database test still expected the pre-S10 nine-table
schema. Production bytes remained frozen. The S6 test now proves the exact
ordered content-lease, leased-preparation, shared-client, add-on-lock, work,
and close markers with no direct `pool.connect`; the identity test now asserts
the exact sorted 15-table inventory and exact PostgreSQL carrier types,
including `uuid[]` and `xid8`. Their complete restored receipts are 5/5 and
4/4, and the full architecture suite passed 158/158.

The one authorized third full gate is the terminal full-suite receipt:

- command: `pnpm test --reporter=json --outputFile=/private/tmp/s10-third-full-final.json`;
- receipt: `/private/tmp/s10-third-full-final.json`;
- receipt SHA-256:
  `a1546a4ec279185267a444cc62915fea1d0cf114fad5a9692d3a08156b476bef`;
- files: 139/139 passed;
- Vitest suite counters: 400/400 passed;
- tests: 1,345/1,345 passed;
- failed, pending, and todo: 0/0/0;
- JSON elapsed time: 2,146.927 seconds;
- snapshots: no additions, removals, updates, or mismatches; and
- exit state: code 0, no remaining pnpm/Vitest process, monitor, or attached
  PTY.

Three PostgreSQL-client deprecation warnings about issuing `client.query()`
while a client was already executing appeared during the GREEN run. They did
not fail a test. They are a future pg@9 compatibility warning, not evidence of
an S10 privacy guarantee, and should be removed before a pg@9 upgrade.

After the terminal run, the frozen production hashes, repaired strict-test
hashes, and `git diff --check` remained unchanged. No commit, push, merge,
deployment, board transition, or reviewer invocation occurred as part of the
gate.
