-- 0093 — go-live row 41 (Part 2's final review P2-I5, part 3): billing's writes belong to the API alone.
-- 0084-0091 granted every billing privilege to debateai_runtime, and three production principals hold that role:
-- api-runtime, runner-runtime and scheduler-liveness (api-authorization inherits it through
-- debateai_authorization_runtime). So the runner or the liveness sweep could append a charge event, a refund request,
-- a credit-note or refund job, or claim and finish a queued job (P2-I5 part 3's cases (a) to (c)), and read every
-- customer's billing profile and location evidence.
--
-- Who uses billing, measured at this migration (2026-10-04):
--   * the API, over DATABASE_URL (apps/api/src/main.ts: the billing runtime and its outbox worker, the room decision
--     pool's lazy Free event and charge scope, the daily retention purge) and the owner's billing commands, which
--     connect with the same URL (P3-01: apps/api:billing-*-cli);
--   * the runner reads billing.person_windows_v (through billing.entitlement_at, an invoker function over
--     billing.entitlement_event) and billing.run_charge_scope, and never writes billing (amendment A20, ruling R-12;
--     apps/runner/src/main.ts, packages/budget/src/model-spend.ts);
--   * the scheduler's liveness sweep and the authorization pool read nothing of billing.
--
-- So: a new NOLOGIN capability role, debateai_billing_runtime, holds every billing privilege the API needs, and it is
-- a member of debateai_runtime, exactly as debateai_authorization_runtime is (0039), so the one principal granted it
-- (api-runtime, P3-01; debateai_dev_runtime in development) keeps everything it had. debateai_runtime keeps only the
-- runner's reads: USAGE on the schema, SELECT on billing.entitlement_event, billing.run_charge_scope and
-- billing.person_windows_v, and EXECUTE on billing.entitlement_at. Nothing else changes: no table, column, trigger or
-- function body. The production provisioner (pnpm db:provision-principals) moves api-runtime's membership to the new
-- role; until it runs on a database, the API there cannot write billing (billing is off until go-live).

DO $billing_0093_role$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'debateai_billing_runtime') THEN
    CREATE ROLE debateai_billing_runtime NOLOGIN;
  END IF;
END
$billing_0093_role$;
GRANT debateai_runtime TO debateai_billing_runtime;

-- The runner's reads stay on debateai_runtime; the two appends move.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON billing.entitlement_event, billing.run_charge_scope FROM debateai_runtime;
GRANT SELECT, INSERT ON billing.entitlement_event, billing.run_charge_scope TO debateai_billing_runtime;

-- Every other billing relation and function: the API's alone.
DO $billing_0093_move$
DECLARE target text;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'billing.customer', 'billing.customer_xmoney', 'billing.customer_profile_event', 'billing.quote',
    'billing.subscription_event',
    'billing.charge', 'billing.charge_event', 'billing.quote_use', 'billing.location_evidence',
    'billing.invoice_intent', 'billing.invoice', 'billing.invoice_status_event', 'billing.xmoney_notice',
    'billing.xmoney_notice_outcome',
    'billing.cancel_token', 'billing.cancel_token_use',
    'billing.withdrawal_owner_settlement'
  ] LOOP
    EXECUTE pg_catalog.format('REVOKE ALL ON %s FROM debateai_runtime', target);
    EXECUTE pg_catalog.format('GRANT SELECT, INSERT ON %s TO debateai_billing_runtime', target);
  END LOOP;
END
$billing_0093_move$;

REVOKE ALL ON billing.subscription_latest_v FROM debateai_runtime;
GRANT SELECT ON billing.subscription_latest_v TO debateai_billing_runtime;

-- The outbox (0087): read and enqueue, and only the claim and finish columns change.
REVOKE UPDATE (claimed_by, claimed_at, attempts, not_before, done_at, dead_at, last_error_code)
  ON billing.outbox FROM debateai_runtime;
REVOKE ALL ON billing.outbox FROM debateai_runtime;
GRANT SELECT, INSERT ON billing.outbox TO debateai_billing_runtime;
GRANT UPDATE (claimed_by, claimed_at, attempts, not_before, done_at, dead_at, last_error_code)
  ON billing.outbox TO debateai_billing_runtime;

-- The SECURITY DEFINER functions: the retention purge (0087), the withdrawal grant's consume (0088) and the erasure
-- lookups (0089, 0091).
REVOKE EXECUTE ON FUNCTION billing.purge_expired_records(timestamptz) FROM debateai_runtime;
REVOKE EXECUTE ON FUNCTION billing.consume_withdrawal_grant(uuid,uuid,uuid,text) FROM debateai_runtime;
REVOKE EXECUTE ON FUNCTION billing.owner_erasure_pending(uuid) FROM debateai_runtime;
REVOKE EXECUTE ON FUNCTION billing.pending_erasure_owner_refs(uuid,integer) FROM debateai_runtime;
REVOKE EXECUTE ON FUNCTION billing.owner_age_frozen(uuid) FROM debateai_runtime;
REVOKE EXECUTE ON FUNCTION billing.owner_erasure_committed(uuid) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION billing.purge_expired_records(timestamptz) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION billing.consume_withdrawal_grant(uuid,uuid,uuid,text) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION billing.owner_erasure_pending(uuid) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION billing.pending_erasure_owner_refs(uuid,integer) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION billing.owner_age_frozen(uuid) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION billing.owner_erasure_committed(uuid) TO debateai_billing_runtime;

-- The contract, checked once here so a database that drifted from it cannot finish this migration: debateai_runtime
-- (with whatever it inherits) writes nothing in billing, reads only the runner's three relations and runs only
-- billing.entitlement_at; the billing role is NOLOGIN, inherits debateai_runtime and holds every billing write.
DO $billing_0093_contract$
DECLARE
  v_runtime_writes text;
  v_runtime_reads text;
  v_runtime_functions text;
  v_billing_missing text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles AS role
    WHERE role.rolname = 'debateai_billing_runtime' AND NOT role.rolcanlogin AND role.rolinherit
      AND NOT role.rolsuper AND NOT role.rolcreaterole AND NOT role.rolcreatedb AND NOT role.rolbypassrls
  ) OR NOT pg_catalog.pg_has_role('debateai_billing_runtime', 'debateai_runtime', 'USAGE') THEN
    RAISE EXCEPTION 'BILLING_0093_ROLE_INVALID';
  END IF;

  SELECT pg_catalog.string_agg(relation.relname, ',' ORDER BY relation.relname) INTO v_runtime_writes
  FROM pg_catalog.pg_class AS relation
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'billing' AND relation.relkind IN ('r', 'p', 'v')
    AND (pg_catalog.has_table_privilege('debateai_runtime', relation.oid, 'INSERT,UPDATE,DELETE,TRUNCATE')
      OR pg_catalog.has_any_column_privilege('debateai_runtime', relation.oid, 'INSERT,UPDATE'));
  IF v_runtime_writes IS NOT NULL THEN
    RAISE EXCEPTION 'BILLING_0093_RUNTIME_WRITES %', v_runtime_writes;
  END IF;

  SELECT pg_catalog.string_agg(relation.relname, ',' ORDER BY relation.relname) INTO v_runtime_reads
  FROM pg_catalog.pg_class AS relation
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'billing' AND relation.relkind IN ('r', 'p', 'v')
    AND pg_catalog.has_any_column_privilege('debateai_runtime', relation.oid, 'SELECT');
  IF v_runtime_reads IS DISTINCT FROM 'entitlement_event,person_windows_v,run_charge_scope' THEN
    RAISE EXCEPTION 'BILLING_0093_RUNTIME_READS %', v_runtime_reads;
  END IF;

  SELECT pg_catalog.string_agg(procedure.proname, ',' ORDER BY procedure.proname) INTO v_runtime_functions
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'billing'
    AND pg_catalog.has_function_privilege('debateai_runtime', procedure.oid, 'EXECUTE');
  IF v_runtime_functions IS DISTINCT FROM 'entitlement_at' THEN
    RAISE EXCEPTION 'BILLING_0093_RUNTIME_FUNCTIONS %', v_runtime_functions;
  END IF;

  SELECT pg_catalog.string_agg(relation.relname, ',' ORDER BY relation.relname) INTO v_billing_missing
  FROM pg_catalog.pg_class AS relation
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'billing'
    AND ((relation.relkind = 'r'
        AND NOT pg_catalog.has_table_privilege('debateai_billing_runtime', relation.oid, 'SELECT,INSERT'))
      OR (relation.relkind = 'v'
        AND NOT pg_catalog.has_table_privilege('debateai_billing_runtime', relation.oid, 'SELECT')));
  IF v_billing_missing IS NOT NULL
    OR NOT pg_catalog.has_column_privilege('debateai_billing_runtime', 'billing.outbox', 'done_at', 'UPDATE')
    OR pg_catalog.has_column_privilege('debateai_billing_runtime', 'billing.outbox', 'payload', 'UPDATE') THEN
    RAISE EXCEPTION 'BILLING_0093_BILLING_ROLE_INCOMPLETE %', v_billing_missing;
  END IF;
END
$billing_0093_contract$;
