-- P2-10 — origin/RP-bound passkey credential storage only.
--
-- This migration does not implement a WebAuthn registration or authentication
-- ceremony. It defines the exact persisted credential shape for that later
-- capability. In particular, it stores no attestation statement, AAGUID,
-- authenticator vendor identity, biometric, face, or fingerprint data.

ALTER TABLE identity.mfa_factor
  ADD COLUMN IF NOT EXISTS relying_party_id text,
  ADD COLUMN IF NOT EXISTS credential_origin text,
  ADD COLUMN IF NOT EXISTS user_verification_required boolean,
  ADD COLUMN IF NOT EXISTS backup_eligible boolean,
  ADD COLUMN IF NOT EXISTS backup_state boolean,
  ADD COLUMN IF NOT EXISTS device_label_ciphertext jsonb,
  ADD COLUMN IF NOT EXISTS signature_counter bigint;

ALTER TABLE identity.mfa_factor
  DROP CONSTRAINT IF EXISTS mfa_factor_passkey_storage_check;

ALTER TABLE identity.mfa_factor
  ADD CONSTRAINT mfa_factor_passkey_storage_check CHECK (
    (
      factor_type = 'totp'
      AND relying_party_id IS NULL
      AND credential_origin IS NULL
      AND user_verification_required IS NULL
      AND backup_eligible IS NULL
      AND backup_state IS NULL
      AND device_label_ciphertext IS NULL
      AND signature_counter IS NULL
    )
    OR
    (
      factor_type = 'passkey'
      AND credential_id IS NOT NULL
      AND length(credential_id) BETWEEN 1 AND 2048
      AND credential_id ~ '^[A-Za-z0-9_-]+$'
      AND jsonb_typeof(public_key) = 'object'
      AND public_key = jsonb_build_object(
        'format',public_key->'format','value',public_key->'value'
      )
      AND public_key->>'format' = 'COSE_KEY_BASE64URL_V1'
      AND jsonb_typeof(public_key->'value') = 'string'
      AND length(public_key->>'value') BETWEEN 1 AND 8192
      AND public_key->>'value' ~ '^[A-Za-z0-9_-]+$'
      AND relying_party_id IS NOT NULL
      AND length(relying_party_id) BETWEEN 1 AND 253
      AND relying_party_id = lower(relying_party_id)
      AND relying_party_id ~ '^(localhost|[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*)$'
      AND credential_origin IS NOT NULL
      AND (
        credential_origin = 'https://' || relying_party_id
        OR (
          starts_with(credential_origin,'https://' || relying_party_id || ':')
          AND substring(
            credential_origin
            FROM length('https://' || relying_party_id || ':') + 1
          ) ~ '^[0-9]{1,5}$'
          AND substring(
            credential_origin
            FROM length('https://' || relying_party_id || ':') + 1
          )::integer BETWEEN 1 AND 65535
        )
      )
      AND user_verification_required IS NOT NULL
      AND backup_eligible IS NOT NULL
      AND backup_state IS NOT NULL
      AND (NOT backup_state OR backup_eligible)
      AND signature_counter IS NOT NULL
      AND signature_counter BETWEEN 0 AND 4294967295
      AND last_accepted_step IS NULL
      AND core.is_content_envelope(device_label_ciphertext)
      AND device_label_ciphertext = jsonb_build_object(
        'v',device_label_ciphertext->'v',
        'keyId',device_label_ciphertext->'keyId',
        'nonce',device_label_ciphertext->'nonce',
        'ct',device_label_ciphertext->'ct',
        'tag',device_label_ciphertext->'tag'
      )
      AND device_label_ciphertext->>'keyId' =
        'passkey-label:' || mfa_factor_id::text || ':v1'
    )
  );

CREATE OR REPLACE FUNCTION identity.enforce_passkey_credential_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=pg_catalog
AS $$
BEGIN
  IF OLD.factor_type <> 'passkey' AND NEW.factor_type <> 'passkey' THEN
    RETURN NEW;
  END IF;
  IF NEW.mfa_factor_id IS DISTINCT FROM OLD.mfa_factor_id
    OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.factor_type IS DISTINCT FROM OLD.factor_type
    OR NEW.secret_ciphertext IS DISTINCT FROM OLD.secret_ciphertext
    OR NEW.credential_id IS DISTINCT FROM OLD.credential_id
    OR NEW.public_key IS DISTINCT FROM OLD.public_key
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.relying_party_id IS DISTINCT FROM OLD.relying_party_id
    OR NEW.credential_origin IS DISTINCT FROM OLD.credential_origin
    OR NEW.user_verification_required IS DISTINCT FROM OLD.user_verification_required
    OR NEW.backup_eligible IS DISTINCT FROM OLD.backup_eligible
    OR NEW.device_label_ciphertext IS DISTINCT FROM OLD.device_label_ciphertext
    OR NEW.last_accepted_step IS DISTINCT FROM OLD.last_accepted_step THEN
    RAISE EXCEPTION USING
      ERRCODE='55000',MESSAGE='PASSKEY_CREDENTIAL_BINDING_IMMUTABLE';
  END IF;
  IF NEW.signature_counter < OLD.signature_counter THEN
    RAISE EXCEPTION USING
      ERRCODE='55000',MESSAGE='PASSKEY_SIGNATURE_COUNTER_DECREASE';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_passkey_credential_update
  ON identity.mfa_factor;
CREATE TRIGGER enforce_passkey_credential_update
BEFORE UPDATE ON identity.mfa_factor
FOR EACH ROW EXECUTE FUNCTION identity.enforce_passkey_credential_update();

REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON identity.mfa_factor
  FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,
    debateai_erasure_runtime,debateai_replay,debateai_publication_cleanup,
    debateai_content_provision,debateai_evaluator_api,debateai_evaluator_reader,
    debateai_evaluator_worker;
REVOKE ALL ON FUNCTION identity.enforce_passkey_credential_update()
  FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,
    debateai_erasure_runtime,debateai_replay,debateai_publication_cleanup,
    debateai_content_provision,debateai_evaluator_api,debateai_evaluator_reader,
    debateai_evaluator_worker;
