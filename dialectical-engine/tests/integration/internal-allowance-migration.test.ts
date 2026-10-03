import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { afterAll, beforeAll, expect, it } from "vitest";
import { EntitlementRepository, RunRepository, migrate } from "@debateai/db";
import { fixtureDiscoveredPanel, fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
let database: TestDatabase;
beforeAll(async () => { database = await startTestDatabase(); }, 120000);
afterAll(async () => { await database?.stop(); });
it("preserves original charge bytes and mutation/truncate guards across additive0092 and recorded replay", async () => {
  const historical = (await readdir("migrations")).filter(name => /^\d+.*\.sql$/u.test(name) && name < "0092_internal_funded_allowance.sql").sort();
  expect(historical).toHaveLength(99);
  const client = await database.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("CREATE TABLE public.debateai_schema_migration(name text PRIMARY KEY CHECK(length(btrim(name))>0),applied_at timestamptz NOT NULL)");
    for (const name of historical) {
      await client.query(await readFile("migrations/" + name, "utf8"));
      await client.query("INSERT INTO public.debateai_schema_migration VALUES($1,statement_timestamp())", [name]);
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  const runId = await new RunRepository(database.pool).startRun({ questionLine: "synthetic historical scope", principal: { kind: "legacy", legacyAskerId: "test:" + randomUUID() },
    sessionId: randomUUID(), callerScope: "ASKER", asOf: new Date(), askerRiskTier: "casual", effectiveRiskTier: "casual", tierSource: "ASKER", tierProvenanceRef: "test:historical",
    compositionBudgetTier: "low", depthParams: { depth: 1 }, discoveredPanel: fixtureDiscoveredPanel(1), strangerSampleRate: 0,
    envelopeBasis: fixtureStructuralCeiling(4), registerVersion: 1, batteryVersion: "test", askContract: {}, batteryRows: [] });
  const ownerRef = randomUUID(), eventId = randomUUID(), admittedAt = new Date();
  const writer = await database.pool.connect();
  try { await new EntitlementRepository(database.pool).recordRunChargeScope(writer, { runId, ownerRef, planId: "PLUS", entitlementEventId: eventId, admittedAt }); }
  finally { writer.release(); }
  const bytes = async () => (await database.pool.query("SELECT row_to_json(original)::text AS bytes FROM (SELECT run_id,owner_ref,plan_id,entitlement_event_id,admitted_at,recorded_at FROM billing.run_charge_scope WHERE run_id=$1) original", [runId])).rows;
  const guards = async (names: string[] | null = null) => (await database.pool.query("SELECT tgname,tgenabled,pg_get_triggerdef(oid) AS definition FROM pg_trigger WHERE tgrelid='billing.run_charge_scope'::regclass AND ($1::text[] IS NULL OR tgname=ANY($1::text[])) ORDER BY tgname", [names])).rows;
  const beforeBytes = await bytes(), beforeGuards = await guards();
  await migrate(database.pool);
  expect(await bytes()).toEqual(beforeBytes);
  expect(await guards(beforeGuards.map(row => row.tgname as string))).toEqual(beforeGuards);
  const repository = new EntitlementRepository(database.pool);
  expect(await repository.readRunFundingBasis(runId)).toEqual({ kind: "SUBSCRIPTION", planId: "PLUS", entitlementEventId: eventId });
  expect((await database.pool.query("SELECT funding_kind,internal_grant_id,internal_grant_event_id FROM billing.run_charge_scope WHERE run_id=$1", [runId])).rows[0])
    .toEqual({ funding_kind: "SUBSCRIPTION", internal_grant_id: null, internal_grant_event_id: null });
  const ledger = (await database.pool.query("SELECT name,applied_at FROM public.debateai_schema_migration ORDER BY name")).rows;
  expect(ledger).toHaveLength(100);
  await migrate(database.pool);
  expect((await database.pool.query("SELECT name,applied_at FROM public.debateai_schema_migration ORDER BY name")).rows).toEqual(ledger);
  expect(await bytes()).toEqual(beforeBytes);
  expect(await guards(beforeGuards.map(row => row.tgname as string))).toEqual(beforeGuards);
  await expect(database.pool.query("UPDATE billing.run_charge_scope SET plan_id='MAX' WHERE run_id=$1", [runId])).rejects.toThrow();
  await expect(database.pool.query("TRUNCATE billing.run_charge_scope")).rejects.toThrow();
});
