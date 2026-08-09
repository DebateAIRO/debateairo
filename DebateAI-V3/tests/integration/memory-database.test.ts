import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RunRepository, migrate } from "@debateai/db";
import {
  MemoryRepository,
  canonicalizeQuestionText,
  renderMemorySentence,
  type MemoryQuestionKey
} from "@debateai/memory";
import { ServeRepository } from "@debateai/serve";
import {
  SettlementRepository,
  type CalibrationStrategy,
  type RegisteredProperScore
} from "@debateai/settlement";
import { persistTerminalRun } from "../support/settledRun.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;

const properScore: RegisteredProperScore = Object.freeze({
  rowKey: "test-layer:proper-score", registerVersion: 404_013, sourceRef: "test-layer:FX-S22-04",
  score: () => Object.freeze({ total: 0, reliability: 0, resolution: 0, uncertainty: 0 })
});
const calibration: CalibrationStrategy = Object.freeze({
  rowKey: "test-layer:calibration", registerVersion: 404_013, sourceRef: "test-layer:FX-S22-04",
  deriveValue: () => 0, deriveInterval: () => Object.freeze({ lower: 0, upper: 0 })
});

async function createRun(label: string, questionLine: string): Promise<string> {
  return new RunRepository(database.pool).startRun({
    questionLine, askerId: "asker:s13-test-layer", sessionId: `session:${label}`, callerScope: "ASKER",
    asOf: new Date("2026-08-08T00:00:00.000Z"), askerRiskTier: "casual", effectiveRiskTier: "casual",
    tierSource: "ASKER", tierProvenanceRef: `asker:${label}`, compositionBudgetTier: "low",
    depthParams: { depth: 1 }, agentCount: 1, strangerSampleRate: 1,
    envelopeBasis: { source: "test-layer" }, registerVersion: 1,
    batteryVersion: "s13-test-layer", batteryRows: []
  });
}

function questionKey(runId: string, question: string): MemoryQuestionKey {
  return Object.freeze({
    runId, canonicalQuestionText: canonicalizeQuestionText(question), callerScope: "ASKER",
    askerScope: "asker:s13-test-layer", settlementAct: null, questionType: null,
    declaredField: null, normalizedBinding: Object.freeze({}), frozenTerms: Object.freeze([]),
    frozenQuerySetHash: null, asOf: "2026-08-08T00:00:00.000Z", policyVersion: 1, keyVersion: 1
  });
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
});
afterAll(async () => database?.stop());

describe("S13 / FX-S22-04 / FX-PT-MEM — real PostgreSQL memory path", () => {
  it("links one settled exact question, pins the pull, serves disclosure, never closes transitively, and unlinks append-only", async () => {
    const question = "Should the city build a tram?";
    const memory = new MemoryRepository(database.pool);
    const priorRunId = await createRun("prior", question);
    await expect(memory.recordQuestionAndMatch({
      key: questionKey(priorRunId, question), decidedBy: "test-layer:matcher"
    })).resolves.toBeNull();
    const priorAnswerId = (await persistTerminalRun({
      pool: database.pool,
      runId: priorRunId,
      fixtureKey: "s13-prior",
      factBundle: {
        facts: ["fact:prior"], residualObjections: [], badges: [], conditionMarks: [],
        reversalPoint: "reversal:prior", buildsOnPrevious: { value: false, answerRef: null },
        memoryDisclosure: null
      }
    })).answerId;
    await new SettlementRepository(database.pool).settle({
      outcomeAttemptId: randomUUID(), answerId: priorAnswerId, answerVersion: 1,
      asOf: new Date("2026-08-08T00:00:00.000Z"), runId: priorRunId,
      modelId: "model:s13-test-layer", modelVersion: "v1", provider: "provider:s13-test-layer",
      taskClass: "class:s13-test-layer", prior: 0.5, posterior: 0.7,
      basis: "test-layer:resolver", resolverRef: "resolver:s13-test-layer", resolverIsExternal: true,
      resolvedOutcome: true, resolvedAt: new Date("2026-08-08T01:00:00.000Z"),
      provenanceRef: "artifact:s13-test-layer", scoreability: "PERMANENTLY_UNSCOREABLE",
      actorRef: "settlement-watch:s13-test-layer"
    }, { properScore, calibration, metric: "judge_weight" });

    const currentRunId = await createRun("current", question);
    const disclosure = await memory.recordQuestionAndMatch({
      key: questionKey(currentRunId, question), decidedBy: "test-layer:matcher",
      pullPolicy: {
        bound: 1, rowKey: "test-layer:memory-pull-cap", registerVersion: 404_013,
        sourceRef: "test-layer:FX-S22-04"
      }
    });
    expect(disclosure).toMatchObject({
      matched: true, tier: "EXACT_QUESTION", relation: "REPEATS",
      prior: { answer_id: priorAnswerId, staleness_state: "FRESH" }
    });
    expect(disclosure!.pulls).toHaveLength(1);
    expect(disclosure!.pulls[0]!.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(renderMemorySentence(disclosure!)).toContain("EXACT_QUESTION");

    const currentAnswerId = (await persistTerminalRun({
      pool: database.pool,
      runId: currentRunId,
      fixtureKey: "s13-current",
      factBundle: {
        facts: ["fact:current"], residualObjections: [], badges: [], conditionMarks: [],
        reversalPoint: "reversal:current",
        buildsOnPrevious: { value: disclosure?.matched === true, answerRef: disclosure?.prior?.answer_id ?? null },
        memoryDisclosure: disclosure
      }
    })).answerId;
    const projection = await new ServeRepository(database.pool).readAnswerProjection(
      currentAnswerId, "asker:s13-test-layer"
    );
    expect(projection?.memory_disclosure).toMatchObject({ matched: true, tier: "EXACT_QUESTION" });
    const direct = await database.pool.query<{ count: string; transitive: string }>(
      `SELECT count(*)::text AS count,
              count(*) FILTER (WHERE source_run_id=$1 AND prior_run_id<>$2)::text AS transitive
       FROM memory.memory_link WHERE source_run_id=$1`, [currentRunId, priorRunId]
    );
    expect(direct.rows[0]).toEqual({ count: "1", transitive: "0" });

    const unlinked = await memory.unlinkForAnswer(currentAnswerId, "asker:s13-test-layer", "asker:s13-test-layer");
    expect(unlinked.memoryLinkId).toBe(disclosure!.memory_link_id);
    const after = await new ServeRepository(database.pool).readAnswerProjection(currentAnswerId, "asker:s13-test-layer");
    expect(after?.memory_disclosure).toBeNull();
    expect(after?.builds_on_previous).toEqual({ value: false, answer_ref: null });
    await expect(database.pool.query(
      "UPDATE memory.memory_link SET relation='RELATED_ONLY' WHERE memory_link_id=$1", [unlinked.memoryLinkId]
    )).rejects.toThrow(/append-only|immutable/);
  });
});
