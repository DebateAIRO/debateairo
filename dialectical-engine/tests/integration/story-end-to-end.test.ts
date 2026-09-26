import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createInitialBatteryRows, WorkItemRepository } from "@debateai/battery";
import { BudgetRepository, CostEnvelopeGuard, PostgresModelSpendStore } from "@debateai/budget";
import { StoryBodySchema } from "@debateai/contract";
import { RunRepository, migrate } from "@debateai/db";
import { CLAIM_TYPE_COMPOSITION_MAP_ROW_KEY, type StoryPolicy } from "@debateai/register";
import {
  createPostgresProviderGateway,
  WalkingSkeletonRunner,
  type WalkingSkeletonSettings
} from "@debateai/runner";
import {
  STORY_CHECKER_CONTRACT_ID,
  STORYTELLER_CONTRACT_ID,
  StoryRepository,
  StoryWriter,
  loadStoryPack,
  resolveStoryPackDir
} from "@debateai/story";
import { fixtureDiscoveredPanel, fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import { readFramedMaterial, wirePacket } from "../support/framed-packet.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * Verdict story, Task 9 — the whole path, in the t17 style: a real one-maker
 * debate through a node:http double, then the story after the work item is
 * settled, in the same lease, on the story lane. Legacy (plaintext) runs, like
 * every runner suite in this repository: ciphertext at rest is proven by
 * tests/integration/story-repository.test.ts.
 */

let database: TestDatabase;
const batteryRows = createInitialBatteryRows({ settlementWatchHandle: "settlement-watch:story-e2e" });
const PACK = loadStoryPack(resolveStoryPackDir({ env: {}, moduleUrl: import.meta.url }));

const LOCAL_STORY_POLICY: StoryPolicy = Object.freeze({
  storytellerRoleRef: "provider:test-layer",
  storyCheckerRoleRef: "provider:test-layer",
  loopMaxRounds: 2,
  storytellerBound: Object.freeze({ maxAttempts: 2, tokenCeiling: 4_096, deadlineMs: 5_000 }),
  checkerBound: Object.freeze({ maxAttempts: 2, tokenCeiling: 1_024, deadlineMs: 5_000 }),
  materialBudget: Object.freeze({ low: 40_000, medium: 80_000, high: 120_000 }),
  perStoryCeilingMicros: null,
  registerVersion: 1
});

const JUDGEMENT = JSON.stringify({
  statement: "A served story test answer.", way_of_knowing: "REASONING", locator: null,
  restatement_text: "A served story test answer.", restatement_status: "PASS", value_laden: false,
  steelman: { summary: "The strongest case for it.", fidelity: 0.72 },
  critic: { summary: "The strongest objection.", counterargumentStrength: 0.28, basis: "PLAUSIBLE_COUNTER" },
  evidence: { quality: 0.72, relevance: 0.72 }, context: { fit: 0.72, ambiguityFlags: [] },
  fallacy: { severity: 0.28, fatalFlags: [] }
});

const COMPOSITION = JSON.stringify({ segments: [
  { segment_id: "segment:verdict", text: "A served story test answer.", node_refs: ["primary"], served_number_refs: ["number:final-strength"] },
  { segment_id: "segment:research", text: "Check an independent source.", node_refs: [], served_number_refs: [] }
] });

const EVALUATOR_SATISFIED = JSON.stringify({
  satisfied: true, objection: null,
  criteria: {
    fairness_to_losers: true, statement_label_agreement: true, no_overstatement: true,
    restatement: true, citation_tracing: true
  }
});

const CHECKER_SATISFIED = JSON.stringify({
  satisfied: true, objection: null,
  criteria: {
    faithful_to_material: true, agrees_with_label: true, fair_to_losing_paths: true,
    no_overstatement: true, citations_correct: true, reviewer_note_separate: true,
    goal_marked_as_reading: true
  }
});

const CHECKER_OBJECTION = "The summary calls the answer settled, but the label says it is contested (P1).";
const CHECKER_OBJECTS = JSON.stringify({
  satisfied: false, objection: CHECKER_OBJECTION,
  criteria: {
    faithful_to_material: true, agrees_with_label: false, fair_to_losing_paths: true,
    no_overstatement: false, citations_correct: true, reviewer_note_separate: true,
    goal_marked_as_reading: true
  }
});

/** Any id shaped like a node's: the story's models must never see one (they read P1…Pn). */
const UUID_SHAPED = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu;

/**
 * The storyteller never sees a node id: a one-maker debate has one node, the
 * position, and the material calls it `P1` (skeleton: positions first). The
 * writer must restore `P1` to the real node id before storing.
 */
function oneNodeStory(): string {
  const paragraph = (text: string) => ({ text, node_refs: ["P1"] });
  return JSON.stringify({
    shape_id: PACK.defaultShape,
    short: {
      headline: "The one position held up under review.",
      summary: "The debate examined one position, and it held up against its strongest objection.",
      paths: [{ position_ref: "P1", fate: "HELD_UP", line: "The position held up.", node_refs: ["P1"] }],
      change: paragraph("A stronger, sourced objection would change the answer.")
    },
    long: {
      sections: ["What you are deciding", "The verdict", "What would change it"].map((title) => ({
        title, paragraphs: [paragraph(`${title}, in the debate's own terms.`)]
      }))
    },
    reviewer_note: null
  });
}

function requestedModel(body: string): string | undefined {
  try {
    const model = (JSON.parse(body) as { readonly model?: unknown }).model;
    return typeof model === "string" ? model : undefined;
  } catch {
    return undefined;
  }
}

/** One double for the whole path: debate organs by their structural tokens, the story by its contract id. */
async function startStoryDebateProvider(input: {
  readonly storyteller: "valid" | "invalid";
  /** `objects-then-invalid`: round 1's check objects, and every later check answers unusable content. */
  readonly checker?: "satisfied" | "objects-then-invalid";
}): Promise<{
  readonly endpoint: string;
  storyCalls(): number;
  /** Every material field every story request carried, repair turns included. */
  storyMaterial(): readonly string[];
  stop(): Promise<void>;
}> {
  let storyCalls = 0;
  let checkerCalls = 0;
  let served = 0;
  const storyMaterial: string[] = [];
  const contentFor = async (body: string): Promise<string> => {
    const framed = readFramedMaterial(wirePacket(body));
    const contractId = framed.contractId;
    if (contractId === STORYTELLER_CONTRACT_ID || contractId === STORY_CHECKER_CONTRACT_ID) {
      storyMaterial.push(...framed.fields.map((field) => field.content));
    }
    if (contractId === STORYTELLER_CONTRACT_ID) {
      storyCalls += 1;
      return input.storyteller === "invalid" ? "this is not a story" : oneNodeStory();
    }
    if (contractId === STORY_CHECKER_CONTRACT_ID) {
      storyCalls += 1;
      checkerCalls += 1;
      if (input.checker === "objects-then-invalid") return checkerCalls === 1 ? CHECKER_OBJECTS : "not a verdict";
      return CHECKER_SATISFIED;
    }
    if (body.includes("fairness_to_losers")) return EVALUATOR_SATISFIED;
    if (body.includes("restatement_text")) return JUDGEMENT;
    if (body.includes("served_number_refs")) return COMPOSITION;
    throw new Error("STORY_E2E_UNEXPECTED_REQUEST");
  };
  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      served += 1;
      const id = `story-e2e-${String(served)}`;
      contentFor(body).then((content) => {
        response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({
          id, model: requestedModel(body), choices: [{ message: { content } }]
        }));
      }, () => {
        response.writeHead(500, { "content-type": "application/json" })
          .end(JSON.stringify({ error: "story e2e double failure" }));
      });
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("STORY_E2E_PROVIDER_ADDRESS_FAILED");
  return {
    endpoint: `http://127.0.0.1:${address.port}`,
    storyCalls: () => storyCalls,
    storyMaterial: () => [...storyMaterial],
    async stop() { server.close(); await once(server, "close"); }
  };
}

