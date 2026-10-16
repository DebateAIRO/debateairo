-- 0120 · Reply measures (length guidance and repair first, spec docs/superpowers/specs/2026-10-15-length-guidance-design.md
-- §3.6, rulings L27 and L34; INTERFACE §4). The build's one migration. Two parts: the terminal recorded facts reader
-- redefined so a structure-repaired call counts (at the end, pre-flight PF-A44), and six nullable columns on
-- ledger.raw_artifact (one row per model-call attempt), written once with the row at insert and never updated:
--   reply_repairs        the repair codes the accepted reply needed, in order (code tokens, never content);
--   reply_failure_class  for a refused reply: STRUCTURE, CONTENT, CUT_OFF or EMPTY;
--   reply_form           what the attempt sent: ORIGINAL, PATCH, FULL, STRUCTURE or LENGTH_RETRY;
--   cached_input_tokens  the vendor's cached input count (written from LG-B);
--   guided_words         the words the AI was guided to (written from LG-C);
--   actual_words         the words it wrote (written from LG-B).
-- Columns, not metadata_json keys: an encrypted run's metadata admits six keys only (0069) and any other key refuses the
-- reply. Every value is a code or a count, so they are safe beside an encrypted run's ciphertext; an unrepaired reply's
-- sample is that row's own raw_text (encrypted where the run is).
-- Replay-safe in the repository's form (tools/orphan-audit auditMigrationReplaySafety): ADD COLUMN IF NOT EXISTS, and
-- each CHECK dropped IF EXISTS before it is added (0090's form for thinking_tokens). One ALTER TABLE, so the table is
-- scanned once. No trigger and no row change: the runtime's table-level INSERT covers new columns, as it covered 0090's
-- thinking_tokens.
ALTER TABLE ledger.raw_artifact
  ADD COLUMN IF NOT EXISTS reply_repairs text[] NULL,
  ADD COLUMN IF NOT EXISTS reply_failure_class text NULL,
  ADD COLUMN IF NOT EXISTS reply_form text NULL,
  ADD COLUMN IF NOT EXISTS cached_input_tokens integer NULL,
  ADD COLUMN IF NOT EXISTS guided_words integer NULL,
  ADD COLUMN IF NOT EXISTS actual_words integer NULL,
  DROP CONSTRAINT IF EXISTS raw_artifact_reply_repairs_code_shaped,
  ADD CONSTRAINT raw_artifact_reply_repairs_code_shaped CHECK (
    reply_repairs IS NULL OR (
      array_ndims(reply_repairs) = 1
      AND cardinality(reply_repairs) BETWEEN 1 AND 16
      AND array_position(reply_repairs, NULL) IS NULL
      AND array_to_string(reply_repairs, ',') ~ '^[A-Z][A-Z0-9_]{0,47}(,[A-Z][A-Z0-9_]{0,47})*$'
    )
  ),
  DROP CONSTRAINT IF EXISTS raw_artifact_reply_failure_class_known,
  ADD CONSTRAINT raw_artifact_reply_failure_class_known CHECK (
    reply_failure_class IS NULL OR reply_failure_class IN ('STRUCTURE', 'CONTENT', 'CUT_OFF', 'EMPTY')
  ),
  DROP CONSTRAINT IF EXISTS raw_artifact_reply_form_known,
  ADD CONSTRAINT raw_artifact_reply_form_known CHECK (
    reply_form IS NULL OR reply_form IN ('ORIGINAL', 'PATCH', 'FULL', 'STRUCTURE', 'LENGTH_RETRY')
  ),
  DROP CONSTRAINT IF EXISTS raw_artifact_cached_input_tokens_non_negative,
  ADD CONSTRAINT raw_artifact_cached_input_tokens_non_negative CHECK (cached_input_tokens IS NULL OR cached_input_tokens >= 0),
  DROP CONSTRAINT IF EXISTS raw_artifact_guided_words_non_negative,
  ADD CONSTRAINT raw_artifact_guided_words_non_negative CHECK (guided_words IS NULL OR guided_words >= 0),
  DROP CONSTRAINT IF EXISTS raw_artifact_actual_words_non_negative,
  ADD CONSTRAINT raw_artifact_actual_words_non_negative CHECK (actual_words IS NULL OR actual_words >= 0);

-- The terminal recorded facts (pre-flight PF-A44, ruling R8). The structure-repair call (LG-A) records the reply it
-- accepts under its own call-site key, REPAIR:STRUCTURE:<original key>, while the original key's attempt stays refused.
-- 0049's reader counted OK rows by the original key only, so an answer writer whose only accepted reply came through
-- the repair would read composer_calls 0. This redefines core.read_terminal_recorded_facts(uuid), whose only earlier
-- definition is 0049's, byte for byte as 0049 wrote it (signature, return table, LANGUAGE sql, STABLE, SECURITY
-- DEFINER, the same search_path) except that each of the four counted families (judge, composer, conformance, the
-- post-compose check) also counts an OK row under its repair key. Replacing it in place keeps its owner (0049 names
-- none: it stays the migrating role's, as on every database since 0049) and its privileges; 0049's two privilege
-- statements follow it again, unchanged. The function's text is pinned against 0049's in
-- tests/architecture/reply-measures-0120-contract.test.ts.
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
    (SELECT count(*)::text FROM ledger.ledger_entry AS entry WHERE entry.run_id=p_run_id AND entry.action_kind='MODEL_CALL' AND entry.call_site_key IN ('JUDGE','REPAIR:STRUCTURE:JUDGE') AND entry.outcome='OK'),
    (SELECT count(*)::text FROM ledger.ledger_entry AS entry WHERE entry.run_id=p_run_id AND entry.action_kind='MODEL_CALL' AND (entry.call_site_key LIKE 'COMPOSER:%' OR entry.call_site_key LIKE 'REPAIR:STRUCTURE:COMPOSER:%') AND entry.outcome='OK'),
    (SELECT count(*)::text FROM ledger.ledger_entry AS entry WHERE entry.run_id=p_run_id AND entry.action_kind='MODEL_CALL' AND (entry.call_site_key LIKE 'CONFORMANCE:%' OR entry.call_site_key LIKE 'REPAIR:STRUCTURE:CONFORMANCE:%') AND entry.outcome='OK'),
    (SELECT count(*)::text FROM ledger.ledger_entry AS entry WHERE entry.run_id=p_run_id AND entry.action_kind='MODEL_CALL' AND (entry.call_site_key LIKE 'POST_COMPOSE_R9:%' OR entry.call_site_key LIKE 'REPAIR:STRUCTURE:POST_COMPOSE_R9:%') AND entry.outcome='OK'),
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
