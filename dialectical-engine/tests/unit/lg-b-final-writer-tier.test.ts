/**
 * Length guidance L26/L29 (owner answers 4 and 7, 2026-10-15), LG-B Task 4: the four final writers (answer writer, answer
 * checker, storyteller, story checker) ask each model's own maximum output and may send up to 1 MiB; a slow storyteller
 * keeps today's 16,384. Every other call keeps 256 KiB and the row's 32,768. The guarded fetch names the tier to the gate
 * only for a body over the standard caps, and only the call policy can make a body that big. Pre-flight PF-B2.3: the
 * policy asks for the tier only when the row's gate says it serves it (its `/remaining` names its final-writer slots);
 * otherwise a final writer is today's STANDARD call.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  OpenAICompatibleProviderGateway, PREVIEW_CALL_TIER_LIMITS, PREVIEW_MODEL_ROWS, PREVIEW_REQUEST_BODY_MAX_BYTES,
  PREVIEW_REVIEWED_PROVIDER_REFS, createPreviewGuardedFetch, parsePreviewGateRemaining, parsePreviewProviderTestConfig,
  parseProviderDiscoveryTargets, previewCallTierOf, previewCallTierOfBody, previewGateOffersFinalWriterTier, previewModelRow,
  previewNanoUsdText, previewReservationNanoUsd, previewStorytellerOutputCap, previewTargetGatewayControls, previewTargetJsonRow,
  previewTierOutputBound, providerTargetGatewayControls, withPreviewProviderCallPolicy,
  type PreviewBudgetExecution, type PreviewGateRemaining, type ProviderCallRequest, type ProviderCallResult,
  type ProviderDiscoveryTarget, type ProviderGateway
} from "@debateai/providers";
import { framedFixturePacket } from "../support/framed-packet.js";

const GLM = "zai-org/GLM-5.3-Flash";
const DEEPSEEK = "deepseek-ai/DeepSeek-V4.1-Flash";
const MIMO = "XiaomiMiMo/MiMo-V2.6-Pro";
const QWEN = "Qwen/Qwen3.8-Flash";
const HAIKU = "claude-haiku-5-5";
const MIB = 1024 * 1024;
const CONFIG = parsePreviewProviderTestConfig(JSON.stringify({ deployment: "v3-preview", requested_thinking_level: "high",
  budget_socket: "/run/debateai-v3-preview/deepinfra-budget-v3.sock", scope_id: "lg-b-tier-fixture",
  anthropic_budget_socket: "/run/debateai-v3-preview/anthropic-budget-v1.sock",
  free_model_ids: [GLM, HAIKU], premium_model_ids: [GLM, DEEPSEEK, MIMO, QWEN, HAIKU] }))!;
const row = (model: string) => previewModelRow(model)!;
// Pre-flight PF-B2.3: the gate's read-only answer in both forms. Today's seven members; a GO that names
// max_final_writer_calls adds its final-writer room, and only then does a final writer get its tier.
const TODAY_REMAINING = { state: "active", window_open: true, remaining_usd: "2.00", remaining_calls: 10, max_concurrent_calls: 2,
  largest_reservation_usd: "0.24704", enabled_models: [HAIKU] };
const OFFERED = parsePreviewGateRemaining({ ...TODAY_REMAINING, largest_final_writer_reservation_usd: "0.97664", final_writer_max_in_flight: 1 })!;
const NOT_OFFERED = parsePreviewGateRemaining(TODAY_REMAINING)!;
type GateReaders = Readonly<Partial<Record<"deepinfra" | "anthropic", () => Promise<PreviewGateRemaining>>>>;
const gates = (answer: () => Promise<PreviewGateRemaining>): GateReaders => ({ deepinfra: answer, anthropic: answer });
const OFFERS = gates(async () => OFFERED);

type FinalWriterFixture = { request_bytes: number; per_call_cap_usd: string;
  rows: { model: string; output_bound: number; worst_case_reservation_usd: string; worst_case_uncached_reservation_usd?: string }[] };
const fixture = (name: string) => (JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8")) as
  { final_writer: FinalWriterFixture }).final_writer;

describe("each row's own maximum and the tier limits", () => {
  it("the rows carry the vendors' maxima; the fast storytellers ask them, the slow ones keep 16,384", () => {
    expect(Object.fromEntries(PREVIEW_MODEL_ROWS.map((r) => [r.model, [r.outputBound, r.finalWriterOutputBound, r.storytellerTokenCeiling]])))
      .toEqual({ [GLM]: [32768, 131072, 16384], [DEEPSEEK]: [32768, 131072, 131072], [MIMO]: [32768, 65536, 16384],
        [QWEN]: [32768, 131072, 16384], [HAIKU]: [32768, 128000, 128000] });
    // A slow storyteller's length retry stays held to today's 32,768; a fast one's to its own maximum.
    expect(PREVIEW_MODEL_ROWS.map((r) => previewStorytellerOutputCap(r))).toEqual([32768, 131072, 32768, 32768, 128000]);
    expect(PREVIEW_MODEL_ROWS.map((r) => [previewTierOutputBound(r, "STANDARD"), previewTierOutputBound(r, "FINAL_WRITER")]))
      .toEqual(PREVIEW_MODEL_ROWS.map((r) => [r.outputBound, r.finalWriterOutputBound]));
  });

  it("final writers get 1 MiB and $0.75 ($1.00 on Haiku's gate); every other call keeps 256 KiB and $0.25", () => {
    expect(PREVIEW_CALL_TIER_LIMITS).toEqual({
      STANDARD: { requestBodyMaxBytes: 256 * 1024, perCallCapUsd: { deepinfra: "0.25", anthropic: "0.25" } },
      FINAL_WRITER: { requestBodyMaxBytes: MIB, perCallCapUsd: { deepinfra: "0.75", anthropic: "1.00" } } });
    expect(PREVIEW_REQUEST_BODY_MAX_BYTES).toBe(PREVIEW_CALL_TIER_LIMITS.STANDARD.requestBodyMaxBytes);
  });

  it("a full-size final-writer request reserves exactly the parity files' worst cases, each under its gate's cap", () => {
    const deepinfra = fixture("preview-model-rows.json");
    expect([deepinfra.request_bytes, deepinfra.per_call_cap_usd]).toEqual([MIB, "0.75"]);
    expect(deepinfra.rows.map((r) => [r.model, r.output_bound, r.worst_case_reservation_usd])).toEqual([
      [GLM, 131072, "0.223129600"], [DEEPSEEK, 131072, "0.288768000"], [MIMO, 65536, "0.508784640"], [QWEN, 131072, "0.168790016"]]);
    for (const r of deepinfra.rows) {
      const reserved = previewReservationNanoUsd(row(r.model), MIB, { tier: "FINAL_WRITER" });
      expect(previewNanoUsdText(reserved)).toBe(r.worst_case_reservation_usd);
      expect(reserved <= 750_000_000n).toBe(true);
      expect(row(r.model).finalWriterOutputBound).toBe(r.output_bound);
    }
    const anthropic = fixture("preview-model-rows-anthropic.json");
    expect([anthropic.request_bytes, anthropic.per_call_cap_usd]).toEqual([MIB, "1.00"]);
    const haiku = anthropic.rows[0]!;
    expect(previewNanoUsdText(previewReservationNanoUsd(row(HAIKU), MIB, { tier: "FINAL_WRITER", cacheWrite: true }))).toBe("0.976640000");
    expect(previewNanoUsdText(previewReservationNanoUsd(row(HAIKU), MIB, { tier: "FINAL_WRITER" }))).toBe("0.845312000");
    expect([haiku.output_bound, haiku.worst_case_reservation_usd, haiku.worst_case_uncached_reservation_usd])
      .toEqual([128000, "0.976640000", "0.845312000"]);
    // A standard reservation is today's figure, byte for byte.
    expect(previewNanoUsdText(previewReservationNanoUsd(row(MIMO), 256 * 1024))).toBe("0.142110720");
  });
});

describe("which calls are final writers", () => {
  it("names the four final-writer sites by key, lane and role, and nothing else", () => {
    const tier = (callSiteKey: string, lane: string, role: string) => previewCallTierOf({ callSiteKey, lane, role });
    expect([
      tier("COMPOSER:SYNTHESIZER:INITIAL:1", "served", "SYNTHESIZER"), tier("COMPOSER:SYNTHESIZER:RETRY:2:seat:main", "served", "SYNTHESIZER"),
      tier("POST_COMPOSE_R9:EVALUATOR:1", "served", "EVALUATOR"), tier("STORY:STORYTELLER:1", "story", "SYNTHESIZER"),
      tier("STORY:CHECKER:2", "story", "EVALUATOR")]).toEqual(["FINAL_WRITER", "FINAL_WRITER", "FINAL_WRITER", "FINAL_WRITER", "FINAL_WRITER"]);
    expect([
      tier("PANEL:root:x", "served", "JUDGE"), tier("JUDGE:critic:n", "served", "JUDGE"), tier("MAP:merge", "served", "JUDGE"),
      tier("STORY:STORYTELLER:1", "served", "SYNTHESIZER"), tier("STORY:STORYTELLER:1", "story", "EVALUATOR"),
      tier("COMPOSER:SYNTHESIZER:INITIAL:1", "served", "JUDGE"), tier("REPAIR:STRUCTURE:COMPOSER:SYNTHESIZER:INITIAL:1", "served", "SYNTHESIZER")])
      .toEqual(["STANDARD", "STANDARD", "STANDARD", "STANDARD", "STANDARD", "STANDARD", "STANDARD"]);
  });

  it("the guarded fetch reads the tier from the body: over 256 KiB or over the row's standard bound", () => {
    expect(previewCallTierOfBody(row(GLM), 256 * 1024, 32768)).toBe("STANDARD");
    expect(previewCallTierOfBody(row(GLM), 256 * 1024 + 1, 8192)).toBe("FINAL_WRITER");
    expect(previewCallTierOfBody(row(GLM), 1000, 32769)).toBe("FINAL_WRITER");
    expect(previewCallTierOfBody(row(GLM), 1000, "32769")).toBe("STANDARD");
  });
});

/** The policy over a recording gateway; `gateRemaining` null: a composition that wires no gate reader. */
function spy(model: string, gateRemaining: GateReaders | null = OFFERS) {
  const seen: ProviderCallRequest[] = [];
  const inner: ProviderGateway = { call: async (sent) => {
    seen.push(sent);
    return { rawArtifactRef: "artifact", ledgerEntryRef: "entry", content: "{}", provider: "openai-compatible-http",
      model, maker: "Synthetic", modelVersion: model } satisfies ProviderCallResult;
  } };
  return { policy: withPreviewProviderCallPolicy(inner, CONFIG, { model }, gateRemaining === null ? {} : { gateRemaining }), seen };
}
const call = (callSiteKey: string, lane: ProviderCallRequest["lane"], role: ProviderCallRequest["role"], packet = framedFixturePacket("lg-b tier")): ProviderCallRequest => ({
  runId: "run:synthetic", subjectItemId: "node:synthetic", callSiteKey, role, lane,
  bound: { maxAttempts: 2, tokenCeiling: 2048, deadlineMs: 5_000 }, contractHash: "contract:synthetic",
  providerRef: "preview:fixture-a", packet });