function runnerSettings(): WalkingSkeletonSettings {
  return {
    workerId: "runner:story-e2e", claimMs: 10_000, claimMarginMs: 1_000,
    judgeBound: { maxAttempts: 1, tokenCeiling: 256, deadlineMs: 1_000 },
    composerBound: { maxAttempts: 1, tokenCeiling: 256, deadlineMs: 1_000 },
    conformanceBound: { maxAttempts: 1, tokenCeiling: 256, deadlineMs: 1_000 },
    providerRef: "provider:test-layer", maker: "test-layer",
    judgeContractHash: "contract:judge:story-e2e", composerContractHash: "contract:composer:story-e2e",
    conformanceContractHash: "contract:conformance:story-e2e",
    propagationContractHash: "contract:propagation:story-e2e", serveContractHash: "contract:serve:story-e2e",
    maxRecompose: 2, factBundleVersion: 1, judgementNumberKind: "base-probability",
    judgementProducer: "judgement:story-e2e", propagationNumberKind: "propagated-probability",
    propagationProducer: "propagation:story-e2e",
    compositionRow: {
      rowKey: CLAIM_TYPE_COMPOSITION_MAP_ROW_KEY, registerVersion: 1, sourceRef: "test-layer:S04",
      value: { kind: "CLAIM_TYPE_COMPOSITION_MAP", entries: {
        unknown: {
          branch: "EVIDENCE_AWARE", clarityDecayPerAmbiguity: 0.1,
          terms: [{ metric: "steelman_fidelity", coefficient: 1 }], caps: [],
          uncertaintyLadder: [{ atMost: 1, label: "TEST_LAYER" }]
        }
      } }
    },
    servePolicy: {
      compositionBudgets: {
        low: { tier: "low", bound: 10_000, registerRowKey: "compositionBundleBudget.low", registerVersion: 1, sourceRef: "test-layer:DR-078" },
        medium: { tier: "medium", bound: 20_000, registerRowKey: "compositionBundleBudget.medium", registerVersion: 1, sourceRef: "test-layer:DR-078" },
        high: { tier: "high", bound: 30_000, registerRowKey: "compositionBundleBudget.high", registerVersion: 1, sourceRef: "test-layer:DR-078" }
      },
      candidateConfidenceBand: "TEST_TOP_BAND",
      bandCeiling: {
        rowKey: "wayOfKnowingCeiling", registerVersion: 1, sourceRef: "test-layer:DR-086",
        value: {
          bandOrder: ["TEST_CAPPED_BAND", "TEST_TOP_BAND"],
          ceilingLabels: ["TEST_DEFAULT_CEILING", "TEST_LOOKED_UP_CEILING", "TEST_EMPTY_BASIS_FLOOR"],
          defaultCeiling: { label: "TEST_DEFAULT_CEILING", ceilingBand: "TEST_TOP_BAND", liftPath: "test-layer:retain-band" },
          cuts: [{
            minimumShares: { LOOKED_UP: 0.5 },
            label: "TEST_LOOKED_UP_CEILING", ceilingBand: "TEST_CAPPED_BAND",
            liftPath: "test-layer:improve-way-of-knowing"
          }],
          emptyBasisFloor: {
            label: "TEST_EMPTY_BASIS_FLOOR", ceilingBand: "TEST_CAPPED_BAND",
            liftPath: "test-layer:gather-any-verified-evidence-to-lift"
          }
        }
      }
    },
    judgementPolicy: {
      selectionRule: {
        kind: "MAXIMIZE_WEIGHTED_TAU", rowKey: "test-layer:selection-rule",
        registerVersion: 1, sourceRef: "test-layer:DR-077"
      },
      earnedWeight: 1, judgeWeightVersion: "test-layer:weight-v1", reducerVersion: "test-layer:reducer-v1"
    },
    verdictLabelPolicy: {
      registerVersion: 1, gamma: 0.05, highCut: 0.7, lowCut: 0.35, disagreementThreshold: 0.25,
      sourceRefs: {
        verdictMarginGamma: "test-layer:goal-v4:80-96", verdictHighCut: "test-layer:goal-v4:80-96",
        verdictLowCut: "test-layer:goal-v4:80-96", disagreementThreshold: "test-layer:J1",
        disagreementQuantity: "test-layer:goal-v4:80-96"
      }
    },
    synthesisRolePolicy: {
      registerVersion: 1,
      synthesizerRoleRef: "provider:test-layer",
      evaluatorRoleRef: "provider:test-layer",
      evaluatorLoopMaxRounds: 3,
      identicalRoleRefs: true,
      synthesizerBound: { maxAttempts: 1, tokenCeiling: 512, deadlineMs: 1_000 },
      evaluatorBound: { maxAttempts: 1, tokenCeiling: 768, deadlineMs: 1_000 },
      sourceRefs: {
        synthesizerRoleRef: "test-layer:J8", evaluatorRoleRef: "test-layer:J8",
        evaluatorLoopMaxRounds: "test-layer:goal-v4:80-96"
      }
    },
    resolveTerminalActivations: async ({ waitingRows }) => waitingRows.map((batteryRowId) => ({
      batteryRowId,
      state: "INACTIVE" as const,
      predicateInputs: {
        kind: "PRESENT" as const, values: { fixture: "STORY-E2E", predicateResult: false, terminalEvaluation: true }
      },
      skipEvidence: {
        kind: "PRESENT" as const, evidenceType: "TEST_LAYER_TERMINAL_PREDICATE_RESULT", result: "FALSE_AT_COMPLETION"
      }
    }))
  };
}

