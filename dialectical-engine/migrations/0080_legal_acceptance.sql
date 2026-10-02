-- 0080 — legal groundwork (paid plans program, Part 1a, tasks L3a/L4/G3a; spec
-- docs/superpowers/specs/2026-09-29-paid-plans-and-payments-design.md §2.3.2, §2.3.3 and §2.16,
-- amendments R1 A14 and A15). RULINGS-R3 R3-1 numbers this file 0080: 0077 is dev's age gate, 0078
-- the colleague's sensitive-data consent and 0079 dev's change-email turn (the spec's older "0078" is superseded).
--
-- THE ACCEPTANCE RECORD. The Terms (§3) and the Privacy Policy say the service keeps a record of
-- which version of each document a person accepted, when, and from where. Until this file only
-- identity.user.adult_affirmed_at existed. legal.acceptance is that record.
--
-- WHY A SCHEMA OF ITS OWN, AND NO FOREIGN KEY. The record must outlive the account: erasure runs
-- DELETE FROM identity."user" (0040:5829), and a foreign key would either cascade the record away
-- or block the erasure. Rows are keyed by owner_ref (identity.user.owner_ref, a v4 uuid) with no
-- foreign key, and the only personal data they hold — the IP address and user agent at that
-- moment — is sealed under the RECORDS key (packages/crypto/src/records.ts), never the user DEK, so
-- erasing the account does not make the evidence unreadable.
--
-- RETENTION (A15). Acceptance records are kept for the life of the account plus six years (the
-- Privacy Policy). Both legal tables are append-only; their ONE sanctioned delete path is
-- legal.purge_expired_acceptance(now), the only code that turns debateai.retention_purge on, and
-- only for the function's own duration (its SET clause). The moment an account ends is recorded by an AFTER
-- DELETE trigger on identity."user" into legal.account_closure: identity.account_erasure_request
-- keeps no owner_ref, and its user_id is SET NULL by the very delete this needs to date. The
-- closure row links an erased owner_ref to its closure date, so the purge deletes it together with
-- that owner's acceptance rows; nothing of the account outlives the six years.
--
-- THE SIGN-UP WRITE. identity.create_pending_account_with_consent wraps the sealed
-- identity.create_pending_account_with_audit (0040:2080-2155, not edited) and, only when the
-- account was CREATED, the age gate's identity.record_registration_age_check (0077, not edited)
-- and the ADULT, TERMS and PRIVACY_SHOWN rows: one function call, so the account, its age record
-- and its acceptance record commit together or not at all (spec §2.16). The age record belongs to
-- the account and is deleted with it (0077: ON DELETE CASCADE); the ADULT row here outlives it.
--
-- THE COUNTRY-GATE AUDIT CAPABILITY (task G3a is its caller; it lives here so Part 1a ships one
-- migration). One aggregated audit row per route, refusal code and country per window, in 0042's
-- shape: a strict justification grammar, event-local actor and target refs minted here.
--
-- Forward-only and replayable: every object is created IF NOT EXISTS / OR REPLACE, and the file
-- ends by verifying the guards it claims.

CREATE SCHEMA IF NOT EXISTS legal;
REVOKE ALL ON SCHEMA legal FROM PUBLIC;
GRANT USAGE ON SCHEMA legal TO debateai_runtime;

CREATE TABLE IF NOT EXISTS legal.acceptance (
  acceptance_id uuid PRIMARY KEY,
  owner_ref uuid NOT NULL CHECK (owner_ref::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  kind text NOT NULL CHECK (kind IN ('TERMS','PRIVACY_SHOWN','RENEWAL_TERMS','IMMEDIATE_START','ADULT')),
  document_version text NOT NULL,
  document_sha256 char(64) NOT NULL CHECK (document_sha256 ~ '^[0-9a-f]{64}$'),
  locale text NOT NULL CHECK (locale ~ '^[a-z]{2}$'),
  surface text NOT NULL CHECK (surface IN ('SIGN_UP','CHECKOUT','REACCEPT')),
  accepted_at timestamptz NOT NULL,
  -- {ip, user_agent} under the records key: 0x01 || nonce(12) || tag(16) || ciphertext.
  evidence_ciphertext bytea NOT NULL CHECK (octet_length(evidence_ciphertext) BETWEEN 29 AND 4096),
  key_id text NOT NULL CHECK (key_id ~ '^[0-9a-f]{16}$'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  -- The documents carry the draft's `Version N.M`; the two checkout consent sentences carry the
  -- version the legal manifest derives from their own hash (apps/ui/scripts/legal-consent-manifest.mjs):
  -- 'sha256-' || the first 12 hex of document_sha256.
  CONSTRAINT acceptance_document_version_shape CHECK (
    (kind IN ('TERMS','PRIVACY_SHOWN','ADULT') AND document_version ~ '^[0-9]{1,4}\.[0-9]{1,4}$')
    OR (kind IN ('RENEWAL_TERMS','IMMEDIATE_START')
      AND document_version = 'sha256-' || left(document_sha256::text, 12))
  )
);

CREATE INDEX IF NOT EXISTS acceptance_owner_kind_idx
  ON legal.acceptance (owner_ref, kind, accepted_at DESC);

-- The account-closure clock the purge reads. One row per owner, ever.
CREATE TABLE IF NOT EXISTS legal.account_closure (
  owner_ref uuid PRIMARY KEY,
  closed_at timestamptz NOT NULL
);

-- The append-only refusal of legal.acceptance and legal.account_closure, with the ONE retention
-- exception (A15). Statement level, like 0066's: returning without raising lets the statement run.
CREATE OR REPLACE FUNCTION legal.reject_mutation_outside_retention_purge()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('debateai.retention_purge', true) = 'on' THEN
    RETURN NULL;
  END IF;
  RAISE EXCEPTION 'append-only or immutable table % rejects %', TG_TABLE_NAME, TG_OP
    USING ERRCODE = '55000';
END;
$$;
REVOKE ALL ON FUNCTION legal.reject_mutation_outside_retention_purge() FROM PUBLIC;

SELECT core.install_truncate_guard('legal.acceptance');
DROP TRIGGER IF EXISTS reject_mutation ON legal.acceptance;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON legal.acceptance
  FOR EACH STATEMENT EXECUTE FUNCTION legal.reject_mutation_outside_retention_purge();

SELECT core.install_truncate_guard('legal.account_closure');
DROP TRIGGER IF EXISTS reject_mutation ON legal.account_closure;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON legal.account_closure
  FOR EACH STATEMENT EXECUTE FUNCTION legal.reject_mutation_outside_retention_purge();

-- Runtime reads and appends acceptance rows (REACCEPT now, CHECKOUT later); nobody is granted
-- UPDATE or DELETE, and nobody but the definer functions below touches account_closure.
GRANT SELECT, INSERT ON legal.acceptance TO debateai_runtime;

CREATE OR REPLACE FUNCTION legal.record_account_closure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  INSERT INTO legal.account_closure(owner_ref, closed_at)
  VALUES (OLD.owner_ref, clock_timestamp())
  ON CONFLICT (owner_ref) DO NOTHING;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION legal.record_account_closure() FROM PUBLIC;
DROP TRIGGER IF EXISTS legal_record_account_closure ON identity."user";
CREATE TRIGGER legal_record_account_closure AFTER DELETE ON identity."user"
  FOR EACH ROW EXECUTE FUNCTION legal.record_account_closure();

-- A15: the only delete path. The clock is CLAMPED to the database's own: a caller can ask about the
-- past but cannot purge the future, so a wrong clock can never erase evidence early. The function's
-- own SET clause turns the guard's flag on for the function's duration only (the same shape as P1a's
-- billing.purge_expired_records); the runtime role has no DELETE grant, so setting the flag itself
-- lets it delete nothing. It deletes the expired owners' acceptance rows FIRST and their closure
-- dates second (the first statement finds the owners through those dates), and returns the number
-- of rows it deleted from both tables.
CREATE OR REPLACE FUNCTION legal.purge_expired_acceptance(p_now timestamptz)
RETURNS bigint
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
SET debateai.retention_purge = 'on'
AS $$
DECLARE
  v_now timestamptz;
  v_acceptances bigint;
  v_closures bigint;
BEGIN
  IF p_now IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='RETENTION_PURGE_CLOCK_REQUIRED';
  END IF;
  v_now := LEAST(p_now, clock_timestamp());
  WITH expired AS (
    SELECT closure.owner_ref FROM legal.account_closure AS closure
    WHERE closure.closed_at <= v_now - interval '6 years'
  ), deleted AS (
    DELETE FROM legal.acceptance AS acceptance
    USING expired
    WHERE acceptance.owner_ref = expired.owner_ref
    RETURNING 1
  )
  SELECT count(*) INTO v_acceptances FROM deleted;
  WITH deleted AS (
    DELETE FROM legal.account_closure AS closure
    WHERE closure.closed_at <= v_now - interval '6 years'
    RETURNING 1
  )
  SELECT count(*) INTO v_closures FROM deleted;
  RETURN v_acceptances + v_closures;
END;
$$;
REVOKE ALL ON FUNCTION legal.purge_expired_acceptance(timestamptz)
  FROM PUBLIC,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,
    debateai_publication_cleanup,debateai_content_provision;
-- R-36: the yearly RETENTION_PURGE job (P16c) runs as debateai_runtime and calls this with the real clock.
GRANT EXECUTE ON FUNCTION legal.purge_expired_acceptance(timestamptz) TO debateai_runtime;

-- The age check's three facts (0077) travel beside the acceptance rows: the wrapper writes the age
-- record itself, so a caller that uses it makes no second record_registration_age_check call.
CREATE OR REPLACE FUNCTION identity.create_pending_account_with_consent(
  p_user_id uuid,p_email_blind_index bytea,p_email_ciphertext jsonb,
  p_recovery_email_ciphertext jsonb,p_password_hash text,p_pseudonym text,
  p_adult_affirmed_at timestamptz,p_occurred_at timestamptz,
  p_verification_token_hash text,p_verification_expires_at timestamptz,
  p_source_context jsonb,
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
    p_verification_token_hash,p_verification_expires_at,p_source_context
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
REVOKE ALL ON FUNCTION identity.create_pending_account_with_consent(
  uuid,bytea,jsonb,jsonb,text,text,timestamptz,timestamptz,text,timestamptz,jsonb,smallint,text,text,jsonb
) FROM PUBLIC,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,
  debateai_publication_cleanup,debateai_content_provision;
GRANT EXECUTE ON FUNCTION identity.create_pending_account_with_consent(
  uuid,bytea,jsonb,jsonb,text,text,timestamptz,timestamptz,text,timestamptz,jsonb,smallint,text,text,jsonb
) TO debateai_runtime;

-- G3a: one aggregated country-gate refusal per route, code and country per window (0042's shape).
CREATE OR REPLACE FUNCTION identity.audit_country_gate_refused(jsonb,text)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_source_context alias FOR $1;
  v_justification alias FOR $2;
  v_match text[];
BEGIN
  IF jsonb_typeof(v_source_context)<>'object'
    OR v_source_context<>jsonb_strip_nulls(jsonb_build_object(
      'ipArgon2id',v_source_context->>'ipArgon2id',
      'userAgentArgon2id',v_source_context->>'userAgentArgon2id'))
    OR COALESCE(v_source_context->>'ipArgon2id','') !~ '^argon2id-audit:v1:[0-9a-f]{64}$'
    OR COALESCE(v_source_context->>'userAgentArgon2id','') !~ '^argon2id-audit:v1:[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='AUDIT_EVENT_INVALID';
  END IF;
  v_match := regexp_match(v_justification,
    '^aggregate:country-gate;route:(register|asks);code:(COUNTRY_SIGNUP_UNAVAILABLE|COUNTRY_UNKNOWN|TOR_REFUSED|COUNTRY_ASK_BLOCKED);country:([A-Z]{2});evidence:ip;window:([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z)$');
  IF v_match IS NULL
    OR (v_match[1]='asks' AND v_match[2]<>'COUNTRY_ASK_BLOCKED')
    OR (v_match[1]='register' AND v_match[2]='COUNTRY_ASK_BLOCKED') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='AUDIT_EVENT_SEMANTICS_INVALID';
  END IF;
  PERFORM identity.consume_runtime_audit_attempt();
  PERFORM identity.append_audit_event_internal(
    gen_random_uuid(),gen_random_uuid()::text,
    'identity.country_gate.refused','geo.'||v_match[1],
    gen_random_uuid()::text,clock_timestamp(),v_source_context,
    'DENY',false,v_justification
  );
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION identity.audit_country_gate_refused(jsonb,text)
  FROM PUBLIC,debateai_authorization_runtime,debateai_erasure_runtime,
    debateai_replay,debateai_publication_cleanup,debateai_content_provision;
GRANT EXECUTE ON FUNCTION identity.audit_country_gate_refused(jsonb,text) TO debateai_runtime;

-- THE CONTRACT THIS FILE CLAIMS, checked rather than assumed (0066's closing shape).
DO $legal_acceptance_guard_contract$
BEGIN
  IF (
    SELECT pg_catalog.count(*) FROM pg_catalog.pg_trigger AS trigger
    WHERE NOT trigger.tgisinternal
      AND trigger.tgenabled IN ('O','A')
      AND (
        (trigger.tgrelid='legal.acceptance'::regclass AND trigger.tgfoid=ANY(ARRAY[
          'core.reject_truncate()'::regprocedure,
          'legal.reject_mutation_outside_retention_purge()'::regprocedure]))
        OR (trigger.tgrelid='legal.account_closure'::regclass AND trigger.tgfoid=ANY(ARRAY[
          'core.reject_truncate()'::regprocedure,
          'legal.reject_mutation_outside_retention_purge()'::regprocedure]))
        OR (trigger.tgrelid='identity."user"'::regclass
          AND trigger.tgfoid='legal.record_account_closure()'::regprocedure)
      )
  )<>5 THEN
    RAISE EXCEPTION 'LEGAL_ACCEPTANCE_GUARD_INVALID';
  END IF;
END
$legal_acceptance_guard_contract$;
