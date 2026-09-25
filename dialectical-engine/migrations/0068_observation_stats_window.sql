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
-- the function's owner and ACL; REVOKE of a membership that is already gone only warns,
-- and the closing guards then prove the end state instead of trusting that warning.

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

-- Guards. They refuse, never warn, so a replay or a pre-existing database cannot end in
-- a state the window's reasoning does not hold for (ERRCODE 55000, as in 0056).
--   * The REVOKE above removes only the direct pg_monitor grant from this grantor. A
--     membership reached another way (a grant from another grantor, or through any
--     intermediate role) would leave the agent able to read statement text again.
--   * The role statement at the top adopts a role that already exists. An adopted
--     statistics owner with a member would lend pg_read_all_stats to that member, and one
--     owning any other object would give that object the same reach.
DO $$
DECLARE
  agent_predefined text;
  owner_members text;
  owner_other_objects bigint;
BEGIN
  SELECT string_agg(granted.rolname, ',' ORDER BY granted.rolname) INTO agent_predefined
  FROM pg_catalog.pg_roles AS granted
  WHERE granted.rolname LIKE 'pg\_%'
    AND pg_catalog.pg_has_role('debateai_observation_agent', granted.oid, 'MEMBER');
  IF agent_predefined IS NOT NULL THEN
    RAISE EXCEPTION 'OBS_AGENT_PREDEFINED_ROLE_MEMBERSHIP: %', agent_predefined
      USING ERRCODE = '55000';
  END IF;

  SELECT string_agg(member.rolname, ',' ORDER BY member.rolname) INTO owner_members
  FROM pg_catalog.pg_auth_members AS membership
  JOIN pg_catalog.pg_roles AS member ON member.oid = membership.member
  WHERE membership.roleid = 'debateai_obs_stats_owner'::regrole;
  IF owner_members IS NOT NULL THEN
    RAISE EXCEPTION 'OBS_STATS_OWNER_NOT_EXCLUSIVE: members %', owner_members
      USING ERRCODE = '55000';
  END IF;

  -- Ownership recorded in pg_shdepend covers every database of the cluster, but the role is
  -- cluster-global and every database this chain migrates owns its own capacity function
  -- (tests/integration/obs-l1-s01-foundation.test.ts "reapply from another database"). So the
  -- guard looks at THIS database and at shared objects (dbid 0) only; each other database is
  -- guarded when the chain migrates it.
  -- Edited after merge (PR #14) on the owner's one-time exception to "never edit an existing
  -- migration", ruled 2026-09-25: the first version counted every database, so migrating a
  -- second database of the same cluster refused with "owns 1 other object(s)". No later
  -- migration can lift a refusal raised while this file applies, and the edit changes nothing
  -- for a database where this file already applied.
  SELECT count(*) INTO owner_other_objects
  FROM pg_catalog.pg_shdepend AS dependency
  WHERE dependency.refclassid = 'pg_catalog.pg_authid'::regclass
    AND dependency.refobjid = 'debateai_obs_stats_owner'::regrole
    AND dependency.deptype = 'o'
    AND dependency.dbid IN (
      0,
      (SELECT database.oid FROM pg_catalog.pg_database AS database
       WHERE database.datname = pg_catalog.current_database())
    )
    AND NOT (
      dependency.dbid = (
        SELECT database.oid FROM pg_catalog.pg_database AS database
        WHERE database.datname = pg_catalog.current_database()
      )
      AND dependency.classid = 'pg_catalog.pg_proc'::regclass
      AND dependency.objid
        = 'obs.postgres_capacity(double precision,double precision)'::regprocedure
    );
  IF owner_other_objects <> 0 THEN
    RAISE EXCEPTION 'OBS_STATS_OWNER_NOT_EXCLUSIVE: owns % other object(s)', owner_other_objects
      USING ERRCODE = '55000';
  END IF;
END;
$$;
