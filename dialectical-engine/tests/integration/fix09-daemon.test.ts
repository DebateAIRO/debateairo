import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { getTableConfig } from "drizzle-orm/pg-core";
import pg from "pg";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { migrate, obsIncident, obsOccurrence } from "../../packages/db/src/index.js";
import {
  createFixagentDeliveryGeneration,
  type FixagentDeliveryGeneration,
  type FixagentDeliveryNotification,
  type FixagentDeliveryTransaction,
} from "../../packages/obs-capture/src/chain/fixagent-delivery.js";
import { deliverOccurrence as deliverThroughGeneration } from "../../tools/obs-listener/src/daemon/fold.js";
import {
  createDaemon,
  isValidNotificationPayload,
  readDaemonConfig,
  type DeliveryGenerationFactory,
} from "../../tools/obs-listener/src/daemon/main.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

vi.mock("@debateai/kernel", async () => import("../../packages/kernel/src/index.js"));
vi.mock("@debateai/crypto", async () => import("../../packages/crypto/src/index.js"));
vi.mock("@debateai/db", async () => import("../../packages/db/src/index.js"));
vi.mock("@debateai/register", async () => import("../../packages/register/src/index.js"));

const WRITER_PASSWORD = "fix09-writer-test";
const LISTENER_PASSWORD = "fix09-listener-test";
const OCCURRENCE_LOCK_SQL = `
  SELECT pg_advisory_xact_lock(
    hashtextextended('fixagent-daemon:occurrence:' || $1::uuid::text, 0)
  )
`;
const OCCURRENCE_TRY_LOCK_SQL = `
  SELECT pg_try_advisory_xact_lock(
    hashtextextended('fixagent-daemon:occurrence:' || $1::uuid::text, 0)
  ) AS acquired
`;
let database: TestDatabase;

function deliverOccurrence(
  clientOrUrl: string | Pick<PoolClient,"query">,
  occurrenceId:string,
) {
  const databaseUrl=typeof clientOrUrl==="string"
    ?clientOrUrl
    :roleUrl("debateai_obs_listener",LISTENER_PASSWORD);
  const generation=createFixagentDeliveryGeneration(databaseUrl);
  return generation.connect()
    .then(()=>deliverThroughGeneration(generation,occurrenceId))
    .finally(()=>generation.close());
}

function roleUrl(role: string, password: string): string {
  const url = new URL(database.connectionString);
  url.username = role;
  url.password = password;
  return url.toString();
}

async function insertIncident(fingerprint: string, version: number): Promise<void> {
  await database.pool.query(`
    INSERT INTO obs.incident (
      fingerprint, fingerprint_version, first_seen_at, last_seen_at,
      distinct_work_unit_count, max_severity, state, source_set
    ) VALUES ($1, $2, now(), now(), 1, 'INFO', 'NEW', '["first_party"]'::jsonb)
  `, [fingerprint, version]);
}

async function insertWriterOccurrence(client: pg.Client, sourceEventRef: string): Promise<bigint> {
  const result = await client.query<{ occ_seq: string }>(`
    INSERT INTO obs.occurrence (
      occurred_at, environment, build_ref, build_dirty, runtime, component, capture_point,
      code, taxonomy_class, severity, disposition, fingerprint, fingerprint_version,
      redaction_policy_version, allowlist_set_id, capture_status, run_ref, work_item_ref,
      node_ref, attempt_ref, ledger_ref, parent_occurrence_ref, at_seq_watermark,
      frames, safe_template_id, source, source_event_ref, writer_identity
    ) VALUES (
      now(), 'test', 'build:test', false, 'listener', '{"package":"test","call_site_key":"test"}'::jsonb,
      'self', 'CAPTURE_SELF_TEST', 'CAPTURE_SELF', 'INFO', 'RECORDED', $1, 1,
      'redaction:test', 'allowlist:test', 'PERSISTED', 'NOT_APPLICABLE', 'NOT_APPLICABLE',
      'NOT_APPLICABLE', 'NOT_APPLICABLE', 'NOT_APPLICABLE', 'NO_CAUSE', 'NOT_APPLICABLE',
      '[]'::jsonb, 'template:test', 'first_party', $2, 'writer:test'
    ) RETURNING occ_seq::text
  `, [`fingerprint:${sourceEventRef}`, sourceEventRef]);
  return BigInt(result.rows[0]?.occ_seq ?? "0");
}

interface OccurrenceInsert {
  readonly occurrenceId?: string;
  readonly fingerprint?: string;
  readonly fingerprintVersion?: number;
  readonly severity?: "INFO" | "DEGRADED" | "SEVERE" | "FATAL";
  readonly occurredAt?: Date;
  readonly capturedAt?: Date;
  readonly component?: Record<string, unknown>;
  readonly frames?: readonly unknown[];
  readonly capturePoint?: "job" | "detector";
  readonly source?: "first_party" | "hatchet" | "ui_client";
  readonly runRef?: string;
  readonly workItemRef?: string;
}

