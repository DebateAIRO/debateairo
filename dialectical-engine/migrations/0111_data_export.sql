-- Private, replay-safe account export queue. Function grants are closed below.
CREATE TABLE IF NOT EXISTS identity.data_export (
  export_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES identity."user"(user_id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  locale text NOT NULL CONSTRAINT data_export_locale_check CHECK (locale IN
    ('ar','bg','cs','da','de','el','en','es','et','fi','fr','ga','he','hi','hr','hu','id','it','ja','ko','lt','lv','mt','nl','pl','pt','ro','ru','sk','sl','sv','tr','uk','vi','zh')),
  status text NOT NULL CONSTRAINT data_export_status_check CHECK (status IN
    ('PREPARING','SENT','FAILED','SUPERSEDED','EXPIRED','CANCELLED')),
  requested_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CONSTRAINT data_export_attempts_check CHECK (attempts BETWEEN 0 AND 4),
  lease_owner uuid,
  lease_until timestamptz,
  link_token_hash text UNIQUE CONSTRAINT data_export_token_check CHECK (link_token_hash ~ '^sha256:[0-9a-f]{64}$'),
  archive_sha256 text CONSTRAINT data_export_sha_check CHECK (archive_sha256 ~ '^[0-9a-f]{64}$'),
  archive_bytes bigint,
  sent_at timestamptz,
  expires_at timestamptz,
  failed_at timestamptz,
  closed_at timestamptz,
  key_destroyed_at timestamptz,
  CONSTRAINT data_export_sent_check CHECK ((status='SENT') <=
    (link_token_hash IS NOT NULL AND archive_sha256 IS NOT NULL AND sent_at IS NOT NULL
      AND expires_at = sent_at + interval '86400 seconds'))
);
CREATE UNIQUE INDEX IF NOT EXISTS data_export_one_preparing ON identity.data_export(user_id) WHERE status='PREPARING';
REVOKE ALL ON identity.data_export FROM PUBLIC,debateai_runtime,debateai_billing_runtime,
  debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay;
SELECT core.install_truncate_guard('identity.data_export');

-- Preserve the final 0107 account-scoped grant class and append EXPORT_DATA.
ALTER TABLE identity.step_up_grant DROP CONSTRAINT IF EXISTS step_up_grant_action_check;
ALTER TABLE identity.step_up_grant ADD CONSTRAINT step_up_grant_action_check CHECK (
 (action IN ('PUBLISH','UNPUBLISH','DELETE_PRIVATE_DEBATE') AND target_run_id IS NOT NULL AND target_account_id IS NULL AND target_factor_id IS NULL AND target_provider IS NULL)
 OR (action IN ('DELETE_ACCOUNT','CHANGE_EMAIL','WITHDRAW_SUBSCRIPTION','READ_PHONE_PROFILE','CHANGE_PHONE_PROFILE','CHANGE_RECOVERY_EMAIL','ADD_PASSKEY','ADD_TOTP','REGENERATE_RECOVERY_CODES','EXPORT_DATA') AND target_run_id IS NULL AND target_account_id IS NOT NULL AND target_account_id=user_id AND target_factor_id IS NULL AND target_provider IS NULL)
 OR (action='REMOVE_AUTH_METHOD' AND target_run_id IS NULL AND target_account_id=user_id AND target_factor_id IS NOT NULL AND target_provider IS NULL)
 OR (action IN ('LINK_PROVIDER','UNLINK_PROVIDER') AND target_run_id IS NULL AND target_account_id=user_id AND target_factor_id IS NULL AND target_provider IN ('google','apple','facebook','x')));

CREATE OR REPLACE FUNCTION identity.rotate_session_after_step_up(
  p_user_id uuid,p_owner_ref uuid,p_password_hash text,p_factor_id uuid,p_accepted_step bigint,
  p_session_id uuid,p_current_token_hash text,p_replacement_token_hash text,p_replacement_csrf_hash text,
  p_binding_context jsonb,p_idle_expires_at timestamptz,p_grant_id uuid,p_grant_token_hash text,
  p_grant_action text,p_grant_target_run_id uuid,p_grant_expires_at timestamptz
) RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_account record;
  v_actor_token uuid;
  v_previous_step bigint;
  v_absolute_expires_at timestamptz;
  v_has_grant boolean := p_grant_id IS NOT NULL;
BEGIN
  IF jsonb_typeof(p_binding_context)<>'object'
    OR p_accepted_step<0 OR p_idle_expires_at<=v_now
    OR (v_has_grant IS DISTINCT FROM (
      p_grant_token_hash IS NOT NULL AND p_grant_action IS NOT NULL AND p_grant_expires_at IS NOT NULL
      AND ((p_grant_action IN ('DELETE_ACCOUNT','CHANGE_EMAIL','READ_PHONE_PROFILE','CHANGE_PHONE_PROFILE','CHANGE_RECOVERY_EMAIL','ADD_PASSKEY','ADD_TOTP','WITHDRAW_SUBSCRIPTION','EXPORT_DATA') AND p_grant_target_run_id IS NULL)
        OR (p_grant_action NOT IN ('DELETE_ACCOUNT','CHANGE_EMAIL','READ_PHONE_PROFILE','CHANGE_PHONE_PROFILE','CHANGE_RECOVERY_EMAIL','ADD_PASSKEY','ADD_TOTP','WITHDRAW_SUBSCRIPTION','EXPORT_DATA') AND p_grant_target_run_id IS NOT NULL))))
    OR (v_has_grant AND (
      p_grant_action NOT IN ('PUBLISH','UNPUBLISH','DELETE_PRIVATE_DEBATE','DELETE_ACCOUNT','CHANGE_EMAIL','READ_PHONE_PROFILE','CHANGE_PHONE_PROFILE','CHANGE_RECOVERY_EMAIL','ADD_PASSKEY','ADD_TOTP','WITHDRAW_SUBSCRIPTION','EXPORT_DATA')
      OR p_grant_expires_at<=v_now OR p_grant_expires_at>v_now+interval '5 minutes')) THEN RETURN NULL; END IF;
  SELECT * INTO v_account FROM identity.lock_account_t9_internal(p_user_id,true);
  IF v_account.owner_ref IS DISTINCT FROM p_owner_ref OR v_account.password_hash IS DISTINCT FROM p_password_hash THEN RETURN NULL; END IF;
  v_actor_token := v_account.audit_token;
  SELECT factor.last_accepted_step INTO v_previous_step FROM identity.mfa_factor AS factor
    WHERE factor.mfa_factor_id=p_factor_id AND factor.user_id=p_user_id AND factor.factor_type='totp' AND factor.state='active' FOR UPDATE;
  IF NOT FOUND OR (v_previous_step IS NOT NULL AND p_accepted_step<=v_previous_step) THEN RETURN NULL; END IF;
  SELECT LEAST(session.absolute_expires_at,session.created_at+interval '720 hours') INTO v_absolute_expires_at
    FROM identity.session AS session WHERE session.session_id=p_session_id AND session.user_id=p_user_id
      AND session.token_hash=p_current_token_hash AND session.revoked_at IS NULL AND session.idle_expires_at>v_now
      AND LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')>GREATEST(v_now,clock_timestamp()) FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_now:=clock_timestamp();
  IF identity.assert_session_current(p_user_id,p_session_id,p_current_token_hash) IS DISTINCT FROM true
    OR p_idle_expires_at<=v_now OR (v_has_grant AND p_grant_expires_at<=v_now) THEN RETURN NULL; END IF;
  UPDATE identity.mfa_factor SET last_accepted_step=p_accepted_step WHERE mfa_factor_id=p_factor_id;
  UPDATE identity.session SET token_hash=p_replacement_token_hash,csrf_token_hash=p_replacement_csrf_hash,
    binding_context=p_binding_context,last_mfa_at=v_now,last_seen_at=v_now,
    idle_expires_at=LEAST(v_absolute_expires_at,p_idle_expires_at) WHERE session_id=p_session_id;
  IF v_has_grant THEN
    INSERT INTO identity.step_up_grant(step_up_grant_id,token_hash,session_id,user_id,action,target_run_id,target_account_id,issued_at,expires_at,consumed_at)
    VALUES(p_grant_id,p_grant_token_hash,p_session_id,p_user_id,p_grant_action,p_grant_target_run_id,
      CASE WHEN p_grant_action IN ('DELETE_ACCOUNT','CHANGE_EMAIL','READ_PHONE_PROFILE','CHANGE_PHONE_PROFILE','CHANGE_RECOVERY_EMAIL','ADD_PASSKEY','ADD_TOTP','WITHDRAW_SUBSCRIPTION','EXPORT_DATA') THEN p_user_id ELSE NULL END,
      v_now,p_grant_expires_at,NULL);
  END IF;
  RETURN v_actor_token;
END;
$$;

CREATE OR REPLACE FUNCTION identity.request_data_export(
  p_user_id uuid,p_session_id uuid,p_grant_token_hash text,p_export_id uuid,p_locale text,p_source_context jsonb
) RETURNS TABLE(result_status text,result_requested_at timestamptz,result_retry_after_seconds integer)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_now timestamptz := clock_timestamp(); v_account record; v_grant uuid; v_oldest timestamptz;
BEGIN
  PERFORM identity.consume_runtime_audit_attempt();
  SELECT * INTO v_account FROM identity.lock_account_t9_internal(p_user_id,true);
  SELECT g.step_up_grant_id INTO v_grant FROM identity.step_up_grant g
    WHERE g.token_hash=p_grant_token_hash AND g.user_id=p_user_id AND g.session_id=p_session_id
      AND g.action='EXPORT_DATA' AND g.target_run_id IS NULL AND g.target_account_id=p_user_id
      AND g.consumed_at IS NULL AND g.expires_at>v_now FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'STEP_UP_INVALID'::text,NULL::timestamptz,NULL::integer; RETURN; END IF;
  UPDATE identity.step_up_grant SET consumed_at=v_now WHERE step_up_grant_id=v_grant;
  IF NOT EXISTS(SELECT 1 FROM identity.channel_binding c WHERE c.user_id=p_user_id AND c.channel_type='email'
      AND c.state='verified' AND c.verified_at IS NOT NULL) THEN
    RETURN QUERY SELECT 'EMAIL_REQUIRED'::text,NULL::timestamptz,NULL::integer; RETURN;
  END IF;
  IF EXISTS(SELECT 1 FROM identity.account_erasure_request e WHERE e.user_id=p_user_id
      AND e.prepared_at IS NOT NULL AND e.cancelled_at IS NULL) THEN
    RETURN QUERY SELECT 'ERASING'::text,NULL::timestamptz,NULL::integer; RETURN;
  END IF;
  IF identity.read_account_security_hold(p_user_id) THEN
    RETURN QUERY SELECT 'HELD'::text,NULL::timestamptz,NULL::integer; RETURN;
  END IF;
  IF EXISTS(SELECT 1 FROM identity.data_export e WHERE e.user_id=p_user_id AND e.status='PREPARING') THEN
    RETURN QUERY SELECT 'IN_PROGRESS'::text,NULL::timestamptz,NULL::integer; RETURN;
  END IF;
  SELECT min(e.requested_at) INTO v_oldest FROM identity.data_export e WHERE e.user_id=p_user_id
    AND e.status<>'FAILED' AND e.requested_at>v_now-interval '86400 seconds';
  IF (SELECT count(*) FROM identity.data_export e WHERE e.user_id=p_user_id
      AND e.status<>'FAILED' AND e.requested_at>v_now-interval '86400 seconds')>=3 THEN
    RETURN QUERY SELECT 'RATE_LIMITED'::text,NULL::timestamptz,
      ceil(extract(epoch FROM v_oldest+interval '86400 seconds'-v_now))::integer; RETURN;
  END IF;
  UPDATE identity.data_export e SET status='SUPERSEDED',closed_at=v_now WHERE e.user_id=p_user_id AND e.status='SENT';
  INSERT INTO identity.data_export(export_id,user_id,session_id,locale,status,requested_at)
    VALUES(p_export_id,p_user_id,p_session_id,p_locale,'PREPARING',v_now);
  PERFORM identity.append_audit_event_internal(gen_random_uuid(),v_account.audit_token::text,
    'identity.data_export.requested','data_export',p_export_id::text,v_now,p_source_context,'ALLOW',true,NULL);
  RETURN QUERY SELECT 'ACCEPTED'::text,v_now,NULL::integer;
END;
$$;

CREATE OR REPLACE FUNCTION identity.read_data_export_status(p_user_id uuid)
RETURNS TABLE(status text,requested_at timestamptz,expires_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_row record;
BEGIN
  SELECT e.status,e.requested_at,e.expires_at INTO v_row FROM identity.data_export e
    WHERE e.user_id=p_user_id AND ((e.status IN ('PREPARING','SENT') AND (e.status<>'SENT' OR e.expires_at>clock_timestamp()))
      OR (e.status='FAILED' AND e.failed_at>clock_timestamp()-interval '86400 seconds'))
    ORDER BY e.requested_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN QUERY SELECT 'NONE'::text,NULL::timestamptz,NULL::timestamptz; RETURN; END IF;
  RETURN QUERY SELECT v_row.status::text,v_row.requested_at::timestamptz,v_row.expires_at::timestamptz;
END;
$$;

CREATE OR REPLACE FUNCTION identity.claim_data_export(p_worker uuid,p_lease_seconds integer)
RETURNS TABLE(export_id uuid,user_id uuid,session_id uuid,owner_ref uuid,locale text,requested_at timestamptz,attempt integer)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF p_lease_seconds<1 OR p_lease_seconds>3600 THEN RAISE EXCEPTION 'DATA_EXPORT_LEASE_INVALID'; END IF;
  RETURN QUERY WITH chosen AS (
    SELECT e.export_id FROM identity.data_export e WHERE e.status='PREPARING'
      AND (e.lease_until IS NULL OR e.lease_until<=clock_timestamp()) AND e.attempts<4
    ORDER BY e.requested_at,e.export_id FOR UPDATE SKIP LOCKED LIMIT 1
  ), updated AS (
    UPDATE identity.data_export e SET lease_owner=p_worker,lease_until=clock_timestamp()+make_interval(secs=>p_lease_seconds),attempts=e.attempts+1
    FROM chosen WHERE e.export_id=chosen.export_id RETURNING e.*
  ) SELECT e.export_id,e.user_id,e.session_id,u.owner_ref,e.locale,e.requested_at,e.attempts FROM updated e JOIN identity."user" u ON u.user_id=e.user_id;
END;
$$;

CREATE OR REPLACE FUNCTION identity.renew_data_export_lease(p_export_id uuid,p_worker uuid,p_lease_seconds integer)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF p_lease_seconds<1 OR p_lease_seconds>3600 THEN RETURN false; END IF;
  UPDATE identity.data_export SET lease_until=clock_timestamp()+make_interval(secs=>p_lease_seconds)
    WHERE export_id=p_export_id AND lease_owner=p_worker AND lease_until>clock_timestamp() AND status='PREPARING'
      AND NOT EXISTS(SELECT 1 FROM identity.account_erasure_request r
        WHERE r.user_id=identity.data_export.user_id AND r.prepared_at IS NOT NULL AND r.cancelled_at IS NULL);
  RETURN FOUND;
END;
$$;


CREATE OR REPLACE FUNCTION identity.read_data_export_snapshot(p_export_id uuid,p_worker uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_user uuid; v_owner uuid; v_audit text;
BEGIN
  SELECT e.user_id,u.owner_ref,u.audit_token::text INTO v_user,v_owner,v_audit
  FROM identity.data_export e JOIN identity."user" u ON u.user_id=e.user_id
  WHERE e.export_id=p_export_id AND e.status='PREPARING' AND e.lease_owner=p_worker AND e.lease_until>clock_timestamp();
  IF NOT FOUND THEN RAISE EXCEPTION 'DATA_EXPORT_LEASE_INVALID'; END IF;
  RETURN jsonb_build_object(
    'user',(SELECT jsonb_build_object('pseudonym',r.pseudonym,'email_ciphertext',r.email_ciphertext,'recovery_email_ciphertext',r.recovery_email_ciphertext,'phone_ciphertext',r.phone_ciphertext,'phone_source',r.phone_source,'phone_verification_status',r.phone_verification_status,'state',r.state,'created_at',r.created_at,'adult_affirmed_at',r.adult_affirmed_at) FROM identity."user" r WHERE r.user_id=v_user LIMIT 1),
    'channels',COALESCE((SELECT jsonb_agg(jsonb_build_object('channel_type',r.channel_type,'address_ciphertext',r.address_ciphertext,'state',r.state,'verified_at',r.verified_at) ORDER BY r.verified_at,to_jsonb(r)) FROM identity.channel_binding r WHERE r.user_id=v_user),'[]'::jsonb),
    'registration_region',(SELECT jsonb_build_object('country_code',r.country_code,'us_state',r.us_state) FROM identity.registration_region r WHERE r.user_id=v_user LIMIT 1),
    'age_checks',COALESCE((SELECT jsonb_agg(jsonb_build_object('outcome',r.outcome,'min_age_applied',r.min_age_applied,'rule_version',r.rule_version,'context',r.context,'checked_at',r.checked_at,'country_code',r.country_code) ORDER BY r.checked_at,to_jsonb(r)) FROM identity.age_check r WHERE r.user_id=v_user),'[]'::jsonb),
    'erasure_requests',COALESCE((SELECT jsonb_agg(jsonb_build_object('requested_at',r.requested_at,'execute_at',r.execute_at,'status',CASE WHEN r.cancelled_at IS NOT NULL THEN 'CANCELLED' WHEN r.prepared_at IS NOT NULL THEN 'PROCESSING' WHEN r.execute_at<=clock_timestamp() THEN 'DUE' ELSE 'SCHEDULED' END) ORDER BY r.requested_at,to_jsonb(r)) FROM identity.account_erasure_request r WHERE r.user_id=v_user),'[]'::jsonb),
    'mfa_factors',COALESCE((SELECT jsonb_agg(jsonb_build_object('factor_type',r.factor_type,'state',r.state,'created_at',r.created_at,'verified_at',r.verified_at,'revoked_at',r.revoked_at,'last_accepted_step',r.last_accepted_step) ORDER BY r.created_at,to_jsonb(r)) FROM identity.mfa_factor r WHERE r.user_id=v_user),'[]'::jsonb),
    'passkey_credentials',COALESCE((SELECT jsonb_agg(jsonb_build_object('label',r.label,'device_type',r.device_type,'transports',r.transports,'created_at',r.created_at,'last_used_at',r.last_used_at) ORDER BY r.created_at,to_jsonb(r)) FROM identity.consumer_passkey_credential r WHERE r.user_id=v_user),'[]'::jsonb),
    'recovery_codes',(SELECT jsonb_build_object('unused_count',count(*) FILTER(WHERE consumed_at IS NULL AND revoked_at IS NULL),'generated_at',max(created_at) FILTER(WHERE revoked_at IS NULL)) FROM identity.recovery_code r WHERE r.user_id=v_user),
    'sessions',COALESCE((SELECT jsonb_agg(jsonb_build_object('created_at',r.created_at,'last_seen_at',r.last_seen_at,'idle_expires_at',r.idle_expires_at,'absolute_expires_at',r.absolute_expires_at,'last_mfa_at',r.last_mfa_at,'revoked_at',r.revoked_at) ORDER BY r.created_at,to_jsonb(r)) FROM identity.session r WHERE r.user_id=v_user),'[]'::jsonb),
    'social_identities',COALESCE((SELECT jsonb_agg(jsonb_build_object('provider',r.provider,'issuer',r.issuer,'subject',r.subject,'created_at',r.created_at,'revoked_at',r.revoked_at) ORDER BY r.created_at,to_jsonb(r)) FROM identity.social_identity r WHERE r.user_id=v_user),'[]'::jsonb),
    'email_change_requests',COALESCE((SELECT jsonb_agg(jsonb_build_object('issued_at',r.issued_at,'new_email_ciphertext',r.new_email_ciphertext,'outcome',r.outcome,'closed_at',r.closed_at) ORDER BY r.issued_at,to_jsonb(r)) FROM identity.email_change_request r WHERE r.user_id=v_user),'[]'::jsonb),
    'recovery_email_requests',COALESCE((SELECT jsonb_agg(jsonb_build_object('issued_at',r.issued_at,'candidate_ciphertext',r.candidate_ciphertext,'outcome',r.outcome,'closed_at',r.closed_at) ORDER BY r.issued_at,to_jsonb(r)) FROM identity.recovery_email_request r WHERE r.user_id=v_user),'[]'::jsonb),
    'recovery_requests',COALESCE((SELECT jsonb_agg(jsonb_build_object('kind',q.kind,'at',q.at,'state',q.state) ORDER BY q.at,to_jsonb(q)) FROM (
      SELECT 'account_recovery'::text kind,r.requested_at at,
        (SELECT e.state::text FROM identity.account_recovery_state_event e
          WHERE e.recovery_request_id=r.recovery_request_id ORDER BY e.event_sequence DESC LIMIT 1) state
        FROM identity.account_recovery_request r JOIN identity.account_recovery_binding b
          ON b.recovery_request_id=r.recovery_request_id WHERE b.user_id=v_user
      UNION ALL SELECT 'consumer_security:'||r.purpose,r.created_at,
        CASE WHEN r.consumed_at IS NOT NULL THEN 'CONSUMED' WHEN r.expires_at<=clock_timestamp() THEN 'EXPIRED' ELSE 'OPEN' END
        FROM identity.consumer_security_challenge r WHERE r.user_id=v_user
      UNION ALL SELECT 'consumer_recovery_gate:'||r.method,r.cap_issued_at,
        CASE WHEN r.active THEN 'ACTIVE' ELSE 'INACTIVE' END FROM identity.consumer_recovery_gate r WHERE r.user_id=v_user
      UNION ALL SELECT 'consumer_recovery_token',r.issued_at,
        CASE WHEN r.consumed_at IS NOT NULL THEN 'CONSUMED' WHEN r.expires_at<=clock_timestamp() THEN 'EXPIRED' ELSE 'OPEN' END
        FROM identity.consumer_recovery_token r WHERE r.user_id=v_user
      UNION ALL SELECT 'consumer_recovery_reservation',r.reserved_at,'RESERVED' FROM identity.consumer_recovery_reservation r WHERE r.user_id=v_user
      UNION ALL SELECT 'consumer_recovery_enrollment:'||r.method,r.created_at,'ENROLLING' FROM identity.consumer_recovery_enrollment r WHERE r.user_id=v_user
      UNION ALL SELECT 'password_recovery_control',r.expires_at,r.stage::text FROM identity.password_recovery_control r WHERE r.user_id=v_user
      UNION ALL SELECT 'password_reset_control',r.expires_at,r.stage::text FROM identity.password_reset_control r WHERE r.user_id=v_user
      UNION ALL SELECT 'backup_email_control',r.expires_at,r.stage::text FROM identity.backup_email_control r WHERE r.user_id=v_user
      UNION ALL SELECT 'mfa_recovery_control',r.expires_at,r.stage::text FROM identity.mfa_recovery_control r WHERE r.user_id=v_user
      UNION ALL SELECT 'password_recovery_retry_lock',r.locked_until,'LOCKED' FROM identity.password_recovery_retry_lock r WHERE r.user_id=v_user
      UNION ALL SELECT 'password_recovery:'||r.event_kind,r.occurred_at,r.event_kind::text FROM identity.password_recovery_feed r WHERE r.user_id=v_user
      UNION ALL SELECT 'mfa_recovery_legacy_cohort',r.recorded_at,'LEGACY_COHORT' FROM identity.mfa_recovery_legacy_cohort r WHERE r.user_id=v_user
    ) q),'[]'::jsonb),
    'runs',COALESCE((SELECT jsonb_agg(jsonb_build_object('run_id',r.run_id,'as_of',r.as_of,'composition_budget_tier',r.composition_budget_tier,'depth_params',r.depth_params,'plan_tier',r.plan_tier) ORDER BY r.as_of,to_jsonb(r)) FROM core.run r WHERE EXISTS(SELECT 1 FROM core.run_ownership_event oe WHERE oe.run_id=r.run_id AND oe.at_seq=(SELECT max(last.at_seq) FROM core.run_ownership_event last WHERE last.run_id=r.run_id) AND oe.owner_ref=v_owner)),'[]'::jsonb),
    'erasure_tombstones',COALESCE((SELECT jsonb_agg(jsonb_build_object('run_id',r.run_id,'completed_at',r.completed_at) ORDER BY r.completed_at,to_jsonb(r)) FROM serve.private_run_erasure_tombstone r WHERE r.run_id IN (SELECT run_id FROM core.run_ownership_event oe WHERE oe.owner_ref=v_owner AND oe.at_seq=(SELECT max(last.at_seq) FROM core.run_ownership_event last WHERE last.run_id=oe.run_id))),'[]'::jsonb),
    'visibility_events',COALESCE((SELECT jsonb_agg(jsonb_build_object('run_id',r.run_id,'state',r.state,'occurred_at',r.occurred_at) ORDER BY r.at_seq,to_jsonb(r)) FROM core.run_visibility_event r WHERE r.run_id IN (SELECT run_id FROM core.run_ownership_event oe WHERE oe.owner_ref=v_owner AND oe.at_seq=(SELECT max(last.at_seq) FROM core.run_ownership_event last WHERE last.run_id=oe.run_id))),'[]'::jsonb),
    'legal_acceptances',COALESCE((SELECT jsonb_agg(jsonb_build_object('acceptance_id',r.acceptance_id,'kind',r.kind,'document_version',r.document_version,'document_sha256',r.document_sha256,'locale',r.locale,'surface',r.surface,'accepted_at',r.accepted_at,'evidence_ciphertext',encode(r.evidence_ciphertext,'base64')) ORDER BY r.accepted_at,to_jsonb(r)) FROM legal.acceptance r WHERE r.owner_ref=v_owner),'[]'::jsonb),
    'sensitive_data_consents',COALESCE((SELECT jsonb_agg(jsonb_build_object('notice_version',r.notice_version,'locale',r.locale,'consented_at',r.consented_at) ORDER BY r.consented_at,to_jsonb(r)) FROM identity.sensitive_data_consent r WHERE r.user_id=v_user),'[]'::jsonb),
    'billing',jsonb_build_object('customers',COALESCE((SELECT jsonb_agg(jsonb_build_object('customer_id',r.customer_id,'created_at',r.created_at,'created_locale',r.created_locale) ORDER BY r.created_at,to_jsonb(r)) FROM billing.customer r WHERE r.owner_ref=v_owner),'[]'::jsonb),
    'customer_xmoney',COALESCE((SELECT jsonb_agg(jsonb_build_object('customer_id',r.customer_id,'environment',r.environment,'xmoney_customer_id',r.xmoney_customer_id,'at',r.at) ORDER BY r.at,to_jsonb(r)) FROM billing.customer_xmoney r WHERE r.customer_id IN (SELECT customer_id FROM billing.customer WHERE owner_ref=v_owner)),'[]'::jsonb),
    'customer_profile_events',COALESCE((SELECT jsonb_agg(jsonb_build_object('customer_id',r.customer_id,'at',r.at,'locale',r.locale,'profile_ciphertext',encode(r.profile_ciphertext,'base64')) ORDER BY r.at,to_jsonb(r)) FROM billing.customer_profile_event r WHERE r.customer_id IN (SELECT customer_id FROM billing.customer WHERE owner_ref=v_owner)),'[]'::jsonb),
    'quotes',COALESCE((SELECT jsonb_agg(jsonb_build_object('quote_id',r.quote_id,'plan_id',r.plan_id,'kind',r.kind,'net_micros',r.net_micros,'tax_micros',r.tax_micros,'total_micros',r.total_micros,'tax_country',r.tax_country,'tax_region',r.tax_region,'tax_rate_bp',r.tax_rate_bp,'tax_status',r.tax_status,'tax_name',r.tax_name,'quaderno_ref',r.quaderno_ref,'created_at',r.created_at,'expires_at',r.expires_at,'location_ciphertext',encode(r.location_ciphertext,'base64'),'recurring_total_micros',r.recurring_total_micros) ORDER BY r.created_at,to_jsonb(r)) FROM billing.quote r WHERE r.owner_ref=v_owner),'[]'::jsonb),
    'subscription_events',COALESCE((SELECT jsonb_agg(jsonb_build_object('kind',r.kind,'at',r.at,'plan_id',r.plan_id,'period_anchor_at',r.period_anchor_at,'xmoney_order_id',r.xmoney_order_id,'xmoney_customer_id',r.xmoney_customer_id,'card_ref',r.card_ref,'data',r.data) ORDER BY r.at,to_jsonb(r)) FROM billing.subscription_event r WHERE r.owner_ref=v_owner),'[]'::jsonb),
    'entitlement_events',COALESCE((SELECT jsonb_agg(jsonb_build_object('plan_id',r.plan_id,'effective_at',r.effective_at,'period_anchor_at',r.period_anchor_at,'cause',r.cause,'month_credit_override_micros',r.month_credit_override_micros,'paid_through',r.paid_through,'recorded_at',r.recorded_at) ORDER BY r.effective_at,to_jsonb(r)) FROM billing.entitlement_event r WHERE r.owner_ref=v_owner),'[]'::jsonb),
    'run_charge_scopes',COALESCE((SELECT jsonb_agg(jsonb_build_object('run_id',r.run_id,'plan_id',r.plan_id,'admitted_at',r.admitted_at,'recorded_at',r.recorded_at,'funding_kind',r.funding_kind) ORDER BY r.admitted_at,to_jsonb(r)) FROM billing.run_charge_scope r WHERE r.owner_ref=v_owner),'[]'::jsonb),
    'charges',COALESCE((SELECT jsonb_agg(jsonb_build_object('charge_id',r.charge_id,'kind',r.kind,'attempt',r.attempt,'period_start',r.period_start,'period_end',r.period_end,'net_micros',r.net_micros,'tax_micros',r.tax_micros,'total_micros',r.total_micros,'currency',r.currency,'created_at',r.created_at,'xmoney_environment',r.xmoney_environment) ORDER BY r.created_at,to_jsonb(r)) FROM billing.charge r WHERE r.owner_ref=v_owner),'[]'::jsonb),
    'internal_grants',COALESCE((SELECT jsonb_agg(jsonb_build_object('revision',r.revision,'amount_micros',r.amount_micros,'day_micros',r.day_micros,'week_micros',r.week_micros,'starts_at',r.starts_at,'expires_at',r.expires_at,'funding_approval_ref',r.funding_approval_ref,'policy_register_version',r.policy_register_version,'revoked_at',r.revoked_at,'created_at',r.created_at) ORDER BY r.created_at,to_jsonb(r)) FROM billing.internal_grant r WHERE r.owner_ref=v_owner),'[]'::jsonb),
    'withdrawal_owner_settlements',COALESCE((SELECT jsonb_agg(jsonb_build_object('dashboard_refund_micros',r.dashboard_refund_micros,'settled_at',r.settled_at) ORDER BY r.settled_at,to_jsonb(r)) FROM billing.withdrawal_owner_settlement r WHERE r.owner_ref=v_owner),'[]'::jsonb),
    'charge_events',COALESCE((SELECT jsonb_agg(jsonb_build_object('charge_id',r.charge_id,'kind',r.kind,'at',r.at,'xmoney_environment',r.xmoney_environment,'xmoney_transaction_id',r.xmoney_transaction_id,'refunds_transaction_id',r.refunds_transaction_id,'amount_micros',r.amount_micros,'error_code',r.error_code,'xmoney_created_at',r.xmoney_created_at) ORDER BY r.at,to_jsonb(r)) FROM billing.charge_event r WHERE r.charge_id IN (SELECT charge_id FROM billing.charge WHERE owner_ref=v_owner)),'[]'::jsonb),
    'quote_uses',COALESCE((SELECT jsonb_agg(jsonb_build_object('used_at',r.used_at,'charge_id',r.charge_id) ORDER BY r.used_at,to_jsonb(r)) FROM billing.quote_use r WHERE r.charge_id IN (SELECT charge_id FROM billing.charge WHERE owner_ref=v_owner)),'[]'::jsonb),
    'invoice_intents',COALESCE((SELECT jsonb_agg(jsonb_build_object('charge_id',r.charge_id,'kind',r.kind,'issuer',r.issuer,'requested_at',r.requested_at) ORDER BY r.requested_at,to_jsonb(r)) FROM billing.invoice_intent r WHERE r.charge_id IN (SELECT charge_id FROM billing.charge WHERE owner_ref=v_owner)),'[]'::jsonb),
    'invoices',COALESCE((SELECT jsonb_agg(jsonb_build_object('charge_id',r.charge_id,'kind',r.kind,'issuer',r.issuer,'external_ref',r.external_ref,'series',r.series,'number',r.number,'url',r.url,'total_micros',r.total_micros,'at',r.at) ORDER BY r.at,to_jsonb(r)) FROM billing.invoice r WHERE r.charge_id IN (SELECT charge_id FROM billing.charge WHERE owner_ref=v_owner)),'[]'::jsonb),
    'location_evidence',COALESCE((SELECT jsonb_agg(jsonb_build_object('charge_id',r.charge_id,'ip_country',r.ip_country,'declared_country',r.declared_country,'card_country',r.card_country,'verdict',r.verdict,'ip_ciphertext',encode(r.ip_ciphertext,'base64'),'at',r.at) ORDER BY r.at,to_jsonb(r)) FROM billing.location_evidence r WHERE r.charge_id IN (SELECT charge_id FROM billing.charge WHERE owner_ref=v_owner)),'[]'::jsonb)),
    'support_sessions',COALESCE((SELECT jsonb_agg(jsonb_build_object('session_id',r.session_id,'language',r.language,'state',r.state,'created_at',r.created_at,'consent_own_context_at',r.consent_own_context_at,'shredded_at',r.shredded_at) ORDER BY r.created_at,to_jsonb(r)) FROM support.session r WHERE r.identity_owner_ref=v_owner),'[]'::jsonb),
    'support_messages',COALESCE((SELECT jsonb_agg(jsonb_build_object('message_id',r.message_id,'session_id',r.session_id,'role',r.role,'content_ciphertext',encode(r.content_ciphertext,'base64'),'outcome',r.outcome,'received_at',r.received_at,'first_token_at',r.first_token_at,'completed_at',r.completed_at,'rating',r.rating) ORDER BY r.received_at,to_jsonb(r)) FROM support.message r WHERE r.session_id IN (SELECT session_id FROM support.session WHERE identity_owner_ref=v_owner)),'[]'::jsonb),
    'support_cases',COALESCE((SELECT jsonb_agg(jsonb_build_object('case_id',r.case_id,'session_id',r.session_id,'language',r.language,'created_at',r.created_at,'state',r.state,'summary_at',r.summary_at,'shredded_at',r.shredded_at,'transcript_snapshot_ciphertext',encode(r.transcript_snapshot_ciphertext,'base64'),'summary_ciphertext',encode(r.summary_ciphertext,'base64')) ORDER BY r.created_at,to_jsonb(r)) FROM support."case" r WHERE r.identity_owner_ref=v_owner),'[]'::jsonb),
    'support_case_events',COALESCE((SELECT jsonb_agg(jsonb_build_object('case_id',r.case_id,'from_state',r.from_state,'to_state',r.to_state,'at',r.at) ORDER BY r.at,to_jsonb(r)) FROM support.case_event r WHERE r.case_id IN (SELECT case_id FROM support."case" WHERE identity_owner_ref=v_owner)),'[]'::jsonb),
    'support_case_messages',COALESCE((SELECT jsonb_agg(jsonb_build_object('case_message_id',r.case_message_id,'case_id',r.case_id,'role',r.role,'content_ciphertext',encode(r.content_ciphertext,'base64'),'at',r.at) ORDER BY r.at,to_jsonb(r)) FROM support.case_message r WHERE r.case_id IN (SELECT case_id FROM support."case" WHERE identity_owner_ref=v_owner)),'[]'::jsonb),
    'support_ratings',COALESCE((SELECT jsonb_agg(jsonb_build_object('message_id',r.message_id,'rating',r.rating,'at',r.at) ORDER BY r.at,to_jsonb(r)) FROM support.rating r WHERE r.session_id IN (SELECT session_id FROM support.session WHERE identity_owner_ref=v_owner)),'[]'::jsonb),
    'support_key_states',COALESCE((SELECT jsonb_agg(jsonb_build_object('kind',k.kind,'ref',k.ref,'wrapped_key',encode(k.wrapped_key,'base64'),'destroyed_at',k.destroyed_at) ORDER BY k.kind,k.ref) FROM (SELECT 'session'::text kind,s.session_id::text ref,s.wrapped_key,s.destroyed_at FROM support.session_key s WHERE s.session_id IN (SELECT session_id FROM support.session WHERE identity_owner_ref=v_owner) UNION ALL SELECT 'case'::text,c.case_id::text,c.wrapped_key,c.destroyed_at FROM support.case_key c WHERE c.case_id IN (SELECT case_id FROM support."case" WHERE identity_owner_ref=v_owner)) k),'[]'::jsonb),
    'audit_events',COALESCE((SELECT jsonb_agg(jsonb_build_object('event_type',r.event_type,'occurred_at',r.occurred_at) ORDER BY r.occurred_at,to_jsonb(r)) FROM identity.audit_event r WHERE r.actor_key_ref=v_audit),'[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION identity.complete_data_export(
  p_export_id uuid,p_worker uuid,p_link_token_hash text,p_archive_sha256 text,p_archive_bytes bigint,p_sent_at timestamptz
) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_user uuid; v_actor text;
BEGIN
  PERFORM identity.begin_runtime_audit_attempt();
  PERFORM identity.consume_runtime_audit_attempt();
  UPDATE identity.data_export e SET status='SENT',link_token_hash=p_link_token_hash,
    archive_sha256=p_archive_sha256,archive_bytes=p_archive_bytes,sent_at=p_sent_at,
    expires_at=p_sent_at+interval '86400 seconds',lease_owner=NULL,lease_until=NULL
    WHERE e.export_id=p_export_id AND e.lease_owner=p_worker AND e.lease_until>clock_timestamp()
      AND e.status='PREPARING' AND NOT EXISTS(SELECT 1 FROM identity.account_erasure_request r
        WHERE r.user_id=e.user_id AND r.prepared_at IS NOT NULL AND r.cancelled_at IS NULL)
    RETURNING e.user_id INTO v_user;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT audit_token::text INTO v_actor FROM identity."user" WHERE user_id=v_user;
  PERFORM identity.append_audit_event_internal(gen_random_uuid(),v_actor,'identity.data_export.delivered',
    'data_export',p_export_id::text,p_sent_at,'{"schema":"data-export-worker-v1"}'::jsonb,'ALLOW',true,NULL);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION identity.fail_data_export(p_export_id uuid,p_worker uuid,p_reason text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_user uuid; v_actor text; v_now timestamptz := clock_timestamp();
BEGIN
  PERFORM identity.begin_runtime_audit_attempt();
  PERFORM identity.consume_runtime_audit_attempt();
  UPDATE identity.data_export e SET status='FAILED',failed_at=v_now,closed_at=v_now,lease_owner=NULL,lease_until=NULL
    WHERE e.export_id=p_export_id AND e.lease_owner=p_worker AND e.status='PREPARING' RETURNING e.user_id INTO v_user;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT audit_token::text INTO v_actor FROM identity."user" WHERE user_id=v_user;
  PERFORM identity.append_audit_event_internal(gen_random_uuid(),v_actor,'identity.data_export.failed',
    'data_export',p_export_id::text,v_now,'{"schema":"data-export-worker-v1"}'::jsonb,'DENY',false,p_reason);
END;
$$;

CREATE OR REPLACE FUNCTION identity.sweep_data_exports()
RETURNS TABLE(export_id uuid,user_id uuid) LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  UPDATE identity.data_export e SET status='FAILED',failed_at=clock_timestamp(),closed_at=clock_timestamp(),lease_owner=NULL,lease_until=NULL
    WHERE e.status='PREPARING' AND e.attempts>=4 AND e.lease_until<=clock_timestamp();
  UPDATE identity.data_export e SET status='EXPIRED',closed_at=clock_timestamp()
    WHERE e.status='SENT' AND e.expires_at<=clock_timestamp();
  UPDATE identity.data_export e SET status='CANCELLED',closed_at=clock_timestamp()
    WHERE e.status IN ('PREPARING','SENT') AND EXISTS(SELECT 1 FROM identity.account_erasure_request r
      WHERE r.user_id=e.user_id AND r.prepared_at IS NOT NULL AND r.cancelled_at IS NULL);
  RETURN QUERY SELECT e.export_id,e.user_id FROM identity.data_export e WHERE e.key_destroyed_at IS NULL
    AND e.status IN ('EXPIRED','SUPERSEDED','CANCELLED','FAILED');
END;
$$;

CREATE OR REPLACE FUNCTION identity.mark_data_export_key_destroyed(p_export_id uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  UPDATE identity.data_export SET key_destroyed_at=COALESCE(key_destroyed_at,clock_timestamp())
    WHERE export_id=p_export_id AND status IN ('EXPIRED','SUPERSEDED','CANCELLED','FAILED');
END;
$$;

CREATE OR REPLACE FUNCTION identity.live_data_export_ids(p_ids uuid[])
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT COALESCE(array_agg(e.export_id ORDER BY e.export_id),ARRAY[]::uuid[]) FROM identity.data_export e
 WHERE e.export_id=ANY(p_ids) AND e.key_destroyed_at IS NULL AND e.status IN ('PREPARING','SENT')
$$;

CREATE OR REPLACE FUNCTION identity.open_data_export_link(p_user_id uuid,p_token_hash text)
RETURNS TABLE(outcome text,export_id uuid,archive_sha256 text,requested_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_row record;
BEGIN
  SELECT e.* INTO v_row FROM identity.data_export e WHERE e.link_token_hash=p_token_hash;
  IF NOT FOUND THEN RETURN QUERY SELECT 'INVALID'::text,NULL::uuid,NULL::text,NULL::timestamptz; RETURN; END IF;
  IF v_row.user_id<>p_user_id THEN RETURN QUERY SELECT 'WRONG_ACCOUNT'::text,NULL::uuid,NULL::text,NULL::timestamptz; RETURN; END IF;
  IF v_row.status<>'SENT' OR v_row.expires_at<=clock_timestamp()
    OR EXISTS(SELECT 1 FROM identity.account_erasure_request r WHERE r.user_id=p_user_id AND r.prepared_at IS NOT NULL AND r.cancelled_at IS NULL) THEN
    RETURN QUERY SELECT 'INVALID'::text,NULL::uuid,NULL::text,NULL::timestamptz; RETURN;
  END IF;
  IF identity.read_account_security_hold(p_user_id) THEN
    RETURN QUERY SELECT 'HELD'::text,NULL::uuid,NULL::text,NULL::timestamptz; RETURN;
  END IF;
  RETURN QUERY SELECT 'OK'::text,v_row.export_id::uuid,v_row.archive_sha256::text,v_row.requested_at::timestamptz;
END;
$$;

CREATE OR REPLACE FUNCTION identity.record_data_export_download(p_export_id uuid,p_user_id uuid,p_source_context jsonb)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_actor text;
BEGIN
  PERFORM identity.consume_runtime_audit_attempt();
  SELECT u.audit_token::text INTO v_actor FROM identity.data_export e JOIN identity."user" u ON u.user_id=e.user_id
    WHERE e.export_id=p_export_id AND e.user_id=p_user_id AND e.status='SENT' AND e.expires_at>clock_timestamp();
  IF NOT FOUND THEN RAISE EXCEPTION 'DATA_EXPORT_LINK_INVALID'; END IF;
  PERFORM identity.append_audit_event_internal(gen_random_uuid(),v_actor,'identity.data_export.downloaded',
    'data_export',p_export_id::text,clock_timestamp(),p_source_context,'ALLOW',true,NULL);
END;
$$;

CREATE OR REPLACE FUNCTION identity.valid_consumer_authorization_internal(a jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT COALESCE(
 (a->>'action' IN ('DELETE_ACCOUNT','CHANGE_EMAIL','READ_PHONE_PROFILE','CHANGE_PHONE_PROFILE','CHANGE_RECOVERY_EMAIL','ADD_PASSKEY','ADD_TOTP','REGENERATE_RECOVERY_CODES','WITHDRAW_SUBSCRIPTION','EXPORT_DATA') AND core.jsonb_has_exact_keys(a,ARRAY['action']))
 OR (a->>'action' IN ('PUBLISH','UNPUBLISH','DELETE_PRIVATE_DEBATE') AND core.jsonb_has_exact_keys(a,ARRAY['action','target_run_id']) AND a->>'target_run_id' ~ '^[0-9a-f-]{36}$')
 OR (a->>'action'='REMOVE_AUTH_METHOD' AND core.jsonb_has_exact_keys(a,ARRAY['action','target_factor_id']) AND a->>'target_factor_id' ~ '^[0-9a-f-]{36}$')
 OR (a->>'action' IN ('LINK_PROVIDER','UNLINK_PROVIDER') AND core.jsonb_has_exact_keys(a,ARRAY['action','target_provider']) AND a->>'target_provider' IN ('google','apple','facebook','x')),false)
$$;

DO $$DECLARE o name; f text; BEGIN
  SELECT pg_get_userbyid(proowner) INTO o FROM pg_proc
    WHERE oid='identity.read_email_settings(uuid,uuid)'::regprocedure;
  EXECUTE format('ALTER TABLE identity.data_export OWNER TO %I',o);
  FOREACH f IN ARRAY ARRAY[
    'request_data_export(uuid,uuid,text,uuid,text,jsonb)',
    'read_data_export_status(uuid)',
    'claim_data_export(uuid,integer)',
    'renew_data_export_lease(uuid,uuid,integer)',
    'read_data_export_snapshot(uuid,uuid)',
    'complete_data_export(uuid,uuid,text,text,bigint,timestamp with time zone)',
    'fail_data_export(uuid,uuid,text)',
    'sweep_data_exports()',
    'mark_data_export_key_destroyed(uuid)',
    'live_data_export_ids(uuid[])',
    'open_data_export_link(uuid,text)',
    'record_data_export_download(uuid,uuid,jsonb)'
  ] LOOP
    EXECUTE format('ALTER FUNCTION identity.%s OWNER TO %I',f,o);
    EXECUTE format('REVOKE ALL ON FUNCTION identity.%s FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay',f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION identity.%s TO debateai_authorization_runtime',f);
  END LOOP;
END $$;
