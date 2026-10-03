/**
 * S1a — the renamed migration applies last, after the Part 1–2 migrations and any
 * migration dev added, and one spend row keeps both new columns (dev's 0075
 * spend_phase and the scorecard's attempt_id, now added by 0090). The expected list
 * is read from the migrations directory, never written out by hand: dev's own
 * 0077_age_gate.sql and the colleague's reserved 0078_sensitive_data_consent.sql
 * moved the numbers once already (RULINGS-R3 R3-1), and 0078 may be present or not.
 * CI skips this directory: run it by hand before merging.
 */
import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresModelSpendStore } from "@debateai/budget";
import { migrate } from "@debateai/db";
import { createLegacyStoryRun } from "../support/storyEncryptedOwner.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 180_000);

afterAll(async () => {
  await database?.stop();
});

/** Dev's 0075 and every later file: the part of the list this merge can move. */
const fromDev0075 = (name: string): boolean => Number(name.slice(0, 4)) >= 75;

describe("S1a · 0090_model_scorecard.sql", () => {
  it("applies after every Part 1–2 migration, under its new name only", async () => {
    const onDisk = (await readdir(new URL("../../migrations/", import.meta.url)))
      .filter((name) => name.endsWith(".sql") && fromDev0075(name))
      .sort();
    const applied = (await database.pool.query<{ name: string }>("SELECT name FROM public.debateai_schema_migration"))
      .rows.map((row) => row.name)
      .filter(fromDev0075)
      .sort();
    // Every file from 0075 on is applied, and nothing else is: the Part 1–2 files and any file dev added.
    expect(applied).toEqual(onDisk);
    // The scorecard's file applies after every Part 1–2 file (0080-0089; RULINGS-R3 R3-1's number), and there is
    // exactly one of it. Files numbered after it (Part 2b's 0091 on) are later work and apply after it.
    const scorecardAt = applied.indexOf("0090_model_scorecard.sql");
    expect(scorecardAt).toBeGreaterThan(applied.indexOf("0089_billing_erasure_hook.sql"));
    expect(applied.indexOf("0089_billing_erasure_hook.sql")).toBeGreaterThanOrEqual(0);
    expect(applied.slice(scorecardAt + 1).every((name) => name.slice(0, 4) > "0090")).toBe(true);
    expect(applied.filter((name) => name.endsWith("_model_scorecard.sql"))).toEqual(["0090_model_scorecard.sql"]);
    const old = await database.pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM public.debateai_schema_migration WHERE name = '0072_model_scorecard.sql'"
    );
    expect(old.rows[0]?.n).toBe(0);
  });

  it("stores a RUN charge's phase and attempt in one row", async () => {
    const runId = await createLegacyStoryRun(database.pool, `s1a spend ${randomUUID()}`, `asker:${randomUUID()}`);
    const attemptId = randomUUID();
    await new PostgresModelSpendStore(database.pool).recordSpend({
      spendId: randomUUID(), spendSource: "RUN", runId, providerRef: "provider:s1a",
      chargedOn: new Date().toISOString().slice(0, 10), chargeMicros: 7, inputTokens: 3, outputTokens: 2,
      spendPhase: "SERVE", attemptId
    });
    const rows = await database.pool.query<{ spend_phase: string | null; attempt_id: string | null }>(
      "SELECT spend_phase, attempt_id::text AS attempt_id FROM ledger.model_spend WHERE run_id = $1", [runId]
    );
    expect(rows.rows).toEqual([{ spend_phase: "SERVE", attempt_id: attemptId }]);
  });
});
