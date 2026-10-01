// tests/integration/budget-waiting-line-end-to-end.test.ts
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresAskApplication, buildApi, type Dispatcher, type RunCreationSettings } from "@debateai/api";
import { WorkItemRepository } from "@debateai/battery";
import { BillingPersonAllowanceSource } from "@debateai/billing-core";
import {
  CostEnvelopeGuard,
  NO_PERSON_ALLOWANCE,
  PostgresModelSpendStore,
  PostgresRecentRunUsageSource,
  RecentRunsCostEstimator,
  costEnvelopeDay,
  mostOneRunMaySpendMicros,
  type ProviderTargetPrice
} from "@debateai/budget";
import {
  AnswerSchema,
  AskAcceptedSchema,
  PLAN_TIER_ROSTERS,
  RunProjectionSchema,
  type AskAccepted,
  type AskRequest
} from "@debateai/contract";
import { EntitlementRepository, RunWaitRepository, migrate } from "@debateai/db";
import { argumentLanguageDirective } from "@debateai/kernel";
import {
  BILLING_PLANS_DEPLOYMENT_REGISTER_ROW,
  CLAIM_TYPE_COMPOSITION_MAP_ROW_KEY,
  billingPlansFromValue,
  costEnvelopeBand
} from "@debateai/register";
import { WalkingSkeletonRunner, createPostgresProviderGateway, type WalkingSkeletonSettings } from "@debateai/runner";
import { AskRoom } from "../../apps/api/src/ask-room.js";
import type { AskBilling } from "../../apps/api/src/ask-billing.js";
import { fixtureDiscoveredPanel, fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import {
  TEST_APP_ORIGIN,
  testHttpIdentity,
  testSessionApplication,
  testSessionHeaders,
  type TestHttpIdentity
} from "../support/httpSession.js";
import { reviewArtifact, withRequestDerivedBearings } from "../support/reviewBearings.js";
import {
  provisionStoryEncryptedOwner,
  releaseStoryEncryptedOwner,
  type StoryEncryptedOwner
} from "../support/storyEncryptedOwner.js";
import { createTestAskAdmissionPoolFacades, startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * Budget spec 2026-09-28 §2.14, "End to end": one hosted-mode debate under a
 * tiny daily limit waits, wakes at a simulated reset, and answers. Everything
 * is real except the model vendor (a node:http double) and the clock (one
 * injected `now`, shared by the room, the estimator, the waker and the runner's
 * money seam): the HTTP route, the room, the waiting line, the waker, the
 * encrypted owner run, the runner and its hosted seam with the shared wall.
 * CI skips this directory; it is on the Part 1 pull request's hand-run list (B11d).
 */
let database: TestDatabase;
/**
 * The pool's one encrypted owner. `provisionStoryEncryptedOwner` configures the
 * pool's content cipher, which a pool takes once (CONTENT_CIPHER_ALREADY_CONFIGURED),
 * so both cases ask as this owner; each case keeps its own day. Billing off writes
 * no entitlement and pins no run, so the billing-on case still meets the owner's
 * Free sign-up for the first time.
 */
let owner: StoryEncryptedOwner;
let now = new Date("2031-10-01T10:00:00.000Z");

const PRIMARY_REF = "provider:test-layer";
const SECONDARY_REF = "provider:test-layer:secondary";
/** 0.1 micro-unit a token: a call's projection stays far below the tiny ceilings, so the limits in play are the day's. */
const PRICE: ProviderTargetPrice = Object.freeze({ inputMicrosPerMillionTokens: 100_000, outputMicrosPerMillionTokens: 100_000 });
const PRICES: ReadonlyMap<string, ProviderTargetPrice> = new Map([[PRIMARY_REF, PRICE], [SECONDARY_REF, PRICE]]);
/** The band, read the one way the services read it (B1): the kit's example values. */
const BAND = costEnvelopeBand({ closeBasisPoints: 9_500, finishBasisPoints: 11_500, waitingLinePerPerson: 1 })!;
/**
 * A tiny site day, 0.03 USD. It still holds one debate at its most, 0.024 USD
 * (the register's own rule: the day must hold one run with its answer's overrun).
 */
const GUARD_POLICY = Object.freeze({
  perRunCeilingMicros: 20_000,
  dailyCeilingMicros: 30_000,
  serveReserveBasisPoints: 3_000,
  serveOverrunBasisPoints: 2_000
});
/** With no settled debate to learn from, the estimate, and so the hold, is one debate's maximum (B2). */
const RUN_MAXIMUM = mostOneRunMaySpendMicros(GUARD_POLICY);
const PLANS = billingPlansFromValue(BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value, BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.sourceRef);
/** The Free roster's two models, on two makers the runner is configured with. */
const PANEL = fixtureDiscoveredPanel(2).map((member, index) => Object.freeze({
  ...member, model_id: PLAN_TIER_ROSTERS.free[index]!
}));

const ASK: AskRequest = {
  // No claim-type keyword (packages/judgement/src/s04.ts): the claim stays "unknown",
  // the one claim type the runner's composition row below maps.
  question_line: "Free public transport at the point of use in cities: a good idea or not?",
  risk_tier: "casual",
  tier_source: "ASKER",
  tier_provenance_ref: "asker-declaration:budget-e2e",
  composition_budget_tier: "low",
  depth_params: { depth: 1 },
  decision_scope: "budget waiting-line end to end",
  as_of: "2026-09-28T00:00:00.000Z",
  steering_presets: [],
  plan_tier: "free",
  steering_annotations: []
};

/** Each position the double writes is its own statement, as the database suite's scripted judgements are. */
function judgement(ordinal: number): string {
  const statement = `Free public transport pays for itself, reason ${String(ordinal)}: cleaner air and fewer cars.`;
  return JSON.stringify({
    statement, way_of_knowing: "REASONING", locator: null,
    restatement_text: statement, restatement_status: "PASS", value_laden: false, claim_type: "unknown",
    steelman: { summary: statement, fidelity: 0.72 },
    critic: { summary: "The strongest objection.", counterargumentStrength: 0.28, basis: "PLAUSIBLE_COUNTER" },
    evidence: { quality: 0.72, relevance: 0.72 }, context: { fit: 0.72, ambiguityFlags: [] },
    fallacy: { severity: 0.28, fatalFlags: [] }
  });
}
/** A panel seat scores fidelity 0, so it never displaces its author's voice (the database suite's default). */
const PANEL_ASSESSMENT = JSON.stringify({
  steelman: { summary: "Panel member assessment.", fidelity: 0 },
  critic: { summary: "Panel member counter.", counterargumentStrength: 1, basis: "PLAUSIBLE_COUNTER" },
  evidence: { quality: 0, relevance: 0 },
  context: { fit: 0, ambiguityFlags: [] },
  fallacy: { severity: 1, fatalFlags: [] }
});
const REVIEW = reviewArtifact("agree", ["The review found the position sound."]);
const COMPOSITION = JSON.stringify({ segments: [
  { segment_id: "segment:verdict", text: "Free public transport pays for itself.", node_refs: ["primary"], served_number_refs: ["number:final-strength"] },
  { segment_id: "segment:research", text: "Check an independent source.", node_refs: [], served_number_refs: [] }
] });
const EVALUATOR_SATISFIED = JSON.stringify({
  satisfied: true, objection: null,
  criteria: {
    fairness_to_losers: true, statement_label_agreement: true, no_overstatement: true,
    restatement: true, citation_tracing: true
  }
});

/**
 * Every packet's instruction ends with dev's language directive, which names
 * the identifiers the classes below key on (`served_number_refs`, `fatalFlags`…).
 * It is removed before any class is read, as the database suite's double does.
 */
const DIRECTIVE = new RegExp(
  argumentLanguageDirective("\u0000").replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace("\u0000", "[^.]+?"),
  "g"
);

type RequestClass = "PANEL" | "REVIEW" | "JUDGE" | "EVALUATOR" | "COMPOSE";

/** Which organ asked, by the contract its instruction carries; null for a request no organ makes. */
function classOf(body: string): RequestClass | null {
  let contract: string;
  try {
    const messages = (JSON.parse(body) as { readonly messages?: readonly { content: string }[] }).messages ?? [];
    contract = (messages[0]?.content ?? "").replace(DIRECTIVE, "");
  } catch {
    return null;
  }
  // The panel's assessment is the judge's schema without its restatement.
  if (contract.includes("fatalFlags") && !contract.includes("restatement_text")) return "PANEL";
  if (contract.includes("edge_bearings")) return "REVIEW";
  if (contract.includes("restatement_text")) return "JUDGE";
  if (contract.includes("fairness_to_losers")) return "EVALUATOR";
  if (contract.includes("served_number_refs")) return "COMPOSE";
  return null;
}

function requestedModel(body: string): string | undefined {
  try {
    const model = (JSON.parse(body) as { readonly model?: unknown }).model;
    return typeof model === "string" ? model : undefined;
  } catch {
    return undefined;
  }
}

/** One vendor double for both makers. It reports usage on every answer, as a hosted vendor must. */
async function startProviderDouble(): Promise<{
  readonly endpoint: string;
  calls(): number;
  unexpected(): number;
  stop(): Promise<void>;
}> {
  let calls = 0;
  let unexpected = 0;
  let judged = 0;
  const fixed: Readonly<Record<"PANEL" | "EVALUATOR" | "COMPOSE", string>> = Object.freeze({
    PANEL: PANEL_ASSESSMENT, EVALUATOR: EVALUATOR_SATISFIED, COMPOSE: COMPOSITION
  });
  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      calls += 1;
      const kind = classOf(body);
      const content = kind === null ? null
        : kind === "JUDGE" ? judgement((judged += 1))
          // A review measures exactly the edges THIS call offered (tests/support/reviewBearings.ts).
          : kind === "REVIEW" ? withRequestDerivedBearings(REVIEW, body)
            : fixed[kind];
      if (content === null) {
        unexpected += 1;
        response.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ error: "unexpected test call" }));
        return;
      }
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({
        id: `budget-e2e-${String(calls)}`,
        model: requestedModel(body),
        choices: [{ message: { content } }],
        usage: { prompt_tokens: 1_000, completion_tokens: 200 }
      }));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("BUDGET_E2E_PROVIDER_ADDRESS_FAILED");
  return {
    endpoint: `http://127.0.0.1:${address.port}`,
    calls: () => calls,
    unexpected: () => unexpected,
    async stop() { server.close(); await once(server, "close"); }
  };
}

