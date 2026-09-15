export const RUN_FAILURE_SELECT = `WITH run_states AS (
  SELECT run_id,
         count(work_item_id)>0 AND bool_and(state IN ('DONE','FAILED')) AS terminal,
         bool_or(state='FAILED') AS failed
  FROM obs.run_throughput_v
  GROUP BY run_id
)
SELECT count(*) FILTER (WHERE terminal AND failed)::text AS failed,
       count(*) FILTER (WHERE terminal)::text AS total
FROM run_states`;

export const THROUGHPUT_COUNTERS_SELECT = `WITH run_states AS (
  SELECT run_id,
         min(run_created_at_seq) AS run_created_at_seq,
         count(work_item_id)>0 AND bool_and(state IN ('DONE','FAILED')) AS terminal,
         bool_or(state='FAILED') AS failed
  FROM obs.run_throughput_v
  GROUP BY run_id
)
SELECT
  COALESCE(max(run_created_at_seq),0)::text AS run_sequence,
  count(*)::text AS runs_started,
  count(*) FILTER (WHERE terminal)::text AS terminal_runs,
  count(*) FILTER (WHERE terminal AND failed)::text AS failed_runs,
  COALESCE((SELECT max(work_item_created_at_seq) FROM obs.run_throughput_v),0)::text
    AS work_item_sequence,
  (SELECT count(*) FROM obs.run_throughput_v WHERE state='DONE')::text
    AS completed_work_items,
  (SELECT count(*) FROM obs.run_throughput_v WHERE state='FAILED')::text
    AS failed_work_items
FROM run_states`;

export const THROUGHPUT_QUERY_DEFINITIONS = Object.freeze({
  RUN_THROUGHPUT: RUN_FAILURE_SELECT,
  WORK_ITEM_THROUGHPUT: `SELECT
  count(*) FILTER (WHERE state='DONE')::text AS completed,
  count(*) FILTER (WHERE state='FAILED')::text AS failed
FROM obs.run_throughput_v`
});
