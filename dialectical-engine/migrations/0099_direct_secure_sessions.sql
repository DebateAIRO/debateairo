-- Task8: append-only authority and direct verified-factor completion. No history rewrite.
-- Exact ordinary-session authority inventory. Migration lineage remains an installation prerequisite.
DO $migration$
DECLARE item jsonb; pattern jsonb; target oid; before_row record; after_row record; definition text; original text; expected integer;
BEGIN
 FOR item IN SELECT value FROM jsonb_array_elements($inventory$[
 {
  "signature": "identity.publication_grant_is_live(text,uuid,uuid,text,uuid)",
  "path": "migrations/0039_publication_visibility.sql",
  "patterns": [
   {
    "old": "session.absolute_expires_at",
    "new": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')",
    "count": 1
   }
  ]
 },
 {
  "signature": "identity.audit_publication_preflight_denial(uuid,uuid,uuid,timestamptz,uuid)",
  "path": "migrations/0085_staff_access_foundation.sql",
  "patterns": [
   {
    "old": "session.absolute_expires_at",
    "new": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')",
    "count": 1
   },
   {
    "old": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')>v_now",
    "new": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')>GREATEST(v_now,clock_timestamp())",
    "count": 1
   }
  ]
 },
 {
  "signature": "identity.rotate_session_after_step_up(uuid,uuid,text,uuid,bigint,uuid,text,text,text,jsonb,timestamptz,uuid,text,text,uuid,timestamptz)",
  "path": "migrations/0098_consumer_passkeys.sql",
  "patterns": [
   {
    "old": "session.absolute_expires_at",
    "new": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')",
    "count": 2
   },
   {
    "old": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')>v_now",
    "new": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')>GREATEST(v_now,clock_timestamp())",
    "count": 1
   }
  ]
 },
 {
  "signature": "core.transition_run_publication(uuid,uuid,uuid,uuid,uuid,text,text,uuid,text,jsonb,timestamptz,uuid,uuid,uuid)",
  "path": "migrations/0085_staff_access_foundation.sql",
  "patterns": [
   {
    "old": "session.absolute_expires_at",
    "new": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')",
    "count": 1
   },
   {
    "old": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')>v_now",
    "new": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')>GREATEST(v_now,clock_timestamp())",
    "count": 1
   }
  ]
 },
 {
  "signature": "core.prepare_run_key_provision(uuid,uuid,uuid,uuid)",
  "path": "migrations/0085_staff_access_foundation.sql",
  "patterns": [
   {
    "old": "session.absolute_expires_at",
    "new": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')",
    "count": 1
   },
   {
    "old": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')>v_now",
    "new": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')>GREATEST(v_now,clock_timestamp())",
    "count": 1
   }
  ]
 },
 {
  "signature": "core.lock_run_key_provision_for_commit(uuid,uuid,uuid,uuid)",
  "path": "migrations/0085_staff_access_foundation.sql",
  "patterns": [
   {
    "old": "session.absolute_expires_at",
    "new": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')",
    "count": 1
   }
  ]
 },
 {
  "signature": "serve.prepare_publication_key_provision(uuid,uuid,uuid,uuid,uuid,text)",
  "path": "migrations/0085_staff_access_foundation.sql",
  "patterns": [
   {
    "old": "session.absolute_expires_at",
    "new": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')",
    "count": 1
   },
   {
    "old": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')>v_now",
    "new": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')>GREATEST(v_now,clock_timestamp())",
    "count": 1
   }
  ]
 },
 {
  "signature": "identity.revoke_all_sessions_with_audit(uuid,uuid,timestamptz,jsonb)",
  "path": "migrations/0040_account_erasure.sql",
  "patterns": [
   {
    "old": "session.absolute_expires_at",
    "new": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')",
    "count": 1
   },
   {
    "old": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')>p_occurred_at",
    "new": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')>CASE WHEN p_occurred_at IS NULL THEN NULL ELSE GREATEST(p_occurred_at,clock_timestamp()) END",
    "count": 1
   }
  ]
 },
 {
  "signature": "identity.authenticate_session_t9(text,text,timestamptz,timestamptz)",
  "path": "migrations/0087_staff_authorization_guards.sql",
  "patterns": [
   {
    "old": "session.absolute_expires_at",
    "new": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')",
    "count": 3
   },
   {
    "old": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')>v_now",
    "new": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')>GREATEST(v_now,clock_timestamp())",
    "count": 1
   }
  ]
 },
 {
  "signature": "identity.authenticate_account_erasure_status_session(text,text,timestamptz)",
  "path": "migrations/0040_account_erasure.sql",
  "patterns": [
   {
    "old": "session.absolute_expires_at",
    "new": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')",
    "count": 2
   },
   {
    "old": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')>p_occurred_at",
    "new": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')>CASE WHEN p_occurred_at IS NULL THEN NULL ELSE GREATEST(p_occurred_at,clock_timestamp()) END",
    "count": 1
   }
  ]
 },
 {
  "signature": "identity.reserve_publication_event_refs(uuid,uuid,uuid,text,text)",
  "path": "migrations/0085_staff_access_foundation.sql",
  "patterns": [
   {
    "old": "session.absolute_expires_at",
    "new": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')",
    "count": 1
   },
   {
    "old": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')>v_now",
    "new": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')>GREATEST(v_now,clock_timestamp())",
    "count": 1
   }
  ]
 },
 {
  "signature": "core.prepare_private_run_erasure(uuid,uuid,uuid,uuid,text)",
  "path": "migrations/0085_staff_access_foundation.sql",
  "patterns": [
   {
    "old": "session.absolute_expires_at",
    "new": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')",
    "count": 2
   },
   {
    "old": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')>v_now",
    "new": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')>GREATEST(v_now,clock_timestamp())",
    "count": 2
   }
  ]
 },
 {
  "signature": "core.resume_private_run_erasure(uuid,uuid,uuid,uuid,text)",
  "path": "migrations/0085_staff_access_foundation.sql",
  "patterns": [
   {
    "old": "session.absolute_expires_at",
    "new": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')",
    "count": 2
   },
   {
    "old": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')>v_now",
    "new": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')>GREATEST(v_now,clock_timestamp())",
    "count": 2
   }
  ]
 },
 {
  "signature": "identity.schedule_account_erasure(uuid,uuid,uuid,text)",
  "path": "migrations/0085_staff_access_foundation.sql",
  "patterns": [
   {
    "old": "session.absolute_expires_at",
    "new": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')",
    "count": 1
   },
   {
    "old": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')>v_now",
    "new": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')>GREATEST(v_now,clock_timestamp())",
    "count": 1
   }
  ]
 },
 {
  "signature": "identity.current_account_erasure(uuid,uuid,uuid)",
  "path": "migrations/0040_account_erasure.sql",
  "patterns": [
   {
    "old": "session.absolute_expires_at",
    "new": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')",
    "count": 1
   },
   {
    "old": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')>v_now",
    "new": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')>GREATEST(v_now,clock_timestamp())",
    "count": 1
   }
  ]
 },
 {
  "signature": "identity.cancel_current_account_erasure(uuid,uuid,uuid,uuid)",
  "path": "migrations/0085_staff_access_foundation.sql",
  "patterns": [
   {
    "old": "session.absolute_expires_at",
    "new": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')",
    "count": 1
   },
   {
    "old": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')>v_now",
    "new": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')>GREATEST(v_now,clock_timestamp())",
    "count": 1
   }
  ]
 },
 {
  "signature": "core.claim_legacy_runs(uuid,uuid,uuid,text,text,jsonb)",
  "path": "migrations/0085_staff_access_foundation.sql",
  "patterns": [
   {
    "old": "session.absolute_expires_at",
    "new": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')",
    "count": 1
   },
   {
    "old": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')>v_now",
    "new": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')>GREATEST(v_now,clock_timestamp())",
    "count": 1
   }
  ]
 },
 {
  "signature": "identity.prepare_authentication_risk_signal_for_session(text,text)",
  "path": "migrations/0046_authentication_risk_signals.sql",
  "patterns": [
   {
    "old": "session.absolute_expires_at",
    "new": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')",
    "count": 1
   }
  ]
 },
 {
  "signature": "identity.confirm_account_age_with_audit(uuid,uuid,boolean,smallint,text,text,timestamptz,jsonb)",
  "path": "migrations/0077_age_gate.sql",
  "patterns": [
   {
    "old": "session.absolute_expires_at",
    "new": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')",
    "count": 1
   },
   {
    "old": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')>p_occurred_at",
    "new": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')>CASE WHEN p_occurred_at IS NULL THEN NULL ELSE GREATEST(p_occurred_at,clock_timestamp()) END",
    "count": 1
   }
  ]
 },
 {
  "signature": "identity.record_sensitive_data_consent(uuid,uuid,text,text,timestamptz)",
  "path": "migrations/0078_sensitive_data_consent.sql",
  "patterns": [
   {
    "old": "session.absolute_expires_at",
    "new": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')",
    "count": 1
   },
   {
    "old": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')>p_occurred_at",
    "new": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')>CASE WHEN p_occurred_at IS NULL THEN NULL ELSE GREATEST(p_occurred_at,clock_timestamp()) END",
    "count": 1
   }
  ]
 },
 {
  "signature": "identity.request_email_change_with_audit(uuid,uuid,text,uuid,bytea,jsonb,text,text,timestamptz,jsonb)",
  "path": "migrations/0079_email_change.sql",
  "patterns": [
   {
    "old": "session.absolute_expires_at",
    "new": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')",
    "count": 1
   },
   {
    "old": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')>v_now",
    "new": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')>GREATEST(v_now,clock_timestamp())",
    "count": 1
   }
  ]
 },
 {
  "signature": "identity.resend_email_change_with_audit(uuid,uuid,text,timestamptz,bigint,jsonb)",
  "path": "migrations/0079_email_change.sql",
  "patterns": [
   {
    "old": "session.absolute_expires_at",
    "new": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')",
    "count": 1
   },
   {
    "old": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')>v_now",
    "new": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')>GREATEST(v_now,clock_timestamp())",
    "count": 1
   }
  ]
 },
 {
  "signature": "identity.cancel_own_email_change_with_audit(uuid,uuid,jsonb)",
  "path": "migrations/0079_email_change.sql",
  "patterns": [
   {
    "old": "session.absolute_expires_at",
    "new": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')",
    "count": 1
   },
   {
    "old": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')>v_now",
    "new": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')>GREATEST(v_now,clock_timestamp())",
    "count": 1
   }
  ]
 },
 {
  "signature": "identity.read_email_settings(uuid,uuid)",
  "path": "migrations/0079_email_change.sql",
  "patterns": [
   {
    "old": "session.absolute_expires_at",
    "new": "LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')",
    "count": 1
   }
  ]
 },
 {
  "signature": "identity.staff_rotation_binding_current(uuid,uuid,uuid,bigint,text)",
  "path": "migrations/0085_staff_access_foundation.sql",
  "patterns": [
   {
    "old": "AND absolute_expires_at>clock_timestamp()",
    "new": "AND LEAST(absolute_expires_at,created_at+interval '720 hours')>clock_timestamp()",
    "count": 1
   }
  ]
 },
 {
  "signature": "staff.live_account(uuid,uuid)",
  "path": "migrations/0085_staff_access_foundation.sql",
  "patterns": [
   {
    "old": "AND absolute_expires_at>clock_timestamp()",
    "new": "AND LEAST(absolute_expires_at,created_at+interval '720 hours')>clock_timestamp()",
    "count": 1
   }
  ]
 },
 {
  "signature": "staff.begin_owned_webauthn(uuid,uuid,text,text,text,text,text,text,uuid,jsonb,jsonb,jsonb)",
  "path": "migrations/0094_owner_one_verified_key.sql",
  "patterns": [
   {
    "old": "(SELECT absolute_expires_at FROM identity.session",
    "new": "(SELECT LEAST(absolute_expires_at,created_at+interval '720 hours') FROM identity.session",
    "count": 1
   }
  ]
 },
 {
  "signature": "staff.complete_owned_webauthn_assertion(uuid,uuid,uuid,text,bigint,text,text,text,jsonb,jsonb,jsonb,text,text)",
  "path": "migrations/0094_owner_one_verified_key.sql",
  "patterns": [
   {
    "old": "SELECT LEAST(v_time+interval '8 hours',absolute_expires_at) INTO v_expiry FROM identity.session",
    "new": "SELECT LEAST(v_time+interval '8 hours',absolute_expires_at,created_at+interval '720 hours') INTO v_expiry FROM identity.session",
    "count": 1
   }
  ]
 },
 {
  "signature": "identity.assert_session_current(uuid,uuid,text)",
  "path": "migrations/0087_staff_authorization_guards.sql",
  "patterns": [
   {
    "old": "v_session.absolute_expires_at",
    "new": "LEAST(v_session.absolute_expires_at,v_session.created_at+interval '720 hours')",
    "count": 1
   },
   {
    "old": "LEAST(v_session.absolute_expires_at,v_session.created_at+interval '720 hours')>v_now",
    "new": "LEAST(v_session.absolute_expires_at,v_session.created_at+interval '720 hours')>GREATEST(v_now,clock_timestamp())",
    "count": 1
   }
  ]
 }
]$inventory$::jsonb) LOOP
  target:=to_regprocedure(item->>'signature');
  IF target IS NULL THEN RAISE EXCEPTION 'SESSION_CLAMP_FUNCTION_MISSING: %',item->>'signature'; END IF;
  SELECT proowner,proacl,prosecdef,proconfig INTO before_row FROM pg_proc WHERE oid=target;
  definition:=pg_get_functiondef(target);
  FOR pattern IN SELECT value FROM jsonb_array_elements(item->'patterns') LOOP
   original:=pattern->>'old'; expected:=(pattern->>'count')::integer;
   IF position(pattern->>'new' IN definition)>0 OR (length(definition)-length(replace(definition,original,'')))/length(original)<>expected
     OR (original='session.absolute_expires_at' AND definition ~ '[A-Za-z0-9_.]session[.]absolute_expires_at')
     OR (original='v_session.absolute_expires_at' AND definition ~ '[A-Za-z0-9_.]v_session[.]absolute_expires_at')
   THEN RAISE EXCEPTION 'SESSION_CLAMP_DEFINITION_MISMATCH: %',item->>'signature';END IF;
   definition:=replace(definition,original,pattern->>'new');
  END LOOP;
  EXECUTE definition;
  SELECT proowner,proacl,prosecdef,proconfig INTO after_row FROM pg_proc WHERE oid=to_regprocedure(item->>'signature');
  IF to_regprocedure(item->>'signature')::oid IS DISTINCT FROM target OR before_row IS DISTINCT FROM after_row
   THEN RAISE EXCEPTION 'SESSION_CLAMP_AUTHORITY_CHANGED: %',item->>'signature';END IF;
 END LOOP;
