/**
 * A21 — on a real (embedded) PostgreSQL: the answer projection joins the run's
 * pinned role assignment (core.run_role_assignment) and serves it; a run that
 * pinned none serves no `model_assignment` key at all.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RunRepository, insertRunRoleAssignment, migrate } from "@debateai/db";
import { ServeRepository } from "@debateai/serve";
import { fixtureDiscoveredPanel } from "../support/discoveredPanel.js";
import { EXPECTED_ANSWER_MODEL_ASSIGNMENT, PINNED_ROLE_ASSIGNMENT } from "../support/roleAssignmentFixture.js";
import { persistTerminalRun } from "../support/settledRun.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

const ASKER = "asker:a21-test-layer";
let database: TestDatabase;

async function createRun(label: string): Promise<string> {
  return new RunRepository(database.pool).startRun({
    questionLine: `Which models answered the ${label} debate?`,
    principal: { kind: "legacy", legacyAskerId: ASKER },
    sessionId: `session:${label}`, callerScope: "ASKER",
    asOf: new Date("2026-09-26T00:00:00.000Z"), askerRiskTier: "casual", effectiveRiskTier: "casual",
    tierSource: "ASKER", tierProvenanceRef: `asker:${label}`, compositionBudgetTier: "low",
    depthParams: { depth: 1 }, discoveredPanel: fixtureDiscoveredPanel(2), strangerSampleRate: 1,
    envelopeBasis: { source: "test-layer" }, registerVersion: 1,
    batteryVersion: "a21-test-layer", batteryRows: []
  });
}

async function servedAnswer(runId: string, label: string) {
  const { answerId } = await persistTerminalRun({
    pool: database.pool,
    runId,
    fixtureKey: `a21-${label}`,
    factBundle: {
      facts: [`fact:${label}`], residualObjections: [], badges: [], conditionMarks: [],
      reversalPoint: `reversal:${label}`, buildsOnPrevious: { value: false, answerRef: null },
      memoryDisclosure: null
    }
  });
  return new ServeRepository(database.pool).readAnswerProjection(answerId, ASKER);
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
});
afterAll(async () => database?.stop());

describe("A21 · the served answer carries the run's pinned model assignment", () => {
  it("projects the assignment pinned at run creation", async () => {
    const runId = await createRun("pinned");
    await insertRunRoleAssignment(database.pool, {
      runId, assignment: { ...PINNED_ROLE_ASSIGNMENT }, strength: "BALANCED", steppedDown: true
    });
    const answer = await servedAnswer(runId, "pinned");
    expect(answer?.model_assignment).toEqual(EXPECTED_ANSWER_MODEL_ASSIGNMENT);
  });

  it("serves no model_assignment key at all for a run that pinned none", async () => {
    const runId = await createRun("unpinned");
    const answer = await servedAnswer(runId, "unpinned");
    expect(answer).not.toBeNull();
    expect(Object.hasOwn(answer!, "model_assignment")).toBe(false);
  });
});
