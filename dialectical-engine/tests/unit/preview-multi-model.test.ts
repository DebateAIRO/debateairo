/**
 * Preview multi-model (contract A, 2026-10-10): the reviewed DeepInfra rows, the two config forms,
 * the per-row target check, the per-row guarded fetch and reservation, the gateway's output clamp,
 * the per-row thinking policy and probe controls, and the hosted root-broker rule.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  OpenAICompatibleProviderGateway, PREVIEW_MODEL_ROWS_BY_PROVIDER, PREVIEW_REVIEWED_PROVIDER_REFS, assertPreviewProviderTargets,
  createPreviewGuardedFetch, observeProviderTarget, parsePreviewProviderTestConfig, parseProviderDiscoveryTargets,
  previewModelRow, previewNanoUsdText, previewPlanTierRosters, previewProbeControls, previewReservationNanoUsd,
  previewTargetJsonRow, providerTargetGatewayControls, withPreviewProviderCallPolicy, previewTargetGatewayControls,
  assertPreviewRoleTargets, PREVIEW_REQUEST_BODY_MAX_BYTES, previewSealedRoleFallbackCovered, PREVIEW_PROVIDER_REF_MODELS,
  type PreviewBudgetExecution, type ProviderCallRequest, type ProviderDiscoveryTarget
} from "@debateai/providers";
import { PLAN_TIER_ROSTERS } from "@debateai/contract";
import { gateHostedRoster } from "../../apps/runner/src/hosted-provider-set.js";
import { framedFixturePacket } from "../support/framed-packet.js";

const GLM = "zai-org/GLM-5.3-Flash";
const DEEPSEEK = "deepseek-ai/DeepSeek-V4.1-Flash";
const MIMO = "XiaomiMiMo/MiMo-V2.6-Pro";
const QWEN = "Qwen/Qwen3.8-Flash";
/** The window every other row declares; Qwen declares its own. */
const SHARED_WINDOW = { context_window_tokens: 1_048_576 };
/** A request body with no effort switch and no JSON switch. */
const BARE_BODY = ["max" + "_tokens", "messages", "model"];
/** Qwen's reviewed sampling (2026-10-12): Qwen's own thinking-mode settings, so its JSON does not slide into noise. */
const QWEN_SAMPLING = { temperature: 0.6, top_p: 0.95, top_k: 20 };
/**
 * MiMo's reviewed sampling (owner approval 2026-10-12): DeepInfra's MiMo page recommends temperature 1.0 and top_p 0.95.
 * JSON mode was tried the same day and withdrawn: when MiMo closed a Romanian quote („…) with a straight double quote,
 * DeepInfra's JSON constraint ended the string there and forced the rest into garbage, which the engine's reader
 * (INNER_QUOTE) repairs without any call when JSON mode is off. MiMo's row allows no JSON mode.
 */
const MIMO_SAMPLING = { temperature: 1.0, top_p: 0.95 };
const DEFAULT_LEVEL = "DEFAULT_ONLY";
const URL_COMPLETIONS = "https://api.deepinfra.com/v1/openai/chat/completions";
const BASE = { deployment: "v3-preview", requested_thinking_level: "high",
  budget_socket: "/run/debateai-v3-preview/provider-budget.sock", scope_id: "preview-fixture" };
const LEGACY = { ...BASE, free_model_ids: [GLM] };
const MULTI = { ...BASE, free_model_ids: [GLM, DEEPSEEK], premium_model_ids: [GLM, DEEPSEEK, MIMO, QWEN] };
const parse = (value: unknown) => parsePreviewProviderTestConfig(JSON.stringify(value));
const messages = [{ role: "user", content: "synthetic" }];

type FixtureRow = { model: string; maker: string; input_usd_per_m: string; output_usd_per_m: string; output_bound: number;
  effort: "high" | null; json_object: boolean; sampling: Record<string, number> | null; worst_case_reservation_usd: string;
  input_nano_usd_per_token: number; output_nano_usd_per_token: number };
/** The gate's parity file (schema preview-model-rows-v1): the Python gate asserts the same rows. */
const fixtureFile = JSON.parse(readFileSync(new URL("./fixtures/preview-model-rows.json", import.meta.url), "utf8")) as {
  schema: string; provider: string; reservation: { overhead_bytes: number; worst_case_request_bytes: number; per_call_cap_usd: string };
  rows: FixtureRow[] };
const fixtureRows = fixtureFile.rows;
/** PR B: this file's parity checks are DeepInfra's rows; Anthropic's have their own file and test. */
const PREVIEW_MODEL_ROWS = PREVIEW_MODEL_ROWS_BY_PROVIDER.deepinfra;
/** The register's configured provider for a reviewed ref (its row's maker and adapter kind). */
const configured = (providerRef: string) => { const row = previewModelRow(previewTargetJsonRow(providerRef).model)!;
  return { providerRef, maker: row.maker, adapterKind: row.adapterKind }; };

function targets(refs: readonly string[]): readonly ProviderDiscoveryTarget[] {
  return parseProviderDiscoveryTargets(JSON.stringify(refs.map(previewTargetJsonRow)),
    refs.map(configured));
}
function recordingFetch() {
  const executions: PreviewBudgetExecution[] = [];
  const fetcher = createPreviewGuardedFetch({ execute: async input => { executions.push(input); return { status: 200, body: "{}" }; } });
  return { executions, fetcher, post: (body: unknown) => fetcher(URL_COMPLETIONS, { method: "POST", body: JSON.stringify(body) }) };
}

