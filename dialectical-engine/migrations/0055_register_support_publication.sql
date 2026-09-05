-- REGISTER-SUPPORT-PUBLICATION: one monotonic allocator and closed publication paths.

SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('debateai:register-publication:v3', 0)
);

DO $role_contract$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname = 'debateai_register_publication_owner'
  ) THEN
    CREATE ROLE debateai_register_publication_owner NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname = 'debateai_support_config_operator'
  ) THEN
    CREATE ROLE debateai_support_config_operator NOLOGIN NOINHERIT;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname IN (
      'debateai_register_publication_owner',
      'debateai_support_config_operator'
    ) AND (
      rolcanlogin OR rolinherit OR rolsuper OR rolcreaterole OR rolcreatedb
      OR rolreplication OR rolbypassrls
    )
  ) THEN
    RAISE EXCEPTION 'SUPPORT_CONFIG_ROLE_INVALID';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_auth_members AS membership
    WHERE membership.roleid = 'debateai_register_publication_owner'::regrole
      OR membership.member = ANY(ARRAY[
      'debateai_register_publication_owner'::regrole,
      'debateai_support_config_operator'::regrole
    ])
  ) THEN
    RAISE EXCEPTION 'SUPPORT_CONFIG_ROLE_INVALID';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles AS forbidden
    WHERE forbidden.rolname IN (
      'debateai_runtime','debateai_replay','debateai_support'
    )
      AND pg_catalog.pg_has_role(
        forbidden.oid,
        'debateai_support_config_operator'::regrole,
        'MEMBER'
      )
  ) THEN
    RAISE EXCEPTION 'SUPPORT_CONFIG_ROLE_INVALID';
  END IF;
END
$role_contract$;

ALTER TABLE register.register_version
  ADD COLUMN IF NOT EXISTS base_register_version bigint,
  ADD COLUMN IF NOT EXISTS publication_id uuid,
  ADD COLUMN IF NOT EXISTS request_sha256 char(64),
  ADD COLUMN IF NOT EXISTS snapshot_sha256 char(64),
  ADD COLUMN IF NOT EXISTS publication_kind text,
  ADD COLUMN IF NOT EXISTS recorded_at timestamptz;

DO $column_contract$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema = 'register'
    AND table_name = 'register_version'
    AND is_nullable = 'YES'
    AND (
      (column_name = 'base_register_version' AND data_type = 'bigint')
      OR (column_name = 'publication_id' AND data_type = 'uuid')
      OR (column_name = 'request_sha256' AND data_type = 'character' AND character_maximum_length = 64)
      OR (column_name = 'snapshot_sha256' AND data_type = 'character' AND character_maximum_length = 64)
      OR (column_name = 'publication_kind' AND data_type = 'text')
      OR (column_name = 'recorded_at' AND data_type = 'timestamp with time zone')
    );
  IF v_count <> 6 THEN
    RAISE EXCEPTION 'REGISTER_PUBLICATION_DEFINITION_DRIFT: metadata columns';
  END IF;
END
$column_contract$;

CREATE UNIQUE INDEX IF NOT EXISTS register_version_publication_id_unique
  ON register.register_version (publication_id);

DO $unique_index_contract$
DECLARE
  v_index record;
BEGIN
  SELECT * INTO v_index
  FROM pg_catalog.pg_index AS index
  WHERE index.indexrelid = 'register.register_version_publication_id_unique'::regclass;
  IF v_index.indexrelid IS NULL OR NOT v_index.indisunique
      OR NOT v_index.indisvalid OR NOT v_index.indisready
      OR v_index.indrelid <> 'register.register_version'::regclass
      OR v_index.indnkeyatts <> 1
      OR pg_catalog.pg_get_indexdef(v_index.indexrelid)
        NOT LIKE '%(publication_id)' THEN
    RAISE EXCEPTION 'REGISTER_PUBLICATION_DEFINITION_DRIFT: publication id uniqueness';
  END IF;
END
$unique_index_contract$;

DO $constraint_install$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE connamespace = 'register'::regnamespace
      AND conname = 'register_row_register_version_fk'
  ) THEN
    ALTER TABLE register.register_row
      ADD CONSTRAINT register_row_register_version_fk
      FOREIGN KEY (register_version)
      REFERENCES register.register_version (register_version)
      DEFERRABLE INITIALLY DEFERRED NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE connamespace = 'register'::regnamespace
      AND conname = 'register_version_base_register_version_fk'
  ) THEN
    ALTER TABLE register.register_version
      ADD CONSTRAINT register_version_base_register_version_fk
      FOREIGN KEY (base_register_version)
      REFERENCES register.register_version (register_version)
      NOT DEFERRABLE NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE connamespace = 'register'::regnamespace
      AND conname = 'register_version_publication_kind_check'
  ) THEN
    ALTER TABLE register.register_version
      ADD CONSTRAINT register_version_publication_kind_check
      CHECK (
        publication_kind IS NULL
        OR publication_kind IN ('GENERAL', 'SUPPORT_CONFIGURATION')
      ) NOT VALID;
  END IF;
END
$constraint_install$;

ALTER TABLE register.register_row
  VALIDATE CONSTRAINT register_row_register_version_fk;
ALTER TABLE register.register_version
  VALIDATE CONSTRAINT register_version_base_register_version_fk;
ALTER TABLE register.register_version
  VALIDATE CONSTRAINT register_version_publication_kind_check;

DO $constraint_contract$
DECLARE
  v_row_fk record;
  v_base_fk record;
  v_kind record;
BEGIN
  SELECT * INTO v_row_fk
  FROM pg_catalog.pg_constraint
  WHERE connamespace = 'register'::regnamespace
    AND conname = 'register_row_register_version_fk';
  SELECT * INTO v_base_fk
  FROM pg_catalog.pg_constraint
  WHERE connamespace = 'register'::regnamespace
    AND conname = 'register_version_base_register_version_fk';
  SELECT * INTO v_kind
  FROM pg_catalog.pg_constraint
  WHERE connamespace = 'register'::regnamespace
    AND conname = 'register_version_publication_kind_check';
  IF v_row_fk.contype <> 'f' OR NOT v_row_fk.convalidated
      OR NOT v_row_fk.condeferrable OR NOT v_row_fk.condeferred
      OR v_row_fk.conrelid <> 'register.register_row'::regclass
      OR v_row_fk.confrelid <> 'register.register_version'::regclass
      OR v_row_fk.conkey <> ARRAY[(
        SELECT attnum FROM pg_catalog.pg_attribute
        WHERE attrelid = 'register.register_row'::regclass
          AND attname = 'register_version'
      )]::smallint[]
      OR v_row_fk.confkey <> ARRAY[(
        SELECT attnum FROM pg_catalog.pg_attribute
        WHERE attrelid = 'register.register_version'::regclass
          AND attname = 'register_version'
      )]::smallint[] THEN
    RAISE EXCEPTION 'REGISTER_PUBLICATION_DEFINITION_DRIFT: row foreign key';
  END IF;
  IF v_base_fk.contype <> 'f' OR NOT v_base_fk.convalidated
      OR v_base_fk.condeferrable OR v_base_fk.condeferred
      OR v_base_fk.conrelid <> 'register.register_version'::regclass
      OR v_base_fk.confrelid <> 'register.register_version'::regclass
      OR v_base_fk.conkey <> ARRAY[(
        SELECT attnum FROM pg_catalog.pg_attribute
        WHERE attrelid = 'register.register_version'::regclass
          AND attname = 'base_register_version'
      )]::smallint[]
      OR v_base_fk.confkey <> ARRAY[(
        SELECT attnum FROM pg_catalog.pg_attribute
        WHERE attrelid = 'register.register_version'::regclass
          AND attname = 'register_version'
      )]::smallint[] THEN
    RAISE EXCEPTION 'REGISTER_PUBLICATION_DEFINITION_DRIFT: base foreign key';
  END IF;
  IF v_kind.contype <> 'c' OR NOT v_kind.convalidated
      OR v_kind.conrelid <> 'register.register_version'::regclass
      OR pg_catalog.pg_get_constraintdef(v_kind.oid) NOT LIKE '%GENERAL%'
      OR pg_catalog.pg_get_constraintdef(v_kind.oid) NOT LIKE '%SUPPORT_CONFIGURATION%' THEN
    RAISE EXCEPTION 'REGISTER_PUBLICATION_DEFINITION_DRIFT: publication kind';
  END IF;
END
$constraint_contract$;

CREATE SEQUENCE IF NOT EXISTS register.register_version_id_seq
  AS bigint
  INCREMENT BY 1
  MINVALUE 1
  MAXVALUE 9223372036854775807
  START WITH 1
  NO CYCLE;

DO $sequence_contract$
DECLARE
  v_required_next bigint;
  v_last_value bigint;
  v_existing_next numeric;
  v_is_called boolean;
  v_sequence record;
BEGIN
  SELECT * INTO v_sequence
  FROM pg_catalog.pg_sequence
  WHERE seqrelid = 'register.register_version_id_seq'::regclass;
  IF v_sequence.seqincrement <> 1 OR v_sequence.seqcycle
      OR v_sequence.seqmin <> 1
      OR v_sequence.seqmax <> 9223372036854775807 THEN
    RAISE EXCEPTION 'REGISTER_PUBLICATION_DEFINITION_DRIFT: allocator sequence';
  END IF;

  IF EXISTS (
    SELECT 1 FROM register.register_version
    WHERE register_version = 9223372036854775807
  ) THEN
    RAISE EXCEPTION 'REGISTER_VERSION_ALLOCATION_EXHAUSTED';
  END IF;
  SELECT greatest(
    4::bigint,
    coalesce(pg_catalog.max(register_version), 0::bigint)
  ) + 1
  INTO v_required_next
  FROM register.register_version;

  SELECT last_value, is_called
  INTO v_last_value, v_is_called
  FROM register.register_version_id_seq;
  v_existing_next := v_last_value::numeric
    + CASE WHEN v_is_called THEN 1 ELSE 0 END;
  IF v_existing_next > 9223372036854775807::numeric THEN
    RAISE EXCEPTION 'REGISTER_VERSION_ALLOCATION_EXHAUSTED';
  END IF;
  IF v_existing_next < v_required_next::numeric THEN
    PERFORM pg_catalog.setval(
      'register.register_version_id_seq'::regclass,
      v_required_next,
      false
    );
  END IF;
END
$sequence_contract$;

DO $function_contract_preflight$
DECLARE
  v_present integer;
  v_drift integer;
