import pg from "pg";
import type { PoolClient, QueryResultRow } from "pg";

import type { AuditSnapshot } from "@debateai/obs-capture/chain/verify";

export interface DatabaseActivation {
  readonly protocol: string;
  readonly activation_id: string;
  readonly activated_at: string;
  readonly occurrence_legacy_max_seq: string;
  readonly occurrence_legacy_count: string;
  readonly occurrence_legacy_digest: string;
  readonly agent_action_legacy_max_seq: string;
  readonly agent_action_legacy_count: string;
  readonly agent_action_legacy_digest: string;
  readonly initial_public_keyring_sha256: string;
  readonly activation_manifest_sha256: string;
  readonly created_by_custodian_id: string;
}

export interface DaemonHeartbeatSample {
  readonly state: string | null;
  readonly detailCode: string | null;
  readonly observedAt: string | null;
  readonly latestOccurrenceSeq: string;
  readonly cursorOccurrenceSeq: string;
}

export interface WatchdogDatabaseSnapshot {
  readonly audit: AuditSnapshot;
  readonly activation: DatabaseActivation | null;
  readonly daemon: DaemonHeartbeatSample;
}

export type WatchdogHealthState = "PASS" | "TRIPPED";
export type WatchdogHealthCode =
  | "NONE"
  | "CHAIN_BREAK"
  | "VERIFY_UNAVAILABLE"
  | "KEYRING_INVALID"
  | "WITNESS_INVALID"
  | "DAEMON_HEARTBEAT_MISSING"
  | "DAEMON_HEARTBEAT_STALE"
  | "CURSOR_LAG";

export interface WatchdogHealthSignal {
  readonly state: WatchdogHealthState;
  readonly detailCode: WatchdogHealthCode;
  readonly observedAt: string;
}

export interface WatchdogDatabase {
  readSnapshot(): Promise<WatchdogDatabaseSnapshot>;
  writeHealth(signal: WatchdogHealthSignal): Promise<void>;
  close(): Promise<void>;
}

const OCCURRENCE_COLUMNS = `
  chain_version,chain_key_id,chain_seq,prev_link,occurrence_id::text,occ_seq::text,
  to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS occurred_at,
  to_char(captured_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS captured_at,
  environment,build_ref,build_dirty,runtime,component,capture_point,code,taxonomy_class,
  severity,condition_mark,disposition,fingerprint,fingerprint_version::text,
  redaction_policy_version,allowlist_set_id,fallback_minimized,capture_status,run_ref,
  work_item_ref,node_ref,attempt_ref,ledger_ref,parent_occurrence_ref,cause_relation,
  at_seq_watermark,frames,safe_template_id,template_parameters,source,source_event_ref,
  zone_context,attempt_index::text,writer_identity,chain_signature,chain_link`;

const ACTION_COLUMNS = `
  chain_version,chain_key_id,chain_seq,prev_link,agent_action_id::text,action_seq::text,
  source,writer_identity,actor,action_kind,occurrence_id::text,incident_id::text,
  action_ref,action_payload,
  to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS occurred_at,
  chain_signature,chain_link`;

function freezeRows<T extends QueryResultRow>(rows: readonly T[]): readonly Readonly<T>[] {
  return Object.freeze(rows.map((row) => Object.freeze(row)));
}

async function rollback(client: PoolClient): Promise<void> {
  await client.query("ROLLBACK").catch(() => undefined);
}

