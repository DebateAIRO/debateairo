// PROMOTED PROBE — seat REV-S02-p2-product-truth, mission debate-tiers, written against
// slice head 88f8a01f (slice/tiers-s02, after FIX(S02) p1 F3+F1+F2).
// Copy into <worktree>/tests/unit and run `pnpm exec vitest run <path>` from the worktree root.
// No absolute path is hard-coded; every path is relative to the worktree root (process.cwd()).
// MUTATES nothing, so it restores nothing.
//
// Property under test (the CLAIM, not the patch): F2 added a NEW refusal code
// ASK_PLAN_TIER_INVALID at the exported admission boundary for an out-of-vocabulary plan tier.
// SPEC-v2 R6/R7 name exactly one refusal code for the tier path and R15 enumerates seven RED
// tests, none of them this one. So: can a real asker ever SEE this code, and what does the
// product put on the screen when they try? Measured over the real route and the real client.
import { describe, expect, it } from "vitest";
import {
  buildApi as buildApiBase,
  evaluateAskAdmission,
  type AskApplication,
  type RunCreationSettings
} from "@debateai/api";
import { createContractClient, type AskRequest } from "@debateai/contract";
import { createDebate } from "../../apps/ui/lib/api.js";
import { buildNewDebateAskConfig } from "../../apps/ui/app/new/defaults.js";
import {
  TEST_APP_ORIGIN,
  testHttpIdentity,
  testSessionApplication,
  testSessionHeaders
} from "../support/httpSession.js";

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const IDENTITY = testHttpIdentity("rev-s02-p2-product-invalid-tier");
const HEADERS = testSessionHeaders(IDENTITY, true);

function member(modelId: string, provider: string) {
  return Object.freeze({
    provider_ref: `provider:${provider}`,
    maker: `maker:${provider}`,
    model_id: modelId,
    probe_evidence_ref: `probe:${provider}`,
    probed_at: "2026-09-12T00:00:00.000Z"
  });
}

// Every roster member healthy: the ONLY thing that can refuse is the tier vocabulary itself.
const FULL_PANEL = Object.freeze([
  member("gpt-5.6-luna", "luna"),
  member("claude-sonnet-5", "sonnet"),
  member("gpt-5.6-sol", "sol"),
  member("claude-opus-5", "opus"),
  member("grok-4.6", "grok")
]);

function settingsFor(panel: readonly ReturnType<typeof member>[]): RunCreationSettings {
  return {
    strangerSampleRate: 0,
    registerVersion: 1,
    batteryVersion: "battery:probe",
    settlementWatchHandle: "watch:probe",
    resolveDiscoveredPanel: async () => panel,
    resolveEnvelopeBasis: async () => ({ max_model_attempts: 1 }),
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({
      effectiveRiskTier,
      tierSource,
      tierProvenanceRef
    })
  };
}

function askFor(tier: string): AskRequest {
  return {
    question_line: "Which models should debate this question?",
    risk_tier: "casual",
    tier_source: "ASKER",
    tier_provenance_ref: "asker:probe",
    composition_budget_tier: "low",
    depth_params: { depth: 1 },
    decision_scope: "invalid tier probe",
    as_of: "2026-09-12T00:00:00.000Z",
    steering_presets: [],
    plan_tier: tier as AskRequest["plan_tier"],
    steering_annotations: []
  };
}

function apiOver(panel: readonly ReturnType<typeof member>[]) {
  const application: AskApplication = {
    withContentLease: async (_runId, use) => use(),
    submit: async (submittedAsk) => {
      await evaluateAskAdmission(settingsFor(panel), submittedAsk);
      return { run_ref: RUN_ID, status: "QUEUED" };
    },
    readAnswer: async () => null,
    readRunAnswer: async () => null,
    readRun: async () => null,
    readAnswerIndex: async (_s, limit, offset) => ({
      items: [], open_runs: [], limit, offset, total: 0
    }),
    readInspection: async () => null,
    readLedgerDigest: async () => null,
    readNode: async () => null,
    recordInvestigation: async () => null,
    unlinkMemoryLink: async () => null,
    readDeployment: async () => ({
      register: { register_version: 1, rows: [] },
      scorecards: [],
      model_ledger: [],
      fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
    }),
    events: async function* () {}
  };
  return buildApiBase({
    application,
    sessions: testSessionApplication([IDENTITY]),
    allowedOrigin: TEST_APP_ORIGIN
  });
}

