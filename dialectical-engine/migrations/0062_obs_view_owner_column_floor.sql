-- Restore the column-level SELECT floor for debateai_obs_view_owner.
--
-- Why: every view this role owns is declared without `security_invoker`, so it defaults
-- to false and PostgreSQL checks the BASE-TABLE privileges of the OWNER, never of the
-- caller. The owner's reach therefore IS the floor of the obs chokepoint. Two landed
-- migrations widened that floor from a column list to whole tables:
--   * migrations/0034_obs_foundation.sql:274-275 granted a five-column list on core.run;
--     migrations/0060_observation_throughput_views.sql:23 superseded it with a
--     table-level GRANT SELECT on core.run, core.work_item and ledger.raw_artifact.
--   * migrations/0058_observation_safe_views.sql:23 issued a table-level GRANT SELECT on
--     core.work_item (and on core.run_progress_event, which this migration leaves alone).
-- Measured on the full chain before this file: the owner held SELECT on all 25 columns of
-- core.run (including content_ciphertext, question_line, question_blind_index, session_id,
-- caller_scope), all 12 of core.work_item and all 20 of ledger.raw_artifact.
--
-- A landed migration is never amended, so this is a forward migration. It is idempotent:
-- the REVOKE/GRANT pair re-applies to the same end state on any number of runs.
--
-- The column lists below are exactly what the owner's own views read, measured from
-- pg_depend, and nothing else:
--   core.run                -> obs.run_correlation_v (0034:267-270) reads run_id,
--                              created_at_seq, register_version, battery_version,
--                              risk_tier; obs.run_throughput_v (0060:10-19) reads run_id
--                              and created_at_seq. Union = the 0034 list, unchanged.
--   core.work_item          -> obs.run_throughput_v (0060:10-19) reads work_item_id,
--                              run_id, state, created_at_seq; obs.work_item_liveness_v
--                              (0058:1-10) additionally reads claimed_by, claim_deadline
--                              and settled_artifact_ref to derive its two presence flags.
--   ledger.raw_artifact     -> obs.provider_call_v (0060:1-8) reads provider_ref,
--                              model_id, parse_status, at_seq.

-- Drop the table-level grants. In PostgreSQL a table-level REVOKE also clears the
-- corresponding column-level privileges, so the 0034 list is re-issued below.
REVOKE SELECT ON core.run,core.work_item,ledger.raw_artifact
  FROM debateai_obs_view_owner;

GRANT SELECT (run_id,created_at_seq,register_version,battery_version,risk_tier)
  ON core.run TO debateai_obs_view_owner;
GRANT SELECT (work_item_id,run_id,state,created_at_seq,claimed_by,claim_deadline,settled_artifact_ref)
  ON core.work_item TO debateai_obs_view_owner;
GRANT SELECT (provider_ref,model_id,parse_status,at_seq)
  ON ledger.raw_artifact TO debateai_obs_view_owner;
