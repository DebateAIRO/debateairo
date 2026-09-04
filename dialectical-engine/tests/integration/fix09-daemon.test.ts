import { randomUUID } from "node:crypto";
import { getTableConfig } from "drizzle-orm/pg-core";
import pg from "pg";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { migrate, obsIncident, obsOccurrence } from "../../packages/db/src/index.js";
import { deliverOccurrence } from "../../tools/obs-listener/src/daemon/fold.js";
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
    expect(triggers.rows.map((row) => row.tgname)).toEqual(["reject_mutation", "reject_truncate"]);

    const listenerGrants = await database.pool.query<{ privilege_type: string; table_name: string }>(`
      SELECT privilege_type, table_name FROM information_schema.role_table_grants
      WHERE grantee='debateai_obs_listener' AND table_schema='obs'
      ORDER BY table_name, privilege_type
    `);
    expect(listenerGrants.rows).toEqual(expect.arrayContaining([
      { table_name: "occurrence", privilege_type: "SELECT" },
      { table_name: "delivery", privilege_type: "INSERT" },
      { table_name: "agent_action", privilege_type: "INSERT" },
      { table_name: "incident", privilege_type: "INSERT" },
      { table_name: "consumer_cursor", privilege_type: "INSERT" },
      { table_name: "component_health", privilege_type: "INSERT" }
    ]));

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
    const clientA = new pg.Client({ connectionString: roleUrl("debateai_obs_listener", LISTENER_PASSWORD) });
    const clientB = new pg.Client({ connectionString: roleUrl("debateai_obs_listener", LISTENER_PASSWORD) });
    await Promise.all([clientA.connect(), clientB.connect()]);
    let signalLock!: () => void;
    let releaseLock!: () => void;
    const firstLockAcquired = new Promise<void>((resolve) => { signalLock = resolve; });
    const releaseFirst = new Promise<void>((resolve) => { releaseLock = resolve; });
    const statementsA: string[] = [];
    const statementsB: string[] = [];
    const proxy = (
      client: pg.Client,
      statements: string[],
      pauseAfterLock: boolean
    ): Pick<PoolClient, "query"> => ({
      query: (async (statement: unknown, values?: readonly unknown[]) => {
        const sql = typeof statement === "string" ? statement : "";
        statements.push(sql);
        const result = await client.query(sql, values === undefined ? [] : [...values]);
        if (pauseAfterLock && sql.includes("pg_advisory_xact_lock")) {
          signalLock();
          await releaseFirst;
        }
        return result;
      }) as PoolClient["query"]
    });
    try {
      const deliveryA = deliverOccurrence(proxy(clientA, statementsA, true), occurrence.occurrenceId);
      await firstLockAcquired;
      let bSettled = false;
      const deliveryB = deliverOccurrence(proxy(clientB, statementsB, false), occurrence.occurrenceId)
        .finally(() => { bSettled = true; });
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(bSettled).toBe(false);
      expect(statementsB.some((sql) => sql.includes("SELECT occurrence.*"))).toBe(false);
      releaseLock();
      const outcomes = await Promise.all([deliveryA, deliveryB]);
      expect(outcomes.map((outcome) => outcome.result).sort()).toEqual(["ALREADY_ACKED", "FOLDED"]);
      const lockIndex = statementsA.findIndex((sql) => sql.includes("pg_advisory_xact_lock"));
      const occurrenceIndex = statementsA.findIndex((sql) => sql.includes("SELECT occurrence.*"));
      const ackIndex = statementsA.findIndex((sql) => sql.includes("SELECT EXISTS"));
      expect(lockIndex).toBeGreaterThan(statementsA.indexOf("BEGIN"));
      expect(occurrenceIndex).toBeGreaterThan(lockIndex);
      expect(ackIndex).toBeGreaterThan(occurrenceIndex);
      expect((await database.pool.query(`
        SELECT count(*)::int AS acknowledgements FROM obs.delivery
        WHERE occurrence_id=$1 AND consumer='fixagent-daemon' AND delivery_status='ACKED'
      `, [occurrence.occurrenceId])).rows).toEqual([{ acknowledgements: 1 }]);
    } finally {
      releaseLock();
      await Promise.all([
        clientA.query("ROLLBACK").catch(() => undefined),
        clientB.query("ROLLBACK").catch(() => undefined)
      ]);
      await Promise.all([clientA.end(), clientB.end()]);
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
});