describe("the call policy gives the final writers their room, and only them", () => {
  it("the answer writer, the answer checker and the story checker ask the row's own maximum and may send 1 MiB", async () => {
    for (const [key, lane, role] of [["COMPOSER:SYNTHESIZER:INITIAL:1", "served", "SYNTHESIZER"], ["POST_COMPOSE_R9:EVALUATOR:1", "served", "EVALUATOR"],
      ["STORY:CHECKER:1", "story", "EVALUATOR"]] as const) {
      for (const model of [GLM, MIMO, HAIKU]) {
        const { policy, seen } = spy(model);
        await policy.call(call(key, lane, role));
        expect([seen[0]!.bound.tokenCeiling, seen[0]!.packetByteCap, seen[0]!.outputTokenCap], `${key} ${model}`)
          .toEqual([row(model).finalWriterOutputBound, MIB, row(model).finalWriterOutputBound]);
      }
    }
  });

  it("a slow storyteller keeps 16,384 and today's retry clamp; a fast one asks its own maximum", async () => {
    const slow = spy(GLM);
    await slow.policy.call(call("STORY:STORYTELLER:1", "story", "SYNTHESIZER"));
    expect([slow.seen[0]!.bound.tokenCeiling, slow.seen[0]!.packetByteCap, slow.seen[0]!.outputTokenCap]).toEqual([16384, MIB, 32768]);
    const fast = spy(DEEPSEEK);
    await fast.policy.call(call("STORY:STORYTELLER:1", "story", "SYNTHESIZER"));
    expect([fast.seen[0]!.bound.tokenCeiling, fast.seen[0]!.outputTokenCap]).toEqual([131072, 131072]);
  });

  it("every other call keeps today's bound and sets neither cap", async () => {
    const { policy, seen } = spy(DEEPSEEK);
    await policy.call(call("JUDGE:critic:node-1", "served", "JUDGE"));
    expect(seen[0]!.bound.tokenCeiling).toBe(8192);
    expect("packetByteCap" in seen[0]! || "outputTokenCap" in seen[0]!).toBe(false);
  });

  it("a caller's own caps are refused before anything is sent", async () => {
    const { policy, seen } = spy(GLM);
    // The policy refuses synchronously, as its other request checks do (tests/unit/preview-thinking-policy.test.ts:200):
    // wrapped, so the refusal reads as a rejection (pre-flight editor 2).
    await expect((async () => policy.call({ ...call("JUDGE:critic:node-1", "served", "JUDGE"), packetByteCap: MIB }))())
      .rejects.toMatchObject({ code: "PREVIEW_CALL_TIER_INVALID" });
    await expect((async () => policy.call({ ...call("JUDGE:critic:node-1", "served", "JUDGE"), outputTokenCap: 131072 }))())
      .rejects.toMatchObject({ code: "PREVIEW_CALL_TIER_INVALID" });
    expect(seen).toHaveLength(0);
  });

  // Pre-flight PF-B2.3 (controller ruling): an app that reaches a gate older than LG-B must not send it a body it refuses.
  it("final writers keep STANDARD caps when the gate names no final-writer slots", async () => {
    const unreadable = gates(async () => { throw new Error("gate unreachable"); });
    for (const gateRemaining of [gates(async () => NOT_OFFERED), unreadable, null]) {
      const writer = spy(DEEPSEEK, gateRemaining);
      await writer.policy.call(call("COMPOSER:SYNTHESIZER:INITIAL:1", "served", "SYNTHESIZER"));
      const storyteller = spy(DEEPSEEK, gateRemaining);
      await storyteller.policy.call(call("STORY:STORYTELLER:1", "story", "SYNTHESIZER"));
      const checker = spy(MIMO, gateRemaining);
      await checker.policy.call(call("STORY:CHECKER:1", "story", "EVALUATOR"));
      // Today's bounds: previewCallBound's floor, the storyteller held to the row's 32,768, MiMo's checker its 16,384.
      expect([writer.seen[0]!.bound.tokenCeiling, storyteller.seen[0]!.bound.tokenCeiling, checker.seen[0]!.bound.tokenCeiling])
        .toEqual([8192, 32_768, 16_384]);
      for (const sent of [writer.seen[0]!, storyteller.seen[0]!, checker.seen[0]!]) {
        expect("packetByteCap" in sent || "outputTokenCap" in sent).toBe(false);
      }
    }
  });

  it("final writers get their tier when the gate names its final-writer slots, asked once per final-writer call", async () => {
    expect([previewGateOffersFinalWriterTier(OFFERED), previewGateOffersFinalWriterTier(NOT_OFFERED), previewGateOffersFinalWriterTier(undefined)])
      .toEqual([true, false, false]);
    let reads = 0;
    const writer = spy(DEEPSEEK, gates(async () => { reads += 1; return OFFERED; }));
    await writer.policy.call(call("COMPOSER:SYNTHESIZER:INITIAL:1", "served", "SYNTHESIZER"));
    expect([writer.seen[0]!.bound.tokenCeiling, writer.seen[0]!.packetByteCap, writer.seen[0]!.outputTokenCap]).toEqual([131_072, MIB, 131_072]);
    await writer.policy.call(call("JUDGE:critic:node-1", "served", "JUDGE"));
    expect(reads).toBe(1);  // A debate step never asks the gate.
  });

  // Pre-flight PF-B4.15 / PF-B2.9 (controller ruling): Review Focus 1's limit, named in this task's header.
  it("a structure-repair call of a final writer stays STANDARD", async () => {
    expect(previewCallTierOf({ callSiteKey: "REPAIR:STRUCTURE:STORY:STORYTELLER:1", lane: "story", role: "SYNTHESIZER" })).toBe("STANDARD");
    const repair = spy(HAIKU);
    await repair.policy.call({ ...call("REPAIR:STRUCTURE:STORY:STORYTELLER:1", "story", "SYNTHESIZER"),
      bound: { maxAttempts: 1, tokenCeiling: 32_768, deadlineMs: 1_260_000 } });
    expect(repair.seen[0]!.bound.tokenCeiling).toBe(32_768);
    expect("packetByteCap" in repair.seen[0]! || "outputTokenCap" in repair.seen[0]!).toBe(false);
  });
});

