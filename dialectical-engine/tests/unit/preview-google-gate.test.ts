/**
 * PR C (preview multi-model build, 2026-10-10): the app side of the Google gate. The reviewed
 * gemini-3.8-flash row and its dated prices (parity with the gate's fixture), the guarded fetch's
 * Google route (exact URL, native body shape, frame, dated reservation, Google gate only), the
 * configuration's google_budget_socket, the target sets, the hosted root broker, the
 * start-of-debate estimate, a three-maker panel through admission, and the Gemini gateway's answer
 * bound end to end. No network, no key: every gate here is a fake port.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  GOOGLE_GEMINI_BASE_URL, GeminiGenerateProviderGateway, PREVIEW_GOOGLE_BASE_URL, PREVIEW_GOOGLE_GENERATE_URL,
  PREVIEW_GOOGLE_MODEL_ROW, PREVIEW_GOOGLE_PRICE_STEPS, PREVIEW_GOOGLE_PROVIDER_REF, PREVIEW_GOOGLE_REQUEST_BODY_MAX_BYTES,
  PREVIEW_MODEL_ROWS, PREVIEW_MODEL_ROWS_BY_PROVIDER, PREVIEW_RESERVATION_TEMPLATE_BYTES, PREVIEW_REVIEWED_PROVIDER_REFS,
  assertPreviewProviderTargets, createPreviewBudgetRpcPorts, createPreviewGuardedFetch, geminiGenerateContentBody,
  geminiGenerateContentUrl, geminiPreviewRequestBody, observeProviderTarget, parsePreviewProviderTestConfig,
  parseProviderDiscoveryTargets, previewGoogleBucharestDay, previewGoogleCarefulPrices, previewGoogleLookaheadPrices,
  previewGoogleNativeBodyValid, previewGoogleReservationNanoUsd, previewModelRow, previewModelRowForRef,
  previewNanoUsdText, previewProbeControls, previewTargetJsonRow, previewTargetGatewayControls, providerTargetGatewayControls, withPreviewProviderCallPolicy,
  type PreviewBudgetExecution, type PreviewBudgetPort, type ProviderCallRequest, type ProviderDiscoveryTarget
} from "@debateai/providers";
import { evaluateAskAdmission, type RunCreationSettings } from "@debateai/api";
import type { AskRequest } from "@debateai/contract";
import { gateHostedRoster } from "../../apps/runner/src/hosted-provider-set.js";
import {
  assertPreviewBudgetAdmits, estimatePreviewGateNeeds, previewGateKeyOf, previewRemainingPorts,
  PreviewDailyLimitRefusal, PreviewGateUnavailableRefusal, type PreviewBudgetGateSettings
} from "../../apps/api/src/preview-budget-estimate.js";
import { PREVIEW_MODEL_MAKERS, parsePreviewRosterFlag } from "../../apps/ui/lib/previewPlanRoster.js";
import { previewAskProxyCeiling } from "../../apps/ui/lib/previewAskProxyCeiling.js";
import { framedFixturePacket } from "../support/framed-packet.js";

const GLM = "zai-org/GLM-5.3-Flash";
const DEEPSEEK = "deepseek-ai/DeepSeek-V4.1-Flash";
const MIMO = "XiaomiMiMo/MiMo-V2.6-Pro";
const GEMINI = "gemini-3.8-flash";
const DEEPINFRA_URL = "https://api.deepinfra.com/v1/openai/chat/completions";
const SOCKET = "/run/debateai-v3-preview/provider-budget.sock";
const GOOGLE_SOCKET = "/run/debateai-v3-preview/google-budget-v1.sock";
const BASE = { deployment: "v3-preview", requested_thinking_level: "high", budget_socket: SOCKET, scope_id: "preview-fixture" };
const WITH_GOOGLE = { ...BASE, free_model_ids: [GLM, DEEPSEEK], premium_model_ids: [GLM, DEEPSEEK, GEMINI], google_budget_socket: GOOGLE_SOCKET };
const parse = (value: unknown) => parsePreviewProviderTestConfig(JSON.stringify(value));
/** A fixed moment on 2026-10-10 (today's prices: $0.75 / $3.75). */
const NOW = new Date("2026-10-10T09:00:00Z");

type Moment = { moment: string; request_bytes: number; input_usd_per_m: string; output_usd_per_m: string;
  input_nano_usd_per_token: number; output_nano_usd_per_token: number; reserved_usd: string;
  lookahead_input_usd_per_m?: string; lookahead_output_usd_per_m?: string; lookahead_reserved_usd?: string };
/** The gate's parity file (schema preview-google-row-v1); the Python gate asserts the same numbers. */
const fixture = JSON.parse(readFileSync(new URL("./fixtures/preview-google-row.json", import.meta.url), "utf8")) as {
  schema: string; provider: string; price_zone: string;
  row: { model: string; maker: string; output_bound: number; effort: string; json_object: boolean;
    ceiling_input_usd_per_m: string; ceiling_output_usd_per_m: string };
  price_steps: { first_day: string; input_usd_per_m: string; output_usd_per_m: string }[];
  reservation: { overhead_bytes: number; max_request_bytes: number; per_call_cap_usd: string; worst_case_reservation_usd: string };
  moments: Moment[] };

const nativeBody = (overrides: { maxOutputTokens?: number; text?: string; system?: string } = {}) => geminiGenerateContentBody({
  messages: [...(overrides.system === undefined ? [] : [{ role: "system" as const, content: overrides.system }]),
    { role: "user" as const, content: overrides.text ?? "synthetic" }],
  maxOutputTokens: overrides.maxOutputTokens ?? 8192, thinkingLevel: "high"
});
const geminiAnswer = (text = "{}", finishReason = "STOP") => JSON.stringify({
  candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason, index: 0 }],
  usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, thoughtsTokenCount: 30, totalTokenCount: 150 },
  modelVersion: GEMINI, responseId: "fixture-response"
});
function recordingPorts(googleReply: () => string = () => geminiAnswer()) {
  const deepinfra: PreviewBudgetExecution[] = [];
  const google: PreviewBudgetExecution[] = [];
  const ports = {
    deepinfra: { execute: async (input: PreviewBudgetExecution) => { deepinfra.push(input); return { status: 200, body: "{}" }; } },
    google: { execute: async (input: PreviewBudgetExecution) => { google.push(input); return { status: 200, body: googleReply() }; } }
  } satisfies Record<string, PreviewBudgetPort>;
  return { deepinfra, google, ports };
}
const post = (fetcher: typeof fetch, url: string, body: string, headers: Record<string, string> = { "content-type": "application/json" }) =>
  fetcher(url, { method: "POST", headers, body });
