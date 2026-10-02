/**
 * A21 — on a real (embedded) PostgreSQL: the answer projection joins the run's
 * pinned role assignment (core.run_role_assignment) and serves it; a run that
 * pinned none serves no `model_assignment` key at all; and a pinned row that
 * does not parse never fails the answer (fix round 1, I1).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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

async function persistedAnswerId(runId: string, label: string): Promise<string> {
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
  return answerId;
}

async function servedAnswer(runId: string, label: string) {
  return new ServeRepository(database.pool).readAnswerProjection(await persistedAnswerId(runId, label), ASKER);
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

  it("serves a run whose pinned row does not parse without the key, keeps it on the owner's index, and reports it by name", async () => {
    const runId = await createRun("unparseable");
    // The db writer checks only "an object" and the strength, so this pin reaches the table.
    await insertRunRoleAssignment(database.pool, {
      runId, assignment: { strength: "BALANCED", roles: {} }, strength: "BALANCED", steppedDown: false
    });
    const answerId = await persistedAnswerId(runId, "unparseable");
    const expectedLine = `[ANSWER_MODEL_ASSIGNMENT_INVALID] run=${runId}`;
    const operatorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const serve = new ServeRepository(database.pool);
      const answer = await serve.readAnswerProjection(answerId, ASKER);
      expect(answer).toMatchObject({ answer_id: answerId, run_ref: runId });
      expect(Object.hasOwn(answer!, "model_assignment")).toBe(false);
      // One operator line: the typed code and the run id, never the row's content.
      expect(operatorLog.mock.calls).toEqual([[expectedLine]]);

      operatorLog.mockClear();
      const index = await serve.readAnswerIndex(ASKER, 128, 0);
      expect(index.items).toContainEqual(expect.objectContaining({ answer_id: answerId, run_ref: runId }));
      expect(operatorLog.mock.calls).toEqual([[expectedLine]]);
    } finally {
      operatorLog.mockRestore();
    }
  });
});
