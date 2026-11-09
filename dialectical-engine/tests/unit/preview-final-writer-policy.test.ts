/**
 * V4 start step, Task 3 (spec 2026-11-03 §5): on a v2 run the call policy sends the shared final-writer rule
 * (previewFinalWriterAsk) on every attempt: the F3 caps as a ceiling, the 1 MiB body room only for a FINAL_WRITER ask
 * the gate offers, and the length retry held to the same cap. Without terms (no resolver, or a run that is not v2) the
 * policy sends R22's asks byte for byte. The resolver is asked once per final-writer call, never for another call, and
 * a resolver that throws ends the call before anything is sent.
 */
import { describe, expect, it } from "vitest";
import {
  lengthRetryTokenCeiling, parsePreviewGateRemaining, parsePreviewProviderTestConfig, withPreviewProviderCallPolicy,
  type PreviewFinalWriterPlan, type PreviewFinalWriterTierUnread, type PreviewGateRemaining, type ProviderCallRequest,
  type ProviderCallResult, type ProviderGateway
} from "@debateai/providers";
import { framedFixturePacket } from "../support/framed-packet.js";

const GLM = "zai-org/GLM-5.3-Flash";
const DEEPSEEK = "deepseek-ai/DeepSeek-V4.1-Flash";
const MIMO = "XiaomiMiMo/MiMo-V2.6-Pro";
const QWEN = "Qwen/Qwen3.8-Flash";
const HAIKU = "claude-haiku-5-5";
const MIB = 1024 * 1024;
const V2_RUN = "run:v2";
const CONFIG = parsePreviewProviderTestConfig(JSON.stringify({ deployment: "v3-preview", requested_thinking_level: "high",
  budget_socket: "/run/debateai-v3-preview/deepinfra-budget-v3.sock", scope_id: "v4-final-writer-fixture",
  anthropic_budget_socket: "/run/debateai-v3-preview/anthropic-budget-v1.sock",
  free_model_ids: [GLM, HAIKU], premium_model_ids: [GLM, DEEPSEEK, MIMO, QWEN, HAIKU] }))!;
const TODAY_REMAINING = { state: "active", window_open: true, remaining_usd: "2.00", remaining_calls: 10, max_concurrent_calls: 2,
  largest_reservation_usd: "0.24704", enabled_models: [HAIKU] };
const OFFERED = parsePreviewGateRemaining({ ...TODAY_REMAINING, largest_final_writer_reservation_usd: "0.97664", final_writer_max_in_flight: 1 })!;
const NOT_OFFERED = parsePreviewGateRemaining(TODAY_REMAINING)!;

/** The four final-writer sites of Task 2: [callSiteKey, lane, role]. */
const SITES = [
  ["COMPOSER:SYNTHESIZER:INITIAL:1", "served", "SYNTHESIZER"],
  ["POST_COMPOSE_R9:EVALUATOR:1", "served", "EVALUATOR"],
  ["STORY:STORYTELLER:1", "story", "SYNTHESIZER"],
  ["STORY:CHECKER:1", "story", "EVALUATOR"]
] as const;
type Site = (typeof SITES)[number];

type Terms = (runId: string | null) => Readonly<{ plan: PreviewFinalWriterPlan }> | undefined;
type Sent = Readonly<{ bound: number; packetByteCap: number | undefined; outputTokenCap: number | undefined }>;

/** One policy over a recording gateway, with a counting gate reader that answers `remaining`. */
function harness(model: string, options: Readonly<{ terms?: Terms; remaining?: PreviewGateRemaining;
  told?: (event: PreviewFinalWriterTierUnread) => void }> = {}) {
  const seen: ProviderCallRequest[] = [];
  const counts = { reads: 0 };
  const inner: ProviderGateway = { call: async (sent) => {
    seen.push(sent);
    return { rawArtifactRef: "artifact", ledgerEntryRef: "entry", content: "{}", provider: "openai-compatible-http",
      model, maker: "Synthetic", modelVersion: model } satisfies ProviderCallResult;
  } };
  const read = async () => { counts.reads += 1; return options.remaining ?? OFFERED; };
  const policy = withPreviewProviderCallPolicy(inner, CONFIG, { model }, {
    gateRemaining: { deepinfra: read, anthropic: read },
    ...(options.terms === undefined ? {} : { finalWriterTermsOf: options.terms }),
    ...(options.told === undefined ? {} : { onFinalWriterTierUnread: options.told })
  });
  return { policy, seen, counts };
}
const request = (site: Site | readonly [string, string, string], runId: string = V2_RUN, tokenCeiling = 2048): ProviderCallRequest => ({
  runId, subjectItemId: "node:synthetic", callSiteKey: site[0], role: site[2] as ProviderCallRequest["role"],
  lane: site[1] as ProviderCallRequest["lane"], bound: { maxAttempts: 2, tokenCeiling, deadlineMs: 5_000 },
  contractHash: "contract:synthetic", providerRef: "preview:fixture-a", packet: framedFixturePacket("v4 final writer") });
