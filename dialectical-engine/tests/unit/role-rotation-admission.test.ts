/**
 * Spec 2026-10-11 Part 4: with the row ON and two or more makers, admission picks the four roles
 * BEFORE the estimate and hands them to submit; otherwise nothing changes.
 */
import { createServer, type Server, type Socket } from "node:net";
import { describe, expect, it, vi } from "vitest";
import { createPool, isDatabasePoolBusy } from "../../packages/db/src/index.js";

/** Spec Part 5: the estimate is told whether the debate is rotated (Task 5 prices it); recorded here, never priced. */
const estimate = vi.hoisted(() => ({ inputs: [] as unknown[] }));
vi.mock("../../apps/api/src/preview-budget-estimate.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../apps/api/src/preview-budget-estimate.js")>()),
  assertPreviewBudgetAdmits: async (_gate: unknown, input: unknown) => { estimate.inputs.push(input); }
}));

import { evaluateAskAdmission, type RunCreationSettings } from "@debateai/api";
import type { AskRequest } from "@debateai/contract";
import type { DiscoveredPanelMember } from "@debateai/db";
import { parsePreviewProviderTestConfig } from "@debateai/providers";
import { computeStructuralCeilingBasis } from "@debateai/register";
import { roleRotationSeed, pickRotatedRoles, type RoleRotationCounts } from "@debateai/scorecard";

const CEILING_TERMS = Object.freeze({ judgeMaxAttempts: 3, organMaxAttempts: 3, maxRecompose: 1, maxCooldownHoldsPerRun: 1,
  finalRetryAttempts: 1, branchingFactor: 2, compositionSegmentCap: 4, fixedOrgansPerComposition: 6, reviewerCallsPerNode: 1,
  synthesizerMaxRounds: 3, evaluatorMaxRounds: 3, maxDepth: 5 });
const member = (providerRef: string, maker: string, modelId: string): DiscoveredPanelMember => Object.freeze({
  provider_ref: providerRef, maker, model_id: modelId, probe_evidence_ref: `probe:${providerRef}`, probed_at: "2026-10-11T00:00:00.000Z" });
/** The free plan's two local roster models (PLAN_TIER_ROSTERS.free), two makers. */
const PANEL = Object.freeze([member("development:codex-cli", "OpenAI", "gpt-5.6-luna"), member("development:claude-cli", "Anthropic", "claude-sonnet-5")]);
const ASK: AskRequest = { question_line: "Should cities price congestion?", risk_tier: "casual", tier_source: "ASKER",
  tier_provenance_ref: "asker:test", composition_budget_tier: "low", depth_params: { depth: 1 }, decision_scope: "rotation admission test",
  as_of: "2026-10-11T00:00:00.000Z", steering_presets: [], plan_tier: "free", steering_annotations: [] };

function settings(input: Readonly<{ counts?: RoleRotationCounts; rotation?: boolean; panel?: readonly DiscoveredPanelMember[]; order?: string[]; failCounts?: boolean; countsError?: unknown }>): RunCreationSettings {
  return {
    strangerSampleRate: 0, registerVersion: 1, batteryVersion: "battery:rotation", settlementWatchHandle: "watch:rotation",
    resolveDiscoveredPanel: async () => input.panel ?? PANEL,
    resolveEnvelopeBasis: async ({ depthParams, panelSize, backupSequencesProvisioned }) => {
      input.order?.push("basis");
      return computeStructuralCeilingBasis({ ...CEILING_TERMS, panelSize, depth: Number(depthParams.depth), backupSequencesProvisioned });
    },
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({ effectiveRiskTier, tierSource, tierProvenanceRef }),
    ...(input.rotation === true ? { roleRotation: { readCounts: async () => {
      input.order?.push("counts");
      if (input.failCounts === true) throw new Error("database gone");
      if (input.countsError !== undefined) throw input.countsError;
      return input.counts ?? {};
    } } } : {})
  };
}