export function createWatchdogDatabase(connectionString: string): WatchdogDatabase {
  if (typeof connectionString !== "string" || connectionString.trim() !== connectionString || connectionString.length === 0) {
    throw new TypeError("FIX09_WATCHDOG_DATABASE_URL");
  }
  const pool = new pg.Pool({ connectionString, max: 1 });
  return Object.freeze({
    async readSnapshot(): Promise<WatchdogDatabaseSnapshot> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
        const identity = await client.query<{ current_user: string; read_only: string }>(
          "SELECT current_user, current_setting('transaction_read_only') AS read_only",
        );
        if (identity.rows[0]?.current_user !== "debateai_obs_watchdog" || identity.rows[0]?.read_only !== "on") {
          throw new TypeError("FIX09_WATCHDOG_DATABASE_IDENTITY");
        }
        const snapshot = await client.query<{ snapshot_text: string }>("SELECT pg_current_snapshot()::text AS snapshot_text");
        const activation = await client.query<DatabaseActivation>(`
            SELECT protocol,activation_id::text,
              to_char(activated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS activated_at,
              occurrence_legacy_max_seq::text,occurrence_legacy_count::text,
              encode(occurrence_legacy_digest,'hex') AS occurrence_legacy_digest,
              agent_action_legacy_max_seq::text,agent_action_legacy_count::text,
              encode(agent_action_legacy_digest,'hex') AS agent_action_legacy_digest,
              encode(initial_public_keyring_sha256,'hex') AS initial_public_keyring_sha256,
              encode(activation_manifest_sha256,'hex') AS activation_manifest_sha256,
              created_by_custodian_id FROM obs.audit_chain_activation WHERE singleton`);
        const waters = await client.query<{ occurrence_high_water: string; agent_action_high_water: string }>(`
            SELECT coalesce((SELECT max(occ_seq) FROM obs.occurrence),0)::text AS occurrence_high_water,
              coalesce((SELECT max(action_seq) FROM obs.agent_action),0)::text AS agent_action_high_water`);
        const high = waters.rows[0];
        if (high === undefined) throw new TypeError("FIX09_WATCHDOG_DATABASE_SNAPSHOT");
        const occurrence = await client.query(`SELECT ${OCCURRENCE_COLUMNS} FROM obs.occurrence
            WHERE occ_seq <= $1 ORDER BY occ_seq`, [high.occurrence_high_water]);
        const action = await client.query(`SELECT ${ACTION_COLUMNS} FROM obs.agent_action
            WHERE action_seq <= $1 ORDER BY action_seq`, [high.agent_action_high_water]);
        const daemon = await client.query<{ state: string; detail_code: string; observed_at: string }>(`
            SELECT state,detail_code,
              to_char(observed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS observed_at
            FROM obs.component_health WHERE component='fixagent-daemon'`);
        const cursor = await client.query<{ last_occ_seq: string }>(`
            SELECT last_occ_seq::text FROM obs.consumer_cursor WHERE consumer='fixagent-daemon'`);
        await client.query("COMMIT");
        if (high === undefined || snapshot.rows[0] === undefined) throw new TypeError("FIX09_WATCHDOG_DATABASE_SNAPSHOT");
        const daemonRow = daemon.rows[0];
        return Object.freeze({
          activation: activation.rows[0] === undefined ? null : Object.freeze(activation.rows[0]),
          audit: Object.freeze({ snapshotText: snapshot.rows[0].snapshot_text,
            occurrenceHighWater: high.occurrence_high_water, agentActionHighWater: high.agent_action_high_water,
            occurrenceRows: freezeRows(occurrence.rows), agentActionRows: freezeRows(action.rows) }),
          daemon: Object.freeze({ state: daemonRow?.state ?? null, detailCode: daemonRow?.detail_code ?? null,
            observedAt: daemonRow?.observed_at ?? null, latestOccurrenceSeq: high.occurrence_high_water,
            cursorOccurrenceSeq: cursor.rows[0]?.last_occ_seq ?? "0" }),
        });
      } catch (error) {
        await rollback(client);
        throw error;
      } finally {
        client.release();
      }
    },
    async writeHealth(signal: WatchdogHealthSignal): Promise<void> {
      if (!/^(?:PASS|TRIPPED)$/u.test(signal.state) ||
          !/^(?:NONE|CHAIN_BREAK|VERIFY_UNAVAILABLE|KEYRING_INVALID|WITNESS_INVALID|DAEMON_HEARTBEAT_MISSING|DAEMON_HEARTBEAT_STALE|CURSOR_LAG)$/u.test(signal.detailCode) ||
          !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(signal.observedAt)) {
        throw new TypeError("FIX09_WATCHDOG_HEALTH_SIGNAL");
      }
      const client = await pool.connect();
      try {
        const identity = await client.query<{ current_user: string }>("SELECT current_user");
        if (identity.rows[0]?.current_user !== "debateai_obs_watchdog") throw new TypeError("FIX09_WATCHDOG_DATABASE_IDENTITY");
        await client.query(`
          INSERT INTO obs.component_health(component,state,observed_at,detail_code)
          VALUES ('fixagent-watchdog',$1,$2,$3)
          ON CONFLICT (component) DO UPDATE SET state=EXCLUDED.state,
            observed_at=EXCLUDED.observed_at,detail_code=EXCLUDED.detail_code,
            updated_at=statement_timestamp()`, [signal.state, signal.observedAt, signal.detailCode]);
      } finally {
        client.release();
      }
    },
    async close(): Promise<void> { await pool.end(); },
  });
}
