# Auth database batch (forward step 0109) — design

Owner-approved 2026-10-09. One forward migration, `migrations/0109_auth_db_batch.sql`, joins the chain after the
sealed 0108 the way `migrations/lineage/README.md` describes (same chain code as the NETOPIA branch). Sealed files and
the five functions 0108's receipt pins (`password_reset_prepare/start`, `mfa_recovery_prepare_exchange/exchange`,
`start_account_recovery`) are not touched; neither are `mfa_recovery_eligible`, `password_recovery_rules`,
`valid_consumer_authorization_internal` (pinned by lineage evidence). Every replaced function keeps its signature,
owner, `SECURITY DEFINER` and `search_path=pg_catalog`; new ones get the owner of their family and explicit REVOKE/GRANT.

1. **Phone optional at sign-up.** `create_pending_account_base_internal` accepts an all-NULL phone (stores no phone
   columns); a given phone keeps today's checks. `create_social_account` passes source/status/time only with a phone.
2. **24-hour wait for lost-everything recovery** (email link + password path only). States of `mfa_recovery_control`:
   `EMAIL_REQUIRED → FACTOR_REQUIRED → TOTP_REQUIRED → CODES_REQUIRED → ACK_REQUIRED → READY → WAITING → COMPLETED`;
   any live state → `CANCELLED | REFUSED | EXPIRED`. New columns `waiting_at, not_before, finish_hash,
   wait_cancel_hash`; CHECK `not_before >= waiting_at + 24 h`; one `WAITING` row per user. `mfa_recovery_begin_wait`
   (READY → WAITING) sets `not_before = clock_timestamp() + 24 h`, `expires_at = not_before + 7 days`, closes the 5-minute
   recovery binding (so password reset and sign-in are not blocked), and queues a `WAITING` notice to every bound email
   (one-click cancel link where the address may cancel) plus a `FINISH` notice to the proving address, released at
   `not_before`. Old factor, codes and sessions keep working. `mfa_recovery_finish` (finish link + password re-proof +
   risk check) refuses before `not_before` in SQL, then does what the old completion did. `mfa_recovery_complete` is
   inert (returns `INVALID`, no runtime grant). Cancel: either emailed cancel token (`mfa_recovery_cancel`), or a signed-in
   session (`mfa_recovery_pending_read/cancel`, authorization runtime). The mail queue is the flow's own per-address
   `mfa_recovery_notice` (it can carry an encrypted one-click link; the shared consumer notice cannot).
   Instant paths unchanged: password reset with authenticator, recovery-code sign-in, passkey sign-in.
3. **Recovery codes stop refilling.** The five code-consuming functions keep the `consumed_at` update, drop the
   replacement INSERT (signatures keep the now-ignored hash argument) and enqueue `RECOVERY_CODE_USED`
   (`consumer_security_notice_event_kind_check` widened; mail `security-recovery-code-used-v1`).
4. **Staff readiness writer.** Role `debateai_staff_readiness_writer`: LOGIN, `PASSWORD NULL`, no attributes, no
   memberships, `CONNECTION LIMIT 2`, `USAGE` on schema `staff`, `EXECUTE` only on
   `staff.publish_independent_alert_readiness` and `staff.revoke_independent_alert_readiness`.
   `staff.require_alert_readiness_jit()` also accepts that `session_user`. The operator maps it by peer auth on the Unix
   socket (`pg_ident`: `readiness root debateai_staff_readiness_writer`; `pg_hba`:
   `local debateai debateai_staff_readiness_writer peer map=readiness`). The unlock helper uses it; the JIT recovery
   login stays as a documented fallback writer.
5. **Alert claim release.** `staff.release_alert_delivery(outbox, claim)` gives back a live claim without spending the
   attempt; `StaffAlertDispatcher.drain()` uses it when readiness lapses after the claim.

**Risks.** A WAITING row blocks adding another authenticator (existing rule for pending-recovery factors) until it
finishes or is cancelled. Any password, email, factor or security-epoch change during the wait voids it. A stolen
session can cancel a pending recovery (cost: the existing 24 h cooldown). Peer auth means any root process can write
readiness — root already can.

**Renumbering to 0110 (if NETOPIA's 0109 merges first).** The number lives in: the SQL file name; `NAME` and `PREVIOUS`
in `packages/db/src/migration-forward-auth-db-batch.ts`; `migration.name`, `previous` (name + manifest SHA-256 +
verifier SHA-256) and `verifier` (path + SHA-256 of the previous step's effective verifier) in
`migrations/lineage/auth-db-batch-forward.json`; the order of `STEPS` in `migration-forward-chain.ts`; the expected
chain names in `tests/architecture/security-migration-0065.test.ts`. Tests read the name from the loader. Then
recompute the manifest SHA-256s (`node` one-liner in the README) and the orphan-audit migrate-module SHA.
