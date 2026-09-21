import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
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
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * TINT1 (codex r1 B1) — the UPGRADE transition for the PUBLIC-EXECUTE revoke.
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
 * on the file NAME and skips any name already recorded
 * (`packages/db/src/index.ts:730-732`). A database that already applied `0052` —
 * which is every database carrying T5 — would never re-execute that file, so an
 * amendment to it is INERT exactly where the exposure lives. The revoke is
 * therefore a NEW forward migration, and this fixture proves it on the only
 * database state that discriminates: one whose ledger ALREADY RECORDS `0052`.
 *
 * WHAT MAKES THIS FIXTURE DISCRIMINATING, and why it is not a re-implementation:
 *   - the continuation is the REAL `migrate()`, not a local copy of it, so the
 *     name-keyed skip that makes an amendment inert is the code under test;
 *   - the verdict is the REAL `assertContentProvisionDatabaseRole` against the
 *     REAL eleven SCRAM LOGIN principals, so the assertion is the same attestation
 *     that failed in b7 — not a paraphrase of its counting SQL. Nothing here
 *     hardcodes the ruled function count; the attestation stays its own author.
 *
 * `0054` and not `0053`: T6's lane holds `0053_t06_review_outcome_disclosure.sql`
 * (commit `b479f7e`, unlanded at this base). Codex's static review correctly saw
 * `0053` as the next free number from `7433be7` alone; the fleet's next free
 * number is `0054`.
 */

const MIGRATIONS = new URL("../../migrations/", import.meta.url);
const THROUGH = "0052_t5_reviewer_measured_edges.sql";
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