async function insertOccurrence(options: OccurrenceInsert = {}): Promise<{
  readonly occurrenceId: string; readonly occSeq: bigint;
}> {
  const sourceEventRef = `fix09:event:${randomUUID()}`;
  const result = await database.pool.query<{ occurrence_id: string; occ_seq: string }>(`
    INSERT INTO obs.occurrence (
      occurrence_id, occurred_at, captured_at, environment, build_ref, build_dirty, runtime,
      component, capture_point, code, taxonomy_class, severity, disposition, fingerprint,
      fingerprint_version, redaction_policy_version, allowlist_set_id, capture_status,
      run_ref, work_item_ref, node_ref, attempt_ref, ledger_ref, parent_occurrence_ref,
      at_seq_watermark, frames, safe_template_id, source, source_event_ref, writer_identity
    ) VALUES (
      $1, $2, $3, 'test', 'build:test', false, 'listener', $4::jsonb, $5,
      'OBS_SCHEDULER_JOB_FAILED', 'JOB_FAILURE', $6, 'RECORDED', $7, $8,
      'redaction:test', 'allowlist:test', 'PERSISTED', $9, $10, 'NOT_APPLICABLE',
      'NOT_APPLICABLE', 'NOT_APPLICABLE', 'NO_CAUSE', 'NOT_APPLICABLE', $11::jsonb,
      'template:test', $12, $13, 'writer:test'
    ) RETURNING occurrence_id, occ_seq::text
  `, [
    options.occurrenceId ?? randomUUID(), options.occurredAt ?? new Date(),
    options.capturedAt ?? new Date(),
    JSON.stringify(options.component ?? { package: "@debateai/test", call_site_key: "test:1" }),
    options.capturePoint ?? "job", options.severity ?? "INFO",
    options.fingerprint ?? `fix09:fold:${randomUUID()}`, options.fingerprintVersion ?? 1,
    options.runRef ?? "10000000-0000-4000-8000-00000000abcd",
    options.workItemRef ?? "20000000-0000-4000-8000-00000000cdef",
    JSON.stringify(options.frames ?? []), options.source ?? "first_party", sourceEventRef
  ]);
  const row = result.rows[0];
  if (row === undefined) throw new Error("FIX09_INSERT_FAILED");
  return { occurrenceId: row.occurrence_id, occSeq: BigInt(row.occ_seq) };
}

async function ackCount(occurrenceId: string): Promise<number> {
  const result = await database.pool.query<{ count: number }>(`
    SELECT count(*)::int AS count FROM obs.delivery
    WHERE occurrence_id=$1 AND consumer='fixagent-daemon' AND delivery_status='ACKED'
  `, [occurrenceId]);
  return result.rows[0]?.count ?? 0;
}

interface ObservableGeneration extends FixagentDeliveryGeneration {
  emitError(error: Error): void;
  emitNotification(message: FixagentDeliveryNotification): void;
  suspendNotifications(): void;
}

interface DaemonQueryProbe {
  readonly leadershipResults: { readonly generation: number; readonly acquired: boolean }[];
  readonly beginWithoutLeadership: number[];
  activeDeliveries: number;
  maxInFlight: number;
  afterOwnedBegin?: () => Promise<void>;
}

function observingGenerationFactory(
  created: ObservableGeneration[],
  statementSets: string[][],
  probe: DaemonQueryProbe
): DeliveryGenerationFactory {
  return (databaseUrl) => {
    const base=createFixagentDeliveryGeneration(databaseUrl);
    const statements: string[] = [];
    const generation = statementSets.length;
    let ownsLeadership = false;
    const notificationListeners=new Set<(message:FixagentDeliveryNotification)=>void>();
    const errorListeners=new Set<(error:Error)=>void>();
    const endListeners=new Set<()=>void>();
    const client:ObservableGeneration=Object.freeze({
      connect:()=>base.connect(),
      async listen(){
        statements.push("LISTEN obs_occurrence_inserted");
        await base.listen();
      },
      async tryLeadership(){
        statements.push("SELECT pg_try_advisory_lock(hashtextextended('fixagent-daemon', 0)) AS acquired");
        ownsLeadership=await base.tryLeadership();
        probe.leadershipResults.push({ generation, acquired: ownsLeadership });
        return ownsLeadership;
      },
      async selectPending(){
        statements.push("SELECT pending occurrence WHERE NOT EXISTS ORDER BY occurred_at ASC, occurrence.occ_seq ASC LIMIT 1");
        return base.selectPending();
      },
      async withDelivery<T>(
        occurrenceId:string,
        callback:(transaction:FixagentDeliveryTransaction)=>Promise<T>,
      ):Promise<T>{
        statements.push("BEGIN");
        probe.activeDeliveries += 1;
        probe.maxInFlight = Math.max(probe.maxInFlight, probe.activeDeliveries);
        if (!ownsLeadership) probe.beginWithoutLeadership.push(generation);
        else await probe.afterOwnedBegin?.();
        try{
          const result=await base.withDelivery(occurrenceId,callback) as T;
          statements.push("COMMIT");
          return result;
        }catch(error){statements.push("ROLLBACK");throw error;}
        finally{probe.activeDeliveries-=1;}
      },
      onNotification(listener:(message:FixagentDeliveryNotification)=>void){notificationListeners.add(listener);base.onNotification(listener);},
      onError(listener:(error:Error)=>void){errorListeners.add(listener);base.onError(listener);},
      onEnd(listener:()=>void){endListeners.add(listener);base.onEnd(listener);},
      removeNotification(listener:(message:FixagentDeliveryNotification)=>void){notificationListeners.delete(listener);base.removeNotification(listener);},
      removeError(listener:(error:Error)=>void){errorListeners.delete(listener);base.removeError(listener);},
      removeEnd(listener:()=>void){endListeners.delete(listener);base.removeEnd(listener);},
      close:()=>base.close(),
      emitNotification(message:FixagentDeliveryNotification){for(const listener of notificationListeners)listener(message);},
      emitError(error:Error){for(const listener of errorListeners)listener(error);},
      suspendNotifications(){
        for(const listener of notificationListeners)base.removeNotification(listener);
      },
    });
    created.push(client);
    statementSets.push(statements);
    return client;
  };
}

function realGenerationFactory(created:ObservableGeneration[]):DeliveryGenerationFactory{
  return observingGenerationFactory(created,[],{
    leadershipResults:[],beginWithoutLeadership:[],activeDeliveries:0,maxInFlight:0,
  });
}

beforeAll(async () => {
  database = await startTestDatabase();
  await database.pool.query("SELECT set_config('debateai.obs_writer_password', $1, false)", [WRITER_PASSWORD]);
  await database.pool.query("SELECT set_config('debateai.obs_listener_password', $1, false)", [LISTENER_PASSWORD]);
  await migrate(database.pool);
}, 120_000);

afterAll(async () => database?.stop());

