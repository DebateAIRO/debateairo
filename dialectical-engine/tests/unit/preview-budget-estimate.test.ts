// Owner's rule (never stop a debate half-way; estimate before it starts), contract A §5: on the
// private preview, admission asks the gate's read-only POST /remaining what is left today and
// refuses a debate that would not fit BEFORE any run exists, with the existing daily code
// (DAILY_COST_ENVELOPE_REACHED: 429 and the plain "today's limit is used up" sentence). Off the
// preview nothing changes and the gate is never asked.
import { createServer, type Server, type ServerResponse } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildApi,
  evaluateAskAdmission,
  PostgresAskApplication,
  type AskApplication,
  type RunCreationSettings
} from "@debateai/api";
import type { AskRequest } from "@debateai/contract";
import {
  createPreviewRemainingRpcPort,
  parsePreviewProviderTestConfig,
  PREVIEW_GATE_UNREACHABLE,
  type PreviewGateRemaining,
  type PreviewProviderTestConfig
} from "@debateai/providers";
import {
  estimatePreviewGateNeeds,
  estimateUnfinishedRunHolds,
  previewGateEstimateCalls,
  previewGateEstimateNanoUsd,
  previewExpectedCalls,
  PreviewGateUnavailableRefusal,
  PREVIEW_UNAVAILABLE_RETRY_MS,
  PREVIEW_UNFINISHED_RUNS_SQL,
  type PreviewUnfinishedRun,
  nextBucharestMidnight,
  PreviewDailyLimitRefusal,
  type PreviewBudgetGateSettings
} from "../../apps/api/src/preview-budget-estimate.js";
import { AskRefusal, askRefusalRetryAfter } from "../../apps/api/src/index.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";

const GLM = "zai-org/GLM-5.3-Flash";
const DEEPSEEK = "deepseek-ai/DeepSeek-V4.1-Flash";
const MIMO = "XiaomiMiMo/MiMo-V2.6-Pro";
const PREVIEW = parsePreviewProviderTestConfig(JSON.stringify({
  deployment: "v3-preview", free_model_ids: [GLM, DEEPSEEK], premium_model_ids: [GLM, DEEPSEEK, MIMO],
  requested_thinking_level: "high", budget_socket: "/run/debateai-v3-preview/provider-budget.sock", scope_id: "fixture"
}))!;
const ASK = Object.freeze({
  question_line: "Should cities price congestion on central roads?",
  risk_tier: "casual", tier_source: "ASKER", tier_provenance_ref: "asker-declaration:test",
  composition_budget_tier: "low", plan_tier: "free", depth_params: { depth: 1 },
  decision_scope: "test-layer scope", as_of: "2026-10-10T00:00:00.000Z",
  steering_presets: [], steering_annotations: []
}) as unknown as AskRequest;

/** A two-debater, depth-1 basis as computeStructuralCeilingBasis mints it (2 roots x 3 nodes + 2 exchanges). */
function basis(panelSize: number): Readonly<Record<string, unknown>> {
  return Object.freeze({
    kind: "COMPUTED_STRUCTURAL_CEILING", panel_size: panelSize, depth: 1, max_model_attempts: 120, hold_cap: 2,
    call_sites: { author: 8, panel: 8, reviewer: 8, serve: 6 },
    serve_leg: { synthesis_loop_sites: 6, selected: "SYNTHESIS_LOOP" }
  });
}
const PANEL = Object.freeze([
  { provider_ref: "preview:fixture-a", model_id: GLM },
  { provider_ref: "preview:deepseek-v4-1-flash", model_id: DEEPSEEK }
]);
// One call per site is 2 + 4 + 2 + 8 + 8 + 3 + 3 = 30; the basis's ceiling with repeat attempts is 120.
// Story: 2 rounds x (storyteller twice + checker) = 6. Pickup health checks: (1 + hold_cap 2) x
// (2 panel members + fixture-b, the checker, off the panel) = 9. Total 135.
const EXPECTED_CALLS = 135;
// With the 15% margin: ceil(155.25) = 156; plus 4 in flight = 160 calls needed.
const CALLS_NEEDED = 160;
// DeepSeek is the dearest: 4,000 x 200 + 1,200 x 600 = 1,520,000 nano-USD per call.
// 135 x 1,520,000 x 115 / 100 = 235,980,000; plus 4 in flight x 131,481,600 (DeepSeek's worst case).
const LARGEST = 131_481_600n;
const CALLS_NANO = 235_980_000n;
const ESTIMATE = CALLS_NANO + 4n * LARGEST;
const UNAVAILABLE = "ASK_MODEL_CANDIDATE_UNAVAILABLE";