async function createStoryDebate(label: string, maxModelAttempts = 10): Promise<{
  readonly runId: string; readonly workItemId: string; readonly askerId: string;
}> {
  // Unique without being id-shaped, so the material check below can refuse ANY
  // UUID-shaped text the story's models are handed.
  const question = `${label}-${randomUUID().replaceAll("-", "")}`;
  const askerId = `asker:${question}`;
  const runId = await new RunRepository(database.pool).startRun({
    questionLine: question, principal: { kind: "legacy", legacyAskerId: askerId },
    sessionId: `session:${question}`, callerScope: "ASKER",
    asOf: new Date("2026-09-26T00:00:00.000Z"), askerRiskTier: "casual", effectiveRiskTier: "casual",
    tierSource: "ASKER", tierProvenanceRef: `asker-declaration:${question}`, compositionBudgetTier: "low",
    depthParams: { depth: 1 }, discoveredPanel: fixtureDiscoveredPanel(1), strangerSampleRate: 1,
    envelopeBasis: fixtureStructuralCeiling(maxModelAttempts, 1, 1),
    registerVersion: 1, batteryVersion: "s00", batteryRows
  });
  const workItemId = await new WorkItemRepository(database.pool).enqueue({
    runId, batteryRowId: "Q1", nodeSet: [], commandKey: `story-e2e:${runId}`
  });
  return { runId, workItemId, askerId };
}

