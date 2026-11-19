/**
 * The app side of the Amazon Bedrock gate. OpenAI's GPT-6 Luna, served by Amazon through its United States route, is a
 * reviewed row keyed by its provider (parity with the gate's own file); the config names the Bedrock gate's socket; the
 * guarded fetch routes by the exact URL to that gate only and sends only the body that gate accepts (the answer limit
 * as `max_completion_tokens`); the gateway and the discovery probe build that body; and the providers page counts the
 * host as Amazon.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  OpenAICompatibleProviderGateway, PREVIEW_BEDROCK_BASE_URL, PREVIEW_BEDROCK_CHAT_COMPLETIONS_URL, PREVIEW_CALL_TIER_LIMITS,
  PREVIEW_GATE_SOCKET_KEYS, PREVIEW_MODEL_ROWS, PREVIEW_MODEL_ROWS_BY_PROVIDER, PREVIEW_PROVIDER_NAMES, PREVIEW_PROVIDER_SOCKET_KEYS,
  PREVIEW_REVIEWED_PROVIDER_REFS, assertPreviewProviderTargets, assertPreviewRoleTargets, createPreviewGuardedFetch,
  observeProviderTarget, parsePreviewEnvironmentConfig, parsePreviewLineUp, parsePreviewProviderTestConfig, parseProviderDiscoveryTargets,
  previewCallTierOfBody, previewModelRow, previewModelRowForRef, previewNanoUsdText, previewOutputTokensMember, previewProbeControls,
  previewProviderSocket, previewRefsAreReviewedSet, previewReservationNanoUsd, previewTargetGatewayControls, previewTargetJsonRow,
  previewVendorPrices, providerCompaniesOfTargets, providerTargetGatewayControls, withPreviewProviderCallPolicy,
  type PreviewBudgetExecution, type PreviewBudgetPort, type ProviderCallRequest, type ProviderDiscoveryTarget
} from "@debateai/providers";
import { previewGateKeyOf } from "../../apps/api/src/preview-budget-estimate.js";
import { PREVIEW_MODEL_MAKERS, parsePreviewRosterFlag, previewRostersOfRoomRead } from "../../apps/ui/lib/previewPlanRoster.js";
import { framedFixturePacket } from "../support/framed-packet.js";

const GLM = "zai-org/GLM-5.3-Flash";
const DEEPSEEK = "deepseek-ai/DeepSeek-V4.1-Flash";
const MIMO = "XiaomiMiMo/MiMo-V2.6-Pro";
const QWEN = "Qwen/Qwen3.8-Flash";
const HAIKU = "claude-haiku-5-5";
const LUNA = "us.openai.gpt-6-luna";
const LUNA_REF = "preview:gpt-6-luna";
const DEEPINFRA_URL = "https://api.deepinfra.com/v1/openai/chat/completions";
const BASE = { deployment: "v3-preview", requested_thinking_level: "high",
  budget_socket: "/run/debateai-v3-preview/deepinfra-budget-v3.sock", scope_id: "preview-fixture" };
const ANTHROPIC_SOCKET = "/run/debateai-v3-preview/anthropic-budget-v1.sock";
const BEDROCK_SOCKET = "/run/debateai-v3-preview/bedrock-budget-v1.sock";
const ALL_SIX = [GLM, DEEPSEEK, MIMO, QWEN, HAIKU, LUNA];
/** The owner's choice: Luna joins the five on both plans. */
const SIX = { ...BASE, anthropic_budget_socket: ANTHROPIC_SOCKET, bedrock_budget_socket: BEDROCK_SOCKET,
  free_model_ids: ALL_SIX, premium_model_ids: ALL_SIX };
const parse = (value: unknown) => parsePreviewProviderTestConfig(JSON.stringify(value));
const messages = [{ role: "user", content: "synthetic" }];