function remainingWith(patch: Partial<PreviewGateRemaining> = {}): PreviewGateRemaining {
  return Object.freeze({
    state: "active", windowOpen: true, remainingNanoUsd: 3_000_000_000n, remainingCalls: 1200,
    maxConcurrentCalls: 4, largestReservationNanoUsd: LARGEST, enabledModels: [GLM, DEEPSEEK], ...patch
  });
}

type Counters = { probes: number; remaining: number };

function gateWith(counters: Counters, answer: () => Promise<PreviewGateRemaining>,
  unfinished: readonly PreviewUnfinishedRun[] = []): PreviewBudgetGateSettings {
  return Object.freeze({
    remaining: { deepinfra: async () => { counters.remaining += 1; return answer(); } },
    roleModelIds: [GLM, GLM, GLM, GLM],
    roleProviderRefs: ["preview:fixture-a", "preview:fixture-b"],
    storyCalls: 6,
    maxCooldownHoldsPerRun: 2,
    readUnfinishedRuns: async () => unfinished
  });
}

function settings(counters: Counters, extra: Partial<RunCreationSettings> = {}): RunCreationSettings {
  return {
    previewProviderTestConfig: PREVIEW,
    strangerSampleRate: 0, registerVersion: 5, batteryVersion: "fixture", settlementWatchHandle: "fixture",
    resolveDiscoveredPanel: async () => {
      counters.probes += 1;
      return [
        { provider_ref: "preview:fixture-a", maker: "Z.AI", model_id: GLM, probe_evidence_ref: "fixture:a", probed_at: "2026-10-10T00:00:00Z" },
        { provider_ref: "preview:deepseek-v4-1-flash", maker: "DeepSeek", model_id: DEEPSEEK, probe_evidence_ref: "fixture:d", probed_at: "2026-10-10T00:00:00Z" }
      ];
    },
    resolveEnvelopeBasis: async (input) => basis(input.panelSize),
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({ effectiveRiskTier, tierSource, tierProvenanceRef }),
    ...extra
  } as RunCreationSettings;
}
const ROLES = { roleModelIds: [GLM, GLM], roleProviderRefs: ["preview:fixture-a", "preview:fixture-b"], storyCalls: 6, maxCooldownHoldsPerRun: 2 };

describe("the start-of-debate estimate is an upper bound (pure)", () => {
  it("counts repeat attempts, the story with its repair, and every pickup health check", () => {
    expect(previewExpectedCalls({ basis: basis(2), panel: PANEL, ...ROLES })).toEqual({ debate: 120, story: 6, probes: 9, total: EXPECTED_CALLS });
    const [need] = estimatePreviewGateNeeds({ basis: basis(2), panel: PANEL, ...ROLES });
    expect(need).toMatchObject({ gate: "deepinfra", dearestModelId: DEEPSEEK, expectedCalls: EXPECTED_CALLS, callsWithMargin: 156, callsNanoUsd: CALLS_NANO });
    expect(previewGateEstimateNanoUsd(need!, remainingWith())).toBe(ESTIMATE);
    expect(previewGateEstimateCalls(need!, remainingWith())).toBe(CALLS_NEEDED);
  });

  it("each part moves the count: one call per site when the ceiling is lower, the hold cap, off-panel roles, the story", () => {
    const base = { basis: basis(2), panel: PANEL, ...ROLES };
    // Sites (30) win over a smaller ceiling.
    expect(previewExpectedCalls({ ...base, basis: { ...basis(2), max_model_attempts: 10 } }).debate).toBe(30);
    // The register's hold cap is used when the basis has none.
    expect(previewExpectedCalls({ ...base, basis: { ...basis(2), hold_cap: undefined }, maxCooldownHoldsPerRun: 4 }).probes).toBe(5 * 3);
    // A role already on the panel is not probed twice.
    expect(previewExpectedCalls({ ...base, roleProviderRefs: ["preview:fixture-a", "preview:deepseek-v4-1-flash"] }).probes).toBe(3 * 2);
    expect(previewExpectedCalls({ ...base, storyCalls: 0 }).total).toBe(EXPECTED_CALLS - 6);
    expect(() => previewExpectedCalls({ ...base, basis: { panel_size: 2 } })).toThrow("PREVIEW_BASIS_HAS_NO_CALL_COUNT");
  });

  it("a role model dearer than the panel sets the price; an unreviewed model is refused", () => {
    const [need] = estimatePreviewGateNeeds({ basis: basis(2), panel: PANEL, ...ROLES, roleModelIds: [MIMO] });
    expect(need!.dearestModelId).toBe(MIMO);
    expect(() => estimatePreviewGateNeeds({ basis: basis(2), panel: PANEL, ...ROLES, roleModelIds: ["other/model"] })).toThrow();
  });

  it("an unfinished debate holds its whole estimate; an older model off the rows is priced at the dearest row", () => {
    const [hold] = estimateUnfinishedRunHolds({ basis: basis(2), panel: PANEL }, ROLES);
    expect(hold).toMatchObject({ gate: "deepinfra", callsWithMargin: 156, callsNanoUsd: CALLS_NANO });
    const [old] = estimateUnfinishedRunHolds({ basis: basis(2), panel: [{ provider_ref: "preview:other", model_id: "old/model" }] }, ROLES);
    expect(old!.dearestModelId).toBe(MIMO);
  });
});