BEGIN
  SELECT count(*) FILTER (WHERE procedure.oid IS NOT NULL),
    count(*) FILTER (WHERE procedure.oid IS NOT NULL AND (
      pg_catalog.encode(
        audit_crypto_internal.digest(
          pg_catalog.convert_to(procedure.prosrc, 'UTF8'),
          'sha256'
        ),
        'hex'
      ) <> expected.sha256
      OR procedure.provolatile <> expected.volatility
      OR procedure.prosecdef <> expected.security_definer
      OR procedure.proisstrict <> expected.is_strict
      OR procedure.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, register']::text[]
      OR procedure.proowner <> (
        SELECT oid FROM pg_catalog.pg_roles
        WHERE rolname = 'debateai_register_publication_owner'
      )
    ))
  INTO v_present,v_drift
  FROM (VALUES
    ('register._lp(text)', '212a0dfb0d324566551180136250ef701356c338c777e8db711d1dcf99605426', 'i'::char, false, true),
    ('register._canonical_decimal(text)', '3032cfce0b5be0aa4a9eb717fc406824642433d87c9fad9892a4bedd4e7afa8a', 'i'::char, false, true),
    ('register._canonical_json_value(text,integer,integer)', 'eb0a2ae34df85490b8eab974aefb380293d89281aa77abac58223a3022af05b4', 'i'::char, false, false),
    ('register.canonical_json_text(text)', '5949add984ab4500bc7fc67fed749647aeab9fdd8f21aed2f59273e7d8a983fd', 'i'::char, false, true),
    ('register._snapshot_sha256(bigint)', 'beb7dbd7822202ba7bf4120fd2a51357e0906aad2f0e8cf6888cab6c94290448', 's'::char, false, true),
    ('register._assert_register_base_integrity(bigint)', '9d330ac04a44738760f60dcae212038a17f0e77b81dca5b3e3bad29a4c5f4097', 'v'::char, true, true),
    ('register._support_keys()', '9f13abae35f7954b45d46be7270abe960c114cdca8f14582407a371ad28ec87a', 'i'::char, false, false),
    ('register._support_snapshot_sha256(bigint)', '542a0e1bb8a6e4e5c6e1924f9805552fab64825cd1480acf2760ed2467c27153', 's'::char, false, true),
    ('register._validate_source_ref(text)', 'edcf5a0284a04599442fc4d9c601e7778a8e5ca920cef1520ced9696759b10ef', 'i'::char, false, true),
    ('register._validate_support_value(text,text)', '3528adc999f1d3a52b805778bf8044df659c329288b12c2f66cc04d3569c0b0f', 'i'::char, false, true),
    ('register._assert_support_catalogue(bigint)', 'abf48183e583a554a23cfecaf0f5667227bf96dc1e5ba0faa172b9e65a0d6344', 's'::char, false, true),
    ('register._current_support_register_version()', 'd94a5d69d5e501613faf0e05fae51e87b0989ed4593c7787d144910f06f45f10', 's'::char, false, false),
    ('register._register_row_insert_guard()', 'a03423a31fa833a113eec3dd124dcaa6f13e7a76151920fb81a67a7d7fb41a0e', 'v'::char, true, false),
    ('register._register_version_seal_guard()', '9bdecbcea3bb4e61fade77914e9df5a26b56ead14b35e4aabbbea67e6f09ff60', 'v'::char, true, false),
    ('register.allocate_register_version()', 'c27fdb3961bfaf3463a9b0f9d8ec1161ff4593dded9b0905e9e45878cfd78b67', 'v'::char, true, false),
    ('register.import_historical_register_version(bigint,jsonb,character)', '7bc37a821f21647e6dff753f84d5182ef1a1027e46adaa4a94fec5d1755667b6', 'v'::char, true, false),
    ('register.publish_register_version(uuid,character,bigint,jsonb,text)', '3ebad566337544f16da402198db8d2f05e8f5c5fa5a7aae1b4b1efb0a878149f', 'v'::char, true, false),
    ('register.publish_support_configuration(uuid,character,bigint,bigint,integer,jsonb,text)', '4883dc5e35c1bf7a3288ce2b9ef7816744ac4b5e390de5d5eba86d5c9a9c60e5', 'v'::char, true, false),
    ('register.read_support_configuration_status()', 'c8b4db3718c35f4a8edd4da9bdc0c41519e13a97c7f603b559bc21baa57c6314', 'v'::char, true, false)
  ) AS expected(signature,sha256,volatility,security_definer,is_strict)
  LEFT JOIN pg_catalog.pg_proc AS procedure
    ON procedure.oid = pg_catalog.to_regprocedure(expected.signature);
  IF v_present NOT IN (0,19) OR v_drift <> 0 THEN
    RAISE EXCEPTION 'REGISTER_PUBLICATION_DEFINITION_DRIFT: functions';
  END IF;
END
$function_contract_preflight$;

CREATE OR REPLACE FUNCTION register._lp(p_value text)
RETURNS bytea
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog, register
AS $function$
  SELECT pg_catalog.int8send(
      pg_catalog.octet_length(pg_catalog.convert_to(p_value, 'UTF8'))::bigint
    ) || pg_catalog.convert_to(p_value, 'UTF8')
$function$;

