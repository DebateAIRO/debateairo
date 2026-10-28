-- 0125 · Security audit run 3 fixes (one shared forward step, migrations/lineage/README.md "The security fixes of
-- audit run 3 (0125)").
--
-- Every SQL change of the run-3 fix branch lives in this one step, in one section per issue. Each section opens with
--   -- ==== [<issue id>] <short title> ====
-- and holds only that issue's statements; a later section is inserted just before [NV-50], which stays last (its
-- ACCESS EXCLUSIVE lock on ledger.model_spend is held until this step commits). The loader
-- (packages/db/src/migration-forward0125.ts, loadForward0125) digests each section's objects in its own group of the
-- postcondition evidence, so a section's objects are checked on every later migrate() for as long as the step is
-- applied. Once the step is applied anywhere, its bytes never change again.
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: expand
-- n1: keeps-verifier
--   expand          additive only: every section adds new objects; nothing older is altered, dropped, renamed, revoked
--                   or replaced except under a reviewed line (NV-13's trigger swap; NV-50's spend-source CHECK,
--                   replaced wider, and its new NOT VALID CHECK), so the release before keeps running beside it. A
--                   section that needs a reviewed exception says so on a `-- n1: reviewed <reason>` line directly
--                   above its statement.
--   keeps-verifier  no billing relation or billing function, so the effective-capability verifier in force (0111's,
--                   migrations/lineage/README.md step 3) stays in force and the manifest names it.
--
-- Additive and replay-safe in the repository's form (tools/orphan-audit auditMigrationReplaySafety): CREATE OR REPLACE
-- FUNCTION of names no earlier migration defines; REVOKE only on objects this file creates. Nothing historical is
-- rewritten.

