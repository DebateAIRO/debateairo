/**
 * Debate shape Phase 2a, Task 8: the live API stores, prices and reads the room for the NORMALISED ask.
 *
 *  - POST /v1/asks (submit) normalises every ask for its plan key before anything reads it: the stored depth_params
 *    is `{ depth }` exactly without the row, and all four settings with it (ruling PF9: Free's depth ceiling 2);
 *  - with billing on, the plan id (PLUS, PRO, MAX) is the key the shape, the coarse fit and the history class use;
 *  - GET /v1/asks/room reads the query's shape settings, normalised the same way;
 *  - a refusal whose message names the ceiling's own figures tells the caller its code only (I6);
 *  - the API boot reads the optional row once; the practice runner refuses a present row (PF10).
 */
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PostgresAskApplication, askRefusalPublicMessage, buildApi, evaluateAskAdmission, type AskApplication, type RunCreationSettings
} from "@debateai/api";
import { WorkItemRepository } from "@debateai/battery";
import { AskAcceptedSchema, PLAN_TIER_ROSTERS, type AskRequest, type Session } from "@debateai/contract";
import { RunCostSubstitutionRepository, RunRepository } from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import { LivenessRepository } from "@debateai/liveness";
import {
  BILLING_PLANS_DEPLOYMENT_REGISTER_ROW, billingPlansFromValue, computeStructuralCeilingBasis, debateShapePolicyStartValues, type PlanId
} from "@debateai/register";
import { ServeRepository } from "@debateai/serve";
import type { Pool, PoolClient, QueryResult } from "pg";
import type { AskBilling } from "../../apps/api/src/ask-billing.js";
import type { AskRoomPort, AskRoomReader, RoomDecision, RoomQuestion } from "../../apps/api/src/ask-room.js";
import { composePracticeRunner } from "../../tools/preview-practice/practice-runner-composition.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const WORK_ITEM_ID = "22222222-2222-4222-8222-222222222222";
const OWNER_REF = "44444444-4444-4444-8444-444444444444";
const EVENT_ID = "55555555-5555-4555-8555-555555555555";
const NOW = new Date("2026-10-13T12:00:00.000Z");
const POLICY = debateShapePolicyStartValues();
const plans = billingPlansFromValue(BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value, BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.sourceRef);
const CEILING_TERMS = Object.freeze({ judgeMaxAttempts: 3, organMaxAttempts: 3, maxRecompose: 1, maxCooldownHoldsPerRun: 1,
  finalRetryAttempts: 1, branchingFactor: 2, compositionSegmentCap: 4, fixedOrgansPerComposition: 6, reviewerCallsPerNode: 1,
  synthesizerMaxRounds: 3, evaluatorMaxRounds: 3, maxDepth: 5 });

function ask(overrides: Partial<AskRequest> = {}): AskRequest {
  return {
    question_line: "Should cities price congestion at peak hours?",
    risk_tier: "casual", tier_source: "ASKER", tier_provenance_ref: "asker:test", composition_budget_tier: "medium",
    depth_params: { depth: 3 }, decision_scope: "debate shape submit test", as_of: "2026-10-13T00:00:00.000Z",
    steering_presets: [], plan_tier: "premium", steering_annotations: [], ...overrides
  };
}

const serverSession: Session = {
  session_id: "33333333-3333-4333-8333-333333333333", asker_id: `owner:${OWNER_REF}`, caller_scope: "ASKER",
  ownership_provenance: "server_session", provisional_identity_model: false
};
const serverPrincipal = { kind: "server" as const, userId: "66666666-6666-4666-8666-666666666666", ownerRef: OWNER_REF };

function stubPool(): Pool {
  const query = vi.fn(async () => ({ rows: [{ locked: true, unlocked: true }], rowCount: 1 } as unknown as QueryResult));
  const client = Object.assign(new EventEmitter(), { query, release: vi.fn() }) as unknown as PoolClient;
  return { connect: vi.fn(async () => client), query } as unknown as Pool;
}

/** Both rosters, every model its own maker: the free roster is two makers, the premium roster three. */
const PANEL = [...PLAN_TIER_ROSTERS.free, ...PLAN_TIER_ROSTERS.premium].map((modelId, index) => Object.freeze({
  provider_ref: `provider:${index}`, maker: `maker:${index}`, model_id: modelId,
  probe_evidence_ref: `probe:${index}`, probed_at: "2026-10-13T00:00:00.000Z"
}));