const configured = (providerRef: string) => { const row = previewModelRowForRef(providerRef)!;
  return { providerRef, maker: row.maker, adapterKind: row.adapterKind }; };
const GOOGLE_REFS = [...PREVIEW_REVIEWED_PROVIDER_REFS];
const DEEPINFRA_REFS = GOOGLE_REFS.filter(ref => previewModelRowForRef(ref)!.provider === "deepinfra");
function targets(refs: readonly string[], change: (row: Record<string, unknown>) => void = () => undefined): readonly ProviderDiscoveryTarget[] {
  const rows = refs.map(ref => ({ ...previewTargetJsonRow(ref) } as Record<string, unknown>));
  rows.forEach(change);
  return parseProviderDiscoveryTargets(JSON.stringify(rows), refs.map(configured));
}

describe("the reviewed Google row equals the gate's parity file", () => {
  it("row fields, provider connection and ceiling prices", () => {
    expect(fixture.schema).toBe("preview-google-row-v1");
    expect(fixture.provider).toBe("google");
    expect(fixture.price_zone).toBe("Europe/Bucharest");
    expect(PREVIEW_MODEL_ROWS_BY_PROVIDER.google).toEqual([PREVIEW_GOOGLE_MODEL_ROW]);
    expect(PREVIEW_MODEL_ROWS.at(-1)).toBe(PREVIEW_GOOGLE_MODEL_ROW);
    expect(previewModelRow(GEMINI)).toBe(PREVIEW_GOOGLE_MODEL_ROW);
    expect({ model: PREVIEW_GOOGLE_MODEL_ROW.model, maker: PREVIEW_GOOGLE_MODEL_ROW.maker, output_bound: PREVIEW_GOOGLE_MODEL_ROW.outputBound,
      effort: PREVIEW_GOOGLE_MODEL_ROW.effort, json_object: PREVIEW_GOOGLE_MODEL_ROW.jsonObject,
      ceiling_input_usd_per_m: PREVIEW_GOOGLE_MODEL_ROW.inputUsdPerM, ceiling_output_usd_per_m: PREVIEW_GOOGLE_MODEL_ROW.outputUsdPerM }).toEqual(fixture.row);
    expect(PREVIEW_GOOGLE_MODEL_ROW).toMatchObject({ provider: "google", baseUrl: GOOGLE_GEMINI_BASE_URL, adapterKind: "google-gemini-http",
      contextWindowTokens: 1_048_576, inputNanoUsdPerToken: 1500n, outputNanoUsdPerToken: 7500n,
      inputPriceMicrosPerMillion: 1_500_000, outputPriceMicrosPerMillion: 7_500_000 });
    expect(PREVIEW_GOOGLE_BASE_URL).toBe(GOOGLE_GEMINI_BASE_URL);
    expect(PREVIEW_GOOGLE_GENERATE_URL).toBe(geminiGenerateContentUrl(GOOGLE_GEMINI_BASE_URL, GEMINI));
    expect(previewModelRowForRef(PREVIEW_GOOGLE_PROVIDER_REF)).toBe(PREVIEW_GOOGLE_MODEL_ROW);
  });
  it("dated price steps, the overhead and the frame limit", () => {
    expect(PREVIEW_GOOGLE_PRICE_STEPS.map(step => ({ first_day: step.firstDay, input_usd_per_m: step.inputUsdPerM, output_usd_per_m: step.outputUsdPerM })))
      .toEqual(fixture.price_steps);
    for (const step of PREVIEW_GOOGLE_PRICE_STEPS) {
      expect(step.inputNanoUsdPerToken).toBe(BigInt(Math.round(Number(step.inputUsdPerM) * 1000)));
      expect(step.outputNanoUsdPerToken).toBe(BigInt(Math.round(Number(step.outputUsdPerM) * 1000)));
    }
    expect(PREVIEW_RESERVATION_TEMPLATE_BYTES).toBe(fixture.reservation.overhead_bytes);
    expect(PREVIEW_GOOGLE_REQUEST_BODY_MAX_BYTES).toBe(fixture.reservation.max_request_bytes);
  });
  it("the worst case (largest frame, ceiling prices) equals the file and stays under the per-call cap", () => {
    const last = PREVIEW_GOOGLE_PRICE_STEPS.at(-1)!;
    const worst = previewGoogleReservationNanoUsd(PREVIEW_GOOGLE_REQUEST_BODY_MAX_BYTES, last);
    expect(previewNanoUsdText(worst)).toBe(fixture.reservation.worst_case_reservation_usd);
    expect(worst < BigInt(Math.round(Number(fixture.reservation.per_call_cap_usd) * 1e9))).toBe(true);
    expect([last.inputUsdPerM, last.outputUsdPerM]).toEqual([PREVIEW_GOOGLE_MODEL_ROW.inputUsdPerM, PREVIEW_GOOGLE_MODEL_ROW.outputUsdPerM]);
  });
  it.each(fixture.moments.map(m => [m.moment, m.request_bytes, m] as const))("moment %s with %i bytes: the gate's price and hold to the digit", (moment, bytes, row) => {
    const prices = previewGoogleCarefulPrices(new Date(moment));
    expect([prices.inputUsdPerM, prices.outputUsdPerM]).toEqual([row.input_usd_per_m, row.output_usd_per_m]);
    expect([prices.inputNanoUsdPerToken, prices.outputNanoUsdPerToken]).toEqual([BigInt(row.input_nano_usd_per_token), BigInt(row.output_nano_usd_per_token)]);
    expect(previewNanoUsdText(previewGoogleReservationNanoUsd(bytes, prices))).toBe(row.reserved_usd);
  });
  it("every moment has its 3-day lookahead case, and the app's hold equals it to the digit", () => {
    expect(fixture.moments.length).toBeGreaterThan(0);
    for (const row of fixture.moments) {
      expect(row.lookahead_reserved_usd, `lookahead case missing for ${row.moment}`).toBeDefined();
      const prices = previewGoogleLookaheadPrices(new Date(row.moment));
      expect([prices.inputUsdPerM, prices.outputUsdPerM]).toEqual([row.lookahead_input_usd_per_m, row.lookahead_output_usd_per_m]);
      expect(previewNanoUsdText(previewGoogleReservationNanoUsd(row.request_bytes, prices))).toBe(row.lookahead_reserved_usd);
      // Never below the gate's own hold.
      expect(previewGoogleReservationNanoUsd(row.request_bytes, prices) >= previewGoogleReservationNanoUsd(row.request_bytes, previewGoogleCarefulPrices(new Date(row.moment)))).toBe(true);
    }
  });
});