function storyWriter(policy: StoryPolicy | null): StoryWriter {
  // The boot resolver knows nobody: the runner's per-run resolver (its
  // claim-eligible synthesis makers) must be what reaches the provider.
  return new StoryWriter({
    pool: database.pool, pack: PACK, policy, hosted: false, resolveProvider: () => null, log: () => undefined
  });
}

function runnerWith(endpoint: string, writer: StoryWriter): WalkingSkeletonRunner {
  return new WalkingSkeletonRunner(database.pool, createPostgresProviderGateway(database.pool, {
    endpoint, model: "test-layer/model", maker: "test-layer"
  }), { ...runnerSettings(), story: writer });
}

async function servedAnswers(answerId: string): Promise<readonly { answer_version: number; verdict_state: string | null }[]> {
  const answers = await database.pool.query<{ answer_version: number; verdict_state: string | null }>(
    "SELECT answer_version, verdict_state FROM serve.answer WHERE answer_id = $1", [answerId]
  );
  return answers.rows;
}

async function storyCallSites(runId: string): Promise<readonly string[]> {
  const rows = await database.pool.query<{ call_site_key: string }>(
    `SELECT call_site_key FROM ledger.ledger_entry
     WHERE run_id = $1 AND action_kind = 'MODEL_CALL' AND call_site_key LIKE 'STORY:%'
     ORDER BY call_site_key`,
    [runId]
  );
  return rows.rows.map((row) => row.call_site_key);
}

