import type { Pool, PoolClient } from "pg";
import { identifyLineage, loadMigrationPlan, type MigrationPlan } from "../../packages/db/src/migration-lineage.js";

/**
 * Replaying one migration on a database that migrate() has already taken to the end of the chain.
 *
 * Since merge 065708c19 (explicit migration lineage, on dev through PR #82) migrate() continues only from an empty
 * ledger, a named cohort (migrations/lineage/auth-dev-20261006.json) or a complete ledger, and refuses every other
 * ledger with MIGRATION_LINEAGE_REFUSED UNKNOWN_MIXED_LINEAGE — by design (tests/integration/auth-dev-lineage.test.ts).
 * Tests that used to delete a ledger row and call migrate() to "replay" a migration run that migration's own SQL
 * instead: the exact bytes migrate() runs, taken from loadMigrationPlan() so their recorded digests are checked, on
 * the migrated database. Nothing here reads or writes a ledger row except retiredUpgradeReason, which only reads.
 */

let cachedPlan: Promise<MigrationPlan> | undefined;
const migrationPlan = (): Promise<MigrationPlan> => cachedPlan ??= loadMigrationPlan();

/** The SQL migrate() runs for `name` on a fresh database. Throws for a name the plan does not run as plain SQL. */
export async function migrationSql(name: string): Promise<string> {
  const plan = await migrationPlan();
  const source = plan.sources.get(name);
  if (source === undefined || plan.manifest.transactionBodies.some(({ logicalName }) => logicalName === name)) {
    throw new Error(`MIGRATION_REPLAY_SOURCE_UNSUPPORTED ${name}`);
  }
  return source.sql;
}

/**
 * Runs `name`'s own SQL in one transaction that is ALWAYS rolled back. `before` sets up the drift the migration should
 * refuse; `after` inspects its end state while that is still visible. Returns "APPLIED", or the message the migration
 * raised. An error thrown by `before` or `after` propagates.
 */
export async function replayMigrationRolledBack(pool: Pool, name: string, steps: Readonly<{
  before?: (client: PoolClient) => Promise<unknown>;
  after?: (client: PoolClient) => Promise<unknown>;
}> = {}): Promise<string> {
  const sql = await migrationSql(name);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await steps.before?.(client);
    try {
      await client.query(sql);
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
    await steps.after?.(client);
    return "APPLIED";
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
}

/**
 * Runs the named migrations' own SQL in the plan's order, in one transaction that COMMITS, as migrate() would run them.
 * For a fixture whose later checks need other connections to see the result. `before` runs first in the same
 * transaction. The ledger is not touched: each name stays recorded exactly once.
 */
export async function applyMigrationSql(pool: Pool, names: readonly string[],
  before?: (client: PoolClient) => Promise<unknown>): Promise<void> {
  const order = (await migrationPlan()).manifest.order;
  const sqls: string[] = [];
  for (const name of [...names].sort((left, right) => order.indexOf(left) - order.indexOf(right))) {
    sqls.push(await migrationSql(name));
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await before?.(client);
    for (const sql of sqls) await client.query(sql);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Why an "upgrade from an older ledger" arm can no longer happen, as a checked fact rather than a comment.
 * `refusal`: what migrate()'s own lineage check (identifyLineage) says about this database's ledger with `names`
 * removed. `unrecorded`: each named cohort, and the complete ledger, that does NOT already record one of `names` —
 * the non-empty ledgers migrate() continues from. Expect the lineage refusal and an empty list: then every database
 * migrate() still accepts has applied `names` already, or will apply them from an empty ledger.
 */
export async function retiredUpgradeReason(pool: Pool, names: readonly string[]): Promise<Readonly<{
  refusal: string;
  unrecorded: readonly string[];
}>> {
  const plan = await migrationPlan();
  const ledger = (await pool.query<{ name: string }>(
    "SELECT name FROM public.debateai_schema_migration ORDER BY name"
  )).rows.map(({ name }) => name);
  const resolutions = (await pool.query<{ logical_name: string }>(
    "SELECT logical_name FROM public.debateai_schema_migration_resolution ORDER BY logical_name"
  )).rows.map(({ logical_name }) => logical_name);
  if (names.some((name) => !ledger.includes(name))) throw new Error("MIGRATION_REPLAY_LEDGER_LACKS_NAME");
  let refusal = "ADMITTED";
  try {
    identifyLineage(plan, ledger.filter((name) => !names.includes(name)), resolutions);
  } catch (error) {
    refusal = error instanceof Error ? error.message : String(error);
  }
  const ledgers: ReadonlyArray<readonly [string, readonly string[]]> =
    [...Object.entries(plan.manifest.cohorts), ["complete", plan.manifest.order]];
  const unrecorded = ledgers.flatMap(([ledgerName, recorded]) =>
    names.filter((name) => !recorded.includes(name)).map((name) => `${ledgerName}:${name}`));
  return { refusal, unrecorded };
}