const fixtureFile = JSON.parse(readFileSync(new URL("./fixtures/preview-model-rows-bedrock.json", import.meta.url), "utf8")) as {
  schema: string; provider: string;
  reservation: { overhead_bytes: number; step_tokens: number; upper_input_usd_per_m: string; upper_output_usd_per_m: string;
    worst_case_request_bytes: number; per_call_cap_usd: string };
  rows: Array<{ model: string; maker: string; input_usd_per_m: string; output_usd_per_m: string; input_nano_usd_per_token: number;
    output_nano_usd_per_token: number; output_bound: number; efforts: string[]; json_object: boolean; worst_case_reservation_usd: string;
    ceiling_reservation_usd: string }>;
  final_writer: { request_bytes: number; per_call_cap_usd: string; rows: Array<{ model: string; output_bound: number; worst_case_reservation_usd: string }> } };

const configured = (providerRef: string) => { const row = previewModelRow(previewTargetJsonRow(providerRef).model)!;
  return { providerRef, maker: row.maker, adapterKind: row.adapterKind }; };
function targets(refs: readonly string[], change: Record<string, unknown> = {}): readonly ProviderDiscoveryTarget[] {
  return parseProviderDiscoveryTargets(JSON.stringify(refs.map(ref => ({ ...previewTargetJsonRow(ref), ...(ref === LUNA_REF ? change : {}) }))),
    refs.map(configured));
}
function recordingPorts() {
  const executions: Record<string, PreviewBudgetExecution[]> = { deepinfra: [], anthropic: [], bedrock: [] };
  const port = (name: string, reply: (input: PreviewBudgetExecution) => string): PreviewBudgetPort =>
    ({ execute: async input => { executions[name]!.push(input); return { status: 200, body: reply(input) }; } });
  return { executions, port };
}
/** A Chat Completions answer as OpenAI documents it; made up, never recorded from Amazon. */
const lunaReply = (text = "OK", finish = "stop") => JSON.stringify({ id: "chatcmpl-synthetic", object: "chat.completion", model: LUNA,
  choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: finish }],
  usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } });
const lunaBody = (change: Record<string, unknown> = {}) =>
  ({ model: LUNA, max_completion_tokens: 1024, reasoning_effort: "high", messages, ...change });

