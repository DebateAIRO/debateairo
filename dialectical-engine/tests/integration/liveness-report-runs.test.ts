// tests/integration/liveness-report-runs.test.ts
// V4 start step, Task 57l (item 6, from the Task 56h review): a person's hidden report runs (core.run.depth_params holding PUBLIC_REPORT_CARRIER_MARK) are
// runs they can neither see nor delete, so they must not count toward the 128-run private history scan of LivenessRepository.recordQuery; counted, a
// person with 128 debates and one report run is refused every new ask (OWNER_PRIVATE_HISTORY_SCAN_SATURATED). On real PostgreSQL: the scan is SQL. Data is made up.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MAX_OWNER_PRIVATE_HISTORY_SCAN, PUBLIC_REPORT_CARRIER_MARK, RunRepository, migrate } from "@debateai/db";
import { LivenessRepository } from "@debateai/liveness";
import { fixtureDiscoveredPanel } from "../support/discoveredPanel.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 120_000);

afterAll(async () => {
  await database?.stop();
});

/** One run of `askerId`'s, through the one run writer; `depthParams` is the report-run mark for a report run, as publicReportCarrierMaker writes it. */
function startRun(askerId: string, questionLine: string, depthParams: Readonly<Record<string, unknown>>): Promise<string> {
  return new RunRepository(database.pool).startRun({
    questionLine, principal: { kind: "legacy", legacyAskerId: askerId }, sessionId: `session:${questionLine}`, callerScope: "ASKER",
    asOf: new Date("2026-11-08T00:00:00.000Z"), askerRiskTier: "casual", effectiveRiskTier: "casual", tierSource: "ASKER",
    tierProvenanceRef: "liveness-report-runs", compositionBudgetTier: "low", depthParams, discoveredPanel: fixtureDiscoveredPanel(1),
    strangerSampleRate: 1, envelopeBasis: depthParams, registerVersion: 1, batteryVersion: "liveness-report-runs", batteryRows: []
  });
}

describe("V4 start step, Task 57l: report runs stay out of the private history scan", () => {
  it("a person with 128 debates and a report run can still ask; a 129th debate still fills the window", async () => {
    expect(MAX_OWNER_PRIVATE_HISTORY_SCAN).toBe(128);
    const askerId = `asker:liveness-report-runs-${randomUUID()}`;
    const ownership = { ownerRef: null, legacyAskerId: askerId };
    // The report run first, so it is inside the scan's window (ordered by creation) when it is counted.
    await startRun(askerId, "report run of a public debate", { [PUBLIC_REPORT_CARRIER_MARK]: randomUUID() });
    await Promise.all(Array.from({ length: MAX_OWNER_PRIVATE_HISTORY_SCAN }, (_, index) => startRun(askerId, `debate ${index}`, { depth: 1 })));
    const liveness = new LivenessRepository(database.pool);
    await expect(liveness.recordQuery("debate 7", ownership)).resolves.toBe(1);

    await startRun(askerId, "debate 128", { depth: 1 });
    await expect(liveness.recordQuery("debate 7", ownership)).rejects.toMatchObject({ code: "OWNER_PRIVATE_HISTORY_SCAN_SATURATED" });
  }, 120_000);
});
