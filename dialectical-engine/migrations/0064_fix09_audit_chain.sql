DO $block$
BEGIN
  IF EXISTS (SELECT 1 FROM obs.occurrence WHERE prev_link IS NOT NULL) OR
     EXISTS (SELECT 1 FROM obs.agent_action WHERE prev_link IS NOT NULL) THEN
    RAISE EXCEPTION 'FIX09_LEGACY_PREV_LINK' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT action_ref FROM obs.agent_action
    GROUP BY action_ref HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'FIX09_DUPLICATE_ACTION_REF' USING ERRCODE = 'P0001';
  END IF;
END;
$block$;

CREATE SEQUENCE obs.agent_action_seq AS bigint START WITH 1 INCREMENT BY 1;
REVOKE ALL ON SEQUENCE obs.agent_action_seq FROM PUBLIC;

ALTER TABLE obs.occurrence
  ADD COLUMN chain_version smallint,
  ADD COLUMN chain_key_id text,
  ADD COLUMN chain_seq bigint,
  ADD COLUMN chain_signature bytea,
  ADD COLUMN chain_link bytea,
  ADD CONSTRAINT occurrence_chain_tuple_check CHECK (
    (chain_version IS NULL AND chain_key_id IS NULL AND chain_seq IS NULL
      AND prev_link IS NULL AND chain_signature IS NULL AND chain_link IS NULL)
    OR
    (chain_version = 1 AND chain_key_id ~ '^[0-9a-f]{64}$' AND chain_seq > 0
      AND octet_length(prev_link) = 32 AND octet_length(chain_signature) = 64
      AND octet_length(chain_link) = 32)
  );

ALTER TABLE obs.agent_action
  ADD COLUMN action_seq bigint NOT NULL DEFAULT nextval('obs.agent_action_seq'::regclass),
  ADD COLUMN source text NOT NULL DEFAULT 'legacy',
  ADD COLUMN chain_version smallint,
  ADD COLUMN chain_key_id text,
  ADD COLUMN chain_seq bigint,
  ADD COLUMN chain_signature bytea,
  ADD COLUMN chain_link bytea,
  ADD CONSTRAINT agent_action_action_seq_check CHECK (action_seq > 0),
  ADD CONSTRAINT agent_action_source_check CHECK (
    source IN ('legacy','first_party','hatchet','ui_client','ops')
  ),
  ADD CONSTRAINT agent_action_chain_tuple_check CHECK (
    (chain_version IS NULL AND chain_key_id IS NULL AND chain_seq IS NULL
      AND prev_link IS NULL AND chain_signature IS NULL AND chain_link IS NULL)
    OR
    (chain_version = 1 AND chain_key_id ~ '^[0-9a-f]{64}$' AND chain_seq > 0
      AND octet_length(prev_link) = 32 AND octet_length(chain_signature) = 64
      AND octet_length(chain_link) = 32)
  ),
  ADD CONSTRAINT agent_action_action_seq_key UNIQUE (action_seq);

CREATE UNIQUE INDEX occurrence_chain_partition_seq_key
  ON obs.occurrence (source,writer_identity,chain_seq)
  WHERE chain_version IS NOT NULL;
CREATE UNIQUE INDEX agent_action_chain_partition_seq_key
  ON obs.agent_action (source,writer_identity,chain_seq)
  WHERE chain_version IS NOT NULL;
CREATE UNIQUE INDEX agent_action_action_ref_key ON obs.agent_action (action_ref);

