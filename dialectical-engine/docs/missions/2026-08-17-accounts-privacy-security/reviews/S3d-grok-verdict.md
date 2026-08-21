# S3d Grok-lens verdict

**GREENLIGHT**

Ticket t_cc197ed2 / S3d (mail dispatch bound, multi-token verification,
cooldown durability). Blind lens: this file does not cite or open the other
diamond. Scope authority is `reviews/S3d-review-packet.md` only. True change
set is from `find -mmin` / `stat` / sha256 (not `git diff` as the inventory
oracle). `git diff --check` was used only as the packet whitespace gate.
Aug-17 rename churn, `node_modules`, `.next`, `.pgdata`, and toolchain noise
are ignored. Author progress-log numbers are claims; live numbers below were
produced by this lens against the working tree and a real embedded PostgreSQL
subprocess, production auth policy (argon2id 65536 KiB / t=3 / p=1). Temporary
VR-10 mutants were applied one at a time and restored to pre-mutant
byte-identity. Nothing was committed or pushed.

**T9 (`t_6ff49601`) is out of scope.** No `t_6ff49601` product files appear in
the author mtime set. Not re-reported.

## Live mtime inventory (S3d)

First `stat` 08:24 EEST, 2026-08-20. Handoff re-stat 08:50 EEST after VR-10
restore. HEAD `b2324d658819a26135f05767f900f08becf34ae8` (matches the packet).

Author in-window product set (mtime ≥ 2026-08-20 07:30, docs/logs/reviews
excluded). Content hashes are sha256 of the working tree after restore:

| mtime (EEST) | sha256 | vs HEAD | path |
|---|---|---|---|
| 08:13:04 | `3b576d34beeb1de0…` | DIFFER | `packages/register/src/auth-policy.ts` |
| 08:12:08 (content; mtime 08:50 after restore copy) | `478f4e5c180780ff…` | DIFFER | `apps/api/src/registration.ts` |
| 08:11:27 | `8d2b2d50ed6d8984…` | DIFFER | `tests/integration/registration-database.test.ts` |
| 08:08:48 | `05ebf0c907ceb6ef…` | DIFFER | `tests/integration/identity-database.test.ts` |
| 08:07:08 | `34fadf7cd618c165…` | NOT_IN_HEAD | `migrations/0033_verification_token_credentials.sql` |
| 08:05:41 | `6472f459fa57f33b…` | DIFFER | `tests/unit/registration.test.ts` |
| 08:00:23 | `c57266d3bb8314ca…` | DIFFER | `packages/db/src/identity.ts` |
| 07:59:25 (touch; content frozen) | `7e35e6f8400de59b…` | MATCH_HEAD `e6df77556f17` | `apps/api/src/mail-channel.ts` |

`mail-channel.ts` is a VR-10 restore touch: working-tree `git hash-object`
`e6df77556f1742c82af524819d2ad369efa2cd61` equals HEAD and this lens's S3c-r3
record. Sendmail hardening was confirmed, not rewritten.

Frozen surfaces (MATCH_HEAD, Aug-17/19 mtimes except as noted):

| mtime | git hash-object | path |
|---|---|---|
| 2026-08-19 20:06:46 | `34849391e0dc` | `packages/db/src/schema.ts` |
| 2026-08-19 20:06:46 | `40a6d6245975` | `packages/crypto/src/index.ts` |
| 2026-08-19 16:42:18 | `201228e2db37` | `pnpm-lock.yaml` |
| 2026-08-19 20:06:46 | `1057927a4e7d` | `migrations/0031_registration_verification.sql` |
| 2026-08-19 22:23:19 | `05465d307128` | `migrations/0032_registration_audit_erasure_checks.sql` |

S3c ruled `rateLimitPolicy` row is byte-identical to HEAD.
`passwordPolicy` and `auditSourceIpKdfPolicy` are byte-identical to HEAD.
`InProcessAuthRateLimiter.consume` / typed-array storage is unchanged; the
only adjacent addition is `recordVerificationDeliveryRecordFailure` on the
`IdentityRepository` pick (`registration.ts:311-322`). T4 attribution,
crypto, and identity schema beyond the additive
`identity.verification_token_credential` ledger did not move.