function settingsWith(input: Readonly<{ policy: boolean; billing?: AskBilling; room?: AskRoomPort; shapes?: unknown[] }>): RunCreationSettings {
  return {
    strangerSampleRate: 0, registerVersion: 1, batteryVersion: "shape-submit", settlementWatchHandle: "shape-submit",
    resolveDiscoveredPanel: async () => PANEL,
    resolveEnvelopeBasis: async ({ depthParams, panelSize, backupSequencesProvisioned, shape }) => {
      input.shapes?.push(shape);
      return computeStructuralCeilingBasis({ ...CEILING_TERMS, panelSize, depth: Number(depthParams.depth), backupSequencesProvisioned,
        ...(shape === null ? {} : { shape }) });
    },
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({ effectiveRiskTier, tierSource: tierSource as never, tierProvenanceRef }),
    ...(input.billing === undefined ? {} : { billing: input.billing }),
    ...(input.room === undefined ? {} : { room: input.room }),
    ...(input.policy ? { debateShapePolicy: POLICY } : {})
  };
}

const START: RoomDecision = Object.freeze({ kind: "START", worst: "FITS", worstScope: null });
const ROOM_TX = Object.freeze({ query: vi.fn() }) as unknown as PoolClient;

function recordingRoom() {
  const questions: RoomQuestion[] = [];
  const room: AskRoomPort = {
    precheck: async (question) => {
      questions.push(question);
      return { admission: START, estimateMicros: 1_000, now: NOW, personUses: [],
        waitReason: Object.freeze({ waitsFor: "SITE" as const, personRecheckAt: null }) };
    },
    decide: async (question, apply) => {
      questions.push(question);
      return apply({ admission: START, estimateMicros: 1_000, now: NOW, tx: ROOM_TX });
    },
    enterWait: async () => undefined,
    openStart: async () => undefined,
    expectedStart: async () => null
  };
  return { room, questions };
}

function billingFor(planId: PlanId, day: Readonly<{ spent: number; limit: number }> | null = null) {
  const estimateMicros = vi.fn(async (_settings: unknown) => 1_000);
  const billing: AskBilling = Object.freeze({
    plans,
    entitlements: { current: vi.fn(async () => ({ planId, eventId: EVENT_ID })) },
    coarseFit: Object.freeze({
      personAllowance: {
        read: async () => day === null ? [] : [{
          scope: "PERSON_DAY" as const, limitMicros: day.limit, periodStart: new Date("2026-10-13T00:00:00.000Z"),
          resetsAt: new Date("2026-10-14T00:00:00.000Z"), finishBasisPoints: 11_000, closeBasisPoints: 9_500
        }]
      },
      spend: { readOwnerSpentMicros: async () => day?.spent ?? 0, readOwnerCountedHoldsMicros: async () => 0 },
      estimator: { estimateMicros }
    }),
    clock: () => NOW
  });
  return { billing, estimateMicros };
}

function arrange(input: Readonly<{ policy: boolean; billing?: AskBilling; room?: AskRoomPort }>) {
  const started: Array<Parameters<RunRepository["startRun"]>[0]> = [];
  const shapes: unknown[] = [];
  vi.spyOn(LivenessRepository.prototype, "recordQuery").mockResolvedValue(1);
  vi.spyOn(RunRepository.prototype, "startRun").mockImplementation(async (run) => {
    started.push(run);
    return RUN_ID;
  });
  vi.spyOn(ServeRepository.prototype, "recordMemoryQuestion").mockResolvedValue(undefined);
  vi.spyOn(WorkItemRepository.prototype, "enqueue").mockResolvedValue(WORK_ITEM_ID);
  vi.spyOn(WorkItemRepository.prototype, "enqueueOn").mockResolvedValue(WORK_ITEM_ID);
  vi.spyOn(WorkItemRepository.prototype, "recordSetupFailure").mockResolvedValue(true);
  vi.spyOn(RunCostSubstitutionRepository.prototype, "record").mockResolvedValue("substitution:shape");
  const application = new PostgresAskApplication(
    stubPool(), { dispatch: vi.fn(async () => undefined) }, settingsWith({ ...input, shapes }),
    { read: async () => [] }, stubPool(), { server: stubPool(), legacy: stubPool() }
  );
  return { application, started, shapes };
}

