// An ask probes only the models it may seat. The API declares every reviewed model address (the register's seven), and
// it must keep refusing to start when that list differs from the register's. But a declared model that no line-up seats
// (GPT-6 Luna before it is switched on, Qwen3.8-Flash after it was taken out) must receive nothing at an ask: no paid
// health check through its gate, and no probe row. Everything here is the shipped preview path: the seven reviewed
// targets, the guarded fetch over one port per gate (the Amazon gate's included, as on a server where it is installed),
// the discovery resolver with the preview round main.ts passes, and evaluateAskAdmission. Only the gates' answers, the
// probe store and the clock are fakes.
import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { evaluateAskAdmission, type RunCreationSettings } from "@debateai/api";
import type { AskRequest } from "@debateai/contract";
import type { ProviderProbeRecord } from "@debateai/db";
import {
  createPreviewGuardedFetch,
  parsePreviewProviderTestConfig,
  parseProviderDiscoveryTargets,
  previewModelRow,
  previewProbeControls,
  previewTargetJsonRow,
  PreviewVendorRefusedUnbilled,
  PREVIEW_REVIEWED_PROVIDER_REFS,
  type PreviewBudgetPort,
  type PreviewGateRemaining,
  type PreviewProviderTestConfig
} from "@debateai/providers";
import { computeStructuralCeilingBasis } from "@debateai/register";
import { createProviderDiscoveryResolver, type ProviderDiscoveryProbeStore } from "../../apps/api/src/provider-discovery.js";
import type { PreviewBudgetGateSettings } from "../../apps/api/src/preview-budget-estimate.js";
import { testReleaseKey } from "../support/releaseKey.js";

const GLM = "zai-org/GLM-5.3-Flash";
const DEEPSEEK = "deepseek-ai/DeepSeek-V4.1-Flash";
const MIMO = "XiaomiMiMo/MiMo-V2.6-Pro";
const QWEN = "Qwen/Qwen3.8-Flash";
const HAIKU = "claude-haiku-5-5";
const LUNA = "us.openai.gpt-6-luna";
const LUNA_REF = "preview:gpt-6-luna";
const QWEN_REF = "preview:qwen-3-8-flash";
const FREE = Object.freeze([GLM, DEEPSEEK]);
const PREMIUM = Object.freeze([GLM, DEEPSEEK, MIMO, HAIKU]);
/** The refs each line-up's models are declared under (GLM twice: the sealed two-ref pair). */
const FREE_REFS = Object.freeze(["preview:fixture-a", "preview:fixture-b", "preview:deepseek-v4-1-flash"]);
const PREMIUM_REFS = Object.freeze([...FREE_REFS, "preview:mimo-v2-6-pro", "preview:claude-haiku-5-5"]);
/** The live line-up's shape: Luna not switched on yet, Qwen taken out. */
const PREVIEW = parsePreviewProviderTestConfig(JSON.stringify({
  deployment: "v3-preview", free_model_ids: FREE, premium_model_ids: PREMIUM,
  requested_thinking_level: "high", budget_socket: "/run/debateai-v3-preview/provider-budget.sock",
  anthropic_budget_socket: "/run/debateai-v3-preview/anthropic-budget.sock", scope_id: "preview-seated-probe-fixture"
})) as PreviewProviderTestConfig;
const configured = (providerRef: string) => {
  const row = previewModelRow(previewTargetJsonRow(providerRef).model)!;
  return { providerRef, maker: row.maker, adapterKind: row.adapterKind };
};
const CONFIGURED = PREVIEW_REVIEWED_PROVIDER_REFS.map(configured);
const TARGETS = parseProviderDiscoveryTargets(JSON.stringify(PREVIEW_REVIEWED_PROVIDER_REFS.map(previewTargetJsonRow)), CONFIGURED);
const ASK = Object.freeze({
  question_line: "Should cities price congestion on central roads?", risk_tier: "casual", tier_source: "ASKER",
  tier_provenance_ref: "asker-declaration:seated-probe", composition_budget_tier: "high", plan_tier: "free",
  depth_params: { depth: 2 }, decision_scope: "seated probe test", as_of: "2026-11-25T00:00:00.000Z",
  steering_presets: [], steering_annotations: []
});
const askOn = (planTier: "free" | "premium") => ({ ...ASK, plan_tier: planTier }) as unknown as AskRequest;
const CEILING_TERMS = Object.freeze({ judgeMaxAttempts: 3, organMaxAttempts: 3, maxRecompose: 1, maxCooldownHoldsPerRun: 2,
  finalRetryAttempts: 1, branchingFactor: 2, compositionSegmentCap: 4, fixedOrgansPerComposition: 6, reviewerCallsPerNode: 1,
  synthesizerMaxRounds: 3, evaluatorMaxRounds: 3, maxDepth: 5 });
