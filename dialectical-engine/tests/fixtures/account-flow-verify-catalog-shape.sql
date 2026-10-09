-- Enumerated account-flow catalog only. Public metadata; no user rows.
-- Run with psql --single-transaction --set ON_ERROR_STOP=1 after migration and before cutover.
SET TRANSACTION READ ONLY;
SET LOCAL statement_timeout='5s';
DO $verify$
DECLARE observed jsonb;
BEGIN
 SELECT snapshot.catalog INTO observed FROM (WITH target AS (
 SELECT c.oid,n.nspname||'.'||c.relname AS relation
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='identity' AND c.relname IN (
 'user','session','step_up_grant','login_challenge','channel_binding','verification_token_credential',
 'verification_delivery_reservation','recovery_email_request','consumer_passkey_subject','consumer_passkey_credential',
 'consumer_passkey_challenge','consumer_totp_enrollment','consumer_security_notice','consumer_security_challenge',
 'consumer_recovery_gate','consumer_recovery_token','consumer_recovery_reservation','consumer_recovery_enrollment',
 'social_identity','social_flow','social_enrollment','password_recovery_control','password_recovery_staged_code',
 'password_recovery_retry_lock','password_recovery_source_window','password_recovery_notice','password_recovery_feed')
)
SELECT jsonb_object_agg(relation,jsonb_build_object(
 'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=target.oid AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT COALESCE(jsonb_agg(jsonb_build_object('name',c.conname,'type',c.contype,'definition',pg_get_constraintdef(c.oid),'validated',c.convalidated) ORDER BY c.conname),'[]'::jsonb) FROM pg_constraint c WHERE c.conrelid=target.oid),
 'indexes',(SELECT COALESCE(jsonb_agg(jsonb_build_object('name',i.relname,'definition',pg_get_indexdef(i.oid),'valid',x.indisvalid) ORDER BY i.relname),'[]'::jsonb) FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid WHERE x.indrelid=target.oid)
) ORDER BY relation) AS catalog FROM target) snapshot;
 IF observed IS DISTINCT FROM $expected${
  "identity.user": {
    "columns": [
      {
        "name": "user_id",
        "type": "uuid",
        "default": "gen_random_uuid()",
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "email_blind_index",
        "type": "bytea",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "email_ciphertext",
        "type": "jsonb",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "recovery_email_ciphertext",
        "type": "jsonb",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "phone_ciphertext",
        "type": "jsonb",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "password_hash",
        "type": "text",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "pseudonym",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "state",
        "type": "text",
        "default": "'pending_verification'::text",
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "adult_affirmed_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "default": "statement_timestamp()",
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "audit_token",
        "type": "uuid",
        "default": "gen_random_uuid()",
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "owner_ref",
        "type": "uuid",
        "default": "gen_random_uuid()",
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "phone_source",
        "type": "text",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "phone_verification_status",
        "type": "text",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "phone_updated_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      }
    ],
    "indexes": [
      {
        "name": "identity_user_audit_token_unique",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX identity_user_audit_token_unique ON identity.\"user\" USING btree (audit_token)"
      },
      {
        "name": "identity_user_owner_ref_unique",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX identity_user_owner_ref_unique ON identity.\"user\" USING btree (owner_ref)"
      },
      {
        "name": "user_email_blind_index_key",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX user_email_blind_index_key ON identity.\"user\" USING btree (email_blind_index)"
      },
      {
        "name": "user_pkey",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX user_pkey ON identity.\"user\" USING btree (user_id)"
      },
      {
        "name": "user_pseudonym_key",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX user_pseudonym_key ON identity.\"user\" USING btree (pseudonym)"
      }
    ],
    "constraints": [
      {
        "name": "identity_user_audit_token_distinct_from_user_id",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((audit_token <> user_id))"
      },
      {
        "name": "identity_user_owner_ref_distinct_from_audit",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((owner_ref <> audit_token))"
      },
      {
        "name": "identity_user_owner_ref_distinct_from_user_id",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((owner_ref <> user_id))"
      },
      {
        "name": "identity_user_owner_ref_uuid_v4",
        "type": "c",
        "validated": true,
        "definition": "CHECK (((owner_ref)::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'::text))"
      },
      {
        "name": "identity_user_phone_profile_consistent",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((((phone_ciphertext IS NULL) AND (phone_source IS NULL) AND (phone_verification_status IS NULL) AND (phone_updated_at IS NULL)) OR ((phone_ciphertext IS NOT NULL) AND (phone_source IS NOT NULL) AND (phone_source = 'manual'::text) AND (phone_verification_status IS NOT NULL) AND (phone_verification_status = 'unverified'::text) AND (phone_updated_at IS NOT NULL))))"
      },
      {
        "name": "social_password_origin",
        "type": "t",
        "validated": true,
        "definition": "TRIGGER DEFERRABLE INITIALLY DEFERRED"
      },
      {
        "name": "user_adult_affirmed_at_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL adult_affirmed_at"
      },
      {
        "name": "user_audit_token_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL audit_token"
      },
      {
        "name": "user_created_at_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL created_at"
      },
      {
        "name": "user_email_blind_index_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((octet_length(email_blind_index) = 32))"
      },
      {
        "name": "user_email_blind_index_key",
        "type": "u",
        "validated": true,
        "definition": "UNIQUE (email_blind_index)"
      },
      {
        "name": "user_email_blind_index_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL email_blind_index"
      },
      {
        "name": "user_email_ciphertext_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((jsonb_typeof(email_ciphertext) = 'object'::text))"
      },
      {
        "name": "user_email_ciphertext_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL email_ciphertext"
      },
      {
        "name": "user_owner_ref_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL owner_ref"
      },
      {
        "name": "user_password_hash_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((length(btrim(password_hash)) > 0))"
      },
      {
        "name": "user_phone_ciphertext_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK (((phone_ciphertext IS NULL) OR (jsonb_typeof(phone_ciphertext) = 'object'::text)))"
      },
      {
        "name": "user_pkey",
        "type": "p",
        "validated": true,
        "definition": "PRIMARY KEY (user_id)"
      },
      {
        "name": "user_pseudonym_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((length(btrim(pseudonym)) > 0))"
      },
      {
        "name": "user_pseudonym_key",
        "type": "u",
        "validated": true,
        "definition": "UNIQUE (pseudonym)"
      },
      {
        "name": "user_pseudonym_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL pseudonym"
      },
      {
        "name": "user_recovery_email_ciphertext_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((jsonb_typeof(recovery_email_ciphertext) = 'object'::text))"
      },
      {
        "name": "user_state_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((state = ANY (ARRAY['pending_verification'::text, 'pending_mfa'::text, 'active'::text, 'suspended'::text, 'deleted'::text, 'age_frozen'::text])))"
      },
      {
        "name": "user_state_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL state"
      },
      {
        "name": "user_user_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL user_id"
      }
    ]
  },
  "identity.session": {
    "columns": [
      {
        "name": "session_id",
        "type": "uuid",
        "default": "gen_random_uuid()",
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "user_id",
        "type": "uuid",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "token_hash",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "binding_context",
        "type": "jsonb",
        "default": "'{}'::jsonb",
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "default": "statement_timestamp()",
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "last_seen_at",
        "type": "timestamp with time zone",
        "default": "statement_timestamp()",
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "idle_expires_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "absolute_expires_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "revoked_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "csrf_token_hash",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "last_mfa_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      }
    ],
    "indexes": [
      {
        "name": "session_csrf_token_hash_unique",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX session_csrf_token_hash_unique ON identity.session USING btree (csrf_token_hash) WHERE (csrf_token_hash IS NOT NULL)"
      },
      {
        "name": "session_pkey",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX session_pkey ON identity.session USING btree (session_id)"
      },
      {
        "name": "session_token_hash_key",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX session_token_hash_key ON identity.session USING btree (token_hash)"
      },
      {
        "name": "session_user_active_lookup",
        "valid": true,
        "definition": "CREATE INDEX session_user_active_lookup ON identity.session USING btree (user_id, last_seen_at DESC) WHERE (revoked_at IS NULL)"
      }
    ],
    "constraints": [
      {
        "name": "session_absolute_expires_at_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL absolute_expires_at"
      },
      {
        "name": "session_binding_context_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((jsonb_typeof(binding_context) = 'object'::text))"
      },
      {
        "name": "session_binding_context_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL binding_context"
      },
      {
        "name": "session_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((last_seen_at >= created_at))"
      },
      {
        "name": "session_check1",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((idle_expires_at > created_at))"
      },
      {
        "name": "session_check2",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((absolute_expires_at > created_at))"
      },
      {
        "name": "session_check3",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((idle_expires_at <= absolute_expires_at))"
      },
      {
        "name": "session_check4",
        "type": "c",
        "validated": true,
        "definition": "CHECK (((revoked_at IS NULL) OR (revoked_at >= created_at)))"
      },
      {
        "name": "session_created_at_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL created_at"
      },
      {
        "name": "session_csrf_token_hash_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK (((csrf_token_hash IS NULL) OR (csrf_token_hash ~ '^sha256:[0-9a-f]{64}$'::text)))"
      },
      {
        "name": "session_csrf_token_hash_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL csrf_token_hash"
      },
      {
        "name": "session_idle_expires_at_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL idle_expires_at"
      },
      {
        "name": "session_last_mfa_at_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL last_mfa_at"
      },
      {
        "name": "session_last_seen_at_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL last_seen_at"
      },
      {
        "name": "session_pkey",
        "type": "p",
        "validated": true,
        "definition": "PRIMARY KEY (session_id)"
      },
      {
        "name": "session_session_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL session_id"
      },
      {
        "name": "session_token_hash_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((length(btrim(token_hash)) > 0))"
      },
      {
        "name": "session_token_hash_key",
        "type": "u",
        "validated": true,
        "definition": "UNIQUE (token_hash)"
      },
      {
        "name": "session_token_hash_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL token_hash"
      },
      {
        "name": "session_user_id_fkey",
        "type": "f",
        "validated": true,
        "definition": "FOREIGN KEY (user_id) REFERENCES identity.\"user\"(user_id) ON DELETE CASCADE"
      },
      {
        "name": "session_user_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL user_id"
      }
    ]
  },
  "identity.social_flow": {
    "columns": [
      {
        "name": "state_hash",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "cookie_hash",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "binding_hash",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "nonce_hash",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "retention_hash",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "provider",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "configuration",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "purpose",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "next_path",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "user_id",
        "type": "uuid",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "session_id",
        "type": "uuid",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "session_token_hash",
        "type": "text",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "security_epoch",
        "type": "bigint",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "expires_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "claimed_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "claim_id",
        "type": "uuid",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "consumed_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "authorization_binding",
        "type": "jsonb",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "passkey_handle_hash",
        "type": "text",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "passkey_challenge_hash",
        "type": "text",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "rp_id",
        "type": "text",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "origin",
        "type": "text",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "proof_hash",
        "type": "text",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "continuation_cookie_hash",
        "type": "text",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "issuer",
        "type": "text",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "app_scope",
        "type": "text",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "subject",
        "type": "text",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "asserted_email_index",
        "type": "bytea",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      }
    ],
    "indexes": [
      {
        "name": "social_flow_expiry",
        "valid": true,
        "definition": "CREATE INDEX social_flow_expiry ON identity.social_flow USING btree (expires_at)"
      },
      {
        "name": "social_flow_pkey",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX social_flow_pkey ON identity.social_flow USING btree (state_hash)"
      },
      {
        "name": "social_flow_proof_hash_key",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX social_flow_proof_hash_key ON identity.social_flow USING btree (proof_hash)"
      }
    ],
    "constraints": [
      {
        "name": "social_flow_binding_hash_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((binding_hash ~ '^sha256:[0-9a-f]{64}$'::text))"
      },
      {
        "name": "social_flow_binding_hash_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL binding_hash"
      },
      {
        "name": "social_flow_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK (((expires_at > created_at) AND (expires_at <= (created_at + '00:05:00'::interval))))"
      },
      {
        "name": "social_flow_check1",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((((purpose = 'LOGIN'::text) AND (user_id IS NULL) AND (session_id IS NULL) AND (session_token_hash IS NULL)) OR ((purpose = ANY (ARRAY['LINK'::text, 'PROVIDER_STEP_UP'::text])) AND (user_id IS NOT NULL) AND (session_id IS NOT NULL) AND (session_token_hash IS NOT NULL))))"
      },
      {
        "name": "social_flow_configuration_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((configuration ~ '^sha256:[0-9a-f]{64}$'::text))"
      },
      {
        "name": "social_flow_configuration_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL configuration"
      },
      {
        "name": "social_flow_cookie_hash_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((cookie_hash ~ '^sha256:[0-9a-f]{64}$'::text))"
      },
      {
        "name": "social_flow_cookie_hash_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL cookie_hash"
      },
      {
        "name": "social_flow_created_at_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL created_at"
      },
      {
        "name": "social_flow_expires_at_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL expires_at"
      },
      {
        "name": "social_flow_next_path_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((next_path = ANY (ARRAY['/'::text, '/new'::text, '/settings'::text, '/settings/security'::text, '/account'::text])))"
      },
      {
        "name": "social_flow_next_path_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL next_path"
      },
      {
        "name": "social_flow_nonce_hash_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((nonce_hash ~ '^sha256:[0-9a-f]{64}$'::text))"
      },
      {
        "name": "social_flow_nonce_hash_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL nonce_hash"
      },
      {
        "name": "social_flow_pkey",
        "type": "p",
        "validated": true,
        "definition": "PRIMARY KEY (state_hash)"
      },
      {
        "name": "social_flow_proof_hash_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK (((proof_hash IS NULL) OR (proof_hash ~ '^sha256:[0-9a-f]{64}$'::text)))"
      },
      {
        "name": "social_flow_proof_hash_key",
        "type": "u",
        "validated": true,
        "definition": "UNIQUE (proof_hash)"
      },
      {
        "name": "social_flow_provider_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((provider = ANY (ARRAY['google'::text, 'apple'::text, 'facebook'::text, 'x'::text])))"
      },
      {
        "name": "social_flow_provider_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL provider"
      },
      {
        "name": "social_flow_purpose_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((purpose = ANY (ARRAY['LOGIN'::text, 'LINK'::text, 'PROVIDER_STEP_UP'::text])))"
      },
      {
        "name": "social_flow_purpose_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL purpose"
      },
      {
        "name": "social_flow_retention_hash_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((retention_hash ~ '^sha256:[0-9a-f]{64}$'::text))"
      },
      {
        "name": "social_flow_retention_hash_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL retention_hash"
      },
      {
        "name": "social_flow_state_hash_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((state_hash ~ '^sha256:[0-9a-f]{64}$'::text))"
      },
      {
        "name": "social_flow_state_hash_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL state_hash"
      },
      {
        "name": "social_flow_user_id_fkey",
        "type": "f",
        "validated": true,
        "definition": "FOREIGN KEY (user_id) REFERENCES identity.\"user\"(user_id) ON DELETE CASCADE"
      }
    ]
  },
  "identity.step_up_grant": {
    "columns": [
      {
        "name": "step_up_grant_id",
        "type": "uuid",
        "default": "gen_random_uuid()",
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "token_hash",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "session_id",
        "type": "uuid",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "user_id",
        "type": "uuid",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "action",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "target_run_id",
        "type": "uuid",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "issued_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "expires_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "consumed_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "target_account_id",
        "type": "uuid",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "target_factor_id",
        "type": "uuid",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "target_provider",
        "type": "text",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "issuing_session_token_hash",
        "type": "text",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      }
    ],
    "indexes": [
      {
        "name": "step_up_grant_live_lookup",
        "valid": true,
        "definition": "CREATE INDEX step_up_grant_live_lookup ON identity.step_up_grant USING btree (session_id, action, target_run_id, expires_at DESC) WHERE (consumed_at IS NULL)"
      },
      {
        "name": "step_up_grant_pkey",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX step_up_grant_pkey ON identity.step_up_grant USING btree (step_up_grant_id)"
      },
      {
        "name": "step_up_grant_token_hash_key",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX step_up_grant_token_hash_key ON identity.step_up_grant USING btree (token_hash)"
      }
    ],
    "constraints": [
      {
        "name": "step_up_grant_action_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((((action = ANY (ARRAY['PUBLISH'::text, 'UNPUBLISH'::text, 'DELETE_PRIVATE_DEBATE'::text])) AND (target_run_id IS NOT NULL) AND (target_account_id IS NULL) AND (target_factor_id IS NULL) AND (target_provider IS NULL)) OR ((action = ANY (ARRAY['DELETE_ACCOUNT'::text, 'CHANGE_EMAIL'::text, 'READ_PHONE_PROFILE'::text, 'CHANGE_PHONE_PROFILE'::text, 'CHANGE_RECOVERY_EMAIL'::text, 'ADD_PASSKEY'::text, 'ADD_TOTP'::text, 'REGENERATE_RECOVERY_CODES'::text])) AND (target_run_id IS NULL) AND (target_account_id = user_id) AND (target_factor_id IS NULL) AND (target_provider IS NULL)) OR ((action = 'REMOVE_AUTH_METHOD'::text) AND (target_run_id IS NULL) AND (target_account_id = user_id) AND (target_factor_id IS NOT NULL) AND (target_provider IS NULL)) OR ((action = ANY (ARRAY['LINK_PROVIDER'::text, 'UNLINK_PROVIDER'::text])) AND (target_run_id IS NULL) AND (target_account_id = user_id) AND (target_factor_id IS NULL) AND (target_provider = ANY (ARRAY['google'::text, 'apple'::text, 'facebook'::text, 'x'::text])))))"
      },
      {
        "name": "step_up_grant_action_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL action"
      },
      {
        "name": "step_up_grant_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((expires_at > issued_at))"
      },
      {
        "name": "step_up_grant_check1",
        "type": "c",
        "validated": true,
        "definition": "CHECK (((consumed_at IS NULL) OR (consumed_at >= issued_at)))"
      },
      {
        "name": "step_up_grant_expires_at_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL expires_at"
      },
      {
        "name": "step_up_grant_issued_at_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL issued_at"
      },
      {
        "name": "step_up_grant_issuing_session_token_hash_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((issuing_session_token_hash ~ '^sha256:[0-9a-f]{64}$'::text))"
      },
      {
        "name": "step_up_grant_pkey",
        "type": "p",
        "validated": true,
        "definition": "PRIMARY KEY (step_up_grant_id)"
      },
      {
        "name": "step_up_grant_session_id_fkey",
        "type": "f",
        "validated": true,
        "definition": "FOREIGN KEY (session_id) REFERENCES identity.session(session_id) ON DELETE CASCADE"
      },
      {
        "name": "step_up_grant_session_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL session_id"
      },
      {
        "name": "step_up_grant_step_up_grant_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL step_up_grant_id"
      },
      {
        "name": "step_up_grant_target_account_id_fkey",
        "type": "f",
        "validated": true,
        "definition": "FOREIGN KEY (target_account_id) REFERENCES identity.\"user\"(user_id) ON DELETE CASCADE"
      },
      {
        "name": "step_up_grant_token_hash_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((token_hash ~ '^sha256:[0-9a-f]{64}$'::text))"
      },
      {
        "name": "step_up_grant_token_hash_key",
        "type": "u",
        "validated": true,
        "definition": "UNIQUE (token_hash)"
      },
      {
        "name": "step_up_grant_token_hash_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL token_hash"
      },
      {
        "name": "step_up_grant_user_id_fkey",
        "type": "f",
        "validated": true,
        "definition": "FOREIGN KEY (user_id) REFERENCES identity.\"user\"(user_id) ON DELETE CASCADE"
      },
      {
        "name": "step_up_grant_user_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL user_id"
      }
    ]
  },
  "identity.channel_binding": {
    "columns": [
      {
        "name": "channel_binding_id",
        "type": "uuid",
        "default": "gen_random_uuid()",
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "user_id",
        "type": "uuid",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "channel_type",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "address_ciphertext",
        "type": "jsonb",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "state",
        "type": "text",
        "default": "'pending_verification'::text",
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "default": "statement_timestamp()",
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "verified_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "revoked_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "verification_token_hash",
        "type": "text",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "verification_expires_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "verification_consumed_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "verification_last_sent_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "delivery_status",
        "type": "text",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "delivery_error",
        "type": "text",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      }
    ],
    "indexes": [
      {
        "name": "channel_binding_pkey",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX channel_binding_pkey ON identity.channel_binding USING btree (channel_binding_id)"
      },
      {
        "name": "channel_binding_user_channel_unique",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX channel_binding_user_channel_unique ON identity.channel_binding USING btree (user_id, channel_type)"
      },
      {
        "name": "channel_binding_verification_token_unique",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX channel_binding_verification_token_unique ON identity.channel_binding USING btree (verification_token_hash) WHERE (verification_token_hash IS NOT NULL)"
      }
    ],
    "constraints": [
      {
        "name": "channel_binding_address_ciphertext_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((jsonb_typeof(address_ciphertext) = 'object'::text))"
      },
      {
        "name": "channel_binding_address_ciphertext_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL address_ciphertext"
      },
      {
        "name": "channel_binding_channel_binding_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL channel_binding_id"
      },
      {
        "name": "channel_binding_channel_type_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((channel_type = ANY (ARRAY['email'::text, 'recovery_email'::text, 'whatsapp'::text])))"
      },
      {
        "name": "channel_binding_channel_type_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL channel_type"
      },
      {
        "name": "channel_binding_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK (((verified_at IS NULL) OR (verified_at >= created_at)))"
      },
      {
        "name": "channel_binding_check1",
        "type": "c",
        "validated": true,
        "definition": "CHECK (((revoked_at IS NULL) OR (revoked_at >= created_at)))"
      },
      {
        "name": "channel_binding_created_at_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL created_at"
      },
      {
        "name": "channel_binding_pkey",
        "type": "p",
        "validated": true,
        "definition": "PRIMARY KEY (channel_binding_id)"
      },
      {
        "name": "channel_binding_state_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((state = ANY (ARRAY['pending_verification'::text, 'verified'::text, 'revoked'::text])))"
      },
      {
        "name": "channel_binding_state_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL state"
      },
      {
        "name": "channel_binding_user_id_fkey",
        "type": "f",
        "validated": true,
        "definition": "FOREIGN KEY (user_id) REFERENCES identity.\"user\"(user_id) ON DELETE CASCADE"
      },
      {
        "name": "channel_binding_user_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL user_id"
      }
    ]
  },
  "identity.login_challenge": {
    "columns": [
      {
        "name": "login_challenge_id",
        "type": "uuid",
        "default": "gen_random_uuid()",
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "user_id",
        "type": "uuid",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "mfa_factor_id",
        "type": "uuid",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "token_hash",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "binding_hash",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "password_hash_snapshot",
        "type": "text",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "expires_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "consumed_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "first_step",
        "type": "text",
        "default": "'PASSWORD'::text",
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "social_identity_id",
        "type": "uuid",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "social_configuration",
        "type": "text",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "social_cookie_hash",
        "type": "text",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "social_security_epoch",
        "type": "bigint",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      }
    ],
    "indexes": [
      {
        "name": "login_challenge_pkey",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX login_challenge_pkey ON identity.login_challenge USING btree (login_challenge_id)"
      },
      {
        "name": "login_challenge_token_hash_key",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX login_challenge_token_hash_key ON identity.login_challenge USING btree (token_hash)"
      },
      {
        "name": "login_challenge_user_live_lookup",
        "valid": true,
        "definition": "CREATE INDEX login_challenge_user_live_lookup ON identity.login_challenge USING btree (user_id, expires_at DESC) WHERE (consumed_at IS NULL)"
      }
    ],
    "constraints": [
      {
        "name": "login_challenge_binding_hash_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((binding_hash ~ '^sha256:[0-9a-f]{64}$'::text))"
      },
      {
        "name": "login_challenge_binding_hash_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL binding_hash"
      },
      {
        "name": "login_challenge_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((expires_at > created_at))"
      },
      {
        "name": "login_challenge_check1",
        "type": "c",
        "validated": true,
        "definition": "CHECK (((consumed_at IS NULL) OR (consumed_at >= created_at)))"
      },
      {
        "name": "login_challenge_created_at_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL created_at"
      },
      {
        "name": "login_challenge_expires_at_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL expires_at"
      },
      {
        "name": "login_challenge_first_step_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL first_step"
      },
      {
        "name": "login_challenge_login_challenge_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL login_challenge_id"
      },
      {
        "name": "login_challenge_mfa_factor_id_fkey",
        "type": "f",
        "validated": true,
        "definition": "FOREIGN KEY (mfa_factor_id) REFERENCES identity.mfa_factor(mfa_factor_id) ON DELETE CASCADE"
      },
      {
        "name": "login_challenge_password_hash_snapshot_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((length(btrim(password_hash_snapshot)) > 0))"
      },
      {
        "name": "login_challenge_pkey",
        "type": "p",
        "validated": true,
        "definition": "PRIMARY KEY (login_challenge_id)"
      },
      {
        "name": "login_challenge_social_identity_id_fkey",
        "type": "f",
        "validated": true,
        "definition": "FOREIGN KEY (social_identity_id) REFERENCES identity.social_identity(social_identity_id) ON DELETE CASCADE"
      },
      {
        "name": "login_challenge_token_hash_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((token_hash ~ '^sha256:[0-9a-f]{64}$'::text))"
      },
      {
        "name": "login_challenge_token_hash_key",
        "type": "u",
        "validated": true,
        "definition": "UNIQUE (token_hash)"
      },
      {
        "name": "login_challenge_token_hash_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL token_hash"
      },
      {
        "name": "login_challenge_user_id_fkey",
        "type": "f",
        "validated": true,
        "definition": "FOREIGN KEY (user_id) REFERENCES identity.\"user\"(user_id) ON DELETE CASCADE"
      },
      {
        "name": "login_challenge_user_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL user_id"
      },
      {
        "name": "login_first_step",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((((first_step = 'PASSWORD'::text) AND (password_hash_snapshot IS NOT NULL) AND (social_identity_id IS NULL) AND (social_configuration IS NULL) AND (social_cookie_hash IS NULL) AND (social_security_epoch IS NULL)) OR ((first_step = 'PROVIDER'::text) AND (social_identity_id IS NOT NULL) AND (social_configuration IS NOT NULL) AND (social_cookie_hash IS NOT NULL) AND (social_configuration ~ '^sha256:[0-9a-f]{64}$'::text) AND (social_cookie_hash ~ '^sha256:[0-9a-f]{64}$'::text) AND (social_security_epoch IS NOT NULL))))"
      }
    ]
  },
  "identity.social_identity": {
    "columns": [
      {
        "name": "social_identity_id",
        "type": "uuid",
        "default": "gen_random_uuid()",
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "user_id",
        "type": "uuid",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "provider",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "issuer",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "app_scope",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "subject",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "configuration",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "default": "clock_timestamp()",
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "revoked_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      }
    ],
    "indexes": [
      {
        "name": "social_identity_pkey",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX social_identity_pkey ON identity.social_identity USING btree (social_identity_id)"
      },
      {
        "name": "social_identity_provider_issuer_app_scope_subject_key",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX social_identity_provider_issuer_app_scope_subject_key ON identity.social_identity USING btree (provider, issuer, app_scope, subject)"
      },
      {
        "name": "social_one_active_provider_per_account",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX social_one_active_provider_per_account ON identity.social_identity USING btree (user_id, provider) WHERE (revoked_at IS NULL)"
      }
    ],
    "constraints": [
      {
        "name": "social_identity_app_scope_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL app_scope"
      },
      {
        "name": "social_identity_configuration_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((configuration ~ '^sha256:[0-9a-f]{64}$'::text))"
      },
      {
        "name": "social_identity_configuration_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL configuration"
      },
      {
        "name": "social_identity_created_at_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL created_at"
      },
      {
        "name": "social_identity_issuer_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL issuer"
      },
      {
        "name": "social_identity_pkey",
        "type": "p",
        "validated": true,
        "definition": "PRIMARY KEY (social_identity_id)"
      },
      {
        "name": "social_identity_provider_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((provider = ANY (ARRAY['google'::text, 'apple'::text, 'facebook'::text, 'x'::text])))"
      },
      {
        "name": "social_identity_provider_issuer_app_scope_subject_key",
        "type": "u",
        "validated": true,
        "definition": "UNIQUE (provider, issuer, app_scope, subject)"
      },
      {
        "name": "social_identity_provider_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL provider"
      },
      {
        "name": "social_identity_social_identity_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL social_identity_id"
      },
      {
        "name": "social_identity_subject_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK (((length(subject) >= 1) AND (length(subject) <= 255)))"
      },
      {
        "name": "social_identity_subject_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL subject"
      },
      {
        "name": "social_identity_user_id_fkey",
        "type": "f",
        "validated": true,
        "definition": "FOREIGN KEY (user_id) REFERENCES identity.\"user\"(user_id) ON DELETE CASCADE"
      },
      {
        "name": "social_identity_user_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL user_id"
      },
      {
        "name": "social_password_origin_link",
        "type": "t",
        "validated": true,
        "definition": "TRIGGER DEFERRABLE INITIALLY DEFERRED"
      }
    ]
  },
  "identity.social_enrollment": {
    "columns": [
      {
        "name": "token_hash",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "user_id",
        "type": "uuid",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "channel_binding_id",
        "type": "uuid",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "social_identity_id",
        "type": "uuid",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "cookie_hash",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "binding_hash",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "security_epoch",
        "type": "bigint",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "expires_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "consumed_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      }
    ],
    "indexes": [
      {
        "name": "social_enrollment_pkey",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX social_enrollment_pkey ON identity.social_enrollment USING btree (token_hash)"
      },
      {
        "name": "social_one_initial_enrollment_per_account",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX social_one_initial_enrollment_per_account ON identity.social_enrollment USING btree (user_id)"
      }
    ],
    "constraints": [
      {
        "name": "social_enrollment_binding_hash_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((binding_hash ~ '^sha256:[0-9a-f]{64}$'::text))"
      },
      {
        "name": "social_enrollment_binding_hash_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL binding_hash"
      },
      {
        "name": "social_enrollment_channel_binding_id_fkey",
        "type": "f",
        "validated": true,
        "definition": "FOREIGN KEY (channel_binding_id) REFERENCES identity.channel_binding(channel_binding_id) ON DELETE CASCADE"
      },
      {
        "name": "social_enrollment_channel_binding_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL channel_binding_id"
      },
      {
        "name": "social_enrollment_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK (((expires_at > created_at) AND (expires_at <= (created_at + '00:05:00'::interval))))"
      },
      {
        "name": "social_enrollment_cookie_hash_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((cookie_hash ~ '^sha256:[0-9a-f]{64}$'::text))"
      },
      {
        "name": "social_enrollment_cookie_hash_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL cookie_hash"
      },
      {
        "name": "social_enrollment_created_at_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL created_at"
      },
      {
        "name": "social_enrollment_expires_at_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL expires_at"
      },
      {
        "name": "social_enrollment_pkey",
        "type": "p",
        "validated": true,
        "definition": "PRIMARY KEY (token_hash)"
      },
      {
        "name": "social_enrollment_security_epoch_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL security_epoch"
      },
      {
        "name": "social_enrollment_social_identity_id_fkey",
        "type": "f",
        "validated": true,
        "definition": "FOREIGN KEY (social_identity_id) REFERENCES identity.social_identity(social_identity_id) ON DELETE CASCADE"
      },
      {
        "name": "social_enrollment_social_identity_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL social_identity_id"
      },
      {
        "name": "social_enrollment_token_hash_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((token_hash ~ '^sha256:[0-9a-f]{64}$'::text))"
      },
      {
        "name": "social_enrollment_token_hash_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL token_hash"
      },
      {
        "name": "social_enrollment_user_id_fkey",
        "type": "f",
        "validated": true,
        "definition": "FOREIGN KEY (user_id) REFERENCES identity.\"user\"(user_id) ON DELETE CASCADE"
      },
      {
        "name": "social_enrollment_user_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL user_id"
      }
    ]
  },
  "identity.consumer_recovery_gate": {
    "columns": [
      {
        "name": "user_id",
        "type": "uuid",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "epoch",
        "type": "bigint",
        "default": "0",
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "active",
        "type": "boolean",
        "default": "false",
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "cap_hash",
        "type": "text",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "cap_issued_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "cap_expires_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "method",
        "type": "text",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "channel_binding_id",
        "type": "uuid",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "channel_ciphertext",
        "type": "jsonb",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "hold_epoch",
        "type": "bigint",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      }
    ],
    "indexes": [
      {
        "name": "consumer_recovery_gate_cap_hash_key",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX consumer_recovery_gate_cap_hash_key ON identity.consumer_recovery_gate USING btree (cap_hash)"
      },
      {
        "name": "consumer_recovery_gate_pkey",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX consumer_recovery_gate_pkey ON identity.consumer_recovery_gate USING btree (user_id)"
      }
    ],
    "constraints": [
      {
        "name": "consumer_recovery_gate_active_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL active"
      },
      {
        "name": "consumer_recovery_gate_cap_hash_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((cap_hash ~ '^sha256:[0-9a-f]{64}$'::text))"
      },
      {
        "name": "consumer_recovery_gate_cap_hash_key",
        "type": "u",
        "validated": true,
        "definition": "UNIQUE (cap_hash)"
      },
      {
        "name": "consumer_recovery_gate_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK (((NOT active) OR ((cap_hash IS NOT NULL) AND (cap_issued_at IS NOT NULL) AND (cap_expires_at <= (cap_issued_at + '00:05:00'::interval)) AND (method IS NOT NULL) AND (channel_binding_id IS NOT NULL))))"
      },
      {
        "name": "consumer_recovery_gate_epoch_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL epoch"
      },
      {
        "name": "consumer_recovery_gate_method_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((method = ANY (ARRAY['passkey'::text, 'totp'::text])))"
      },
      {
        "name": "consumer_recovery_gate_pkey",
        "type": "p",
        "validated": true,
        "definition": "PRIMARY KEY (user_id)"
      },
      {
        "name": "consumer_recovery_gate_user_id_fkey",
        "type": "f",
        "validated": true,
        "definition": "FOREIGN KEY (user_id) REFERENCES identity.\"user\"(user_id) ON DELETE CASCADE"
      },
      {
        "name": "consumer_recovery_gate_user_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL user_id"
      }
    ]
  },
  "identity.password_recovery_feed": {
    "columns": [
      {
        "name": "event_id",
        "type": "uuid",
        "default": "gen_random_uuid()",
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "user_id",
        "type": "uuid",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "recovery_request_id",
        "type": "uuid",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "event_kind",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "occurred_at",
        "type": "timestamp with time zone",
        "default": "clock_timestamp()",
        "notNull": true,
        "identity": "",
        "generated": ""
      }
    ],
    "indexes": [
      {
        "name": "password_recovery_feed_pkey",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX password_recovery_feed_pkey ON identity.password_recovery_feed USING btree (event_id)"
      },
      {
        "name": "password_recovery_feed_recovery_request_id_event_kind_key",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX password_recovery_feed_recovery_request_id_event_kind_key ON identity.password_recovery_feed USING btree (recovery_request_id, event_kind)"
      }
    ],
    "constraints": [
      {
        "name": "password_recovery_feed_event_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL event_id"
      },
      {
        "name": "password_recovery_feed_event_kind_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((event_kind = ANY (ARRAY['STARTED'::text, 'COMPLETED'::text, 'CANCELLED'::text, 'REFUSED'::text])))"
      },
      {
        "name": "password_recovery_feed_event_kind_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL event_kind"
      },
      {
        "name": "password_recovery_feed_occurred_at_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL occurred_at"
      },
      {
        "name": "password_recovery_feed_pkey",
        "type": "p",
        "validated": true,
        "definition": "PRIMARY KEY (event_id)"
      },
      {
        "name": "password_recovery_feed_recovery_request_id_event_kind_key",
        "type": "u",
        "validated": true,
        "definition": "UNIQUE (recovery_request_id, event_kind)"
      },
      {
        "name": "password_recovery_feed_recovery_request_id_fkey",
        "type": "f",
        "validated": true,
        "definition": "FOREIGN KEY (recovery_request_id) REFERENCES identity.account_recovery_request(recovery_request_id)"
      },
      {
        "name": "password_recovery_feed_recovery_request_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL recovery_request_id"
      },
      {
        "name": "password_recovery_feed_user_id_fkey",
        "type": "f",
        "validated": true,
        "definition": "FOREIGN KEY (user_id) REFERENCES identity.\"user\"(user_id) ON DELETE CASCADE"
      },
      {
        "name": "password_recovery_feed_user_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL user_id"
      }
    ]
  },
  "identity.recovery_email_request": {
    "columns": [
      {
        "name": "recovery_email_request_id",
        "type": "uuid",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "user_id",
        "type": "uuid",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "candidate_blind_index",
        "type": "bytea",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "candidate_ciphertext",
        "type": "jsonb",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "confirm_token_hash",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "issued_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "expires_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "closed_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "outcome",
        "type": "text",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      }
    ],
    "indexes": [
      {
        "name": "recovery_email_one_open",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX recovery_email_one_open ON identity.recovery_email_request USING btree (user_id) WHERE (closed_at IS NULL)"
      },
      {
        "name": "recovery_email_request_confirm_token_hash_key",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX recovery_email_request_confirm_token_hash_key ON identity.recovery_email_request USING btree (confirm_token_hash)"
      },
      {
        "name": "recovery_email_request_pkey",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX recovery_email_request_pkey ON identity.recovery_email_request USING btree (recovery_email_request_id)"
      }
    ],
    "constraints": [
      {
        "name": "recovery_email_request_candidate_blind_index_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((octet_length(candidate_blind_index) = 32))"
      },
      {
        "name": "recovery_email_request_candidate_blind_index_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL candidate_blind_index"
      },
      {
        "name": "recovery_email_request_candidate_ciphertext_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK (core.is_content_envelope(candidate_ciphertext))"
      },
      {
        "name": "recovery_email_request_candidate_ciphertext_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL candidate_ciphertext"
      },
      {
        "name": "recovery_email_request_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK (((closed_at IS NULL) = (outcome IS NULL)))"
      },
      {
        "name": "recovery_email_request_confirm_token_hash_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((confirm_token_hash ~ '^sha256:[0-9a-f]{64}$'::text))"
      },
      {
        "name": "recovery_email_request_confirm_token_hash_key",
        "type": "u",
        "validated": true,
        "definition": "UNIQUE (confirm_token_hash)"
      },
      {
        "name": "recovery_email_request_confirm_token_hash_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL confirm_token_hash"
      },
      {
        "name": "recovery_email_request_expires_at_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL expires_at"
      },
      {
        "name": "recovery_email_request_issued_at_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL issued_at"
      },
      {
        "name": "recovery_email_request_outcome_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((outcome = ANY (ARRAY['CONFIRMED'::text, 'SUPERSEDED'::text, 'REMOVED'::text, 'EXPIRED'::text, 'INVALID'::text])))"
      },
      {
        "name": "recovery_email_request_pkey",
        "type": "p",
        "validated": true,
        "definition": "PRIMARY KEY (recovery_email_request_id)"
      },
      {
        "name": "recovery_email_request_recovery_email_request_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL recovery_email_request_id"
      },
      {
        "name": "recovery_email_request_user_id_fkey",
        "type": "f",
        "validated": true,
        "definition": "FOREIGN KEY (user_id) REFERENCES identity.\"user\"(user_id) ON DELETE CASCADE"
      },
      {
        "name": "recovery_email_request_user_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL user_id"
      }
    ]
  },
  "identity.consumer_recovery_token": {
    "columns": [
      {
        "name": "token_hash",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "user_id",
        "type": "uuid",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "channel_binding_id",
        "type": "uuid",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "channel_ciphertext",
        "type": "jsonb",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "recovery_epoch",
        "type": "bigint",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "hold_epoch",
        "type": "bigint",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "issued_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "expires_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "consumed_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      }
    ],
    "indexes": [
      {
        "name": "consumer_recovery_token_pkey",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX consumer_recovery_token_pkey ON identity.consumer_recovery_token USING btree (token_hash)"
      }
    ],
    "constraints": [
      {
        "name": "consumer_recovery_token_channel_binding_id_fkey",
        "type": "f",
        "validated": true,
        "definition": "FOREIGN KEY (channel_binding_id) REFERENCES identity.channel_binding(channel_binding_id) ON DELETE CASCADE"
      },
      {
        "name": "consumer_recovery_token_channel_binding_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL channel_binding_id"
      },
      {
        "name": "consumer_recovery_token_channel_ciphertext_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL channel_ciphertext"
      },
      {
        "name": "consumer_recovery_token_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((expires_at = (issued_at + '00:15:00'::interval)))"
      },
      {
        "name": "consumer_recovery_token_expires_at_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL expires_at"
      },
      {
        "name": "consumer_recovery_token_hold_epoch_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL hold_epoch"
      },
      {
        "name": "consumer_recovery_token_issued_at_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL issued_at"
      },
      {
        "name": "consumer_recovery_token_pkey",
        "type": "p",
        "validated": true,
        "definition": "PRIMARY KEY (token_hash)"
      },
      {
        "name": "consumer_recovery_token_recovery_epoch_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL recovery_epoch"
      },
      {
        "name": "consumer_recovery_token_token_hash_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((token_hash ~ '^sha256:[0-9a-f]{64}$'::text))"
      },
      {
        "name": "consumer_recovery_token_token_hash_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL token_hash"
      },
      {
        "name": "consumer_recovery_token_user_id_fkey",
        "type": "f",
        "validated": true,
        "definition": "FOREIGN KEY (user_id) REFERENCES identity.\"user\"(user_id) ON DELETE CASCADE"
      },
      {
        "name": "consumer_recovery_token_user_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL user_id"
      }
    ]
  },
  "identity.consumer_passkey_subject": {
    "columns": [
      {
        "name": "user_id",
        "type": "uuid",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "user_handle",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      }
    ],
    "indexes": [
      {
        "name": "consumer_passkey_subject_pkey",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX consumer_passkey_subject_pkey ON identity.consumer_passkey_subject USING btree (user_id)"
      },
      {
        "name": "consumer_passkey_subject_user_handle_key",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX consumer_passkey_subject_user_handle_key ON identity.consumer_passkey_subject USING btree (user_handle)"
      }
    ],
    "constraints": [
      {
        "name": "consumer_passkey_subject_pkey",
        "type": "p",
        "validated": true,
        "definition": "PRIMARY KEY (user_id)"
      },
      {
        "name": "consumer_passkey_subject_user_handle_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((user_handle ~ '^[A-Za-z0-9_-]{43}$'::text))"
      },
      {
        "name": "consumer_passkey_subject_user_handle_key",
        "type": "u",
        "validated": true,
        "definition": "UNIQUE (user_handle)"
      },
      {
        "name": "consumer_passkey_subject_user_handle_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL user_handle"
      },
      {
        "name": "consumer_passkey_subject_user_id_fkey",
        "type": "f",
        "validated": true,
        "definition": "FOREIGN KEY (user_id) REFERENCES identity.\"user\"(user_id) ON DELETE CASCADE"
      },
      {
        "name": "consumer_passkey_subject_user_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL user_id"
      }
    ]
  },
  "identity.consumer_security_notice": {
    "columns": [
      {
        "name": "notice_id",
        "type": "uuid",
        "default": "gen_random_uuid()",
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "user_id",
        "type": "uuid",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "channel_binding_id",
        "type": "uuid",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "channel_ciphertext",
        "type": "jsonb",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "event_kind",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "revision",
        "type": "bigint",
        "default": "1",
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "happened_at",
        "type": "timestamp with time zone",
        "default": "clock_timestamp()",
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "available_at",
        "type": "timestamp with time zone",
        "default": "clock_timestamp()",
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "claim_token",
        "type": "uuid",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "claim_revision",
        "type": "bigint",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "claim_expires_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "failure_code",
        "type": "text",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "claim_happened_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      }
    ],
    "indexes": [
      {
        "name": "consumer_security_notice_pkey",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX consumer_security_notice_pkey ON identity.consumer_security_notice USING btree (notice_id)"
      },
      {
        "name": "consumer_security_notice_user_id_channel_binding_id_event_k_key",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX consumer_security_notice_user_id_channel_binding_id_event_k_key ON identity.consumer_security_notice USING btree (user_id, channel_binding_id, event_kind)"
      }
    ],
    "constraints": [
      {
        "name": "consumer_security_notice_available_at_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL available_at"
      },
      {
        "name": "consumer_security_notice_channel_binding_id_fkey",
        "type": "f",
        "validated": true,
        "definition": "FOREIGN KEY (channel_binding_id) REFERENCES identity.channel_binding(channel_binding_id) ON DELETE CASCADE"
      },
      {
        "name": "consumer_security_notice_channel_binding_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL channel_binding_id"
      },
      {
        "name": "consumer_security_notice_channel_ciphertext_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL channel_ciphertext"
      },
      {
        "name": "consumer_security_notice_event_kind_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((event_kind = ANY (ARRAY['METHOD_CHANGED'::text, 'CODES_REGENERATED'::text, 'RECOVERY_PROVED'::text, 'RECOVERY_COMPLETED'::text])))"
      },
      {
        "name": "consumer_security_notice_event_kind_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL event_kind"
      },
      {
        "name": "consumer_security_notice_failure_code_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((failure_code = ANY (ARRAY['MAIL_TRANSPORT_FAILED'::text, 'MAIL_INPUT_INVALID'::text, 'MAIL_TEMPORARILY_UNAVAILABLE'::text])))"
      },
      {
        "name": "consumer_security_notice_happened_at_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL happened_at"
      },
      {
        "name": "consumer_security_notice_notice_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL notice_id"
      },
      {
        "name": "consumer_security_notice_pkey",
        "type": "p",
        "validated": true,
        "definition": "PRIMARY KEY (notice_id)"
      },
      {
        "name": "consumer_security_notice_revision_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL revision"
      },
      {
        "name": "consumer_security_notice_user_id_channel_binding_id_event_k_key",
        "type": "u",
        "validated": true,
        "definition": "UNIQUE (user_id, channel_binding_id, event_kind)"
      },
      {
        "name": "consumer_security_notice_user_id_fkey",
        "type": "f",
        "validated": true,
        "definition": "FOREIGN KEY (user_id) REFERENCES identity.\"user\"(user_id) ON DELETE CASCADE"
      },
      {
        "name": "consumer_security_notice_user_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL user_id"
      }
    ]
  },
  "identity.consumer_totp_enrollment": {
    "columns": [
      {
        "name": "user_id",
        "type": "uuid",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "factor_id",
        "type": "uuid",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "handle_hash",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "retention_hash",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "binding_hash",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "ordinary_session_id",
        "type": "uuid",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "ordinary_token_hash",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "account_security_epoch",
        "type": "bigint",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "expires_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "consumed_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      }
    ],
    "indexes": [
      {
        "name": "consumer_totp_enrollment_expiry",
        "valid": true,
        "definition": "CREATE INDEX consumer_totp_enrollment_expiry ON identity.consumer_totp_enrollment USING btree (expires_at)"
      },
      {
        "name": "consumer_totp_enrollment_factor_id_key",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX consumer_totp_enrollment_factor_id_key ON identity.consumer_totp_enrollment USING btree (factor_id)"
      },
      {
        "name": "consumer_totp_enrollment_handle_hash_key",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX consumer_totp_enrollment_handle_hash_key ON identity.consumer_totp_enrollment USING btree (handle_hash)"
      },
      {
        "name": "consumer_totp_enrollment_pkey",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX consumer_totp_enrollment_pkey ON identity.consumer_totp_enrollment USING btree (user_id)"
      },
      {
        "name": "consumer_totp_enrollment_source",
        "valid": true,
        "definition": "CREATE INDEX consumer_totp_enrollment_source ON identity.consumer_totp_enrollment USING btree (retention_hash)"
      }
    ],
    "constraints": [
      {
        "name": "consumer_totp_enrollment_account_security_epoch_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL account_security_epoch"
      },
      {
        "name": "consumer_totp_enrollment_binding_hash_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((binding_hash ~ '^sha256:[0-9a-f]{64}$'::text))"
      },
      {
        "name": "consumer_totp_enrollment_binding_hash_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL binding_hash"
      },
      {
        "name": "consumer_totp_enrollment_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK (((expires_at > created_at) AND (expires_at <= (created_at + '00:05:00'::interval))))"
      },
      {
        "name": "consumer_totp_enrollment_created_at_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL created_at"
      },
      {
        "name": "consumer_totp_enrollment_expires_at_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL expires_at"
      },
      {
        "name": "consumer_totp_enrollment_factor_id_fkey",
        "type": "f",
        "validated": true,
        "definition": "FOREIGN KEY (factor_id) REFERENCES identity.mfa_factor(mfa_factor_id) ON DELETE CASCADE"
      },
      {
        "name": "consumer_totp_enrollment_factor_id_key",
        "type": "u",
        "validated": true,
        "definition": "UNIQUE (factor_id)"
      },
      {
        "name": "consumer_totp_enrollment_factor_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL factor_id"
      },
      {
        "name": "consumer_totp_enrollment_handle_hash_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((handle_hash ~ '^sha256:[0-9a-f]{64}$'::text))"
      },
      {
        "name": "consumer_totp_enrollment_handle_hash_key",
        "type": "u",
        "validated": true,
        "definition": "UNIQUE (handle_hash)"
      },
      {
        "name": "consumer_totp_enrollment_handle_hash_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL handle_hash"
      },
      {
        "name": "consumer_totp_enrollment_ordinary_session_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL ordinary_session_id"
      },
      {
        "name": "consumer_totp_enrollment_ordinary_token_hash_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((ordinary_token_hash ~ '^sha256:[0-9a-f]{64}$'::text))"
      },
      {
        "name": "consumer_totp_enrollment_ordinary_token_hash_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL ordinary_token_hash"
      },
      {
        "name": "consumer_totp_enrollment_pkey",
        "type": "p",
        "validated": true,
        "definition": "PRIMARY KEY (user_id)"
      },
      {
        "name": "consumer_totp_enrollment_retention_hash_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((retention_hash ~ '^sha256:[0-9a-f]{64}$'::text))"
      },
      {
        "name": "consumer_totp_enrollment_retention_hash_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL retention_hash"
      },
      {
        "name": "consumer_totp_enrollment_user_id_fkey",
        "type": "f",
        "validated": true,
        "definition": "FOREIGN KEY (user_id) REFERENCES identity.\"user\"(user_id) ON DELETE CASCADE"
      },
      {
        "name": "consumer_totp_enrollment_user_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL user_id"
      }
    ]
  },
  "identity.password_recovery_notice": {
    "columns": [
      {
        "name": "notice_id",
        "type": "uuid",
        "default": "gen_random_uuid()",
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "recovery_request_id",
        "type": "uuid",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "user_id",
        "type": "uuid",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "channel_id",
        "type": "uuid",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "event_kind",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "payload_ciphertext",
        "type": "jsonb",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "default": "clock_timestamp()",
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "available_at",
        "type": "timestamp with time zone",
        "default": "clock_timestamp()",
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "lease_id",
        "type": "uuid",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "lease_until",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "attempts",
        "type": "integer",
        "default": "0",
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "sent_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "dead_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      }
    ],
    "indexes": [
      {
        "name": "password_recovery_notice_due",
        "valid": true,
        "definition": "CREATE INDEX password_recovery_notice_due ON identity.password_recovery_notice USING btree (available_at, created_at, notice_id) WHERE ((sent_at IS NULL) AND (dead_at IS NULL))"
      },
      {
        "name": "password_recovery_notice_pkey",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX password_recovery_notice_pkey ON identity.password_recovery_notice USING btree (notice_id)"
      },
      {
        "name": "password_recovery_notice_recovery_request_id_channel_id_eve_key",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX password_recovery_notice_recovery_request_id_channel_id_eve_key ON identity.password_recovery_notice USING btree (recovery_request_id, channel_id, event_kind)"
      }
    ],
    "constraints": [
      {
        "name": "password_recovery_notice_attempts_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL attempts"
      },
      {
        "name": "password_recovery_notice_available_at_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL available_at"
      },
      {
        "name": "password_recovery_notice_channel_id_fkey",
        "type": "f",
        "validated": true,
        "definition": "FOREIGN KEY (channel_id) REFERENCES identity.channel_binding(channel_binding_id)"
      },
      {
        "name": "password_recovery_notice_channel_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL channel_id"
      },
      {
        "name": "password_recovery_notice_created_at_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL created_at"
      },
      {
        "name": "password_recovery_notice_event_kind_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((event_kind = ANY (ARRAY['PROOF'::text, 'STARTED'::text, 'COMPLETED'::text, 'CANCELLED'::text, 'REFUSED'::text])))"
      },
      {
        "name": "password_recovery_notice_event_kind_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL event_kind"
      },
      {
        "name": "password_recovery_notice_notice_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL notice_id"
      },
      {
        "name": "password_recovery_notice_payload_ciphertext_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK (core.is_content_envelope(payload_ciphertext))"
      },
      {
        "name": "password_recovery_notice_payload_ciphertext_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL payload_ciphertext"
      },
      {
        "name": "password_recovery_notice_pkey",
        "type": "p",
        "validated": true,
        "definition": "PRIMARY KEY (notice_id)"
      },
      {
        "name": "password_recovery_notice_recovery_request_id_channel_id_eve_key",
        "type": "u",
        "validated": true,
        "definition": "UNIQUE (recovery_request_id, channel_id, event_kind)"
      },
      {
        "name": "password_recovery_notice_recovery_request_id_fkey",
        "type": "f",
        "validated": true,
        "definition": "FOREIGN KEY (recovery_request_id) REFERENCES identity.account_recovery_request(recovery_request_id)"
      },
      {
        "name": "password_recovery_notice_recovery_request_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL recovery_request_id"
      },
      {
        "name": "password_recovery_notice_user_id_fkey",
        "type": "f",
        "validated": true,
        "definition": "FOREIGN KEY (user_id) REFERENCES identity.\"user\"(user_id) ON DELETE CASCADE"
      },
      {
        "name": "password_recovery_notice_user_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL user_id"
      }
    ]
  },
  "identity.password_recovery_control": {
    "columns": [
      {
        "name": "recovery_request_id",
        "type": "uuid",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "user_id",
        "type": "uuid",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "generation",
        "type": "uuid",
        "default": "gen_random_uuid()",
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "register_version",
        "type": "bigint",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "policy",
        "type": "jsonb",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "password_snapshot",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "security_epoch",
        "type": "bigint",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "channel_id",
        "type": "uuid",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "channel_snapshot",
        "type": "jsonb",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "original_factor_id",
        "type": "uuid",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "factor_snapshot",
        "type": "jsonb",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "link_hash",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "cancel_hash",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "link_used_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "session_hash",
        "type": "text",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "csrf_hash",
        "type": "text",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "expires_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "stage",
        "type": "text",
        "default": "'EMAIL_REQUIRED'::text",
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "failures",
        "type": "integer",
        "default": "0",
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "saved_code_id",
        "type": "uuid",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "saved_code_snapshot",
        "type": "text",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "new_factor_id",
        "type": "uuid",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "new_password_hash",
        "type": "text",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "completed_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "monitor_until",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      }
    ],
    "indexes": [
      {
        "name": "password_recovery_control_cancel_hash_key",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX password_recovery_control_cancel_hash_key ON identity.password_recovery_control USING btree (cancel_hash)"
      },
      {
        "name": "password_recovery_control_generation_key",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX password_recovery_control_generation_key ON identity.password_recovery_control USING btree (generation)"
      },
      {
        "name": "password_recovery_control_link_hash_key",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX password_recovery_control_link_hash_key ON identity.password_recovery_control USING btree (link_hash)"
      },
      {
        "name": "password_recovery_control_pkey",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX password_recovery_control_pkey ON identity.password_recovery_control USING btree (recovery_request_id)"
      },
      {
        "name": "password_recovery_control_session_hash_key",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX password_recovery_control_session_hash_key ON identity.password_recovery_control USING btree (session_hash)"
      },
      {
        "name": "password_recovery_control_user",
        "valid": true,
        "definition": "CREATE INDEX password_recovery_control_user ON identity.password_recovery_control USING btree (user_id, expires_at)"
      }
    ],
    "constraints": [
      {
        "name": "password_recovery_control_cancel_hash_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((cancel_hash ~ '^sha256:[0-9a-f]{64}$'::text))"
      },
      {
        "name": "password_recovery_control_cancel_hash_key",
        "type": "u",
        "validated": true,
        "definition": "UNIQUE (cancel_hash)"
      },
      {
        "name": "password_recovery_control_cancel_hash_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL cancel_hash"
      },
      {
        "name": "password_recovery_control_channel_id_fkey",
        "type": "f",
        "validated": true,
        "definition": "FOREIGN KEY (channel_id) REFERENCES identity.channel_binding(channel_binding_id)"
      },
      {
        "name": "password_recovery_control_channel_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL channel_id"
      },
      {
        "name": "password_recovery_control_channel_snapshot_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL channel_snapshot"
      },
      {
        "name": "password_recovery_control_csrf_hash_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((csrf_hash ~ '^sha256:[0-9a-f]{64}$'::text))"
      },
      {
        "name": "password_recovery_control_expires_at_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL expires_at"
      },
      {
        "name": "password_recovery_control_factor_snapshot_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL factor_snapshot"
      },
      {
        "name": "password_recovery_control_failures_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((failures >= 0))"
      },
      {
        "name": "password_recovery_control_failures_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL failures"
      },
      {
        "name": "password_recovery_control_generation_key",
        "type": "u",
        "validated": true,
        "definition": "UNIQUE (generation)"
      },
      {
        "name": "password_recovery_control_generation_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL generation"
      },
      {
        "name": "password_recovery_control_link_hash_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((link_hash ~ '^sha256:[0-9a-f]{64}$'::text))"
      },
      {
        "name": "password_recovery_control_link_hash_key",
        "type": "u",
        "validated": true,
        "definition": "UNIQUE (link_hash)"
      },
      {
        "name": "password_recovery_control_link_hash_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL link_hash"
      },
      {
        "name": "password_recovery_control_new_factor_id_fkey",
        "type": "f",
        "validated": true,
        "definition": "FOREIGN KEY (new_factor_id) REFERENCES identity.mfa_factor(mfa_factor_id)"
      },
      {
        "name": "password_recovery_control_original_factor_id_fkey",
        "type": "f",
        "validated": true,
        "definition": "FOREIGN KEY (original_factor_id) REFERENCES identity.mfa_factor(mfa_factor_id)"
      },
      {
        "name": "password_recovery_control_original_factor_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL original_factor_id"
      },
      {
        "name": "password_recovery_control_password_snapshot_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL password_snapshot"
      },
      {
        "name": "password_recovery_control_pkey",
        "type": "p",
        "validated": true,
        "definition": "PRIMARY KEY (recovery_request_id)"
      },
      {
        "name": "password_recovery_control_policy_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL policy"
      },
      {
        "name": "password_recovery_control_recovery_request_id_fkey",
        "type": "f",
        "validated": true,
        "definition": "FOREIGN KEY (recovery_request_id) REFERENCES identity.account_recovery_request(recovery_request_id)"
      },
      {
        "name": "password_recovery_control_recovery_request_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL recovery_request_id"
      },
      {
        "name": "password_recovery_control_register_version_fkey",
        "type": "f",
        "validated": true,
        "definition": "FOREIGN KEY (register_version) REFERENCES register.register_version(register_version)"
      },
      {
        "name": "password_recovery_control_register_version_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL register_version"
      },
      {
        "name": "password_recovery_control_saved_code_id_fkey",
        "type": "f",
        "validated": true,
        "definition": "FOREIGN KEY (saved_code_id) REFERENCES identity.recovery_code(recovery_code_id)"
      },
      {
        "name": "password_recovery_control_security_epoch_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL security_epoch"
      },
      {
        "name": "password_recovery_control_session_hash_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((session_hash ~ '^sha256:[0-9a-f]{64}$'::text))"
      },
      {
        "name": "password_recovery_control_session_hash_key",
        "type": "u",
        "validated": true,
        "definition": "UNIQUE (session_hash)"
      },
      {
        "name": "password_recovery_control_stage_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((stage = ANY (ARRAY['EMAIL_REQUIRED'::text, 'CODE_REQUIRED'::text, 'FACTOR_REQUIRED'::text, 'TOTP_REQUIRED'::text, 'CODES_REQUIRED'::text, 'ACK_REQUIRED'::text, 'READY'::text, 'COMPLETED'::text, 'CANCELLED'::text, 'REFUSED'::text, 'EXPIRED'::text])))"
      },
      {
        "name": "password_recovery_control_stage_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL stage"
      },
      {
        "name": "password_recovery_control_user_id_fkey",
        "type": "f",
        "validated": true,
        "definition": "FOREIGN KEY (user_id) REFERENCES identity.\"user\"(user_id) ON DELETE CASCADE"
      },
      {
        "name": "password_recovery_control_user_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL user_id"
      }
    ]
  },
  "identity.consumer_passkey_challenge": {
    "columns": [
      {
        "name": "challenge_id",
        "type": "uuid",
        "default": "gen_random_uuid()",
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "handle_hash",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "retention_hash",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "options_base_bytes",
        "type": "integer",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "challenge_hash",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "purpose",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "user_id",
        "type": "uuid",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "binding_hash",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "rp_id",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "origin",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "enrollment_token_hash",
        "type": "text",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "ordinary_session_id",
        "type": "uuid",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "ordinary_token_hash",
        "type": "text",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "continuation_hash",
        "type": "text",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "account_security_epoch",
        "type": "bigint",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "default": "clock_timestamp()",
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "expires_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "consumed_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "social_enrollment_hash",
        "type": "text",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      }
    ],
    "indexes": [
      {
        "name": "consumer_passkey_challenge_expiry",
        "valid": true,
        "definition": "CREATE INDEX consumer_passkey_challenge_expiry ON identity.consumer_passkey_challenge USING btree (expires_at)"
      },
      {
        "name": "consumer_passkey_challenge_handle_hash_key",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX consumer_passkey_challenge_handle_hash_key ON identity.consumer_passkey_challenge USING btree (handle_hash)"
      },
      {
        "name": "consumer_passkey_challenge_pkey",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX consumer_passkey_challenge_pkey ON identity.consumer_passkey_challenge USING btree (challenge_id)"
      },
      {
        "name": "consumer_passkey_challenge_source",
        "valid": true,
        "definition": "CREATE INDEX consumer_passkey_challenge_source ON identity.consumer_passkey_challenge USING btree (retention_hash, purpose, created_at)"
      },
      {
        "name": "consumer_passkey_challenge_user",
        "valid": true,
        "definition": "CREATE INDEX consumer_passkey_challenge_user ON identity.consumer_passkey_challenge USING btree (user_id)"
      }
    ],
    "constraints": [
      {
        "name": "consumer_passkey_challenge_binding_hash_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((binding_hash ~ '^sha256:[0-9a-f]{64}$'::text))"
      },
      {
        "name": "consumer_passkey_challenge_binding_hash_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL binding_hash"
      },
      {
        "name": "consumer_passkey_challenge_challenge_hash_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((challenge_hash ~ '^sha256:[0-9a-f]{64}$'::text))"
      },
      {
        "name": "consumer_passkey_challenge_challenge_hash_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL challenge_hash"
      },
      {
        "name": "consumer_passkey_challenge_challenge_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL challenge_id"
      },
      {
        "name": "consumer_passkey_challenge_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((expires_at <= (created_at + '00:05:00'::interval)))"
      },
      {
        "name": "consumer_passkey_challenge_check1",
        "type": "c",
        "validated": true,
        "definition": "CHECK (((purpose = 'LOGIN'::text) = (options_base_bytes IS NULL)))"
      },
      {
        "name": "consumer_passkey_challenge_check2",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((((purpose = 'INITIAL_ENROLLMENT'::text) AND (user_id IS NOT NULL) AND (enrollment_token_hash IS NOT NULL) AND (ordinary_session_id IS NULL) AND (ordinary_token_hash IS NULL) AND (continuation_hash IS NULL)) OR ((purpose = 'ADD_PASSKEY'::text) AND (user_id IS NOT NULL) AND (enrollment_token_hash IS NULL) AND (ordinary_session_id IS NOT NULL) AND (ordinary_token_hash IS NOT NULL) AND (continuation_hash IS NULL)) OR ((purpose = 'LOGIN'::text) AND (enrollment_token_hash IS NULL) AND (ordinary_session_id IS NULL) AND (ordinary_token_hash IS NULL))))"
      },
      {
        "name": "consumer_passkey_challenge_created_at_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL created_at"
      },
      {
        "name": "consumer_passkey_challenge_expires_at_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL expires_at"
      },
      {
        "name": "consumer_passkey_challenge_handle_hash_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((handle_hash ~ '^sha256:[0-9a-f]{64}$'::text))"
      },
      {
        "name": "consumer_passkey_challenge_handle_hash_key",
        "type": "u",
        "validated": true,
        "definition": "UNIQUE (handle_hash)"
      },
      {
        "name": "consumer_passkey_challenge_handle_hash_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL handle_hash"
      },
      {
        "name": "consumer_passkey_challenge_options_base_bytes_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK (((options_base_bytes >= 1) AND (options_base_bytes <= 32768)))"
      },
      {
        "name": "consumer_passkey_challenge_origin_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK (((length(origin) >= 1) AND (length(origin) <= 512)))"
      },
      {
        "name": "consumer_passkey_challenge_origin_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL origin"
      },
      {
        "name": "consumer_passkey_challenge_pkey",
        "type": "p",
        "validated": true,
        "definition": "PRIMARY KEY (challenge_id)"
      },
      {
        "name": "consumer_passkey_challenge_purpose_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((purpose = ANY (ARRAY['INITIAL_ENROLLMENT'::text, 'ADD_PASSKEY'::text, 'LOGIN'::text])))"
      },
      {
        "name": "consumer_passkey_challenge_purpose_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL purpose"
      },
      {
        "name": "consumer_passkey_challenge_retention_hash_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((retention_hash ~ '^sha256:[0-9a-f]{64}$'::text))"
      },
      {
        "name": "consumer_passkey_challenge_retention_hash_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL retention_hash"
      },
      {
        "name": "consumer_passkey_challenge_rp_id_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK (((length(rp_id) >= 1) AND (length(rp_id) <= 253)))"
      },
      {
        "name": "consumer_passkey_challenge_rp_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL rp_id"
      },
      {
        "name": "consumer_passkey_challenge_user_id_fkey",
        "type": "f",
        "validated": true,
        "definition": "FOREIGN KEY (user_id) REFERENCES identity.\"user\"(user_id) ON DELETE CASCADE"
      }
    ]
  },
  "identity.consumer_passkey_credential": {
    "columns": [
      {
        "name": "consumer_credential_id",
        "type": "uuid",
        "default": "gen_random_uuid()",
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "user_id",
        "type": "uuid",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "credential_id",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "public_key",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "signature_counter",
        "type": "bigint",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "device_type",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "backed_up",
        "type": "boolean",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "transports",
        "type": "text[]",
        "default": "'{}'::text[]",
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "rp_id",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "origin",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "label",
        "type": "text",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "default": "clock_timestamp()",
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "last_used_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "revoked_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      }
    ],
    "indexes": [
      {
        "name": "consumer_passkey_credential_credential_id_key",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX consumer_passkey_credential_credential_id_key ON identity.consumer_passkey_credential USING btree (credential_id)"
      },
      {
        "name": "consumer_passkey_credential_pkey",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX consumer_passkey_credential_pkey ON identity.consumer_passkey_credential USING btree (consumer_credential_id)"
      },
      {
        "name": "consumer_passkey_user",
        "valid": true,
        "definition": "CREATE INDEX consumer_passkey_user ON identity.consumer_passkey_credential USING btree (user_id)"
      }
    ],
    "constraints": [
      {
        "name": "consumer_passkey_credential_backed_up_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL backed_up"
      },
      {
        "name": "consumer_passkey_credential_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK (((NOT backed_up) OR (device_type = 'multiDevice'::text)))"
      },
      {
        "name": "consumer_passkey_credential_consumer_credential_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL consumer_credential_id"
      },
      {
        "name": "consumer_passkey_credential_created_at_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL created_at"
      },
      {
        "name": "consumer_passkey_credential_credential_id_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK (((credential_id ~ '^[A-Za-z0-9_-]+$'::text) AND ((length(credential_id) >= 1) AND (length(credential_id) <= 1024))))"
      },
      {
        "name": "consumer_passkey_credential_credential_id_key",
        "type": "u",
        "validated": true,
        "definition": "UNIQUE (credential_id)"
      },
      {
        "name": "consumer_passkey_credential_credential_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL credential_id"
      },
      {
        "name": "consumer_passkey_credential_device_type_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((device_type = ANY (ARRAY['singleDevice'::text, 'multiDevice'::text])))"
      },
      {
        "name": "consumer_passkey_credential_device_type_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL device_type"
      },
      {
        "name": "consumer_passkey_credential_label_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK (((length(label) >= 1) AND (length(label) <= 128)))"
      },
      {
        "name": "consumer_passkey_credential_origin_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK (((length(origin) >= 1) AND (length(origin) <= 512)))"
      },
      {
        "name": "consumer_passkey_credential_origin_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL origin"
      },
      {
        "name": "consumer_passkey_credential_pkey",
        "type": "p",
        "validated": true,
        "definition": "PRIMARY KEY (consumer_credential_id)"
      },
      {
        "name": "consumer_passkey_credential_public_key_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK (((public_key ~ '^[A-Za-z0-9_-]+$'::text) AND ((length(public_key) >= 1) AND (length(public_key) <= 16384))))"
      },
      {
        "name": "consumer_passkey_credential_public_key_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL public_key"
      },
      {
        "name": "consumer_passkey_credential_rp_id_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK (((length(rp_id) >= 1) AND (length(rp_id) <= 253)))"
      },
      {
        "name": "consumer_passkey_credential_rp_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL rp_id"
      },
      {
        "name": "consumer_passkey_credential_signature_counter_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK (((signature_counter >= 0) AND (signature_counter <= '4294967295'::bigint)))"
      },
      {
        "name": "consumer_passkey_credential_signature_counter_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL signature_counter"
      },
      {
        "name": "consumer_passkey_credential_transports_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK (((cardinality(transports) <= 7) AND (transports <@ ARRAY['ble'::text, 'cable'::text, 'hybrid'::text, 'internal'::text, 'nfc'::text, 'smart-card'::text, 'usb'::text])))"
      },
      {
        "name": "consumer_passkey_credential_transports_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL transports"
      },
      {
        "name": "consumer_passkey_credential_user_id_fkey",
        "type": "f",
        "validated": true,
        "definition": "FOREIGN KEY (user_id) REFERENCES identity.consumer_passkey_subject(user_id) ON DELETE CASCADE"
      },
      {
        "name": "consumer_passkey_credential_user_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL user_id"
      }
    ]
  },
  "identity.consumer_security_challenge": {
    "columns": [
      {
        "name": "challenge_id",
        "type": "uuid",
        "default": "gen_random_uuid()",
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "user_id",
        "type": "uuid",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "handle_hash",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "challenge_hash",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "binding_hash",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "retention_hash",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "session_id",
        "type": "uuid",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "token_hash",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "security_epoch",
        "type": "bigint",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "purpose",
        "type": "text",
        "default": "'STEP_UP'::text",
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "authorization_binding",
        "type": "jsonb",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "rp_id",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "origin",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "default": "clock_timestamp()",
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "expires_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "consumed_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      }
    ],
    "indexes": [
      {
        "name": "consumer_security_challenge_expiry",
        "valid": true,
        "definition": "CREATE INDEX consumer_security_challenge_expiry ON identity.consumer_security_challenge USING btree (expires_at)"
      },
      {
        "name": "consumer_security_challenge_handle_hash_key",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX consumer_security_challenge_handle_hash_key ON identity.consumer_security_challenge USING btree (handle_hash)"
      },
      {
        "name": "consumer_security_challenge_pkey",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX consumer_security_challenge_pkey ON identity.consumer_security_challenge USING btree (challenge_id)"
      }
    ],
    "constraints": [
      {
        "name": "consumer_security_challenge_authorization_binding_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL authorization_binding"
      },
      {
        "name": "consumer_security_challenge_binding_hash_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((binding_hash ~ '^sha256:[0-9a-f]{64}$'::text))"
      },
      {
        "name": "consumer_security_challenge_binding_hash_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL binding_hash"
      },
      {
        "name": "consumer_security_challenge_challenge_hash_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((challenge_hash ~ '^sha256:[0-9a-f]{64}$'::text))"
      },
      {
        "name": "consumer_security_challenge_challenge_hash_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL challenge_hash"
      },
      {
        "name": "consumer_security_challenge_challenge_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL challenge_id"
      },
      {
        "name": "consumer_security_challenge_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((expires_at <= (created_at + '00:05:00'::interval)))"
      },
      {
        "name": "consumer_security_challenge_created_at_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL created_at"
      },
      {
        "name": "consumer_security_challenge_expires_at_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL expires_at"
      },
      {
        "name": "consumer_security_challenge_handle_hash_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((handle_hash ~ '^sha256:[0-9a-f]{64}$'::text))"
      },
      {
        "name": "consumer_security_challenge_handle_hash_key",
        "type": "u",
        "validated": true,
        "definition": "UNIQUE (handle_hash)"
      },
      {
        "name": "consumer_security_challenge_handle_hash_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL handle_hash"
      },
      {
        "name": "consumer_security_challenge_origin_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL origin"
      },
      {
        "name": "consumer_security_challenge_pkey",
        "type": "p",
        "validated": true,
        "definition": "PRIMARY KEY (challenge_id)"
      },
      {
        "name": "consumer_security_challenge_purpose_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((purpose = 'STEP_UP'::text))"
      },
      {
        "name": "consumer_security_challenge_purpose_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL purpose"
      },
      {
        "name": "consumer_security_challenge_retention_hash_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((retention_hash ~ '^sha256:[0-9a-f]{64}$'::text))"
      },
      {
        "name": "consumer_security_challenge_retention_hash_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL retention_hash"
      },
      {
        "name": "consumer_security_challenge_rp_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL rp_id"
      },
      {
        "name": "consumer_security_challenge_security_epoch_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL security_epoch"
      },
      {
        "name": "consumer_security_challenge_session_id_fkey",
        "type": "f",
        "validated": true,
        "definition": "FOREIGN KEY (session_id) REFERENCES identity.session(session_id) ON DELETE CASCADE"
      },
      {
        "name": "consumer_security_challenge_session_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL session_id"
      },
      {
        "name": "consumer_security_challenge_token_hash_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL token_hash"
      },
      {
        "name": "consumer_security_challenge_user_id_fkey",
        "type": "f",
        "validated": true,
        "definition": "FOREIGN KEY (user_id) REFERENCES identity.\"user\"(user_id) ON DELETE CASCADE"
      },
      {
        "name": "consumer_security_challenge_user_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL user_id"
      }
    ]
  },
  "identity.consumer_recovery_enrollment": {
    "columns": [
      {
        "name": "user_id",
        "type": "uuid",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "epoch",
        "type": "bigint",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "method",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "handle_hash",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "binding_hash",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "challenge_hash",
        "type": "text",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "rp_id",
        "type": "text",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "origin",
        "type": "text",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "factor_id",
        "type": "uuid",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "secret_ciphertext",
        "type": "jsonb",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "password_hash_snapshot",
        "type": "text",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "default": "clock_timestamp()",
        "notNull": true,
        "identity": "",
        "generated": ""
      }
    ],
    "indexes": [
      {
        "name": "consumer_recovery_enrollment_handle_hash_key",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX consumer_recovery_enrollment_handle_hash_key ON identity.consumer_recovery_enrollment USING btree (handle_hash)"
      },
      {
        "name": "consumer_recovery_enrollment_pkey",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX consumer_recovery_enrollment_pkey ON identity.consumer_recovery_enrollment USING btree (user_id)"
      }
    ],
    "constraints": [
      {
        "name": "consumer_recovery_enrollment_binding_hash_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL binding_hash"
      },
      {
        "name": "consumer_recovery_enrollment_created_at_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL created_at"
      },
      {
        "name": "consumer_recovery_enrollment_epoch_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL epoch"
      },
      {
        "name": "consumer_recovery_enrollment_factor_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL factor_id"
      },
      {
        "name": "consumer_recovery_enrollment_handle_hash_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((handle_hash ~ '^sha256:[0-9a-f]{64}$'::text))"
      },
      {
        "name": "consumer_recovery_enrollment_handle_hash_key",
        "type": "u",
        "validated": true,
        "definition": "UNIQUE (handle_hash)"
      },
      {
        "name": "consumer_recovery_enrollment_handle_hash_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL handle_hash"
      },
      {
        "name": "consumer_recovery_enrollment_method_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((method = ANY (ARRAY['passkey'::text, 'totp'::text])))"
      },
      {
        "name": "consumer_recovery_enrollment_method_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL method"
      },
      {
        "name": "consumer_recovery_enrollment_pkey",
        "type": "p",
        "validated": true,
        "definition": "PRIMARY KEY (user_id)"
      },
      {
        "name": "consumer_recovery_enrollment_user_id_fkey",
        "type": "f",
        "validated": true,
        "definition": "FOREIGN KEY (user_id) REFERENCES identity.consumer_recovery_gate(user_id) ON DELETE CASCADE"
      },
      {
        "name": "consumer_recovery_enrollment_user_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL user_id"
      }
    ]
  },
  "identity.password_recovery_retry_lock": {
    "columns": [
      {
        "name": "user_id",
        "type": "uuid",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "locked_until",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      }
    ],
    "indexes": [
      {
        "name": "password_recovery_retry_lock_pkey",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX password_recovery_retry_lock_pkey ON identity.password_recovery_retry_lock USING btree (user_id)"
      }
    ],
    "constraints": [
      {
        "name": "password_recovery_retry_lock_locked_until_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL locked_until"
      },
      {
        "name": "password_recovery_retry_lock_pkey",
        "type": "p",
        "validated": true,
        "definition": "PRIMARY KEY (user_id)"
      },
      {
        "name": "password_recovery_retry_lock_user_id_fkey",
        "type": "f",
        "validated": true,
        "definition": "FOREIGN KEY (user_id) REFERENCES identity.\"user\"(user_id) ON DELETE CASCADE"
      },
      {
        "name": "password_recovery_retry_lock_user_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL user_id"
      }
    ]
  },
  "identity.consumer_recovery_reservation": {
    "columns": [
      {
        "name": "reservation_id",
        "type": "uuid",
        "default": "gen_random_uuid()",
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "user_id",
        "type": "uuid",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "channel_binding_id",
        "type": "uuid",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "reserved_at",
        "type": "timestamp with time zone",
        "default": "clock_timestamp()",
        "notNull": true,
        "identity": "",
        "generated": ""
      }
    ],
    "indexes": [
      {
        "name": "consumer_recovery_reservation_pkey",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX consumer_recovery_reservation_pkey ON identity.consumer_recovery_reservation USING btree (reservation_id)"
      },
      {
        "name": "consumer_recovery_reservation_user",
        "valid": true,
        "definition": "CREATE INDEX consumer_recovery_reservation_user ON identity.consumer_recovery_reservation USING btree (user_id, reserved_at)"
      }
    ],
    "constraints": [
      {
        "name": "consumer_recovery_reservation_channel_binding_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL channel_binding_id"
      },
      {
        "name": "consumer_recovery_reservation_pkey",
        "type": "p",
        "validated": true,
        "definition": "PRIMARY KEY (reservation_id)"
      },
      {
        "name": "consumer_recovery_reservation_reservation_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL reservation_id"
      },
      {
        "name": "consumer_recovery_reservation_reserved_at_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL reserved_at"
      },
      {
        "name": "consumer_recovery_reservation_user_id_fkey",
        "type": "f",
        "validated": true,
        "definition": "FOREIGN KEY (user_id) REFERENCES identity.\"user\"(user_id) ON DELETE CASCADE"
      },
      {
        "name": "consumer_recovery_reservation_user_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL user_id"
      }
    ]
  },
  "identity.password_recovery_staged_code": {
    "columns": [
      {
        "name": "recovery_request_id",
        "type": "uuid",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "slot",
        "type": "smallint",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "code_hash",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      }
    ],
    "indexes": [
      {
        "name": "password_recovery_staged_code_pkey",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX password_recovery_staged_code_pkey ON identity.password_recovery_staged_code USING btree (recovery_request_id, slot)"
      },
      {
        "name": "password_recovery_staged_code_recovery_request_id_code_hash_key",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX password_recovery_staged_code_recovery_request_id_code_hash_key ON identity.password_recovery_staged_code USING btree (recovery_request_id, code_hash)"
      }
    ],
    "constraints": [
      {
        "name": "password_recovery_staged_code_code_hash_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL code_hash"
      },
      {
        "name": "password_recovery_staged_code_pkey",
        "type": "p",
        "validated": true,
        "definition": "PRIMARY KEY (recovery_request_id, slot)"
      },
      {
        "name": "password_recovery_staged_code_recovery_request_id_code_hash_key",
        "type": "u",
        "validated": true,
        "definition": "UNIQUE (recovery_request_id, code_hash)"
      },
      {
        "name": "password_recovery_staged_code_recovery_request_id_fkey",
        "type": "f",
        "validated": true,
        "definition": "FOREIGN KEY (recovery_request_id) REFERENCES identity.password_recovery_control(recovery_request_id) ON DELETE CASCADE"
      },
      {
        "name": "password_recovery_staged_code_recovery_request_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL recovery_request_id"
      },
      {
        "name": "password_recovery_staged_code_slot_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK (((slot >= 1) AND (slot <= 10)))"
      },
      {
        "name": "password_recovery_staged_code_slot_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL slot"
      }
    ]
  },
  "identity.verification_token_credential": {
    "columns": [
      {
        "name": "token_hash",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "channel_binding_id",
        "type": "uuid",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "issued_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "expires_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "consumed_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      }
    ],
    "indexes": [
      {
        "name": "verification_token_credential_channel_expiry",
        "valid": true,
        "definition": "CREATE INDEX verification_token_credential_channel_expiry ON identity.verification_token_credential USING btree (channel_binding_id, expires_at)"
      },
      {
        "name": "verification_token_credential_pkey",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX verification_token_credential_pkey ON identity.verification_token_credential USING btree (token_hash)"
      }
    ],
    "constraints": [
      {
        "name": "verification_token_credential_channel_binding_id_fkey",
        "type": "f",
        "validated": true,
        "definition": "FOREIGN KEY (channel_binding_id) REFERENCES identity.channel_binding(channel_binding_id) ON DELETE CASCADE"
      },
      {
        "name": "verification_token_credential_channel_binding_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL channel_binding_id"
      },
      {
        "name": "verification_token_credential_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((expires_at > issued_at))"
      },
      {
        "name": "verification_token_credential_check1",
        "type": "c",
        "validated": true,
        "definition": "CHECK (((consumed_at IS NULL) OR (consumed_at >= issued_at)))"
      },
      {
        "name": "verification_token_credential_expires_at_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL expires_at"
      },
      {
        "name": "verification_token_credential_issued_at_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL issued_at"
      },
      {
        "name": "verification_token_credential_pkey",
        "type": "p",
        "validated": true,
        "definition": "PRIMARY KEY (token_hash)"
      },
      {
        "name": "verification_token_credential_token_hash_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((token_hash ~ '^(sha256:)?[0-9a-f]{64}$'::text))"
      },
      {
        "name": "verification_token_credential_token_hash_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL token_hash"
      }
    ]
  },
  "identity.password_recovery_source_window": {
    "columns": [
      {
        "name": "source_digest",
        "type": "text",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "window_started_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "uses",
        "type": "integer",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "blocked_until",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": false,
        "identity": "",
        "generated": ""
      }
    ],
    "indexes": [
      {
        "name": "password_recovery_source_window_pkey",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX password_recovery_source_window_pkey ON identity.password_recovery_source_window USING btree (source_digest)"
      }
    ],
    "constraints": [
      {
        "name": "password_recovery_source_window_pkey",
        "type": "p",
        "validated": true,
        "definition": "PRIMARY KEY (source_digest)"
      },
      {
        "name": "password_recovery_source_window_source_digest_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((source_digest ~ '^argon2id-audit:v1:[0-9a-f]{64}$'::text))"
      },
      {
        "name": "password_recovery_source_window_source_digest_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL source_digest"
      },
      {
        "name": "password_recovery_source_window_uses_check",
        "type": "c",
        "validated": true,
        "definition": "CHECK ((uses >= 0))"
      },
      {
        "name": "password_recovery_source_window_uses_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL uses"
      },
      {
        "name": "password_recovery_source_window_window_started_at_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL window_started_at"
      }
    ]
  },
  "identity.verification_delivery_reservation": {
    "columns": [
      {
        "name": "reservation_id",
        "type": "uuid",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "channel_binding_id",
        "type": "uuid",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      },
      {
        "name": "reserved_at",
        "type": "timestamp with time zone",
        "default": null,
        "notNull": true,
        "identity": "",
        "generated": ""
      }
    ],
    "indexes": [
      {
        "name": "verification_delivery_reservation_channel_time",
        "valid": true,
        "definition": "CREATE INDEX verification_delivery_reservation_channel_time ON identity.verification_delivery_reservation USING btree (channel_binding_id, reserved_at)"
      },
      {
        "name": "verification_delivery_reservation_pkey",
        "valid": true,
        "definition": "CREATE UNIQUE INDEX verification_delivery_reservation_pkey ON identity.verification_delivery_reservation USING btree (reservation_id)"
      }
    ],
    "constraints": [
      {
        "name": "verification_delivery_reservation_channel_binding_id_fkey",
        "type": "f",
        "validated": true,
        "definition": "FOREIGN KEY (channel_binding_id) REFERENCES identity.channel_binding(channel_binding_id) ON DELETE CASCADE"
      },
      {
        "name": "verification_delivery_reservation_channel_binding_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL channel_binding_id"
      },
      {
        "name": "verification_delivery_reservation_pkey",
        "type": "p",
        "validated": true,
        "definition": "PRIMARY KEY (reservation_id)"
      },
      {
        "name": "verification_delivery_reservation_reservation_id_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL reservation_id"
      },
      {
        "name": "verification_delivery_reservation_reserved_at_not_null",
        "type": "n",
        "validated": true,
        "definition": "NOT NULL reserved_at"
      }
    ]
  }
}
$expected$::jsonb THEN RAISE EXCEPTION 'ACCOUNT_FLOW_CATALOG_DRIFT';END IF;
END $verify$;
