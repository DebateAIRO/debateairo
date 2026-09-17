// PROMOTED PROBE — seat REV-S02-p1-product-truth, mission debate-tiers, written against
// slice head 9ef275aa (slice/tiers-s02). Copy into <worktree>/tests/unit (refusal-face) or
// <worktree>/tests/integration (r12-readback) and run `pnpm exec vitest run <path>` from the
// worktree root. No absolute path is hard-coded; every path is relative to the worktree root
// (process.cwd()). Restores nothing: these probes MUTATE no file.
// Property under test: what V reads on the /new form, and what the 422 body carries,
// for every tier x panel shape — built from the CLAIM (SPEC-v2 R6/R7/R9/R10 + the honesty law),
// never from the author's tests.
import { describe, expect, it } from "vitest";
import {
  buildApi as buildApiBase,
  evaluateAskAdmission,
  type AskApplication,
  type RunCreationSettings
} from "@debateai/api";
import {
  createContractClient,
  PLAN_TIER_ROSTERS,
  type AskRequest,
  type PlanTier
} from "@debateai/contract";
import { createDebate } from "../../apps/ui/lib/api.js";
import { buildNewDebateAskConfig } from "../../apps/ui/app/new/defaults.js";
import {
  TEST_APP_ORIGIN,
  testHttpIdentity,
  testSessionApplication,
  testSessionHeaders
} from "../support/httpSession.js";

const IDENTITY = testHttpIdentity("revp1-product");
const HEADERS = testSessionHeaders(IDENTITY, true);

function member(modelId: string, provider: string, maker = `maker:${provider}`) {
  return Object.freeze({
    provider_ref: `provider:${provider}`,
    maker,
    model_id: modelId,
    probe_evidence_ref: `probe:${provider}`,
    probed_at: "2026-09-12T00:00:00.000Z"
  });
}

// The dev stack as COMMON section 6 measured it: only gpt-5.6-sol and claude-opus-5 probe HEALTHY.
const TODAYS_REAL_PANEL = [
  member("gpt-5.6-sol", "codex-cli", "maker:openai"),
  member("claude-opus-5", "claude-cli", "maker:anthropic")
];

function settingsFor(
  panel: readonly ReturnType<typeof member>[],
  seenPanelSizes: number[] = []
): RunCreationSettings {
  return {
    strangerSampleRate: 0,
    registerVersion: 1,
    batteryVersion: "probe",
    settlementWatchHandle: "probe",
    resolveDiscoveredPanel: async () => panel,
    resolveEnvelopeBasis: async ({ panelSize }) => {
      seenPanelSizes.push(panelSize);
      return { max_model_attempts: 1 };
    },
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({
      effectiveRiskTier,
      tierSource,
      tierProvenanceRef
    })
  };
}

function askFor(planTier: PlanTier): AskRequest {
  return {
    question_line: "Should the tier decide which models argue?",
    risk_tier: "standard",
    tier_source: "MACHINE_DEFAULT",
    tier_provenance_ref: "machine:plan-tier-free",
    composition_budget_tier: "low",
    depth_params: { depth: 2 },
    decision_scope: "probe scope",
    as_of: "2026-09-12T00:00:00.000Z",
    steering_presets: [],
    plan_tier: planTier,
    steering_annotations: []
  };
}

