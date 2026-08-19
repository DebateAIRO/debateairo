# S3a Grok-lens verdict

**GREENLIGHT**

Ticket t_7fb9880c / S3a surgical fixes A1–A3. Blind lens: this file does
not cite or open the other diamond. Scope authority is
`reviews/S3a-review-packet.md` only. True change set is from `find -mmin`
and `stat` (not `git diff` as the oracle). Aug-17 rename churn,
`node_modules`, `web/.next`, `.pgdata`, and toolchain symlink noise are
ignored. Evidence trail files were treated as claims. Temporary VR-10
mutants were applied on the working tree and restored; no product/test
file is left edited; nothing was committed.

## Live mtime inventory (S3a)

First `stat` at 22:22 EEST, 2026-08-19, then re-checked after restore.
`0032` / `registration.ts` were recopied during this review with
**identical sha256**; content did not change.

S3a product / test set (inside the packet file contract):

| mtime (EEST) | path |
|---|---|
| 22:10:09 (later recopy 22:23:19, sha `bdf5c856…`) | `migrations/0032_registration_audit_erasure_checks.sql` |
| 22:13:18 (later recopy 22:24:26, sha `3c819201…`) | `apps/api/src/registration.ts` (`sourceContext` + `requestedAt` plumbing) |
| 22:14:10 | `tests/integration/registration-database.test.ts` |

Packet-allowed but **not** in the S3a window:

| mtime | path | note |
|---|---|---|
| 15:19:59 | `apps/api/src/index.ts` | `sourceFor` unchanged; blank UA still passed through |
| 20:06:46 | `packages/crypto/src/index.ts` | S3 rework-4; blank-hash guard still throws |

Out of contract / not S3a (S3 rework-4 cluster ~20:06, or earlier):

| mtime | path |
|---|---|
| 12:42:11 | `migrations/0030_identity_foundation.sql` |
| 20:06:46 | `migrations/0031_registration_verification.sql`, `packages/db/src/identity.ts`, `apps/api/src/mail-channel.ts` |
| 20:01:45 | `tests/unit/registration.test.ts` |
| 20:11:11 | `tests/integration/identity-database.test.ts` |

Docs in the same hour (`S3a-packet.md` 21:59, `AMENDMENTS.md` 21:58,
progress log 22:17, review packet 22:18) are not product. Scope **holds**:
no S3b durability rewrite, no S3c limiter rewrite, no S3d mail-channel
touch, no crypto/identity-schema foundation edit. Fire-and-forget
`dispatchPendingRegistration` (`registration.ts:354-363`) is still
present.

## Live gates (current restored tree)

| command | capture | claimed | observed |
|---|---|---|---|
| `pnpm test` | `{SCRATCH}/pnpm-test.log` | 110 files / 787 tests | **110 passed / 787 passed**, exit 0 |
| `pnpm lint` | `{SCRATCH}/pnpm-lint.log` | 28 edges / 0 violations | **edgeRowsChecked 28, violations []**, source `blocking: []`, exit 0 |
| registration Postgres file | `{SCRATCH}/registration-postgres.log` | 21/21 | **1 file, 21 passed**, exit 0 |
| `pnpm typecheck` | `{SCRATCH}/pnpm-typecheck.log` | (author green) | `tsc --noEmit` exit 0 |

Author log numbers match these captures. They are not taken from the
progress log.

## VR-10 — four packet-named mutants (independent RED)

Each mutant broke the shipped implementation, ran the guarding test, then
restored the backup sha.

1. **Remove `NOT VALID` from both 0032 CHECKs.** A1 test **FAIL** 23514
   `audit_event_actor_ciphertext_null` while adding the constraint against
   a leftover `{}` actor row. Capture: `{SCRATCH}/mutant-a1-not-valid.log`.
2. **Remove the blank-UA `"unknown"` fallback** (`registration.ts:224`).
   A2 test **FAIL** `CryptoInputError: CRYPTO_KEY_INVALID`; provision
   logged `PROVISION_FAILED`. Capture: `{SCRATCH}/mutant-a2-blank-ua.log`.
