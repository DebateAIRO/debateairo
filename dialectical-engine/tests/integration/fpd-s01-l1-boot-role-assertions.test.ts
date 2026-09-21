import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertAccountErasureDatabaseRole,
  assertContentProvisionDatabaseRole,
  assertPublicationCleanupDatabaseRole,
  assertPublicationDatabaseRoleSeparation,
  createPool,
  migrate,
  type Pool
} from "@debateai/db";
import { provisionDevelopmentDatabasePrincipals } from "../../apps/runner/src/dev-database-principals.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
let secretRoot: string;

function parseCredentialFile(source: string): ReadonlyMap<string, string> {
  return new Map(source.trim().split("\n").map((line) => {
    const separator = line.indexOf("=");
    if (separator < 1) throw new TypeError("TEST_CREDENTIAL_LINE_INVALID");
    return [line.slice(0, separator), line.slice(separator + 1)];
  }));
}

function requiredCredential(credentials: ReadonlyMap<string, string>, key: string): string {
  const value = credentials.get(key);
  if (value === undefined) throw new TypeError(`TEST_CREDENTIAL_MISSING:${key}`);
  return value;
}

describe("S01 L1 API boot database-role assertions", () => {
  beforeAll(async () => {
    database = await startTestDatabase();
    await migrate(database.pool);
    secretRoot = await mkdtemp(join(tmpdir(), "debateai-fpd-s01-l1-"));
  }, 120_000);

  afterAll(async () => {
    await database?.stop();
    await rm(secretRoot, { recursive: true, force: true });
  });

  it("passes every role assertion executed by API startup against the real login principals", async () => {
    const credentialFilePath = join(secretRoot, "database-principals.env");
    await provisionDevelopmentDatabasePrincipals({
      adminPool: database.pool,
      adminDatabaseUrl: database.connectionString,
      credentialFilePath
    });
    const credentials = parseCredentialFile(await readFile(credentialFilePath, "utf8"));
    const pools: Pool[] = [
      requiredCredential(credentials, "DATABASE_URL"),
      requiredCredential(credentials, "AUTHORIZATION_DATABASE_URL"),
      requiredCredential(credentials, "PUBLICATION_CLEANUP_DATABASE_URL"),
      requiredCredential(credentials, "CONTENT_PROVISION_DATABASE_URL"),
      requiredCredential(credentials, "CONTENT_PROVISION_DATABASE_URL"),
      requiredCredential(credentials, "LIVENESS_DATABASE_URL"),
      requiredCredential(credentials, "ERASURE_DATABASE_URL")
    ].map((databaseUrl) => createPool(databaseUrl, { max: 1 }));
    const [
      runtimePool,
      authorizationPool,
      publicationCleanupPool,
      contentProvisionPool,
      serverAskAdmissionPool,
      legacyAskAdmissionPool,
      erasurePool
    ] = pools as [Pool, Pool, Pool, Pool, Pool, Pool, Pool];
    try {
      await expect(Promise.all([
        assertAccountErasureDatabaseRole(runtimePool, erasurePool),
        assertAccountErasureDatabaseRole(legacyAskAdmissionPool, erasurePool),
        assertPublicationDatabaseRoleSeparation(runtimePool, authorizationPool),
        assertPublicationCleanupDatabaseRole(publicationCleanupPool),
        assertContentProvisionDatabaseRole(runtimePool, contentProvisionPool),
        assertContentProvisionDatabaseRole(runtimePool, serverAskAdmissionPool)
      ])).resolves.toEqual([undefined, undefined, undefined, undefined, undefined, undefined]);
    } finally {
      await Promise.all(pools.map(async (pool) => pool.end()));
    }
  }, 120_000);
});
