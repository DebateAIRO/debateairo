-- 0068 — V-29 (owner ruling 2026-09-22, finding DL5-F8): a narrow statistics window
-- replaces the observation agent's pg_monitor membership.
--
-- Why: 0059 made debateai_observation_agent a member of pg_monitor so its capacity
-- probe could `SET LOCAL ROLE pg_monitor`. That membership also lets the agent read
-- every other session's statement text (pg_stat_activity.query, including
-- credential-bearing administrative statements while they run), every GUC and
-- pg_stat_ssl. The probe needs none of that: it reads session counts, states and
-- ages, and two database sizes.
--
-- Shape: one SECURITY DEFINER function, obs.postgres_capacity(lock_wait_seconds,
-- idle_in_transaction_seconds), returning one row of ten aggregated numbers — the
-- same aggregate the probe computed before, moved behind the definer.
--   * It cannot be a plain view (like the obs.*_v views). pg_stat_get_activity()
--     decides per row whether to reveal state, timings and statement text from the
--     privileges of the CURRENT user, and a view does not change the current user —
--     only a definer function does. tests/integration/obs-agent-05-pg-monitor.test.ts
--     proves this on a real database.
--   * The owner is a dedicated NOLOGIN role holding pg_read_all_stats, the smallest
--     predefined role that reveals other roles' backends and sizes a database without
--     CONNECT on it. It owns this one function and nothing else, so no other object
--     inherits that reach, and pg_read_all_stats is never granted to the agent itself
--     (it would unlock the statement text again).
--   * The function never selects the statement text or its identifier, pins
--     search_path, is STRICT (a NULL threshold yields no row, which the probe refuses
--     as OBSERVATION_POSTGRES_CAPACITY_EMPTY), and is executable by the agent alone.
--
-- The migrating principal is a superuser (P3-01 manifest, migration-admin), which is
-- what 0059's `GRANT pg_monitor` already required: it grants a predefined role and
-- hands a function to a role it is not a member of.
--
-- Unchanged on purpose: the agent keeps INSERT on observation.threshold_policy
-- (`oactl thresholds apply` uses it; a later task handles that grant).
--
-- Idempotent statement by statement: the role is created once and its attributes
-- restated; the membership grant restates the same options; CREATE OR REPLACE keeps
-- the function's owner and ACL; REVOKE of a membership that is already gone only warns.

DO $$
BEGIN
  BEGIN
    CREATE ROLE debateai_obs_stats_owner
      NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  EXCEPTION WHEN duplicate_object OR unique_violation THEN
    NULL;
  END;
  ALTER ROLE debateai_obs_stats_owner
    NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
END;
$$;

-- The role is NOINHERIT, so the one grant it needs states INHERIT TRUE explicitly (the
-- definer's privileges are inherited privileges); SET FALSE because nothing ever
-- switches into pg_read_all_stats.
GRANT pg_read_all_stats TO debateai_obs_stats_owner WITH INHERIT TRUE, SET FALSE;

CREATE OR REPLACE FUNCTION obs.postgres_capacity(
  lock_wait_seconds double precision,
  idle_in_transaction_seconds double precision
)
RETURNS TABLE (
  used_connections double precision,
  max_connections double precision,
  lock_waiters double precision,
  longest_lock_wait_seconds double precision,
  longest_transaction_age_seconds double precision,
  active_query_age_seconds double precision,
  idle_in_transaction_count double precision,
  idle_in_transaction_age_seconds double precision,
  debateai_database_bytes double precision,
  hatchet_database_bytes double precision
)
LANGUAGE sql
STRICT
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $capacity$
WITH activity AS MATERIALIZED (
  SELECT backend_type,state,wait_event_type,state_change,xact_start,query_start
  FROM pg_catalog.pg_stat_activity
)
SELECT
  count(*) FILTER (WHERE backend_type='client backend')::double precision,
  pg_catalog.current_setting('max_connections')::double precision,
  count(*) FILTER (
    WHERE wait_event_type='Lock'
      AND state_change <= pg_catalog.clock_timestamp() - lock_wait_seconds * interval '1 second'
  )::double precision,
  coalesce(max(extract(epoch FROM pg_catalog.clock_timestamp() - state_change)) FILTER (
    WHERE wait_event_type='Lock'
      AND state_change <= pg_catalog.clock_timestamp() - lock_wait_seconds * interval '1 second'
  ),0)::double precision,
  coalesce(max(extract(epoch FROM pg_catalog.clock_timestamp() - xact_start)) FILTER (
    WHERE xact_start IS NOT NULL
  ),0)::double precision,
  coalesce(max(extract(epoch FROM pg_catalog.clock_timestamp() - query_start)) FILTER (
    WHERE state='active'
  ),0)::double precision,
  count(*) FILTER (
    WHERE state='idle in transaction'
      AND state_change <= pg_catalog.clock_timestamp() - idle_in_transaction_seconds * interval '1 second'
  )::double precision,
  coalesce(max(extract(epoch FROM pg_catalog.clock_timestamp() - state_change)) FILTER (
    WHERE state='idle in transaction'
      AND state_change <= pg_catalog.clock_timestamp() - idle_in_transaction_seconds * interval '1 second'
  ),0)::double precision,
  coalesce(pg_catalog.pg_database_size('debateai'::name),0)::double precision,
  coalesce(pg_catalog.pg_database_size('hatchet'::name),0)::double precision
FROM activity
$capacity$;

ALTER FUNCTION obs.postgres_capacity(double precision,double precision) OWNER TO debateai_obs_stats_owner;
REVOKE ALL ON FUNCTION obs.postgres_capacity(double precision,double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION obs.postgres_capacity(double precision,double precision)
  TO debateai_observation_agent;

REVOKE pg_monitor FROM debateai_observation_agent;
