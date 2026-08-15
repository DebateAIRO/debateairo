BEGIN;

GRANT USAGE ON SCHEMA register TO debateai_evaluator_api;
GRANT SELECT ON register.register_row,register.register_version TO debateai_evaluator_api;

GRANT SELECT ON
  evaluator.domain,
  evaluator.pipeline_event,
  evaluator.observation,
  evaluator.profile_cell,
  evaluator.rank_snapshot,
  evaluator.vllm_probe,
  evaluator.vllm_catalog_model,
  evaluator.consumer_selection
TO debateai_evaluator_api;

COMMIT;