describe("the reviewed rows equal the shared parity file (contract A §1, §3)", () => {
  it("has exactly the four rows, in order, field for field", () => {
    expect(PREVIEW_MODEL_ROWS.map(row => ({ model: row.model, maker: row.maker, input_usd_per_m: row.inputUsdPerM,
      output_usd_per_m: row.outputUsdPerM, output_bound: row.outputBound, effort: row.effort, json_object: row.jsonObject,
      sampling: row.sampling ?? null })))
      .toEqual(fixtureRows.map(({ worst_case_reservation_usd: _worst, input_nano_usd_per_token: _in, output_nano_usd_per_token: _out, ...row }) => row));
    expect(fixtureFile.schema).toBe("preview-model-rows-v1");
    expect(fixtureFile.provider).toBe("deepinfra");
    expect(fixtureFile.reservation).toEqual({ formula: expect.any(String), overhead_bytes: 2048, worst_case_request_bytes: 256 * 1024, per_call_cap_usd: "0.25" });
  });
  it("prices are whole nano-USD per token (USD per million x 1000)", () => {
    expect(PREVIEW_MODEL_ROWS.map(row => [row.inputNanoUsdPerToken, row.outputNanoUsdPerToken]))
      .toEqual([[150n, 500n], [200n, 600n], [430n, 870n], [113n, 382n]]);
    expect(PREVIEW_MODEL_ROWS.map(row => [row.inputNanoUsdPerToken, row.outputNanoUsdPerToken]))
      .toEqual(fixtureRows.map(row => [BigInt(row.input_nano_usd_per_token), BigInt(row.output_nano_usd_per_token)]));
    expect(PREVIEW_MODEL_ROWS.map(row => [row.inputPriceMicrosPerMillion, row.outputPriceMicrosPerMillion]))
      .toEqual([[150_000, 500_000], [200_000, 600_000], [430_000, 870_000], [113_000, 382_000]]);
  });
  it("the worst-case reservation (256 KiB body) equals the file and stays under the $0.25 per-call cap", () => {
    for (const fixture of fixtureRows) {
      const reserved = previewReservationNanoUsd(previewModelRow(fixture.model)!, 256 * 1024);
      expect(previewNanoUsdText(reserved)).toBe(fixture.worst_case_reservation_usd);
      expect(reserved < 250_000_000n).toBe(true);
    }
    expect(fixtureRows.map(row => row.worst_case_reservation_usd)).toEqual(["0.056012800", "0.072499200", "0.142110720", "0.042371072"]);
  });
  it("owner ruling 2026-10-10: every row's answer cap is 32,768 tokens and every request body is capped at 256 KiB", () => {

    expect(PREVIEW_REQUEST_BODY_MAX_BYTES).toBe(262_144);
    for (const row of PREVIEW_MODEL_ROWS) {
      expect(row.outputBound).toBe(32_768);
      // What the gateway asks for is clamped to the cap, and a health check asks for 8,192.
      expect(previewTargetGatewayControls(parse(MULTI), row)).toEqual({ maxOutputTokens: 32_768 });
      expect(previewProbeControls(row).tokenCeiling).toBe(8192);
    }
    expect(fixtureRows.map(row => row.output_bound)).toEqual([32_768, 32_768, 32_768, 32_768]);
  });
});