describe("the price step, on the app's side", () => {
  it("the gate's rule changes at Bucharest midnight before 2027-01-01 (22:00 UTC on 2026-12-30)", () => {
    expect(previewGoogleCarefulPrices(new Date("2026-12-30T21:59:59.999Z"))).toMatchObject({ inputUsdPerM: "0.75", outputUsdPerM: "3.75" });
    expect(previewGoogleCarefulPrices(new Date("2026-12-30T22:00:00Z"))).toMatchObject({ inputUsdPerM: "1.50", outputUsdPerM: "7.50" });
    expect(previewGoogleBucharestDay(new Date("2026-12-30T21:59:59.999Z"))).toBe("2026-12-30");
    expect(previewGoogleBucharestDay(new Date("2026-12-30T22:00:00Z"))).toBe("2026-12-31");
  });
  it("the app's lookahead changes one day earlier (22:00 UTC on 2026-12-29)", () => {
    expect(previewGoogleLookaheadPrices(new Date("2026-12-29T21:59:59.999Z"))).toMatchObject({ inputUsdPerM: "0.75", outputUsdPerM: "3.75" });
    expect(previewGoogleLookaheadPrices(new Date("2026-12-29T22:00:00Z"))).toMatchObject({ inputUsdPerM: "1.50", outputUsdPerM: "7.50" });
  });
  it("never 2027 prices on 2026-10-10, at any moment of the Bucharest day, by either rule", () => {
    for (let minutes = 0; minutes < 24 * 60; minutes += 15) {
      const moment = new Date(Date.parse("2026-10-09T21:00:00Z") + minutes * 60_000);
      expect(previewGoogleBucharestDay(moment)).toBe("2026-10-10");
      for (const prices of [previewGoogleCarefulPrices(moment), previewGoogleLookaheadPrices(moment)]) {
        expect([prices.inputNanoUsdPerToken, prices.outputNanoUsdPerToken]).toEqual([750n, 3750n]);
      }
    }
  });
  it("refuses an invalid clock", () => {
    expect(() => previewGoogleCarefulPrices(new Date(Number.NaN))).toThrow("PREVIEW_GOOGLE_CLOCK_INVALID");
  });
});

