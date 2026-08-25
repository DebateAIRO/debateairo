# T1 Claude Opus Rework7 draft — structural registration cap and bounded deadline

Date: 2026-08-22 (Europe/Bucharest)
Owner: Codex-Router / V
Intended author seat: one fresh visible Claude Opus 5 CLI terminal
Kanban: `accounts-phase1` / `t_b225b2f2`
Status: **V-APPROVED — AUTHOR LAUNCH AUTHORIZED AFTER CUSTODY RECHECK**

## 1. Approval gate

V approved all six terms below in the Codex thread on 2026-08-22 after they
were restated individually. Codex-Router must record that approval on Kanban
before launching the author seat:

1. hard registration availability means 100 eligible simultaneous register
   requests on the target host, healthy MTA, and an initially empty shared mail
   dispatcher; arbitrary concurrent resend occupancy is not part of this
   guarantee;
2. exactly 103 valid registration requests may hold the structural admission
   budget; the 104th is refused before repository/KDF/mail work;
3. registration-only mail-permit waiting may retain a validated registration
   request frame for at most 28 seconds instead of 18 seconds; resend retains
   the 18-second limit;
4. the gate is acquired synchronously before the first repository await, so up
   to 103 admitted requests can precede the per-source limiter lookup;
5. decision version 2's N*=3/430 ms and measured-capacity-103 claims become
   historical contradicted evidence; 45 ms remains provisional and there is no
   positive current N* until separately requalified;
6. registrations and resends continue sharing the 32-active/96-waiter FIFO, so
   28-second registration waiters can affect mixed-route availability; route
   partitioning is not authorized in Rework7.

V did not require hard 100 during arbitrary concurrent resend occupancy.
Rework7 therefore remains bounded to the approved scope above. Any later
route-partition/reservation design is a separate V-owned scope decision.

## 2. Binding evidence

Read completely:

- `logs/T1-final2-custody-progress.log`
- `logs/T1-recalibration1-progress.log`
- `logs/T1-deadline-diagnostic-progress.log`
- `logs/T1-deadline-diagnostic-repeat-1.log`
- `logs/T1-deadline-diagnostic-repeat-2.log`
- `logs/T1-deadline-diagnostic-repeat-3.log`

The three fresh diagnostic processes each completed 103 successes, commits and
sends with zero busy/unexpected results when only the test-local registration
wait ceiling was widened to 60 seconds. Reservation maxima were 20,922.9,
21,902.2 and 20,942.1 ms. The ruled candidate is:

```text
ceil_to_whole_second(1.25 * 21,902.2 ms) = 28,000 ms
```

The tightest observed margin at 28 seconds is 21.78%. This evidence supports a
28-second candidate only for the measured fresh-process, healthy-MTA,
initially-empty-dispatcher condition. It does not approve product bytes,
mixed-route isolation, N*=3, full-history timing, or release custody.

## 3. Frozen entry custody

Required HEAD:
`7918f4f8bff33909792afc01dc38d402972b4ccd`

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

Stop `CODEX BLOCKED (custody)` on any mismatch. Do not repair, clean, restore,
stage, commit, or touch unrelated dirt.

## 4. Allowed files

Product/policy:

- `apps/api/src/registration.ts`
- `apps/api/src/main.ts`
- `packages/register/src/auth-policy.ts`

Tests:

- `tests/unit/registration.test.ts`
- `tests/integration/registration-database.test.ts`
- `tests/architecture/t1-argon2-worker-contract.test.ts`

Mission evidence:

- `logs/T1-rework7-progress.log`
- complete raw focused/VR-10 logs and one-line raw status receipts named
  `logs/T1-rework7-*.log` / `logs/T1-rework7-*.status`
- `/tmp/t1r7/` may hold private byte backups and mutant working copies only;
  it is not durable evidence

Every other path is frozen. In particular, do not edit crypto worker/pool,
database identity/repository, API error mapping, mail transport, migrations, or
the shared resend queue structure.

## 5. Product contract

### 5.1 Structural registration admission

Add one process-owned `RegistrationService` admission budget with maximum 103.
It has no wait queue.

- Validate input shape and `sourceContext(rawSource)` synchronously first,
  preserving `AUTH_INPUT_INVALID` behavior and consuming no admission budget for
  invalid input or invalid source context.
- Acquire synchronously after that validation and before the first repository await,
  limiter lookup, audit/password KDF, mail reservation, token mint, or mutation.
- Request 104 receives the existing opaque retryable `AUTH_MAIL_BUSY` envelope
  and still traverses the existing 600 ms registration response clamp.