describe("FIX-09 C2 listener migration on real PostgreSQL", () => {
  it("uses composite incident identity with exact Drizzle parity", async () => {
    const fingerprint = `fix09:${randomUUID()}`;
    await insertIncident(fingerprint, 1);
    await insertIncident(fingerprint, 2);
    await expect(insertIncident(fingerprint, 1)).rejects.toMatchObject({ code: "23505" });

    const constraint = await database.pool.query<{ name: string; columns: string[] }>(`
      SELECT constraint_name AS name,
        array_agg(column_name::text ORDER BY ordinal_position)::text[] AS columns
      FROM information_schema.key_column_usage
      WHERE constraint_schema='obs' AND table_name='incident'
        AND constraint_name='incident_fingerprint_fingerprint_version_key'
      GROUP BY constraint_name
    `);
    expect(constraint.rows).toEqual([{
      name: "incident_fingerprint_fingerprint_version_key",
      columns: ["fingerprint", "fingerprint_version"]
    }]);

    expect(getTableConfig(obsIncident).uniqueConstraints.map((entry) => ({
      name: entry.getName(), columns: entry.columns.map((column) => column.name)
    }))).toContainEqual({
      name: "incident_fingerprint_fingerprint_version_key",
      columns: ["fingerprint", "fingerprint_version"]
    });
    expect(getTableConfig(obsOccurrence).columns.find((column) => column.name === "occ_seq")?.default)
      .toBeDefined();
  });

  it("publishes commit-aware wake hints without changing occurrence triggers or listener grants", async () => {
    const defaultResult = await database.pool.query<{ column_default: string }>(`
      SELECT column_default FROM information_schema.columns
      WHERE table_schema='obs' AND table_name='occurrence' AND column_name='occ_seq'
    `);
    expect(defaultResult.rows[0]?.column_default).toContain("obs.occurrence_seq_nextval_notify");

    const triggers = await database.pool.query<{ tgname: string }>(`
      SELECT tgname FROM pg_catalog.pg_trigger
      WHERE tgrelid='obs.occurrence'::regclass AND NOT tgisinternal ORDER BY tgname
    `);
    expect(triggers.rows.map((row) => row.tgname)).toEqual([
      "enforce_audit_chain_mode", "reject_mutation", "reject_truncate"
    ]);

    const listenerGrants = await database.pool.query<{ privilege_type: string; table_name: string }>(`
      SELECT privilege_type, table_name FROM information_schema.role_table_grants
      WHERE grantee='debateai_obs_listener' AND table_schema='obs'
      ORDER BY table_name, privilege_type
    `);
    expect(listenerGrants.rows).toEqual([
      { table_name: "agent_action", privilege_type: "INSERT" },
      { table_name: "agent_action", privilege_type: "SELECT" },
      { table_name: "audit_chain_activation", privilege_type: "SELECT" },
      { table_name: "budget_usage", privilege_type: "INSERT" },
      { table_name: "budget_usage", privilege_type: "SELECT" },
      { table_name: "capture_gap", privilege_type: "SELECT" },
      { table_name: "component_health", privilege_type: "INSERT" },
      { table_name: "component_health", privilege_type: "SELECT" },
      { table_name: "consumer_cursor", privilege_type: "INSERT" },
      { table_name: "consumer_cursor", privilege_type: "SELECT" },
      { table_name: "delivery", privilege_type: "INSERT" },
      { table_name: "delivery", privilege_type: "SELECT" },
      { table_name: "incident", privilege_type: "INSERT" },
      { table_name: "incident", privilege_type: "SELECT" },
      { table_name: "occurrence", privilege_type: "SELECT" },
      { table_name: "policy_decision", privilege_type: "INSERT" },
      { table_name: "policy_decision", privilege_type: "SELECT" },
      { table_name: "run_correlation_v", privilege_type: "SELECT" },
      { table_name: "source_link", privilege_type: "INSERT" },
      { table_name: "source_link", privilege_type: "SELECT" },
      { table_name: "spool_receipt", privilege_type: "SELECT" },
      { table_name: "trace", privilege_type: "INSERT" },
      { table_name: "trace", privilege_type: "SELECT" },
      { table_name: "zone_daily", privilege_type: "SELECT" }
    ]);
    const publisherRoutineGrants = await database.pool.query<{
      grantee: string; routine_name: string; privilege_type: string;
    }>(`
      SELECT CASE WHEN acl.grantee=0 THEN 'PUBLIC'
             ELSE pg_catalog.pg_get_userbyid(acl.grantee) END AS grantee,
        procedure.proname AS routine_name,acl.privilege_type
      FROM pg_catalog.pg_proc AS procedure
      CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(
        procedure.proacl,pg_catalog.acldefault('f',procedure.proowner)
      )) AS acl
      WHERE procedure.oid='obs.occurrence_seq_nextval_notify()'::pg_catalog.regprocedure
        AND acl.privilege_type='EXECUTE' AND acl.grantee<>procedure.proowner
      ORDER BY grantee,routine_name,privilege_type
    `);
    expect(publisherRoutineGrants.rows).toEqual([{
      grantee: "debateai_obs_writer",
      routine_name: "occurrence_seq_nextval_notify",
      privilege_type: "EXECUTE"
    }]);
    const migrationSource = await readFile(
      new URL("../../migrations/0062_fix09_listener_fold.sql", import.meta.url), "utf8"
    );
    const normalizedGrantStatements = migrationSource.split(";")
      .map((statement) => statement.replace(/\s+/g, " ").trim().toLowerCase())
      .filter((statement) => /^grant\b/.test(statement))
      .map((statement) => `${statement};`);
    expect(normalizedGrantStatements).toEqual([
      "grant execute on function obs.occurrence_seq_nextval_notify() to debateai_obs_writer;"
    ]);

    const writer = new pg.Client({ connectionString: roleUrl("debateai_obs_writer", WRITER_PASSWORD) });
    const listener = new pg.Client({ connectionString: roleUrl("debateai_obs_listener", LISTENER_PASSWORD) });
    await Promise.all([writer.connect(), listener.connect()]);
    const notifications: string[] = [];
    listener.on("notification", (message) => notifications.push(message.payload ?? ""));
    try {
      await listener.query("LISTEN obs_occurrence_inserted");
      await writer.query("BEGIN");
      const occSeq = await insertWriterOccurrence(writer, `migration:${randomUUID()}`);
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(notifications).toEqual([]);
      await writer.query("COMMIT");
      await vi.waitFor(() => expect(notifications).toContain(occSeq.toString()));
      await expect(listener.query("SELECT obs.occurrence_seq_nextval_notify()"))
        .rejects.toMatchObject({ code: "42501" });
    } finally {
      await Promise.all([writer.end(), listener.end()]);
    }
  });
});

