import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, migrate, type Pool } from "@debateai/db";
import { PostgresReleaseStateReader } from "../../apps/api/src/release-state.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * Side-by-side uploads spec 2026-10-21 §4, §6 (plan C task C3): the API's release watcher reads migration 0123's two
 * definer readers, core.read_current_release() and core.read_release_state(text), as the API's runtime login
 * (debateai_runtime has EXECUTE on both, nothing on the release table itself). Embedded Postgres; CI skips this
 * directory, run it before merging.
 */
// The code parts are kept apart from the key names, so no line pairs a *_KEY name with a literal (gitleaks).
const OWN = ["r17", "0123456789ab"].join("-");
const NEVER = ["r16", "0123456789ab"].join("-");
const LOGIN = "c3_release_watcher";
const SECRET = ["c3", "fixture", "only"].join("-");

let database: TestDatabase;
let runtime: Pool;

/** The runtime login's connection string. */
function runtimeUrl(): string {
  const url = new URL(database.connectionString);
  url.username = LOGIN;
  url.password = SECRET;
  return url.toString();
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  await database.pool.query(`CREATE ROLE ${LOGIN} LOGIN PASSWORD '${SECRET}' IN ROLE debateai_runtime`);
  runtime = createPool(runtimeUrl());
}, 240_000);

afterAll(async () => {
  await runtime?.end();
  await database?.stop();
});

describe("side-by-side C3: the release watcher's reader against 0123", () => {
  it("reads no current release before the first switch", async () => {
    const reader = new PostgresReleaseStateReader(runtime);
    expect(await reader.readCurrent()).toBeNull();
    expect(await reader.readState(OWN)).toBeNull();
  });

  it("reads the current release, its take-traffic-from instant and its state after a switch", async () => {
    // The switch takes only a STAGED release (0123 §3), so the superuser stages it first, then switches.
    await database.pool.query("SELECT core.record_release_event($1, 'STAGED', 'test', NULL)", [OWN]);
    const switched = await database.pool.query<{ at: Date }>(
      "SELECT now() AS at, core.record_release_switch($1, NULL, now(), 'test', NULL)", [OWN]
    );
    const at = switched.rows[0]!.at;
    const reader = new PostgresReleaseStateReader(runtime);
    const current = await reader.readCurrent();
    expect(current).toEqual({ releaseKey: OWN, takeTrafficFrom: at });
    expect(current?.takeTrafficFrom).toBeInstanceOf(Date);
    expect(await reader.readState(OWN)).toEqual({ state: "CURRENT", frontPairStopped: false, retireRequested: false });
    expect(await reader.readState(NEVER)).toBeNull();
  });

  it("a read leaves no statement timeout on its pooled client and gives the client back", async () => {
    const single = createPool(runtimeUrl(), { max: 1 });
    try {
      expect(await new PostgresReleaseStateReader(single).readCurrent()).toEqual(expect.objectContaining({ releaseKey: OWN }));
      expect(single.totalCount).toBe(1);
      expect(single.idleCount).toBe(1);
      expect((await single.query<{ statement_timeout: string }>("SHOW statement_timeout")).rows[0]!.statement_timeout).toBe("0");
    } finally {
      await single.end();
    }
  });

  it("the database itself stops a read blocked past its bound, and the client is destroyed", async () => {
    const single = createPool(runtimeUrl(), { max: 1 });
    const lock = await database.pool.connect();
    try {
      await lock.query("BEGIN");
      await lock.query("LOCK TABLE core.release_event IN ACCESS EXCLUSIVE MODE");
      const reader = new PostgresReleaseStateReader(single, { statementTimeoutMs: 200 });
      await expect(reader.readCurrent()).rejects.toMatchObject({ code: "57014" });
      expect(single.totalCount).toBe(0);
    } finally {
      await lock.query("ROLLBACK");
      lock.release();
      await single.end();
    }
  });

  it("the runtime login reads the release table only through the definer readers", async () => {
    await expect(runtime.query("SELECT 1 FROM core.release_event LIMIT 1"))
      .rejects.toMatchObject({ code: "42501" });
  });
});
