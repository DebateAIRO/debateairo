# GPT-5.6 Sol xHigh — T9 implementation-packet audit

Date: 2026-08-21
Ticket: `t_6ff49601`
Disposition: valid and urgent; do not launch until S3d custody resolves

## Board and evidence state

The card is `ready` and `[unassigned]`, with no body, comments, typed state, or
file contract. Durable reproduction evidence is in
`reviews/S3c-r1-opus-verdict.md`: 7/32 `40P01` deadlocks at both the candidate
20-minute cooldown and HEAD's 60-second cooldown; the HTTP existing-address arm
returned 8/32 untyped 500s versus 0/32 for missing addresses. S3d freezes and
excludes T9 rather than resolving it.

## Required contract

Risk tier: high.

Allowed writes only:

- `packages/db/src/identity.ts`
- `tests/integration/registration-database.test.ts`
- `docs/missions/2026-08-17-accounts-privacy-security/logs/T9-progress.log`

Read-only inputs include the API/error boundary, registration/mail/policy code,
migration 0033, identity and registration unit/integration support, mission
amendments/plan, the S3c reproduction verdict, and every T9 ticket comment.
Everything else is forbidden. API behavior, mail scheduling, policy values,
migrations/schema, dependencies, and timeouts remain frozen. SHA-256/mtime is
the change-set oracle; `git diff` alone is insufficient.

The two writable product/test files must enter from the completed S3d bytes:

- `packages/db/src/identity.ts`: `c57266d3bb8314ca63d5635db88057ec0d5aa20dc319546c49735725572e9c5b`
- `tests/integration/registration-database.test.ts`: `d51af60a81e80326bdb806ab74ebcb3cd51ca1eb7eaac95f31f1f179779e59be`

## Reproduce-first proof

Add one anchored real-PostgreSQL HTTP integration test before editing product
code:

1. Seed one pending account and fully drain its registration delivery.
2. Advance the test clock by the real ruled resend cooldown plus 1 ms.
3. Block the first existing-account resend transport after entry, then launch
   31 more requests against the same address with unique injected remote IPs.
4. Release the sender so the async `recordVerificationDelivery` competes with
   the real `prepareVerificationResend` transactions.
5. Exercise `POST /v1/auth/resend-verification` through `api.inject`, recording
   status, exact body, elapsed time, and rejection.
6. Measure `pg_stat_database.deadlocks` for `current_database()` before/after.
7. Run the paired 32-request missing-address arm with unique IPs.

Permanent assertions: both arms are 32/32 exact opaque 202 responses; no
`INTERNAL_ERROR`; no rejected promise; deadlock delta zero. The current code
must first make the test RED with at least one existing-arm 500/`40P01`; do not
hard-code the historical 7–8 incidence.

Non-vacuity checks must prove all requests reached resend preparation, exactly
one eligible resend mail/credential exists, the existing audit arm contains one
ALLOW plus 31 cooldown DENYs, the missing arm contains 32 DENYs, no rate limit
intervened, the audit chain has one root and covers every row with `verifyChain`
true, and prior valid verification credentials retain S3d semantics.

If three isolated, correctly gated attempts cannot reproduce the real defect,
stop rather than injecting an artificial error or weakening the assertion.

## Minimal fix boundary

Preferred first attempt: change only `recordVerificationDelivery` so it takes
the same row locks in the same explicit order as `prepareVerificationResend`:

```text
channel_binding c → identity.user u → identity:audit-chain advisory lock
```

Replace its user-only `FOR UPDATE` followed by the implicit channel update/lock
with one real join locking `c,u` together, then keep the existing state update
and audit append. Preserve actor-token lookup, not-found behavior, the enclosing
transaction, row locks, audit advisory lock/KDF, append-only chain, cooldown,
one-send behavior, and token lifecycle.

Forbidden compensations: catching/translating `40P01`; retries; `SKIP LOCKED`;
`NOWAIT`; swallowing delivery/audit failures; moving audits or mail transport
across transaction boundaries; global serialization at generic transaction
entry; changing Fastify error handling; changing timeouts/policy/schema.

Add a focused concurrent verify-versus-resend check. If the local alignment
exposes a wider inversion with `consumeVerification`'s `token,c,u` order, stop
for a bounded design packet rather than refactoring the whole identity layer.

## Equivalence gate

After the deterministic race is green, run a separate mixed contention window
with n=32 per arm, alternating labels and unique IPs. Calibrate AUC and the best
single-threshold classifier against 2,048 deterministic same-arm relabelings at
the exact group size 32. Assert the null group size, both cross-arm metrics at
or below their null q99, both derived ceilings below 1.0, and a separated-series
positive control at 1.0 that exceeds both ceilings. Retain the ruled 100 ms
median-gap assertion only as a secondary policy check.

Do not use fixed 0.8, `null + 0.10`, half-sized nulls, separate temporal waves,
shorter timeouts, or any post-hoc tolerance.

## VR-10 campaign

Each mutant runs alone, must go RED, and is restored/hash-checked:

1. Restore old delivery `u → c` locking.
2. Remove resend-preparation `FOR UPDATE`.
3. Remove the cooldown predicate from the send decision.
4. Remove/change this path's audit advisory-lock acquisition.
5. Add branch-only work while existing-account locks are held.
6. Calibrate the null at 16 instead of 32.
7. Make all injected requests share one IP.

A GREEN mutant is a harness defect and blocks handoff.

## Gates and stop conditions

Run the focused T9 test RED→GREEN, then three consecutive clean repetitions;
relevant resend/cooldown, S3c victim-cap, S3d D2/D3/D4, concurrent
verify/resend, identity integration, registration unit, typecheck, lint, diff
check, hash/mtime scope audit, and residue scan. Only then run `pnpm test` on the
sole-heavy lane, followed by typecheck/lint/frozen-hash verification again.

Stop if S3d remains unresolved; the card lacks installed authority/contract;
entry gold differs; the real defect cannot be reproduced; scope must widen; the
local lock-order change does not remove both HTTP failures and database
deadlocks; verify/resend reveals a wider graph; a threshold must be loosened;
any mutant stays green; audit/cardinality/send/token/equivalence assertions
fail; a frozen hash changes; or the full suite is not green.

No files, tests, board state, terminals, commits, or pushes were changed by the
audit seat itself.