## Live gates (this lens, not the progress log)

| gate | result |
|---|---|
| `pnpm typecheck` | GREEN (`tsc --noEmit`) |
| `pnpm test` | **110 files / 812 tests** in **250.92 s**, all passed, real embedded PostgreSQL 18 |
| `pnpm lint` | GREEN: architecture `edgeRowsChecked: 28, violations: []`; source `"blocking": []` |
| `git diff --check` (whitespace only, in-window paths) | empty, exit 0 |
| mutation-residue after restore | no leftover `if (false)` / VR-10 markers in the four hashed product files |

Author claim 110/812 in 238 s is confirmed on files/tests; this lens measured
250.92 s on this machine.

Suite corroboration (same run): S3b durability burst 100/100 committed; S3b
F3 `before_commit_calls=0 persisted_accounts=0`; S3b equal-work n=1/4/8
AUC 51.6 / 71.1 / 62.2 % (ceiling 80 %); S3d D1 32 active + 96 queued, 0 raw
tokens outside an active send, 34 busy 503s, committed 32 then 128; D2 first
token valid after 3 resends; D2 lifetime 81 issued / 72 live ≤ 73; outbound
sends at minutes 0/20/40/60 max rolling hour 3; D3 1 mail / first link
active; D4 1 opaque hashed-source audit; VR-3 `audit_rows=1144
forbidden_matches=0 chain_valid=true`.

## PRIMARY QUESTION 1 — saturation as an existence oracle

**No.** At the shipped 32+96 bound, existing and missing addresses are
indistinguishable on the public face. Existing-arm saturation is not cheaper.

This lens drove the shipped `RegistrationService.register` with production
policy, real sleep (500 ms floor + 100 ms clamp = 600 ms), production
argon2id, and a hanging `MailSender`. Capture `{SCRATCH}/pq1-saturation.log`.

- **Hold cost:** 128 concurrent `register()` calls, distinct IPv6 sources,
  hanging transport, wall **6032.7 ms**. Occupancy
  `{inFlight:32, activeSends:32, queued:96/96}`, mail peak 32, RSS at bound
  **178.719 MiB**. Reservation is taken at `registration.ts:696` *before*
  argon2 and *before* account commit (`:477-488`). 32 waiters that win a
  slot complete argon2+commit then hang on send; 96 pre-mint waiters are
  resolver functions only.
- **Probes at saturation (n=32 per arm, production clamp):** both arms
  **100 % `AUTH_MAIL_BUSY` / HTTP 503** (`registration.ts:54-56`). Existing
  median 602.14 ms (min 599.01, max 606.82); missing median 601.86 ms
  (min 598.99, max 606.35); **median gap 0.27 ms**. Best single-threshold
  classifier **0.5625**; cross AUC **0.530**. Same-arm null (split existing)
  classifier **0.781** / AUC **0.828**. The cross statistic is *worse* than
  the same-arm null — no usable separator. S3b's 0.8 AUC ceiling is cleared
  with margin.
- **Cheaper arm?** 40 concurrent *existing*-address registers (duplicate
  path, production policy) completed 40/40 `ALLOWED`, 0 busy, occupancy
  `{activeSends:0, queued:0}` at 200 ms and 1.5 s, wall 9007.7 ms. Duplicate
  postwork never calls `MailSender` (`registration.ts:533-540`), so existing
  addresses **cannot hold hanging send slots**. The cheap hold is the
  new-address + hanging-transport path, not an existence leak.

Saturation is a cheap availability attack (128 POSTs, ~6 s, distinct sources
because admission is 20/IP/15 min). Production sendmail timeout is 5 s
(`auth-policy.ts:356`), so a sustained hold needs a refresh as slots drain.
That is the designed opaque 503 shed (`at_capacity:
RETRYABLE_503_BEFORE_ACCOUNT_COMMIT_AFTER_BOUNDED_WAIT`), not a PQ1 fail.

## PRIMARY QUESTION 2 — many live tokens

**The arithmetic holds, consumption invalidates the family, erasure
cascades, entropy is unchanged, and the leaked-token trade is a product
decision that Codex stated rather than hid.** Capture
`{SCRATCH}/pq2-tokens.log`.

