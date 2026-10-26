// A busy model never blocks a preview debate: the ASK path (spec
// docs/superpowers/specs/2026-10-11-preview-busy-model-design.md, "Must be proven by tests", ask path (i)-(v)).
// On 2026-10-11 the owner's five-AI ask was refused (ASK_PLAN_TIER_MODEL_UNAVAILABLE): DeepInfra answered 429 to
// GLM-5.3-Flash, the gate turned it into PROVIDER_REFUSED_UNBILLED, discovery probed GLM twice at once (two reviewed
// refs), and admission refused the whole ask for the one missing model.
// Amendment §3a (2026-10-11 review): at ask time there is NO 60-second resend any more. A model whose probe this round
// was a gate-proven unbilled refusal sits out the debate (rotation on, two makers left), after exactly one POST.
// Everything here is the shipped path: the six reviewed targets, the guarded fetch over the REAL gate RPC ports
// (createPreviewBudgetRpcPort over unix-socket stubs, so the 409 mapping is the shipped one), the discovery resolver
// with the preview round main.ts passes, the real probe repository on a migrated embedded PostgreSQL (the failure
// code column is free text: no migration), the real rotation counts, and evaluateAskAdmission with the five-model
// preview config. Nothing is injected but the clock. Integration suites are skipped by the CI gate: run this file by
// hand before merging.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluateAskAdmission, type RunCreationSettings } from "@debateai/api";
import type { AskRequest } from "@debateai/contract";
import { ProviderProbeRepository, migrate, readRoleRotationCounts } from "@debateai/db";
import {
  createPreviewBudgetRpcPort,
  createPreviewGuardedFetch,
  parsePreviewProviderTestConfig,
  parseProviderDiscoveryTargets,
  previewModelRow,
  previewProbeControls,
  previewTargetJsonRow,
  PREVIEW_REVIEWED_PROVIDER_REFS,
  type PreviewGateRemaining,
  type PreviewProviderTestConfig
} from "@debateai/providers";
import { computeStructuralCeilingBasis } from "@debateai/register";
import { createProviderDiscoveryResolver } from "../../apps/api/src/provider-discovery.js";
import type { PreviewBudgetGateSettings } from "../../apps/api/src/preview-budget-estimate.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { testReleaseKey } from "../support/releaseKey.js";

const GLM = "zai-org/GLM-5.3-Flash";
const DEEPSEEK = "deepseek-ai/DeepSeek-V4.1-Flash";
const MIMO = "XiaomiMiMo/MiMo-V2.6-Pro";
const QWEN = "Qwen/Qwen3.8-Flash";
const HAIKU = "claude-haiku-5-5";
const FIVE = Object.freeze([GLM, DEEPSEEK, MIMO, QWEN, HAIKU]);
/** Owner ruling 5 / R4: the wait before a resend of an unbilled refusal; the ask path (§3a) must never take it. */
const UNBILLED_RESEND_MS = 60_000;
/** Spec §2: the first observation's own code (free text in core.provider_probe). */
const UNBILLED_CODE = "PROVIDER_PROBE_UNBILLED_REFUSAL";
const PREVIEW = parsePreviewProviderTestConfig(JSON.stringify({
  deployment: "v3-preview", free_model_ids: [GLM, DEEPSEEK], premium_model_ids: FIVE,
  requested_thinking_level: "high", budget_socket: "/run/debateai-v3-preview/provider-budget.sock",
  anthropic_budget_socket: "/run/debateai-v3-preview/anthropic-budget.sock", scope_id: "preview-busy-model-fixture"
}))!;
/** The register's configured provider for a reviewed ref (its row's maker and adapter kind). */
const configured = (providerRef: string) => {
  const row = previewModelRow(previewTargetJsonRow(providerRef).model)!;
  return { providerRef, maker: row.maker, adapterKind: row.adapterKind };
};
const CONFIGURED = PREVIEW_REVIEWED_PROVIDER_REFS.map(configured);
const TARGETS = parseProviderDiscoveryTargets(JSON.stringify(PREVIEW_REVIEWED_PROVIDER_REFS.map(previewTargetJsonRow)), CONFIGURED);
const ASK = Object.freeze({
  question_line: "Should cities price congestion on central roads?", risk_tier: "casual", tier_source: "ASKER",
  tier_provenance_ref: "asker-declaration:busy-model", composition_budget_tier: "high", plan_tier: "premium",
  depth_params: { depth: 2 }, decision_scope: "busy model test", as_of: "2026-10-11T00:00:00.000Z",
  steering_presets: [], steering_annotations: []
}) as unknown as AskRequest;
const CEILING_TERMS = Object.freeze({ judgeMaxAttempts: 3, organMaxAttempts: 3, maxRecompose: 1, maxCooldownHoldsPerRun: 2,
  finalRetryAttempts: 1, branchingFactor: 2, compositionSegmentCap: 4, fixedOrgansPerComposition: 6, reviewerCallsPerNode: 1,
  synthesizerMaxRounds: 3, evaluatorMaxRounds: 3, maxDepth: 5 });

