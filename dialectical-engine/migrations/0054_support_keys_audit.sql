-- SUP-07: independently wrapped support keys, irreversible tombstones, and
-- transaction-bound global shred integrity.

SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('debateai:support-shred-integrity:v1', 0)
);

-- Forward repair for catalogs where the historical 0050 bytes were already
-- ledgered before SUP-06 added message telemetry and the complete abuse shape.
ALTER TABLE support.message
  ADD COLUMN IF NOT EXISTS model_called boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS input_tokens bigint CHECK (input_tokens >= 0),
  ADD COLUMN IF NOT EXISTS output_tokens bigint CHECK (output_tokens >= 0),
  ADD COLUMN IF NOT EXISTS cost_usd numeric(18,6) CHECK (cost_usd >= 0),
  ADD COLUMN IF NOT EXISTS degraded_reason text CHECK (degraded_reason IN ('relay','cap'));

ALTER TABLE support.abuse_event
  DROP CONSTRAINT IF EXISTS abuse_event_class_check,
  DROP CONSTRAINT IF EXISTS support_abuse_event_class_ck;
ALTER TABLE support.abuse_event
  ADD CONSTRAINT support_abuse_event_class_ck CHECK (class IN (
    'INJECTION','RATE_LIMIT','LOCK','IP_COOLDOWN','BOUNDARY_DENY','SECRET_LIKE'
  ));

CREATE INDEX IF NOT EXISTS support_abuse_event_session_class_idx
  ON support.abuse_event(session_id,class);
CREATE INDEX IF NOT EXISTS support_abuse_event_ip_class_at_idx
  ON support.abuse_event(ip_sha256,class,at DESC);

ALTER TABLE support."case"
  ADD COLUMN IF NOT EXISTS trigger_generation text;
DO $support_case_trigger_generation_constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='support."case"'::regclass
      AND conname='support_case_trigger_generation_ck'
  ) THEN
    ALTER TABLE support."case" ADD CONSTRAINT support_case_trigger_generation_ck
      CHECK (trigger_generation IS NULL OR (
        pg_catalog.length(trigger_generation) BETWEEN 1 AND 128
        AND trigger_generation !~ '[[:cntrl:]]'
      ));
  END IF;
END
$support_case_trigger_generation_constraint$;
CREATE UNIQUE INDEX IF NOT EXISTS support_case_trigger_generation_unique
  ON support."case"(session_id,trigger_predicate,trigger_generation)
  WHERE trigger_generation IS NOT NULL;

ALTER TABLE support.case_message
  ADD COLUMN IF NOT EXISTS redacted boolean NOT NULL DEFAULT false;

-- Append-only model-call reservations make the daily cap durable while
-- session-scoped advisory locks make concurrency shared across API processes.
CREATE TABLE IF NOT EXISTS support.relay_call (
  call_id uuid NOT NULL,
  utc_day date NOT NULL,
  acquired_at timestamptz NOT NULL,
  CONSTRAINT support_relay_call_pkey PRIMARY KEY (call_id),
  CONSTRAINT support_relay_call_utc_day_ck CHECK (
    utc_day = (pg_catalog.timezone('UTC',acquired_at))::date
  )
);
CREATE INDEX IF NOT EXISTS support_relay_call_utc_day_idx
  ON support.relay_call(utc_day);