const NOW = Date.parse("2026-11-25T10:00:00.000Z");
const FRESHNESS_MS = 600_000;

/** What a gate answers for one request: the vendor's OK, the gate's proof of an unbilled refusal, or a billed 500. */
type GateStep = "OK" | "UNBILLED" | "BILLED_500";

/**
 * One port per gate, Amazon's included. Each request's model takes the next step of its script (OK once spent); every
 * request that reached a gate is recorded by model. `hold`, when given, keeps every answer back until it resolves.
 */
function gates(scripts: Readonly<Record<string, readonly GateStep[]>> = {}, hold?: Promise<void>) {
  const sent: string[] = [];
  const queues = new Map<string, GateStep[]>(Object.entries(scripts).map(([model, steps]) => [model, [...steps]]));
  const port = (provider: "deepinfra" | "anthropic" | "bedrock"): PreviewBudgetPort => ({
    execute: async (execution) => {
      const model = (JSON.parse(execution.requestBody) as { model: string }).model;
      sent.push(model);
      await hold;
      const step = queues.get(model)?.shift() ?? "OK";
      if (step === "UNBILLED") throw new PreviewVendorRefusedUnbilled();
      if (step === "BILLED_500") return { status: 500, body: JSON.stringify({ error: { message: "vendor internal error" } }) };
      return { status: 200, body: provider === "anthropic"
        ? JSON.stringify({ id: "msg_seated", type: "message", role: "assistant", model, content: [{ type: "text", text: "OK" }],
          stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 10, output_tokens: 2 } })
        : JSON.stringify({ id: "seated", model, choices: [{ message: { role: "assistant", content: "OK" }, finish_reason: "stop" }] }) };
    }
  });
  const fetchImplementation = createPreviewGuardedFetch({ deepinfra: port("deepinfra"), anthropic: port("anthropic"), bedrock: port("bedrock") });
  return { sent, fetchImplementation };
}

/** The probe rows, in memory: the latest per ref is the last one written. */
function probeStore(seed: readonly ProviderProbeRecord[] = []) {
  const rows: ProviderProbeRecord[] = [...seed];
  const written: ProviderProbeRecord[] = [];
  const store: ProviderDiscoveryProbeStore = {
    readLatest: async (providerRefs) => providerRefs.flatMap((ref) => rows.filter((row) => row.providerRef === ref).slice(-1)),
    record: async (row) => { rows.push(row); written.push(row); }
  };
  return { store, written };
}

function resolverOver(input: Readonly<{ gate: ReturnType<typeof gates>; probes: ReturnType<typeof probeStore> }>) {
  return createProviderDiscoveryResolver({
    configuredProviders: CONFIGURED,
    targets: TARGETS,
    probes: input.probes.store,
    probeFreshnessMs: FRESHNESS_MS,
    probeTimeoutMs: 10_000,
    probeControlsFor: previewProbeControls,
    fetchImplementation: input.gate.fetchImplementation,
    clock: () => new Date(NOW),
    previewRound: true
  });
}

/** The gate's read-only "what is left today": plenty of room, with the models it has switched on. */
function remaining(enabledModels: readonly string[]): PreviewGateRemaining {
  return Object.freeze({ state: "active", windowOpen: true, remainingNanoUsd: 100_000_000_000n, remainingCalls: 100_000,
    maxConcurrentCalls: 10, largestReservationNanoUsd: 214_016_000n, enabledModels });
}

/** The ask path as main.ts composes it on the preview; the estimate counts a check for every declared model, as boot does. */
function askSettings(resolveDiscoveredPanel: RunCreationSettings["resolveDiscoveredPanel"], rotation = false): RunCreationSettings {
  const budgetGate = Object.freeze({
    remaining: { deepinfra: async () => remaining([GLM, DEEPSEEK, MIMO]), anthropic: async () => remaining([HAIKU]) },
    roleModels: { answerWriter: GLM, answerChecker: DEEPSEEK, storyteller: GLM, storyChecker: DEEPSEEK },
    roleProviderRefs: ["preview:fixture-a", "preview:deepseek-v4-1-flash"],
    storyRounds: 2,
    callOutputTokens: { debate: 8192, storyteller: 12_000, storytellerRetry: 24_000, storyChecker: 8192 },
    askProbeModelIds: TARGETS.map((target) => target.model),
    maxCooldownHoldsPerRun: 2,
    readUnfinishedRuns: async () => [],
    termsForVersion: async () => { throw new Error("FIXTURE_HAS_NO_UNFINISHED_DEBATES"); }
  }) as PreviewBudgetGateSettings;
  return {
    previewProviderTestConfig: PREVIEW, previewBudgetGate: budgetGate,
    strangerSampleRate: 0, releaseKey: testReleaseKey(12), registerVersion: 12, batteryVersion: "seated-probe",
    settlementWatchHandle: "watch:seated-probe",
    resolveDiscoveredPanel,
    resolveEnvelopeBasis: async ({ depthParams, panelSize, backupSequencesProvisioned }) =>
      computeStructuralCeilingBasis({ ...CEILING_TERMS, panelSize, depth: Number(depthParams.depth), backupSequencesProvisioned }),
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({ effectiveRiskTier, tierSource, tierProvenanceRef }),
    ...(rotation ? { roleRotation: { readCounts: async () => ({}) } } : {})
  } as RunCreationSettings;
}

