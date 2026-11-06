-- 0162 · Carry-on digs without a live sign-in (V4 start step; plan docs/superpowers/plans/2026-11-03-v4-start-step.md Task 56a, spec
-- 2026-11-03 §2 item 8; decision record START-STEP-DECISIONS-2026-11-03 answer 11, owner ruling 3 Nov night).
--
-- Plain words. With "Let the AIs carry on to the report" ticked, the server digs each of the debate's chosen paths and then writes the
-- report, also after the person has signed out or their session has lapsed. A dig is a new debate under its own key, and today a new
-- debate's key can only be made while the person's sign-in is live (0040). This step adds the second way 0123 added for a waiting debate
-- moved to a new release, with tighter limits: the dig's key comes from the debate's own record of whose it is (the same person and the
-- same sign-in, signed out or not); one dig per chosen path, never tried again; Free one dig in all; only while the carry-on has begun
-- and not ended; only while the account is still active and still the debate's owner; never once the person has deleted the debate.
-- Ids and codes only, never content.
--
--   §1 the markers: core.run_key_provision_intent.carry_on_parent_run_id, and identity.run_execution_binding's carry_on_parent_run_id
--      and carry_on_path_id (both or neither, a path id b1..b8), never beside 0123's re-admission marker; one binding per debate and path.
--   §2 core.prepare_carry_on_run_key_provision: 0123's core.prepare_readmitted_run_key_provision step for step, in the same lock order,
--      with the carry-on's checks in place of "the old run still waits".
--   §3 core.lock_carry_on_run_key_provision_for_commit: 0123's readmitted commit lock on the carry-on marker.
--   §4 core.create_encrypted_run: 0123's §2 byte for byte, with one more branch for the carry-on marker.
--   §5 the grants: the prepare to the content-provision role only; the lock to no one.
--   §6 the closing contract block.
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: drained
-- n1: keeps-verifier
--   drained         it redefines 0123's core.create_encrypted_run in place (declared as an amendment of 0123's postcondition) and adds
--                   CHECKs and a UNIQUE index to two existing tables, so it is uploaded drained, as 0123 and 0157 were: no debate waits
--                   or runs while it applies. No expand step could say this. The V4 start step's release is drained already (0157).
--   keeps-verifier  no billing relation or billing function, so lineage/verify-effective-capabilities-130.sql stays in force.
--   row security    no table of its own; the two tables it widens are read by definers only, as before.
--
-- Replay-safe in the repository's form, as 0123: ADD COLUMN IF NOT EXISTS, each CHECK dropped IF EXISTS before it is added, CREATE
-- UNIQUE INDEX IF NOT EXISTS, CREATE OR REPLACE FUNCTION. Nothing historical is rewritten.

-- §1. The markers -------------------------------------------------------------------------------------------------------------
-- The intent's marker is what the commit reads (§4); it is deleted with the intent when the run is written (0040's
-- core.complete_run_key_provision). The binding's two markers outlive it: they are removed only with the account, or by 0040's sweep
-- together with an intent that never became a run. The UNIQUE index keeps one binding per debate and path, whatever becomes of its run: a
-- carry-on dig is never tried again (owner ruling 3 Nov night). The prepare decides the same rule under the account's lock first (§2).
ALTER TABLE core.run_key_provision_intent ADD COLUMN IF NOT EXISTS carry_on_parent_run_id uuid NULL;
COMMENT ON COLUMN core.run_key_provision_intent.carry_on_parent_run_id IS
  'V4 start step (0162): set only by core.prepare_carry_on_run_key_provision, the debate whose carry-on this provision digs; the commit then needs no live session. NULL for every other provision.';
ALTER TABLE core.run_key_provision_intent DROP CONSTRAINT IF EXISTS run_key_provision_intent_one_marker;
ALTER TABLE core.run_key_provision_intent ADD CONSTRAINT run_key_provision_intent_one_marker
  CHECK (readmitted_from_run_id IS NULL OR carry_on_parent_run_id IS NULL);
ALTER TABLE identity.run_execution_binding ADD COLUMN IF NOT EXISTS carry_on_parent_run_id uuid NULL;
ALTER TABLE identity.run_execution_binding ADD COLUMN IF NOT EXISTS carry_on_path_id text NULL;
COMMENT ON COLUMN identity.run_execution_binding.carry_on_parent_run_id IS
  'V4 start step (0162): the debate whose carry-on this run digs, written by core.prepare_carry_on_run_key_provision; NULL for every other run. An id, never content.';