function apiOver(panel: readonly ReturnType<typeof member>[]) {
  const application: AskApplication = {
    withContentLease: async (_runId, use) => use(),
    submit: async (ask) => {
      await evaluateAskAdmission(settingsFor(panel), ask);
      return { run_ref: "11111111-1111-4111-8111-111111111111", status: "QUEUED" };
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

async function postAsk(panel: readonly ReturnType<typeof member>[], tier: PlanTier) {
  const api = apiOver(panel);
  const response = await api.inject({
    method: "POST",
    url: "/v1/asks",
    headers: HEADERS,
    payload: askFor(tier)
  });
  const body = response.json();
  await api.close();
  return { status: response.statusCode, error: body.error, message: body.message };
}

// The real client over the real injected server: the string /new renders at page.tsx:162,182.
async function screenTextForTier(panel: readonly ReturnType<typeof member>[], tier: PlanTier) {
  const api = apiOver(panel);
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
    planTier: tier,
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

describe("REV probe — the refusal V reads", () => {
  it("prints the 422 body for every tier x panel shape", async () => {
    const shapes: Array<[string, readonly ReturnType<typeof member>[], PlanTier]> = [
      ["TODAY free (sol+opus healthy)", TODAYS_REAL_PANEL, "free"],
      ["TODAY premium (sol+opus healthy)", TODAYS_REAL_PANEL, "premium"],
      ["empty panel free", [], "free"],
      ["empty panel premium", [], "premium"],
      ["free, one member present", [member("gpt-5.6-luna", "luna")], "free"],
      ["free, other member present", [member("claude-sonnet-5", "sonnet")], "free"],
      ["premium, one of three present", [member("claude-opus-5", "opus")], "premium"],
      ["free complete", [member("gpt-5.6-luna", "luna"), member("claude-sonnet-5", "sonnet")], "free"],
      ["premium complete", [
        member("gpt-5.6-sol", "sol"), member("claude-opus-5", "opus"), member("grok-4.6", "grok")
      ], "premium"]
    ];
    const rows: string[] = [];
    for (const [label, panel, tier] of shapes) {
      const result = await postAsk(panel, tier);
      rows.push(`${label}\n  status=${result.status}\n  error=${result.error}\n  message=${result.message}`);
    }
    console.log("\n=== 422 FACE MATRIX ===\n" + rows.join("\n"));
    expect(rows.length).toBe(9);
  });

  it("prints the exact on-screen string /new renders, via the real client and createDebate", async () => {
    const free = await screenTextForTier(TODAYS_REAL_PANEL, "free");
    const premium = await screenTextForTier(TODAYS_REAL_PANEL, "premium");
    console.log("\n=== ON-SCREEN AT /new, TODAY ===\nFREE   : " + free + "\nPREMIUM: " + premium);
    expect(free.length).toBeGreaterThan(0);
  });

  it("R4: panelSize passed to resolveEnvelopeBasis equals the roster size, both tiers", async () => {
    const freeSizes: number[] = [];
    await evaluateAskAdmission(settingsFor([
      member("zzz-noise", "noise"),
      member("claude-sonnet-5", "sonnet"),
      member("gpt-5.6-luna", "luna")
    ], freeSizes), askFor("free"));
    const premiumSizes: number[] = [];
    await evaluateAskAdmission(settingsFor([
      member("gpt-5.6-sol", "sol"),
      member("claude-opus-5", "opus"),
      member("grok-4.6", "grok"),
      member("gpt-5.6-luna", "luna")
    ], premiumSizes), askFor("premium"));
    console.log(`\n=== R4 ===\nfree panelSize=${JSON.stringify(freeSizes)} roster=${PLAN_TIER_ROSTERS.free.length}` +
      `\npremium panelSize=${JSON.stringify(premiumSizes)} roster=${PLAN_TIER_ROSTERS.premium.length}`);
    expect(freeSizes).toEqual([PLAN_TIER_ROSTERS.free.length]);
    expect(premiumSizes).toEqual([PLAN_TIER_ROSTERS.premium.length]);
  });

  it("R9 sweep: no substitution — a non-roster model never enters the returned panel", async () => {
    const result = await evaluateAskAdmission(settingsFor([
      member("gpt-5.6-sol", "sol"),
      member("claude-opus-5", "opus"),
      member("gpt-5.6-luna", "luna"),
      member("claude-sonnet-5", "sonnet"),
      member("grok-4.6", "grok"),
      member("some-other-model", "other")
    ]), askFor("free"));
    console.log("\n=== R9 free panel from a six-member discovery ===\n" +
      JSON.stringify(result.discoveredPanel.map((m) => m.model_id)));
    expect(result.discoveredPanel.map((m) => m.model_id)).toEqual([...PLAN_TIER_ROSTERS.free]);
  });

  it("honesty: a one-maker roster panel still serves, and prints its marks", async () => {
    const result = await evaluateAskAdmission(settingsFor([
      member("gpt-5.6-luna", "a", "maker:same"),
      member("claude-sonnet-5", "b", "maker:same")
    ]), askFor("free"));
    console.log("\n=== ONE-MAKER FREE PANEL ===\n" + JSON.stringify(result.criticUnavailableCap));
    expect(result.discoveredPanel).toHaveLength(2);
  });
});