-- Cross-process queue order is an append-only ticket/event ledger. Expired
-- WAITING leases are ignored, so a process restart cannot strand the head.
CREATE TABLE IF NOT EXISTS support.relay_waiter (
  ticket bigint GENERATED ALWAYS AS IDENTITY,
  waiter_id uuid NOT NULL,
  enqueued_at timestamptz NOT NULL,
  CONSTRAINT support_relay_waiter_pkey PRIMARY KEY (ticket),
  CONSTRAINT support_relay_waiter_id_unique UNIQUE (waiter_id)
);
CREATE TABLE IF NOT EXISTS support.relay_waiter_event (
  event_sequence bigint GENERATED ALWAYS AS IDENTITY,
  waiter_id uuid NOT NULL REFERENCES support.relay_waiter(waiter_id),
  state text NOT NULL,
  at timestamptz NOT NULL,
  lease_until timestamptz,
  CONSTRAINT support_relay_waiter_event_pkey PRIMARY KEY (event_sequence),
  CONSTRAINT support_relay_waiter_event_state_ck CHECK (
    state IN ('WAITING','ACQUIRED','COMPLETED','CANCELLED','DAILY_CAP')
  ),
  CONSTRAINT support_relay_waiter_event_lease_ck CHECK (
    (state='WAITING' AND lease_until IS NOT NULL AND lease_until > at)
    OR (state<>'WAITING' AND lease_until IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS support_relay_waiter_event_latest_idx
  ON support.relay_waiter_event(waiter_id,event_sequence DESC);

-- Admission observations contain only opaque identifiers/hashes and make
-- ordinary rate windows durable across processes and restarts.
CREATE TABLE IF NOT EXISTS support.admission_event (
  admission_event_id uuid NOT NULL,
  scope_kind text NOT NULL,
  session_id uuid,
  identity_owner_ref uuid,
  ip_sha256 character(64) NOT NULL,
  at timestamptz NOT NULL,
  CONSTRAINT support_admission_event_pkey PRIMARY KEY (admission_event_id),
  CONSTRAINT support_admission_event_scope_ck CHECK (
    (scope_kind='SESSION' AND session_id IS NULL AND identity_owner_ref IS NULL)
    OR (scope_kind='MESSAGE' AND session_id IS NOT NULL)
  ),
  CONSTRAINT support_admission_event_ip_ck CHECK (ip_sha256 ~ '^[0-9a-f]{64}$')
);
CREATE INDEX IF NOT EXISTS support_admission_event_ip_kind_at_idx
  ON support.admission_event(ip_sha256,scope_kind,at DESC);
CREATE INDEX IF NOT EXISTS support_admission_event_owner_kind_at_idx
  ON support.admission_event(identity_owner_ref,scope_kind,at DESC)
  WHERE identity_owner_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS support_admission_event_session_kind_idx
  ON support.admission_event(session_id,scope_kind)
  WHERE session_id IS NOT NULL;

-- Semantic content envelopes are v2. These owner-installed triggers reject new
-- v1 content without invalidating or rewriting historical v1 ciphertext rows.
CREATE OR REPLACE FUNCTION support.enforce_message_content_v2()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $support_enforce_message_content_v2$
BEGIN
  IF pg_catalog.octet_length(NEW.content_ciphertext) < 29
    OR pg_catalog.get_byte(NEW.content_ciphertext,0) <> 2 THEN
    RAISE EXCEPTION 'SUPPORT_CONTENT_V2_REQUIRED';
  END IF;
  RETURN NEW;
END
$support_enforce_message_content_v2$;

CREATE OR REPLACE FUNCTION support.enforce_case_message_content_v2()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $support_enforce_case_message_content_v2$
BEGIN
  IF pg_catalog.octet_length(NEW.content_ciphertext) < 29
    OR pg_catalog.get_byte(NEW.content_ciphertext,0) <> 2 THEN
    RAISE EXCEPTION 'SUPPORT_CONTENT_V2_REQUIRED';
  END IF;
  RETURN NEW;
END
$support_enforce_case_message_content_v2$;

CREATE OR REPLACE FUNCTION support.enforce_case_content_v2()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $support_enforce_case_content_v2$
BEGIN
  IF (TG_OP = 'INSERT' OR TG_ARGV[0] = 'snapshot') AND (
      pg_catalog.octet_length(NEW.transcript_snapshot_ciphertext) < 29
      OR pg_catalog.get_byte(NEW.transcript_snapshot_ciphertext,0) <> 2
    ) THEN
    RAISE EXCEPTION 'SUPPORT_CONTENT_V2_REQUIRED';
  END IF;
  IF (TG_OP = 'INSERT' OR TG_ARGV[0] = 'summary') AND NEW.summary_ciphertext IS NOT NULL AND (
      pg_catalog.octet_length(NEW.summary_ciphertext) < 29
      OR pg_catalog.get_byte(NEW.summary_ciphertext,0) <> 2
    ) THEN
    RAISE EXCEPTION 'SUPPORT_CONTENT_V2_REQUIRED';
  END IF;
  RETURN NEW;
END
$support_enforce_case_content_v2$;

REVOKE ALL ON FUNCTION support.enforce_message_content_v2() FROM PUBLIC;
REVOKE ALL ON FUNCTION support.enforce_case_message_content_v2() FROM PUBLIC;
REVOKE ALL ON FUNCTION support.enforce_case_content_v2() FROM PUBLIC;

DO $support_content_v2_triggers$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid='support.message'::regclass AND tgname='support_message_content_v2_insert') THEN
    CREATE TRIGGER support_message_content_v2_insert
      BEFORE INSERT ON support.message FOR EACH ROW
      EXECUTE FUNCTION support.enforce_message_content_v2();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid='support.message'::regclass AND tgname='support_message_content_v2_update') THEN
    CREATE TRIGGER support_message_content_v2_update
      BEFORE UPDATE OF content_ciphertext ON support.message FOR EACH ROW
      EXECUTE FUNCTION support.enforce_message_content_v2();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid='support.case_message'::regclass AND tgname='support_case_message_content_v2_insert') THEN
    CREATE TRIGGER support_case_message_content_v2_insert
      BEFORE INSERT ON support.case_message FOR EACH ROW
      EXECUTE FUNCTION support.enforce_case_message_content_v2();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid='support.case_message'::regclass AND tgname='support_case_message_content_v2_update') THEN
    CREATE TRIGGER support_case_message_content_v2_update
      BEFORE UPDATE OF content_ciphertext ON support.case_message FOR EACH ROW
      EXECUTE FUNCTION support.enforce_case_message_content_v2();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid='support."case"'::regclass AND tgname='support_case_snapshot_v2_insert') THEN
    CREATE TRIGGER support_case_snapshot_v2_insert
      BEFORE INSERT ON support."case" FOR EACH ROW
      EXECUTE FUNCTION support.enforce_case_content_v2('snapshot');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid='support."case"'::regclass AND tgname='support_case_snapshot_v2_update') THEN
    CREATE TRIGGER support_case_snapshot_v2_update
      BEFORE UPDATE OF transcript_snapshot_ciphertext ON support."case" FOR EACH ROW
      EXECUTE FUNCTION support.enforce_case_content_v2('snapshot');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid='support."case"'::regclass AND tgname='support_case_summary_v2_update') THEN
    CREATE TRIGGER support_case_summary_v2_update
      BEFORE UPDATE OF summary_ciphertext ON support."case" FOR EACH ROW
      EXECUTE FUNCTION support.enforce_case_content_v2('summary');
  END IF;
END
$support_content_v2_triggers$;

ALTER TABLE support.session_key
  ADD COLUMN IF NOT EXISTS destroyed_at timestamptz;
ALTER TABLE support.session
  ADD COLUMN IF NOT EXISTS shredded_at timestamptz;
ALTER TABLE support."case"
  ADD COLUMN IF NOT EXISTS shredded_at timestamptz;

CREATE TABLE IF NOT EXISTS support.case_key (
  case_id uuid NOT NULL,
  wrapped_key bytea NOT NULL,
  created_at timestamptz NOT NULL,
  destroyed_at timestamptz,
  CONSTRAINT support_case_key_pkey PRIMARY KEY (case_id),
  CONSTRAINT support_case_key_case_fk FOREIGN KEY (case_id)
    REFERENCES support."case" (case_id),
  CONSTRAINT support_case_key_destroyed_at_ck CHECK (
    destroyed_at IS NULL OR destroyed_at >= created_at
  ),
  CONSTRAINT support_case_key_envelope_ck CHECK (
    pg_catalog.octet_length(wrapped_key) = 61
    AND (
      (destroyed_at IS NULL AND pg_catalog.get_byte(wrapped_key, 0) = 1)
      OR (destroyed_at IS NOT NULL
        AND wrapped_key = pg_catalog.decode(pg_catalog.repeat('00', 61), 'hex'))
    )
  )
);

