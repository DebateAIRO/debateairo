CREATE OR REPLACE VIEW obs.work_item_liveness_v
WITH (security_barrier = true) AS
SELECT
  item.work_item_id,
  item.run_id,
  item.state,
  item.claimed_by IS NOT NULL AS claimed_by_present,
  item.claim_deadline,
  item.settled_artifact_ref IS NOT NULL AS settled_artifact_present
FROM core.work_item AS item;

CREATE OR REPLACE VIEW obs.run_progress_v
WITH (security_barrier = true) AS
SELECT DISTINCT ON (event.run_id)
  event.run_id,
  event.at_seq AS latest_progress_seq,
  event.kind AS latest_progress_kind
FROM core.run_progress_event AS event
ORDER BY event.run_id,event.at_seq DESC;

GRANT CREATE ON SCHEMA obs TO debateai_obs_view_owner;
GRANT USAGE ON SCHEMA core TO debateai_obs_view_owner;
GRANT SELECT ON core.work_item,core.run_progress_event TO debateai_obs_view_owner;
ALTER VIEW obs.work_item_liveness_v OWNER TO debateai_obs_view_owner;
ALTER VIEW obs.run_progress_v OWNER TO debateai_obs_view_owner;

REVOKE ALL PRIVILEGES ON obs.work_item_liveness_v,obs.run_progress_v
  FROM PUBLIC,debateai_observation_agent;
REVOKE ALL PRIVILEGES ON core.work_item,core.run_progress_event
  FROM debateai_observation_agent;
GRANT USAGE ON SCHEMA obs TO debateai_observation_agent;
GRANT SELECT ON obs.work_item_liveness_v,obs.run_progress_v
  TO debateai_observation_agent;

CREATE OR REPLACE VIEW observation.defect_signal_v
WITH (security_barrier = true) AS
SELECT
  row.seq,
  row.signal_id,
  row.detected_at,
  row.defect_kind,
  row.component,
  row.severity,
  row.run_ref,
  row.work_item_ref,
  row.evidence,
  row.impact_code,
  row.threshold_version
FROM observation.signal AS row
WHERE (row.state='OPEN' AND row.suspected_defect)
   OR (row.state='CLEARED' AND EXISTS (
     SELECT 1
     FROM observation.signal AS opened
     WHERE opened.signal_id=row.clears_signal_id
       AND opened.suspected_defect
   ));

REVOKE ALL PRIVILEGES ON observation.defect_signal_v FROM PUBLIC;
GRANT USAGE ON SCHEMA observation TO debateai_obs_listener;
GRANT SELECT ON observation.defect_signal_v TO debateai_obs_listener;