let database: TestDatabase;
const servers: Server[] = [];
const directories: string[] = [];
/** A clock that only moves forward, one second per reading, so every row of a round orders by probed_at. */
let clockMs = Date.now();
const clock = () => new Date(clockMs += 1_000);

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 600_000);
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((done) => server.close(() => done()))));
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});
afterAll(async () => database?.stop());

/** What the gate answers for one request: the vendor's OK, the gate's unbilled 409, or a billed vendor failure. */
type GateStep = "OK" | "UNBILLED" | "BILLED_500";

/**
 * One provider's gate over a real unix socket, speaking the gate's RPC protocol: each request's model takes the next
 * step of its script (OK once the script is spent). Every request that reached the gate is recorded by model.
 */
async function gateSocket(provider: "deepinfra" | "anthropic", scripts: Readonly<Record<string, readonly GateStep[]>>,
  sent: string[]): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "pbm-"));
  directories.push(directory);
  const socket = join(directory, "gate.sock");
  const queues = new Map<string, GateStep[]>(Object.entries(scripts).map(([model, steps]) => [model, [...steps]]));
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const execution = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { requestBody: string };
      const model = (JSON.parse(execution.requestBody) as { model: string }).model;
      sent.push(model);
      const step = queues.get(model)?.shift() ?? "OK";
      if (step === "UNBILLED") {
        response.writeHead(409, { "content-type": "application/json" }).end(JSON.stringify({ error: "PROVIDER_REFUSED_UNBILLED" }));
        return;
      }
      const body = step === "BILLED_500" ? JSON.stringify({ error: { message: "vendor internal error" } })
        : provider === "anthropic"
          ? JSON.stringify({ id: "msg_busy_model", type: "message", role: "assistant", model, content: [{ type: "text", text: "OK" }],
            stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 10, output_tokens: 2 } })
          : JSON.stringify({ id: "busy-model", model, choices: [{ message: { role: "assistant", content: "OK" } }] });
      response.writeHead(200, { "content-type": "application/json" })
        .end(JSON.stringify({ status: step === "BILLED_500" ? 500 : 200, body }));
    });
  });
  servers.push(server);
  await new Promise<void>((done) => server.listen(socket, done));
  return socket;
}

/** The gate's read-only "what is left today" answer: plenty of room, with the models it has switched on. */
function remaining(enabledModels: readonly string[]): PreviewGateRemaining {
  return Object.freeze({ state: "active", windowOpen: true, remainingNanoUsd: 100_000_000_000n, remainingCalls: 100_000,
    maxConcurrentCalls: 10, largestReservationNanoUsd: 214_016_000n, enabledModels });
}

