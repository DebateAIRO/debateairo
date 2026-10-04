-- Committed send attempts survive credential expiry/consumption and transport callbacks.
-- No raw bearer, address, phone or source context is stored in this ledger.
CREATE TABLE identity.verification_delivery_reservation (
  reservation_id uuid PRIMARY KEY,
  channel_binding_id uuid NOT NULL REFERENCES identity.channel_binding(channel_binding_id) ON DELETE CASCADE,
  reserved_at timestamptz NOT NULL
);
CREATE INDEX verification_delivery_reservation_channel_time
  ON identity.verification_delivery_reservation(channel_binding_id,reserved_at);

-- Conservative migration: seed every surviving recent credential plus a later
-- delivery timestamp when it could represent an already-pruned attempt. Equal
-- timestamps count once; extra uncertainty consumes capacity, never grants it.
INSERT INTO identity.verification_delivery_reservation(reservation_id,channel_binding_id,reserved_at)
SELECT gen_random_uuid(),history.channel_binding_id,history.reserved_at
FROM (
  SELECT credential.channel_binding_id,credential.issued_at AS reserved_at
  FROM identity.verification_token_credential credential
  JOIN identity.channel_binding channel USING(channel_binding_id)
  WHERE channel.channel_type='email' AND credential.issued_at>clock_timestamp()-interval '1 hour'
  UNION
  -- The old spacing could have admitted earlier short-lived credentials that
  -- were already pruned. Seed its worst-case20-minute predecessors as well.
  SELECT channel.channel_binding_id,channel.verification_last_sent_at-offsets.minutes*interval '1 minute'
  FROM identity.channel_binding channel CROSS JOIN (VALUES (0),(20),(40)) offsets(minutes)
  WHERE channel.channel_type='email'
    AND channel.verification_last_sent_at-offsets.minutes*interval '1 minute'>clock_timestamp()-interval '1 hour'
) history;