CREATE OR REPLACE FUNCTION register._canonical_decimal(p_raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog, register
AS $function$
DECLARE
  v_sign text := '';
  v_unsigned text;
  v_integer text;
  v_fraction text;
  v_normalized text;
  v_significant text;
BEGIN
  IF p_raw !~ '^-?(0|[1-9][0-9]*)([.][0-9]+)?$' THEN
    RAISE EXCEPTION 'SUPPORT_CONFIG_PATCH_INVALID: invalid decimal token';
  END IF;
  v_unsigned := p_raw;
  IF pg_catalog.left(v_unsigned, 1) = '-' THEN
    v_sign := '-';
    v_unsigned := pg_catalog.substr(v_unsigned, 2);
  END IF;
  IF pg_catalog.strpos(v_unsigned, '.') > 0 THEN
    v_integer := pg_catalog.split_part(v_unsigned, '.', 1);
    v_fraction := pg_catalog.rtrim(pg_catalog.split_part(v_unsigned, '.', 2), '0');
  ELSE
    v_integer := v_unsigned;
    v_fraction := '';
  END IF;
  IF v_integer = '0' AND v_fraction = '' THEN
    RETURN '0';
  END IF;
  IF v_fraction = '' THEN
    IF (v_sign || v_integer)::numeric < -9007199254740991::numeric
        OR (v_sign || v_integer)::numeric > 9007199254740991::numeric THEN
      RAISE EXCEPTION 'SUPPORT_CONFIG_PATCH_INVALID: unsafe integer';
    END IF;
    RETURN v_sign || v_integer;
  END IF;
  IF pg_catalog.length(v_fraction) > 6 THEN
    RAISE EXCEPTION 'SUPPORT_CONFIG_PATCH_INVALID: decimal scale';
  END IF;
  v_significant := pg_catalog.ltrim(v_integer || v_fraction, '0');
  IF pg_catalog.length(v_significant) > 15 THEN
    RAISE EXCEPTION 'SUPPORT_CONFIG_PATCH_INVALID: decimal precision';
  END IF;
  v_normalized := v_sign || v_integer || '.' || v_fraction;
  IF v_normalized::double precision::numeric::text::numeric <> v_normalized::numeric THEN
    RAISE EXCEPTION 'SUPPORT_CONFIG_PATCH_INVALID: decimal proof';
  END IF;
  RETURN v_normalized;
END
$function$;

CREATE OR REPLACE FUNCTION register._canonical_json_value(
  p_raw text,
  p_position integer,
  p_depth integer,
  OUT canonical text,
  OUT next_position integer
)
RETURNS record
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, register
AS $function$
DECLARE
  v_length integer := pg_catalog.length(p_raw);
  v_position integer := p_position;
  v_start integer;
  v_character text;
  v_escaped boolean;
  v_token text;
  v_decoded text;
  v_output text;
  v_code integer;
  v_item record;
  v_key record;
  v_keys text[] := ARRAY[]::text[];
  v_key_canonical text[] := ARRAY[]::text[];
  v_values text[] := ARRAY[]::text[];
  v_index integer;
BEGIN
  IF p_depth > 64 THEN
    RAISE EXCEPTION 'SUPPORT_CONFIG_PATCH_INVALID: JSON nesting';
  END IF;
  WHILE v_position <= v_length
      AND pg_catalog.substr(p_raw, v_position, 1) = ANY(
        ARRAY[' ', E'\t', E'\n', E'\r']
      ) LOOP
    v_position := v_position + 1;
  END LOOP;
  IF v_position > v_length THEN
    RAISE EXCEPTION 'SUPPORT_CONFIG_PATCH_INVALID: incomplete JSON';
  END IF;
  v_character := pg_catalog.substr(p_raw, v_position, 1);

  IF v_character = '"' THEN
    v_start := v_position;
    v_position := v_position + 1;
    v_escaped := false;
    WHILE v_position <= v_length LOOP
      v_character := pg_catalog.substr(p_raw, v_position, 1);
      IF v_escaped THEN
        v_escaped := false;
      ELSIF v_character = E'\\' THEN
        v_escaped := true;
      ELSIF v_character = '"' THEN
        EXIT;
      END IF;
      v_position := v_position + 1;
    END LOOP;
    IF v_position > v_length OR v_escaped THEN
      RAISE EXCEPTION 'SUPPORT_CONFIG_PATCH_INVALID: invalid JSON string';
    END IF;
    v_token := pg_catalog.substr(p_raw, v_start, v_position - v_start + 1);
    BEGIN
      v_decoded := v_token::jsonb #>> '{}';
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'SUPPORT_CONFIG_PATCH_INVALID: invalid JSON string';
    END;
    v_output := '"';
    FOR v_index IN 1..pg_catalog.length(v_decoded) LOOP
      v_character := pg_catalog.substr(v_decoded, v_index, 1);
      v_code := pg_catalog.ascii(v_character);
      IF v_character = '"' THEN
        v_output := v_output || E'\\"';
      ELSIF v_character = E'\\' THEN
        v_output := v_output || E'\\\\';
      ELSIF v_code BETWEEN 1 AND 31 THEN
        v_output := v_output || E'\\u00' || pg_catalog.lpad(pg_catalog.to_hex(v_code), 2, '0');
      ELSE
        v_output := v_output || v_character;
      END IF;
    END LOOP;
    canonical := v_output || '"';
    next_position := v_position + 1;
    RETURN;
  END IF;

  IF v_character = '[' THEN
    v_position := v_position + 1;
    canonical := '[';
    WHILE v_position <= v_length
        AND pg_catalog.substr(p_raw, v_position, 1) = ANY(
          ARRAY[' ', E'\t', E'\n', E'\r']
        ) LOOP
      v_position := v_position + 1;
    END LOOP;
    IF pg_catalog.substr(p_raw, v_position, 1) = ']' THEN
      next_position := v_position + 1;
      canonical := '[]';
      RETURN;
    END IF;
    v_index := 0;
    LOOP
      SELECT * INTO v_item
      FROM register._canonical_json_value(p_raw, v_position, p_depth + 1);
      IF v_index > 0 THEN canonical := canonical || ','; END IF;
      canonical := canonical || v_item.canonical;
      v_index := v_index + 1;
      v_position := v_item.next_position;
      WHILE v_position <= v_length
          AND pg_catalog.substr(p_raw, v_position, 1) = ANY(
            ARRAY[' ', E'\t', E'\n', E'\r']
          ) LOOP
        v_position := v_position + 1;
      END LOOP;
      v_character := pg_catalog.substr(p_raw, v_position, 1);
      IF v_character = ']' THEN
        canonical := canonical || ']';
        next_position := v_position + 1;
        RETURN;
      ELSIF v_character <> ',' THEN
        RAISE EXCEPTION 'SUPPORT_CONFIG_PATCH_INVALID: invalid JSON array';
      END IF;
      v_position := v_position + 1;
    END LOOP;
  END IF;

  IF v_character = '{' THEN
    v_position := v_position + 1;
    WHILE v_position <= v_length
        AND pg_catalog.substr(p_raw, v_position, 1) = ANY(
          ARRAY[' ', E'\t', E'\n', E'\r']
        ) LOOP
      v_position := v_position + 1;
    END LOOP;
    IF pg_catalog.substr(p_raw, v_position, 1) = '}' THEN
      canonical := '{}';
      next_position := v_position + 1;
      RETURN;
    END IF;
    LOOP
      SELECT * INTO v_key
      FROM register._canonical_json_value(p_raw, v_position, p_depth + 1);
      IF pg_catalog.left(v_key.canonical, 1) <> '"' THEN
        RAISE EXCEPTION 'SUPPORT_CONFIG_PATCH_INVALID: object key';
      END IF;
      v_decoded := v_key.canonical::jsonb #>> '{}';
      IF v_decoded = ANY(v_keys) THEN
        RAISE EXCEPTION 'SUPPORT_CONFIG_PATCH_INVALID: duplicate object key';
      END IF;
      v_position := v_key.next_position;
      WHILE v_position <= v_length
          AND pg_catalog.substr(p_raw, v_position, 1) = ANY(
            ARRAY[' ', E'\t', E'\n', E'\r']
          ) LOOP
        v_position := v_position + 1;
      END LOOP;
      IF pg_catalog.substr(p_raw, v_position, 1) <> ':' THEN
        RAISE EXCEPTION 'SUPPORT_CONFIG_PATCH_INVALID: object separator';
      END IF;
      SELECT * INTO v_item
      FROM register._canonical_json_value(p_raw, v_position + 1, p_depth + 1);
      v_keys := pg_catalog.array_append(v_keys, v_decoded);
      v_key_canonical := pg_catalog.array_append(v_key_canonical, v_key.canonical);
      v_values := pg_catalog.array_append(v_values, v_item.canonical);
      v_position := v_item.next_position;
      WHILE v_position <= v_length
          AND pg_catalog.substr(p_raw, v_position, 1) = ANY(
            ARRAY[' ', E'\t', E'\n', E'\r']
          ) LOOP
        v_position := v_position + 1;
      END LOOP;
      v_character := pg_catalog.substr(p_raw, v_position, 1);
      IF v_character = '}' THEN EXIT;
      ELSIF v_character <> ',' THEN
        RAISE EXCEPTION 'SUPPORT_CONFIG_PATCH_INVALID: invalid JSON object';
      END IF;
      v_position := v_position + 1;
    END LOOP;
    SELECT '{' || pg_catalog.string_agg(
      v_key_canonical[i] || ':' || v_values[i],
      ',' ORDER BY pg_catalog.convert_to(v_keys[i], 'UTF8')
    ) || '}' INTO canonical
    FROM pg_catalog.generate_subscripts(v_keys, 1) AS i;
    next_position := v_position + 1;
    RETURN;
  END IF;

  v_start := v_position;
  WHILE v_position <= v_length
      AND pg_catalog.substr(p_raw, v_position, 1) <> ALL(
        ARRAY[' ', E'\t', E'\n', E'\r', ',', ']', '}']
      ) LOOP
    v_position := v_position + 1;
  END LOOP;
  v_token := pg_catalog.substr(p_raw, v_start, v_position - v_start);
  IF v_token IN ('null', 'true', 'false') THEN
    canonical := v_token;
  ELSE
    canonical := register._canonical_decimal(v_token);
  END IF;
  next_position := v_position;
END
$function$;

CREATE OR REPLACE FUNCTION register.canonical_json_text(p_raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog, register
AS $function$
DECLARE
  v_value record;
  v_position integer;
BEGIN
  IF pg_catalog.octet_length(p_raw) = 0
      OR pg_catalog.octet_length(p_raw) > 1048576 THEN
    RAISE EXCEPTION 'SUPPORT_CONFIG_PATCH_INVALID: JSON byte length';
  END IF;
  SELECT * INTO v_value
  FROM register._canonical_json_value(p_raw, 1, 0);
  v_position := v_value.next_position;
  WHILE v_position <= pg_catalog.length(p_raw)
      AND pg_catalog.substr(p_raw, v_position, 1) = ANY(
        ARRAY[' ', E'\t', E'\n', E'\r']
      ) LOOP
    v_position := v_position + 1;
  END LOOP;
  IF v_position <= pg_catalog.length(p_raw) THEN
    RAISE EXCEPTION 'SUPPORT_CONFIG_PATCH_INVALID: trailing JSON';
  END IF;
  RETURN v_value.canonical;
END
$function$;

CREATE OR REPLACE FUNCTION register._snapshot_sha256(p_register_version bigint)
RETURNS text
LANGUAGE sql
STABLE
STRICT
SET search_path = pg_catalog, register
AS $function$
  SELECT pg_catalog.encode(
    audit_crypto_internal.digest(
      coalesce(
        pg_catalog.string_agg(
          register._lp(row_value.row_key)
            || register._lp(row_value.canonical_value)
            || register._lp(row_value.source_ref),
          ''::bytea
          ORDER BY pg_catalog.convert_to(row_value.row_key, 'UTF8')
        ),
        ''::bytea
      ),
      'sha256'
    ),
    'hex'
  )
  FROM (
    SELECT row.row_key,
      register.canonical_json_text(row.value_json::text) AS canonical_value,
      row.source_ref
    FROM register.register_row AS row
    WHERE row.register_version = p_register_version
  ) AS row_value
$function$;

CREATE OR REPLACE FUNCTION register._assert_register_base_integrity(
  p_base_register_version bigint
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
STRICT
SET search_path = pg_catalog, register
AS $function$
DECLARE
  v_sealed boolean;
  v_stored_count integer;
  v_actual_count integer;
  v_stored_hash text;
  v_actual_hash text;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('debateai:register-publication:v3', 0)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'debateai:register-version:' || p_base_register_version::text,
      0
    )
  );
  SELECT version.sealed,version.row_count,version.snapshot_sha256::text
  INTO v_sealed,v_stored_count,v_stored_hash
  FROM register.register_version AS version
  WHERE version.register_version = p_base_register_version;
  IF NOT FOUND OR NOT v_sealed THEN
    RAISE EXCEPTION 'REGISTER_PUBLICATION_BASE_INVALID';
  END IF;
  SELECT count(*)::integer INTO v_actual_count
  FROM register.register_row AS row
  WHERE row.register_version = p_base_register_version;
  IF v_stored_count IS DISTINCT FROM v_actual_count THEN
    RAISE EXCEPTION 'REGISTER_PUBLICATION_BASE_INVALID';
  END IF;
  IF v_stored_hash IS NOT NULL THEN
    v_actual_hash := register._snapshot_sha256(p_base_register_version);
    IF v_stored_hash IS DISTINCT FROM v_actual_hash THEN
      RAISE EXCEPTION 'REGISTER_PUBLICATION_BASE_INVALID';
    END IF;
  END IF;
END
$function$;

CREATE OR REPLACE FUNCTION register._support_keys()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, register
AS $function$
  SELECT ARRAY[
    'support_enabled',
    'support_model_ref',
    'support_relay_concurrency',
    'support_daily_call_cap',
    'support_limit_anon_msgs_10m',
    'support_limit_anon_msgs_24h',
    'support_limit_anon_sessions_1h',
    'support_limit_session_msgs',
    'support_limit_msg_chars',
    'support_limit_account_msgs_10m',
    'support_limit_account_msgs_24h',
    'support_queue_depth',
    'support_lock_after_injections',
    'support_ip_cooldown_minutes',
    'support_retention_policy',
    'support_retention_ratified_by'
  ]::text[]
$function$;

CREATE OR REPLACE FUNCTION register._support_snapshot_sha256(p_register_version bigint)
RETURNS text
LANGUAGE sql
STABLE
STRICT
SET search_path = pg_catalog, register
AS $function$
  SELECT pg_catalog.encode(
    audit_crypto_internal.digest(
      coalesce(
        pg_catalog.string_agg(
          register._lp(row_value.row_key)
            || register._lp(row_value.canonical_value)
            || register._lp(row_value.source_ref),
          ''::bytea
          ORDER BY pg_catalog.convert_to(row_value.row_key, 'UTF8')
        ),
        ''::bytea
      ),
      'sha256'
    ),
    'hex'
  )
  FROM (
    SELECT row.row_key,
      register.canonical_json_text(row.value_json::text) AS canonical_value,
      row.source_ref
    FROM register.register_row AS row
    WHERE row.register_version = p_register_version
      AND row.row_key = ANY(register._support_keys())
  ) AS row_value
$function$;

CREATE OR REPLACE FUNCTION register._validate_source_ref(p_source_ref text)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog, register
AS $function$
BEGIN
  IF p_source_ref <> pg_catalog.btrim(p_source_ref)
      OR pg_catalog.length(p_source_ref) < 1
      OR pg_catalog.length(p_source_ref) > 1024
      OR p_source_ref ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'REGISTER_PUBLICATION_SEAL_INVALID: source ref';
  END IF;
END
$function$;

CREATE OR REPLACE FUNCTION register._validate_support_value(
  p_key text,
  p_canonical_value text
)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog, register
AS $function$
DECLARE
  v_json jsonb;
  v_text text;
  v_integer numeric;
  v_min numeric;
  v_max numeric;
BEGIN
  IF p_key <> ALL(register._support_keys()) THEN
    RAISE EXCEPTION 'SUPPORT_CONFIG_PATCH_INVALID: unknown key';
  END IF;
  IF register.canonical_json_text(p_canonical_value) <> p_canonical_value THEN
    RAISE EXCEPTION 'SUPPORT_CONFIG_PATCH_INVALID: noncanonical value';
  END IF;
  v_json := p_canonical_value::jsonb;

  IF p_key = 'support_enabled' THEN
    IF pg_catalog.jsonb_typeof(v_json) <> 'boolean' THEN
      RAISE EXCEPTION 'SUPPORT_CONFIG_PATCH_INVALID: support_enabled';
    END IF;
    RETURN;
  END IF;
  IF p_key = 'support_model_ref' THEN
    IF pg_catalog.jsonb_typeof(v_json) <> 'string' THEN
      RAISE EXCEPTION 'SUPPORT_CONFIG_PATCH_INVALID: support_model_ref';
    END IF;
    v_text := v_json #>> '{}';
    IF pg_catalog.length(v_text) < 1 OR pg_catalog.length(v_text) > 128
        OR v_text <> pg_catalog.btrim(v_text)
        OR v_text ~ '[[:space:]]'
        OR pg_catalog.strpos(v_text, '://') > 0
        OR v_text !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]*$' THEN
      RAISE EXCEPTION 'SUPPORT_CONFIG_PATCH_INVALID: support_model_ref';
    END IF;
    RETURN;
  END IF;
  IF p_key = 'support_retention_policy' THEN
    IF pg_catalog.jsonb_typeof(v_json) <> 'string' THEN
      RAISE EXCEPTION 'SUPPORT_CONFIG_PATCH_INVALID: retention policy';
    END IF;
    v_text := v_json #>> '{}';
    IF v_text <> 'keep' AND v_text !~ '^shred-after-days:([1-9]|[1-9][0-9]{1,2}|[1-2][0-9]{3}|3[0-5][0-9]{2}|36[0-4][0-9]|3650)$' THEN
      RAISE EXCEPTION 'SUPPORT_CONFIG_PATCH_INVALID: retention policy';
    END IF;
    RETURN;
  END IF;
  IF p_key = 'support_retention_ratified_by' THEN
    IF p_canonical_value NOT IN ('null', '"V"') THEN
      RAISE EXCEPTION 'SUPPORT_CONFIG_PATCH_INVALID: retention ratifier';
    END IF;
    RETURN;
  END IF;

  IF p_canonical_value !~ '^(0|[1-9][0-9]*)$' THEN
    RAISE EXCEPTION 'SUPPORT_CONFIG_PATCH_INVALID: integer bound';
  END IF;
  v_integer := p_canonical_value::numeric;
  v_min := CASE p_key WHEN 'support_queue_depth' THEN 0 ELSE 1 END;
  v_max := CASE p_key
    WHEN 'support_relay_concurrency' THEN 16
    WHEN 'support_daily_call_cap' THEN 1000000
    WHEN 'support_limit_anon_msgs_10m' THEN 100000
    WHEN 'support_limit_anon_msgs_24h' THEN 1000000
    WHEN 'support_limit_anon_sessions_1h' THEN 100000
    WHEN 'support_limit_session_msgs' THEN 100000
    WHEN 'support_limit_msg_chars' THEN 100000
    WHEN 'support_limit_account_msgs_10m' THEN 100000
    WHEN 'support_limit_account_msgs_24h' THEN 1000000
    WHEN 'support_queue_depth' THEN 1000
    WHEN 'support_lock_after_injections' THEN 100
    WHEN 'support_ip_cooldown_minutes' THEN 10080
    ELSE -1
  END;
  IF v_max < 0 OR v_integer < v_min OR v_integer > v_max THEN
    RAISE EXCEPTION 'SUPPORT_CONFIG_PATCH_INVALID: integer bound';
  END IF;