/** The runner's sealed rows for a two-maker run, as tests/integration/database.test.ts provisions them. */
function runnerSettings(): WalkingSkeletonSettings {
  return {
    workerId: "runner:budget-e2e", claimMs: 10_000, claimMarginMs: 1_000,
    judgeBound: { maxAttempts: 1, tokenCeiling: 256, deadlineMs: 1_000 },
    composerBound: { maxAttempts: 1, tokenCeiling: 256, deadlineMs: 1_000 },
    conformanceBound: { maxAttempts: 1, tokenCeiling: 256, deadlineMs: 1_000 },
    providerRef: PRIMARY_REF, maker: "Primary test maker",
    judgeContractHash: "contract:judge:budget-e2e", composerContractHash: "contract:composer:budget-e2e",
    conformanceContractHash: "contract:conformance:budget-e2e",
    propagationContractHash: "contract:propagation:budget-e2e", serveContractHash: "contract:serve:budget-e2e",
    maxRecompose: 2, factBundleVersion: 1, judgementNumberKind: "base-probability",
    judgementProducer: "judgement:budget-e2e", propagationNumberKind: "propagated-probability",
    propagationProducer: "propagation:budget-e2e",
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
    panelPolicy: {
      registerVersion: 1,
      dispersionScale: 1,
      repeatedFamilyMultiplier: 0.5,
      disagreementThreshold: 0.25,
      oneStepDown: { TEST_CAPPED_BAND: "TEST_CAPPED_BAND", TEST_TOP_BAND: "TEST_CAPPED_BAND" },
      providerFamilies: [
        { familyRef: "test-layer:family:primary", providerRefs: [PRIMARY_REF] },
        { familyRef: "test-layer:family:secondary", providerRefs: [SECONDARY_REF] }
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
      synthesizerRoleRef: PRIMARY_REF,
      evaluatorRoleRef: PRIMARY_REF,
      evaluatorLoopMaxRounds: 3,
      identicalRoleRefs: true,
      synthesizerBound: { maxAttempts: 1, tokenCeiling: 512, deadlineMs: 1_000 },
      evaluatorBound: { maxAttempts: 1, tokenCeiling: 768, deadlineMs: 1_000 },
      sourceRefs: {
        synthesizerRoleRef: "test-layer:J8", evaluatorRoleRef: "test-layer:J8",
        evaluatorLoopMaxRounds: "test-layer:goal-v4:80-96"
      }
    },
    scoringOperator: { deploymentRowValue: "accumulate", registerRef: "test-layer:DR-144" },
    resolveTerminalActivations: async ({ waitingRows }) => waitingRows.map((batteryRowId) => ({
      batteryRowId,
      state: "INACTIVE" as const,
      predicateInputs: {
        kind: "PRESENT" as const, values: { fixture: "BUDGET-E2E", predicateResult: false, terminalEvaluation: true }
      },
      skipEvidence: {
        kind: "PRESENT" as const, evidenceType: "TEST_LAYER_TERMINAL_PREDICATE_RESULT", result: "FALSE_AT_COMPLETION"
      }
    }))
  };
}

/**
 * The hosted runner's money seam, as apps/runner/src/main.ts builds it (B9b):
 * the run's own ceilings, and for arguing calls the shared wall, the site's day
 * at 115% and each person's windows read through the read-only port (A20, R-12).
 */
function hostedGuard(): CostEnvelopeGuard {
  const spend = new PostgresModelSpendStore(database.pool);
  return new CostEnvelopeGuard({
    store: spend,
    policy: GUARD_POLICY,
    clock: () => now,
    sharedWall: {
      finishBasisPoints: BAND.finishBasisPoints,
      persons: new BillingPersonAllowanceSource({
        entitlements: new EntitlementRepository(database.pool).readOnlyPort(),
        plans: PLANS,
        closeBasisPoints: BAND.closeBasisPoints
      }),
      owners: spend
    }
  });
}

function hostedRunner(endpoint: string): WalkingSkeletonRunner {
  const guard = hostedGuard();
  const gateway = (model: string, maker: string) => createPostgresProviderGateway(database.pool, {
    endpoint, model, maker,
    // Each call names its phase and whether it is walled (B9b's third parameter).
    buildCostEnvelopeSeam: (runId, phase, sharedWall) => guard.providerSeam({
      runId, price: PRICE, requireReportedUsage: true, phase, sharedWall
    })
  });
  return new WalkingSkeletonRunner(database.pool, gateway("test-layer/primary-model", "Primary test maker"), {
    ...runnerSettings(),
    critique: {
      provider: gateway("test-layer/secondary-model", "Secondary test maker"),
      providerRef: SECONDARY_REF,
      maker: "Secondary test maker"
    },
    providerPrices: PRICES,
    bodyCostFallback: true
  });
}

/** The API side as the hosted boot composes it (B6b's `ask-room` step, B7b's line, B8's billing when on). */
function hostedApplication(input: Readonly<{ billing: boolean; dispatcher: Dispatcher }>): PostgresAskApplication {
  const spend = new PostgresModelSpendStore(database.pool);
  const estimator = new RecentRunsCostEstimator({
    source: new PostgresRecentRunUsageSource(database.pool),
    prices: PRICES,
    maximumMicros: RUN_MAXIMUM,
    clock: () => now
  });
  const entitlements = input.billing ? new EntitlementRepository(database.pool) : null;
  const personAllowance = entitlements === null
    ? NO_PERSON_ALLOWANCE
    : new BillingPersonAllowanceSource({ entitlements, plans: PLANS, closeBasisPoints: BAND.closeBasisPoints });
  const room = new AskRoom({
    lockPool: database.pool,
    spend,
    line: new RunWaitRepository(database.pool),
    estimator,
    personAllowance,
    entitlements,
    billingPlans: entitlements === null ? null : PLANS,
    dailyCeilingMicros: GUARD_POLICY.dailyCeilingMicros,
    closeBasisPoints: BAND.closeBasisPoints,
    waitingLinePerPerson: BAND.waitingLinePerPerson,
    clock: () => now
  });
  const billing: AskBilling | undefined = entitlements === null ? undefined : Object.freeze({
    plans: PLANS,
    entitlements,
    coarseFit: Object.freeze({ personAllowance, spend, estimator }),
    clock: () => now
  });
  const settings: RunCreationSettings = {
    strangerSampleRate: 0,
    registerVersion: 1,
    batteryVersion: "budget-e2e",
    settlementWatchHandle: "settlement-watch:budget-e2e",
    resolveDiscoveredPanel: async () => PANEL,
    resolveEnvelopeBasis: async ({ depthParams, panelSize }) => fixtureStructuralCeiling(100, panelSize, Number(depthParams.depth)),
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({
      effectiveRiskTier, tierSource: tierSource as "ASKER" | "MACHINE_DEFAULT" | "DEPLOYMENT_POLICY", tierProvenanceRef
    }),
    room,
    waitingLine: room,
    ...(billing === undefined ? {} : { billing })
  };
  return new PostgresAskApplication(
    database.pool, input.dispatcher, settings, undefined, database.pool, createTestAskAdmissionPoolFacades(database.pool)
  );
}

/** The owner's cookie session over the database's own account and session rows (encrypted runs need both). */
function signedIn(owner: StoryEncryptedOwner, label: string): TestHttpIdentity {
  const generated = testHttpIdentity(label);
  return Object.freeze({
    rawSessionToken: generated.rawSessionToken,
    rawCsrfToken: generated.rawCsrfToken,
    authenticated: Object.freeze({
      ...generated.authenticated,
      session: Object.freeze({
        ...generated.authenticated.session, asker_id: `owner:${owner.ownerRef}`, session_id: owner.sessionId
      }),
      userId: owner.userId,
      ownerRef: owner.ownerRef
    })
  });
}

/** One support charge fills the day: spend no debate made, as the B6b and B7b suites fill it. */
async function fillDay(day: string, micros: number): Promise<void> {
  await database.pool.query(
    `INSERT INTO ledger.model_spend
       (spend_id, spend_source, run_id, provider_ref, charged_on, charge_micros, input_tokens, output_tokens)
     VALUES ($1,'SUPPORT',NULL,'provider-1',$2::date,$3,1,1)`,
    [randomUUID(), day, micros]
  );
}

async function jobsOf(runId: string) {
  return (await database.pool.query<{ state: string; terminal_reason: string | null }>(
    "SELECT state, terminal_reason FROM core.work_item WHERE run_id=$1 ORDER BY created_at_seq", [runId]
  )).rows;
}

async function holdOf(runId: string): Promise<number | null> {
  const row = (await database.pool.query<{ held_micros: string }>(
    "SELECT held_micros::text AS held_micros FROM ledger.model_spend_hold WHERE run_id=$1", [runId]
  )).rows[0];
  return row === undefined ? null : Number(row.held_micros);
}

async function waitStartsOf(runId: string): Promise<number> {
  return (await database.pool.query("SELECT 1 FROM core.run_wait_start WHERE run_id=$1", [runId])).rowCount ?? 0;
}

async function chargeScopeOf(runId: string) {
  return (await database.pool.query<{ owner_ref: string; plan_id: string }>(
    "SELECT owner_ref::text AS owner_ref, plan_id FROM billing.run_charge_scope WHERE run_id=$1", [runId]
  )).rows;
}

async function failedReasonsOf(runId: string): Promise<readonly (string | null)[]> {
  return (await database.pool.query<{ terminal_reason: string | null }>(
    "SELECT terminal_reason FROM core.work_item WHERE run_id=$1 AND state='FAILED'", [runId]
  )).rows.map((row) => row.terminal_reason);
}

/** The runner claims the first job, then any job that job queued, until the run has none left. */
async function runUntilSettled(runner: WalkingSkeletonRunner, runId: string, firstWorkItemId: string): Promise<readonly string[]> {
  const kinds: string[] = [];
  const work = new WorkItemRepository(database.pool);
  let next: readonly string[] = [firstWorkItemId];
  for (let round = 0; round < 5 && next.length > 0; round += 1) {
    for (const workItemId of next) kinds.push((await runner.executeWorkItem(workItemId)).kind);
    next = (await work.listDispatchable(1_000)).filter((item) => item.runId === runId).map((item) => item.workItemId);
  }
  expect(next).toEqual([]);
  return kinds;
}

type Reset = Readonly<{ askedAt: string; beforeReset: string; afterReset: string; resetsAt: string }>;

/**
 * The whole chain, with the case's own checks at the two moments that differ
 * (billing on or off): once the question waits, and once the debate answered.
 */
async function waitWakeAndAnswer(input: Readonly<{
  label: string;
  billing: boolean;
  ask: AskRequest;
  reset: Reset;
  whileWaiting: (context: Readonly<{ runId: string; accepted: AskAccepted }>) => Promise<void>;
  afterAnswer: (context: Readonly<{ runId: string; owner: StoryEncryptedOwner }>) => Promise<void>;
}>): Promise<void> {
  now = new Date(input.reset.askedAt);
  const identity = signedIn(owner, input.label);
  const provider = await startProviderDouble();
  const dispatched: Array<Readonly<{ runId: string; workItemId: string }>> = [];
  const application = hostedApplication({
    billing: input.billing,
    dispatcher: { dispatch: async (job) => { dispatched.push(Object.freeze({ runId: job.runId, workItemId: job.workItemId })); } }
  });
  const api = buildApi({ application, sessions: testSessionApplication([identity]), allowedOrigin: TEST_APP_ORIGIN });
  const read = (path: string) => api.inject({ method: "GET", url: path, headers: testSessionHeaders(identity) });
  try {
    // The site's day is spent: one support charge fills it to the ceiling.
    await fillDay(costEnvelopeDay(now), GUARD_POLICY.dailyCeilingMicros);

    // Asked as a signed-in hosted owner: accepted, and waiting in line with no job.
    const asked = await api.inject({
      method: "POST", url: "/v1/asks",
      headers: { ...testSessionHeaders(identity, true), "content-type": "application/json" },
      payload: input.ask
    });
    expect(asked.statusCode).toBe(202);
    const accepted = AskAcceptedSchema.parse(asked.json());
    expect(accepted).toMatchObject({ status: "WAITING", waits_until: input.reset.resetsAt, waiting_scope: "SITE_DAY" });
    const runId = accepted.run_ref;
    expect(await jobsOf(runId)).toEqual([]);
    expect(await holdOf(runId)).toBeNull();
    expect(dispatched).toEqual([]);
    const waiting = RunProjectionSchema.parse((await read(`/v1/runs/${runId}`)).json());
    expect(waiting).toMatchObject({ state: "WAITING", waits_until: input.reset.resetsAt, terminal_reason: null });
    await input.whileWaiting({ runId, accepted });

    // A tick before the reset starts nothing: the day is still spent, so the tick stops.
    now = new Date(input.reset.beforeReset);
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ started: 0, failed: 0, stopped: true });
    expect(await jobsOf(runId)).toEqual([]);

    // The simulated reset. The first tick after it starts the question: its hold, its start mark, one job, dispatched.
    now = new Date(input.reset.afterReset);
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ started: 1, failed: 0, stopped: false });
    expect(dispatched.map((job) => job.runId)).toEqual([runId]);
    expect(await holdOf(runId)).toBe(RUN_MAXIMUM);
    expect(await waitStartsOf(runId)).toBe(1);
    expect(await new RunWaitRepository(database.pool).readWaiting(runId)).toBeNull();
    expect(await jobsOf(runId)).toEqual([{ state: "READY", terminal_reason: null }]);

    // The runner argues it to an answer under the hosted seam and the shared wall.
    const kinds = await runUntilSettled(hostedRunner(provider.endpoint), runId, dispatched[0]!.workItemId);
    expect(provider.unexpected()).toBe(0);
    expect(provider.calls()).toBeGreaterThan(0);
    expect(kinds[0]).toBe("COMPLETED");

    const settled = RunProjectionSchema.parse((await read(`/v1/runs/${runId}`)).json());
    expect(settled).toMatchObject({ state: "SETTLED", terminal_reason: null });
    const answered = await read(`/v1/runs/${runId}/answer`);
    expect(answered.statusCode).toBe(200);
    // An answer exists, for this run and its (decrypted) question; how many turns were argued is not the point (A5).
    expect(AnswerSchema.parse(answered.json())).toMatchObject({ run_ref: runId, question_line: input.ask.question_line });
    // Budget spec §2.9's invariant: no job of it ended FAILED, so neither shared code
    // (DAILY_COST_ENVELOPE_REACHED, PERSON_ALLOWANCE_REACHED) ended the debate.
    expect(await failedReasonsOf(runId)).toEqual([]);
    // It has no job left, so its hold no longer counts against the day it started on.
    expect(await new PostgresModelSpendStore(database.pool).readSiteCountedHoldsMicros(costEnvelopeDay(now))).toBe(0);
    await input.afterAnswer({ runId, owner });
  } finally {
    await api.close();
    await provider.stop();
  }
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  owner = await provisionStoryEncryptedOwner(database.pool);
}, 600_000);