const count = (sent: readonly string[], model: string) => sent.filter((entry) => entry === model).length;
const refsOf = (rows: readonly ProviderProbeRecord[]) => [...new Set(rows.map((row) => row.providerRef))].sort();
const refused = (promise: Promise<unknown>) => promise.then(() => { throw new Error("the ask was admitted"); }, (caught: unknown) => caught);
const healthy = (providerRef: string, modelId: string, probedAt: number): ProviderProbeRecord => Object.freeze({
  probeEvidenceRef: randomUUID(), providerRef, maker: configured(providerRef).maker, state: "HEALTHY",
  modelId, failureCode: null, probedAt: new Date(probedAt)
});

describe("an ask probes only the models it may seat", () => {
  it("the fixture declares all seven reviewed addresses, Luna's and Qwen's among them, and seats neither", () => {
    expect(TARGETS.map((target) => target.providerRef)).toEqual([...PREVIEW_REVIEWED_PROVIDER_REFS]);
    expect(TARGETS.find((target) => target.providerRef === LUNA_REF)?.model).toBe(LUNA);
    expect(TARGETS.find((target) => target.providerRef === QWEN_REF)?.model).toBe(QWEN);
    for (const roster of [FREE, PREMIUM]) for (const model of [LUNA, QWEN]) expect(roster).not.toContain(model);
  });

  it.each([
    ["free", FREE, FREE_REFS],
    ["premium", PREMIUM, PREMIUM_REFS]
  ] as const)("a %s ask sends each of its own models one check and nothing to any other declared model", async (tier, roster, refs) => {
    const gate = gates();
    const probes = probeStore();
    const admitted = await evaluateAskAdmission(askSettings(resolverOver({ gate, probes })), askOn(tier));
    expect(admitted.discoveredPanel.map((member) => member.model_id)).toEqual(roster);
    expect([...gate.sent].sort()).toEqual([...roster].sort());
    for (const model of [LUNA, QWEN]) expect(count(gate.sent, model)).toBe(0);
    // One row per ref of its own models (GLM's two refs share one check), none for Luna, Qwen or the other plan's models.
    expect(refsOf(probes.written)).toEqual([...refs].sort());
    expect(probes.written).toHaveLength(refs.length);
    expect(probes.written.every((row) => row.state === "HEALTHY")).toBe(true);
  });

  it("a fresh check is not repeated; only the ask's own stale model is probed, once", async () => {
    const gate = gates();
    // DeepSeek was checked a minute ago; GLM's checks are an hour old; Luna and Qwen have no rows at all.
    const probes = probeStore([
      healthy("preview:fixture-a", GLM, NOW - 3_600_000), healthy("preview:fixture-b", GLM, NOW - 3_600_000),
      healthy("preview:deepseek-v4-1-flash", DEEPSEEK, NOW - 60_000)
    ]);
    const admitted = await evaluateAskAdmission(askSettings(resolverOver({ gate, probes })), askOn("free"));
    expect(admitted.discoveredPanel.map((member) => member.model_id)).toEqual(FREE);
    expect(gate.sent).toEqual([GLM]);
    expect(refsOf(probes.written)).toEqual(["preview:fixture-a", "preview:fixture-b"]);
  });

  it("a roster model whose check failed (a billed 500) refuses the ask as before, and still nothing reaches Luna or Qwen", async () => {
    const gate = gates({ [DEEPSEEK]: ["BILLED_500"] });
    const probes = probeStore();
    expect(await refused(evaluateAskAdmission(askSettings(resolverOver({ gate, probes })), askOn("free"))))
      .toMatchObject({ name: "AskRefusal", code: "ASK_PLAN_TIER_MODEL_UNAVAILABLE" });
    expect([...gate.sent].sort()).toEqual([...FREE].sort());
    expect(probes.written.find((row) => row.providerRef === "preview:deepseek-v4-1-flash"))
      .toMatchObject({ state: "ABSENT", modelId: null, failureCode: "PROVIDER_PROBE_HTTP_500" });
    expect(refsOf(probes.written)).toEqual([...FREE_REFS].sort());
  });

  it("a busy roster model sits out as before (one check, no resend), and still nothing reaches Luna or Qwen", async () => {
    const gate = gates({ [MIMO]: ["UNBILLED", "OK"] });
    const probes = probeStore();
    const admitted = await evaluateAskAdmission(askSettings(resolverOver({ gate, probes }), true), askOn("premium"));
    expect(admitted.discoveredPanel.map((member) => member.model_id)).toEqual([GLM, DEEPSEEK, HAIKU]);
    expect(count(gate.sent, MIMO)).toBe(1);
    for (const model of [LUNA, QWEN]) expect(count(gate.sent, model)).toBe(0);
    expect(probes.written.find((row) => row.providerRef === "preview:mimo-v2-6-pro"))
      .toMatchObject({ state: "ABSENT", failureCode: "PROVIDER_PROBE_UNBILLED_REFUSAL" });
    expect(refsOf(probes.written)).toEqual([...PREMIUM_REFS].sort());
  });
});