- The refusal performs no repository, limiter, audit KDF, password KDF, mail
  reservation, token mint, account mutation, send, or delivery audit. Emit only
  the existing opaque bounded capacity signal; never address/source material.
- Counter never exceeds 103 or underflows. Releasing a slot allows a later new
  request; requests refused at 104 are not queued by this gate.

Use one idempotent release closure. The token covers rate-limit work, shared
mail reservation, hashing, provisioning, response clamp, permit activation and
ownership transfer. Release only in an outermost `finally`, after the existing
handoff block has either:

- transferred successful postwork to `dispatchVerification`, or
- transferred failed/no-postwork reservation ownership to the bounded
  reservation-hold continuation.

Do not hold admission through actual transport or delivery audit after a
continuation owns that work. Do not release at commit, response creation, clamp
entry, or before handoff. When reservation ownership continues asynchronously
after a hash/audit failure, transfer the idempotent admission release atomically
out of the local `finally` and into exactly one reservation continuation:

- on reservation grant, the continuation must first call
  `dispatchMailReservationHold` synchronously so the hold promise is registered
  in `pendingMailDispatches`; only after that registration may it release the
  admission token, and it must not await the 5.1-second hold before releasing;
- on reservation rejection, the continuation releases the admission token in
  its own `finally`;
- normal success and synchronous provision/failure paths keep local ownership
  and release only after their dispatch/handoff block finishes.

The local and continuation owners must be mutually exclusive. Every
rejection/cancellation path settles exactly once with no unhandled promise.

### 5.2 Route-specific deadline

Make the shared reservation method accept an explicit named wait deadline.
Defaults and resend remain 18,000 ms. Registration alone passes 28,000 ms.

- Deadline timer removes the exact waiter object, clears itself on handoff, and
  leaves no queue node or retained request after settlement.
- A 28-second registration timeout remains typed `AUTH_MAIL_BUSY`, traverses
  the same clamp, cancels/clears unstarted password work and transfers any
  already-owned work safely.
- Do not change cadence 45 ms, resend cadence 60 ms, 32 active permits, 96
  shared waiters, 5.1/5.7-second reservations, 600 ms clamp, 5-second transport
  bound, KDF parameters, pool counts/caps/timeouts, or queue arbitration.

### 5.3 Admission shutdown/drain

Add an idempotent admission close-and-drain state:

- once closing begins, reject new registration admissions with a generic typed
  retryable failure;
- await the exact transition to zero admitted registrations;
- repeated/concurrent drains join one promise and do not underflow or hang;
- the real API shutdown order is admission drain, mail-dispatch drain,
  rate-limit/refusal-audit drain, audit hasher close, then Argon pool close;
- no registration may enqueue mail/audit work after the corresponding drain has
  returned.

The admission drain is a fail-closed join of in-flight ownership. Do not claim a
whole-request bound that does not exist: repository/transaction awaits have no
request-wide cancellation deadline, and the Argon worker timeout begins only
at dispatch. Rework7 must not invent DB/request cancellation semantics. T3 (or
the deployment shutdown owner) remains responsible for any outer process-level
shutdown budget and escalation policy.

### 5.4 Policy decision version 3

Publish a new versioned decision beside preserved v1/v2 evidence. The durable
shape may be minimally refactored, but all of these facts must be typed and
machine-readable:

- structural maximum concurrent registrations = 103;
- registration mail-permit wait deadline = 28,000 ms;
- shared/resend wait deadline = 18,000 ms;
- registration cadence = 45 ms, status provisional/recalibration-pending;
- scope = healthy MTA, target host, initially empty shared dispatcher,
  register-only simultaneous burst;
- mixed register/resend availability is not guaranteed by this decision;
- v2 N*=3, 430 ms, 35 ms and measured 103 remain historical observations but
  status is superseded/contradicted by unchanged-code RED evidence;
- current positive N* = none/null; historical N*=2 is not a fallback;
- diagnostic repeats and 20,922.9/21,902.2/20,942.1 ms maxima;
- retention disclosure: at most 103 admitted registration frames; at most 96
  shared mail-queue waiters; a queued registration frame may retain validated
  email, recovery email, password and source context for at most 28 seconds;
  no raw verification token is minted before mail grant.

Replace code/comments/tests that call 103 a measured exact capacity with the
structural admission-cap meaning. Do not delete or rewrite the underlying v1/v2
measurement arrays; retain them as history with honest status.

## 6. Mandatory RED-first tests

Before product edits, add non-vacuous tests and run the focused RED set. Preserve
raw output/status and exact reasons. Required mechanisms:

1. barrier-controlled valid requests prove 100 and 103 are admitted, request
   104 is refused synchronously, and 128/160 never exceed 103;
   invalid input and invalid source context consume no admission slot;
2. the 104th request invokes zero repository, limiter, password/audit KDF, mail
   reservation, token, mutation, send or audit operations;
3. 104th refusal still completes only after the 600 ms clamp and is
   byte/status-identical across address-existence arms;
4. exact-once release for success, duplicate, rate-limit refusal, immediate
   shared-queue full, 28-second timeout, hash failure before/after dispatch,
   audit failure, DB failure, clamp failure, handoff/continuation failure,
   cancellation and shutdown;
5. early release before clamp/handoff is caught; counter max/underflow and
   next-request admission are asserted;
6. registration timer is exactly 28 seconds while resend remains exactly 18;
7. exact waiter identity/timer cleanup, password clearing, no pregrant token,
   no unhandled rejection and no secret-bearing log;
8. admission drain prevents post-drain enqueue and proves the real shutdown
   ordering;
9. policy v3 is machine-readable, v2 is historical/contradicted, 45 ms is
   provisional and current N* is absent rather than silently falling back;
10. real PostgreSQL healthy-MTA bursts 100/103/104/128/160 produce structural
    successes 100/103/103/103/103, matching commits and sends, with every excess
    request typed busy and no unexpected error.

Use deterministic barriers for lifecycle logic; do not make a 28-second unit
test sleep in wall time. Real PostgreSQL timing evidence remains foreground and
fresh-process.

## 7. GREEN, calibration and regression gates

On stable candidate bytes, run in the foreground with complete receipts:

1. focused unit registration tests for admission/deadline/drain;
2. focused architecture shutdown/pool ownership tests;
3. real PostgreSQL Rework7 admission/capacity tests;
4. three consecutive fresh exact-candidate healthy-MTA bursts proving 100 and
   the structural cap 103 under the approved scope;
5. exactly one preconditioned full registration-file invocation, after the
   focused gates and three fresh burst repeats, preserving its natural file
   order and one shared process-owned pool:

   ```text
   node_modules/.bin/vitest run tests/integration/registration-database.test.ts
   ```

   Record complete output/status durably and do not rerun it on failure. No
   substitute or "bounded equivalent" is allowed without a V-approved packet
   amendment recorded on Kanban;
6. existing resend 18-second deadline/equal-arm test;
7. deep-queue, slow-transport, audit-KDF, heap/retention, shutdown/drain,
   timing-opacity/AUC/classifier and T9 deadlock regressions;
8. `pnpm typecheck`;
9. `pnpm lint`;
10. `git diff --check`.

N*=3 is not a Rework7 GREEN claim. Preserve its failing evidence and policy
supersession. Do not weaken existing privacy thresholds, 600/100/250 ms limits,
or deadlock gates to compensate. The repository-wide `pnpm test` remains
reserved for a later fresh final-custody seat after dual Sol approval.

## 8. VR-10 mutation requirements

At minimum, independently prove RED and exact restore for mutants that:

- remove/raise the 103 cap;
- acquire after the first repository await;
- release at commit or before clamp/handoff;
- release before an asynchronously granted reservation hold is synchronously
  registered in `pendingMailDispatches`;
- retain admission through the actual 5.1-second reservation hold after that
  hold has been registered;
- make release non-idempotent;
- use 18 seconds for registration;
- use 28 seconds for resend;
- leave a timed-out waiter/password retained;
- reorder shutdown so mail drain precedes admission drain;
- keep v2 marked CURRENT or publish a positive current N*;
- derive capacity from observed completion rather than the structural counter.

A zero-test match, generic compiler failure, timeout, survivor, missing receipt
or non-byte-identical restore is a hard stop.

## 9. Handoff and hard stops

Finish `REWORK READY FOR PEER REVIEW` only when all authorized focused/static
gates and mutants are green/RED as required, final HEAD/index/custody is exact,
and the diff is limited to the six allowed files. Otherwise finish
`CODEX BLOCKED (...)` with the first exact blocker.

- Do not stage, commit, push, move Kanban Done, or run the full suite.
- Do not use Grok, Hermes model, Fable, local model, or any nested agent.
- Do not touch repository-parent `.claude/launch.json`, repository-parent
  `.gitignore`, `logs/run-claude-seat.sh`, or the observability-loop mission.
- Do not partition routes, add a worker, change RSS bounds, alter KDF parameters,
  weaken privacy/timing thresholds, or claim N*=3 in this packet.
- Remain in the visible terminal until every foreground child exits and the
  final custody receipt is written.