CREATE TABLE IF NOT EXISTS support.shred_audit (
  at timestamptz NOT NULL,
  os_user text NOT NULL,
  target_kind text NOT NULL,
  target_ref text NOT NULL,
  keys_destroyed integer NOT NULL,
  CONSTRAINT support_shred_audit_target_unique UNIQUE (target_kind, target_ref),
  CONSTRAINT support_shred_audit_target_kind_ck CHECK (
    target_kind IN ('owner', 'session')
  ),
  CONSTRAINT support_shred_audit_keys_destroyed_ck CHECK (keys_destroyed > 0),
  CONSTRAINT support_shred_audit_os_user_ck CHECK (
    pg_catalog.length(os_user) BETWEEN 1 AND 128
    AND os_user !~ '[[:cntrl:]]'
  ),
  CONSTRAINT support_shred_audit_target_ref_ck CHECK (
    target_ref ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  )
);

CREATE TABLE IF NOT EXISTS support._shred_integrity_guard (
  singleton boolean NOT NULL DEFAULT true,
  mutation_generation bigint NOT NULL,
  validated_generation bigint NOT NULL,
  last_mutation_xid xid8,
  last_validation_xid xid8,
  CONSTRAINT support_shred_integrity_guard_pkey PRIMARY KEY (singleton),
  CONSTRAINT support_shred_integrity_guard_singleton_ck CHECK (singleton),
  CONSTRAINT support_shred_integrity_guard_mutation_generation_ck CHECK (
    mutation_generation >= 0
  ),
  CONSTRAINT support_shred_integrity_guard_validated_generation_ck CHECK (
    validated_generation >= 0 AND validated_generation <= mutation_generation
  )
);

INSERT INTO support._shred_integrity_guard(
  singleton,mutation_generation,validated_generation,
  last_mutation_xid,last_validation_xid
)
VALUES (true,0,0,NULL,NULL)
ON CONFLICT (singleton) DO NOTHING;

DO $support_shred_constraints_install$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='support.session_key'::regclass
      AND conname='support_session_key_destroyed_at_ck'
  ) THEN
    ALTER TABLE support.session_key
      ADD CONSTRAINT support_session_key_destroyed_at_ck CHECK (
        destroyed_at IS NULL OR destroyed_at >= created_at
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='support.session_key'::regclass
      AND conname='support_session_key_envelope_ck'
  ) THEN
    ALTER TABLE support.session_key
      ADD CONSTRAINT support_session_key_envelope_ck CHECK (
        pg_catalog.octet_length(wrapped_key) = 61
        AND (
          (destroyed_at IS NULL AND pg_catalog.get_byte(wrapped_key,0) = 1)
          OR (destroyed_at IS NOT NULL
            AND wrapped_key=pg_catalog.decode(pg_catalog.repeat('00',61),'hex'))
        )
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='support.session'::regclass
      AND conname='support_session_shredded_at_ck'
  ) THEN
    ALTER TABLE support.session
      ADD CONSTRAINT support_session_shredded_at_ck CHECK (
        shredded_at IS NULL OR shredded_at >= created_at
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='support."case"'::regclass
      AND conname='support_case_shredded_at_ck'
  ) THEN
    ALTER TABLE support."case"
      ADD CONSTRAINT support_case_shredded_at_ck CHECK (
        shredded_at IS NULL OR shredded_at >= created_at
      );
  END IF;
END
$support_shred_constraints_install$;

DO $support_shred_columns_contract$
DECLARE
  v_count integer;
BEGIN
  SELECT pg_catalog.count(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema='support' AND (
    (table_name='session_key' AND column_name='destroyed_at'
      AND data_type='timestamp with time zone' AND is_nullable='YES')
    OR (table_name='session' AND column_name='shredded_at'
      AND data_type='timestamp with time zone' AND is_nullable='YES')
    OR (table_name='case' AND column_name='shredded_at'
      AND data_type='timestamp with time zone' AND is_nullable='YES')
    OR (table_name='case_key' AND column_name='case_id'
      AND data_type='uuid' AND is_nullable='NO')
    OR (table_name='case_key' AND column_name='wrapped_key'
      AND data_type='bytea' AND is_nullable='NO')
    OR (table_name='case_key' AND column_name='created_at'
      AND data_type='timestamp with time zone' AND is_nullable='NO')
    OR (table_name='case_key' AND column_name='destroyed_at'
      AND data_type='timestamp with time zone' AND is_nullable='YES')
    OR (table_name='shred_audit' AND column_name='at'
      AND data_type='timestamp with time zone' AND is_nullable='NO')
    OR (table_name='shred_audit' AND column_name='os_user'
      AND data_type='text' AND is_nullable='NO')
    OR (table_name='shred_audit' AND column_name='target_kind'
      AND data_type='text' AND is_nullable='NO')
    OR (table_name='shred_audit' AND column_name='target_ref'
      AND data_type='text' AND is_nullable='NO')
    OR (table_name='shred_audit' AND column_name='keys_destroyed'
      AND data_type='integer' AND is_nullable='NO')
    OR (table_name='_shred_integrity_guard' AND column_name='singleton'
      AND data_type='boolean' AND is_nullable='NO' AND column_default='true')
    OR (table_name='_shred_integrity_guard' AND column_name IN (
        'mutation_generation','validated_generation'
      ) AND data_type='bigint' AND is_nullable='NO')
    OR (table_name='_shred_integrity_guard' AND column_name IN (
        'last_mutation_xid','last_validation_xid'
      ) AND data_type='xid8' AND is_nullable='YES')
  );
  IF v_count <> 17 OR EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='support'
      AND table_name IN ('case_key','shred_audit','_shred_integrity_guard')
      AND NOT (
        (table_name='case_key' AND column_name IN (
          'case_id','wrapped_key','created_at','destroyed_at'
        ))
        OR (table_name='shred_audit' AND column_name IN (
          'at','os_user','target_kind','target_ref','keys_destroyed'
        ))
        OR (table_name='_shred_integrity_guard' AND column_name IN (
          'singleton','mutation_generation','validated_generation',
          'last_mutation_xid','last_validation_xid'
        ))
      )
  ) THEN
    RAISE EXCEPTION 'SUPPORT_SHRED_DEFINITION_DRIFT: columns';
  END IF;