describe("the preview round over a set of models", () => {
  it("an old HEALTHY row of a model outside the set never puts it in the panel, and a model with no row is simply left out", async () => {
    const gate = gates();
    const probes = probeStore([healthy(LUNA_REF, LUNA, NOW - 3_600_000)]);
    const panel = await resolverOver({ gate, probes })([GLM]);
    expect(panel.map((member) => member.provider_ref)).toEqual(["preview:fixture-a", "preview:fixture-b"]);
    expect(panel.busyModelIds).toEqual([]);
    expect(gate.sent).toEqual([GLM]);
    expect(refsOf(probes.written)).toEqual(["preview:fixture-a", "preview:fixture-b"]);
  });

  it("with no set it probes every declared target, as before", async () => {
    const gate = gates();
    const probes = probeStore();
    const panel = await resolverOver({ gate, probes })();
    expect(panel.map((member) => member.provider_ref)).toEqual([...PREVIEW_REVIEWED_PROVIDER_REFS]);
    expect([...new Set(gate.sent)].sort()).toEqual([GLM, DEEPSEEK, MIMO, QWEN, HAIKU, LUNA].sort());
    expect(gate.sent).toHaveLength(6);
  });

  it("a Free and a Premium ask at the same moment send each model they share one request", async () => {
    let release!: () => void;
    const gate = gates({}, new Promise<void>((done) => { release = done; }));
    const probes = probeStore();
    const resolve = resolverOver({ gate, probes });
    const free = resolve(FREE);
    const premium = resolve(PREMIUM);
    await vi.waitFor(() => expect(gate.sent).toHaveLength(PREMIUM.length));
    // Let any second request for a shared model arrive before the answers are let through.
    await new Promise((done) => setTimeout(done, 20));
    release();
    const [freePanel, premiumPanel] = await Promise.all([free, premium]);
    expect([...gate.sent].sort()).toEqual([...PREMIUM].sort());
    expect(freePanel.map((member) => member.provider_ref)).toEqual([...FREE_REFS]);
    expect(premiumPanel.map((member) => member.provider_ref)).toEqual([...PREMIUM_REFS]);
    // Both panels carry the same rows for the models they share: one check, one row per ref.
    expect(freePanel.map((member) => member.probe_evidence_ref)).toEqual(premiumPanel.slice(0, 3).map((member) => member.probe_evidence_ref));
    expect(probes.written).toHaveLength(PREMIUM_REFS.length);
  });

  it("asks for the same set at the same moment share one round", async () => {
    let release!: () => void;
    const gate = gates({}, new Promise<void>((done) => { release = done; }));
    const probes = probeStore();
    const readLatest = vi.spyOn(probes.store, "readLatest");
    const resolve = resolverOver({ gate, probes });
    const rounds = [resolve([DEEPSEEK, GLM]), resolve([GLM, DEEPSEEK]), resolve([GLM, DEEPSEEK, GLM])];
    await vi.waitFor(() => expect(gate.sent).toHaveLength(2));
    release();
    const panels = await Promise.all(rounds);
    expect(panels[1]).toBe(panels[0]);
    expect(panels[2]).toBe(panels[0]);
    expect(readLatest).toHaveBeenCalledTimes(1);
    expect(gate.sent).toHaveLength(2);
  });
});
