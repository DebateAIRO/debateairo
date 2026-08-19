# S3b Grok-lens verdict

**GREENLIGHT**

Ticket t_3f2a4c64 / S3b registration durability. Blind lens: this file does
not cite or open the other diamond. Scope authority is
`reviews/S3b-review-packet.md` only, with `logs/S3b-packet.md` as the
author's contract text. True change set is from `find -mmin` and `stat`
(not `git diff` as the oracle). Aug-17 rename churn, `node_modules`,
`.next`, `.pgdata`, and toolchain symlink noise are ignored. Author
progress-log numbers are claims; live numbers below were produced by this
lens against real embedded PostgreSQL 18. Temporary VR-10 mutants were
applied on the working tree and restored to the pre-mutant sha; no
product/test file is left edited; nothing was committed.

## Live mtime inventory (S3b)

First `stat` at 23:38 EEST, 2026-08-19. After VR-10 restore, `registration.ts`
and `identity.ts` were recopied with **identical sha256**; content did not
change.

S3b product / test set (inside the packet file contract):

| mtime (EEST) | path |
|---|---|
| 23:21:46 | `tests/integration/registration-database.test.ts` |
| 23:24:35 (later recopy 23:52:50, sha `9ea1917a…`) | `apps/api/src/registration.ts` |
| 23:25:30 (later recopy 23:53:13, sha `b3de3f41…`) | `packages/db/src/identity.ts` |

Packet-allowed but **not** in the S3b window:

| mtime | path | note |
|---|---|---|
| 15:19:59 | `apps/api/src/index.ts` | route/`AuthFlowError` mapping unchanged; 503 already follows `statusCode` |
| 20:01:45 | `tests/unit/registration.test.ts` | not in-window |
| 22:23:19 | `migrations/0032_registration_audit_erasure_checks.sql` | S3a; sha `bdf5c856…` unchanged |

Out of contract / frozen (S3 rework-4 cluster ~20:06, or earlier):

| mtime | path |
|---|---|
| 12:42:11 | `migrations/0030_identity_foundation.sql` |
| 20:06:46 | `migrations/0031_registration_verification.sql`, `packages/db/src/schema.ts`, `packages/crypto/src/index.ts`, `apps/api/src/mail-channel.ts`, `packages/register/src/auth-policy.ts` |
| 20:11:11 | `tests/integration/identity-database.test.ts` |

Docs in the same hour (`S3b-packet.md` 22:55, progress log 23:33, review
packet 23:35) are not product. Scope **holds**: no 0032/UA/`requestedAt`
behaviour rewrite, no rate-limiter policy rewrite, no mail-channel touch,
no crypto or identity-schema foundation edit. `identity.ts` changes are
repository-boundary normalisation, the duplicate-path equal-work round
trips, `recordRegistrationFailure`, and the `beforeCommit`/COMMIT shape.

## Live gates (current restored tree)

| command | capture | claimed | observed |
|---|---|---|---|
| `pnpm typecheck` | `{SCRATCH}/pnpm-typecheck.log` | (author green) | `tsc --noEmit` exit 0 |
| `pnpm test` | `{SCRATCH}/pnpm-test.log` | 110 files / 792 tests | **112 passed / 798 passed**, exit 0 |
| `pnpm lint` | `{SCRATCH}/pnpm-lint.log` | 28 edges / 0 violations | **edgeRowsChecked 28, violations []**, source `blocking: []`, exit 0 |
| registration Postgres file | `{SCRATCH}/registration-postgres.log` | 26/26 and 5 S3b cases | **1 file, 26 passed**, exit 0 |

Author log numbers are not taken from the progress log. The extra two
files / six tests vs the author's 110/792 count are additional passing
tests on this tree, not a failed S3b gate.

A first full-file run in this session failed the normalisation case with
`CRYPTO_KEY_INVALID` on blank IP (1 failed / 25 passed, VR-3 then
`audit_rows=425`). An isolated re-run of that case and a second full-file
run both passed (26/26, VR-3 `audit_rows=426`). Mutant (c) reproduces the
exact first-run error when `appendAudit` skips normalisation, so the first
run was a stale module graph, not a hole in sha `b3de3f41…`. Canonical
live evidence is the second full-file capture.