1. **Bound.** `1 + floor(tokenTtlMs / resendCooldownMs) = 1 + floor(86400000
   / 1200000) = 73`, matching
   `verification_credentials.maximum_live_hashes_per_account: 73`
   (`auth-policy.ts:44,234`). It is a derived consequence of 20-minute
   spacing × 24-hour TTL, not a SQL CHECK. Independent drive: 81 issued over
   26 h prune to **72 live** (not exceeded). Exact TTL edge (register + 72
   spacings): **73 issued, 73 live, not exceeded**. Prune is
   `DELETE … expires_at < now` inside the resend transaction
   (`identity.ts:456-458`) under `FOR UPDATE`. Concurrent resends serialize
   on that row.
2. **Consume + siblings.** `consumeVerification` stamps `consumed_at` on
   **every** unconsumed hash for the channel (`identity.ts:401-404`), then
   activates the user. This lens: 4 live hashes; after verifying the first,
   the other three returned `VERIFICATION_TOKEN_INVALID`; 4/4 rows consumed.
   **Siblings do not remain usable after activation.**
3. **VR-3 / deletion.** `verification_token_credential.channel_binding_id`
   references `channel_binding` `ON DELETE CASCADE`
   (`migrations/0033_verification_token_credentials.sql:7-8`). This lens:
   2 credentials before `DELETE FROM identity."user"`, **0 after**. Suite
   VR-3: 1144 audit rows, 0 forbidden matches, chain valid.
4. **Leaked-token trade.** Rotation is gone; an unauthenticated resend
   cannot revoke a token the owner believes leaked. Codex wrote that into
   the ruled row (`auth-policy.ts:236`): "A token believed leaked cannot be
   selectively revoked by an unauthenticated resend; every mailed link
   instead expires at its own ruled 24-hour deadline or is consumed when
   the account activates. Selective revocation requires a separately
   authenticated recovery action." The implementation matches that sentence
   (and activation *does* kill the family — see (2)). **This is a product
   decision, not a coder stealth pick.** V should ratify it as policy; it
   is not a S3d implementation defect and does not block this lens.
5. **Entropy.** Token is 32 bytes / 256 bits
   (`packages/crypto/src/index.ts:428-435`). P(guess one of 73 live) =
   73 × 2^{-256} = **6.304×10⁻⁷⁶**. Materially the same as a single
   256-bit token (2^{-256} ≈ 8.64×10⁻⁷⁸). 73 live hashes do not create a
   guessing oracle.

## Also attack

**S3b 100-burst / F3 / equal-work — repaired, not merely accommodated.**
This lens: 100/100 public successes and 100 committed
(`{SCRATCH}/s3b-burst-f3-oracle.log`). Suite: `[S3b DURABILITY BURST]
concurrent=100 successes=100 committed_at_response=100`. F3 with **raw
SHA-256 hex** (the widened fixture) and with **prefixed** `sha256:hex`
both throw `AUDIT_TOKEN_MUST_BE_RANDOM_UUID_V4`, `beforeCommitCalls=0`,
`persisted=0`. The CHECK
`token_hash ~ '^(sha256:)?[0-9a-f]{64}$'`
(`migrations/0033_verification_token_credentials.sql:6`) lets the raw-hex
fixture *reach* the audit assertion instead of dying on a CHECK; it does
not change `hashVerificationToken` (always prefixed) or weaken F3's
pre-DEK-write rejection. Equal-work: this lens n=8 AUC **0.531**,
classifier 0.625, median gap 0.19 ms; suite n=1/4/8 all under the 0.8
ceiling.

**RSS vs null, occupancy past the author.** Author used 8 then 24 extra
refusals. This lens held the 32+96 bound then issued **200** further
registers: 200/200 `AUTH_MAIL_BUSY/503`, RSS 178.719 → 202.703 → 190.234
MiB, extra growth **0**. Author's `null_wave_growth * 3 + 64 KiB` ceiling
is honest at page resolution (suite D1: null growth 0.0, ceiling 0.109
MiB, sustained 0.0). Capture `{SCRATCH}/rss-null.log`.