END
$support_shred_columns_contract$;

DO $support_shred_constraints_contract$
DECLARE
  v_fk record;
  v_session_key_destroyed text;
  v_session_key_envelope text;
  v_session_shredded text;
  v_case_shredded text;
  v_case_key_destroyed text;
  v_case_key_envelope text;
BEGIN
  SELECT * INTO v_fk FROM pg_catalog.pg_constraint
  WHERE conrelid='support.case_key'::regclass
    AND conname='support_case_key_case_fk';
  SELECT pg_catalog.pg_get_constraintdef(oid,true) INTO v_session_key_destroyed
  FROM pg_catalog.pg_constraint WHERE conrelid='support.session_key'::regclass
    AND conname='support_session_key_destroyed_at_ck';
  SELECT pg_catalog.pg_get_constraintdef(oid,true) INTO v_session_key_envelope
  FROM pg_catalog.pg_constraint WHERE conrelid='support.session_key'::regclass
    AND conname='support_session_key_envelope_ck';
  SELECT pg_catalog.pg_get_constraintdef(oid,true) INTO v_session_shredded
  FROM pg_catalog.pg_constraint WHERE conrelid='support.session'::regclass
    AND conname='support_session_shredded_at_ck';
  SELECT pg_catalog.pg_get_constraintdef(oid,true) INTO v_case_shredded
  FROM pg_catalog.pg_constraint WHERE conrelid='support."case"'::regclass
    AND conname='support_case_shredded_at_ck';
  SELECT pg_catalog.pg_get_constraintdef(oid,true) INTO v_case_key_destroyed
  FROM pg_catalog.pg_constraint WHERE conrelid='support.case_key'::regclass
    AND conname='support_case_key_destroyed_at_ck';
  SELECT pg_catalog.pg_get_constraintdef(oid,true) INTO v_case_key_envelope
  FROM pg_catalog.pg_constraint WHERE conrelid='support.case_key'::regclass
    AND conname='support_case_key_envelope_ck';

  IF v_fk.oid IS NULL OR v_fk.contype<>'f' OR NOT v_fk.convalidated
      OR v_fk.condeferrable OR v_fk.condeferred
      OR v_fk.confdeltype<>'a' OR v_fk.confupdtype<>'a'
      OR v_fk.confmatchtype<>'s'
      OR v_fk.conrelid<>'support.case_key'::regclass
      OR v_fk.confrelid<>'support."case"'::regclass
      OR v_fk.conkey<>ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
        WHERE attrelid='support.case_key'::regclass AND attname='case_id')]::smallint[]
      OR v_fk.confkey<>ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
        WHERE attrelid='support."case"'::regclass AND attname='case_id')]::smallint[]
      OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_constraint
        WHERE conrelid='support.case_key'::regclass
          AND contype='p' AND conkey=ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
            WHERE attrelid='support.case_key'::regclass AND attname='case_id')]::smallint[])<>1
      OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_constraint
        WHERE conrelid='support.shred_audit'::regclass AND contype='u'
          AND conkey=ARRAY[
            (SELECT attnum FROM pg_catalog.pg_attribute WHERE attrelid='support.shred_audit'::regclass AND attname='target_kind'),
            (SELECT attnum FROM pg_catalog.pg_attribute WHERE attrelid='support.shred_audit'::regclass AND attname='target_ref')
          ]::smallint[])<>1 THEN
    RAISE EXCEPTION 'SUPPORT_SHRED_DEFINITION_DRIFT: constraints';
  END IF;

  IF v_session_key_destroyed IS NULL
      OR v_session_key_destroyed NOT LIKE '%destroyed_at IS NULL%destroyed_at >= created_at%'
      OR v_session_shredded IS NULL
      OR v_session_shredded NOT LIKE '%shredded_at IS NULL%shredded_at >= created_at%'
      OR v_case_shredded IS NULL
      OR v_case_shredded NOT LIKE '%shredded_at IS NULL%shredded_at >= created_at%'
      OR v_case_key_destroyed IS NULL
      OR v_case_key_destroyed NOT LIKE '%destroyed_at IS NULL%destroyed_at >= created_at%'
      OR v_session_key_envelope IS NULL
      OR v_session_key_envelope NOT LIKE '%octet_length(wrapped_key) = 61%'
      OR v_session_key_envelope NOT LIKE '%get_byte(wrapped_key, 0) = 1%'
      OR v_session_key_envelope NOT LIKE '%repeat(''00''::text, 61)%'
      OR v_case_key_envelope IS NULL
      OR v_case_key_envelope NOT LIKE '%octet_length(wrapped_key) = 61%'
      OR v_case_key_envelope NOT LIKE '%get_byte(wrapped_key, 0) = 1%'
      OR v_case_key_envelope NOT LIKE '%repeat(''00''::text, 61)%'
      OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_constraint
        WHERE conrelid='support.shred_audit'::regclass AND contype='c')<>4
      OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_constraint
        WHERE conrelid='support._shred_integrity_guard'::regclass AND contype='c')<>3
  THEN
    RAISE EXCEPTION 'SUPPORT_SHRED_DEFINITION_DRIFT: constraints';
  END IF;
END
$support_shred_constraints_contract$;

DO $support_shred_owner_contract$
DECLARE
  v_owner oid;