describe("evaluateAskAdmission on the preview asks the gate before any run exists", () => {
  it("admits when the pot is ample, asking the gate once after discovery", async () => {
    const counters = { probes: 0, remaining: 0 };
    const result = await evaluateAskAdmission(settings(counters, { previewBudgetGate: gateWith(counters, async () => remainingWith()) }), ASK);
    expect(result.discoveredPanel.map((member) => member.model_id)).toEqual([GLM, DEEPSEEK]);
    expect(counters).toEqual({ probes: 1, remaining: 1 });
  });

  it("admits at exactly the estimate and refuses one nano-USD or one call below it with the daily code", async () => {
    const counters = { probes: 0, remaining: 0 };
    await expect(evaluateAskAdmission(settings(counters, {
      previewBudgetGate: gateWith(counters, async () => remainingWith({ remainingNanoUsd: ESTIMATE, remainingCalls: CALLS_NEEDED }))
    }), ASK)).resolves.toBeDefined();
    await expect(evaluateAskAdmission(settings(counters, {
      previewBudgetGate: gateWith(counters, async () => remainingWith({ remainingNanoUsd: ESTIMATE - 1n }))
    }), ASK)).rejects.toMatchObject({ name: "AskRefusal", code: "DAILY_COST_ENVELOPE_REACHED" });
    await expect(evaluateAskAdmission(settings(counters, {
      previewBudgetGate: gateWith(counters, async () => remainingWith({ remainingCalls: CALLS_NEEDED - 1 }))
    }), ASK)).rejects.toMatchObject({ name: "AskRefusal", code: "DAILY_COST_ENVELOPE_REACHED" });
  });

  it("debates still running hold their estimate: a pot that fits one debate refuses the second", async () => {
    const counters = { probes: 0, remaining: 0 };
    const pot = remainingWith({ remainingNanoUsd: ESTIMATE + CALLS_NANO - 1n });
    const running = [{ basis: basis(2), panel: PANEL }];
    await expect(evaluateAskAdmission(settings(counters, { previewBudgetGate: gateWith(counters, async () => pot) }), ASK)).resolves.toBeDefined();
    await expect(evaluateAskAdmission(settings(counters, { previewBudgetGate: gateWith(counters, async () => pot, running) }), ASK))
      .rejects.toMatchObject({ name: "AskRefusal", code: "DAILY_COST_ENVELOPE_REACHED" });
    // The calls held count too.
    const calls = remainingWith({ remainingCalls: CALLS_NEEDED + 155 });
    await expect(evaluateAskAdmission(settings(counters, { previewBudgetGate: gateWith(counters, async () => calls, running) }), ASK))
      .rejects.toMatchObject({ name: "AskRefusal", code: "DAILY_COST_ENVELOPE_REACHED" });
  });

  it.each([
    ["the gate is halted", { state: "halted" as const }],
    ["the gate is only initialized", { state: "initialized" as const }],
    ["the gate's window is closed", { windowOpen: false }],
    ["a panel model is not enabled", { enabledModels: [GLM] }],
    ["nothing is enabled", { enabledModels: [] }]
  ])("refuses as not available right now (not the daily limit) when %s", async (_name, patch) => {
    const counters = { probes: 0, remaining: 0 };
    await expect(evaluateAskAdmission(settings(counters, { previewBudgetGate: gateWith(counters, async () => remainingWith(patch)) }), ASK))
      .rejects.toMatchObject({ name: "AskRefusal", code: UNAVAILABLE });
    expect(counters).toEqual({ probes: 1, remaining: 1 });
  });

  it("refuses as not available when a role model (the answer checker) is not enabled, though the panel is", async () => {
    const counters = { probes: 0, remaining: 0 };
    const gate = { ...gateWith(counters, async () => remainingWith({ enabledModels: [GLM, DEEPSEEK] })), roleModelIds: [GLM, MIMO] };
    await expect(evaluateAskAdmission(settings(counters, { previewBudgetGate: gate }), ASK))
      .rejects.toMatchObject({ name: "AskRefusal", code: UNAVAILABLE });
  });

  it("refuses as not available when the gate cannot be asked, the running debates cannot be read, or no settings were built", async () => {
    const counters = { probes: 0, remaining: 0 };
    await expect(evaluateAskAdmission(settings(counters, {
      previewBudgetGate: gateWith(counters, async () => { throw new Error("socket gone"); })
    }), ASK)).rejects.toMatchObject({ name: "AskRefusal", code: UNAVAILABLE });
    await expect(evaluateAskAdmission(settings(counters, {
      previewBudgetGate: { ...gateWith(counters, async () => remainingWith()), readUnfinishedRuns: async () => { throw new Error("db gone"); } }
    }), ASK)).rejects.toMatchObject({ name: "AskRefusal", code: UNAVAILABLE });
    await expect(evaluateAskAdmission(settings(counters), ASK))
      .rejects.toMatchObject({ name: "AskRefusal", code: UNAVAILABLE });
  });

  it("the not-available refusal asks for a retry in about a minute", () => {
    const now = new Date("2026-10-10T10:00:00.000Z");
    const refusal = new AskRefusal(new PreviewGateUnavailableRefusal(new Date(now.getTime() + PREVIEW_UNAVAILABLE_RETRY_MS)));
    expect(askRefusalRetryAfter(refusal.code, now, refusal.retryAt)).toBe("Sat, 10 Oct 2026 10:01:00 GMT");
    expect(refusal.message).not.toMatch(/gate|nano|USD|halted/u);
  });

  it("off the preview the gate is never asked, even when a port is present", async () => {
    const counters = { probes: 0, remaining: 0 };
    const offPreview = settings(counters, {
      previewBudgetGate: gateWith(counters, async () => remainingWith({ state: "halted" })),
      resolveDiscoveredPanel: async () => {
        counters.probes += 1;
        return [
          { provider_ref: "openai", maker: "OpenAI", model_id: "gpt-5.6-luna", probe_evidence_ref: "fixture:o", probed_at: "2026-10-10T00:00:00Z" },
          { provider_ref: "anthropic", maker: "Anthropic", model_id: "claude-sonnet-5", probe_evidence_ref: "fixture:c", probed_at: "2026-10-10T00:00:00Z" }
        ];
      }
    });
    delete (offPreview as { previewProviderTestConfig?: PreviewProviderTestConfig }).previewProviderTestConfig;
    await expect(evaluateAskAdmission(offPreview, ASK)).resolves.toBeDefined();
    expect(counters).toEqual({ probes: 1, remaining: 0 });
  });
});

