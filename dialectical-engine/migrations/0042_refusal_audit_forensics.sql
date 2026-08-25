-- T4: a rate-limit refusal row is an operational route-window incident, not
-- an account attribution.  The application supplies no actor/account locator;
-- this capability mints event-local actor and target references in PostgreSQL.

DROP FUNCTION IF EXISTS identity.audit_rate_limit_refused(uuid,jsonb,text);

CREATE OR REPLACE FUNCTION identity.audit_rate_limit_refused(jsonb,text)
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
  v_route text;
  v_count bigint;
  v_ip_count bigint;
  v_address_count bigint;
  v_distinct_source_count bigint;
  v_distinct_source_count_saturated boolean;
BEGIN
  IF jsonb_typeof(v_source_context)<>'object'
    OR v_source_context<>jsonb_strip_nulls(jsonb_build_object(
      'ipArgon2id',v_source_context->>'ipArgon2id',
      'userAgentArgon2id',v_source_context->>'userAgentArgon2id'))
    OR COALESCE(v_source_context->>'ipArgon2id','')
      !~ '^argon2id-audit:v1:[0-9a-f]{64}$'
    OR COALESCE(v_source_context->>'userAgentArgon2id','')
      !~ '^argon2id-audit:v1:[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='AUDIT_EVENT_INVALID';
  END IF;

  v_match := regexp_match(v_justification,
    '^aggregate:route-window;route:(register|verify|resend);window:([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.+-]+Z);count:([0-9]{1,10});ip_count:([0-9]{1,10});address_count:([0-9]{1,10});distinct_source_count:([0-9]{1,4});distinct_source_count_saturated:(true|false)$');
  IF v_match IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='AUDIT_EVENT_SEMANTICS_INVALID';
  END IF;
  v_route := v_match[1];
  v_count := v_match[3]::bigint;
  v_ip_count := v_match[4]::bigint;
  v_address_count := v_match[5]::bigint;
  v_distinct_source_count := v_match[6]::bigint;
  v_distinct_source_count_saturated := v_match[7]::boolean;
  IF v_count<1 OR v_ip_count<0 OR v_address_count<0
    OR v_ip_count+v_address_count<>v_count
    OR v_distinct_source_count<1 OR v_distinct_source_count>4096
    OR v_distinct_source_count>v_count
    OR (v_distinct_source_count_saturated
      AND (v_distinct_source_count<>4096 OR v_count<=4096)) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='AUDIT_EVENT_SEMANTICS_INVALID';
  END IF;

  PERFORM identity.consume_runtime_audit_attempt();
  PERFORM identity.append_audit_event_internal(
    gen_random_uuid(),gen_random_uuid()::text,
    'identity.auth.rate_limit_refused','auth.'||v_route,
    gen_random_uuid()::text,clock_timestamp(),v_source_context,
    'DENY',false,v_justification
  );
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION identity.audit_rate_limit_refused(jsonb,text)
  FROM PUBLIC,debateai_authorization_runtime,debateai_erasure_runtime,
    debateai_replay,debateai_publication_cleanup,debateai_content_provision;
GRANT EXECUTE ON FUNCTION identity.audit_rate_limit_refused(jsonb,text)
  TO debateai_runtime;