/** An application for the HTTP cases: every read answers nothing, and `submit` is the case's own. */
function fixtureApplication(
  submit: AskApplication["submit"] = async () => ({ run_ref: RUN_ID, status: "QUEUED" as const })
): AskApplication {
  return {
    withContentLease: async (_runId, use) => use(),
    submit,
    readAnswer: async () => null,
    readRunAnswer: async () => null,
    readRun: async () => null,
    readAnswerIndex: async (_session, limit, offset) => ({ items: [], open_runs: [], limit, offset, total: 0 }),
    readInspection: async () => null,
    readLedgerDigest: async () => null,
    readNode: async () => null,
    recordInvestigation: async () => null,
    unlinkMemoryLink: async () => null,
    readDeployment: async () => ({
      register: { register_version: 1, rows: [] }, scorecards: [], model_ledger: [],
      fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
    }),
    events: async function* () {}
  };
}

/** The invariant (notes 1 and 6): a stored ask has all four settings, in one order, or only its depth. */
function expectStoredShape(depthParams: unknown, expected: Record<string, unknown>): void {
  expect(depthParams).toEqual(expected);
  expect(Object.keys(depthParams as object)).toEqual(Object.keys(expected));
  expect([["depth"], ["depth", "depthMode", "scrutiny", "answerLength"]]).toContainEqual(Object.keys(depthParams as object));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("submit stores the normalised ask (note 1)", () => {
  it("billing off, the row present: Free's ask is adaptive, standard scrutiny and depth 2 at most (PF9); the shape is Free's", async () => {
    const { application, started, shapes } = arrange({ policy: true });
    await application.submit(ask({ plan_tier: "free",
      depth_params: { depth: 3, depthMode: "fixed", scrutiny: "deep", answerLength: "short" } }), serverSession, serverPrincipal);
    expectStoredShape(started[0]!.depthParams, { depth: 2, depthMode: "adaptive", scrutiny: "standard", answerLength: "short" });
    expect(shapes).toEqual([expect.objectContaining({ plan: "free", depthMode: "adaptive", scrutiny: "standard", answerLength: "short" })]);
    expect(started[0]!.envelopeBasis).toMatchObject({ formula_version: "DR-185-shape-v1", depth: 2 });
  });

  it("billing off, the row present: a depth-only ask is stored with all four settings at their defaults", async () => {
    const { application, started } = arrange({ policy: true });
    await application.submit(ask({ depth_params: { depth: 3 } }), serverSession, serverPrincipal);
    expectStoredShape(started[0]!.depthParams, { depth: 3, depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" });
  });

  it("the row absent: the shape settings a client sends are dropped and the stored bytes are today's", async () => {
    const { application, started, shapes } = arrange({ policy: false });
    await application.submit(ask({ depth_params: { depth: 3, depthMode: "fixed", scrutiny: "exhaustive", answerLength: "detailed" } }),
      serverSession, serverPrincipal);
    expect(JSON.stringify(started[0]!.depthParams)).toBe('{"depth":3}');
    expect(shapes).toEqual([null]);
    expect(started[0]!.envelopeBasis).toMatchObject({ formula_version: "DR-184-v4" });
  });

  it("billing on, a FREE person: the billing rewrite keeps the answer length and the shape normalises the rest", async () => {
    const { billing } = billingFor("FREE");
    const { application, started, shapes } = arrange({ policy: true, billing });
    const accepted = await application.submit(ask({
      plan_tier: "premium", depth_params: { depth: 5, depthMode: "fixed", scrutiny: "deep", answerLength: "detailed" }
    }), serverSession, serverPrincipal);
    expectStoredShape(started[0]!.depthParams, { depth: 2, depthMode: "adaptive", scrutiny: "standard", answerLength: "detailed" });
    expect(started[0]!.planTier).toBe("free");
    expect(shapes).toEqual([expect.objectContaining({ plan: "free", answerLength: "detailed" })]);
    expect(AskAcceptedSchema.parse(accepted).applied).toMatchObject({ plan_tier: "free", depth: 2 });
  });

  it("billing on, a PLUS person: the plan id is the shape's key, for the admission and for the coarse fit (note 6)", async () => {
    const { billing, estimateMicros } = billingFor("PLUS", { spent: 100_000, limit: 1_000_000 });
    const { application, started, shapes } = arrange({ policy: true, billing });
    await application.submit(ask({ plan_tier: "free", depth_params: { depth: 3, depthMode: "fixed", scrutiny: "exhaustive" } }),
      serverSession, serverPrincipal);
    expectStoredShape(started[0]!.depthParams, { depth: 3, depthMode: "fixed", scrutiny: "exhaustive", answerLength: "standard" });
    expect(started[0]!.planTier).toBe("premium");
    // Three premium makers: answers and map AIs 3, graders 2, no close-call extra left.
    expect(shapes).toEqual([expect.objectContaining({ plan: "plus", answers: 3, mapAIs: 3, graders: 2, closeCallExtraGraders: 0 })]);
    expect(estimateMicros).toHaveBeenCalledWith(expect.objectContaining({
      shape: { plan: "plus", depthMode: "fixed", scrutiny: "exhaustive", answerLength: "standard" }
    }));
  });
});

describe("the room path samples the history under the run's real plan (note 6)", () => {
  it("a PRO person's question is classed under pro, from the normalised ask", async () => {
    const { billing } = billingFor("PRO");
    const { room, questions } = recordingRoom();
    const { application, started } = arrange({ policy: true, billing, room });
    await application.submit(ask({ depth_params: { depth: 2, scrutiny: "deep" } }), serverSession, serverPrincipal);
    expect(questions.length).toBeGreaterThan(0);
    for (const question of questions) {
      expect(question.settingsClass).toMatchObject({ planTier: "premium", depth: 2,
        shape: { plan: "pro", depthMode: "adaptive", scrutiny: "deep", answerLength: "standard" } });
    }
    expectStoredShape(started[0]!.depthParams, { depth: 2, depthMode: "adaptive", scrutiny: "deep", answerLength: "standard" });
  });

  it("without the row the room's class carries no shape, as today", async () => {
    const { billing } = billingFor("PRO");
    const { room, questions } = recordingRoom();
    const { application } = arrange({ policy: false, billing, room });
    await application.submit(ask({ depth_params: { depth: 2, scrutiny: "deep" } }), serverSession, serverPrincipal);
    for (const question of questions) expect(question.settingsClass).not.toHaveProperty("shape");
  });
});

describe("GET /v1/asks/room reads the query's shape settings (note 2)", () => {
  async function readRoom(url: string, options: Readonly<{ policy: boolean; billing?: AskBilling }>): Promise<RoomQuestion> {
    const identity = testHttpIdentity("shape-room-read");
    const read: RoomQuestion[] = [];
    const askRoom: AskRoomReader = {
      readRoom: async (question) => {
        read.push(question);
        return { room: "FITS", scope: null, resetsAt: null, waitingRunRef: null, planId: null };
      }
    };
    const api = buildApi({
      application: fixtureApplication(), sessions: testSessionApplication([identity]), allowedOrigin: TEST_APP_ORIGIN, askRoom,
      ...(options.billing === undefined ? {} : { askBilling: options.billing }),
      ...(options.policy ? { debateShapePolicy: POLICY } : {})
    });
    try {
      const response = await api.inject({ method: "GET", url, headers: testSessionHeaders(identity) });
      expect(response.statusCode).toBe(200);
    } finally {
      await api.close();
    }
    expect(read).toHaveLength(1);
    return read[0]!;
  }
  const QUERY = "/v1/asks/room?plan_tier=premium&composition_budget_tier=high&depth=3&depth_mode=fixed&scrutiny=deep&answer_length=short";

  it("with the row: the query's settings reach the room's class, under the tier's key without billing", async () => {
    const question = await readRoom(QUERY, { policy: true });
    expect(question.settingsClass).toMatchObject({ planTier: "premium", depth: 3,
      shape: { plan: "premium", depthMode: "fixed", scrutiny: "deep", answerLength: "short" } });
  });

  it("with the row and billing on: under the person's plan id, normalised as submit would", async () => {
    expect((await readRoom(QUERY, { policy: true, billing: billingFor("MAX").billing })).settingsClass)
      .toMatchObject({ planTier: "premium", shape: { plan: "max", depthMode: "fixed", scrutiny: "deep", answerLength: "short" } });
    // A Free person: Free's depth gauge, then the shape's normalisation (no fixed depth, no deep scrutiny on Free).
    expect((await readRoom(QUERY, { policy: true, billing: billingFor("FREE").billing })).settingsClass)
      .toMatchObject({ planTier: "free", depth: 2, shape: { plan: "free", depthMode: "adaptive", scrutiny: "standard", answerLength: "short" } });
  });

  it("without the row the room's class is today's, whatever the query carries", async () => {
    expect((await readRoom(QUERY, { policy: false })).settingsClass).not.toHaveProperty("shape");
  });
});

describe("a refusal naming the ceiling's figures tells the caller its code only (note 5, I6)", () => {
  it("withholds the receipt readers' and the minting check's messages, and keeps every other message", () => {
    for (const code of ["RUN_COST_ENVELOPE_UNRESOLVED", "STRUCTURAL_CEILING_SHAPE_INVALID", "ASK_MODEL_ASSIGNMENT_INVALID"]) {
      expect(askRefusalPublicMessage(code, "serve reserve 41 disagrees with the serve leg's 40 attempts")).toBe(code);
    }
    expect(askRefusalPublicMessage("ASK_PLAN_TIER_MODEL_UNAVAILABLE", "The free plan needs x")).toBe("The free plan needs x");
  });

  it("POST /v1/asks: the body carries no figure, and the operator's log keeps the reason", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const identity = testHttpIdentity("shape-disclosure");
    const refusing: RunCreationSettings = {
      ...settingsWith({ policy: true }),
      resolveEnvelopeBasis: async () => {
        throw new TypedDomainError("RUN_COST_ENVELOPE_UNRESOLVED",
          "The run head has no valid register-supplied cost-envelope basis: serve reserve 41 disagrees with the serve leg's 40 attempts");
      }
    };
    const api = buildApi({
      application: fixtureApplication(async (sent) => {
        await evaluateAskAdmission(refusing, sent);
        return { run_ref: RUN_ID, status: "QUEUED" as const };
      }),
      sessions: testSessionApplication([identity]), allowedOrigin: TEST_APP_ORIGIN
    });
    try {
      const response = await api.inject({ method: "POST", url: "/v1/asks", headers: testSessionHeaders(identity, true), payload: ask() });
      expect(response.statusCode).toBe(422);
      expect(response.json()).toEqual({ error: "RUN_COST_ENVELOPE_UNRESOLVED", message: "RUN_COST_ENVELOPE_UNRESOLVED" });
      expect(response.body).not.toMatch(/[0-9]/u);
    } finally {
      await api.close();
    }
    const logged = errors.mock.calls.map(([line]) => String(line)).find((line) => line.includes("api.ask.refused"));
    expect(logged).toContain("serve reserve 41");
  });
});

describe("the boot reads the optional row (note 8) and the practice runner refuses a present one (note 7, PF10)", () => {
  it("apps/api/src/main.ts reads the row once at its register version, before the ask application, and hands it on", () => {
    const main = readFileSync(new URL("../../apps/api/src/main.ts", import.meta.url), "utf8");
    const read = 'boot.run("debate-shape-policy", () => readDebateShapePolicy(pool, environment.REGISTER_VERSION))';
    expect(main.split(read)).toHaveLength(2);
    expect(main.indexOf(read)).toBeLessThan(main.indexOf("new PostgresAskApplication("));
    // Once into the ask application's settings, once into the room read's options; absent = neither key.
    expect(main.split("...(debateShapePolicy === null ? {} : { debateShapePolicy }),")).toHaveLength(3);
    expect(main).toContain("...(input.shape === null ? {} : { shape: input.shape })");
  });

  function rowPool(row: unknown) {
    const asked: unknown[][] = [];
    const pool = {
      query: vi.fn(async (_sql: string, values: unknown[]) => {
        asked.push(values);
        if (values[1] === "debateShapePolicy") return { rows: row === undefined ? [] : [{ value_json: row }] };
        throw new Error("PRACTICE_TEST_NEXT_READ");
      })
    } as unknown as Pool;
    return { pool, asked };
  }
  const compose = (pool: Pool) => composePracticeRunner({
    pool, keepAlivePool: pool, budgetPorts: {} as never, remaining: {} as never,
    environment: { DEPLOYMENT_MODE: "local", REGISTER_VERSION: 7 } as never
  });

  it("a valid row refuses the practice runner before anything else is read; a malformed one too; no row passes on", async () => {
    const valid = rowPool(JSON.parse(JSON.stringify(POLICY)));
    await expect(compose(valid.pool)).rejects.toMatchObject({ code: "DEBATE_SHAPE_POLICY_RUNNER_PENDING" });
    expect(valid.asked).toEqual([[7, "debateShapePolicy"]]);
    await expect(compose(rowPool({ kind: "DEBATE_SHAPE_POLICY" }).pool)).rejects.toThrow(/^DEBATE_SHAPE_POLICY_INVALID:/u);
    const absent = rowPool(undefined);
    await expect(compose(absent.pool)).rejects.toThrow("PRACTICE_TEST_NEXT_READ");
    expect(absent.asked[0]).toEqual([7, "debateShapePolicy"]);
  });
});