CREATE FUNCTION identity.enforce_verification_reservation_parent()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_user_id uuid; BEGIN
  IF TG_OP='UPDATE' AND NEW.channel_binding_id IS DISTINCT FROM OLD.channel_binding_id THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='IDENTITY_CHILD_PARENT_IMMUTABLE';
  END IF;
  SELECT channel.user_id INTO v_user_id FROM identity.channel_binding channel
  WHERE channel.channel_binding_id=NEW.channel_binding_id AND channel.channel_type='email' FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='VERIFICATION_PRIMARY_CHANNEL_REQUIRED'; END IF;
  PERFORM 1 FROM identity."user" account WHERE account.user_id=v_user_id
    AND account.state IN ('pending_verification','pending_mfa','active') FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='ACCOUNT_NOT_ACTIVE'; END IF;
  IF EXISTS (SELECT 1 FROM identity.account_erasure_request request WHERE request.user_id=v_user_id
    AND request.prepared_at IS NOT NULL AND request.committed_at IS NULL AND request.cancelled_at IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='ACCOUNT_ERASURE_PREPARED';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER enforce_active_user_child BEFORE INSERT OR UPDATE ON identity.verification_delivery_reservation
  FOR EACH ROW EXECUTE FUNCTION identity.enforce_verification_reservation_parent();
CREATE TRIGGER reject_truncate BEFORE TRUNCATE ON identity.verification_delivery_reservation
  FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();

CREATE OR REPLACE FUNCTION identity.create_pending_account_reserved_with_audit(
  p_user_id uuid,p_email_blind_index bytea,p_email_ciphertext jsonb,
  p_recovery_email_ciphertext jsonb,p_password_hash text,p_pseudonym text,
  p_adult_affirmed_at timestamptz,p_occurred_at timestamptz,
  p_verification_token_hash text,p_token_ttl_ms bigint,
  p_source_context jsonb,p_phone_ciphertext jsonb,p_phone_source text,
  p_phone_verification_status text,p_phone_updated_at timestamptz
)
RETURNS TABLE(status text,user_id uuid,channel_binding_id uuid,verification_expires_at timestamptz,reservation_id uuid)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_staff_lock_existing_user_id uuid;
  v_inserted_user_id uuid;
  v_existing record;
  v_account record;
  v_channel_id uuid;
  v_audit_token uuid := gen_random_uuid();
  v_issued_at timestamptz;
  v_expires_at timestamptz;
  v_reservation_id uuid := gen_random_uuid();
BEGIN
  IF p_token_ttl_ms IS NULL OR p_token_ttl_ms<1 OR p_token_ttl_ms>86400000 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='VERIFICATION_TTL_INVALID';
  END IF;
  IF p_phone_ciphertext IS NULL OR jsonb_typeof(p_phone_ciphertext) IS DISTINCT FROM 'object'
    OR p_phone_source IS DISTINCT FROM 'manual' OR p_phone_verification_status IS DISTINCT FROM 'unverified'
    OR p_phone_updated_at IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PHONE_PROFILE_INVALID';
  END IF;
  SELECT identity_user.user_id INTO v_staff_lock_existing_user_id
  FROM identity."user" AS identity_user
  WHERE identity_user.email_blind_index=p_email_blind_index;
  IF p_user_id IS NOT NULL OR v_staff_lock_existing_user_id IS NOT NULL THEN
    PERFORM identity.lock_security_subjects(ARRAY(
      SELECT DISTINCT candidate FROM unnest(ARRAY[p_user_id,v_staff_lock_existing_user_id]) AS candidate
      WHERE candidate IS NOT NULL ORDER BY candidate
    ));
  END IF;
  INSERT INTO identity."user"(
    user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
    phone_ciphertext,phone_source,phone_verification_status,phone_updated_at,
    password_hash,pseudonym,audit_token,state,
    adult_affirmed_at,created_at
  ) VALUES (
    p_user_id,p_email_blind_index,p_email_ciphertext,p_recovery_email_ciphertext,
    p_phone_ciphertext,p_phone_source,p_phone_verification_status,p_phone_updated_at,
    p_password_hash,p_pseudonym,v_audit_token,'pending_verification',
    p_adult_affirmed_at,p_occurred_at
  ) ON CONFLICT DO NOTHING RETURNING identity."user".user_id INTO v_inserted_user_id;
  IF v_inserted_user_id IS NULL THEN
    SELECT identity_user.user_id
    INTO v_existing
    FROM identity."user" AS identity_user
    WHERE identity_user.email_blind_index=p_email_blind_index;
    IF NOT FOUND THEN
      PERFORM identity.consume_runtime_audit_attempt();
      RETURN QUERY SELECT 'PSEUDONYM_COLLISION'::text,NULL::uuid,NULL::uuid,NULL::timestamptz,NULL::uuid;
      RETURN;
    END IF;
    SELECT * INTO v_account
    FROM identity.lock_account_t9_internal(v_existing.user_id,false);
    PERFORM identity.consume_runtime_audit_attempt();
    PERFORM identity.append_runtime_audit_event_internal(
      v_account.audit_token,'identity.registration',v_existing.user_id,
      clock_timestamp(),p_source_context,'DENY',false,
      'REGISTRATION_ADDRESS_UNAVAILABLE'
    );
    RETURN QUERY SELECT 'EMAIL_DUPLICATE'::text,v_existing.user_id,NULL::uuid,NULL::timestamptz,NULL::uuid;
    RETURN;
  END IF;
  -- Unique-account/subject waits have completed; request/legal time stays separate.
  v_issued_at := clock_timestamp();
  v_expires_at := v_issued_at+p_token_ttl_ms*interval '1 millisecond';
  INSERT INTO identity.channel_binding(
    user_id,channel_type,address_ciphertext,state,created_at,
    verification_token_hash,verification_expires_at,verification_last_sent_at,
    delivery_status
  ) VALUES (
    p_user_id,'email',p_email_ciphertext,'pending_verification',p_occurred_at,
    p_verification_token_hash,v_expires_at,v_issued_at,'pending'
  ) RETURNING identity.channel_binding.channel_binding_id INTO v_channel_id;
  INSERT INTO identity.verification_token_credential(
    token_hash,channel_binding_id,issued_at,expires_at
  ) VALUES (p_verification_token_hash,v_channel_id,v_issued_at,v_expires_at);
  INSERT INTO identity.verification_delivery_reservation(reservation_id,channel_binding_id,reserved_at)
  VALUES (v_reservation_id,v_channel_id,v_issued_at);
  IF p_recovery_email_ciphertext IS NOT NULL THEN
    INSERT INTO identity.channel_binding(
      user_id,channel_type,address_ciphertext,state,created_at,delivery_status
    ) VALUES (
      p_user_id,'recovery_email',p_recovery_email_ciphertext,
      'pending_verification',p_occurred_at,'not_requested'
    );
  END IF;
  PERFORM identity.consume_runtime_audit_attempt();
  PERFORM identity.append_runtime_audit_event_internal(
    v_audit_token,'identity.registration',p_user_id,clock_timestamp(),
    p_source_context,'ALLOW',true,NULL
  );
  RETURN QUERY SELECT 'CREATED'::text,p_user_id,v_channel_id,v_expires_at,v_reservation_id;
END;
$$;

CREATE OR REPLACE FUNCTION identity.create_pending_account_reserved_with_consent(
  p_user_id uuid,p_email_blind_index bytea,p_email_ciphertext jsonb,
  p_recovery_email_ciphertext jsonb,p_password_hash text,p_pseudonym text,
  p_adult_affirmed_at timestamptz,p_occurred_at timestamptz,
  p_verification_token_hash text,p_token_ttl_ms bigint,
  p_source_context jsonb,p_phone_ciphertext jsonb,p_phone_source text,
  p_phone_verification_status text,p_phone_updated_at timestamptz,
  p_min_age_applied smallint,p_age_country_code text,p_age_rule_version text,
  p_acceptances jsonb
)
RETURNS TABLE(status text,user_id uuid,channel_binding_id uuid,verification_expires_at timestamptz,reservation_id uuid)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_created record;
  v_owner_ref uuid;
  v_kinds text[];
BEGIN
  IF jsonb_typeof(p_acceptances) IS DISTINCT FROM 'array' OR jsonb_array_length(p_acceptances) <> 3 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='LEGAL_ACCEPTANCE_SET_INVALID';
  END IF;
  SELECT array_agg(item.value->>'kind' ORDER BY item.value->>'kind') INTO v_kinds
  FROM jsonb_array_elements(p_acceptances) AS item;
  IF v_kinds IS DISTINCT FROM ARRAY['ADULT','PRIVACY_SHOWN','TERMS']::text[] THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='LEGAL_ACCEPTANCE_SET_INVALID';
  END IF;
  SELECT * INTO v_created FROM identity.create_pending_account_reserved_with_audit(
    p_user_id,p_email_blind_index,p_email_ciphertext,p_recovery_email_ciphertext,
    p_password_hash,p_pseudonym,p_adult_affirmed_at,p_occurred_at,
    p_verification_token_hash,p_token_ttl_ms,p_source_context,
    p_phone_ciphertext,p_phone_source,p_phone_verification_status,p_phone_updated_at
  );
  IF v_created.status = 'CREATED' THEN
    -- The age gate's record, exactly as createPendingAccount wrote it before this wrapper existed
    -- (packages/db/src/identity.ts): the passed check, the edge's (or, R3-3, the country gate's)
    -- country, the rule version, at the registration's own time. Its CHECKs refuse the whole call.
    PERFORM identity.record_registration_age_check(
      p_user_id,p_min_age_applied,p_age_country_code,p_age_rule_version,p_occurred_at
    );
    SELECT identity_user.owner_ref INTO v_owner_ref
    FROM identity."user" AS identity_user WHERE identity_user.user_id = p_user_id;
    INSERT INTO legal.acceptance(
      acceptance_id,owner_ref,kind,document_version,document_sha256,locale,surface,
      accepted_at,evidence_ciphertext,key_id
    )
    SELECT (item.value->>'acceptance_id')::uuid, v_owner_ref, item.value->>'kind',
      item.value->>'document_version', item.value->>'document_sha256', item.value->>'locale',
      'SIGN_UP', p_occurred_at, decode(item.value->>'evidence_ciphertext','base64'),
      item.value->>'key_id'
    FROM jsonb_array_elements(p_acceptances) AS item;
  END IF;
  RETURN QUERY SELECT v_created.status::text, v_created.user_id::uuid, v_created.channel_binding_id::uuid,
    v_created.verification_expires_at::timestamptz,v_created.reservation_id::uuid;
