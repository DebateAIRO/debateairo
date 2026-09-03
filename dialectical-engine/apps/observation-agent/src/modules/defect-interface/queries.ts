import pg from "pg";
import type {
  ClaimedWorkItem,
  InFlightRunProgress,
  ReadyWorkItem,
  SuspiciousWorkItem
} from "../stall-detectors/detectors.js";

export const STALL_SELECT = `SELECT work_item_id,run_id,state,claim_deadline
FROM obs.work_item_liveness_v
WHERE state='CLAIMED' AND run_id IS NOT NULL AND claim_deadline IS NOT NULL
ORDER BY work_item_id`;

export const QUEUE_NOT_DRAINING_SELECT = `SELECT work_item_id,run_id,state
FROM obs.work_item_liveness_v
WHERE state='READY' AND run_id IS NOT NULL
ORDER BY work_item_id`;

export const NO_PROGRESS_SELECT = `SELECT inflight.run_id,COALESCE(progress.latest_progress_seq,0)::bigint AS latest_progress_seq
FROM (
  SELECT DISTINCT run_id
  FROM obs.work_item_liveness_v
  WHERE state IN ('READY','CLAIMED') AND run_id IS NOT NULL
) AS inflight
LEFT JOIN obs.run_progress_v AS progress ON progress.run_id=inflight.run_id
ORDER BY inflight.run_id`;

export const SUSPICIOUS_SUCCESS_SELECT = `SELECT work_item_id,run_id,state,settled_artifact_present
FROM obs.work_item_liveness_v
WHERE state='DONE' AND run_id IS NOT NULL AND NOT settled_artifact_present
ORDER BY work_item_id`;

export const DEFECT_QUERY_DEFINITIONS = Object.freeze({
  STALL: STALL_SELECT,
  QUEUE_NOT_DRAINING: QUEUE_NOT_DRAINING_SELECT,
  NO_PROGRESS: NO_PROGRESS_SELECT,
  SUSPICIOUS_SUCCESS: SUSPICIOUS_SUCCESS_SELECT
});

export type DefectQueryInputs = Readonly<{
  stallRows: readonly ClaimedWorkItem[];
  readyRows: readonly ReadyWorkItem[];
  progressRows: readonly InFlightRunProgress[];
  suspiciousRows: readonly SuspiciousWorkItem[];
}>;

type QueryClient = Readonly<{
  query<Row extends Record<string, unknown>>(
    text: string
  ): Promise<Readonly<{ rows: readonly Row[] }>>;
}>;

export async function readDefectInputsFromClient(client: QueryClient): Promise<DefectQueryInputs> {
  await client.query("SET statement_timeout = 2000");
  const stalls = await client.query<{
    work_item_id: string; run_id: string; state: string; claim_deadline: Date;
  }>(STALL_SELECT);
  const ready = await client.query<{
    work_item_id: string; run_id: string; state: string;
  }>(QUEUE_NOT_DRAINING_SELECT);
  const progress = await client.query<{
    run_id: string; latest_progress_seq: string | number;
  }>(NO_PROGRESS_SELECT);
  const suspicious = await client.query<{
    work_item_id: string; run_id: string; state: string; settled_artifact_present: boolean;
  }>(SUSPICIOUS_SUCCESS_SELECT);
  return Object.freeze({
    stallRows: Object.freeze(stalls.rows.flatMap((row): ClaimedWorkItem[] =>
      row.state === "CLAIMED" && row.claim_deadline instanceof Date
        ? [Object.freeze({
            workItemId: row.work_item_id,
            runId: row.run_id,
            state: "CLAIMED",
            claimDeadline: row.claim_deadline
          })]
        : [])),
    readyRows: Object.freeze(ready.rows.flatMap((row): ReadyWorkItem[] =>
      row.state === "READY"
        ? [Object.freeze({ workItemId: row.work_item_id, runId: row.run_id, state: "READY" })]
        : [])),
    progressRows: Object.freeze(progress.rows.map((row): InFlightRunProgress => Object.freeze({
      runId: row.run_id,
      latestProgressSeq: Number(row.latest_progress_seq)
    }))),
    suspiciousRows: Object.freeze(suspicious.rows.flatMap((row): SuspiciousWorkItem[] =>
      row.state === "DONE" && row.settled_artifact_present === false
        ? [Object.freeze({
            workItemId: row.work_item_id,
            runId: row.run_id,
            state: "DONE",
            settledArtifactPresent: false
          })]
        : []))
  });
}

export async function readDefectInputs(databaseUrl: string): Promise<DefectQueryInputs> {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const client = await pool.connect();
    try {
      return await readDefectInputsFromClient(client);
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}
