# T1 Rework8 — admission/KDF custody and evidence correction

## 1. Sole authority and role

You are the sole fresh visible Claude Opus 5 author for T1 Rework8. This packet
incorporates two independent GPT-5.6 Sol xHigh `CHANGES REQUESTED` verdicts on
the frozen Rework7-A candidate.

Work only in:

`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`

Do not use the Hermes scratch workspace. Do not launch nested agents, Grok,
Hermes model, Fable, or local models. Hermes CLI may be used only as the Kanban
client. Do not stage, commit, push, move the ticket to Done, or run repository-
wide `pnpm test`. Do not edit or execute the retired three-worker A/B artifacts.

The six user/V-approved Rework7-A terms remain binding without amendment:

1. hard 100 is scoped to eligible simultaneous registrations on the target
   host, healthy MTA, and an initially empty shared dispatcher; arbitrary
   concurrent resend occupancy is excluded;
2. structural cap is exactly 103 and the 104th valid request receives the early
   opaque busy response before repository, KDF, limiter, token, or mail work;
3. registration waits 28,000 ms for the shared mail permit while resend remains
   18,000 ms; a validated registration frame may remain retained for 28 seconds;
4. admission is acquired synchronously after input/source validation and before
   the first repository await or per-source limiter work;
5. v2 N*=3/430ms/measured-exact-103 is contradicted historical, 45ms remains
   provisional, and current positive N* is none;
6. the shared FIFO remains 32 active plus 96 queued; mixed-route availability is
   not guaranteed and no partition is authorized.

## 2. Entry custody

Required HEAD:

`7918f4f8bff33909792afc01dc38d402972b4ccd`

Required index: empty.

Required entry manifest:

```text
0172fc7e1dd44de560d467743f3e5ab7f6406bf52a5bbb302dd68685d64d679a  apps/api/src/index.ts
91bf0e695ef847b0864bedd030c2ed94f4431d3864fa5e5a7e540aeec011342b  apps/api/src/main.ts
5069ab7acf78c9fec7179b36695ff54a2b9f9b478417ce0598b31bb08365309e  apps/api/src/registration.ts
66b20d2170a35667e75e4ba15e8adc016d44d252958527e2877b99bf9f6871e6  packages/crypto/src/index.ts
c610b06ee13a87ec8d9a47c88b552edb5398b30cd9b49509d547eda36fdcb11b  packages/crypto/src/argon2-worker.ts
b990c3f866f9697b158e4040ffd9bb832341e31853a40d30e70deb57394c526d  packages/crypto/src/argon2-worker-pool.ts
2d92223b58c6f1af7c6b9bc544df5f2518e8e20404bf982fbabb0a50bc90e17f  packages/db/src/identity.ts
f8e406f1cd35393aa20eac5ef5679ed31dd8f9213ee2c727a5aacd9d706a4216  packages/register/src/auth-policy.ts
956554377863df933955b0bf1b7cb9d5975cc371094fb86dad98b98cc05c45a9  tests/integration/registration-database.test.ts
cf05986d0d78c68315cca2775efcb66b4076b026ad777f59a15acbd30362cb2f  tests/unit/registration.test.ts
93f1a3357ffe5b45fac047f77c16c9ae80322123a3eff97c30a7d7e7d2afb55b  tests/unit/argon2-worker-pool.test.ts
4896587d1fafc0d52c2389c3bd6336a05798ea1a89cadaa42280b6a0039fb18d  tests/architecture/t1-argon2-worker-contract.test.ts
```

Before any edit, verify HEAD, empty index, all 12 hashes, no live prior Claude,
Vitest, mutation supervisor, or Router full-file child, and read this packet plus
the following evidence completely:

- `logs/T1-claude-rework7-draft-packet.md`, sha256
  `72e6505c632e6e743e15c63459d81cf5125ba050a4e8e64c37b69c050696bfa8`;
- `logs/T1-claude-rework7-recovery2-packet.md`, sha256
  `635efdf89f5b57a9931d325bbcae17b9e9bf0451fca74eab017d2a12b86b2656`;
- `logs/T1-rework7-progress.log`, especially lines 475-674;
- `logs/T1-rework7-router-full-registration.log` and `.status`.

The Router full-file receipt is accepted historical Rework7 evidence: one exact
invocation, 56/56, raw status 0, 1519.22 seconds, all 12 post-hashes exact. Any
Rework8 product/test change invalidates it for final custody and requires one new
exact Router run after your handoff.

## 3. Authorized write scope

You may edit only:

- `apps/api/src/registration.ts`;
- `tests/unit/registration.test.ts`;
- `tests/integration/registration-database.test.ts`;
- new or existing `logs/T1-rework8-*` evidence and this mission's Rework8
  progress appendices.