3. **Remove `trim`** (`registration.ts:221`). Empty variant still GREEN
   (fallback remains); whitespace variant **FAIL** (`expected false to be
   true` on the unknown-hash assertion). Capture: `{SCRATCH}/mutant-a2-trim.log`.
4. **Revert `provisionPendingAccount` to `this.clock()` drain time.** A3
   test **FAIL** `2026-08-19T14:00:12.700Z` vs `14:00:00.000Z` (12.7 s).
   Capture: `{SCRATCH}/mutant-a3-drain-time.log`.

The extra eight “killed mutants” in the progress log were **not**
independently reproduced here. The four packet-named breaks are the gate
and all four went RED.

## Findings

1. **A1 — 0032 applies on a DB that already holds 0030/0031-shaped audit
   rows, and a fresh DB still gets the intended checks. HOLD.**
   Header at `migrations/0032_registration_audit_erasure_checks.sql:1-7`
   states the reasoning: 0030 required `actor_ciphertext jsonb NOT NULL`
   (`migrations/0030_identity_foundation.sql:121`); 0031 drops that
   (`migrations/0031_registration_verification.sql:37-38`); append-only
   rows cannot be rewritten; `NOT VALID` at `:18` and `:28` tolerates
   legacy rows while still enforcing new inserts/updates.
   `migrate()` runs pending SQL in **one** transaction
   (`packages/db/src/index.ts:123-148`).
   **Live** (author test + independent probe `{SCRATCH}/a1-migrate.log`):
   - Author A1: `legacy_rows=1 constraints=not_valid_and_enforced
     migration=single_transaction`, test passed.
   - Fresh DB: both constraints present, `convalidated=false`; insert
     with `'{}'::jsonb` actor → 23514 `audit_event_actor_ciphertext_null`;
     insert with `target_id` containing `@` → 23514
     `audit_event_target_id_no_email`; valid NULL+opaque insert succeeds.
   - History DB (drop 0032, insert `'{}'` + `legacy@example.test`,
     remigrate): migrate succeeds, `legacy_rows=1`, new-row actor check
     still fires.

2. **A1 adversarial — `NOT VALID` leaves a VR-3 hole for pre-existing
   rows; the `target_id` `@`-check is migration-safe the same way. HOLD
   as in-scope residual, not a failed fix.**
   Pre-0031 rows with non-NULL `actor_ciphertext` and/or an email-shaped
   `target_id` remain forever (`reject_mutation` + append-only). New
   writers set `actorCiphertext: null` and `targetId: event.actorToken`
   (`packages/db/src/identity.ts:105-109`) and `assertOpaqueToken`
   (`:52-56`) rejects a non-UUID-v4 token, so a new `@` target cannot be
   written through the repository. The packet’s preferred option was
   exactly “new rows constrained, legacy rows tolerated.” Disposition of
   pre-0031 rows is outside this ticket (called out in the 0032 header).

3. **A2 — blank and whitespace `User-Agent` no longer 500 or erase the
   audit trail. HOLD.**
   Clamp is in `sourceContext` (`apps/api/src/registration.ts:217-226`):
   `trim()`, then empty → `"unknown"`. `sourceFor`
   (`apps/api/src/index.ts:194-203`) still substitutes `"unknown"` only
   when the header is **absent**; present-and-blank still flows in as
   `""` / `"   "` and is clamped at `sourceContext`. Crypto still throws
   on empty (`packages/crypto/src/index.ts:365-370`) **inside**
   `appendAudit` (`packages/db/src/identity.ts:87-92`) in a transaction
   that rolls back (`:72-80`).
   **Live sockets** (raw HTTP `User-Agent:` / `User-Agent:    ` on
   listen(), `{SCRATCH}/a2-ua.log`): register 202, verify 400
   `VERIFICATION_TOKEN_INVALID` (random token — normal), resend 202;
   account row written; audit rows for
   `identity.registration` / `verification.consumed` /
   `verification.resend_requested` / `verification.sent`; every UA hash
   equals `hashAuditUserAgent("unknown", …)`. Author A2 test: 4 audit
   rows per empty and whitespace variant, `normalized=unknown`.