describe("FIX-09 C2 listener transaction lock on real PostgreSQL", () => {
  it("excludes the same occurrence key, releases on rollback, and preserves read-only grants", async () => {
    const occurrenceX = "11111111-1111-4111-8111-111111111111";
    const occurrenceY = "22222222-2222-4222-8222-222222222222";
    await insertOccurrence({ occurrenceId: occurrenceX });
    const clientA = new pg.Client({ connectionString: roleUrl("debateai_obs_listener", LISTENER_PASSWORD) });
    const clientB = new pg.Client({ connectionString: roleUrl("debateai_obs_listener", LISTENER_PASSWORD) });
    await Promise.all([clientA.connect(), clientB.connect()]);
    try {
      const keySql = `SELECT hashtextextended(
        'fixagent-daemon:occurrence:' || $1::uuid::text, 0
      )::text AS key`;
      const x1 = await clientA.query<{ key: string }>(keySql, [occurrenceX]);
      const x2 = await clientA.query<{ key: string }>(keySql, [occurrenceX]);
      const y = await clientA.query<{ key: string }>(keySql, [occurrenceY]);
      expect(x1.rows[0]?.key).toBe(x2.rows[0]?.key);
      expect(x1.rows[0]?.key).not.toBe(y.rows[0]?.key);

      await clientA.query("BEGIN");
      await clientB.query("BEGIN");
      await clientA.query(OCCURRENCE_LOCK_SQL, [occurrenceX]);
      expect((await clientB.query<{ acquired: boolean }>(
        OCCURRENCE_TRY_LOCK_SQL, [occurrenceX]
      )).rows[0]?.acquired).toBe(false);
      expect((await clientB.query<{ acquired: boolean }>(
        OCCURRENCE_TRY_LOCK_SQL, [occurrenceY]
      )).rows[0]?.acquired).toBe(true);
      expect((await clientA.query(
        "SELECT occurrence_id FROM obs.occurrence WHERE occurrence_id=$1", [occurrenceX]
      )).rowCount).toBe(1);
      await clientA.query("SAVEPOINT denied_row_lock");
      await expect(clientA.query(`
        SELECT occurrence_id FROM obs.occurrence WHERE occurrence_id=$1 FOR UPDATE
      `, [occurrenceX])).rejects.toMatchObject({ code: "42501" });
      await clientA.query("ROLLBACK TO SAVEPOINT denied_row_lock");
      await clientA.query("ROLLBACK");
      expect((await clientB.query<{ acquired: boolean }>(
        OCCURRENCE_TRY_LOCK_SQL, [occurrenceX]
      )).rows[0]?.acquired).toBe(true);
      await clientB.query("ROLLBACK");

      const grants = await database.pool.query<{ privilege_type: string }>(`
        SELECT privilege_type FROM information_schema.role_table_grants
        WHERE grantee='debateai_obs_listener' AND table_schema='obs' AND table_name='occurrence'
        ORDER BY privilege_type
      `);
      expect(grants.rows).toEqual([{ privilege_type: "SELECT" }]);
    } finally {
      await Promise.all([
        clientA.query("ROLLBACK").catch(() => undefined),
        clientB.query("ROLLBACK").catch(() => undefined)
      ]);
      await Promise.all([clientA.end(), clientB.end()]);
    }
  });
});