/** The estimate's gate settings: the sealed v11 roles (GLM writer, DeepSeek checker), with `enabled` switched on. */
function budgetGate(enabled: readonly string[]): PreviewBudgetGateSettings {
  return Object.freeze({
    remaining: { deepinfra: async () => remaining(enabled.filter((model) => model !== HAIKU)),
      anthropic: async () => remaining(enabled.filter((model) => model === HAIKU)) },
    roleModels: { answerWriter: GLM, answerChecker: DEEPSEEK, storyteller: GLM, storyChecker: DEEPSEEK },
    roleProviderRefs: ["preview:fixture-a", "preview:deepseek-v4-1-flash"],
    storyRounds: 2,
    callOutputTokens: { debate: 8192, storyteller: 12_000, storytellerRetry: 24_000, storyChecker: 8192 },
    askProbeModelIds: [GLM, GLM, DEEPSEEK, MIMO, QWEN, HAIKU],
    maxCooldownHoldsPerRun: 2,
    readUnfinishedRuns: async () => [],
    termsForVersion: async () => { throw new Error("FIXTURE_HAS_NO_UNFINISHED_DEBATES"); }
  }) as PreviewBudgetGateSettings;
}

type Round = Readonly<{ sent: string[]; startedAt: Date; startedMs: number; settings: RunCreationSettings }>;

/**
 * The ask path exactly as main.ts composes it on the preview (or, with `hosted`, without the preview round and
 * config, as hosted and local compose it). `glm` is GLM's gate script; every other model answers OK.
 */
async function askRound(input: Readonly<{ glm: readonly GateStep[]; hosted?: boolean; enabled?: readonly string[];
  rotation?: boolean; probeFreshnessMs?: number }>): Promise<Round> {
  const sent: string[] = [];
  const config = PREVIEW as PreviewProviderTestConfig;
  const deepinfraSocket = await gateSocket("deepinfra", { [GLM]: input.glm }, sent);
  const anthropicSocket = await gateSocket("anthropic", {}, sent);
  const fetchImplementation = createPreviewGuardedFetch({
    deepinfra: createPreviewBudgetRpcPort(config, deepinfraSocket),
    anthropic: createPreviewBudgetRpcPort(config, anthropicSocket)
  });
  const startedAt = new Date(clockMs + 1);
  const resolveDiscoveredPanel = createProviderDiscoveryResolver({
    configuredProviders: CONFIGURED,
    targets: TARGETS,
    probes: new ProviderProbeRepository(database.pool),
    // Every round probes afresh (unless a test asks otherwise): the rows an earlier test wrote are never reused.
    probeFreshnessMs: input.probeFreshnessMs ?? 1,
    probeTimeoutMs: 10_000,
    probeControlsFor: previewProbeControls,
    fetchImplementation,
    clock,
    ...(input.hosted === true ? {} : { previewRound: true as const })
  });
  const settings: RunCreationSettings = {
    ...(input.hosted === true ? {} : { previewProviderTestConfig: config, previewBudgetGate: budgetGate(input.enabled ?? FIVE) }),
    strangerSampleRate: 0, releaseKey: testReleaseKey(11), registerVersion: 11, batteryVersion: "busy-model", settlementWatchHandle: "watch:busy-model",
    resolveDiscoveredPanel,
    resolveEnvelopeBasis: async ({ depthParams, panelSize, backupSequencesProvisioned }) =>
      computeStructuralCeilingBasis({ ...CEILING_TERMS, panelSize, depth: Number(depthParams.depth), backupSequencesProvisioned }),
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({ effectiveRiskTier, tierSource, tierProvenanceRef }),
    ...(input.rotation === false ? {} : { roleRotation: { readCounts: () => readRoleRotationCounts(database.pool) } })
  } as RunCreationSettings;
  return { sent, startedAt, startedMs: performance.now(), settings };
}

