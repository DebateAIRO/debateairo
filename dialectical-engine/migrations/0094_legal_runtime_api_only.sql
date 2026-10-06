-- 0094 — the acceptance record and the sign-up and country-gate writes belong to the API alone (review of 2026-10-04,
-- the open item 0093's pull request left: "the same pattern still applies to legal.acceptance").
-- 0080 granted debateai_runtime USAGE on the legal schema, SELECT and INSERT on legal.acceptance, and EXECUTE on three
-- SECURITY DEFINER functions: legal.purge_expired_acceptance, identity.create_pending_account_with_consent and
-- identity.audit_country_gate_refused. P3-01 gives debateai_runtime to api-runtime, runner-runtime and
-- scheduler-liveness, and api-authorization inherits it through debateai_authorization_runtime (0039), so 0080's own
-- REVOKE ... FROM debateai_authorization_runtime (0080:168, :231, :277) never took anything away. A compromised runner or
-- liveness sweep could forge an acceptance row (a CHECKOUT consent, say), create a pending account with consent, write
-- country-gate audit rows, or read everyone's acceptance evidence.
--
-- Who uses these, measured at this migration (2026-10-04): only the API, over DATABASE_URL (apps/api/src/main.ts: the
-- identity repository's sign-up and country-gate audit, the re-acceptance and checkout writes through
-- AcceptanceRepository, and the daily retention purge, apps/api/src/retention-purge.ts; packages/db/src/identity.ts and
-- legal-acceptance.ts). Nothing in apps/runner, apps/scheduler or packages/liveness reads or calls any of them, and the
-- authorization pool (sessions, e-mail change) does not either.
--
-- WHICH ROLE. 0093's debateai_billing_runtime is exactly the set wanted: NOLOGIN, a member of debateai_runtime, held by
-- api-runtime alone (P3-01; debateai_dev_runtime in development). A sibling role would have the same single holder, so it
-- would separate nothing, and it would cost a second manifest role, a second CONNECT grant and a second development
-- membership upgrade. The acceptance record is also billing's own evidence (CHECKOUT, RENEWAL_TERMS and IMMEDIATE_START
-- are the paid plans' kinds, 0080 is Part 1a of that programme, and the purge runs beside billing.purge_expired_records).
-- So these privileges move to debateai_billing_runtime; read its name as "the API runtime's own capabilities".
--
-- The privileges move; nothing else changes: no table, trigger or function body. 0080's triggers
-- (legal.record_account_closure on identity."user", the append-only guards) fire without any grant to the deleting role.
-- On a database that ran the production provisioner before 0093, api-runtime holds debateai_runtime directly until
-- `pnpm db:provision-principals` moves it, and until then the API there cannot sign anyone up (deploy/vps/README.md).

REVOKE ALL ON legal.acceptance FROM debateai_runtime;
REVOKE ALL ON legal.account_closure FROM debateai_runtime;
REVOKE ALL ON SCHEMA legal FROM debateai_runtime;
GRANT USAGE ON SCHEMA legal TO debateai_billing_runtime;
GRANT SELECT, INSERT ON legal.acceptance TO debateai_billing_runtime;

REVOKE EXECUTE ON FUNCTION legal.purge_expired_acceptance(timestamptz) FROM debateai_runtime;
REVOKE EXECUTE ON FUNCTION identity.create_pending_account_with_consent(
  uuid,bytea,jsonb,jsonb,text,text,timestamptz,timestamptz,text,timestamptz,jsonb,smallint,text,text,jsonb
) FROM debateai_runtime;
REVOKE EXECUTE ON FUNCTION identity.audit_country_gate_refused(jsonb,text) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION legal.purge_expired_acceptance(timestamptz) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION identity.create_pending_account_with_consent(
  uuid,bytea,jsonb,jsonb,text,text,timestamptz,timestamptz,text,timestamptz,jsonb,smallint,text,text,jsonb
) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION identity.audit_country_gate_refused(jsonb,text) TO debateai_billing_runtime;

-- The contract, checked here so a database that drifted from it cannot finish this migration. Each privilege is asked
-- about on its own: has_*_privilege with a comma list answers "any of them", and every one of these answers counts what
-- the role inherits and what PUBLIC holds. No NOLOGIN debateai_* role outside debateai_billing_runtime (the capability
-- roles every service principal inherits from, debateai_runtime and debateai_authorization_runtime among them) may use
-- the legal schema, touch a legal relation or run one of the three functions; the billing role holds exactly what the
-- API needs, and still nothing on legal.account_closure.
DO $legal_0094_contract$
DECLARE
  v_functions constant text[] := ARRAY[
    'legal.purge_expired_acceptance(timestamptz)',
    'identity.create_pending_account_with_consent(uuid,bytea,jsonb,jsonb,text,text,timestamptz,timestamptz,text,timestamptz,jsonb,smallint,text,text,jsonb)',
    'identity.audit_country_gate_refused(jsonb,text)'
  ];
  v_table_privileges constant text[] := ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'];
  v_leaks text;
BEGIN
  IF NOT pg_catalog.pg_has_role('debateai_billing_runtime', 'debateai_runtime', 'USAGE') THEN
    RAISE EXCEPTION 'LEGAL_0094_BILLING_ROLE_INVALID';
  END IF;

  SELECT pg_catalog.string_agg(DISTINCT role.rolname || ':' || leak.what, ',') INTO v_leaks
  FROM pg_catalog.pg_roles AS role
  CROSS JOIN LATERAL (
    SELECT 'USAGE legal' AS what
    WHERE pg_catalog.has_schema_privilege(role.oid, 'legal', 'USAGE')
    UNION ALL
    SELECT privilege || ' ' || relation.relname
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    CROSS JOIN pg_catalog.unnest(v_table_privileges) AS privilege
    WHERE namespace.nspname = 'legal' AND relation.relkind IN ('r', 'p', 'v', 'm')
      AND pg_catalog.has_table_privilege(role.oid, relation.oid, privilege)
    UNION ALL
    SELECT 'EXECUTE ' || fn
    FROM pg_catalog.unnest(v_functions) AS fn
    WHERE pg_catalog.has_function_privilege(role.oid, fn::regprocedure, 'EXECUTE')
  ) AS leak
  WHERE role.rolname LIKE 'debateai\_%' AND NOT role.rolcanlogin AND NOT role.rolsuper
    AND role.rolname <> 'debateai_billing_runtime';
  IF v_leaks IS NOT NULL THEN
    RAISE EXCEPTION 'LEGAL_0094_RUNTIME_PRIVILEGES %', v_leaks;
  END IF;

  IF NOT pg_catalog.has_schema_privilege('debateai_billing_runtime', 'legal', 'USAGE')
    OR NOT pg_catalog.has_table_privilege('debateai_billing_runtime', 'legal.acceptance', 'SELECT')
    OR NOT pg_catalog.has_table_privilege('debateai_billing_runtime', 'legal.acceptance', 'INSERT')
    OR pg_catalog.has_table_privilege('debateai_billing_runtime', 'legal.acceptance', 'UPDATE')
    OR pg_catalog.has_table_privilege('debateai_billing_runtime', 'legal.acceptance', 'DELETE')
    OR pg_catalog.has_table_privilege('debateai_billing_runtime', 'legal.acceptance', 'TRUNCATE')
    OR pg_catalog.has_table_privilege('debateai_billing_runtime', 'legal.account_closure', 'SELECT')
    OR pg_catalog.has_table_privilege('debateai_billing_runtime', 'legal.account_closure', 'INSERT')
    OR pg_catalog.has_table_privilege('debateai_billing_runtime', 'legal.account_closure', 'DELETE')
    OR NOT pg_catalog.has_function_privilege('debateai_billing_runtime', v_functions[1]::regprocedure, 'EXECUTE')
    OR NOT pg_catalog.has_function_privilege('debateai_billing_runtime', v_functions[2]::regprocedure, 'EXECUTE')
    OR NOT pg_catalog.has_function_privilege('debateai_billing_runtime', v_functions[3]::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'LEGAL_0094_BILLING_ROLE_INCOMPLETE';
  END IF;
END
$legal_0094_contract$;
