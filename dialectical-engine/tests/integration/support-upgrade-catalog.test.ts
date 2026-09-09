import { randomUUID } from "node:crypto";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { migrate,PostgresSupportSessionRepository } from "../../packages/db/src/index.js";
import { startTestDatabase,type TestDatabase } from "../support/testDatabase.js";

type ShapeRow = Readonly<{
  kind: string;
  name: string;
  definition: string;
}>;

let fresh: TestDatabase;
let upgraded: TestDatabase;

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
  await new PostgresSupportSessionRepository(database.pool,async () =>
    Buffer.concat([Buffer.from([1]),Buffer.alloc(60,4)]))
    .create({
      sessionId,tokenSha256: randomUUID().replaceAll("-","").repeat(2),
      identityOwnerRef: null,language: "en",kbVersion: "b".repeat(64),
      createdAt: new Date("2026-09-08T00:00:00.000Z")
    });
  const client = await database.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE debateai_support");
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
  // telemetry and complete abuse-event shape were added to its source bytes.
  await upgraded.pool.query(`
    DELETE FROM public.debateai_schema_migration
    WHERE name IN (
      '0054_support_keys_audit.sql','0055_register_support_publication.sql'
    );
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

    await migrate(upgraded.pool);
    const expected = await supportTelemetryShape(fresh);
    expect(expected.map(({ name }) => name)).toEqual([
      "cost_usd","degraded_reason","input_tokens","model_called","output_tokens",
      "support_abuse_event_class_ck","support_abuse_event_ip_class_at_idx",
      "support_abuse_event_session_class_idx"
    ]);
    expect(await supportTelemetryShape(upgraded)).toEqual(expected);

    await expectV2CaseInsertEnforcement(fresh);
    await expectV2CaseInsertEnforcement(upgraded);

    await expect(migrate(upgraded.pool)).resolves.toBeUndefined();
    expect(await supportTelemetryShape(upgraded)).toEqual(expected);
    await expectV2CaseInsertEnforcement(upgraded);
  });
});