COMMENT ON COLUMN identity.run_execution_binding.carry_on_path_id IS
  'V4 start step (0162): the chosen path (b1..b8) of that debate this run digs; set with carry_on_parent_run_id or not at all. A code, never content.';
ALTER TABLE identity.run_execution_binding DROP CONSTRAINT IF EXISTS run_execution_binding_carry_on_pair;
ALTER TABLE identity.run_execution_binding ADD CONSTRAINT run_execution_binding_carry_on_pair
  CHECK ((carry_on_parent_run_id IS NULL AND carry_on_path_id IS NULL) OR (carry_on_parent_run_id IS NOT NULL AND carry_on_path_id IS NOT NULL AND carry_on_path_id ~ '^b[1-8]$'));
ALTER TABLE identity.run_execution_binding DROP CONSTRAINT IF EXISTS run_execution_binding_one_marker;
ALTER TABLE identity.run_execution_binding ADD CONSTRAINT run_execution_binding_one_marker
  CHECK (readmitted_from_run_id IS NULL OR carry_on_parent_run_id IS NULL);
CREATE UNIQUE INDEX IF NOT EXISTS run_execution_binding_one_carry_on_dig_idx
  ON identity.run_execution_binding (carry_on_parent_run_id, carry_on_path_id) WHERE carry_on_parent_run_id IS NOT NULL;

-- §2. The carry-on dig's key provision -----------------------------------------------------------------------------------------
-- CARRY_ON_DIG_INVALID (55000): an id is NULL, the two run ids are equal, the new run id is taken, the path id is not b1..b8, the debate
-- is not an owner's encrypted run (0123's owner query), it has no chosen path of that id (core.start_path), its carry-on has not
-- begun (no BEGUN mark) or has ended (a DONE mark), or the person deleted it (its content is no longer live,
-- core.run_private_content_is_live, as 0123's core.run_waiting_v refuses it): no dig carries a deleted debate's question on.
-- CARRY_ON_DIG_OWNER_GONE (55000): the debate's binding is gone with its account, or the account is no longer active (suspended, held,
-- age-frozen, erased) or no longer maps to the debate's owner.
-- CARRY_ON_DIG_TAKEN (55000): a binding already names this debate and path (pending or written, whatever became of its run), or the
-- debate is Free (core.run.plan_tier 'free') and any binding names it: Free gets one dig in all. Decided after the account's lock.
-- Locks in today's order: the security subject, then the account (0085's prepare_run_key_provision, 0123's readmitted prepare). The
-- carry-on marks are read after the account's lock, where 0123 reads "the old run still waits". Returns the new run's execution ref and the
-- user the content key is provisioned for (the debate's own: the caller checks it is the principal's, packages/db startRun).
CREATE OR REPLACE FUNCTION core.prepare_carry_on_run_key_provision(p_parent_run_id uuid, p_new_run_id uuid, p_path_id text)
RETURNS TABLE(execution_ref uuid, user_id uuid)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_owner_ref uuid;
  v_user_id uuid;
  v_session_id uuid;
  v_account record;
  v_execution_ref uuid;
  v_attempt integer := 0;
