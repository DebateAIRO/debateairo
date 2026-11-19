-- 0183 · Which release took the traffic, and from when: one reader of the switches 0123 records.
--
-- Plain words. A plan's limits are settings, and a release serves the limits of its own settings version, the number in
-- its release key. When an upload changes a limit, a person's month must keep the numbers it started with: a lower limit
-- reaches them from their next month, a higher one at once. To know which numbers a month started with, the API and the
-- runner need the list of switches: which release took the traffic, and from which instant. 0123 keeps that list
-- (core.release_event, kind CURRENT, a way back to an older release included) but lets the runtime read only the release
-- that is current now (core.read_current_release). core.read_release_history() reads the whole list, oldest first:
-- release keys and instants only, one row per switch, so it stays a few rows for the life of the site.
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: expand
--   expand          additive only: one new function, which the release before never calls; no table, no earlier function
--                   and no grant of an earlier object changes.
-- n1: keeps-verifier
--   keeps-verifier  no billing relation or billing function, so lineage/verify-effective-capabilities-130.sql stays in force.
--   row security    outside 0130's scope rule: it reads 0123's core.release_event, which no request role can SELECT.
--
-- Replay-safe in the repository's form: CREATE OR REPLACE of a name no earlier migration defines.

-- One row per switch, in the order the switches were recorded. For the API and the runner (debateai_runtime).
CREATE OR REPLACE FUNCTION core.read_release_history()
RETURNS TABLE(event_seq bigint, release_key text, take_traffic_from timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT event.event_seq, event.release_key, event.take_traffic_from
  FROM core.release_event AS event
  WHERE event.kind = 'CURRENT'
  ORDER BY event.event_seq
$$;

-- The owner of 0123's two readers, the one role that may SELECT core.release_event.
ALTER FUNCTION core.read_release_history() OWNER TO debateai_release_owner;
REVOKE ALL ON FUNCTION core.read_release_history() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.read_release_history() TO debateai_runtime;