describe("configuration accepts both forms (contract A §6)", () => {
  it("the legacy five-key form means free = premium = [GLM]", () => {
    const config = parse(LEGACY)!;
    expect(config.free_model_ids).toEqual([GLM]);
    expect(config.premium_model_ids).toEqual([GLM]);
    expect(previewPlanTierRosters(config, PLAN_TIER_ROSTERS)).toEqual({ free: [GLM], premium: [GLM] });
  });
  it("the six-key form returns the configured rosters, and re-validates after a round trip", () => {
    const config = parse(MULTI)!;
    expect(previewPlanTierRosters(config, PLAN_TIER_ROSTERS)).toEqual({ free: [GLM, DEEPSEEK], premium: [GLM, DEEPSEEK, MIMO, QWEN] });
    expect(parse(config)).toEqual(config);
    expect(Object.isFrozen(config.premium_model_ids)).toBe(true);
    expect(parse({ ...BASE, free_model_ids: [GLM], premium_model_ids: [GLM] })).toMatchObject({ premium_model_ids: [GLM] });
  });
  it("accepts Qwen in either roster, under the two-maker rule", () => {
    expect(parse({ ...BASE, free_model_ids: [GLM, QWEN], premium_model_ids: [GLM, DEEPSEEK, MIMO, QWEN] }))
      .toMatchObject({ free_model_ids: [GLM, QWEN], premium_model_ids: [GLM, DEEPSEEK, MIMO, QWEN] });
    expect(parse({ ...BASE, free_model_ids: [DEEPSEEK, QWEN], premium_model_ids: [QWEN, GLM] }))
      .toMatchObject({ free_model_ids: [DEEPSEEK, QWEN], premium_model_ids: [QWEN, GLM] });
    expect(parse({ ...BASE, free_model_ids: [QWEN], premium_model_ids: [QWEN] })).toMatchObject({ premium_model_ids: [QWEN] });
  });
  it.each([
    ["a one-maker Free roster while two makers exist", { ...MULTI, free_model_ids: [GLM] }],
    ["a one-maker Premium roster while two makers exist", { ...MULTI, premium_model_ids: [MIMO] }],
    ["an unreviewed id", { ...MULTI, free_model_ids: [GLM, "other/model"] }],
    ["a duplicate id", { ...MULTI, free_model_ids: [GLM, GLM, DEEPSEEK] }],
    ["an empty roster", { ...MULTI, premium_model_ids: [] }],
    ["a missing premium list with a non-GLM free list", { ...BASE, free_model_ids: [GLM, DEEPSEEK] }],
    ["a legacy form with another model", { ...BASE, free_model_ids: [DEEPSEEK] }],
    ["an extra key", { ...MULTI, other_budget_socket: "/run/debateai-v3-preview/a.sock" }],
    ["a non-array roster", { ...MULTI, premium_model_ids: GLM }],
    ["a one-maker Premium roster of Qwen alone", { ...MULTI, premium_model_ids: [QWEN] }],
    ["Qwen twice", { ...MULTI, premium_model_ids: [GLM, QWEN, QWEN] }]
  ])("refuses %s", (_name, value) => {
    expect(() => parse(value)).toThrow("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
  });
});

describe("each declared target is checked against its reviewed row", () => {
  const legacyRefs = ["preview:fixture-a", "preview:fixture-b"];
  it("accepts the sealed two-GLM pair with the legacy form, and the reviewed set with either form", () => {
    expect(() => assertPreviewProviderTargets(parse(LEGACY), targets(legacyRefs))).not.toThrow();
    expect(() => assertPreviewProviderTargets(parse(MULTI), targets(PREVIEW_REVIEWED_PROVIDER_REFS))).not.toThrow();
    expect(() => assertPreviewProviderTargets(parse(LEGACY), targets(PREVIEW_REVIEWED_PROVIDER_REFS))).not.toThrow();
    expect(() => assertPreviewProviderTargets(undefined, [])).not.toThrow();
  });
  it("refuses rosters naming a model no declared target serves", () => {
    expect(() => assertPreviewProviderTargets(parse(MULTI), targets(legacyRefs))).toThrow("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
  });
  it("refuses any other ref set or order", () => {
    expect(() => assertPreviewProviderTargets(parse(LEGACY), targets(["preview:fixture-a"]))).toThrow();
    expect(() => assertPreviewProviderTargets(parse(MULTI), targets([...PREVIEW_REVIEWED_PROVIDER_REFS].reverse()))).toThrow();
  });
  const mutate = (index: number, change: Record<string, unknown>) => {
    const rows = PREVIEW_REVIEWED_PROVIDER_REFS.map(ref => ({ ...previewTargetJsonRow(ref) } as Record<string, unknown>));
    Object.assign(rows[index]!, change);
    for (const [key, value] of Object.entries(change)) if (value === undefined) delete rows[index]![key];
    return parseProviderDiscoveryTargets(JSON.stringify(rows), PREVIEW_REVIEWED_PROVIDER_REFS.map(configured));
  };
  it.each([
    ["DeepSeek at GLM's price", 2, { input_price_micros_per_million: 150_000 }],
    ["MiMo with a thinking switch", 3, { thinking_parameter: "reasoning_effort", thinking_levels: ["high"] }],
    ["DeepSeek without its thinking switch", 2, { thinking_parameter: undefined, thinking_levels: undefined }],
    ["DeepSeek on the GLM ref's model", 2, { model: GLM }],
    ["a credential header", 1, { authorization_header: "Bearer synthetic" }],
    ["another window", 3, { context_window_tokens: 131_072 }],
    ["another base URL", 2, { base_url: "https://api.deepinfra.com/v1" }],
    ["Qwen with a thinking switch", 4, { thinking_parameter: "reasoning_effort", thinking_levels: ["high"] }],
    ["Qwen at the shared window instead of its own", 4, SHARED_WINDOW],
    ["Qwen at its cached-input price", 4, { input_price_micros_per_million: 14_000 }]
  ])("refuses %s", (_name, index, change) => {
    expect(() => assertPreviewProviderTargets(parse(MULTI), mutate(index, change))).toThrow();
  });
  it("refuses a reviewed ref declared under another maker", () => {
    const declared = parseProviderDiscoveryTargets(JSON.stringify(PREVIEW_REVIEWED_PROVIDER_REFS.map(previewTargetJsonRow)),
      PREVIEW_REVIEWED_PROVIDER_REFS.map(providerRef => ({ ...configured(providerRef), maker: "Z.AI" })));
    expect(() => assertPreviewProviderTargets(parse(MULTI), declared)).toThrow();
  });
});

describe("the guarded fetch sends only what the gate accepts for the body's row (contract A §2, §3)", () => {
  it("refuses an unlisted model, a bound above the row, an effort on MiMo, JSON on DeepSeek, before any reservation", async () => {
    const { executions, post } = recordingFetch();
    for (const body of [
      { model: "other/model", reasoning_effort: "high", max_tokens: 8, messages },
      { model: DEEPSEEK, reasoning_effort: "high", max_tokens: 131_073, messages },
      { model: GLM, reasoning_effort: "high", max_tokens: 163_841, messages },
      { model: MIMO, reasoning_effort: "high", max_tokens: 8, messages },
      { model: DEEPSEEK, reasoning_effort: "high", max_tokens: 8, messages, response_format: { type: "json_object" } },
      { model: MIMO, max_tokens: 8, messages, response_format: { type: "json_object" } },
      { model: MIMO, max_tokens: 8, ...MIMO_SAMPLING, messages, response_format: { type: "json_schema" } },
      { model: MIMO, max_tokens: 8, ...MIMO_SAMPLING, messages, response_format: { type: "json_object" } },
      { model: DEEPSEEK, max_tokens: 8, messages },
      { model: DEEPSEEK, reasoning_effort: "medium", max_tokens: 8, messages },
      { model: MIMO, max_tokens: 0, messages },
      { model: MIMO, max_tokens: 8, messages, stream: false }
    ]) await expect(post(body)).rejects.toThrow("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
    const oversize = { model: MIMO, max_tokens: 8, messages: [{ role: "user", content: "x".repeat(256 * 1024) }] };
    await expect(post(oversize)).rejects.toThrow();
    expect(executions).toHaveLength(0);
  });
  it("reserves each row at its own price and bound, with the exact body bytes", async () => {
    const { executions, post } = recordingFetch();
    const bodies = [
      { model: GLM, reasoning_effort: "high", max_tokens: 32_768, messages, response_format: { type: "json_object" } },
      { model: DEEPSEEK, reasoning_effort: "high", max_tokens: 32_768, messages },
      { model: MIMO, max_tokens: 32_768, ...MIMO_SAMPLING, messages }
    ];
    for (const body of bodies) await post(body);
    expect(executions).toHaveLength(3);
    const prices: Array<[bigint, bigint, bigint]> = [[150n, 500n, 32_768n], [200n, 600n, 32_768n], [430n, 870n, 32_768n]];
    // One token above the cap is refused before any reservation, on every row.
    for (const body of bodies) await expect(post({ ...body, max_tokens: 32_769 })).rejects.toThrow("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
    executions.forEach((execution, index) => {
      const text = JSON.stringify(bodies[index]);
      expect(execution.requestBody).toBe(text);
      const [input, output, bound] = prices[index]!;
      const nano = BigInt(Buffer.byteLength(text) + 2048) * input + bound * output;
      expect(execution.reservedUsd).toBe(`${nano / 1_000_000_000n}.${(nano % 1_000_000_000n).toString().padStart(9, "0")}`);
    });
  });
});

const RESULT_REQUEST: ProviderCallRequest = {
  runId: null, subjectItemId: "synthetic:node", callSiteKey: "fixture:judge", role: "JUDGE", lane: "served",
  bound: { maxAttempts: 1, tokenCeiling: 200_000, deadlineMs: 5_000 }, contractHash: "contract:synthetic",
  providerRef: "preview:deepseek-v4-1-flash", packet: framedFixturePacket("Synthetic school policy; no personal data.")
};
function previewGateway(model: string) {
  const ref = PREVIEW_REVIEWED_PROVIDER_REFS.find(candidate => previewTargetJsonRow(candidate).model === model)!;
  const target = targets(PREVIEW_REVIEWED_PROVIDER_REFS).find(candidate => candidate.providerRef === ref)!;
  const executions: PreviewBudgetExecution[] = [];
  const fetchImplementation = createPreviewGuardedFetch({ execute: async input => {
    executions.push(input);
    return { status: 200, body: JSON.stringify({ id: "synthetic", model, choices: [{ message: { content: "{}" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 20 } }) };
  } });
  const native = new OpenAICompatibleProviderGateway({ endpoint: target.baseUrl, model: target.model, maker: target.maker,
    ...providerTargetGatewayControls(target), ...previewTargetGatewayControls(parse(MULTI), target), fetchImplementation,
    persistRawArtifact: async artifact => artifact.artifactId, appendLedgerEntry: async entry => entry.attemptId,
    assertNoOpenWriteTransaction: () => undefined, sleepImplementation: async () => undefined });
  return { executions, target, gateway: withPreviewProviderCallPolicy(native, parse(MULTI)!, target) };
}

describe("each target's gateway sends a request its row accepts", () => {
  it("clamps max_tokens to the row bound and sends high on DeepSeek", async () => {
    const { executions, gateway } = previewGateway(DEEPSEEK);
    await gateway.call({ ...RESULT_REQUEST, bound: { maxAttempts: 1, tokenCeiling: 200_000, deadlineMs: 5_000 } });
    const sent = JSON.parse(executions[0]!.requestBody);
    expect(sent).toMatchObject({ model: DEEPSEEK, max_tokens: 32_768, reasoning_effort: "high" });
    expect(sent).not.toHaveProperty("response_format");
  });
  it("never sends a thinking level to MiMo, and refuses a request that asks for one before sending", async () => {
    const { executions, gateway } = previewGateway(MIMO);
    await gateway.call(RESULT_REQUEST);
    expect(Object.keys(JSON.parse(executions[0]!.requestBody)).sort()).toEqual(["max_tokens", "messages", "model", "temperature", "top_p"]);
    await expect((async () => gateway.call({ ...RESULT_REQUEST, thinkingLevel: "high" }))()).rejects.toMatchObject({ code: "PROVIDER_THINKING_LEVEL_UNSUPPORTED" });
    expect(executions).toHaveLength(1);
  });
  it("a story JSON request reaches the vendor as JSON only on GLM", async () => {
    for (const model of [GLM, DEEPSEEK, MIMO, QWEN]) {
      const { executions, gateway } = previewGateway(model);
      await gateway.call({ ...RESULT_REQUEST, lane: "story", callSiteKey: "STORY:STORYTELLER:1", role: "SYNTHESIZER", preferredResponseFormat: "json_object" });
      expect(Object.hasOwn(JSON.parse(executions[0]!.requestBody), "response_format")).toBe(model === GLM);
    }
  });
  it("MiMo takes DEFAULT_ONLY as no level; an effort row still refuses it", async () => {
    const mimo = previewGateway(MIMO);
    await mimo.gateway.call({ ...RESULT_REQUEST, thinkingLevel: "DEFAULT_ONLY" });
    expect(JSON.parse(mimo.executions[0]!.requestBody)).not.toHaveProperty("reasoning_effort");
    const deepseek = previewGateway(DEEPSEEK);
    await expect((async () => deepseek.gateway.call({ ...RESULT_REQUEST, thinkingLevel: "DEFAULT_ONLY" }))())
      .rejects.toMatchObject({ code: "PROVIDER_THINKING_LEVEL_UNSUPPORTED" });
  });
  it("the row output cap applies on the preview only", () => {
    const target = { model: DEEPSEEK };
    expect(previewTargetGatewayControls(parse(MULTI), target)).toEqual({ maxOutputTokens: 32_768 });
    expect(previewTargetGatewayControls(parse(LEGACY), { model: GLM })).toEqual({ maxOutputTokens: 32_768 });
    expect(previewTargetGatewayControls(undefined, target)).toEqual({});
    expect(providerTargetGatewayControls({ ...targets(PREVIEW_REVIEWED_PROVIDER_REFS)[2]! })).toEqual({ thinking: { parameter: "reasoning_effort", levels: ["high"] }, contextWindowTokens: 1_048_576 });
    expect(() => previewTargetGatewayControls(parse(MULTI), { model: "other/model" })).toThrow();
  });
  it("the policy refuses a target off the reviewed rows", () => {
    expect(() => withPreviewProviderCallPolicy({ call: async () => { throw new Error("unreachable"); } }, parse(MULTI)!, { model: "other/model" })).toThrow();
  });
});

describe("discovery probes use each row's own controls", () => {
  it("high and the generation floor where the row has effort, no level for MiMo", () => {
    expect(previewProbeControls({ model: GLM })).toEqual({ thinkingLevel: "high", tokenCeiling: 8192 });
    expect(previewProbeControls({ model: DEEPSEEK })).toEqual({ thinkingLevel: "high", tokenCeiling: 8192 });
    expect(previewProbeControls({ model: MIMO })).toEqual({ tokenCeiling: 8192 });
    expect(() => previewProbeControls({ model: "other/model" })).toThrow();
  });
  it("a MiMo probe passes the guarded fetch without a thinking level; a ceiling above its bound is refused before fetch", async () => {
    const target = targets(PREVIEW_REVIEWED_PROVIDER_REFS)[3]!;
    const bodies: string[] = [];
    const fetcher = createPreviewGuardedFetch({ execute: async input => { bodies.push(input.requestBody);
      return { status: 200, body: JSON.stringify({ model: MIMO, choices: [{ message: { content: "OK" } }] }) }; } });
    const healthy = await observeProviderTarget({ target, timeoutMs: 5_000, clock: () => new Date(), fetchImplementation: fetcher, ...previewProbeControls(target) });
    expect(healthy.state).toBe("HEALTHY");
    expect(JSON.parse(bodies[0]!)).not.toHaveProperty("reasoning_effort");
    const refused = await observeProviderTarget({ target, timeoutMs: 5_000, clock: () => new Date(), fetchImplementation: fetcher, tokenCeiling: 131_073 });
    expect(refused.state).toBe("ABSENT");
    expect(bodies).toHaveLength(1);
  });
});

describe("the hosted root-broker rule accepts any reviewed row, exactly", () => {
  const broker = (ref: string, change: Record<string, unknown> = {}) => JSON.stringify({ providers: [{
    ...previewTargetJsonRow(ref), adapter_kind: previewModelRow(previewTargetJsonRow(ref).model)!.adapterKind, maker: previewModelRow(previewTargetJsonRow(ref).model)!.maker,
    vetting: {}, preview_budget_authority: true, ...change }] });
  it.each(PREVIEW_REVIEWED_PROVIDER_REFS)("accepts %s", ref => { expect(() => gateHostedRoster(broker(ref))).not.toThrow(); });
  it.each([
    ["MiMo with a thinking switch", "preview:mimo-v2-6-pro", { thinking_parameter: "reasoning_effort", thinking_levels: ["high"] }],
    ["DeepSeek at GLM's price", "preview:deepseek-v4-1-flash", { output_price_micros_per_million: 500_000 }],
    ["DeepSeek under GLM's maker", "preview:deepseek-v4-1-flash", { maker: "Z.AI" }],
    ["an unreviewed ref", "preview:fixture-a", { provider_ref: "preview:other" }],
    ["a credential file", "preview:mimo-v2-6-pro", { api_authorization_file: "/root/fixture/api.header" }]
  ])("refuses %s", (_name, ref, change) => { expect(() => gateHostedRoster(broker(ref, change))).toThrow(); });
});

describe("every register role is a declared target on the preview (boot check)", () => {
  const declared = targets(PREVIEW_REVIEWED_PROVIDER_REFS);
  it("accepts roles among the declared refs and ignores everything off the preview", () => {
    expect(() => assertPreviewRoleTargets(parse(MULTI), declared, ["preview:fixture-a", "preview:fixture-b", "preview:fixture-a", "preview:fixture-b"])).not.toThrow();
    expect(() => assertPreviewRoleTargets(parse(MULTI), declared, ["preview:fixture-a", "preview:deepseek-v4-1-flash"])).not.toThrow();
    expect(() => assertPreviewRoleTargets(undefined, [], ["anything"])).not.toThrow();
  });
  it("refuses a role on an undeclared ref, or no roles at all", () => {
    expect(() => assertPreviewRoleTargets(parse(LEGACY), targets(["preview:fixture-a", "preview:fixture-b"]), ["preview:fixture-a", "preview:deepseek-v4-1-flash"]))
      .toThrow("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
    expect(() => assertPreviewRoleTargets(parse(MULTI), declared, [])).toThrow("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
  });
});

describe("role rotation, Task 11/12: a sealed answer role may stand in for an unavailable pinned member only when it is a panel ref", () => {
  // A rotated debate's estimate prices only its panel's members, each on its own gate, admission found every one of
  // them switched on there, and their routes were health-checked at claim (spec 2026-10-11 Part 5). Task 12: a stand-in
  // must be one of those panel REFS, not merely a panel model, so it never needs an off-panel health check the
  // estimate did not count.
  const member = (provider_ref: string) => ({ provider_ref, model_id: PREVIEW_PROVIDER_REF_MODELS[provider_ref]! });
  const panel = (...refs: string[]) => refs.map(member);
  it("covers a sealed ref that is itself one of the panel's refs", () => {
    expect(previewSealedRoleFallbackCovered("preview:fixture-a", panel("preview:fixture-a", "preview:deepseek-v4-1-flash"))).toBe(true);
    expect(previewSealedRoleFallbackCovered("preview:fixture-b", panel("preview:deepseek-v4-1-flash", "preview:fixture-b"))).toBe(true);
    expect(previewSealedRoleFallbackCovered("preview:deepseek-v4-1-flash",
      panel("preview:fixture-a", "preview:deepseek-v4-1-flash", "preview:mimo-v2-6-pro", "preview:qwen-3-8-flash"))).toBe(true);
  });
  it("does not cover a sealed ref whose model is on the panel through another ref (fixture-b is GLM, the panel has fixture-a)", () => {
    expect(previewSealedRoleFallbackCovered("preview:fixture-b", panel("preview:fixture-a", "preview:deepseek-v4-1-flash"))).toBe(false);
    expect(previewSealedRoleFallbackCovered("preview:fixture-a", panel("preview:deepseek-v4-1-flash", "preview:fixture-b"))).toBe(false);
  });
  it("does not cover a model off the panel (never priced or found switched on), even on a gate the panel uses", () => {
    expect(previewSealedRoleFallbackCovered("preview:fixture-a", panel("preview:deepseek-v4-1-flash", "preview:mimo-v2-6-pro"))).toBe(false);
    expect(previewSealedRoleFallbackCovered("preview:claude-haiku-5-5", panel("preview:fixture-a", "preview:deepseek-v4-1-flash"))).toBe(false);
  });
  it("does not cover a ref the preview never reviewed, even when the panel names it", () => {
    expect(previewSealedRoleFallbackCovered("provider:unreviewed",
      [{ provider_ref: "provider:unreviewed", model_id: GLM }, member("preview:deepseek-v4-1-flash")])).toBe(false);
  });
  it("does not cover a panel ref whose recorded model is not the ref's reviewed model", () => {
    expect(previewSealedRoleFallbackCovered("preview:fixture-a",
      [{ provider_ref: "preview:fixture-a", model_id: DEEPSEEK }, member("preview:mimo-v2-6-pro")])).toBe(false);
  });
});

describe("Qwen3.8-Flash (owner swap 2026-10-10): no effort, no JSON, bound 32768, its own window", () => {
  const body = (change: Record<string, unknown> = {}) => ({ model: QWEN, max_tokens: 32_768, ...QWEN_SAMPLING, messages, ...change });
  it("its reviewed row, ref and target row", () => {
    expect(previewModelRow(QWEN)).toMatchObject({ maker: "Alibaba", inputUsdPerM: "0.113", outputUsdPerM: "0.382",
      inputNanoUsdPerToken: 113n, outputNanoUsdPerToken: 382n, outputBound: 32_768, effort: null, jsonObject: false, contextWindowTokens: 1_000_000,
      sampling: QWEN_SAMPLING });
    expect(PREVIEW_REVIEWED_PROVIDER_REFS).toEqual(["preview:fixture-a", "preview:fixture-b", "preview:deepseek-v4-1-flash", "preview:mimo-v2-6-pro", "preview:qwen-3-8-flash",
      "preview:claude-haiku-5-5"]); // PR B: Anthropic's ref after DeepInfra's.
    expect(previewTargetJsonRow("preview:qwen-3-8-flash")).toEqual({ provider_ref: "preview:qwen-3-8-flash",
      base_url: "https://api.deepinfra.com/v1/openai", model: QWEN, input_price_micros_per_million: 113_000,
      output_price_micros_per_million: 382_000, context_window_tokens: 1_000_000 });
    expect(providerTargetGatewayControls(targets(PREVIEW_REVIEWED_PROVIDER_REFS)[4]!)).toEqual({ contextWindowTokens: 1_000_000 });
  });
  it("the guarded fetch refuses reasoning_effort, response_format and a bound above 32768, before any reservation", async () => {
    const { executions, post } = recordingFetch();
    for (const refused of [
      body({ reasoning_effort: "high" }),
      body({ response_format: { type: "json_object" } }),
      body({ reasoning_effort: "high", response_format: { type: "json_object" } }),
      body({ max_tokens: 32_769 }),
      body({ max_tokens: 0 })
    ]) await expect(post(refused)).rejects.toThrow("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
    expect(executions).toHaveLength(0);
  });
  it("reserves exactly 0.042371072 for a 256 KiB body: every prompt byte at the full input price", async () => {
    const { executions, post } = recordingFetch();
    const empty = JSON.stringify(body({ messages: [{ role: "user", content: "" }] }));
    const full = body({ messages: [{ role: "user", content: "x".repeat(256 * 1024 - Buffer.byteLength(empty)) }] });
    expect(Buffer.byteLength(JSON.stringify(full))).toBe(256 * 1024);
    await post(full);
    expect(executions.map(execution => execution.reservedUsd)).toEqual(["0.042371072"]);
    expect(previewNanoUsdText(previewReservationNanoUsd(previewModelRow(QWEN)!, 256 * 1024))).toBe("0.042371072");
    // One byte more (the hard 256 KiB cap, owner ruling 2026-10-10) is refused before any reservation.
    const over = body({ messages: [{ role: "user", content: "x".repeat(256 * 1024 - Buffer.byteLength(empty) + 1) }] });
    await expect(post(over)).rejects.toThrow("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
    expect(executions).toHaveLength(1);
  });
  it("the gateway clamps every attempt's answer size to 32768, length retries included, and never sends a level or JSON (only its sampling)", async () => {
    const target = targets(PREVIEW_REVIEWED_PROVIDER_REFS)[4]!;
    const executions: PreviewBudgetExecution[] = [];
    const replies = ["length", "length", "stop"];
    const fetchImplementation = createPreviewGuardedFetch({ execute: async input => {
      executions.push(input);
      const finish = replies[executions.length - 1]!;
      return { status: 200, body: JSON.stringify({ id: "synthetic", model: QWEN,
        choices: [{ message: { content: finish === "stop" ? "{}" : "{\"cut" }, finish_reason: finish }],
        usage: { prompt_tokens: 10, completion_tokens: 20 } }) };
    } });
    const native = new OpenAICompatibleProviderGateway({ endpoint: target.baseUrl, model: target.model, maker: target.maker,
      ...providerTargetGatewayControls(target), ...previewTargetGatewayControls(parse(MULTI), target), fetchImplementation,
      persistRawArtifact: async artifact => artifact.artifactId, appendLedgerEntry: async entry => entry.attemptId,
      assertNoOpenWriteTransaction: () => undefined, sleepImplementation: async () => undefined });
    const classifyContent = (content: string) => {
      try { JSON.parse(content); return { parseStatus: "PARSED", parseError: null }; }
      catch { return { parseStatus: "PARSE_FAILED", parseError: "not JSON" }; }
    };
    await native.call({ ...RESULT_REQUEST, providerRef: "preview:qwen-3-8-flash", preferredResponseFormat: "json_object",
      bound: { maxAttempts: 3, tokenCeiling: 24_000, deadlineMs: 5_000 }, classifyContent: classifyContent as never });
    const sent = executions.map(execution => JSON.parse(execution.requestBody));
    expect(sent.map(request => request.max_tokens)).toEqual([24_000, 32_768, 32_768]);
    for (const request of sent) {
      expect(Object.keys(request).sort()).toEqual([...BARE_BODY, ...Object.keys(QWEN_SAMPLING)].sort());
      expect(request).toMatchObject(QWEN_SAMPLING);
    }
  });
  it("the preview policy never sends a level to Qwen and takes DEFAULT_ONLY as none", async () => {
    const { executions, gateway } = previewGateway(QWEN);
    const bound = { maxAttempts: 1, tokenCeiling: 200_000, deadlineMs: 5_000 };
    await gateway.call({ ...RESULT_REQUEST, thinkingLevel: DEFAULT_LEVEL, bound });
    expect(JSON.parse(executions[0]!.requestBody)).toEqual({ model: QWEN, max_tokens: 32_768, ...QWEN_SAMPLING, messages: expect.any(Array) });
    await expect((async () => gateway.call({ ...RESULT_REQUEST, thinkingLevel: "high" }))()).rejects.toMatchObject({ code: "PROVIDER_THINKING_LEVEL_UNSUPPORTED" });
    expect(executions).toHaveLength(1);
    expect(previewProbeControls({ model: QWEN })).toEqual({ tokenCeiling: 8192 });
  });
  it("the hosted root-broker rule refuses Qwen off its exact row", () => {
    const broker = (change: Record<string, unknown>) => JSON.stringify({ providers: [{ ...previewTargetJsonRow("preview:qwen-3-8-flash"),
      adapter_kind: "openai-compatible-http", maker: "Alibaba", vetting: {}, preview_budget_authority: true, ...change }] });
    expect(() => gateHostedRoster(broker({}))).not.toThrow();
    for (const change of [{ maker: "Qwen" }, { context_window_tokens: 1_048_576 }, { input_price_micros_per_million: 14_000 },
      { thinking_parameter: "reasoning_effort", thinking_levels: ["high"] }, { model: "Qwen/Qwen3.8" }])
      expect(() => gateHostedRoster(broker(change))).toThrow();
  });
});

/**
 * Reviewed sampling (2026-10-12). A live practice run saw Qwen3.8-Flash, at DeepInfra's defaults (temperature 1,
 * top_p 1, top_k off), slide mid-answer into random multilingual tokens, so its JSON could not be read. A reviewed
 * row may now carry its own sampling settings; Qwen's are its makers' thinking-mode ones. The body carries exactly
 * those keys with exactly those values, and every other row's body stays byte for byte what it was.
 */
const samplingBodies = JSON.parse(readFileSync(new URL("./fixtures/deepinfra-sampling-bodies.json", import.meta.url), "utf8")) as {
  schema: string; sent: { name: string; body: string; reservedUsd: string }[]; refused: { name: string; body: string }[] };
describe("reviewed sampling: a row's own sampling settings, exactly, and none on any other row", () => {
  it("only MiMo and Qwen carry sampling, and their values are the reviewed ones", () => {
    expect(PREVIEW_MODEL_ROWS_BY_PROVIDER.deepinfra.map(row => [row.model, row.sampling ?? null]))
      .toEqual([[GLM, null], [DEEPSEEK, null], [MIMO, MIMO_SAMPLING], [QWEN, QWEN_SAMPLING]]);
    expect(Object.keys(previewModelRow(MIMO)!.sampling!)).toEqual(["temperature", "top_p"]);
    expect(PREVIEW_MODEL_ROWS_BY_PROVIDER.deepinfra.map(row => [row.model, row.jsonObject]))
      .toEqual([[GLM, true], [DEEPSEEK, false], [MIMO, false], [QWEN, false]]);
    expect(Object.isFrozen(previewModelRow(MIMO)!.sampling)).toBe(true);
    expect(PREVIEW_MODEL_ROWS_BY_PROVIDER.anthropic.every(row => row.sampling === undefined)).toBe(true);
    expect(Object.isFrozen(previewModelRow(QWEN)!.sampling)).toBe(true);
  });
  it("the guarded fetch accepts every body the shared file says is sent, at exactly its reservation, and refuses the rest", async () => {
    expect(samplingBodies.schema).toBe("deepinfra-sampling-bodies-v1");
    expect(samplingBodies.sent.length).toBeGreaterThanOrEqual(5);
    expect(samplingBodies.refused.length).toBeGreaterThanOrEqual(15);
    const { executions, fetcher } = recordingFetch();
    for (const sent of samplingBodies.sent) await fetcher(URL_COMPLETIONS, { method: "POST", body: sent.body });
    expect(executions.map(execution => [execution.requestBody, execution.reservedUsd]))
      .toEqual(samplingBodies.sent.map(sent => [sent.body, sent.reservedUsd]));
    for (const refused of samplingBodies.refused) {
      await expect(fetcher(URL_COMPLETIONS, { method: "POST", body: refused.body }), refused.name)
        .rejects.toThrow("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
    }
    expect(executions).toHaveLength(samplingBodies.sent.length);
  });
  it("Qwen's gateway body is the old body with its three sampling keys after max_tokens, in the shared file's key order", async () => {
    for (const request of [RESULT_REQUEST, { ...RESULT_REQUEST, lane: "story" as const, callSiteKey: "STORY:STORYTELLER:1", role: "SYNTHESIZER" as const,
      preferredResponseFormat: "json_object" as const }]) {
      const { executions, gateway } = previewGateway(QWEN);
      await gateway.call(request);
      const text = executions[0]!.requestBody;
      const sent = JSON.parse(text) as { max_tokens: number; messages: unknown };
      expect(text).toBe(JSON.stringify({ model: QWEN, max_tokens: sent.max_tokens, ...QWEN_SAMPLING, messages: sent.messages }));
      expect(Object.keys(sent)).toEqual(Object.keys(JSON.parse(samplingBodies.sent[0]!.body)));
      expect(executions[0]!.reservedUsd).toBe(previewNanoUsdText(previewReservationNanoUsd(previewModelRow(QWEN)!, Buffer.byteLength(text))));
    }
  });
  it("MiMo's gateway body carries its two sampling keys after max_tokens and never JSON mode, a story JSON request included", async () => {
    const story = { ...RESULT_REQUEST, lane: "story" as const, callSiteKey: "STORY:STORYTELLER:1", role: "SYNTHESIZER" as const,
      preferredResponseFormat: "json_object" as const };
    const mimoSent = samplingBodies.sent.filter(sent => JSON.parse(sent.body).model === MIMO);
    expect(mimoSent.length).toBeGreaterThanOrEqual(2);
    for (const request of [RESULT_REQUEST, story]) {
      const { executions, gateway } = previewGateway(MIMO);
      await gateway.call(request);
      const text = executions[0]!.requestBody;
      const sent = JSON.parse(text) as { max_tokens: number; messages: unknown };
      // The judging (served) call and the story call alike: sampling, and no JSON mode (MiMo's row allows none).
      expect(text).toBe(JSON.stringify({ model: MIMO, max_tokens: sent.max_tokens, ...MIMO_SAMPLING, messages: sent.messages }));
      expect(text).toContain('"temperature":1,"top_p":0.95,"messages":');
      expect(Object.keys(sent)).toEqual(Object.keys(JSON.parse(mimoSent[0]!.body)));
      expect(executions[0]!.reservedUsd).toBe(previewNanoUsdText(previewReservationNanoUsd(previewModelRow(MIMO)!, Buffer.byteLength(text))));
    }
  });
  it("GLM's and DeepSeek's gateway bodies are byte for byte what they were before sampling existed", async () => {
    const story = { ...RESULT_REQUEST, lane: "story" as const, callSiteKey: "STORY:STORYTELLER:1", role: "SYNTHESIZER" as const,
      preferredResponseFormat: "json_object" as const };
    for (const model of [GLM, DEEPSEEK]) {
      for (const request of [RESULT_REQUEST, story]) {
        const { executions, gateway } = previewGateway(model);
        await gateway.call(request);
        const text = executions[0]!.requestBody;
        const sent = JSON.parse(text) as { max_tokens: number; messages: unknown };
        const row = previewModelRow(model)!;
        // The body exactly as the gateway built it before 2026-10-12: model, max_tokens, the effort member, messages,
        // and response_format only for a story JSON request on a JSON row.
        expect(text, model).toBe(JSON.stringify({ model, max_tokens: sent.max_tokens,
          ...(row.effort === null ? {} : { reasoning_effort: row.effort }), messages: sent.messages,
          ...(request === story && row.jsonObject ? { response_format: { type: "json_object" } } : {}) }));
        for (const key of Object.keys(QWEN_SAMPLING)) expect(Object.hasOwn(sent, key)).toBe(false);
      }
    }
  });
  it("the sampling follows the reviewed endpoint and model, as JSON mode does: Qwen anywhere else sends none", async () => {
    const bodies: string[] = [];
    const fetchImplementation = (async (_url: string, init?: RequestInit) => {
      bodies.push(String(init?.body));
      return new Response(JSON.stringify({ id: "synthetic", model: QWEN, choices: [{ message: { content: "{}" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 20 } }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    for (const endpoint of ["https://api.deepinfra.com/v1/openai", "https://other.example/v1/openai"]) {
      const native = new OpenAICompatibleProviderGateway({ endpoint, model: QWEN, maker: "Alibaba", fetchImplementation,
        persistRawArtifact: async artifact => artifact.artifactId, appendLedgerEntry: async entry => entry.attemptId,
        assertNoOpenWriteTransaction: () => undefined, sleepImplementation: async () => undefined });
      await native.call({ ...RESULT_REQUEST, providerRef: "preview:qwen-3-8-flash", bound: { maxAttempts: 1, tokenCeiling: 8192, deadlineMs: 5_000 } });
    }
    expect(JSON.parse(bodies[0]!)).toMatchObject(QWEN_SAMPLING);
    expect(Object.keys(JSON.parse(bodies[1]!)).sort()).toEqual(BARE_BODY);
  });
  it("Qwen's and MiMo's health probes carry their own sampling and pass the guarded fetch", async () => {
    const all = targets(PREVIEW_REVIEWED_PROVIDER_REFS);
    const bodies: string[] = [];
    for (const [target, model] of [[all[4]!, QWEN], [all[3]!, MIMO]] as const) {
      const fetcher = createPreviewGuardedFetch({ execute: async input => { bodies.push(input.requestBody);
        return { status: 200, body: JSON.stringify({ model, choices: [{ message: { content: "OK" } }] }) }; } });
      const observed = await observeProviderTarget({ target, timeoutMs: 5_000, clock: () => new Date(), fetchImplementation: fetcher,
        ...previewProbeControls(target) });
      expect(observed.state, model).toBe("HEALTHY");
    }
    const [qwen, mimo] = bodies.map(text => JSON.parse(text) as { messages: unknown });
    expect(bodies[0]).toBe(JSON.stringify({ model: QWEN, max_tokens: 8192, ...QWEN_SAMPLING, messages: qwen!.messages }));
    expect(bodies[1]).toBe(JSON.stringify({ model: MIMO, max_tokens: 8192, ...MIMO_SAMPLING, messages: mimo!.messages }));
    // The start-of-debate estimate prices a health check as a body of at most 1,024 bytes.
    expect(Buffer.byteLength(bodies[0]!)).toBeLessThanOrEqual(1024);
    expect(Buffer.byteLength(bodies[1]!)).toBeLessThanOrEqual(1024);
  });
});

/**
 * JSON mode on every structured preview step (owner approval 2026-10-12, to fix MiMo's judging slips). On the preview,
 * a served call that carries its own content check (the author legs incl. critic and cross-root, panel and review:
 * JUDGE; the answer writer: SYNTHESIZER; the answer checker: EVALUATOR) asks for one JSON object when the target's row
 * allows JSON mode (GLM only, since MiMo's JSON mode was withdrawn the same day); the story calls keep asking as before.
 * MiMo, DeepSeek, Qwen and Haiku requests are passed on without a JSON preference.
 */
describe("JSON mode on every structured preview step, where the row allows it", () => {
  const HAIKU = "claude-haiku-5-5";
  const parsed = { parseStatus: "PARSED", parseError: null } as const;
  const structured = (role: "JUDGE" | "SYNTHESIZER" | "EVALUATOR"): ProviderCallRequest => ({ ...RESULT_REQUEST, role,
    bound: { maxAttempts: 3, tokenCeiling: 8192, deadlineMs: 5_000 },
    classifyContent: () => parsed, buildRepairPacket: () => RESULT_REQUEST.packet });
  const story = { ...RESULT_REQUEST, lane: "story" as const, callSiteKey: "STORY:STORYTELLER:1", role: "SYNTHESIZER" as const,
    preferredResponseFormat: "json_object" as const };
  function policySees(model: string, request: ProviderCallRequest): ProviderCallRequest {
    const seen: ProviderCallRequest[] = [];
    const gateway = withPreviewProviderCallPolicy({ call: async (sent) => { seen.push(sent); return {} as never; } }, parse(MULTI)!, { model });
    void gateway.call(request);
    expect(seen).toHaveLength(1);
    return seen[0]!;
  }

  it("the preview policy asks for JSON on every structured served step of a JSON row, and on no other request", () => {
    for (const model of [GLM, DEEPSEEK, MIMO, QWEN, HAIKU]) {
      const jsonRow = model === GLM;
      for (const role of ["JUDGE", "SYNTHESIZER", "EVALUATOR"] as const) {
        expect(policySees(model, structured(role)).preferredResponseFormat, `${model} ${role}`).toBe(jsonRow ? "json_object" : undefined);
        // A structured step whose sealed bound leaves no repair still expects one JSON object.
        expect(policySees(model, { ...structured(role), bound: { maxAttempts: 1, tokenCeiling: 8192, deadlineMs: 5_000 } })
          .preferredResponseFormat, `${model} ${role} bound 1`).toBe(jsonRow ? "json_object" : undefined);
      }
      // A call without its own content check, and a structured call off the served lane, are left as they were.
      expect(Object.hasOwn(policySees(model, RESULT_REQUEST), "preferredResponseFormat"), model).toBe(false);
      expect(Object.hasOwn(policySees(model, { ...structured("JUDGE"), lane: "evaluator" }), "preferredResponseFormat"), model).toBe(false);
      // The story calls ask for themselves, unchanged.
      expect(policySees(model, story).preferredResponseFormat).toBe("json_object");
    }
  });

  it("GLM's structured bodies carry response_format last; MiMo's (sampling only), DeepSeek's and Qwen's carry none", async () => {
    for (const model of [GLM, DEEPSEEK, MIMO, QWEN]) {
      for (const role of ["JUDGE", "SYNTHESIZER", "EVALUATOR"] as const) {
        const { executions, gateway } = previewGateway(model);
        await gateway.call(structured(role));
        const text = executions[0]!.requestBody;
        const sent = JSON.parse(text) as { max_tokens: number; messages: unknown };
        const row = previewModelRow(model)!;
        expect(text, `${model} ${role}`).toBe(JSON.stringify({ model, max_tokens: sent.max_tokens,
          ...(row.effort === null ? {} : { reasoning_effort: row.effort }), ...(row.sampling ?? {}), messages: sent.messages,
          ...(row.jsonObject ? { response_format: { type: "json_object" } } : {}) }));
        expect(Object.hasOwn(sent, "response_format")).toBe(model === GLM);
        expect(executions[0]!.reservedUsd).toBe(previewNanoUsdText(previewReservationNanoUsd(row, Buffer.byteLength(text))));
      }
    }
  });

  it("MiMo's full re-ask carries the same sampling and no JSON mode, and the gate's check accepts both POSTs", async () => {
    const { executions, gateway } = previewGateway(MIMO);
    let replies = 0;
    await gateway.call({ ...structured("JUDGE"),
      classifyContent: () => (++replies === 1 ? { parseStatus: "PARSE_FAILED", parseError: "synthetic" } : parsed) });
    expect(executions).toHaveLength(2);
    for (const execution of executions) {
      expect(JSON.parse(execution.requestBody)).toMatchObject(MIMO_SAMPLING);
      expect(Object.hasOwn(JSON.parse(execution.requestBody), "response_format")).toBe(false);
    }
  });
});