describe("the real submit and the HTTP boundary", () => {
  const member = testHttpIdentity("estimate-member");
  /** `this` for the real submit; a run would be created through the private admission pools, which a fake has not. */
  const self = (extra: Partial<RunCreationSettings>, counters: Counters) => ({
    settings: { ...settings(counters, extra), previewTeamUserIds: [member.authenticated.userId] }
  });
  const principal = Object.freeze({ kind: "server" as const, userId: member.authenticated.userId, ownerRef: member.authenticated.ownerRef });

  it("a tight pot is refused before any run is created; an ample pot goes on to create one", async () => {
    const counters = { probes: 0, remaining: 0 };
    const tight = self({ previewBudgetGate: gateWith(counters, async () => remainingWith({ remainingNanoUsd: 1_000_000n })) }, counters);
    await expect(PostgresAskApplication.prototype.submit.call(tight as never, ASK, member.authenticated.session, principal as never))
      .rejects.toMatchObject({ name: "AskRefusal", code: "DAILY_COST_ENVELOPE_REACHED" });
    // Admitted, submit goes on to create the run, which this fake `this` cannot: a TypeError, not a refusal.
    const ample = self({ previewBudgetGate: gateWith(counters, async () => remainingWith()) }, counters);
    await expect(PostgresAskApplication.prototype.submit.call(ample as never, ASK, member.authenticated.session, principal as never))
      .rejects.toBeInstanceOf(TypeError);
    // Discovery is the only model call either ask made.
    expect(counters).toEqual({ probes: 2, remaining: 2 });
  });

  it("answers 422 with the not-available code, a fixed plain message and a one-minute Retry-After when the gate is halted", async () => {
    const counters = { probes: 0, remaining: 0 };
    const that = self({ previewBudgetGate: gateWith(counters, async () => remainingWith({ state: "halted" })) }, counters);
    const application = new Proxy({}, {
      get: (_target, property) => property === "submit"
        ? async (askRequest: AskRequest, session: never, p: never) => PostgresAskApplication.prototype.submit.call(that as never, askRequest, session, p)
        : async () => null
    }) as AskApplication;
    const api = buildApi({
      previewProviderTestConfig: PREVIEW, previewTeamUserIds: [member.authenticated.userId],
      application, sessions: testSessionApplication([member]), allowedOrigin: TEST_APP_ORIGIN
    });
    try {
      const before = Date.now();
      const response = await api.inject({ method: "POST", url: "/v1/asks", headers: testSessionHeaders(member, true), payload: ASK });
      expect(response.statusCode).toBe(422);
      expect(response.json()).toMatchObject({ error: UNAVAILABLE });
      expect(JSON.stringify(response.json())).not.toMatch(/halted|gate|nano/u);
      const retryAt = Date.parse(String(response.headers["retry-after"]));
      expect(retryAt - before).toBeGreaterThan(50_000);
      expect(retryAt - before).toBeLessThan(70_000);
    } finally {
      await api.close();
    }
  });

  it("reads unfinished debates as runs with a READY or CLAIMED job and no FAILED one, bounded", () => {
    expect(PREVIEW_UNFINISHED_RUNS_SQL).toMatch(/work\.state IN \('READY', 'CLAIMED'\)/u);
    expect(PREVIEW_UNFINISHED_RUNS_SQL).toMatch(/NOT EXISTS[\s\S]*work\.state = 'FAILED'/u);
    expect(PREVIEW_UNFINISHED_RUNS_SQL).toMatch(/SELECT run\.envelope_basis, run\.discovered_panel/u);
    expect(PREVIEW_UNFINISHED_RUNS_SQL).toMatch(/LIMIT 65$/u);
  });

  it("answers 429 DAILY_COST_ENVELOPE_REACHED with a Retry-After and no figures", async () => {
    const counters = { probes: 0, remaining: 0 };
    let created = 0;
    const that = self({ previewBudgetGate: gateWith(counters, async () => remainingWith({ remainingNanoUsd: 0n })) }, counters);
    const application = new Proxy({}, {
      get: (_target, property) => property === "submit"
        ? async (askRequest: AskRequest, session: never, p: never) => {
          await PostgresAskApplication.prototype.submit.call(that as never, askRequest, session, p);
          created += 1;
          return { run_ref: "11111111-1111-4111-8111-111111111111", status: "QUEUED" };
        }
        : async () => null
    }) as AskApplication;
    const api = buildApi({
      previewProviderTestConfig: PREVIEW, previewTeamUserIds: [member.authenticated.userId],
      application, sessions: testSessionApplication([member]), allowedOrigin: TEST_APP_ORIGIN
    });
    try {
      const before = nextBucharestMidnight(new Date()).toUTCString();
      const response = await api.inject({ method: "POST", url: "/v1/asks", headers: testSessionHeaders(member, true), payload: ASK });
      const after = nextBucharestMidnight(new Date()).toUTCString();
      expect(response.statusCode).toBe(429);
      // The gate's day ends at Bucharest midnight, not UTC midnight.
      expect([before, after]).toContain(response.headers["retry-after"]);
      // The public body is the code alone: no reason, no figures.
      expect(response.json()).toEqual({ error: "DAILY_COST_ENVELOPE_REACHED", message: "DAILY_COST_ENVELOPE_REACHED" });
      expect(response.headers["retry-after"]).toBeTruthy();
      expect(created).toBe(0);
      expect(counters).toEqual({ probes: 1, remaining: 1 });
    } finally {
      await api.close();
    }
  });
});

