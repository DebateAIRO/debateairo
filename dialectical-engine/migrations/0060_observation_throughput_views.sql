CREATE OR REPLACE VIEW obs.provider_call_v
WITH (security_barrier = true) AS
SELECT
  artifact.provider_ref,
  artifact.model_id,
  artifact.parse_status,
  artifact.at_seq
FROM ledger.raw_artifact AS artifact;

CREATE OR REPLACE VIEW obs.run_throughput_v
WITH (security_barrier = true) AS
SELECT
  run.run_id,
  run.created_at_seq AS run_created_at_seq,
  item.work_item_id,
  item.state,
  item.created_at_seq AS work_item_created_at_seq
FROM core.run AS run
LEFT JOIN core.work_item AS item ON item.run_id=run.run_id;

GRANT CREATE ON SCHEMA obs TO debateai_obs_view_owner;
GRANT USAGE ON SCHEMA core,ledger TO debateai_obs_view_owner;
GRANT SELECT ON core.run,core.work_item,ledger.raw_artifact TO debateai_obs_view_owner;
ALTER VIEW obs.provider_call_v OWNER TO debateai_obs_view_owner;
ALTER VIEW obs.run_throughput_v OWNER TO debateai_obs_view_owner;

REVOKE ALL PRIVILEGES ON obs.provider_call_v,obs.run_throughput_v
  FROM PUBLIC,debateai_observation_agent;
REVOKE ALL PRIVILEGES ON core.run,core.work_item,ledger.raw_artifact
  FROM debateai_observation_agent;
GRANT USAGE ON SCHEMA obs TO debateai_observation_agent;
GRANT SELECT ON obs.provider_call_v,obs.run_throughput_v
  TO debateai_observation_agent;