afterAll(async () => {
  if (owner !== undefined) await releaseStoryEncryptedOwner(owner);
  await database?.stop();
});

describe("budget spec §2.14 — one hosted debate under a tiny daily limit waits, wakes at the reset, and answers", () => {
  it("with billing off: the site's day holds the question back, and the first tick after midnight starts it", async () => {
    await waitWakeAndAnswer({
      label: "budget-e2e-billing-off",
      billing: false,
      ask: ASK,
      reset: {
        askedAt: "2031-10-01T10:00:00.000Z",
        beforeReset: "2031-10-01T23:59:30.000Z",
        afterReset: "2031-10-02T00:00:30.000Z",
        resetsAt: "2031-10-02T00:00:00.000Z"
      },
      whileWaiting: async ({ accepted }) => {
        // Billing did not decide this ask, so the reply names no applied gauges.
        expect(accepted.applied).toBeUndefined();
      },
      afterAnswer: async ({ runId }) => {
        // R-19: with billing off no run is pinned to a person.
        expect(await chargeScopeOf(runId)).toEqual([]);
      }
    });
  }, 300_000);

  it("with billing on: a Free owner's question waits for the site's day, wakes pinned to its person, and answers", async () => {
    await waitWakeAndAnswer({
      label: "budget-e2e-billing-on",
      billing: true,
      // The page asks for more than Free allows; the server decides Free's sealed gauges (B8).
      ask: { ...ASK, plan_tier: "premium", risk_tier: "high-stakes", composition_budget_tier: "high", depth_params: { depth: 3 } },
      reset: {
        askedAt: "2031-10-10T10:00:00.000Z",
        beforeReset: "2031-10-10T23:59:30.000Z",
        afterReset: "2031-10-11T00:00:30.000Z",
        resetsAt: "2031-10-11T00:00:00.000Z"
      },
      whileWaiting: async ({ runId, accepted }) => {
        expect(accepted.applied).toEqual({ plan_tier: "free", risk_tier: "standard", composition_budget_tier: "low", depth: 2 });
        // Not pinned yet: a waiting question has no charge scope until it starts.
        expect(await chargeScopeOf(runId)).toEqual([]);
      },
      afterAnswer: async ({ runId, owner }) => {
        // R-19: the waking pinned the run to its owner's plan, the one Free entitlement the ask wrote.
        expect(await chargeScopeOf(runId)).toEqual([{ owner_ref: owner.ownerRef, plan_id: "FREE" }]);
        const events = await database.pool.query(
          "SELECT 1 FROM billing.entitlement_event WHERE owner_ref=$1::uuid AND cause='SIGNED_UP_FREE'", [owner.ownerRef]
        );
        expect(events.rowCount).toBe(1);
      }
    });
  }, 300_000);
});
