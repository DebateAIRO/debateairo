import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { CostEnvelopeGuard, PostgresModelSpendStore } from "@debateai/budget";
import { createPool, migrate } from "@debateai/db";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { staleReadyDayAdmission, type RunnerVersionSettings } from "../../apps/runner/src/run-settings.js";

/**
 * NV-25 (security audit run 3), over embedded Postgres: each stale-READY re-send of a hosted runner is first admitted
 * again by the run's own version's daily guard, the API's rule, advisory lock, 30-minute reservation and amount. Connected
 * as a principal with exactly the live runner principal's one membership (debateai_runtime), so the reservation written
 * here is one the runner may really write; a REACHED day writes none. CI skips this directory; run it before merging.
 */
let database: TestDatabase;
let runtime: Pool;

// A fixed instant far from every other test's day: only this file's reservations are on it.
const DAY = new Date("2034-05-06T12:00:00.000Z");
const RESERVED_ON = "2034-05-06";

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  await database.pool.query("CREATE ROLE stale_ready_runtime LOGIN PASSWORD 'stale-ready-private-fixture-only' IN ROLE debateai_runtime");
  const url = new URL(database.connectionString);
  url.username = "stale_ready_runtime";
  url.password = "stale-ready-private-fixture-only";
  runtime = createPool(url.toString());
}, 600_000);

afterAll(async () => {
  await runtime?.end();
  await database?.stop();
});

describe("a stale-READY re-send is admitted by the site's day again (NV-25)", () => {
  it("admits while the day has room, one reservation of the run maximum each, and writes none once it is reached", async () => {
    const policy = { perRunCeilingMicros: 1_000, dailyCeilingMicros: 3_000 };
    const guard = new CostEnvelopeGuard({ store: new PostgresModelSpendStore(runtime), policy, clock: () => DAY });
    const admit = staleReadyDayAdmission({
      cache: {
        settingsFor: async () => ({
          kind: "SETTINGS" as const,
          version: { costEnvelope: { policy, guard } } as unknown as RunnerVersionSettings
        })
      },
      hosted: true
    });

    const answers: boolean[] = [];
    for (let attempt = 0; attempt < 4; attempt += 1) answers.push(await admit({ registerVersion: 1 }));
    expect(answers).toEqual([true, true, true, false]);

    const reserved = await database.pool.query<{ reserved_micros: string }>(
      `SELECT reserved_micros::text AS reserved_micros FROM ledger.model_spend_reservation
       WHERE reserved_on = $1::date ORDER BY opened_at, reservation_id`,
      [RESERVED_ON]
    );
    expect(reserved.rows).toEqual([
      { reserved_micros: "1000" }, { reserved_micros: "1000" }, { reserved_micros: "1000" }
    ]);
  });
});
