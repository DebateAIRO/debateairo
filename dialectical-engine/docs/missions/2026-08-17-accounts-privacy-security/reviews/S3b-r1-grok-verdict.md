# S3b-r1 Grok-lens verdict

**GREENLIGHT**

Ticket t_3f2a4c64 / S3b rework 1 (enumeration oracle closed by equal
post-response work). Blind lens: this file does not cite or open the
other diamond. Scope authority is
`reviews/S3b-r1-review-packet.md` only. True change set is from
`find -mmin` / `stat` / sha256 (not `git diff` as the inventory oracle).
Aug-17 rename churn, `node_modules`, `.next`, `.pgdata`, toolchain
symlink noise, and sibling-lens `zz-opus-r1-*.test.ts` files are ignored.
Author progress-log numbers are claims; live numbers below were produced
by this lens against real embedded PostgreSQL 18, mail live
(`MemoryMailSender` not paused), production auth-policy argon2id
65 536 KiB / t=3. Temporary VR-10 mutants were applied one at a time and
restored to the pre-mutant sha; product/test files are byte-identical to
the pre-review inventory. Nothing was committed or pushed.

## Live mtime inventory (S3b-r1)

First `stat` at 00:36 EEST, 2026-08-20. Author r1 window is
**00:11–00:15 EEST**. After VR-10 restore, `registration.ts` and
`identity.ts` match the pre-mutant sha256 (content unchanged).

S3b-r1 product / test set (in-window):

| mtime (EEST) | sha256 (first 8) | path |
|---|---|---|
| 00:11:59 | `349dcb16…` | `packages/db/src/identity.ts` |
| 00:13:26 | `b9615557…` | `tests/integration/registration-database.test.ts` |
| 00:15:20 | `6de92b5c…` | `apps/api/src/registration.ts` |

Ignored as not author r1 (sibling-lens scratch / packet):

| mtime | path |
|---|---|
| 00:24:49 | `reviews/S3b-r1-review-packet.md` |
| 00:29:34 | `tests/integration/zz-opus-r1-null.test.ts` |
| 00:41:50 | `tests/integration/zz-opus-r1-attack.test.ts` |

Frozen packet surfaces **untouched by r1 mtime**:

| mtime | sha256 (first 8) | path | surface |
|---|---|---|---|
| 20:06:46 2026-08-19 | `46b22d43…` | `packages/register/src/auth-policy.ts` | production argon2id 65 536/t=3, S3c 20/IP/15 min, S3d cooldown 60 s |
| 20:06:46 | `7e35e6f8…` | `apps/api/src/mail-channel.ts` | S3d mail channel |
| 20:06:46 | `30df2812…` | `packages/crypto/src/index.ts` | crypto |
| 20:06:46 | `4351de21…` | `packages/db/src/schema.ts` | identity schema |
| 20:06:46 | `f7883bde…` | `migrations/0031_registration_verification.sql` | identity schema |
| 12:42:11 | `04a380ae…` | `migrations/0030_identity_foundation.sql` | identity foundation |
| 22:23:19 | `bdf5c856…` | `migrations/0032_registration_audit_erasure_checks.sql` | S3a / VR-3 erasure |
| 20:11:11 | `2a796238…` | `tests/integration/identity-database.test.ts` | identity tests |

`pendingMailDispatches` still lives only in `registration.ts:259` as
`Set<Promise<void>>` with the same add/delete/`drainMailDispatches`
shape (`:392-399`). Dispatch now multiplexes duplicate post-work through
that set (`:370-394`); the field itself is not a new collection.
`InProcessAuthRateLimiter` is co-located in the in-window
`registration.ts`; the ruled S3c **policy row** (20/IP/15 min) is the
frozen `auth-policy.ts:117`.

## Live gates (restored tree)

