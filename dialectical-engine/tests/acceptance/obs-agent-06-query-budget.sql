\set ON_ERROR_STOP on
SET statement_timeout = 2000;

\echo 'OBS-06 RUN THROUGHPUT'
EXPLAIN (ANALYZE, TIMING OFF, SUMMARY ON)
WITH run_states AS (
  SELECT run_id,
         count(work_item_id)>0 AND bool_and(state IN ('DONE','FAILED')) AS terminal,
         bool_or(state='FAILED') AS failed
  FROM obs.run_throughput_v
  GROUP BY run_id
)
SELECT count(*) FILTER (WHERE terminal AND failed)::text AS failed,
       count(*) FILTER (WHERE terminal)::text AS total
FROM run_states;

\echo 'OBS-06 WORK ITEM THROUGHPUT'
EXPLAIN (ANALYZE, TIMING OFF, SUMMARY ON)
SELECT
  count(*) FILTER (WHERE state='DONE')::text AS completed,
  count(*) FILTER (WHERE state='FAILED')::text AS failed
FROM obs.run_throughput_v;

\echo 'OBS-06 PROVIDER FAILURE'
EXPLAIN (ANALYZE, TIMING OFF, SUMMARY ON)
SELECT provider_ref,
       count(*)::text AS total,
       count(*) FILTER (WHERE parse_status<>'PARSED')::text AS failed
FROM obs.provider_call_v
GROUP BY provider_ref
ORDER BY provider_ref;