describe("the Amazon Bedrock row equals its parity file and keeps the per-call caps", () => {
  it("is a provider-keyed addition: the five earlier rows first, then GPT-6 Luna", () => {
    expect(PREVIEW_PROVIDER_NAMES).toEqual(["deepinfra", "anthropic", "bedrock"]);
    expect(PREVIEW_MODEL_ROWS_BY_PROVIDER.bedrock.map(row => row.model)).toEqual([LUNA]);
    expect(PREVIEW_MODEL_ROWS.map(row => row.model)).toEqual(ALL_SIX);
    expect(PREVIEW_REVIEWED_PROVIDER_REFS.at(-1)).toBe(LUNA_REF);
    expect(previewModelRowForRef(LUNA_REF)?.model).toBe(LUNA);
    expect(previewGateKeyOf(LUNA)).toBe("bedrock");
  });
  it("field for field, the row the gate reserves at", () => {
    expect([fixtureFile.schema, fixtureFile.provider]).toEqual(["preview-model-rows-v2", "bedrock"]);
    expect(PREVIEW_MODEL_ROWS_BY_PROVIDER.bedrock.map(row => ({ model: row.model, maker: row.maker, input_usd_per_m: row.inputUsdPerM,
      output_usd_per_m: row.outputUsdPerM, input_nano_usd_per_token: Number(row.inputNanoUsdPerToken),
      output_nano_usd_per_token: Number(row.outputNanoUsdPerToken), output_bound: row.outputBound, efforts: row.efforts,
      json_object: row.jsonObject,
      worst_case_reservation_usd: previewNanoUsdText(previewReservationNanoUsd(row, fixtureFile.reservation.worst_case_request_bytes)),
      ceiling_reservation_usd: fixtureFile.rows[0]!.ceiling_reservation_usd })))
      .toEqual(fixtureFile.rows);
    const luna = previewModelRow(LUNA)!;
    expect([luna.provider, luna.baseUrl, luna.adapterKind, luna.contextWindowTokens])
      .toEqual(["bedrock", PREVIEW_BEDROCK_BASE_URL, "openai-compatible-http", 1_050_000]);
    expect(PREVIEW_BEDROCK_CHAT_COMPLETIONS_URL).toBe(`${PREVIEW_BEDROCK_BASE_URL}/chat/completions`);
    expect(new URL(PREVIEW_BEDROCK_BASE_URL).hostname).toBe("bedrock-runtime.us-east-1.amazonaws.com");
    expect(luna.upperStep).toEqual({ aboveChargedInputTokens: fixtureFile.reservation.step_tokens,
      inputUsdPerM: fixtureFile.reservation.upper_input_usd_per_m, outputUsdPerM: fixtureFile.reservation.upper_output_usd_per_m,
      inputNanoUsdPerToken: 275n, outputNanoUsdPerToken: 825n });
    // The hold price already covers a cache write, so the row has no separate cache-write price and no vendor price steps.
    expect([luna.cacheWriteInputUsdPerM, luna.sampling, previewVendorPrices(luna)]).toEqual([undefined, undefined, undefined]);
    expect(() => previewReservationNanoUsd(luna, 100, { cacheWrite: true })).toThrow("PREVIEW_MODEL_ROW_CANNOT_CACHE");
    expect(luna.defaultEffort).toBe("high");
    expect([...luna.effortsByStrength]).toEqual(["high", "medium", "low", "none"]);
  });
  it("a full standard request holds at the row's prices, a full final writer's at the upper step's, both under their caps", () => {
    const luna = previewModelRow(LUNA)!;
    const overhead = BigInt(fixtureFile.reservation.overhead_bytes);
    const standard = previewReservationNanoUsd(luna, 256 * 1024);
    expect(standard).toBe((262_144n + overhead) * luna.inputNanoUsdPerToken + 32_768n * luna.outputNanoUsdPerToken);
    expect(PREVIEW_CALL_TIER_LIMITS.STANDARD.perCallCapUsd.bedrock).toBe(fixtureFile.reservation.per_call_cap_usd);
    expect(standard < 250_000_000n).toBe(true);
    const finalWriter = previewReservationNanoUsd(luna, fixtureFile.final_writer.request_bytes, { tier: "FINAL_WRITER" });
    expect(previewNanoUsdText(finalWriter)).toBe(fixtureFile.final_writer.rows[0]!.worst_case_reservation_usd);
    expect(PREVIEW_CALL_TIER_LIMITS.FINAL_WRITER.perCallCapUsd.bedrock).toBe(fixtureFile.final_writer.per_call_cap_usd);
    expect(finalWriter < 750_000_000n).toBe(true);
    expect(luna.finalWriterOutputBound).toBe(fixtureFile.final_writer.rows[0]!.output_bound);
  });
  it("bytes + 2048 up to the step reserve at the row's prices; one byte more at the upper step (the gate's own rule)", () => {
    const luna = previewModelRow(LUNA)!;
    const step = fixtureFile.reservation.step_tokens;
    expect(previewReservationNanoUsd(luna, step - 2048)).toBe(BigInt(step) * 138n + 32_768n * 550n);
    expect(previewReservationNanoUsd(luna, step - 2047)).toBe(BigInt(step + 1) * 275n + 32_768n * 825n);
  });
  it("the UI's maker table mirrors every reviewed row, and reads Luna as a GPT", () => {
    expect(PREVIEW_MODEL_MAKERS).toEqual(Object.fromEntries(PREVIEW_MODEL_ROWS.map(row => [row.model, row.maker])));
    expect(PREVIEW_MODEL_MAKERS[LUNA]).toBe("OpenAI");
    expect(previewRostersOfRoomRead({ free: ALL_SIX, premium: ALL_SIX })).toEqual({ free: ALL_SIX, premium: ALL_SIX });
    expect(parsePreviewRosterFlag(JSON.stringify({ free: [LUNA], premium: [GLM, LUNA] }))).toBeUndefined();
  });
});