END
$function$;

CREATE OR REPLACE FUNCTION register._assert_support_catalogue(p_register_version bigint)
RETURNS void
LANGUAGE plpgsql
STABLE
STRICT
SET search_path = pg_catalog, register
AS $function$
DECLARE
  v_key text;
  v_value text;
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM register.register_row AS row
  WHERE row.register_version = p_register_version
    AND row.row_key = ANY(register._support_keys());
  IF v_count <> 16 THEN
    RAISE EXCEPTION 'SUPPORT_CONFIG_SNAPSHOT_INVALID: support catalogue';
  END IF;
  FOREACH v_key IN ARRAY register._support_keys() LOOP
    SELECT register.canonical_json_text(row.value_json::text)
    INTO v_value
    FROM register.register_row AS row
    WHERE row.register_version = p_register_version
      AND row.row_key = v_key;
    IF v_value IS NULL THEN
      RAISE EXCEPTION 'SUPPORT_CONFIG_SNAPSHOT_INVALID: support catalogue';
    END IF;
    PERFORM register._validate_support_value(v_key, v_value);
  END LOOP;
END
$function$;

CREATE OR REPLACE FUNCTION register._current_support_register_version()
RETURNS bigint
LANGUAGE sql
STABLE
SET search_path = pg_catalog, register
AS $function$
  SELECT version.register_version
  FROM register.register_version AS version
  WHERE version.sealed
    AND version.publication_kind = 'SUPPORT_CONFIGURATION'
  ORDER BY version.register_version DESC
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION register._register_row_insert_guard()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, register
AS $function$
DECLARE
  v_context text := pg_catalog.current_setting('register.publication_context', true);
  v_marker jsonb;
  v_changed text[];
  v_sorted text[];
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('debateai:register-publication:v3', 0)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('debateai:register-version:' || NEW.register_version::text, 0)
  );
  IF EXISTS (
    SELECT 1 FROM register.register_version AS version
    WHERE version.register_version = NEW.register_version
  ) THEN
    RAISE EXCEPTION 'REGISTER_PUBLICATION_LATE_ROW';
  END IF;
  PERFORM register._validate_source_ref(NEW.source_ref);
  IF NEW.row_key = '' OR pg_catalog.length(NEW.row_key) > 256
      OR NEW.row_key <> pg_catalog.btrim(NEW.row_key)
      OR NEW.row_key ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'REGISTER_PUBLICATION_SEAL_INVALID: row key';
  END IF;
  IF EXISTS (
    SELECT 1 FROM register.register_row AS marker
    WHERE marker.register_version = NEW.register_version
      AND marker.row_key = 'supportActivation'
  ) THEN
    RAISE EXCEPTION 'REGISTER_PUBLICATION_LATE_ROW';
  END IF;

  IF NEW.row_key <> 'supportActivation' THEN
    IF v_context NOT IN (
      'GENERAL_ROWS:' || NEW.register_version::text,
      'SUPPORT_ROWS:' || NEW.register_version::text,
      'HISTORICAL_ROWS:' || NEW.register_version::text
    ) THEN
      RAISE EXCEPTION 'REGISTER_PUBLICATION_SEAL_INVALID: closed row writer';
    END IF;
    RETURN NEW;
  END IF;

  IF v_context <> 'SUPPORT_MARKER:' || NEW.register_version::text THEN
    RAISE EXCEPTION 'SUPPORT_CONFIG_SNAPSHOT_INVALID: forged activation marker';
  END IF;
  v_marker := NEW.value_json;
  IF pg_catalog.jsonb_typeof(v_marker) <> 'object'
      OR (SELECT count(*) FROM pg_catalog.jsonb_object_keys(v_marker)) <> 8
      OR NOT v_marker ?& ARRAY[
        'kind','schema_version','target_register_version',
        'previous_support_register_version','support_snapshot_sha256',
        'changed_keys','source_ref','recorded_at'
      ] THEN
    RAISE EXCEPTION 'SUPPORT_CONFIG_SNAPSHOT_INVALID: marker shape';
  END IF;
  IF v_marker ->> 'kind' <> 'SUPPORT_CONFIGURATION_ACTIVATION'
      OR v_marker ->> 'schema_version' <> '1'
      OR pg_catalog.jsonb_typeof(v_marker -> 'schema_version') <> 'number'
      OR v_marker ->> 'target_register_version' <> NEW.register_version::text
      OR (v_marker ->> 'support_snapshot_sha256') !~ '^[0-9a-f]{64}$'
      OR v_marker ->> 'source_ref' <> NEW.source_ref
      OR pg_catalog.jsonb_typeof(v_marker -> 'changed_keys') <> 'array'
      OR pg_catalog.jsonb_typeof(v_marker -> 'recorded_at') <> 'string' THEN
    RAISE EXCEPTION 'SUPPORT_CONFIG_SNAPSHOT_INVALID: marker values';
  END IF;
  IF v_marker -> 'previous_support_register_version' <> 'null'::jsonb
      AND (
        pg_catalog.jsonb_typeof(v_marker -> 'previous_support_register_version') <> 'string'
        OR (v_marker ->> 'previous_support_register_version') !~ '^[1-9][0-9]*$'
      ) THEN
    RAISE EXCEPTION 'SUPPORT_CONFIG_SNAPSHOT_INVALID: marker predecessor';
  END IF;
  SELECT coalesce(pg_catalog.array_agg(value), ARRAY[]::text[])
  INTO v_changed
  FROM pg_catalog.jsonb_array_elements_text(v_marker -> 'changed_keys') AS element(value);
  SELECT coalesce(
    pg_catalog.array_agg(value ORDER BY pg_catalog.convert_to(value, 'UTF8')),
    ARRAY[]::text[]
  ) INTO v_sorted
  FROM pg_catalog.unnest(v_changed) AS changed(value);
  IF v_changed <> v_sorted
      OR pg_catalog.cardinality(v_changed) NOT BETWEEN 1 AND 16
      OR pg_catalog.cardinality(v_changed) <> (
        SELECT count(DISTINCT value) FROM pg_catalog.unnest(v_changed) AS changed(value)
      )
      OR EXISTS (
        SELECT 1 FROM pg_catalog.unnest(v_changed) AS changed(value)
        WHERE value <> ALL(register._support_keys())
      ) THEN
    RAISE EXCEPTION 'SUPPORT_CONFIG_SNAPSHOT_INVALID: changed keys';
  END IF;
  BEGIN
    PERFORM (v_marker ->> 'recorded_at')::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'SUPPORT_CONFIG_SNAPSHOT_INVALID: marker recorded time';
  END;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION register._register_version_seal_guard()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, register