| command | capture | claimed | observed |
|---|---|---|---|
| `pnpm typecheck` | `{SCRATCH}/pnpm-typecheck.log` | green | `tsc --noEmit` **exit 0** |
| `pnpm test` | `{SCRATCH}/pnpm-test.log` | 110 files / **793 tests** | **110 passed / 793 passed**, exit 0 (sibling `zz-opus-r1-*` excluded; not author r1) |
| `pnpm lint` | `{SCRATCH}/pnpm-lint.log` | 28 edges / 0 violations | **edgeRowsChecked 28, violations []**, `blocking: []`, exit 0 |
| registration Postgres file | `{SCRATCH}/registration-postgres.log` | live-mail N=1/4/8 + F3 | **1 file, 27 passed**, exit 0 |
| `git diff --check` | `{SCRATCH}/git-diff-check.log` | green | exit 0 (whitespace only; not inventory) |

## Primary question — 70% AUC at N=4 is the estimator's noise floor

Remeasured on the shipped register path, mail live, production 65 536 KiB / t=3,
AUC ceiling 80%. Two restored-tree runs of the guarding test plus a
same-harness N=4 remasure:

| run | N=1 clf/AUC/gap | N=4 clf/AUC/gap | N=8 clf/AUC/gap |
|---|---|---|---|
| this lens, registration file | 62.5% / **50.0%** / 0.2 ms | 65.6% / **64.1%** / 35.6 ms | 60.9% / **64.1%** / 72.0 ms |
| this lens, `pnpm test` re-run | 62.5% / **54.7%** / 0.1 ms | 62.5% / **64.5%** / 31.3 ms | 54.7% / **53.7%** / 11.4 ms |
| author GREEN (claim) | 68.8% / 59.4% / 0.0 ms | 68.8% / 70.3% / 31.3 ms | 59.4% / 61.7% / 43.7 ms |

N=8 AUC moving 64.1% → 53.7% on an unmodified tree is already enough to
show the estimator's spread. N=1 at ~0 ms median gap cannot be a
classifier signal; 50–55% AUC there is chance.

**Same-arm control** (N=4, 4 waves, 16 samples/arm, same drain
alternation, mail live, production policy) — capture
`{SCRATCH}/same-arm-control.log`:

| cell | clf | folded AUC | median gap |
|---|---|---|---|
| cross-arm (dup vs new), this session | 65.6% | **66.0%** | 40.4 ms |
| same-arm both-new | 62.5% | **63.3%** | 34.7 ms |
| same-arm both-dup | 65.6% | **63.3%** | 33.0 ms |

Packet rule, applied without substitution: same-arm AUC near 70% (here
**63%**) means the cross-arm 64–70% band is noise and **item 2 holds**.
This is not the BLOCK pattern (same-arm 50–55% with cross-arm ~70%).

**Is AUC ≤ 80% justified from that null?** Yes. The N=4 null sits at
~63% folded AUC; author 70.3% and this lens's 64–66% are inside that
floor. 80% is ~15–17 points above the measured null, which is what the
estimator needs (N=8 AUC swung 10 points across two restored runs) and
is still below the asymmetry mutant (N=4 AUC **89.1%**, N=8 **95.3%**).
The ruled 100 ms is a latency tolerance, not a separation bound: the
N=4 mutant's median gap was **90.0 ms ≤ 100**, so a range-only guard
would have certified the broken code at the contested cell. The AUC
assertion at `:939` is what went RED.

The guarding test does **not** pause mail. There is no `pause` of the
sender in `registration-database.test.ts`. The N=1/4/8 case constructs a
live `MemoryMailSender` (`:822`), logs `mail=live`, and asserts
`password_argon2id_kib=65536` / `time=3` from
`AUTH_POLICY_REGISTER_ROWS` (`auth-policy.ts:79-82`). Drain happens
between waves (`:881-884`) so leftover SMTP/dummy work does not become a
second oracle; that is not a paused-mail configuration.

## VR-10 — both packet-named mutants independently RED