CREATE TABLE obs.audit_chain_activation (
  singleton boolean PRIMARY KEY CHECK (singleton),
  protocol text NOT NULL CHECK (protocol = 'obs-audit-chain/v1'),
  activation_id uuid NOT NULL UNIQUE,
  activated_at timestamptz NOT NULL CHECK (
    activated_at = date_trunc('milliseconds',activated_at)
  ),
  occurrence_legacy_max_seq bigint NOT NULL CHECK (occurrence_legacy_max_seq >= 0),
  occurrence_legacy_count bigint NOT NULL CHECK (occurrence_legacy_count >= 0),
  occurrence_legacy_digest bytea NOT NULL CHECK (octet_length(occurrence_legacy_digest) = 32),
  agent_action_legacy_max_seq bigint NOT NULL CHECK (agent_action_legacy_max_seq >= 0),
  agent_action_legacy_count bigint NOT NULL CHECK (agent_action_legacy_count >= 0),
  agent_action_legacy_digest bytea NOT NULL CHECK (octet_length(agent_action_legacy_digest) = 32),
  initial_public_keyring_sha256 bytea NOT NULL CHECK (octet_length(initial_public_keyring_sha256) = 32),
  activation_manifest_sha256 bytea NOT NULL CHECK (octet_length(activation_manifest_sha256) = 32),
  created_by_custodian_id text NOT NULL CHECK (created_by_custodian_id = 'V')
);

CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE
  ON obs.audit_chain_activation FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();
CREATE TRIGGER reject_truncate BEFORE TRUNCATE
  ON obs.audit_chain_activation FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();

CREATE FUNCTION obs.audit_chain_enforce_mode()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
DECLARE activated boolean;
DECLARE complete_tuple boolean;
DECLARE empty_tuple boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM obs.audit_chain_activation WHERE singleton)
    INTO activated;
  complete_tuple := NEW.chain_version = 1
    AND NEW.chain_key_id IS NOT NULL
    AND NEW.chain_seq IS NOT NULL
    AND NEW.prev_link IS NOT NULL
    AND NEW.chain_signature IS NOT NULL
    AND NEW.chain_link IS NOT NULL;
  empty_tuple := NEW.chain_version IS NULL
    AND NEW.chain_key_id IS NULL
    AND NEW.chain_seq IS NULL
    AND NEW.prev_link IS NULL
    AND NEW.chain_signature IS NULL
    AND NEW.chain_link IS NULL;
  IF (NOT activated AND NOT empty_tuple)
    OR (activated AND (NOT complete_tuple OR NEW.source = 'legacy')) THEN
    RAISE EXCEPTION 'FIX09_CHAIN_MODE' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER enforce_audit_chain_mode BEFORE INSERT ON obs.occurrence
  FOR EACH ROW EXECUTE FUNCTION obs.audit_chain_enforce_mode();
CREATE TRIGGER enforce_audit_chain_mode BEFORE INSERT ON obs.agent_action
  FOR EACH ROW EXECUTE FUNCTION obs.audit_chain_enforce_mode();

DO $block$
BEGIN
  BEGIN
    CREATE ROLE debateai_obs_chain_probe_owner
      NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  EXCEPTION WHEN duplicate_object OR unique_violation THEN
    NULL;
  END;
  ALTER ROLE debateai_obs_chain_probe_owner
    NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
END;
$block$;

GRANT USAGE ON SCHEMA obs TO debateai_obs_chain_probe_owner;
GRANT SELECT ON obs.occurrence,obs.occurrence_detail,obs.agent_action
  TO debateai_obs_chain_probe_owner;

CREATE FUNCTION obs.audit_chain_epoch_microseconds(value timestamptz)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE STRICT PARALLEL SAFE SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
DECLARE result text;
BEGIN
  IF NOT pg_catalog.isfinite(value) THEN
    RAISE EXCEPTION 'FIX09_TIMESTAMP_NONFINITE' USING ERRCODE = '22023';
  END IF;
  result := ((extract(epoch FROM value) * 1000000)::numeric(30,0))::text;
  IF result !~ '^(0|-?[1-9][0-9]*)$'
    OR extract(epoch FROM value) <> result::numeric / 1000000::numeric THEN
    RAISE EXCEPTION 'FIX09_TIMESTAMP_PRECISION' USING ERRCODE = '22023';
  END IF;
  RETURN result;
END;
$function$;