describe("the guarded fetch's Google route", () => {
  it("sends the framed body, byte for byte, only to the Google gate, at the lookahead price", async () => {
    const { deepinfra, google, ports } = recordingPorts();
    const fetcher = createPreviewGuardedFetch(ports, { clock: () => NOW });
    const native = nativeBody({ system: "frame" });
    const response = await post(fetcher, PREVIEW_GOOGLE_GENERATE_URL, native);
    expect(response.status).toBe(200);
    expect(JSON.parse(await response.text()).modelVersion).toBe(GEMINI);
    expect(deepinfra).toHaveLength(0);
    expect(google).toHaveLength(1);
    const framed = geminiPreviewRequestBody(GEMINI, native);
    expect(framed).toBe(`{"model":"gemini-3.8-flash","request":${native}}`);
    expect(google[0]!.requestBody).toBe(framed);
    expect(google[0]!.requestSha256).toBe(createHash("sha256").update(framed).digest("hex"));
    const bytes = BigInt(Buffer.byteLength(framed) + 2048);
    expect(google[0]!.reservedUsd).toBe(previewNanoUsdText(bytes * 750n + 16_384n * 3750n));
  });
  it("on the day before a step the hold is already at the new price; the clock defaults to now", async () => {
    const { google, ports } = recordingPorts();
    await post(createPreviewGuardedFetch(ports, { clock: () => new Date("2026-12-30T12:00:00Z") }), PREVIEW_GOOGLE_GENERATE_URL, nativeBody());
    const framedBytes = BigInt(Buffer.byteLength(geminiPreviewRequestBody(GEMINI, nativeBody())) + 2048);
    expect(google[0]!.reservedUsd).toBe(previewNanoUsdText(framedBytes * 1500n + 16_384n * 7500n));
    await post(createPreviewGuardedFetch(ports), PREVIEW_GOOGLE_GENERATE_URL, nativeBody());
    expect(google).toHaveLength(2);
  });
  it("refuses a key query, a fragment, another model and a credential header, before any reservation", async () => {
    const { deepinfra, google, ports } = recordingPorts();
    const fetcher = createPreviewGuardedFetch(ports, { clock: () => NOW });
    for (const url of [`${PREVIEW_GOOGLE_GENERATE_URL}?key=fixture`, `${PREVIEW_GOOGLE_GENERATE_URL}#x`,
      `${GOOGLE_GEMINI_BASE_URL}/models/gemini-3.8-pro:generateContent`, `${GOOGLE_GEMINI_BASE_URL}/models/${GEMINI}:streamGenerateContent`,
      `http://generativelanguage.googleapis.com/v1beta/models/${GEMINI}:generateContent`]) {
      await expect(post(fetcher, url, nativeBody())).rejects.toThrow("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
    }
    for (const headers of [{ "x-goog-api-key": "fixture" }, { "X-Goog-Api-Key": "fixture" }, { authorization: "Bearer fixture" },
      { "content-type": "application/json", "x-api-key": "fixture" }]) {
      await expect(post(fetcher, PREVIEW_GOOGLE_GENERATE_URL, nativeBody(), headers)).rejects.toThrow("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
    }
    await expect(fetcher(PREVIEW_GOOGLE_GENERATE_URL, { method: "GET" })).rejects.toThrow();
    expect([deepinfra.length, google.length]).toEqual([0, 0]);
  });
  const valid = () => JSON.parse(nativeBody({ system: "s" })) as Record<string, any>;
  const shapes: Array<[string, (body: Record<string, any>) => void]> = [
    ["tools", b => { b.tools = []; }], ["toolConfig", b => { b.toolConfig = {}; }], ["safetySettings", b => { b.safetySettings = []; }],
    ["cachedContent", b => { b.cachedContent = "c"; }], ["labels", b => { b.labels = {}; }],
    ["temperature", b => { b.generationConfig.temperature = 0; }], ["candidateCount", b => { b.generationConfig.candidateCount = 1; }],
    ["stopSequences", b => { b.generationConfig.stopSequences = ["x"]; }],
    ["responseMimeType", b => { b.generationConfig.responseMimeType = "application/json"; }],
    ["missing thinking", b => { delete b.generationConfig.thinkingConfig; }],
    ["another thinking level", b => { b.generationConfig.thinkingConfig = { thinkingLevel: "low" }; }],
    ["thinkingBudget", b => { b.generationConfig.thinkingConfig = { thinkingLevel: "high", thinkingBudget: 1024 }; }],
    ["includeThoughts", b => { b.generationConfig.thinkingConfig = { thinkingLevel: "high", includeThoughts: true }; }],
    ["maxOutputTokens 0", b => { b.generationConfig.maxOutputTokens = 0; }],
    ["maxOutputTokens 16385", b => { b.generationConfig.maxOutputTokens = 16_385; }],
    ["maxOutputTokens true", b => { b.generationConfig.maxOutputTokens = true; }],
    ["maxOutputTokens 8192.5", b => { b.generationConfig.maxOutputTokens = 8192.5; }],
    ["maxOutputTokens \"8192\"", b => { b.generationConfig.maxOutputTokens = "8192"; }],
    ["missing maxOutputTokens", b => { delete b.generationConfig.maxOutputTokens; }],
    ["empty contents", b => { b.contents = []; }],
    ["model first", b => { b.contents[0].role = "model"; }],
    ["a system role in contents", b => { b.contents.push({ role: "system", parts: [{ text: "x" }] }); }],
    ["two parts", b => { b.contents[0].parts.push({ text: "x" }); }],
    ["a thought part", b => { b.contents[0].parts[0].thought = true; }],
    ["inlineData", b => { b.contents[0].parts = [{ inlineData: { mimeType: "image/png", data: "AA==" } }]; }],
    ["non-string text", b => { b.contents[0].parts[0].text = 1; }],
    ["an extra turn key", b => { b.contents[0].name = "x"; }],
    ["systemInstruction with a role", b => { b.systemInstruction.role = "system"; }],
    ["systemInstruction with two parts", b => { b.systemInstruction.parts.push({ text: "x" }); }],
    ["systemInstruction as a string", b => { b.systemInstruction = "s"; }],
    ["no generationConfig", b => { delete b.generationConfig; }],
    ["a model key in the native body", b => { b.model = GEMINI; }],
    ["a lone surrogate", b => { b.contents[0].parts[0].text = "\ud800"; }]
  ];
  it.each(shapes)("refuses %s, before any reservation", async (_name, change) => {
    const body = valid();
    change(body);
    expect(previewGoogleNativeBodyValid(body)).toBe(false);
    const { google, ports } = recordingPorts();
    await expect(post(createPreviewGuardedFetch(ports, { clock: () => NOW }), PREVIEW_GOOGLE_GENERATE_URL, JSON.stringify(body)))
      .rejects.toThrow("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
    expect(google).toHaveLength(0);
  });
  it("accepts the adapter's bodies (with and without a system part, model turns, the bound itself)", () => {
    expect(previewGoogleNativeBodyValid(valid())).toBe(true);
    expect(previewGoogleNativeBodyValid(JSON.parse(nativeBody({ maxOutputTokens: 16_384 })))).toBe(true);
    expect(previewGoogleNativeBodyValid(JSON.parse(geminiGenerateContentBody({ messages: [{ role: "user", content: "a" },
      { role: "assistant", content: "b" }, { role: "user", content: "c" }], maxOutputTokens: 1, thinkingLevel: "high" })))).toBe(true);
  });
  it("refuses a body in any spelling but the adapter's own (spaces, 8192.0)", async () => {
    const { google, ports } = recordingPorts();
    const fetcher = createPreviewGuardedFetch(ports, { clock: () => NOW });
    for (const text of [JSON.stringify(valid(), null, 1), nativeBody().replace("8192", "8192.0"), ` ${nativeBody()}`]) {
      await expect(post(fetcher, PREVIEW_GOOGLE_GENERATE_URL, text)).rejects.toThrow("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
    }
    expect(google).toHaveLength(0);
  });
  it("a frame at the limit is sent; one byte over is refused", async () => {
    const { google, ports } = recordingPorts();
    const fetcher = createPreviewGuardedFetch(ports, { clock: () => NOW });
    const frameBytes = (text: string) => Buffer.byteLength(geminiPreviewRequestBody(GEMINI, nativeBody({ text })));
    const padding = PREVIEW_GOOGLE_REQUEST_BODY_MAX_BYTES - frameBytes("");
    const atLimit = nativeBody({ text: "x".repeat(padding) });
    expect(frameBytes("x".repeat(padding))).toBe(fixture.reservation.max_request_bytes);
    await post(fetcher, PREVIEW_GOOGLE_GENERATE_URL, atLimit);
    expect(google).toHaveLength(1);
    expect(google[0]!.reservedUsd).toBe(previewNanoUsdText(previewGoogleReservationNanoUsd(fixture.reservation.max_request_bytes, previewGoogleLookaheadPrices(NOW))));
    await expect(post(fetcher, PREVIEW_GOOGLE_GENERATE_URL, nativeBody({ text: "x".repeat(padding + 1) }))).rejects.toThrow("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
    expect(google).toHaveLength(1);
  });
  it("a Gemini body on the DeepInfra URL, a DeepInfra body on the Gemini URL, and the Gemini id in an OpenAI body are refused", async () => {
    const { deepinfra, google, ports } = recordingPorts();
    const fetcher = createPreviewGuardedFetch(ports, { clock: () => NOW });
    await expect(post(fetcher, DEEPINFRA_URL, nativeBody())).rejects.toThrow();
    await expect(post(fetcher, DEEPINFRA_URL, geminiPreviewRequestBody(GEMINI, nativeBody()))).rejects.toThrow();
    const openAi = JSON.stringify({ model: GLM, max_tokens: 8, reasoning_effort: "high", messages: [{ role: "user", content: "x" }] });
    await expect(post(fetcher, PREVIEW_GOOGLE_GENERATE_URL, openAi)).rejects.toThrow();
    await expect(post(fetcher, DEEPINFRA_URL, JSON.stringify({ model: GEMINI, max_tokens: 8, reasoning_effort: "high", messages: [{ role: "user", content: "x" }] }))).rejects.toThrow();
    expect([deepinfra.length, google.length]).toEqual([0, 0]);
    // The DeepInfra route itself is unchanged and never touches the Google gate.
    await post(fetcher, DEEPINFRA_URL, openAi);
    expect([deepinfra.length, google.length]).toEqual([1, 0]);
  });
  it("with no Google gate a Google call is refused and nothing is reserved anywhere", async () => {
    const { deepinfra, ports } = recordingPorts();
    for (const fetcher of [createPreviewGuardedFetch({ deepinfra: ports.deepinfra }), createPreviewGuardedFetch(ports.deepinfra)]) {
      await expect(post(fetcher, PREVIEW_GOOGLE_GENERATE_URL, nativeBody())).rejects.toMatchObject({ code: "PROVIDER_CALL_FAILED" });
    }
    expect(deepinfra).toHaveLength(0);
  });
});

describe("configuration: google_budget_socket", () => {
  it("accepts the six keys plus google_budget_socket, and builds one port per gate", () => {
    const config = parse(WITH_GOOGLE)!;
    expect(config.google_budget_socket).toBe(GOOGLE_SOCKET);
    expect(config.premium_model_ids).toEqual([GLM, DEEPSEEK, GEMINI]);
    expect(parse(config)).toEqual(config);
    expect(Object.keys(createPreviewBudgetRpcPorts(config)).sort()).toEqual(["deepinfra", "google"]);
    expect(Object.keys(createPreviewBudgetRpcPorts(parse({ ...BASE, free_model_ids: [GLM] })!))).toEqual(["deepinfra"]);
    // A Google socket with no Google model in either roster is allowed (the owner turns Google on later).
    expect(parse({ ...WITH_GOOGLE, premium_model_ids: [GLM, DEEPSEEK, MIMO] })!.google_budget_socket).toBe(GOOGLE_SOCKET);
    // Three makers in one roster: Z.AI, DeepSeek and Google.
    expect(parse({ ...WITH_GOOGLE, free_model_ids: [GLM, DEEPSEEK, GEMINI] })!.free_model_ids).toHaveLength(3);
  });
  it.each([
    ["a Gemini roster without the Google socket", (() => { const { google_budget_socket: _s, ...rest } = WITH_GOOGLE; return rest; })()],
    ["the same socket twice", { ...WITH_GOOGLE, google_budget_socket: SOCKET }],
    ["a socket outside the preview folder", { ...WITH_GOOGLE, google_budget_socket: "/tmp/google.sock" }],
    ["a non-string socket", { ...WITH_GOOGLE, google_budget_socket: 1 }],
    ["the legacy five keys with a Google socket", { ...BASE, free_model_ids: [GLM], google_budget_socket: GOOGLE_SOCKET }],
    ["a one-maker Free roster beside Google", { ...WITH_GOOGLE, free_model_ids: [GEMINI] }],
    ["an unknown provider socket", { ...WITH_GOOGLE, other_budget_socket: "/run/debateai-v3-preview/other.sock" }]
  ])("refuses %s", (_name, value) => {
    expect(() => parse(value)).toThrow("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
  });
});

describe("declared targets: the reviewed sets", () => {
  it("accepts the DeepInfra set (today's server) and the DeepInfra set followed by the Google ref", () => {
    expect(GOOGLE_REFS).toEqual([...DEEPINFRA_REFS, PREVIEW_GOOGLE_PROVIDER_REF]);
    expect(DEEPINFRA_REFS).toEqual(["preview:fixture-a", "preview:fixture-b", "preview:deepseek-v4-1-flash", "preview:mimo-v2-6-pro"]);
    expect(() => assertPreviewProviderTargets(parse({ ...WITH_GOOGLE, premium_model_ids: [GLM, DEEPSEEK, MIMO] }), targets(DEEPINFRA_REFS))).not.toThrow();
    expect(() => assertPreviewProviderTargets(parse(WITH_GOOGLE), targets(GOOGLE_REFS))).not.toThrow();
    expect(previewTargetJsonRow(PREVIEW_GOOGLE_PROVIDER_REF)).toEqual({ provider_ref: PREVIEW_GOOGLE_PROVIDER_REF, base_url: GOOGLE_GEMINI_BASE_URL,
      model: GEMINI, input_price_micros_per_million: 1_500_000, output_price_micros_per_million: 7_500_000,
      thinking_parameter: "reasoning_effort", thinking_levels: ["high"], context_window_tokens: 1_048_576 });
  });
  it("refuses a Gemini roster when no target serves it, and any other set or order", () => {
    expect(() => assertPreviewProviderTargets(parse(WITH_GOOGLE), targets(DEEPINFRA_REFS))).toThrow();
    expect(() => assertPreviewProviderTargets(parse(WITH_GOOGLE), targets([PREVIEW_GOOGLE_PROVIDER_REF]))).toThrow();
    expect(() => assertPreviewProviderTargets(parse(WITH_GOOGLE), targets([PREVIEW_GOOGLE_PROVIDER_REF, ...DEEPINFRA_REFS]))).toThrow();
  });
  it.each([
    ["a credential file", (row: Record<string, unknown>) => { if (row.model === GEMINI) row.authorization_file = "/root/fixture/google.key"; }],
    ["a credential header", (row: Record<string, unknown>) => { if (row.model === GEMINI) row.authorization_header = "fixture"; }],
    ["the 2026 price as its static price", (row: Record<string, unknown>) => { if (row.model === GEMINI) row.input_price_micros_per_million = 750_000; }],
    ["no thinking switch", (row: Record<string, unknown>) => { if (row.model === GEMINI) { delete row.thinking_parameter; delete row.thinking_levels; } }],
    ["another window", (row: Record<string, unknown>) => { if (row.model === GEMINI) row.context_window_tokens = 1_000_000; }]
  ])("refuses a Google target with %s", (_name, change) => {
    expect(() => assertPreviewProviderTargets(parse(WITH_GOOGLE), targets(GOOGLE_REFS, change))).toThrow();
  });
  it("refuses Gemini declared on the DeepInfra URL", () => {
    const rows = GOOGLE_REFS.map(ref => ({ ...previewTargetJsonRow(ref) } as Record<string, unknown>));
    rows[4]!.base_url = "https://api.deepinfra.com/v1/openai";
    const declared = parseProviderDiscoveryTargets(JSON.stringify(rows), GOOGLE_REFS.map(ref => ({ ...configured(ref), adapterKind: "openai-compatible-http" })));
    expect(() => assertPreviewProviderTargets(parse(WITH_GOOGLE), declared)).toThrow();
  });
  it("the Google target's gateway controls: high, its window, the native wire and the 16,384 answer bound", () => {
    const target = targets(GOOGLE_REFS).at(-1)!;
    expect(providerTargetGatewayControls(target)).toEqual({ thinking: { parameter: "reasoning_effort", levels: ["high"] },
      contextWindowTokens: 1_048_576, adapterKind: "google-gemini-http" });
    // On the preview only, the answer bound comes from the reviewed row (A's previewTargetGatewayControls).
    expect(previewTargetGatewayControls(parse(WITH_GOOGLE), target)).toEqual({ maxOutputTokens: 16_384 });
    expect(previewTargetGatewayControls(undefined, target)).toEqual({});
    expect(previewProbeControls(target)).toEqual({ thinkingLevel: "high", tokenCeiling: 8192 });
  });
});

describe("the hosted root broker takes the Google row on its own adapter", () => {
  const broker = (ref: string, change: Record<string, unknown> = {}) => JSON.stringify({ providers: [{
    ...previewTargetJsonRow(ref), adapter_kind: previewModelRowForRef(ref)!.adapterKind, maker: previewModelRowForRef(ref)!.maker,
    vetting: {}, preview_budget_authority: true, ...change }] });
  it("accepts the Google row exactly", () => { expect(() => gateHostedRoster(broker(PREVIEW_GOOGLE_PROVIDER_REF))).not.toThrow(); });
  it.each([
    ["Google on the OpenAI-compatible adapter", PREVIEW_GOOGLE_PROVIDER_REF, { adapter_kind: "openai-compatible-http" }],
    ["a DeepInfra row on the Gemini adapter", "preview:fixture-a", { adapter_kind: "google-gemini-http" }],
    ["Google under another maker", PREVIEW_GOOGLE_PROVIDER_REF, { maker: "Z.AI" }],
    ["Google at the 2026 price", PREVIEW_GOOGLE_PROVIDER_REF, { input_price_micros_per_million: 750_000 }],
    ["Google with a credential file", PREVIEW_GOOGLE_PROVIDER_REF, { api_authorization_file: "/root/fixture/google.key" }]
  ])("refuses %s", (_name, ref, change) => { expect(() => gateHostedRoster(broker(ref, change))).toThrow(); });
});

function basis(panelSize: number): Readonly<Record<string, unknown>> {
  return Object.freeze({
    kind: "COMPUTED_STRUCTURAL_CEILING", panel_size: panelSize, depth: 1, max_model_attempts: 999,
    call_sites: { author: 8, panel: 8, reviewer: 8, serve: 6 },
    serve_leg: { synthesis_loop_sites: 6, selected: "SYNTHESIS_LOOP" }
  });
}
const openGate = (enabledModels: string[], remainingNanoUsd = 30_000_000_000n) => Object.freeze({
  state: "active" as const, windowOpen: true, remainingNanoUsd, remainingCalls: 1200, maxConcurrentCalls: 1,
  largestReservationNanoUsd: 519_264_000n, enabledModels });

const REF_OF: Readonly<Record<string, string>> = Object.freeze({ [GLM]: "preview:fixture-a", [DEEPSEEK]: "preview:deepseek-v4-1-flash",
  [MIMO]: "preview:mimo-v2-6-pro", [GEMINI]: PREVIEW_GOOGLE_PROVIDER_REF });
const panelOf = (models: string[]) => models.map(model_id => ({ provider_ref: REF_OF[model_id]!, model_id }));
const ROLES = (roleModelIds: string[]) => ({ roleModelIds, roleProviderRefs: roleModelIds.map(model => REF_OF[model]!),
  storyCalls: 0, maxCooldownHoldsPerRun: 0 });

describe("the start-of-debate estimate asks the Google gate", () => {
  it("maps each row to its own gate, and builds the Google /remaining port only when its socket is set", () => {
    expect([GLM, DEEPSEEK, MIMO, GEMINI].map(previewGateKeyOf)).toEqual(["deepinfra", "deepinfra", "deepinfra", "google"]);
    expect(Object.keys(previewRemainingPorts(parse(WITH_GOOGLE)!)).sort()).toEqual(["deepinfra", "google"]);
    expect(Object.keys(previewRemainingPorts(parse({ ...BASE, free_model_ids: [GLM] })!))).toEqual(["deepinfra"]);
  });
  it("prices every Google call at the row's ceiling", () => {
    const needs = estimatePreviewGateNeeds({ basis: basis(2), panel: panelOf([GLM, GEMINI]), ...ROLES([GLM]) });
    const google = needs.find(need => need.gate === "google")!;
    expect(google).toMatchObject({ modelIds: [GEMINI], dearestModelId: GEMINI });
    // Every call at (4,000 x 1,500 + 1,200 x 7,500) nano-USD, x 115 / 100, rounded up.
    const raw = BigInt(google.expectedCalls) * (4_000n * 1_500n + 1_200n * 7_500n) * 115n;
    expect(google.callsNanoUsd).toBe((raw + 99n) / 100n);
    expect(google.expectedCalls).toBeGreaterThan(0);
  });
  const counted = () => {
    const calls = { deepinfra: 0, google: 0 };
    const gate = (roleModelIds: string[], withGoogle = true): PreviewBudgetGateSettings => Object.freeze({
      remaining: { deepinfra: async () => { calls.deepinfra += 1; return openGate([GLM, DEEPSEEK]); },
        ...(withGoogle ? { google: async () => { calls.google += 1; return openGate([GEMINI]); } } : {}) },
      ...ROLES(roleModelIds), readUnfinishedRuns: async () => [] });
    return { calls, gate };
  };
  it("reads the Google gate for a Gemini panel member", async () => {
    const { calls, gate } = counted();
    await assertPreviewBudgetAdmits(gate([GLM, DEEPSEEK]), { basis: basis(3), panel: panelOf([GLM, DEEPSEEK, GEMINI]) });
    expect(calls).toEqual({ deepinfra: 1, google: 1 });
  });
  it("reads the Google gate for a Gemini role ref", async () => {
    const { calls, gate } = counted();
    await assertPreviewBudgetAdmits(gate([GLM, GEMINI]), { basis: basis(2), panel: panelOf([GLM, DEEPSEEK]) });
    expect(calls).toEqual({ deepinfra: 1, google: 1 });
  });
  it("never reads the Google gate for a DeepInfra-only debate", async () => {
    const { calls, gate } = counted();
    await assertPreviewBudgetAdmits(gate([GLM, DEEPSEEK]), { basis: basis(2), panel: panelOf([GLM, DEEPSEEK]) });
    expect(calls).toEqual({ deepinfra: 1, google: 0 });
  });
  it("refuses a Gemini debate without a Google port (not available) and when the Google gate is short (daily)", async () => {
    const { gate } = counted();
    await expect(assertPreviewBudgetAdmits(gate([GLM, DEEPSEEK], false), { basis: basis(3), panel: panelOf([GLM, DEEPSEEK, GEMINI]) }))
      .rejects.toBeInstanceOf(PreviewGateUnavailableRefusal);
    await expect(assertPreviewBudgetAdmits(gate([GLM, GEMINI], false), { basis: basis(2), panel: panelOf([GLM, DEEPSEEK]) }))
      .rejects.toMatchObject({ code: "ASK_MODEL_CANDIDATE_UNAVAILABLE" });
    const short: PreviewBudgetGateSettings = Object.freeze({ remaining: { deepinfra: async () => openGate([GLM, DEEPSEEK]),
      google: async () => openGate([GEMINI], 1_000_000_000n) }, ...ROLES([GLM, DEEPSEEK]), readUnfinishedRuns: async () => [] });
    await expect(assertPreviewBudgetAdmits(short, { basis: basis(3), panel: panelOf([GLM, DEEPSEEK, GEMINI]) })).rejects.toBeInstanceOf(PreviewDailyLimitRefusal);
  });
});

const ASK = { question: "Ce regulă proporțională ar trebui aplicată telefoanelor în școli?", plan_tier: "premium", risk_tier: "standard",
  tier_source: "ASKER", tier_provenance_ref: "synthetic:test", depth_params: { depth: 1 }, composition_budget_tier: "low",
  decision_scope: "synthetic school policy", as_of: "2026-10-10T00:00:00Z", steering_presets: [], steering_annotations: [] } as unknown as AskRequest;
const member = (provider_ref: string, maker: string, model_id: string) => ({ provider_ref, maker, model_id,
  probe_evidence_ref: `fixture:${provider_ref}`, probed_at: "2026-10-10T00:00:00Z" });
function admissionSettings(extra: Partial<RunCreationSettings>): RunCreationSettings {
  return { strangerSampleRate: 0, registerVersion: 5, batteryVersion: "fixture", settlementWatchHandle: "fixture",
    resolveEnvelopeBasis: async input => ({ panel_size: input.panelSize, max_model_attempts: 8 }),
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({ effectiveRiskTier, tierSource, tierProvenanceRef }), ...extra } as RunCreationSettings;
}

describe("a three-maker panel with Gemini through the real admission path", () => {
  it("GLM + DeepSeek + Gemini: three makers, neither SINGLE-LINEAGE nor CRITIQUE-UNAVAILABLE, both gates asked", async () => {
    const config = parse(WITH_GOOGLE)!;
    const asked = { deepinfra: 0, google: 0 };
    const result = await evaluateAskAdmission(admissionSettings({
      previewProviderTestConfig: config,
      previewBudgetGate: { remaining: {
        deepinfra: async () => { asked.deepinfra += 1; return openGate([GLM, DEEPSEEK]); },
        google: async () => { asked.google += 1; return openGate([GEMINI]); } }, ...ROLES([GLM, DEEPSEEK]), readUnfinishedRuns: async () => [] },
      resolveDiscoveredPanel: async () => [member("preview:fixture-a", "Z.AI", GLM), member("preview:fixture-b", "Z.AI", GLM),
        member("preview:deepseek-v4-1-flash", "DeepSeek", DEEPSEEK), member(PREVIEW_GOOGLE_PROVIDER_REF, "Google", GEMINI)]
    }), ASK);
    expect(result.discoveredPanel.map(x => x.model_id)).toEqual([GLM, DEEPSEEK, GEMINI]);
    expect(new Set(result.discoveredPanel.map(x => x.maker))).toEqual(new Set(["Z.AI", "DeepSeek", "Google"]));
    expect(result.criticUnavailableCap.conditionMarks).not.toContain("SINGLE-LINEAGE");
    expect(result.criticUnavailableCap.conditionMarks).not.toContain("CRITIQUE-UNAVAILABLE");
    expect(result.criticUnavailableCap).toEqual({ serves: true, conditionMarks: [], confidenceBandCapRequired: false, liftCondition: null });
    expect(asked).toEqual({ deepinfra: 1, google: 1 });
  });
});

const CALL: ProviderCallRequest = {
  runId: null, subjectItemId: "synthetic:node", callSiteKey: "fixture:judge", role: "JUDGE", lane: "served",
  bound: { maxAttempts: 1, tokenCeiling: 200_000, deadlineMs: 5_000 }, contractHash: "contract:synthetic",
  providerRef: PREVIEW_GOOGLE_PROVIDER_REF, packet: framedFixturePacket("Synthetic school policy; no personal data.")
};
function googleGateway(googleReply: () => string) {
  const target = targets(GOOGLE_REFS).at(-1)!;
  const recorded = recordingPorts(googleReply);
  const fetchImplementation = createPreviewGuardedFetch(recorded.ports, { clock: () => NOW });
  const native = new GeminiGenerateProviderGateway({ endpoint: target.baseUrl, model: target.model, maker: target.maker,
    ...providerTargetGatewayControls(target), ...previewTargetGatewayControls(parse(WITH_GOOGLE), target), fetchImplementation,
    persistRawArtifact: async artifact => artifact.artifactId, appendLedgerEntry: async entry => entry.attemptId,
    assertNoOpenWriteTransaction: () => undefined, sleepImplementation: async () => undefined });
  return { ...recorded, target, native };
}
const sentNative = (execution: PreviewBudgetExecution) => JSON.parse(execution.requestBody).request as Record<string, any>;

describe("the Gemini gateway keeps to the row's answer bound, end to end (gateway -> guarded fetch -> fake Google gate)", () => {
  it("through the preview policy: one attempt, high, maxOutputTokens clamped to 16,384", async () => {
    const { deepinfra, google, native, target } = googleGateway(() => geminiAnswer());
    const result = await withPreviewProviderCallPolicy(native, parse(WITH_GOOGLE)!, target).call(CALL);
    expect(result.model).toBe(GEMINI);
    expect(google).toHaveLength(1);
    expect(deepinfra).toHaveLength(0);
    expect(sentNative(google[0]!).generationConfig).toEqual({ maxOutputTokens: 16_384, thinkingConfig: { thinkingLevel: "high" } });
  });
  it("the length retry is clamped too, and a retry that cannot ask for more is not sent", async () => {
    const replies = [geminiAnswer("", "MAX_TOKENS").replace('[{"text":""}]', "[]"), geminiAnswer("{}")];
    let index = 0;
    const { google, native } = googleGateway(() => replies[Math.min(index++, replies.length - 1)]!);
    await native.call({ ...CALL, thinkingLevel: "high", bound: { maxAttempts: 3, tokenCeiling: 10_000, deadlineMs: 5_000 },
      classifyContent: () => ({ parseStatus: "PARSED", parseError: null }) });
    expect(google.map(execution => sentNative(execution).generationConfig.maxOutputTokens)).toEqual([10_000, 16_384]);
    const capped = googleGateway(() => geminiAnswer("", "MAX_TOKENS").replace('[{"text":""}]', "[]"));
    await expect(capped.native.call({ ...CALL, thinkingLevel: "high", bound: { maxAttempts: 3, tokenCeiling: 16_384, deadlineMs: 5_000 },
      classifyContent: () => ({ parseStatus: "PARSED", parseError: null }) })).rejects.toThrow();
    expect(capped.google).toHaveLength(1);
  });
  it("refuses a non-positive answer bound at construction", () => {
    for (const maxOutputTokens of [0, -1, 1.5]) {
      expect(() => new GeminiGenerateProviderGateway({ endpoint: GOOGLE_GEMINI_BASE_URL, model: GEMINI, maker: "Google", maxOutputTokens,
        persistRawArtifact: async artifact => artifact.artifactId, appendLedgerEntry: async entry => entry.attemptId,
        assertNoOpenWriteTransaction: () => undefined })).toThrow("PROVIDER_GATEWAY_MAX_OUTPUT_TOKENS_INVALID");
    }
  });
  it("the discovery probe reaches the Google gate with no key and the probe's own bound", async () => {
    const { deepinfra, google, ports } = recordingPorts(() => geminiAnswer("OK"));
    const target = targets(GOOGLE_REFS).at(-1)!;
    const observed = await observeProviderTarget({ target, timeoutMs: 5_000, clock: () => NOW,
      fetchImplementation: createPreviewGuardedFetch(ports, { clock: () => NOW }), ...previewProbeControls(target) });
    expect(observed.state).toBe("HEALTHY");
    expect(sentNative(google[0]!).generationConfig).toEqual({ maxOutputTokens: 8192, thinkingConfig: { thinkingLevel: "high" } });
    expect(google[0]!.requestBody).not.toMatch(/key|authorization/iu);
    expect(deepinfra).toHaveLength(0);
  });
});

describe("the UI build flag knows the Google row", () => {
  it("the UI maker table equals the reviewed rows", () => {
    expect(PREVIEW_MODEL_MAKERS).toEqual(Object.fromEntries(PREVIEW_MODEL_ROWS.map(row => [row.model, row.maker])));
  });
  it("accepts gemini-3.8-flash with maker Google, and keeps the two-maker rule", () => {
    expect(parsePreviewRosterFlag(JSON.stringify({ free: [GLM, GEMINI], premium: [GLM, DEEPSEEK, GEMINI] })))
      .toEqual({ free: [GLM, GEMINI], premium: [GLM, DEEPSEEK, GEMINI] });
    expect(parsePreviewRosterFlag(JSON.stringify({ free: [GEMINI], premium: [GLM, GEMINI] }))).toBeUndefined();
    expect(parsePreviewRosterFlag(JSON.stringify([GEMINI]))).toBeUndefined();
    expect(previewAskProxyCeiling({ method: "POST", path: ["v1", "asks"], origin: "https://v3-preview.dezbatere.ro" },
      JSON.stringify({ free: [GLM, GEMINI], premium: [GLM, DEEPSEEK, GEMINI] }))).toBeGreaterThan(0);
  });
});