AS $function$
DECLARE
  v_context text := pg_catalog.current_setting('register.publication_context', true);
  v_actual_count integer;
  v_actual_hash text;
  v_marker register.register_row%ROWTYPE;
  v_marker_count integer;
  v_current_support bigint;
  v_marker_changed_keys text[];
  v_actual_changed_keys text[];
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('debateai:register-publication:v3', 0)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('debateai:register-version:' || NEW.register_version::text, 0)
  );
  SELECT count(*)::integer INTO v_actual_count
  FROM register.register_row AS row
  WHERE row.register_version = NEW.register_version;
  v_actual_hash := register._snapshot_sha256(NEW.register_version);

  IF NEW.register_version BETWEEN 1 AND 4 THEN
    IF v_context <> 'HISTORICAL_SEAL:' || NEW.register_version::text
        OR NEW.base_register_version IS NOT NULL
        OR NEW.publication_id IS NOT NULL
        OR NEW.request_sha256 IS NOT NULL
        OR NEW.snapshot_sha256 IS NOT NULL
        OR NEW.publication_kind IS NOT NULL
        OR NEW.recorded_at IS NOT NULL
        OR NOT NEW.sealed
        OR NEW.row_count <> v_actual_count
        OR EXISTS (
          SELECT 1 FROM register.register_row AS marker
          WHERE marker.register_version = NEW.register_version
            AND marker.row_key = 'supportActivation'
        ) THEN
      RAISE EXCEPTION 'REGISTER_PUBLICATION_SEAL_INVALID: historical seal';
    END IF;
    RETURN NEW;
  END IF;

  IF v_context <> 'SEAL:' || coalesce(NEW.publication_kind, '')
      || ':' || NEW.register_version::text
      OR NEW.base_register_version IS NULL
      OR NEW.publication_id IS NULL
      OR NEW.request_sha256 IS NULL
      OR NEW.snapshot_sha256 IS NULL
      OR NEW.publication_kind IS NULL
      OR NEW.recorded_at IS NULL
      OR NOT NEW.sealed
      OR NEW.row_count <> v_actual_count
      OR NEW.row_count < 1
      OR NEW.request_sha256::text !~ '^[0-9a-f]{64}$'
      OR NEW.snapshot_sha256::text !~ '^[0-9a-f]{64}$'
      OR NEW.snapshot_sha256::text <> v_actual_hash THEN
    RAISE EXCEPTION 'REGISTER_PUBLICATION_SEAL_INVALID: future seal';
  END IF;
  IF NEW.base_register_version >= NEW.register_version THEN
    RAISE EXCEPTION 'REGISTER_PUBLICATION_BASE_INVALID';
  END IF;
  PERFORM register._assert_register_base_integrity(NEW.base_register_version);

  SELECT count(*)::integer INTO v_marker_count
  FROM register.register_row AS marker
  WHERE marker.register_version = NEW.register_version
    AND marker.row_key = 'supportActivation';
  IF NEW.publication_kind = 'GENERAL' THEN
    IF v_marker_count <> 0 THEN
      RAISE EXCEPTION 'REGISTER_PUBLICATION_SEAL_INVALID: GENERAL marker';
    END IF;
    RETURN NEW;
  ELSIF NEW.publication_kind <> 'SUPPORT_CONFIGURATION' OR v_marker_count <> 1 THEN
    RAISE EXCEPTION 'REGISTER_PUBLICATION_SEAL_INVALID: support marker count';
  END IF;

  SELECT * INTO STRICT v_marker
  FROM register.register_row AS marker
  WHERE marker.register_version = NEW.register_version
    AND marker.row_key = 'supportActivation';
  PERFORM register._assert_support_catalogue(NEW.register_version);
  v_current_support := register._current_support_register_version();
  SELECT coalesce(pg_catalog.array_agg(value), ARRAY[]::text[])
  INTO v_marker_changed_keys
  FROM pg_catalog.jsonb_array_elements_text(
    v_marker.value_json -> 'changed_keys'
  ) AS changed(value);
  IF pg_catalog.cardinality(v_marker_changed_keys) NOT BETWEEN 1 AND 16 THEN
    RAISE EXCEPTION 'SUPPORT_CONFIG_SNAPSHOT_INVALID: changed keys';
  END IF;
  IF v_marker.value_json ->> 'target_register_version' <> NEW.register_version::text
      OR v_marker.value_json ->> 'support_snapshot_sha256'
        <> register._support_snapshot_sha256(NEW.register_version)
      OR v_marker.value_json ->> 'source_ref' <> v_marker.source_ref
      OR (v_marker.value_json ->> 'recorded_at')::timestamptz <> NEW.recorded_at
      OR (
        CASE
          WHEN v_current_support IS NULL
            THEN v_marker.value_json -> 'previous_support_register_version' <> 'null'::jsonb
          ELSE (v_marker.value_json ->> 'previous_support_register_version')
            IS DISTINCT FROM v_current_support::text
        END
  ) THEN
    RAISE EXCEPTION 'SUPPORT_CONFIG_SNAPSHOT_INVALID: activation binding';
  END IF;
  IF v_current_support IS NOT NULL THEN
    SELECT coalesce(
      pg_catalog.array_agg(
        support_key ORDER BY pg_catalog.convert_to(support_key, 'UTF8')
      ),
      ARRAY[]::text[]
    )
    INTO v_actual_changed_keys
    FROM pg_catalog.unnest(register._support_keys()) AS support(support_key)
    WHERE (
      SELECT register.canonical_json_text(current_row.value_json::text)
      FROM register.register_row AS current_row
      WHERE current_row.register_version = NEW.register_version
        AND current_row.row_key = support_key
    ) IS DISTINCT FROM (
      SELECT register.canonical_json_text(previous_row.value_json::text)
      FROM register.register_row AS previous_row
      WHERE previous_row.register_version = v_current_support
        AND previous_row.row_key = support_key
    );
    IF v_marker_changed_keys IS DISTINCT FROM v_actual_changed_keys THEN
      RAISE EXCEPTION 'SUPPORT_CONFIG_SNAPSHOT_INVALID: activation change set';
    END IF;
  END IF;
  RETURN NEW;
END
$function$;

DO $trigger_install$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'register.register_row'::regclass
      AND tgname = 'register_row_publication_insert_guard'
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER register_row_publication_insert_guard
      BEFORE INSERT ON register.register_row
      FOR EACH ROW EXECUTE FUNCTION register._register_row_insert_guard();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'register.register_version'::regclass
      AND tgname = 'register_version_publication_seal_guard'
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER register_version_publication_seal_guard
      BEFORE INSERT ON register.register_version
      FOR EACH ROW EXECUTE FUNCTION register._register_version_seal_guard();
  END IF;
END
$trigger_install$;

DO $trigger_contract$
DECLARE
  v_row_trigger record;
  v_seal_trigger record;
BEGIN
  SELECT * INTO v_row_trigger FROM pg_catalog.pg_trigger
  WHERE tgrelid = 'register.register_row'::regclass
    AND tgname = 'register_row_publication_insert_guard'
    AND NOT tgisinternal;
  SELECT * INTO v_seal_trigger FROM pg_catalog.pg_trigger
  WHERE tgrelid = 'register.register_version'::regclass
    AND tgname = 'register_version_publication_seal_guard'
    AND NOT tgisinternal;
  IF v_row_trigger.oid IS NULL
      OR v_row_trigger.tgfoid <> 'register._register_row_insert_guard()'::regprocedure
      OR v_row_trigger.tgtype <> 7
      OR v_row_trigger.tgenabled <> 'O'
      OR v_row_trigger.tgnargs <> 0
      OR v_seal_trigger.oid IS NULL
      OR v_seal_trigger.tgfoid <> 'register._register_version_seal_guard()'::regprocedure
      OR v_seal_trigger.tgtype <> 7
      OR v_seal_trigger.tgenabled <> 'O'
      OR v_seal_trigger.tgnargs <> 0 THEN
    RAISE EXCEPTION 'REGISTER_PUBLICATION_DEFINITION_DRIFT: insert triggers';
  END IF;
END
$trigger_contract$;

CREATE OR REPLACE FUNCTION register.allocate_register_version()
RETURNS bigint
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, register
AS $function$
DECLARE
  v_last_value bigint;
  v_is_called boolean;
  v_allocated bigint;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('debateai:register-publication:v3', 0)
  );
  SELECT last_value,is_called INTO v_last_value,v_is_called
  FROM register.register_version_id_seq;
  IF v_last_value = 9223372036854775807 AND v_is_called THEN
    RAISE EXCEPTION 'REGISTER_VERSION_ALLOCATION_EXHAUSTED';
  END IF;
  BEGIN
    v_allocated := pg_catalog.nextval('register.register_version_id_seq'::regclass);
  EXCEPTION WHEN sequence_generator_limit_exceeded THEN
    RAISE EXCEPTION 'REGISTER_VERSION_ALLOCATION_EXHAUSTED';
  END;
  IF v_allocated <= 4 THEN
    RAISE EXCEPTION 'REGISTER_PUBLICATION_DEFINITION_DRIFT: allocator floor';
  END IF;
  RETURN v_allocated;
END
$function$;