-- ==== [NV-16] MFA recovery start: at most three starts per account and destination per rolling hour ====
-- 0116's identity.mfa_recovery_start mails a new proof link on every eligible start, and its body is sealed by 0116's
-- postcondition digest, so this section adds a bounded entry point that the new release's repository calls instead
-- (PostgresMfaRecoveryRepository.start, op start_bounded). Under the account's security-subject lock (0085's
-- re-entrant advisory transaction lock, the one the delegate takes first) it counts the account's control rows for the
-- requested destination that started in the last hour, refuses silently at three, and otherwise delegates to the sealed
-- start in the same transaction, which keeps eligibility, snapshots, notices and the mail-locale carrier. The count is
-- keyed by the proof channel's type with the CASE mfa_recovery_prepare uses to pick that channel (0106:72), and the
-- delegate stores that type on the row (0116:134; NOT NULL, 0106:14), so starts to one destination never refuse the
-- other. Both start bodies set email_expires_at to start + 30 minutes (0106:83, 0116:134) and nothing updates it, so
-- "started in the last hour" is email_expires_at > now - 30 minutes. Rows written by either release count. The old
-- function keeps its grant for the release before; revoking it later must also supersede 0116's ACL evidence.
CREATE OR REPLACE FUNCTION identity.mfa_recovery_start_bounded(p_index bytea,p_destination text,p_candidate uuid,p_channels uuid[],p_link text,p_cancel text,p_notices jsonb,p_source jsonb,p_register bigint,p_id uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE u uuid;BEGIN
 PERFORM identity.mfa_recovery_rules(p_register);                -- the delegate's refusal of a bad register, first
 SELECT user_id INTO u FROM identity."user" WHERE email_blind_index=p_index;
 IF u IS NULL OR u IS DISTINCT FROM p_candidate THEN RETURN false;END IF;  -- the delegate refuses both (0116:128-129)
 PERFORM identity.lock_security_subjects(ARRAY[u]);              -- the lock mfa_recovery_start takes first
 -- per account AND destination: the delegate's proof channel is chosen by this same CASE (0106:72) and its type is
 -- stored on the row (0116:134); email_expires_at = start + 30 minutes in both start bodies (0106:83, 0116:134)
 IF (SELECT count(*) FROM identity.mfa_recovery_control
     WHERE user_id=u
       AND channel_type=CASE WHEN p_destination='primary' THEN 'email' ELSE 'recovery_email' END
       AND email_expires_at>clock_timestamp()-interval '30 minutes')>=3 THEN RETURN false;END IF;
 RETURN identity.mfa_recovery_start(p_index,p_destination,p_candidate,p_channels,p_link,p_cancel,p_notices,p_source,p_register,p_id);
END $$;
ALTER FUNCTION identity.mfa_recovery_start_bounded(bytea,text,uuid,uuid[],text,text,jsonb,jsonb,bigint,uuid) OWNER TO debateai_mfa_recovery_owner;
REVOKE ALL ON FUNCTION identity.mfa_recovery_start_bounded(bytea,text,uuid,uuid[],text,text,jsonb,jsonb,bigint,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.mfa_recovery_start_bounded(bytea,text,uuid,uuid[],text,text,jsonb,jsonb,bigint,uuid) TO debateai_mfa_recovery_runtime;

-- ==== [NV-18] Recovery bindings: close any binding left open past one hour ====
-- Every generic recovery start of the release before (identity.start_account_recovery, sealed by 0108's verifier) left
-- an identity.account_recovery_binding open that nothing ever closed, and one open binding per account blocks password
-- reset, backup-email setup and MFA-recovery exchange (all sealed too). The new release's generic start creates no
-- binding; this sweeper, run by the API's one-minute authentication-risk maintenance pass in rounds of at most 100,
-- closes every binding still open one hour after it was bound and appends EXPIRED. One hour is longer than any live
-- owner holds one: a reset control expires 30 minutes after its start (0104's pinned policy), an MFA pairing 5 minutes
-- after it (0108), and 0104's bridge closed every 0103 control. A family closer that comes later finds its binding
-- closed and only appends its own event (its UPDATEs filter closed_at IS NULL). Subject locks are taken one at a time
-- in user_id order, the order lock_security_subjects uses (0085), and held until the caller's round commits. It reads
-- and writes only the binding family's own tables, so it needs no grant on a private reset or MFA control table.
-- Owned by the installer, as start_account_recovery is (0108's verifier requires that owner); granted to
-- debateai_runtime, the role that holds start_account_recovery (0045), whose member roles inherit it (0039, 0093).
CREATE OR REPLACE FUNCTION identity.expire_stale_account_recovery_bindings(p_batch integer) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE c record;n integer:=0;t timestamptz;BEGIN
 IF p_batch IS NULL OR p_batch NOT BETWEEN 1 AND 1000 THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='RECOVERY_BINDING_BATCH_INVALID';END IF;
 -- A live reset holds its binding at most 30 minutes, a live MFA pairing 5; anything older belongs to nothing live.
 FOR c IN SELECT b.recovery_request_id,b.user_id FROM identity.account_recovery_binding b
   WHERE b.closed_at IS NULL AND b.bound_at<=clock_timestamp()-interval '1 hour'
   ORDER BY b.user_id,b.recovery_request_id LIMIT p_batch LOOP
  PERFORM identity.lock_security_subjects(ARRAY[c.user_id]);
  t:=clock_timestamp();
  UPDATE identity.account_recovery_binding SET closed_at=t
   WHERE recovery_request_id=c.recovery_request_id AND closed_at IS NULL AND bound_at<=t-interval '1 hour';
  IF FOUND THEN
   INSERT INTO identity.account_recovery_state_event(recovery_request_id,state) VALUES(c.recovery_request_id,'EXPIRED');
   n:=n+1;
  END IF;
 END LOOP;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION identity.expire_stale_account_recovery_bindings(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.expire_stale_account_recovery_bindings(integer) TO debateai_runtime;

-- ==== [NV-15] MFA recovery: account-level password-proof failures feed the sealed adverse rule ====
-- The sealed MFA-recovery policy refuses on an adverse RECOVERY_PROOF_FAILED signal after the latest completed sign-in
-- (0106's mfa_recovery_risk_matches, inside the sealed exchange, wait and finish), but nothing wrote that kind: a wrong
-- password only ran the per-challenge counter, so abandoning a link after four guesses and starting again was never
-- bounded. This recorder, which the new release's MfaRecoveryService calls for a wrong exchange or finish password
-- instead of identity.mfa_recovery_failure, takes the account's subject lock, delegates to that pinned counter
-- (unchanged), and then answers REFUSED while the sealed adverse rule holds (mirrored literally from 0106). For a link
-- failure it then sums the failures of the account's never-paired challenges started within the 90-day risk retention
-- whose link was still valid after the later of the latest sign-in and the latest successful pairing; at the sealed
-- proof_failures_per_attempt it writes one RECOVERY_PROOF_FAILED with the TS-encrypted context in the same transaction.
-- Both start bodies set email_expires_at to start + 30 minutes (0106:83, 0116:134) and nothing updates it, and the row
-- records no time per failure, so the boundary test is conservative: a link valid after the boundary counts in full.
-- Finish failures keep their own five tries and never count. The only new privilege is INSERT on the risk table for
-- the NOLOGIN owner; identity.mfa_recovery_failure keeps its grant for the release before and for session failures.
GRANT INSERT ON identity.authentication_risk_signal TO debateai_mfa_recovery_owner;
CREATE OR REPLACE FUNCTION identity.mfa_recovery_record_failure(p_selector text,p_kind text,p_source jsonb,p_context jsonb)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE c identity.mfa_recovery_control%ROWTYPE;t timestamptz;last_login timestamptz;last_pair timestamptz;n bigint;BEGIN
 IF p_kind IS NULL OR p_kind NOT IN('link','finish') OR p_selector IS NULL OR p_selector !~ '^sha256:[0-9a-f]{64}$' THEN RETURN 'INVALID';END IF;
 IF p_kind='link' THEN SELECT * INTO c FROM identity.mfa_recovery_control WHERE link_hash=p_selector;
 ELSE SELECT * INTO c FROM identity.mfa_recovery_control WHERE finish_hash=p_selector;END IF;
 IF c.challenge_id IS NULL THEN RETURN 'INVALID';END IF;
 IF (p_kind='link' AND (core.is_content_envelope(p_context) IS NOT TRUE OR p_context-ARRAY['v','keyId','nonce','ct','tag']<>'{}'::jsonb
     OR p_context->>'keyId' IS DISTINCT FROM 'auth-risk:'||c.user_id::text||':v1'))
  OR (p_kind='finish' AND p_context IS NOT NULL) THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='MFA_RECOVERY_RISK_CONTEXT_INVALID';END IF;
 PERFORM identity.lock_security_subjects(ARRAY[c.user_id]);
 PERFORM identity.mfa_recovery_failure(p_selector,p_kind,p_source);          -- pinned per-challenge counter, unchanged
 SELECT * INTO c FROM identity.mfa_recovery_control WHERE challenge_id=c.challenge_id;
 t:=clock_timestamp();
 SELECT max(observed_at) INTO last_login FROM identity.authentication_risk_signal
  WHERE user_id=c.user_id AND signal_kind='LOGIN_SUCCESS' AND expires_at>t;
 -- the sealed adverse rule, literally as mfa_recovery_risk_matches (0106:59-60): once it holds, every failure answers as a refusal
 IF EXISTS(SELECT 1 FROM identity.authentication_risk_signal WHERE user_id=c.user_id AND expires_at>t
   AND signal_kind IN('SESSION_CONTEXT_CHANGED','RECOVERY_PROOF_FAILED') AND (last_login IS NULL OR observed_at>=last_login)) THEN
  RETURN 'REFUSED';END IF;
 IF p_kind='link' THEN
  SELECT max(paired_at) INTO last_pair FROM identity.mfa_recovery_control WHERE user_id=c.user_id AND paired_at IS NOT NULL;
  -- both start bodies set email_expires_at = start + 30 minutes (0106:83, 0116:134); nothing updates it.
  -- A row counts unless its link had expired before the latest sign-in or successful pairing (GREATEST ignores NULLs).
  SELECT COALESCE(sum(failures),0) INTO n FROM identity.mfa_recovery_control
   WHERE user_id=c.user_id AND paired_at IS NULL
     AND email_expires_at-interval '30 minutes'>t-((c.policy->>'risk_retention_ms')::bigint*interval '1 millisecond')
     AND (greatest(last_login,last_pair) IS NULL OR email_expires_at>greatest(last_login,last_pair));
  IF n>=(c.policy->>'proof_failures_per_attempt')::integer THEN
   INSERT INTO identity.authentication_risk_signal(risk_signal_id,user_id,signal_kind,context_ciphertext,observed_at,expires_at)
    VALUES(gen_random_uuid(),c.user_id,'RECOVERY_PROOF_FAILED',p_context,t,t+interval '7776000 seconds');
   RETURN 'REFUSED';
  END IF;
 END IF;
 IF c.stage IN('COMPLETED','CANCELLED','REFUSED','EXPIRED') THEN RETURN 'REFUSED';END IF;
 RETURN 'PROOF_INVALID';
END $$;
ALTER FUNCTION identity.mfa_recovery_record_failure(text,text,jsonb,jsonb) OWNER TO debateai_mfa_recovery_owner;
REVOKE ALL ON FUNCTION identity.mfa_recovery_record_failure(text,text,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.mfa_recovery_record_failure(text,text,jsonb,jsonb) TO debateai_mfa_recovery_runtime;

-- ==== [NV-40] password-reset claim: sweep every stale PROOF before claiming ====
-- 0116's identity.password_reset_claim_notice locks the one oldest due row; when that row is a PROOF whose control is no
-- longer EMAIL_REQUIRED or has expired, it dead-letters that one row and returns NULL, the same answer as "nothing due",
-- so the worker's run ends (apps/api/src/password-reset-mail.ts, `if (!found) break`). A control that expires writes no
-- notice (0104's password_reset_close), so after any drain stall longer than the 30-minute control lifetime the stale
-- PROOFs left the head one per 30 s run while every deliverable notice waited behind them. 0116's postcondition digests
-- that body, so this section adds the claim the new release's repository calls instead
-- (PostgresPasswordResetRepository.claimNotice): the same argument, range check, error and result object (mail_locale
-- included). One sweep first dead-letters every unleased PROOF its control can no longer use, in one statement, as the
-- backup and MFA claims do (0116, 0112); a bounded loop (1..64, as 0112's MFA claim) then dead-letters a PROOF found stale
-- in the race window and takes the next row instead of returning NULL, so NULL means nothing deliverable is due. A row
-- whose lease is still live is never touched (the rule this outbox's claim always kept: its holder finishes it), and
-- every lock is SKIP LOCKED, so a claim never waits on another claim or a finish. The sweep's ARRAY(...) form is an
-- initplan whose = ANY probes the primary key whatever the statistics (NV-38's claim test measures it; do not turn it
-- into IN (...)), every call is planned fresh (plan_cache_mode, as NV-38's claims), and the lease is taken from
-- clock_timestamp() after the sweep and the loop, so it stays whole. The old function keeps its grant for the release
-- before; retiring it later changes the ACL 0116's postcondition digests, so that needs its own drained step.
CREATE OR REPLACE FUNCTION identity.password_reset_claim_pending_notice(p_lease_ms integer) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET plan_cache_mode=force_custom_plan AS $$
DECLARE n identity.password_reset_notice%ROWTYPE;l uuid;t timestamptz;v integer;BEGIN
 IF p_lease_ms IS NULL OR p_lease_ms NOT BETWEEN 1000 AND 60000 THEN RAISE EXCEPTION 'PASSWORD_RESET_NOTICE_LEASE_INVALID';END IF;t:=clock_timestamp();
 -- Every unleased PROOF its control can no longer use dies here, in one statement (NV-40); rows another claim or finish holds are skipped.
 -- ARRAY(...) is an initplan run once; = ANY(array) then probes the primary key, whatever the statistics say.
 UPDATE identity.password_reset_notice a SET dead_at=t WHERE a.notice_id=ANY(ARRAY(SELECT s.notice_id FROM identity.password_reset_notice s
  WHERE s.event_kind='PROOF' AND s.sent_at IS NULL AND s.dead_at IS NULL AND(s.lease_until IS NULL OR s.lease_until<=t)
   AND NOT EXISTS(SELECT 1 FROM identity.password_reset_control c WHERE c.recovery_request_id=s.recovery_request_id AND c.stage='EMAIL_REQUIRED' AND c.expires_at>t)
  FOR UPDATE OF s SKIP LOCKED));
 FOR v IN 1..64 LOOP
  SELECT * INTO n FROM identity.password_reset_notice WHERE sent_at IS NULL AND dead_at IS NULL AND available_at<=t AND(lease_until IS NULL OR lease_until<=t) ORDER BY created_at,notice_id LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF n.notice_id IS NULL THEN RETURN NULL;END IF;
  EXIT WHEN n.event_kind<>'PROOF' OR EXISTS(SELECT 1 FROM identity.password_reset_control c WHERE c.recovery_request_id=n.recovery_request_id AND c.stage='EMAIL_REQUIRED' AND c.expires_at>clock_timestamp());
  UPDATE identity.password_reset_notice SET dead_at=clock_timestamp() WHERE notice_id=n.notice_id;n:=NULL;
 END LOOP;
 IF n.notice_id IS NULL THEN RETURN NULL;END IF;l:=gen_random_uuid();
 UPDATE identity.password_reset_notice SET lease_id=l,lease_until=clock_timestamp()+(p_lease_ms*interval '1 millisecond'),attempts=attempts+1 WHERE notice_id=n.notice_id;
 RETURN jsonb_build_object('noticeId',n.notice_id,'leaseId',l,'userId',n.user_id,'channelId',n.channel_id,'event',n.event_kind,'payload',n.payload_ciphertext,'expiresAt',(SELECT expires_at FROM identity.password_reset_control WHERE recovery_request_id=n.recovery_request_id),'mail_locale',n.mail_locale);
END $$;
ALTER FUNCTION identity.password_reset_claim_pending_notice(integer) OWNER TO debateai_password_reset_owner;
REVOKE ALL ON FUNCTION identity.password_reset_claim_pending_notice(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.password_reset_claim_pending_notice(integer) TO debateai_password_reset_runtime;

-- ==== [NV-01] legacy-run claim: at most five attempts per account per hour, then an hour's refusal ====
-- core.claim_legacy_runs (0085) answers CLAIMED or NO_MATCH for any token a signed-in caller puts to it and only audits
-- a miss, so the claim route was an unbounded guessing oracle against the unclaimed cutover runs, which never expire
-- (0041). This section adds the per-account attempt budget that the new release's PostgresLegacyRunClaimApplication
-- charges before every claim, in its own statement and before any hashing. core.legacy_claim_admit is one
-- INSERT ... ON CONFLICT (user_id) DO UPDATE ... RETURNING: its row lock serializes one account's concurrent admits, so
-- at most p_max attempts per p_window_ms are admitted; the attempt past the cap sets locked_until = now + p_lock_ms and
-- is itself refused; while locked the row is left unchanged; an elapsed window or an expired lock starts a fresh window,
-- so no lock is permanent. p_lock_ms >= p_window_ms keeps a racing waiter's later window start below locked_until in
-- practice (the CHECK fails closed if it ever did not). core.legacy_claim_clear deletes the account's row after a
-- CLAIMED outcome, never while a lock is active. The claim function is unchanged and keeps its grant for the release
-- before, so the bound is the new release's. The counter is mutable, so it has no reject-mutation trigger; it is
-- TRUNCATE-guarded, and account erasure removes its row through the cascade. Owned by the installer, as the claim
-- function and 0041's tables are; the runtime reaches the table only through the two functions.
CREATE TABLE IF NOT EXISTS core.legacy_claim_lockout (
  user_id uuid PRIMARY KEY REFERENCES identity."user"(user_id) ON DELETE CASCADE,
  attempts integer NOT NULL CHECK (attempts >= 1),
  window_started_at timestamptz NOT NULL,
  locked_until timestamptz,
  CHECK (locked_until IS NULL OR locked_until > window_started_at)
);
REVOKE ALL ON core.legacy_claim_lockout FROM PUBLIC;
SELECT core.install_truncate_guard('core.legacy_claim_lockout');

CREATE OR REPLACE FUNCTION core.legacy_claim_admit(p_user_id uuid,p_window_ms bigint,p_max integer,p_lock_ms bigint)
RETURNS TABLE(admitted boolean,retry_after_ms bigint)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_window interval;
  v_until timestamptz;
BEGIN
  IF p_user_id IS NULL OR p_window_ms IS NULL OR p_window_ms < 1000 OR p_max IS NULL OR p_max < 1
     OR p_lock_ms IS NULL OR p_lock_ms < p_window_ms THEN
    RAISE EXCEPTION 'LEGACY_CLAIM_ADMIT_INVALID' USING ERRCODE = '22023';
  END IF;
  v_window := p_window_ms * interval '1 millisecond';
  INSERT INTO core.legacy_claim_lockout AS l(user_id,attempts,window_started_at,locked_until)
  VALUES (p_user_id,1,v_now,NULL)
  ON CONFLICT (user_id) DO UPDATE SET
    attempts = CASE
      WHEN l.locked_until > v_now THEN l.attempts                                        -- locked: unchanged
      WHEN l.locked_until IS NOT NULL OR v_now - l.window_started_at >= v_window THEN 1   -- fresh window
      ELSE least(l.attempts + 1, p_max + 1) END,
    window_started_at = CASE
      WHEN l.locked_until > v_now THEN l.window_started_at
      WHEN l.locked_until IS NOT NULL OR v_now - l.window_started_at >= v_window THEN v_now
      ELSE l.window_started_at END,
    locked_until = CASE
      WHEN l.locked_until > v_now THEN l.locked_until
      WHEN l.locked_until IS NOT NULL OR v_now - l.window_started_at >= v_window THEN NULL
      WHEN l.attempts + 1 > p_max THEN v_now + p_lock_ms * interval '1 millisecond'
      ELSE NULL END
  RETURNING l.locked_until INTO v_until;
  admitted := v_until IS NULL;
  retry_after_ms := CASE WHEN v_until IS NULL THEN 0
    ELSE greatest(1, ceil(extract(epoch FROM v_until - v_now) * 1000))::bigint END;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION core.legacy_claim_clear(p_user_id uuid)
RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
  DELETE FROM core.legacy_claim_lockout
  WHERE user_id = p_user_id AND (locked_until IS NULL OR locked_until <= clock_timestamp());
$$;

REVOKE ALL ON FUNCTION core.legacy_claim_admit(uuid,bigint,integer,bigint),core.legacy_claim_clear(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.legacy_claim_admit(uuid,bigint,integer,bigint),core.legacy_claim_clear(uuid)
  TO debateai_runtime;

-- ==== [NV-12] email change: three confirmation mails per account per hour; a resend never extends the change ====
-- 0079's identity.resend_email_change_with_audit refuses only inside the 60-second cooldown and moves expires_at to the
-- caller's now + 24 hours on every resend, and its request has no count at all, so one signed-in account could mail an
-- address of its choosing about once a minute and keep its pending change alive for ever. This section adds one
-- per-account send window and two bounded entry points that the new release's repository calls instead
-- (PostgresEmailChangeRepository.requestBounded / resendBounded). Both read and upsert the window under the account
-- lock the 0079 bodies already take (lock_account_t9_internal, which takes lock_security_subjects first, 0085), so a
-- request and a resend share one budget: at most p_maximum_sends counted sends in a fixed window that starts at its
-- first counted send; a refused call counts nothing, and a re-request never refreshes it. The request refuses LIMIT
-- before it delegates, so the owner's step-up grant survives, and counts only a PENDING answer. The resend copies the
-- live post-0099 resend body (0079's text with 0099's two predicate replacements: the 720-hour session ceiling) and
-- adds the threshold checks, then, after the cooldown, the clamp (a resend never moves expires_at past issued_at + the
-- link TTL; a change already past it answers NONE and spends nothing), then the window. Thresholds are checked here,
-- not trusted: a NULL or out-of-range value answers REQUEST_INVALID with its audit. The 0079 functions keep their
-- grants for the release before, whose traffic neither reads nor counts the window.
CREATE TABLE IF NOT EXISTS identity.email_change_send_window (
  user_id uuid PRIMARY KEY REFERENCES identity."user"(user_id) ON DELETE CASCADE,
  sends integer NOT NULL CHECK (sends >= 1),
  window_started_at timestamptz NOT NULL
);
REVOKE ALL ON identity.email_change_send_window FROM PUBLIC;
SELECT core.install_truncate_guard('identity.email_change_send_window');

CREATE OR REPLACE FUNCTION identity.request_email_change_bounded(
  p_user_id uuid,p_session_id uuid,p_grant_token_hash text,p_email_change_id uuid,
  p_new_email_blind_index bytea,p_new_email_ciphertext jsonb,p_confirm_token_hash text,
  p_cancel_token_hash text,p_expires_at timestamptz,p_source_context jsonb,
  p_maximum_sends integer,p_window_ms bigint
)
RETURNS TABLE(result_status text,result_expires_at timestamptz,
  result_current_email_ciphertext jsonb,result_address_available boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_window identity.email_change_send_window%ROWTYPE;
  v_result record;
BEGIN
  IF p_maximum_sends IS NULL OR p_maximum_sends NOT BETWEEN 1 AND 3
     OR p_window_ms IS NULL OR p_window_ms NOT BETWEEN 60000 AND 86400000 THEN
    PERFORM identity.consume_runtime_audit_attempt();
    PERFORM identity.append_email_change_audit_internal(
      NULL,'identity.email_change.requested',NULL,p_source_context,false,'REQUEST_INVALID');
    RETURN QUERY SELECT 'DENIED'::text,NULL::timestamptz,NULL::jsonb,NULL::boolean;
    RETURN;
  END IF;
  PERFORM 1 FROM identity.lock_account_t9_internal(p_user_id,true);   -- the delegate's first lock, taken first
  SELECT * INTO v_window FROM identity.email_change_send_window WHERE user_id=p_user_id FOR UPDATE;
  IF v_window.user_id IS NOT NULL AND v_window.sends>=p_maximum_sends
     AND v_now-v_window.window_started_at<p_window_ms*interval '1 millisecond' THEN
    PERFORM identity.consume_runtime_audit_attempt();
    PERFORM identity.append_email_change_audit_internal(
      NULL,'identity.email_change.requested',NULL,p_source_context,false,'SEND_LIMIT');
    RETURN QUERY SELECT 'LIMIT'::text,NULL::timestamptz,NULL::jsonb,NULL::boolean;
    RETURN;
  END IF;
  -- 0079's request (with 0099's session ceiling) keeps every check it has and consumes the audit attempt itself
  SELECT * INTO v_result FROM identity.request_email_change_with_audit(
    p_user_id,p_session_id,p_grant_token_hash,p_email_change_id,p_new_email_blind_index,
    p_new_email_ciphertext,p_confirm_token_hash,p_cancel_token_hash,p_expires_at,p_source_context);
  IF v_result.result_status='PENDING' THEN
    INSERT INTO identity.email_change_send_window AS w(user_id,sends,window_started_at)
    VALUES (p_user_id,1,v_now)
    ON CONFLICT (user_id) DO UPDATE SET
      sends=CASE WHEN v_now-w.window_started_at>=p_window_ms*interval '1 millisecond' THEN 1 ELSE w.sends+1 END,
      window_started_at=CASE WHEN v_now-w.window_started_at>=p_window_ms*interval '1 millisecond'
        THEN v_now ELSE w.window_started_at END;
  END IF;
  RETURN QUERY SELECT v_result.result_status,v_result.result_expires_at,
    v_result.result_current_email_ciphertext,v_result.result_address_available;
END;
$$;

CREATE OR REPLACE FUNCTION identity.resend_email_change_bounded(
  p_user_id uuid,p_session_id uuid,p_confirm_token_hash text,p_expires_at timestamptz,
  p_cooldown_ms bigint,p_source_context jsonb,p_maximum_sends integer,p_window_ms bigint,p_link_ttl_ms bigint
)
RETURNS TABLE(
  result_status text,result_new_email_ciphertext jsonb,
  result_expires_at timestamptz,result_address_available boolean
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog,pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_account record;
  v_request identity.email_change_request%ROWTYPE;
  v_window identity.email_change_send_window%ROWTYPE;
  v_expires timestamptz;
  v_elapsed boolean;
BEGIN
  PERFORM identity.consume_runtime_audit_attempt();
  IF COALESCE(p_confirm_token_hash,'') !~ '^sha256:[0-9a-f]{64}$'
    OR p_cooldown_ms IS NULL OR p_cooldown_ms<1000 OR p_cooldown_ms>3600000
    OR p_expires_at IS NULL OR p_expires_at<=v_now OR p_expires_at>v_now+interval '25 hours'
    OR p_maximum_sends IS NULL OR p_maximum_sends NOT BETWEEN 1 AND 3
    OR p_window_ms IS NULL OR p_window_ms NOT BETWEEN 60000 AND 86400000
    OR p_link_ttl_ms IS NULL OR p_link_ttl_ms NOT BETWEEN 1 AND 90000000 THEN
    PERFORM identity.append_email_change_audit_internal(
      NULL,'identity.email_change.resent',NULL,p_source_context,false,'REQUEST_INVALID');
    RETURN QUERY SELECT 'NONE'::text,NULL::jsonb,NULL::timestamptz,NULL::boolean;
    RETURN;
  END IF;
  SELECT * INTO v_account FROM identity.lock_account_t9_internal(p_user_id,true);
  IF v_account.audit_token IS NOT NULL THEN
    PERFORM 1 FROM identity.session AS session
    WHERE session.session_id=p_session_id AND session.user_id=p_user_id
      AND session.revoked_at IS NULL
      AND session.idle_expires_at>v_now AND LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')>GREATEST(v_now,clock_timestamp())
    FOR KEY SHARE;
    IF FOUND THEN
      SELECT * INTO v_request FROM identity.email_change_request AS request
      WHERE request.user_id=p_user_id AND request.closed_at IS NULL
        AND request.expires_at>v_now
      FOR UPDATE;
    END IF;
  END IF;
  IF v_request.email_change_id IS NULL THEN
    PERFORM identity.append_email_change_audit_internal(
      NULL,'identity.email_change.resent',NULL,p_source_context,false,'NO_PENDING_CHANGE');
    RETURN QUERY SELECT 'NONE'::text,NULL::jsonb,NULL::timestamptz,NULL::boolean;
    RETURN;
  END IF;
  IF v_request.last_sent_at+make_interval(secs=>p_cooldown_ms/1000.0)>v_now THEN
    PERFORM identity.append_email_change_audit_internal(
      NULL,'identity.email_change.resent',NULL,p_source_context,false,'RESEND_COOLDOWN');
    RETURN QUERY SELECT 'COOLDOWN'::text,NULL::jsonb,NULL::timestamptz,NULL::boolean;
    RETURN;
  END IF;
  -- the clamp: never past the change's original issue time plus the link TTL; a lapsed change spends no budget
  v_expires:=LEAST(p_expires_at,v_request.issued_at+p_link_ttl_ms*interval '1 millisecond');
  IF v_expires<=v_now THEN
    PERFORM identity.append_email_change_audit_internal(
      NULL,'identity.email_change.resent',NULL,p_source_context,false,'PENDING_CHANGE_LAPSED');
    RETURN QUERY SELECT 'NONE'::text,NULL::jsonb,NULL::timestamptz,NULL::boolean;
    RETURN;
  END IF;
  -- the window the request shares: refuse while it is full, else count this send (a fresh window when it has elapsed)
  SELECT * INTO v_window FROM identity.email_change_send_window WHERE user_id=p_user_id FOR UPDATE;
  v_elapsed:=v_window.user_id IS NULL OR v_now-v_window.window_started_at>=p_window_ms*interval '1 millisecond';
  IF NOT v_elapsed AND v_window.sends>=p_maximum_sends THEN
    PERFORM identity.append_email_change_audit_internal(
      NULL,'identity.email_change.resent',NULL,p_source_context,false,'SEND_LIMIT');
    RETURN QUERY SELECT 'LIMIT'::text,NULL::jsonb,NULL::timestamptz,NULL::boolean;
    RETURN;
  END IF;
  INSERT INTO identity.email_change_send_window AS w(user_id,sends,window_started_at)
  VALUES (p_user_id,1,v_now)
  ON CONFLICT (user_id) DO UPDATE SET
    sends=CASE WHEN v_elapsed THEN 1 ELSE w.sends+1 END,
    window_started_at=CASE WHEN v_elapsed THEN v_now ELSE w.window_started_at END;
  UPDATE identity.email_change_request AS request
  SET confirm_token_hash=p_confirm_token_hash,last_sent_at=v_now,expires_at=v_expires
  WHERE request.email_change_id=v_request.email_change_id;
  PERFORM identity.append_email_change_audit_internal(
    v_account.audit_token,'identity.email_change.resent',v_request.email_change_id,
    p_source_context,true,NULL);
  RETURN QUERY SELECT 'RESENT'::text,v_request.new_email_ciphertext,v_expires,
    NOT EXISTS (
      SELECT 1 FROM identity."user" AS other
      WHERE other.email_blind_index=v_request.new_email_blind_index
    );
END;
$$;
REVOKE ALL ON FUNCTION
  identity.request_email_change_bounded(uuid,uuid,text,uuid,bytea,jsonb,text,text,timestamptz,jsonb,integer,bigint),
  identity.resend_email_change_bounded(uuid,uuid,text,timestamptz,bigint,jsonb,integer,bigint,bigint)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  identity.request_email_change_bounded(uuid,uuid,text,uuid,bytea,jsonb,text,text,timestamptz,jsonb,integer,bigint),
  identity.resend_email_change_bounded(uuid,uuid,text,timestamptz,bigint,jsonb,integer,bigint,bigint)
  TO debateai_authorization_runtime;

-- ==== [NV-08] Run-key provision cleanup skips owners the intent trigger refuses ====
-- 0040's core.claim_run_key_provision_cleanup moves every expired orphan intent it selects to RECONCILING, and the
-- intent's BEFORE UPDATE trigger identity.enforce_active_user_child refuses that write (55000 ACCOUNT_NOT_ACTIVE) when
-- the owner is no longer pending_verification, pending_mfa or active (age_frozen is terminal), so one such owner failed
-- the whole claim and no other owner's orphan was ever cleaned. This claim is 0040's plus the trigger's two refusals,
-- first as a candidate filter and then, under the account advisory lock and after the binding lock, as a re-check with
-- the trigger's own FOR KEY SHARE read: a refused owner's row is skipped and stays PREPARED. Every writer of a refused
-- state serialises with that re-check (the age freeze through lock_account_t9_internal's user-row FOR UPDATE,
-- 0085:564-569; the suspended writes under the same identity:account: advisory lock, 0110:356-358), so the claim's
-- write cannot meet the trigger's refusal; a state writer that takes neither lock would be a regression. It lives in
-- the new schema erasure_reconcile, owned by the migration owner, whose functions the release before's exact-count
-- witnesses do not count (content provision counts core; erasure counts identity, core and serve); the new release's
-- witness counts it by catalog OID. The 0040 claim keeps its grant for the release before.
CREATE SCHEMA IF NOT EXISTS erasure_reconcile;
GRANT USAGE ON SCHEMA erasure_reconcile TO debateai_content_provision;
CREATE OR REPLACE FUNCTION erasure_reconcile.claim_run_key_provision_cleanup(p_limit integer)
RETURNS TABLE(run_id uuid,user_id uuid,owner_ref uuid,claim_token uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE candidate record; v_claim_token uuid; v_now timestamptz := clock_timestamp();
BEGIN
  FOR candidate IN
    SELECT intent.run_id,intent.user_id
    FROM core.run_key_provision_intent AS intent
    JOIN identity."user" AS owner ON owner.user_id=intent.user_id
      AND owner.state IN ('pending_verification','pending_mfa','active')
    WHERE NOT EXISTS (SELECT 1 FROM core.run AS run WHERE run.run_id=intent.run_id)
      AND ((intent.cleanup_state='PREPARED' AND intent.expires_at<=v_now)
        OR (intent.cleanup_state='RECONCILING' AND intent.cleanup_claimed_at<=v_now-interval '5 minutes'))
      AND NOT EXISTS (SELECT 1 FROM identity.account_erasure_request AS request
        WHERE request.user_id=intent.user_id AND request.prepared_at IS NOT NULL
          AND request.committed_at IS NULL AND request.cancelled_at IS NULL)
    ORDER BY intent.requested_at,intent.run_id
    LIMIT GREATEST(0,LEAST(COALESCE(p_limit,100),100))
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('identity:account:'||candidate.user_id::text,0));
    PERFORM 1 FROM identity.run_execution_binding AS binding
    WHERE binding.run_id=candidate.run_id AND binding.user_id=candidate.user_id FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;
    -- The trigger's own read (0040:3369-3384). State writers serialise with it through the user-row FOR UPDATE of
    -- lock_account_t9_internal (0085:564-569) or the account advisory lock held above (see NV-08 Design).
    PERFORM 1 FROM identity."user" AS owner WHERE owner.user_id=candidate.user_id
      AND owner.state IN ('pending_verification','pending_mfa','active') FOR KEY SHARE;
    IF NOT FOUND THEN CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM identity.account_erasure_request AS request
      WHERE request.user_id=candidate.user_id AND request.prepared_at IS NOT NULL
        AND request.committed_at IS NULL AND request.cancelled_at IS NULL) THEN CONTINUE; END IF;
    v_claim_token := gen_random_uuid();
    RETURN QUERY
      UPDATE core.run_key_provision_intent AS intent SET
        cleanup_state='RECONCILING',cleanup_claim_token=v_claim_token,cleanup_claimed_at=v_now
      WHERE intent.run_id=candidate.run_id AND intent.user_id=candidate.user_id
        AND NOT EXISTS (SELECT 1 FROM core.run AS run WHERE run.run_id=intent.run_id)
        AND ((intent.cleanup_state='PREPARED' AND intent.expires_at<=v_now)
          OR (intent.cleanup_state='RECONCILING' AND intent.cleanup_claimed_at<=v_now-interval '5 minutes'))
      RETURNING intent.run_id,intent.user_id,intent.owner_ref,v_claim_token;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION erasure_reconcile.claim_run_key_provision_cleanup(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION erasure_reconcile.claim_run_key_provision_cleanup(integer) TO debateai_content_provision;
-- What this section promises, checked when it applies: the claim and the schema are owned by the migration executor,
-- as 0040's claim is (a schema someone else made first would pass IF NOT EXISTS, and its owner could replace the
-- functions in it); the claim is a VOLATILE definer with the pinned path; only debateai_content_provision may run it;
-- neither PUBLIC nor debateai_runtime may use the schema.
DO $$
DECLARE
  v_claim oid := to_regprocedure('erasure_reconcile.claim_run_key_provision_cleanup(integer)');
  v_legacy oid := to_regprocedure('core.claim_run_key_provision_cleanup(integer)');
  v_schema oid := to_regnamespace('erasure_reconcile');
BEGIN
  IF v_claim IS NULL OR v_legacy IS NULL OR v_schema IS NULL OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS claim
    JOIN pg_catalog.pg_proc AS legacy ON legacy.oid=v_legacy
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=v_schema
    WHERE claim.oid=v_claim
      AND claim.proowner=(SELECT role.oid FROM pg_catalog.pg_roles AS role WHERE role.rolname=current_user)
      AND claim.proowner=legacy.proowner AND claim.proowner=namespace.nspowner
      AND claim.prosecdef AND claim.provolatile='v'
      AND claim.proconfig=ARRAY['search_path=pg_catalog, pg_temp']
      AND NOT has_function_privilege('public',claim.oid,'EXECUTE')
      AND has_function_privilege('debateai_content_provision',claim.oid,'EXECUTE')
      AND NOT has_function_privilege('debateai_runtime',claim.oid,'EXECUTE')
      AND NOT has_function_privilege('debateai_erasure_runtime',claim.oid,'EXECUTE')
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.aclexplode(coalesce(namespace.nspacl,pg_catalog.acldefault('n',namespace.nspowner))) AS item
        WHERE item.grantee=0
      )
      AND NOT has_schema_privilege('debateai_runtime',namespace.oid,'USAGE')
  ) THEN
    RAISE EXCEPTION 'SECURITY_FIXES_0125_NV08_DRIFT';
  END IF;
END $$;

-- ==== [NV-04] login TOTP: five attempts per round, an escalation level that a success keeps and a quiet day lowers ====
-- The login completion's TOTP guesses were budgeted only per challenge and per source, in process memory that every
-- API restart emptied, so each new challenge (password or provider first step) and each new source bought five more.
-- This section adds one durable row per (account, factor), which the new release's SessionService charges BEFORE the
-- code is checked, under the row lock: five admitted attempts per round; the next attempt closes a round of five
-- uncleared charges, raises the factor's level (cap 30) and sets a cooldown of p_base_lock_ms doubled per level, at
-- most p_max_lock_ms (24 h), counted from the round's last charge, and a cooldown that has already run out refuses
-- nothing. A TOTP success clears only the round's count (identity.totp_login_clear); the level falls one step per full
-- 24 h with no failure, so no lock is permanent. Recovery codes and passkeys never meet it. Two edges fail closed: a
-- failed best-effort clear leaves the success's charge counted as a failure (which also restarts the quiet-day clock),
-- and an admit arriving while a success is still being verified can close the round on that success's charge. A row
-- removed while the admit waited for its lock (an erasure) refuses with 23503, as the user FK does before the row
-- exists. 0099's completion is unchanged and consults nothing, so the release before skips the budget during the
-- upgrade window. Installer-owned, as the rest of the login family is (0099); EXECUTE for
-- debateai_authorization_runtime only. factor_id has no FK: a removed factor's row is inert (a new factor has a new
-- id) and goes with the account through the user_id cascade.
CREATE TABLE IF NOT EXISTS identity.totp_login_lockout (
  user_id uuid NOT NULL REFERENCES identity."user"(user_id) ON DELETE CASCADE,
  factor_id uuid NOT NULL,
  level integer NOT NULL CHECK (level BETWEEN 0 AND 30),
  level_at timestamptz NOT NULL,
  attempts integer NOT NULL CHECK (attempts >= 0),
  last_charged_at timestamptz,
  last_failure_at timestamptz,
  locked_until timestamptz,
  PRIMARY KEY (user_id, factor_id)
);
REVOKE ALL ON identity.totp_login_lockout FROM PUBLIC;
SELECT core.install_truncate_guard('identity.totp_login_lockout');

CREATE OR REPLACE FUNCTION identity.totp_login_admit(p_user uuid,p_factor uuid,p_max integer,p_base_lock_ms bigint,p_max_lock_ms bigint)
RETURNS TABLE(admitted boolean,retry_after_ms bigint)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  v_now timestamptz;
  r identity.totp_login_lockout%ROWTYPE;
  v_until timestamptz; v_failure timestamptz; v_anchor timestamptz; v_steps integer;
BEGIN
  IF p_user IS NULL OR p_factor IS NULL OR p_max IS NULL OR p_max NOT BETWEEN 1 AND 10
     OR p_base_lock_ms IS NULL OR p_base_lock_ms NOT BETWEEN 60000 AND 3600000
     OR p_max_lock_ms IS NULL OR p_max_lock_ms NOT BETWEEN p_base_lock_ms AND 86400000 THEN
    RAISE EXCEPTION 'TOTP_LOGIN_ADMIT_INVALID' USING ERRCODE = '22023';
  END IF;
  INSERT INTO identity.totp_login_lockout(user_id,factor_id,level,level_at,attempts)
  VALUES (p_user,p_factor,0,clock_timestamp(),0) ON CONFLICT (user_id,factor_id) DO NOTHING;
  SELECT * INTO r FROM identity.totp_login_lockout
  WHERE user_id = p_user AND factor_id = p_factor FOR UPDATE;
  -- the row went while this admit waited for its lock (an erasure): refuse, as the user FK does before it exists
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TOTP_LOGIN_ADMIT_ACCOUNT_GONE' USING ERRCODE = '23503';
  END IF;
  -- decide at the time the row lock was granted, not when the call began
  v_now := clock_timestamp();
  -- 0. a cooldown in force refuses, changing nothing
  IF r.locked_until > v_now THEN
    admitted := false;
    retry_after_ms := greatest(1, ceil(extract(epoch FROM r.locked_until - v_now) * 1000))::bigint;
    RETURN NEXT; RETURN;
  END IF;
  -- 1. p_max charged attempts with no success between them were failures: close that round, its
  --    cooldown counted from its last failure; a cooldown that has already run out refuses nothing
  IF r.attempts >= p_max THEN
    r.level := least(r.level + 1, 30);
    r.level_at := r.last_charged_at;
    r.last_failure_at := r.last_charged_at;
    r.attempts := 0;
    v_until := r.last_charged_at
      + least(p_max_lock_ms, (p_base_lock_ms * power(2, r.level - 1))::bigint) * interval '1 millisecond';
    IF v_until > v_now THEN
      UPDATE identity.totp_login_lockout
      SET level = r.level, level_at = r.level_at, last_failure_at = r.last_failure_at, attempts = 0,
          locked_until = v_until
      WHERE user_id = p_user AND factor_id = p_factor;
      admitted := false;
      retry_after_ms := greatest(1, ceil(extract(epoch FROM v_until - v_now) * 1000))::bigint;
      RETURN NEXT; RETURN;
    END IF;
  END IF;
  -- 2. decay: one level per full 24 hours with no failure (a success's own charge is never a failure)
  v_failure := CASE WHEN r.attempts > 0 THEN r.last_charged_at ELSE r.last_failure_at END;
  v_anchor := greatest(r.level_at, v_failure);
  v_steps := floor(extract(epoch FROM v_now - v_anchor) / 86400)::integer;
  IF v_steps > 0 AND r.level > 0 THEN
    r.level := greatest(0, r.level - v_steps);
    r.level_at := v_anchor + v_steps * interval '24 hours';
  END IF;
  -- 3. charge this attempt: a failure until a success clears the round
  UPDATE identity.totp_login_lockout
  SET level = r.level, level_at = r.level_at, last_failure_at = v_failure, attempts = r.attempts + 1,
      last_charged_at = v_now, locked_until = NULL
  WHERE user_id = p_user AND factor_id = p_factor;
  admitted := true; retry_after_ms := 0;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION identity.totp_login_clear(p_user uuid,p_factor uuid)
RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
  UPDATE identity.totp_login_lockout SET attempts = 0 WHERE user_id = p_user AND factor_id = p_factor;
$$;

REVOKE ALL ON FUNCTION identity.totp_login_admit(uuid,uuid,integer,bigint,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION identity.totp_login_clear(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.totp_login_admit(uuid,uuid,integer,bigint,bigint) TO debateai_authorization_runtime;
GRANT EXECUTE ON FUNCTION identity.totp_login_clear(uuid,uuid) TO debateai_authorization_runtime;

-- ==== [NV-38] recovery notice claims: lease from the claim's end, no lock waits ====
-- The backup-email and MFA-recovery claims (0116's backup_email_claim_notice, 0112's mfa_recovery_claim_notice, both
-- sealed by their steps' postcondition digests) fix t before their dead-letter UPDATEs and ordered SELECTs and set
-- lease_until=t+p_lease after them, so time spent scanning retained history or waiting on a row another claim or finish
-- holds comes out of the lease; the MFA claim's follow-up locale read (identity.mail_locale_of_mfa_claim) then refuses
-- an expired lease and ends the drain. These two claims, which the new release's repository calls instead (op
-- claim_pending_notice), keep the arguments, result shape and staleness rules of the sealed ones, and: take the lease
-- from the clock after every scan and check; dead-letter stale notices in one statement over the ids it can lock
-- without waiting (FOR UPDATE OF s SKIP LOCKED), so a claim never waits on or deadlocks with another claimer or a
-- finish; re-check a PROOF's control just before claiming it, since a stale PROOF the sweep skipped can be unlocked by
-- then (the MFA loop keeps 0112's cap of 64; the backup loop gets the same cap); and the MFA claim returns mail_locale
-- itself, as the backup and password-reset claims do. plan_cache_mode=force_custom_plan keeps a backend from reusing a
-- generic sequential-scan plan built while a table was small. The pending-only due indexes that bound every claim's
-- reads are the outside-transaction steps 0126-0128 (a concurrent build cannot run in this step's transaction). The
-- sealed claims and mail_locale_of_mfa_claim keep their grants for the release before.
CREATE OR REPLACE FUNCTION identity.backup_email_claim_pending_notice(p_lease integer) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET plan_cache_mode=force_custom_plan AS $$
DECLARE n identity.backup_email_notice%ROWTYPE;l uuid;t timestamptz;v integer;BEGIN
 IF p_lease IS NULL OR p_lease NOT BETWEEN 1000 AND 60000 THEN RAISE EXCEPTION 'EMAIL_NOTICE_LEASE_INVALID';END IF;t:=clock_timestamp();
 -- ARRAY(...) is an initplan run once; `= ANY($array)` then probes the primary key, whatever the statistics say.
 UPDATE identity.backup_email_notice a SET dead_at=t WHERE a.notice_id=ANY(ARRAY(SELECT s.notice_id FROM identity.backup_email_notice s
  WHERE s.event_kind='PROOF' AND s.sent_at IS NULL AND s.dead_at IS NULL
   AND NOT EXISTS(SELECT 1 FROM identity.backup_email_control c WHERE c.challenge_id=s.challenge_id AND c.stage='EMAIL_REQUIRED' AND c.expires_at>t)
  FOR UPDATE OF s SKIP LOCKED));
 FOR v IN 1..64 LOOP
  SELECT * INTO n FROM identity.backup_email_notice WHERE sent_at IS NULL AND dead_at IS NULL AND available_at<=t AND(lease_until IS NULL OR lease_until<=t) ORDER BY created_at,notice_id LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF n.notice_id IS NULL THEN RETURN NULL;END IF;
  EXIT WHEN n.event_kind<>'PROOF' OR EXISTS(SELECT 1 FROM identity.backup_email_control c WHERE c.challenge_id=n.challenge_id AND c.stage='EMAIL_REQUIRED' AND c.expires_at>clock_timestamp());
  UPDATE identity.backup_email_notice SET dead_at=clock_timestamp() WHERE notice_id=n.notice_id;n:=NULL;
 END LOOP;
 IF n.notice_id IS NULL THEN RETURN NULL;END IF;l:=gen_random_uuid();
 UPDATE identity.backup_email_notice SET lease_id=l,lease_until=clock_timestamp()+(p_lease*interval '1 millisecond'),attempts=attempts+1 WHERE notice_id=n.notice_id;
 RETURN jsonb_build_object('noticeId',n.notice_id,'leaseId',l,'userId',n.user_id,'channelId',n.channel_id,'event',n.event_kind,'payload',n.payload_ciphertext,'expiresAt',(SELECT expires_at FROM identity.backup_email_control WHERE challenge_id=n.challenge_id),'mail_locale',n.mail_locale);
END $$;

CREATE OR REPLACE FUNCTION identity.mfa_recovery_claim_pending_notice(p_lease integer) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET plan_cache_mode=force_custom_plan AS $$
DECLARE n identity.mfa_recovery_notice%ROWTYPE;l uuid;t timestamptz;v integer;BEGIN
 IF p_lease IS NULL OR p_lease NOT BETWEEN 1000 AND 60000 THEN RAISE EXCEPTION 'EMAIL_NOTICE_LEASE_INVALID';END IF;t:=clock_timestamp();
 -- 0112:328/331/332 in one statement, skipping rows another claim or finish holds.
 UPDATE identity.mfa_recovery_notice a SET dead_at=t WHERE a.notice_id=ANY(ARRAY(SELECT s.notice_id FROM identity.mfa_recovery_notice s
  WHERE s.sent_at IS NULL AND s.dead_at IS NULL AND(
   (s.event_kind='PROOF' AND NOT EXISTS(SELECT 1 FROM identity.mfa_recovery_control c WHERE c.challenge_id=s.challenge_id AND c.stage='EMAIL_REQUIRED' AND c.expires_at>t))
   OR(s.event_kind='WAITING' AND NOT EXISTS(SELECT 1 FROM identity.mfa_recovery_control c WHERE c.challenge_id=s.challenge_id AND c.stage='WAITING'))
   OR(s.event_kind='FINISH' AND NOT EXISTS(SELECT 1 FROM identity.mfa_recovery_control c WHERE c.challenge_id=s.challenge_id AND c.stage='WAITING' AND c.expires_at>t)))
  FOR UPDATE OF s SKIP LOCKED));
 FOR v IN 1..64 LOOP
  SELECT * INTO n FROM identity.mfa_recovery_notice WHERE sent_at IS NULL AND dead_at IS NULL AND available_at<=t AND(lease_until IS NULL OR lease_until<=t) ORDER BY created_at,notice_id LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF n.notice_id IS NULL THEN RETURN NULL;END IF;
  EXIT WHEN CASE WHEN n.event_kind='PROOF' THEN EXISTS(SELECT 1 FROM identity.mfa_recovery_control c WHERE c.challenge_id=n.challenge_id AND c.stage='EMAIL_REQUIRED' AND c.expires_at>clock_timestamp())
   WHEN n.event_kind IN('WAITING','FINISH') THEN (identity.mfa_recovery_waiting_current(n.challenge_id)).challenge_id IS NOT NULL ELSE true END;
  UPDATE identity.mfa_recovery_notice SET dead_at=clock_timestamp() WHERE notice_id=n.notice_id;n:=NULL;
 END LOOP;
 IF n.notice_id IS NULL THEN RETURN NULL;END IF;l:=gen_random_uuid();
 UPDATE identity.mfa_recovery_notice SET lease_id=l,lease_until=clock_timestamp()+(p_lease*interval '1 millisecond'),attempts=attempts+1 WHERE notice_id=n.notice_id;
 RETURN jsonb_build_object('noticeId',n.notice_id,'leaseId',l,'userId',n.user_id,'channelId',n.channel_id,'event',n.event_kind,'cancelAllowed',n.event_kind IN('STARTED','WAITING') AND (identity.mfa_recovery_cancel_channel_current(n.user_id,n.channel_id) AND (SELECT cancel_authorized FROM identity.mfa_recovery_notice_binding WHERE challenge_id=n.challenge_id AND channel_id=n.channel_id)),'payload',CASE WHEN n.event_kind IN('STARTED','WAITING') AND NOT (identity.mfa_recovery_cancel_channel_current(n.user_id,n.channel_id) AND (SELECT cancel_authorized FROM identity.mfa_recovery_notice_binding WHERE challenge_id=n.challenge_id AND channel_id=n.channel_id)) THEN(SELECT payload_ciphertext FROM identity.mfa_recovery_notice_binding WHERE challenge_id=n.challenge_id AND channel_id=n.channel_id) ELSE n.payload_ciphertext END,'expiresAt',(SELECT expires_at FROM identity.mfa_recovery_control WHERE challenge_id=n.challenge_id))||CASE WHEN n.event_kind IN('WAITING','FINISH') THEN jsonb_build_object('notBefore',(SELECT not_before FROM identity.mfa_recovery_control WHERE challenge_id=n.challenge_id)) ELSE '{}'::jsonb END||jsonb_build_object('mail_locale',n.mail_locale);
END $$;

ALTER FUNCTION identity.backup_email_claim_pending_notice(integer) OWNER TO debateai_backup_email_owner;
ALTER FUNCTION identity.mfa_recovery_claim_pending_notice(integer) OWNER TO debateai_mfa_recovery_owner;
REVOKE ALL ON FUNCTION identity.backup_email_claim_pending_notice(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION identity.mfa_recovery_claim_pending_notice(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.backup_email_claim_pending_notice(integer) TO debateai_backup_email_runtime;
GRANT EXECUTE ON FUNCTION identity.mfa_recovery_claim_pending_notice(integer) TO debateai_mfa_recovery_runtime;

-- ==== [NV-07] restore fence: revoke before serving a restored database ====
-- Every restore path put back saved state and then served it: a session, step-up grant, login challenge, staff
-- privilege session, invitation or recovery revoked after the snapshot was live again, and nothing outside the
-- database could tell. The restore fence is a 32-byte token kept twice: this one row, which every dump and cold copy
-- carries, and a file on the API's host (RESTORE_FENCE_PATH), which no backup captures. The API settles both under
-- this row's lock at every boot, every minute while current and each time it becomes current
-- (apps/api/src/restore-fence.ts, packages/db/src/restore-fence.ts): it reads the file only once it holds the lock,
-- compares, and on any disagreement but "row and file both empty" (a fresh install, or the first boot that carries
-- 0125) revokes every long-lived bearer in one transaction and holds public reads; in every case it writes the next
-- token here and to the file before it commits. A crash between the file write and the commit leaves them
-- disagreeing, which the next settle treats as a restore: a spurious sign-out, never a missed restore. Only the owner,
-- as postgres, releases the hold (restore_fence_release_public_hold_v1). The table is new, has no grant, and only the
-- two definers and the owner's invoker call write it; the release before never reads it or calls them, and the rows
-- the settle closes keep the meanings it already handles (revoked, consumed, closed, EXPIRED).
CREATE TABLE IF NOT EXISTS identity.restore_fence (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  fence_token text CHECK (fence_token IS NULL OR fence_token ~ '^[A-Za-z0-9_-]{43}$'),
  advanced_at timestamptz,
  public_hold_since timestamptz,
  last_revoked_at timestamptz,
  last_revoked_counts jsonb CHECK (last_revoked_counts IS NULL OR jsonb_typeof(last_revoked_counts) = 'object'),
  public_hold_released_at timestamptz,
  public_hold_release_note text CHECK (public_hold_release_note IS NULL OR (char_length(public_hold_release_note) BETWEEN 1 AND 200 AND public_hold_release_note !~ '[[:cntrl:]]'))
);
INSERT INTO identity.restore_fence (singleton) VALUES (true) ON CONFLICT (singleton) DO NOTHING;
-- The settle's first statement: the row lock, taken before the API reads its host file, so two APIs on one host never
-- mistake each other's advance for a restore.
CREATE OR REPLACE FUNCTION identity.restore_fence_begin_v1() RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 PERFORM 1 FROM identity.restore_fence WHERE singleton FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='RESTORE_FENCE_MISSING';END IF;
END $$;
-- p_host_token: the file's token, 'MARKER' (an empty or non-token file: the operator's restore mark) or NULL (no file).
-- The revocation runs in this order: sessions first, because identity.bind_consumer_grant_generation (0100) refuses to
-- consume a grant whose session is still live under another token. The three recovery families close through their
-- own close functions on the EXPIRED path, which sends no notice and sets no retry lock (0103, 0104, 0106); a pending
-- backup-email proof expires as identity.backup_email_expire does (0105). Ceremony handles of 15 minutes or less die
-- with their session or their own expiry and are left alone.
CREATE OR REPLACE FUNCTION identity.restore_fence_settle_v1(p_host_token text,p_next_token text)
RETURNS TABLE(settle_outcome text,settle_public_hold boolean,settle_revoked jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE f identity.restore_fence%ROWTYPE;v_now timestamptz;v_outcome text;v_counts jsonb:='{}'::jsonb;v_n bigint;v_id uuid;
BEGIN
 IF p_next_token IS NULL OR p_next_token !~ '^[A-Za-z0-9_-]{43}$'
  OR NOT (p_host_token IS NULL OR p_host_token='MARKER' OR p_host_token ~ '^[A-Za-z0-9_-]{43}$')
  OR p_next_token IS NOT DISTINCT FROM p_host_token THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='RESTORE_FENCE_TOKEN_INVALID';END IF;
 SELECT * INTO f FROM identity.restore_fence WHERE singleton FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='RESTORE_FENCE_MISSING';END IF;
 IF p_next_token IS NOT DISTINCT FROM f.fence_token THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='RESTORE_FENCE_TOKEN_INVALID';END IF;
 v_now:=clock_timestamp();
 IF f.fence_token IS NULL AND p_host_token IS NULL THEN v_outcome:='INITIALISED';
 ELSIF f.fence_token=p_host_token THEN v_outcome:='ADVANCED';
 ELSE
  v_outcome:='RESTORE_REVOKED';
  UPDATE identity.session SET revoked_at=GREATEST(v_now,created_at) WHERE revoked_at IS NULL;
  GET DIAGNOSTICS v_n=ROW_COUNT;v_counts:=v_counts||jsonb_build_object('sessions',v_n);
  UPDATE staff.privilege_session SET revoked_at=GREATEST(v_now,created_at) WHERE revoked_at IS NULL;
  GET DIAGNOSTICS v_n=ROW_COUNT;v_counts:=v_counts||jsonb_build_object('privilegeSessions',v_n);
  UPDATE identity.step_up_grant SET consumed_at=GREATEST(v_now,issued_at) WHERE consumed_at IS NULL AND expires_at>v_now;
  GET DIAGNOSTICS v_n=ROW_COUNT;v_counts:=v_counts||jsonb_build_object('stepUpGrants',v_n);
  UPDATE identity.login_challenge SET consumed_at=GREATEST(v_now,created_at) WHERE consumed_at IS NULL AND expires_at>v_now;
  GET DIAGNOSTICS v_n=ROW_COUNT;v_counts:=v_counts||jsonb_build_object('loginChallenges',v_n);
  UPDATE staff.invitation SET revoked_at=GREATEST(v_now,created_at) WHERE revoked_at IS NULL AND consumed_at IS NULL AND expires_at>v_now;
  GET DIAGNOSTICS v_n=ROW_COUNT;v_counts:=v_counts||jsonb_build_object('staffInvitations',v_n);
  UPDATE identity.email_change_request SET closed_at=GREATEST(v_now,issued_at),outcome='CANCELLED' WHERE closed_at IS NULL;
  GET DIAGNOSTICS v_n=ROW_COUNT;v_counts:=v_counts||jsonb_build_object('emailChanges',v_n);
  UPDATE identity.recovery_email_request SET closed_at=GREATEST(v_now,issued_at),outcome='EXPIRED' WHERE closed_at IS NULL;
  GET DIAGNOSTICS v_n=ROW_COUNT;v_counts:=v_counts||jsonb_build_object('recoveryEmails',v_n);
  v_n:=0;
  FOR v_id IN SELECT recovery_request_id FROM identity.password_recovery_control
    WHERE stage NOT IN('COMPLETED','CANCELLED','REFUSED','EXPIRED') ORDER BY recovery_request_id LOOP
   PERFORM identity.password_recovery_close(v_id,'EXPIRED');v_n:=v_n+1;
  END LOOP;
  v_counts:=v_counts||jsonb_build_object('passwordRecoveries',v_n);
  v_n:=0;
  FOR v_id IN SELECT challenge_id FROM identity.mfa_recovery_control
    WHERE stage NOT IN('COMPLETED','CANCELLED','REFUSED','EXPIRED') ORDER BY challenge_id LOOP
   PERFORM identity.mfa_recovery_close(v_id,'EXPIRED');v_n:=v_n+1;
  END LOOP;
  v_counts:=v_counts||jsonb_build_object('mfaRecoveries',v_n);
  v_n:=0;
  FOR v_id IN SELECT recovery_request_id FROM identity.password_reset_control
    WHERE stage NOT IN('COMPLETED','CANCELLED','REFUSED','EXPIRED') ORDER BY recovery_request_id LOOP
   PERFORM identity.password_reset_close(v_id,'EXPIRED');v_n:=v_n+1;
  END LOOP;
  v_counts:=v_counts||jsonb_build_object('passwordResets',v_n);
  UPDATE identity.backup_email_control SET stage='EXPIRED' WHERE stage='EMAIL_REQUIRED';
  GET DIAGNOSTICS v_n=ROW_COUNT;v_counts:=v_counts||jsonb_build_object('backupEmails',v_n);
  UPDATE identity.restore_fence SET public_hold_since=COALESCE(public_hold_since,v_now),last_revoked_at=v_now,last_revoked_counts=v_counts
   WHERE singleton;
 END IF;
 UPDATE identity.restore_fence SET fence_token=p_next_token,advanced_at=v_now WHERE singleton;
 RETURN QUERY SELECT v_outcome,r.public_hold_since IS NOT NULL,CASE WHEN v_outcome='RESTORE_REVOKED' THEN v_counts ELSE '{}'::jsonb END
  FROM identity.restore_fence r WHERE r.singleton;
END $$;
-- The owner's call, as postgres (no grant): ends the public hold once the post-artefact changes are re-applied.
CREATE OR REPLACE FUNCTION identity.restore_fence_release_public_hold_v1(p_note text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_n bigint;BEGIN
 IF p_note IS NULL OR char_length(p_note) NOT BETWEEN 1 AND 200 OR p_note ~ '[[:cntrl:]]' THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='RESTORE_FENCE_NOTE_INVALID';END IF;
 UPDATE identity.restore_fence SET public_hold_since=NULL,public_hold_released_at=clock_timestamp(),public_hold_release_note=p_note
  WHERE singleton AND public_hold_since IS NOT NULL;
 GET DIAGNOSTICS v_n=ROW_COUNT;
 RETURN v_n=1;
END $$;
-- n1: reviewed sets the owner of NV-07's new table and three new functions to identity.authenticate_session_t9's owner (as 0087 does), refusing a non-superuser owner; the release before never reads or calls them
DO $nv07_owner$ DECLARE v_owner name; BEGIN
  SELECT pg_get_userbyid(proowner) INTO v_owner FROM pg_proc WHERE oid='identity.authenticate_session_t9(text,text,timestamptz,timestamptz)'::regprocedure;
  -- The RESTORE_REVOKED branch updates staff.* and calls the recovery close functions; only a superuser definer may.
  -- Refuse here, at migrate time, rather than at the first real restore.
  IF v_owner IS NULL OR NOT COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname=v_owner),false) THEN
    RAISE EXCEPTION 'RESTORE_FENCE_OWNER_NOT_SUPERUSER' USING ERRCODE='42501';
  END IF;
  EXECUTE format('ALTER TABLE identity.restore_fence OWNER TO %I',v_owner);
  EXECUTE format('ALTER FUNCTION identity.restore_fence_begin_v1() OWNER TO %I',v_owner);
  EXECUTE format('ALTER FUNCTION identity.restore_fence_settle_v1(text,text) OWNER TO %I',v_owner);
  EXECUTE format('ALTER FUNCTION identity.restore_fence_release_public_hold_v1(text) OWNER TO %I',v_owner);
END $nv07_owner$;
REVOKE ALL ON FUNCTION identity.restore_fence_begin_v1(), identity.restore_fence_settle_v1(text,text),
  identity.restore_fence_release_public_hold_v1(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.restore_fence_begin_v1(), identity.restore_fence_settle_v1(text,text)
  TO debateai_authorization_runtime;

-- ==== [NV-17] password reset: five proofs per account per round, cooldown doubling from 300 s to 24 h ====
-- 0104's identity.password_reset_close writes no retry lock and the reset start gates (0104 eligible, 0108's sealed
-- prepare and start) check only that no binding is open, so a REFUSED, CANCELLED or EXPIRED attempt was followed at
-- once by a fresh one, and the release's complete matched a code before it recorded the failure (check-then-record).
-- This section adds one per-account counter and four entry points that the new release's
-- PostgresPasswordResetRepository calls instead (start, reserveProof, proofRefused, complete). The counter is charged
-- when a proof is reserved, before the code is matched, across all of the account's attempts however each closes; at
-- every multiple of the attempt's proof_failures_per_attempt (5) it locks new starts and further proofs for
-- p_lock_ms (60 s to 1 h, the release passes 300 s) doubled per round, at most 24 hours; a completed reset deletes the
-- row, and account erasure removes it through the cascade. Every function runs under the account's security-subject
-- lock (0085's re-entrant advisory transaction lock, the one the reset bodies take first) and reads the counter row
-- FOR UPDATE, so one account's reservations serialize and a start cannot pass while a concurrent reservation locks.
-- The reservation only counts and refuses: a refused reservation closes nothing, so a correct code reserved just
-- before it still completes; the settle of a mismatch closes the attempt REFUSED at the cap or under the lock. The
-- 0104/0108 functions are unchanged and keep their grants for the release before, whose traffic neither reads nor
-- charges the counter. Owned by debateai_password_reset_owner, as the reset family is; TRUNCATE-guarded, no grantee.
CREATE TABLE IF NOT EXISTS identity.password_reset_retry_lock (
  user_id uuid PRIMARY KEY REFERENCES identity."user"(user_id) ON DELETE CASCADE,
  attempts integer NOT NULL CHECK (attempts >= 0),
  locked_until timestamptz
);
SELECT core.install_truncate_guard('identity.password_reset_retry_lock');
ALTER TABLE identity.password_reset_retry_lock OWNER TO debateai_password_reset_owner;
REVOKE ALL ON identity.password_reset_retry_lock FROM PUBLIC;

CREATE OR REPLACE FUNCTION identity.password_reset_start_guarded(p_index bytea,p_candidate uuid,p_channels uuid[],p_refs jsonb,p_link text,p_cancel text,p_notices jsonb,p_source jsonb,p_register bigint)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE u uuid;BEGIN
 PERFORM identity.password_reset_rules(p_register);              -- the delegate's refusal of a bad register, first
 SELECT user_id INTO u FROM identity."user" WHERE email_blind_index=p_index;
 IF u IS NOT NULL THEN
  PERFORM identity.lock_security_subjects(ARRAY[u]);             -- the lock password_reset_start takes first
  IF EXISTS(SELECT 1 FROM identity.password_reset_retry_lock WHERE user_id=u AND locked_until>clock_timestamp()) THEN
   PERFORM identity.password_reset_audit(NULL,'started',p_source,false);RETURN false;   -- the delegate's own denial
  END IF;
 END IF;
 RETURN identity.password_reset_start(p_index,p_candidate,p_channels,p_refs,p_link,p_cancel,p_notices,p_source,p_register);
END $$;

CREATE OR REPLACE FUNCTION identity.password_reset_proof_reserve(p_session text,p_source jsonb,p_lock_ms bigint)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE c identity.password_reset_control%ROWTYPE;l identity.password_reset_retry_lock%ROWTYPE;
 cap integer;t timestamptz;n integer;v_until timestamptz;BEGIN
 IF p_lock_ms IS NULL OR p_lock_ms NOT BETWEEN 60000 AND 3600000 THEN RAISE EXCEPTION 'PASSWORD_RESET_LOCK_INVALID';END IF;
 c:=identity.password_reset_current(p_session);                  -- subject lock + control FOR UPDATE; NULL when not live
 IF c.recovery_request_id IS NULL OR c.stage<>'PASSWORD_REQUIRED' THEN RETURN jsonb_build_object('status','INVALID');END IF;
 cap:=(c.policy->>'proof_failures_per_attempt')::integer;t:=clock_timestamp();
 INSERT INTO identity.password_reset_retry_lock(user_id,attempts,locked_until) VALUES(c.user_id,0,NULL)
 ON CONFLICT (user_id) DO NOTHING;
 SELECT * INTO l FROM identity.password_reset_retry_lock WHERE user_id=c.user_id FOR UPDATE;
 IF c.failures>=cap OR l.locked_until>t THEN
  -- refused without closing: a reservation still in flight settles the attempt (a correct code completes it)
  PERFORM identity.password_reset_audit(c.recovery_request_id,'proof',p_source,false);
  RETURN jsonb_build_object('status','REFUSED');
 END IF;
 UPDATE identity.password_reset_control SET failures=failures+1 WHERE recovery_request_id=c.recovery_request_id;
 n:=l.attempts+1;v_until:=NULL;
 IF n%cap=0 THEN v_until:=t+least(86400000,(p_lock_ms*power(2,least(n/cap-1,30)))::bigint)*interval '1 millisecond';END IF;
 UPDATE identity.password_reset_retry_lock SET attempts=n,locked_until=v_until WHERE user_id=c.user_id;
 RETURN jsonb_build_object('status','READY','userId',c.user_id,'factorId',c.factor_id,'factorSecret',c.factor_snapshot,
  'lastAcceptedStep',(SELECT last_accepted_step FROM identity.mfa_factor WHERE mfa_factor_id=c.factor_id),
  'nowMs',floor(extract(epoch FROM clock_timestamp())*1000));
END $$;

CREATE OR REPLACE FUNCTION identity.password_reset_proof_refused(p_session text,p_source jsonb)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE c identity.password_reset_control%ROWTYPE;BEGIN
 c:=identity.password_reset_current(p_session);
 IF c.recovery_request_id IS NULL OR c.stage<>'PASSWORD_REQUIRED' THEN RETURN;END IF;   -- as password_reset_failure
 IF c.failures>=(c.policy->>'proof_failures_per_attempt')::integer
  OR EXISTS(SELECT 1 FROM identity.password_reset_retry_lock WHERE user_id=c.user_id AND locked_until>clock_timestamp())
 THEN PERFORM identity.password_reset_close(c.recovery_request_id,'REFUSED');END IF;
 PERFORM identity.password_reset_audit(c.recovery_request_id,'proof',p_source,false);
END $$;

CREATE OR REPLACE FUNCTION identity.password_reset_complete_guarded(p_session text,p_password text,p_factor uuid,p_secret jsonb,p_last bigint,p_step bigint,p_source jsonb)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE r text;u uuid;BEGIN
 r:=identity.password_reset_complete(p_session,p_password,p_factor,p_secret,p_last,p_step,p_source);
 IF r='COMPLETED' THEN
  SELECT user_id INTO u FROM identity.password_reset_control WHERE session_hash=p_session AND stage='COMPLETED';
  DELETE FROM identity.password_reset_retry_lock WHERE user_id=u;   -- still under the delegate's subject lock
 END IF;
 RETURN r;
END $$;

ALTER FUNCTION identity.password_reset_start_guarded(bytea,uuid,uuid[],jsonb,text,text,jsonb,jsonb,bigint) OWNER TO debateai_password_reset_owner;
ALTER FUNCTION identity.password_reset_proof_reserve(text,jsonb,bigint) OWNER TO debateai_password_reset_owner;
ALTER FUNCTION identity.password_reset_proof_refused(text,jsonb) OWNER TO debateai_password_reset_owner;
ALTER FUNCTION identity.password_reset_complete_guarded(text,text,uuid,jsonb,bigint,bigint,jsonb) OWNER TO debateai_password_reset_owner;
REVOKE ALL ON FUNCTION identity.password_reset_start_guarded(bytea,uuid,uuid[],jsonb,text,text,jsonb,jsonb,bigint),
  identity.password_reset_proof_reserve(text,jsonb,bigint),identity.password_reset_proof_refused(text,jsonb),
  identity.password_reset_complete_guarded(text,text,uuid,jsonb,bigint,bigint,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.password_reset_start_guarded(bytea,uuid,uuid[],jsonb,text,text,jsonb,jsonb,bigint),
  identity.password_reset_proof_reserve(text,jsonb,bigint),identity.password_reset_proof_refused(text,jsonb),
  identity.password_reset_complete_guarded(text,text,uuid,jsonb,bigint,bigint,jsonb) TO debateai_password_reset_runtime;

-- ==== [NV-13] untrusted social sign-up links no provider; a pending link answers like none ====
-- 0112's identity.create_social_account returned 'collision' for a typed address another account owns before it
-- linked the caller's provider subject, and linked it to the new pending_verification account for a free address, so
-- the next callback (0116's identity.finish_social_callback: SOCIAL_FLOW_INVALID for a subject linked to a non-active
-- account, signup_required for an unlinked one), the next completion and LINK told the caller whether the typed address
-- was registered, behind the uniform 202. Those bodies, and 0101's identity.require_social_password_origin, are sealed
-- (0112's and 0116's postcondition digests; the N-1 rule refuses replacing an earlier function), so this section adds
-- three functions the new release calls instead:
--   identity.create_social_account_v2  0112's body with the provider link moved under IF trusted (and trusted computed
--                                      just after the collision return): an untrusted typed-email sign-up creates its
--                                      pending account with a NULL password and no link, whether the typed address
--                                      was registered or free; the trusted arm keeps its link and enrolment. The API
--                                      writes the untrusted arm's region row through 0095's pending-only helper.
--   identity.finish_social_callback_v2 0116's body with its LOGIN branch taken only when the linked account is not
--                                      pending_verification, so a link an older instance (or a sign-up before this
--                                      step) made to a pending account answers signup_required like no link; the
--                                      completion then meets 0112's early return for a linked subject and creates
--                                      nothing.
--   identity.require_social_password_origin_v2  0101's origin check, which also admits a NULL-password, link-less row
--                                      while it is pending_verification (verification sets the password in the same
--                                      transaction in the new release; the trusted arm links before COMMIT).
-- One reviewed swap moves 0101's two constraint triggers onto the v2 check, with the same names, tables, events and
-- deferral. The v2 check refuses a strict subset of what 0101's refused, so every write of the release before still
-- passes. The swap is the section's last DDL; each DROP TRIGGER holds ACCESS EXCLUSIVE on its table until the step
-- commits. Every new function is owned by the migration executor (the installer, which owns the identity family and
-- the functions superseded here), checked below with the trigger binding. The 0101, 0112 and 0116 functions keep their
-- grants for the release before.
CREATE OR REPLACE FUNCTION identity.require_social_password_origin_v2() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE u uuid:=CASE WHEN TG_OP='DELETE' THEN OLD.user_id ELSE NEW.user_id END;BEGIN
 IF EXISTS(SELECT 1 FROM identity."user" WHERE user_id=u AND password_hash IS NULL AND state<>'pending_verification') AND NOT EXISTS(SELECT 1 FROM identity.social_identity WHERE user_id=u) THEN RAISE EXCEPTION 'PASSWORD_REQUIRED';END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION identity.require_social_password_origin_v2() FROM PUBLIC;
CREATE OR REPLACE FUNCTION identity.create_social_account_v2(p jsonb,p_source jsonb) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE f identity.social_flow%ROWTYPE;r record;phone jsonb:=NULLIF(p->'phoneCiphertext','null'::jsonb);u uuid:=(p->>'userId')::uuid;existing_user uuid;sid uuid;t timestamptz;trusted boolean;BEGIN
 SELECT * INTO f FROM identity.social_flow WHERE proof_hash=p->>'proofHash';
 SELECT user_id INTO existing_user FROM identity."user" WHERE email_blind_index=decode(p->>'emailBlindIndex','hex');
 PERFORM identity.lock_security_subjects(ARRAY(SELECT DISTINCT x FROM unnest(ARRAY[u,existing_user]) x WHERE x IS NOT NULL ORDER BY x));
 PERFORM pg_advisory_xact_lock(hashtextextended('identity.social_subject:'||f.provider||':'||f.issuer||':'||f.app_scope||':'||f.subject,0));
 SELECT * INTO f FROM identity.social_flow WHERE proof_hash=p->>'proofHash' FOR UPDATE;
 IF f.state_hash IS NULL OR f.purpose<>'LOGIN' OR f.subject IS NULL OR f.consumed_at IS NOT NULL OR f.expires_at<=clock_timestamp()
 OR f.continuation_cookie_hash IS DISTINCT FROM p->>'browserHash' OR f.binding_hash IS DISTINCT FROM p->>'bindingHash' OR NOT COALESCE(p->'admittedProviders' ? f.configuration,false)
 OR p->>'passwordHash' IS NOT NULL THEN RAISE EXCEPTION 'SOCIAL_FLOW_INVALID';END IF;
 IF EXISTS(SELECT 1 FROM identity.social_identity WHERE provider=f.provider AND issuer=f.issuer AND app_scope=f.app_scope AND subject=f.subject) THEN
  PERFORM identity.consume_runtime_audit_attempt();UPDATE identity.social_flow SET consumed_at=clock_timestamp() WHERE state_hash=f.state_hash;
  PERFORM identity.append_social_audit_internal(gen_random_uuid(),'SIGNUP_PROOF',p_source);RETURN jsonb_build_object('status','collision');END IF;
 SELECT * INTO r FROM identity.create_pending_account_consent_base_internal(u,decode(p->>'emailBlindIndex','hex'),p->'emailCiphertext',NULL,NULL,p->>'pseudonym',(p->>'occurredAt')::timestamptz,(p->>'occurredAt')::timestamptz,p->>'verificationTokenHash',(p->>'verificationTokenTtlMs')::bigint,p_source,phone,CASE WHEN phone IS NULL THEN NULL ELSE 'manual' END,CASE WHEN phone IS NULL THEN NULL ELSE 'unverified' END,CASE WHEN phone IS NULL THEN NULL ELSE (p->>'occurredAt')::timestamptz END,(p->>'minAgeApplied')::smallint,p->>'countryCode',p->>'ruleVersion',p->'acceptances');
 IF r.status='PSEUDONYM_COLLISION' THEN RETURN jsonb_build_object('status','pseudonym_collision');END IF;
 UPDATE identity.social_flow SET consumed_at=clock_timestamp() WHERE state_hash=f.state_hash;
 IF r.status<>'CREATED' THEN RETURN jsonb_build_object('status','collision');END IF;
 trusted:=f.asserted_email_index IS NOT NULL AND f.asserted_email_index=decode(p->>'emailBlindIndex','hex');t:=clock_timestamp();
 IF trusted THEN
  INSERT INTO identity.social_identity(user_id,provider,issuer,app_scope,subject,configuration) VALUES(u,f.provider,f.issuer,f.app_scope,f.subject,f.configuration) RETURNING social_identity_id INTO sid;
  DELETE FROM identity.verification_delivery_reservation WHERE reservation_id=r.reservation_id;
  DELETE FROM identity.verification_token_credential WHERE token_hash=p->>'verificationTokenHash';
  UPDATE identity.channel_binding SET state='verified',verified_at=t,verification_token_hash=NULL,verification_expires_at=NULL,verification_last_sent_at=NULL,delivery_status='not_requested' WHERE channel_binding_id=r.channel_binding_id;
  UPDATE identity."user" SET state='pending_mfa' WHERE user_id=u;
  INSERT INTO identity.social_enrollment(token_hash,user_id,channel_binding_id,social_identity_id,cookie_hash,binding_hash,security_epoch,created_at,expires_at)
  VALUES(p->>'socialEnrollmentHash',u,r.channel_binding_id,sid,p->>'browserHash',f.binding_hash,COALESCE((SELECT security_epoch FROM identity.account_security_hold WHERE user_id=u),0),t,f.expires_at);
  PERFORM identity.append_social_audit_internal((SELECT audit_token FROM identity."user" WHERE user_id=u),'INITIAL_ENROLLMENT',p_source);
 END IF;
 IF f.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'SOCIAL_FLOW_INVALID';END IF;
 RETURN jsonb_build_object('status',CASE WHEN trusted THEN 'enrollment' ELSE 'created' END,'userId',u,'channelBindingId',r.channel_binding_id,'reservationId',r.reservation_id,'verificationExpiresAt',CASE WHEN trusted THEN f.expires_at ELSE r.verification_expires_at END);
END $$;
REVOKE ALL ON FUNCTION identity.create_social_account_v2(jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.create_social_account_v2(jsonb,jsonb) TO debateai_billing_runtime;
CREATE OR REPLACE FUNCTION identity.finish_social_callback_v2(p jsonb,p_source jsonb) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE f identity.social_flow%ROWTYPE;s identity.social_identity%ROWTYPE;a record;u uuid;factor uuid;t timestamptz;original_subject_user uuid;BEGIN
 PERFORM identity.consume_runtime_audit_attempt();
 SELECT * INTO f FROM identity.social_flow WHERE state_hash=p->>'stateHash';
 SELECT * INTO s FROM identity.social_identity WHERE provider=f.provider AND issuer=p->>'issuer' AND app_scope=p->>'appScope' AND subject=p->>'subject';
 original_subject_user:=s.user_id;
 PERFORM identity.lock_security_subjects(ARRAY(SELECT DISTINCT x FROM unnest(ARRAY[f.user_id,s.user_id]) x WHERE x IS NOT NULL ORDER BY x));
 IF s.user_id IS NOT NULL THEN SELECT * INTO a FROM identity.lock_account_t9_internal(s.user_id,true);END IF;
 SELECT * INTO s FROM identity.social_identity WHERE provider=f.provider AND issuer=p->>'issuer' AND app_scope=p->>'appScope' AND subject=p->>'subject';
 IF s.user_id IS DISTINCT FROM original_subject_user THEN RAISE EXCEPTION 'SOCIAL_FLOW_INVALID';END IF;
 SELECT * INTO f FROM identity.social_flow WHERE state_hash=p->>'stateHash' FOR UPDATE;
 IF f.state_hash IS NULL OR f.claim_id IS DISTINCT FROM (p->>'claimId')::uuid OR f.claimed_at IS NULL OR f.consumed_at IS NOT NULL OR f.proof_hash IS NOT NULL
 OR f.cookie_hash IS DISTINCT FROM p->>'cookieHash' OR f.binding_hash IS DISTINCT FROM p->>'bindingHash' OR f.provider IS DISTINCT FROM p->>'provider' OR f.configuration IS DISTINCT FROM p->>'configuration'
 OR NOT COALESCE(p->'admittedProviders' ? f.configuration,false) OR f.expires_at<=clock_timestamp() OR p->>'subject' IS NULL OR length(p->>'subject') NOT BETWEEN 1 AND 255 THEN RAISE EXCEPTION 'SOCIAL_FLOW_INVALID';END IF;
 IF f.purpose='PROVIDER_STEP_UP' THEN
  -- An unlinked subject never initialized a. Refuse ownership first, in its
  -- own statement, before planning any expression that dereferences a.
  IF s.user_id IS NULL OR s.user_id IS DISTINCT FROM f.user_id THEN RAISE EXCEPTION 'SOCIAL_FLOW_INVALID';END IF;
  IF s.revoked_at IS NOT NULL OR s.configuration IS DISTINCT FROM f.configuration OR a.audit_token IS NULL OR staff.consumer_security_affiliated(f.user_id)
  OR identity.assert_session_current(f.user_id,f.session_id,f.session_token_hash) IS DISTINCT FROM true OR f.security_epoch IS DISTINCT FROM COALESCE((SELECT security_epoch FROM identity.account_security_hold WHERE user_id=f.user_id),0) THEN RAISE EXCEPTION 'SOCIAL_FLOW_INVALID';END IF;
  UPDATE identity.social_flow SET proof_hash=p->>'proofHash',continuation_cookie_hash=p->>'continuationCookieHash',issuer=p->>'issuer',app_scope=p->>'appScope',subject=p->>'subject' WHERE state_hash=f.state_hash;
  RETURN jsonb_build_object('status','provider_step_up_required','next',f.next_path,'expiresAt',f.expires_at);
 END IF;
 IF f.purpose='LINK' THEN
  IF identity.assert_session_current(f.user_id,f.session_id,f.session_token_hash) IS DISTINCT FROM true OR f.security_epoch IS DISTINCT FROM COALESCE((SELECT security_epoch FROM identity.account_security_hold WHERE user_id=f.user_id),0)
  OR (s.user_id IS NOT NULL AND s.user_id<>f.user_id) THEN RAISE EXCEPTION 'SOCIAL_FLOW_INVALID';END IF;
  INSERT INTO identity.social_identity(user_id,provider,issuer,app_scope,subject,configuration) VALUES(f.user_id,f.provider,p->>'issuer',p->>'appScope',p->>'subject',f.configuration)
  ON CONFLICT(provider,issuer,app_scope,subject) DO UPDATE SET revoked_at=NULL,configuration=EXCLUDED.configuration WHERE identity.social_identity.user_id=EXCLUDED.user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'SOCIAL_FLOW_INVALID';END IF;
  UPDATE identity.social_flow SET consumed_at=clock_timestamp() WHERE state_hash=f.state_hash;
  PERFORM set_config('debateai.mail_locale', f.mail_locale, true);
  PERFORM identity.enqueue_consumer_security_notice_internal(f.user_id,'METHOD_CHANGED');PERFORM identity.append_social_audit_internal((SELECT audit_token FROM identity."user" WHERE user_id=f.user_id),'LINK',p_source);
  IF f.expires_at<=clock_timestamp() OR identity.assert_session_current(f.user_id,f.session_id,f.session_token_hash) IS DISTINCT FROM true THEN RAISE EXCEPTION 'SOCIAL_FLOW_INVALID';END IF;
  RETURN jsonb_build_object('status','linked','next',f.next_path);
 END IF;
 IF s.user_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM identity."user" WHERE user_id=s.user_id AND state='pending_verification') THEN
  IF s.revoked_at IS NOT NULL OR s.configuration<>f.configuration OR a.audit_token IS NULL OR staff.consumer_security_affiliated(s.user_id) THEN RAISE EXCEPTION 'SOCIAL_FLOW_INVALID';END IF;
  SELECT mfa_factor_id INTO factor FROM identity.mfa_factor WHERE user_id=s.user_id AND factor_type='totp' AND state='active' AND verified_at IS NOT NULL ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF identity.login_method_current_internal(s.user_id,factor) IS DISTINCT FROM true THEN RAISE EXCEPTION 'SOCIAL_FLOW_INVALID';END IF;
  t:=clock_timestamp();
  INSERT INTO identity.login_challenge(login_challenge_id,user_id,mfa_factor_id,token_hash,binding_hash,password_hash_snapshot,created_at,expires_at,first_step,social_identity_id,social_configuration,social_cookie_hash,social_security_epoch)
  VALUES((p->>'challengeId')::uuid,s.user_id,factor,p->>'challengeHash',f.binding_hash,a.password_hash,t,f.expires_at,'PROVIDER',s.social_identity_id,s.configuration,p->>'continuationCookieHash',COALESCE((SELECT security_epoch FROM identity.account_security_hold WHERE user_id=s.user_id),0));
  UPDATE identity.social_flow SET consumed_at=t WHERE state_hash=f.state_hash;
  PERFORM identity.append_social_audit_internal(a.audit_token,'LOGIN_FIRST_STEP',p_source);
  IF f.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'SOCIAL_FLOW_INVALID';END IF;
  RETURN jsonb_build_object('status','mfa_required','next',f.next_path,'expiresAt',f.expires_at,'availableMethods',array_remove(ARRAY[CASE WHEN factor IS NOT NULL THEN 'totp' END,CASE WHEN EXISTS(SELECT 1 FROM identity.consumer_passkey_credential WHERE user_id=s.user_id AND revoked_at IS NULL) THEN 'passkey' END,CASE WHEN EXISTS(SELECT 1 FROM identity.recovery_code WHERE user_id=s.user_id AND consumed_at IS NULL AND revoked_at IS NULL) THEN 'recovery_code' END],NULL));
 END IF;
 UPDATE identity.social_flow SET proof_hash=p->>'proofHash',continuation_cookie_hash=p->>'continuationCookieHash',issuer=p->>'issuer',app_scope=p->>'appScope',subject=p->>'subject',asserted_email_index=CASE WHEN p->>'assertedEmailIndex' IS NULL THEN NULL ELSE decode(p->>'assertedEmailIndex','hex') END WHERE state_hash=f.state_hash;
 PERFORM identity.append_social_audit_internal(gen_random_uuid(),'SIGNUP_PROOF',p_source);
 RETURN jsonb_build_object('status','signup_required','next',f.next_path,'expiresAt',f.expires_at);
END $$;
REVOKE ALL ON FUNCTION identity.finish_social_callback_v2(jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.finish_social_callback_v2(jsonb,jsonb) TO debateai_authorization_runtime;
-- n1: reviewed same trigger, table, events and deferral; the v2 check refuses a subset of what 0101's refused, so every write of the release before still passes
DROP TRIGGER IF EXISTS social_password_origin ON identity."user";
CREATE CONSTRAINT TRIGGER social_password_origin AFTER INSERT OR UPDATE OF password_hash ON identity."user" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION identity.require_social_password_origin_v2();
-- n1: reviewed same trigger, table, event and deferral; the v2 check refuses a subset of what 0101's refused, so every link delete of the release before still passes
DROP TRIGGER IF EXISTS social_password_origin_link ON identity.social_identity;
CREATE CONSTRAINT TRIGGER social_password_origin_link AFTER DELETE ON identity.social_identity DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION identity.require_social_password_origin_v2();
-- What this section promises, checked when it applies: each new function has the owner of the function it supersedes,
-- and both origin triggers are enabled, deferrable, initially deferred and bound to the v2 check, with none left on
-- 0101's.
DO $$BEGIN
 IF (SELECT proowner FROM pg_proc WHERE oid='identity.create_social_account_v2(jsonb,jsonb)'::regprocedure)
      IS DISTINCT FROM (SELECT proowner FROM pg_proc WHERE oid='identity.create_social_account(jsonb,jsonb)'::regprocedure)
  OR (SELECT proowner FROM pg_proc WHERE oid='identity.finish_social_callback_v2(jsonb,jsonb)'::regprocedure)
      IS DISTINCT FROM (SELECT proowner FROM pg_proc WHERE oid='identity.finish_social_callback(jsonb,jsonb)'::regprocedure)
  OR (SELECT proowner FROM pg_proc WHERE oid='identity.require_social_password_origin_v2()'::regprocedure)
      IS DISTINCT FROM (SELECT proowner FROM pg_proc WHERE oid='identity.require_social_password_origin()'::regprocedure)
 THEN RAISE EXCEPTION 'NV13_OWNER_DRIFT';END IF;
 IF (SELECT count(*) FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgenabled='O' AND t.tgdeferrable AND t.tginitdeferred
       AND t.tgfoid='identity.require_social_password_origin_v2()'::regprocedure
       AND ((t.tgrelid='identity."user"'::regclass AND t.tgname='social_password_origin')
         OR (t.tgrelid='identity.social_identity'::regclass AND t.tgname='social_password_origin_link')))<>2
  OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgfoid='identity.require_social_password_origin()'::regprocedure)
 THEN RAISE EXCEPTION 'NV13_ORIGIN_TRIGGER_DRIFT';END IF;
END $$;

-- ==== [NV-02] Erasure-notice outbox terminal state ====
-- 0040's identity.fail_account_erasure_notification re-queues every failure 30 s later with no ceiling, and
-- identity.account_erasure_completion_notifications_ready (asked before key destruction and by FINALIZE) is false
-- while any unacknowledged row of the user exists, so one notice refused on every attempt held a PREPARED erasure (the
-- user suspended, the DEK and records kept) for ever. This fail decides under the claim: MAIL_RECIPIENT_UNDELIVERABLE,
-- which only the reconciler raises from its own pre-send check of the decrypted address, dead-letters at once; any
-- other code dead-letters only from the 10th attempt and only while the user has a PREPARED, uncommitted, uncancelled
-- erasure (the only time the row blocks key destruction); every other failure re-queues 30 s doubling per attempt, at
-- most 1 h. A dead letter keeps the claim token, sets acknowledged_at (so 0040's claim, readiness and 0110's FINALIZE
-- read the row as settled; 0116 digests this table's columns, so no column is added) with last_error_code DEAD:<code>,
-- which 0040's ack never writes, and appends an identifier-free identity.account.erasure_notice_dead_lettered event
-- through the trusted appender, as FINALIZE appends identity.account.erased: the outbox row cascades away with the
-- user, the append-only audit row stays. It lives in erasure_reconcile, whose functions the release before's erasure
-- witness does not count; the new release's witness counts it by catalog OID. 0040's fail keeps its grant for the
-- release before, which never resurrects a dead row (it skips acknowledged rows).
GRANT USAGE ON SCHEMA erasure_reconcile TO debateai_erasure_runtime;
CREATE OR REPLACE FUNCTION erasure_reconcile.fail_account_erasure_notification(
  p_message_id uuid,p_claim_token uuid,p_error_code text
)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_user_id uuid; v_erasure_id uuid; v_attempts integer;
  v_channel_type text; v_event_kind text; v_reason text; v_actor uuid;
BEGIN
  IF p_error_code IS NULL OR p_error_code!~'^[A-Z0-9_:-]{1,96}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='ERASURE_NOTIFICATION_ERROR_CODE_INVALID';
  END IF;
  SELECT outbox.user_id,outbox.erasure_id,outbox.attempt_count,outbox.channel_type,outbox.event_kind
  INTO v_user_id,v_erasure_id,v_attempts,v_channel_type,v_event_kind
  FROM identity.account_erasure_notification_outbox AS outbox
  WHERE outbox.message_id=p_message_id AND outbox.claim_token=p_claim_token
    AND outbox.acknowledged_at IS NULL AND outbox.claim_expires_at>v_now
  FOR UPDATE;
  IF NOT FOUND THEN RETURN 'CONTENDED'; END IF;
  IF p_error_code='MAIL_RECIPIENT_UNDELIVERABLE' THEN
    v_reason := 'recipient';
  ELSIF v_attempts>=10 AND EXISTS (
    SELECT 1 FROM identity.account_erasure_request AS request
    WHERE request.user_id=v_user_id AND request.prepared_at IS NOT NULL
      AND request.committed_at IS NULL AND request.cancelled_at IS NULL
  ) THEN
    v_reason := 'attempt-cap';
  END IF;
  IF v_reason IS NULL THEN
    UPDATE identity.account_erasure_notification_outbox AS outbox
    SET claim_token=NULL,claim_expires_at=NULL,last_error_code=p_error_code,
      available_at=v_now+LEAST(interval '30 seconds'*(1<<LEAST(GREATEST(v_attempts-1,0),7)),interval '1 hour')
    WHERE outbox.message_id=p_message_id AND outbox.claim_token=p_claim_token AND outbox.acknowledged_at IS NULL;
    RETURN 'FAILED';
  END IF;
  UPDATE identity.account_erasure_notification_outbox AS outbox
  SET acknowledged_at=v_now,claim_expires_at=NULL,last_error_code='DEAD:'||left(p_error_code,91)
  WHERE outbox.message_id=p_message_id AND outbox.claim_token=p_claim_token AND outbox.acknowledged_at IS NULL;
  SELECT identity_user.audit_token INTO v_actor
  FROM identity."user" AS identity_user WHERE identity_user.user_id=v_user_id;
  -- A NULL actor makes the appender raise AUDIT_EVENT_INVALID, which rolls the dead letter back with it.
  PERFORM identity.append_audit_event_internal(
    gen_random_uuid(),v_actor::text,'identity.account.erasure_notice_dead_lettered',
    'identity.account_erasure',v_erasure_id::text,v_now,
    jsonb_build_object('schema','s10-account-erasure-notice-v1','eventKind',v_event_kind,
      'channelType',v_channel_type,'reason',v_reason),
    'ALLOW',false,'DEAD:'||left(p_error_code,91)
  );
  RETURN CASE v_reason WHEN 'recipient' THEN 'DEAD_LETTERED_RECIPIENT' ELSE 'DEAD_LETTERED_ATTEMPT_CAP' END;
END;
$$;
REVOKE ALL ON FUNCTION erasure_reconcile.fail_account_erasure_notification(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION erasure_reconcile.fail_account_erasure_notification(uuid,uuid,text) TO debateai_erasure_runtime;
-- What this section promises, checked when it applies: the fail is owned like 0040's fail and the trusted appender it
-- calls (so it runs with the appender's owner's EXECUTE); it is a VOLATILE definer with the pinned path; only
-- debateai_erasure_runtime may run it (none of the erasure witness's forbidden roles).
DO $$
DECLARE
  v_fail oid := to_regprocedure('erasure_reconcile.fail_account_erasure_notification(uuid,uuid,text)');
  v_legacy oid := to_regprocedure('identity.fail_account_erasure_notification(uuid,uuid,text)');
  v_appender oid := to_regprocedure(
    'identity.append_audit_event_internal(uuid,text,text,text,text,timestamptz,jsonb,text,boolean,text)'
  );
BEGIN
  IF v_fail IS NULL OR v_legacy IS NULL OR v_appender IS NULL OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS fail
    JOIN pg_catalog.pg_proc AS legacy ON legacy.oid=v_legacy
    JOIN pg_catalog.pg_proc AS appender ON appender.oid=v_appender
    WHERE fail.oid=v_fail
      AND fail.proowner=legacy.proowner AND fail.proowner=appender.proowner
      AND fail.prosecdef AND fail.provolatile='v'
      AND fail.proconfig=ARRAY['search_path=pg_catalog']
      AND NOT has_function_privilege('public',fail.oid,'EXECUTE')
      AND NOT has_function_privilege('debateai_runtime',fail.oid,'EXECUTE')
      AND NOT has_function_privilege('debateai_authorization_runtime',fail.oid,'EXECUTE')
      AND NOT has_function_privilege('debateai_publication_cleanup',fail.oid,'EXECUTE')
      AND NOT has_function_privilege('debateai_content_provision',fail.oid,'EXECUTE')
      AND NOT has_function_privilege('debateai_replay',fail.oid,'EXECUTE')
      AND has_function_privilege('debateai_erasure_runtime',fail.oid,'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'SECURITY_FIXES_0125_NV02_DRIFT';
  END IF;
END $$;

-- ==== [NV-14] verify-email sets the token holder's password and drops pending social links ====
-- A registrant who types someone else's address seeds a pending account whose first factor they chose: a password
-- (create_pending_account_base_internal, 0112), or a provider link that 0112's sealed create_social_account inserts
-- before it decides trust. The inbox owner's later verification kept both, so the activated account carried the
-- registrant's password or provider as a live first step. The mailed verification is the last point at which control
-- of the address is proven, so this section adds the consume the new release calls when the request carries a
-- password (PostgresIdentityRepository.consumeVerificationSetPassword). Its body is the installed
-- identity.consume_verification_with_audit (0096's text with 0100's two replace() rewrites: the pending_mfa resume,
-- hold and erasure conditions, and the token-scoped credential update), plus the lines marked NV-14: on every valid
-- consume it writes the supplied hash, which the API has checked against the registration policy and hashed; on the
-- pending_verification transition only it also deletes every social_identity row on the account (social_enrollment
-- and login_challenge rows cascade) and appends one identity.social.UNLINK event when a row went. The password is
-- written before the DELETE, so social_password_origin_link's deferred check passes at COMMIT. A consumed, expired or
-- unknown token is not a valid consume and changes nothing. STRICT: a NULL argument returns NULL before the audit
-- attempt is consumed, so the repository transaction fails at COMMIT (AUDIT_ATTEMPT_NOT_CONSUMED) and rolls back; the
-- typed caller never passes one. 0096's function is not replaced and keeps its grant, so the release before (and a
-- request without a password) verifies as it did; retiring it is a later contract step.
CREATE OR REPLACE FUNCTION identity.consume_verification_set_password(
  p_token_hash text,p_occurred_at timestamptz,p_source_context jsonb,p_new_password_hash text
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
STRICT
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_channel_id uuid := NULL;
  v_user_id uuid := NULL;
  v_audit_token uuid := NULL;
  v_user_state text := NULL;
  v_expires_at timestamptz := NULL;
  v_consumed_at timestamptz := NULL;
  v_valid boolean := false;
  v_decided_at timestamptz;
  v_unlinked integer := 0;  -- NV-14
BEGIN
  SELECT channel.channel_binding_id,channel.user_id
  INTO v_channel_id,v_user_id
  FROM identity.verification_token_credential AS credential
  JOIN identity.channel_binding AS channel
    ON channel.channel_binding_id=credential.channel_binding_id
  WHERE credential.token_hash=p_token_hash AND channel.channel_type='email';
  IF v_channel_id IS NOT NULL THEN
    IF v_user_id IS NOT NULL THEN
      PERFORM identity.lock_security_subjects(ARRAY[v_user_id]);
    END IF;
    SELECT channel.channel_binding_id,channel.user_id
    INTO v_channel_id,v_user_id
    FROM identity.channel_binding AS channel
    WHERE channel.channel_binding_id=v_channel_id
      AND channel.channel_type='email'
    FOR UPDATE;
  END IF;
  IF v_user_id IS NOT NULL THEN
    SELECT account.audit_token,account.user_state
    INTO v_audit_token,v_user_state
    FROM identity.lock_account_t9_internal(v_user_id,false) AS account;
  END IF;
  IF v_channel_id IS NOT NULL AND v_audit_token IS NOT NULL THEN
    SELECT credential.expires_at,credential.consumed_at
    INTO v_expires_at,v_consumed_at
    FROM identity.verification_token_credential AS credential
    WHERE credential.token_hash=p_token_hash
      AND credential.channel_binding_id=v_channel_id
    FOR UPDATE;
  END IF;
  -- Sample after subject/channel/account/credential lock waits. Equality remains valid.
  v_decided_at := clock_timestamp();
  v_valid := COALESCE(
    v_channel_id IS NOT NULL AND v_audit_token IS NOT NULL
    AND v_expires_at IS NOT NULL AND v_consumed_at IS NULL
    AND v_expires_at>=v_decided_at
    AND (v_user_state='pending_verification' OR (v_user_state='pending_mfa' AND EXISTS(SELECT 1 FROM identity.channel_binding WHERE channel_binding_id=v_channel_id AND state='verified')))
    AND NOT EXISTS(SELECT 1 FROM identity.account_security_hold WHERE user_id=v_user_id AND held)
    AND NOT EXISTS(SELECT 1 FROM identity.account_erasure_request WHERE user_id=v_user_id AND cancelled_at IS NULL),
    false
  );
  IF v_valid THEN
    UPDATE identity.verification_token_credential SET consumed_at=v_decided_at
    WHERE channel_binding_id=v_channel_id AND token_hash=p_token_hash AND consumed_at IS NULL;
    UPDATE identity.channel_binding
    SET state='verified',verified_at=v_decided_at,
      verification_consumed_at=v_decided_at,
      verification_token_hash=p_token_hash,
      verification_expires_at=v_expires_at,delivery_error=NULL
    WHERE channel_binding_id=v_channel_id;
    UPDATE identity."user" SET state='pending_mfa' WHERE user_id=v_user_id;
    UPDATE identity."user" SET password_hash=p_new_password_hash WHERE user_id=v_user_id;  -- NV-14
    IF v_user_state='pending_verification' THEN  -- NV-14
      DELETE FROM identity.social_identity WHERE user_id=v_user_id;  -- NV-14
      GET DIAGNOSTICS v_unlinked = ROW_COUNT;  -- NV-14
    END IF;  -- NV-14
  END IF;
  PERFORM identity.consume_runtime_audit_attempt();
  PERFORM identity.append_runtime_audit_event_internal(
    COALESCE(v_audit_token,gen_random_uuid()),'identity.verification.consumed',
    CASE WHEN v_valid THEN v_channel_id ELSE NULL END,
    clock_timestamp(),p_source_context,CASE WHEN v_valid THEN 'ALLOW' ELSE 'DENY' END,
    v_valid,CASE WHEN v_valid THEN NULL ELSE 'VERIFICATION_TOKEN_INVALID' END
  );
  IF v_unlinked>0 THEN  -- NV-14
    PERFORM identity.append_social_audit_internal(v_audit_token,'UNLINK',p_source_context);  -- NV-14
  END IF;  -- NV-14
  RETURN v_valid;
END;
$$;
REVOKE ALL ON FUNCTION identity.consume_verification_set_password(text,timestamptz,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.consume_verification_set_password(text,timestamptz,jsonb,text) TO debateai_runtime;
-- The DELETE and the UNLINK audit run as this function's owner: it must be the old consume's owner (the installer) and
-- own identity.social_identity. No PUBLIC grant, nothing for the erasure runtime, EXECUTE for debateai_runtime.
DO $$DECLARE f regprocedure:='identity.consume_verification_set_password(text,timestamptz,jsonb,text)'::regprocedure;
 o oid:=(SELECT proowner FROM pg_proc WHERE oid='identity.consume_verification_with_audit(text,timestamptz,jsonb)'::regprocedure);BEGIN
 IF (SELECT proowner FROM pg_proc WHERE oid=f) IS DISTINCT FROM o
  OR (SELECT relowner FROM pg_class WHERE oid='identity.social_identity'::regclass) IS DISTINCT FROM o
 THEN RAISE EXCEPTION 'NV14_CONSUME_OWNER_DRIFT';END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p,aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=f AND a.grantee=0)
  OR has_function_privilege('debateai_erasure_runtime',f,'EXECUTE')
  OR NOT has_function_privilege('debateai_runtime',f,'EXECUTE')
 THEN RAISE EXCEPTION 'NV14_CONSUME_ACL_DRIFT';END IF;
END $$;

-- ==== [NV-30] Private debate delete: grant checked before the run's content lease is tried ====
-- 0123's core.prepare_private_run_erasure checks the grant before its own locks, but the TypeScript caller waited for
-- the named run's content lease before calling it, so a fake grant parked an erasure connection behind a running
-- debate (NV-30). This entry point repeats 0123's opaque, nonlocking preauthorization (0123:1396, :1401-1431), then
-- tries the named run's lease as a transaction lock, as 0123 does for the chain's other runs (0123:1498-1502), then
-- delegates. Unauthorized callers take no lock; authorized callers whose run is in use get CONTENDED and spend nothing.
-- It lives in erasure_reconcile because the release before counts the erasure login's functions in identity, core and
-- serve exactly; the new release's witness counts it there by catalog OID. core.prepare_private_run_erasure keeps its
-- grant for the release before.
GRANT USAGE ON SCHEMA erasure_reconcile TO debateai_erasure_runtime;
CREATE OR REPLACE FUNCTION erasure_reconcile.prepare_private_run_erasure(
  p_run_id uuid,
  p_user_id uuid,
  p_owner_ref uuid,
  p_session_id uuid,
  p_grant_token_hash text
)
RETURNS TABLE(outcome text,erasure_id uuid)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_chain uuid[];
BEGIN
  v_chain := core.private_erasure_run_chain(p_run_id);
  -- 0123's preauthorization (0123:1401-1431) unchanged: nothing is locked before it answers.
  IF NOT EXISTS (
    SELECT 1
    FROM identity."user" AS account
    JOIN identity.session AS session
      ON session.user_id=account.user_id
     AND session.session_id=p_session_id
    JOIN identity.step_up_grant AS step_grant
      ON step_grant.user_id=account.user_id
     AND step_grant.session_id=session.session_id
    WHERE account.user_id=p_user_id
      AND account.owner_ref=p_owner_ref
      AND account.state='active'
      AND session.revoked_at IS NULL
      AND session.idle_expires_at>v_now
      AND LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')>GREATEST(v_now,clock_timestamp())
      AND step_grant.token_hash=p_grant_token_hash
      AND step_grant.action='DELETE_PRIVATE_DEBATE'
      AND step_grant.target_run_id=ANY(v_chain)
      AND step_grant.target_account_id IS NULL
      AND step_grant.consumed_at IS NULL
      AND step_grant.issued_at<=v_now
      AND step_grant.expires_at>v_now
      AND p_owner_ref=(
        SELECT ownership.owner_ref FROM core.run_ownership_event AS ownership
        WHERE ownership.run_id=p_run_id ORDER BY ownership.at_seq ASC LIMIT 1
      )
      AND p_owner_ref=(
        SELECT ownership.owner_ref FROM core.run_ownership_event AS ownership
        WHERE ownership.run_id=p_run_id ORDER BY ownership.at_seq DESC LIMIT 1
      )
  ) THEN
    RETURN QUERY SELECT 'NOT_FOUND'::text,NULL::uuid; RETURN;
  END IF;
  IF NOT pg_try_advisory_xact_lock(hashtextextended('debateai:run-content-lease:v1:'||p_run_id::text,0)) THEN
    RETURN QUERY SELECT 'CONTENDED'::text,NULL::uuid; RETURN;
  END IF;
  RETURN QUERY SELECT delegated.outcome,delegated.erasure_id
  FROM core.prepare_private_run_erasure(p_run_id,p_user_id,p_owner_ref,p_session_id,p_grant_token_hash) AS delegated;
END;
$$;
REVOKE ALL ON FUNCTION erasure_reconcile.prepare_private_run_erasure(uuid,uuid,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION erasure_reconcile.prepare_private_run_erasure(uuid,uuid,uuid,uuid,text) TO debateai_erasure_runtime;
-- What this section promises, checked when it applies: the entry point, 0123's prepare and chain reader, and the schema
-- share one owner, the migration executor, so the definer may call both and read their relations; it is a VOLATILE
-- definer with the pinned path; no role of the erasure witness's forbidden list may run it; the erasure runtime may run
-- it and use the schema.
DO $$
DECLARE
  v_entry oid := to_regprocedure('erasure_reconcile.prepare_private_run_erasure(uuid,uuid,uuid,uuid,text)');
  v_delegate oid := to_regprocedure('core.prepare_private_run_erasure(uuid,uuid,uuid,uuid,text)');
  v_chain_reader oid := to_regprocedure('core.private_erasure_run_chain(uuid)');
  v_schema oid := to_regnamespace('erasure_reconcile');
BEGIN
  IF v_entry IS NULL OR v_delegate IS NULL OR v_chain_reader IS NULL OR v_schema IS NULL OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS entry_point
    JOIN pg_catalog.pg_proc AS delegate ON delegate.oid=v_delegate
    JOIN pg_catalog.pg_proc AS chain_reader ON chain_reader.oid=v_chain_reader
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=v_schema
    WHERE entry_point.oid=v_entry
      AND entry_point.proowner=(SELECT role.oid FROM pg_catalog.pg_roles AS role WHERE role.rolname=current_user)
      AND entry_point.proowner=delegate.proowner AND entry_point.proowner=chain_reader.proowner
      AND entry_point.proowner=namespace.nspowner
      AND entry_point.prosecdef AND entry_point.provolatile='v'
      AND entry_point.proconfig=ARRAY['search_path=pg_catalog, pg_temp']
      AND NOT has_function_privilege('public',entry_point.oid,'EXECUTE')
      AND NOT has_function_privilege('debateai_runtime',entry_point.oid,'EXECUTE')
      AND NOT has_function_privilege('debateai_authorization_runtime',entry_point.oid,'EXECUTE')
      AND NOT has_function_privilege('debateai_publication_cleanup',entry_point.oid,'EXECUTE')
      AND NOT has_function_privilege('debateai_content_provision',entry_point.oid,'EXECUTE')
      AND NOT has_function_privilege('debateai_replay',entry_point.oid,'EXECUTE')
      AND has_function_privilege('debateai_erasure_runtime',entry_point.oid,'EXECUTE')
      AND has_schema_privilege('debateai_erasure_runtime',namespace.oid,'USAGE')
  ) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='SECURITY_FIXES_0125_NV30_DRIFT';
  END IF;
END $$;

-- ==== [NV-41] Ceremony stores give up the heaviest anonymous source's oldest rows when full ====
-- The passkey and social ceremony stores are each capped at the MFA policy's capacity (8,192), with at most five
-- pending rows per source, and their begins (0098's identity.reserve_consumer_challenge_internal, 0116's sealed
-- identity.begin_social_flow) refuse CONSUMER_CHALLENGE_CAPACITY once the table is full, so about 1,639 sources renewing
-- five rows each refused every visitor's passkey and social sign-in. These two cleanups replace the ones the new
-- release's repositories run as a standalone statement before each begin (0098's prune_consumer_passkey_challenges,
-- 0101's prune_social_flows): under the same capacity lock they delete what the old cleanup deletes, then, once the
-- table holds the high-water mark (capacity - GREATEST(1, capacity/256): 8,160), give up anonymous pending rows down to
-- the low-water mark (capacity - GREATEST(1, capacity/64): 8,064), heaviest source first, oldest first. A candidate is
-- anonymous and pending only (passkey: user_id IS NULL AND consumed_at IS NULL; social: purpose='LOGIN' AND claimed_at
-- IS NULL AND consumed_at IS NULL), so account-bound, continuation and in-callback rows are never given up. Candidates
-- are locked in rank order with SKIP LOCKED, so the cleanup never waits on a row an in-flight completion holds, and the
-- DELETE re-checks the candidate predicates on each row. The begins and the old cleanups are unchanged and keep their
-- grants for the release before.
CREATE OR REPLACE FUNCTION identity.prune_consumer_passkey_challenges_evicting(p_capacity integer) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE v_count bigint;v_excess bigint;
BEGIN
 PERFORM identity.lock_consumer_challenges_internal(p_capacity);
 DELETE FROM identity.consumer_passkey_challenge WHERE consumed_at IS NOT NULL OR expires_at<=clock_timestamp();
 v_count:=(SELECT count(*) FROM identity.consumer_passkey_challenge);
 -- NV-41: at the high-water mark give up anonymous pending rows, heaviest source first, oldest first, down to the low-water mark.
 IF v_count>=p_capacity-GREATEST(1,p_capacity/256) THEN
  v_excess:=v_count-(p_capacity-GREATEST(1,p_capacity/64));
  IF v_excess>0 THEN
   DELETE FROM identity.consumer_passkey_challenge d
    WHERE d.user_id IS NULL AND d.consumed_at IS NULL AND d.challenge_id=ANY(ARRAY(
     SELECT l.challenge_id FROM identity.consumer_passkey_challenge l
     JOIN (SELECT c.challenge_id,count(*) OVER (PARTITION BY c.retention_hash) AS source_rows
       FROM identity.consumer_passkey_challenge c WHERE c.user_id IS NULL AND c.consumed_at IS NULL) ranked
      ON ranked.challenge_id=l.challenge_id
     WHERE l.user_id IS NULL AND l.consumed_at IS NULL
     ORDER BY ranked.source_rows DESC,l.created_at,l.challenge_id LIMIT v_excess
     FOR UPDATE OF l SKIP LOCKED));
  END IF;
 END IF;
END $$;

CREATE OR REPLACE FUNCTION identity.prune_social_flows_evicting(p_capacity integer) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE v_count bigint;v_excess bigint;
BEGIN
 IF p_capacity IS NULL OR p_capacity NOT BETWEEN 1 AND 8192 THEN RAISE EXCEPTION 'SOCIAL_FLOW_INVALID';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('identity.social_flow_capacity',0));
 DELETE FROM identity.social_flow WHERE expires_at<=clock_timestamp() OR consumed_at IS NOT NULL;
 v_count:=(SELECT count(*) FROM identity.social_flow);
 -- NV-41: at the high-water mark give up unclaimed LOGIN rows, heaviest source first, oldest first, down to the low-water mark.
 IF v_count>=p_capacity-GREATEST(1,p_capacity/256) THEN
  v_excess:=v_count-(p_capacity-GREATEST(1,p_capacity/64));
  IF v_excess>0 THEN
   DELETE FROM identity.social_flow d
    WHERE d.purpose='LOGIN' AND d.claimed_at IS NULL AND d.consumed_at IS NULL AND d.state_hash=ANY(ARRAY(
     SELECT l.state_hash FROM identity.social_flow l
     JOIN (SELECT f.state_hash,count(*) OVER (PARTITION BY f.retention_hash) AS source_rows
       FROM identity.social_flow f WHERE f.purpose='LOGIN' AND f.claimed_at IS NULL AND f.consumed_at IS NULL) ranked
      ON ranked.state_hash=l.state_hash
     WHERE l.purpose='LOGIN' AND l.claimed_at IS NULL AND l.consumed_at IS NULL
     ORDER BY ranked.source_rows DESC,l.created_at,l.state_hash LIMIT v_excess
     FOR UPDATE OF l SKIP LOCKED));
  END IF;
 END IF;
END $$;

-- n1: reviewed sets each new cleanup's owner to the owner of the cleanup it supersedes (a role name known only when the step applies); it alters only these two new functions
DO $nv41$ DECLARE v_owner name; BEGIN
 SELECT pg_get_userbyid(proowner) INTO v_owner FROM pg_proc WHERE oid='identity.prune_consumer_passkey_challenges(integer)'::regprocedure;
 EXECUTE format('ALTER FUNCTION identity.prune_consumer_passkey_challenges_evicting(integer) OWNER TO %I',v_owner);
 SELECT pg_get_userbyid(proowner) INTO v_owner FROM pg_proc WHERE oid='identity.prune_social_flows()'::regprocedure;
 EXECUTE format('ALTER FUNCTION identity.prune_social_flows_evicting(integer) OWNER TO %I',v_owner);
END $nv41$;
REVOKE ALL ON FUNCTION identity.prune_consumer_passkey_challenges_evicting(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION identity.prune_social_flows_evicting(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.prune_consumer_passkey_challenges_evicting(integer), identity.prune_social_flows_evicting(integer) TO debateai_authorization_runtime;

-- ==== [NV-09] Erasure runs for an owner frozen by the age gate after scheduling ====
-- A pre-0077 account can schedule its erasure and then refuse the one-time age check: 0077's
-- identity.confirm_account_age_with_audit revokes every session and sets age_frozen without reading the pending
-- request. From then on 0040's identity.account_erasure_preview and 0110's identity.prepare_account_erasure admit only
-- an active owner, so the coordinator answered NOT_FOUND every 30 s for ever and the person, with no session left,
-- could not cancel. 0089's note (0089:15-16, "It cannot schedule an erasure ... so only these lookups ever see it") no
-- longer holds: an owner frozen after scheduling now reaches PREPARE and leaves age_frozen for suspended, so a later
-- billing stop is recorded as an erasure stop (owner_erasure_pending stays true while the request is open). 0089's
-- bytes are pinned by the lineage, so the note is corrected here, not there.
-- These are copies of 0040's preview and 0110's PREPARE that also admit age_frozen. PREPARE reads the owner's state
-- with the request (after NOT_DUE), locks the owner row only in that state, skips a frozen owner's expired orphan
-- run-key intents (the commit locks refuse a non-active owner, 0085:570), and queues no COMPLETION notice for a frozen
-- owner (0040's enforce_erasure_notification_parent admits outbox inserts for active owners only; that owner's
-- SCHEDULED notices were queued at schedule time and must be settled before any key is destroyed). The publication
-- provision-intent rule stays strict for every owner. Both live in erasure_reconcile, whose functions the release
-- before's erasure witness does not count; the new release's witness counts them by catalog OID. The identity pair
-- keeps its grant for the release before, which still skips frozen owners.
GRANT USAGE ON SCHEMA erasure_reconcile TO debateai_erasure_runtime;
CREATE OR REPLACE FUNCTION erasure_reconcile.account_erasure_preview(p_erasure_id uuid)
RETURNS TABLE(
  user_id uuid,
  owner_ref uuid,
  run_ids uuid[],
  legacy_run_ids uuid[],
  published_run_ids uuid[]
)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT identity_user.user_id,identity_user.owner_ref,
    COALESCE((
      SELECT array_agg(run.run_id ORDER BY run.run_id)
      FROM core.run AS run
      JOIN LATERAL (
        SELECT event.owner_ref FROM core.run_ownership_event AS event
        WHERE event.run_id=run.run_id ORDER BY event.at_seq ASC LIMIT 1
      ) AS crypto_owner ON true
      WHERE run.content_encryption_version=1
        AND crypto_owner.owner_ref=identity_user.owner_ref
    ),ARRAY[]::uuid[]),
    COALESCE((
      SELECT array_agg(latest.run_id ORDER BY latest.run_id)
      FROM core.run AS run
      JOIN LATERAL (
        SELECT event.run_id,event.owner_ref
        FROM core.run_ownership_event AS event
        WHERE event.run_id=run.run_id ORDER BY event.at_seq DESC LIMIT 1
      ) AS latest ON true
      WHERE run.content_encryption_version IS DISTINCT FROM 1
        AND latest.owner_ref=identity_user.owner_ref
    ),ARRAY[]::uuid[]),
    COALESCE((
      SELECT array_agg(latest.run_id ORDER BY latest.run_id)
      FROM core.run AS run
      JOIN LATERAL (
        SELECT event.run_id,event.owner_ref
        FROM core.run_ownership_event AS event
        WHERE event.run_id=run.run_id ORDER BY event.at_seq DESC LIMIT 1
      ) AS latest ON true
      JOIN LATERAL (
        SELECT visibility.state
        FROM core.run_visibility_event AS visibility
        WHERE visibility.run_id=run.run_id ORDER BY visibility.at_seq DESC LIMIT 1
      ) AS current_visibility ON true
      WHERE latest.owner_ref=identity_user.owner_ref
        AND current_visibility.state='PUBLISHED'
    ),ARRAY[]::uuid[])
  FROM identity.account_erasure_request AS request
  JOIN identity."user" AS identity_user ON identity_user.user_id=request.user_id
  WHERE request.erasure_id=p_erasure_id
    AND request.cancelled_at IS NULL
    AND request.committed_at IS NULL
    AND identity_user.state IN ('active','age_frozen')
$$;
CREATE OR REPLACE FUNCTION erasure_reconcile.prepare_account_erasure(p_erasure_id uuid, p_expected_run_ids uuid[], p_expected_legacy_run_ids uuid[], p_expected_published_run_ids uuid[])
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_user_id uuid;
  v_owner_ref uuid;
  v_execute_at timestamptz;
  v_cancelled_at timestamptz;
  v_prepared_at timestamptz;
  v_committed_at timestamptz;
  v_actual_run_ids uuid[];
  v_actual_legacy_run_ids uuid[];
  v_actual_published_run_ids uuid[];
  v_current_publication_refs uuid[];
  v_cleanup_publication_refs uuid[];
  v_lock_run_ids uuid[];
  v_run_id uuid;
  v_attestation_secret_count bigint;
  v_delete_public_debates boolean;
  v_recheck_current uuid[];
  v_recheck_cleanup uuid[];
  v_publication_ref uuid;
  v_publication_run_id uuid;
  v_event_id uuid;
  v_actor_ref uuid;
  v_user_state text;
BEGIN
  SELECT request.user_id,request.execute_at,request.cancelled_at,
    request.prepared_at,request.committed_at,identity_user.owner_ref,
    request.delete_public_debates,identity_user.state
  INTO v_user_id,v_execute_at,v_cancelled_at,v_prepared_at,v_committed_at,v_owner_ref,
    v_delete_public_debates,v_user_state
  FROM identity.account_erasure_request AS request
  LEFT JOIN identity."user" AS identity_user ON identity_user.user_id=request.user_id
  WHERE request.erasure_id=p_erasure_id;
  IF NOT FOUND OR v_user_id IS NULL THEN RETURN 'NOT_FOUND'; END IF;
  IF v_cancelled_at IS NOT NULL THEN RETURN 'CANCELLED'; END IF;
  IF v_prepared_at IS NOT NULL THEN RETURN 'PREPARED'; END IF;
  IF v_committed_at IS NOT NULL THEN RETURN 'COMMITTED'; END IF;
  IF v_execute_at>v_now THEN RETURN 'NOT_DUE'; END IF;
  IF v_user_state IS NULL OR v_user_state NOT IN ('active','age_frozen') THEN RETURN 'NOT_FOUND'; END IF;
  IF p_expected_run_ids IS NULL
    OR p_expected_run_ids IS DISTINCT FROM ARRAY(
      SELECT DISTINCT candidate FROM unnest(p_expected_run_ids) AS candidate ORDER BY candidate
    ) THEN
    RETURN 'STALE_MANIFEST';
  END IF;
  IF p_expected_legacy_run_ids IS NULL
    OR p_expected_legacy_run_ids IS DISTINCT FROM ARRAY(
      SELECT DISTINCT candidate FROM unnest(p_expected_legacy_run_ids) AS candidate ORDER BY candidate
    )
    OR p_expected_published_run_ids IS NULL
    OR p_expected_published_run_ids IS DISTINCT FROM ARRAY(
      SELECT DISTINCT candidate FROM unnest(p_expected_published_run_ids) AS candidate ORDER BY candidate
    ) THEN
    RETURN 'STALE_MANIFEST';
  END IF;
  BEGIN
    SELECT COALESCE(array_agg(run.run_id ORDER BY run.run_id),ARRAY[]::uuid[])
    INTO v_actual_run_ids
    FROM core.run AS run
    JOIN LATERAL (
      SELECT event.owner_ref FROM core.run_ownership_event AS event
      WHERE event.run_id=run.run_id ORDER BY event.at_seq ASC LIMIT 1
    ) AS crypto_owner ON true
    WHERE run.content_encryption_version=1 AND crypto_owner.owner_ref=v_owner_ref;
    IF v_actual_run_ids IS DISTINCT FROM p_expected_run_ids THEN RETURN 'STALE_MANIFEST'; END IF;

    SELECT COALESCE(array_agg(latest.run_id ORDER BY latest.run_id),ARRAY[]::uuid[])
    INTO v_actual_legacy_run_ids
    FROM core.run AS run
    JOIN LATERAL (
      SELECT event.run_id,event.owner_ref FROM core.run_ownership_event AS event
      WHERE event.run_id=run.run_id ORDER BY event.at_seq DESC LIMIT 1
    ) AS latest ON true
    WHERE run.content_encryption_version IS DISTINCT FROM 1 AND latest.owner_ref=v_owner_ref;
    IF v_actual_legacy_run_ids IS DISTINCT FROM p_expected_legacy_run_ids THEN
      RETURN 'STALE_MANIFEST';
    END IF;

    SELECT COALESCE(array_agg(candidate.run_id ORDER BY candidate.run_id),ARRAY[]::uuid[])
    INTO v_lock_run_ids
    FROM (
      SELECT unnest(v_actual_run_ids) AS run_id
      UNION
      SELECT latest.run_id
      FROM (
        SELECT DISTINCT ON (event.run_id) event.run_id,event.owner_ref
        FROM core.run_ownership_event AS event
        ORDER BY event.run_id,event.at_seq DESC
      ) AS latest
      WHERE latest.owner_ref=v_owner_ref
    ) AS candidate;
    IF NOT pg_try_advisory_xact_lock(hashtextextended('identity:security-subject:'||v_user_id::text,0)) THEN RETURN 'CONTENDED'; END IF;
    FOREACH v_run_id IN ARRAY v_lock_run_ids LOOP
      PERFORM 1 FROM core.run AS run WHERE run.run_id=v_run_id FOR UPDATE NOWAIT;
      IF NOT FOUND THEN RETURN 'STALE_MANIFEST'; END IF;
    END LOOP;
    IF NOT pg_try_advisory_xact_lock(
      hashtextextended('identity:account:'||v_user_id::text,0)
    ) THEN RETURN 'CONTENDED'; END IF;
    IF NOT pg_try_advisory_xact_lock(
      hashtextextended('core:ownership-transition',0)
    ) THEN RETURN 'CONTENDED'; END IF;
    PERFORM 1 FROM core.run_key_provision_intent AS provision
    WHERE provision.user_id=v_user_id ORDER BY provision.run_id FOR UPDATE NOWAIT;
    -- NV-09: an expired orphan intent (no run row) of an age_frozen owner can never commit: the commit
    -- locks refuse a non-active owner (0085:570). Account erasure's listByOwner sweep destroys its published
    -- key and FINALIZE's user delete cascades the row. For an active owner every intent blocks, as in 0110.
    IF FOUND AND (v_user_state<>'age_frozen' OR EXISTS (
      SELECT 1 FROM core.run_key_provision_intent AS provision
      WHERE provision.user_id=v_user_id
        AND (provision.expires_at>clock_timestamp()
          OR EXISTS (SELECT 1 FROM core.run AS run WHERE run.run_id=provision.run_id))
    )) THEN RETURN 'CONTENDED'; END IF;
    PERFORM 1 FROM serve.publication_key_provision_intent AS provision
    WHERE provision.user_id=v_user_id
    ORDER BY provision.run_id,provision.publication_ref FOR UPDATE NOWAIT;
    IF FOUND THEN RETURN 'CONTENDED'; END IF;

    -- Recompute the complete crypto/authorization ownership partition only
    -- after owned runs and both serializers are held. A provision or ownership
    -- transition that won earlier is observed; a later one cannot cross this
    -- barrier while PREPARE freezes the account.
    SELECT COALESCE(array_agg(run.run_id ORDER BY run.run_id),ARRAY[]::uuid[])
    INTO v_actual_run_ids
    FROM core.run AS run
    JOIN LATERAL (
      SELECT event.owner_ref FROM core.run_ownership_event AS event
      WHERE event.run_id=run.run_id ORDER BY event.at_seq ASC LIMIT 1
    ) AS crypto_owner ON true
    WHERE run.content_encryption_version=1 AND crypto_owner.owner_ref=v_owner_ref;
    IF v_actual_run_ids IS DISTINCT FROM p_expected_run_ids THEN
      RETURN 'STALE_MANIFEST';
    END IF;
    SELECT COALESCE(array_agg(latest.run_id ORDER BY latest.run_id),ARRAY[]::uuid[])
    INTO v_actual_legacy_run_ids
    FROM core.run AS run
    JOIN LATERAL (
      SELECT event.run_id,event.owner_ref FROM core.run_ownership_event AS event
      WHERE event.run_id=run.run_id ORDER BY event.at_seq DESC LIMIT 1
    ) AS latest ON true
    WHERE run.content_encryption_version IS DISTINCT FROM 1 AND latest.owner_ref=v_owner_ref;
    IF v_actual_legacy_run_ids IS DISTINCT FROM p_expected_legacy_run_ids THEN
      RETURN 'STALE_MANIFEST';
    END IF;

    -- Visibility and every snapshot/key-cleanup state are recomputed only
    -- after the complete owned run set is locked. This makes a concurrent
    -- publish/unpublish linearize wholly before or after PREPARE.
    SELECT COALESCE(array_agg(latest.run_id ORDER BY latest.run_id),ARRAY[]::uuid[])
    INTO v_actual_published_run_ids
    FROM core.run AS run
    JOIN LATERAL (
      SELECT event.run_id,event.owner_ref FROM core.run_ownership_event AS event
      WHERE event.run_id=run.run_id ORDER BY event.at_seq DESC LIMIT 1
    ) AS latest ON true
    JOIN LATERAL (
      SELECT visibility.state FROM core.run_visibility_event AS visibility
      WHERE visibility.run_id=run.run_id ORDER BY visibility.at_seq DESC LIMIT 1
    ) AS current_visibility ON true
    WHERE latest.owner_ref=v_owner_ref AND current_visibility.state='PUBLISHED';
    IF v_actual_published_run_ids IS DISTINCT FROM p_expected_published_run_ids THEN
      RETURN 'STALE_MANIFEST';
    END IF;
    SELECT inventory.current_publication_refs,inventory.cleanup_publication_refs
    INTO v_current_publication_refs,v_cleanup_publication_refs
    FROM identity.account_publication_inventory(v_owner_ref) AS inventory;
    IF EXISTS (
      SELECT 1 FROM unnest(v_cleanup_publication_refs) AS candidate(publication_ref)
      LEFT JOIN serve.publication_key_cleanup_intent AS cleanup
        ON cleanup.publication_ref=candidate.publication_ref
          AND cleanup.completed_at IS NOT NULL
      WHERE cleanup.publication_ref IS NULL
    ) THEN
      RETURN 'CONTENDED';
    END IF;
    IF EXISTS (
      SELECT 1 FROM serve.private_run_key_cleanup_intent AS intent
      WHERE intent.run_id=ANY(v_actual_run_ids)
    ) THEN
      RETURN 'CONTENDED';
    END IF;

    -- Complete deterministic account-local child order before identity.user.
    PERFORM 1 FROM identity.channel_binding AS channel
      WHERE channel.user_id=v_user_id
      ORDER BY CASE channel.channel_type
        WHEN 'email' THEN 0 WHEN 'recovery_email' THEN 1 ELSE 2 END,
        channel.channel_type,channel.channel_binding_id
      FOR UPDATE NOWAIT;
    PERFORM 1
    FROM identity."user" AS identity_user
    WHERE identity_user.user_id=v_user_id
      AND identity_user.owner_ref=v_owner_ref
      AND identity_user.state=v_user_state
    FOR UPDATE NOWAIT;
    IF NOT FOUND THEN RETURN 'NOT_FOUND'; END IF;
    PERFORM 1 FROM identity.verification_token_credential AS credential
      WHERE credential.channel_binding_id IN (
        SELECT channel.channel_binding_id FROM identity.channel_binding AS channel
        WHERE channel.user_id=v_user_id
      )
      ORDER BY credential.channel_binding_id,credential.token_hash
      FOR UPDATE NOWAIT;
    PERFORM 1 FROM identity.mfa_factor AS factor
      WHERE factor.user_id=v_user_id ORDER BY factor.mfa_factor_id FOR UPDATE NOWAIT;
    PERFORM 1 FROM identity.recovery_code AS recovery
      WHERE recovery.user_id=v_user_id ORDER BY recovery.recovery_code_id FOR UPDATE NOWAIT;
    PERFORM 1 FROM identity.session AS session
      WHERE session.user_id=v_user_id ORDER BY session.session_id FOR UPDATE NOWAIT;
    PERFORM 1 FROM identity.login_challenge AS challenge
      WHERE challenge.user_id=v_user_id ORDER BY challenge.login_challenge_id FOR UPDATE NOWAIT;
    PERFORM 1 FROM identity.step_up_grant AS step_grant
      WHERE step_grant.user_id=v_user_id ORDER BY step_grant.step_up_grant_id FOR UPDATE NOWAIT;
    PERFORM 1 FROM identity.publication_event_binding AS binding
      WHERE binding.user_id=v_user_id ORDER BY binding.reservation_id FOR UPDATE NOWAIT;
    PERFORM 1 FROM identity.private_erasure_audit_binding AS binding
      WHERE binding.user_id=v_user_id ORDER BY binding.request_ref FOR UPDATE NOWAIT;
    PERFORM 1 FROM identity.run_execution_binding AS execution
      WHERE execution.user_id=v_user_id ORDER BY execution.execution_ref FOR UPDATE NOWAIT;
    PERFORM 1 FROM serve.publication_key_provision_intent AS provision
      WHERE provision.user_id=v_user_id
      ORDER BY provision.run_id,provision.publication_ref FOR UPDATE NOWAIT;
    PERFORM 1 FROM identity.account_erasure_request AS request
      WHERE request.user_id=v_user_id ORDER BY request.erasure_id FOR UPDATE NOWAIT;
    PERFORM 1 FROM identity.account_erasure_notification_outbox AS outbox
      WHERE outbox.user_id=v_user_id ORDER BY outbox.message_id FOR UPDATE NOWAIT;

    SELECT request.execute_at,request.cancelled_at,request.prepared_at,request.committed_at
    INTO v_execute_at,v_cancelled_at,v_prepared_at,v_committed_at
    FROM identity.account_erasure_request AS request
    WHERE request.erasure_id=p_erasure_id AND request.user_id=v_user_id;
    IF NOT FOUND THEN RETURN 'NOT_FOUND'; END IF;
    IF v_cancelled_at IS NOT NULL THEN RETURN 'CANCELLED'; END IF;
    IF v_prepared_at IS NOT NULL THEN RETURN 'PREPARED'; END IF;
    IF v_committed_at IS NOT NULL THEN RETURN 'COMMITTED'; END IF;
    IF v_execute_at>clock_timestamp() THEN RETURN 'NOT_DUE'; END IF;
    IF v_delete_public_debates THEN
      PERFORM 1 FROM core.run AS run
      WHERE run.run_id=ANY(v_actual_published_run_ids)
      ORDER BY run.run_id FOR UPDATE NOWAIT;
      SELECT inventory.current_publication_refs,inventory.cleanup_publication_refs
      INTO v_recheck_current,v_recheck_cleanup
      FROM identity.account_publication_inventory(v_owner_ref) AS inventory;
      IF v_recheck_current IS DISTINCT FROM v_current_publication_refs
        OR v_recheck_cleanup IS DISTINCT FROM v_cleanup_publication_refs THEN
        RETURN 'STALE_MANIFEST';
      END IF;
    END IF;

    -- PREPARED is the durable crash/ambiguous-COMMIT boundary. The account is
    -- no longer active, but all keys still exist. External destruction starts
    -- only after a separate status read confirms this commit.
    -- NV-09: no COMPLETION notice for an age_frozen owner. 0040's enforce_erasure_notification_parent admits
    -- outbox inserts for active owners only; that owner's SCHEDULED notices were queued at schedule time.
    IF v_user_state='active' THEN
    INSERT INTO identity.account_erasure_notification_outbox(
      user_id,erasure_id,channel_binding_id,channel_type,event_kind,created_at,available_at
    )
    SELECT v_user_id,p_erasure_id,channel.channel_binding_id,channel.channel_type,
      'COMPLETION',clock_timestamp(),clock_timestamp()
    FROM identity.channel_binding AS channel
    WHERE channel.user_id=v_user_id
      AND channel.channel_type IN ('email','recovery_email')
      AND channel.state<>'revoked'
    ORDER BY CASE channel.channel_type WHEN 'email' THEN 0 ELSE 1 END,
      channel.channel_binding_id
    ON CONFLICT (erasure_id,channel_binding_id,event_kind) DO NOTHING;
    END IF;
    UPDATE identity."user" SET state='suspended' WHERE user_id=v_user_id;
    UPDATE identity.account_erasure_request
    SET prepared_at=clock_timestamp(),prepared_run_ids=v_actual_run_ids,
      prepared_legacy_run_ids=v_actual_legacy_run_ids,
      prepared_published_run_ids=v_actual_published_run_ids,
      prepared_current_publication_refs=v_current_publication_refs,
      prepared_cleanup_publication_refs=v_cleanup_publication_refs,
      legacy_plaintext_residual_count=cardinality(v_actual_legacy_run_ids),
      retained_public_snapshot_count=CASE WHEN v_delete_public_debates THEN 0
        ELSE cardinality(v_current_publication_refs) END,
      removed_public_snapshot_count=CASE WHEN v_delete_public_debates
        THEN cardinality(v_current_publication_refs) ELSE 0 END,
      keyless_historical_snapshot_count=cardinality(v_cleanup_publication_refs)
    WHERE erasure_id=p_erasure_id;
    IF v_delete_public_debates THEN
      FOREACH v_publication_ref IN ARRAY v_current_publication_refs LOOP
        SELECT snapshot.run_id INTO v_publication_run_id
        FROM serve.publication_snapshot AS snapshot
        WHERE snapshot.publication_ref=v_publication_ref;
        v_event_id:=gen_random_uuid();
        v_actor_ref:=gen_random_uuid();
        INSERT INTO core.publication_ref_tombstone(ref,ref_kind,created_at)
        VALUES (v_event_id,'visibility_event',v_now),(v_actor_ref,'visibility_actor',v_now);
        INSERT INTO serve.publication_key_cleanup_intent(
          publication_ref,requested_at,completed_at,cleanup_state,
          cleanup_claim_token,cleanup_claim_expires_at,destroy_result
        ) VALUES (v_publication_ref,v_now,NULL,'PENDING',NULL,NULL,NULL)
        ON CONFLICT (publication_ref) DO UPDATE
        SET requested_at=LEAST(serve.publication_key_cleanup_intent.requested_at,EXCLUDED.requested_at),
          completed_at=NULL,cleanup_state='PENDING',cleanup_claim_token=NULL,
          cleanup_claim_expires_at=NULL,destroy_result=NULL;
        INSERT INTO core.run_visibility_event(
          run_visibility_event_id,run_id,publication_ref,state,actor_audit_token,
          actor_ref_version,warning_version,occurred_at,at_seq
        ) VALUES (v_event_id,v_publication_run_id,v_publication_ref,'PRIVATE',
          v_actor_ref,3,'COPIES_MAY_PERSIST_V1',v_now,ledger.allocate_sequence());
      END LOOP;
    END IF;
    DELETE FROM core.run_content_attestation_secret
    WHERE run_id=ANY(v_actual_run_ids);
    GET DIAGNOSTICS v_attestation_secret_count=ROW_COUNT;
    -- A completed private erasure already removed this non-decrypting secret
    -- when its tombstone became authoritative. Every other encrypted run must
    -- still have exactly one secret for account PREPARE to delete.
    IF v_attestation_secret_count<>(
      SELECT count(*) FROM unnest(v_actual_run_ids) AS candidate(run_id)
      WHERE NOT EXISTS (
        SELECT 1 FROM serve.private_run_erasure_tombstone AS tombstone
        WHERE tombstone.run_id=candidate.run_id
      )
    ) THEN
      RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='CONTENT_ATTESTATION_SECRET_UNRESOLVED';
    END IF;
    RETURN 'PREPARED';
  EXCEPTION WHEN lock_not_available THEN
    RETURN 'CONTENDED';
  END;
END;
$function$;
REVOKE ALL ON FUNCTION erasure_reconcile.account_erasure_preview(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION erasure_reconcile.prepare_account_erasure(uuid,uuid[],uuid[],uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION erasure_reconcile.account_erasure_preview(uuid) TO debateai_erasure_runtime;
GRANT EXECUTE ON FUNCTION erasure_reconcile.prepare_account_erasure(uuid,uuid[],uuid[],uuid[]) TO debateai_erasure_runtime;
-- What this section promises, checked when it applies: each copy is owned like its identity counterpart (so it reads
-- and writes what that function does); each is a VOLATILE definer with the pinned path; no role of the erasure
-- witness's forbidden list may run either; the erasure runtime may run both and use the schema.
DO $$
DECLARE
  v_preview oid := to_regprocedure('erasure_reconcile.account_erasure_preview(uuid)');
  v_prepare oid := to_regprocedure('erasure_reconcile.prepare_account_erasure(uuid,uuid[],uuid[],uuid[])');
  v_legacy_preview oid := to_regprocedure('identity.account_erasure_preview(uuid)');
  v_legacy_prepare oid := to_regprocedure('identity.prepare_account_erasure(uuid,uuid[],uuid[],uuid[])');
  v_schema oid := to_regnamespace('erasure_reconcile');
BEGIN
  IF v_preview IS NULL OR v_prepare IS NULL OR v_legacy_preview IS NULL OR v_legacy_prepare IS NULL
    OR v_schema IS NULL OR NOT has_schema_privilege('debateai_erasure_runtime',v_schema,'USAGE')
    OR (SELECT count(*) FROM pg_catalog.pg_proc AS copy
      JOIN pg_catalog.pg_proc AS legacy
        ON legacy.oid=CASE copy.oid WHEN v_preview THEN v_legacy_preview ELSE v_legacy_prepare END
      WHERE copy.oid IN (v_preview,v_prepare)
        AND copy.proowner=legacy.proowner
        AND copy.prosecdef AND copy.provolatile='v'
        AND copy.proconfig=ARRAY['search_path=pg_catalog']
        AND NOT has_function_privilege('public',copy.oid,'EXECUTE')
        AND NOT has_function_privilege('debateai_runtime',copy.oid,'EXECUTE')
        AND NOT has_function_privilege('debateai_authorization_runtime',copy.oid,'EXECUTE')
        AND NOT has_function_privilege('debateai_publication_cleanup',copy.oid,'EXECUTE')
        AND NOT has_function_privilege('debateai_content_provision',copy.oid,'EXECUTE')
        AND NOT has_function_privilege('debateai_replay',copy.oid,'EXECUTE')
        AND has_function_privilege('debateai_erasure_runtime',copy.oid,'EXECUTE'))<>2 THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='SECURITY_FIXES_0125_NV09_DRIFT';
  END IF;
END $$;

-- ==== [NV-39] Recovery source windows: bounded least-evidence eviction at capacity ====
-- The three recovery source windows (0104's identity.password_reset_admit, 0106's identity.mfa_recovery_admit, 0105's
-- identity.backup_email_admit) refuse every new source digest once their table holds 65,536 rows, and their expiry
-- frees at most 100 digests per 30 s run, so one IPv6 /64 sending from 65,536 addresses locked every new source out of
-- password reset, MFA recovery and backup-email verification for hours. The new release's repositories key the window by
-- the caller's /64 for IPv6 (the address digest stays the audit and risk evidence) and call these three admits instead.
-- Each is its v1 body, except that `t` is re-read after the capacity lock and the capacity branch no longer refuses: it
-- ranks 64 candidates in a sub-select with no row marks (one scan, a 64-row top-N sort in memory: expired first, then
-- budget left before spent, then the lowest count, then the oldest), locks only those with SKIP LOCKED, so it never waits
-- on a row another admit or an expiry holds, and gives them up; the next 63 new sources then find room without a scan.
-- The cutoff and the per-source budget are computed once, before the statement. A spent row is given up only when no
-- other candidate remains. It refuses only when every one of the 64 candidates is locked at that instant (in practice an
-- in-flight expiry holding them until it commits), a transient refusal no caller can provoke on purpose. The capacity and
-- per-digest advisory lock keys are the v1 ones, so both releases serialise on them. The v1 admits are unchanged and keep
-- their grants for the release before, which still refuses a new digest at capacity.
CREATE OR REPLACE FUNCTION identity.password_reset_admit_evicting(p_source jsonb,p_register bigint) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE r identity.password_reset_source_window%ROWTYPE;rules jsonb;digest text;t timestamptz;cutoff timestamptz;budget integer;evicted integer;BEGIN
 rules:=identity.password_reset_rules(p_register);digest:=p_source->>'ipArgon2id';
 IF p_source IS NULL OR p_source<>jsonb_build_object('ipArgon2id',digest,'userAgentArgon2id',p_source->>'userAgentArgon2id') OR COALESCE(digest,'') !~ '^argon2id-audit:v1:[0-9a-f]{64}$' OR COALESCE(p_source->>'userAgentArgon2id','') !~ '^argon2id-audit:v1:[0-9a-f]{64}$' THEN RETURN false;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('password-reset:source:'||digest,0));
 SELECT * INTO r FROM identity.password_reset_source_window WHERE source_digest=digest FOR UPDATE;t:=clock_timestamp();
 IF r.source_digest IS NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('password-reset:source-capacity',0));t:=clock_timestamp();
  IF (SELECT count(*) FROM identity.password_reset_source_window)>=65536 THEN
   -- NV-39: rank 64 candidates without row marks, lock only those (skipping rows another admit or an expiry holds) and give them up.
   cutoff:=t-((rules->>'source_window_ms')::bigint*interval '1 millisecond');budget:=(rules->>'per_source_across_accounts')::integer;
   DELETE FROM identity.password_reset_source_window d WHERE d.source_digest=ANY(ARRAY(
    SELECT s.source_digest FROM identity.password_reset_source_window s
     WHERE s.source_digest=ANY(ARRAY(
      SELECT x.source_digest FROM identity.password_reset_source_window x
       ORDER BY (x.window_started_at<=cutoff) DESC,(x.uses>=budget),x.uses,x.window_started_at,x.source_digest
       LIMIT 64))
     FOR UPDATE OF s SKIP LOCKED));
   GET DIAGNOSTICS evicted=ROW_COUNT;
   IF evicted=0 THEN RETURN false;END IF;
  END IF;
  INSERT INTO identity.password_reset_source_window(source_digest,window_started_at,uses) VALUES(digest,t,1);RETURN true;
 END IF;
 IF r.window_started_at<=t-((rules->>'source_window_ms')::bigint*interval '1 millisecond') THEN r.window_started_at:=t;r.uses:=0;END IF;
 r.uses:=r.uses+1;UPDATE identity.password_reset_source_window SET window_started_at=r.window_started_at,uses=LEAST(r.uses,(rules->>'per_source_across_accounts')::integer+1) WHERE source_digest=digest;
 RETURN r.uses<=(rules->>'per_source_across_accounts')::integer;
END $$;

CREATE OR REPLACE FUNCTION identity.mfa_recovery_admit_evicting(p_source jsonb,p_register bigint) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE r identity.mfa_recovery_source_window%ROWTYPE;digest text;t timestamptz;cutoff timestamptz;evicted integer;BEGIN
 PERFORM identity.mfa_recovery_rules(p_register);digest:=p_source->>'ipArgon2id';
 IF p_source IS NULL OR p_source<>jsonb_build_object('ipArgon2id',digest,'userAgentArgon2id',p_source->>'userAgentArgon2id') OR COALESCE(digest,'') !~ '^argon2id-audit:v1:[0-9a-f]{64}$' OR COALESCE(p_source->>'userAgentArgon2id','') !~ '^argon2id-audit:v1:[0-9a-f]{64}$' THEN RETURN false;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('mfa-recovery:source:'||digest,0));
 SELECT * INTO r FROM identity.mfa_recovery_source_window WHERE source_digest=digest FOR UPDATE;t:=clock_timestamp();
 IF r.source_digest IS NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('mfa-recovery:source-capacity',0));t:=clock_timestamp();
  IF (SELECT count(*) FROM identity.mfa_recovery_source_window)>=65536 THEN
   -- NV-39: rank 64 candidates without row marks, lock only those (skipping rows another admit or an expiry holds) and give them up.
   cutoff:=t-interval '5 minutes';
   DELETE FROM identity.mfa_recovery_source_window d WHERE d.source_digest=ANY(ARRAY(
    SELECT s.source_digest FROM identity.mfa_recovery_source_window s
     WHERE s.source_digest=ANY(ARRAY(
      SELECT x.source_digest FROM identity.mfa_recovery_source_window x
       ORDER BY (x.window_started_at<=cutoff) DESC,(x.uses>=20),x.uses,x.window_started_at,x.source_digest
       LIMIT 64))
     FOR UPDATE OF s SKIP LOCKED));
   GET DIAGNOSTICS evicted=ROW_COUNT;
   IF evicted=0 THEN RETURN false;END IF;
  END IF;
  INSERT INTO identity.mfa_recovery_source_window VALUES(digest,t,1);RETURN true;
 END IF;
 IF r.window_started_at<=t-interval '5 minutes' THEN r.window_started_at:=t;r.uses:=0;END IF;
 r.uses:=LEAST(r.uses+1,21);UPDATE identity.mfa_recovery_source_window SET window_started_at=r.window_started_at,uses=r.uses WHERE source_digest=digest;RETURN r.uses<=20;
END $$;

CREATE OR REPLACE FUNCTION identity.backup_email_admit_evicting(p_session uuid,p_token text,p_source jsonb,p_register bigint) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE self jsonb;r identity.backup_email_source_window%ROWTYPE;w identity.backup_email_proof_window%ROWTYPE;digest text;t timestamptz;cutoff timestamptz;evicted integer;BEGIN
 PERFORM identity.backup_email_rules(p_register);self:=identity.backup_email_self(p_session,p_token);IF self IS NULL THEN RETURN false;END IF;
 digest:=p_source->>'ipArgon2id';IF p_source IS NULL OR p_source<>jsonb_build_object('ipArgon2id',digest,'userAgentArgon2id',p_source->>'userAgentArgon2id') OR COALESCE(digest,'') !~ '^argon2id-audit:v1:[0-9a-f]{64}$' OR COALESCE(p_source->>'userAgentArgon2id','') !~ '^argon2id-audit:v1:[0-9a-f]{64}$' THEN RETURN false;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('backup-email:source:'||digest,0));SELECT * INTO r FROM identity.backup_email_source_window WHERE source_digest=digest FOR UPDATE;t:=clock_timestamp();
 IF r.source_digest IS NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('backup-email:source-capacity',0));t:=clock_timestamp();
  IF (SELECT count(*) FROM identity.backup_email_source_window)>=65536 THEN
   -- NV-39: rank 64 candidates without row marks, lock only those (skipping rows another admit or an expiry holds) and give them up.
   cutoff:=t-interval '5 minutes';
   DELETE FROM identity.backup_email_source_window d WHERE d.source_digest=ANY(ARRAY(
    SELECT s.source_digest FROM identity.backup_email_source_window s
     WHERE s.source_digest=ANY(ARRAY(
      SELECT x.source_digest FROM identity.backup_email_source_window x
       ORDER BY (x.window_started_at<=cutoff) DESC,(x.uses>=20),x.uses,x.window_started_at,x.source_digest
       LIMIT 64))
     FOR UPDATE OF s SKIP LOCKED));
   GET DIAGNOSTICS evicted=ROW_COUNT;
   IF evicted=0 THEN RETURN false;END IF;
  END IF;
  INSERT INTO identity.backup_email_source_window VALUES(digest,t,1);r.uses:=1;
 ELSE IF r.window_started_at<=t-interval '5 minutes' THEN r.window_started_at:=t;r.uses:=0;END IF;r.uses:=LEAST(r.uses+1,21);UPDATE identity.backup_email_source_window SET window_started_at=r.window_started_at,uses=r.uses WHERE source_digest=digest;END IF;
 SELECT * INTO w FROM identity.backup_email_proof_window WHERE session_id=p_session FOR UPDATE;
 IF w.session_id IS NULL THEN INSERT INTO identity.backup_email_proof_window VALUES(p_session,t,1);w.uses:=1;
 ELSE IF w.window_started_at<=t-interval '5 minutes' THEN w.window_started_at:=t;w.uses:=0;END IF;w.uses:=LEAST(w.uses+1,6);UPDATE identity.backup_email_proof_window SET window_started_at=w.window_started_at,uses=w.uses WHERE session_id=p_session;END IF;
 RETURN r.uses<=20 AND w.uses<=5;
END $$;

ALTER FUNCTION identity.password_reset_admit_evicting(jsonb,bigint) OWNER TO debateai_password_reset_owner;
ALTER FUNCTION identity.mfa_recovery_admit_evicting(jsonb,bigint) OWNER TO debateai_mfa_recovery_owner;
ALTER FUNCTION identity.backup_email_admit_evicting(uuid,text,jsonb,bigint) OWNER TO debateai_backup_email_owner;
REVOKE ALL ON FUNCTION identity.password_reset_admit_evicting(jsonb,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION identity.mfa_recovery_admit_evicting(jsonb,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION identity.backup_email_admit_evicting(uuid,text,jsonb,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.password_reset_admit_evicting(jsonb,bigint) TO debateai_password_reset_runtime;
GRANT EXECUTE ON FUNCTION identity.mfa_recovery_admit_evicting(jsonb,bigint) TO debateai_mfa_recovery_runtime;
GRANT EXECUTE ON FUNCTION identity.backup_email_admit_evicting(uuid,text,jsonb,bigint) TO debateai_backup_email_runtime;

-- ==== [NV-50] a sent attempt that was never answered: its own two spend sources ====
-- The gateway charged a model call only once its reply had been read and stored (`recordCall`). An attempt that was
-- sent and then ran out of time, lost its connection or could not be stored was retried uncharged, so retries could
-- spend past the per-run and daily ceilings. The new release charges such an attempt as RUN_UNANSWERED (a debate call)
-- or STORY_UNANSWERED (a story call), at its reported usage or else its projected maximum: its run's or story's envelope
-- and the site's day count it; no person's window, hold or withdrawal does (they read RUN and STORY only). The shared
-- source list is replaced in place, wider, by name (one pair for it in this step), and a new restriction makes every
-- unanswered row name its run and its attempt and carry no phase. Both are NOT VALID, so nothing is scanned; a later
-- contract step validates them. LAST in this step on purpose: the pair takes ACCESS EXCLUSIVE on ledger.model_spend
-- until 0125 commits, so every spend read and write waits for the rest of the step (deploy/vps/README.md, run 3).
-- n1: reviewed the shared source list only widens (0074's, last widened by 0118); every source the release before writes stays allowed
ALTER TABLE ledger.model_spend DROP CONSTRAINT IF EXISTS model_spend_spend_source_check;
ALTER TABLE ledger.model_spend ADD CONSTRAINT model_spend_spend_source_check
  CHECK (spend_source IN ('RUN', 'SUPPORT', 'STORY', 'LANGUAGE_CHECK', 'RUN_UNANSWERED', 'STORY_UNANSWERED')) NOT VALID;
-- n1: reviewed a new restriction only the two new sources meet, which the release before never writes
ALTER TABLE ledger.model_spend DROP CONSTRAINT IF EXISTS model_spend_unanswered_names_its_attempt;
ALTER TABLE ledger.model_spend ADD CONSTRAINT model_spend_unanswered_names_its_attempt
  CHECK (spend_source NOT IN ('RUN_UNANSWERED', 'STORY_UNANSWERED')
    OR (run_id IS NOT NULL AND attempt_id IS NOT NULL AND spend_phase IS NULL)) NOT VALID;
-- The contract this section claims, checked rather than assumed: both constraints are there (a missing one fails, never
-- passes as NULL), and 0066's append-only guards are still installed and enabled after these ALTERs (0118's closing shape).
DO $nv50_contract$
BEGIN
  IF coalesce((SELECT pg_catalog.pg_get_constraintdef(k.oid) FROM pg_catalog.pg_constraint AS k
        WHERE k.conrelid = 'ledger.model_spend'::regclass AND k.conname = 'model_spend_spend_source_check'), '')
        NOT LIKE '%''RUN_UNANSWERED''%''STORY_UNANSWERED''%'
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint AS k
        WHERE k.conrelid = 'ledger.model_spend'::regclass AND k.conname = 'model_spend_unanswered_names_its_attempt') THEN
    RAISE EXCEPTION 'NV50_SPEND_SOURCES_MISSING';
  END IF;
  IF (
    SELECT pg_catalog.count(*) FROM pg_catalog.pg_trigger AS trigger
    WHERE NOT trigger.tgisinternal
      AND trigger.tgenabled IN ('O','A')
      AND trigger.tgrelid = 'ledger.model_spend'::regclass
      AND trigger.tgfoid = ANY(ARRAY[
        'core.reject_truncate()'::regprocedure,
        'core.reject_mutation()'::regprocedure
      ])
  ) <> 2 THEN
    RAISE EXCEPTION 'NV50_SPEND_GUARD_CONTRACT_INVALID';
  END IF;
END
$nv50_contract$;
