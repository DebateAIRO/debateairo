/**
 * Preview multi-model (contract A, 2026-10-10): the reviewed DeepInfra rows, the two config forms,
 * the per-row target check, the per-row guarded fetch and reservation, the gateway's output clamp,
 * the per-row thinking policy and probe controls, and the hosted root-broker rule.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  OpenAICompatibleProviderGateway, PREVIEW_MODEL_ROWS, PREVIEW_REVIEWED_PROVIDER_REFS, assertPreviewProviderTargets,
  createPreviewGuardedFetch, observeProviderTarget, parsePreviewProviderTestConfig, parseProviderDiscoveryTargets,
  previewModelRow, previewNanoUsdText, previewPlanTierRosters, previewProbeControls, previewReservationNanoUsd,
  previewTargetJsonRow, providerTargetGatewayControls, withPreviewProviderCallPolicy, previewTargetGatewayControls,
  assertPreviewRoleTargets,
  type PreviewBudgetExecution, type ProviderCallRequest, type ProviderDiscoveryTarget
} from "@debateai/providers";
import { PLAN_TIER_ROSTERS } from "@debateai/contract";
import { gateHostedRoster } from "../../apps/runner/src/hosted-provider-set.js";
import { framedFixturePacket } from "../support/framed-packet.js";

const GLM = "zai-org/GLM-5.3-Flash";
const DEEPSEEK = "deepseek-ai/DeepSeek-V4.1-Flash";
const MIMO = "XiaomiMiMo/MiMo-V2.6-Pro";
const URL_COMPLETIONS = "https://api.deepinfra.com/v1/openai/chat/completions";
const BASE = { deployment: "v3-preview", requested_thinking_level: "high",
  budget_socket: "/run/debateai-v3-preview/provider-budget.sock", scope_id: "preview-fixture" };
const LEGACY = { ...BASE, free_model_ids: [GLM] };
const MULTI = { ...BASE, free_model_ids: [GLM, DEEPSEEK], premium_model_ids: [GLM, DEEPSEEK, MIMO] };
const parse = (value: unknown) => parsePreviewProviderTestConfig(JSON.stringify(value));
const messages = [{ role: "user", content: "synthetic" }];

type FixtureRow = { model: string; maker: string; input_usd_per_m: string; output_usd_per_m: string; output_bound: number;
  effort: "high" | null; json_object: boolean; worst_case_reservation_usd: string;
  input_nano_usd_per_token: number; output_nano_usd_per_token: number };
/** The gate's parity file (schema preview-model-rows-v1): the Python gate asserts the same rows. */
const fixtureFile = JSON.parse(readFileSync(new URL("./fixtures/preview-model-rows.json", import.meta.url), "utf8")) as {
  schema: string; provider: string; reservation: { overhead_bytes: number; worst_case_request_bytes: number; per_call_cap_usd: string };
  rows: FixtureRow[] };
const fixtureRows = fixtureFile.rows;

function targets(refs: readonly string[]): readonly ProviderDiscoveryTarget[] {
  return parseProviderDiscoveryTargets(JSON.stringify(refs.map(previewTargetJsonRow)),
    refs.map(providerRef => ({ providerRef, maker: previewModelRow(previewTargetJsonRow(providerRef).model)!.maker })));
}
function recordingFetch() {
  const executions: PreviewBudgetExecution[] = [];
  const fetcher = createPreviewGuardedFetch({ execute: async input => { executions.push(input); return { status: 200, body: "{}" }; } });
  return { executions, fetcher, post: (body: unknown) => fetcher(URL_COMPLETIONS, { method: "POST", body: JSON.stringify(body) }) };
}