1. **Strip duplicate post-work.**
   `dispatchVerification` resolved the duplicate branch to
   `Promise.resolve()` instead of `recordDuplicateRegistrationPostwork`
   (`registration.ts:374-380`). Guarding test RED on the **new**
   assertion, not a count-only fuse:
   `expected 0.890625 to be less than or equal to 0.8` at
   `registration-database.test.ts:939`.
   Live mutant cells: N=4 clf **87.5% / AUC 89.1%** / gap 90.0 ms;
   N=8 clf **93.8% / AUC 95.3%** / gap 207.5 ms.
   Capture: `{SCRATCH}/mutant-duplicate-postwork.log`. Restored sha
   `6de92b5c…`.

2. **DEK callback before `appendAudit`.**
   Swapped `beforeCommit()` ahead of `appendAudit` in
   `createPendingAccount` (`identity.ts:226-236`). F3 RED:
   `[S3b F3 ORDERING] … before_commit_calls=1 persisted_accounts=0`
   (`expected 1 to be +0`). Capture:
   `{SCRATCH}/mutant-f3-dek-before-audit.log`. Restored sha `349dcb16…`.

Final `cmp` of both files against the pre-mutant copies: byte-identical.

## Option (a) interrogation

1. **Cost amplification.** Every duplicate probe now pays a second
   audit-chain transaction (`recordDuplicateRegistrationPostwork`,
   `identity.ts:308-332`): `SELECT … FOR UPDATE`, `UPDATE … SET state=state`,
   two source argon2id hashes + `pg_advisory_xact_lock('identity:audit-chain')`
   (`appendAudit` `:103-107`). VR-7 live per-call on this tree was
   **57.2 ms**. S3c cap is 20/IP/15 min (`auth-policy.ts:117`) ⇒ about
   **1.1 s of extra global-lock occupancy per attacking IP per window**.
   That is more server work than round 1, but it is not an unbounded
   amplifier inside the ruled budget.

2. **T7 after the change** (`{SCRATCH}/t7-concurrency.log`), production
   policy, unique new addresses:

   | N | median ms | min | max | wall |
   |---|---|---|---|---|
   | 1 | **602.0** | 602.0 | 602.0 | 660 |
   | 8 | 1814.9 | 1618.3 | 2027.5 | 2093 |
   | 16 | 3408.0 | 2966.2 | 3861.8 | 4268 |
   | 32 | **6248.2** | 5328.7 | 7169.6 | 8519 |

   Round 1 cited 602 → 5 940 ms at N=32. This lens's N=32 median is
   **6248 ms** (~5% higher). Not a doubling; reported as a residual, not
   a headline BLOCK. T7 remains a separate ticket.

3. **Dummy work is truthful.**
   `recordDuplicateRegistrationPostwork` does **not** write a delivery
   record and does **not** set `verification_last_sent_at` / cooldown /
   `delivery_status` — only `UPDATE identity.channel_binding SET state=state`
   (`identity.ts:318-321`). The audit row is
   `eventType: "identity.registration.duplicate_postwork"`, `decision: "DENY"`,
   `justification: "REGISTRATION_ADDRESS_UNAVAILABLE"` (`:322-331`). That
   is an event that did occur (the matching post-work), not
   `identity.verification.sent` for mail that was not sent. Chain
   membership still goes through `appendAuditEvent` under the same
   global lock; ordering semantics are an extra DENY after the in-request
   `identity.registration` DENY (`:196-205`), not a forged sent-event.

4. **VR-3 still holds.** `appendAudit` writes `actor_ciphertext NULL`,
   `actor_key_ref = audit_token` UUID, `target_id = actor_key_ref`
   (`identity.ts:117-138`). Live:
   `[S3 VR-3] audit_rows=547 forbidden_matches=0 actor_ciphertext_nonnull=0 chain_valid=true`.
   0032 erasure checks frozen at sha `bdf5c856…`.

