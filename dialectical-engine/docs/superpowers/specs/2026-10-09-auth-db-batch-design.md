# Auth database batch (one forward step after 0108) — design

Owner-approved 2026-10-09. One forward migration, `migrations/0109_auth_db_batch.sql` (renumbered at merge, see the end), joins the chain after the
sealed 0108 the way `migrations/lineage/README.md` describes (same chain code as the NETOPIA branch). Sealed files and
the five functions 0108's receipt pins (`password_reset_prepare/start`, `mfa_recovery_prepare_exchange/exchange`,
`start_account_recovery`) are not touched; neither are `mfa_recovery_eligible`, `password_recovery_rules`,
`valid_consumer_authorization_internal` (pinned by lineage evidence). Every replaced function keeps its signature,
owner and `SECURITY DEFINER`; new ones get the owner of their family and explicit REVOKE/GRANT. Every function the step
creates or replaces (and `staff.publish/revoke/read_independent_alert_readiness`, `staff.claim_alert_delivery`) searches
`pg_catalog, pg_temp` — pg_temp last, so a temporary type cannot shadow `timestamptz`/`uuid`/`jsonb` inside a definer —
except `identity.create_social_account`, whose exact `search_path=pg_catalog` the sealed effective-capability verifier
pins (the step keeps that verifier). Item 6 covers it and every older definer.

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
   `staff.require_alert_readiness_jit()` also accepts that `session_user`. On the preview only, PostgreSQL admits it by
   peer auth on the Unix socket from one dedicated no-login system user, never root (`pg_ident`:
   `readiness debateai-readiness debateai_staff_readiness_writer`; `pg_hba`, first line:
   `local debateai debateai_staff_readiness_writer peer map=readiness`); the production templates admit it nowhere.
   The root unlock helper never connects as it: each call is a child started as `debateai-readiness` (setpriv, no
   groups or capabilities, empty environment) that opens one fresh connection, re-checks its identity on it, makes the
   one call and exits. The JIT recovery login stays as a documented fallback writer that refuses to start
   (`STAFF_WRITER_FALLBACK_NOT_NEEDED`) once the peer path works.
5. **Alert claim release.** `staff.release_alert_delivery(outbox, claim)` gives back a live claim without spending the
   attempt; `StaffAlertDispatcher.drain()` uses it when readiness lapses after the claim.

**As built.** The Settings cancel follows the audited write protocol (`identity.consumer_security.RECOVERY_CANCELLED`).
The recovery pages now load all 35 locales. Preview delivery needs new reviewed mail-wrapper versions on the server for
`security-recovery-code-used-v1` (v4 wrapper is sealed) and for the WAITING/FINISH recovery mails (installed
recovery106 helper); the repo-side hand-off (`deploy/preview-auth-dev/v1/mail-handoff.mjs`) already accepts them.

**Risks.** A WAITING row blocks adding another authenticator (existing rule for pending-recovery factors) until it
finishes or is cancelled. Any password, email, factor or security-epoch change during the wait voids it. A stolen
session can cancel a pending recovery (cost: the existing 24 h cooldown). Peer auth trusts the uid the kernel
reports, so only `debateai-readiness` is mapped, never root: a root process in a container sharing the socket would
otherwise count. Someone already root on the preview can still become that user and write readiness, which root could
do anyway. The preview's release files and socket folder must be readable by that user (README step 7 checks it).
The full preview stage (`stage-runtime.mjs`) can no longer complete an authenticator recovery (it cannot wait a day):
it proves the wait started and that the old session and authenticator keep working.

**Renumbering (planned: 0112, after PR #101's 0110 — a separate `forward110` on dev — and NETOPIA's 0111).** The number lives in: the SQL file name;
`NAME` and `PREVIOUS` in `packages/db/src/migration-forward-auth-db-batch.ts`; `migration.name`, `previous` and
`verifier` in `migrations/lineage/auth-db-batch-forward.json`; the order of `STEPS` in `migration-forward-chain.ts`.
Tests read the name from the loader and only require the batch to be the chain's last step. The full recipe (conflicts
to expect, the other branches' exact-chain tests, "check the preview's applied steps first") is in
`migrations/lineage/README.md`.

## Review fixes (2026-10-09)

6. **No temporary objects.** The step revokes `TEMPORARY` on the database from PUBLIC (also in
   `deploy/postgres/hardening.sql`); no application or runtime code uses temporary objects (the principal provisioner's
   `pg_temp` function runs as the superuser migrator, which the revoke does not affect). The step's verifier refuses TEMP for
   PUBLIC and for every role that is neither a superuser nor the database owner. Older definer functions whose search_path lacks `pg_temp` are left as they
   are (re-pinning them would trip sealed verifiers); the revoke mitigates them. Follow-up: a step that re-pins the
   remaining ones together with a superseding effective verifier.
7. **The 24-hour wait, tightened.** The emailed link of a second recovery asks `identity.mfa_recovery_link_waiting`
   (only after the link proved the mailbox) and is refused at once with `MFA_RECOVERY_ALREADY_WAITING` instead of after
   a wasted setup; entering WAITING resets `failures`, so the finish has its own five tries (the fifth wrong finish
   password refuses, revokes the pending authenticator and starts the usual failure cooldown); `begin_wait` and `finish`
   write `identity.consumer_security.RECOVERY_WAITING` / `RECOVERY_COMPLETED` audit rows (audit token + hashed source
   only); the mail queue re-checks the replacement of every WAITING or FINISH mail it claims (closing an invalidated one as
   EXPIRED and dropping the mail), a WAITING mail never goes out once the replacement stopped waiting (cancelled,
   refused, expired or finished), and the recovery page's status no longer reports it as waiting.
8. **Used codes, everywhere.** The older password recovery (0103, `identity.password_recovery_accept_code`, pinned by
   no sealed verifier) also queues `RECOVERY_CODE_USED`. `consumer_recovery_eligible_internal` already refuses an
   account under a security hold, so no code is consumed silently while the notice queue skips held accounts
   (proved by `consumer-recovery-database.test.ts`, the concurrent hold test).
9. **The readiness writer, adopted carefully.** If the role already exists (roles are cluster-wide), the step adopts
   it only when it has no memberships, no role settings, no password, no expiry, owns nothing and in this database holds
   at most CONNECT, USAGE on `staff` and EXECUTE on the two readiness functions; the verifier also refuses a password,
   an expiry or role settings on it later.
10. **Replay keeps every step's checks.** `ForwardStepPlan.replayVerifierSql` (the batch: its supplemental verifier) runs
   for EVERY applied step on every later `migrate()`, not only the last step's postcondition, and again after a run
   applies new steps, before COMMIT, so a step that breaks an earlier step's rules is rolled back. NETOPIA's copy of
   `migration-forward-chain.ts` must take the same lines when the branches meet (keep ONE chain module).
11. **Preview verify never upgrades.** The native verify refuses a pending migration (`PREVIEW_NATIVE_VERIFY_PENDING_FORWARD_STEP`):
   any numbered migration of the source (recipe, 0108, a separate `forward110`, the chain) that is in neither the
   ledger nor the resolution table; only `apply-and-plan` applies. NETOPIA ships the same guard first; at merge their
   exact functions replace ours.

**Not done.** A "send the finish link again" action (review M6): it needs its own token rotation, rate limit and two
screens; the finish link is mailed once, and the wait can be cancelled and restarted.