## VR-10 — three packet-named mutants (independent RED)

Each mutant broke the shipped implementation, ran the guarding test, then
restored the backup sha.

1. **Return before commit.** `register` fired `provisionPendingAccount`
   without `await`. Commit-gate **FAIL**:
   `settled_while_commit_blocked=1 committed_before_release=0
   committed_at_response=0` (`expected 1 to be +0`). Capture:
   `{SCRATCH}/mutant-a-precommit.log`.
2. **Remove the 600 ms product clamp** (`holdRegistrationEnumerationClamp`
   no-op). Timing **FAIL**: `expected 86.093… to be greater than or equal
   to 580` (`clampMs - 20`). Capture: `{SCRATCH}/mutant-b-clamp.log`.
3. **Bypass `sourceContext` normalisation in the writer** (`appendAudit`
   hashes `event.source` raw). Normalisation **FAIL**:
   `CryptoInputError: CRYPTO_KEY_INVALID`. Capture:
   `{SCRATCH}/mutant-c-sourcecontext.log`.

The extra eight “killed mutants” in the progress log were **not**
independently reproduced here. The three packet-named breaks are the gate
and all three went RED.

## Findings

1. **Durability — 2xx only after COMMIT; 100/100 burst; in-process Set
   gone. HOLD.**
   `register` awaits `provisionPendingAccount` through
   `createPendingAccount` (`apps/api/src/registration.ts:482-484`) and
   only then `return REGISTRATION_PUBLIC_RESPONSE` (`:500`). The
   repository `transaction` COMMITs after the operation returns
   (`packages/db/src/identity.ts:85-91`); `beforeCommit` (DEK store) runs
   **inside** the open transaction, before `appendAudit` and COMMIT
   (`:226-236`). The JS `finally` then holds the clamp (`registration.ts:501-506`),
   so the promise cannot settle before COMMIT.
   There is no `pendingRegistrationDispatches` field and no unbounded
   `Set` of pending accounts; the only process-local `Set` is
   `pendingMailDispatches` of mail promises (`:238`), which is S3d.
   `PendingRegistration` (`:214-221`) is a per-call stack object for the
   in-flight provision, not a retained collection.
   **Live:** `[S3b COMMIT GATE] settled_while_commit_blocked=0
   committed_before_release=0 committed_at_response=1`;
   `[S3b DURABILITY BURST] concurrent=100 successes=100
   committed_at_response=100`. The test also asserts
   `hasOwnProperty("pendingRegistrationDispatches") === false`
   (`tests/integration/registration-database.test.ts:407`).

2. **Oracle closed by EQUAL WORK plus a product clamp, with genuine
   overlap at N=1/4/8. HOLD.**
   The ruled clamp lives in product code, not only tests:
   `holdRegistrationEnumerationClamp` sleeps until
   `enumerationResponseFloorMs + enumerationToleranceMs` (500+100=600)
   (`registration.ts:268-273`, invoked at `:503`). Duplicate and new
   branches both hash the password (`:480`) and both enter
   `createPendingAccount`; the duplicate path performs dummy
   `UPDATE … SET state=state` round trips on user and both channel
   bindings then `appendAudit` (`identity.ts:185-206`), so IP/UA Argon2id
   and `pg_advisory_xact_lock('identity:audit-chain')` still run
   (`:103-107`). The S3b timing assertion requires `overlapMs >= 0`,
   `medianGapMs <= 100`, and `min >= clampMs - 20`, plus three DENY
   registration audits per existing address
   (`registration-database.test.ts:873-876`).
   **Live** (`clamp_ms=600`, `genuine_range_overlap=true`):

   | N | overlap_ms | median_gap_ms | existing (ms) | missing (ms) |
   |---|---|---|---|---|
   | 1 | 0.9 | 1.2 | 601.5, 602.4, 601.5 | 605.3, 600.8, 602.7 |
   | 4 | 1.6 | 0.5 | 601.3–603.1 cluster | 600.7–603.5 cluster |
   | 8 | 10.7 | 2.3 | 607.1–617.8 | 605.2–621.0 |

   N=1/4 are clamp-dominated; N=8 still overlaps. This is overlap, not a
   `gap <= 100ms` classifier fuse. Removing the clamp dropped min time to
   86 ms (mutant b).

