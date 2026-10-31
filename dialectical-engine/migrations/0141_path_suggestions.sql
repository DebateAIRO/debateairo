-- 0141 · Path suggestions (test-site release R22; plan docs/superpowers/plans/2026-10-31-r22-owner-changes.md decision 9).
--
-- What this step adds, reached through definers only, as 0131 to 0140:
--   §1 identity.path_suggestions: the AI's suggestions of what to dig into on one path of a debate's map, one row each time they
--      are worked out, append-only, the newest of a path winning. run_id: the run whose key seals the content and who paid: the
--      debate itself for a first debate's suggestions; the dig that rewrote the path for a refresh. debate_run_id: the debate
--      whose map holds the path. set_id: the caller's, worked out by code, so a second copy of the runner writes ALREADY.
--   §2 identity.record_path_suggestions, the runner's writer; identity.read_path_suggestions_of_run, the newest set per path, on the
--      same role as 0134's identity.read_path_rewrites_of_run, so whatever reads a debate's rewrites reads these on the same pool.
-- No question, answer or suggestion text is stored in clear: ids, codes and times.
--
-- Deleting: every row names the sealing run's owner_ref ON DELETE CASCADE. identity.forget_erased_debate_path_suggestions(uuid)
-- handles one erased debate for the erasure role: an erased debate takes every row on its paths and every row it sealed; an
-- erased dig takes what it sealed, so the path falls back to the set before it.
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: expand
--   expand          additive only: one new table and five new functions; the release before reads and writes none of them.
--                   No earlier function, table or trigger changes: 0132's identity.enforce_web_evidence_content is called, not
--                   redefined.
--   row security    outside 0130's scope rule, as 0131 to 0140: no request role can SELECT this table.
-- n1: keeps-verifier
--   keeps-verifier  no billing relation or billing function, so lineage/verify-effective-capabilities-130.sql stays in force.
--
-- Replay-safe in the repository's form, as 0132.

-- 1. The suggestions --------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS identity.path_suggestions (
  set_id uuid PRIMARY KEY,
  run_id uuid NOT NULL,
  debate_run_id uuid NOT NULL,
  position_ref text NOT NULL CONSTRAINT path_suggestions_position_check CHECK (position_ref ~ '^[\x21\x23-\x5b\x5d-\x7e]{1,150}$'),
  owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  content_ciphertext jsonb NOT NULL CONSTRAINT path_suggestions_content_size CHECK (octet_length(content_ciphertext::text) <= 65536),
  content_attestation bytea NOT NULL
);
CREATE INDEX IF NOT EXISTS path_suggestions_path ON identity.path_suggestions (debate_run_id, position_ref, recorded_at);
CREATE INDEX IF NOT EXISTS path_suggestions_run ON identity.path_suggestions (run_id);
CREATE INDEX IF NOT EXISTS path_suggestions_owner ON identity.path_suggestions (owner_ref);
SELECT core.install_truncate_guard('identity.path_suggestions');

-- 2. The guards -------------------------------------------------------------------------------------------------------------
-- Content: 0132's check (called, not redefined), bound to the row's set_id, under the row's run_id.
DROP TRIGGER IF EXISTS aaa_enforce_web_evidence_content ON identity.path_suggestions;
CREATE TRIGGER aaa_enforce_web_evidence_content BEFORE INSERT ON identity.path_suggestions
FOR EACH ROW EXECUTE FUNCTION identity.enforce_web_evidence_content('set_id');

-- Append-only: no UPDATE; no DELETE but of a deleted account's rows (the cascade) or within the forget definer
-- (debateai.path_suggestions_forget).
CREATE OR REPLACE FUNCTION identity.guard_path_suggestions_record() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='PATH_SUGGESTIONS_APPEND_ONLY';
  END IF;
  IF pg_catalog.current_setting('debateai.path_suggestions_forget', true) = 'on'
    OR NOT EXISTS (SELECT 1 FROM identity."user" AS identity_user WHERE identity_user.owner_ref = OLD.owner_ref) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='PATH_SUGGESTIONS_APPEND_ONLY';
END;
$$;

DROP TRIGGER IF EXISTS guard_path_suggestions_record ON identity.path_suggestions;
CREATE TRIGGER guard_path_suggestions_record BEFORE UPDATE OR DELETE ON identity.path_suggestions
FOR EACH ROW EXECUTE FUNCTION identity.guard_path_suggestions_record();

