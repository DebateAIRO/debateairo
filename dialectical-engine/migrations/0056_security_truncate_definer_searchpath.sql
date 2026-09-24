-- 0056 — security hardening 2026-09-01, task B22 (findings L5-F4, L5-F1, L5-F10).
-- Forward migration: 0040 is never edited (migrate() keys its ledger on the file
-- name, so an edited applied file is inert). Numbering agreed with the live-loop
-- mission: dev tip 0049, the mission holds 0050-0055, this file is 0056, the
-- mission continues from 0057. Every statement below is idempotent.
--
-- §1 TRUNCATE guard (L5-F4). core.reject_mutation() is a row-level BEFORE UPDATE
--    OR DELETE guard; TRUNCATE fires no row trigger and no privilege stops the
--    owner/superuser session, so 78 of the 101 append-only relations could be
--    wiped in one statement. core.reject_truncate() is a statement-level BEFORE
--    TRUNCATE guard raising SQLSTATE 55000 (as core.reject_mutation()) with the
--    message 'TRUNCATE_REJECTED: append-only or immutable table <schema>.<table>
--    rejects TRUNCATE'. core.install_truncate_guard(regclass) installs it per
--    relation; to extend the guard to any relation (e.g. mission tables 0050+ at
--    DEV-SYNC) add exactly one line of this shape:
--
--        SELECT core.install_truncate_guard('schema.table');
--
--    It creates `reject_truncate BEFORE TRUNCATE ... FOR EACH STATEMENT EXECUTE
--    FUNCTION core.reject_truncate()` when absent, leaves an existing enabled
--    BEFORE TRUNCATE statement trigger of that name untouched (the 0034/0037/0039/
--    0040/0041/0044 guards use core.reject_mutation()), and refuses with 55000
--    TRUNCATE_GUARD_CONFLICT when a same-named trigger has any other shape or is
--    disabled — it never repairs silently. Called below once per relation for the
--    78 rows L5's "TRUNCATE-guard coverage" table marks unguarded, verbatim.
--
-- §2 EXECUTE privileges (L5-F1). PostgreSQL grants EXECUTE to PUBLIC on every new
--    function; 0040:6273 closed that only for schema core.
--    a) The 27 SECURITY DEFINER identity.audit_* wrappers L5-F1 lists are defined
--       at 0040:3091-3278 and dropped at 0040:3286-3312 in the same migration (both
--       present since its first commit 970870f3), so a migrated database never has
--       them. They are revoked here only if present (a same-signature function from
--       any other source) and the pin test asserts they stay absent.
--    b) The 5 invoker-rights functions get REVOKE ... FROM PUBLIC plus caller-exact
--       grants (callers read from packages/db/src/*.ts, packages/*, apps/*; roles
--       from docs/missions/2026-08-17-accounts-privacy-security/P3-01-production-
--       database-principals.json):
--       - ledger.allocate_sequence(): packages/db/src/index.ts:773 (every runtime
--         append: api, runner, liveness sweep as debateai_runtime; authorization
--         runtime inherits it), packages/liveness/src/index.ts:375, settlement
--         watch (0015:148), evaluator worker/api writers (0023:445, 0023:458).
--         Grants restated for debateai_runtime, debateai_settlement_watch and
--         debateai_evaluator_worker; debateai_evaluator_api keeps 0023:458
--         unrestated because tests/architecture/p3-production-database-
--         principals.test.ts:523-540 compares every cross-schema GRANT statement
--         naming that role literally with the manifest's privilegeDisclosures.
--         REVOKE ... FROM PUBLIC removes only the PUBLIC ACL entry; explicit grants
--         survive, and the pin test asserts the exact resulting map.
--       - register.claim_type_composition_map_is_valid(jsonb): CHECK on
--         register.register_row (0006:90-95). PostgreSQL privilege-checks a CHECK
--         function at executor init for any INSERT by the executing role, so the
--         one application role holding INSERT there (debateai_runtime, 0000:301)
--         keeps EXECUTE — mirrors 0040:6282-6286 for
--         serve.conformance_segment_results_are_valid. The only current INSERT
--         path (persistBootstrapRegister via apps/runner dev-deployment-register-
--         cli, MIGRATION_DATABASE_URL) runs as the migration owner.
--       - evidence.validate_instrument_certification(),
--         evidence.validate_citation_route_record(),
--         ledger.reject_same_maker_node_review(): trigger functions with no
--         application caller. Trigger firing does not check EXECUTE (the pin test
--         proves it: core.enforce_node_structure() fires for debateai_runtime,
--         which has held no EXECUTE on it since 0040:6273). No grant.
--    c) The two functions this migration adds have no application caller and are
--       revoked from PUBLIC.
--
-- §3 search_path pins (L5-F10). ALTER FUNCTION ... SET search_path = pg_catalog,
--    pg_temp on the 14 invoker-rights trigger/validator functions. Every body
--    references its relations schema-qualified (0000:17-29, 0000:31-39, 0002:49-71,
--    0006:4-88, 0006:124-144, 0008:114-146, 0008:207-240, 0010:29-59, 0019:14-33,
--    0023:175-206, 0037:155-165, 0037:289-322, 0039:87-97, 0040:3609-3639) and every
--    type, operator and function it uses lives in pg_catalog, so no body is
--    rewritten. evaluator.reject_same_maker_addon() already carried
--    search_path=pg_catalog from 0040:3609; it is widened to the pg_temp-explicit
--    form for uniformity. The pin test exercises the pinned trigger, validator and
--    SQL-language functions after the change.

-- §1 -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION core.reject_truncate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = format(
      'TRUNCATE_REJECTED: append-only or immutable table %I.%I rejects TRUNCATE',
      TG_TABLE_SCHEMA, TG_TABLE_NAME
    );
END;
$$;

CREATE OR REPLACE FUNCTION core.install_truncate_guard(target regclass)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  existing_type smallint;
  existing_enabled "char";
BEGIN
  SELECT trigger.tgtype, trigger.tgenabled
  INTO existing_type, existing_enabled
  FROM pg_catalog.pg_trigger AS trigger
  WHERE trigger.tgrelid = target
    AND trigger.tgname = 'reject_truncate'
    AND NOT trigger.tgisinternal;
  IF FOUND THEN
    -- pg_trigger.tgtype bits: 1 = FOR EACH ROW, 2 = BEFORE, 32 = TRUNCATE.
    -- tgenabled: 'O' origin/local and 'A' always fire; 'D' disabled and
    -- 'R' replica-only would leave the relation open in a normal session.
    IF (existing_type & 1) <> 0
      OR (existing_type & 2) = 0
      OR (existing_type & 32) = 0
      OR existing_enabled NOT IN ('O', 'A') THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = format(
          'TRUNCATE_GUARD_CONFLICT: trigger reject_truncate on %s is not an enabled BEFORE TRUNCATE statement guard',
          target
        );
    END IF;
    RETURN;
  END IF;
  EXECUTE format(
    'CREATE TRIGGER reject_truncate BEFORE TRUNCATE ON %s FOR EACH STATEMENT EXECUTE FUNCTION core.reject_truncate()',
    target
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION core.reject_truncate(), core.install_truncate_guard(regclass)
  FROM PUBLIC;

SELECT core.install_truncate_guard('core.run');
SELECT core.install_truncate_guard('core.run_progress_event');
SELECT core.install_truncate_guard('core.run_row_activation');
SELECT core.install_truncate_guard('core.run_row_activation_event');
SELECT core.install_truncate_guard('core.node');
SELECT core.install_truncate_guard('core.stranger_restatement');
SELECT core.install_truncate_guard('ledger.raw_artifact');
SELECT core.install_truncate_guard('ledger.ledger_entry');
SELECT core.install_truncate_guard('ledger.reduced_judgement');
SELECT core.install_truncate_guard('ledger.propagation_run');
SELECT core.install_truncate_guard('ledger.node_strength_record');
SELECT core.install_truncate_guard('serve.fact_bundle');
SELECT core.install_truncate_guard('serve.composed_text');
SELECT core.install_truncate_guard('serve.conformance_record');
SELECT core.install_truncate_guard('serve.served_number');
SELECT core.install_truncate_guard('serve.served_number_event');
SELECT core.install_truncate_guard('serve.answer');
SELECT core.install_truncate_guard('register.register_row');
SELECT core.install_truncate_guard('register.register_version');
SELECT core.install_truncate_guard('core.edge');
SELECT core.install_truncate_guard('ledger.sensitivity_record');
SELECT core.install_truncate_guard('serve.segment_suppression');
SELECT core.install_truncate_guard('serve.condition_mark');
SELECT core.install_truncate_guard('serve.condition_mark_node');
SELECT core.install_truncate_guard('serve.shadow_suppression');
SELECT core.install_truncate_guard('serve.abstention');
SELECT core.install_truncate_guard('evidence.query_set');
SELECT core.install_truncate_guard('evidence.query_amendment');
SELECT core.install_truncate_guard('evidence.source_record');
SELECT core.install_truncate_guard('evidence.evidence_item');
SELECT core.install_truncate_guard('evidence.absence_row');
SELECT core.install_truncate_guard('evidence.probe_capture');
SELECT core.install_truncate_guard('evidence.instrument_certification');
SELECT core.install_truncate_guard('evidence.citation_route_record');
SELECT core.install_truncate_guard('ledger.decision_record');
SELECT core.install_truncate_guard('core.verification_trigger_basis');
SELECT core.install_truncate_guard('core.critique_packet');
SELECT core.install_truncate_guard('core.independence_receipt');
SELECT core.install_truncate_guard('core.symmetry_diff');
SELECT core.install_truncate_guard('core.objection_record');
SELECT core.install_truncate_guard('core.value_hinge');
SELECT core.install_truncate_guard('core.reversal_point');
SELECT core.install_truncate_guard('ledger.overlay_run');
SELECT core.install_truncate_guard('core.revision_trigger');
SELECT core.install_truncate_guard('core.review_clock');
SELECT core.install_truncate_guard('core.staleness_state');
SELECT core.install_truncate_guard('core.question_liveness_event');
SELECT core.install_truncate_guard('scorecard.model_identity');
SELECT core.install_truncate_guard('scorecard.answer_outcome');
SELECT core.install_truncate_guard('scorecard.scorecard_cell');
SELECT core.install_truncate_guard('scorecard.routing_decision');
SELECT core.install_truncate_guard('scorecard.session_assignment');
SELECT core.install_truncate_guard('memory.question_key');
SELECT core.install_truncate_guard('memory.memory_link');
SELECT core.install_truncate_guard('memory.memory_link_event');
SELECT core.install_truncate_guard('memory.alias_row');
SELECT core.install_truncate_guard('memory.alias_revocation');
SELECT core.install_truncate_guard('memory.pull_record');
SELECT core.install_truncate_guard('memory.candidate_record');
SELECT core.install_truncate_guard('core.investigation_request');
SELECT core.install_truncate_guard('ledger.node_review');
SELECT core.install_truncate_guard('core.provider_probe');
SELECT core.install_truncate_guard('evaluator.domain');
SELECT core.install_truncate_guard('evaluator.domain_admission');
SELECT core.install_truncate_guard('evaluator.question_domain');
SELECT core.install_truncate_guard('evaluator.pipeline_event');
SELECT core.install_truncate_guard('evaluator.observation');
SELECT core.install_truncate_guard('evaluator.profile_cell');
SELECT core.install_truncate_guard('evaluator.rank_snapshot');
SELECT core.install_truncate_guard('evaluator.model_call_usage');
SELECT core.install_truncate_guard('evaluator.relative_cost_cell');
SELECT core.install_truncate_guard('evaluator.shadow_decision');
SELECT core.install_truncate_guard('evaluator.vllm_probe');
SELECT core.install_truncate_guard('evaluator.vllm_catalog_model');
SELECT core.install_truncate_guard('evaluator.consumer_selection');
SELECT core.install_truncate_guard('evaluator.consumer_output');
SELECT core.install_truncate_guard('evaluator.consumer_refresh_receipt');
SELECT core.install_truncate_guard('identity.audit_event');

-- §2 -------------------------------------------------------------------------

-- a) L5-F1's 27 SECURITY DEFINER wrappers: dropped by 0040:3286-3312; revoked
--    only if a same-signature function exists.
DO $$
DECLARE signature text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'identity.audit_registration_allowed(uuid,uuid,jsonb)',
    'identity.audit_registration_unavailable(uuid,jsonb)',
    'identity.audit_verification_sent(uuid,uuid,jsonb)',
    'identity.audit_verification_delivery_failed(uuid,uuid,jsonb,text)',
    'identity.audit_verification_consumed(uuid,uuid,jsonb)',
    'identity.audit_verification_consumed_denied(uuid,jsonb)',
    'identity.audit_verification_resend(uuid,uuid,jsonb)',
    'identity.audit_verification_resend_denied(uuid,jsonb,text)',
    'identity.audit_mfa_totp_begin(uuid,uuid,jsonb)',
    'identity.audit_mfa_totp_begin_denied(uuid,jsonb,text)',
    'identity.audit_mfa_totp_verified(uuid,uuid,jsonb)',
    'identity.audit_mfa_totp_verified_denied(uuid,jsonb,text)',
    'identity.audit_mfa_verification_failed(uuid,jsonb,text)',
    'identity.audit_mfa_recovery_codes_generated(uuid,uuid,jsonb)',
    'identity.audit_mfa_recovery_codes_denied(uuid,jsonb)',
    'identity.audit_mfa_enrollment_activated(uuid,uuid,jsonb)',
    'identity.audit_mfa_enrollment_denied(uuid,jsonb)',
    'identity.audit_mfa_recovery_consumed(uuid,uuid,jsonb)',
    'identity.audit_mfa_recovery_denied(uuid,jsonb)',
    'identity.audit_login_password_verified(uuid,uuid,jsonb)',
    'identity.audit_login_password_denied(uuid,jsonb)',
    'identity.audit_session_created(uuid,uuid,jsonb,text)',
    'identity.audit_session_revoked(uuid,uuid,jsonb)',
    'identity.audit_session_revoked_denied(uuid,jsonb)',
    'identity.audit_session_step_up(uuid,uuid,jsonb)',
    'identity.audit_sessions_revoked_all(uuid,uuid,jsonb,integer)',
    'identity.audit_sessions_revoked_all_denied(uuid,jsonb)'
  ] LOOP
    IF to_regprocedure(signature) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', signature);
    END IF;
  END LOOP;
END;
$$;

-- b) the 5 invoker-rights functions: close PUBLIC, grant the exact callers.
REVOKE EXECUTE ON FUNCTION ledger.allocate_sequence() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ledger.allocate_sequence()
  TO debateai_runtime, debateai_settlement_watch, debateai_evaluator_worker;

REVOKE EXECUTE ON FUNCTION register.claim_type_composition_map_is_valid(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION register.claim_type_composition_map_is_valid(jsonb)
  TO debateai_runtime;

REVOKE EXECUTE ON FUNCTION
  evidence.validate_instrument_certification(),
  evidence.validate_citation_route_record(),
  ledger.reject_same_maker_node_review()
  FROM PUBLIC;

-- §3 -------------------------------------------------------------------------

ALTER FUNCTION evidence.validate_citation_route_record() SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION evidence.validate_instrument_certification() SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION ledger.allocate_sequence() SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION ledger.reject_same_maker_node_review() SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION register.claim_type_composition_map_is_valid(jsonb) SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION core.enforce_node_structure() SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION core.reject_mutation() SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION core.reject_terminal_with_wait() SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION core.run_is_owned_by(uuid, uuid, text) SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION evaluator.reject_same_maker_addon() SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION evaluator.validate_observation_supersession() SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION identity.reject_owner_ref_rotation() SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION identity.reject_pseudonym_rotation() SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION serve.conformance_segment_results_are_valid(jsonb) SET search_path = pg_catalog, pg_temp;