4. **A2 adversarial — other empty-hash / rollback paths. HOLD.**
   - Missing IP behind a proxy: `trustProxy` is unset
     (`apps/api/src/index.ts:143`); real sockets get `request.ip` from
     the TCP peer, not empty. Empty/whitespace `ip` or `requestId`
     thrown as `AUTH_INPUT_INVALID` **before** any audit write
     (`registration.ts:218-220`). Probe: `empty-ip` / `empty-rid` →
     `AUTH_INPUT_INVALID`, `audit_delta=0` (reject, not a rolled-back
     row).
   - Unicode: NBSP `\u00a0` and BOM `\uFEFF` trim to empty and clamp to
     `"unknown"` (audit written). ZWSP `\u200b` does **not** trim; length
     1; hashes; no `CRYPTO_KEY_INVALID`; audit written.
   - Empty request id is not produced by Fastify’s `request.id`.
   - A caller that **bypasses** `sourceContext` and passes `userAgent:""`
     into `appendAudit` can still throw and roll back. That is not the
     three HTTP routes. The inner crypto guard is unchanged (out of the
     S3a mtime set, and the packet’s two-line clamp belongs in
     `sourceContext`).

5. **A3 — recorded timestamps track request arrival, not drain time.
   HOLD.**
   `register` snapshots `requestedAt = new Date(this.clock().getTime())`
   at intake (`registration.ts:452`) onto frozen `PendingRegistration`
   (`:208-215`, `:485-487`). `provisionPendingAccount` uses that value
   for `verificationExpiresAt`, `adultAffirmedAt`, and audit
   `occurredAt` (`:378-401`), not a fresh `this.clock()`.
   **Live:** author A3 `concurrent=4 drain_delay_ms=12700
   max_request_timestamp_drift_ms=0`. Independent real-clock burst of 4
   (`{SCRATCH}/a3-burst.log`): all four `adult_affirmed_at` /
   `audit.occurred_at` at T0 (`from_start_ms=0`) while drain completed
   1023 ms later. If drain-time were used, the mutant shows they would
   stamp `T0+12700`.

6. **A3 adversarial — is `requestedAt` immutable through the pipeline?
   HOLD, with a JS residual.**
   Repo-wide, `requestedAt` is assigned once (`:452`) and only read in
   `provisionPendingAccount`. The wrapper is `Object.freeze`’d. A `Date`
   is still mutable (`setTime`); nothing in this pipeline calls that.
   Verify/resend continue to use `this.clock()` for their own
   `occurredAt` (not the adult-affirmation attestation). Mail
   `recordVerificationDelivery` still stamps `this.clock()` at delivery
   (`:442-444`) — out of A3’s three named fields.

7. **VR-3 erasure still holds (spot-check). HOLD.**
   Author test: `[S3 VR-3] audit_rows=67 forbidden_matches=0
   actor_ciphertext_nonnull=0 chain_valid=true`. Independent probe:
   `[VR3 SPOT] forbidden_matches=0 actor_ciphertext_nonnull=0
   target_eq_actor=true audit_token_kept=true`. New rows still write
   NULL actor ciphertext and `target_id = actor_key_ref`.

8. **Scope / S3b-d leak. HOLD.**
   S3a mtime set is 0032 + `registration.ts` sourceContext/requestedAt +
   the registration Postgres tests. `mail-channel.ts`, limiter policy,
   `identity.ts`, 0030/0031, and crypto were not retouched in this
   window. Durability is still the fire-and-forget `Set` (S3b not
   done here).

## Residuals (do not lift a BLOCK; already GREENLIGHT)

- Pre-0031 audit rows with actor ciphertext or `@` in `target_id` stay
  until a separately ruled backfill/VALIDATE.
- `sourceFor` still does not clamp present-and-blank UA; `sourceContext`
  does.
- Crypto empty-hash throw remains for any caller that skips
  `sourceContext`.
- Author’s “12 killed mutants”: four packet-named independently RED; the
  other eight un-reproduced here.
