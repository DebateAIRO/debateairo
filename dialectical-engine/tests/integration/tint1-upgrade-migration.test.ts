import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertContentProvisionDatabaseRole,
  createPool,
  migrate,
  type Pool
} from "../../packages/db/src/index.js";
import { provisionDevelopmentDatabasePrincipals } from "../../apps/runner/src/dev-database-principals.js";
import { applyMigrationSql, retiredUpgradeReason } from "../support/migrationReplay.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * TINT1 (codex r1 B1) — the forward migration that closes the PUBLIC-EXECUTE exposure.
 *
 * THE DEFECT. `0040_account_erasure.sql:6273` swept
 * `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA core FROM PUBLIC` — ONCE, at that
 * migration. PostgreSQL grants EXECUTE on every new function to PUBLIC by
 * default, so `core.reject_edge_mutation_except_measurement()`, minted by
 * `0052`, kept that grant. It became a SEVENTH core function inside the
 * content-provision role's reach, and `assertContentProvisionDatabaseRole`
 * requires EXACTLY the ruled provision signatures — so it threw
 * `CONTENT_PROVISION_DATABASE_ROLE_MUST_BE_ISOLATED` and took the nine-SCRAM
 * LOGIN test with it.
 *
 * WHY THE REPAIR CANNOT LIVE IN `0052`. The production migrator keys its ledger
 * on the file NAME and skips any name already recorded, so a database that had
 * already applied `0052` would never re-execute an amended `0052`. The revoke is
 * therefore a NEW forward migration, `0054`. Since merge 065708c19 the sealed
 * lineage recipe (`migrations/lineage/auth-dev-20261006.json`) also pins every
 * source's digest, so an amended `0052` would now stop `migrate()` outright.
 *
 * WHAT CHANGED ON 2026-10-10, AND WHY. Until then this fixture built a database
 * whose ledger stopped at `0052` and let the REAL `migrate()` continue from it.
 * Since merge 065708c19 (explicit migration lineage, on dev through PR #82)
 * `migrate()` continues only from an empty ledger, a named cohort or a complete
 * ledger, and refuses that one with UNKNOWN_MIXED_LINEAGE — by design
 * (tests/integration/auth-dev-lineage.test.ts). Every ledger it does continue
 * from already records `0054`, so the upgrade this fixture used to drive cannot
 * happen to any database any more; the first case below asserts both facts
 * instead of leaving them in this comment. What still ships, and is still
 * proven here, is `0054` itself: on a database `migrate()` finished, with the
 * exposure the landed `0052` left restored, `0054`'s own SQL (the exact bytes
 * `migrate()` runs) closes it, is idempotent, and removes nothing else.
 *
 * WHAT MAKES THIS FIXTURE DISCRIMINATING, and why it is not a re-implementation:
 *   - the verdict is the REAL `assertContentProvisionDatabaseRole` against the
 *     REAL eleven SCRAM LOGIN principals, so the assertion is the same attestation
 *     that failed in b7 — not a paraphrase of its counting SQL. Nothing here
 *     hardcodes the ruled function count; the attestation stays its own author;
 *   - the exposure is stated, not inherited (see seedTheDeployedExposure), so the
 *     attestation is shown FAILING before `0054` runs and passing after.
 */

const REVOKE = "0054_tint1_reject_edge_mutation_public_revoke.sql";
const GUARD = "core.reject_edge_mutation_except_measurement()";
const ISOLATION_FAILURE = "CONTENT_PROVISION_DATABASE_ROLE_MUST_BE_ISOLATED";

let database: TestDatabase | undefined;
let secretRoot: string | undefined;
let openPools: Pool[] = [];

afterEach(async () => {
  await Promise.all(openPools.map((pool) => pool.end().catch(() => undefined)));
  openPools = [];
  await database?.stop();
  database = undefined;
  if (secretRoot !== undefined) await rm(secretRoot, { recursive: true, force: true });
  secretRoot = undefined;
});

/**
 * States the premise of B1 explicitly: the privilege a `0052` that did NOT
 * revoke left behind. PostgreSQL grants EXECUTE on every newly created function
 * to PUBLIC, so this is precisely the state of every database that ran the
 * landed `0052` before `0054` existed.
 *
 * It is stated here rather than inherited from the working tree on purpose: a
 * fresh `migrate()` runs `0054` too, so without this line nothing would be left
 * for `0054` to close, and the cases below would pass against a `0054` that
 * revoked nothing.
 */
async function seedTheDeployedExposure(target: TestDatabase): Promise<void> {
  await target.pool.query(`GRANT EXECUTE ON FUNCTION ${GUARD} TO PUBLIC`);
}

/** A database `migrate()` finished, with the exposure the landed `0052` left restored. */
async function migratedWithTheDeployedExposure(): Promise<TestDatabase> {
  const target = await startTestDatabase();
  await migrate(target.pool);
  await seedTheDeployedExposure(target);
  return target;
}