BEGIN
  IF p_parent_run_id IS NULL OR p_new_run_id IS NULL OR p_path_id IS NULL OR p_parent_run_id = p_new_run_id
    OR p_path_id !~ '^b[1-8]$'
    OR EXISTS (SELECT 1 FROM core.run AS taken WHERE taken.run_id = p_new_run_id) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'CARRY_ON_DIG_INVALID';
  END IF;
  SELECT owner.owner_ref INTO v_owner_ref
  FROM core.run AS parent_run
  JOIN LATERAL (
    SELECT event.owner_ref FROM core.run_ownership_event AS event
    WHERE event.run_id = parent_run.run_id ORDER BY event.at_seq DESC LIMIT 1
  ) AS owner ON true
  WHERE parent_run.run_id = p_parent_run_id AND parent_run.content_encryption_version = 1
    AND parent_run.asker_id = 'owner:' || owner.owner_ref::text;
  IF NOT FOUND
    OR NOT EXISTS (SELECT 1 FROM core.start_path AS path WHERE path.run_id = p_parent_run_id AND path.path_id = p_path_id) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'CARRY_ON_DIG_INVALID';
  END IF;
  SELECT binding.user_id, binding.identity_session_id INTO v_user_id, v_session_id
  FROM identity.run_execution_binding AS binding WHERE binding.run_id = p_parent_run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'CARRY_ON_DIG_OWNER_GONE';
  END IF;
  PERFORM identity.lock_security_subjects(ARRAY[v_user_id]);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:account:' || v_user_id::text, 0));
  SELECT * INTO v_account FROM identity.lock_account_t9_internal(v_user_id, true);
  IF v_account.owner_ref IS DISTINCT FROM v_owner_ref THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'CARRY_ON_DIG_OWNER_GONE';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM core.carry_on_mark AS begun WHERE begun.run_id = p_parent_run_id AND begun.mark = 'BEGUN')
    OR EXISTS (SELECT 1 FROM core.carry_on_mark AS ended WHERE ended.run_id = p_parent_run_id AND ended.mark = 'DONE')
    OR NOT core.run_private_content_is_live(p_parent_run_id) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'CARRY_ON_DIG_INVALID';
  END IF;
  IF EXISTS (
    SELECT 1 FROM identity.run_execution_binding AS earlier
    WHERE earlier.carry_on_parent_run_id = p_parent_run_id AND earlier.carry_on_path_id = p_path_id
  ) OR (
    EXISTS (SELECT 1 FROM core.run AS free_run WHERE free_run.run_id = p_parent_run_id AND free_run.plan_tier = 'free')
    AND EXISTS (SELECT 1 FROM identity.run_execution_binding AS earlier WHERE earlier.carry_on_parent_run_id = p_parent_run_id)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'CARRY_ON_DIG_TAKEN';
  END IF;
  LOOP
    v_attempt := v_attempt + 1;
    v_execution_ref := gen_random_uuid();
    CONTINUE WHEN v_execution_ref IN (p_parent_run_id, p_new_run_id, v_user_id, v_owner_ref, v_session_id, v_account.audit_token);
    BEGIN
      INSERT INTO core.publication_ref_tombstone(ref, ref_kind, created_at)
      VALUES (v_execution_ref, 'run_execution_ref', v_now);
      INSERT INTO identity.run_execution_binding(
        execution_ref, user_id, identity_session_id, run_id, created_at, carry_on_parent_run_id, carry_on_path_id
      ) VALUES (v_execution_ref, v_user_id, v_session_id, p_new_run_id, v_now, p_parent_run_id, p_path_id);
      INSERT INTO core.run_key_provision_intent(
        run_id, user_id, owner_ref, identity_session_id, execution_ref, requested_at, expires_at, carry_on_parent_run_id
      ) VALUES (
        p_new_run_id, v_user_id, v_owner_ref, v_session_id, v_execution_ref, v_now, v_now + interval '5 minutes', p_parent_run_id
      );
      RETURN QUERY SELECT v_execution_ref, v_user_id;
      RETURN;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempt >= 8 THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'RUN_EXECUTION_REF_ALLOCATION_FAILED';
      END IF;
    END;
  END LOOP;
END;
$$;

-- §3. The commit lock for a carry-on intent --------------------------------------------------------------------------------------
-- 0123's core.lock_readmitted_run_key_provision_for_commit on the carry-on marker: 0040's lock without the session check, in the same lock
-- order, plus "the debate's carry-on is BEGUN and not DONE, its content is still live (not deleted), and its newest ownership event still
-- names this owner" in place of "the run it re-admits still waits". So a carry-on ended (DONE), or a debate deleted, between the prepare and
-- the commit writes nothing. Called only by §4's
-- core.create_encrypted_run (same owner), so no role is granted it.
CREATE OR REPLACE FUNCTION core.lock_carry_on_run_key_provision_for_commit(
  p_run_id uuid, p_user_id uuid, p_owner_ref uuid, p_execution_ref uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_account record;
  v_parent_run_id uuid;
BEGIN
  IF p_user_id IS NOT NULL THEN
    PERFORM identity.lock_security_subjects(ARRAY[p_user_id]);
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:account:' || p_user_id::text, 0));
  SELECT * INTO v_account FROM identity.lock_account_t9_internal(p_user_id, true);
  IF v_account.owner_ref IS DISTINCT FROM p_owner_ref THEN RETURN false; END IF;
  PERFORM 1 FROM identity.run_execution_binding AS binding
  WHERE binding.execution_ref = p_execution_ref AND binding.run_id = p_run_id AND binding.user_id = p_user_id
  FOR KEY SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT intent.carry_on_parent_run_id INTO v_parent_run_id
  FROM core.run_key_provision_intent AS intent
  WHERE intent.run_id = p_run_id AND intent.user_id = p_user_id AND intent.owner_ref = p_owner_ref
    AND intent.execution_ref = p_execution_ref AND intent.cleanup_state = 'PREPARED'
    AND intent.expires_at > clock_timestamp() AND intent.carry_on_parent_run_id IS NOT NULL
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  RETURN EXISTS (SELECT 1 FROM core.carry_on_mark AS begun WHERE begun.run_id = v_parent_run_id AND begun.mark = 'BEGUN')
    AND NOT EXISTS (SELECT 1 FROM core.carry_on_mark AS ended WHERE ended.run_id = v_parent_run_id AND ended.mark = 'DONE')
    AND core.run_private_content_is_live(v_parent_run_id)
    AND COALESCE((SELECT event.owner_ref FROM core.run_ownership_event AS event
      WHERE event.run_id = v_parent_run_id ORDER BY event.at_seq DESC LIMIT 1) = p_owner_ref, false);
END;
$$;

-- §4. core.create_encrypted_run commits a carry-on intent through §3 -------------------------------------------------------------
-- 0123's §2 byte for byte, with one change: the commit CASE gains one branch between its two, so an intent §2 marked
-- (carry_on_parent_run_id) commits through core.lock_carry_on_run_key_provision_for_commit and ONLY through it. A re-admission intent
-- still takes 0123's lock, and every unmarked intent 0040's (a live session). The two markers never stand on one intent (§1's CHECK), and
-- the CASE evaluates one branch. 0063's rule ("never CREATE OR REPLACE a function another migration defines") is broken here, for this
-- one function, as 0067, 0072 and 0123 broke it before: the encrypted insert path has exactly one writer. This step declares it as an
-- amendment of 0123's postcondition (packages/db/src/migration-forward0162.ts), so every later migrate() compares 0123 against this
-- definition. startRun's capability probe still finds 'planTier' and 'argumentLanguageTag'. CREATE OR REPLACE keeps 0040's owner;
-- SECURITY DEFINER, the pinned search_path and the EXECUTE set (debateai_content_provision only) are written again below, as 0123
-- writes them, and checked by the closing block.
CREATE OR REPLACE FUNCTION core.create_encrypted_run(
  p_run jsonb,p_user_id uuid,p_owner_ref uuid,p_battery_rows jsonb
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_run_id uuid;
  v_execution_ref uuid;
  v_battery_row jsonb;
BEGIN
  IF jsonb_typeof(p_run)<>'object' OR p_run-ARRAY[
    'runId','questionLine','askerId','executionRef','callerScope','asOf',
    'askerRiskTier','riskTier','tierSource','tierProvenanceRef',
    'compositionBudgetTier','planTier','argumentLanguageTag',
    'argumentLanguageName','depthParams','discoveredPanel','strangerSampleRate',
    'envelopeBasis','registerVersion','batteryVersion','askContract',
    'contentCiphertext','contentAttestation','contentAttestationSecret','releaseKey'
  ]::text[]<>'{}'::jsonb
    OR jsonb_typeof(p_battery_rows)<>'array'
    OR jsonb_array_length(p_battery_rows)>100 THEN
    RETURN false;
  END IF;
  v_run_id := (p_run->>'runId')::uuid;
  v_execution_ref := (p_run->>'executionRef')::uuid;
  IF p_run->>'questionLine'<>'⟦DEBATEAI:CIPHERTEXT:V1⟧'
    OR p_run->>'askerId'<>'owner:'||p_owner_ref::text
    OR p_run->'askContract'<>'{"ciphertext":true,"v":1}'::jsonb
    OR NOT (CASE WHEN EXISTS (
        SELECT 1 FROM core.run_key_provision_intent AS marked
        WHERE marked.run_id=v_run_id AND marked.readmitted_from_run_id IS NOT NULL
      ) THEN core.lock_readmitted_run_key_provision_for_commit(
        v_run_id,p_user_id,p_owner_ref,v_execution_ref
      ) WHEN EXISTS (
        SELECT 1 FROM core.run_key_provision_intent AS marked
        WHERE marked.run_id=v_run_id AND marked.carry_on_parent_run_id IS NOT NULL
      ) THEN core.lock_carry_on_run_key_provision_for_commit(
        v_run_id,p_user_id,p_owner_ref,v_execution_ref
      ) ELSE core.lock_run_key_provision_for_commit(
        v_run_id,p_user_id,p_owner_ref,v_execution_ref
      ) END) THEN
    RETURN false;
  END IF;
  IF octet_length(decode(p_run->>'contentAttestationSecret','base64'))<>32
    OR octet_length(decode(p_run->>'contentAttestation','base64'))<>32 THEN
    RETURN false;
  END IF;
  FOR v_battery_row IN SELECT value FROM jsonb_array_elements(p_battery_rows)
  LOOP
    IF jsonb_typeof(v_battery_row)<>'object' OR v_battery_row-ARRAY[
      'batteryRowId','predicateRef','openingState','predicateInputs','skipEvidence'
    ]::text[]<>'{}'::jsonb THEN
      RETURN false;
    END IF;
  END LOOP;
  INSERT INTO core.run_content_attestation_secret(run_id,secret,created_at)
  VALUES (v_run_id,decode(p_run->>'contentAttestationSecret','base64'),clock_timestamp());
  INSERT INTO core.run(
    run_id,question_line,asker_id,session_id,caller_scope,as_of,
    asker_risk_tier,risk_tier,tier_source,tier_provenance_ref,
    composition_budget_tier,plan_tier,argument_language_tag,
    argument_language_name,depth_params,agent_count,
    discovered_panel,stranger_sample_rate,envelope_basis,register_version,battery_version,
    ask_contract,created_at_seq,content_encryption_version,
    question_blind_index_version,question_blind_index,content_ciphertext,content_attestation,
    release_key
  ) VALUES (
    v_run_id,p_run->>'questionLine',p_run->>'askerId',v_execution_ref::text,
    p_run->>'callerScope',(p_run->>'asOf')::timestamptz,
    p_run->>'askerRiskTier',p_run->>'riskTier',p_run->>'tierSource',
    p_run->>'tierProvenanceRef',p_run->>'compositionBudgetTier',p_run->>'planTier',
    COALESCE(p_run->>'argumentLanguageTag','und'),
    COALESCE(p_run->>'argumentLanguageName','the same language as the question'),
    p_run->'depthParams',jsonb_array_length(p_run->'discoveredPanel'),
    p_run->'discoveredPanel',(p_run->>'strangerSampleRate')::double precision,
    p_run->'envelopeBasis',(p_run->>'registerVersion')::bigint,
    p_run->>'batteryVersion',p_run->'askContract',ledger.allocate_sequence(),
    1,2,NULL,p_run->'contentCiphertext',decode(p_run->>'contentAttestation','base64'),
    COALESCE(p_run->>'releaseKey','legacy')
  );
  PERFORM core.append_run_ownership_event(v_run_id,p_owner_ref);
  INSERT INTO core.question_liveness_event(run_id,kind,occurred_at,at_seq)
  VALUES (v_run_id,'QUERY',clock_timestamp(),ledger.allocate_sequence());
  INSERT INTO core.run_progress_event(run_id,at_seq,kind,value_json) VALUES
    (v_run_id,ledger.allocate_sequence(),'PHASE',to_jsonb('EMPIRICAL'::text)),
    (v_run_id,ledger.allocate_sequence(),'ENVELOPE_STATE',to_jsonb('WITHIN'::text)),
    (v_run_id,ledger.allocate_sequence(),'ENVELOPE_CONSUMED',to_jsonb(0));
  FOR v_battery_row IN SELECT value FROM jsonb_array_elements(p_battery_rows)
  LOOP
    INSERT INTO core.run_row_activation(run_id,battery_row_id,predicate_ref)
    VALUES (v_run_id,v_battery_row->>'batteryRowId',v_battery_row->>'predicateRef');
    INSERT INTO core.run_row_activation_event(
      run_id,battery_row_id,at_seq,state,predicate_inputs,skip_evidence
    ) VALUES (
      v_run_id,v_battery_row->>'batteryRowId',ledger.allocate_sequence(),
      v_battery_row->>'openingState',v_battery_row->'predicateInputs',
      CASE WHEN jsonb_typeof(v_battery_row->'skipEvidence')='null'
        THEN NULL ELSE v_battery_row->'skipEvidence' END
    );
  END LOOP;
  IF NOT core.complete_run_key_provision(
    v_run_id,p_user_id,p_owner_ref,v_execution_ref
  ) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='RUN_KEY_PROVISION_INTENT_INCOMPLETE';
  END IF;
  RETURN true;
EXCEPTION WHEN invalid_text_representation OR check_violation OR not_null_violation THEN
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION core.create_encrypted_run(jsonb,uuid,uuid,jsonb)
  FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,
    debateai_replay,debateai_publication_cleanup,debateai_content_provision;
GRANT EXECUTE ON FUNCTION core.create_encrypted_run(jsonb,uuid,uuid,jsonb) TO debateai_content_provision;

-- §5. The grants ------------------------------------------------------------------------------------------------------------------
-- The prepare: the content-provision role only, after 0123's REVOKE list (the API checks at boot that this login may run exactly the
-- provision functions it names, packages/db CONTENT_PROVISION_SIGNATURES, and that no other role may). The lock: no one.
REVOKE ALL ON FUNCTION core.prepare_carry_on_run_key_provision(uuid,uuid,text)
  FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,
    debateai_replay,debateai_publication_cleanup,debateai_content_provision;
GRANT EXECUTE ON FUNCTION core.prepare_carry_on_run_key_provision(uuid,uuid,text) TO debateai_content_provision;
REVOKE ALL ON FUNCTION core.lock_carry_on_run_key_provision_for_commit(uuid,uuid,uuid,uuid)
  FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,
    debateai_replay,debateai_publication_cleanup,debateai_content_provision;

-- §6. THE CONTRACT THIS FILE CLAIMS, checked rather than assumed ------------------------------------------------------------------
DO $carry_on_digs_contract$
DECLARE
  v_name text;
  v_role text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['core.prepare_carry_on_run_key_provision(uuid,uuid,text)',
    'core.lock_carry_on_run_key_provision_for_commit(uuid,uuid,uuid,uuid)', 'core.create_encrypted_run(jsonb,uuid,uuid,jsonb)'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p WHERE p.oid = pg_catalog.to_regprocedure(v_name)
        AND p.prosecdef AND p.proconfig = '{search_path=pg_catalog}'::text[]) THEN
      RAISE EXCEPTION 'CARRY_ON_0162_CONTRACT %', v_name;
    END IF;
    FOREACH v_role IN ARRAY ARRAY['public', 'debateai_runtime', 'debateai_authorization_runtime', 'debateai_erasure_runtime',
      'debateai_replay', 'debateai_publication_cleanup', 'debateai_billing_runtime', 'debateai_data_export_worker'] LOOP
      IF pg_catalog.has_function_privilege(v_role, v_name, 'EXECUTE') THEN
        RAISE EXCEPTION 'CARRY_ON_0162_CONTRACT % %', v_name, v_role;
      END IF;
    END LOOP;
  END LOOP;
  IF NOT pg_catalog.has_function_privilege('debateai_content_provision', 'core.prepare_carry_on_run_key_provision(uuid,uuid,text)', 'EXECUTE')
    OR NOT pg_catalog.has_function_privilege('debateai_content_provision', 'core.create_encrypted_run(jsonb,uuid,uuid,jsonb)', 'EXECUTE')
    OR pg_catalog.has_function_privilege('debateai_content_provision', 'core.lock_carry_on_run_key_provision_for_commit(uuid,uuid,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'CARRY_ON_0162_CONTRACT content provision';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_constraint AS k
      WHERE k.convalidated AND k.contype = 'c' AND (
        (k.conrelid = 'core.run_key_provision_intent'::regclass AND k.conname = 'run_key_provision_intent_one_marker')
        OR (k.conrelid = 'identity.run_execution_binding'::regclass AND k.conname = 'run_execution_binding_carry_on_pair')
        OR (k.conrelid = 'identity.run_execution_binding'::regclass AND k.conname = 'run_execution_binding_one_marker'))) <> 3
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_index AS i
      WHERE i.indexrelid = pg_catalog.to_regclass('identity.run_execution_binding_one_carry_on_dig_idx') AND i.indisunique AND i.indisvalid
        AND i.indrelid = 'identity.run_execution_binding'::regclass) THEN
    RAISE EXCEPTION 'CARRY_ON_0162_CONTRACT markers';
  END IF;
END
$carry_on_digs_contract$;
