import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { migrate } from "../../packages/db/src/index.js";
import { applyMigrationSql,retiredUpgradeReason } from "../support/migrationReplay.js";
import { startTestDatabase,type TestDatabase } from "../support/testDatabase.js";

const REPAIRING_MIGRATIONS = [
  "0054_support_keys_audit.sql","0055_register_support_publication.sql"
] as const;
const HISTORICAL_SUPPORT_INSERT_TABLES = `support.session, support.session_key,
  support.message, support.abuse_event, support."case", support.case_key,
  support.case_event, support.case_message, support.rating, support.tool_call,
  support.admission_event, support.relay_call, support.relay_waiter,
  support.relay_waiter_event`;

type ShapeRow = Readonly<{
  kind: string;
  name: string;
  definition: string;
}>;

let fresh: TestDatabase;
let upgraded: TestDatabase;

async function replayHistoricalSupportMigrations(): Promise<void> {
  try {
    await applyMigrationSql(upgraded.pool, REPAIRING_MIGRATIONS,
      async (client: PoolClient) => client.query(
        `GRANT INSERT ON ${HISTORICAL_SUPPORT_INSERT_TABLES} TO debateai_support`
      ));
  } finally {
    await upgraded.pool.query(
      `REVOKE INSERT ON ${HISTORICAL_SUPPORT_INSERT_TABLES} FROM debateai_support`
    );
  }
}

async function supportTelemetryShape(database: TestDatabase): Promise<readonly ShapeRow[]> {
  const result = await database.pool.query<ShapeRow>(`
    SELECT 'column'::text AS kind,column_name AS name,
      concat_ws(':',data_type,is_nullable,coalesce(column_default,'')) AS definition
    FROM information_schema.columns
    WHERE table_schema='support' AND table_name='message'
      AND column_name IN (
        'model_called','input_tokens','output_tokens','cost_usd','degraded_reason'
      )
    UNION ALL
    SELECT 'constraint',constraint_relation.conname,
      pg_catalog.pg_get_constraintdef(constraint_relation.oid,true)
    FROM pg_catalog.pg_constraint AS constraint_relation
    WHERE constraint_relation.conrelid='support.abuse_event'::regclass
      AND constraint_relation.contype='c'
      AND pg_catalog.pg_get_constraintdef(constraint_relation.oid,true) LIKE '%class%'
    UNION ALL
    SELECT 'index',index_relation.relname,pg_catalog.pg_get_indexdef(index_relation.oid)
    FROM pg_catalog.pg_class AS index_relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=index_relation.relnamespace
    WHERE namespace.nspname='support'
      AND index_relation.relname IN (
        'support_abuse_event_session_class_idx','support_abuse_event_ip_class_at_idx'
      )
    ORDER BY kind,name
  `);
  return result.rows;
}

async function expectV2CaseInsertEnforcement(database: TestDatabase): Promise<void> {
  const sessionId = randomUUID();
  const client = await database.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`INSERT INTO support.session(
      session_id,session_token_sha256,identity_owner_ref,language,state,kb_version,created_at
    ) VALUES($1,$2,NULL,'en','OPEN',$3,$4)`, [
      sessionId, randomUUID().replaceAll("-", "").repeat(2), "b".repeat(64),
      new Date("2026-09-08T00:00:00.000Z")
    ]);
    await client.query(`INSERT INTO support.session_key(session_id,wrapped_key,created_at)
      VALUES($1,$2,$3)`, [
      sessionId, Buffer.concat([Buffer.from([1]), Buffer.alloc(60, 4)]),
      new Date("2026-09-08T00:00:00.000Z")
    ]);
    await client.query("COMMIT");
    await client.query("BEGIN");
    await expect(client.query(`
      INSERT INTO support."case"(
        case_id,token_sha256,session_id,language,created_at,
        transcript_snapshot_ciphertext,state,summary_ciphertext,summary_at,summary_status
      ) VALUES($1,$2,$3,'en',$4,$5,'NEW',$6,$4,'DONE')
    `,[
      randomUUID(),randomUUID().replaceAll("-","").repeat(2),sessionId,
      new Date("2026-09-08T00:00:00.000Z"),
      Buffer.concat([Buffer.from([2]),Buffer.alloc(28,5)]),
      Buffer.concat([Buffer.from([1]),Buffer.alloc(28,5)])
    ])).rejects.toThrow(/SUPPORT_CONTENT_V2_REQUIRED/u);
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
}

beforeAll(async () => {
  fresh = await startTestDatabase();
  upgraded = await startTestDatabase();
  await migrate(fresh.pool);
  await migrate(upgraded.pool);

  // Reproduce a catalog where the historical/base 0050 was ledgered before the
  // telemetry and complete abuse-event shape were added to its source bytes. The
  // ledger stays complete: the test runs the repairing migrations' own SQL itself.
  await upgraded.pool.query(`
    DROP INDEX IF EXISTS support.support_abuse_event_session_class_idx;
    DROP INDEX IF EXISTS support.support_abuse_event_ip_class_at_idx;
    ALTER TABLE support.message
      DROP COLUMN model_called,
      DROP COLUMN input_tokens,
      DROP COLUMN output_tokens,
      DROP COLUMN cost_usd,
      DROP COLUMN degraded_reason;
    ALTER TABLE support.abuse_event
      DROP CONSTRAINT IF EXISTS abuse_event_class_check,
      DROP CONSTRAINT IF EXISTS support_abuse_event_class_ck;
    ALTER TABLE support.abuse_event ADD CONSTRAINT abuse_event_class_check
      CHECK (class IN ('INJECTION','BOUNDARY_DENY','RATE_LIMIT'));
  `);
}, 180_000);

afterAll(async () => {
  await fresh?.stop();
  await upgraded?.stop();
}, 180_000);

describe("support migration upgrade convergence", () => {
  it("repairs a ledgered historical 0050 in a later migration and replays idempotently", async () => {
    expect((await upgraded.pool.query(
      "SELECT name FROM public.debateai_schema_migration WHERE name='0050_support_foundation.sql'"
    )).rows).toEqual([{ name: "0050_support_foundation.sql" }]);

    // Until merge 065708c19 this test removed the 0054 and 0055 ledger rows and let migrate()
    // run them again. migrate() now refuses that ledger, and every ledger it does continue from
    // already records both, so no database reaches the repair through migrate() any more. The
    // repair itself still ships: 0054's and 0055's own SQL, in the plan's order, committed.
    expect(await retiredUpgradeReason(upgraded.pool, REPAIRING_MIGRATIONS)).toEqual({
      refusal: "MIGRATION_LINEAGE_REFUSED UNKNOWN_MIXED_LINEAGE", unrecorded: []
    });
    await replayHistoricalSupportMigrations();
    const expected = await supportTelemetryShape(fresh);
    expect(expected.map(({ name }) => name)).toEqual([
      "cost_usd","degraded_reason","input_tokens","model_called","output_tokens",
      "support_abuse_event_class_ck","support_abuse_event_ip_class_at_idx",
      "support_abuse_event_session_class_idx"
    ]);
    expect(await supportTelemetryShape(upgraded)).toEqual(expected);

    await expectV2CaseInsertEnforcement(fresh);
    await expectV2CaseInsertEnforcement(upgraded);

    await expect(replayHistoricalSupportMigrations()).resolves.toBeUndefined();
    expect(await supportTelemetryShape(upgraded)).toEqual(expected);
    await expectV2CaseInsertEnforcement(upgraded);
    await expect(migrate(upgraded.pool)).resolves.toEqual({ appliedSteps: [], extraSteps: [] });
  });
});