CREATE OR REPLACE FUNCTION register.import_historical_register_version(
  p_register_version bigint,
  p_rows jsonb,
  p_expected_hash char(64)
)
RETURNS TABLE (
  register_version text,
  row_count integer,
  snapshot_sha256 text,
  outcome text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, register
AS $function$
DECLARE
  v_row jsonb;
  v_row_key text;
  v_value text;
  v_source_ref text;
  v_count integer;
  v_hash text;
  v_previous_context text := pg_catalog.current_setting('register.publication_context', true);
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'REGISTER_PUBLICATION_SEAL_INVALID: READ COMMITTED required';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('debateai:register-publication:v3', 0)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('debateai:register-version:' || p_register_version::text, 0)
  );
  IF p_register_version IS NULL
      OR p_rows IS NULL
      OR p_expected_hash IS NULL
      OR p_register_version NOT BETWEEN 1 AND 4
      OR p_expected_hash::text !~ '^[0-9a-f]{64}$'
      OR pg_catalog.jsonb_typeof(p_rows) <> 'array'
      OR pg_catalog.jsonb_array_length(p_rows) < 1 THEN
    RAISE EXCEPTION 'REGISTER_PUBLICATION_SEAL_INVALID: historical input';
  END IF;

  FOR v_row IN SELECT value FROM pg_catalog.jsonb_array_elements(p_rows) AS item(value) LOOP
    IF pg_catalog.jsonb_typeof(v_row) <> 'object'
        OR (SELECT count(*) FROM pg_catalog.jsonb_object_keys(v_row)) <> 3
        OR NOT v_row ?& ARRAY['row_key','value_json_text','source_ref']
        OR pg_catalog.jsonb_typeof(v_row -> 'row_key') <> 'string'
        OR pg_catalog.jsonb_typeof(v_row -> 'value_json_text') <> 'string'
        OR pg_catalog.jsonb_typeof(v_row -> 'source_ref') <> 'string' THEN
      RAISE EXCEPTION 'REGISTER_PUBLICATION_SEAL_INVALID: historical row envelope';
    END IF;
    v_row_key := v_row ->> 'row_key';
    v_value := register.canonical_json_text(v_row ->> 'value_json_text');
    v_source_ref := v_row ->> 'source_ref';
    IF v_value <> v_row ->> 'value_json_text'
        OR v_row_key = 'supportActivation' OR v_row_key = ''
        OR pg_catalog.length(v_row_key) > 256
        OR v_row_key <> pg_catalog.btrim(v_row_key) THEN
      RAISE EXCEPTION 'REGISTER_PUBLICATION_SEAL_INVALID: historical key';
    END IF;
    PERFORM register._validate_source_ref(v_source_ref);
  END LOOP;
  IF EXISTS (
    SELECT item.value ->> 'row_key'
    FROM pg_catalog.jsonb_array_elements(p_rows) AS item(value)
    GROUP BY item.value ->> 'row_key'
    HAVING count(*) <> 1
  ) THEN
    RAISE EXCEPTION 'REGISTER_PUBLICATION_SEAL_INVALID: duplicate historical key';
  END IF;
  SELECT count(*)::integer,
    pg_catalog.encode(
      audit_crypto_internal.digest(
        pg_catalog.string_agg(
          register._lp(item.value ->> 'row_key')
            || register._lp(register.canonical_json_text(item.value ->> 'value_json_text'))
            || register._lp(item.value ->> 'source_ref'),
          ''::bytea
          ORDER BY pg_catalog.convert_to(item.value ->> 'row_key', 'UTF8')
        ),
        'sha256'
      ),
      'hex'
    )
  INTO v_count,v_hash
  FROM pg_catalog.jsonb_array_elements(p_rows) AS item(value);
  IF v_hash <> p_expected_hash::text THEN
    RAISE EXCEPTION 'REGISTER_PUBLICATION_SEAL_INVALID: historical digest';
  END IF;

  IF EXISTS (
    SELECT 1 FROM register.register_version AS version
    WHERE version.register_version = p_register_version
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM register.register_version AS version
      WHERE version.register_version = p_register_version
        AND version.sealed
        AND version.row_count = v_count
        AND version.base_register_version IS NULL
        AND version.publication_id IS NULL
        AND version.request_sha256 IS NULL
        AND version.snapshot_sha256 IS NULL
        AND version.publication_kind IS NULL
        AND version.recorded_at IS NULL
    ) OR register._snapshot_sha256(p_register_version) <> v_hash
      OR EXISTS (
        SELECT 1
        FROM register.register_row AS existing
        WHERE existing.register_version = p_register_version
          AND NOT EXISTS (
            SELECT 1
            FROM pg_catalog.jsonb_array_elements(p_rows) AS supplied(value)
            WHERE supplied.value ->> 'row_key' = existing.row_key
              AND register.canonical_json_text(supplied.value ->> 'value_json_text')
                = register.canonical_json_text(existing.value_json::text)
              AND supplied.value ->> 'source_ref' = existing.source_ref
          )
      ) THEN
      RAISE EXCEPTION 'REGISTER_PUBLICATION_SEAL_INVALID: historical replay drift';
    END IF;
    RETURN QUERY SELECT p_register_version::text,v_count,v_hash,'REPLAYED'::text;
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM register.register_row AS row
    WHERE row.register_version = p_register_version
  ) THEN
    RAISE EXCEPTION 'REGISTER_PUBLICATION_SEAL_INVALID: dangling historical rows';
  END IF;

  PERFORM pg_catalog.set_config(
    'register.publication_context',
    'HISTORICAL_ROWS:' || p_register_version::text,
    true
  );
  INSERT INTO register.register_row (register_version,row_key,value_json,source_ref)
  SELECT p_register_version,
    item.value ->> 'row_key',
    register.canonical_json_text(item.value ->> 'value_json_text')::jsonb,
    item.value ->> 'source_ref'
  FROM pg_catalog.jsonb_array_elements(p_rows) AS item(value)
  ORDER BY pg_catalog.convert_to(item.value ->> 'row_key', 'UTF8');
  PERFORM pg_catalog.set_config(
    'register.publication_context',
    'HISTORICAL_SEAL:' || p_register_version::text,
    true
  );
  INSERT INTO register.register_version (register_version,row_count,sealed)
  VALUES (p_register_version,v_count,true);
  PERFORM pg_catalog.set_config(
    'register.publication_context',
    coalesce(v_previous_context, ''),
    true
  );
  RETURN QUERY SELECT p_register_version::text,v_count,v_hash,'CREATED'::text;
END
$function$;

CREATE OR REPLACE FUNCTION register.publish_register_version(
  p_publication_id uuid,
  p_request_sha256 char(64),
  p_base_register_version bigint,
  p_rows jsonb,
  p_source_ref text
)
RETURNS TABLE (
  register_version text,
  base_register_version text,
  publication_id uuid,
  publication_kind text,
  request_sha256 text,
  snapshot_sha256 text,
  row_count integer,
  recorded_at timestamptz
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, register
AS $function$
DECLARE
  v_row jsonb;
  v_request_hash text;
  v_version bigint;
  v_recorded_at timestamptz;
  v_snapshot_hash text;
  v_count integer;
  v_previous_context text := pg_catalog.current_setting('register.publication_context', true);
  v_existing register.register_version%ROWTYPE;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'REGISTER_PUBLICATION_SEAL_INVALID: READ COMMITTED required';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('debateai:register-publication:v3', 0)
  );
  PERFORM register._validate_source_ref(p_source_ref);
  IF p_publication_id IS NULL
      OR p_request_sha256 IS NULL
      OR p_base_register_version IS NULL
      OR p_rows IS NULL
      OR p_source_ref IS NULL
      OR p_request_sha256::text !~ '^[0-9a-f]{64}$'
      OR pg_catalog.jsonb_typeof(p_rows) <> 'array'
      OR pg_catalog.jsonb_array_length(p_rows) < 1 THEN
    RAISE EXCEPTION 'REGISTER_PUBLICATION_SEAL_INVALID: GENERAL input';
  END IF;
  FOR v_row IN SELECT value FROM pg_catalog.jsonb_array_elements(p_rows) AS item(value) LOOP
    IF pg_catalog.jsonb_typeof(v_row) <> 'object'
        OR (SELECT count(*) FROM pg_catalog.jsonb_object_keys(v_row)) <> 3
        OR NOT v_row ?& ARRAY['row_key','value_json_text','source_ref']
        OR pg_catalog.jsonb_typeof(v_row -> 'row_key') <> 'string'
        OR pg_catalog.jsonb_typeof(v_row -> 'value_json_text') <> 'string'
        OR pg_catalog.jsonb_typeof(v_row -> 'source_ref') <> 'string'
        OR v_row ->> 'row_key' = 'supportActivation'
        OR v_row ->> 'row_key' = ''
        OR pg_catalog.length(v_row ->> 'row_key') > 256
        OR v_row ->> 'row_key' <> pg_catalog.btrim(v_row ->> 'row_key') THEN
      RAISE EXCEPTION 'REGISTER_PUBLICATION_SEAL_INVALID: GENERAL row envelope';
    END IF;
    IF register.canonical_json_text(v_row ->> 'value_json_text')
        <> v_row ->> 'value_json_text' THEN
      RAISE EXCEPTION 'REGISTER_PUBLICATION_SEAL_INVALID: noncanonical GENERAL value';
    END IF;
    PERFORM register._validate_source_ref(v_row ->> 'source_ref');
  END LOOP;
  IF EXISTS (
    SELECT item.value ->> 'row_key'
    FROM pg_catalog.jsonb_array_elements(p_rows) AS item(value)
    GROUP BY item.value ->> 'row_key'
    HAVING count(*) <> 1
  ) THEN
    RAISE EXCEPTION 'REGISTER_PUBLICATION_SEAL_INVALID: duplicate GENERAL key';
  END IF;
  SELECT pg_catalog.encode(
    audit_crypto_internal.digest(
      register._lp(p_publication_id::text)
        || register._lp('GENERAL')
        || register._lp(p_base_register_version::text)
        || pg_catalog.string_agg(
          register._lp(item.value ->> 'row_key')
            || register._lp(register.canonical_json_text(item.value ->> 'value_json_text'))
            || register._lp(item.value ->> 'source_ref'),
          ''::bytea
          ORDER BY pg_catalog.convert_to(item.value ->> 'row_key', 'UTF8')
        )
        || register._lp(p_source_ref),
      'sha256'
    ),
    'hex'
  ) INTO v_request_hash
  FROM pg_catalog.jsonb_array_elements(p_rows) AS item(value);
  IF v_request_hash <> p_request_sha256::text THEN
    RAISE EXCEPTION 'REGISTER_PUBLICATION_SEAL_INVALID: GENERAL request digest';
  END IF;

  SELECT * INTO v_existing
  FROM register.register_version AS version
  WHERE version.publication_id = p_publication_id;
  IF FOUND THEN
    IF v_existing.request_sha256::text <> v_request_hash
        OR v_existing.publication_kind <> 'GENERAL' THEN
      RAISE EXCEPTION 'SUPPORT_CONFIG_OPERATION_REUSED';
    END IF;
    RETURN QUERY SELECT
      v_existing.register_version::text,
      v_existing.base_register_version::text,
      v_existing.publication_id,
      v_existing.publication_kind,
      v_existing.request_sha256::text,
      v_existing.snapshot_sha256::text,
      v_existing.row_count,
      v_existing.recorded_at;
    RETURN;
  END IF;
  PERFORM register._assert_register_base_integrity(p_base_register_version);

  v_version := register.allocate_register_version();
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('debateai:register-version:' || v_version::text, 0)
  );
  v_recorded_at := pg_catalog.clock_timestamp();
  PERFORM pg_catalog.set_config(
    'register.publication_context',
    'GENERAL_ROWS:' || v_version::text,
    true
  );
  INSERT INTO register.register_row (register_version,row_key,value_json,source_ref)
  SELECT v_version,
    item.value ->> 'row_key',
    register.canonical_json_text(item.value ->> 'value_json_text')::jsonb,
    item.value ->> 'source_ref'
  FROM pg_catalog.jsonb_array_elements(p_rows) AS item(value)
  ORDER BY pg_catalog.convert_to(item.value ->> 'row_key', 'UTF8');
  SELECT count(*)::integer INTO v_count
  FROM register.register_row AS row
  WHERE row.register_version = v_version;
  v_snapshot_hash := register._snapshot_sha256(v_version);
  PERFORM pg_catalog.set_config(
    'register.publication_context',
    'SEAL:GENERAL:' || v_version::text,
    true
  );
  INSERT INTO register.register_version (
    register_version,row_count,sealed,base_register_version,publication_id,
    request_sha256,snapshot_sha256,publication_kind,recorded_at
  ) VALUES (
    v_version,v_count,true,p_base_register_version,p_publication_id,
    v_request_hash,v_snapshot_hash,'GENERAL',v_recorded_at
  );
  PERFORM pg_catalog.set_config(
    'register.publication_context',
    coalesce(v_previous_context, ''),
    true
  );
  RETURN QUERY SELECT
    v_version::text,p_base_register_version::text,p_publication_id,
    'GENERAL'::text,v_request_hash,v_snapshot_hash,v_count,v_recorded_at;
END
$function$;