END;
$$;

CREATE OR REPLACE FUNCTION identity.consume_verification_with_audit(
  p_token_hash text,p_occurred_at timestamptz,p_source_context jsonb
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
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
    AND v_user_state='pending_verification',
    false
  );
  IF v_valid THEN
    UPDATE identity.verification_token_credential SET consumed_at=v_decided_at
    WHERE channel_binding_id=v_channel_id AND consumed_at IS NULL;
    UPDATE identity.channel_binding
    SET state='verified',verified_at=v_decided_at,
      verification_consumed_at=v_decided_at,
      verification_token_hash=p_token_hash,
      verification_expires_at=v_expires_at,delivery_error=NULL
    WHERE channel_binding_id=v_channel_id;
    UPDATE identity."user" SET state='pending_mfa' WHERE user_id=v_user_id;
  END IF;
  PERFORM identity.consume_runtime_audit_attempt();
  PERFORM identity.append_runtime_audit_event_internal(
    COALESCE(v_audit_token,gen_random_uuid()),'identity.verification.consumed',
    CASE WHEN v_valid THEN v_channel_id ELSE NULL END,
    clock_timestamp(),p_source_context,CASE WHEN v_valid THEN 'ALLOW' ELSE 'DENY' END,
    v_valid,CASE WHEN v_valid THEN NULL ELSE 'VERIFICATION_TOKEN_INVALID' END
  );
  RETURN v_valid;