CREATE FUNCTION obs.audit_chain_tag_jsonb_v1(value jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE STRICT PARALLEL SAFE SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
DECLARE kind text;
DECLARE result jsonb;
DECLARE numeric_text text;
BEGIN
  kind := pg_catalog.jsonb_typeof(value);
  IF kind = 'null' THEN RETURN pg_catalog.jsonb_build_array('n'); END IF;
  IF kind = 'boolean' THEN
    RETURN pg_catalog.jsonb_build_array('b',(value #>> '{}')::boolean);
  END IF;
  IF kind = 'string' THEN
    RETURN pg_catalog.jsonb_build_array('s',value #>> '{}');
  END IF;
  IF kind = 'number' THEN
    numeric_text := value #>> '{}';
    IF numeric_text !~ '^(0|-?[1-9][0-9]*)$'
      OR numeric_text::numeric < -9007199254740991
      OR numeric_text::numeric > 9007199254740991 THEN
      RAISE EXCEPTION 'FIX09_PROBE_INPUT' USING ERRCODE = '22023';
    END IF;
    RETURN pg_catalog.jsonb_build_array('i',numeric_text);
  END IF;
  IF kind = 'array' THEN
    SELECT pg_catalog.jsonb_build_array('a') ||
      COALESCE(pg_catalog.jsonb_agg(obs.audit_chain_tag_jsonb_v1(element.value)
        ORDER BY element.ordinality),'[]'::jsonb)
      INTO result
      FROM pg_catalog.jsonb_array_elements(value) WITH ORDINALITY AS element(value,ordinality);
    RETURN result;
  END IF;
  IF kind = 'object' THEN
    SELECT pg_catalog.jsonb_build_array(
      'o',COALESCE(pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_array(member.key,obs.audit_chain_tag_jsonb_v1(member.value))
        ORDER BY pg_catalog.convert_to(member.key,'UTF8')),'[]'::jsonb)
    ) INTO result FROM pg_catalog.jsonb_each(value) AS member(key,value);
    RETURN result;
  END IF;
  RAISE EXCEPTION 'FIX09_PROBE_INPUT' USING ERRCODE = '22023';
END;
$function$;

CREATE FUNCTION obs.audit_chain_probe_occurrence(
  p_source text,
  p_source_event_ref text,
  p_expected_occurrence jsonb,
  p_expected_detail jsonb
)
RETURNS TABLE (
  probe_status text,
  occurrence_id uuid,
  occ_seq bigint,
  stored_capture_status text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE row_count bigint;
DECLARE detail_count bigint;
DECLARE stored obs.occurrence%ROWTYPE;
DECLARE stored_tuple jsonb;
DECLARE stored_detail jsonb;
DECLARE detail_present boolean;
DECLARE occurrence_exact_length bigint;
DECLARE detail_exact_length bigint;
BEGIN
  IF p_source IS NULL OR p_source_event_ref IS NULL
    OR p_expected_occurrence IS NULL OR p_expected_detail IS NULL
    OR pg_catalog.jsonb_typeof(p_expected_occurrence) <> 'array'
    OR pg_catalog.jsonb_array_length(p_expected_occurrence) <> 3
    OR p_expected_occurrence #>> '{0}' <> 'obs-occurrence-idempotency/v2'
    OR pg_catalog.jsonb_typeof(p_expected_occurrence #> '{1}') <> 'array'
    OR pg_catalog.jsonb_array_length(p_expected_occurrence #> '{1}') <> 34
    OR p_expected_occurrence #>> '{2,0}' <> 'detail_present'
    OR pg_catalog.jsonb_typeof(p_expected_occurrence #> '{2,1}') <> 'boolean' THEN
    RAISE EXCEPTION 'FIX09_PROBE_INPUT' USING ERRCODE = '22023';
  END IF;
  detail_present := (p_expected_occurrence #>> '{2,1}')::boolean;
  IF (NOT detail_present AND p_expected_detail <> 'null'::jsonb)
    OR (detail_present AND (
      pg_catalog.jsonb_typeof(p_expected_detail) <> 'array'
      OR pg_catalog.jsonb_array_length(p_expected_detail) <> 4
      OR p_expected_detail #>> '{0}' <> 'obs-occurrence-detail-idempotency/v1'
    )) THEN
    RAISE EXCEPTION 'FIX09_PROBE_INPUT' USING ERRCODE = '22023';
  END IF;
  WITH RECURSIVE nodes(root,node) AS (
    VALUES ('occurrence'::text,p_expected_occurrence),('detail'::text,p_expected_detail)
    UNION ALL
    SELECT nodes.root,child.value FROM nodes
    CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
      CASE WHEN pg_catalog.jsonb_typeof(nodes.node)='array' THEN nodes.node ELSE '[]'::jsonb END
    ) AS child(value)
  ), separator_counts AS (
    SELECT root,COALESCE(sum(GREATEST(pg_catalog.jsonb_array_length(node)-1,0))
      FILTER (WHERE pg_catalog.jsonb_typeof(node)='array'),0) AS separator_count
    FROM nodes GROUP BY root
  ) SELECT
      pg_catalog.octet_length(pg_catalog.convert_to(p_expected_occurrence::text,'UTF8'))
        - max(separator_count) FILTER (WHERE root='occurrence'),
      pg_catalog.octet_length(pg_catalog.convert_to(p_expected_detail::text,'UTF8'))
        - max(separator_count) FILTER (WHERE root='detail')
    INTO occurrence_exact_length,detail_exact_length FROM separator_counts;
  IF occurrence_exact_length > 1048576 OR detail_exact_length > 1048576 THEN
    RAISE EXCEPTION 'FIX09_PROBE_INPUT' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO row_count FROM obs.occurrence
    WHERE source=p_source AND source_event_ref=p_source_event_ref;
  IF row_count = 0 THEN RETURN; END IF;
  IF row_count <> 1 THEN
    RAISE EXCEPTION 'FIX09_PROBE_CARDINALITY' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO stored FROM obs.occurrence
    WHERE source=p_source AND source_event_ref=p_source_event_ref;
  SELECT count(*) INTO detail_count FROM obs.occurrence_detail
    WHERE obs.occurrence_detail.occurrence_id=stored.occurrence_id;
  IF detail_count > 1 THEN
    RAISE EXCEPTION 'FIX09_PROBE_CARDINALITY' USING ERRCODE = 'P0001';
  END IF;
  IF detail_count = 1 THEN
    SELECT pg_catalog.jsonb_build_array(
      'obs-occurrence-detail-idempotency/v1',
      obs.audit_chain_tag_jsonb_v1(normalized_frames),
      obs.audit_chain_tag_jsonb_v1(cause_chain_codes),
      obs.audit_chain_tag_jsonb_v1(template_parameters)
    ) INTO stored_detail FROM obs.occurrence_detail
      WHERE obs.occurrence_detail.occurrence_id=stored.occurrence_id;
  ELSE stored_detail := 'null'::jsonb;
  END IF;
  stored_tuple := pg_catalog.jsonb_build_array(
    'obs-occurrence-idempotency/v2',
    pg_catalog.jsonb_build_array(
      pg_catalog.to_char(stored.occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      stored.environment,stored.build_ref,stored.build_dirty,stored.runtime,
      obs.audit_chain_tag_jsonb_v1(stored.component),stored.capture_point,stored.code,
      stored.taxonomy_class,stored.severity,stored.condition_mark,stored.disposition,
      stored.fingerprint,stored.fingerprint_version::text,stored.redaction_policy_version,
      stored.allowlist_set_id,stored.fallback_minimized,
      CASE WHEN stored.capture_status IN ('PERSISTED','SPOOLED') THEN 'ORIGINAL'
        ELSE 'GAP_RECONSTRUCTED' END,
      stored.run_ref,stored.work_item_ref,stored.node_ref,stored.attempt_ref,stored.ledger_ref,
      stored.parent_occurrence_ref,stored.cause_relation,stored.at_seq_watermark,
      obs.audit_chain_tag_jsonb_v1(stored.frames),stored.safe_template_id,
      obs.audit_chain_tag_jsonb_v1(stored.template_parameters),stored.source,
      stored.source_event_ref,stored.zone_context,
      CASE WHEN stored.attempt_index IS NULL THEN NULL ELSE stored.attempt_index::text END,
      stored.writer_identity
    ),pg_catalog.jsonb_build_array('detail_present',detail_count=1)
  );
  IF stored_tuple = p_expected_occurrence AND stored_detail = p_expected_detail THEN
    RETURN QUERY SELECT 'MATCH'::text,stored.occurrence_id,stored.occ_seq,stored.capture_status;
  ELSE
    RETURN QUERY SELECT 'CONFLICT'::text,NULL::uuid,NULL::bigint,NULL::text;
  END IF;
END;
$function$;

CREATE FUNCTION obs.audit_chain_occurrence_head(p_source text,p_writer_identity text)
RETURNS TABLE (chain_seq bigint,chain_link bytea,chain_key_id text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT occurrence.chain_seq,occurrence.chain_link,occurrence.chain_key_id
  FROM obs.occurrence AS occurrence
  WHERE occurrence.source=p_source AND occurrence.writer_identity=p_writer_identity
    AND occurrence.chain_version IS NOT NULL
  ORDER BY occurrence.chain_seq DESC LIMIT 1
$function$;

CREATE FUNCTION obs.audit_chain_probe_action(p_action_ref text,p_expected_action jsonb)
RETURNS TABLE (probe_status text,agent_action_id uuid,action_seq bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE stored obs.agent_action%ROWTYPE;
DECLARE row_count bigint;
DECLARE stored_tuple jsonb;
DECLARE exact_length bigint;
BEGIN
  IF p_action_ref IS NULL OR p_expected_action IS NULL
    OR pg_catalog.jsonb_typeof(p_expected_action) <> 'array'
    OR pg_catalog.jsonb_array_length(p_expected_action) <> 8
    OR p_expected_action #>> '{0}' <> 'obs-agent-action-idempotency/v1' THEN
    RAISE EXCEPTION 'FIX09_PROBE_INPUT' USING ERRCODE = '22023';
  END IF;
  WITH RECURSIVE nodes(node) AS (
    VALUES (p_expected_action)
    UNION ALL
    SELECT child.value FROM nodes
    CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
      CASE WHEN pg_catalog.jsonb_typeof(nodes.node)='array' THEN nodes.node ELSE '[]'::jsonb END
    ) AS child(value)
  ) SELECT pg_catalog.octet_length(pg_catalog.convert_to(p_expected_action::text,'UTF8'))
      - COALESCE(sum(GREATEST(pg_catalog.jsonb_array_length(node)-1,0))
          FILTER (WHERE pg_catalog.jsonb_typeof(node)='array'),0)
    INTO exact_length FROM nodes;
  IF exact_length > 1048576 THEN
    RAISE EXCEPTION 'FIX09_PROBE_INPUT' USING ERRCODE = '22023';
  END IF;
  SELECT count(*) INTO row_count FROM obs.agent_action WHERE action_ref=p_action_ref;
  IF row_count = 0 THEN RETURN; END IF;
  IF row_count <> 1 THEN
    RAISE EXCEPTION 'FIX09_PROBE_CARDINALITY' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO stored FROM obs.agent_action WHERE action_ref=p_action_ref;
  stored_tuple := pg_catalog.jsonb_build_array(
    'obs-agent-action-idempotency/v1',stored.source,stored.writer_identity,stored.actor,
    stored.action_kind,stored.occurrence_id,stored.incident_id,
    obs.audit_chain_tag_jsonb_v1(stored.action_payload)
  );
  IF stored_tuple = p_expected_action THEN
    RETURN QUERY SELECT 'MATCH'::text,stored.agent_action_id,stored.action_seq;
  ELSE
    RETURN QUERY SELECT 'CONFLICT'::text,NULL::uuid,NULL::bigint;
  END IF;
END;
$function$;

CREATE FUNCTION obs.audit_chain_action_head(p_source text,p_writer_identity text)
RETURNS TABLE (chain_seq bigint,chain_link bytea,chain_key_id text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT action.chain_seq,action.chain_link,action.chain_key_id
  FROM obs.agent_action AS action
  WHERE action.source=p_source AND action.writer_identity=p_writer_identity
    AND action.chain_version IS NOT NULL
  ORDER BY action.chain_seq DESC LIMIT 1
$function$;

ALTER FUNCTION obs.audit_chain_epoch_microseconds(timestamptz)
  OWNER TO debateai_obs_chain_probe_owner;
ALTER FUNCTION obs.audit_chain_tag_jsonb_v1(jsonb)
  OWNER TO debateai_obs_chain_probe_owner;
ALTER FUNCTION obs.audit_chain_probe_occurrence(text,text,jsonb,jsonb)
  OWNER TO debateai_obs_chain_probe_owner;
ALTER FUNCTION obs.audit_chain_occurrence_head(text,text)
  OWNER TO debateai_obs_chain_probe_owner;
ALTER FUNCTION obs.audit_chain_probe_action(text,jsonb)
  OWNER TO debateai_obs_chain_probe_owner;
ALTER FUNCTION obs.audit_chain_action_head(text,text)
  OWNER TO debateai_obs_chain_probe_owner;

REVOKE ALL ON FUNCTION obs.audit_chain_epoch_microseconds(timestamptz)
  FROM PUBLIC,debateai_obs_writer,debateai_obs_listener,debateai_obs_watchdog,debateai_obs_human;
REVOKE ALL ON FUNCTION obs.audit_chain_enforce_mode()
  FROM PUBLIC,debateai_obs_writer,debateai_obs_listener,debateai_obs_watchdog,debateai_obs_human;
REVOKE ALL ON FUNCTION obs.audit_chain_tag_jsonb_v1(jsonb)
  FROM PUBLIC,debateai_obs_writer,debateai_obs_listener,debateai_obs_watchdog,debateai_obs_human;
REVOKE ALL ON FUNCTION obs.audit_chain_probe_occurrence(text,text,jsonb,jsonb)
  FROM PUBLIC,debateai_obs_writer,debateai_obs_listener,debateai_obs_watchdog,debateai_obs_human;
REVOKE ALL ON FUNCTION obs.audit_chain_occurrence_head(text,text)
  FROM PUBLIC,debateai_obs_writer,debateai_obs_listener,debateai_obs_watchdog,debateai_obs_human;
REVOKE ALL ON FUNCTION obs.audit_chain_probe_action(text,jsonb)
  FROM PUBLIC,debateai_obs_writer,debateai_obs_listener,debateai_obs_watchdog,debateai_obs_human;
REVOKE ALL ON FUNCTION obs.audit_chain_action_head(text,text)
  FROM PUBLIC,debateai_obs_writer,debateai_obs_listener,debateai_obs_watchdog,debateai_obs_human;

GRANT EXECUTE ON FUNCTION obs.audit_chain_probe_occurrence(text,text,jsonb,jsonb),
  obs.audit_chain_occurrence_head(text,text) TO debateai_obs_writer;
GRANT EXECUTE ON FUNCTION obs.audit_chain_probe_action(text,jsonb),
  obs.audit_chain_action_head(text,text) TO debateai_obs_listener;
GRANT EXECUTE ON FUNCTION obs.audit_chain_epoch_microseconds(timestamptz)
  TO debateai_obs_watchdog;

REVOKE SELECT ON obs.occurrence FROM debateai_obs_writer;
GRANT SELECT (
  occurrence_id,occ_seq,prev_link,source,source_event_ref,writer_identity,
  chain_seq,chain_link,chain_key_id
) ON obs.occurrence TO debateai_obs_writer;
GRANT SELECT ON obs.audit_chain_activation
  TO debateai_obs_writer,debateai_obs_listener,debateai_obs_watchdog,debateai_obs_human;
GRANT USAGE ON SEQUENCE obs.agent_action_seq TO debateai_obs_listener;
REVOKE INSERT ON obs.agent_action FROM debateai_obs_watchdog;
REVOKE ALL ON TABLE obs.audit_chain_activation FROM PUBLIC;
