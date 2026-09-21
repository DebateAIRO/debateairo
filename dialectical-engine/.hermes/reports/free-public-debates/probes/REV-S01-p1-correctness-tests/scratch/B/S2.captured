ALTER TABLE core.run
  ADD COLUMN IF NOT EXISTS free_public_rule boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION core.run_is_free_public_bound(p_run_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT COALESCE(
    run.plan_tier='free' AND run.free_public_rule=true,
    false
  )
  FROM core.run AS run
  WHERE run.run_id=p_run_id;
$$;

REVOKE ALL ON FUNCTION core.run_is_free_public_bound(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.run_is_free_public_bound(uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION core.run_is_free_public_bound(uuid) TO debateai_erasure_runtime;

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
    'compositionBudgetTier','planTier','freePublicRule','depthParams','discoveredPanel',
    'strangerSampleRate','envelopeBasis','registerVersion','batteryVersion','askContract',
    'contentCiphertext','contentAttestation','contentAttestationSecret'
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
    composition_budget_tier,plan_tier,free_public_rule,depth_params,agent_count,
    discovered_panel,stranger_sample_rate,envelope_basis,register_version,battery_version,
    ask_contract,created_at_seq,content_encryption_version,
    question_blind_index_version,question_blind_index,content_ciphertext,content_attestation
  ) VALUES (
    v_run_id,p_run->>'questionLine',p_run->>'askerId',v_execution_ref::text,
    p_run->>'callerScope',(p_run->>'asOf')::timestamptz,
    p_run->>'askerRiskTier',p_run->>'riskTier',p_run->>'tierSource',
    p_run->>'tierProvenanceRef',p_run->>'compositionBudgetTier',p_run->>'planTier',
    COALESCE((p_run->>'freePublicRule')::boolean,false),
    p_run->'depthParams',jsonb_array_length(p_run->'discoveredPanel'),
    p_run->'discoveredPanel',(p_run->>'strangerSampleRate')::double precision,
    p_run->'envelopeBasis',(p_run->>'registerVersion')::bigint,
    p_run->>'batteryVersion',p_run->'askContract',ledger.allocate_sequence(),
    1,2,NULL,p_run->'contentCiphertext',decode(p_run->>'contentAttestation','base64')
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