async function nonStoryAttempts(runId: string): Promise<number> {
  const result = await database.pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM ledger.ledger_entry
     WHERE run_id = $1 AND action_kind = 'MODEL_CALL' AND call_site_key NOT LIKE 'STORY:%'`,
    [runId]
  );
  return Number(result.rows[0]?.count ?? "0");
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 240_000);

afterAll(async () => {
  await database?.stop();
});

describe("verdict story — end to end, after the debate is settled", () => {
  it("writes a READY story that the asker reads back, on the story's own call sites", async () => {
    const debate = await createStoryDebate("story-e2e-ready");
    const provider = await startStoryDebateProvider({ storyteller: "valid" });
    try {
      const result = await runnerWith(provider.endpoint, storyWriter(LOCAL_STORY_POLICY)).executeWorkItem(debate.workItemId);
      if (result.kind !== "COMPLETED") throw new Error(`STORY_E2E_EXPECTED_COMPLETION:${result.kind}`);
      const stored = await new StoryRepository(database.pool).readForAnswer({
        answerId: result.answerId, answerVersion: null, ownership: { legacyAskerId: debate.askerId }
      });
      expect(stored).toMatchObject({
        outcome: "READY", failureCode: null, shapeId: PACK.defaultShape,
        packVersion: PACK.version, packFingerprint: PACK.fingerprint, rounds: 1
      });
      expect(StoryBodySchema.parse(stored?.body)).toEqual(stored?.body);
      expect(stored?.verdictBasis).toMatchObject({ label: "CONTESTED", rung: 0, margin: null, disagreement: null });
      // The model wrote `P1`; the stored story names the real position and keeps P1 as its number.
      const root = await database.pool.query<{ node_id: string }>(
        `SELECT node_id::text AS node_id FROM core.node
         WHERE run_id = $1 AND parent_node_id IS NULL ORDER BY created_at_seq LIMIT 1`,
        [debate.runId]
      );
      const rootNodeId = root.rows[0]?.node_id;
      if (rootNodeId === undefined) throw new Error("STORY_E2E_ROOT_UNRESOLVED");
      expect(stored?.body?.short.paths).toEqual([
        expect.objectContaining({ position_ref: rootNodeId, node_refs: [rootNodeId] })
      ]);
      expect(stored?.pointNumbers).toEqual({ [rootNodeId]: "P1" });
      expect(stored?.artifactRefs).toHaveLength(2);
      const storyRows = await database.pool.query<{ call_site_key: string }>(
        `SELECT call_site_key FROM ledger.ledger_entry
         WHERE run_id = $1 AND action_kind = 'MODEL_CALL' AND call_site_key LIKE 'STORY:%'
         ORDER BY call_site_key`,
        [debate.runId]
      );
      expect(storyRows.rows.map((row) => row.call_site_key)).toEqual(["STORY:CHECKER:1", "STORY:STORYTELLER:1"]);
      // The models never see a node id: not in a claim, a reason, a mark or a verdict.
      const material = provider.storyMaterial();
      expect(material.length).toBeGreaterThan(0);
      for (const content of material) expect(content).not.toMatch(UUID_SHAPED);
      expect(material.join("\n")).not.toContain(rootNodeId);
      expect(await new BudgetRepository(database.pool).countRunModelAttempts(debate.runId))
        .toBe(await nonStoryAttempts(debate.runId));
      const workItem = await database.pool.query<{ state: string }>(
        "SELECT state FROM core.work_item WHERE work_item_id = $1", [debate.workItemId]
      );
      expect(workItem.rows[0]?.state).toBe("DONE");
    } finally {
      await provider.stop();
    }
  });

  it("stores FAILED when the storyteller never writes a valid story, and the served answer is untouched", async () => {
    const debate = await createStoryDebate("story-e2e-invalid");
    const provider = await startStoryDebateProvider({ storyteller: "invalid" });
    try {
      const result = await runnerWith(provider.endpoint, storyWriter(LOCAL_STORY_POLICY)).executeWorkItem(debate.workItemId);
      if (result.kind !== "COMPLETED") throw new Error(`STORY_E2E_EXPECTED_COMPLETION:${result.kind}`);
      const stored = await new StoryRepository(database.pool).readForAnswer({
        answerId: result.answerId, answerVersion: null, ownership: { legacyAskerId: debate.askerId }
      });
      expect(stored).toMatchObject({
        outcome: "FAILED", failureCode: "STORY_WRITE_REJECTED", body: null, shapeId: null
      });
      expect(provider.storyCalls()).toBeGreaterThanOrEqual(1);
      const answers = await database.pool.query<{ answer_version: number; verdict_state: string | null }>(
        "SELECT answer_version, verdict_state FROM serve.answer WHERE answer_id = $1", [result.answerId]
      );
      expect(answers.rows).toEqual([{ answer_version: 1, verdict_state: "CONTESTED" }]);
    } finally {
      await provider.stop();
    }
  });

  it("still writes the story of a debate that used its whole attempt ceiling", async () => {
    const measured = await createStoryDebate("story-e2e-measure");
    const firstProvider = await startStoryDebateProvider({ storyteller: "valid" });
    let ceiling: number;
    try {
      const first = await runnerWith(firstProvider.endpoint, storyWriter(LOCAL_STORY_POLICY)).executeWorkItem(measured.workItemId);
      expect(first.kind).toBe("COMPLETED");
      ceiling = await nonStoryAttempts(measured.runId);
    } finally {
      await firstProvider.stop();
    }
    expect(ceiling).toBeGreaterThan(0);

    const pinned = await createStoryDebate("story-e2e-pinned", ceiling);
    const provider = await startStoryDebateProvider({ storyteller: "valid" });
    try {
      const result = await runnerWith(provider.endpoint, storyWriter(LOCAL_STORY_POLICY)).executeWorkItem(pinned.workItemId);
      if (result.kind !== "COMPLETED") throw new Error(`STORY_E2E_EXPECTED_COMPLETION:${result.kind}`);
      const budget = new BudgetRepository(database.pool);
      expect(await budget.countRunModelAttempts(pinned.runId)).toBe(ceiling);
      await expect(budget.assertModelAttemptAllowed(pinned.runId))
        .rejects.toMatchObject({ code: "RUN_COST_ENVELOPE_EXHAUSTED" });
      await expect(new StoryRepository(database.pool).readForAnswer({
        answerId: result.answerId, answerVersion: null, ownership: { legacyAskerId: pinned.askerId }
      })).resolves.toMatchObject({ outcome: "READY" });
    } finally {
      await provider.stop();
    }
  });

  it("with no story rows, writes FAILED/STORY_NOT_CONFIGURED at once and makes no story call", async () => {
    const debate = await createStoryDebate("story-e2e-off");
    const provider = await startStoryDebateProvider({ storyteller: "valid" });
    try {
      const result = await runnerWith(provider.endpoint, storyWriter(null)).executeWorkItem(debate.workItemId);
      if (result.kind !== "COMPLETED") throw new Error(`STORY_E2E_EXPECTED_COMPLETION:${result.kind}`);
      await expect(new StoryRepository(database.pool).readForAnswer({
        answerId: result.answerId, answerVersion: null, ownership: { legacyAskerId: debate.askerId }
      })).resolves.toMatchObject({
        outcome: "FAILED", failureCode: "STORY_NOT_CONFIGURED", packVersion: PACK.version, rounds: 0,
        pointNumbers: null
      });
      expect(provider.storyCalls()).toBe(0);
    } finally {
      await provider.stop();
    }
  });

  it("with the story's money ceiling below one call, stores FAILED/STORY_ENVELOPE_EXHAUSTED and the answer is intact", async () => {
    const debate = await createStoryDebate("story-e2e-envelope");
    const provider = await startStoryDebateProvider({ storyteller: "valid" });
    try {
      // A hosted-style STORY seam, and nothing else metered: its ceiling of one
      // micro-unit is below any story call's pre-send projection, so the very
      // first storyteller call is refused before it is sent.
      const guard = new CostEnvelopeGuard({
        store: new PostgresModelSpendStore(database.pool),
        policy: { perRunCeilingMicros: 1_000_000, dailyCeilingMicros: 1_000_000_000, perStoryCeilingMicros: 1 }
      });
      const gateway = createPostgresProviderGateway(database.pool, {
        endpoint: provider.endpoint, model: "test-layer/model", maker: "test-layer",
        buildStoryCostEnvelopeSeam: (runId: string) => guard.storySeam({
          runId,
          price: { inputMicrosPerMillionTokens: 1_000_000, outputMicrosPerMillionTokens: 1_000_000 },
          requireReportedUsage: false
        })
      });
      const writer = new StoryWriter({
        pool: database.pool, pack: PACK, policy: { ...LOCAL_STORY_POLICY, perStoryCeilingMicros: 1 },
        hosted: true, resolveProvider: () => null, log: () => undefined
      });
      const result = await new WalkingSkeletonRunner(database.pool, gateway, { ...runnerSettings(), story: writer })
        .executeWorkItem(debate.workItemId);
      if (result.kind !== "COMPLETED") throw new Error(`STORY_E2E_EXPECTED_COMPLETION:${result.kind}`);
      await expect(new StoryRepository(database.pool).readForAnswer({
        answerId: result.answerId, answerVersion: null, ownership: { legacyAskerId: debate.askerId }
      })).resolves.toMatchObject({
        outcome: "FAILED", failureCode: "STORY_ENVELOPE_EXHAUSTED", body: null, shapeId: null, rounds: 0,
        artifactRefs: []
      });
      // Refused before sending: no story call reached the provider, none was
      // ledgered, and nothing was charged to the story.
      expect(provider.storyCalls()).toBe(0);
      expect(await storyCallSites(debate.runId)).toEqual([]);
      expect(await new PostgresModelSpendStore(database.pool).readRunStorySpentMicros(debate.runId)).toBe(0);
      // The served answer and its label stand exactly as the debate served them.
      expect(await servedAnswers(result.answerId)).toEqual([{ answer_version: 1, verdict_state: "CONTESTED" }]);
      const workItem = await database.pool.query<{ state: string }>(
        "SELECT state FROM core.work_item WHERE work_item_id = $1", [debate.workItemId]
      );
      expect(workItem.rows[0]?.state).toBe("DONE");
    } finally {
      await provider.stop();
    }
  });

  it("keeps round 1's checked draft, with round 1's checker named, when round 2's check fails", async () => {
    const debate = await createStoryDebate("story-e2e-served-round");
    const provider = await startStoryDebateProvider({ storyteller: "valid", checker: "objects-then-invalid" });
    try {
      const result = await runnerWith(provider.endpoint, storyWriter(LOCAL_STORY_POLICY)).executeWorkItem(debate.workItemId);
      if (result.kind !== "COMPLETED") throw new Error(`STORY_E2E_EXPECTED_COMPLETION:${result.kind}`);
      const stored = await new StoryRepository(database.pool).readForAnswer({
        answerId: result.answerId, answerVersion: null, ownership: { legacyAskerId: debate.askerId }
      });
      expect(stored).toMatchObject({
        outcome: "READY_WITH_RESERVATION",
        failureCode: null,
        reservation: CHECKER_OBJECTION,
        rounds: 2,
        // Round 1's checker judged the served draft; a null here was the defect.
        checkerLineage: { maker: "test-layer", model_id: "test-layer/model", provider_ref: "provider:test-layer" },
        storytellerLineage: { maker: "test-layer", model_id: "test-layer/model", provider_ref: "provider:test-layer" }
      });
      // Round 1's two calls and round 2's draft; round 2's check left no artifact that is served.
      expect(stored?.artifactRefs).toHaveLength(3);
      expect(StoryBodySchema.parse(stored?.body)).toEqual(stored?.body);
      expect(await storyCallSites(debate.runId)).toEqual([
        "STORY:CHECKER:1", "STORY:CHECKER:2", "STORY:CHECKER:2", "STORY:STORYTELLER:1", "STORY:STORYTELLER:2"
      ]);
      expect(await servedAnswers(result.answerId)).toEqual([{ answer_version: 1, verdict_state: "CONTESTED" }]);
    } finally {
      await provider.stop();
    }
  });
});
