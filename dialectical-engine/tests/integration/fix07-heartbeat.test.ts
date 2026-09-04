import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { migrate } from "../../packages/db/src/index.js";
import {
  startTestDatabase,
  type TestDatabase,
} from "../support/testDatabase.js";

vi.mock("@debateai/kernel", async () =>
  import("../../packages/kernel/src/index.js"),
);
vi.mock("@debateai/crypto", async () =>
  import("../../packages/crypto/src/index.js"),
);
vi.mock("@debateai/db", async () =>
  import("../../packages/db/src/index.js"),
);
vi.mock("@debateai/register", async () =>
  import("../../packages/register/src/index.js"),
);

const WRITER_PASSWORD = "writer-fix07-c1-only";

const HEALTH_UPSERT = `
  INSERT INTO obs.component_health (component, state, observed_at, detail_code)
  VALUES ($1, $2, clock_timestamp(), $3)
  ON CONFLICT (component) DO UPDATE SET
    state = $2,
    observed_at = clock_timestamp(),
    detail_code = $3,
    updated_at = clock_timestamp()
`;

let database: TestDatabase;

function writerConnectionString(): string {
  const url = new URL(database.connectionString);
  url.username = "debateai_obs_writer";
  url.password = WRITER_PASSWORD;
  return url.toString();
}

async function connectedWriter(): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: writerConnectionString() });
  await client.connect();
  return client;
}

beforeAll(async () => {
  database = await startTestDatabase();
  await database.pool.query(
    "SELECT set_config('debateai.obs_writer_password', $1, false)",
    [WRITER_PASSWORD],
  );
  await migrate(database.pool);
}, 120_000);

afterAll(async () => {
  await database?.stop();
});

describe.sequential("FIX-07 C1 replica-safe capture lease grants", () => {
  it("lets authenticated replica writers refresh one lease in conflict-lock order", async () => {
    const writerA = await connectedWriter();
    const writerB = await connectedWriter();
    try {
      await writerA.query(HEALTH_UPSERT, [
        "capture:runner",
        "ARMED",
        "FLUSH_OK",
      ]);
      const initial = await database.pool.query<{ observed_at: Date }>(
        `SELECT observed_at
           FROM obs.component_health
          WHERE component = 'capture:runner'`,
      );

      await writerA.query("BEGIN");
      await writerA.query(HEALTH_UPSERT, [
        "capture:runner",
        "SPOOL_ONLY",
        "POSTGRES_FAILURE",
      ]);

      let writerBSettled = false;
      const writerBUpsert = writerB.query(HEALTH_UPSERT, [
        "capture:runner",
        "ARMED",
        "FLUSH_OK",
      ]).finally(() => {
        writerBSettled = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 25));
      expect(writerBSettled).toBe(false);

      await writerA.query("COMMIT");
      await writerBUpsert;

      const final = await database.pool.query<{
        state: string;
        detail_code: string;
        observed_at: Date;
      }>(
        `SELECT state, detail_code, observed_at
           FROM obs.component_health
          WHERE component = 'capture:runner'`,
      );
      expect(final.rows).toEqual([{
        state: "ARMED",
        detail_code: "FLUSH_OK",
        observed_at: expect.any(Date),
      }]);
      expect(final.rows[0]!.observed_at.getTime())
        .toBeGreaterThan(initial.rows[0]!.observed_at.getTime());
    } finally {
      await writerA.query("ROLLBACK").catch(() => undefined);
      await Promise.allSettled([writerA.end(), writerB.end()]);
    }
  });

  it("grants only the columns needed by conflict arbitration and the update", async () => {
    const privileges = await database.pool.query<{
      table_insert: boolean;
      table_select: boolean;
      table_update: boolean;
      table_delete: boolean;
      table_truncate: boolean;
      component_insert: boolean;
      component_select: boolean;
      component_update: boolean;
      state_select: boolean;
      state_update: boolean;
      updated_at_insert: boolean;
      updated_at_update: boolean;
    }>(`
      SELECT
        has_table_privilege('debateai_obs_writer', 'obs.component_health', 'INSERT') AS table_insert,
        has_table_privilege('debateai_obs_writer', 'obs.component_health', 'SELECT') AS table_select,
        has_table_privilege('debateai_obs_writer', 'obs.component_health', 'UPDATE') AS table_update,
        has_table_privilege('debateai_obs_writer', 'obs.component_health', 'DELETE') AS table_delete,
        has_table_privilege('debateai_obs_writer', 'obs.component_health', 'TRUNCATE') AS table_truncate,
        has_column_privilege('debateai_obs_writer', 'obs.component_health', 'component', 'INSERT') AS component_insert,
        has_column_privilege('debateai_obs_writer', 'obs.component_health', 'component', 'SELECT') AS component_select,
        has_column_privilege('debateai_obs_writer', 'obs.component_health', 'component', 'UPDATE') AS component_update,
        has_column_privilege('debateai_obs_writer', 'obs.component_health', 'state', 'SELECT') AS state_select,
        has_column_privilege('debateai_obs_writer', 'obs.component_health', 'state', 'UPDATE') AS state_update,
        has_column_privilege('debateai_obs_writer', 'obs.component_health', 'updated_at', 'INSERT') AS updated_at_insert,
        has_column_privilege('debateai_obs_writer', 'obs.component_health', 'updated_at', 'UPDATE') AS updated_at_update
    `);
    expect(privileges.rows).toEqual([{
      table_insert: false,
      table_select: false,
      table_update: false,
      table_delete: false,
      table_truncate: false,
      component_insert: true,
      component_select: true,
      component_update: false,
      state_select: false,
      state_update: true,
      updated_at_insert: false,
      updated_at_update: true,
    }]);
  });

  it("keeps state reads and component updates unavailable to the writer", async () => {
    const writer = await connectedWriter();
    try {
      await expect(writer.query(
        "SELECT state FROM obs.component_health LIMIT 1",
      )).rejects.toMatchObject({ code: "42501" });
      await expect(writer.query(
        "UPDATE obs.component_health SET component = component WHERE false",
      )).rejects.toMatchObject({ code: "42501" });
    } finally {
      await writer.end();
    }
  });
});
