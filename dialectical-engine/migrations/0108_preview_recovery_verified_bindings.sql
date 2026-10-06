-- Append-only verified binding compatibility for reset and legacy MFA.
-- Immutable103–107, full historical notices, owner/ACL and current proof gates remain unchanged.
CREATE OR REPLACE FUNCTION identity.password_reset_prepare(p_index bytea) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid;r jsonb;BEGIN
 SELECT user_id INTO u FROM identity."user" WHERE email_blind_index=p_index;
 IF u IS NULL OR NOT identity.password_reset_eligible(u) OR EXISTS(SELECT 1 FROM identity.account_recovery_binding WHERE user_id=u AND closed_at IS NULL) THEN RETURN NULL;END IF;
 SELECT jsonb_build_object('userId',u,'channels',jsonb_agg(jsonb_build_object('channelId',c.channel_binding_id,'channelType',c.channel_type,'addressCiphertext',c.address_ciphertext,
 'proof',c.channel_binding_id=(SELECT p.channel_binding_id FROM identity.channel_binding p JOIN identity."user" a USING(user_id) WHERE p.user_id=u AND p.channel_type='email' AND p.state='verified' AND p.address_ciphertext=a.email_ciphertext ORDER BY p.channel_binding_id LIMIT 1)) ORDER BY c.channel_binding_id),'bindingChannelIds',(SELECT array_agg(channel_binding_id ORDER BY channel_binding_id) FROM identity.channel_binding WHERE user_id=u AND channel_type IN('email','recovery_email') AND state='verified')) INTO r
 FROM identity.channel_binding c WHERE c.user_id=u AND c.channel_type IN('email','recovery_email');RETURN r;
END $$;

CREATE OR REPLACE FUNCTION identity.password_reset_start(p_index bytea,p_candidate uuid,p_channels uuid[],p_refs jsonb,p_link text,p_cancel text,p_notices jsonb,p_source jsonb,p_register bigint) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u identity."user"%ROWTYPE;ch identity.channel_binding%ROWTYPE;f identity.mfa_factor%ROWTYPE;rules jsonb;r record;id uuid;item jsonb;t timestamptz;binding_channels uuid[];BEGIN
 rules:=identity.password_reset_rules(p_register);
 SELECT * INTO u FROM identity."user" WHERE email_blind_index=p_index;
 IF u.user_id IS NOT NULL THEN PERFORM identity.lock_security_subjects(ARRAY[u.user_id]);SELECT * INTO u FROM identity."user" WHERE user_id=u.user_id FOR UPDATE;END IF;t:=clock_timestamp();
 IF (octet_length(p_index)=32 AND p_link ~ '^sha256:[0-9a-f]{64}$' AND p_cancel ~ '^sha256:[0-9a-f]{64}$' AND p_link<>p_cancel AND jsonb_typeof(p_notices)='array' AND core.is_content_envelope(p_refs)) IS NOT TRUE THEN RAISE EXCEPTION 'PASSWORD_RESET_START_INPUT_INVALID';END IF;
 IF u.user_id IS NULL OR u.user_id IS DISTINCT FROM p_candidate OR u.email_blind_index IS DISTINCT FROM p_index OR NOT identity.password_reset_eligible(u.user_id)
 OR EXISTS(SELECT 1 FROM identity.account_recovery_binding WHERE user_id=u.user_id AND closed_at IS NULL)
 THEN PERFORM identity.password_reset_audit(NULL,'started',p_source,false);RETURN false;END IF;
 SELECT * INTO ch FROM identity.channel_binding WHERE user_id=u.user_id AND channel_type='email' AND state='verified' AND address_ciphertext=u.email_ciphertext ORDER BY channel_binding_id LIMIT 1;
 SELECT * INTO f FROM identity.mfa_factor WHERE user_id=u.user_id AND factor_type='totp' AND state='active' AND verified_at IS NOT NULL ORDER BY created_at DESC,mfa_factor_id DESC LIMIT 1;
 IF p_channels IS DISTINCT FROM (SELECT array_agg(channel_binding_id ORDER BY channel_binding_id) FROM identity.channel_binding WHERE user_id=u.user_id AND channel_type IN('email','recovery_email'))
 OR p_channels IS DISTINCT FROM (SELECT array_agg((value->>'channelId')::uuid ORDER BY (value->>'channelId')::uuid) FROM jsonb_array_elements(p_notices)) THEN RETURN false;END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_notices) LOOP
  IF core.is_content_envelope(item->'envelope') IS NOT TRUE
  OR ((item->>'channelId')::uuid=ch.channel_binding_id AND core.is_content_envelope(item->'proofEnvelope') IS NOT TRUE)
  OR ((item->>'channelId')::uuid<>ch.channel_binding_id AND item ? 'proofEnvelope') THEN RAISE EXCEPTION 'PASSWORD_RESET_NOTICE_ENVELOPE_INVALID';END IF;
 END LOOP;
 SELECT array_agg(channel_binding_id ORDER BY channel_binding_id) INTO binding_channels FROM identity.channel_binding WHERE user_id=u.user_id AND channel_type IN('email','recovery_email') AND state='verified';
 PERFORM identity.begin_runtime_audit_attempt();SELECT * INTO r FROM identity.start_account_recovery(p_index,u.user_id,binding_channels,p_refs,p_source);
 IF r.start_status<>'CREATED' THEN RETURN false;END IF;
 SELECT recovery_request_id INTO id FROM identity.account_recovery_request WHERE public_handle=r.public_handle;
 INSERT INTO identity.password_reset_control(recovery_request_id,user_id,register_version,policy,password_snapshot,security_epoch,email_index_snapshot,channel_id,channel_snapshot,factor_id,factor_snapshot,factor_verified_at,link_hash,cancel_hash,expires_at)
 VALUES(id,u.user_id,p_register,rules,u.password_hash,COALESCE((SELECT security_epoch FROM identity.account_security_hold WHERE user_id=u.user_id),0),u.email_blind_index,ch.channel_binding_id,ch.address_ciphertext,f.mfa_factor_id,f.secret_ciphertext,f.verified_at,p_link,p_cancel,t+((rules->>'maximum_elapsed_ms')::bigint*interval '1 millisecond'));
 FOR item IN SELECT value FROM jsonb_array_elements(p_notices) LOOP
  INSERT INTO identity.password_reset_notice_binding(recovery_request_id,channel_id,payload_ciphertext) VALUES(id,(item->>'channelId')::uuid,item->'envelope');
  IF (item->>'channelId')::uuid=ch.channel_binding_id THEN INSERT INTO identity.password_reset_notice(recovery_request_id,user_id,channel_id,event_kind,payload_ciphertext) VALUES(id,u.user_id,ch.channel_binding_id,'PROOF',item->'proofEnvelope');END IF;
 END LOOP;
 PERFORM identity.password_reset_audit(id,'started',p_source,true);RETURN true;
