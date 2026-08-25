-- T6: pre-0032 audit rows that violate the forward erasure checks remain an
-- explicit historical residual.  The audit chain is append-only, so this
-- migration neither rewrites nor deletes those rows.  It exposes only stable
-- aggregate counts to the database owner and adds no application access. T6
-- does not reclassify pre-existing privileges on the underlying audit table.

COMMENT ON CONSTRAINT audit_event_actor_ciphertext_null ON identity.audit_event IS
  'T6 forward-only check: pre-0032 violating rows are a ruled historical erasure residual; NOT VALID is intentional.';
COMMENT ON CONSTRAINT audit_event_target_id_no_email ON identity.audit_event IS
  'T6 forward-only check: pre-0032 violating rows are a ruled historical erasure residual; NOT VALID is intentional.';

CREATE OR REPLACE VIEW identity.legacy_audit_erasure_residual_v
WITH (security_barrier = true, security_invoker = false) AS
WITH residual AS (
  SELECT
    actor_ciphertext IS NOT NULL AS has_actor_ciphertext,
    position('@' in target_id) > 0 AS has_address_target
  FROM identity.audit_event
  WHERE actor_ciphertext IS NOT NULL OR position('@' in target_id) > 0
), forward_constraints AS (
  SELECT
    count(*)::bigint AS constraint_count,
    COALESCE(bool_and(NOT convalidated), false) AS intentionally_not_valid
  FROM pg_catalog.pg_constraint
  WHERE conrelid = 'identity.audit_event'::regclass
    AND conname = ANY(ARRAY[
      'audit_event_actor_ciphertext_null',
      'audit_event_target_id_no_email'
    ]::name[])
)
SELECT
  'PRE_0032_NOT_VALID_RESIDUAL'::text AS classification,
  count(*)::bigint AS residual_row_count,
  count(*) FILTER (WHERE has_actor_ciphertext)::bigint AS actor_ciphertext_row_count,
  count(*) FILTER (WHERE has_address_target)::bigint AS address_target_row_count,
  count(*) FILTER (WHERE has_actor_ciphertext AND has_address_target)::bigint
    AS overlapping_row_count,
  forward_constraints.constraint_count,
  forward_constraints.intentionally_not_valid
FROM residual
CROSS JOIN forward_constraints
GROUP BY forward_constraints.constraint_count,
  forward_constraints.intentionally_not_valid;

COMMENT ON VIEW identity.legacy_audit_erasure_residual_v IS
  'T6 count-only inventory of immutable pre-0032 audit rows outside the forward account-erasure guarantee; exposes no audit identifiers or retained values.';

REVOKE ALL ON identity.legacy_audit_erasure_residual_v FROM
  PUBLIC,
  debateai_runtime,
  debateai_authorization_runtime,
  debateai_erasure_runtime,
  debateai_replay,
  debateai_publication_cleanup,
  debateai_content_provision,
  debateai_evaluator_api,
  debateai_evaluator_ddl,
  debateai_evaluator_reader,
  debateai_evaluator_worker,
  debateai_obs_human,
  debateai_obs_listener,
  debateai_obs_view_owner,
  debateai_obs_watchdog,
  debateai_obs_writer,
  debateai_settlement_watch;