CREATE OR REPLACE FUNCTION register.publish_support_configuration(
  p_publication_id uuid,
  p_request_sha256 char(64),
  p_expected_support_register_version bigint,
  p_base_register_version bigint,
  p_schema_version integer,
  p_patch jsonb,
  p_source_ref text
)
RETURNS TABLE (
  register_version text,
  base_register_version text,
  publication_id uuid,
  publication_kind text,
  request_sha256 text,
  snapshot_sha256 text,
  row_count integer,
  recorded_at timestamptz,
  previous_support_register_version text,
  support_snapshot_sha256 text,
  changed_keys text[]
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, register
AS $function$
DECLARE
  v_patch_row jsonb;
  v_patch_keys text[] := ARRAY[]::text[];
  v_patch_values text[] := ARRAY[]::text[];
  v_changed_keys text[] := ARRAY[]::text[];
  v_key text;
  v_value text;
  v_active_value text;
  v_request_hash text;
  v_canonical_patch text;
  v_current_support bigint;
  v_version bigint;
  v_recorded_at timestamptz;
  v_support_hash text;
  v_snapshot_hash text;
  v_count integer;
  v_marker jsonb;
  v_previous_context text := pg_catalog.current_setting('register.publication_context', true);
  v_existing register.register_version%ROWTYPE;
  v_existing_marker jsonb;
  v_existing_changed text[];
  v_current_ratifier text;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'SUPPORT_CONFIG_SNAPSHOT_INVALID: READ COMMITTED required';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('debateai:register-publication:v3', 0)
  );
  PERFORM register._validate_source_ref(p_source_ref);
  IF p_schema_version IS NULL OR p_schema_version <> 1 THEN
    RAISE EXCEPTION 'SUPPORT_CONFIG_SCHEMA_UNSUPPORTED';
  END IF;
  IF p_publication_id IS NULL
      OR p_request_sha256 IS NULL
      OR p_base_register_version IS NULL
      OR p_patch IS NULL
      OR p_source_ref IS NULL
      OR p_request_sha256::text !~ '^[0-9a-f]{64}$'
      OR pg_catalog.jsonb_typeof(p_patch) <> 'array'
      OR pg_catalog.jsonb_array_length(p_patch) < 1 THEN
    RAISE EXCEPTION 'SUPPORT_CONFIG_PATCH_INVALID';
  END IF;

  FOR v_patch_row IN
    SELECT value FROM pg_catalog.jsonb_array_elements(p_patch) AS item(value)
  LOOP
    IF pg_catalog.jsonb_typeof(v_patch_row) <> 'object'
        OR (SELECT count(*) FROM pg_catalog.jsonb_object_keys(v_patch_row)) <> 2
        OR NOT v_patch_row ?& ARRAY['key','value_json_text']
        OR pg_catalog.jsonb_typeof(v_patch_row -> 'key') <> 'string'
        OR pg_catalog.jsonb_typeof(v_patch_row -> 'value_json_text') <> 'string'
        OR v_patch_row ->> 'key' = 'supportActivation'
        OR v_patch_row ->> 'key' <> ALL(register._support_keys()) THEN
      RAISE EXCEPTION 'SUPPORT_CONFIG_PATCH_INVALID: patch envelope';
    END IF;
    v_key := v_patch_row ->> 'key';
    v_value := register.canonical_json_text(v_patch_row ->> 'value_json_text');
    IF v_value <> v_patch_row ->> 'value_json_text'
        OR v_key = ANY(v_patch_keys) THEN
      RAISE EXCEPTION 'SUPPORT_CONFIG_PATCH_INVALID: duplicate or noncanonical patch';
    END IF;
    PERFORM register._validate_support_value(v_key, v_value);
    v_patch_keys := pg_catalog.array_append(v_patch_keys, v_key);
    v_patch_values := pg_catalog.array_append(v_patch_values, v_value);
  END LOOP;
  v_canonical_patch := register.canonical_json_text(p_patch::text);
  SELECT pg_catalog.encode(
    audit_crypto_internal.digest(
      register._lp(p_publication_id::text)
        || register._lp('SUPPORT_CONFIGURATION')
        || register._lp(p_base_register_version::text)
        || register._lp(coalesce(p_expected_support_register_version::text, ''))
        || register._lp(p_schema_version::text)
        || register._lp(v_canonical_patch)
        || register._lp(p_source_ref),
      'sha256'
    ),
    'hex'
  ) INTO v_request_hash;
  IF v_request_hash <> p_request_sha256::text THEN
    RAISE EXCEPTION 'SUPPORT_CONFIG_PATCH_INVALID: request digest';
  END IF;

  SELECT * INTO v_existing
  FROM register.register_version AS version
  WHERE version.publication_id = p_publication_id;
  IF FOUND THEN
    IF v_existing.request_sha256::text <> v_request_hash
        OR v_existing.publication_kind <> 'SUPPORT_CONFIGURATION' THEN
      RAISE EXCEPTION 'SUPPORT_CONFIG_OPERATION_REUSED';
    END IF;
    SELECT marker.value_json INTO STRICT v_existing_marker
    FROM register.register_row AS marker
    WHERE marker.register_version = v_existing.register_version
      AND marker.row_key = 'supportActivation';
    SELECT coalesce(pg_catalog.array_agg(value), ARRAY[]::text[])
    INTO v_existing_changed
    FROM pg_catalog.jsonb_array_elements_text(v_existing_marker -> 'changed_keys') AS item(value);
    RETURN QUERY SELECT
      v_existing.register_version::text,
      v_existing.base_register_version::text,
      v_existing.publication_id,
      v_existing.publication_kind,
      v_existing.request_sha256::text,
      v_existing.snapshot_sha256::text,
      v_existing.row_count,
      v_existing.recorded_at,
      v_existing_marker ->> 'previous_support_register_version',
      v_existing_marker ->> 'support_snapshot_sha256',
      v_existing_changed;
    RETURN;
  END IF;

  v_current_support := register._current_support_register_version();
  IF v_current_support IS DISTINCT FROM p_expected_support_register_version THEN
    RAISE EXCEPTION 'SUPPORT_CONFIG_ACTIVATION_CONFLICT';
  END IF;
  PERFORM register._assert_register_base_integrity(p_base_register_version);
  IF v_current_support IS NOT NULL
      AND p_base_register_version <> v_current_support
      AND pg_catalog.cardinality(v_patch_keys) <> 16 THEN
    RAISE EXCEPTION 'SUPPORT_CONFIG_PATCH_INVALID: rebase requires full catalogue';
  END IF;

  FOREACH v_key IN ARRAY register._support_keys() LOOP
    IF v_key = ANY(v_patch_keys) THEN
      v_value := v_patch_values[pg_catalog.array_position(v_patch_keys, v_key)];
    ELSE
      SELECT register.canonical_json_text(row.value_json::text)
      INTO v_value
      FROM register.register_row AS row
      WHERE row.register_version = p_base_register_version
        AND row.row_key = v_key;
    END IF;
    IF v_value IS NULL THEN
      RAISE EXCEPTION 'SUPPORT_CONFIG_UNINITIALIZED';
    END IF;
    PERFORM register._validate_support_value(v_key, v_value);
  END LOOP;

  IF v_current_support IS NOT NULL THEN
    SELECT register.canonical_json_text(row.value_json::text)
    INTO v_current_ratifier
    FROM register.register_row AS row
    WHERE row.register_version = v_current_support
      AND row.row_key = 'support_retention_ratified_by';
    IF v_current_ratifier = '"V"'
        AND 'support_retention_policy' = ANY(v_patch_keys) THEN
      RAISE EXCEPTION 'SUPPORT_CONFIG_PATCH_INVALID: reset retention ratifier first';
    END IF;
    IF v_current_ratifier = '"V"'
        AND 'support_retention_ratified_by' = ANY(v_patch_keys)
        AND NOT (
          pg_catalog.cardinality(v_patch_keys) = 1
          AND v_patch_values[pg_catalog.array_position(
            v_patch_keys,
            'support_retention_ratified_by'
          )] = 'null'
        ) THEN
      RAISE EXCEPTION 'SUPPORT_CONFIG_PATCH_INVALID: separate ratifier reset required';
    END IF;
  END IF;

  FOREACH v_key IN ARRAY v_patch_keys LOOP
    v_value := v_patch_values[pg_catalog.array_position(v_patch_keys, v_key)];
    IF v_current_support IS NULL THEN
      v_changed_keys := pg_catalog.array_append(v_changed_keys, v_key);
    ELSE
      SELECT register.canonical_json_text(row.value_json::text)
      INTO v_active_value
      FROM register.register_row AS row
      WHERE row.register_version = v_current_support
        AND row.row_key = v_key;
      IF v_active_value IS DISTINCT FROM v_value THEN
        v_changed_keys := pg_catalog.array_append(v_changed_keys, v_key);
      END IF;
    END IF;
  END LOOP;
  IF pg_catalog.cardinality(v_changed_keys) = 0 THEN
    RAISE EXCEPTION 'SUPPORT_CONFIG_UNCHANGED';
  END IF;
  SELECT pg_catalog.array_agg(value ORDER BY pg_catalog.convert_to(value, 'UTF8'))
  INTO v_changed_keys
  FROM pg_catalog.unnest(v_changed_keys) AS changed(value);

  v_version := register.allocate_register_version();
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('debateai:register-version:' || v_version::text, 0)
  );
  v_recorded_at := pg_catalog.clock_timestamp();
  PERFORM pg_catalog.set_config(
    'register.publication_context',
    'SUPPORT_ROWS:' || v_version::text,
    true
  );
  INSERT INTO register.register_row (register_version,row_key,value_json,source_ref)
  SELECT v_version,row.row_key,row.value_json,row.source_ref
  FROM register.register_row AS row
  WHERE row.register_version = p_base_register_version
    AND row.row_key <> 'supportActivation'
    AND row.row_key <> ALL(v_patch_keys)
  ORDER BY pg_catalog.convert_to(row.row_key, 'UTF8');
  INSERT INTO register.register_row (register_version,row_key,value_json,source_ref)
  SELECT v_version,
    patch_key,
    v_patch_values[pg_catalog.array_position(v_patch_keys, patch_key)]::jsonb,
    p_source_ref
  FROM pg_catalog.unnest(v_patch_keys) AS patch(patch_key)
  ORDER BY pg_catalog.convert_to(patch_key, 'UTF8');
  PERFORM register._assert_support_catalogue(v_version);
  v_support_hash := register._support_snapshot_sha256(v_version);
  v_marker := pg_catalog.jsonb_build_object(
    'kind', 'SUPPORT_CONFIGURATION_ACTIVATION',
    'schema_version', 1,
    'target_register_version', v_version::text,
    'previous_support_register_version',
      CASE WHEN v_current_support IS NULL THEN NULL ELSE v_current_support::text END,
    'support_snapshot_sha256', v_support_hash,
    'changed_keys', pg_catalog.to_jsonb(v_changed_keys),
    'source_ref', p_source_ref,
    'recorded_at', pg_catalog.to_jsonb(v_recorded_at)
  );
  PERFORM pg_catalog.set_config(
    'register.publication_context',
    'SUPPORT_MARKER:' || v_version::text,
    true
  );
  INSERT INTO register.register_row (register_version,row_key,value_json,source_ref)
  VALUES (v_version,'supportActivation',v_marker,p_source_ref);
  SELECT count(*)::integer INTO v_count
  FROM register.register_row AS row
  WHERE row.register_version = v_version;
  v_snapshot_hash := register._snapshot_sha256(v_version);
  PERFORM pg_catalog.set_config(
    'register.publication_context',
    'SEAL:SUPPORT_CONFIGURATION:' || v_version::text,
    true
  );
  INSERT INTO register.register_version (
    register_version,row_count,sealed,base_register_version,publication_id,
    request_sha256,snapshot_sha256,publication_kind,recorded_at
  ) VALUES (
    v_version,v_count,true,p_base_register_version,p_publication_id,
    v_request_hash,v_snapshot_hash,'SUPPORT_CONFIGURATION',v_recorded_at
  );
  PERFORM pg_catalog.set_config(
    'register.publication_context',
    coalesce(v_previous_context, ''),
    true
  );
  RETURN QUERY SELECT
    v_version::text,p_base_register_version::text,p_publication_id,
    'SUPPORT_CONFIGURATION'::text,v_request_hash,v_snapshot_hash,v_count,
    v_recorded_at,v_current_support::text,v_support_hash,v_changed_keys;
