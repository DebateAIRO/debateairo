import { readFile } from "node:fs/promises";
import type { Pool } from "pg";

// Upgrade fixtures replay the AUTH branch's own historical chain. Since the dev merge (065708c19)
// migrations/ also holds dev's billing/legal files, so "every file that sorts before X" is no longer
// that chain: it picks up dev's 0085_billing_* … 0094_legal_* and migrate() then refuses the mixed
// set (MIGRATION_LINEAGE_REFUSED UNKNOWN_MIXED_LINEAGE). The lineage manifest records the exact
// auth-branch cohort a deployed auth database holds (`auth94`), so the fixtures read it from there.
const MANIFEST = new URL("../../migrations/lineage/auth-dev-20261006.json", import.meta.url);

export async function authBranchCohort(): Promise<readonly string[]> {
  const manifest = JSON.parse(await readFile(MANIFEST, "utf8")) as { cohorts?: Record<string, unknown> };
  const cohort = manifest.cohorts?.auth94;
  if (!Array.isArray(cohort) || cohort.some((name) => typeof name !== "string")) throw new Error("AUTH_BRANCH_COHORT_MISSING");
  return Object.freeze([...(cohort as string[])].sort());
}

/** The auth branch's migrations that ran before `name`, in file order. */
export async function authBranchMigrationsBefore(name: string): Promise<readonly string[]> {
  const cohort = await authBranchCohort();
  if (!cohort.includes(name)) throw new Error(`AUTH_BRANCH_COHORT_LACKS ${name}`);
  return cohort.filter((file) => file < name);
}

/** Apply raw migration files and record them the way migrate() does, so lineage sees the cohort. */
export async function applyRecordedMigrations(pool: Pool, names: readonly string[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const name of names) {
      await client.query(await readFile(new URL(`../../migrations/${name}`, import.meta.url), "utf8"));
      await client.query("INSERT INTO public.debateai_schema_migration VALUES($1,statement_timestamp())", [name]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
