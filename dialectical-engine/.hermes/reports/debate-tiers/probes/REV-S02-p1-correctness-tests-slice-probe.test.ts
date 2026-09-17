// TEMPORARY REVIEW FIXTURE — seat REV-S02-p1-correctness-tests, REV(S02) pass 1.
// Written from the CLAIM (SPEC-v2 R3/R4/R6/R7/R9 + acceptance steps 6-7), never from the
// author's tests. Deleted before the handoff; never committed.
import { describe, expect, it, vi } from "vitest";
import {
  buildApi,
  evaluateAskAdmission,
  PostgresAskApplication,
  type AskApplication,
  type RunCreationSettings
} from "@debateai/api";
import { PLAN_TIER_ROSTERS, type AskRequest, type Session } from "@debateai/contract";
import { RunRepository, type StartRunInput } from "@debateai/db";
import { WorkItemRepository } from "@debateai/battery";
import { LivenessRepository } from "@debateai/liveness";
import { ServeRepository } from "@debateai/serve";
import { EventEmitter } from "node:events";
import type { Pool, PoolClient, QueryResult } from "pg";
import {
  TEST_APP_ORIGIN,
  testHttpIdentity,
  testSessionApplication,
  testSessionHeaders
} from "../support/httpSession.js";

const IDENTITY = testHttpIdentity("rev-s02-probe");
const HEADERS = testSessionHeaders(IDENTITY, true);
const OWNER_REF = "44444444-4444-4444-8444-444444444444";
const RUN_ID = "11111111-1111-4111-8111-111111111111";

function member(modelId: string, tag: string) {
  return Object.freeze({
    provider_ref: `provider:${tag}`,
    maker: `maker:${tag}`,
    model_id: modelId,
    probe_evidence_ref: `probe:${tag}`,
    probed_at: "2026-09-12T00:00:00.000Z"
  });
}

// The panel today's dev stack actually produces (00-intake.md:52): gpt-5.6-sol and
// claude-opus-5 HEALTHY, grok-4.6's bridge CLI_HANDSHAKE_UNAVAILABLE, no Free model at all.
const DEV_STACK_PANEL = [member("gpt-5.6-sol", "sol"), member("claude-opus-5", "opus")];

function ask(planTier: AskRequest["plan_tier"]): AskRequest {
  return {
    question_line: "Does the roster filter hold?",
    risk_tier: "casual",
    tier_source: "ASKER",
    tier_provenance_ref: "rev:probe",
    composition_budget_tier: "low",
    depth_params: { depth: 1 },
    decision_scope: "rev probe",
    as_of: "2026-09-12T00:00:00.000Z",
    steering_presets: [],
    plan_tier: planTier,
    steering_annotations: []
  };
}

function settings(
  panel: readonly ReturnType<typeof member>[],
  seen: number[] = []
): RunCreationSettings {
  return {
    strangerSampleRate: 0,
    registerVersion: 1,
    batteryVersion: "rev:probe",
    settlementWatchHandle: "rev:probe",
    resolveDiscoveredPanel: async () => panel,
    resolveEnvelopeBasis: async ({ panelSize }) => {
      seen.push(panelSize);
      return { max_model_attempts: 1 };
    },
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({
      effectiveRiskTier, tierSource, tierProvenanceRef
    })
  };
}