END;
$$;

CREATE FUNCTION identity.prepare_verification_resend_reserved_with_audit(
  p_email_blind_index bytea,p_token_hash text,p_token_ttl_ms bigint,
  p_occurred_at timestamptz,p_cooldown_ms bigint,p_window_ms bigint,p_maximum_sends integer,
  p_mechanism text,p_source_context jsonb
)
RETURNS TABLE(status text,user_id uuid,audit_token uuid,channel_binding_id uuid,verification_expires_at timestamptz,reservation_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  v_channel record; v_audit_token uuid; v_user_state text;
  v_cooling boolean; v_limited boolean; v_send boolean;
  v_now timestamptz; v_latest timestamptz; v_count bigint;
  v_expires_at timestamptz; v_reservation_id uuid;
BEGIN
  IF p_token_ttl_ms IS NULL OR p_token_ttl_ms<1 OR p_token_ttl_ms>86400000 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='VERIFICATION_TTL_INVALID';
  END IF;
  IF p_window_ms IS DISTINCT FROM 3600000 OR p_maximum_sends IS DISTINCT FROM 3
    OR p_mechanism IS NULL OR p_mechanism NOT IN ('atomic_rolling_reservation_ledger','per_row_last_sent_timestamp_minimum_spacing')
    OR p_cooldown_ms IS NULL OR p_cooldown_ms<1 OR p_cooldown_ms>86400000
    OR (p_mechanism='atomic_rolling_reservation_ledger' AND p_cooldown_ms<>60000)
    OR (p_mechanism='per_row_last_sent_timestamp_minimum_spacing' AND p_cooldown_ms*p_maximum_sends<p_window_ms) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='VERIFICATION_SEND_POLICY_INVALID';
  END IF;
  SELECT channel.channel_binding_id,channel.user_id,channel.verification_last_sent_at INTO v_channel
  FROM identity."user" account JOIN identity.channel_binding channel USING(user_id)
  WHERE account.email_blind_index=p_email_blind_index AND channel.channel_type='email';
  IF v_channel.channel_binding_id IS NOT NULL THEN
    PERFORM identity.lock_security_subjects(ARRAY[v_channel.user_id]);
    SELECT channel.channel_binding_id,channel.user_id,channel.verification_last_sent_at INTO v_channel
    FROM identity.channel_binding channel WHERE channel.channel_binding_id=v_channel.channel_binding_id FOR UPDATE;
    SELECT account.audit_token,account.user_state INTO v_audit_token,v_user_state
    FROM identity.lock_account_t9_internal(v_channel.user_id,false) account;
  END IF;
  -- Authority and credential locks precede the ledger read/count/insert, even
  -- for an empty ledger. Transport and audit derivations remain outside.
  v_now := clock_timestamp();
  SELECT max(reservation.reserved_at),count(*) FILTER (WHERE reservation.reserved_at>v_now-p_window_ms*interval '1 millisecond' AND reservation.reserved_at<=v_now)
  INTO v_latest,v_count FROM identity.verification_delivery_reservation reservation
  WHERE reservation.channel_binding_id=v_channel.channel_binding_id;
  IF p_mechanism='per_row_last_sent_timestamp_minimum_spacing' THEN
    v_latest := v_channel.verification_last_sent_at;
  END IF;
  v_cooling := v_latest IS NOT NULL AND v_now-v_latest<p_cooldown_ms*interval '1 millisecond';
  v_limited := v_count>=p_maximum_sends;
  v_send := v_channel.channel_binding_id IS NOT NULL AND v_user_state='pending_verification'
    AND NOT COALESCE(v_cooling,false) AND NOT v_limited;
  IF v_send THEN
    -- Trailing interval is (t-window,t]; expiry equality stays valid.
    DELETE FROM identity.verification_delivery_reservation reservation
    WHERE reservation.channel_binding_id=v_channel.channel_binding_id
      AND reservation.reserved_at<=v_now-p_window_ms*interval '1 millisecond';
    DELETE FROM identity.verification_token_credential credential
    WHERE credential.channel_binding_id=v_channel.channel_binding_id AND credential.expires_at<v_now;
    v_expires_at := v_now+p_token_ttl_ms*interval '1 millisecond';
    v_reservation_id := gen_random_uuid();
    INSERT INTO identity.verification_delivery_reservation(reservation_id,channel_binding_id,reserved_at)
    VALUES (v_reservation_id,v_channel.channel_binding_id,v_now);
    INSERT INTO identity.verification_token_credential(token_hash,channel_binding_id,issued_at,expires_at)
    VALUES (p_token_hash,v_channel.channel_binding_id,v_now,v_expires_at);
    UPDATE identity.channel_binding channel SET verification_token_hash=p_token_hash,
      verification_expires_at=v_expires_at,verification_consumed_at=NULL,
      verification_last_sent_at=v_now,delivery_status='pending',delivery_error=NULL
    WHERE channel.channel_binding_id=v_channel.channel_binding_id;
  END IF;
  PERFORM identity.consume_runtime_audit_attempt();
  PERFORM identity.append_runtime_audit_event_internal(
    COALESCE(v_audit_token,gen_random_uuid()),'identity.verification.resend_requested',
    CASE WHEN v_send THEN v_channel.channel_binding_id ELSE NULL END,
    p_occurred_at,p_source_context,CASE WHEN v_send THEN 'ALLOW' ELSE 'DENY' END,v_send,
    CASE WHEN v_send THEN NULL WHEN v_cooling THEN 'RESEND_COOLDOWN'
      ELSE 'RESEND_NOT_APPLICABLE' END
  );
  RETURN QUERY SELECT CASE WHEN v_send THEN 'SEND' ELSE 'IGNORED' END,
    CASE WHEN v_send THEN v_channel.user_id ELSE NULL END,
    CASE WHEN v_send THEN v_audit_token ELSE NULL END,
    CASE WHEN v_send THEN v_channel.channel_binding_id ELSE NULL END,
    CASE WHEN v_send THEN v_expires_at ELSE NULL END,
    CASE WHEN v_send THEN v_reservation_id ELSE NULL END;
END; $$;

-- New entrypoints inherit least-privilege owners. Old shapes remain owner-only;
-- an older runtime caller cannot bypass the reservation ledger after migration.
DO $$ DECLARE v_owner name; BEGIN
  SELECT pg_get_userbyid(relowner) INTO STRICT v_owner FROM pg_class WHERE oid='identity.verification_token_credential'::regclass;
  EXECUTE format('ALTER TABLE identity.verification_delivery_reservation OWNER TO %I',v_owner);
  SELECT pg_get_userbyid(proowner) INTO STRICT v_owner FROM pg_proc WHERE oid='identity.enforce_active_user_child()'::regprocedure;
  EXECUTE format('ALTER FUNCTION identity.enforce_verification_reservation_parent() OWNER TO %I',v_owner);
  SELECT pg_get_userbyid(proowner) INTO STRICT v_owner FROM pg_proc WHERE oid='identity.create_pending_account_with_audit(uuid,bytea,jsonb,jsonb,text,text,timestamptz,timestamptz,text,timestamptz,jsonb,jsonb,text,text,timestamptz)'::regprocedure;
  EXECUTE format('ALTER FUNCTION identity.create_pending_account_reserved_with_audit(uuid,bytea,jsonb,jsonb,text,text,timestamptz,timestamptz,text,bigint,jsonb,jsonb,text,text,timestamptz) OWNER TO %I',v_owner);
  EXECUTE format('GRANT SELECT,INSERT,DELETE ON identity.verification_delivery_reservation TO %I',v_owner);
  SELECT pg_get_userbyid(proowner) INTO STRICT v_owner FROM pg_proc WHERE oid='identity.create_pending_account_with_consent(uuid,bytea,jsonb,jsonb,text,text,timestamptz,timestamptz,text,timestamptz,jsonb,jsonb,text,text,timestamptz,smallint,text,text,jsonb)'::regprocedure;
  EXECUTE format('ALTER FUNCTION identity.create_pending_account_reserved_with_consent(uuid,bytea,jsonb,jsonb,text,text,timestamptz,timestamptz,text,bigint,jsonb,jsonb,text,text,timestamptz,smallint,text,text,jsonb) OWNER TO %I',v_owner);
  EXECUTE format('GRANT SELECT,INSERT,DELETE ON identity.verification_delivery_reservation TO %I',v_owner);
  SELECT pg_get_userbyid(proowner) INTO STRICT v_owner FROM pg_proc WHERE oid='identity.prepare_verification_resend_with_audit(bytea,text,timestamptz,timestamptz,bigint,jsonb)'::regprocedure;
  EXECUTE format('ALTER FUNCTION identity.prepare_verification_resend_reserved_with_audit(bytea,text,bigint,timestamptz,bigint,bigint,integer,text,jsonb) OWNER TO %I',v_owner);
  EXECUTE format('GRANT SELECT,INSERT,DELETE ON identity.verification_delivery_reservation TO %I',v_owner);
END $$;
REVOKE ALL ON identity.verification_delivery_reservation FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_publication_cleanup,debateai_content_provision;
REVOKE ALL ON FUNCTION identity.enforce_verification_reservation_parent() FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_publication_cleanup,debateai_content_provision;
REVOKE ALL ON FUNCTION identity.create_pending_account_with_audit(uuid,bytea,jsonb,jsonb,text,text,timestamptz,timestamptz,text,timestamptz,jsonb,jsonb,text,text,timestamptz) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_publication_cleanup,debateai_content_provision;
REVOKE ALL ON FUNCTION identity.create_pending_account_with_consent(uuid,bytea,jsonb,jsonb,text,text,timestamptz,timestamptz,text,timestamptz,jsonb,jsonb,text,text,timestamptz,smallint,text,text,jsonb) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_publication_cleanup,debateai_content_provision;
REVOKE ALL ON FUNCTION identity.prepare_verification_resend_with_audit(bytea,text,timestamptz,timestamptz,bigint,jsonb) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_publication_cleanup,debateai_content_provision;
REVOKE ALL ON FUNCTION identity.create_pending_account_reserved_with_audit(uuid,bytea,jsonb,jsonb,text,text,timestamptz,timestamptz,text,bigint,jsonb,jsonb,text,text,timestamptz) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_publication_cleanup,debateai_content_provision;
GRANT EXECUTE ON FUNCTION identity.create_pending_account_reserved_with_audit(uuid,bytea,jsonb,jsonb,text,text,timestamptz,timestamptz,text,bigint,jsonb,jsonb,text,text,timestamptz) TO debateai_runtime;
REVOKE ALL ON FUNCTION identity.create_pending_account_reserved_with_consent(uuid,bytea,jsonb,jsonb,text,text,timestamptz,timestamptz,text,bigint,jsonb,jsonb,text,text,timestamptz,smallint,text,text,jsonb) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_publication_cleanup,debateai_content_provision;
GRANT EXECUTE ON FUNCTION identity.create_pending_account_reserved_with_consent(uuid,bytea,jsonb,jsonb,text,text,timestamptz,timestamptz,text,bigint,jsonb,jsonb,text,text,timestamptz,smallint,text,text,jsonb) TO debateai_runtime;
REVOKE ALL ON FUNCTION identity.prepare_verification_resend_reserved_with_audit(bytea,text,bigint,timestamptz,bigint,bigint,integer,text,jsonb) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_publication_cleanup,debateai_content_provision;
GRANT EXECUTE ON FUNCTION identity.prepare_verification_resend_reserved_with_audit(bytea,text,bigint,timestamptz,bigint,bigint,integer,text,jsonb) TO debateai_runtime;