async function migrationNames(): Promise<readonly string[]> {
  return (await readdir(MIGRATIONS)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
}

/**
 * Builds the database state that B1 is about: every migration THROUGH `through`
 * applied AND recorded, exactly as the production migrator records them. The
 * ledger rows are the point — they are what makes the migrator skip those files
 * forever after.
 */
async function applyThrough(target: TestDatabase, through: string): Promise<void> {
  const names = await migrationNames();
  const cutoff = names.indexOf(through);
  if (cutoff === -1) throw new Error(`TINT1_TEST_FIXTURE: unknown migration ${through}`);
  const client = await target.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.debateai_schema_migration (
        name text PRIMARY KEY CHECK (length(btrim(name)) > 0),
        applied_at timestamptz NOT NULL
      )
    `);
    for (const name of names.slice(0, cutoff + 1)) {
      await client.query(await readFile(new URL(name, MIGRATIONS), "utf8"));
      await client.query(
        "INSERT INTO public.debateai_schema_migration (name, applied_at) VALUES ($1, statement_timestamp())",
        [name]
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Runs one migration's SQL and nothing else — no ledger row. Used to re-run 0054. */
async function applySqlOnly(target: TestDatabase, name: string): Promise<void> {
  await target.pool.query(await readFile(new URL(name, MIGRATIONS), "utf8"));
}

/**
 * States the premise of B1 explicitly: a database that ran a `0052` which did
 * NOT revoke. PostgreSQL grants EXECUTE on every newly created function to
 * PUBLIC, so this is precisely the privilege state the LANDED `0052` left
 * behind — and every deployed database carrying T5 is in it.
 *
 * It is stated here rather than inherited from the working tree on purpose. The
 * defect B1 names lives in a DEPLOYED database, whose privileges were fixed by
 * the bytes it ran months ago; editing `0052` in the tree cannot reach back and
 * change them. Deriving the premise from the tree's current `0052` would make
 * this arm silently stop testing the upgrade the moment someone amended that
 * file — which is the very repair B1 rejects.
 */
async function seedTheDeployedExposure(target: TestDatabase): Promise<void> {
  await target.pool.query(`GRANT EXECUTE ON FUNCTION ${GUARD} TO PUBLIC`);
}

/**
 * The one capability role whose CREATE lands ABOVE the `THROUGH` cutoff.
 *
 * `assertCapabilityRoles` (`apps/runner/src/dev-database-principals.ts:405-413`)
 * requires every capability role in `DEVELOPMENT_DATABASE_PRINCIPALS` to exist
 * before it provisions the LOGIN principals. Two support capability roles are in
 * that table, and only one of them is reachable from this arm's premise:
 *
 *   - `debateai_support` — `migrations/0050_support_foundation.sql:10`,
 *     `CREATE ROLE debateai_support NOLOGIN NOINHERIT`. `0050_support_*` sorts
 *     BELOW `0052_t5_reviewer_measured_edges.sql`, so `applyThrough` already ran
 *     it and this fixture must not touch it.
 *   - `debateai_support_config_operator` — `migrations/0055_register_support_publication.sql:19`,
 *     `CREATE ROLE debateai_support_config_operator NOLOGIN NOINHERIT`. `0055`
 *     sorts ABOVE the cutoff, so the 0052-recorded state this arm exists to stand
 *     on cannot have it, and the provisioner throws
 *     `DEV_DATABASE_CAPABILITY_ROLES_INVALID` before the attestation is ever reached.
 *
 * It is created here with exactly 0055's attributes and NOTHING else: no grant, no
 * membership in either direction, no privilege on `GUARD`. That is the least
 * privilege 0055 itself enforces — `:21-31` raises `SUPPORT_CONFIG_ROLE_INVALID`
 * on LOGIN/INHERIT/SUPERUSER/CREATEROLE/CREATEDB/REPLICATION/BYPASSRLS, `:32-41`
 * on any membership, `:42-55` on `debateai_runtime`/`debateai_replay`/`debateai_support`
 * being a member of it — so nothing about the privilege state this arm measures moves.
 *
 * A bare CREATE, not `IF NOT EXISTS`, on purpose: if `0055` ever sorts below the
 * cutoff, this line fails loudly instead of silently pinning nothing.
 */
async function createPostCutoffCapabilityRole(target: TestDatabase): Promise<void> {
  await target.pool.query("CREATE ROLE debateai_support_config_operator NOLOGIN NOINHERIT");
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

async function ledgerRecords(target: TestDatabase, name: string): Promise<boolean> {
  const result = await target.pool.query(
    "SELECT 1 FROM public.debateai_schema_migration WHERE name=$1", [name]
  );
  return result.rowCount === 1;
}

describe("TINT1 · the forward revoke reaches a database that ALREADY applied 0052", () => {
  it("finds the isolation attestation failing on the 0052-recorded state, and the production migrator closing it", async () => {
    database = await startTestDatabase();
    await applyThrough(database, THROUGH);
    await seedTheDeployedExposure(database);
    await createPostCutoffCapabilityRole(database);
    const credentials = await provisionPrincipals(database);

    // THE PREMISE. This ledger already records 0052, so the production migrator
    // will never re-run that file: an amendment to it could not execute here.
    expect(await ledgerRecords(database, THROUGH)).toBe(true);

    // THE DEFECT, LIVE — mechanism and verdict, on the upgrade state.
    expect(await publicMayExecuteGuard(database)).toBe(true);
    const exposedFunctionCount = await provisionExecutableCoreFunctions(database);
    await expect(attestContentProvisionIsolation(credentials))
      .rejects.toThrow(ISOLATION_FAILURE);

    // THE REPAIR: the production migrator itself, continuing from that ledger.
    await migrate(database.pool);

    // CLOSED. PUBLIC loses EXECUTE, exactly one core function leaves the
    // provision role's reach, and the attestation that threw now accepts.
    //
    // These come BEFORE the ledger check on purpose. A tree carrying no forward
    // revoke makes the migrator apply nothing, and the failure must then be a
    // VALUE — the privilege still held, the seventh function still reachable,
    // the attestation still throwing — not "a file is missing". A fixture that
    // tripped on the filename first would report the same RED for a typo in the
    // migration's name as for a repair that never reached the database.
    expect(await publicMayExecuteGuard(database)).toBe(false);
    expect(await provisionExecutableCoreFunctions(database)).toBe(exposedFunctionCount - 1);
    await expect(attestContentProvisionIsolation(credentials)).resolves.toBeUndefined();

    // Corroboration, last: the migrator recorded the forward migration it ran.
    expect(await ledgerRecords(database, REVOKE)).toBe(true);
  }, 240_000);

  it("is idempotent: re-running 0054's own SQL neither throws nor restores the grant", async () => {
    database = await startTestDatabase();
    await applyThrough(database, THROUGH);
    await seedTheDeployedExposure(database);
    await migrate(database.pool);

    // Re-run the migration's SQL directly. No ledger row is written, so nothing
    // masks a throw: if the statement is not idempotent, this line fails.
    await expect(applySqlOnly(database, REVOKE)).resolves.toBeUndefined();

    expect(await publicMayExecuteGuard(database)).toBe(false);
    const credentials = await provisionPrincipals(database);
    await expect(attestContentProvisionIsolation(credentials)).resolves.toBeUndefined();
  }, 240_000);

  it("removes a privilege and nothing else: the guard function and its trigger both survive", async () => {
    database = await startTestDatabase();
    await applyThrough(database, THROUGH);
    await seedTheDeployedExposure(database);
    await migrate(database.pool);

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
  }, 240_000);
});