describe("the reviewed rows equal the shared parity file (contract A §1, §3)", () => {
  it("has exactly the three rows, in order, field for field", () => {
    expect(PREVIEW_MODEL_ROWS.map(row => ({ model: row.model, maker: row.maker, input_usd_per_m: row.inputUsdPerM,
      output_usd_per_m: row.outputUsdPerM, output_bound: row.outputBound, effort: row.effort, json_object: row.jsonObject })))
      .toEqual(fixtureRows.map(({ worst_case_reservation_usd: _worst, input_nano_usd_per_token: _in, output_nano_usd_per_token: _out, ...row }) => row));
    expect(fixtureFile.schema).toBe("preview-model-rows-v1");
    expect(fixtureFile.provider).toBe("deepinfra");
    expect(fixtureFile.reservation).toEqual({ formula: expect.any(String), overhead_bytes: 2048, worst_case_request_bytes: 256 * 1024, per_call_cap_usd: "0.25" });
  });
  it("prices are whole nano-USD per token (USD per million x 1000)", () => {
    expect(PREVIEW_MODEL_ROWS.map(row => [row.inputNanoUsdPerToken, row.outputNanoUsdPerToken]))
      .toEqual([[150n, 500n], [200n, 600n], [430n, 870n]]);
    expect(PREVIEW_MODEL_ROWS.map(row => [row.inputNanoUsdPerToken, row.outputNanoUsdPerToken]))
      .toEqual(fixtureRows.map(row => [BigInt(row.input_nano_usd_per_token), BigInt(row.output_nano_usd_per_token)]));
    expect(PREVIEW_MODEL_ROWS.map(row => [row.inputPriceMicrosPerMillion, row.outputPriceMicrosPerMillion]))
      .toEqual([[150_000, 500_000], [200_000, 600_000], [430_000, 870_000]]);
  });
  it("the worst-case reservation (256 KiB body) equals the file and stays under the $0.25 per-call cap", () => {
    for (const fixture of fixtureRows) {
      const reserved = previewReservationNanoUsd(previewModelRow(fixture.model)!, 256 * 1024);
      expect(previewNanoUsdText(reserved)).toBe(fixture.worst_case_reservation_usd);
      expect(reserved < 250_000_000n).toBe(true);
    }
    expect(fixtureRows.map(row => row.worst_case_reservation_usd)).toEqual(["0.121548800", "0.131481600", "0.227635200"]);
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
    expect(previewPlanTierRosters(config, PLAN_TIER_ROSTERS)).toEqual({ free: [GLM, DEEPSEEK], premium: [GLM, DEEPSEEK, MIMO] });
    expect(parse(config)).toEqual(config);
    expect(Object.isFrozen(config.premium_model_ids)).toBe(true);
    expect(parse({ ...BASE, free_model_ids: [GLM], premium_model_ids: [GLM] })).toMatchObject({ premium_model_ids: [GLM] });
  });
  it.each([
    ["a one-maker Free roster while two makers exist", { ...MULTI, free_model_ids: [GLM] }],
    ["a one-maker Premium roster while two makers exist", { ...MULTI, premium_model_ids: [MIMO] }],
    ["an unreviewed id", { ...MULTI, free_model_ids: [GLM, "other/model"] }],
    ["a duplicate id", { ...MULTI, free_model_ids: [GLM, GLM, DEEPSEEK] }],
    ["an empty roster", { ...MULTI, premium_model_ids: [] }],
    ["a missing premium list with a non-GLM free list", { ...BASE, free_model_ids: [GLM, DEEPSEEK] }],
    ["a legacy form with another model", { ...BASE, free_model_ids: [DEEPSEEK] }],
    ["an extra key", { ...MULTI, anthropic_budget_socket: "/run/debateai-v3-preview/a.sock" }],
    ["a non-array roster", { ...MULTI, premium_model_ids: GLM }]
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
    return parseProviderDiscoveryTargets(JSON.stringify(rows), PREVIEW_REVIEWED_PROVIDER_REFS.map(providerRef =>
      ({ providerRef, maker: previewModelRow(previewTargetJsonRow(providerRef).model)!.maker })));
  };
  it.each([
    ["DeepSeek at GLM's price", 2, { input_price_micros_per_million: 150_000 }],
    ["MiMo with a thinking switch", 3, { thinking_parameter: "reasoning_effort", thinking_levels: ["high"] }],
    ["DeepSeek without its thinking switch", 2, { thinking_parameter: undefined, thinking_levels: undefined }],
    ["DeepSeek on the GLM ref's model", 2, { model: GLM }],
    ["a credential header", 1, { authorization_header: "Bearer synthetic" }],
    ["another window", 3, { context_window_tokens: 131_072 }],
    ["another base URL", 2, { base_url: "https://api.deepinfra.com/v1" }]
  ])("refuses %s", (_name, index, change) => {
    expect(() => assertPreviewProviderTargets(parse(MULTI), mutate(index, change))).toThrow();
  });
  it("refuses a reviewed ref declared under another maker", () => {
    const declared = parseProviderDiscoveryTargets(JSON.stringify(PREVIEW_REVIEWED_PROVIDER_REFS.map(previewTargetJsonRow)),
      PREVIEW_REVIEWED_PROVIDER_REFS.map(providerRef => ({ providerRef, maker: "Z.AI" })));
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
      { model: GLM, reasoning_effort: "high", max_tokens: 163_840, messages, response_format: { type: "json_object" } },
      { model: DEEPSEEK, reasoning_effort: "high", max_tokens: 131_072, messages },
      { model: MIMO, max_tokens: 131_072, messages }
    ];
    for (const body of bodies) await post(body);
    expect(executions).toHaveLength(3);
    const prices: Array<[bigint, bigint, bigint]> = [[150n, 500n, 163_840n], [200n, 600n, 131_072n], [430n, 870n, 131_072n]];
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
    expect(sent).toMatchObject({ model: DEEPSEEK, max_tokens: 131_072, reasoning_effort: "high" });
    expect(sent).not.toHaveProperty("response_format");
  });
  it("never sends a thinking level to MiMo, and refuses a request that asks for one before sending", async () => {
    const { executions, gateway } = previewGateway(MIMO);
    await gateway.call(RESULT_REQUEST);
    expect(Object.keys(JSON.parse(executions[0]!.requestBody)).sort()).toEqual(["max_tokens", "messages", "model"]);
    await expect((async () => gateway.call({ ...RESULT_REQUEST, thinkingLevel: "high" }))()).rejects.toMatchObject({ code: "PROVIDER_THINKING_LEVEL_UNSUPPORTED" });
    expect(executions).toHaveLength(1);
  });
  it("a story JSON request reaches the vendor as JSON only on GLM", async () => {
    for (const model of [GLM, DEEPSEEK, MIMO]) {
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
    expect(previewTargetGatewayControls(parse(MULTI), target)).toEqual({ maxOutputTokens: 131_072 });
    expect(previewTargetGatewayControls(parse(LEGACY), { model: GLM })).toEqual({ maxOutputTokens: 163_840 });
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
    ...previewTargetJsonRow(ref), adapter_kind: "openai-compatible-http", maker: previewModelRow(previewTargetJsonRow(ref).model)!.maker,
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