END $migration$;

ALTER TABLE identity.step_up_grant DROP CONSTRAINT IF EXISTS step_up_grant_action_check;
ALTER TABLE identity.step_up_grant ADD CONSTRAINT step_up_grant_action_check CHECK (
 (action IN ('PUBLISH','UNPUBLISH','DELETE_PRIVATE_DEBATE') AND target_run_id IS NOT NULL AND target_account_id IS NULL)
 OR (action IN ('DELETE_ACCOUNT','CHANGE_EMAIL','READ_PHONE_PROFILE','CHANGE_PHONE_PROFILE','CHANGE_RECOVERY_EMAIL','ADD_PASSKEY','ADD_TOTP') AND target_run_id IS NULL AND target_account_id=user_id));
CREATE OR REPLACE FUNCTION identity.rotate_session_after_step_up(
  p_user_id uuid,
  p_owner_ref uuid,
  p_password_hash text,
  p_factor_id uuid,
  p_accepted_step bigint,
  p_session_id uuid,
  p_current_token_hash text,
  p_replacement_token_hash text,
  p_replacement_csrf_hash text,
  p_binding_context jsonb,
  p_idle_expires_at timestamptz,
  p_grant_id uuid,
  p_grant_token_hash text,
  p_grant_action text,
  p_grant_target_run_id uuid,
  p_grant_expires_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_account record;
  v_actor_token uuid;
  v_previous_step bigint;
  v_absolute_expires_at timestamptz;
  v_has_grant boolean := p_grant_id IS NOT NULL;
BEGIN
  IF jsonb_typeof(p_binding_context)<>'object'
    OR p_accepted_step<0
    OR p_idle_expires_at<=v_now
    OR (v_has_grant IS DISTINCT FROM (
      p_grant_token_hash IS NOT NULL AND p_grant_action IS NOT NULL
      AND p_grant_expires_at IS NOT NULL
      AND (
        (p_grant_action IN ('DELETE_ACCOUNT','CHANGE_EMAIL','READ_PHONE_PROFILE','CHANGE_PHONE_PROFILE','CHANGE_RECOVERY_EMAIL','ADD_PASSKEY','ADD_TOTP') AND p_grant_target_run_id IS NULL)
        OR (p_grant_action NOT IN ('DELETE_ACCOUNT','CHANGE_EMAIL','READ_PHONE_PROFILE','CHANGE_PHONE_PROFILE','CHANGE_RECOVERY_EMAIL','ADD_PASSKEY','ADD_TOTP') AND p_grant_target_run_id IS NOT NULL)
      )
    ))
    OR (v_has_grant AND (
      p_grant_action NOT IN ('PUBLISH','UNPUBLISH','DELETE_PRIVATE_DEBATE','DELETE_ACCOUNT','CHANGE_EMAIL','READ_PHONE_PROFILE','CHANGE_PHONE_PROFILE','CHANGE_RECOVERY_EMAIL','ADD_PASSKEY','ADD_TOTP')
      OR p_grant_expires_at<=v_now
      OR p_grant_expires_at>v_now+interval '5 minutes'
    )) THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_account FROM identity.lock_account_t9_internal(p_user_id,true);
  IF v_account.owner_ref IS DISTINCT FROM p_owner_ref
    OR v_account.password_hash IS DISTINCT FROM p_password_hash THEN
    RETURN NULL;
  END IF;
  v_actor_token := v_account.audit_token;
  SELECT factor.last_accepted_step INTO v_previous_step
  FROM identity.mfa_factor AS factor
  WHERE factor.mfa_factor_id=p_factor_id
    AND factor.user_id=p_user_id
    AND factor.factor_type='totp'
    AND factor.state='active'
  FOR UPDATE;
  IF NOT FOUND OR (v_previous_step IS NOT NULL AND p_accepted_step<=v_previous_step) THEN
    RETURN NULL;
  END IF;
  SELECT LEAST(session.absolute_expires_at,session.created_at+interval '720 hours') INTO v_absolute_expires_at
  FROM identity.session AS session
  WHERE session.session_id=p_session_id
    AND session.user_id=p_user_id
    AND session.token_hash=p_current_token_hash
    AND session.revoked_at IS NULL
    AND session.idle_expires_at>v_now
    AND LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')>GREATEST(v_now,clock_timestamp())
  FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_now:=clock_timestamp();
  IF identity.assert_session_current(p_user_id,p_session_id,p_current_token_hash) IS DISTINCT FROM true
    OR p_idle_expires_at<=v_now OR (v_has_grant AND p_grant_expires_at<=v_now) THEN RETURN NULL; END IF;
  UPDATE identity.mfa_factor SET last_accepted_step=p_accepted_step
  WHERE mfa_factor_id=p_factor_id;
  UPDATE identity.session
  SET token_hash=p_replacement_token_hash,csrf_token_hash=p_replacement_csrf_hash,
    binding_context=p_binding_context,last_mfa_at=v_now,last_seen_at=v_now,
    idle_expires_at=LEAST(v_absolute_expires_at,p_idle_expires_at)
  WHERE session_id=p_session_id;
  IF v_has_grant THEN
    INSERT INTO identity.step_up_grant(
      step_up_grant_id,token_hash,session_id,user_id,action,target_run_id,target_account_id,
      issued_at,expires_at,consumed_at
    ) VALUES (
      p_grant_id,p_grant_token_hash,p_session_id,p_user_id,p_grant_action,
      p_grant_target_run_id,
      CASE WHEN p_grant_action IN ('DELETE_ACCOUNT','CHANGE_EMAIL','READ_PHONE_PROFILE','CHANGE_PHONE_PROFILE','CHANGE_RECOVERY_EMAIL','ADD_PASSKEY','ADD_TOTP') THEN p_user_id ELSE NULL END,
      v_now,p_grant_expires_at,NULL
    );
  END IF;
  RETURN v_actor_token;
END;
$$;

-- A password continuation records the current password and a real available secure method.
ALTER TABLE identity.login_challenge ALTER COLUMN mfa_factor_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION identity.read_secure_login_identity(p_email bytea) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('userId',u.user_id,'ownerRef',u.owner_ref,'auditToken',u.audit_token,'passwordHash',u.password_hash,
 'factorId',f.mfa_factor_id,'secretCiphertext',f.secret_ciphertext,'lastAcceptedStep',f.last_accepted_step,
 'availableMethods',to_jsonb(array_remove(ARRAY[
 CASE WHEN EXISTS(SELECT 1 FROM identity.consumer_passkey_credential k WHERE k.user_id=u.user_id AND k.revoked_at IS NULL) THEN 'passkey' END,
 CASE WHEN f.mfa_factor_id IS NOT NULL THEN 'totp' END,
 CASE WHEN EXISTS(SELECT 1 FROM identity.recovery_code r WHERE r.user_id=u.user_id AND r.consumed_at IS NULL AND r.revoked_at IS NULL) THEN 'recovery_code' END],NULL)))
 FROM identity."user" u LEFT JOIN LATERAL (SELECT mfa_factor_id,secret_ciphertext,last_accepted_step FROM identity.mfa_factor
 WHERE user_id=u.user_id AND factor_type='totp' AND state='active' ORDER BY created_at DESC,mfa_factor_id DESC LIMIT 1) f ON true
 WHERE u.email_blind_index=p_email AND u.state='active' AND NOT COALESCE((SELECT held FROM identity.account_security_hold WHERE user_id=u.user_id),false)
 AND (f.mfa_factor_id IS NOT NULL OR EXISTS(SELECT 1 FROM identity.consumer_passkey_credential k WHERE k.user_id=u.user_id AND k.revoked_at IS NULL)
 OR EXISTS(SELECT 1 FROM identity.recovery_code r WHERE r.user_id=u.user_id AND r.consumed_at IS NULL AND r.revoked_at IS NULL));
$$;

-- Internal account-lock caller only. A null TOTP snapshot is supported only when another current secure method exists.
CREATE OR REPLACE FUNCTION identity.login_method_current_internal(p_user uuid,p_factor uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT CASE WHEN p_factor IS NOT NULL THEN EXISTS(SELECT 1 FROM identity.mfa_factor WHERE mfa_factor_id=p_factor AND user_id=p_user AND factor_type='totp' AND state='active')
 ELSE EXISTS(SELECT 1 FROM identity.consumer_passkey_credential WHERE user_id=p_user AND revoked_at IS NULL)
 OR EXISTS(SELECT 1 FROM identity.recovery_code WHERE user_id=p_user AND consumed_at IS NULL AND revoked_at IS NULL) END;
$$;

CREATE TABLE IF NOT EXISTS identity.consumer_totp_enrollment (
 user_id uuid PRIMARY KEY REFERENCES identity."user"(user_id) ON DELETE CASCADE,
 factor_id uuid NOT NULL UNIQUE REFERENCES identity.mfa_factor(mfa_factor_id) ON DELETE CASCADE,
 handle_hash text NOT NULL UNIQUE CHECK(handle_hash ~ '^sha256:[0-9a-f]{64}$'),
 retention_hash text NOT NULL CHECK(retention_hash ~ '^sha256:[0-9a-f]{64}$'),
 binding_hash text NOT NULL CHECK(binding_hash ~ '^sha256:[0-9a-f]{64}$'),
 ordinary_session_id uuid NOT NULL, ordinary_token_hash text NOT NULL CHECK(ordinary_token_hash ~ '^sha256:[0-9a-f]{64}$'),
 account_security_epoch bigint NOT NULL,
 created_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,consumed_at timestamptz,
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '5 minutes')
);
CREATE INDEX IF NOT EXISTS consumer_totp_enrollment_expiry ON identity.consumer_totp_enrollment(expires_at);
CREATE INDEX IF NOT EXISTS consumer_totp_enrollment_source ON identity.consumer_totp_enrollment(retention_hash);

CREATE OR REPLACE FUNCTION identity.expired_totp_addition_candidates(p_limit integer) RETURNS TABLE(user_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'CONSUMER_CHALLENGE_CAPACITY';END IF;
 RETURN QUERY SELECT c.user_id FROM identity.consumer_totp_enrollment c WHERE c.expires_at<=clock_timestamp() OR c.consumed_at IS NOT NULL ORDER BY c.expires_at,c.user_id LIMIT p_limit;
END $$;
CREATE OR REPLACE FUNCTION identity.prune_totp_addition(p_user uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c identity.consumer_totp_enrollment%ROWTYPE;
BEGIN
 -- A standalone call holds at most one account and never takes the global count lock.
 PERFORM identity.lock_account_t9_internal(p_user,false);
 PERFORM 1 FROM identity.mfa_factor WHERE user_id=p_user AND mfa_factor_id=(SELECT factor_id FROM identity.consumer_totp_enrollment WHERE user_id=p_user) FOR UPDATE;
 SELECT * INTO c FROM identity.consumer_totp_enrollment WHERE user_id=p_user FOR UPDATE;
 IF c.user_id IS NULL OR (c.expires_at>clock_timestamp() AND c.consumed_at IS NULL) THEN RETURN;END IF;
 DELETE FROM identity.mfa_factor WHERE mfa_factor_id=c.factor_id AND user_id=p_user AND factor_type='totp' AND state='pending';
 DELETE FROM identity.consumer_totp_enrollment WHERE user_id=p_user;
END $$;

CREATE OR REPLACE FUNCTION identity.prepare_secure_totp_enrollment(p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b record;a record;g identity.step_up_grant%ROWTYPE;v_user uuid;
BEGIN
 IF p_input->>'enrollmentTokenHash' IS NOT NULL THEN
  SELECT * INTO b FROM identity.lock_mfa_enrollment_bearer_internal(p_input->>'enrollmentTokenHash');
  IF b.user_id IS NULL OR b.is_binding_bearer IS DISTINCT FROM true OR b.user_state<>'pending_mfa' OR b.consumed_at IS NULL OR b.expires_at<=clock_timestamp()
   OR NOT EXISTS(SELECT 1 FROM identity.channel_binding WHERE channel_binding_id=b.channel_binding_id AND state='verified' AND verification_consumed_at IS NOT NULL) THEN RETURN NULL;END IF;
  RETURN jsonb_build_object('userId',b.user_id,'pseudonym',b.pseudonym,'expiresAt',b.expires_at);
 END IF;
 v_user:=(p_input->>'userId')::uuid;
 SELECT * INTO a FROM identity.lock_account_t9_internal(v_user,true);
 SELECT * INTO g FROM identity.step_up_grant WHERE token_hash=p_input->>'grantHash' AND user_id=v_user FOR UPDATE;
 IF a.audit_token IS NULL OR g.action IS DISTINCT FROM 'ADD_TOTP' OR g.target_account_id IS DISTINCT FROM v_user OR g.target_run_id IS NOT NULL
 OR g.session_id IS DISTINCT FROM (p_input->>'sessionId')::uuid OR g.consumed_at IS NOT NULL OR g.issued_at>clock_timestamp()
 OR g.issued_at<clock_timestamp()-interval '5 minutes' OR g.expires_at<=clock_timestamp() OR g.expires_at>g.issued_at+interval '5 minutes'
 OR identity.assert_session_current(v_user,(p_input->>'sessionId')::uuid,p_input->>'tokenHash') IS DISTINCT FROM true THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('userId',v_user,'pseudonym',a.pseudonym,'expiresAt',g.expires_at);
END $$;

CREATE OR REPLACE FUNCTION identity.begin_secure_totp_enrollment(p_input jsonb,p_source jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a jsonb;v_user uuid;v_now timestamptz;v_expiry timestamptz;v_actor uuid;v_initial boolean:=p_input->>'enrollmentTokenHash' IS NOT NULL;v_capacity integer:=(p_input->>'challengeCapacity')::integer;v_limit integer:=(p_input->>'challengesPerScope')::integer;
BEGIN
 PERFORM identity.consume_runtime_audit_attempt();
 a:=identity.prepare_secure_totp_enrollment(p_input);
 IF a IS NULL THEN RAISE EXCEPTION 'CONSUMER_AUTH_INVALID';END IF;
 v_user:=(a->>'userId')::uuid;v_expiry:=(a->>'expiresAt')::timestamptz;
 SELECT audit_token INTO v_actor FROM identity."user" WHERE user_id=v_user;
 PERFORM 1 FROM identity.mfa_factor WHERE user_id=v_user AND factor_type='totp' AND state IN ('pending','verified_pending_recovery','recovery_pending') ORDER BY mfa_factor_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM identity.mfa_factor WHERE user_id=v_user AND factor_type='totp' AND state IN ('verified_pending_recovery','recovery_pending')) THEN RAISE EXCEPTION 'MFA_ENROLLMENT_STATE_INVALID';END IF;
 IF NOT v_initial THEN
  PERFORM 1 FROM identity.consumer_totp_enrollment WHERE user_id=v_user FOR UPDATE;
  IF v_capacity IS NULL OR v_capacity NOT BETWEEN 1 AND 8192 OR v_limit IS NULL OR v_limit NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'CONSUMER_CHALLENGE_CAPACITY';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('identity.consumer_totp_enrollment',0));
  IF (SELECT count(*) FROM identity.consumer_totp_enrollment WHERE user_id<>v_user)>=v_capacity
   OR (SELECT count(*) FROM identity.consumer_totp_enrollment WHERE retention_hash=p_input->>'retentionKey' AND user_id<>v_user)>=v_limit THEN RAISE EXCEPTION 'CONSUMER_CHALLENGE_CAPACITY';END IF;
  IF identity.consume_profile_grant_internal(v_user,(p_input->>'sessionId')::uuid,p_input->>'tokenHash',p_input->>'grantHash','ADD_TOTP') IS NULL THEN RAISE EXCEPTION 'CONSUMER_AUTH_INVALID';END IF;
 END IF;
 v_now:=clock_timestamp();
 IF v_expiry<=v_now THEN RAISE EXCEPTION 'CONSUMER_AUTH_INVALID';END IF;
 DELETE FROM identity.mfa_factor WHERE user_id=v_user AND factor_type='totp' AND state='pending';
 DELETE FROM identity.consumer_totp_enrollment WHERE user_id=v_user;
 INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,secret_ciphertext,state,created_at)
 VALUES((p_input->>'factorId')::uuid,v_user,'totp',p_input->'secretCiphertext','pending',v_now);
 IF NOT v_initial THEN
  v_expiry:=LEAST(v_expiry,v_now+interval '5 minutes');
  INSERT INTO identity.consumer_totp_enrollment(user_id,factor_id,handle_hash,retention_hash,binding_hash,ordinary_session_id,ordinary_token_hash,account_security_epoch,created_at,expires_at)
  VALUES(v_user,(p_input->>'factorId')::uuid,p_input->>'handleHash',p_input->>'retentionKey',p_input->>'bindingHash',(p_input->>'sessionId')::uuid,p_input->>'tokenHash',COALESCE((SELECT security_epoch FROM identity.account_security_hold WHERE user_id=v_user),0),v_now,v_expiry);
 END IF;
 PERFORM identity.append_runtime_audit_event_internal(v_actor,'identity.mfa.totp.begin',(p_input->>'factorId')::uuid,clock_timestamp(),p_source,'ALLOW',true,NULL);
 IF v_expiry<=clock_timestamp() OR (NOT v_initial AND identity.assert_session_current(v_user,(p_input->>'sessionId')::uuid,p_input->>'tokenHash') IS DISTINCT FROM true) THEN RAISE EXCEPTION 'CONSUMER_AUTH_INVALID';END IF;
 RETURN jsonb_build_object('expiresAt',v_expiry);
END $$;

CREATE OR REPLACE FUNCTION identity.read_secure_totp_enrollment(p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c identity.consumer_totp_enrollment%ROWTYPE;b record;a record;f identity.mfa_factor%ROWTYPE;v_user uuid;v_expiry timestamptz;v_purpose text;
BEGIN
 SELECT user_id INTO v_user FROM identity.consumer_totp_enrollment WHERE handle_hash=p_input->>'additionHandleHash';
 IF v_user IS NOT NULL THEN
  SELECT * INTO a FROM identity.lock_account_t9_internal(v_user,true);
  PERFORM 1 FROM identity.mfa_factor WHERE user_id=v_user AND mfa_factor_id=(SELECT factor_id FROM identity.consumer_totp_enrollment WHERE user_id=v_user) FOR UPDATE;
  SELECT * INTO c FROM identity.consumer_totp_enrollment WHERE user_id=v_user AND handle_hash=p_input->>'additionHandleHash' FOR UPDATE;
  IF a.audit_token IS NULL OR c.user_id IS NULL OR c.consumed_at IS NOT NULL OR c.expires_at<=clock_timestamp()
   OR c.binding_hash IS DISTINCT FROM p_input->>'bindingHash' OR c.ordinary_session_id IS DISTINCT FROM (p_input->>'sessionId')::uuid OR c.ordinary_token_hash IS DISTINCT FROM p_input->>'tokenHash'
   OR c.account_security_epoch IS DISTINCT FROM COALESCE((SELECT security_epoch FROM identity.account_security_hold WHERE user_id=v_user),0)
   OR identity.assert_session_current(v_user,c.ordinary_session_id,c.ordinary_token_hash) IS DISTINCT FROM true THEN RETURN NULL;END IF;
  SELECT * INTO f FROM identity.mfa_factor WHERE mfa_factor_id=c.factor_id AND user_id=v_user AND factor_type='totp' AND state='pending';
  v_expiry:=c.expires_at;v_purpose:='ADD_TOTP';
 ELSE
  SELECT * INTO b FROM identity.lock_mfa_enrollment_bearer_internal(p_input->>'enrollmentTokenHash');
  IF b.user_id IS NULL OR b.is_binding_bearer IS DISTINCT FROM true OR b.user_state<>'pending_mfa' OR b.consumed_at IS NULL OR b.expires_at<=clock_timestamp()
   OR NOT EXISTS(SELECT 1 FROM identity.channel_binding WHERE channel_binding_id=b.channel_binding_id AND state='verified' AND verification_consumed_at IS NOT NULL) THEN RETURN NULL;END IF;
  v_user:=b.user_id;v_expiry:=b.expires_at;v_purpose:='INITIAL_ENROLLMENT';
  SELECT * INTO f FROM identity.mfa_factor WHERE user_id=v_user AND factor_type='totp' AND state IN ('pending','verified_pending_recovery','recovery_pending') ORDER BY created_at DESC,mfa_factor_id DESC LIMIT 1 FOR UPDATE;
 END IF;
 IF f.mfa_factor_id IS NULL OR v_expiry<=clock_timestamp() THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('userId',v_user,'pseudonym',(SELECT pseudonym FROM identity."user" WHERE user_id=v_user),'factorId',f.mfa_factor_id,'secretCiphertext',f.secret_ciphertext,'lastAcceptedStep',f.last_accepted_step,'purpose',v_purpose,'expiresAt',v_expiry);
END $$;

CREATE OR REPLACE FUNCTION identity.complete_secure_totp_enrollment(p_input jsonb,p_current_legal jsonb,p_source jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE e jsonb;v_user uuid;v_actor uuid;v_owner uuid;v_step bigint:=(p_input->>'acceptedStep')::bigint;v_now timestamptz;v_session uuid;
BEGIN
 PERFORM identity.consume_runtime_audit_attempt();
 e:=identity.read_secure_totp_enrollment(p_input);
 IF e IS NULL OR e->>'userId' IS DISTINCT FROM p_input->>'userId' OR e->>'factorId' IS DISTINCT FROM p_input->>'factorId'
  OR e->'secretCiphertext' IS DISTINCT FROM p_input->'secretCiphertext' OR v_step IS NULL OR v_step<0
  OR (e->>'lastAcceptedStep' IS NOT NULL AND v_step<=(e->>'lastAcceptedStep')::bigint) THEN RAISE EXCEPTION 'CONSUMER_AUTH_INVALID';END IF;
 v_user:=(e->>'userId')::uuid;
 IF e->>'purpose'='INITIAL_ENROLLMENT' AND identity.consumer_initial_evidence_internal(v_user,p_current_legal) IS DISTINCT FROM true THEN RAISE EXCEPTION 'CONSUMER_AUTH_INVALID';END IF;
 SELECT audit_token,owner_ref INTO v_actor,v_owner FROM identity."user" WHERE user_id=v_user;
 v_now:=clock_timestamp();
 IF (e->>'expiresAt')::timestamptz<=v_now OR abs(v_step-floor(extract(epoch FROM v_now)/30))>1 THEN RAISE EXCEPTION 'CONSUMER_AUTH_INVALID';END IF;
 UPDATE identity.mfa_factor SET state='active',verified_at=v_now,last_accepted_step=v_step WHERE mfa_factor_id=(e->>'factorId')::uuid;
 IF e->>'purpose'='INITIAL_ENROLLMENT' THEN
  UPDATE identity."user" SET state='active' WHERE user_id=v_user;
  UPDATE identity.channel_binding SET verification_token_hash=NULL,verification_expires_at=NULL WHERE user_id=v_user AND channel_type='email' AND verification_token_hash=p_input->>'enrollmentTokenHash';
  v_session:=identity.insert_consumer_session_internal(v_user,p_input->'material',p_input->>'bindingHash');
 ELSE
  UPDATE identity.consumer_totp_enrollment SET consumed_at=v_now WHERE user_id=v_user;
 END IF;
 PERFORM identity.append_runtime_audit_event_internal(v_actor,'identity.mfa.totp.verified',(e->>'factorId')::uuid,clock_timestamp(),p_source,'ALLOW',true,NULL);
 IF v_session IS NOT NULL THEN
  PERFORM identity.append_runtime_audit_event_internal(v_actor,'identity.mfa.enrollment.activated',(e->>'factorId')::uuid,clock_timestamp(),p_source,'ALLOW',true,NULL);
  PERFORM identity.append_runtime_audit_event_internal(v_actor,'identity.session.created',v_session,clock_timestamp(),p_source,'ALLOW',true,NULL);
 END IF;
 IF (e->>'expiresAt')::timestamptz<=clock_timestamp() OR (e->>'purpose'='ADD_TOTP' AND identity.assert_session_current(v_user,(p_input->>'sessionId')::uuid,p_input->>'tokenHash') IS DISTINCT FROM true) THEN RAISE EXCEPTION 'CONSUMER_AUTH_INVALID';END IF;
 RETURN jsonb_build_object('userId',v_user,'ownerRef',v_owner,'sessionId',v_session);
END $$;

CREATE OR REPLACE FUNCTION identity.create_login_challenge_with_audit(
  p_user_id uuid,p_owner_ref uuid,p_password_hash text,p_factor_id uuid,
  p_challenge_id uuid,p_challenge_token_hash text,p_binding_hash text,
  p_occurred_at timestamptz,p_expires_at timestamptz,p_source_context jsonb
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE v_account record; v_audit_token uuid; v_factor_id uuid; v_valid boolean; v_now timestamptz;
BEGIN
  SELECT * INTO v_account FROM identity.lock_account_t9_internal(p_user_id,true);
  IF v_account.owner_ref=p_owner_ref AND v_account.password_hash=p_password_hash THEN
    v_audit_token := v_account.audit_token;
  END IF;
  IF v_audit_token IS NOT NULL THEN
    SELECT factor.mfa_factor_id INTO v_factor_id
    FROM identity.mfa_factor AS factor
    WHERE factor.mfa_factor_id=p_factor_id AND factor.user_id=p_user_id
      AND factor.factor_type='totp' AND factor.state='active'
    FOR UPDATE;
  END IF;
  v_now:=clock_timestamp();
  v_valid := v_audit_token IS NOT NULL AND identity.login_method_current_internal(p_user_id,p_factor_id)
    AND p_expires_at>v_now;
  IF v_valid THEN
    INSERT INTO identity.login_challenge(
      login_challenge_id,user_id,mfa_factor_id,token_hash,binding_hash,
      password_hash_snapshot,created_at,expires_at,consumed_at
    ) VALUES (
      p_challenge_id,p_user_id,p_factor_id,p_challenge_token_hash,p_binding_hash,
      p_password_hash,v_now,p_expires_at,NULL
    );
  END IF;
  PERFORM identity.consume_runtime_audit_attempt();
  PERFORM identity.append_runtime_audit_event_internal(
    COALESCE(v_audit_token,gen_random_uuid()),'identity.login.password_verified',
    CASE WHEN v_valid THEN p_challenge_id ELSE NULL END,clock_timestamp(),
    p_source_context,CASE WHEN v_valid THEN 'ALLOW' ELSE 'DENY' END,v_valid,
    CASE WHEN v_valid THEN NULL ELSE 'AUTH_CREDENTIALS_INVALID' END
  );
  RETURN v_valid;
END;
$$;

CREATE OR REPLACE FUNCTION identity.complete_totp_login_with_audit(
  p_user_id uuid,p_owner_ref uuid,p_password_hash text,p_factor_id uuid,
  p_challenge_id uuid,p_challenge_token_hash text,p_binding_hash text,
  p_accepted_step bigint,p_session_id uuid,p_session_token_hash text,
  p_csrf_token_hash text,p_session_binding_context jsonb,p_occurred_at timestamptz,
  p_idle_expires_at timestamptz,p_absolute_expires_at timestamptz,p_source_context jsonb
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_locked_owner_ref uuid := NULL;
  v_locked_password_hash text := NULL;
  v_locked_audit_token uuid := NULL;
  v_audit_token uuid := NULL;
  v_previous_step bigint := NULL;
  v_factor_found boolean := false;
  v_challenge_consumed_at timestamptz := NULL;
  v_challenge_expires_at timestamptz := NULL;
  v_challenge_binding_hash text := NULL;
  v_challenge_password_hash text := NULL;
  v_valid boolean := false;
  v_now timestamptz;
BEGIN
  SELECT account.owner_ref,account.password_hash,account.audit_token
  INTO v_locked_owner_ref,v_locked_password_hash,v_locked_audit_token
  FROM identity.lock_account_t9_internal(p_user_id,true) AS account;
  IF v_locked_owner_ref=p_owner_ref AND v_locked_password_hash=p_password_hash THEN
    v_audit_token := v_locked_audit_token;
  END IF;
  IF v_audit_token IS NOT NULL THEN
    SELECT factor.last_accepted_step INTO v_previous_step
    FROM identity.mfa_factor AS factor
    WHERE factor.mfa_factor_id=p_factor_id AND factor.user_id=p_user_id
      AND factor.factor_type='totp' AND factor.state='active' FOR UPDATE;
    v_factor_found := FOUND;
  END IF;
  IF v_audit_token IS NOT NULL AND v_factor_found THEN
    SELECT challenge.consumed_at,challenge.expires_at,challenge.binding_hash,
      challenge.password_hash_snapshot
    INTO v_challenge_consumed_at,v_challenge_expires_at,
      v_challenge_binding_hash,v_challenge_password_hash
    FROM identity.login_challenge AS challenge
    WHERE challenge.login_challenge_id=p_challenge_id
      AND challenge.token_hash=p_challenge_token_hash
      AND challenge.user_id=p_user_id AND challenge.mfa_factor_id=p_factor_id
    FOR UPDATE;
  END IF;
  v_now:=clock_timestamp();
  v_valid := COALESCE(
    v_audit_token IS NOT NULL AND v_factor_found
    AND v_challenge_expires_at IS NOT NULL
    AND v_challenge_consumed_at IS NULL AND v_challenge_expires_at>v_now
    AND v_challenge_binding_hash=p_binding_hash
    AND v_challenge_password_hash=p_password_hash
    AND (v_previous_step IS NULL OR p_accepted_step>v_previous_step)
    AND p_idle_expires_at>v_now AND p_absolute_expires_at>v_now,
    false
  );
  IF v_valid THEN
    UPDATE identity.mfa_factor SET last_accepted_step=p_accepted_step
    WHERE mfa_factor_id=p_factor_id;
    UPDATE identity.login_challenge SET consumed_at=v_now
    WHERE login_challenge_id=p_challenge_id;
    INSERT INTO identity.session(
      session_id,user_id,token_hash,csrf_token_hash,binding_context,created_at,
      last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at,revoked_at
    ) VALUES (
      p_session_id,p_user_id,p_session_token_hash,p_csrf_token_hash,
      p_session_binding_context,v_now,v_now,LEAST(p_idle_expires_at,v_now+interval '336 hours',p_absolute_expires_at,v_now+interval '720 hours'),
      LEAST(p_absolute_expires_at,v_now+interval '720 hours'),v_now,NULL
    );
  END IF;
  PERFORM identity.consume_runtime_audit_attempt();
  PERFORM identity.append_runtime_audit_event_internal(
    COALESCE(v_audit_token,gen_random_uuid()),
    CASE WHEN v_valid THEN 'identity.session.created' ELSE 'identity.login.failed' END,
    CASE WHEN v_valid THEN p_session_id ELSE NULL END,clock_timestamp(),p_source_context,
    CASE WHEN v_valid THEN 'ALLOW' ELSE 'DENY' END,COALESCE(v_valid,false),
    CASE WHEN v_valid THEN NULL ELSE 'AUTH_MFA_INVALID' END
  );
  RETURN COALESCE(v_valid,false);
END;
$$;

CREATE OR REPLACE FUNCTION identity.complete_recovery_login_with_audit(
  p_user_id uuid,p_owner_ref uuid,p_password_hash text,p_factor_id uuid,
  p_challenge_id uuid,p_challenge_token_hash text,p_binding_hash text,
  p_recovery_code_id uuid,p_replacement_hash text,p_session_id uuid,
  p_session_token_hash text,p_csrf_token_hash text,p_session_binding_context jsonb,
  p_occurred_at timestamptz,p_idle_expires_at timestamptz,
  p_absolute_expires_at timestamptz,p_source_context jsonb
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_locked_owner_ref uuid := NULL;
  v_locked_password_hash text := NULL;
  v_locked_audit_token uuid := NULL;
  v_audit_token uuid := NULL;
  v_factor_id uuid := NULL;
  v_challenge_consumed_at timestamptz := NULL;
  v_challenge_expires_at timestamptz := NULL;
  v_challenge_binding_hash text := NULL;
  v_challenge_password_hash text := NULL;
  v_slot smallint := NULL;
  v_valid boolean := false;
  v_now timestamptz;
BEGIN
  SELECT account.owner_ref,account.password_hash,account.audit_token
  INTO v_locked_owner_ref,v_locked_password_hash,v_locked_audit_token
  FROM identity.lock_account_t9_internal(p_user_id,true) AS account;
  IF v_locked_owner_ref=p_owner_ref AND v_locked_password_hash=p_password_hash THEN
    v_audit_token := v_locked_audit_token;
  END IF;
  IF v_audit_token IS NOT NULL THEN
    SELECT factor.mfa_factor_id INTO v_factor_id FROM identity.mfa_factor AS factor
    WHERE factor.mfa_factor_id=p_factor_id AND factor.user_id=p_user_id
      AND factor.factor_type='totp' AND factor.state='active' FOR UPDATE;
  END IF;
  IF identity.login_method_current_internal(p_user_id,p_factor_id) THEN
    SELECT challenge.consumed_at,challenge.expires_at,challenge.binding_hash,
      challenge.password_hash_snapshot
    INTO v_challenge_consumed_at,v_challenge_expires_at,
      v_challenge_binding_hash,v_challenge_password_hash
    FROM identity.login_challenge AS challenge
    WHERE challenge.login_challenge_id=p_challenge_id
      AND challenge.token_hash=p_challenge_token_hash AND challenge.user_id=p_user_id
    FOR UPDATE;
  END IF;
  IF v_challenge_expires_at IS NOT NULL THEN
    SELECT recovery.code_slot INTO v_slot FROM identity.recovery_code AS recovery
    WHERE recovery.recovery_code_id=p_recovery_code_id AND recovery.user_id=p_user_id
      AND recovery.consumed_at IS NULL AND recovery.revoked_at IS NULL FOR UPDATE;
  END IF;
  v_now:=clock_timestamp();
  v_valid := COALESCE(
    v_audit_token IS NOT NULL AND identity.login_method_current_internal(p_user_id,p_factor_id)
    AND v_challenge_expires_at IS NOT NULL AND v_slot IS NOT NULL
    AND v_challenge_consumed_at IS NULL AND v_challenge_expires_at>v_now
    AND v_challenge_binding_hash=p_binding_hash
    AND v_challenge_password_hash=p_password_hash
    AND p_idle_expires_at>v_now AND p_absolute_expires_at>v_now,
    false
  );
  IF v_valid THEN
    UPDATE identity.recovery_code SET consumed_at=v_now
    WHERE recovery_code_id=p_recovery_code_id;
    INSERT INTO identity.recovery_code(
      user_id,code_slot,code_hash,created_at,consumed_at,revoked_at
    ) VALUES (p_user_id,v_slot,p_replacement_hash,v_now,NULL,NULL);
    UPDATE identity.login_challenge SET consumed_at=v_now
    WHERE login_challenge_id=p_challenge_id;
    INSERT INTO identity.session(
      session_id,user_id,token_hash,csrf_token_hash,binding_context,created_at,
      last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at,revoked_at
    ) VALUES (
      p_session_id,p_user_id,p_session_token_hash,p_csrf_token_hash,
      p_session_binding_context,v_now,v_now,LEAST(p_idle_expires_at,v_now+interval '336 hours',p_absolute_expires_at,v_now+interval '720 hours'),
      LEAST(p_absolute_expires_at,v_now+interval '720 hours'),v_now,NULL
    );
  END IF;
  PERFORM identity.consume_runtime_audit_attempt();
  PERFORM identity.append_runtime_audit_event_internal(
    COALESCE(v_audit_token,gen_random_uuid()),
    CASE WHEN v_valid THEN 'identity.session.created' ELSE 'identity.login.failed' END,
    CASE WHEN v_valid THEN p_session_id ELSE NULL END,clock_timestamp(),p_source_context,
    CASE WHEN v_valid THEN 'ALLOW' ELSE 'DENY' END,COALESCE(v_valid,false),
    CASE WHEN v_valid THEN 'MFA_RECOVERY_CODE' ELSE 'AUTH_MFA_INVALID' END
  );
  RETURN COALESCE(v_valid,false);
END;
$$;

CREATE OR REPLACE FUNCTION identity.begin_consumer_passkey_login(p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_login identity.login_challenge%ROWTYPE;v_user uuid;v_account record;v_now timestamptz;v_expires timestamptz;
BEGIN
 IF p_input->>'continuationHash' IS NOT NULL THEN
   SELECT user_id INTO v_user FROM identity.login_challenge WHERE token_hash=p_input->>'continuationHash';
   SELECT * INTO v_account FROM identity.lock_account_t9_internal(v_user,true);
   SELECT * INTO v_login FROM identity.login_challenge WHERE token_hash=p_input->>'continuationHash' AND user_id=v_user FOR UPDATE;
   IF v_account.audit_token IS NULL OR v_login.login_challenge_id IS NULL OR v_login.consumed_at IS NOT NULL
     OR v_login.binding_hash IS DISTINCT FROM p_input->>'bindingHash' OR v_login.password_hash_snapshot IS DISTINCT FROM v_account.password_hash
     OR identity.login_method_current_internal(v_user,v_login.mfa_factor_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'CONSUMER_AUTH_INVALID';END IF;
 END IF;
 PERFORM identity.reserve_consumer_challenge_internal(v_user,'LOGIN',p_input->>'retentionKey',(p_input->>'challengeCapacity')::integer,(p_input->>'challengesPerScope')::integer);
 v_now:=clock_timestamp();v_expires:=LEAST(v_now+interval '5 minutes',v_login.expires_at);
 IF v_expires<=v_now THEN RAISE EXCEPTION 'CONSUMER_AUTH_INVALID';END IF;
 INSERT INTO identity.consumer_passkey_challenge(retention_hash,handle_hash,challenge_hash,purpose,user_id,binding_hash,rp_id,origin,continuation_hash,account_security_epoch,created_at,expires_at)
 VALUES(p_input->>'retentionKey',p_input->>'handleHash',p_input->>'challengeHash','LOGIN',v_user,p_input->>'bindingHash',p_input->>'rpId',p_input->>'origin',p_input->>'continuationHash',
 CASE WHEN v_user IS NULL THEN NULL ELSE COALESCE((SELECT security_epoch FROM identity.account_security_hold WHERE user_id=v_user),0) END,v_now,v_expires);
 RETURN jsonb_build_object('expiresAt',v_expires);
END $$;

CREATE OR REPLACE FUNCTION identity.complete_consumer_passkey_login(p_input jsonb,p_source jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c identity.consumer_passkey_challenge%ROWTYPE;f identity.consumer_passkey_credential%ROWTYPE;v_account record;v_user uuid:=(p_input->>'userId')::uuid;
 v_counter bigint:=(p_input->>'counter')::bigint;v_now timestamptz;v_login identity.login_challenge%ROWTYPE;v_session uuid;
BEGIN
 PERFORM identity.consume_runtime_audit_attempt();
 SELECT * INTO v_account FROM identity.lock_account_t9_internal(v_user,true);
 SELECT * INTO f FROM identity.consumer_passkey_credential WHERE user_id=v_user AND credential_id=p_input->>'credentialId' FOR UPDATE;
 SELECT * INTO c FROM identity.consumer_passkey_challenge WHERE handle_hash=p_input->>'handleHash' AND purpose='LOGIN' FOR UPDATE;
 IF v_account.audit_token IS NULL OR f.consumer_credential_id IS NULL OR f.revoked_at IS NOT NULL OR c.challenge_id IS NULL OR c.consumed_at IS NOT NULL
 OR (c.user_id IS NOT NULL AND c.user_id<>v_user) OR c.binding_hash IS DISTINCT FROM p_input->>'bindingHash' OR c.challenge_hash IS DISTINCT FROM p_input->>'challengeHash'
 OR (SELECT user_handle FROM identity.consumer_passkey_subject WHERE user_id=v_user) IS DISTINCT FROM p_input->>'userHandle'
 OR f.public_key IS DISTINCT FROM p_input->>'publicKey' OR f.device_type IS DISTINCT FROM p_input->>'deviceType'
 OR f.rp_id<>c.rp_id OR f.origin<>c.origin OR v_account.password_hash IS DISTINCT FROM p_input->>'passwordHash'
 OR (p_input->>'securityEpoch')::bigint IS DISTINCT FROM COALESCE((SELECT security_epoch FROM identity.account_security_hold WHERE user_id=v_user),0)
 OR (c.account_security_epoch IS NOT NULL AND c.account_security_epoch IS DISTINCT FROM (p_input->>'securityEpoch')::bigint)
 OR v_counter IS NULL OR v_counter NOT BETWEEN 0 AND 4294967295 OR (f.device_type='singleDevice' AND (v_counter>0 OR f.signature_counter>0) AND v_counter<=f.signature_counter)
 OR (p_input->>'backedUp')::boolean IS NULL OR ((p_input->>'backedUp')::boolean AND f.device_type<>'multiDevice') THEN RAISE EXCEPTION 'CONSUMER_AUTH_INVALID';END IF;
 IF c.continuation_hash IS NOT NULL THEN
   PERFORM 1 FROM identity.mfa_factor WHERE mfa_factor_id=(SELECT mfa_factor_id FROM identity.login_challenge WHERE token_hash=c.continuation_hash) AND user_id=v_user AND factor_type='totp' AND state='active' FOR SHARE;
   SELECT * INTO v_login FROM identity.login_challenge WHERE token_hash=c.continuation_hash AND user_id=v_user FOR UPDATE;
   IF identity.login_method_current_internal(v_user,v_login.mfa_factor_id) IS DISTINCT FROM true OR v_login.login_challenge_id IS NULL OR v_login.consumed_at IS NOT NULL OR v_login.binding_hash<>c.binding_hash OR v_login.password_hash_snapshot<>v_account.password_hash THEN RAISE EXCEPTION 'CONSUMER_AUTH_INVALID';END IF;
 END IF;
 v_now:=clock_timestamp();
 IF c.expires_at<=v_now OR (c.continuation_hash IS NOT NULL AND v_login.expires_at<=v_now) THEN RAISE EXCEPTION 'CONSUMER_AUTH_INVALID';END IF;
 IF f.device_type='multiDevice' AND f.signature_counter>0 AND v_counter<=f.signature_counter THEN
   PERFORM identity.append_consumer_passkey_audit_internal(v_account.audit_token,'counter_anomaly',p_source);
 END IF;
 UPDATE identity.consumer_passkey_credential SET signature_counter=GREATEST(signature_counter,v_counter),backed_up=(p_input->>'backedUp')::boolean,last_used_at=v_now WHERE consumer_credential_id=f.consumer_credential_id;
 UPDATE identity.consumer_passkey_challenge SET consumed_at=v_now,user_id=v_user WHERE challenge_id=c.challenge_id;
 IF c.continuation_hash IS NOT NULL THEN UPDATE identity.login_challenge SET consumed_at=v_now WHERE login_challenge_id=v_login.login_challenge_id;END IF;
 v_session:=identity.insert_consumer_session_internal(v_user,p_input->'material',c.binding_hash);
 PERFORM identity.append_consumer_passkey_audit_internal(v_account.audit_token,'session_created',p_source);
 IF c.expires_at<=clock_timestamp() OR (c.continuation_hash IS NOT NULL AND v_login.expires_at<=clock_timestamp()) THEN RAISE EXCEPTION 'CONSUMER_AUTH_INVALID';END IF;
 RETURN jsonb_build_object('userId',v_user,'ownerRef',v_account.owner_ref,'sessionId',v_session);
END $$;

CREATE OR REPLACE FUNCTION identity.complete_consumer_passkey_enrollment(p_input jsonb,p_current_legal jsonb,p_source jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c identity.consumer_passkey_challenge%ROWTYPE;v_user uuid;v_account record;v_bearer record;v_now timestamptz;v_session uuid;v_credential uuid;v_email_expiry timestamptz;
BEGIN
 PERFORM identity.consume_runtime_audit_attempt();
 SELECT user_id INTO v_user FROM identity.consumer_passkey_challenge WHERE handle_hash=p_input->>'handleHash' AND purpose IN ('INITIAL_ENROLLMENT','ADD_PASSKEY');
 SELECT * INTO v_account FROM identity.lock_account_t9_internal(v_user,false);
 SELECT * INTO c FROM identity.consumer_passkey_challenge WHERE handle_hash=p_input->>'handleHash' AND user_id=v_user AND purpose IN ('INITIAL_ENROLLMENT','ADD_PASSKEY') FOR UPDATE;
 IF c.challenge_id IS NULL OR v_account.audit_token IS NULL OR c.consumed_at IS NOT NULL OR c.binding_hash IS DISTINCT FROM p_input->>'bindingHash'
 OR c.challenge_hash IS DISTINCT FROM p_input->>'challengeHash'
 OR COALESCE((SELECT held FROM identity.account_security_hold WHERE user_id=v_user),false)
 OR c.account_security_epoch IS DISTINCT FROM COALESCE((SELECT security_epoch FROM identity.account_security_hold WHERE user_id=v_user),0) THEN RAISE EXCEPTION 'CONSUMER_AUTH_INVALID';END IF;
 IF c.purpose='INITIAL_ENROLLMENT' THEN
   SELECT * INTO v_bearer FROM identity.lock_mfa_enrollment_bearer_internal(c.enrollment_token_hash);
   v_email_expiry:=v_bearer.expires_at;
   IF v_bearer.user_id IS DISTINCT FROM v_user OR v_bearer.is_binding_bearer IS DISTINCT FROM true OR v_bearer.user_state<>'pending_mfa' OR v_bearer.consumed_at IS NULL
     OR NOT EXISTS(SELECT 1 FROM identity.channel_binding WHERE channel_binding_id=v_bearer.channel_binding_id AND state='verified' AND verification_consumed_at IS NOT NULL)
     OR identity.consumer_initial_evidence_internal(v_user,p_current_legal) IS DISTINCT FROM true THEN RAISE EXCEPTION 'CONSUMER_AUTH_INVALID';END IF;
 ELSE
   IF v_account.user_state<>'active' OR (p_input->>'sessionId')::uuid IS DISTINCT FROM c.ordinary_session_id OR p_input->>'tokenHash' IS DISTINCT FROM c.ordinary_token_hash
     OR identity.assert_session_current(v_user,c.ordinary_session_id,c.ordinary_token_hash) IS DISTINCT FROM true THEN RAISE EXCEPTION 'CONSUMER_AUTH_INVALID';END IF;
 END IF;
 -- Unique credential insertion can wait on another subject. Recheck all clocks after it.
 INSERT INTO identity.consumer_passkey_credential(user_id,credential_id,public_key,signature_counter,device_type,backed_up,transports,rp_id,origin,label)
 VALUES(v_user,p_input->>'credentialId',p_input->>'publicKey',(p_input->>'counter')::bigint,p_input->>'deviceType',(p_input->>'backedUp')::boolean,
 ARRAY(SELECT jsonb_array_elements_text(p_input->'transports')),c.rp_id,c.origin,p_input->>'label') ON CONFLICT(credential_id) DO NOTHING RETURNING consumer_credential_id INTO v_credential;
 PERFORM identity.assert_consumer_options_capacity_internal(v_user,c.options_base_bytes);
 v_now:=clock_timestamp();
 IF v_credential IS NULL OR c.expires_at<=v_now OR (c.purpose='INITIAL_ENROLLMENT' AND v_email_expiry<=v_now)
 OR (c.purpose='ADD_PASSKEY' AND identity.assert_session_current(v_user,c.ordinary_session_id,c.ordinary_token_hash) IS DISTINCT FROM true) THEN RAISE EXCEPTION 'CONSUMER_AUTH_INVALID';END IF;
 UPDATE identity.consumer_passkey_challenge SET consumed_at=v_now WHERE challenge_id=c.challenge_id;
 IF c.purpose='INITIAL_ENROLLMENT' THEN
   DELETE FROM identity.mfa_factor WHERE user_id=v_user AND factor_type='totp' AND state='pending';
   UPDATE identity."user" SET state='active' WHERE user_id=v_user;
   UPDATE identity.channel_binding SET verification_token_hash=NULL,verification_expires_at=NULL WHERE channel_binding_id=v_bearer.channel_binding_id;
   v_session:=identity.insert_consumer_session_internal(v_user,p_input->'material',c.binding_hash);
 END IF;
 PERFORM identity.append_consumer_passkey_audit_internal(v_account.audit_token,'enrolled',p_source);
 IF v_session IS NOT NULL THEN PERFORM identity.append_consumer_passkey_audit_internal(v_account.audit_token,'session_created',p_source);END IF;
 IF c.expires_at<=clock_timestamp() OR (c.purpose='INITIAL_ENROLLMENT' AND v_email_expiry<=clock_timestamp())
 OR (c.purpose='ADD_PASSKEY' AND identity.assert_session_current(v_user,c.ordinary_session_id,c.ordinary_token_hash) IS DISTINCT FROM true) THEN RAISE EXCEPTION 'CONSUMER_AUTH_INVALID';END IF;
 RETURN jsonb_build_object('userId',v_user,'ownerRef',v_account.owner_ref,'sessionId',v_session,'optionsContext',identity.consumer_options_context_internal(v_user,NULL,clock_timestamp()+interval '5 minutes'));
END $$;
CREATE OR REPLACE FUNCTION identity.read_secure_login_challenge(p_hash text) RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('challengeId',c.login_challenge_id,'challengeTokenHash',c.token_hash,'userId',u.user_id,'ownerRef',u.owner_ref,'auditToken',u.audit_token,'passwordHash',c.password_hash_snapshot,
 'factorId',f.mfa_factor_id,'secretCiphertext',f.secret_ciphertext,'lastAcceptedStep',f.last_accepted_step,'bindingHash',c.binding_hash,'expiresAt',c.expires_at,'consumedAt',c.consumed_at)
 FROM identity.login_challenge c JOIN identity."user" u ON u.user_id=c.user_id AND u.state='active'
 LEFT JOIN identity.mfa_factor f ON f.mfa_factor_id=c.mfa_factor_id AND f.user_id=u.user_id AND f.factor_type='totp' AND f.state='active'
 WHERE c.token_hash=p_hash AND c.password_hash_snapshot=u.password_hash AND NOT COALESCE((SELECT held FROM identity.account_security_hold WHERE user_id=u.user_id),false)
 AND identity.login_method_current_internal(u.user_id,c.mfa_factor_id);
$$;

DO $$DECLARE v_owner name;v_function text;BEGIN
 SELECT pg_get_userbyid(proowner) INTO v_owner FROM pg_proc WHERE oid='identity.read_email_settings(uuid,uuid)'::regprocedure;
 EXECUTE format('ALTER TABLE identity.consumer_totp_enrollment OWNER TO %I',v_owner);
 REVOKE ALL ON identity.consumer_totp_enrollment FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_replay,debateai_erasure_runtime,debateai_staff_security_owner;
 PERFORM core.install_truncate_guard('identity.consumer_totp_enrollment');
 FOREACH v_function IN ARRAY ARRAY[
 'identity.read_secure_login_identity(bytea)','identity.read_secure_login_challenge(text)','identity.login_method_current_internal(uuid,uuid)',
 'identity.expired_totp_addition_candidates(integer)','identity.prune_totp_addition(uuid)',
 'identity.prepare_secure_totp_enrollment(jsonb)','identity.begin_secure_totp_enrollment(jsonb,jsonb)',
 'identity.read_secure_totp_enrollment(jsonb)','identity.complete_secure_totp_enrollment(jsonb,jsonb,jsonb)'] LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO %I',v_function,v_owner);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_replay,debateai_erasure_runtime,debateai_staff_security_owner',v_function);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION identity.read_secure_login_identity(bytea),identity.read_secure_login_challenge(text),
 identity.expired_totp_addition_candidates(integer),identity.prune_totp_addition(uuid),
 identity.prepare_secure_totp_enrollment(jsonb),identity.begin_secure_totp_enrollment(jsonb,jsonb),identity.read_secure_totp_enrollment(jsonb),
 identity.complete_secure_totp_enrollment(jsonb,jsonb,jsonb) TO debateai_authorization_runtime;

-- Retired type-back activation retains an owner-only signature; all runtime activation now verifies current secure-factor evidence.
CREATE OR REPLACE FUNCTION identity.activate_mfa_enrollment_with_audit(
  p_enrollment_token_hash text,p_recovery_code_id uuid,
  p_occurred_at timestamptz,p_source_context jsonb
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$ BEGIN RAISE EXCEPTION 'MFA_ENROLLMENT_STATE_INVALID'; END; $$;
REVOKE ALL ON FUNCTION identity.activate_mfa_enrollment_with_audit(text,uuid,timestamptz,jsonb) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime;

-- Existing internal staff owner needs the creation instant to enforce the same ordinary-session ceiling.
GRANT SELECT(created_at) ON identity.session TO debateai_staff_security_owner;

CREATE OR REPLACE FUNCTION identity.insert_consumer_session_internal(p_user uuid,p_material jsonb,p_binding text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_now timestamptz:=clock_timestamp();v_id uuid:=(p_material->>'sessionId')::uuid;v_idle timestamptz:=(p_material->>'idleExpiresAt')::timestamptz;v_absolute timestamptz:=(p_material->>'absoluteExpiresAt')::timestamptz;
BEGIN
 IF v_id IS NULL OR COALESCE(p_material->>'sessionTokenHash','') !~ '^sha256:[0-9a-f]{64}$' OR COALESCE(p_material->>'csrfTokenHash','') !~ '^sha256:[0-9a-f]{64}$'
 OR p_material->'sessionBindingContext' IS DISTINCT FROM jsonb_build_object('user_agent_hash',p_binding)
 OR v_idle IS NULL OR v_absolute IS NULL OR v_idle<=v_now OR v_absolute<=v_now OR v_idle>v_absolute
 THEN RAISE EXCEPTION 'CONSUMER_SESSION_INVALID';END IF;
 -- Database clock sets the ceilings; preserve any earlier selected-policy/material expiry.
 v_absolute:=LEAST(v_absolute,v_now+interval '720 hours');v_idle:=LEAST(v_idle,v_now+interval '336 hours',v_absolute);
 INSERT INTO identity.session(session_id,user_id,token_hash,csrf_token_hash,binding_context,created_at,last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at)
 VALUES(v_id,p_user,p_material->>'sessionTokenHash',p_material->>'csrfTokenHash',p_material->'sessionBindingContext',v_now,v_now,v_idle,v_absolute,v_now);
 RETURN v_id;
END $$;