All other governed files are frozen. If a correct repair requires changing
`main.ts`, the Argon2 worker pool, policy, database, public API, queue sizes,
timeouts, or the six approved terms, stop with `CODEX BLOCKED` and explain why.
Preserve all unrelated dirty worktree content.

## 4. Binding review findings

### F1 — started KDF outlives admission ownership (P1)

`scheduleRegistrationHash` marks work started before submitting it
(`registration.ts:631-656`), and `cancel()` is then a no-op
(`registration.ts:667-673`). If the 28-second reservation rejects first,
`Promise.all` catches, calls ineffective cancellation, transfers admission
ownership, and the reservation rejection continuation releases immediately
(`registration.ts:1307-1332`). The already-submitted credential job may still be
queued or active in the frozen worker pool, whose execution timeout starts only
at dispatch. Password work and its secret-bearing closure can therefore outlive
the 103 admission owner, while shutdown may pass admission drain before pool
close.

Smallest authorized product rule: if reservation failure races already-started
password work, observe and await that password-work settlement before releasing
the admission token. Preserve the original opaque public failure and consume any
losing KDF rejection so there is no unhandled rejection. If password work is
still locally queued and `cancel()` succeeds, remove it, clear its password
reference, settle it, and release only after that settlement is observed.
Admission drain must not resolve while either form of secret-bearing work owned
by the registration remains outstanding.

### F2 — queued password cancellation is unproved (P1)

The Rework7 timeout test runs one registration with 32 hash slots, so its hash
starts immediately. The retained-state helper cannot see Promise/function
closures. Existing M11 mutates mail-waiter removal and fails on queue counts; it
does not mutate or prove `waitingRegistrationHashes` removal/password clearing.

Add a deterministic test that first saturates all registration-hash slots, then
queues a password hash, forces the shorter test-only mail reservation deadline,
and proves before release that the target hash was genuinely queued. After the
opaque timeout it must prove:

- the target hash start closure was removed and never executed;
- its password reference was cleared through an observable test seam/counter,
  not a shallow object-property scan;
- the mail waiter and its deadline timer were removed;
- repository, limiter-after-admission, token, mutation, mail and target hash work
  did not occur for the timed-out target beyond the already-ruled validation /
  pre-race work;
- admission counts are exactly one grant/one release for the target and drain
  reaches zero;
- no unhandled rejection or secret/address log appears.

Add a separate deterministic started/deferred-KDF race test: make the password
KDF start and remain unresolved, force reservation rejection, assert the public
attempt may settle opaque but admission occupancy stays held and
`drainRegistrationAdmissions()` stays pending until the KDF is explicitly
settled, then assert exact one release and zero work/secret retention after
settlement. Do not use real time or a hostile KDF.

### F3 — M15 mutates reporting, not capacity enforcement (P1 evidence)

The final M15 changed only `registrationAdmissionOccupancy().admitted` to
`pendingMailDispatches.size`; actual enforcement at `registration.ts:547-552`
still used `registrationAdmissionsHeld`. It therefore proves introspection, not
the required rejection of completion-derived capacity.

Replace M15 with a real mutation of the acquisition predicate/capacity decision
so admission is derived from observed completion/pending-dispatch state instead
of the structural held counter. The exact gated 104th/no-work and burst tests must
fail with crisp intended assertions. The mutation must select tests, compile,
execute, fail for the intended capacity consequence, and restore exactly.

Keep the existing occupancy readout assertion in GREEN; do not claim the retired
M15 receipt as a capacity mutant.

### F4 — capacity margin label uses the wrong deadline (P2)

`tests/integration/registration-database.test.ts:2892-2893` calculates
`queueDeadlineMarginMs` against the shared 18-second deadline even though every
admitted registration arms 28 seconds. Rework7 progress honestly disclosed this
at lines 612-616, but the published metric remains misleading.

Rename the existing value explicitly as the shared-18-second diagnostic margin.
Add a separately named registration-28-second margin calculated from
`registrationMailDispatchQueueWaitTimeoutMs`, assert it is positive for every
admitted burst, and print both names/values. Do not raise a threshold or change
the runtime deadline.

## 5. RED-first contract

Before changing product code:

1. add the deterministic started/deferred-KDF reservation-rejection lifecycle
   test and run its exact title on entry product bytes; it must RED because
   admission/drain releases before KDF settlement;
2. add the saturated-hash-queue cancellation/secret-cleanup test and run its
   exact title; it must either RED on the missing observable/cleanup contract or
   establish the existing path only if all non-vacuity assertions genuinely run;
