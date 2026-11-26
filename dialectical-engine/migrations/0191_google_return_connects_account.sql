-- 0191 · A sign-in through Google is connected by itself to the account that signs in with the same address
-- (migrations/lineage/README.md "A Google sign-in connects to its account by itself (0191)").
--
-- Plain words. A person who made their account with an e-mail address and a password, and later pressed "Continue with
-- Google" with the same address, got the sign-up form: no Google link existed for the account, so the return answered
-- signup_required, and the form then refused because the address was taken. The owner ruled on 2026-11-26 that Google
-- connects by itself. identity.finish_social_callback_v3 is 0178's identity.finish_social_callback_v2 with one more arm:
-- on a sign-in through Google whose subject no account has, when Google itself answers for the address (the API passes
-- assertedEmailIndex only for a verified gmail.com address or a verified address of a Google Workspace domain) and an
-- active account signs in with that address, the Google link is made for that account and the sign-in goes on as for
-- any linked account: the second step (authenticator code, passkey or saved code) is still asked, so Google alone never
-- opens an account.
--
-- What is not connected, each answering signup_required exactly as v2 does:
--   - an account that is not active (a sign-up not finished, a suspended, frozen or deleted account) or held;
--   - a staff account (those never sign in through a provider);
--   - an account that already has any link to Google, live or removed (a removed link stays removed; a second Google
--     subject is never added beside a first);
--   - an account with no second step the sign-in can ask for;
--   - any other provider, and any address the provider does not itself answer for (assertedEmailIndex null);
--   - LINK and the step-up, which name their account by a session and are unchanged.
-- Whoever reaches this arm has shown Google's proof for the address, in this browser, in a flow this caller claimed, so
-- the answer tells them nothing about an address they do not hold. The connection writes what LINK writes: the link row,
-- the "sign-in method changed" notice to the account's verified addresses, and the identity.social.LINK audit event.
--
-- 0178's function is sealed (its postcondition digest; the N-1 rule refuses replacing an earlier function), so this is a
-- new function the new release calls instead. 0178's keeps its grant for the release before.
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: expand
--   expand          additive only: one new function, which the release before never calls; no table, no column, no
--                   earlier function and no grant of an earlier object changes.
-- n1: keeps-verifier
--   keeps-verifier  no billing relation or billing function, so lineage/verify-effective-capabilities-130.sql stays in force.
--   row security    unchanged: a definer of the identity family's owner, as the function it supersedes.
--
-- Replay-safe in the repository's form: CREATE OR REPLACE of a name no earlier migration defines.

CREATE OR REPLACE FUNCTION identity.finish_social_callback_v3(p jsonb,p_source jsonb) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE f identity.social_flow%ROWTYPE;s identity.social_identity%ROWTYPE;a record;u uuid;factor uuid;t timestamptz;original_subject_user uuid;idx bytea;cand uuid;BEGIN
 PERFORM identity.consume_runtime_audit_attempt();
 SELECT * INTO f FROM identity.social_flow WHERE state_hash=p->>'stateHash';
 SELECT * INTO s FROM identity.social_identity WHERE provider=f.provider AND issuer=p->>'issuer' AND app_scope=p->>'appScope' AND subject=p->>'subject';
 original_subject_user:=s.user_id;
 -- The account this return may be connected to: a sign-in (never LINK or a step-up) through Google, whose subject no
 -- account has, with an address Google itself answers for, that an active account signs in with. Read before any lock
 -- so the account is locked in the one order every caller uses; every condition is asked again under the locks.
 IF f.purpose='LOGIN' AND f.provider='google' AND s.user_id IS NULL AND p->>'assertedEmailIndex' IS NOT NULL THEN
  idx:=decode(p->>'assertedEmailIndex','hex');
  SELECT user_id INTO cand FROM identity."user" WHERE email_blind_index=idx AND state='active';
 END IF;
 PERFORM identity.lock_security_subjects(ARRAY(SELECT DISTINCT x FROM unnest(ARRAY[f.user_id,s.user_id,cand]) x WHERE x IS NOT NULL ORDER BY x));
 IF s.user_id IS NOT NULL THEN SELECT * INTO a FROM identity.lock_account_t9_internal(s.user_id,true);
 ELSIF cand IS NOT NULL THEN SELECT * INTO a FROM identity.lock_account_t9_internal(cand,true);END IF;
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
 -- Connect by itself. The flow was checked above (claimed by this caller, this browser, this provider configuration, not
 -- expired), and the provider's proof of the address is the API's (the confined worker's verified assertion). Under the
 -- account's locks: it is active and not held (lock_account_t9_internal answered), it still signs in with that address,
 -- it is no staff account (those never sign in through a provider), it has no link to this provider at all (a link the
 -- person removed stays removed, and a second Google subject is never added beside a first), and it has a second step
 -- the sign-in below can ask for. Then the link is made exactly as LINK makes it: the row, the "sign-in method changed"
 -- notice to the account's verified addresses, and the LINK audit event. An account that fails any condition is left
 -- untouched and the return answers signup_required, as before this step.
 IF cand IS NOT NULL AND s.user_id IS NULL THEN
  IF a.audit_token IS NOT NULL AND EXISTS(SELECT 1 FROM identity."user" WHERE user_id=cand AND state='active' AND email_blind_index=idx)
  AND NOT staff.consumer_security_affiliated(cand) AND NOT EXISTS(SELECT 1 FROM identity.social_identity WHERE user_id=cand AND provider=f.provider)
  AND identity.login_method_current_internal(cand,(SELECT mfa_factor_id FROM identity.mfa_factor WHERE user_id=cand AND factor_type='totp' AND state='active' AND verified_at IS NOT NULL ORDER BY created_at DESC LIMIT 1)) THEN
   INSERT INTO identity.social_identity(user_id,provider,issuer,app_scope,subject,configuration) VALUES(cand,f.provider,p->>'issuer',p->>'appScope',p->>'subject',f.configuration) RETURNING * INTO s;
   PERFORM set_config('debateai.mail_locale', f.mail_locale, true);
   PERFORM identity.enqueue_consumer_security_notice_internal(cand,'METHOD_CHANGED');PERFORM identity.append_social_audit_internal(a.audit_token,'LINK',p_source);
  END IF;
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

-- Owned by the owner of the function it supersedes, which reads and writes the same rows and calls the same helpers.
-- n1: reviewed sets the owner of the one function this step creates to the owner of the function it supersedes; the release before never calls it
DO $google_return_connects_account_owner$
DECLARE v_owner name;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO STRICT v_owner FROM pg_catalog.pg_proc AS p
    WHERE p.oid = 'identity.finish_social_callback_v2(jsonb,jsonb)'::regprocedure;
  EXECUTE pg_catalog.format('ALTER FUNCTION identity.finish_social_callback_v3(jsonb,jsonb) OWNER TO %I', v_owner);
END
$google_return_connects_account_owner$;

REVOKE ALL ON FUNCTION identity.finish_social_callback_v3(jsonb,jsonb)
  FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker,debateai_staff_security_owner;
-- The API's sign-in return, on the login that calls 0178's function today.
GRANT EXECUTE ON FUNCTION identity.finish_social_callback_v3(jsonb,jsonb) TO debateai_authorization_runtime;
