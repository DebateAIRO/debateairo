// TEMPORARY REVIEW FIXTURE — seat REV-S02-p2-correctness-tests, REV(S02) pass 2.
// Written from the CLAIM (SPEC-v2 R3/R4/R6/R7/R15 + the F2 claim that an out-of-vocabulary
// tier now leaves the exported boundary as a typed AskRefusal), never from the author's tests.
// Deleted before the handoff; never committed.
import { describe, expect, it } from "vitest";
import {
  buildApi,
  evaluateAskAdmission,
  type AskApplication,
  type RunCreationSettings
} from "@debateai/api";
import type { AskRequest } from "@debateai/contract";
import {
  TEST_APP_ORIGIN,
  testHttpIdentity,
  testSessionApplication,
  testSessionHeaders
} from "../support/httpSession.js";

const IDENTITY = testHttpIdentity("rev-s02-p2-probe");
const HEADERS = testSessionHeaders(IDENTITY, true);
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

const DEV_STACK_PANEL = [member("gpt-5.6-sol", "sol"), member("claude-opus-5", "opus")];

function ask(planTier: string): AskRequest {
  return {
    question_line: "Does the invalid-tier boundary hold?",
    risk_tier: "casual",
    tier_source: "ASKER",
    tier_provenance_ref: "rev:probe",
    composition_budget_tier: "low",
    depth_params: { depth: 1 },
    decision_scope: "rev probe",
    as_of: "2026-09-12T00:00:00.000Z",
    steering_presets: [],
    plan_tier: planTier as AskRequest["plan_tier"],
    steering_annotations: []
  };
}

function settings(
  panel: readonly ReturnType<typeof member>[],
  counters: { panel: number; envelope: number } = { panel: 0, envelope: 0 }
): RunCreationSettings {
  return {
    strangerSampleRate: 0,
    registerVersion: 1,
    batteryVersion: "rev:probe",
    settlementWatchHandle: "rev:probe",
    resolveDiscoveredPanel: async () => {
      counters.panel += 1;
      return panel;
    },
    resolveEnvelopeBasis: async () => {
      counters.envelope += 1;
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

async function refusalOf(planTier: string, panel: readonly ReturnType<typeof member>[]) {
  try {
    await evaluateAskAdmission(settings(panel), ask(planTier));
    return { name: "NO THROW", code: null as unknown, message: "" };
  } catch (error) {
    const err = error as { name?: string; code?: unknown; message?: string };
    return { name: err.name ?? "unknown", code: err.code ?? null, message: err.message ?? "" };
  }
}

// Every key a prototype-chain lookup could have reached, plus plain out-of-vocabulary
// strings and two near-misses of a legal tier.
const OUT_OF_VOCABULARY = [
  "constructor", "__proto__", "toString", "valueOf", "hasOwnProperty",
  "isPrototypeOf", "propertyIsEnumerable", "toLocaleString",
  "gold", "", "FREE", "free ", " premium", "0", "length"
];

describe("REV(S02) p2 correctness probe — the invalid-tier boundary", () => {
  it("refuses every out-of-vocabulary tier as a typed AskRefusal at the exported boundary", async () => {
    const outcomes = [] as { tier: string; name: string; code: unknown }[];
    for (const tier of OUT_OF_VOCABULARY) {
      const refusal = await refusalOf(tier, DEV_STACK_PANEL);
      outcomes.push({ tier, name: refusal.name, code: refusal.code });
    }
    expect(outcomes).toEqual(OUT_OF_VOCABULARY.map((tier) => ({
      tier, name: "AskRefusal", code: "ASK_PLAN_TIER_INVALID"
    })));
  });

  it("puts the invalid-tier refusal AHEAD of the model-unavailable refusal", async () => {
    // An empty panel would raise ASK_PLAN_TIER_MODEL_UNAVAILABLE for a legal tier.
    expect(await refusalOf("gold", [])).toMatchObject({
      name: "AskRefusal", code: "ASK_PLAN_TIER_INVALID"
    });
    expect(await refusalOf("free", [])).toMatchObject({
      name: "AskRefusal",
      code: "ASK_PLAN_TIER_MODEL_UNAVAILABLE",
      message: "The free plan needs gpt-5.6-luna, claude-sonnet-5, and they are not available right now"
    });
  });

  it("still resolves the discovered panel BEFORE it rejects an invalid tier", async () => {
    const counters = { panel: 0, envelope: 0 };
    await evaluateAskAdmission(settings(DEV_STACK_PANEL, counters), ask("gold")).catch(() => undefined);
    expect(counters).toEqual({ panel: 1, envelope: 0 });
  });

  it("reflects the caller's raw tier string into the refusal message", async () => {
    const refusal = await refusalOf("<script>alert(1)</script>", DEV_STACK_PANEL);
    expect(refusal).toEqual({
      name: "AskRefusal",
      code: "ASK_PLAN_TIER_INVALID",
      message: "The <script>alert(1)</script> plan tier is invalid"
    });
  });

  it("keeps the invalid tier UNREACHABLE over the real HTTP route (the S01 shared surface)", async () => {
    for (const tier of ["gold", "constructor", "__proto__", ""]) {
      const response = await post({ ...ask(tier) });
      expect({ tier, status: response.statusCode, error: response.json().error })
        .toEqual({ tier, status: 400, error: "MALFORMED_REQUEST" });
    }
  });

  it("still answers R6/R7 for both legal tiers on today's panel, body verbatim", async () => {
    expect({ status: (await post(ask("free"))).statusCode, body: (await post(ask("free"))).json() })
      .toEqual({
        status: 422,
        body: {
          error: "ASK_PLAN_TIER_MODEL_UNAVAILABLE",
          message: "The free plan needs gpt-5.6-luna, claude-sonnet-5, and they are not available right now"
        }
      });
    expect({ status: (await post(ask("premium"))).statusCode, body: (await post(ask("premium"))).json() })
      .toEqual({
        status: 422,
        body: {
          error: "ASK_PLAN_TIER_MODEL_UNAVAILABLE",
          message: "The premium plan needs grok-4.6, and it is not available right now"
        }
      });
  });

  it("keeps R4's envelope size equal to the roster size for both legal tiers", async () => {
    const full = [
      member("gpt-5.6-luna", "luna"), member("claude-sonnet-5", "sonnet"),
      member("gpt-5.6-sol", "sol"), member("claude-opus-5", "opus"),
      member("grok-4.6", "grok"), member("model:evaluator-local", "evaluator")
    ];
    const freeResult = await evaluateAskAdmission(settings(full), ask("free"));
    const premiumResult = await evaluateAskAdmission(settings(full), ask("premium"));
    expect(freeResult.discoveredPanel.map((m) => m.model_id))
      .toEqual(["gpt-5.6-luna", "claude-sonnet-5"]);
    expect(premiumResult.discoveredPanel.map((m) => m.model_id))
      .toEqual(["gpt-5.6-sol", "claude-opus-5", "grok-4.6"]);
  });
});
