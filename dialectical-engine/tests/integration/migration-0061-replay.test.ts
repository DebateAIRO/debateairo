import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "../../packages/db/src/index.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * CONT-T6 fix round 1 — `migrations/0061_algorithm_publication_profiles.sql` is
 * replayable as a whole file, not only in its function.
 *
 * The source audit's replay-safety rule reads DDL keywords: it has a
 * `CREATE FUNCTION` member and no `CREATE TRIGGER` member
 * (`tools/orphan-audit/src/index.ts:576-596`). So making `0061`'s function
 * `CREATE OR REPLACE` turned the audit green while the file was still not
 * replayable — the bare `CREATE TRIGGER` at its end raises
 * `trigger "…" for relation "…" already exists` on the second application. An
 * audit row is a statement about the rule's vocabulary; only running the file
 * twice is a statement about the file.
 *
 * Every other trigger-creating migration in this repo drops first
 * (`0002_s02.sql:73`, `0003_s03.sql:89`, `0013_s10.sql:81`, `0019`, `0037`,
 * `0044`, `0045`, `0046`, and `0057` via `EXECUTE format`). `0061` was the only
 * bare one in `migrations/`.
 *
 * The fixture models the state that discriminates: a database that has ALREADY
 * applied `0061` through the real `migrate()`, which then sees the file again.
 * `applySqlOnly` writes no ledger row, because the ledger is exactly what
 * normally hides the question — the production migrator skips a recorded name
 * (`packages/db/src/index.ts:730-732`), so a non-replayable file is silent until
 * something replays it: a restore, a branch database, a squashed chain.
 */

const MIGRATIONS = new URL("../../migrations/", import.meta.url);
const MIGRATION = "0061_algorithm_publication_profiles.sql";
const TRIGGER = "register_version_algorithm_profile_guard";
const TABLE = "register.register_version";

let database: TestDatabase | undefined;

afterEach(async () => {
  await database?.stop();
  database = undefined;
});

/** Runs one migration's SQL and nothing else — no ledger row. This is the replay. */
async function applySqlOnly(target: TestDatabase, name: string): Promise<void> {
  await target.pool.query(await readFile(new URL(name, MIGRATIONS), "utf8"));
}

async function profileGuardTriggerCount(target: TestDatabase): Promise<number> {
  const result = await target.pool.query<{ count: string }>(`
    SELECT count(*)::text AS count
      FROM pg_catalog.pg_trigger
     WHERE tgrelid='${TABLE}'::regclass
       AND NOT tgisinternal
       AND tgname='${TRIGGER}'
  `);
  return Number(result.rows[0]?.count);
}

describe("CONT-T6 · migrations/0061 is replayable", () => {
  // PROPERTY: applying 0061 a second time against a database that already
  // carries it SUCCEEDS, and leaves exactly ONE trigger of that name on that
  // table. The count is asserted before the replay as well — an instrument that
  // cannot see the trigger in the known-good state cannot be trusted to report
  // on it afterwards, and "0" twice would otherwise read as a clean replay.
  it("applies 0061 twice and leaves exactly one profile-guard trigger", async () => {
    database = await startTestDatabase();
    await migrate(database.pool);
    expect(await profileGuardTriggerCount(database)).toBe(1);

    await expect(applySqlOnly(database, MIGRATION)).resolves.toBeUndefined();

    expect(await profileGuardTriggerCount(database)).toBe(1);
  }, 240_000);
});