describe("the /remaining port reads the gate's reply strictly over a real unix socket", () => {
  const servers: Server[] = [];
  const directories: string[] = [];
  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise<void>((done) => { server.closeAllConnections(); server.close(() => done()); })));
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  });

  async function gate(answer: (response: ServerResponse) => void, timeoutMs?: number) {
    const directory = await mkdtemp(join(tmpdir(), "pvr-"));
    directories.push(directory);
    const socket = join(directory, "gate.sock");
    const received: string[] = [];
    const server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        received.push(`${request.method} ${request.url} ${Buffer.concat(chunks).toString("utf8")}`);
        answer(response);
      });
    });
    servers.push(server);
    await new Promise<void>((done) => server.listen(socket, done));
    return { port: createPreviewRemainingRpcPort({ budget_socket: socket, scope_id: "fixture-scope" }, timeoutMs), received, socket };
  }
  const reply = (status: number, body: unknown) => (response: ServerResponse) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(typeof body === "string" ? body : JSON.stringify(body));
  };
  const GOOD = Object.freeze({
    state: "active", window_open: true, remaining_usd: "2.879512", remaining_calls: 1177,
    max_concurrent_calls: 4, largest_reservation_usd: "0.131481600", enabled_models: [GLM, DEEPSEEK]
  });

  it("posts exactly the scope to /remaining and reads both figures as exact nano-USD", async () => {
    const { port, received } = await gate(reply(200, GOOD));
    await expect(port.remaining()).resolves.toEqual({
      state: "active", windowOpen: true, remainingNanoUsd: 2_879_512_000n, remainingCalls: 1177,
      maxConcurrentCalls: 4, largestReservationNanoUsd: 131_481_600n, enabledModels: [GLM, DEEPSEEK]
    });
    expect(received).toEqual(["POST /remaining {\"scope_id\":\"fixture-scope\"}"]);
  });

  it("accepts whole-dollar and zero figures", async () => {
    const { port } = await gate(reply(200, { ...GOOD, remaining_usd: "0", largest_reservation_usd: "3" }));
    await expect(port.remaining()).resolves.toMatchObject({ remainingNanoUsd: 0n, largestReservationNanoUsd: 3_000_000_000n });
  });

  it.each([
    ["409 stopped", 409, { error: "PREVIEW_TEST_AUTHORITY_STOPPED" }],
    ["500", 500, GOOD],
    ["an extra key", 200, { ...GOOD, held_usd: "0.1" }],
    ["a missing key", 200, (({ window_open: _omit, ...rest }) => rest)(GOOD)],
    ["an unknown state", 200, { ...GOOD, state: "paused" }],
    ["a string window", 200, { ...GOOD, window_open: "true" }],
    ["a number for money", 200, { ...GOOD, remaining_usd: 2.5 }],
    ["ten decimals", 200, { ...GOOD, remaining_usd: "0.1234567891" }],
    ["a negative figure", 200, { ...GOOD, remaining_usd: "-1.00" }],
    ["an exponent", 200, { ...GOOD, largest_reservation_usd: "1e-3" }],
    ["fractional calls", 200, { ...GOOD, remaining_calls: 1.5 }],
    ["negative calls", 200, { ...GOOD, remaining_calls: -1 }],
    ["zero concurrency", 200, { ...GOOD, max_concurrent_calls: 0 }],
    ["a non-string model", 200, { ...GOOD, enabled_models: [GLM, 7] }],
    ["a repeated model", 200, { ...GOOD, enabled_models: [GLM, GLM] }],
    ["an array body", 200, [GOOD]],
    ["non-JSON", 200, "not json"]
  ])("rejects %s as the gate being unreachable", async (_name, status, body) => {
    const { port } = await gate(reply(status, body));
    await expect(port.remaining()).rejects.toMatchObject({ code: PREVIEW_GATE_UNREACHABLE });
  });

  it("rejects an oversize reply", async () => {
    const { port } = await gate((response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ...GOOD, enabled_models: [GLM, "x".repeat(70 * 1024)] }));
    });
    await expect(port.remaining()).rejects.toMatchObject({ code: PREVIEW_GATE_UNREACHABLE });
  });

  it("rejects a gate that never answers, after the timeout", async () => {
    const { port } = await gate(() => undefined, 200);
    await expect(port.remaining()).rejects.toMatchObject({ code: PREVIEW_GATE_UNREACHABLE });
  });

  it("rejects a missing socket and an aborted read", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pvr-"));
    directories.push(directory);
    await expect(createPreviewRemainingRpcPort({ budget_socket: join(directory, "none.sock"), scope_id: "s" }).remaining())
      .rejects.toMatchObject({ code: PREVIEW_GATE_UNREACHABLE });
    const { port } = await gate(() => undefined);
    const controller = new AbortController();
    const pending = port.remaining(controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: PREVIEW_GATE_UNREACHABLE });
  });
});