-- 3. The runner's side (debateai_runtime) -------------------------------------------------------------------------------------
-- The locks are 0134's: one per run, lower first, as 0138's writers, so a deletion of either debate waits for this write and
-- then deletes it, or this write waits and finds the debate erased. RECORDED, ALREADY (this set again; the first write stays),
-- NOT_LIVE (the sealing run or the debate is not a live private debate). Refusal 22023 PATH_SUGGESTIONS_INVALID before any read;
-- an envelope bound elsewhere is refused by 0132's check.
CREATE OR REPLACE FUNCTION identity.record_path_suggestions(p_set_id uuid, p_run_id uuid, p_debate_run_id uuid, p_position_ref text,
  p_content jsonb, p_attestation bytea) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF p_set_id IS NULL OR p_run_id IS NULL OR p_debate_run_id IS NULL
    OR p_position_ref IS NULL OR p_position_ref !~ '^[\x21\x23-\x5b\x5d-\x7e]{1,150}$'
    OR p_content IS NULL OR p_attestation IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PATH_SUGGESTIONS_INVALID';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:dig-model:' || LEAST(p_run_id, p_debate_run_id)::text, 0));
  IF p_run_id <> p_debate_run_id THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:dig-model:' || GREATEST(p_run_id, p_debate_run_id)::text, 0));
  END IF;
  v_owner := identity.web_evidence_run_owner(p_run_id);
  IF v_owner IS NULL OR identity.web_evidence_run_owner(p_debate_run_id) IS NULL THEN RETURN 'NOT_LIVE'; END IF;
  IF EXISTS (SELECT 1 FROM identity.path_suggestions AS suggestions WHERE suggestions.set_id = p_set_id) THEN RETURN 'ALREADY'; END IF;
  INSERT INTO identity.path_suggestions (set_id, run_id, debate_run_id, position_ref, owner_ref, content_ciphertext, content_attestation)
  VALUES (p_set_id, p_run_id, p_debate_run_id, p_position_ref, v_owner, p_content, p_attestation);
  RETURN 'RECORDED';
END;
$$;

-- A live debate's newest set per path, ordered by path: [{set_id, run_id, position_ref, recorded_at, content}]; [] when none, null
-- when it is not live. The caller opens each envelope under its run_id, which may be a dig's, not this debate's.
CREATE OR REPLACE FUNCTION identity.read_path_suggestions_of_run(p_debate_run_id uuid) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF identity.web_evidence_run_owner(p_debate_run_id) IS NULL THEN RETURN NULL; END IF;
  RETURN (SELECT COALESCE(jsonb_agg(jsonb_build_object('set_id', newest.set_id, 'run_id', newest.run_id, 'position_ref', newest.position_ref,
      'recorded_at', newest.recorded_at, 'content', newest.content_ciphertext) ORDER BY newest.position_ref), '[]'::jsonb)
    FROM (SELECT DISTINCT ON (suggestions.position_ref) suggestions.set_id, suggestions.run_id, suggestions.position_ref,
        suggestions.recorded_at, suggestions.content_ciphertext
      FROM identity.path_suggestions AS suggestions WHERE suggestions.debate_run_id = p_debate_run_id
      ORDER BY suggestions.position_ref, suggestions.recorded_at DESC, suggestions.set_id DESC) AS newest);
END;
$$;

-- 4. Deleting (debateai_erasure_runtime) -----------------------------------------------------------------------------------------
-- One erased debate (the tombstone is there): every set it sealed and every set on its paths.
CREATE OR REPLACE FUNCTION identity.forget_erased_debate_path_suggestions(p_run_id uuid) RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_rows integer := 0;
BEGIN
  IF p_run_id IS NULL OR NOT EXISTS (SELECT 1 FROM serve.private_run_erasure_tombstone AS tombstone
      WHERE tombstone.run_id = p_run_id) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='PATH_SUGGESTIONS_DEBATE_NOT_ERASED';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:dig-model:' || p_run_id::text, 0));
  PERFORM pg_catalog.set_config('debateai.path_suggestions_forget', 'on', true);
  DELETE FROM identity.path_suggestions AS suggestions WHERE suggestions.run_id = p_run_id OR suggestions.debate_run_id = p_run_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  PERFORM pg_catalog.set_config('debateai.path_suggestions_forget', 'off', true);
  RETURN v_rows;
END;
$$;

-- 5. The export reader -----------------------------------------------------------------------------------------------------------
-- The leased export's account: {"path_suggestions": [{set_id, run_id, debate_run_id, position_ref, recorded_at, content}]} every set
-- its runs sealed. Envelopes included: the export worker opens each under its run's key.
CREATE OR REPLACE FUNCTION identity.read_data_export_path_suggestions(p_export_id uuid, p_worker uuid) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_user uuid;
  v_owner_ref uuid;
