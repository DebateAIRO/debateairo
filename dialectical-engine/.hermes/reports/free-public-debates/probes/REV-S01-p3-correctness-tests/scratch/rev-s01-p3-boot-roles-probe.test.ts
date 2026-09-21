// REV-S01-p3-correctness-tests — the reviewer's OWN L1 measurement, written against slice head
// 86b391a0. Built from the CLAIM ("the API would boot on a database migrated through 0071"),
// not from the FIX seat's test: it adds the two startup role assertions that live OUTSIDE
// main.ts's boot Promise.all (apps/api/src/main.ts:573-576), the raw privilege facts behind
// ERASURE_DATABASE_ROLE_MUST_BE_ISOLATED, and charge 2's two survival claims.
// Every connection is a REAL LOGIN principal from the development catalog; no superuser pool.
// TEMPORARY: deleted before the seat's handoff; the worktree ends byte-clean.
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertAccountErasureDatabaseRole,
  assertContentProvisionDatabaseRole,
  assertPublicationCleanupDatabaseRole,
  assertPublicationDatabaseRoleSeparation,
  assertSupportDatabaseRole,
  assertSupportKeyCoverage,
  createPool,
  migrate,
  type Pool
} from "@debateai/db";
import { provisionDevelopmentDatabasePrincipals } from "../../apps/runner/src/dev-database-principals.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

// apps/api/src/main.ts:123-131 (the boot Promise.all) plus :573-576 (support-attestation).
const ERASURE_FUNCTION_COUNT = 20;

let database: TestDatabase;
let secretRoot: string;
let credentials: ReadonlyMap<string, string>;
const opened: Pool[] = [];

function credential(key: string): string {
  const value = credentials.get(key);
  if (value === undefined) throw new TypeError(`REV_P3_CREDENTIAL_MISSING:${key}`);
  return value;
}

function principal(key: string): Pool {
  const pool = createPool(credential(key), { max: 1 });
  opened.push(pool);
  return pool;
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  secretRoot = await mkdtemp(join(tmpdir(), "rev-s01-p3-"));
  const credentialFilePath = join(secretRoot, "database-principals.env");
  await provisionDevelopmentDatabasePrincipals({
    adminPool: database.pool,
    adminDatabaseUrl: database.connectionString,
    credentialFilePath
  });
  credentials = new Map((await readFile(credentialFilePath, "utf8")).trim().split("\n")
    .map((line) => {
      const separator = line.indexOf("=");
      if (separator < 1) throw new TypeError("REV_P3_CREDENTIAL_LINE_INVALID");
      return [line.slice(0, separator), line.slice(separator + 1)] as [string, string];
    }));
}, 180_000);

afterAll(async () => {
  await Promise.all(opened.map(async (pool) => pool.end().catch(() => undefined)));
  await database?.stop();
  await rm(secretRoot, { recursive: true, force: true });
});

describe("REV(S01) p3 — L1: would the API boot on a database migrated through 0071?", () => {
  it("the erasure principal executes exactly the 20 erasure functions and NOT the bound predicate", async () => {
    // The raw fact behind ERASURE_DATABASE_ROLE_MUST_BE_ISOLATED
    // (packages/db/src/account-erasure.ts:13-33, the exactFunctionCount clause at :309).
    const erasure = principal("ERASURE_DATABASE_URL");
    const who = await erasure.query<{ principal: string }>("SELECT current_user AS principal");
    expect(who.rows[0]?.principal).not.toBe("postgres");
    const executable = await database.pool.query<{ count: string }>(`
      SELECT count(*)::text AS count
      FROM pg_catalog.pg_proc AS proc
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=proc.pronamespace
      WHERE namespace.nspname IN ('core','identity','serve')
        AND has_function_privilege('debateai_erasure_runtime',proc.oid,'EXECUTE')
    `);
    expect(executable.rows[0]?.count).toBe(String(ERASURE_FUNCTION_COUNT));
    const predicate = await database.pool.query<{ granted: boolean }>(`
      SELECT has_function_privilege(
        'debateai_erasure_runtime','core.run_is_free_public_bound(uuid)','EXECUTE'
      ) AS granted
    `);
    expect(predicate.rows[0]?.granted).toBe(false);
  }, 120_000);

  it("every role assertion on the API boot path resolves, including the two outside the Promise.all", async () => {
    const runtime = principal("DATABASE_URL");
    const authorization = principal("AUTHORIZATION_DATABASE_URL");
    const publicationCleanup = principal("PUBLICATION_CLEANUP_DATABASE_URL");
    const contentProvision = principal("CONTENT_PROVISION_DATABASE_URL");
    const serverAskAdmission = principal("CONTENT_PROVISION_DATABASE_URL");
    const legacyAskAdmission = principal("LIVENESS_DATABASE_URL");
    const erasure = principal("ERASURE_DATABASE_URL");
    const support = principal("SUPPORT_DATABASE_URL");
    // main.ts:122-131 — the boot Promise.all, every member.
    await expect(Promise.all([
      assertAccountErasureDatabaseRole(runtime, erasure),
      assertAccountErasureDatabaseRole(legacyAskAdmission, erasure),
      assertPublicationDatabaseRoleSeparation(runtime, authorization),
      assertPublicationCleanupDatabaseRole(publicationCleanup),
      assertContentProvisionDatabaseRole(runtime, contentProvision),
      assertContentProvisionDatabaseRole(runtime, serverAskAdmission)
    ])).resolves.toHaveLength(6);
    // main.ts:573-576 — startup.run("support-attestation"), which the boot also runs.
    await expect(assertSupportDatabaseRole(runtime, support)).resolves.toBeUndefined();
    await expect(assertSupportKeyCoverage(support)).resolves.toBeUndefined();
  }, 180_000);

  it("charge 2: the runtime principal still reads the bound predicate", async () => {
    const runtime = principal("DATABASE_URL");
    const granted = await runtime.query<{ granted: boolean }>(`
      SELECT has_function_privilege(
        'debateai_runtime','core.run_is_free_public_bound(uuid)','EXECUTE'
      ) AS granted
    `);
    expect(granted.rows[0]?.granted).toBe(true);
    const answered = await runtime.query<{ bound: boolean | null }>(
      "SELECT core.run_is_free_public_bound($1::uuid) AS bound", [randomUUID()]
    );
    expect(answered.rows[0]?.bound).toBeNull();
  }, 120_000);

  it("charge 2: the erasure principal still executes the SECURITY DEFINER erasure entry point", async () => {
    // core.prepare_private_run_erasure calls the predicate INSIDE a SECURITY DEFINER body,
    // so revoking the principal's direct EXECUTE must not close the delete path.
    const erasure = principal("ERASURE_DATABASE_URL");
    const outcome = await erasure.query<{ outcome: string }>(`
      SELECT outcome FROM core.prepare_private_run_erasure($1,$2,$3,$4,$5)
    `, [randomUUID(), randomUUID(), randomUUID(), randomUUID(), `sha256:${"0".repeat(64)}`]);
    // A run that exists nowhere is the opaque NOT_FOUND, which is the proof that the call
    // itself was permitted: a revoked EXECUTE raises SQLSTATE 42501 instead.
    expect(outcome.rows[0]?.outcome).toBe("NOT_FOUND");
    await expect(
      erasure.query("SELECT core.run_is_free_public_bound($1::uuid) AS bound", [randomUUID()])
    ).rejects.toMatchObject({ code: "42501" });
  }, 120_000);
});
