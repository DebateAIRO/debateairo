-- Manual phones remain profile data; no phone channel, index or ownership claim.
ALTER TABLE identity."user" DROP CONSTRAINT IF EXISTS identity_user_phone_channel_unsupported;
DROP TRIGGER IF EXISTS reject_unsupported_phone_channel ON identity."user";
ALTER TABLE identity."user" ALTER COLUMN recovery_email_ciphertext DROP NOT NULL;
ALTER TABLE identity."user" DROP CONSTRAINT IF EXISTS identity_user_phone_profile_consistent;
ALTER TABLE identity."user"
  ADD COLUMN IF NOT EXISTS phone_source text,
  ADD COLUMN IF NOT EXISTS phone_verification_status text,
  ADD COLUMN IF NOT EXISTS phone_updated_at timestamptz,
  ADD CONSTRAINT identity_user_phone_profile_consistent CHECK (
    (phone_ciphertext IS NULL AND phone_source IS NULL AND phone_verification_status IS NULL AND phone_updated_at IS NULL)
    OR
    (phone_ciphertext IS NOT NULL AND phone_source IS NOT NULL AND phone_source='manual'
      AND phone_verification_status IS NOT NULL AND phone_verification_status='unverified' AND phone_updated_at IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION identity.create_pending_account_with_audit(
  p_user_id uuid,p_email_blind_index bytea,p_email_ciphertext jsonb,
  p_recovery_email_ciphertext jsonb,p_password_hash text,p_pseudonym text,
  p_adult_affirmed_at timestamptz,p_occurred_at timestamptz,
  p_verification_token_hash text,p_verification_expires_at timestamptz,
  p_source_context jsonb,p_phone_ciphertext jsonb,p_phone_source text,
  p_phone_verification_status text,p_phone_updated_at timestamptz
)
RETURNS TABLE(status text,user_id uuid,channel_binding_id uuid)
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
BEGIN
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
      RETURN QUERY SELECT 'PSEUDONYM_COLLISION'::text,NULL::uuid,NULL::uuid;
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
    RETURN QUERY SELECT 'EMAIL_DUPLICATE'::text,v_existing.user_id,NULL::uuid;
    RETURN;
  END IF;
  INSERT INTO identity.channel_binding(
    user_id,channel_type,address_ciphertext,state,created_at,
    verification_token_hash,verification_expires_at,verification_last_sent_at,
    delivery_status
  ) VALUES (
    p_user_id,'email',p_email_ciphertext,'pending_verification',p_occurred_at,
    p_verification_token_hash,p_verification_expires_at,p_occurred_at,'pending'
  ) RETURNING identity.channel_binding.channel_binding_id INTO v_channel_id;
  INSERT INTO identity.verification_token_credential(
    token_hash,channel_binding_id,issued_at,expires_at
  ) VALUES (p_verification_token_hash,v_channel_id,p_occurred_at,p_verification_expires_at);
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
  RETURN QUERY SELECT 'CREATED'::text,p_user_id,v_channel_id;
END;
$$;

CREATE OR REPLACE FUNCTION identity.create_pending_account_with_consent(
  p_user_id uuid,p_email_blind_index bytea,p_email_ciphertext jsonb,
  p_recovery_email_ciphertext jsonb,p_password_hash text,p_pseudonym text,
  p_adult_affirmed_at timestamptz,p_occurred_at timestamptz,
  p_verification_token_hash text,p_verification_expires_at timestamptz,
  p_source_context jsonb,p_phone_ciphertext jsonb,p_phone_source text,
  p_phone_verification_status text,p_phone_updated_at timestamptz,
  p_min_age_applied smallint,p_age_country_code text,p_age_rule_version text,
  p_acceptances jsonb
)
RETURNS TABLE(status text,user_id uuid,channel_binding_id uuid)
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
  SELECT * INTO v_created FROM identity.create_pending_account_with_audit(
    p_user_id,p_email_blind_index,p_email_ciphertext,p_recovery_email_ciphertext,
    p_password_hash,p_pseudonym,p_adult_affirmed_at,p_occurred_at,
    p_verification_token_hash,p_verification_expires_at,p_source_context,
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
  RETURN QUERY SELECT v_created.status::text, v_created.user_id::uuid, v_created.channel_binding_id::uuid;
END;
$$;

-- New overloads inherit the old least-privilege definer owners, never the migration runner.
DO $$ DECLARE v_owner name; BEGIN
  SELECT pg_get_userbyid(proowner) INTO STRICT v_owner FROM pg_proc WHERE oid='identity.create_pending_account_with_audit(uuid,bytea,jsonb,jsonb,text,text,timestamptz,timestamptz,text,timestamptz,jsonb)'::regprocedure;
  EXECUTE format('ALTER FUNCTION identity.create_pending_account_with_audit(uuid,bytea,jsonb,jsonb,text,text,timestamptz,timestamptz,text,timestamptz,jsonb,jsonb,text,text,timestamptz) OWNER TO %I',v_owner);
  SELECT pg_get_userbyid(proowner) INTO STRICT v_owner FROM pg_proc WHERE oid='identity.create_pending_account_with_consent(uuid,bytea,jsonb,jsonb,text,text,timestamptz,timestamptz,text,timestamptz,jsonb,smallint,text,text,jsonb)'::regprocedure;
  EXECUTE format('ALTER FUNCTION identity.create_pending_account_with_consent(uuid,bytea,jsonb,jsonb,text,text,timestamptz,timestamptz,text,timestamptz,jsonb,jsonb,text,text,timestamptz,smallint,text,text,jsonb) OWNER TO %I',v_owner);
END $$;
REVOKE ALL ON FUNCTION identity.create_pending_account_with_audit(uuid,bytea,jsonb,jsonb,text,text,timestamptz,timestamptz,text,timestamptz,jsonb) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,
  debateai_publication_cleanup,debateai_content_provision;
REVOKE ALL ON FUNCTION identity.create_pending_account_with_audit(uuid,bytea,jsonb,jsonb,text,text,timestamptz,timestamptz,text,timestamptz,jsonb,jsonb,text,text,timestamptz) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,
  debateai_publication_cleanup,debateai_content_provision;
GRANT EXECUTE ON FUNCTION identity.create_pending_account_with_audit(uuid,bytea,jsonb,jsonb,text,text,timestamptz,timestamptz,text,timestamptz,jsonb,jsonb,text,text,timestamptz) TO debateai_runtime;
REVOKE ALL ON FUNCTION identity.create_pending_account_with_consent(uuid,bytea,jsonb,jsonb,text,text,timestamptz,timestamptz,text,timestamptz,jsonb,smallint,text,text,jsonb) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,
  debateai_publication_cleanup,debateai_content_provision;
REVOKE ALL ON FUNCTION identity.create_pending_account_with_consent(uuid,bytea,jsonb,jsonb,text,text,timestamptz,timestamptz,text,timestamptz,jsonb,jsonb,text,text,timestamptz,smallint,text,text,jsonb) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,
  debateai_publication_cleanup,debateai_content_provision;
GRANT EXECUTE ON FUNCTION identity.create_pending_account_with_consent(uuid,bytea,jsonb,jsonb,text,text,timestamptz,timestamptz,text,timestamptz,jsonb,jsonb,text,text,timestamptz,smallint,text,text,jsonb) TO debateai_runtime;
