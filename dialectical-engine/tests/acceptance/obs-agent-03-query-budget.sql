\set ON_ERROR_STOP on
SET statement_timeout = 2000;

\echo 'OBS-03 STALL'
EXPLAIN (ANALYZE, TIMING OFF, SUMMARY ON)
SELECT work_item_id,run_id,state,claim_deadline
FROM obs.work_item_liveness_v
WHERE state='CLAIMED' AND run_id IS NOT NULL AND claim_deadline IS NOT NULL
ORDER BY work_item_id;

\echo 'OBS-03 QUEUE_NOT_DRAINING'
EXPLAIN (ANALYZE, TIMING OFF, SUMMARY ON)
SELECT work_item_id,run_id,state
FROM obs.work_item_liveness_v
WHERE state='READY' AND run_id IS NOT NULL
ORDER BY work_item_id;

\echo 'OBS-03 NO_PROGRESS'
EXPLAIN (ANALYZE, TIMING OFF, SUMMARY ON)
SELECT inflight.run_id,COALESCE(progress.latest_progress_seq,0)::bigint AS latest_progress_seq
FROM (
  SELECT DISTINCT run_id
  FROM obs.work_item_liveness_v
  WHERE state IN ('READY','CLAIMED') AND run_id IS NOT NULL
) AS inflight
LEFT JOIN obs.run_progress_v AS progress ON progress.run_id=inflight.run_id
ORDER BY inflight.run_id;

\echo 'OBS-03 SUSPICIOUS_SUCCESS'
EXPLAIN (ANALYZE, TIMING OFF, SUMMARY ON)
SELECT work_item_id,run_id,state,settled_artifact_present
FROM obs.work_item_liveness_v
WHERE state='DONE' AND run_id IS NOT NULL AND NOT settled_artifact_present
ORDER BY work_item_id;