END $$;

CREATE OR REPLACE FUNCTION identity.mfa_recovery_prepare_exchange(p_link text) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c identity.mfa_recovery_control%ROWTYPE;BEGIN SELECT * INTO c FROM identity.mfa_recovery_control WHERE link_hash=p_link AND stage='EMAIL_REQUIRED';c:=identity.mfa_recovery_snapshot_current(c.challenge_id);IF c.challenge_id IS NULL THEN RETURN NULL;END IF;RETURN jsonb_build_object('userId',c.user_id,'passwordHash',c.password_snapshot,'channels',(SELECT array_agg(channel_binding_id ORDER BY channel_binding_id) FROM identity.channel_binding WHERE user_id=c.user_id AND channel_type IN('email','recovery_email')),'bindingChannelIds',(SELECT array_agg(channel_binding_id ORDER BY channel_binding_id) FROM identity.channel_binding WHERE user_id=c.user_id AND channel_type IN('email','recovery_email') AND state='verified'));END $$;

CREATE OR REPLACE FUNCTION identity.mfa_recovery_exchange(p_link text,p_password text,p_session text,p_csrf text,p_refs jsonb,p_risk text,p_source jsonb) RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c identity.mfa_recovery_control%ROWTYPE;r record;channels uuid[];id uuid;t timestamptz;BEGIN
 SELECT * INTO c FROM identity.mfa_recovery_control WHERE link_hash=p_link;c:=identity.mfa_recovery_snapshot_current(c.challenge_id);IF c.challenge_id IS NULL OR c.stage<>'EMAIL_REQUIRED' OR c.link_used_at IS NOT NULL OR p_password IS DISTINCT FROM c.password_snapshot OR (p_session ~ '^sha256:[0-9a-f]{64}$' AND p_csrf ~ '^sha256:[0-9a-f]{64}$' AND p_session<>p_csrf AND p_session<>c.link_hash AND p_session<>c.cancel_hash AND p_csrf<>c.link_hash AND p_csrf<>c.cancel_hash AND core.is_content_envelope(p_refs)) IS NOT TRUE THEN RETURN 'INVALID';END IF;
 IF NOT identity.mfa_recovery_risk_matches(c.user_id,p_risk) THEN RETURN 'INVALID';END IF;
 SELECT array_agg(channel_binding_id ORDER BY channel_binding_id) INTO channels FROM identity.channel_binding WHERE user_id=c.user_id AND channel_type IN('email','recovery_email') AND state='verified';PERFORM identity.begin_runtime_audit_attempt();SELECT * INTO r FROM identity.start_account_recovery(c.email_index_snapshot,c.user_id,channels,p_refs,p_source);IF r.start_status<>'CREATED' THEN RETURN 'INVALID';END IF;
 SELECT recovery_request_id INTO id FROM identity.account_recovery_request WHERE public_handle=r.public_handle;t:=clock_timestamp();IF c.email_expires_at<=t THEN RAISE EXCEPTION 'MFA_RECOVERY_EMAIL_EXPIRED_AFTER_PAIR';END IF;
 UPDATE identity.mfa_recovery_control SET recovery_request_id=id,stage='FACTOR_REQUIRED',session_hash=p_session,csrf_hash=p_csrf,paired_at=t,link_used_at=t,expires_at=t+interval '5 minutes' WHERE challenge_id=c.challenge_id;
 INSERT INTO identity.account_recovery_state_event(recovery_request_id,state) VALUES(id,'TIER_PINNED'),(id,'PROOF_PENDING');PERFORM identity.mfa_recovery_notice_event(c.challenge_id,'STARTED');RETURN 'FACTOR_REQUIRED';
END $$;