describe("Retry-After names the gate's reset: the next midnight in Bucharest, across clock changes", () => {
  it.each([
    // Summer time (+03:00), the day before clocks go back on 2026-10-25.
    ["2026-10-24T12:00:00.000Z", "2026-10-24T21:00:00.000Z"],
    // Just before and exactly at Bucharest midnight.
    ["2026-10-24T20:59:59.999Z", "2026-10-24T21:00:00.000Z"],
    ["2026-10-24T21:00:00.000Z", "2026-10-25T22:00:00.000Z"],
    // The 25-hour day (04:00 summer time becomes 03:00 winter time): next midnight is at +02:00.
    ["2026-10-25T00:30:00.000Z", "2026-10-25T22:00:00.000Z"],
    ["2026-10-25T12:00:00.000Z", "2026-10-25T22:00:00.000Z"],
    // Winter time (+02:00), the day before clocks go forward on 2027-03-28.
    ["2027-03-27T12:00:00.000Z", "2027-03-27T22:00:00.000Z"],
    // The 23-hour day (03:00 winter time becomes 04:00 summer time): next midnight is at +03:00.
    ["2027-03-28T00:30:00.000Z", "2027-03-28T21:00:00.000Z"],
    ["2027-03-28T12:00:00.000Z", "2027-03-28T21:00:00.000Z"],
    // Year end, UTC still on the old day while Bucharest is on the new one.
    ["2026-12-31T22:30:00.000Z", "2027-01-01T22:00:00.000Z"]
  ])("at %s the gate's day resets at %s", (now, expected) => {
    expect(nextBucharestMidnight(new Date(now)).toISOString()).toBe(expected);
  });

  it("the estimate's refusal carries that instant, and the boundary's Retry-After uses it", () => {
    const now = new Date("2026-10-25T12:00:00.000Z");
    const refusal = new AskRefusal(new PreviewDailyLimitRefusal("synthetic", nextBucharestMidnight(now)));
    expect(refusal.code).toBe("DAILY_COST_ENVELOPE_REACHED");
    expect(askRefusalRetryAfter(refusal.code, now, refusal.retryAt)).toBe("Sun, 25 Oct 2026 22:00:00 GMT");
    // Off the preview the daily code keeps the UTC midnight it always had.
    expect(askRefusalRetryAfter("DAILY_COST_ENVELOPE_REACHED", now)).toBe("Mon, 26 Oct 2026 00:00:00 GMT");
    expect(new AskRefusal(new PreviewDailyLimitRefusal("synthetic", now)).retryAt).toEqual(now);
    // A reset instant already past is ignored (never a Retry-After in the past).
    expect(askRefusalRetryAfter(refusal.code, new Date("2026-10-26T00:00:00.000Z"), refusal.retryAt)).toBe("Tue, 27 Oct 2026 00:00:00 GMT");
  });
});
