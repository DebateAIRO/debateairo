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
import { computeStructuralCeilingBasis } from "@debateai/register";
import {
  createPreviewRemainingRpcPort,
  parsePreviewProviderTestConfig,
  previewModelRow,
  type PreviewModelRow,
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
  previewCallNanoUsd,
  previewDebateNanoUsd,
  previewGateKeyOf,
  createPreviewAdmissionLock,
  assertPreviewBudgetAdmits,
  PREVIEW_ADMISSION_LOCK_NAME,
  PREVIEW_ESTIMATE_INPUT_TOKENS_PER_CALL,
  PREVIEW_ESTIMATE_PROBE_INPUT_TOKENS,
  type PreviewAdmissionLock,
  type PreviewCallOutputTokens,
  previewCallOutputTokens,
  PreviewGateUnavailableRefusal,
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
const QWEN = "Qwen/Qwen3.8-Flash";
const PREVIEW = parsePreviewProviderTestConfig(JSON.stringify({
  deployment: "v3-preview", free_model_ids: [GLM, DEEPSEEK], premium_model_ids: [GLM, DEEPSEEK, MIMO, QWEN],
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
/** The max_tokens each call sends on the preview with today's register bounds (all organ and synthesis bounds 2,048 -> the 8,192 floor). */
const OUTPUT: PreviewCallOutputTokens = Object.freeze({ debate: 8192, storyteller: 12_000, storytellerRetry: 24_000, storyChecker: 8192 });
// Calls: debate 120 (the basis's ceiling beats its 30 sites); story 2 rounds x 3 = 6; pickup health checks
// (1 + hold_cap 2 + 2 restarts) x (2 panel members + fixture-b, the checker, off the panel) = 15; this
// ask's own health checks 5; one unbilled retry per one-attempt call 120 + 2 = 122. Total 268.
const EXPECTED_CALLS = 268;
// With the 15% margin: ceil(308.2) = 309; plus 4 in flight = 313 calls needed.
const CALLS_NEEDED = 313;
// Each call at its most, at the dearest row for its shape (DeepSeek throughout), input 264,192 tokens:
// debate 264,192 x 200 + 8,192 x 600 = 57,753,600; storyteller 60,038,400 + its retry 67,238,400 + checker
// 57,753,600 per round; a health check 3,072 x 200 + 8,192 x 600 = 5,529,600.
// 120 x 57,753,600 + 2 x 185,030,400 + 20 x 5,529,600 = 7,411,084,800; x 1.15 = 8,522,747,520.
const CALLS_NANO = 8_522_747_520n;
const LARGEST = 131_481_600n;
const ESTIMATE = CALLS_NANO + 4n * LARGEST;
const UNAVAILABLE = "ASK_MODEL_CANDIDATE_UNAVAILABLE";

function remainingWith(patch: Partial<PreviewGateRemaining> = {}): PreviewGateRemaining {
  return Object.freeze({
    state: "active", windowOpen: true, remainingNanoUsd: 100_000_000_000n, remainingCalls: 100_000,
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
    storyRounds: 2,
    callOutputTokens: OUTPUT,
    askProbeTargets: 5,
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
const ROLES = { roleModelIds: [GLM, GLM], roleProviderRefs: ["preview:fixture-a", "preview:fixture-b"], storyRounds: 2,
  callOutputTokens: OUTPUT, askProbeTargets: 5, maxCooldownHoldsPerRun: 2 };

describe("the start-of-debate estimate is an upper bound (pure)", () => {
  it("counts repeat attempts, the story with its repair, every pickup and ask health check, and the unbilled retries", () => {
    expect(previewExpectedCalls({ basis: basis(2), panel: PANEL, ...ROLES }))
      .toEqual({ debate: 120, story: 6, probes: 15, askProbes: 5, unbilledRetries: 122, total: EXPECTED_CALLS });
    const [need] = estimatePreviewGateNeeds({ basis: basis(2), panel: PANEL, ...ROLES });
    expect(need).toMatchObject({ gate: "deepinfra", dearestModelId: DEEPSEEK, expectedCalls: EXPECTED_CALLS, callsWithMargin: 309, callsNanoUsd: CALLS_NANO });
    expect(previewGateEstimateNanoUsd(need!, remainingWith())).toBe(ESTIMATE);
    expect(previewGateEstimateCalls(need!, remainingWith())).toBe(CALLS_NEEDED);
  });

  it("prices each call at its most: input at the largest body the gate accepts, output at what it may send, clamped to the row", () => {
    expect(PREVIEW_ESTIMATE_INPUT_TOKENS_PER_CALL).toBe(262_144n + 2048n);
    expect(PREVIEW_ESTIMATE_PROBE_INPUT_TOKENS).toBe(1024n + 2048n);
    const glm = previewModelRow(GLM)!;
    expect(previewCallNanoUsd(glm, 264_192n, 8192)).toBe(264_192n * 150n + 8192n * 500n);
    // A ceiling above the row's own bound is clamped to it (the gateway never sends more).
    expect(previewCallNanoUsd(previewModelRow(QWEN)!, 0n, 200_000)).toBe(131_072n * 382n);
    // No cached-input discount: every prompt token at the full input price.
    expect(previewCallNanoUsd(previewModelRow(QWEN)!, 1_000_000n, 0)).toBe(113_000_000n);
  });

  it("each part moves the count: one call per site when the ceiling is lower, the hold cap, off-panel roles, the story, the ask's probes", () => {
    const base = { basis: basis(2), panel: PANEL, ...ROLES };
    // Sites (30) win over a smaller ceiling.
    expect(previewExpectedCalls({ ...base, basis: { ...basis(2), max_model_attempts: 10 } }).debate).toBe(30);
    // The register's hold cap is used when the basis has none; two restarts are always allowed.
    expect(previewExpectedCalls({ ...base, basis: { ...basis(2), hold_cap: undefined }, maxCooldownHoldsPerRun: 4 }).probes).toBe(7 * 3);
    // A role already on the panel is not probed twice.
    expect(previewExpectedCalls({ ...base, roleProviderRefs: ["preview:fixture-a", "preview:deepseek-v4-1-flash"] }).probes).toBe(5 * 2);
    expect(previewExpectedCalls({ ...base, storyRounds: 0 }).total).toBe(EXPECTED_CALLS - 6 - 2);
    expect(previewExpectedCalls({ ...base, askProbeTargets: 0 }).total).toBe(EXPECTED_CALLS - 5);
    expect(() => previewExpectedCalls({ ...base, basis: { panel_size: 2 } })).toThrow("PREVIEW_BASIS_HAS_NO_CALL_COUNT");
  });

  it("a role model dearer than the panel sets the price; an unreviewed model is refused", () => {
    const [need] = estimatePreviewGateNeeds({ basis: basis(2), panel: PANEL, ...ROLES, roleModelIds: [MIMO] });
    expect(need!.dearestModelId).toBe(MIMO);
    expect(need!.callsNanoUsd > CALLS_NANO).toBe(true);
    expect(() => estimatePreviewGateNeeds({ basis: basis(2), panel: PANEL, ...ROLES, roleModelIds: ["other/model"] })).toThrow();
  });

  it("an unfinished debate holds its whole estimate but its ask's probes; an older model off the rows is priced at the dearest row", () => {
    const [hold] = estimateUnfinishedRunHolds({ basis: basis(2), panel: PANEL }, ROLES);
    const withoutAsk = previewExpectedCalls({ basis: basis(2), panel: PANEL, ...ROLES, askProbeTargets: 0 });
    expect(hold).toMatchObject({ gate: "deepinfra", expectedCalls: EXPECTED_CALLS - 5, callsWithMargin: 303,
      callsNanoUsd: (previewDebateNanoUsd([previewModelRow(GLM)!, previewModelRow(DEEPSEEK)!], withoutAsk, 2, OUTPUT) * 115n + 99n) / 100n });
    expect(hold!.callsNanoUsd).toBe(CALLS_NANO - (5n * 5_529_600n * 115n) / 100n);
    const [old] = estimateUnfinishedRunHolds({ basis: basis(2), panel: [{ provider_ref: "preview:other", model_id: "old/model" }] }, ROLES);
    expect(old!.dearestModelId).toBe(MIMO);
  });

  it("a debate only writing its story holds the story's calls: 3 per round plus the checker's retry", () => {
    const [story] = estimateUnfinishedRunHolds({ basis: basis(2), panel: PANEL, phase: "STORY" }, ROLES);
    // 2 x (60,038,400 + 67,238,400 + 57,753,600) = 370,060,800; x 1.15 = 425,569,920.
    expect(story).toMatchObject({ gate: "deepinfra", expectedCalls: 8, callsWithMargin: 10, callsNanoUsd: 425_569_920n });
    expect(estimateUnfinishedRunHolds({ basis: basis(2), panel: PANEL, phase: "STORY" }, { ...ROLES, storyRounds: 0 })[0])
      .toMatchObject({ expectedCalls: 0, callsNanoUsd: 0n });
  });

  it("Qwen is priced from its own row, on the DeepInfra gate", () => {
    expect(previewGateKeyOf(QWEN)).toBe("deepinfra");
    const input = { ...ROLES, basis: basis(1), panel: [{ provider_ref: "preview:qwen-3-8-flash", model_id: QWEN }],
      roleModelIds: [QWEN], roleProviderRefs: ["preview:qwen-3-8-flash"] };
    const calls = previewExpectedCalls(input);
    expect(estimatePreviewGateNeeds(input)).toEqual([expect.objectContaining({ gate: "deepinfra", modelIds: [QWEN], dearestModelId: QWEN,
      callsNanoUsd: (previewDebateNanoUsd([previewModelRow(QWEN)!], calls, 2, OUTPUT) * 115n + 99n) / 100n })]);
    // On the four-maker Premium panel it is one more model on the same gate; MiMo stays the dearest.
    const premium = [...PANEL, { provider_ref: "preview:mimo-v2-6-pro", model_id: MIMO }, { provider_ref: "preview:qwen-3-8-flash", model_id: QWEN }];
    expect(estimatePreviewGateNeeds({ basis: basis(4), panel: premium, ...ROLES })).toEqual([
      expect.objectContaining({ gate: "deepinfra", modelIds: [GLM, DEEPSEEK, MIMO, QWEN], dearestModelId: MIMO })]);
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
    // A running debate holds its estimate without its own ask's health checks: 8,490,952,320 and 303 calls.
    const pot = remainingWith({ remainingNanoUsd: ESTIMATE + 8_490_952_320n - 1n });
    const running = [{ basis: basis(2), panel: PANEL }];
    await expect(evaluateAskAdmission(settings(counters, { previewBudgetGate: gateWith(counters, async () => pot) }), ASK)).resolves.toBeDefined();
    await expect(evaluateAskAdmission(settings(counters, { previewBudgetGate: gateWith(counters, async () => pot, running) }), ASK))
      .rejects.toMatchObject({ name: "AskRefusal", code: "DAILY_COST_ENVELOPE_REACHED" });
    // The calls held count too.
    const calls = remainingWith({ remainingCalls: CALLS_NEEDED + 302 });
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

  it("a Premium debate with Qwen on the panel asks the DeepInfra gate, and is refused until the gate switches Qwen on", async () => {
    const premiumAsk = { ...ASK, plan_tier: "premium" } as unknown as AskRequest;
    const member = (provider_ref: string, maker: string, model_id: string) =>
      ({ provider_ref, maker, model_id, probe_evidence_ref: `fixture:${provider_ref}`, probed_at: "2026-10-10T00:00:00Z" });
    const panel = [member("preview:fixture-a", "Z.AI", GLM), member("preview:deepseek-v4-1-flash", "DeepSeek", DEEPSEEK),
      member("preview:mimo-v2-6-pro", "Xiaomi", MIMO), member("preview:qwen-3-8-flash", "Alibaba", QWEN)];
    const counters = { probes: 0, remaining: 0 };
    const withEnabled = (enabledModels: string[]) => settings(counters, { resolveDiscoveredPanel: async () => panel,
      previewBudgetGate: gateWith(counters, async () => remainingWith({ enabledModels, largestReservationNanoUsd: 227_635_200n })) });
    await expect(evaluateAskAdmission(withEnabled([GLM, DEEPSEEK, MIMO]), premiumAsk)).rejects.toMatchObject({ name: "AskRefusal", code: UNAVAILABLE });
    expect(counters.remaining).toBe(1);
    const result = await evaluateAskAdmission(withEnabled([GLM, DEEPSEEK, MIMO, QWEN]), premiumAsk);
    expect(result.discoveredPanel.map((entry) => entry.model_id)).toEqual([GLM, DEEPSEEK, MIMO, QWEN]);
    expect(result.criticUnavailableCap).toEqual({ serves: true, conditionMarks: [], confidenceBandCapRequired: false, liftCondition: null });
    expect(counters.remaining).toBe(2);
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
    const refusal = new AskRefusal(new PreviewGateUnavailableRefusal(new Date(now.getTime() + 60_000)));
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

/** An in-memory stand-in for the advisory lock: one holder at a time, waiters queue in order. */
function memoryLock(events: string[], name: string, state: { tail: Promise<void> }): PreviewAdmissionLock {
  let releaseHeld: (() => void) | undefined;
  return {
    async acquire() {
      const previous = state.tail;
      let unlock!: () => void;
      state.tail = new Promise<void>((resolve) => { unlock = resolve; });
      await previous;
      releaseHeld = unlock;
      events.push(`${name}:acquired`);
    },
    async release() {
      if (releaseHeld === undefined) return;
      const unlock = releaseHeld;
      releaseHeld = undefined;
      events.push(`${name}:released`);
      unlock();
    }
  };
}

describe("one ask at a time is estimated and started on the preview (review finding 2)", () => {
  it("the lock is a transaction-scoped advisory lock on one connection, released by COMMIT, idempotent", async () => {
    const queries: string[] = [];
    const releases: unknown[] = [];
    const client = { query: async (sql: string, values?: unknown[]) => { queries.push(values === undefined ? sql : `${sql} ${JSON.stringify(values)}`); return { rows: [] }; },
      release: (error?: unknown) => { releases.push(error); } };
    const lock = createPreviewAdmissionLock({ connect: async () => client } as never);
    await lock.acquire();
    await lock.acquire();
    expect(queries).toEqual(["BEGIN", `SELECT pg_advisory_xact_lock(hashtextextended($1, 0)) ${JSON.stringify([PREVIEW_ADMISSION_LOCK_NAME])}`]);
    await lock.release();
    await lock.release();
    expect(queries.at(-1)).toBe("COMMIT");
    expect(releases).toEqual([undefined]);
    await expect(lock.acquire()).rejects.toThrow("PREVIEW_ADMISSION_LOCK_RELEASED");
  });

  it("a lock that cannot be taken frees its connection as broken, and the ask is refused as not available", async () => {
    const releases: unknown[] = [];
    const client = { query: async (sql: string) => { if (sql !== "BEGIN") throw new Error("lock timeout"); return { rows: [] }; },
      release: (error?: unknown) => { releases.push(error); } };
    const lock = createPreviewAdmissionLock({ connect: async () => client } as never);
    await expect(lock.acquire()).rejects.toThrow("lock timeout");
    expect(releases).toHaveLength(1);
    expect(releases[0]).toBeInstanceOf(Error);
    await lock.release();
    expect(releases).toHaveLength(1);
    const counters = { probes: 0, remaining: 0 };
    await expect(assertPreviewBudgetAdmits(gateWith(counters, async () => remainingWith()), { basis: basis(2), panel: PANEL }, undefined,
      createPreviewAdmissionLock({ connect: async () => client } as never))).rejects.toBeInstanceOf(PreviewGateUnavailableRefusal);
    expect(counters.remaining).toBe(0);
  });

  it("two asks at once: the second estimates only after the first debate is held, so a pot for one admits one", async () => {
    // A pot that fits exactly one debate: the estimate plus nothing held.
    const pot = remainingWith({ remainingNanoUsd: ESTIMATE });
    const started: PreviewUnfinishedRun[] = [];
    const events: string[] = [];
    const counters = { probes: 0, remaining: 0 };
    const gate = gateWith(counters, async () => pot);
    const live = { ...gate, readUnfinishedRuns: async () => [...started] };
    const state = { tail: Promise.resolve() };
    const ask = async (name: string) => {
      const lock = memoryLock(events, name, state);
      try {
        await evaluateAskAdmission(settings(counters, { previewBudgetGate: live }), ASK, null, lock);
        // What submit does next while holding the lock: the run row, then its READY job.
        await new Promise((resolve) => setTimeout(resolve, 5));
        started.push({ basis: basis(2), panel: PANEL });
        events.push(`${name}:queued`);
        return "admitted";
      } catch (error) {
        return (error as { code?: string }).code;
      } finally {
        await lock.release();
      }
    };
    expect(await Promise.all([ask("first"), ask("second")])).toEqual(["admitted", "DAILY_COST_ENVELOPE_REACHED"]);
    expect(events).toEqual(["first:acquired", "first:queued", "first:released", "second:acquired", "second:released"]);
    // Without the lock both asks read the same empty list and both pass: what the lock prevents.
    started.length = 0;
    const unlocked = await Promise.all([1, 2].map(() => evaluateAskAdmission(settings(counters, { previewBudgetGate: live }), ASK).then(() => "admitted")));
    expect(unlocked).toEqual(["admitted", "admitted"]);
  });

  it("the output ceilings: the preview floor, the storyteller's retry at twice its ceiling, no story means none", () => {
    const config = parsePreviewProviderTestConfig(JSON.stringify({ deployment: "v3-preview", requested_thinking_level: "high",
      budget_socket: "/run/debateai-v3-preview/provider-budget.sock", scope_id: "fixture", free_model_ids: [GLM] }))!;
    expect(previewCallOutputTokens(config, { debate: [2048, 16_000], story: { storyteller: 12_000, checker: 2048 } }))
      .toEqual({ debate: 16_000, storyteller: 12_000, storytellerRetry: 24_000, storyChecker: 8192 });
    expect(previewCallOutputTokens(config, { debate: [2048], story: null })).toEqual({ debate: 8192, storyteller: 0, storytellerRetry: 0, storyChecker: 0 });
    const invalid = "PREVIEW_CALL_CEILINGS_INVALID";
    expect(() => previewCallOutputTokens(config, { debate: [], story: null })).toThrow(invalid);
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

  it("submit takes the lock for the estimate and releases it whether the ask is refused or fails later", async () => {
    const counters = { probes: 0, remaining: 0 };
    const events: string[] = [];
    const state = { tail: Promise.resolve() };
    const locked = (answer: () => Promise<PreviewGateRemaining>) =>
      self({ previewBudgetGate: { ...gateWith(counters, answer), openAdmissionLock: () => memoryLock(events, "ask", state) } }, counters);
    await expect(PostgresAskApplication.prototype.submit.call(locked(async () => remainingWith({ remainingNanoUsd: 1_000_000n })) as never,
      ASK, member.authenticated.session, principal as never)).rejects.toMatchObject({ name: "AskRefusal", code: "DAILY_COST_ENVELOPE_REACHED" });
    expect(events).toEqual(["ask:acquired", "ask:released"]);
    await expect(PostgresAskApplication.prototype.submit.call(locked(async () => remainingWith()) as never,
      ASK, member.authenticated.session, principal as never)).rejects.toBeInstanceOf(TypeError);
    expect(events).toEqual(["ask:acquired", "ask:released", "ask:acquired", "ask:released"]);
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
    // Review finding 4: a debate writing its story (answer served, no story row yet, a call within the window) is held too.
    expect(PREVIEW_UNFINISHED_RUNS_SQL).toMatch(/THEN 'DEBATE' ELSE 'STORY' END AS phase/u);
    expect(PREVIEW_UNFINISHED_RUNS_SQL).toMatch(/\$1::boolean\s+AND EXISTS \(SELECT 1 FROM serve\.answer AS answer WHERE answer\.run_id = run\.run_id\)/u);
    expect(PREVIEW_UNFINISHED_RUNS_SQL).toMatch(/NOT EXISTS \(SELECT 1 FROM serve\.answer_story AS story WHERE story\.run_id = run\.run_id\)/u);
    expect(PREVIEW_UNFINISHED_RUNS_SQL).toMatch(/entry\.finished_at > clock_timestamp\(\) - make_interval\(secs => \$2::integer\)/u);
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

describe("what one debate is estimated at with today's register (review finding 1: pinned $ per debate)", () => {
  const config = parsePreviewProviderTestConfig(JSON.stringify({ deployment: "v3-preview", requested_thinking_level: "high",
    budget_socket: "/run/debateai-v3-preview/provider-budget.sock", scope_id: "fixture", free_model_ids: [GLM] }))!;
  // Today's register: the three organ bounds and both synthesis bounds at 2,048, the storyteller 12,000, its checker 2,048.
  const output = previewCallOutputTokens(config, { debate: [2048, 2048, 2048, 2048, 2048], story: { storyteller: 12_000, checker: 2048 } });
  // PR B's Haiku row (Anthropic gate): $0.625 / $2.50 per million, bound 32,768. A local literal until B is merged.
  const HAIKU: PreviewModelRow = Object.freeze({ model: "fixture/claude-haiku", maker: "Anthropic", inputUsdPerM: "0.625", outputUsdPerM: "2.50",
    inputNanoUsdPerToken: 625n, outputNanoUsdPerToken: 2500n, inputPriceMicrosPerMillion: 625_000, outputPriceMicrosPerMillion: 2_500_000,
    outputBound: 32_768, effort: null, jsonObject: false, contextWindowTokens: 200_000 });
  const rows = (...models: string[]) => models.map((model) => previewModelRow(model)!);
  const basisFor = (panelSize: number, depth: number) => computeStructuralCeilingBasis({ panelSize, depth, judgeMaxAttempts: 3, organMaxAttempts: 3,
    maxRecompose: 2, maxCooldownHoldsPerRun: 2, finalRetryAttempts: 1, branchingFactor: 2, compositionSegmentCap: 2, fixedOrgansPerComposition: 4,
    reviewerCallsPerNode: 1, synthesizerMaxRounds: 3, evaluatorMaxRounds: 3, maxDepth: 5 });
  const figure = (gates: Record<string, readonly PreviewModelRow[]>, panelSize: number, depth: number) => {
    const panel = Array.from({ length: panelSize }, (_, index) => ({ provider_ref: `fixture:${String(index)}`, model_id: "fixture" }));
    const calls = previewExpectedCalls({ basis: basisFor(panelSize, depth), panel, roleProviderRefs: ["preview:fixture-a", "preview:fixture-b"],
      storyRounds: 2, maxCooldownHoldsPerRun: 2, askProbeTargets: 5 });
    return Object.fromEntries(Object.entries(gates).map(([gate, gateRows]) =>
      [gate, { calls: Math.ceil((calls.total * 115) / 100), nanoUsd: (previewDebateNanoUsd(gateRows, calls, 2, output) * 115n + 99n) / 100n }]));
  };
  it("free GLM + DeepSeek, premium GLM, DeepSeek, MiMo, Qwen, and premium with Haiku added: calls and money per gate", () => {
    expect(output).toEqual({ debate: 8192, storyteller: 12_000, storytellerRetry: 24_000, storyChecker: 8192 });
    const premium = rows(GLM, DEEPSEEK, MIMO, QWEN);
    // Depth 2, the website's default.
    expect(figure({ deepinfra: rows(GLM, DEEPSEEK) }, 2, 2)).toEqual({ deepinfra: { calls: 485, nanoUsd: 13_469_374_080n } });
    expect(figure({ deepinfra: premium }, 4, 2)).toEqual({ deepinfra: { calls: 1655, nanoUsd: 98_121_967_776n } });
    expect(figure({ deepinfra: premium, anthropic: [HAIKU] }, 5, 2)).toEqual({
      deepinfra: { calls: 2627, nanoUsd: 156_482_940_576n }, anthropic: { calls: 2627, nanoUsd: 241_049_752_000n } });
    // Depth 1, the smallest debate.
    expect(figure({ deepinfra: rows(GLM, DEEPSEEK) }, 2, 1)).toEqual({ deepinfra: { calls: 282, nanoUsd: 7_624_709_760n } });
    expect(figure({ deepinfra: premium }, 4, 1)).toEqual({ deepinfra: { calls: 1030, nanoUsd: 60_357_748_896n } });
    expect(figure({ deepinfra: premium, anthropic: [HAIKU] }, 5, 1)).toEqual({
      deepinfra: { calls: 1707, nanoUsd: 100_947_324_576n }, anthropic: { calls: 1707, nanoUsd: 155_673_752_000n } });
  });
});