/** The eleven SCRAM LOGIN principals, provisioned the way DEV-03 provisions them. */
async function provisionPrincipals(target: TestDatabase): Promise<ReadonlyMap<string, string>> {
  secretRoot = await mkdtemp(join(tmpdir(), "debateai-tint1-upgrade-"));
  const credentialFilePath = join(secretRoot, "database-principals.env");
  await provisionDevelopmentDatabasePrincipals({
    adminPool: target.pool,
    adminDatabaseUrl: target.connectionString,
    credentialFilePath
  });
  return new Map((await readFile(credentialFilePath, "utf8")).trim().split("\n").map((line) => {
    const separator = line.indexOf("=");
    if (separator < 1) throw new TypeError("TINT1_TEST_FIXTURE: credential line invalid");
    return [line.slice(0, separator), line.slice(separator + 1)] as const;
  }));
}

/** The real attestation, against the real LOGIN pools. Resolves, or throws its own error. */
async function attestContentProvisionIsolation(
  credentials: ReadonlyMap<string, string>
): Promise<void> {
  const runtimePool = createPool(credentials.get("DATABASE_URL")!);
  const contentPool = createPool(credentials.get("CONTENT_PROVISION_DATABASE_URL")!);
  openPools.push(runtimePool, contentPool);
  await assertContentProvisionDatabaseRole(runtimePool, contentPool);
}

async function publicMayExecuteGuard(target: TestDatabase): Promise<boolean> {
  const result = await target.pool.query<{ allowed: boolean }>(
    "SELECT has_function_privilege('public',$1,'EXECUTE') AS allowed", [GUARD]
  );
  return result.rows[0]!.allowed;
}

/** The population the attestation counts — reported so the mechanism is visible, never hardcoded. */
async function provisionExecutableCoreFunctions(target: TestDatabase): Promise<number> {
  const result = await target.pool.query<{ count: string }>(`
    SELECT count(*)::text AS count
      FROM pg_catalog.pg_proc AS procedure
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=procedure.pronamespace
     WHERE namespace.nspname='core'
       AND has_function_privilege('debateai_content_provision',procedure.oid,'EXECUTE')
  `);
  return Number(result.rows[0]!.count);
}

describe("TINT1 · the forward revoke closes the exposure every database that ran 0052 before it held", () => {
  it("finds the isolation attestation failing under that exposure, and 0054's own SQL closing it", async () => {
    database = await migratedWithTheDeployedExposure();

    // WHY THE UPGRADE ARM IS RETIRED, checked: migrate() refuses a ledger that
    // records 0052 but not 0054, and every ledger it continues from records 0054.
    expect(await retiredUpgradeReason(database.pool, [REVOKE])).toEqual({
      refusal: "MIGRATION_LINEAGE_REFUSED UNKNOWN_MIXED_LINEAGE", unrecorded: []
    });
    const credentials = await provisionPrincipals(database);

    // THE DEFECT, LIVE — mechanism and verdict.
    expect(await publicMayExecuteGuard(database)).toBe(true);
    const exposedFunctionCount = await provisionExecutableCoreFunctions(database);
    await expect(attestContentProvisionIsolation(credentials))
      .rejects.toThrow(ISOLATION_FAILURE);

    // THE REPAIR: 0054's own SQL, the bytes migrate() runs, committed.
    await applyMigrationSql(database.pool, [REVOKE]);

    // CLOSED. PUBLIC loses EXECUTE, exactly one core function leaves the
    // provision role's reach, and the attestation that threw now accepts.
    expect(await publicMayExecuteGuard(database)).toBe(false);
    expect(await provisionExecutableCoreFunctions(database)).toBe(exposedFunctionCount - 1);
    await expect(attestContentProvisionIsolation(credentials)).resolves.toBeUndefined();
  }, 240_000);

  it("is idempotent: re-running 0054's own SQL neither throws nor restores the grant", async () => {
    database = await migratedWithTheDeployedExposure();
    await applyMigrationSql(database.pool, [REVOKE]);

    // Run it again over its own end state. No ledger row is involved, so
    // nothing masks a throw: if the statement is not idempotent, this line fails.
    await expect(applyMigrationSql(database.pool, [REVOKE])).resolves.toBeUndefined();

    expect(await publicMayExecuteGuard(database)).toBe(false);
    const credentials = await provisionPrincipals(database);
    await expect(attestContentProvisionIsolation(credentials)).resolves.toBeUndefined();
  }, 240_000);

  it("removes a privilege and nothing else: the guard function and its trigger both survive", async () => {
    database = await migratedWithTheDeployedExposure();
    await applyMigrationSql(database.pool, [REVOKE]);

    // A "repair" that dropped the function (CASCADE would take the trigger with
    // it) would also satisfy the revoke assertions above. It must not. This is
    // an existence check on both objects, and that is all it claims to be.
    const surviving = await database.pool.query<{ functions: string; triggers: string }>(`
      SELECT
        (SELECT count(*)::text FROM pg_catalog.pg_proc AS procedure
           JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=procedure.pronamespace
          WHERE namespace.nspname='core'
            AND procedure.proname='reject_edge_mutation_except_measurement') AS functions,
        (SELECT count(*)::text FROM pg_catalog.pg_trigger
          WHERE tgrelid='core.edge'::regclass AND NOT tgisinternal
            AND tgname='reject_mutation_except_measurement') AS triggers
    `);
    expect(surviving.rows[0]).toEqual({ functions: "1", triggers: "1" });
    expect(await publicMayExecuteGuard(database)).toBe(false);
  }, 240_000);
});