describe("FIX-09 C2 atomic delivery on real PostgreSQL", () => {
  it("serializes direct same-occurrence attempts and rechecks ACK after the lock", async () => {
    const occurrence = await insertOccurrence();
    const databaseUrl=roleUrl("debateai_obs_listener",LISTENER_PASSWORD);
    const blocker=new pg.Client({connectionString:databaseUrl});
    await blocker.connect();
    await blocker.query("BEGIN");
    await blocker.query(OCCURRENCE_LOCK_SQL,[occurrence.occurrenceId]);
    try {
      let aSettled=false;
      let bSettled=false;
      const deliveryA=deliverOccurrence(databaseUrl,occurrence.occurrenceId)
        .finally(()=>{aSettled=true;});
      const deliveryB=deliverOccurrence(databaseUrl,occurrence.occurrenceId)
        .finally(()=>{bSettled=true;});
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(aSettled).toBe(false);
      expect(bSettled).toBe(false);
      await blocker.query("ROLLBACK");
      const outcomes = await Promise.all([deliveryA, deliveryB]);
      expect(outcomes.map((outcome) => outcome.result).sort()).toEqual(["ALREADY_ACKED", "FOLDED"]);
      expect((await database.pool.query(`
        SELECT count(*)::int AS acknowledgements FROM obs.delivery
        WHERE occurrence_id=$1 AND consumer='fixagent-daemon' AND delivery_status='ACKED'
      `, [occurrence.occurrenceId])).rows).toEqual([{ acknowledgements: 1 }]);
    } finally {
      await blocker.query("ROLLBACK").catch(()=>undefined);
      await blocker.end();
    }
  });

  it("folds or terminally receipts rows before ACK and advances only a contiguous cursor", async () => {
    await database.pool.query(`
      INSERT INTO obs.delivery (occurrence_id,consumer,attempt_index,lease_ref,delivery_status)
      SELECT occurrence_id,'fixagent-daemon',0,'fixagent-daemon:' || occurrence_id,'ACKED'
      FROM obs.occurrence AS occurrence
      WHERE NOT EXISTS (SELECT 1 FROM obs.delivery AS delivery
        WHERE delivery.occurrence_id=occurrence.occurrence_id
          AND delivery.consumer='fixagent-daemon' AND delivery.delivery_status='ACKED')
    `);
    const baseline = await database.pool.query<{ maximum: string }>(
      "SELECT coalesce(max(occ_seq),0)::text AS maximum FROM obs.occurrence"
    );
    await database.pool.query(`
      INSERT INTO obs.consumer_cursor (consumer,last_occ_seq) VALUES ('fixagent-daemon',$1)
      ON CONFLICT (consumer) DO UPDATE SET last_occ_seq=EXCLUDED.last_occ_seq
    `, [baseline.rows[0]?.maximum ?? "0"]);

    const listener = new pg.Client({ connectionString: roleUrl("debateai_obs_listener", LISTENER_PASSWORD) });
    await listener.connect();
    try {
      const fingerprint = `fix09:atomic:${randomUUID()}`;
      const accepted = await insertOccurrence({ fingerprint });
      expect(await deliverOccurrence(listener, accepted.occurrenceId)).toMatchObject({
        result: "FOLDED", occurrenceId: accepted.occurrenceId, occSeq: accepted.occSeq
      });
      expect(await deliverOccurrence(listener, accepted.occurrenceId)).toMatchObject({ result: "ALREADY_ACKED" });
      const one = await database.pool.query(`
        SELECT (SELECT count(*)::int FROM obs.incident WHERE fingerprint=$1) AS incidents,
          (SELECT count(*)::int FROM obs.delivery WHERE occurrence_id=$2 AND consumer='fixagent-daemon'
            AND delivery_status='ACKED') AS acknowledgements
      `, [fingerprint, accepted.occurrenceId]);
      expect(one.rows[0]).toEqual({ incidents: 1, acknowledgements: 1 });

      const older = await insertOccurrence({
        fingerprint, severity: "INFO", occurredAt: new Date("2026-09-04T08:00:00Z"),
        runRef: "NOT_APPLICABLE", workItemRef: "NOT_APPLICABLE"
      });
      const newer = await insertOccurrence({
        fingerprint, severity: "FATAL", occurredAt: new Date("2026-09-04T09:00:00Z"),
        runRef: "NOT_APPLICABLE", workItemRef: "NOT_APPLICABLE", source: "hatchet"
      });
      expect((await deliverOccurrence(listener, newer.occurrenceId)).cursor).toBe(older.occSeq - 1n);
      const partial = await database.pool.query(`
        SELECT distinct_work_unit_count::text AS work_count,max_severity,source_set
        FROM obs.incident WHERE fingerprint=$1 AND fingerprint_version=1
      `, [fingerprint]);
      expect(partial.rows[0]).toEqual({
        work_count: "2", max_severity: "FATAL", source_set: ["first_party", "hatchet"]
      });
      expect((await deliverOccurrence(listener, older.occurrenceId)).cursor).toBeGreaterThanOrEqual(newer.occSeq);

      const skipped = await insertOccurrence({ capturePoint: "detector", component: {} });
      expect(await deliverOccurrence(listener, skipped.occurrenceId)).toMatchObject({ result: "SKIPPED" });
      expect((await database.pool.query(`
        SELECT action_kind,action_ref,action_payload FROM obs.agent_action WHERE occurrence_id=$1
      `, [skipped.occurrenceId])).rows).toEqual([{
        action_kind: "FIXAGENT_SKIPPED", action_ref: `fixagent-skip:${skipped.occurrenceId}`,
        action_payload: { schema: "fixagent-skip/v1", reason: "SKIP_DETECTOR_LOCATION_MISSING",
          occ_seq: skipped.occSeq.toString() }
      }]);

      const poison = await insertOccurrence({ frames: [7] });
      expect(await deliverOccurrence(listener, poison.occurrenceId)).toMatchObject({ result: "DEAD_LETTERED" });
      expect((await database.pool.query(`
        SELECT action_kind,action_ref,action_payload FROM obs.agent_action WHERE occurrence_id=$1
      `, [poison.occurrenceId])).rows).toEqual([{
        action_kind: "FIXAGENT_DEAD_LETTER",
        action_ref: `fixagent-dead-letter:${poison.occurrenceId}`,
        action_payload: { schema: "fixagent-dead-letter/v1", reason: "POISON_INVALID_FRAMES",
          occ_seq: poison.occSeq.toString() }
      }]);
      expect((await database.pool.query(
        "SELECT state,detail_code FROM obs.component_health WHERE component='fixagent-daemon'"
      )).rows).toEqual([{ state: "POISON", detail_code: "POISON_INVALID_FRAMES" }]);
      const later = await insertOccurrence();
      await deliverOccurrence(listener, later.occurrenceId);
      expect((await database.pool.query(
        "SELECT state FROM obs.component_health WHERE component='fixagent-daemon'"
      )).rows).toEqual([{ state: "POISON" }]);
    } finally {
      await listener.end();
    }
  });

  it("rolls operational SQL failure back and succeeds on retry", async () => {
    const fingerprint = `fix09:rollback:${randomUUID()}`;
    await insertIncident(fingerprint, 1);
    const occurrence = await insertOccurrence({ fingerprint });
    const before = await database.pool.query<{ last_occ_seq: string }>(
      "SELECT last_occ_seq::text FROM obs.consumer_cursor WHERE consumer='fixagent-daemon'"
    );
    await database.pool.query("REVOKE UPDATE ON obs.incident FROM debateai_obs_listener");
    const listener = new pg.Client({ connectionString: roleUrl("debateai_obs_listener", LISTENER_PASSWORD) });
    await listener.connect();
    try {
      await expect(deliverOccurrence(listener, occurrence.occurrenceId)).rejects.toMatchObject({ code: "42501" });
    } finally {
      await listener.end();
      await database.pool.query(`GRANT UPDATE (
        first_seen_at,last_seen_at,distinct_work_unit_count,max_severity,state,source_set,
        cooldown_until,attributed_landing_ref,lineage_depth,updated_at
      ) ON obs.incident TO debateai_obs_listener`);
    }
    expect((await database.pool.query(`SELECT
      (SELECT count(*)::int FROM obs.delivery WHERE occurrence_id=$1 AND consumer='fixagent-daemon') AS deliveries,
      (SELECT count(*)::int FROM obs.agent_action WHERE occurrence_id=$1) AS actions,
      (SELECT last_occ_seq::text FROM obs.consumer_cursor WHERE consumer='fixagent-daemon') AS cursor
    `, [occurrence.occurrenceId])).rows[0]).toEqual({
      deliveries: 0, actions: 0, cursor: before.rows[0]?.last_occ_seq
    });
    const retry = new pg.Client({ connectionString: roleUrl("debateai_obs_listener", LISTENER_PASSWORD) });
    await retry.connect();
    try {
      expect(await deliverOccurrence(retry, occurrence.occurrenceId)).toMatchObject({ result: "FOLDED" });
    } finally {
      await retry.end();
    }
  });

  it("rolls poison action and health back when ACK insertion fails", async () => {
    const occurrence = await insertOccurrence({ frames: [7] });
    const beforeHealth = await database.pool.query(
      "SELECT state,observed_at,detail_code FROM obs.component_health WHERE component='fixagent-daemon'"
    );
    await database.pool.query("REVOKE INSERT ON obs.delivery FROM debateai_obs_listener");
    const listener = new pg.Client({ connectionString: roleUrl("debateai_obs_listener", LISTENER_PASSWORD) });
    await listener.connect();
    try {
      await expect(deliverOccurrence(listener, occurrence.occurrenceId)).rejects.toMatchObject({ code: "42501" });
    } finally {
      await listener.end();
      await database.pool.query("GRANT INSERT ON obs.delivery TO debateai_obs_listener");
    }
    expect((await database.pool.query(
      "SELECT count(*)::int AS count FROM obs.agent_action WHERE occurrence_id=$1",
      [occurrence.occurrenceId]
    )).rows).toEqual([{ count: 0 }]);
    expect((await database.pool.query(
      "SELECT count(*)::int AS count FROM obs.delivery WHERE occurrence_id=$1",
      [occurrence.occurrenceId]
    )).rows).toEqual([{ count: 0 }]);
    expect((await database.pool.query(
      "SELECT state,observed_at,detail_code FROM obs.component_health WHERE component='fixagent-daemon'"
    )).rows).toEqual(beforeHealth.rows);
    const retry = new pg.Client({ connectionString: roleUrl("debateai_obs_listener", LISTENER_PASSWORD) });
    await retry.connect();
    try {
      expect(await deliverOccurrence(retry, occurrence.occurrenceId)).toMatchObject({ result: "DEAD_LETTERED" });
    } finally {
      await retry.end();
    }
  });

  it("isolates delivered aggregates by fingerprint version and keeps replay idempotent", async () => {
    const fingerprint = `fix09:version-isolation:${randomUUID()}`;
    const versionOne = await insertOccurrence({
      fingerprint,
      fingerprintVersion: 1,
      severity: "INFO",
      source: "first_party",
      occurredAt: new Date("2026-09-04T07:00:00Z")
    });
    const versionTwo = await insertOccurrence({
      fingerprint,
      fingerprintVersion: 2,
      severity: "FATAL",
      source: "ui_client",
      occurredAt: new Date("2026-09-04T11:00:00Z")
    });
    const listener = new pg.Client({ connectionString: roleUrl("debateai_obs_listener", LISTENER_PASSWORD) });
    await listener.connect();
    try {
      expect(await deliverOccurrence(listener, versionOne.occurrenceId)).toMatchObject({ result: "FOLDED" });
      expect(await deliverOccurrence(listener, versionTwo.occurrenceId)).toMatchObject({ result: "FOLDED" });
      const beforeReplay = await database.pool.query(`
        SELECT fingerprint_version,distinct_work_unit_count::text AS work_count,
          max_severity,source_set
        FROM obs.incident WHERE fingerprint=$1 ORDER BY fingerprint_version
      `, [fingerprint]);
      expect(beforeReplay.rows).toEqual([
        { fingerprint_version: 1, work_count: "1", max_severity: "INFO", source_set: ["first_party"] },
        { fingerprint_version: 2, work_count: "1", max_severity: "FATAL", source_set: ["ui_client"] }
      ]);
      expect(await deliverOccurrence(listener, versionOne.occurrenceId))
        .toMatchObject({ result: "ALREADY_ACKED" });
      expect(await deliverOccurrence(listener, versionTwo.occurrenceId))
        .toMatchObject({ result: "ALREADY_ACKED" });
      const afterReplay = await database.pool.query(`
        SELECT fingerprint_version,distinct_work_unit_count::text AS work_count,
          max_severity,source_set
        FROM obs.incident WHERE fingerprint=$1 ORDER BY fingerprint_version
      `, [fingerprint]);
      expect(afterReplay.rows).toEqual(beforeReplay.rows);
      expect(await Promise.all([
        ackCount(versionOne.occurrenceId), ackCount(versionTwo.occurrenceId)
      ])).toEqual([1, 1]);
    } finally {
      await listener.end();
    }
  });

  it("reuses deterministic skip and poison receipts when ACK is absent", async () => {
    const skipped = await insertOccurrence({ capturePoint: "detector", component: {} });
    const poison = await insertOccurrence({ frames: [7] });
    const receipts = [
      {
        occurrence: skipped,
        kind: "FIXAGENT_SKIPPED",
        ref: `fixagent-skip:${skipped.occurrenceId}`,
        schema: "fixagent-skip/v1",
        reason: "SKIP_DETECTOR_LOCATION_MISSING"
      },
      {
        occurrence: poison,
        kind: "FIXAGENT_DEAD_LETTER",
        ref: `fixagent-dead-letter:${poison.occurrenceId}`,
        schema: "fixagent-dead-letter/v1",
        reason: "POISON_INVALID_FRAMES"
      }
    ] as const;
    for (const receipt of receipts) {
      await database.pool.query(`
        INSERT INTO obs.agent_action (
          source,writer_identity,actor,action_kind,occurrence_id,action_ref,action_payload
        ) VALUES ('first_party','fixagent-daemon','fixagent-daemon',$1,$2,$3,$4::jsonb)
      `, [
        receipt.kind, receipt.occurrence.occurrenceId, receipt.ref,
        JSON.stringify({
          schema: receipt.schema,
          reason: receipt.reason,
          occ_seq: receipt.occurrence.occSeq.toString()
        })
      ]);
    }
    const listener = new pg.Client({ connectionString: roleUrl("debateai_obs_listener", LISTENER_PASSWORD) });
    await listener.connect();
    try {
      expect(await deliverOccurrence(listener, skipped.occurrenceId)).toMatchObject({ result: "SKIPPED" });
      expect(await deliverOccurrence(listener, poison.occurrenceId)).toMatchObject({
        result: "DEAD_LETTERED",
        cursor: poison.occSeq
      });
    } finally {
      await listener.end();
    }
    for (const receipt of receipts) {
      expect((await database.pool.query(`
        SELECT action_kind,action_ref,action_payload FROM obs.agent_action
        WHERE occurrence_id=$1 ORDER BY occurred_at,agent_action_id
      `, [receipt.occurrence.occurrenceId])).rows).toEqual([{
        action_kind: receipt.kind,
        action_ref: receipt.ref,
        action_payload: {
          schema: receipt.schema,
          reason: receipt.reason,
          occ_seq: receipt.occurrence.occSeq.toString()
        }
      }]);
      expect(await ackCount(receipt.occurrence.occurrenceId)).toBe(1);
    }
    expect((await database.pool.query(
      "SELECT state,detail_code FROM obs.component_health WHERE component='fixagent-daemon'"
    )).rows).toEqual([{ state: "POISON", detail_code: "POISON_INVALID_FRAMES" }]);
  });
});