BEGIN
  SELECT relowner INTO v_owner FROM pg_catalog.pg_class
  WHERE oid='support.session'::regclass;
  IF v_owner IS NULL OR v_owner='debateai_support'::regrole OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_class AS relation
    WHERE relation.oid=ANY(ARRAY[
      'support.session'::regclass,'support.message'::regclass,
      'support.abuse_event'::regclass,'support."case"'::regclass,
      'support.session_key'::regclass,'support.case_key'::regclass,
      'support.shred_audit'::regclass,'support._shred_integrity_guard'::regclass
    ]) AND (relation.relkind NOT IN ('r','p') OR relation.relowner<>v_owner)
  ) THEN
    RAISE EXCEPTION 'SUPPORT_SHRED_DEFINITION_DRIFT: owners';
  END IF;
END
$support_shred_owner_contract$;

DO $support_shred_function_preflight$
DECLARE
  v_present integer;
  v_valid integer;
BEGIN
  SELECT pg_catalog.count(*),pg_catalog.count(*) FILTER (WHERE
    procedure.prorettype='trigger'::regtype
    AND procedure.provolatile='v'
    AND procedure.prosecdef
    AND NOT procedure.proisstrict
    AND procedure.proconfig=ARRAY['search_path=pg_catalog, pg_temp']::text[]
    AND procedure.proowner=(SELECT relowner FROM pg_catalog.pg_class
      WHERE oid='support.session'::regclass)
    AND pg_catalog.encode(audit_crypto_internal.digest(
      pg_catalog.convert_to(procedure.prosrc,'UTF8'),'sha256'
    ),'hex')=CASE procedure.proname
      WHEN 'mark_shred_integrity_dirty'
        THEN '538dac0a59a56771a1081636404cd2f9d6e32c0550ae465a0f8085dc02c55276'
      WHEN 'assert_shred_integrity'
        THEN '33ed86b5ba3aa1b98d99158a533c7347ab8ec1fce73bb8830ec901d6b6f7d44c'
    END
  ) INTO v_present,v_valid
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.pronamespace='support'::regnamespace
    AND procedure.proname IN (
      'mark_shred_integrity_dirty','assert_shred_integrity'
    ) AND procedure.pronargs=0;
  IF v_present NOT IN (0,2) OR (v_present=2 AND v_valid<>2) THEN
    RAISE EXCEPTION 'SUPPORT_SHRED_DEFINITION_DRIFT: functions';
  END IF;
END
$support_shred_function_preflight$;

CREATE OR REPLACE FUNCTION support.mark_shred_integrity_dirty()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $support_shred_function$
DECLARE
  v_generation bigint;
BEGIN
  UPDATE support._shred_integrity_guard
  SET mutation_generation=mutation_generation+1,
      last_mutation_xid=pg_catalog.pg_current_xact_id()
  WHERE singleton
  RETURNING mutation_generation INTO v_generation;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SUPPORT_SHRED_GUARD_INVALID';
  END IF;
  RETURN NULL;
END
$support_shred_function$;

CREATE OR REPLACE FUNCTION support.assert_shred_integrity()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $support_shred_function$
DECLARE
  v_mutation_generation bigint;
  v_validated_generation bigint;
  v_last_mutation_xid xid8;
  v_invalid boolean;
  v_count integer;