/** This round's probe rows for one ref, in the order they were written. */
async function probeRows(providerRef: string, since: Date) {
  const result = await database.pool.query<{ probe_id: string; state: string; model_id: string | null; failure_code: string | null }>(
    `SELECT probe_id, state, model_id, failure_code FROM core.provider_probe
      WHERE provider_ref=$1 AND probed_at >= $2 ORDER BY probed_at, probe_id`, [providerRef, since]);
  return result.rows;
}

const refused = (promise: Promise<unknown>) => promise.then(() => { throw new Error("the ask was admitted"); }, (caught: unknown) => caught);
const count = (sent: readonly string[], model: string) => sent.filter((entry) => entry === model).length;
/** §3a: the ask path never waits the resend's 60 seconds (one POST per model already proves it never resends). */
const noResendWait = (round: Round) => expect(performance.now() - round.startedMs).toBeLessThan(UNBILLED_RESEND_MS);
const FOUR = FIVE.filter((model) => model !== GLM);

describe("the preview ask with a busy model (spec 2026-10-11 busy model)", () => {
  it("(i) probes each model once per round: one GLM POST for its two reviewed refs, one row per ref with its own id", async () => {
    const round = await askRound({ glm: [] });
    const admitted = await evaluateAskAdmission(round.settings, ASK);
    expect(admitted.discoveredPanel.map((member) => member.model_id)).toEqual(FIVE);
    expect(count(round.sent, GLM)).toBe(1);
    for (const model of FIVE.slice(1)) expect(count(round.sent, model)).toBe(1);
    const a = await probeRows("preview:fixture-a", round.startedAt);
    const b = await probeRows("preview:fixture-b", round.startedAt);
    expect(a).toEqual([expect.objectContaining({ state: "HEALTHY", model_id: GLM, failure_code: null })]);
    expect(b).toEqual([expect.objectContaining({ state: "HEALTHY", model_id: GLM, failure_code: null })]);
    expect(a[0]!.probe_id).not.toBe(b[0]!.probe_id);
    noResendWait(round);
  });

  it("(ii) GLM [409]: GLM sits out with no resend; admitted with the four that answered, in the panel, the pin and the estimate", async () => {
    // The gate would answer GLM's second request (OK), so only the absence of a resend keeps GLM out. The gate has GLM
    // switched OFF: the estimate refuses any debate that would price a GLM call (a model not enabled is "not available
    // right now"), so this admission proves the estimate priced only the four.
    const round = await askRound({ glm: ["UNBILLED", "OK"], enabled: FOUR });
    const admitted = await evaluateAskAdmission(round.settings, ASK);
    expect(admitted.discoveredPanel.map((member) => member.model_id)).toEqual(FOUR);
    expect(new Set(admitted.discoveredPanel.map((member) => member.maker)).size).toBe(4);
    const pin = admitted.roleRotation!;
    // The pin lists its eligible models in position order (the opener first), so compared as a set.
    expect([...pin.eligibleModelIds].sort()).toEqual([...FOUR].sort());
    for (const role of [pin.answerWriter, pin.answerChecker, pin.storyteller, pin.storyChecker]) expect(role.modelId).not.toBe(GLM);
    expect(admitted.envelopeBasis).toMatchObject({ panel_size: 4 });
    // Exactly one GLM POST for its two refs, and no 60-second wait (§3a; the gate halts after too many unbilled refusals).
    expect(count(round.sent, GLM)).toBe(1);
    for (const model of FOUR) expect(count(round.sent, model)).toBe(1);
    noResendWait(round);
    for (const ref of ["preview:fixture-a", "preview:fixture-b"]) {
      expect(await probeRows(ref, round.startedAt)).toEqual([
        expect.objectContaining({ state: "ABSENT", model_id: null, failure_code: UNBILLED_CODE })
      ]);
    }
  });

  it("(ii) a fresh HEALTHY record of one GLM ref does not admit GLM when this round's GLM probe was refused unbilled", async () => {
    // Every earlier row is an hour old; fixture-a alone has a HEALTHY record seconds old, so with ten minutes of
    // freshness it is not probed, and fixture-b (stale) is. Busy is per MODEL: the panel must not hold GLM.
    clockMs += 3_600_000;
    await new ProviderProbeRepository(database.pool).record({ probeEvidenceRef: randomUUID(), providerRef: "preview:fixture-a",
      maker: configured("preview:fixture-a").maker, state: "HEALTHY", modelId: GLM, failureCode: null, probedAt: clock() });
    const round = await askRound({ glm: ["UNBILLED", "OK"], enabled: FOUR, probeFreshnessMs: 600_000 });
    const admitted = await evaluateAskAdmission(round.settings, ASK);
    expect(admitted.discoveredPanel.map((member) => member.model_id)).toEqual(FOUR);
    expect([...admitted.roleRotation!.eligibleModelIds].sort()).toEqual([...FOUR].sort());
    expect(count(round.sent, GLM)).toBe(1);
    noResendWait(round);
    expect(await probeRows("preview:fixture-b", round.startedAt)).toEqual([
      expect.objectContaining({ state: "ABSENT", model_id: null, failure_code: UNBILLED_CODE })
    ]);
  });

  it("(iii) without a rotation pin the busy model does not sit out: the sealed GLM writer would refuse at claim (J24)", async () => {
    const round = await askRound({ glm: ["UNBILLED"], rotation: false });
    expect(await refused(evaluateAskAdmission(round.settings, ASK)))
      .toMatchObject({ name: "AskRefusal", code: "ASK_PLAN_TIER_MODEL_UNAVAILABLE" });
  });

  it("(iv) GLM billed failure (a vendor 500 body): no resend, and the ask is refused as today", async () => {
    const round = await askRound({ glm: ["BILLED_500"] });
    expect(await refused(evaluateAskAdmission(round.settings, ASK)))
      .toMatchObject({ name: "AskRefusal", code: "ASK_PLAN_TIER_MODEL_UNAVAILABLE" });
    noResendWait(round);
    expect(count(round.sent, GLM)).toBe(1);
    expect(await probeRows("preview:fixture-a", round.startedAt)).toEqual([
      // Probe failure reasons (2026-10-12): the vendor's 500 is recorded as its own reason.
      expect.objectContaining({ state: "ABSENT", failure_code: "PROVIDER_PROBE_HTTP_500" })
    ]);
  });

  it("(v) hosted and local are unchanged: every target probed on its own, once, no wait, no busy list, the ask refused", async () => {
    const round = await askRound({ glm: ["UNBILLED", "UNBILLED"], hosted: true });
    const panel = await round.settings.resolveDiscoveredPanel();
    expect(panel.map((member) => member.model_id)).toEqual(FIVE.slice(1));
    expect(panel.busyModelIds).toBeUndefined();
    // Both GLM refs, each probed once: the round is today's.
    expect(count(round.sent, GLM)).toBe(2);
    noResendWait(round);
    // Off the preview the roster is the contract's (premium: three models, three makers). Even handed a busy list
    // for the one missing model, with rotation on and two makers left, hosted refuses exactly as today.
    const member = (providerRef: string, maker: string, modelId: string) => Object.freeze({ provider_ref: providerRef, maker,
      model_id: modelId, probe_evidence_ref: `probe:${providerRef}`, probed_at: "2026-10-11T00:00:00.000Z" });
    const hostedPanel = Object.defineProperty([member("hosted:sol", "OpenAI", "gpt-5.6-sol"), member("hosted:opus", "Anthropic", "claude-opus-5")],
      "busyModelIds", { value: ["grok-4.7-build"], enumerable: false });
    expect(await refused(evaluateAskAdmission({ ...round.settings, resolveDiscoveredPanel: async () => hostedPanel }, ASK)))
      .toMatchObject({ name: "AskRefusal", code: "ASK_PLAN_TIER_MODEL_UNAVAILABLE" });
  });
});