async function postTier(tier: unknown) {
  const api = apiOver(FULL_PANEL);
  const payload = { ...askFor("free"), plan_tier: tier } as unknown as AskRequest;
  const response = await api.inject({
    method: "POST",
    url: "/v1/asks",
    headers: HEADERS,
    payload
  });
  let body: Record<string, unknown> = {};
  try { body = response.json(); } catch { body = { raw: response.body }; }
  await api.close();
  return { status: response.statusCode, error: body.error, message: body.message };
}

// The real client over the real injected server: the string /new renders at page.tsx:162,182.
async function screenTextForTier(tier: string) {
  const api = apiOver(FULL_PANEL);
  const client = createContractClient("http://api.test", (async (input, init) => {
    const url = String(input);
    const sent = new Headers(init?.headers);
    const merged: Record<string, string> = {};
    sent.forEach((value, key) => { merged[key] = value; });
    const injected = await api.inject({
      method: (init?.method ?? "GET") as "POST",
      url: url.replace("http://api.test", ""),
      headers: { ...merged, ...HEADERS },
      payload: init?.body === undefined || init?.body === null
        ? undefined
        : JSON.parse(String(init.body))
    });
    return new Response(injected.body, {
      status: injected.statusCode,
      headers: { "content-type": "application/json" }
    });
  }) as typeof fetch);

  const config = buildNewDebateAskConfig({
    planTier: tier as never,
    riskTier: "standard" as never,
    budgetTier: "low" as never,
    decisionScope: "Deciding what to do next",
    asOf: "2026-09-12T00:00",
    depth: 2,
    steeringPresets: "",
    steeringAnnotations: "",
    asOfWasEdited: false,
    riskTierWasEdited: false
  }, new Date("2026-09-12T08:00:00.000Z"));

  let onScreen = "<no error thrown>";
  try {
    await createDebate("Should the tier decide which models argue?", config, "probe-token", client);
  } catch (exc) {
    onScreen = exc instanceof Error ? exc.message : "Unable to create debate";
  }
  await api.close();
  return onScreen;
}

describe("REV probe p2 — the out-of-vocabulary tier face", () => {
  it("prints the HTTP face for every out-of-vocabulary tier a client could send", async () => {
    const shapes: readonly [string, unknown][] = [
      ["gold", "gold"],
      ["constructor", "constructor"],
      ["__proto__", "__proto__"],
      ["toString", "toString"],
      ["FREE (case)", "FREE"],
      ["empty string", ""],
      ["number 1", 1],
      ["null", null],
      ["missing key", undefined]
    ];
    console.log("\n=== POST /v1/asks, full healthy panel, only the tier varies ===");
    for (const [label, value] of shapes) {
      const result = value === undefined
        ? await (async () => {
            const api = apiOver(FULL_PANEL);
            const { plan_tier: _drop, ...rest } = askFor("free") as Record<string, unknown>;
            const response = await api.inject({
              method: "POST", url: "/v1/asks", headers: HEADERS, payload: rest as never
            });
            let body: Record<string, unknown> = {};
            try { body = response.json(); } catch { body = {}; }
            await api.close();
            return { status: response.statusCode, error: body.error, message: body.message };
          })()
        : await postTier(value);
      console.log(
        `${label.padEnd(14)} status=${result.status} error=${String(result.error)}`
          + ` message=${String(result.message)}`
      );
    }
    const gold = await postTier("gold");
    expect(gold.status).toBe(400);
  });

  it("prints what the real client puts on the /new form for an out-of-vocabulary tier", async () => {
    console.log("\n=== ON SCREEN AT /new ===");
    for (const tier of ["gold", "constructor", "premium"]) {
      console.log(`${tier.padEnd(12)}: ${await screenTextForTier(tier)}`);
    }
  });

  it("prints the exported-boundary face, which is the only place the new code appears", async () => {
    console.log("\n=== evaluateAskAdmission() called directly, full healthy panel ===");
    for (const tier of ["gold", "constructor", "__proto__", "premium"]) {
      let line = "<admitted>";
      try {
        await evaluateAskAdmission(settingsFor(FULL_PANEL), askFor(tier));
      } catch (exc) {
        const error = exc as { name?: string; code?: string; message?: string };
        line = `${error.name}/${error.code}/${error.message}`;
      }
      console.log(`${tier.padEnd(12)}: ${line}`);
    }
  });
});