BEGIN
  SELECT mutation_generation,validated_generation,last_mutation_xid
  INTO v_mutation_generation,v_validated_generation,v_last_mutation_xid
  FROM support._shred_integrity_guard
  WHERE singleton
  FOR UPDATE;
  IF NOT FOUND OR v_last_mutation_xid IS DISTINCT FROM pg_catalog.pg_current_xact_id() THEN
    RAISE EXCEPTION 'SUPPORT_SHRED_GUARD_INVALID';
  END IF;
  IF v_mutation_generation=v_validated_generation THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM support.session AS parent
    LEFT JOIN support.session_key AS key ON key.session_id=parent.session_id
    GROUP BY parent.session_id,parent.shredded_at
    HAVING pg_catalog.count(key.session_id)<>1
      OR pg_catalog.bool_or(
        (parent.shredded_at IS NULL) IS DISTINCT FROM (key.destroyed_at IS NULL)
      )
    UNION ALL
    SELECT 1 FROM support."case" AS parent
    LEFT JOIN support.case_key AS key ON key.case_id=parent.case_id
    GROUP BY parent.case_id,parent.shredded_at
    HAVING pg_catalog.count(key.case_id)<>1
      OR pg_catalog.bool_or(
        (parent.shredded_at IS NULL) IS DISTINCT FROM (key.destroyed_at IS NULL)
      )
    UNION ALL
    SELECT 1 FROM support."case" AS child
    JOIN support.session AS parent ON parent.session_id=child.session_id
    WHERE parent.shredded_at IS NOT NULL AND child.shredded_at IS NULL
    UNION ALL
    SELECT 1 FROM support.shred_audit AS audit
    WHERE audit.target_kind='owner' AND (
      NOT EXISTS (SELECT 1 FROM support.session AS owned
        WHERE owned.identity_owner_ref=audit.target_ref::uuid)
      OR EXISTS (SELECT 1 FROM support.session AS owned
        WHERE owned.identity_owner_ref=audit.target_ref::uuid
          AND owned.shredded_at IS NULL)
      OR EXISTS (SELECT 1 FROM support."case" AS owned_case
        JOIN support.session AS owned ON owned.session_id=owned_case.session_id
        WHERE owned.identity_owner_ref=audit.target_ref::uuid
          AND owned_case.shredded_at IS NULL)
      OR audit.keys_destroyed<>(
        SELECT pg_catalog.count(*)::integer FROM (
          SELECT owned_key.session_id FROM support.session_key AS owned_key
          JOIN support.session AS owned ON owned.session_id=owned_key.session_id
          WHERE owned.identity_owner_ref=audit.target_ref::uuid
          UNION ALL
          SELECT owned_case_key.case_id FROM support.case_key AS owned_case_key
          JOIN support."case" AS owned_case ON owned_case.case_id=owned_case_key.case_id
          JOIN support.session AS owned ON owned.session_id=owned_case.session_id
          WHERE owned.identity_owner_ref=audit.target_ref::uuid
        ) AS owner_keys
      )
    )
    UNION ALL
    SELECT 1 FROM support.shred_audit AS audit
    WHERE audit.target_kind='session' AND (
      (SELECT pg_catalog.count(*) FROM support.session AS anonymous
        WHERE anonymous.session_id=audit.target_ref::uuid
          AND anonymous.identity_owner_ref IS NULL)<>1
      OR EXISTS (SELECT 1 FROM support.session AS anonymous
        WHERE anonymous.session_id=audit.target_ref::uuid
          AND anonymous.shredded_at IS NULL)
      OR EXISTS (SELECT 1 FROM support."case" AS anonymous_case
        WHERE anonymous_case.session_id=audit.target_ref::uuid
          AND anonymous_case.shredded_at IS NULL)
      OR audit.keys_destroyed<>(
        SELECT pg_catalog.count(*)::integer FROM (
          SELECT anonymous_key.session_id FROM support.session_key AS anonymous_key
          WHERE anonymous_key.session_id=audit.target_ref::uuid
          UNION ALL
          SELECT anonymous_case_key.case_id FROM support.case_key AS anonymous_case_key
          JOIN support."case" AS anonymous_case
            ON anonymous_case.case_id=anonymous_case_key.case_id
          WHERE anonymous_case.session_id=audit.target_ref::uuid
        ) AS anonymous_keys
      )
    )
    UNION ALL
    SELECT 1 FROM support.session AS object
    WHERE object.shredded_at IS NOT NULL AND (
      SELECT pg_catalog.count(*) FROM support.shred_audit AS audit
      WHERE (audit.target_kind='owner'
          AND object.identity_owner_ref IS NOT NULL
          AND audit.target_ref=object.identity_owner_ref::text)
        OR (audit.target_kind='session'
          AND object.identity_owner_ref IS NULL
          AND audit.target_ref=object.session_id::text)
    )<>1
    UNION ALL
    SELECT 1 FROM support."case" AS object
    JOIN support.session AS parent ON parent.session_id=object.session_id
    WHERE object.shredded_at IS NOT NULL AND (
      SELECT pg_catalog.count(*) FROM support.shred_audit AS audit
      WHERE (audit.target_kind='owner'
          AND parent.identity_owner_ref IS NOT NULL
          AND audit.target_ref=parent.identity_owner_ref::text)
        OR (audit.target_kind='session'
          AND parent.identity_owner_ref IS NULL
          AND audit.target_ref=parent.session_id::text)
    )<>1
  ) INTO v_invalid;

  IF v_invalid THEN
    RAISE EXCEPTION 'SUPPORT_SHRED_INTEGRITY_INVALID';
  END IF;

  v_count:=COALESCE(NULLIF(pg_catalog.current_setting(
    'debateai.support_shred_validation_count',true
  ),'')::integer,0)+1;
  PERFORM pg_catalog.set_config(
    'debateai.support_shred_validation_count',v_count::text,true
  );

  UPDATE support._shred_integrity_guard
  SET validated_generation=v_mutation_generation,
      last_validation_xid=pg_catalog.pg_current_xact_id()
  WHERE singleton
    AND mutation_generation=v_mutation_generation
    AND last_mutation_xid=v_last_mutation_xid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SUPPORT_SHRED_GUARD_INVALID';
  END IF;
  RETURN NEW;
END
$support_shred_function$;

REVOKE ALL ON FUNCTION support.mark_shred_integrity_dirty() FROM PUBLIC;
REVOKE ALL ON FUNCTION support.assert_shred_integrity() FROM PUBLIC;
REVOKE ALL ON FUNCTION support.mark_shred_integrity_dirty() FROM debateai_support;
REVOKE ALL ON FUNCTION support.assert_shred_integrity() FROM debateai_support;

DO $support_shred_triggers_install$
DECLARE
  v_marker_count integer;
  v_guard_count integer;
BEGIN
  SELECT pg_catalog.count(*) INTO v_marker_count
  FROM pg_catalog.pg_trigger AS trigger
  JOIN pg_catalog.pg_class AS relation ON relation.oid=trigger.tgrelid
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
  WHERE namespace.nspname='support' AND NOT trigger.tgisinternal
    AND trigger.tgname LIKE 'support_shred_dirty_%';
  SELECT pg_catalog.count(*) INTO v_guard_count
  FROM pg_catalog.pg_trigger AS trigger
  WHERE trigger.tgrelid='support._shred_integrity_guard'::regclass
    AND NOT trigger.tgisinternal
    AND trigger.tgname='support_shred_integrity_guard_trigger';
  IF v_marker_count=0 AND v_guard_count=0 THEN
    CREATE TRIGGER support_shred_dirty_session
      AFTER INSERT OR UPDATE OR DELETE ON support.session
      FOR EACH STATEMENT EXECUTE FUNCTION support.mark_shred_integrity_dirty();
    CREATE TRIGGER support_shred_dirty_session_key
      AFTER INSERT OR UPDATE OR DELETE ON support.session_key
      FOR EACH STATEMENT EXECUTE FUNCTION support.mark_shred_integrity_dirty();
    CREATE TRIGGER support_shred_dirty_case
      AFTER INSERT OR UPDATE OR DELETE ON support."case"
      FOR EACH STATEMENT EXECUTE FUNCTION support.mark_shred_integrity_dirty();
    CREATE TRIGGER support_shred_dirty_case_key
      AFTER INSERT OR UPDATE OR DELETE ON support.case_key
      FOR EACH STATEMENT EXECUTE FUNCTION support.mark_shred_integrity_dirty();
    CREATE TRIGGER support_shred_dirty_audit
      AFTER INSERT OR UPDATE OR DELETE ON support.shred_audit
      FOR EACH STATEMENT EXECUTE FUNCTION support.mark_shred_integrity_dirty();
    CREATE CONSTRAINT TRIGGER support_shred_integrity_guard_trigger
      AFTER UPDATE OF mutation_generation ON support._shred_integrity_guard
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION support.assert_shred_integrity();
  ELSIF v_marker_count<>5 OR v_guard_count<>1 THEN
    RAISE EXCEPTION 'SUPPORT_SHRED_DEFINITION_DRIFT: triggers';
  END IF;