5. **No new plaintext email/IP/UA surface or lifetime extension.**
   Duplicate post-work carries `userId` / `attemptId` / `source` on the
   stack until `setImmediate` dispatch (`registration.ts:235-242, 370-380`).
   Audit hashing of IP/UA is unchanged. Mail channel frozen. Live
   plaintext scan: `[S3 PLAINTEXT] searched_identity_values=4 leaks=0`.

6. **Duplicate path is not newly distinguishable to the caller.**
   Public body is still `REGISTRATION_PUBLIC_RESPONSE`. Dummy failures
   are swallowed after the 2xx (`:381-390`); the caller cannot see them.
   Operator logs differ
   (`AUTH_REGISTRATION_DUPLICATE_POSTWORK_FAILED` vs
   `AUTH_MAIL_DELIVERY_RECORD_FAILED`) — residual, log-only, not a
   client oracle. Both branches take one pool client for the
   post-response transaction.

F3 on the restored tree:
`[S3b F3 ORDERING] … before_commit_calls=0 persisted_accounts=0`.
Audit-before-DEK (`identity.ts:226` then `:236`) is the ordering that
avoids the orphan-key defect (DEK file written, account rolled back).
Restoring it did not reintroduce that defect.

Durability did not regress:
`[S3b DURABILITY BURST] concurrent=100 successes=100 committed_at_response=100`
(shipped test, reduced argon as written) and lens-run
`[S3b-r1 DURABILITY BURST] concurrent=32 successes=32 committed_accounts=32`
at production 65 536/t=3. Capture `{SCRATCH}/durability-burst.log`.
2xx still waits on COMMIT (`register` awaits `provisionPendingAccount`
then returns; clamp is in `finally` at `:536-541`; dispatch is
post-response).

## Findings

1. **Item 2 (enumeration oracle) is closed by equal post-response work
   plus a classifier/AUC guard. HOLD.**
   Duplicate registrations schedule matching truthful post-work
   (`registration.ts:370-380`, `identity.ts:308-332`): same
   select / dummy row update, two source argon2id hashes, same global
   audit-chain lock as `recordVerificationDelivery`. Mail is not paused
   across the measurement (`:822`, log `mail=live`). Production
   argon2id 65 536/t=3 is what ran. Assertion is AUC ≤ 80% (`:804, :939`),
   not a range-only fuse.
   Same-arm N=4 folded AUC **63.3% / 63.3%**; cross-arm **66.0%** (file
   run 64.1%, suite re-run 64.5%). Packet rule: noise floor, item 2
   holds. AUC ≤ 80% sits above that null and below the VR-10 mutant
   (89.1% / 95.3%).

2. **F3 audit-before-DEK restored; VR-10 real. HOLD.**
   `appendAudit` then `beforeCommit` (`identity.ts:226-236`). Restored
   tree `before_commit_calls=0`. Mutant reversing that order goes RED
   at `before_commit_calls=1`. Duplicate-post-work mutant goes RED on
   `expect(measurement.auc).toBeLessThanOrEqual(aucCeiling)` — the new
   assertion, not a restored-asymmetry pass.

3. **Durability, VR-3, frozen surfaces. HOLD.**
   100/100 and 32/32 bursts; VR-3 547/0/chain_valid; S3a 0032, mail
   channel, crypto, identity schema, auth-policy/rate-limit row, cooldown
   untouched by r1 mtime. `pendingMailDispatches` mechanism unchanged.

4. **Residual (does not lift a BLOCK; already GREENLIGHT).**
   T7 N=32 median 6248 ms vs round-1 5940 ms (~5%). Dummy-failure
   operator log prefix differs from the created-branch mail-record
   failure. Cost amplification is ~57 ms extra global-lock work per
   duplicate, capped at 20/IP/15 min. None of these is a client-side
   enumeration oracle.

No commit or push was performed.
