import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { WorkItemRepository } from "@debateai/battery";
import { LedgerRepository } from "@debateai/ledger";
import { RunRepository, migrate } from "@debateai/db";
import type { ServeGateResult } from "@debateai/serve";
import { persistTerminalAnswer } from "../support/settledRun.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { fixtureDiscoveredPanel, fixtureStructuralCeiling } from "../support/discoveredPanel.js";

/**
 * Model scorecard A15a — the loop-round verifier in `ServeRepository.persist`
 * (packages/serve/src/index.ts) against seat-marked call-site keys, through a
 * real database.
 *
 * Two checks guard each round reference, and every refusal below names the one
 * that must refuse it by its OWN message, not only the shared code:
 *   - the ROUND-KEY check: the claimed key must be one of the round's own keys
 *     (bare, `:seat:main`, `:seat:runnerUp`) — "is not this round's";
 *   - the LEDGER lookup: a successful MODEL_CALL at the CLAIMED key must have
 *     recorded the artifact — "is not the artifact this run recorded at".
 */
let database: TestDatabase;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
});

afterAll(async () => {
  await database?.stop();
});

/** A run with no answer yet, one synthesis artifact, recorded at `recorded`. */
async function runRecordedAt(recorded: readonly string[]) {
  const question = `a15a-seat-round-${randomUUID()}`;
  const runId = await new RunRepository(database.pool).startRun({
    questionLine: question, principal: { kind: "legacy", legacyAskerId: `asker:${question}` },
    sessionId: `session:${question}`, callerScope: "ASKER",
    asOf: new Date("2026-08-07T00:00:00.000Z"), askerRiskTier: "casual",
    effectiveRiskTier: "casual", tierSource: "ASKER",
    tierProvenanceRef: `asker-declaration:${question}`, compositionBudgetTier: "low",
    depthParams: { depth: 1 }, discoveredPanel: fixtureDiscoveredPanel(1), strangerSampleRate: 1,
    envelopeBasis: fixtureStructuralCeiling(90, 1, 1),
    registerVersion: 1, batteryVersion: "s00", batteryRows: []
  });
  const workItemId = await new WorkItemRepository(database.pool).enqueue({
    runId, batteryRowId: "Q1", nodeSet: [], commandKey: `runner-test:${question}`
  });
  const ledger = new LedgerRepository(database.pool);
  const artifactId = randomUUID();
  const attemptId = randomUUID();
  await ledger.appendRawArtifact({
    artifactId, attemptId, runId,
    providerRef: "provider:test-layer", provider: "test", model: "model/test-layer",
    maker: "test-layer", modelVersion: "v1",
    rawText: JSON.stringify({ synthesizer: question }), metadata: {}, parseStatus: "PARSED",
    inputHash: "8".repeat(64), contractHash: "9".repeat(64), contentHash: "b".repeat(64)
  });
  const now = new Date();
  for (const callSiteKey of recorded) {
    await ledger.append({
      runId, attemptId, actionKind: "MODEL_CALL", callSiteKey,
      subjectItemId: workItemId, stanceAtAction: "UNASSIGNED", outcome: "OK",
      actorRef: "provider:test-layer", inputHash: "input:test-layer",
      contractHash: "9".repeat(64), rawArtifactRef: artifactId,
      startedAt: now, finishedAt: now
    });
  }
  return { question, runId, workItemId, artifactId };
}

/** Round 1 (INITIAL), both references naming the one artifact. */
function roundOne(artifactId: string, candidateCallSiteKey: string, verdictCallSiteKey: string) {
  const emptyDigest = { nodes: [], emphasis: { topSurvivingObjectionNodeIds: [], runnerUpPositionNodeIds: [] }, compressionLevel: 0, summaryCharacterCap: null, byteSize: 0 };
  const codeLabel = { verdictLabel: "CONTESTED", servedNodeId: "n", servedStrength: 0.5, margin: null, registerVersion: 1 };
  return {
    round: 1,
    synthesizerRequest: { role: "SYNTHESIZER", stage: "INITIAL", roleRef: "provider:test-layer", round: 1, instructions: "i", digest: emptyDigest, codeLabel },
    candidateRef: artifactId,
    candidateCallSiteKey,
    candidateStatement: "A statement.",
    evaluatorRequest: { role: "EVALUATOR", roleRef: "provider:test-layer", round: 1, instructions: "i", digest: emptyDigest, codeLabel, candidateStatement: "A statement." },
    verdict: { satisfied: true, objection: null, criteria: { fairnessToLosers: true, statementLabelAgreement: true, noOverstatement: true, restatement: true, citationTracing: true } },
    verdictRef: artifactId,
    verdictCallSiteKey
  } as unknown as NonNullable<ServeGateResult["loopRounds"]>[number];
}

const factBundle = {
  facts: ["A fact."], residualObjections: [], badges: [], conditionMarks: [],
  reversalPoint: "A contrary observation would reverse this.",
  buildsOnPrevious: { value: false, answerRef: null }, memoryDisclosure: null
};

function refusedWith(message: string) {
  return { code: "SYNTHESIS_ROUND_ARTIFACT_UNRESOLVED", message: expect.stringContaining(message) };
}

async function roundCount(runId: string): Promise<string | undefined> {
  const rows = await database.pool.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM serve.synthesis_round WHERE run_id=$1", [runId]
  );
  return rows.rows[0]?.count;
}