END
$support_shred_triggers_install$;

DO $support_shred_functions_triggers_contract$
DECLARE
  v_function_count integer;
  v_trigger_count integer;
BEGIN
  SELECT pg_catalog.count(*) INTO v_function_count
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid=ANY(ARRAY[
    'support.mark_shred_integrity_dirty()'::regprocedure,
    'support.assert_shred_integrity()'::regprocedure
  ])
    AND procedure.prorettype='trigger'::regtype
    AND procedure.provolatile='v'
    AND procedure.prosecdef
    AND NOT procedure.proisstrict
    AND procedure.proconfig=ARRAY['search_path=pg_catalog, pg_temp']::text[]
    AND procedure.proowner=(SELECT relowner FROM pg_catalog.pg_class
      WHERE oid='support.session'::regclass)
    AND pg_catalog.encode(audit_crypto_internal.digest(
      pg_catalog.convert_to(procedure.prosrc,'UTF8'),'sha256'
    ),'hex')=CASE procedure.proname
      WHEN 'mark_shred_integrity_dirty'
        THEN '538dac0a59a56771a1081636404cd2f9d6e32c0550ae465a0f8085dc02c55276'
      WHEN 'assert_shred_integrity'
        THEN '33ed86b5ba3aa1b98d99158a533c7347ab8ec1fce73bb8830ec901d6b6f7d44c'
    END
    AND NOT pg_catalog.has_function_privilege(
      'public',procedure.oid,'EXECUTE'
    )
    AND NOT pg_catalog.has_function_privilege(
      'debateai_support',procedure.oid,'EXECUTE'
    );
  IF v_function_count<>2 THEN
    RAISE EXCEPTION 'SUPPORT_SHRED_DEFINITION_DRIFT: functions';
  END IF;

  SELECT pg_catalog.count(*) INTO v_trigger_count
  FROM pg_catalog.pg_trigger AS trigger
  WHERE NOT trigger.tgisinternal AND (
    (trigger.tgname='support_shred_dirty_session'
      AND trigger.tgrelid='support.session'::regclass)
    OR (trigger.tgname='support_shred_dirty_session_key'
      AND trigger.tgrelid='support.session_key'::regclass)
    OR (trigger.tgname='support_shred_dirty_case'
      AND trigger.tgrelid='support."case"'::regclass)
    OR (trigger.tgname='support_shred_dirty_case_key'
      AND trigger.tgrelid='support.case_key'::regclass)
    OR (trigger.tgname='support_shred_dirty_audit'
      AND trigger.tgrelid='support.shred_audit'::regclass)
  )
    AND trigger.tgfoid='support.mark_shred_integrity_dirty()'::regprocedure
    AND trigger.tgtype=28
    AND NOT trigger.tgdeferrable
    AND NOT trigger.tginitdeferred;
  IF v_trigger_count<>5 OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger AS trigger
    WHERE trigger.tgname='support_shred_integrity_guard_trigger'
      AND trigger.tgrelid='support._shred_integrity_guard'::regclass
      AND trigger.tgfoid='support.assert_shred_integrity()'::regprocedure
      AND trigger.tgtype=17
      AND trigger.tgdeferrable AND trigger.tginitdeferred
      AND pg_catalog.pg_get_triggerdef(trigger.oid,true)
        LIKE '%UPDATE OF mutation_generation%'
  ) THEN
    RAISE EXCEPTION 'SUPPORT_SHRED_DEFINITION_DRIFT: triggers';
  END IF;
END
$support_shred_functions_triggers_contract$;

DO $support_shred_privilege_preflight$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
    WHERE namespace.nspname='support' AND relation.relkind IN ('r','p')
      AND pg_catalog.has_table_privilege('debateai_support',relation.oid,
        'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
    JOIN pg_catalog.pg_attribute AS attribute ON attribute.attrelid=relation.oid
    WHERE namespace.nspname='support' AND relation.relkind IN ('r','p','v')
      AND attribute.attnum>0 AND NOT attribute.attisdropped
      AND pg_catalog.has_column_privilege(
        'debateai_support',relation.oid,attribute.attname,'UPDATE'
      )
      AND (relation.relname,attribute.attname) NOT IN (
        ('session','shredded_at'),('case','shredded_at'),
        ('session','consent_own_context_at'),
        ('case','state'),('case','summary_ciphertext'),
        ('case','summary_at'),('case','summary_status'),
        ('case','summary_authoritative'),
        ('public_incident','ended_at'),
        ('session_key','wrapped_key'),('session_key','destroyed_at'),
        ('case_key','wrapped_key'),('case_key','destroyed_at')
      )
  ) THEN
    RAISE EXCEPTION 'SUPPORT_SHRED_DEFINITION_DRIFT: privileges';
  END IF;
END
$support_shred_privilege_preflight$;

REVOKE ALL ON support.case_key FROM PUBLIC;
REVOKE ALL ON support.shred_audit FROM PUBLIC;
REVOKE ALL ON support._shred_integrity_guard FROM PUBLIC;
REVOKE ALL ON support.relay_call FROM PUBLIC;
REVOKE ALL ON support.relay_waiter FROM PUBLIC;
REVOKE ALL ON support.relay_waiter_event FROM PUBLIC;
REVOKE ALL ON support.admission_event FROM PUBLIC;
REVOKE ALL ON SEQUENCE support.relay_waiter_ticket_seq FROM PUBLIC;
REVOKE ALL ON SEQUENCE support.relay_waiter_event_event_sequence_seq FROM PUBLIC;
REVOKE ALL ON support.case_key FROM debateai_support;
REVOKE ALL ON support.shred_audit FROM debateai_support;
REVOKE ALL ON support._shred_integrity_guard FROM debateai_support;
REVOKE ALL ON support.relay_call FROM debateai_support;
REVOKE ALL ON support.relay_waiter FROM debateai_support;
REVOKE ALL ON support.relay_waiter_event FROM debateai_support;
REVOKE ALL ON support.admission_event FROM debateai_support;
REVOKE ALL ON SEQUENCE support.relay_waiter_ticket_seq FROM debateai_support;
REVOKE ALL ON SEQUENCE support.relay_waiter_event_event_sequence_seq FROM debateai_support;