BEGIN
  v_user := identity.data_export_lease_user(p_export_id, p_worker);
  SELECT identity_user.owner_ref INTO v_owner_ref FROM identity."user" AS identity_user WHERE identity_user.user_id = v_user;
  RETURN jsonb_build_object(
    'path_suggestions', COALESCE((SELECT jsonb_agg(jsonb_build_object('set_id', suggestions.set_id, 'run_id', suggestions.run_id,
        'debate_run_id', suggestions.debate_run_id, 'position_ref', suggestions.position_ref, 'recorded_at', suggestions.recorded_at,
        'content', suggestions.content_ciphertext) ORDER BY suggestions.recorded_at, suggestions.set_id)
      FROM identity.path_suggestions AS suggestions WHERE suggestions.owner_ref = v_owner_ref), '[]'::jsonb));
END;
$$;

-- 6. One owner, then the grants ---------------------------------------------------------------------------------------------------
-- n1: reviewed gives only the new table and functions 0115's export owner, as 0135 does; touches no earlier object
DO $path_suggestions_owner$
DECLARE
  v_owner name;
  v_name text;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO v_owner FROM pg_catalog.pg_proc AS p
  WHERE p.oid = 'identity.read_data_export_snapshot(uuid,uuid)'::regprocedure;
  EXECUTE pg_catalog.format('ALTER TABLE identity.path_suggestions OWNER TO %I', v_owner);
  FOREACH v_name IN ARRAY ARRAY[
    'identity.guard_path_suggestions_record()',
    'identity.record_path_suggestions(uuid,uuid,uuid,text,jsonb,bytea)',
    'identity.read_path_suggestions_of_run(uuid)',
    'identity.forget_erased_debate_path_suggestions(uuid)',
    'identity.read_data_export_path_suggestions(uuid,uuid)'
  ] LOOP
    EXECUTE pg_catalog.format('ALTER FUNCTION %s OWNER TO %I', v_name, v_owner);
  END LOOP;
END
$path_suggestions_owner$;

REVOKE ALL ON identity.path_suggestions FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.guard_path_suggestions_record() FROM PUBLIC;
REVOKE ALL ON FUNCTION identity.record_path_suggestions(uuid,uuid,uuid,text,jsonb,bytea) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_path_suggestions_of_run(uuid) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.forget_erased_debate_path_suggestions(uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_data_export_path_suggestions(uuid,uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay;
GRANT EXECUTE ON FUNCTION identity.record_path_suggestions(uuid,uuid,uuid,text,jsonb,bytea) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_path_suggestions_of_run(uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.forget_erased_debate_path_suggestions(uuid) TO debateai_erasure_runtime;
GRANT EXECUTE ON FUNCTION identity.read_data_export_path_suggestions(uuid,uuid) TO debateai_data_export_worker;

-- 7. THE CONTRACT THIS FILE CLAIMS, checked rather than assumed ---------------------------------------------------------------------
DO $path_suggestions_contract$
DECLARE
  v_role text;
BEGIN
  IF pg_catalog.to_regclass('identity.path_suggestions') IS NULL
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = pg_catalog.to_regclass('identity.path_suggestions')
      AND t.tgname = 'reject_truncate' AND NOT t.tgisinternal)
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = pg_catalog.to_regclass('identity.path_suggestions')
      AND t.tgname = 'guard_path_suggestions_record' AND NOT t.tgisinternal AND t.tgenabled = 'O')
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = pg_catalog.to_regclass('identity.path_suggestions')
      AND t.tgname = 'aaa_enforce_web_evidence_content' AND NOT t.tgisinternal AND t.tgenabled = 'O') THEN
    RAISE EXCEPTION 'PATH_SUGGESTIONS_0141_CONTRACT table';
  END IF;
  FOREACH v_role IN ARRAY ARRAY['debateai_runtime', 'debateai_billing_runtime', 'debateai_authorization_runtime',
    'debateai_erasure_runtime', 'debateai_replay', 'debateai_data_export_worker'] LOOP
    IF pg_catalog.has_table_privilege(v_role, 'identity.path_suggestions', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
      RAISE EXCEPTION 'PATH_SUGGESTIONS_0141_CONTRACT table privilege %', v_role;
    END IF;
  END LOOP;
END
$path_suggestions_contract$;
