import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertSupportPrincipalRole,
  createPool,
  migrate,
  type Pool
} from "../../packages/db/src/index.js";
import { provisionDevelopmentDatabasePrincipals } from "../../apps/runner/src/dev-database-principals.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
let supportPool: Pool;
let credentialDirectory: string;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  credentialDirectory = await mkdtemp(join(tmpdir(), "sf-s05-support-boot-"));
  const credentialFilePath = join(credentialDirectory, "database-principals.env");
  await provisionDevelopmentDatabasePrincipals({
    adminPool: database.pool,
    adminDatabaseUrl: database.connectionString,
    credentialFilePath
  });
  const credentials = await readFile(credentialFilePath, "utf8");
  const supportUrl = credentials.split("\n")
    .find((line) => line.startsWith("SUPPORT_DATABASE_URL="))
    ?.slice("SUPPORT_DATABASE_URL=".length);
  if (!supportUrl) throw new Error("SUPPORT_DATABASE_URL_MISSING");
  supportPool = createPool(supportUrl);
}, 600_000);

afterAll(async () => {
  await supportPool?.end();
  await database?.stop();
  if (credentialDirectory) await rm(credentialDirectory, { recursive: true, force: true });
});

describe("S05 support principal at migration 0129", () => {
  it("accepts the support role that 0129 leaves", async () => {
    await expect(assertSupportPrincipalRole(supportPool)).resolves.toBeUndefined();
  });

  it("rejects a restored INSERT on a conversation table", async () => {
    await database.pool.query("GRANT INSERT ON support.session TO debateai_support");
    try {
      await expect(assertSupportPrincipalRole(supportPool))
        .rejects.toThrow("SUPPORT_DATABASE_ROLE_INVALID");
    } finally {
      await database.pool.query("REVOKE INSERT ON support.session FROM debateai_support");
    }
  });

  it("rejects removal of the shred audit INSERT needed by the retained repository", async () => {
    await database.pool.query("REVOKE INSERT ON support.shred_audit FROM debateai_support");
    try {
      await expect(assertSupportPrincipalRole(supportPool))
        .rejects.toThrow("SUPPORT_DATABASE_ROLE_INVALID");
    } finally {
      await database.pool.query("GRANT INSERT ON support.shred_audit TO debateai_support");
    }
  });
});