**D3 first link.** Independently GREEN: 1 mail, first token `ACTIVE`
(`{SCRATCH}/d3-first-link.log`). The immediate-resend case is still the
S3c mint-time `verification_last_sent_at` write
(`identity.ts:211-212`, values `$3,$4,$5,$3`) — cooldown ignores the
resend. S3d's ledger is what keeps that first hash alive *after* the
cooldown allows later resends (D2). Codex's "characterised GREEN on
current code" is true; the immediate path was already fixed before S3d,
and S3d did not re-break it.

**D4.** This lens injected `recordVerificationDelivery` failure: cooldown
held (1 mail), one
`identity.verification.delivery_record_failed` row, justification
`correlation:<uuid>;code:MAIL_RECORD_FAILED`, `source_context` only
`ipArgon2id` / `userAgentArgon2id` hex, **no email, no raw IP, no UA**
(`{SCRATCH}/d4-delivery-record.log`).

**Queue object graph under load.** At 32+96:
`pendingPromiseObjects` + `waitingResolverObjects` JSON, 32 active tokens
in the hanging sender, **0** of those tokens in the queue graph, **0**
plaintext emails, **0** raw IPs; waiters are all functions
(`{SCRATCH}/queue-object-graph.log`).

**VR-10** (`{SCRATCH}/vr10-mutants.log`), all restored to pre-mutant
sha256 `478f4e5c…` / `7e35e6f8…` / `c57266d3…` / `3b576d34…`:

| mutant | guarding test | this lens |
|---|---|---|
| recipient validation throw disabled | unit CRLF/malformed | RED |
| CRLF conjunct only (original `[^\s@]` regex) | unit CRLF | not independently RED (whitespace class already rejects the vector) |
| CRLF check with regex widened to `[^@]+` | unit CRLF | PASS — the `/[\r\n]/` conjunct *is* load-bearing once the regex no longer excludes CR/LF |
| sendmail `--` removed | unit `--` args | RED |
| sendmail timeout disabled | unit hung sendmail | RED |
| ruled 32→31 and 73→72 | unit S3d D1 row | RED |
| queue 96→97 | unit S3d D1 row | RED |
| dispatch cap removed | integration D1 | RED (25 s timeout: overflow waiters hang instead of 503) |
| 33rd active (policy 32→33) | unit S3d D1 row | RED |
| current-token-only consume | D2 first link | RED |
| expiry pruning disabled | D2 lifetime | RED |
| creation-transaction cooldown cleared | D3 | RED |
| fallback audit removed | D4 | RED |
| failed delivery marked sent | mail-failure audit | RED |
| outbound cooldown disabled | rolling-hour ceiling | RED |

## Findings

1. **Product decision, not a coder defect — leaked-token revocation.**
   `auth-policy.ts:231-236`. An unauthenticated party cannot rotate away a
   mailed link; the owner also cannot. Codex stated the trade in the ruled
   row and implemented it. V should ratify "selective revocation requires a
   separately authenticated recovery action" as policy. Not a lift-the-block
   item.

2. **73 is derived, not a table CHECK.** `auth-policy.ts:44` and
   `identity.ts:456-458`. This lens could not drive live hashes above 73
   with cooldown intact (edge = 73). Disabling prune (VR-10) goes RED.
   Acceptable as long as cooldown remains the enforcement.

3. **CRLF conjunct overlaps the recipient regex.** `mail-channel.ts:49-50`.
   Removing only `/[\r\n]/` does not RED the existing test; `[^\s@]+`
   already rejects the CRLF vector. The conjunct *is* load-bearing if the
   regex is widened. Combined `MAIL_INPUT_INVALID` disable, `--`, and
   timeout all RED. Confirm-not-rewrite holds.

4. **Saturation is a cheap availability hold, not an existence oracle.**
   128 distinct-source registers in 6.0 s fill 32+96. Existing addresses
   cannot hold it. Public 503 is opaque. Bound is doing its job.

No blocking findings. Frozen S3a / S3b durability+oracle / S3c limiter row
/ T4 / crypto / identity schema beyond the additive ledger / T9 were not
silently rewritten.

GREENLIGHT