END
$function$;

CREATE OR REPLACE FUNCTION register.read_support_configuration_status()
RETURNS TABLE (
  support_register_version text,
  schema_version integer,
  integrity_valid boolean,
  base_register_version text,
  publication_id uuid,
  request_sha256 text,
  snapshot_sha256 text,
  support_snapshot_sha256 text,
  changed_keys text[],
  source_ref text,
  recorded_at timestamptz,
  configuration jsonb
)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, register
AS $function$
  WITH current_version AS (
    SELECT register._current_support_register_version() AS register_version
  ), selected AS (
    SELECT version.*,marker.value_json AS marker_value,marker.source_ref AS marker_source
    FROM current_version
    JOIN register.register_version AS version USING (register_version)
    JOIN register.register_row AS marker
      ON marker.register_version = version.register_version
     AND marker.row_key = 'supportActivation'
  ), annotated AS (
    SELECT selected.*,
      CASE
        WHEN pg_catalog.jsonb_typeof(selected.marker_value -> 'schema_version') = 'number'
          AND (selected.marker_value ->> 'schema_version')::numeric
            = pg_catalog.trunc((selected.marker_value ->> 'schema_version')::numeric)
          AND (selected.marker_value ->> 'schema_version')::numeric
            BETWEEN 1 AND 2147483647
        THEN (selected.marker_value ->> 'schema_version')::integer
        ELSE NULL
      END AS marker_schema_version
    FROM selected
  )
  SELECT annotated.register_version::text,
    annotated.marker_schema_version,
    (
      annotated.marker_schema_version IS NOT NULL
      AND annotated.row_count = (
        SELECT count(*)::integer
        FROM register.register_row AS counted
        WHERE counted.register_version = annotated.register_version
      )
      AND annotated.snapshot_sha256::text
        = register._snapshot_sha256(annotated.register_version)
      AND pg_catalog.jsonb_typeof(annotated.marker_value) = 'object'
      AND (
        SELECT count(*) FROM pg_catalog.jsonb_object_keys(annotated.marker_value)
      ) = 8
      AND annotated.marker_value ?& ARRAY[
        'kind','schema_version','target_register_version',
        'previous_support_register_version','support_snapshot_sha256',
        'changed_keys','source_ref','recorded_at'
      ]
      AND annotated.marker_value ->> 'kind' = 'SUPPORT_CONFIGURATION_ACTIVATION'
      AND annotated.marker_value ->> 'target_register_version'
        = annotated.register_version::text
      AND annotated.marker_value ->> 'support_snapshot_sha256'
        = register._support_snapshot_sha256(annotated.register_version)
      AND annotated.marker_value ->> 'source_ref' = annotated.marker_source
      AND annotated.marker_value -> 'recorded_at' = pg_catalog.to_jsonb(annotated.recorded_at)
      AND (
        SELECT count(*) FROM register.register_row AS support_row
        WHERE support_row.register_version = annotated.register_version
          AND support_row.row_key = ANY(register._support_keys())
      ) = 16
    ),
    annotated.base_register_version::text,
    annotated.publication_id,
    annotated.request_sha256::text,
    annotated.snapshot_sha256::text,
    annotated.marker_value ->> 'support_snapshot_sha256',
    CASE
      WHEN pg_catalog.jsonb_typeof(annotated.marker_value -> 'changed_keys') = 'array'
      THEN ARRAY(
        SELECT value
        FROM pg_catalog.jsonb_array_elements_text(
          annotated.marker_value -> 'changed_keys'
        ) AS changed(value)
      )
      ELSE NULL::text[]
    END,
    annotated.marker_source,
    annotated.recorded_at,
    (
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'row_key',row.row_key,
          'value_json_text',register.canonical_json_text(row.value_json::text),
          'source_ref',row.source_ref
        ) ORDER BY pg_catalog.convert_to(row.row_key, 'UTF8')
      )
      FROM register.register_row AS row
      WHERE row.register_version = annotated.register_version
        AND row.row_key = ANY(register._support_keys())
    )
  FROM annotated
$function$;

ALTER SEQUENCE register.register_version_id_seq
  OWNER TO debateai_register_publication_owner;

ALTER FUNCTION register._lp(text)
  OWNER TO debateai_register_publication_owner;
ALTER FUNCTION register._canonical_decimal(text)
  OWNER TO debateai_register_publication_owner;
ALTER FUNCTION register._canonical_json_value(text,integer,integer)
  OWNER TO debateai_register_publication_owner;
ALTER FUNCTION register.canonical_json_text(text)
  OWNER TO debateai_register_publication_owner;
ALTER FUNCTION register._snapshot_sha256(bigint)
  OWNER TO debateai_register_publication_owner;
ALTER FUNCTION register._assert_register_base_integrity(bigint)
  OWNER TO debateai_register_publication_owner;
ALTER FUNCTION register._support_keys()
  OWNER TO debateai_register_publication_owner;
ALTER FUNCTION register._support_snapshot_sha256(bigint)
  OWNER TO debateai_register_publication_owner;
ALTER FUNCTION register._validate_source_ref(text)
  OWNER TO debateai_register_publication_owner;
ALTER FUNCTION register._validate_support_value(text,text)
  OWNER TO debateai_register_publication_owner;
ALTER FUNCTION register._assert_support_catalogue(bigint)
  OWNER TO debateai_register_publication_owner;
ALTER FUNCTION register._current_support_register_version()
  OWNER TO debateai_register_publication_owner;
ALTER FUNCTION register._register_row_insert_guard()
  OWNER TO debateai_register_publication_owner;
ALTER FUNCTION register._register_version_seal_guard()
  OWNER TO debateai_register_publication_owner;
ALTER FUNCTION register.allocate_register_version()
  OWNER TO debateai_register_publication_owner;
ALTER FUNCTION register.import_historical_register_version(bigint,jsonb,char)
  OWNER TO debateai_register_publication_owner;
ALTER FUNCTION register.publish_register_version(uuid,char,bigint,jsonb,text)
  OWNER TO debateai_register_publication_owner;
ALTER FUNCTION register.publish_support_configuration(uuid,char,bigint,bigint,integer,jsonb,text)
  OWNER TO debateai_register_publication_owner;
ALTER FUNCTION register.read_support_configuration_status()
  OWNER TO debateai_register_publication_owner;

GRANT USAGE ON SCHEMA register,audit_crypto_internal
  TO debateai_register_publication_owner;
GRANT SELECT,INSERT ON TABLE register.register_row,register.register_version
  TO debateai_register_publication_owner;
GRANT USAGE,SELECT,UPDATE ON SEQUENCE register.register_version_id_seq
  TO debateai_register_publication_owner;

REVOKE INSERT ON TABLE register.register_row,register.register_version FROM PUBLIC;
REVOKE INSERT ON TABLE register.register_row,register.register_version FROM debateai_runtime;
REVOKE INSERT ON TABLE register.register_row,register.register_version FROM debateai_replay;
REVOKE INSERT ON TABLE register.register_row,register.register_version FROM debateai_support_config_operator;
REVOKE ALL ON SEQUENCE register.register_version_id_seq FROM PUBLIC;
REVOKE ALL ON SEQUENCE register.register_version_id_seq FROM debateai_runtime;
REVOKE ALL ON SEQUENCE register.register_version_id_seq FROM debateai_replay;
REVOKE ALL ON SEQUENCE register.register_version_id_seq FROM debateai_support_config_operator;

REVOKE ALL ON FUNCTION register._lp(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION register._canonical_decimal(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION register._canonical_json_value(text,integer,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION register.canonical_json_text(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION register._snapshot_sha256(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION register._assert_register_base_integrity(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION register._support_keys() FROM PUBLIC;
REVOKE ALL ON FUNCTION register._support_snapshot_sha256(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION register._validate_source_ref(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION register._validate_support_value(text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION register._assert_support_catalogue(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION register._current_support_register_version() FROM PUBLIC;
REVOKE ALL ON FUNCTION register._register_row_insert_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION register._register_version_seal_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION register.allocate_register_version() FROM PUBLIC;
REVOKE ALL ON FUNCTION register.import_historical_register_version(bigint,jsonb,char) FROM PUBLIC;
REVOKE ALL ON FUNCTION register.publish_register_version(uuid,char,bigint,jsonb,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION register.publish_support_configuration(uuid,char,bigint,bigint,integer,jsonb,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION register.read_support_configuration_status() FROM PUBLIC;

REVOKE ALL ON FUNCTION register.allocate_register_version()
  FROM debateai_runtime,debateai_replay,debateai_support_config_operator;
REVOKE ALL ON FUNCTION register.import_historical_register_version(bigint,jsonb,char)
  FROM debateai_replay,debateai_support_config_operator;
REVOKE ALL ON FUNCTION register.publish_register_version(uuid,char,bigint,jsonb,text)
  FROM debateai_replay,debateai_support_config_operator;
REVOKE ALL ON FUNCTION register.publish_support_configuration(uuid,char,bigint,bigint,integer,jsonb,text)
  FROM debateai_runtime,debateai_replay;

GRANT USAGE ON SCHEMA register TO debateai_runtime,debateai_support_config_operator;
GRANT EXECUTE ON FUNCTION register.import_historical_register_version(bigint,jsonb,char)
  TO debateai_runtime;
GRANT EXECUTE ON FUNCTION register.publish_register_version(uuid,char,bigint,jsonb,text)
  TO debateai_runtime;
GRANT EXECUTE ON FUNCTION register.publish_support_configuration(uuid,char,bigint,bigint,integer,jsonb,text)
  TO debateai_support_config_operator;
GRANT EXECUTE ON FUNCTION register.read_support_configuration_status()
  TO debateai_runtime,debateai_support_config_operator;