describe("role rotation at admission", () => {
  it("ON with two makers: the pick is the rule's, from this ask's seed and the counts, made before the envelope basis", async () => {
    const order: string[] = [];
    // Amendment 2026-10-11 (ruling A): per role, per model id { picked, eligible }.
    const counts: RoleRotationCounts = { ANSWER_WRITER: { "gpt-5.6-luna": { picked: 4, eligible: 4 } } };
    const admitted = await evaluateAskAdmission(settings({ rotation: true, counts, order }), ASK);
    expect(admitted.roleRotation).toEqual(pickRotatedRoles({ panel: PANEL, counts, seed: roleRotationSeed(ASK) }));
    expect(admitted.roleRotation!.answerWriter.modelId).toBe("claude-sonnet-5");
    expect(admitted.roleRotation!.eligibleModelIds).toEqual(["gpt-5.6-luna", "claude-sonnet-5"]);
    expect(order).toEqual(["counts", "basis"]);
  });
  it("absent setting: no counts read, no pick", async () => {
    const order: string[] = [];
    const admitted = await evaluateAskAdmission(settings({ order }), ASK);
    expect("roleRotation" in admitted).toBe(false);
    expect(order).toEqual(["basis"]);
  });
  it("a one-maker panel keeps today's roles and reads no counts", async () => {
    const order: string[] = [];
    const oneMaker = [member("development:codex-cli", "OpenAI", "gpt-5.6-luna"), member("development:codex-premium-cli", "OpenAI", "claude-sonnet-5")];
    const admitted = await evaluateAskAdmission(settings({ rotation: true, panel: oneMaker, order }), ASK);
    expect("roleRotation" in admitted).toBe(false);
    expect(order).toEqual(["basis"]);
  });
  it("counts that cannot be read refuse the ask as not available right now, never admit it unpinned", async () => {
    const before = Date.now();
    const refused = await evaluateAskAdmission(settings({ rotation: true, failCounts: true }), ASK).then(
      () => { throw new Error("admitted without its counts"); }, (caught: unknown) => caught);
    expect(refused).toMatchObject({ name: "AskRefusal", code: "ASK_MODEL_CANDIDATE_UNAVAILABLE" });
    // The spec's one-minute retry.
    const retryAt = (refused as { retryAt?: Date }).retryAt!;
    expect(retryAt.getTime() - before).toBeGreaterThanOrEqual(60_000);
    expect(retryAt.getTime() - before).toBeLessThan(65_000);
  });
  it("a busy pool reading the counts is rethrown for the API's SERVICE_BUSY 503 (ruling H), never admitted unpinned", async () => {
    const busy = await busyPoolFailure();
    expect(isDatabasePoolBusy(busy)).toBe(true);
    const order: string[] = [];
    const refused = await evaluateAskAdmission(settings({ rotation: true, countsError: busy, order }), ASK).then(
      () => { throw new Error("admitted without its counts"); }, (caught: unknown) => caught);
    expect(refused).toBe(busy);
    expect(refused).not.toMatchObject({ name: "AskRefusal" });
    expect(order).toEqual(["counts"]);
  });
});

/**
 * A real busy-pool failure, built as dev's connection-budget tests build it (tests/unit/database-pool-busy.test.ts):
 * a TCP server that accepts and never answers is a database that never hands out a connection. The busy marker
 * is only set by the pool itself, so it cannot be faked.
 */
async function busyPoolFailure(): Promise<unknown> {
  const sockets: Socket[] = [];
  const server: Server = createServer((socket) => { sockets.push(socket); });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new TypeError("TEST_SERVER_ADDRESS");
  const pool = createPool(`postgresql://nobody@127.0.0.1:${address.port}/none`, { max: 1, connectionTimeoutMillis: 100, name: "test:rotation-busy" });
  const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
  try {
    return await pool.query("SELECT 1").then(() => { throw new TypeError("EXPECTED_REJECTION"); }, (caught: unknown) => caught);
  } finally {
    logged.mockRestore();
    await pool.end().catch(() => undefined);
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
  }
}

describe("role rotation tells the preview's estimate whether the debate is rotated", () => {
  const GLM = "zai-org/GLM-5.3-Flash";
  const DEEPSEEK = "deepseek-ai/DeepSeek-V4.1-Flash";
  const PREVIEW = parsePreviewProviderTestConfig(JSON.stringify({
    deployment: "v3-preview", free_model_ids: [GLM, DEEPSEEK], premium_model_ids: [GLM, DEEPSEEK],
    requested_thinking_level: "high", budget_socket: "/run/debateai-v3-preview/provider-budget.sock", scope_id: "fixture"
  }))!;
  const PREVIEW_PANEL = Object.freeze([member("preview:fixture-a", "Z.AI", GLM), member("preview:deepseek-v4-1-flash", "DeepSeek", DEEPSEEK)]);
  const onPreview = (rotation: boolean): RunCreationSettings => ({
    ...settings({ rotation, panel: PREVIEW_PANEL }), previewProviderTestConfig: PREVIEW
  });
  it.each([[true, true], [false, false]])("rotation %s: rotated %s", async (rotation, rotated) => {
    estimate.inputs.length = 0;
    const admitted = await evaluateAskAdmission(onPreview(rotation), ASK);
    expect("roleRotation" in admitted).toBe(rotation);
    expect(estimate.inputs).toEqual([expect.objectContaining({ rotated })]);
  });
});
