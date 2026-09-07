ALTER TABLE obs.incident
  DROP CONSTRAINT incident_fingerprint_key,
  ADD CONSTRAINT incident_fingerprint_fingerprint_version_key
    UNIQUE (fingerprint, fingerprint_version);

CREATE FUNCTION obs.occurrence_seq_nextval_notify()
RETURNS bigint
LANGUAGE plpgsql
VOLATILE
SET search_path = pg_catalog
AS $function$
DECLARE
  next_seq bigint;
BEGIN
  next_seq := pg_catalog.nextval('obs.occurrence_seq'::pg_catalog.regclass);
  PERFORM pg_catalog.pg_notify('obs_occurrence_inserted', next_seq::text);
  RETURN next_seq;
END;
$function$;

REVOKE ALL ON FUNCTION obs.occurrence_seq_nextval_notify() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION obs.occurrence_seq_nextval_notify() TO debateai_obs_writer;

ALTER TABLE obs.occurrence
  ALTER COLUMN occ_seq SET DEFAULT obs.occurrence_seq_nextval_notify();
