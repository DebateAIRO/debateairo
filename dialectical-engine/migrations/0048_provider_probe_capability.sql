CREATE OR REPLACE FUNCTION core.record_provider_probe(
  p_probe_id uuid,
  p_provider_ref text,
  p_maker text,
  p_state text,
  p_model_id text,
  p_failure_code text,
  p_probed_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core
AS $$
BEGIN
  IF p_probe_id IS NULL
    OR p_provider_ref IS NULL OR btrim(p_provider_ref)=''
    OR p_maker IS NULL OR btrim(p_maker)=''
    OR p_state NOT IN ('HEALTHY','ABSENT')
    OR p_probed_at IS NULL OR NOT isfinite(p_probed_at)
    OR (p_state='HEALTHY' AND (p_model_id IS NULL OR btrim(p_model_id)='' OR p_failure_code IS NOT NULL))
    OR (p_state='ABSENT' AND (p_model_id IS NOT NULL OR p_failure_code IS NULL OR btrim(p_failure_code)='')) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PROVIDER_PROBE_INVALID';
  END IF;
  INSERT INTO core.provider_probe (
    probe_id,provider_ref,maker,state,model_id,failure_code,probed_at
  ) VALUES (
    p_probe_id,p_provider_ref,p_maker,p_state,p_model_id,p_failure_code,p_probed_at
  );
END;
$$;

REVOKE ALL ON FUNCTION core.record_provider_probe(uuid,text,text,text,text,text,timestamptz)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.record_provider_probe(uuid,text,text,text,text,text,timestamptz)
  TO debateai_runtime;

REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON core.provider_probe FROM PUBLIC;
