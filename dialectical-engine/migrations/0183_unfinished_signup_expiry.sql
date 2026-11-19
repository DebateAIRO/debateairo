-- 0183 · A sign-up not finished within 24 hours is deleted (owner's goal of 2026-11-11; built as 0176 and renumbered after the steps dev had by then,
-- 0176 to 0182).
--
-- Plain words. A sign-up is finished when its account is active: the email is verified and the second factor is set up. Until then the account is
-- pending_verification (the mail's link not yet opened) or pending_mfa (the link opened, the second factor not yet set up). Nothing ever removed such
-- an account, so it held its email address, and its public name, for good: signing up again with the same address answers as a duplicate and sends
-- nothing.
-- From this step, an account still in one of those two states 24 hours after its sign-up began (identity."user".created_at, the sign-up request's own
-- time), once no link it was sent is still live, is deleted, and its address and name are free again. A link is live while its credential
-- (identity.verification_token_credential, on any of the account's channels) has not run out, consumed or not: an unconsumed one still verifies the
-- address, and a consumed one is the pending_mfa account's authority to set up its second factor (0100's onboarding subject). A link is 24 hours at
-- most (0112's create and the register's token_ttl_ms), but a resend issues a new one (0096's resend, and 0100's for a pending_mfa account), so a link
-- resent in the 24th hour stays good for its whole life rather than being cut short by the delete; a link that ran out leaves nothing to wait for.
-- An account that was ever active is never touched: no step moves an account back into either state (0096's verification, 0112's social sign-up and
-- 0178's create_social_account_v2 and consume_verification_set_password enter pending_mfa from pending_verification, or keep it; 0099's two
-- enrollments leave it for active), and the delete asks the state again under the account's own locks.
-- A social sign-up is no exception. 0178's untrusted arm (NV-13) leaves a pending_verification account with no password and no provider link until its
-- mail's link is opened, and the trusted arm a pending_mfa account until its second factor is set up (its enrollment is five minutes long, 0101); both
-- are unfinished sign-ups like any other. A passkey is only ever a second factor set up from pending_mfa (0098), so no account waits on one.
--   identity.read_unfinished_signups_due(limit)                the accounts due, the oldest sign-up first (ids only), at most `limit` (1 to 1000).
--   identity.expire_unfinished_signup(user)                    deletes one, under the locks every sign-up step takes (0085's security-subject lock,
--                                                              then its channels, the account, its link credentials: identity.lock_account_t9_internal),
--                                                              so a verification or an enrollment in flight either finishes first or finds no account.
--                                                              It asks the state, the 24 hours and the links again after the locks, on the database's
--                                                              own clock; 'EXPIRED' when it deleted, 'NOT_DUE' for anything else (gone, finished,
--                                                              younger, or holding a live link). One
--                                                              account a call: one transaction holds one account's locks and the audit chain's lock
--                                                              for one row only.
--   identity.unfinished_signup_key_cleanup                     one row per deleted sign-up whose key file the API has yet to destroy: the account's
--                                                              id and when it went. The account's key (its wrapped DEK) is a file the API keeps, not a
--                                                              row here, so the delete writes this row in its own transaction and the API destroys the
--                                                              file afterwards; a crash in between leaves the row, and the next pass finishes it.
--   identity.read_unfinished_signup_key_cleanup(limit)         those ids, the oldest first, at most `limit` (1 to 1000); never one whose account exists.
--   identity.complete_unfinished_signup_key_cleanup(user)      takes the row once the file is gone; true when it took it.
-- What goes with the account: everything that hangs on it by a cascading key (its channels, link credentials and send reservations, age check,
-- declared region, pending factor and enrollment rows, social identity and enrollment, passkey rows, security hold, risk signals, and 0178's recovery
-- and reset rows). Every foreign key on identity."user" cascades or sets NULL, so nothing refuses the delete (the integration test pins that, so a
-- later table that refused would turn it red); 0177's AFTER DELETE trigger finds no debate of a sign-up and stops. What stays, as for
-- an erased account: the audit chain's rows, and the sign-up's legal acceptances, whose six years start at the delete (0080's AFTER DELETE trigger
-- writes legal.account_closure, and legal.purge_expired_acceptance takes both in time). The delete writes one audit row first, in the account's own
-- audit name: identity.registration.expired.
-- Who may call them: the cross-account marker alone (0130's debateai_rls_all_accounts), as 0171's sweep of the clarify reservations: they name no
-- owner and take any account's sign-up, and no request login holds the marker. The API runs the pass outside any request, so on its system login
-- (apps/api/src/unfinished-signup-expiry.ts): from a gated ten-minute timer and once each time its release becomes current. Not the erasure login
-- (debateai_erasure_runtime), although it is the one that finalizes an account's erasure: every release counts that role's functions exactly when it
-- starts (assertAccountErasureDatabaseRole), so one more function there would stop the release before from restarting beside this step (0131's
-- header); the marker's functions are counted by no release. No login holds any right on the table, so it is outside row-level security's rule
-- (SPEC-v4 R1: a relation is in scope when an API login can SELECT it).
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: expand
-- n1: keeps-verifier
--   expand          one new table and four new functions; the release before reads none of them, nothing earlier is redefined, and the one
--                   role they are granted to is counted by no release's boot check, so the release before starts and runs beside it.
--   keeps-verifier  no billing relation or function, so lineage/verify-effective-capabilities-130.sql stays in force.

CREATE TABLE IF NOT EXISTS identity.unfinished_signup_key_cleanup (
  user_id uuid PRIMARY KEY,
  expired_at timestamptz NOT NULL
);

SELECT core.install_truncate_guard('identity.unfinished_signup_key_cleanup');

-- The sign-ups due: still pending 24 hours after they began, with no link still live, the oldest first. Ids only.
CREATE OR REPLACE FUNCTION identity.read_unfinished_signups_due(p_limit integer) RETURNS uuid[]
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='UNFINISHED_SIGNUP_EXPIRY_INVALID'; END IF;
  RETURN COALESCE((
    SELECT pg_catalog.array_agg(due.user_id ORDER BY due.created_at, due.user_id) FROM (
      SELECT account.user_id, account.created_at FROM identity."user" AS account
      WHERE account.state IN ('pending_verification','pending_mfa')
        AND account.created_at <= pg_catalog.clock_timestamp() - interval '24 hours'
        AND NOT EXISTS (SELECT 1 FROM identity.channel_binding AS channel
          JOIN identity.verification_token_credential AS link ON link.channel_binding_id = channel.channel_binding_id
          WHERE channel.user_id = account.user_id AND link.expires_at > pg_catalog.clock_timestamp())
      ORDER BY account.created_at, account.user_id LIMIT p_limit) AS due), ARRAY[]::uuid[]);
END
$$;

-- Deletes one sign-up that is still unfinished 24 hours after it began and holds no live link. The locks come first, in the order every sign-up step
-- takes them (its link credentials among them); the state, the age and the links are read after them, so a step that finished, or a resend that
-- issued a new link, while this one waited is seen, and the clock is the database's own, sampled after the waits.
CREATE OR REPLACE FUNCTION identity.expire_unfinished_signup(p_user_id uuid) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  v_audit_token uuid;
  v_state text;
  v_created_at timestamptz;
  v_now timestamptz;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='UNFINISHED_SIGNUP_EXPIRY_INVALID'; END IF;
  SELECT account.audit_token, account.user_state INTO v_audit_token, v_state
  FROM identity.lock_account_t9_internal(p_user_id, false) AS account;
  IF v_audit_token IS NULL THEN RETURN 'NOT_DUE'; END IF;
  v_now := pg_catalog.clock_timestamp();
  SELECT account.created_at INTO v_created_at FROM identity."user" AS account WHERE account.user_id = p_user_id;
  IF v_state IS NULL OR v_state NOT IN ('pending_verification','pending_mfa')
    OR v_created_at IS NULL OR v_created_at > v_now - interval '24 hours'
    OR EXISTS (SELECT 1 FROM identity.channel_binding AS channel
      JOIN identity.verification_token_credential AS link ON link.channel_binding_id = channel.channel_binding_id
      WHERE channel.user_id = p_user_id AND link.expires_at > v_now) THEN
    RETURN 'NOT_DUE';
  END IF;
  PERFORM identity.append_audit_event_internal(
    pg_catalog.gen_random_uuid(), v_audit_token::text, 'identity.registration.expired',
    'identity.registration', v_audit_token::text, v_now,
    '{"schema":"unfinished-signup-expiry-v1"}'::jsonb, 'ALLOW', true, 'SIGNUP_NOT_FINISHED_WITHIN_24_HOURS'
  );
  INSERT INTO identity.unfinished_signup_key_cleanup AS cleanup (user_id, expired_at) VALUES (p_user_id, v_now)
    ON CONFLICT (user_id) DO NOTHING;
  DELETE FROM identity."user" AS account WHERE account.user_id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='UNFINISHED_SIGNUP_EXPIRY_ACCOUNT_MISSING'; END IF;
  RETURN 'EXPIRED';
END
$$;

-- The deleted sign-ups whose key file is still to be destroyed, the oldest first. Never an id whose account exists.
CREATE OR REPLACE FUNCTION identity.read_unfinished_signup_key_cleanup(p_limit integer) RETURNS uuid[]
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='UNFINISHED_SIGNUP_EXPIRY_INVALID'; END IF;
  RETURN COALESCE((
    SELECT pg_catalog.array_agg(owed.user_id ORDER BY owed.expired_at, owed.user_id) FROM (
      SELECT cleanup.user_id, cleanup.expired_at FROM identity.unfinished_signup_key_cleanup AS cleanup
      WHERE NOT EXISTS (SELECT 1 FROM identity."user" AS account WHERE account.user_id = cleanup.user_id)
      ORDER BY cleanup.expired_at, cleanup.user_id LIMIT p_limit) AS owed), ARRAY[]::uuid[]);
END
$$;

-- The key file is gone: the row goes. True when this call took it; never while an account of that id exists.
CREATE OR REPLACE FUNCTION identity.complete_unfinished_signup_key_cleanup(p_user_id uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='UNFINISHED_SIGNUP_EXPIRY_INVALID'; END IF;
  DELETE FROM identity.unfinished_signup_key_cleanup AS cleanup WHERE cleanup.user_id = p_user_id
    AND NOT EXISTS (SELECT 1 FROM identity."user" AS account WHERE account.user_id = cleanup.user_id);
  RETURN FOUND;
END
$$;

-- Owned by the owner of 0110's identity.finalize_account_erasure, the one function that deletes an account today: it may delete the account, read its
-- links, take its locks and write the audit row, and the step refuses to apply where it could not.
-- n1: reviewed sets the owner of the objects this step creates and checks what that owner may do; the release before reads none of them.
DO $unfinished_signup_expiry_owner$
DECLARE v_owner name;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO STRICT v_owner FROM pg_catalog.pg_proc AS p
    WHERE p.oid = 'identity.finalize_account_erasure(uuid,timestamptz,timestamptz,integer,integer,integer,integer)'::regprocedure;
  EXECUTE pg_catalog.format('ALTER TABLE identity.unfinished_signup_key_cleanup OWNER TO %I', v_owner);
  EXECUTE pg_catalog.format('ALTER FUNCTION identity.read_unfinished_signups_due(integer) OWNER TO %I', v_owner);
  EXECUTE pg_catalog.format('ALTER FUNCTION identity.expire_unfinished_signup(uuid) OWNER TO %I', v_owner);
  EXECUTE pg_catalog.format('ALTER FUNCTION identity.read_unfinished_signup_key_cleanup(integer) OWNER TO %I', v_owner);
  EXECUTE pg_catalog.format('ALTER FUNCTION identity.complete_unfinished_signup_key_cleanup(uuid) OWNER TO %I', v_owner);
  IF NOT pg_catalog.has_table_privilege(v_owner, 'identity."user"', 'SELECT')
    OR NOT pg_catalog.has_table_privilege(v_owner, 'identity."user"', 'DELETE')
    OR NOT pg_catalog.has_table_privilege(v_owner, 'identity.channel_binding', 'SELECT')
    OR NOT pg_catalog.has_table_privilege(v_owner, 'identity.verification_token_credential', 'SELECT')
    OR NOT pg_catalog.has_function_privilege(v_owner, 'identity.lock_account_t9_internal(uuid,boolean)', 'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(v_owner,
      'identity.append_audit_event_internal(uuid,text,text,text,text,timestamptz,jsonb,text,boolean,text)', 'EXECUTE') THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='UNFINISHED_SIGNUP_EXPIRY_OWNER_UNABLE';
  END IF;
END
$unfinished_signup_expiry_owner$;

REVOKE ALL ON TABLE identity.unfinished_signup_key_cleanup
  FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_unfinished_signups_due(integer), identity.expire_unfinished_signup(uuid),
  identity.read_unfinished_signup_key_cleanup(integer), identity.complete_unfinished_signup_key_cleanup(uuid)
  FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
-- The API's pass runs outside any request, on its system login: the marker's alone, as 0171's sweep.
GRANT EXECUTE ON FUNCTION identity.read_unfinished_signups_due(integer), identity.expire_unfinished_signup(uuid),
  identity.read_unfinished_signup_key_cleanup(integer), identity.complete_unfinished_signup_key_cleanup(uuid) TO debateai_rls_all_accounts;