const sentOf = (sent: ProviderCallRequest): Sent =>
  ({ bound: sent.bound.tokenCeiling, packetByteCap: sent.packetByteCap, outputTokenCap: sent.outputTokenCap });
const paid: Terms = (runId) => runId === V2_RUN ? { plan: "paid" } : undefined;
const free: Terms = (runId) => runId === V2_RUN ? { plan: "free" } : undefined;

async function sendAll(model: string, terms: Terms | undefined): Promise<readonly Sent[]> {
  const out: Sent[] = [];
  for (const site of SITES) {
    const { policy, seen } = harness(model, terms === undefined ? {} : { terms });
    await policy.call(request(site));
    out.push(sentOf(seen[0]!));
  }
  return out;
}

describe("the call policy asks the shared rule on v2 runs", () => {
  it("without terms (no resolver, or a run that is not v2) sends R22's asks byte for byte", async () => {
    const r22 = { bound: 128_000, packetByteCap: MIB, outputTokenCap: 128_000 };
    expect(await sendAll(HAIKU, undefined)).toEqual([r22, r22, r22, r22]);
    expect(await sendAll(HAIKU, () => undefined)).toEqual([r22, r22, r22, r22]);
  });

  it("a paid v2 run on Haiku asks the F3 caps, the body room only for the story, the retry held to the same cap", async () => {
    let reads = 0;
    const sent: Sent[] = [];
    for (const site of SITES) {
      const { policy, seen, counts } = harness(HAIKU, { terms: paid });
      await policy.call(request(site));
      reads += counts.reads;
      sent.push(sentOf(seen[0]!));
    }
    expect(sent).toEqual([
      { bound: 16_384, packetByteCap: undefined, outputTokenCap: 16_384 },
      { bound: 8_192, packetByteCap: undefined, outputTokenCap: 8_192 },
      { bound: 81_920, packetByteCap: MIB, outputTokenCap: 81_920 },
      { bound: 8_192, packetByteCap: undefined, outputTokenCap: 8_192 }
    ]);
    for (const one of sent) expect(Math.min(lengthRetryTokenCeiling(one.bound, 1), one.outputTokenCap!)).toBe(one.bound);
    expect(reads).toBe(1);
  });

  it("a free v2 story on Haiku asks 16,384; DeepSeek paid asks as Haiku; GLM's paid story keeps 16,384", async () => {
    const { policy, seen } = harness(HAIKU, { terms: free });
    await policy.call(request(SITES[2]));
    expect(sentOf(seen[0]!)).toEqual({ bound: 16_384, packetByteCap: undefined, outputTokenCap: 16_384 });
    expect(await sendAll(DEEPSEEK, paid)).toEqual(await sendAll(HAIKU, paid));
    const glm = harness(GLM, { terms: paid });
    await glm.policy.call(request(SITES[2]));
    expect(sentOf(glm.seen[0]!)).toEqual({ bound: 16_384, packetByteCap: undefined, outputTokenCap: 16_384 });
  });

  it("treats F3 as a ceiling: a guided writer bound above it asks the cap", async () => {
    const { policy, seen } = harness(GLM, { terms: paid });
    await policy.call({ ...request(SITES[0], V2_RUN, 28_384), guidedWords: 1000 });
    expect(seen[0]!.bound.tokenCeiling).toBe(16_384);
  });

  it("falls back to a STANDARD story at the row's bound when the gate does not offer the tier, and tells once", async () => {
    const told: PreviewFinalWriterTierUnread[] = [];
    const { policy, seen } = harness(HAIKU, { terms: paid, remaining: NOT_OFFERED, told: (event) => { told.push(event); } });
    await policy.call(request(SITES[2]));
    expect(sentOf(seen[0]!)).toEqual({ bound: 32_768, packetByteCap: undefined, outputTokenCap: 32_768 });
    expect(told).toEqual([{ gate: "anthropic", reason: "NOT_OFFERED" }]);
  });

  it("asks the resolver once per final-writer call, with the call's run, and never for another call", async () => {
    const asked: (string | null)[] = [];
    const terms: Terms = (runId) => { asked.push(runId); return paid(runId); };
    const judge = harness(HAIKU, { terms });
    await judge.policy.call(request(["JUDGE:critic:node-1", "served", "JUDGE"]));
    expect(asked).toEqual([]);
    const checker = harness(HAIKU, { terms });
    await checker.policy.call(request(SITES[3]));
    expect(asked).toEqual([V2_RUN]);
  });

  it("ends the call before anything is sent when the resolver throws", async () => {
    const { policy, seen } = harness(HAIKU, { terms: () => { throw new Error("terms unreadable"); } });
    await expect((async () => policy.call(request(SITES[0])))()).rejects.toThrow("terms unreadable");
    expect(seen).toHaveLength(0);
  });
});
