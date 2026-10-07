-- Private team HTTP projections. Existing NOLOGIN owner; no new principal/table or raw runtime access.
CREATE OR REPLACE FUNCTION staff.require_http_authority(p_context jsonb,p_token text,p_capability text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF staff.read_current_context(p_context,p_token) IS NULL
    OR staff.authorize_action(p_context,p_capability) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'STAFF_AUTHORITY_INVALID';
 END IF;
END $$;
CREATE OR REPLACE FUNCTION staff.http_delivery_state(p_event uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT CASE WHEN count(*)=0 THEN 'PENDING'
  WHEN bool_and(last_outcome='DELIVERED') THEN 'DELIVERED'
  WHEN bool_or(last_outcome IN('FAILED','SEVERED')) THEN 'FAILED' ELSE 'PENDING' END
 FROM (SELECT (SELECT r.outcome FROM staff.alert_delivery_receipt r WHERE r.outbox_id=o.outbox_id
               ORDER BY r.recorded_at DESC,r.receipt_id DESC LIMIT 1) AS last_outcome
       FROM staff.alert_outbox o WHERE o.event_id=p_event) deliveries
$$;
CREATE OR REPLACE FUNCTION staff.read_enrollment(p_user uuid,p_base uuid,p_token text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_count integer;v_email boolean;v_totp boolean;
BEGIN
 IF identity.assert_session_current(p_user,p_base,p_token) IS DISTINCT FROM true THEN RETURN NULL;END IF;
 SELECT count(*)::integer INTO v_count FROM identity.mfa_factor
 WHERE user_id=p_user AND factor_type='passkey' AND state='active' AND verified_at IS NOT NULL
 AND user_verification_required AND NOT backup_eligible AND NOT backup_state;
 SELECT EXISTS(SELECT 1 FROM identity.channel_binding WHERE user_id=p_user AND channel_type='email' AND state='verified') INTO v_email;
 SELECT EXISTS(SELECT 1 FROM identity.mfa_factor WHERE user_id=p_user AND factor_type='totp' AND state='active' AND verified_at IS NOT NULL) INTO v_totp;
 IF identity.assert_session_current(p_user,p_base,p_token) IS DISTINCT FROM true THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('user_id',p_user,'readiness',jsonb_build_object('account_active',true,
  'email_verified',v_email,'totp_active',v_totp,'security_hold',false,'verified_credential_count',v_count,
  'owner_credential_requirement_met',v_count>=2,'delegated_credential_requirement_met',v_count>=1));
END $$;
CREATE OR REPLACE FUNCTION staff.read_team_page(p_context jsonb,p_token text,p_limit integer,p_after_time timestamptz,p_after_id uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_rows jsonb;v_next jsonb;v_count integer;
BEGIN
 PERFORM staff.require_http_authority(p_context,p_token,'TEAM_READ');
 IF p_limit IS NULL OR p_limit<1 OR p_limit>100 OR (p_after_time IS NULL)<>(p_after_id IS NULL) THEN RAISE EXCEPTION 'STAFF_PAGE_INVALID';END IF;
 WITH page AS (SELECT s.* FROM staff.subject s WHERE p_after_time IS NULL OR (s.created_at,s.staff_id)>(p_after_time,p_after_id)
              ORDER BY s.created_at,s.staff_id LIMIT p_limit+1), shown AS (SELECT * FROM page ORDER BY created_at,staff_id LIMIT p_limit)
 SELECT (SELECT count(*) FROM page),COALESCE(jsonb_agg(jsonb_build_object(
  'staff_id',staff_id,'pseudonym','staff-'||replace(staff_id::text,'-',''),
  'status',CASE WHEN state='ERASED' THEN 'REVOKED' ELSE state END,
  'capabilities',CASE WHEN state='ACTIVE' THEN capabilities ELSE '{}'::text[] END,'grant_revision',grant_revision,
  'credential_count',(SELECT count(*) FROM identity.mfa_factor WHERE user_id=shown.user_id AND factor_type='passkey' AND state='active' AND verified_at IS NOT NULL AND user_verification_required AND NOT backup_eligible AND NOT backup_state),
  'last_privilege_at',(SELECT max(last_seen_at) FROM staff.privilege_session WHERE staff_id=shown.staff_id),
  'delivery_state',staff.http_delivery_state((SELECT a.event_id FROM staff.audit_event a WHERE a.subject_staff_id=shown.staff_id ORDER BY a.recorded_at DESC,a.event_id DESC LIMIT 1))
 ) ORDER BY created_at,staff_id),'[]'::jsonb),
 (SELECT jsonb_build_array(created_at,staff_id) FROM shown ORDER BY created_at DESC,staff_id DESC LIMIT 1)
 INTO v_count,v_rows,v_next FROM shown;
 PERFORM staff.require_http_authority(p_context,p_token,'TEAM_READ');
 RETURN jsonb_build_object('members',v_rows,'nextPosition',CASE WHEN v_count>p_limit THEN v_next ELSE NULL END,'order','CREATED_AT_ID_ASC');
END $$;
CREATE OR REPLACE FUNCTION staff.read_audit_page(p_context jsonb,p_token text,p_limit integer,p_after_time timestamptz,p_after_id uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_rows jsonb;v_next jsonb;v_count integer;
BEGIN
 PERFORM staff.require_http_authority(p_context,p_token,'AUDIT_READ');
 IF p_limit IS NULL OR p_limit<1 OR p_limit>100 OR (p_after_time IS NULL)<>(p_after_id IS NULL) THEN RAISE EXCEPTION 'STAFF_PAGE_INVALID';END IF;
 WITH page AS (SELECT a.* FROM staff.audit_event a WHERE p_after_time IS NULL OR (a.recorded_at,a.event_id)>(p_after_time,p_after_id)
              ORDER BY a.recorded_at,a.event_id LIMIT p_limit+1), shown AS (SELECT * FROM page ORDER BY recorded_at,event_id LIMIT p_limit)
 SELECT (SELECT count(*) FROM page),COALESCE(jsonb_agg(jsonb_build_object('event_id',event_id,
  'actor_staff_id',actor_staff_id,'subject_staff_id',subject_staff_id,
  'event',CASE event_type WHEN 'BOOTSTRAP' THEN 'OWNER_BOOTSTRAPPED' WHEN 'RECOVER_OWNER' THEN 'OWNER_RECOVERED'
    WHEN 'INVITE' THEN 'INVITATION_ISSUED' WHEN 'ACCEPT' THEN 'INVITATION_ACCEPTED' WHEN 'GRANT' THEN 'GRANTS_CHANGED'
    WHEN 'DISABLE' THEN 'STAFF_DISABLED' WHEN 'KEY_CHANGE' THEN 'CREDENTIAL_REGISTERED' END,
  'recorded_at',recorded_at,'reason',jsonb_strip_nulls(jsonb_build_object('code',CASE reason_code WHEN 'BOOTSTRAP' THEN 'TEAM_ONBOARDING' WHEN 'RECOVERY' THEN 'SECURITY_RESPONSE' ELSE reason_code END,'ticket_ref',ticket_ref)),
  'delivery_state',staff.http_delivery_state(event_id)
 ) ORDER BY recorded_at,event_id),'[]'::jsonb),
 (SELECT jsonb_build_array(recorded_at,event_id) FROM shown ORDER BY recorded_at DESC,event_id DESC LIMIT 1)
 INTO v_count,v_rows,v_next FROM shown;
 PERFORM staff.require_http_authority(p_context,p_token,'AUDIT_READ');
 RETURN jsonb_build_object('events',v_rows,'nextPosition',CASE WHEN v_count>p_limit THEN v_next ELSE NULL END,'order','RECORDED_AT_ID_ASC');
END $$;
CREATE OR REPLACE FUNCTION staff.read_invitation_proof(p_context jsonb,p_token text,p_handle text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE p staff.invitation_proof%ROWTYPE;i staff.invitation%ROWTYPE;v_context jsonb;v_users uuid[];
BEGIN
 IF p_context IS NULL THEN RETURN NULL;END IF;
 -- Resolve namespace without row locks, then acquire sorted subjects before proof rows.
 SELECT ARRAY[x.user_id,s.user_id] INTO v_users FROM staff.invitation_proof x
 JOIN staff.invitation resolved_inv ON resolved_inv.invitation_id=x.invitation_id JOIN staff.subject s ON s.staff_id=resolved_inv.issuer_staff_id
 WHERE x.handle_sha256=p_handle;
 PERFORM identity.lock_security_subjects(v_users);
 IF identity.assert_session_current((p_context->>'targetUserId')::uuid,(p_context->>'ordinarySessionId')::uuid,p_token) IS DISTINCT FROM true THEN RETURN NULL;END IF;
 SELECT * INTO p FROM staff.invitation_proof WHERE handle_sha256=p_handle FOR SHARE;
 IF NOT FOUND OR p.consumed_at IS NOT NULL OR p.expires_at<=clock_timestamp() THEN RETURN NULL;END IF;
 SELECT * INTO i FROM staff.invitation WHERE invitation_id=p.invitation_id;
 v_context:=staff.read_invitation_context(p.user_id,p.ordinary_session_id,i.token_hash);
 IF v_context IS NULL OR (v_context-'expiresAt') IS DISTINCT FROM (p_context-'expiresAt')
 OR date_trunc('milliseconds',(v_context->>'expiresAt')::timestamptz) IS DISTINCT FROM date_trunc('milliseconds',(p_context->>'expiresAt')::timestamptz) OR p.issuer_security_epoch<>i.issuer_security_epoch
 OR p.target_account_security_epoch<>i.target_account_security_epoch OR p.invitation_revision<>i.revision THEN RETURN NULL;END IF;
 IF NOT EXISTS(SELECT 1 FROM identity.mfa_factor WHERE user_id=p.user_id AND credential_id=p.credential_id AND factor_type='passkey' AND state='active' AND verified_at IS NOT NULL AND user_verification_required AND NOT backup_eligible AND NOT backup_state) THEN RETURN NULL;END IF;
 IF identity.assert_session_current(p.user_id,p.ordinary_session_id,p_token) IS DISTINCT FROM true OR p.expires_at<=clock_timestamp() THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('proofId',p.proof_id,'purpose','INVITATION_ACCEPT','context',v_context,'credentialId',p.credential_id,'verifiedAt',p.verified_at,'expiresAt',p.expires_at);
END $$;
CREATE OR REPLACE FUNCTION staff.read_issued_invitation(p_context jsonb,p_token text,p_operation uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_result jsonb;
BEGIN
 PERFORM staff.require_http_authority(p_context,p_token,'TEAM_INVITE');
 SELECT jsonb_build_object('invitationId',invitation_id,'expiresAt',expires_at) INTO v_result
 FROM staff.invitation WHERE operation_id=p_operation AND issuer_staff_id=(p_context->>'staffId')::uuid;
 PERFORM staff.require_http_authority(p_context,p_token,'TEAM_INVITE');
 RETURN v_result;
END $$;
CREATE OR REPLACE FUNCTION staff.read_mutation_target(p_context jsonb,p_token text,p_staff uuid,p_capability text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_user uuid;
BEGIN
 IF p_capability NOT IN('TEAM_GRANT','TEAM_DISABLE','EMERGENCY_DISABLE') THEN RAISE EXCEPTION 'STAFF_AUTHORITY_INVALID';END IF;
 PERFORM staff.require_http_authority(p_context,p_token,p_capability);
 SELECT user_id INTO v_user FROM staff.subject WHERE staff_id=p_staff AND state='ACTIVE';
 IF v_user IS NULL OR identity.read_account_security_hold(v_user) THEN RETURN NULL;END IF;
 PERFORM staff.require_http_authority(p_context,p_token,p_capability);
 RETURN v_user;
END $$;
CREATE OR REPLACE FUNCTION staff.read_target_invitation_channel(p_outbox uuid,p_claim uuid,p_event uuid,p_operation uuid,p_target uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_result jsonb;v_issuer uuid;
BEGIN
 SELECT s.user_id INTO v_issuer FROM staff.invitation i JOIN staff.subject s ON s.staff_id=i.issuer_staff_id WHERE i.operation_id=p_operation;
 PERFORM identity.lock_security_subjects(ARRAY[p_target,v_issuer]);
 IF identity.read_account_security_hold(p_target) OR NOT EXISTS(SELECT 1 FROM identity."user" WHERE user_id=p_target AND state='active')
 OR EXISTS(SELECT 1 FROM identity.account_erasure_request WHERE user_id=p_target AND prepared_at IS NOT NULL) THEN RETURN NULL;END IF;
 IF NOT EXISTS(SELECT 1 FROM staff.alert_outbox o JOIN staff.alert_dispatch_state d USING(outbox_id) JOIN staff.audit_event a USING(event_id)
 JOIN identity."user" u ON u.audit_token=o.key_ref JOIN staff.invitation i ON i.operation_id=a.operation_id
 WHERE o.outbox_id=p_outbox AND d.claim_token=p_claim AND NOT d.terminal AND d.claimed_until>clock_timestamp()+interval '5 seconds'
 AND o.purpose='TARGET_INVITATION' AND o.event_id=p_event AND a.event_type='INVITE' AND a.operation_id=p_operation
 AND u.user_id=p_target AND i.target_user_id=p_target AND i.consumed_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>clock_timestamp()
 AND i.target_account_security_epoch=staff.account_epoch(p_target) AND staff.invitation_issuer_current(i.issuer_staff_id,i.issuer_security_epoch)) THEN RETURN NULL;END IF;
 IF (SELECT count(*) FROM identity.channel_binding WHERE user_id=p_target AND channel_type='email' AND state='verified')<>1 THEN RETURN NULL;END IF;
 SELECT jsonb_build_object('channelId',channel_binding_id,'addressCiphertext',address_ciphertext) INTO v_result
 FROM identity.channel_binding WHERE user_id=p_target AND channel_type='email' AND state='verified';
 RETURN v_result;
END $$;
-- Minimal additional channel columns for claim-bound transport only; no runtime grants added.
-- Historical ordinary runtime SELECT on identity.user/channel_binding remains unchanged.
GRANT SELECT(channel_binding_id,address_ciphertext) ON identity.channel_binding TO debateai_staff_security_owner;
DO $$DECLARE signature text;BEGIN
 FOR signature IN SELECT unnest(ARRAY[
 'staff.require_http_authority(jsonb,text,text)','staff.http_delivery_state(uuid)',
 'staff.read_enrollment(uuid,uuid,text)','staff.read_team_page(jsonb,text,integer,timestamptz,uuid)',
 'staff.read_audit_page(jsonb,text,integer,timestamptz,uuid)','staff.read_invitation_proof(jsonb,text,text)',
 'staff.read_issued_invitation(jsonb,text,uuid)','staff.read_mutation_target(jsonb,text,uuid,text)',
 'staff.read_target_invitation_channel(uuid,uuid,uuid,uuid,uuid)']) LOOP
  EXECUTE 'ALTER FUNCTION '||signature||' OWNER TO debateai_staff_security_owner';
  EXECUTE 'REVOKE ALL ON FUNCTION '||signature||' FROM PUBLIC,debateai_runtime,debateai_staff_recovery';
  IF signature NOT IN('staff.require_http_authority(jsonb,text,text)','staff.http_delivery_state(uuid)') THEN
   EXECUTE 'GRANT EXECUTE ON FUNCTION '||signature||' TO debateai_runtime';
  END IF;
 END LOOP;
END $$;