3. add/adjust the integration metric assertions so the old ambiguous output is
   rejected or the new required fields are absent on entry test bytes;
4. durably record commands, selected test counts, raw statuses, intended failure
   lines, HEAD/index/hashes, and no concurrent heavy process.

Do not credit compiler errors, zero-test matches, timeouts, or generic crashes as
RED.

## 6. GREEN and lifecycle acceptance

Implement the smallest F1 repair without changing the six approved terms.
Required GREEN assertions include:

- already-started/deferred KDF keeps one admission owner and keeps admission
  drain pending after reservation rejection until KDF settlement;
- queued/unstarted KDF cancellation removes exactly that queue node, prevents
  target hashing, clears the target password reference observably, consumes the
  cancellation rejection, and releases exactly once;
- reservation late-grant and late-reject ownership still register any hold in
  the drained pending set before release and never double-release;
- normal success, repository failure, limiter refusal, KDF failure, mail timeout,
  shutdown closing, and four-call release idempotence paths retain their prior
  exact semantics;
- 104th valid request still performs no repository/KDF/limiter/token/mail work;
- registration uses 28 seconds, resend uses 18 seconds, FIFO stays 32/96;
- new 28-second margin is positive and the 18-second value is clearly labelled
  diagnostic only.

## 7. VR-10 rework

Reuse the recovery2 per-mutant foreground fail-closed supervisor design: fresh
verified backup, trap before mutation, terminate/reap test group first,
unconditional `cp -p` restore second, sha/size/mtime/cmp verification, and unique
receipt tags. No background monolithic driver and no overlapping mutants.

On the final test bytes, run the complete Rework7 set again with these changes:

- retain the mail-waiter-removal mutant under its honest description;
- add a distinct mutant deleting/bypassing queued password-hash removal and/or
  password-reference clearing at `registration.ts:667-673`; its new saturated
  queue test must kill it crisply;
- replace old M15 with the real acquisition-predicate/completion-derived-capacity
  mutant from F3;
- add a mutant releasing admission immediately on reservation rejection without
  awaiting already-started KDF settlement; the deferred-KDF/drain test must kill
  it crisply.

Every mutant must select at least one test and be killed by intended assertion
failures. Timeout-only, compiler-only, zero-test, signal-only, or harness-only
failures are invalid. Preserve the old M15 receipt as superseded history; do not
overwrite it. Finish with zero survivors and byte-exact restoration.

## 8. Required focused and capacity gates

After GREEN and final VR restoration, run in foreground with durable raw logs and
statuses:

1. the complete Rework8/Rework7 unit lifecycle title set on final bytes using the
   original unbounded GREEN command;
2. the complete T1 architecture title set, even though architecture bytes are
   frozen;
3. three distinct fresh-process exact-title runs of
   `S3d rework7 B4 measures healthy-MTA availability against the structural 103 cap`.

Each capacity repeat must independently assert and report:

- 100 and 103 success/commit/send exactly, zero busy;
- 104/128/160 exactly 103 success/commit/send and 1/25/57 typed busy;
- peak admitted exactly 103 above cap and admitted-after-drain zero;
- every admitted registration armed 28,000 ms, never 18,000 ms;
- explicitly named positive registration-28-second margin;
- explicitly named shared-18-second diagnostic margin;
- no unexpected error, unhandled rejection, orphan or byte drift.

Then run `pnpm typecheck`, `pnpm lint`, and `git diff --check` with durable status.

## 9. Full-file and final custody handoff

The exact preconditioned full-file command remains:

```text
node_modules/.bin/vitest run tests/integration/registration-database.test.ts
```

It takes about 25 minutes and the Claude Bash lane is known to cap at 600 seconds.
Do not launch it into a lane that cannot hold it, do not substitute a focused
equivalent, and do not rerun historical receipts. If all preceding gates are
green, hand this exact command back to Router as `ROUTER FULL SUITE REQUIRED`.
Router will run it once in the sole visible controlled lane before fresh reviews.

Before handoff:

- all author/test/mutant children must be gone;
- HEAD must remain exact and index empty;
- record sha256/size/mtime for all 12 governed paths;
- enumerate exactly which allowed paths changed from entry;
- verify all frozen governed paths are entry-exact;
- append a complete honest Rework8 progress/handoff receipt and Kanban comment;
- do not stage, commit, push or move Done.

Return only one terminal marker after all children exit:

- `ROUTER FULL SUITE REQUIRED` when all author-side gates are green;
- `REWORK READY FOR PEER REVIEW` only if Router explicitly waives the full-file
  handoff (not currently authorized);
- `CODEX BLOCKED` with exact evidence if a required gate fails or scope must
  expand.
