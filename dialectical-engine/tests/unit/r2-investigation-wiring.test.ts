// tests/unit/r2-investigation-wiring.test.ts
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const RUNNER = new URL("../../apps/runner/src/index.ts", import.meta.url);

/** Engine 2 (spec §4.2b; INTERFACE §8.4 "Runner placement"): where the investigation step sits, and what it never does. */
describe("engine 2: the investigation step's place in the runner", () => {
  it("runs after the last review and the final materialisation, before the serve decision, for engine 2 only", async () => {
    const source = await readFile(RUNNER, "utf8");
    const marker = "engineInvestigation = await investigateCannotAssessPoints(engine, investigationFacts, snapshot);";
    const step = source.indexOf(marker);
    expect(step).toBeGreaterThan(0);
    expect(source.indexOf(marker, step + 1)).toBe(-1);
    expect(step).toBeGreaterThan(source.lastIndexOf("await reviewPendingAuthoredNodes();"));
    expect(step).toBeGreaterThan(source.indexOf("const { materialised, snapshot: operatorResolvedSnapshot } ="));
    // Before A8's link-weighted serve graph, so the serve decision and the final propagation read every outcome.
    expect(source.indexOf("for (const [nodeId, status] of engineInvestigation.statuses) engineInvestigated.set(nodeId, status);", step))
      .toBeGreaterThan(step);
    expect(step).toBeLessThan(source.indexOf("const engineServeLinked = engine.engine === 2"));
    const serve = source.indexOf("const makerPositionServe = decideMakerPositionServe({");
    expect(step).toBeLessThan(serve);
    // pre-flight PF-R2a8.9: the definition (`= async (`) and the one call.
    expect(source.match(/investigateCannotAssessPoints\b/gu)).toHaveLength(2);
    // Ruling PF-R2a8.10: the rows are written after the serve decision, their standings on the served graph.
    const recordAt = source.indexOf("await recordPointInvestigationRows({");
    expect(recordAt).toBeGreaterThan(serve);
    expect(source.indexOf("await recordPointInvestigationRows({", recordAt + 1)).toBe(-1);
    const disclosureAt = source.indexOf("const serveDisclosureBody = serveDisclosureBodyFacts(", serve);
    expect(recordAt).toBeLessThan(disclosureAt);
    const recordBlock = source.slice(serve, disclosureAt);
    expect(recordBlock).toContain("projectJudgedStanding(operatorResolvedSnapshot, makerPositionServe.judgedStandingSeed).snapshot");
    expect(recordBlock).toContain("makerPositionServe.servableMakerPositions.map((root) => root.nodeId)");
    // The catch-up reads the recorded outcomes back (pre-flight PF-R2a8.8: over the catch-up's own `input.pool`).
    // R2a W4: through the codes-only reader (no lease, no decryption), never the reader that decrypts the AI's words.
    expect(source).toContain("investigated: new Map((await new PointInvestigationRepository(input.pool).readPointInvestigationResultsForRun(runId))");
    expect(source).not.toContain("new PointInvestigationRepository(input.pool).readPointInvestigationsForRun(");
  });

  it("sends each investigation under the engine seal and the investigator's bound, keeps it off the author's and the reviewer's makers, never stops the debate for money", async () => {
    const source = await readFile(RUNNER, "utf8");
    const start = source.indexOf("const investigateCannotAssessPoints = async (");
    const body = source.slice(start, source.indexOf("if (engine.engine === 2 && effectiveMakerCount > 1) {", start));
    expect(start).toBeGreaterThan(0);
    expect(body).toContain("contractHash: engineSeal,");
    expect(body).toContain("bound: guidedCallBound(settings.judgeBound, \"investigator\", lengthGuidance),");
    expect(body).toContain("movedCallBars.set(callSiteKey, fair);");
    expect(body).toContain("if (pointInvestigationFailureOutcome(error) === \"RETHROW\") throw error;");
    expect(body).toContain("spendStopped: runBodyBudgetStop !== null,");
    expect(body).not.toMatch(/runBodyBudgetStop\s*=[^=]/u);
    expect(body).not.toContain("cooldownAttempt(");
    // The step records nothing itself (Ruling PF-R2a8.10).
    expect(body).not.toContain("recordPointInvestigation");
  });

  // The A14 dispatch's controller carries: the call goes through the debate's call lane and never the cooldown book
  // (pre-flight PF-R2a5.6: 0121's contract scan alone under-reaches), and a row another write stored first stands.
  it("calls each investigator through the seat caller over the lane-wrapped members, never the cooldown book", async () => {
    const source = await readFile(RUNNER, "utf8");
    const start = source.indexOf("const investigateCannotAssessPoints = async (");
    const body = source.slice(start, source.indexOf("if (engine.engine === 2 && effectiveMakerCount > 1) {", start));
    expect(start).toBeGreaterThan(0);
    expect(body).toContain("const answered = await seatCaller.callSeat({");
    expect(body).toContain("call: (member, memberCallSiteKey) => member.judge.investigatePoint({");
    // R2a W3: right after the seat call, before the answer is used, the maker that answered is checked.
    const called = body.indexOf("const answered = await seatCaller.callSeat({");
    const check = body.indexOf("assertFairInvestigator(answered.value.maker, candidate);", called);
    expect(check).toBeGreaterThan(called);
    expect(check).toBeLessThan(body.indexOf("return Object.freeze({ kind: \"ANSWERED\" as const, answer: Object.freeze({", called));
    expect(body.match(/assertFairInvestigator\(/gu)).toHaveLength(1);
    expect(body).not.toMatch(/cooldownAttempt\(|withCooldownRetry\(/u);
    // The members the seat caller calls are lane-wrapped where they are built (the legacy book and the assigned one).
    const sitOutAt = source.indexOf("const sitOutMaker = <T extends ConfiguredSeatMaker>(maker: T): T => {");
    expect(sitOutAt).toBeGreaterThan(0);
    expect(source.slice(sitOutAt, sitOutAt + 400)).toContain("throughCallLane(maker.providerRef, sittingOut)");
    expect(source).toContain("const provider = throughCallLane(ref, maker.provider);");
  });

  it("reads a row another write stored first back, and keeps it for every later reading (A10's ALREADY_PRESENT)", async () => {
    const source = await readFile(RUNNER, "utf8");
    const start = source.indexOf("const recordPointInvestigationRow = async (row: PointInvestigationRow)");
    expect(start).toBeGreaterThan(0);
    const body = source.slice(start, source.indexOf("const investigateCannotAssessPoints = async (", start));
    expect(body).toContain("if (outcome !== \"ALREADY_PRESENT\") return undefined;");
    expect(body).toContain("(await this.#pointInvestigations.readPointInvestigationsForRun(run.runId))");
    expect(body).toContain("return stored === undefined ? undefined : Object.freeze({ ...pointInvestigationRowOfStored(stored), nodeId: row.nodeId });");
    const serve = source.indexOf("const makerPositionServe = decideMakerPositionServe({");
    const block = source.slice(serve, source.indexOf("const serveDisclosureBody = serveDisclosureBodyFacts(", serve));
    expect(block).toContain("if (engine.engine === 2 && engineInvestigation !== null && engineInvestigation.rows.length > 0) {");
    expect(block).toContain("const recordedFacts = engineFactsWithInvestigations(investigation.facts, recordedRows);");
    expect(block).toContain("engineInvestigated.clear();");
    expect(block).toContain("for (const [nodeId, status] of recordedStatuses) engineInvestigated.set(nodeId, status);");
  });

  // A14 fix round 1: every unavailable investigation call leaves one content-free line, and one rule reads the statuses.
  it("logs each unavailable call by its code, and reads every investigation status through one helper", async () => {
    const source = await readFile(RUNNER, "utf8");
    const start = source.indexOf("const investigateCannotAssessPoints = async (");
    const body = source.slice(start, source.indexOf("if (engine.engine === 2 && effectiveMakerCount > 1) {", start));
    const lines = body.match(/logPointInvestigation\("INVESTIGATION_UNAVAILABLE", \{ runId: run\.runId, callSiteKey, code: [^}]*\}\);/gu) ?? [];
    expect(lines).toEqual([
      "logPointInvestigation(\"INVESTIGATION_UNAVAILABLE\", { runId: run.runId, callSiteKey, code: \"INVESTIGATOR_SEAT_UNPLANNED\" });",
      "logPointInvestigation(\"INVESTIGATION_UNAVAILABLE\", { runId: run.runId, callSiteKey, code: pointInvestigationFailureCode(error) });"
    ]);
    expect(body).toContain("statuses: engineInvestigatedStatuses(investigated.rows),");
    expect(source).toContain("const recordedStatuses = engineInvestigatedStatuses(recordedRows);");
    expect(source).toContain("readPointInvestigationResultsForRun(runId))\n          .flatMap(investigatedStatusEntry))");
    expect(source.match(/row\.result === "HOLDS"/gu)).toBeNull();
    const tool = await readFile(new URL("../../tools/preview-practice/practice-engine-graph.ts", import.meta.url), "utf8");
    expect(tool).toContain("investigated: engineInvestigatedStatuses(source.investigations.filter((row) => inGraph.has(row.nodeId)))");
    expect(tool.match(/row\.result === "HOLDS"/gu)).toBeNull();
  });
});
