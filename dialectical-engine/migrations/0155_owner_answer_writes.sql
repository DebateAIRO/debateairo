-- 0155 · The owner's two writes on their own answer go through definers (upload check Task 9; owner decision of 3 November 2026).
--
-- Plain words. On the site's real logins two buttons of the answer page answered 500: "investigate this gap" (POST
-- /v1/answers/:id/investigations/:gapRef) and "unlink" (POST /v1/answers/:id/memory-link/unlink). The API's runtime
-- login may not INSERT into core.investigation_request, and may not lock memory.memory_link (a row lock needs UPDATE on
-- the table). This step adds one narrow definer for each write, in the shape of 0040's core.lock_owned_live_runs. Each
-- locks the run only when the caller owns it and its private content is live, checks the owner again in its own
-- statement after the lock (an owner-event insert takes the same run lock), and answers NULL for every refusal, so a
-- foreign answer and an absent one stay the same to the caller. No table right changes for any login.
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: expand
--   expand          additive only: two new functions; the release before calls neither and keeps its own statements.
-- n1: keeps-verifier
--   keeps-verifier  no billing relation or billing function, so lineage/verify-effective-capabilities-130.sql stays in force.

-- What serve's recordInvestigationRequest wrote: the request row, once the run is the caller's, live, the answer that
-- run's newest one and the gap opened on that run. The caller seals user_input under the run's key first; the row's
-- content triggers check it as before. NULL: not the caller's, not live, no such answer or no such gap.
CREATE OR REPLACE FUNCTION core.record_owned_investigation_request(
  p_request_id uuid,p_run_id uuid,p_answer_id uuid,p_gap_ref text,p_owner_ref uuid,p_legacy_asker_id text,
  p_user_input text,p_replay_handle text,p_content_ciphertext jsonb,p_content_attestation bytea
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_version integer;
BEGIN
  IF p_request_id IS NULL OR p_run_id IS NULL OR p_answer_id IS NULL OR p_gap_ref IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='OWNED_INVESTIGATION_REQUEST_INVALID';
  END IF;
  PERFORM 1 FROM core.lock_owned_live_runs(ARRAY[p_run_id],p_owner_ref,p_legacy_asker_id);
  IF NOT FOUND THEN RETURN NULL; END IF;
  -- Its own statement after the lock: the authoritative ownership decision.
  IF core.run_is_owned_by(p_run_id,p_owner_ref,p_legacy_asker_id) IS DISTINCT FROM true THEN RETURN NULL; END IF;
  SELECT answer.answer_version INTO v_version
  FROM serve.answer AS answer
  WHERE answer.answer_id=p_answer_id AND answer.run_id=p_run_id
    AND EXISTS (
      SELECT 1 FROM core.run_progress_event AS event
      WHERE event.run_id=answer.run_id AND event.kind='honesty.investigation_gap_opened'
        AND event.value_json->>'gap_ref'=p_gap_ref
    )
  ORDER BY answer.answer_version DESC LIMIT 1;
  IF v_version IS NULL THEN RETURN NULL; END IF;
  INSERT INTO core.investigation_request (
    investigation_request_id,run_id,answer_id,answer_version,gap_ref,
    user_input,input_kind,status,replay_handle,at_seq,content_ciphertext,content_attestation
  ) VALUES (
    p_request_id,p_run_id,p_answer_id,v_version,p_gap_ref,
    p_user_input,'HUMAN_STEER','RECORDED',p_replay_handle,ledger.allocate_sequence(),p_content_ciphertext,p_content_attestation
  );
  RETURN p_request_id;
END;
$$;

-- What memory's unlinkForAnswer wrote: an UNLINKED event on the run's newest memory link, once the run is the caller's
-- and live and that link is still LINKED (re-read after the link lock, so two unlinks never both win). NULL otherwise.
CREATE OR REPLACE FUNCTION memory.unlink_owned_memory_link(
  p_run_id uuid,p_owner_ref uuid,p_legacy_asker_id text,p_actor_ref text
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_link uuid;
  v_state text;
BEGIN
  IF p_run_id IS NULL OR p_actor_ref IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='OWNED_MEMORY_UNLINK_INVALID';
  END IF;
  PERFORM 1 FROM core.lock_owned_live_runs(ARRAY[p_run_id],p_owner_ref,p_legacy_asker_id);
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF core.run_is_owned_by(p_run_id,p_owner_ref,p_legacy_asker_id) IS DISTINCT FROM true THEN RETURN NULL; END IF;
  SELECT link.memory_link_id INTO v_link
  FROM memory.memory_link AS link
  WHERE link.source_run_id=p_run_id
  ORDER BY link.at_seq DESC LIMIT 1
  FOR UPDATE;
  IF v_link IS NULL THEN RETURN NULL; END IF;
  SELECT event.state INTO v_state
  FROM memory.memory_link_event AS event
  WHERE event.memory_link_id=v_link
  ORDER BY event.at_seq DESC LIMIT 1;
  IF v_state IS DISTINCT FROM 'LINKED' THEN RETURN NULL; END IF;
  INSERT INTO memory.memory_link_event (memory_link_id,state,actor_ref,reason,at_seq)
  VALUES (v_link,'UNLINKED',p_actor_ref,'ASKER_UNLINK_CONTROL',ledger.allocate_sequence());
  RETURN v_link;
END;
$$;

-- n1: reviewed gives only the two new functions their owner, the owner of 0040's core.lock_owned_live_runs; touches no earlier object
DO $owner_answer_writes_owner$
DECLARE v_owner name; v_name text;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO v_owner FROM pg_catalog.pg_proc AS p WHERE p.oid = 'core.lock_owned_live_runs(uuid[],uuid,text)'::regprocedure;
  FOREACH v_name IN ARRAY ARRAY['core.record_owned_investigation_request(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,bytea)','memory.unlink_owned_memory_link(uuid,uuid,text,text)'] LOOP
    EXECUTE pg_catalog.format('ALTER FUNCTION %s OWNER TO %I', v_name, v_owner);
    EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_name);
  END LOOP;
END
$owner_answer_writes_owner$;
GRANT EXECUTE ON FUNCTION core.record_owned_investigation_request(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,bytea) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION memory.unlink_owned_memory_link(uuid,uuid,text,text) TO debateai_runtime;