const configured = (providerRef: string) => { const r = row(previewTargetJsonRow(providerRef).model as string);
  return { providerRef, maker: r.maker, adapterKind: r.adapterKind }; };
const TARGETS: readonly ProviderDiscoveryTarget[] = parseProviderDiscoveryTargets(
  JSON.stringify(PREVIEW_REVIEWED_PROVIDER_REFS.map(previewTargetJsonRow)), PREVIEW_REVIEWED_PROVIDER_REFS.map(configured));
/** One preview target as the runner builds it (apps/runner/src/main.ts:360-403), with a scripted gate behind the guarded fetch. */
function previewTarget(model: string, gateRemaining: GateReaders = OFFERS) {
  const target = TARGETS.find((candidate) => candidate.model === model)!;
  const executions: PreviewBudgetExecution[] = [];
  const port = { execute: async (input: PreviewBudgetExecution) => {
    executions.push(input);
    return { status: 200, body: JSON.stringify({ id: "fixture", model, choices: [{ message: { content: "{}" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1 } }) };
  } };
  const native = new OpenAICompatibleProviderGateway({ endpoint: target.baseUrl, model: target.model, maker: target.maker,
    ...providerTargetGatewayControls(target), ...previewTargetGatewayControls(CONFIG, target),
    fetchImplementation: createPreviewGuardedFetch({ deepinfra: port, anthropic: port }),
    persistRawArtifact: async (artifact) => artifact.artifactId, appendLedgerEntry: async (entry) => entry.attemptId,
    assertNoOpenWriteTransaction: () => undefined, sleepImplementation: async () => undefined });
  return { gateway: withPreviewProviderCallPolicy(native, CONFIG, target, { sleep: async () => undefined, gateRemaining }), executions };
}

describe("through the guarded fetch", () => {
  it("a debate step's 300 KiB packet is refused by the gateway, never sent as a final writer", async () => {
    const { gateway, executions } = previewTarget(DEEPSEEK);
    await expect(gateway.call(call("JUDGE:critic:node-1", "served", "JUDGE", framedFixturePacket("a".repeat(300 * 1024)))))
      .rejects.toMatchObject({ code: "PROVIDER_CALL_FAILED", cause: { code: "PROVIDER_PACKET_TOO_LARGE" } });
    expect(executions).toHaveLength(0);
  });

  it("the answer writer's 300 KiB packet goes out as a final writer, reserved at the row's own maximum", async () => {
    const { gateway, executions } = previewTarget(DEEPSEEK);
    await gateway.call(call("COMPOSER:SYNTHESIZER:INITIAL:1", "served", "SYNTHESIZER", framedFixturePacket("a".repeat(300 * 1024))));
    const sent = executions[0]!;
    const bytes = Buffer.byteLength(sent.requestBody, "utf8");
    expect(sent.callTier).toBe("FINAL_WRITER");
    expect(JSON.parse(sent.requestBody)).toMatchObject({ model: DEEPSEEK, max_tokens: 131072 });
    expect(sent.reservedUsd).toBe(previewNanoUsdText(BigInt(bytes + 2048) * 200n + 131_072n * 600n));
  });

  // Pre-flight PF-B2.16: the port gets four keys; the RPC port adds scope_id, so the gate sees five (six with callTier).
  it("a debate step's body keeps the four-key execution (five-key gate message) and today's reservation", async () => {
    const { gateway, executions } = previewTarget(MIMO);
    await gateway.call(call("JUDGE:critic:node-1", "served", "JUDGE"));
    const sent = executions[0]!;
    expect(Object.keys(sent).sort()).toEqual(["operationId", "requestBody", "requestSha256", "reservedUsd"]);
    expect(sent.reservedUsd).toBe(previewNanoUsdText(previewReservationNanoUsd(row(MIMO), Buffer.byteLength(sent.requestBody, "utf8"))));
  });

  it("refuses a body above the final writer's own caps", async () => {
    const fetcher = createPreviewGuardedFetch({ execute: async () => ({ status: 200, body: "{}" }) });
    const post = (body: unknown) => fetcher("https://api.deepinfra.com/v1/openai/chat/completions", { method: "POST", body: JSON.stringify(body) });
    const messages = [{ role: "user", content: "x" }];
    await expect(post({ model: DEEPSEEK, reasoning_effort: "high", max_tokens: 131_073, messages })).rejects.toThrow("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
    await expect(post({ model: MIMO, max_tokens: 65_537, temperature: 0.7, top_p: 0.95, messages })).rejects.toThrow("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
    await expect(post({ model: DEEPSEEK, reasoning_effort: "high", max_tokens: 8, messages: [{ role: "user", content: "x".repeat(MIB) }] }))
      .rejects.toThrow("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
    await expect(post({ model: DEEPSEEK, reasoning_effort: "high", max_tokens: 131_072, messages })).resolves.toBeInstanceOf(Response);
  });
});

describe("the gate's remaining answer, both forms", () => {
  const today = TODAY_REMAINING;
  it("parses both forms of the remaining answer", () => {
    const old = parsePreviewGateRemaining(today)!;
    expect(old.largestReservationNanoUsd).toBe(247_040_000n);
    expect("finalWriterMaxInFlight" in old || "largestFinalWriterReservationNanoUsd" in old).toBe(false);
    expect(parsePreviewGateRemaining({ ...today, largest_final_writer_reservation_usd: "0.97664", final_writer_max_in_flight: 1 }))
      .toMatchObject({ largestFinalWriterReservationNanoUsd: 976_640_000n, finalWriterMaxInFlight: 1 });
  });
  it("refuses half of the new form, or a slot count below one", () => {
    expect(parsePreviewGateRemaining({ ...today, final_writer_max_in_flight: 1 })).toBeUndefined();
    expect(parsePreviewGateRemaining({ ...today, largest_final_writer_reservation_usd: "0.97664" })).toBeUndefined();
    expect(parsePreviewGateRemaining({ ...today, largest_final_writer_reservation_usd: "0.97664", final_writer_max_in_flight: 0 })).toBeUndefined();
  });
});
