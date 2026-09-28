import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createInitialBatteryRows, WorkItemRepository } from "@debateai/battery";
import { BudgetRepository, CostEnvelopeGuard, PostgresModelSpendStore, type ProviderTargetPrice } from "@debateai/budget";
import { SESSION_COOKIE_NAME, PostgresAskApplication, buildApi } from "@debateai/api";
import { AnswerDisclosureSchema, AnswerStorySchema, StoryBodySchema, type Session } from "@debateai/contract";
import { RunRepository, ServeDisclosureRepository, migrate } from "@debateai/db";
import { argumentLanguageDirective } from "@debateai/kernel";
import type { ProviderCallRequest, ProviderGateway } from "@debateai/providers";
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
import { createTestAskAdmissionPoolFacades, startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { persistCatchUpVersion } from "../support/catchUpVersion.js";
import { RepositoryAnswerStoryApplication, RepositoryPublicationStoryReader } from "../../apps/api/src/stories.js";
import { RepositoryAnswerDisclosureApplication } from "../../apps/api/src/disclosures.js";
import type { AuthenticatedSession, SessionApplication } from "../../apps/api/src/sessions.js";

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
  perStoryOverrunBasisPoints: 0,
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
    goal_marked_as_reading: true, speaks_to_the_person: true
  }
});