function application(panel: readonly ReturnType<typeof member>[]): AskApplication {
  return {
    withContentLease: async (_runId, use) => use(),
    submit: async (submitted) => {
      await evaluateAskAdmission(settings(panel), submitted);
      return { run_ref: RUN_ID, status: "QUEUED" };
    },
    readAnswer: async () => null,
    readRunAnswer: async () => null,
    readRun: async () => null,
    readAnswerIndex: async (_s, limit, offset) => ({ items: [], open_runs: [], limit, offset, total: 0 }),
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

async function post(payload: unknown, panel = DEV_STACK_PANEL) {
  const api = buildApi({
    application: application(panel),
    sessions: testSessionApplication([IDENTITY]),
    allowedOrigin: TEST_APP_ORIGIN
  });
  const response = await api.inject({
    method: "POST", url: "/v1/asks", headers: HEADERS, payload: payload as never
  });
  await api.close();
  return response;
}

function stubPool(): Pool {
  const query = vi.fn(async () => ({
    rows: [{ locked: true, unlocked: true }], rowCount: 1
  } as unknown as QueryResult));
  const client = Object.assign(new EventEmitter(), { query, release: vi.fn() }) as unknown as PoolClient;
  return { connect: vi.fn(async () => client), query } as unknown as Pool;
}

describe("REV(S02) p1 correctness probe — whole slice, built from the CLAIM", () => {
  // Acceptance steps 6-7, Free, on today's real panel: the WHOLE body V reads, not just the code.
  it("answers the 422 face with every missing Free member named, verbatim", async () => {
    const response = await post(ask("free"));
    expect({ status: response.statusCode, body: response.json() }).toEqual({
      status: 422,
      body: {
        error: "ASK_PLAN_TIER_MODEL_UNAVAILABLE",
        message: "The free plan needs gpt-5.6-luna, claude-sonnet-5, and they are not available right now"
      }
    });
  });

  // Acceptance steps 6-7, Premium, on today's real panel.
  it("answers the 422 face with the one missing Premium member named, verbatim", async () => {
    const response = await post(ask("premium"));
    expect({ status: response.statusCode, body: response.json() }).toEqual({
      status: 422,
      body: {
        error: "ASK_PLAN_TIER_MODEL_UNAVAILABLE",
        message: "The premium plan needs grok-4.6, and it is not available right now"
      }
    });
  });

  // R3/R4/R9, exceeding the author's parameters: the panel arrives REVERSED, with two
  // non-roster members and a duplicate provider for one roster id.
  it("keeps roster order, the first provider per id, and excludes every non-roster member", async () => {
    const seen: number[] = [];
    const result = await evaluateAskAdmission(settings([
      member("grok-4.6", "grok-b"),
      member("model:evaluator-local", "evaluator"),
      member("grok-4.6", "grok-a"),
      member("claude-opus-5", "opus"),
      member("gpt-5.6-luna", "luna"),
      member("gpt-5.6-sol", "sol")
    ], seen), ask("premium"));

    expect(result.discoveredPanel.map((m) => `${m.model_id}@${m.provider_ref}`)).toEqual([
      "gpt-5.6-sol@provider:sol",
      "claude-opus-5@provider:opus",
      "grok-4.6@provider:grok-b"
    ]);
    expect(seen).toEqual([3]);
    expect(result.criticUnavailableCap).toMatchObject({ serves: true });
  });

  // R4 for Free, with the whole Premium roster also present and healthy.
  it("admits Free with exactly its two members while every Premium model is healthy", async () => {
    const seen: number[] = [];
    const result = await evaluateAskAdmission(settings([
      member("gpt-5.6-sol", "sol"),
      member("claude-opus-5", "opus"),
      member("grok-4.6", "grok"),
      member("claude-sonnet-5", "sonnet"),
      member("gpt-5.6-luna", "luna")
    ], seen), ask("free"));

    expect(result.discoveredPanel.map((m) => m.model_id)).toEqual(PLAN_TIER_ROSTERS.free);
    expect(seen).toEqual([2]);
  });

  // Cross-cluster (C2 filter -> C4 wire -> C1 column): one submit, both halves asserted.
  it("carries the filtered panel AND the plan tier into the same StartRunInput", async () => {
    const captured: StartRunInput[] = [];
    vi.spyOn(RunRepository.prototype, "startRun").mockImplementation(async (input) => {
      captured.push(input);
      return RUN_ID;
    });
    vi.spyOn(LivenessRepository.prototype, "recordQuery").mockResolvedValue(1);
    vi.spyOn(ServeRepository.prototype, "recordMemoryQuestion").mockResolvedValue(undefined);
    vi.spyOn(WorkItemRepository.prototype, "enqueue").mockResolvedValue("22222222-2222-4222-8222-222222222222");

    const session: Session = {
      session_id: "33333333-3333-4333-8333-333333333333",
      asker_id: `owner:${OWNER_REF}`,
      caller_scope: "ASKER",
      ownership_provenance: "server_session",
      provisional_identity_model: false
    };
    const full = [
      member("model:evaluator-local", "evaluator"),
      member("gpt-5.6-sol", "sol"),
      member("claude-opus-5", "opus"),
      member("grok-4.6", "grok")
    ];
    const app = new PostgresAskApplication(
      stubPool(),
      { dispatch: vi.fn(async () => undefined) },
      settings(full),
      { read: async () => [] },
      stubPool(),
      { server: stubPool(), legacy: stubPool() }
    );
    await app.submit(ask("premium"), session, {
      kind: "server", userId: "rev-probe-user", ownerRef: OWNER_REF
    });
    vi.restoreAllMocks();

    expect(captured).toHaveLength(1);
    expect(captured[0]!.planTier).toBe("premium");
    expect(captured[0]!.discoveredPanel.map((m) => m.model_id)).toEqual(PLAN_TIER_ROSTERS.premium);
  });

  // The shared surface with S01: a tier outside the enum never reaches the roster lookup.
  it("rejects an out-of-vocabulary plan tier at the contract, not at the roster lookup", async () => {
    const response = await post({ ...ask("free"), plan_tier: "gold" });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("MALFORMED_REQUEST");
  });

  // What evaluateAskAdmission does when called past the contract (it is an exported function).
  it("records what an out-of-vocabulary tier does INSIDE evaluateAskAdmission", async () => {
    const outcome = await evaluateAskAdmission(
      settings(DEV_STACK_PANEL),
      { ...ask("free"), plan_tier: "gold" } as unknown as AskRequest
    ).then(() => "resolved", (error: unknown) => ({
      name: (error as Error).name,
      code: (error as { code?: string }).code ?? null,
      message: (error as Error).message
    }));
    expect(outcome).toEqual({
      name: "TypeError",
      code: null,
      message: "Cannot read properties of undefined (reading 'map')"
    });
  });
});