GRANT SELECT,INSERT ON support.case_key TO debateai_support;
GRANT SELECT,INSERT ON support.shred_audit TO debateai_support;
GRANT SELECT,INSERT ON support.relay_call TO debateai_support;
GRANT SELECT,INSERT ON support.relay_waiter TO debateai_support;
GRANT SELECT,INSERT ON support.relay_waiter_event TO debateai_support;
GRANT USAGE,SELECT ON SEQUENCE support.relay_waiter_ticket_seq TO debateai_support;
GRANT USAGE,SELECT ON SEQUENCE support.relay_waiter_event_event_sequence_seq TO debateai_support;
GRANT SELECT,INSERT ON support.admission_event TO debateai_support;
GRANT UPDATE (shredded_at) ON support.session TO debateai_support;
GRANT UPDATE (shredded_at) ON support."case" TO debateai_support;
GRANT UPDATE (wrapped_key,destroyed_at) ON support.session_key TO debateai_support;
GRANT UPDATE (wrapped_key,destroyed_at) ON support.case_key TO debateai_support;

DO $support_shred_privilege_contract$
DECLARE
  v_application_count integer;
  v_update_count integer;
BEGIN
  SELECT pg_catalog.count(*) INTO v_application_count
  FROM pg_catalog.pg_class AS relation
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
  WHERE namespace.nspname='support' AND relation.relkind IN ('r','p')
    AND relation.relname<>'_shred_integrity_guard'
    AND pg_catalog.has_table_privilege('debateai_support',relation.oid,'SELECT')
    AND pg_catalog.has_table_privilege('debateai_support',relation.oid,'INSERT')
    AND NOT pg_catalog.has_table_privilege('debateai_support',relation.oid,'UPDATE')
    AND NOT pg_catalog.has_table_privilege('debateai_support',relation.oid,'DELETE')
    AND NOT pg_catalog.has_table_privilege('debateai_support',relation.oid,'TRUNCATE')
    AND NOT pg_catalog.has_table_privilege('debateai_support',relation.oid,'REFERENCES')
    AND NOT pg_catalog.has_table_privilege('debateai_support',relation.oid,'TRIGGER');
  IF v_application_count<>(
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
    WHERE namespace.nspname='support' AND relation.relkind IN ('r','p')
      AND relation.relname<>'_shred_integrity_guard'
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_class AS relation
    WHERE relation.oid='support._shred_integrity_guard'::regclass
      AND pg_catalog.has_table_privilege('debateai_support',relation.oid,
        'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace,
      LATERAL pg_catalog.aclexplode(COALESCE(
        relation.relacl,pg_catalog.acldefault('r',relation.relowner)
      )) AS acl
    WHERE namespace.nspname='support' AND acl.grantee=0
  ) THEN
    RAISE EXCEPTION 'SUPPORT_SHRED_DEFINITION_DRIFT: privileges';
  END IF;

  SELECT pg_catalog.count(*) INTO v_update_count
  FROM pg_catalog.pg_class AS relation
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
  JOIN pg_catalog.pg_attribute AS attribute ON attribute.attrelid=relation.oid
  WHERE namespace.nspname='support' AND relation.relkind IN ('r','p','v')
    AND attribute.attnum>0 AND NOT attribute.attisdropped
    AND pg_catalog.has_column_privilege(
      'debateai_support',relation.oid,attribute.attname,'UPDATE'
    );
  IF v_update_count<6 OR EXISTS (
    SELECT 1 FROM (VALUES
      ('session','shredded_at'),('case','shredded_at'),
      ('session_key','wrapped_key'),('session_key','destroyed_at'),
      ('case_key','wrapped_key'),('case_key','destroyed_at')
    ) AS required(table_name,column_name)
    WHERE NOT pg_catalog.has_column_privilege(
      'debateai_support',
      pg_catalog.format('support.%I',required.table_name),
      required.column_name,'UPDATE'
    )
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
    JOIN pg_catalog.pg_attribute AS attribute ON attribute.attrelid=relation.oid
    WHERE namespace.nspname='support' AND relation.relkind IN ('r','p','v')
      AND attribute.attnum>0 AND NOT attribute.attisdropped
      AND pg_catalog.has_column_privilege(
        'debateai_support',relation.oid,attribute.attname,'UPDATE'
      )
      AND (relation.relname,attribute.attname) NOT IN (
        ('session','shredded_at'),('case','shredded_at'),
        ('session','consent_own_context_at'),
        ('case','state'),('case','summary_ciphertext'),
        ('case','summary_at'),('case','summary_status'),
        ('case','summary_authoritative'),
        ('public_incident','ended_at'),
        ('session_key','wrapped_key'),('session_key','destroyed_at'),
        ('case_key','wrapped_key'),('case_key','destroyed_at')
      )
  ) THEN
    RAISE EXCEPTION 'SUPPORT_SHRED_DEFINITION_DRIFT: privileges';
  END IF;
END
$support_shred_privilege_contract$;

DO $support_shred_guard_contract$
BEGIN
  IF (SELECT pg_catalog.count(*) FROM support._shred_integrity_guard)<>1
      OR NOT EXISTS (
        SELECT 1 FROM support._shred_integrity_guard
        WHERE singleton AND mutation_generation>=validated_generation
          AND mutation_generation>=0 AND validated_generation>=0
      ) THEN
    RAISE EXCEPTION 'SUPPORT_SHRED_DEFINITION_DRIFT: guard row';
  END IF;
END
$support_shred_guard_contract$;

-- Schedule one startup/replay validation in the migration transaction itself.
UPDATE support._shred_integrity_guard
SET mutation_generation=mutation_generation+1,
    last_mutation_xid=pg_catalog.pg_current_xact_id()
WHERE singleton;