const CHECKER_OBJECTION = "The summary calls the answer settled, but the label says it is contested (P1).";
const CHECKER_OBJECTS = JSON.stringify({
  satisfied: false, objection: CHECKER_OBJECTION,
  criteria: {
    faithful_to_material: true, agrees_with_label: false, fair_to_losing_paths: true,
    no_overstatement: false, citations_correct: true, reviewer_note_separate: true,
    goal_marked_as_reading: true, speaks_to_the_person: true
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
      confidence: "Fairly sure, until a sourced objection turns up.",
      paths: [{ position_ref: "P1", fate: "HELD_UP", line: "The position held up.", node_refs: ["P1"] }],
      change: paragraph("A stronger, sourced objection would change the answer.")
    },
    why: { reasons: [paragraph("The one position held up against its strongest objection.")] },
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
  /** Task M5: the position's own statement, when a test must tell it from the answer-writer's prose. */
  readonly positionStatement?: string;
  /** Task M7: report usage on every answer, as a hosted vendor must, so the story's charges are written. */
  readonly reportUsage?: boolean;
}): Promise<{
  readonly endpoint: string;
  storyCalls(): number;
  /** Every material field every story request carried, repair turns included. */
  storyMaterial(): readonly string[];
  /** The same fields, by name. */
  storyFields(): readonly Readonly<{ name: string; content: string }>[];
  /** Every story request's system message: the owners' instruction and dev's language directive. */
  storySystem(): readonly string[];
  stop(): Promise<void>;
}> {
  let storyCalls = 0;
  let checkerCalls = 0;
  let served = 0;
  const storyMaterial: string[] = [];
  const storyFields: Readonly<{ name: string; content: string }>[] = [];
  const storySystem: string[] = [];
  const contentFor = async (body: string): Promise<string> => {
    const framed = readFramedMaterial(wirePacket(body));
    const contractId = framed.contractId;
    if (contractId === STORYTELLER_CONTRACT_ID || contractId === STORY_CHECKER_CONTRACT_ID) {
      storyMaterial.push(...framed.fields.map((field) => field.content));
      storyFields.push(...framed.fields.map((field) => Object.freeze({ name: field.name, content: field.content })));
      const messages = (JSON.parse(body) as { readonly messages?: readonly { role: string; content: string }[] }).messages ?? [];
      storySystem.push(...messages.filter((message) => message.role === "system").map((message) => message.content));
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
    if (body.includes("restatement_text")) {
      return input.positionStatement === undefined ? JUDGEMENT : JSON.stringify({
        ...JSON.parse(JUDGEMENT) as Record<string, unknown>,
        statement: input.positionStatement,
        restatement_text: input.positionStatement
      });
    }
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
          id, model: requestedModel(body), choices: [{ message: { content } }],
          ...(input.reportUsage === true ? { usage: { prompt_tokens: 1_000, completion_tokens: 200 } } : {})
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
    storyFields: () => [...storyFields],
    storySystem: () => [...storySystem],
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

async function createStoryDebate(
  label: string,
  maxModelAttempts = 10,
  language: { readonly tag: string; readonly name: string } | null = null
): Promise<{
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
    registerVersion: 1, batteryVersion: "s00", batteryRows,
    ...(language === null ? {} : { argumentLanguageTag: language.tag, argumentLanguageName: language.name })
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

/**
 * M5 review, I1: the owner routes need an owner. The runner suites use legacy
 * runs, so an ACTIVE account claims the settled run through the database's own
 * ownership event (what the legacy-run claim does), and a session for it reads
 * through the real API root.
 */
async function claimedByOwner(runId: string): Promise<AuthenticatedSession> {
  const userId = randomUUID();
  const ownerRef = randomUUID();
  const sessionId = randomUUID();
  await database.pool.query(
    `INSERT INTO identity."user" (
       user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
       phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
       adult_affirmed_at,created_at
     ) VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,'test-password-hash',$3,$4,$5,'active',now(),now())`,
    [userId, randomBytes(32), `story-e2e-${randomUUID()}`, randomUUID(), ownerRef]
  );
  await database.pool.query("SELECT core.append_run_ownership_event($1,$2)", [runId, ownerRef]);
  const session: Session = Object.freeze({
    asker_id: `owner:${ownerRef}`,
    session_id: sessionId,
    caller_scope: "ASKER" as const,
    ownership_provenance: "server_session" as const,
    provisional_identity_model: false as const
  });
  return Object.freeze({
    session, userId, ownerRef, tokenHash: `hash:${sessionId}`, csrfTokenHash: `hash:csrf:${sessionId}`, authKind: "cookie" as const
  });
}

/** The real API root over this database, for one owner, and the reads the tests make through it. */
async function ownerReads(owner: AuthenticatedSession, answerId: string) {
  const token = "o".repeat(43);
  const api = buildApi({
    application: new PostgresAskApplication(
      database.pool, {} as never, {} as never, undefined, database.pool,
      createTestAskAdmissionPoolFacades(database.pool)
    ),
    sessions: {
      authenticate: async (presented: string) => presented === token ? owner : null,
      verifyCsrf: () => false
    } as unknown as SessionApplication,
    allowedOrigin: "https://ui.story-e2e.test",
    stories: new RepositoryAnswerStoryApplication(new StoryRepository(database.pool)),
    disclosures: new RepositoryAnswerDisclosureApplication(new ServeDisclosureRepository(database.pool))
  });
  const get = async (path: string) => {
    const response = await api.inject({ method: "GET", url: `/v1/answers/${answerId}${path}`, headers: {
      cookie: `${SESSION_COOKIE_NAME}=${token}`
    } });
    expect(response.statusCode).toBe(200);
    return response.json() as unknown;
  };
  try {
    return {
      answer: await get("") as { answer_version: number; verdict_state: string | null },
      story: AnswerStorySchema.parse(await get("/story")),
      disclosure: AnswerDisclosureSchema.parse(await get("/disclosure")),
      // The publish-time read: the story of the version being published.
      publishedShort: await new RepositoryPublicationStoryReader(new StoryRepository(database.pool)).readStoryShort({
        answerId, answerVersion: 2, ownerRef: owner.ownerRef
      })
    };
  } finally {
    await api.close();
  }
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

/**
 * Task M7: a runner with a SECOND claim-eligible maker — the answer's checker,
 * outside the one-maker panel — so the story has a cheaper maker to fall back
 * on. A runner configured with more than one maker needs the sealed
 * panel-weighting, stopping and scoring rows (J12, T7, DR-074): provisioning
 * only, the database suite's own fixture values.
 */
function twoMakerSettings(input: Readonly<{
  secondRef: string;
  secondModel: string;
  secondMaker: string;
  secondProvider: ProviderGateway;
  story: StoryWriter;
  providerPrices: ReadonlyMap<string, ProviderTargetPrice>;
}>): WalkingSkeletonSettings {
  const settings = runnerSettings();
  return {
    ...settings,
    story: input.story,
    scoringOperator: { deploymentRowValue: "accumulate", registerRef: "test-layer:DR-144" },
    panelPolicy: {
      registerVersion: 1,
      dispersionScale: 1,
      repeatedFamilyMultiplier: 0.5,
      disagreementThreshold: 0.25,
      oneStepDown: { TEST_CAPPED_BAND: "TEST_CAPPED_BAND", TEST_TOP_BAND: "TEST_CAPPED_BAND" },
      providerFamilies: [
        { familyRef: "test-layer:family:primary", providerRefs: [settings.providerRef] },
        { familyRef: "test-layer:family:secondary", providerRefs: [input.secondRef] }
      ],
      unmappedReason: "PROVIDER_FAMILY_UNMAPPED",
      sourceRefs: {
        dispersionScale: "test-layer:J1",
        repeatedFamilyMultiplier: "test-layer:J1",
        disagreementThreshold: "test-layer:J1",
        downgradeBands: "test-layer:J1",
        providerFamilyMap: "test-layer:J1"
      }
    },
    stoppingPolicy: {
      registerVersion: 1,
      delta: 0,
      epsilon: 0,
      sourceRefs: { globalStopDelta: "test-layer:T7", branchFreezeEpsilon: "test-layer:T7" }
    },
    additionalMakers: [{ provider: input.secondProvider, providerRef: input.secondRef, maker: input.secondMaker }],
    // The answer's checker is the second maker, outside the one-maker panel,
    // so the run has two claim-eligible makers.
    synthesisRolePolicy: { ...settings.synthesisRolePolicy, evaluatorRoleRef: input.secondRef, identicalRoleRefs: false },
    claimTimeSynthesisRoleProbe: async () => ({ state: "HEALTHY" as const, modelId: input.secondModel, failureCode: null }),
    providerPrices: input.providerPrices
  };
}

/** Task M7: who each ledgered story call was made by, and what each story charge was charged to. */
async function storyLedger(runId: string): Promise<{
  readonly calls: readonly { call_site_key: string; actor_ref: string; outcome: string }[];
  readonly charges: readonly { provider_ref: string; spend_source: string }[];
}> {
  const calls = await database.pool.query<{ call_site_key: string; actor_ref: string; outcome: string }>(
    `SELECT call_site_key, actor_ref, outcome FROM ledger.ledger_entry
     WHERE run_id = $1 AND action_kind = 'MODEL_CALL' AND call_site_key LIKE 'STORY:%'
     ORDER BY call_site_key`,
    [runId]
  );
  const charges = await database.pool.query<{ provider_ref: string; spend_source: string }>(
    `SELECT provider_ref, spend_source FROM ledger.model_spend
     WHERE run_id = $1 AND spend_source = 'STORY' ORDER BY provider_ref`,
    [runId]
  );
  return { calls: calls.rows, charges: charges.rows };
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
    const debate = await createStoryDebate("story-e2e-ready", 10, { tag: "ro", name: "Romanian" });
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
      // R1: the run's own language, from its frozen head, is sealed with the story,
      // and both story prompts carry dev's directive in their one system message.
      expect(stored?.languageTag).toBe("ro");
      expect(provider.storySystem()).toHaveLength(2);
      for (const system of provider.storySystem()) expect(system).toContain(argumentLanguageDirective("Romanian"));
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
      // Task M1: asked as an answer-writing call, which sees the WHOLE ceiling:
      // even that is spent, so nothing of the run's allowance was left over.
      await expect(budget.assertModelAttemptAllowed(pinned.runId, "SERVE"))
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
        // A run with no confident language carries "und", dev's tag for it.
        pointNumbers: null, languageTag: "und"
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

  /**
   * Engine money rule, Task M7 (spec §14.4.6): the story's planned model cannot
   * be paid and a cheaper claim-eligible one can — through the REAL gateway,
   * the REAL story seam (with the story's 20% margin) and the REAL ledger. The
   * planned maker's tries are refused before sending, so its server never sees
   * a story request, and nothing is ledgered or charged to it.
   */
  it("writes the story on a cheaper claim-eligible maker when the planned one cannot be paid, at the same call sites, and names it (Task M7)", async () => {
    const debate = await createStoryDebate("story-e2e-m7-fallback");
    const planned = await startStoryDebateProvider({ storyteller: "valid", reportUsage: true });
    const cheaper = await startStoryDebateProvider({ storyteller: "valid", reportUsage: true });
    const CHEAPER_REF = "provider:test-layer:secondary";
    // 1 000 micro-units a token: no story call on the planned maker fits 60 000.
    const dear: ProviderTargetPrice = { inputMicrosPerMillionTokens: 1_000_000_000, outputMicrosPerMillionTokens: 1_000_000_000 };
    const cheap: ProviderTargetPrice = { inputMicrosPerMillionTokens: 1_000_000, outputMicrosPerMillionTokens: 1_000_000 };
    const guard = new CostEnvelopeGuard({
      store: new PostgresModelSpendStore(database.pool),
      policy: {
        perRunCeilingMicros: 1_000_000, dailyCeilingMicros: 1_000_000_000,
        perStoryCeilingMicros: 50_000, perStoryOverrunBasisPoints: 2_000
      }
    });
    const seen: { maker: "planned" | "cheaper"; request: ProviderCallRequest }[] = [];
    const gatewayFor = (
      maker: "planned" | "cheaper", endpoint: string, model: string, makerName: string,
      price: ProviderTargetPrice
    ): ProviderGateway => {
      const inner = createPostgresProviderGateway(database.pool, {
        endpoint, model, maker: makerName,
        buildStoryCostEnvelopeSeam: (runId: string) => guard.storySeam({ runId, price, requireReportedUsage: true })
      });
      return { call: (request) => { if (request.lane === "story") seen.push({ maker, request }); return inner.call(request); } };
    };
    try {
      const settings = runnerSettings();
      const writer = new StoryWriter({
        pool: database.pool, pack: PACK,
        policy: { ...LOCAL_STORY_POLICY, perStoryCeilingMicros: 50_000, perStoryOverrunBasisPoints: 2_000 },
        hosted: true, resolveProvider: () => null, log: () => undefined
      });
      const runner = new WalkingSkeletonRunner(
        database.pool,
        gatewayFor("planned", planned.endpoint, "test-layer/model", "test-layer", dear),
        twoMakerSettings({
          secondRef: CHEAPER_REF,
          secondModel: "test-layer/cheaper-model",
          secondMaker: "Cheaper story maker",
          secondProvider: gatewayFor("cheaper", cheaper.endpoint, "test-layer/cheaper-model", "Cheaper story maker", cheap),
          story: writer,
          providerPrices: new Map([[settings.providerRef, dear], [CHEAPER_REF, cheap]])
        })
      );
      const result = await runner.executeWorkItem(debate.workItemId);
      if (result.kind !== "COMPLETED") throw new Error(`STORY_E2E_EXPECTED_COMPLETION:${result.kind}`);

      // Written and checked by the cheaper maker, and the stored lineage — what
      // the PDF's "Written by / Checked by" prints — names it.
      const stored = await new StoryRepository(database.pool).readForAnswer({
        answerId: result.answerId, answerVersion: null, ownership: { legacyAskerId: debate.askerId }
      });
      expect(stored).toMatchObject({
        outcome: "READY", failureCode: null, rounds: 1,
        storytellerLineage: { provider_ref: CHEAPER_REF, maker: "Cheaper story maker", model_id: "test-layer/cheaper-model" },
        checkerLineage: { provider_ref: CHEAPER_REF, maker: "Cheaper story maker", model_id: "test-layer/cheaper-model" }
      });

      // The planned maker was asked first for each call, and the cheaper one
      // then took the SAME request: the same call site and the same framed bytes.
      expect(seen.map((entry) => `${entry.maker}:${entry.request.callSiteKey}`)).toEqual([
        "planned:STORY:STORYTELLER:1", "cheaper:STORY:STORYTELLER:1",
        "planned:STORY:CHECKER:1", "cheaper:STORY:CHECKER:1"
      ]);
      for (const [first, second] of [[seen[0]!, seen[1]!], [seen[2]!, seen[3]!]] as const) {
        expect(first.request.providerRef).toBe(settings.providerRef);
        expect(second.request.providerRef).toBe(CHEAPER_REF);
        expect(second.request.callSiteKey).toBe(first.request.callSiteKey);
        expect(second.request.contractHash).toBe(first.request.contractHash);
        expect(JSON.stringify(second.request.packet)).toBe(JSON.stringify(first.request.packet));
      }

      // Refused before sending: the planned maker's server saw no story request,
      // and the ledger and the spend hold the cheaper maker's two calls only.
      expect(planned.storyCalls()).toBe(0);
      expect(cheaper.storyCalls()).toBe(2);
      expect(await storyLedger(debate.runId)).toEqual({
        calls: [
          { call_site_key: "STORY:CHECKER:1", actor_ref: CHEAPER_REF, outcome: "OK" },
          { call_site_key: "STORY:STORYTELLER:1", actor_ref: CHEAPER_REF, outcome: "OK" }
        ],
        charges: [
          { provider_ref: CHEAPER_REF, spend_source: "STORY" },
          { provider_ref: CHEAPER_REF, spend_source: "STORY" }
        ]
      });
      // The served answer is the debate's, untouched.
      expect(await servedAnswers(result.answerId)).toEqual([{ answer_version: 1, verdict_state: "CONTESTED" }]);
    } finally {
      await cheaper.stop();
      await planned.stop();
    }
  });

  it("still ends FAILED/STORY_ENVELOPE_EXHAUSTED when no claim-eligible maker can pay for the story (Task M7)", async () => {
    const debate = await createStoryDebate("story-e2e-m7-none-fits");
    const planned = await startStoryDebateProvider({ storyteller: "valid", reportUsage: true });
    const other = await startStoryDebateProvider({ storyteller: "valid", reportUsage: true });
    const OTHER_REF = "provider:test-layer:secondary";
    const dear: ProviderTargetPrice = { inputMicrosPerMillionTokens: 1_000_000_000, outputMicrosPerMillionTokens: 1_000_000_000 };
    const guard = new CostEnvelopeGuard({
      store: new PostgresModelSpendStore(database.pool),
      policy: {
        perRunCeilingMicros: 1_000_000, dailyCeilingMicros: 1_000_000_000,
        perStoryCeilingMicros: 50_000, perStoryOverrunBasisPoints: 2_000
      }
    });
    const gatewayFor = (endpoint: string, model: string, makerName: string): ProviderGateway =>
      createPostgresProviderGateway(database.pool, {
        endpoint, model, maker: makerName,
        buildStoryCostEnvelopeSeam: (runId: string) => guard.storySeam({ runId, price: dear, requireReportedUsage: true })
      });
    try {
      const settings = runnerSettings();
      const writer = new StoryWriter({
        pool: database.pool, pack: PACK,
        policy: { ...LOCAL_STORY_POLICY, perStoryCeilingMicros: 50_000, perStoryOverrunBasisPoints: 2_000 },
        hosted: true, resolveProvider: () => null, log: () => undefined
      });
      const result = await new WalkingSkeletonRunner(
        database.pool,
        gatewayFor(planned.endpoint, "test-layer/model", "test-layer"),
        twoMakerSettings({
          secondRef: OTHER_REF,
          secondModel: "test-layer/other-model",
          secondMaker: "Other story maker",
          secondProvider: gatewayFor(other.endpoint, "test-layer/other-model", "Other story maker"),
          story: writer,
          providerPrices: new Map([[settings.providerRef, dear], [OTHER_REF, dear]])
        })
      ).executeWorkItem(debate.workItemId);
      if (result.kind !== "COMPLETED") throw new Error(`STORY_E2E_EXPECTED_COMPLETION:${result.kind}`);
      await expect(new StoryRepository(database.pool).readForAnswer({
        answerId: result.answerId, answerVersion: null, ownership: { legacyAskerId: debate.askerId }
      })).resolves.toMatchObject({
        outcome: "FAILED", failureCode: "STORY_ENVELOPE_EXHAUSTED", rounds: 0, artifactRefs: [],
        storytellerLineage: null, checkerLineage: null
      });
      expect(planned.storyCalls()).toBe(0);
      expect(other.storyCalls()).toBe(0);
      expect(await storyLedger(debate.runId)).toEqual({ calls: [], charges: [] });
      expect(await servedAnswers(result.answerId)).toEqual([{ answer_version: 1, verdict_state: "CONTESTED" }]);
    } finally {
      await other.stop();
      await planned.stop();
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

  /**
   * ENGINE MONEY RULE (spec §14.4.4), TASK M5 — a FLOOR answer gets a story too.
   * No digest can exist (every tier's bound is one byte), so no answer-writer is
   * called and the sealed answer ends COMPONENTS_ONLY; the label derived before
   * that step is the floor. The story's snapshot takes the SAME label basis, and
   * its answer is the leading position's own statement.
   */
  it("writes the story of a floor answer from the label's own basis, with the leading position's statement as its answer (Task M5)", async () => {
    const debate = await createStoryDebate("story-e2e-floor");
    const positionStatement = "Rent near work beats a cheaper place across town.";
    const provider = await startStoryDebateProvider({ storyteller: "valid", positionStatement });
    try {
      const settings = runnerSettings();
      const policy = settings.servePolicy!;
      const tiny = (tier: "low" | "medium" | "high") => ({ ...policy.compositionBudgets[tier], bound: 1 });
      const runner = new WalkingSkeletonRunner(database.pool, createPostgresProviderGateway(database.pool, {
        endpoint: provider.endpoint, model: "test-layer/model", maker: "test-layer"
      }), {
        ...settings,
        servePolicy: { ...policy, compositionBudgets: { low: tiny("low"), medium: tiny("medium"), high: tiny("high") } },
        story: storyWriter(LOCAL_STORY_POLICY)
      });
      const result = await runner.executeWorkItem(debate.workItemId);
      if (result.kind !== "COMPLETED") throw new Error(`STORY_E2E_EXPECTED_COMPLETION:${result.kind}`);
      // The sealed answer is components-only and carries no label: nothing faked.
      expect(await servedAnswers(result.answerId)).toEqual([{ answer_version: 1, verdict_state: null }]);
      const root = await database.pool.query<{ node_id: string }>(
        `SELECT node_id::text AS node_id FROM core.node
         WHERE run_id = $1 AND parent_node_id IS NULL ORDER BY created_at_seq LIMIT 1`,
        [debate.runId]
      );
      const rootNodeId = root.rows[0]?.node_id;
      if (rootNodeId === undefined) throw new Error("STORY_E2E_ROOT_UNRESOLVED");
      // M5 review, I2: one maker, so the label had neither a margin nor a
      // disagreement measure — its receipt says so, and so does the floor.
      // Read as the owner reads it: the latest version with a row, under the run's ownership.
      expect((await new ServeDisclosureRepository(database.pool).readLatestForAnswer({
        answerId: result.answerId, ownership: { ownerRef: null, legacyAskerId: debate.askerId }
      }))?.row).toMatchObject({
        answerVersion: 1,
        floorVerdictState: "CONTESTED", floorLeadingNodeId: rootNodeId, floorReason: "DIGEST_CANNOT_EXIST",
        floorBasisIncomplete: true
      });
      // No answer-writing call: the only model calls after the debate are the story's.
      const composer = await database.pool.query(
        `SELECT 1 FROM ledger.ledger_entry WHERE run_id = $1 AND action_kind = 'MODEL_CALL'
           AND (call_site_key LIKE 'COMPOSER:%' OR call_site_key LIKE 'POST_COMPOSE_R9:%')`,
        [debate.runId]
      );
      expect(composer.rowCount).toBe(0);
      expect(await storyCallSites(debate.runId)).toEqual(["STORY:CHECKER:1", "STORY:STORYTELLER:1"]);

      const stored = await new StoryRepository(database.pool).readForAnswer({
        answerId: result.answerId, answerVersion: null, ownership: { legacyAskerId: debate.askerId }
      });
      expect(stored).toMatchObject({ outcome: "READY", failureCode: null, shapeId: PACK.defaultShape, rounds: 1 });
      // The label basis is the one the floor's label was derived from: the same
      // label, rung and position; no band, because nothing was served.
      expect(stored?.verdictBasis).toMatchObject({
        label: "CONTESTED", rung: 0, trigger: "BASIS_INCOMPLETE", winner_node_id: rootNodeId,
        margin: null, disagreement: null, confidence_band: null
      });
      expect(stored?.verdictBasis?.marks).toContain("DIGEST-CANNOT-EXIST");
      // The story's answer is the leading position's own statement.
      const served = provider.storyFields().filter((field) => field.name === "served_statement");
      expect(served.length).toBeGreaterThan(0);
      for (const field of served) expect(JSON.parse(field.content)).toEqual([positionStatement]);
      for (const content of provider.storyMaterial()) expect(content).not.toMatch(UUID_SHAPED);
    } finally {
      await provider.stop();
    }
  });
});

/**
 * M5 review, I1 — a DR-184 review catch-up appends version 2 with no story and
 * no disclosure record of its own, and carries the verdict forward. The owner's
 * story route and the publish-time read must still find version 1's story.
 */
describe("verdict story — a review catch-up version keeps the story (M5 review, I1)", () => {
  it("serves a SERVED answer's READY story through the owner route after a catch-up version 2, and publishes it", async () => {
    const debate = await createStoryDebate("story-e2e-catch-up-served");
    const provider = await startStoryDebateProvider({ storyteller: "valid" });
    try {
      const result = await runnerWith(provider.endpoint, storyWriter(LOCAL_STORY_POLICY)).executeWorkItem(debate.workItemId);
      if (result.kind !== "COMPLETED") throw new Error(`STORY_E2E_EXPECTED_COMPLETION:${result.kind}`);
      expect(await persistCatchUpVersion(database.pool, debate.runId)).toBe(2);
      const reads = await ownerReads(await claimedByOwner(debate.runId), result.answerId);
      expect(reads.answer).toMatchObject({ answer_version: 2, verdict_state: "CONTESTED" });
      expect(reads.story).toMatchObject({ answer_version: 1, status: "READY", unavailable_reason: null });
      expect(StoryBodySchema.parse(reads.story.story)).toEqual(reads.story.story);
      // The record belongs to version 1, the one the runner wrote.
      expect(reads.disclosure).toMatchObject({ answer_version: 1, floor: null, floor_reason: null });
      expect(reads.publishedShort?.headline).toBe(reads.story.story?.short.headline);
    } finally {
      await provider.stop();
    }
  });

  it("serves a FLOOR answer's READY story, its floor and its thin basis after a catch-up version 2, and publishes it", async () => {
    const debate = await createStoryDebate("story-e2e-catch-up-floor");
    const provider = await startStoryDebateProvider({ storyteller: "valid", positionStatement: "A floor position." });
    try {
      const settings = runnerSettings();
      const policy = settings.servePolicy!;
      const tiny = (tier: "low" | "medium" | "high") => ({ ...policy.compositionBudgets[tier], bound: 1 });
      const result = await new WalkingSkeletonRunner(database.pool, createPostgresProviderGateway(database.pool, {
        endpoint: provider.endpoint, model: "test-layer/model", maker: "test-layer"
      }), {
        ...settings,
        servePolicy: { ...policy, compositionBudgets: { low: tiny("low"), medium: tiny("medium"), high: tiny("high") } },
        story: storyWriter(LOCAL_STORY_POLICY)
      }).executeWorkItem(debate.workItemId);
      if (result.kind !== "COMPLETED") throw new Error(`STORY_E2E_EXPECTED_COMPLETION:${result.kind}`);
      expect(await persistCatchUpVersion(database.pool, debate.runId)).toBe(2);
      const reads = await ownerReads(await claimedByOwner(debate.runId), result.answerId);
      expect(reads.answer).toMatchObject({ answer_version: 2, verdict_state: null });
      expect(reads.story).toMatchObject({ answer_version: 1, status: "READY" });
      expect(reads.disclosure).toMatchObject({
        answer_version: 1,
        floor: { verdict_state: "CONTESTED", basis_incomplete: true },
        floor_reason: "DIGEST_CANNOT_EXIST",
        digest: null
      });
      expect(reads.publishedShort?.headline).toBe(reads.story.story?.short.headline);
    } finally {
      await provider.stop();
    }
  });
});