describe("configuration names the Bedrock gate's socket", () => {
  it("accepts Luna on both plans with its socket, and keeps the sockets apart", () => {
    const config = parse(SIX)!;
    expect([config.free_model_ids, config.premium_model_ids]).toEqual([ALL_SIX, ALL_SIX]);
    expect(previewProviderSocket(config, "bedrock")).toBe(BEDROCK_SOCKET);
    expect(previewProviderSocket(config, "anthropic")).toBe(ANTHROPIC_SOCKET);
    expect(previewProviderSocket(config, "deepinfra")).toBe(BASE.budget_socket);
    expect(PREVIEW_PROVIDER_SOCKET_KEYS).toEqual({ anthropic: "anthropic_budget_socket", bedrock: "bedrock_budget_socket" });
    expect(PREVIEW_GATE_SOCKET_KEYS.bedrock).toBe("bedrock_budget_socket");
    // The socket may be set before Luna is in a roster (the gate is installed, not yet used).
    expect(parse({ ...SIX, free_model_ids: [GLM, DEEPSEEK], premium_model_ids: [GLM, DEEPSEEK] })).toMatchObject({ bedrock_budget_socket: BEDROCK_SOCKET });
  });
  it("the sockets-only form (the server's) carries it, and a line-up with Luna needs it", () => {
    const sockets = { ...BASE, anthropic_budget_socket: ANTHROPIC_SOCKET, bedrock_budget_socket: BEDROCK_SOCKET };
    expect(parsePreviewEnvironmentConfig(JSON.stringify(sockets))).toEqual({ gate: sockets, envLineUp: null });
    expect(parsePreviewLineUp({ free_model_ids: ALL_SIX, premium_model_ids: ALL_SIX, thinking_levels: null }).free_model_ids).toEqual(ALL_SIX);
    expect(() => parsePreviewLineUp({ free_model_ids: [LUNA], premium_model_ids: ALL_SIX, thinking_levels: null })).toThrow("PREVIEW_LINE_UP_POLICY_INVALID:maker_rule");
    expect(() => parsePreviewLineUp({ free_model_ids: ["openai.gpt-6-luna", GLM], premium_model_ids: ALL_SIX, thinking_levels: null }))
      .toThrow("PREVIEW_LINE_UP_POLICY_INVALID:free_model_ids:unreviewed");
  });
  it.each([
    ["Luna in a roster without the Bedrock socket", { ...SIX, bedrock_budget_socket: undefined }],
    ["the Bedrock socket equal to the Anthropic socket", { ...SIX, bedrock_budget_socket: ANTHROPIC_SOCKET }],
    ["the Bedrock socket equal to the DeepInfra socket", { ...SIX, bedrock_budget_socket: BASE.budget_socket }],
    ["a Bedrock socket outside the preview folder", { ...SIX, bedrock_budget_socket: "/tmp/bedrock-budget-v1.sock" }],
    ["a non-string Bedrock socket", { ...SIX, bedrock_budget_socket: 1 }],
    ["the worldwide route's model id", { ...SIX, free_model_ids: [GLM, "global.openai.gpt-6-luna"] }],
    ["a Free roster of Luna alone while several makers exist", { ...SIX, free_model_ids: [LUNA] }]
  ])("refuses %s", (_name, value) => {
    expect(() => parse(JSON.parse(JSON.stringify(value)))).toThrow("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
  });
  it("boot refuses a register role on Luna when the config names no Bedrock gate", () => {
    const declared = targets(PREVIEW_REVIEWED_PROVIDER_REFS);
    const withoutSocket = parse({ ...BASE, anthropic_budget_socket: ANTHROPIC_SOCKET, free_model_ids: [GLM, DEEPSEEK], premium_model_ids: [GLM, DEEPSEEK, HAIKU] })!;
    expect(() => assertPreviewRoleTargets(withoutSocket, declared, ["preview:fixture-a", LUNA_REF])).toThrow("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
    expect(() => assertPreviewRoleTargets(withoutSocket, declared, ["preview:fixture-a", "preview:claude-haiku-5-5"])).not.toThrow();
    expect(() => assertPreviewRoleTargets(parse(SIX)!, declared, ["preview:fixture-a", LUNA_REF])).not.toThrow();
  });
});

describe("the Luna target is checked against its row, and older reviewed sets keep booting", () => {
  it("accepts the full reviewed set and the set from before this gate", () => {
    expect(() => assertPreviewProviderTargets(parse(SIX)!, targets(PREVIEW_REVIEWED_PROVIDER_REFS))).not.toThrow();
    const before = PREVIEW_REVIEWED_PROVIDER_REFS.filter(ref => ref !== LUNA_REF);
    expect(previewRefsAreReviewedSet(before)).toBe(true);
    expect(previewRefsAreReviewedSet(PREVIEW_REVIEWED_PROVIDER_REFS)).toBe(true);
    expect(() => assertPreviewProviderTargets(parse({ ...SIX, free_model_ids: [GLM, HAIKU], premium_model_ids: [GLM, DEEPSEEK, HAIKU] }), targets(before))).not.toThrow();
    expect(() => assertPreviewProviderTargets(parse(SIX), targets(before))).toThrow("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
    expect(previewRefsAreReviewedSet([LUNA_REF])).toBe(false);
    expect(previewRefsAreReviewedSet([LUNA_REF, ...before])).toBe(false);
  });
  it("its declared row is the reviewed one: the address, the thinking switch, the hold price", () => {
    expect(previewTargetJsonRow(LUNA_REF)).toMatchObject({ provider_ref: LUNA_REF, base_url: PREVIEW_BEDROCK_BASE_URL, model: LUNA,
      thinking_parameter: "reasoning_effort", thinking_levels: ["high"], context_window_tokens: 1_050_000,
      input_price_micros_per_million: previewModelRow(LUNA)!.inputPriceMicrosPerMillion,
      output_price_micros_per_million: previewModelRow(LUNA)!.outputPriceMicrosPerMillion });
  });
  it.each([
    ["another window", { context_window_tokens: 1_048_576 }],
    ["another price", { input_price_micros_per_million: 1 }],
    ["the worldwide route's model id", { model: "global.openai.gpt-6-luna" }],
    ["another Region's address", { base_url: "https://bedrock-runtime.eu-north-1.amazonaws.com/openai/v1" }],
    ["no thinking switch", { thinking_parameter: undefined, thinking_levels: undefined }],
    ["a credential header", { authorization_header: "synthetic-not-a-key" }]
  ])("refuses a Luna target with %s", (_name, change) => {
    expect(() => assertPreviewProviderTargets(parse(SIX), targets(PREVIEW_REVIEWED_PROVIDER_REFS, change))).toThrow();
  });
  it("the providers page counts the host as Amazon, the company that receives the text", () => {
    expect(providerCompaniesOfTargets(targets(PREVIEW_REVIEWED_PROVIDER_REFS))).toEqual(["amazon", "anthropic", "deepinfra"]);
    expect(providerCompaniesOfTargets(targets(PREVIEW_REVIEWED_PROVIDER_REFS.filter(ref => ref !== LUNA_REF)))).toEqual(["anthropic", "deepinfra"]);
  });
});

describe("the guarded fetch routes by exact URL, each call only to its own provider's gate", () => {
  it("sends a Luna body to the Bedrock gate and a GLM body to the DeepInfra gate, never across", async () => {
    const { executions, port } = recordingPorts();
    const fetcher = createPreviewGuardedFetch({ deepinfra: port("deepinfra", () => "{}"), bedrock: port("bedrock", () => lunaReply()) });
    await fetcher(PREVIEW_BEDROCK_CHAT_COMPLETIONS_URL, { method: "POST", body: JSON.stringify(lunaBody()) });
    await fetcher(DEEPINFRA_URL, { method: "POST", body: JSON.stringify({ model: GLM, reasoning_effort: "high", max_tokens: 8, messages }) });
    expect(executions.bedrock!.map(execution => JSON.parse(execution.requestBody).model)).toEqual([LUNA]);
    expect(executions.deepinfra!.map(execution => JSON.parse(execution.requestBody).model)).toEqual([GLM]);
    await expect(fetcher(DEEPINFRA_URL, { method: "POST", body: JSON.stringify(lunaBody()) })).rejects.toThrow("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
    await expect(fetcher(DEEPINFRA_URL, { method: "POST", body: JSON.stringify({ model: LUNA, reasoning_effort: "high", max_tokens: 8, messages }) }))
      .rejects.toThrow("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
    await expect(fetcher(PREVIEW_BEDROCK_CHAT_COMPLETIONS_URL, { method: "POST",
      body: JSON.stringify({ model: GLM, reasoning_effort: "high", max_completion_tokens: 8, messages }) })).rejects.toThrow("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
    for (const url of [`${PREVIEW_BEDROCK_CHAT_COMPLETIONS_URL}?x=1`, `${PREVIEW_BEDROCK_CHAT_COMPLETIONS_URL}/`,
      "http://bedrock-runtime.us-east-1.amazonaws.com/openai/v1/chat/completions",
      "https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1/responses",
      "https://bedrock-runtime.eu-north-1.amazonaws.com/openai/v1/chat/completions",
      "https://bedrock-mantle.us-east-1.api.aws/openai/v1/chat/completions"]) {
      await expect(fetcher(url, { method: "POST", body: JSON.stringify(lunaBody()) })).rejects.toThrow("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
    }
    expect([executions.bedrock!.length, executions.deepinfra!.length]).toEqual([1, 1]);
  });
  it("reserves a Luna call at its step's hold prices, with the exact body", async () => {
    const { executions, port } = recordingPorts();
    const fetcher = createPreviewGuardedFetch({ bedrock: port("bedrock", () => lunaReply()) });
    const small = JSON.stringify(lunaBody({ max_completion_tokens: 32_768 }));
    // A final writer's body, above the price step: the upper step's hold prices and the row's own maximum.
    const large = JSON.stringify(lunaBody({ max_completion_tokens: 128_000, messages: [{ role: "user", content: "x".repeat(300_000) }] }));
    await fetcher(PREVIEW_BEDROCK_CHAT_COMPLETIONS_URL, { method: "POST", body: small });
    await fetcher(PREVIEW_BEDROCK_CHAT_COMPLETIONS_URL, { method: "POST", body: large });
    const [first, second] = executions.bedrock!;
    expect([first!.requestBody, second!.requestBody]).toEqual([small, large]);
    expect(first!.reservedUsd).toBe(previewNanoUsdText(BigInt(Buffer.byteLength(small) + 2048) * 138n + 32_768n * 550n));
    expect(first!.callTier).toBeUndefined();
    expect(second!.reservedUsd).toBe(previewNanoUsdText(BigInt(Buffer.byteLength(large) + 2048) * 275n + 128_000n * 825n));
    expect(second!.callTier).toBe("FINAL_WRITER");
    expect(previewCallTierOfBody(previewModelRow(LUNA)!, 1000, 32_769)).toBe("FINAL_WRITER");
  });
  it("accepts every level on the reviewed Luna menu", async () => {
    for (const effort of ["high", "medium", "low", "none"]) {
      const { executions, port } = recordingPorts();
      const fetcher = createPreviewGuardedFetch({ bedrock: port("bedrock", () => lunaReply()) });
      await fetcher(PREVIEW_BEDROCK_CHAT_COMPLETIONS_URL, { method: "POST", body: JSON.stringify(lunaBody({ reasoning_effort: effort })) });
      expect(executions.bedrock, effort).toHaveLength(1);
    }
  });
  it.each([
    ["max_tokens beside the limit", { max_tokens: 1024 }],
    ["max_tokens in place of the limit", { max_completion_tokens: undefined, max_tokens: 1024 }],
    ["no limit", { max_completion_tokens: undefined }],
    ["a limit of 0", { max_completion_tokens: 0 }],
    ["a limit above the row's own maximum", { max_completion_tokens: 128_001 }],
    ["a fractional limit", { max_completion_tokens: 1.5 }],
    ["store", { store: false }],
    ["stream", { stream: false }],
    ["tools", { tools: [] }],
    ["temperature", { temperature: 1 }],
    ["top_p", { top_p: 1 }],
    ["service_tier", { service_tier: "priority" }],
    ["a caching setting", { prompt_cache_options: { mode: "explicit" } }],
    ["JSON mode", { response_format: { type: "json_object" } }],
    ["no reasoning_effort", { reasoning_effort: undefined }],
    ["effort xhigh", { reasoning_effort: "xhigh" }],
    ["effort max", { reasoning_effort: "max" }],
    ["effort default", { reasoning_effort: "default" }],
    ["effort null", { reasoning_effort: null }],
    ["the bare model id", { model: "openai.gpt-6-luna" }],
    ["the worldwide route's model id", { model: "global.openai.gpt-6-luna" }]
  ])("refuses a Luna body with %s before any reservation", async (_name, change) => {
    const { executions, port } = recordingPorts();
    const fetcher = createPreviewGuardedFetch({ bedrock: port("bedrock", () => lunaReply()) });
    const body = JSON.parse(JSON.stringify(lunaBody(change)));
    await expect(fetcher(PREVIEW_BEDROCK_CHAT_COMPLETIONS_URL, { method: "POST", body: JSON.stringify(body) })).rejects.toThrow("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
    expect(executions.bedrock).toHaveLength(0);
  });
  it("never carries a key, and a call with no Bedrock gate configured is a plain failed call", async () => {
    const { executions, port } = recordingPorts();
    const fetcher = createPreviewGuardedFetch({ bedrock: port("bedrock", () => lunaReply()), deepinfra: port("deepinfra", () => "{}") });
    for (const headers of [{ Authorization: "Bearer synthetic" }, { "x-api-key": "synthetic-not-a-key" }]) {
      await expect(fetcher(PREVIEW_BEDROCK_CHAT_COMPLETIONS_URL, { method: "POST", headers, body: JSON.stringify(lunaBody()) }))
        .rejects.toThrow("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
    }
    const withoutGate = createPreviewGuardedFetch({ deepinfra: port("deepinfra", () => "{}") });
    await expect(withoutGate(PREVIEW_BEDROCK_CHAT_COMPLETIONS_URL, { method: "POST", body: JSON.stringify(lunaBody()) }))
      .rejects.toMatchObject({ code: "PROVIDER_CALL_FAILED" });
    expect([executions.bedrock!.length, executions.deepinfra!.length]).toEqual([0, 0]);
  });
});

const REQUEST: ProviderCallRequest = {
  runId: null, subjectItemId: "synthetic:node", callSiteKey: "fixture:judge", role: "JUDGE", lane: "served",
  bound: { maxAttempts: 1, tokenCeiling: 200_000, deadlineMs: 5_000 }, contractHash: "contract:synthetic",
  providerRef: LUNA_REF, packet: framedFixturePacket("Synthetic school policy; no personal data.")
};

describe("Luna's gateway, through the guarded fetch, sends the body its gate accepts and no key", () => {
  it("only a reviewed Bedrock row names the limit max_completion_tokens; every other target keeps max_tokens", () => {
    expect(previewOutputTokensMember(PREVIEW_BEDROCK_BASE_URL, LUNA)).toBe("max_completion_tokens");
    for (const row of PREVIEW_MODEL_ROWS.filter(candidate => candidate.model !== LUNA)) {
      expect(previewOutputTokensMember(row.baseUrl, row.model), row.model).toBe("max_tokens");
    }
    expect(previewOutputTokensMember("https://api.deepinfra.com/v1/openai", LUNA)).toBe("max_tokens");
    expect(previewOutputTokensMember("https://example.invalid/v1", "other/model")).toBe("max_tokens");
  });
  it("clamps the limit to 32,768, sends effort high, and reads the answer", async () => {
    const target = targets(PREVIEW_REVIEWED_PROVIDER_REFS).find(candidate => candidate.providerRef === LUNA_REF)!;
    expect(target.adapterKind ?? "openai-compatible-http").toBe("openai-compatible-http");
    const sent: Array<{ url: string; headers: Record<string, string> }> = [];
    const { executions, port } = recordingPorts();
    const guarded = createPreviewGuardedFetch({ bedrock: port("bedrock", () => lunaReply("{}")) });
    const fetchImplementation: typeof fetch = async (input, init) => {
      sent.push({ url: String(input), headers: Object.fromEntries(new Headers(init?.headers).entries()) });
      return guarded(input, init);
    };
    const config = parse(SIX)!;
    expect(previewTargetGatewayControls(config, target)).toEqual({ maxOutputTokens: 32_768,
      thinking: { parameter: "reasoning_effort", levels: ["high", "medium", "low", "none"] } });
    const native = new OpenAICompatibleProviderGateway({ endpoint: target.baseUrl, model: target.model, maker: target.maker,
      ...providerTargetGatewayControls(target), ...previewTargetGatewayControls(config, target), fetchImplementation,
      persistRawArtifact: async artifact => artifact.artifactId, appendLedgerEntry: async entry => entry.attemptId,
      assertNoOpenWriteTransaction: () => undefined, sleepImplementation: async () => undefined });
    await withPreviewProviderCallPolicy(native, config, target).call(REQUEST);
    expect(sent[0]!.url).toBe(PREVIEW_BEDROCK_CHAT_COMPLETIONS_URL);
    expect(Object.keys(sent[0]!.headers)).not.toContain("authorization");
    const body = JSON.parse(executions.bedrock![0]!.requestBody);
    expect(body).toMatchObject({ model: LUNA, max_completion_tokens: 32_768, reasoning_effort: "high" });
    expect(Object.keys(body).sort()).toEqual(["max_completion_tokens", "messages", "model", "reasoning_effort"]);
  });
  it("a reply that names the model any other way is refused, as for every pinned target", async () => {
    const target = targets(PREVIEW_REVIEWED_PROVIDER_REFS).find(candidate => candidate.providerRef === LUNA_REF)!;
    const { port } = recordingPorts();
    const renamed = JSON.stringify({ ...JSON.parse(lunaReply("{}")), model: "openai.gpt-6-luna" });
    const native = new OpenAICompatibleProviderGateway({ endpoint: target.baseUrl, model: target.model, maker: target.maker,
      ...providerTargetGatewayControls(target), ...previewTargetGatewayControls(parse(SIX)!, target),
      fetchImplementation: createPreviewGuardedFetch({ bedrock: port("bedrock", () => renamed) }),
      persistRawArtifact: async artifact => artifact.artifactId, appendLedgerEntry: async entry => entry.attemptId,
      assertNoOpenWriteTransaction: () => undefined, sleepImplementation: async () => undefined });
    // The pinned-model check fails the call (the gateway reports it as a failed call).
    await expect(native.call(REQUEST)).rejects.toMatchObject({ code: "PROVIDER_CALL_FAILED" });
  });
  it("the discovery probe goes through the Bedrock gate with high and the generation floor", async () => {
    const target = targets(PREVIEW_REVIEWED_PROVIDER_REFS).find(candidate => candidate.providerRef === LUNA_REF)!;
    expect(previewProbeControls(target)).toEqual({ thinkingLevel: "high", tokenCeiling: 8192 });
    const { executions, port } = recordingPorts();
    const fetcher = createPreviewGuardedFetch({ bedrock: port("bedrock", () => lunaReply()) });
    const observed = await observeProviderTarget({ target, timeoutMs: 5_000, clock: () => new Date(), fetchImplementation: fetcher, ...previewProbeControls(target) });
    expect(observed.state).toBe("HEALTHY");
    const body = JSON.parse(executions.bedrock![0]!.requestBody);
    expect(body).toMatchObject({ model: LUNA, max_completion_tokens: 8192, reasoning_effort: "high" });
    expect(Object.hasOwn(body, "max_tokens")).toBe(false);
  });
});
