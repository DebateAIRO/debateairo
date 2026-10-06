-- Final authentication corrections. Earlier migration bytes and installed 0103 remain immutable.
CREATE OR REPLACE FUNCTION identity.read_phone_profile_with_audit(p_user uuid,p_session uuid,p_token text,p_source jsonb)
RETURNS TABLE(phone_ciphertext jsonb,phone_updated_at timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_actor uuid;
BEGIN
 PERFORM identity.consume_runtime_audit_attempt();
 PERFORM identity.lock_security_subjects(ARRAY[p_user]);
 IF identity.assert_session_current(p_user,p_session,p_token) IS DISTINCT FROM true THEN
  PERFORM identity.append_profile_audit_internal(NULL,'READ_PHONE_PROFILE',p_source,false);RETURN;
 END IF;
 SELECT audit_token INTO v_actor FROM identity."user" WHERE user_id=p_user;
 PERFORM identity.append_profile_audit_internal(v_actor,'READ_PHONE_PROFILE',p_source,true);
 RETURN QUERY SELECT u.phone_ciphertext,u.phone_updated_at FROM identity."user" u WHERE u.user_id=p_user;
END $$;
-- No unaudited ciphertext retrieval capability remains available to runtime roles.
REVOKE ALL ON FUNCTION identity.read_phone_profile(uuid,uuid,text) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_replay,debateai_erasure_runtime,debateai_staff_security_owner;

-- Recovery-channel edits warn the verified primary mailbox only.
CREATE OR REPLACE FUNCTION identity.enqueue_recovery_method_notice_internal(p_user uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM identity.lock_security_subjects(ARRAY[p_user]);
 IF identity.read_account_security_hold(p_user) OR EXISTS(SELECT 1 FROM identity.account_erasure_request WHERE user_id=p_user AND prepared_at IS NOT NULL) THEN RETURN;END IF;
 INSERT INTO identity.consumer_security_notice(user_id,channel_binding_id,channel_ciphertext,event_kind)
 SELECT p_user,channel_binding_id,address_ciphertext,'METHOD_CHANGED' FROM identity.channel_binding WHERE user_id=p_user AND state='verified' AND channel_type='email'
 ON CONFLICT(user_id,channel_binding_id,event_kind) DO UPDATE SET revision=identity.consumer_security_notice.revision+1,happened_at=clock_timestamp(),channel_ciphertext=EXCLUDED.channel_ciphertext;
END $$;

CREATE OR REPLACE FUNCTION identity.confirm_recovery_email_with_audit(p_hash text,p_source jsonb) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_user uuid;v_actor uuid;q identity.recovery_email_request%ROWTYPE;v_now timestamptz;v_changed boolean;
BEGIN
 PERFORM identity.consume_runtime_audit_attempt();
 SELECT user_id INTO v_user FROM identity.recovery_email_request WHERE confirm_token_hash=p_hash AND closed_at IS NULL;
 IF v_user IS NOT NULL THEN
 PERFORM identity.lock_security_subjects(ARRAY[v_user]);
 SELECT audit_token INTO v_actor FROM identity.lock_account_t9_internal(v_user,true);
 SELECT * INTO q FROM identity.recovery_email_request WHERE user_id=v_user AND confirm_token_hash=p_hash AND closed_at IS NULL FOR UPDATE;
 END IF;
 v_now:=clock_timestamp();
 IF v_actor IS NULL OR q.recovery_email_request_id IS NULL THEN PERFORM identity.append_profile_audit_internal(NULL,'CONFIRM_RECOVERY_EMAIL',p_source,false);RETURN 'INVALID';END IF;
 IF q.expires_at<=v_now THEN
 UPDATE identity.recovery_email_request SET closed_at=v_now,outcome='EXPIRED' WHERE recovery_email_request_id=q.recovery_email_request_id;
 PERFORM identity.append_profile_audit_internal(NULL,'CONFIRM_RECOVERY_EMAIL',p_source,false);RETURN 'EXPIRED';END IF;
 IF EXISTS(SELECT 1 FROM identity."user" WHERE user_id=v_user AND email_blind_index=q.candidate_blind_index) THEN
 UPDATE identity.recovery_email_request SET closed_at=v_now,outcome='INVALID' WHERE recovery_email_request_id=q.recovery_email_request_id;
 PERFORM identity.append_profile_audit_internal(NULL,'CONFIRM_RECOVERY_EMAIL',p_source,false);RETURN 'INVALID';END IF;
 -- Candidate/nonce never come from the confirmer: only the current token-bound
 -- request row held FOR UPDATE supplies the final ciphertext, using final AAD.
 -- A fresh envelope for the same verified candidate is not a changed channel.
 SELECT NOT EXISTS(SELECT 1 FROM identity.channel_binding c WHERE c.user_id=v_user AND c.channel_type='recovery_email' AND c.state='verified'
 AND (c.address_ciphertext=q.candidate_ciphertext OR EXISTS(SELECT 1 FROM identity.recovery_email_request previous
 WHERE previous.user_id=v_user AND previous.outcome='CONFIRMED' AND previous.candidate_blind_index=q.candidate_blind_index AND previous.candidate_ciphertext=c.address_ciphertext))) INTO v_changed;
 UPDATE identity."user" SET recovery_email_ciphertext=q.candidate_ciphertext WHERE user_id=v_user;
 INSERT INTO identity.channel_binding(user_id,channel_type,address_ciphertext,state,created_at,verified_at)
 VALUES(v_user,'recovery_email',q.candidate_ciphertext,'verified',v_now,v_now)
 ON CONFLICT(user_id,channel_type) DO UPDATE SET address_ciphertext=EXCLUDED.address_ciphertext,state='verified',verified_at=v_now,
 verification_token_hash=NULL,verification_expires_at=NULL,verification_consumed_at=NULL;
 UPDATE identity.recovery_email_request SET closed_at=v_now,outcome='CONFIRMED' WHERE recovery_email_request_id=q.recovery_email_request_id;
 IF v_changed THEN PERFORM identity.enqueue_recovery_method_notice_internal(v_user);END IF;
 PERFORM identity.append_profile_audit_internal(v_actor,'CONFIRM_RECOVERY_EMAIL',p_source,true);RETURN 'CONFIRMED';
END $$;

CREATE OR REPLACE FUNCTION identity.remove_recovery_email_with_audit(p_user uuid,p_session uuid,p_token text,p_grant text,p_source jsonb) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_actor uuid;v_now timestamptz;v_changed boolean;
BEGIN
 PERFORM identity.consume_runtime_audit_attempt();v_actor:=identity.consume_profile_grant_internal(p_user,p_session,p_token,p_grant,'CHANGE_RECOVERY_EMAIL');v_now:=clock_timestamp();
 IF v_actor IS NULL THEN PERFORM identity.append_profile_audit_internal(NULL,'REMOVE_RECOVERY_EMAIL',p_source,false);RETURN false;END IF;
 SELECT EXISTS(SELECT 1 FROM identity.channel_binding WHERE user_id=p_user AND channel_type='recovery_email' AND state='verified') INTO v_changed;
 DELETE FROM identity.channel_binding WHERE user_id=p_user AND channel_type='recovery_email';
 UPDATE identity."user" SET recovery_email_ciphertext=NULL WHERE user_id=p_user;
 UPDATE identity.recovery_email_request SET closed_at=v_now,outcome='REMOVED' WHERE user_id=p_user AND closed_at IS NULL;
 IF v_changed THEN PERFORM identity.enqueue_recovery_method_notice_internal(p_user);END IF;
 PERFORM identity.append_profile_audit_internal(v_actor,'REMOVE_RECOVERY_EMAIL',p_source,true);RETURN true;
END $$;

CREATE OR REPLACE FUNCTION identity.complete_social_step_up(p jsonb,p_source jsonb) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r jsonb;t timestamptz;u uuid:=(p->>'userId')::uuid;counter bigint:=(p->>'counter')::bigint;step bigint:=(p->>'acceptedStep')::bigint;BEGIN
 PERFORM identity.consume_runtime_audit_attempt();r:=identity.read_social_step_up(p);t:=clock_timestamp();
 IF p->>'method'='totp' THEN
  PERFORM 1 FROM identity.mfa_factor WHERE user_id=u AND mfa_factor_id=(r->>'factorId')::uuid FOR UPDATE;
  IF r->>'factorId' IS NULL OR r->>'factorId' IS DISTINCT FROM p->>'factorId' OR r->'secretCiphertext' IS DISTINCT FROM p->'secretCiphertext' OR step IS NULL OR abs(step-floor(extract(epoch FROM t)/30))>1 OR (r->>'lastAcceptedStep' IS NOT NULL AND step<=(r->>'lastAcceptedStep')::bigint) THEN RAISE EXCEPTION 'SOCIAL_FLOW_INVALID';END IF;
  UPDATE identity.mfa_factor SET last_accepted_step=step WHERE mfa_factor_id=(r->>'factorId')::uuid;
 ELSIF p->>'method'='recovery_code' THEN
  PERFORM 1 FROM identity.recovery_code WHERE user_id=u AND recovery_code_id=(r->>'recoveryCodeId')::uuid FOR UPDATE;
  IF r->>'recoveryCodeId' IS NULL OR r->>'recoveryCodeId' IS DISTINCT FROM p->>'recoveryCodeId' OR r->>'codeHash' IS DISTINCT FROM p->>'codeHash' OR p->>'replacementHash' IS NULL THEN RAISE EXCEPTION 'SOCIAL_FLOW_INVALID';END IF;
  UPDATE identity.recovery_code SET consumed_at=t WHERE recovery_code_id=(r->>'recoveryCodeId')::uuid;
  INSERT INTO identity.recovery_code(user_id,code_slot,code_hash,created_at) VALUES(u,(r->>'codeSlot')::smallint,p->>'replacementHash',t);
 ELSIF p->>'method'='passkey' THEN
  PERFORM 1 FROM identity.consumer_passkey_credential WHERE user_id=u AND credential_id=p->>'credentialId' FOR UPDATE;
  r:=identity.read_social_step_up(p);
  IF r->>'credentialId' IS NULL OR r->>'handleHash' IS NULL OR r->>'handleHash' IS DISTINCT FROM p->>'handleHash' OR r->>'challengeHash' IS DISTINCT FROM p->>'challengeHash'
  OR r->>'publicKey' IS DISTINCT FROM p->>'publicKey' OR r->>'deviceType' IS DISTINCT FROM p->>'deviceType' OR r->>'userHandle' IS DISTINCT FROM p->>'userHandle'
  OR NOT EXISTS(SELECT 1 FROM identity.consumer_passkey_credential WHERE user_id=u AND credential_id=p->>'credentialId' AND rp_id=r->>'rpId' AND origin=r->>'origin')
  OR counter IS NULL OR counter NOT BETWEEN 0 AND 4294967295 OR (r->>'deviceType'='singleDevice' AND (counter>0 OR (r->>'counter')::bigint>0) AND counter<=(r->>'counter')::bigint)
  OR (p->>'backedUp')::boolean IS NULL OR ((p->>'backedUp')::boolean AND r->>'deviceType'<>'multiDevice') THEN RAISE EXCEPTION 'SOCIAL_FLOW_INVALID';END IF;
  IF r->>'deviceType'='multiDevice' AND (r->>'counter')::bigint>0 AND counter<=(r->>'counter')::bigint THEN
   PERFORM identity.append_consumer_passkey_audit_internal((SELECT audit_token FROM identity."user" WHERE user_id=u),'counter_anomaly',p_source);
  END IF;
  UPDATE identity.consumer_passkey_credential SET signature_counter=GREATEST(signature_counter,counter),backed_up=(p->>'backedUp')::boolean,last_used_at=t WHERE user_id=u AND credential_id=p->>'credentialId';
 ELSE RAISE EXCEPTION 'SOCIAL_FLOW_INVALID';END IF;
 UPDATE identity.social_flow SET consumed_at=t WHERE proof_hash=p->>'proofHash';
 UPDATE identity.session SET token_hash=p->>'replacementTokenHash',csrf_token_hash=p->>'replacementCsrfHash',last_mfa_at=t,last_seen_at=t,idle_expires_at=LEAST(absolute_expires_at,created_at+interval '720 hours',t+interval '336 hours') WHERE session_id=(p->>'sessionId')::uuid;
 PERFORM identity.insert_consumer_grant_internal(u,(p->>'sessionId')::uuid,p->>'grantHash',r->'authorization',(r->>'expiresAt')::timestamptz);
 PERFORM identity.append_consumer_security_audit_internal((SELECT audit_token FROM identity."user" WHERE user_id=u),'STEP_UP',p_source);
 IF (r->>'expiresAt')::timestamptz<=clock_timestamp() THEN RAISE EXCEPTION 'SOCIAL_FLOW_INVALID';END IF;
 RETURN jsonb_build_object('authorization',r->'authorization','expiresAt',r->>'expiresAt');
END $$;

CREATE OR REPLACE FUNCTION identity.read_social_login_status(p jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c identity.login_challenge%ROWTYPE;a record;methods text[];u uuid;
BEGIN
 SELECT user_id INTO u FROM identity.login_challenge WHERE token_hash=p->>'challengeHash';
 IF u IS NULL THEN RETURN NULL;END IF;
 SELECT * INTO a FROM identity.lock_account_t9_internal(u,true);
 SELECT * INTO c FROM identity.login_challenge WHERE token_hash=p->>'challengeHash' FOR UPDATE;
 IF a.audit_token IS NULL OR c.user_id IS DISTINCT FROM u OR c.binding_hash IS DISTINCT FROM p->>'bindingHash'
 OR identity.social_first_step_current_internal(c.login_challenge_id,p->'admittedProviders',p->>'browserHash') IS DISTINCT FROM true
 OR identity.login_method_current_internal(u,c.mfa_factor_id) IS DISTINCT FROM true THEN RETURN NULL;END IF;
 methods:=array_remove(ARRAY[
 CASE WHEN EXISTS(SELECT 1 FROM identity.mfa_factor WHERE mfa_factor_id=c.mfa_factor_id AND user_id=u AND factor_type='totp' AND state='active' AND verified_at IS NOT NULL) THEN 'totp' END,
 CASE WHEN EXISTS(SELECT 1 FROM identity.consumer_passkey_credential WHERE user_id=u AND revoked_at IS NULL) THEN 'passkey' END,
 CASE WHEN EXISTS(SELECT 1 FROM identity.recovery_code WHERE user_id=u AND consumed_at IS NULL AND revoked_at IS NULL) THEN 'recovery_code' END],NULL);
 IF cardinality(methods)=0 OR c.expires_at<=clock_timestamp() THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('expiresAt',c.expires_at,'availableMethods',methods);
END $$;
DO $$DECLARE o name;f text;BEGIN
 SELECT pg_get_userbyid(proowner) INTO o FROM pg_proc WHERE oid='identity.read_email_settings(uuid,uuid)'::regprocedure;
 FOREACH f IN ARRAY ARRAY['enqueue_recovery_method_notice_internal(uuid)','read_phone_profile_with_audit(uuid,uuid,text,jsonb)','confirm_recovery_email_with_audit(text,jsonb)','remove_recovery_email_with_audit(uuid,uuid,text,text,jsonb)','complete_social_step_up(jsonb,jsonb)','read_social_login_status(jsonb)'] LOOP
  EXECUTE format('ALTER FUNCTION identity.%s OWNER TO %I',f,o);
  EXECUTE format('REVOKE ALL ON FUNCTION identity.%s FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_replay,debateai_erasure_runtime,debateai_staff_security_owner',f);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION identity.read_phone_profile_with_audit(uuid,uuid,text,jsonb),identity.confirm_recovery_email_with_audit(text,jsonb),identity.remove_recovery_email_with_audit(uuid,uuid,text,text,jsonb),identity.complete_social_step_up(jsonb,jsonb),identity.read_social_login_status(jsonb) TO debateai_authorization_runtime;
