-- 0123 · Side-by-side releases (spec docs/superpowers/specs/2026-10-21-side-by-side-uploads-design.md §1, §4, §5,
-- §9; plan docs/superpowers/plans/2026-10-21-side-by-side-A-database.md, tasks A1-A5; INTERFACE "Database").
--
-- The transition release T's one migration: everything the database needs so a later upload can run next to the
-- release before it. Built section by section, each section numbered and each object it adds checked by the closing
-- contract block (and digested by the loader, packages/db/src/migration-forward0123.ts):
--   §1  core.run.release_key, the stamp of the release that runs each debate (A1);
--   §2  core.create_encrypted_run redefined in place so the encrypted insert path writes that stamp (A1).
--
-- n1 (spec §5, the database rule):
-- n1: drained
-- n1: keeps-verifier
--   drained         T is uploaded the old way, with no debate waiting or running (spec "The transition"), so this file
--                   may add a NOT NULL column with a default and redefine functions earlier files define; every later
--                   upload's step must instead be `expand` (additive only, safe while the old release runs).
--   keeps-verifier  0123 adds no billing relation and no billing function, so the effective-capability verifier in
--                   force (0111's, migrations/lineage/README.md step 3) stays in force and the manifest names it.
--
-- Replay-safe in the repository's form (tools/orphan-audit auditMigrationReplaySafety): ADD COLUMN IF NOT EXISTS, each
-- CHECK dropped IF EXISTS before it is added, CREATE OR REPLACE FUNCTION. Nothing historical is rewritten.

-- §1. core.run.release_key ------------------------------------------------------
-- Written once with the row, in the same INSERT as register_version (packages/db/src/index.ts startRun), because core.run
-- is never updated (0000's reject_mutation). Old rows, and a run written without a key, read 'legacy'. No runner serves
-- 'legacy' (packages/kernel/src/release-key.ts), so a forgotten admission path fails loudly instead of running a debate
-- on the wrong release (ruling O1). The CHECK repeats the kernel's form: r<site settings version>-<12 lowercase hex>.
-- Adding a NOT NULL column with a constant default rewrites no row; the CHECK reads the table once (T is drained).
ALTER TABLE core.run
  ADD COLUMN IF NOT EXISTS release_key text NOT NULL DEFAULT 'legacy',
  DROP CONSTRAINT IF EXISTS run_release_key_shape,
  ADD CONSTRAINT run_release_key_shape CHECK (release_key = 'legacy' OR release_key ~ '^r[1-9][0-9]*-[0-9a-f]{12}$');

COMMENT ON COLUMN core.run.release_key IS
  'The release that runs this debate (side-by-side spec §1): r<site settings version>-<12 hex of the source revision>, or legacy for a run written before 0123 or without a key. Written once at insert; only that release may touch the run. A code, never content: retained after private-run erasure like register_version.';

-- §2. core.create_encrypted_run writes the stamp --------------------------------
-- 0072's body byte for byte, with two changes: 'releaseKey' joins the closed key list, and the INSERT writes
-- release_key = COALESCE(p_run->>'releaseKey','legacy'). A malformed key fails §1's CHECK inside the function, whose
-- handler answers false like any other refused document (check_violation), so nothing of the run is written.
-- startRun's capability probe still finds 'planTier' and 'argumentLanguageTag' in this definition, and it never strips
-- 'releaseKey': a database without this step refuses a stamped document instead of silently dropping the stamp.
--
-- 0063's rule ("never CREATE OR REPLACE a function another migration defines") is broken here, for this one function,
-- as 0067 and 0072 broke it before: the encrypted insert path has exactly one writer, and a second function would leave
-- the old one able to write an unstamped run. A replay of 0072 cannot undo it: the native migrate() never runs an
-- applied file twice, and the loader digests this definition on every later migrate() (0120's precedent).
-- CREATE OR REPLACE keeps 0040's owner; SECURITY DEFINER, the pinned search_path and the EXECUTE set (0040:6141-6143,
-- 6363-6369: debateai_content_provision only) are written again below and checked by the closing block.
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
    OR NOT core.lock_run_key_provision_for_commit(
      v_run_id,p_user_id,p_owner_ref,v_execution_ref
    ) THEN
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

-- THE CONTRACT THIS FILE CLAIMS, checked rather than assumed (0122's closing shape). Each section adds its own checks.
DO $side_by_side_releases_contract$
DECLARE
  v_function regprocedure := to_regprocedure('core.create_encrypted_run(jsonb,uuid,uuid,jsonb)');
BEGIN
  -- §1: the stamp column, its default, and its validated shape CHECK.
  IF NOT EXISTS (
      SELECT 1 FROM pg_attribute AS a JOIN pg_attrdef AS d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE a.attrelid = 'core.run'::regclass AND a.attname = 'release_key' AND NOT a.attisdropped AND a.attnotnull
        AND format_type(a.atttypid, a.atttypmod) = 'text' AND pg_get_expr(d.adbin, d.adrelid) = '''legacy''::text')
    OR NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'core.run'::regclass AND conname = 'run_release_key_shape' AND contype = 'c' AND convalidated
        AND strpos(pg_get_constraintdef(oid), '^r[1-9][0-9]*-[0-9a-f]{12}$') > 0) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'SIDE_BY_SIDE_RELEASE_STAMP_CONTRACT_INCOMPLETE';
  END IF;
  -- §2: the one encrypted writer admits and writes the stamp, as a definer with the pinned path, callable by the content
  -- provisioning role alone.
  IF v_function IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM pg_proc AS p
      WHERE p.oid = v_function AND p.prosecdef AND p.proconfig = ARRAY['search_path=pg_catalog']
        AND strpos(pg_get_functiondef(p.oid), '''releaseKey''') > 0
        AND strpos(pg_get_functiondef(p.oid), 'COALESCE(p_run->>''releaseKey'',''legacy'')') > 0)
    OR has_function_privilege('public', v_function, 'EXECUTE')
    OR has_function_privilege('debateai_runtime', v_function, 'EXECUTE')
    OR NOT has_function_privilege('debateai_content_provision', v_function, 'EXECUTE') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'SIDE_BY_SIDE_RELEASE_STAMP_CONTRACT_INCOMPLETE';
  END IF;
END
$side_by_side_releases_contract$;