3. **Failures are honest: typed 503, correlated audit, no account. HOLD.**
   Provision errors are caught (`registration.ts:485-498`), logged as
   `[AUTH_REGISTRATION_PROVISION_FAILED] correlation=<uuid> code=PROVISION_FAILED`
   with no email/IP/UA, written via `recordRegistrationFailure` in a
   **fresh** transaction (`identity.ts:443-458`, event
   `identity.registration.failed`, `actorToken = correlationId`), then
   thrown as `AuthFlowError("AUTH_REGISTRATION_FAILED")` whose
   `statusCode` is 503 (`registration.ts:53-55`). `index.ts:184` already
   maps that to HTTP 503 without an S3b edit.
   **Live:** `[S3b FAILURE HONESTY] typed=AUTH_REGISTRATION_FAILED
   status=503 correlation=fdd61679-5e61-4ce0-bbea-1441b937e657
   audit_rows=1 accounts=0`.

4. **Repository-boundary normalisation is structural. HOLD.**
   Every audit write funnels through `appendAudit`, which calls
   `normalizeAuditSourceContext` **before** hashing
   (`identity.ts:58-68`, `:102-106`). Empty/whitespace IP, UA, and
   request id become `"unknown"` at the repository, so a writer that
   bypasses route-level `sourceContext` (`registration.ts:223-233`) still
   cannot feed a blank string into `hashAuditSourceIp` /
   `hashAuditUserAgent` (which still throw `CRYPTO_KEY_INVALID` on empty,
   `packages/crypto/src/index.ts:365-370`, frozen). Hashing remains inside
   the transaction, so a throw still rolls back (`identity.ts:85-94`).
   **Live:** `[S3b REPOSITORY NORMALISATION] bypass=sourceContext
   blank_ip=unknown blank_ua=unknown audit_rows=1`. Mutant (c) skipping
   that call goes RED with `CRYPTO_KEY_INVALID`.

5. **No regression: S3a timestamps, VR-3 erasure, S3c/S3d untouched. HOLD.**
   `requestedAt` is still snapshotted at intake (`registration.ts:448`)
   and used for `adultAffirmedAt`, `occurredAt`, and
   `verificationExpiresAt` (`:375-398`), not drain/commit time.
   **Live:** `[S3a A3 RED/GREEN] concurrent=4 drain_delay_ms=12700
   max_request_timestamp_drift_ms=0`. S3a A2 still clamps blank UA at
   `sourceContext` (empty and whitespace variants
   `audit_rows=4 normalized=unknown`).
   **VR-3 live:** `[S3 VR-3] audit_rows=426 forbidden_matches=0
   actor_ciphertext_nonnull=0 chain_valid=true` — matches the author's
   426/0 claim on the 26/26 run.
   Frozen mtimes: 0032 sha `bdf5c856…`, crypto `30df2812…`, mail-channel
   `7e35e6f8…`, schema `4351de21…`, `index.ts` `d6863247…`, auth-policy
   20:06:46. Rate-limiter **class** still lives in `registration.ts`
   (co-located; S3c is a later ticket) and mail remains
   fire-and-forget after the clamp (`:349-358`, `:505`).

## Residuals (do not lift a BLOCK; already GREENLIGHT)

- Mail delivery is still dispatched after the 2xx (`dispatchVerification`
  in `finally`). That is the frozen S3d surface; this ticket prohibited
  non-durable **account** persistence, not the mail channel.
- `InProcessAuthRateLimiter` still keys buckets on plaintext IP
  (`registration.ts:188`) and `RefusalAggregate` retains `source`. That
  is the frozen S3c limiter, not an S3b unbounded registration Set.
- Per-request `PendingRegistration` still carries plaintext email /
  recovery email / source on the stack for the duration of the awaited
  COMMIT. It is not retained in a process-local collection after return.
- N=1/4 overlap is created mostly by the 600 ms clamp; equal-work dummy
  updates matter once work exceeds the clamp (N=8 spread 605–621 ms).
  The packet required a product clamp **and** overlap; both are present.

No commit or push was performed.