describe("FIX-09 C2 serialized listener daemon on real PostgreSQL", () => {
  it("rejects incomplete configuration and distrusts malformed notification payloads", () => {
    const invalidIntervals = [undefined, "", "0", "-1", "1.5", "01", " 1", "abc", "9007199254740992"];
    expect(() => readDaemonConfig({ OBS_LISTENER_POLL_INTERVAL_MS: "1" })).toThrow("OBS_LISTENER_DATABASE_URL_REQUIRED");
    for (const value of invalidIntervals) {
      expect(() => readDaemonConfig({
        OBS_LISTENER_DATABASE_URL: "postgresql://listener@localhost/db",
        ...(value === undefined ? {} : { OBS_LISTENER_POLL_INTERVAL_MS: value })
      })).toThrow("OBS_LISTENER_POLL_INTERVAL_MS_INVALID");
    }
    expect(readDaemonConfig({
      OBS_LISTENER_DATABASE_URL: "postgresql://listener@localhost/db",
      OBS_LISTENER_POLL_INTERVAL_MS: "25"
    })).toEqual({
      databaseUrl: "postgresql://listener@localhost/db",
      pollIntervalMs: 25,
      consumer: "fixagent-daemon"
    });
    for (const payload of [undefined, "", "-1", "0", "1.5", "abc", "01", "9007199254740992"]) {
      expect(isValidNotificationPayload(payload)).toBe(false);
    }
    expect(isValidNotificationPayload("42")).toBe(true);
  });

  it("pins the cap-one selector, global lock, and hint-only dependency surface", async () => {
    const source = await readFile(
      new URL("../../tools/obs-listener/src/daemon/main.ts", import.meta.url), "utf8"
    );
    const adapterSource = await readFile(
      new URL("../../packages/obs-capture/src/chain/fixagent-delivery.ts", import.meta.url), "utf8"
    );
    expect(source).toContain("createFixagentDeliveryGeneration");
    expect(adapterSource).toContain("SELECT pg_try_advisory_lock(hashtextextended('fixagent-daemon', 0)) AS acquired");
    expect(adapterSource).toMatch(/occurred_at ASC, occurrence\.occ_seq ASC\s+LIMIT 1/);
    expect(adapterSource).not.toMatch(/WHERE occurrence\.occ_seq\s*=\s*\$1/);
    expect(source).not.toMatch(/deliverOccurrence\([^,]+,\s*message\.payload/);
  });

  it("LISTENs before leadership and notification wakes work before a long poll", async () => {
    const created:ObservableGeneration[]=[];
    const statementSets:string[][]=[];
    const factory=observingGenerationFactory(created,statementSets,{
      leadershipResults:[],beginWithoutLeadership:[],activeDeliveries:0,maxInFlight:0,
    });
    const daemon = createDaemon({
      databaseUrl: roleUrl("debateai_obs_listener", LISTENER_PASSWORD),
      pollIntervalMs: 5_000,
      consumer: "fixagent-daemon"
    }, factory);
    await daemon.start();
    try {
      const occurrence = await insertOccurrence();
      await vi.waitFor(async () => expect(await ackCount(occurrence.occurrenceId)).toBe(1), { timeout: 1_000 });
      const statements=statementSets[0]??[];
      const listenIndex = statements.findIndex((sql) => sql.includes("LISTEN obs_occurrence_inserted"));
      const leaderIndex = statements.findIndex((sql) => sql.includes("pg_try_advisory_lock"));
      const pendingIndex = statements.findIndex((sql) => sql.includes("NOT EXISTS") && sql.includes("LIMIT 1"));
      expect(listenIndex).toBeGreaterThanOrEqual(0);
      expect(leaderIndex).toBeGreaterThan(listenIndex);
      expect(pendingIndex).toBeGreaterThan(leaderIndex);
    } finally {
      await daemon.stop();
    }
  });

  it("polls missed wakes and drains FATAL-first then occurrence-time/sequence order at cap one", async () => {
    const created:ObservableGeneration[]=[];
    const daemon = createDaemon({
      databaseUrl: roleUrl("debateai_obs_listener", LISTENER_PASSWORD),
      pollIntervalMs: 40,
      consumer: "fixagent-daemon"
    }, realGenerationFactory(created));
    await daemon.start();
    try {
      const live = created[0];
      if (live === undefined) throw new Error("FIX09_DAEMON_CLIENT_MISSING");
      live.suspendNotifications();
      const base = new Date("2026-09-04T12:00:00Z");
      const rows = [
        await insertOccurrence({
          severity: "INFO", occurredAt: new Date(base.getTime() + 4_000),
          capturedAt: new Date(base.getTime() + 1_000)
        }),
        await insertOccurrence({
          severity: "FATAL", occurredAt: new Date(base.getTime() + 1_000),
          capturedAt: new Date(base.getTime() + 4_000)
        }),
        await insertOccurrence({
          severity: "SEVERE", occurredAt: new Date(base.getTime() + 3_000),
          capturedAt: new Date(base.getTime() + 2_000)
        }),
        await insertOccurrence({
          severity: "FATAL", occurredAt: new Date(base.getTime() + 2_000),
          capturedAt: new Date(base.getTime())
        })
      ];
      live.emitNotification({channel:"obs_occurrence_inserted",payload:"1"});
      await vi.waitFor(async () => {
        expect(await Promise.all(rows.map((row) => ackCount(row.occurrenceId)))).toEqual([1, 1, 1, 1]);
      }, { timeout: 1_000 });
      const order = await database.pool.query<{ occurrence_id: string }>(`
        SELECT delivery.occurrence_id FROM obs.delivery AS delivery
        WHERE delivery.consumer='fixagent-daemon' AND delivery.delivery_status='ACKED'
          AND delivery.occurrence_id=ANY($1::uuid[])
        ORDER BY delivery.occurred_at,delivery.delivery_id
      `, [rows.map((row) => row.occurrenceId)]);
      expect(order.rows.map((row) => row.occurrence_id)).toEqual([
        rows[1]?.occurrenceId, rows[3]?.occurrenceId, rows[2]?.occurrenceId, rows[0]?.occurrenceId
      ]);
    } finally {
      await daemon.stop();
    }
  });

  it("keeps one leader, promotes a standby, and reconnects LISTEN-first after loss", async () => {
    const madeA:ObservableGeneration[]=[];
    const madeB:ObservableGeneration[]=[];
    const statementsA: string[][] = [];
    const statementsB: string[][] = [];
    let signalOwnedBegin!: () => void;
    let releaseOwnedBegin!: () => void;
    const firstOwnedBegin = new Promise<void>((resolve) => { signalOwnedBegin = resolve; });
    const ownedBeginRelease = new Promise<void>((resolve) => { releaseOwnedBegin = resolve; });
    let pausedOwnedBegin = false;
    const probe: DaemonQueryProbe = {
      leadershipResults: [],
      beginWithoutLeadership: [],
      activeDeliveries: 0,
      maxInFlight: 0,
      afterOwnedBegin: async () => {
        if (pausedOwnedBegin) return;
        pausedOwnedBegin = true;
        signalOwnedBegin();
        await ownedBeginRelease;
      }
    };
    const daemonA = createDaemon({
      databaseUrl: roleUrl("debateai_obs_listener", LISTENER_PASSWORD), pollIntervalMs: 40,
      consumer: "fixagent-daemon"
    }, observingGenerationFactory(madeA, statementsA, probe));
    const daemonB = createDaemon({
      databaseUrl: roleUrl("debateai_obs_listener", LISTENER_PASSWORD), pollIntervalMs: 40,
      consumer: "fixagent-daemon"
    }, observingGenerationFactory(madeB, statementsB, probe));
    await daemonA.start();
    await daemonB.start();
    try {
      expect(probe.leadershipResults.slice(0, 2).map((entry) => entry.acquired).sort())
        .toEqual([false, true]);
      const first = await insertOccurrence();
      await firstOwnedBegin;
      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(probe.beginWithoutLeadership).toEqual([]);
      expect(probe.maxInFlight).toBe(1);
      releaseOwnedBegin();
      await vi.waitFor(async () => expect(await ackCount(first.occurrenceId)).toBe(1), { timeout: 1_000 });
      await daemonA.stop();
      const second = await insertOccurrence();
      await vi.waitFor(async () => expect(await ackCount(second.occurrenceId)).toBe(1), { timeout: 1_000 });
      const activeB = madeB.at(-1);
      if (activeB === undefined) throw new Error("FIX09_STANDBY_CLIENT_MISSING");
      activeB.emitError(new Error("FIX09_INJECTED_CONNECTION_LOSS"));
      const third = await insertOccurrence();
      await vi.waitFor(async () => {
        expect(madeB.length).toBeGreaterThan(1);
        expect(await ackCount(third.occurrenceId)).toBe(1);
      }, { timeout: 1_000 });
      const reconnectStatements = statementsB[1] ?? [];
      const listenIndex = reconnectStatements.findIndex((sql) => sql.includes("LISTEN obs_occurrence_inserted"));
      const leaderIndex = reconnectStatements.findIndex((sql) => sql.includes("pg_try_advisory_lock"));
      const pendingIndex = reconnectStatements.findIndex((sql) => sql.includes("LIMIT 1"));
      expect(listenIndex).toBeGreaterThanOrEqual(0);
      expect(leaderIndex).toBeGreaterThan(listenIndex);
      expect(pendingIndex).toBeGreaterThan(leaderIndex);
      expect(probe.beginWithoutLeadership).toEqual([]);
      expect(probe.maxInFlight).toBe(1);
    } finally {
      releaseOwnedBegin();
      await daemonA.stop();
      await daemonB.stop();
    }
  });
});
