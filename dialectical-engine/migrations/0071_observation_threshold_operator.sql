-- 0071 — DL7-F9 (finding delta-L7, Task 14): the observation daemon may no longer re-rule its
-- own monitor.
--
-- Why: 0057 granted debateai_observation_agent INSERT on observation.threshold_policy, the table
-- the daemon re-reads every cycle to decide what to alarm on, because `oactl thresholds apply`
-- ran as that same principal. Whoever held the daemon's credential could therefore insert a new
-- policy version that silences its own alarms. 0068 deliberately kept that grant until the apply
-- path had somewhere else to go; this migration gives it one.
--
-- Shape:
--   * A SECOND LOGIN principal, debateai_observation_threshold_operator, minted exactly the way
--     0057 mints the agent: the password comes from the `debateai.observation_threshold_operator_
--     password` setting when the migrating session sets one, otherwise it is random and nobody
--     knows it until an operator sets one (`oactl provision` in development; README §12 on a
--     host). NOINHERIT, no memberships, no attributes.
--   * It may SELECT and INSERT observation.threshold_policy and nothing else. The rows stay
--     immutable for it too: the reject_mutation triggers of 0057 still refuse UPDATE, DELETE and
--     TRUNCATE. `version` is an explicit integer, so no sequence is needed.
--   * The daemon loses INSERT on that one table and keeps SELECT: it still reads and reloads
--     every ratified version.
--
-- Idempotent statement by statement; the closing guards prove the end state rather than trusting
-- the REVOKE, which removes only this grantor's direct grant (ERRCODE 55000, as in 0056/0068).

DO $$
DECLARE
  provisioned_password text;
  credential_present boolean;
BEGIN
  provisioned_password := nullif(
    current_setting('debateai.observation_threshold_operator_password', true),
    ''
  );
  IF provisioned_password IS NULL THEN
    provisioned_password := replace(gen_random_uuid()::text, '-', '')
      || replace(gen_random_uuid()::text, '-', '');
  END IF;

  BEGIN
    EXECUTE format(
      'CREATE ROLE debateai_observation_threshold_operator LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
      provisioned_password
    );
  EXCEPTION WHEN duplicate_object OR unique_violation THEN
    NULL;
  END;

  SELECT rolpassword IS NOT NULL INTO credential_present
  FROM pg_catalog.pg_authid WHERE rolname='debateai_observation_threshold_operator';
  IF NOT credential_present THEN
    EXECUTE format(
      'ALTER ROLE debateai_observation_threshold_operator PASSWORD %L',
      provisioned_password
    );
  END IF;
  ALTER ROLE debateai_observation_threshold_operator
    LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
END;
$$;

DO $$
BEGIN
  EXECUTE format(
    'GRANT CONNECT ON DATABASE %I TO debateai_observation_threshold_operator',
    current_database()
  );
END;
$$;

GRANT USAGE ON SCHEMA observation TO debateai_observation_threshold_operator;
GRANT SELECT, INSERT ON observation.threshold_policy TO debateai_observation_threshold_operator;

REVOKE INSERT ON observation.threshold_policy FROM debateai_observation_agent;

-- Guards. They refuse, never warn.
--   * The daemon must not be able to INSERT by any path: a grant from another grantor, a grant to
--     PUBLIC, or a role it can use. has_table_privilege answers for every one of them.
--   * The operator must hold nothing but SELECT and INSERT on that one table: an adopted,
--     pre-existing role of the same name could carry more.
--   * The operator must be in no role at all, predefined or ours.
DO $$
DECLARE
  operator_extra text;
BEGIN
  IF pg_catalog.has_table_privilege(
    'debateai_observation_agent', 'observation.threshold_policy', 'INSERT'
  ) THEN
    RAISE EXCEPTION 'OBS_AGENT_THRESHOLD_INSERT_RETAINED'
      USING ERRCODE = '55000';
  END IF;
  IF NOT pg_catalog.has_table_privilege(
    'debateai_observation_agent', 'observation.threshold_policy', 'SELECT'
  ) THEN
    RAISE EXCEPTION 'OBS_AGENT_THRESHOLD_SELECT_LOST'
      USING ERRCODE = '55000';
  END IF;

  SELECT string_agg(grants.table_schema || '.' || grants.table_name || ':' || grants.privilege_type,
    ',' ORDER BY grants.table_schema, grants.table_name, grants.privilege_type)
  INTO operator_extra
  FROM information_schema.role_table_grants AS grants
  WHERE grants.grantee = 'debateai_observation_threshold_operator'
    AND NOT (grants.table_schema = 'observation' AND grants.table_name = 'threshold_policy'
      AND grants.privilege_type IN ('SELECT', 'INSERT'));
  IF operator_extra IS NOT NULL THEN
    RAISE EXCEPTION 'OBS_THRESHOLD_OPERATOR_NOT_EXCLUSIVE: %', operator_extra
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_auth_members
    WHERE member = 'debateai_observation_threshold_operator'::regrole
  ) THEN
    RAISE EXCEPTION 'OBS_THRESHOLD_OPERATOR_NOT_EXCLUSIVE: role membership'
      USING ERRCODE = '55000';
  END IF;
END;
$$;
