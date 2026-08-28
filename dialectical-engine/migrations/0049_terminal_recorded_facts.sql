CREATE OR REPLACE FUNCTION core.read_terminal_recorded_facts(p_run_id uuid)
RETURNS TABLE (
  register_version bigint,
  judgement_scheduled text,
  propagation text,
  judge_calls text,
  composer_calls text,
  conformance_calls text,
  r9_calls text,
  serve_actions text,
  missing_stamps text,
  nodes text,
  active_nodes text,
  child_nodes text,
  restatements text,
  reduced text,
  propagation_runs text,
  strengths text,
  decision_records text,
  split_spawns text,
  query_sets text,
  sources text,
  evidence_items text,
  admitted_sources text,
  absences text,
  probes text,
  instruments text,
  critique_packets text,
  objections text,
  independence_receipts text,
  symmetry_diffs text,
  answer_outcomes text,
  scorecard_cells text,
  answers text,
  liveness_value jsonb,
  liveness_source_ref text,
  register_sealed boolean,
  operator_variants_value jsonb,
  settled_work_item_row_ids text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, core, ledger, evidence, scorecard, serve, register
AS $function$
  SELECT
    run.register_version,
    (SELECT count(*)::text FROM ledger.ledger_entry AS entry WHERE entry.run_id=p_run_id AND entry.action_kind='JUDGEMENT_SCHEDULED'),
    (SELECT count(*)::text FROM ledger.ledger_entry AS entry WHERE entry.run_id=p_run_id AND entry.action_kind='PROPAGATION'),
    (SELECT count(*)::text FROM ledger.ledger_entry AS entry WHERE entry.run_id=p_run_id AND entry.action_kind='MODEL_CALL' AND entry.call_site_key='JUDGE' AND entry.outcome='OK'),
    (SELECT count(*)::text FROM ledger.ledger_entry AS entry WHERE entry.run_id=p_run_id AND entry.action_kind='MODEL_CALL' AND entry.call_site_key LIKE 'COMPOSER:%' AND entry.outcome='OK'),
    (SELECT count(*)::text FROM ledger.ledger_entry AS entry WHERE entry.run_id=p_run_id AND entry.action_kind='MODEL_CALL' AND entry.call_site_key LIKE 'CONFORMANCE:%' AND entry.outcome='OK'),
    (SELECT count(*)::text FROM ledger.ledger_entry AS entry WHERE entry.run_id=p_run_id AND entry.action_kind='MODEL_CALL' AND entry.call_site_key LIKE 'POST_COMPOSE_R9:%' AND entry.outcome='OK'),
    (SELECT count(*)::text FROM ledger.ledger_entry AS entry WHERE entry.run_id=p_run_id AND entry.action_kind='SERVE'),
    (SELECT count(*)::text FROM ledger.ledger_entry AS entry WHERE entry.run_id=p_run_id AND (entry.subject_item_id IS NULL OR entry.stance_at_action IS NULL)),
    (SELECT count(*)::text FROM core.node AS node WHERE node.run_id=p_run_id),
    (SELECT count(*)::text FROM core.node AS node WHERE node.run_id=p_run_id AND node.path_status='active'),
    (SELECT count(*)::text FROM core.node AS node WHERE node.run_id=p_run_id AND node.parent_node_id IS NOT NULL),
    (SELECT count(*)::text FROM core.stranger_restatement AS row WHERE row.run_id=p_run_id),
    (SELECT count(*)::text FROM ledger.reduced_judgement AS row WHERE row.run_id=p_run_id),
    (SELECT count(*)::text FROM ledger.propagation_run AS row WHERE row.run_id=p_run_id),
    (SELECT count(*)::text FROM ledger.node_strength_record AS strength JOIN ledger.propagation_run AS propagation_run USING (propagation_run_id) WHERE propagation_run.run_id=p_run_id),
    (SELECT count(*)::text FROM ledger.decision_record AS row WHERE row.run_id=p_run_id),
    (SELECT count(*)::text FROM ledger.decision_record AS row WHERE row.run_id=p_run_id AND row.classification='categorical' AND row.spawn_count>0),
    (SELECT count(*)::text FROM evidence.query_set AS row WHERE row.run_id=p_run_id),
    (SELECT count(*)::text FROM evidence.source_record AS row WHERE row.run_id=p_run_id),
    (SELECT count(*)::text FROM evidence.evidence_item AS row WHERE row.run_id=p_run_id),
    (SELECT count(DISTINCT row.source_ref)::text FROM evidence.evidence_item AS row WHERE row.run_id=p_run_id AND row.admissibility IN ('ADMITTED','ADMITTED_DOWNGRADED')),
    (SELECT count(*)::text FROM evidence.absence_row AS row WHERE row.run_id=p_run_id),
    (SELECT count(*)::text FROM evidence.probe_capture AS row WHERE row.run_id=p_run_id),
    (SELECT count(*)::text FROM evidence.instrument_certification AS row WHERE row.run_id=p_run_id),
    (SELECT count(*)::text FROM core.critique_packet AS row WHERE row.run_id=p_run_id),
    (SELECT count(*)::text FROM core.objection_record AS row WHERE row.run_id=p_run_id),
    (SELECT count(*)::text FROM core.independence_receipt AS row WHERE row.run_id=p_run_id),
    (SELECT count(*)::text FROM core.symmetry_diff AS row WHERE row.run_id=p_run_id),
    (SELECT count(*)::text FROM scorecard.answer_outcome AS row WHERE row.run_id=p_run_id),
    (SELECT count(*)::text
       FROM scorecard.scorecard_cell AS cell
      WHERE EXISTS (
        SELECT 1
          FROM scorecard.answer_outcome AS outcome
         WHERE outcome.run_id=p_run_id
           AND cell.derivation_input ? (
             outcome.answer_outcome_id::text || '@' || outcome.at_seq::text
           )
      )),
    (SELECT count(*)::text FROM serve.answer AS row WHERE row.run_id=p_run_id),
    liveness.value_json,
    liveness.source_ref,
    register_version.sealed,
    variants.value_json,
    COALESCE((SELECT array_agg(DISTINCT item.battery_row_id ORDER BY item.battery_row_id) FROM core.work_item AS item WHERE item.run_id=p_run_id AND item.state='DONE'), ARRAY[]::text[])
  FROM core.run AS run
  LEFT JOIN register.register_version AS register_version ON register_version.register_version=run.register_version
  LEFT JOIN register.register_row AS liveness ON liveness.register_version=run.register_version AND liveness.row_key='livenessPolicy'
  LEFT JOIN register.register_row AS variants ON variants.register_version=run.register_version AND variants.row_key='approvedOperatorVariants'
  WHERE run.run_id=p_run_id
$function$;

REVOKE ALL ON FUNCTION core.read_terminal_recorded_facts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.read_terminal_recorded_facts(uuid) TO debateai_runtime;
