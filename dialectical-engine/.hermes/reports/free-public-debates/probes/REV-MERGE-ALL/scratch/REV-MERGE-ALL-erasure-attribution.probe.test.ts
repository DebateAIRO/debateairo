// TEMPORARY REVIEW FIXTURE — REV-MERGE-ALL, deleted before handoff. Never committed.
// Question: is the one merged-tree failure of dev-database-principals.test.ts caused by the
// 13-file resolution, or by the migration set ours (971e938c) brought and theirs never had?
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, migrate } from "../../packages/db/src/index.js";
import {
  DEVELOPMENT_DATABASE_PRINCIPALS,
  provisionDevelopmentDatabasePrincipals
} from "../../apps/runner/src/dev-database-principals.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
let secretRoot: string;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  secretRoot = await mkdtemp(join(tmpdir(), "rev-merge-all-erasure-"));
}, 180_000);

afterAll(async () => {
  await rm(secretRoot, { recursive: true, force: true });
  await database.stop();
});

describe("REV-MERGE-ALL erasure attribution probe", () => {
  it("names every identity/core/serve function the erasure principal may EXECUTE", async () => {
    const credentialFilePath = join(secretRoot, "database-principals.env");
    await provisionDevelopmentDatabasePrincipals({
      adminPool: database.pool,
      adminDatabaseUrl: database.connectionString,
      credentialFilePath
    });
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(credentialFilePath, "utf8");
    const erasureUrl = source.split("\n")
      .find((row) => row.startsWith("ERASURE_DATABASE_URL="))!
      .slice("ERASURE_DATABASE_URL=".length);
    const erasurePool = createPool(erasureUrl);
    try {
      const rows = await erasurePool.query<{ signature: string; schema: string }>(`
        SELECT namespace.nspname AS schema,
          namespace.nspname||'.'||procedure.proname||'('||
            pg_catalog.pg_get_function_identity_arguments(procedure.oid)||')' AS signature
        FROM pg_catalog.pg_proc AS procedure
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=procedure.pronamespace
        WHERE namespace.nspname=ANY(ARRAY['identity','core','serve'])
          AND has_function_privilege(current_user,procedure.oid,'EXECUTE')
        ORDER BY 2
      `);
      // eslint-disable-next-line no-console
      console.log("ERASURE_EXECUTABLE_COUNT", rows.rows.length);
      // eslint-disable-next-line no-console
      console.log("ERASURE_EXECUTABLE_SIGNATURES", JSON.stringify(rows.rows.map((r) => r.signature), null, 1));
      expect(DEVELOPMENT_DATABASE_PRINCIPALS.length).toBeGreaterThan(0);
    } finally {
      await erasurePool.end();
    }
  }, 180_000);
});
