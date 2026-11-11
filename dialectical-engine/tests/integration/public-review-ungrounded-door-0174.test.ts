// tests/integration/public-review-ungrounded-door-0174.test.ts
// Migration 0174 (0150's staff review door without a ground is no longer the runtime's; the final review of 0172, 11 Nov 2026) on real PostgreSQL,
// through the API's runtime role as the review store calls the doors. Data is made up.
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "@debateai/db";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

const timeout = 300_000;
const OLD_DOOR = "staff.public_review_act(jsonb,uuid,jsonb,jsonb,jsonb,jsonb)";
const LAW_DOOR = "staff.public_review_act_grounded(jsonb,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,text)";
let database: TestDatabase;
/** The API's runtime role: SET ROLE on every new connection of the test's superuser. */
let runtime: Pool;
const codeOf = async (work: Promise<unknown>): Promise<string | null> =>
  work.then(() => null, (error: unknown) => (error as { code?: string }).code ?? "NO_CODE");

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  runtime = new Pool({ connectionString: database.connectionString, max: 2 });
  runtime.on("connect", (client) => { void client.query("SET ROLE debateai_runtime"); });
}, timeout);

afterAll(async () => {
  await runtime?.end();
  await database?.stop();
});

describe("0174: 0150's staff review door without a ground", () => {
  it("refuses the runtime role 42501 on the old door, before any of its checks run, whatever it is handed", async () => {
    // Shaped like a real call (a proof id and the four bodies), and empty: the refusal is the privilege's, never the body's own.
    expect(await codeOf(runtime.query(`SELECT ${OLD_DOOR.slice(0, OLD_DOOR.indexOf("("))}($1::jsonb,$2::uuid,$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb)`,
      [JSON.stringify({ staffId: randomUUID() }), randomUUID(), "{}", JSON.stringify({ action: "HIDE", publicationRef: randomUUID() }), null, null]))).toBe("42501");
    expect(await codeOf(runtime.query("SELECT staff.public_review_act('{}'::jsonb,$1::uuid,'{}'::jsonb,'{}'::jsonb,NULL,NULL)", [randomUUID()]))).toBe("42501");
  }, timeout);

  it("keeps the runtime's door with the law open: a call reaches the door's own checks, never a privilege refusal", async () => {
    const code = await codeOf(runtime.query("SELECT staff.public_review_act_grounded('{}'::jsonb,$1::uuid,'{}'::jsonb,'{}'::jsonb,NULL,NULL,NULL,NULL)", [randomUUID()]));
    expect(code).not.toBeNull();
    expect(code).not.toBe("42501");
  }, timeout);

  it("keeps the old door itself as 0150 left it, its owner's alone: no PUBLIC, no runtime, no other role", async () => {
    const row = (await database.pool.query<{ owner: string; definer: boolean; config: string[]; executors: string[] }>(`
      SELECT pg_get_userbyid(p.proowner) AS owner, p.prosecdef AS definer, p.proconfig AS config,
        ARRAY(SELECT coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC')::text FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
          WHERE a.privilege_type='EXECUTE' ORDER BY 1)::text[] AS executors
      FROM pg_proc p WHERE p.oid = to_regprocedure($1)`, [OLD_DOOR])).rows[0];
    expect(row).toEqual({ owner: "debateai_staff_security_owner", definer: true, config: ["search_path=pg_catalog"], executors: ["debateai_staff_security_owner"] });
    const can = async (role: string, signature: string) => (await database.pool.query<{ can: boolean }>(
      "SELECT has_function_privilege($1, to_regprocedure($2), 'EXECUTE') AS can", [role, signature])).rows[0]!.can;
    expect(await can("debateai_runtime", OLD_DOOR)).toBe(false);
    expect(await can("debateai_staff_recovery", OLD_DOOR)).toBe(false);
    expect(await can("debateai_runtime", LAW_DOOR)).toBe(true);
  }, timeout);

  it("records the change of 0150's digest as 0174's amendment, and a later grant back to the runtime is refused by the next migrate()", async () => {
    const amendment = (await database.pool.query<{ amendment: unknown }>(
      "SELECT amendment FROM public.debateai_schema_migration_step_amendment WHERE source_name='0150_public_review.sql' AND amended_by='0174_public_review_ungrounded_door.sql'")).rows;
    expect(amendment).toEqual([{ amendment: { step: "0150_public_review.sql", functions: [OLD_DOOR],
      revokes: [`EXECUTE ON FUNCTION ${OLD_DOOR} FROM debateai_runtime`], field: "function_acl_revoked" } }]);
    // A replay with nothing changed passes.
    await migrate(database.pool);
    await database.pool.query(`GRANT EXECUTE ON FUNCTION ${OLD_DOOR} TO debateai_runtime`);
    try {
      await expect(migrate(database.pool)).rejects.toThrow(/MIGRATION_FORWARD_CHAIN_POSTCONDITION_DRIFT (?:0150_public_review|0174_public_review_ungrounded_door)\.sql/u);
    } finally {
      await database.pool.query(`REVOKE EXECUTE ON FUNCTION ${OLD_DOOR} FROM debateai_runtime`);
    }
    await migrate(database.pool);
  }, timeout);
});