describe("A15a · the loop-round verifier accepts a round's seat forms and nothing else", () => {
  it("persists a round recorded under seat-marked keys and stores the keys verbatim", async () => {
    const writer = "COMPOSER:SYNTHESIZER:INITIAL:1:seat:runnerUp";
    const checker = "POST_COMPOSE_R9:EVALUATOR:1:seat:main";
    const run = await runRecordedAt([writer, checker]);
    await persistTerminalAnswer({
      pool: database.pool, runId: run.runId, workItemId: run.workItemId, fixtureKey: run.question, factBundle,
      loopRounds: [roundOne(run.artifactId, writer, checker)]
    });
    const rows = await database.pool.query<{ candidate_call_site_key: string; evaluator_call_site_key: string }>(
      "SELECT candidate_call_site_key, evaluator_call_site_key FROM serve.synthesis_round WHERE run_id=$1",
      [run.runId]
    );
    expect(rows.rows).toEqual([{ candidate_call_site_key: writer, evaluator_call_site_key: checker }]);
  });

  it("looks the artifact up at the CLAIMED key: a seat claim over a differently recorded key is refused by the ledger lookup", async () => {
    const run = await runRecordedAt([
      "COMPOSER:SYNTHESIZER:INITIAL:1", "POST_COMPOSE_R9:EVALUATOR:1:seat:main"
    ]);
    // Claimed `:seat:main`, recorded bare: a lawful round key, no such record.
    await expect(persistTerminalAnswer({
      pool: database.pool, runId: run.runId, workItemId: run.workItemId, fixtureKey: `${run.question}:a`, factBundle,
      loopRounds: [roundOne(run.artifactId, "COMPOSER:SYNTHESIZER:INITIAL:1:seat:main", "POST_COMPOSE_R9:EVALUATOR:1:seat:main")]
    })).rejects.toMatchObject(
      refusedWith("is not the artifact this run recorded at COMPOSER:SYNTHESIZER:INITIAL:1:seat:main")
    );
    // Claimed `:seat:runnerUp`, recorded `:seat:main`: the seats must agree.
    await expect(persistTerminalAnswer({
      pool: database.pool, runId: run.runId, workItemId: run.workItemId, fixtureKey: `${run.question}:b`, factBundle,
      loopRounds: [roundOne(run.artifactId, "COMPOSER:SYNTHESIZER:INITIAL:1", "POST_COMPOSE_R9:EVALUATOR:1:seat:runnerUp")]
    })).rejects.toMatchObject(
      refusedWith("is not the artifact this run recorded at POST_COMPOSE_R9:EVALUATOR:1:seat:runnerUp")
    );
    expect(await roundCount(run.runId)).toBe("0");
  });

  it("refuses by the ROUND-KEY check a seat-marked key of the other role, an unknown or doubled seat, and another round", async () => {
    // Every key below IS recorded for this artifact, so the ledger lookup would
    // succeed; only the round-key check can refuse these.
    const run = await runRecordedAt([
      "COMPOSER:SYNTHESIZER:INITIAL:1:seat:main",
      "POST_COMPOSE_R9:EVALUATOR:1:seat:main",
      "COMPOSER:SYNTHESIZER:INITIAL:1:seat:backup",
      "COMPOSER:SYNTHESIZER:INITIAL:1:seat:main:seat:runnerUp",
      "POST_COMPOSE_R9:EVALUATOR:2:seat:main"
    ]);
    const cases: readonly (readonly [string, string, string])[] = [
      // The checker's key offered as the writer's.
      ["POST_COMPOSE_R9:EVALUATOR:1:seat:main", "POST_COMPOSE_R9:EVALUATOR:1:seat:main", "is not this round's SYNTHESIZER call site"],
      // The writer's key offered as the checker's.
      ["COMPOSER:SYNTHESIZER:INITIAL:1:seat:main", "COMPOSER:SYNTHESIZER:INITIAL:1:seat:main", "is not this round's EVALUATOR call site"],
      // A seat this engine does not name.
      ["COMPOSER:SYNTHESIZER:INITIAL:1:seat:backup", "POST_COMPOSE_R9:EVALUATOR:1:seat:main", "is not this round's SYNTHESIZER call site"],
      // Two markers.
      ["COMPOSER:SYNTHESIZER:INITIAL:1:seat:main:seat:runnerUp", "POST_COMPOSE_R9:EVALUATOR:1:seat:main", "is not this round's SYNTHESIZER call site"],
      // Round 2's seat-marked checker filed under round 1.
      ["COMPOSER:SYNTHESIZER:INITIAL:1:seat:main", "POST_COMPOSE_R9:EVALUATOR:2:seat:main", "is not this round's EVALUATOR call site"]
    ];
    for (const [candidate, verdict, message] of cases) {
      await expect(persistTerminalAnswer({
        pool: database.pool, runId: run.runId, workItemId: run.workItemId,
        fixtureKey: `${run.question}:${candidate}:${verdict}`, factBundle,
        loopRounds: [roundOne(run.artifactId, candidate, verdict)]
      }), `${candidate} / ${verdict}`).rejects.toMatchObject(refusedWith(message));
    }
    expect(await roundCount(run.runId)).toBe("0");
  });
});
