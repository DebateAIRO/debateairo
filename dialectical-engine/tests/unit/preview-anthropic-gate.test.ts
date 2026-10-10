/**
 * Multi-model preview, PR B (2026-10-10): the app side of the Anthropic gate. Claude Haiku 5.5 is a
 * reviewed row keyed by its provider (parity with the gate's own file), the config names the
 * Anthropic gate's socket, the guarded fetch routes by the exact URL to that gate only and sends
 * only the wire contract's body, the estimate asks every gate a debate uses, the register kit and
 * the hosted roster take the native adapter kind, and a three-maker panel keeps the two-maker rule.
 */
import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  OpenAICompatibleProviderGateway, PREVIEW_ANTHROPIC_MESSAGES_URL, PREVIEW_MODEL_ROWS, PREVIEW_MODEL_ROWS_BY_PROVIDER,
  PREVIEW_REVIEWED_PROVIDER_REFS, assertPreviewProviderTargets, assertPreviewRoleTargets, createPreviewBudgetRpcPorts, createPreviewGuardedFetch,
  observeProviderTarget, parsePreviewProviderTestConfig, parseProviderDiscoveryTargets, previewModelRow, previewNanoUsdText,
  previewProbeControls, previewProviderSocket, previewTargetGatewayControls, previewRefsAreReviewedSet, previewReservationNanoUsd, previewTargetJsonRow,
  providerTargetGatewayControls, withPreviewProviderCallPolicy,
  type PreviewBudgetExecution, type PreviewBudgetPort, type PreviewGateRemaining, type PreviewProviderTestConfig,
  type ProviderCallRequest, type ProviderDiscoveryTarget
} from "@debateai/providers";
import { anthropicMessagesRequestBody } from "../../packages/providers/src/anthropic-messages.js";
import {
  assertPreviewBudgetAdmits, estimatePreviewGateNeeds, estimateUnfinishedRunHolds, previewGateKeyOf, previewRemainingPorts,
  type PreviewBudgetGateSettings
} from "../../apps/api/src/preview-budget-estimate.js";
import { gateHostedRoster } from "../../apps/runner/src/hosted-provider-set.js";
import { PREVIEW_MODEL_MAKERS, parsePreviewRosterFlag } from "../../apps/ui/lib/previewPlanRoster.js";
import { framedFixturePacket } from "../support/framed-packet.js";

const GLM = "zai-org/GLM-5.3-Flash";
const DEEPSEEK = "deepseek-ai/DeepSeek-V4.1-Flash";
const MIMO = "XiaomiMiMo/MiMo-V2.6-Pro";
const HAIKU = "claude-haiku-5-5";
const QWEN = "Qwen/Qwen3.8-Flash";
const HAIKU_REF = "preview:claude-haiku-5-5";
const DEEPINFRA_URL = "https://api.deepinfra.com/v1/openai/chat/completions";
const BASE = { deployment: "v3-preview", requested_thinking_level: "high",
  budget_socket: "/run/debateai-v3-preview/deepinfra-budget-v3.sock", scope_id: "preview-fixture" };
const ANTHROPIC_SOCKET = "/run/debateai-v3-preview/anthropic-budget-v1.sock";
/** Three makers: Z.AI and Anthropic on Free, plus DeepSeek on Premium. */
const THREE_MAKERS = { ...BASE, anthropic_budget_socket: ANTHROPIC_SOCKET,
  free_model_ids: [GLM, HAIKU], premium_model_ids: [GLM, DEEPSEEK, HAIKU] };
const parse = (value: unknown) => parsePreviewProviderTestConfig(JSON.stringify(value));
const messages = [{ role: "user", content: "synthetic" }];

const fixtureFile = JSON.parse(readFileSync(new URL("./fixtures/preview-model-rows-anthropic.json", import.meta.url), "utf8")) as {
  schema: string; provider: string; reservation: Record<string, unknown>;
  rows: Array<{ model: string; maker: string; input_usd_per_m: string; output_usd_per_m: string; input_nano_usd_per_token: number;
    output_nano_usd_per_token: number; output_bound: number; effort: "high" | null; json_object: boolean; worst_case_reservation_usd: string }> };

const configured = (providerRef: string) => { const row = previewModelRow(previewTargetJsonRow(providerRef).model)!;
  return { providerRef, maker: row.maker, adapterKind: row.adapterKind }; };
function targets(refs: readonly string[], change: Record<string, unknown> = {}): readonly ProviderDiscoveryTarget[] {
  return parseProviderDiscoveryTargets(JSON.stringify(refs.map(ref => ({ ...previewTargetJsonRow(ref), ...(ref === HAIKU_REF ? change : {}) }))),
    refs.map(configured));
}
function recordingPorts() {
  const executions: Record<string, PreviewBudgetExecution[]> = { deepinfra: [], anthropic: [] };
  const port = (name: string, reply: (input: PreviewBudgetExecution) => string): PreviewBudgetPort =>
    ({ execute: async input => { executions[name]!.push(input); return { status: 200, body: reply(input) }; } });
  return { executions, port };
}
const haikuReply = (text = "OK") => JSON.stringify({ id: "msg_synthetic", type: "message", role: "assistant", model: HAIKU,
  content: [{ type: "text", text }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 20 } });

describe("the Anthropic row equals its parity file and keeps the per-call cap", () => {
  it("is a provider-keyed addition: DeepInfra's three rows first, then Claude Haiku", () => {
    expect(PREVIEW_MODEL_ROWS_BY_PROVIDER.deepinfra.map(row => row.model)).toEqual([GLM, DEEPSEEK, MIMO]);
    expect(PREVIEW_MODEL_ROWS_BY_PROVIDER.anthropic.map(row => row.model)).toEqual([HAIKU]);
    expect(PREVIEW_MODEL_ROWS.map(row => row.model)).toEqual([GLM, DEEPSEEK, MIMO, HAIKU]);
    expect(PREVIEW_REVIEWED_PROVIDER_REFS.at(-1)).toBe(HAIKU_REF);
  });
  it("field for field, the row the gate reserves at", () => {
    expect(fixtureFile.schema).toBe("preview-model-rows-v1");
    expect(fixtureFile.provider).toBe("anthropic");
    expect(fixtureFile.reservation).toEqual({ formula: expect.any(String), overhead_bytes: 2048, worst_case_request_bytes: 256 * 1024, per_call_cap_usd: "0.25" });
    expect(PREVIEW_MODEL_ROWS_BY_PROVIDER.anthropic.map(row => ({ model: row.model, maker: row.maker, input_usd_per_m: row.inputUsdPerM,
      output_usd_per_m: row.outputUsdPerM, input_nano_usd_per_token: Number(row.inputNanoUsdPerToken),
      output_nano_usd_per_token: Number(row.outputNanoUsdPerToken), output_bound: row.outputBound, effort: row.effort,
      json_object: row.jsonObject, worst_case_reservation_usd: previewNanoUsdText(previewReservationNanoUsd(row, 256 * 1024)) })))
      .toEqual(fixtureFile.rows);
    const haiku = previewModelRow(HAIKU)!;
    expect([haiku.provider, haiku.baseUrl, haiku.adapterKind, haiku.contextWindowTokens])
      .toEqual(["anthropic", "https://api.anthropic.com/v1", "anthropic-messages-http", 1_000_000]);
    expect([haiku.inputPriceMicrosPerMillion, haiku.outputPriceMicrosPerMillion]).toEqual([625_000, 2_500_000]);
  });
  it("a full-size request reserves $0.24704, under the $0.25 cap; 4 at once fit the proposed $1.00 pot", () => {
    const worst = previewReservationNanoUsd(previewModelRow(HAIKU)!, 256 * 1024);
    expect(worst).toBe(247_040_000n);
    expect(worst < 250_000_000n).toBe(true);
    expect(4n * worst <= 1_000_000_000n).toBe(true);
  });
  it("the UI's maker table mirrors every reviewed row", () => {
    // The UI table already names Qwen3.8-Flash (Alibaba) so the all-models build flag parses; its
    // TypeScript row arrives with A's next push. Until then, and only then, Qwen is the one extra
    // entry allowed. Remove this allowance when A's Qwen row merges (it is inert from that moment).
    const pending = previewModelRow(QWEN) === undefined ? { [QWEN]: "Alibaba" } : {};
    expect(PREVIEW_MODEL_MAKERS).toEqual({ ...Object.fromEntries(PREVIEW_MODEL_ROWS.map(row => [row.model, row.maker])), ...pending });
  });
});

describe("configuration names the Anthropic gate's socket", () => {
  it("accepts a three-maker panel with the Anthropic socket, and keeps the sockets apart", () => {
    const config = parse(THREE_MAKERS)!;
    expect(config.free_model_ids).toEqual([GLM, HAIKU]);
    expect(config.premium_model_ids).toEqual([GLM, DEEPSEEK, HAIKU]);
    expect(previewProviderSocket(config, "anthropic")).toBe(ANTHROPIC_SOCKET);
    expect(previewProviderSocket(config, "deepinfra")).toBe(BASE.budget_socket);
    expect(parse(config)).toEqual(config);
    // The socket may be set before Haiku is in a roster (the gate is installed, not yet used).
    expect(parse({ ...BASE, anthropic_budget_socket: ANTHROPIC_SOCKET, free_model_ids: [GLM, DEEPSEEK], premium_model_ids: [GLM, DEEPSEEK] }))
      .toMatchObject({ anthropic_budget_socket: ANTHROPIC_SOCKET });
    // Without it, the config is exactly A's.
    expect(parse({ ...BASE, free_model_ids: [GLM, DEEPSEEK], premium_model_ids: [GLM, DEEPSEEK, MIMO] })).not.toHaveProperty("anthropic_budget_socket");
  });
  it.each([
    ["Haiku in a roster without the Anthropic socket", { ...THREE_MAKERS, anthropic_budget_socket: undefined }],
    ["the Anthropic socket equal to the DeepInfra socket", { ...THREE_MAKERS, anthropic_budget_socket: BASE.budget_socket }],
    ["an Anthropic socket outside the preview folder", { ...THREE_MAKERS, anthropic_budget_socket: "/tmp/anthropic-budget-v1.sock" }],
    ["a non-string Anthropic socket", { ...THREE_MAKERS, anthropic_budget_socket: 1 }],
    ["the legacy five keys plus the Anthropic socket", { ...BASE, free_model_ids: [GLM], anthropic_budget_socket: ANTHROPIC_SOCKET }],
    ["a Free roster of Haiku alone while three makers exist", { ...THREE_MAKERS, free_model_ids: [HAIKU] }],
    ["a Premium roster of Haiku alone", { ...THREE_MAKERS, premium_model_ids: [HAIKU] }]
  ])("refuses %s", (_name, value) => {
    expect(() => parse(JSON.parse(JSON.stringify(value)))).toThrow("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
  });
  it("boot refuses a register role on Haiku when the config names no Anthropic gate (API and runner)", () => {
    const declared = targets(PREVIEW_REVIEWED_PROVIDER_REFS);
    const withoutSocket = parse({ ...BASE, free_model_ids: [GLM, DEEPSEEK], premium_model_ids: [GLM, DEEPSEEK, MIMO] })!;
    expect(() => assertPreviewRoleTargets(withoutSocket, declared, ["preview:fixture-a", HAIKU_REF]))
      .toThrow("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
    expect(() => assertPreviewRoleTargets(withoutSocket, declared, ["preview:fixture-a", "preview:fixture-b"])).not.toThrow();
    expect(() => assertPreviewRoleTargets(parse(THREE_MAKERS)!, declared, ["preview:fixture-a", HAIKU_REF])).not.toThrow();
  });
  it("the UI build flag takes Haiku under the same two-maker rule", () => {
    expect(parsePreviewRosterFlag(JSON.stringify({ free: [GLM, HAIKU], premium: [GLM, DEEPSEEK, HAIKU] })))
      .toEqual({ free: [GLM, HAIKU], premium: [GLM, DEEPSEEK, HAIKU] });
    expect(parsePreviewRosterFlag(JSON.stringify({ free: [HAIKU], premium: [GLM, HAIKU] }))).toBeUndefined();
  });
});

describe("the owner's first debate: every AI on Free and on Premium", () => {
  const FOUR = [GLM, DEEPSEEK, MIMO, HAIKU];
  const ALL_FIVE = [GLM, DEEPSEEK, MIMO, QWEN, HAIKU];
  const everyone = (ids: readonly string[], socket: Record<string, string> = { anthropic_budget_socket: ANTHROPIC_SOCKET }) =>
    ({ ...BASE, ...socket, free_model_ids: ids, premium_model_ids: ids });
  it("the four rows this branch has, free = premium, parse with the Anthropic socket", () => {
    const config = parse(everyone(FOUR))!;
    expect([config.free_model_ids, config.premium_model_ids]).toEqual([FOUR, FOUR]);
    expect(previewProviderSocket(config, "anthropic")).toBe(ANTHROPIC_SOCKET);
    expect(previewProviderSocket(config, "deepinfra")).toBe(BASE.budget_socket);
  });
  it("the four rows refuse without the Anthropic socket (Haiku could never be called)", () => {
    expect(() => parse(everyone(FOUR, {}))).toThrow("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
  });
  // Qwen3.8-Flash's TypeScript row arrives with A's next push (contract A §1); until it exists this
  // test is skipped. Remove the guard once A's Qwen row merges.
  it.skipIf(previewModelRow(QWEN) === undefined)("all five, free = premium, parse with both sockets and refuse without Anthropic's", () => {
    const config = parse(everyone(ALL_FIVE))!;
    expect([config.free_model_ids, config.premium_model_ids]).toEqual([ALL_FIVE, ALL_FIVE]);
    expect(previewProviderSocket(config, "anthropic")).toBe(ANTHROPIC_SOCKET);
    expect(() => parse(everyone(ALL_FIVE, {}))).toThrow("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
  });
});

describe("the Haiku target is checked against its row, and older reviewed sets keep booting", () => {
  it("accepts the full reviewed set, A's DeepInfra set and the sealed GLM pair", () => {
    const config = parse(THREE_MAKERS)!;
    expect(() => assertPreviewProviderTargets(config, targets(PREVIEW_REVIEWED_PROVIDER_REFS))).not.toThrow();
    const deepinfraOnly = PREVIEW_REVIEWED_PROVIDER_REFS.filter(ref => ref !== HAIKU_REF);
    expect(() => assertPreviewProviderTargets(parse({ ...BASE, free_model_ids: [GLM, DEEPSEEK], premium_model_ids: [GLM, DEEPSEEK, MIMO] }),
      targets(deepinfraOnly))).not.toThrow();
    expect(previewRefsAreReviewedSet(deepinfraOnly)).toBe(true);
    expect(previewRefsAreReviewedSet(PREVIEW_REVIEWED_PROVIDER_REFS)).toBe(true);
  });
  it("refuses a roster naming Haiku when no Haiku target is declared", () => {
    expect(() => assertPreviewProviderTargets(parse(THREE_MAKERS), targets(PREVIEW_REVIEWED_PROVIDER_REFS.filter(ref => ref !== HAIKU_REF))))
      .toThrow("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
  });
  it.each([
    ["Haiku alone", [HAIKU_REF]],
    ["Haiku before the DeepInfra refs", [HAIKU_REF, ...PREVIEW_REVIEWED_PROVIDER_REFS.filter(ref => ref !== HAIKU_REF)]],
    ["a DeepInfra ref missing", PREVIEW_REVIEWED_PROVIDER_REFS.filter(ref => ref !== "preview:mimo-v2-6-pro")],
    ["a duplicate ref", [...PREVIEW_REVIEWED_PROVIDER_REFS, HAIKU_REF]],
    ["an unknown ref", [...PREVIEW_REVIEWED_PROVIDER_REFS, "preview:other"]]
  ])("refuses the ref set: %s", (_name, refs) => {
    expect(previewRefsAreReviewedSet(refs)).toBe(false);
  });
  it.each([
    ["another window", { context_window_tokens: 1_048_576 }],
    ["another price", { input_price_micros_per_million: 100_000 }],
    ["no thinking switch", { thinking_parameter: undefined, thinking_levels: undefined }],
    ["a credential header", { authorization_header: "synthetic-not-a-key" }]
  ])("refuses a Haiku target with %s", (_name, change) => {
    expect(() => assertPreviewProviderTargets(parse(THREE_MAKERS), targets(PREVIEW_REVIEWED_PROVIDER_REFS, change))).toThrow();
  });
  it("refuses Haiku registered on the OpenAI wire (the host and the wire are tied)", () => {
    expect(() => parseProviderDiscoveryTargets(JSON.stringify(PREVIEW_REVIEWED_PROVIDER_REFS.map(previewTargetJsonRow)),
      PREVIEW_REVIEWED_PROVIDER_REFS.map(ref => ({ ...configured(ref), adapterKind: "openai-compatible-http" })))).toThrow();
  });
  it("the hosted root-broker roster takes Haiku only with the native adapter kind", () => {
    const broker = (adapterKind: string) => JSON.stringify({ providers: [{ ...previewTargetJsonRow(HAIKU_REF), adapter_kind: adapterKind,
      maker: "Anthropic", vetting: {}, preview_budget_authority: true }] });
    expect(() => gateHostedRoster(broker("anthropic-messages-http"))).not.toThrow();
    expect(() => gateHostedRoster(broker("openai-compatible-http"))).toThrow();
  });
});

describe("the guarded fetch routes by exact URL, each call only to its own provider's gate", () => {
  const anthropicBody = (change: Record<string, unknown> = {}) =>
    ({ model: HAIKU, max_tokens: 1024, messages, system: "synthetic system", output_config: { effort: "high" }, ...change });
  it("sends a Haiku body to the Anthropic gate and a GLM body to the DeepInfra gate, never across", async () => {
    const { executions, port } = recordingPorts();
    const fetcher = createPreviewGuardedFetch({ deepinfra: port("deepinfra", () => "{}"), anthropic: port("anthropic", () => haikuReply()) });
    await fetcher(PREVIEW_ANTHROPIC_MESSAGES_URL, { method: "POST", body: JSON.stringify(anthropicBody()) });
    await fetcher(DEEPINFRA_URL, { method: "POST", body: JSON.stringify({ model: GLM, reasoning_effort: "high", max_tokens: 8, messages }) });
    expect(executions.anthropic!.map(execution => JSON.parse(execution.requestBody).model)).toEqual([HAIKU]);
    expect(executions.deepinfra!.map(execution => JSON.parse(execution.requestBody).model)).toEqual([GLM]);
    await expect(fetcher(DEEPINFRA_URL, { method: "POST", body: JSON.stringify(anthropicBody()) })).rejects.toThrow("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
    await expect(fetcher(PREVIEW_ANTHROPIC_MESSAGES_URL, { method: "POST",
      body: JSON.stringify({ model: GLM, max_tokens: 8, messages, output_config: { effort: "high" } }) })).rejects.toThrow("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
    for (const url of ["https://api.anthropic.com/v1/messages?beta=true", "https://api.anthropic.com/v1/messages/", "http://api.anthropic.com/v1/messages",
      "https://api.anthropic.com/v1/complete"]) {
      await expect(fetcher(url, { method: "POST", body: JSON.stringify(anthropicBody()) })).rejects.toThrow("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
    }
    expect(executions.anthropic).toHaveLength(1);
    expect(executions.deepinfra).toHaveLength(1);
  });
  it("reserves a Haiku call at (bytes + 2048) x $0.625 + 32,768 x $2.50 per million, with the exact body", async () => {
    const { executions, port } = recordingPorts();
    const fetcher = createPreviewGuardedFetch({ anthropic: port("anthropic", () => haikuReply()) });
    const text = JSON.stringify(anthropicBody({ max_tokens: 32_768 }));
    await fetcher(PREVIEW_ANTHROPIC_MESSAGES_URL, { method: "POST", body: text });
    const execution = executions.anthropic![0]!;
    expect(execution.requestBody).toBe(text);
    const nano = BigInt(Buffer.byteLength(text) + 2048) * 625n + 32_768n * 2_500n;
    expect(execution.reservedUsd).toBe(previewNanoUsdText(nano));
  });
  it.each([
    ["thinking", { thinking: { type: "adaptive" } }],
    ["tools", { tools: [] }],
    ["tool_choice", { tool_choice: { type: "auto" } }],
    ["stream", { stream: false }],
    ["metadata", { metadata: {} }],
    ["stop_sequences", { stop_sequences: ["x"] }],
    ["temperature", { temperature: 1 }],
    ["top_p", { top_p: 1 }],
    ["top_k", { top_k: 1 }],
    ["top-level cache_control", { cache_control: { type: "ephemeral" } }],
    ["inference_geo", { inference_geo: "us" }],
    ["service_tier", { service_tier: "auto" }],
    ["container", { container: "c" }],
    ["mcp_servers", { mcp_servers: [] }],
    ["cache_control inside a message", { messages: [{ role: "user", content: "x", cache_control: { type: "ephemeral" } }] }],
    ["list content", { messages: [{ role: "user", content: [{ type: "text", text: "x" }] }] }],
    ["a first assistant turn", { messages: [{ role: "assistant", content: "x" }, { role: "user", content: "y" }] }],
    ["a system role in messages", { messages: [{ role: "system", content: "x" }, { role: "user", content: "y" }] }],
    ["no messages", { messages: [] }],
    ["max_tokens 0", { max_tokens: 0 }],
    ["max_tokens above the bound", { max_tokens: 32_769 }],
    ["fractional max_tokens", { max_tokens: 1.5 }],
    ["no output_config", { output_config: undefined }],
    ["effort low", { output_config: { effort: "low" } }],
    ["output_config with a format", { output_config: { effort: "high", format: { type: "json_schema" } } }],
    ["a non-text system", { system: [{ type: "text", text: "x" }] }],
    ["another model", { model: "claude-opus-5-5" }]
  ])("refuses a Haiku body with %s before any reservation", async (_name, change) => {
    const { executions, port } = recordingPorts();
    const fetcher = createPreviewGuardedFetch({ anthropic: port("anthropic", () => haikuReply()) });
    const body = JSON.parse(JSON.stringify(anthropicBody(change)));
    await expect(fetcher(PREVIEW_ANTHROPIC_MESSAGES_URL, { method: "POST", body: JSON.stringify(body) })).rejects.toThrow("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
    expect(executions.anthropic).toHaveLength(0);
  });
  it("never carries a key: a key header is refused before any reservation", async () => {
    const { executions, port } = recordingPorts();
    const fetcher = createPreviewGuardedFetch({ anthropic: port("anthropic", () => haikuReply()), deepinfra: port("deepinfra", () => "{}") });
    for (const headers of [{ "x-api-key": "synthetic-not-a-key" }, { Authorization: "Bearer synthetic" }, { "X-Goog-Api-Key": "synthetic" }]) {
      await expect(fetcher(PREVIEW_ANTHROPIC_MESSAGES_URL, { method: "POST", headers, body: JSON.stringify(anthropicBody()) }))
        .rejects.toThrow("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
    }
    expect(executions.anthropic).toHaveLength(0);
  });
  it("a Haiku call with no Anthropic gate configured is a plain failed call: nothing reserved, nothing sent", async () => {
    const { executions, port } = recordingPorts();
    const fetcher = createPreviewGuardedFetch(port("deepinfra", () => "{}"));
    await expect(fetcher(PREVIEW_ANTHROPIC_MESSAGES_URL, { method: "POST", body: JSON.stringify(anthropicBody()) }))
      .rejects.toMatchObject({ code: "PROVIDER_CALL_FAILED" });
    expect(executions.deepinfra).toHaveLength(0);
  });
});

describe("each gate's IPC goes to its own socket", () => {
  let folder: string | undefined;
  const servers: Server[] = [];
  afterEach(async () => {
    await Promise.all(servers.splice(0).map(server => new Promise(resolve => server.close(resolve))));
    if (folder !== undefined) await rm(folder, { recursive: true, force: true });
    folder = undefined;
  });
  async function listen(path: string, reply: (body: string) => string): Promise<string[]> {
    const seen: string[] = [];
    const server = createServer((request, response) => {
      let body = ""; request.on("data", chunk => { body += chunk; });
      request.on("end", () => { seen.push(`${request.url} ${body}`); response.setHeader("content-type", "application/json"); response.end(reply(body)); });
    });
    servers.push(server);
    await new Promise<void>(resolve => server.listen(path, resolve));
    return seen;
  }
  it("/complete for Haiku reaches only the Anthropic socket; /remaining asks each configured gate", async () => {
    folder = await mkdtemp(join(tmpdir(), "pb-"));
    const deepinfraSocket = join(folder, "d.sock"), anthropicSocket = join(folder, "a.sock");
    const remaining = (models: string[]) => JSON.stringify({ state: "active", window_open: true, remaining_usd: "1.00",
      remaining_calls: 400, max_concurrent_calls: 4, largest_reservation_usd: "0.24704", enabled_models: models });
    const deepinfraSeen = await listen(deepinfraSocket, () => remaining([GLM]));
    const anthropicSeen = await listen(anthropicSocket, body => body.includes("requestBody")
      ? JSON.stringify({ status: 200, body: haikuReply() }) : remaining([HAIKU]));
    // Socket paths here are test folders; the parser (tested above) holds production configs to /run/debateai-v3-preview.
    const config = { ...parse(THREE_MAKERS)!, budget_socket: deepinfraSocket, anthropic_budget_socket: anthropicSocket } as PreviewProviderTestConfig;
    const fetcher = createPreviewGuardedFetch(createPreviewBudgetRpcPorts(config));
    const response = await fetcher(PREVIEW_ANTHROPIC_MESSAGES_URL, { method: "POST",
      body: JSON.stringify({ model: HAIKU, max_tokens: 64, messages, output_config: { effort: "high" } }) });
    expect(JSON.parse(await response.text()).model).toBe(HAIKU);
    expect(anthropicSeen).toHaveLength(1);
    expect(anthropicSeen[0]).toMatch(/^\/complete \{"scope_id":"preview-fixture","operationId"/u);
    expect(deepinfraSeen).toHaveLength(0);
    const ports = previewRemainingPorts(config);
    expect(Object.keys(ports).sort()).toEqual(["anthropic", "deepinfra"]);
    expect((await ports.anthropic!()).enabledModels).toEqual([HAIKU]);
    expect((await ports.deepinfra!()).enabledModels).toEqual([GLM]);
    expect(anthropicSeen[1]).toBe('/remaining {"scope_id":"preview-fixture"}');
    expect(Object.keys(previewRemainingPorts(parse({ ...BASE, free_model_ids: [GLM] })!))).toEqual(["deepinfra"]);
  });
});

describe("the estimate asks every gate the debate uses, unfinished debates included (never stop half-way)", () => {
  // Sites 8 + 8 + 8 + 6 = 30 = the ceiling; with 4 story calls and no hold cap: probes = 3 panel + 1 off-panel role.
  const basis = Object.freeze({ kind: "COMPUTED_STRUCTURAL_CEILING", panel_size: 3, depth: 1, max_model_attempts: 30,
    call_sites: { author: 8, panel: 8, reviewer: 8, serve: 6 }, serve_leg: { synthesis_loop_sites: 6, selected: "SYNTHESIS_LOOP" } });
  const PANEL = Object.freeze([{ provider_ref: "preview:fixture-a", model_id: GLM }, { provider_ref: "preview:deepseek-v4-1-flash", model_id: DEEPSEEK },
    { provider_ref: HAIKU_REF, model_id: HAIKU }]);
  const DEEPINFRA_PANEL = Object.freeze(PANEL.slice(0, 2));
  const answer = (models: string[], change: Partial<PreviewGateRemaining> = {}): PreviewGateRemaining => Object.freeze({
    state: "active", windowOpen: true, remainingNanoUsd: 1_000_000_000n, remainingCalls: 400, maxConcurrentCalls: 2,
    largestReservationNanoUsd: 247_040_000n, enabledModels: models, ...change });
  const settings = (remaining: PreviewBudgetGateSettings["remaining"], change: Partial<PreviewBudgetGateSettings> = {}): PreviewBudgetGateSettings =>
    Object.freeze({ remaining, roleModelIds: [GLM, GLM], roleProviderRefs: ["preview:fixture-a", "preview:fixture-b"], storyCalls: 4,
      maxCooldownHoldsPerRun: 0, readUnfinishedRuns: async () => [], ...change });
  const deepinfra = async () => answer([GLM, DEEPSEEK], { remainingNanoUsd: 3_000_000_000n, remainingCalls: 1200, maxConcurrentCalls: 4,
    largestReservationNanoUsd: 131_481_600n });
  it("maps Haiku to the Anthropic gate and splits a three-maker panel over both gates", () => {
    expect(previewGateKeyOf(HAIKU)).toBe("anthropic");
    expect(previewGateKeyOf(GLM)).toBe("deepinfra");
    const needs = estimatePreviewGateNeeds({ basis, panel: PANEL, roleModelIds: [GLM, GLM], roleProviderRefs: ["preview:fixture-a", "preview:fixture-b"],
      storyCalls: 4, maxCooldownHoldsPerRun: 0 });
    expect(needs.map(need => [need.gate, need.modelIds])).toEqual([["deepinfra", [GLM, DEEPSEEK]], ["anthropic", [HAIKU]]]);
    // 30 + 4 + 4 = 38 calls; x 1.15 = 44 calls; 38 x (4,000 x 625 + 1,200 x 2,500) nano-USD x 1.15 = $0.24035.
    expect([needs[1]!.expectedCalls, needs[1]!.callsWithMargin, needs[1]!.callsNanoUsd]).toEqual([38, 44, 240_350_000n]);
  });
  it("admits a three-maker debate only when both gates answer and fit", async () => {
    const panel = { basis, panel: PANEL };
    // $0.24035 for the calls + 2 in flight x $0.24704 = $0.73443: a fresh $1.00 pot carries it.
    await expect(assertPreviewBudgetAdmits(settings({ deepinfra, anthropic: async () => answer([HAIKU]) }), panel)).resolves.toBeUndefined();
    // With 4 in flight (the first proposed GO), the holds alone are $0.98816: no Haiku debate could start.
    await expect(assertPreviewBudgetAdmits(settings({ deepinfra, anthropic: async () => answer([HAIKU], { maxConcurrentCalls: 4 }) }), panel))
      .rejects.toMatchObject({ code: "DAILY_COST_ENVELOPE_REACHED" });
    // No Anthropic gate configured, or Haiku not switched on there: "not available right now".
    await expect(assertPreviewBudgetAdmits(settings({ deepinfra }), panel)).rejects.toMatchObject({ code: "ASK_MODEL_CANDIDATE_UNAVAILABLE" });
    await expect(assertPreviewBudgetAdmits(settings({ deepinfra, anthropic: async () => answer([]) }), panel))
      .rejects.toMatchObject({ code: "ASK_MODEL_CANDIDATE_UNAVAILABLE" });
    await expect(assertPreviewBudgetAdmits(settings({ deepinfra, anthropic: async () => answer([HAIKU], { remainingNanoUsd: 700_000_000n }) }), panel))
      .rejects.toMatchObject({ code: "DAILY_COST_ENVELOPE_REACHED" });
    // A role model on Haiku needs the Anthropic gate even when the panel does not use it.
    await expect(assertPreviewBudgetAdmits(settings({ deepinfra }, { roleModelIds: [GLM, HAIKU], roleProviderRefs: ["preview:fixture-a", HAIKU_REF] }),
      { basis, panel: DEEPINFRA_PANEL })).rejects.toMatchObject({ code: "ASK_MODEL_CANDIDATE_UNAVAILABLE" });
    // A DeepInfra-only debate never asks the Anthropic gate.
    let asked = 0;
    await expect(assertPreviewBudgetAdmits(settings({ deepinfra, anthropic: async () => { asked += 1; return answer([HAIKU]); } }),
      { basis, panel: DEEPINFRA_PANEL })).resolves.toBeUndefined();
    expect(asked).toBe(0);
  });
  it("an unfinished Haiku debate is held on the Anthropic gate, not on DeepInfra's", async () => {
    const unfinished = [{ basis, panel: PANEL }];
    const held = estimateUnfinishedRunHolds(unfinished[0]!, settings({}));
    expect(held.map(hold => hold.gate)).toEqual(["deepinfra", "anthropic"]);
    expect(held[1]!.callsNanoUsd).toBe(240_350_000n);
    const panel = { basis, panel: PANEL };
    // One unfinished Haiku debate holds $0.24035: $0.24035 + $0.24035 + $0.49408 = $0.97478 still fits $1.00 ...
    await expect(assertPreviewBudgetAdmits(settings({ deepinfra, anthropic: async () => answer([HAIKU]) },
      { readUnfinishedRuns: async () => unfinished }), panel)).resolves.toBeUndefined();
    // ... two do not ($1.21513).
    await expect(assertPreviewBudgetAdmits(settings({ deepinfra, anthropic: async () => answer([HAIKU]) },
      { readUnfinishedRuns: async () => [...unfinished, ...unfinished] }), panel)).rejects.toMatchObject({ code: "DAILY_COST_ENVELOPE_REACHED" });
    // An unfinished DeepInfra-only debate holds nothing on the Anthropic gate.
    const deepinfraOnly = estimateUnfinishedRunHolds({ basis, panel: DEEPINFRA_PANEL }, settings({}));
    expect(deepinfraOnly.map(hold => hold.gate)).toEqual(["deepinfra"]);
    // An older run naming a model off the reviewed rows is held on DeepInfra, never on Anthropic.
    const older = estimateUnfinishedRunHolds({ basis, panel: [{ provider_ref: "preview:old", model_id: "retired/model" }] }, settings({}));
    expect(older.map(hold => hold.gate)).toEqual(["deepinfra"]);
  });
});

const REQUEST: ProviderCallRequest = {
  runId: null, subjectItemId: "synthetic:node", callSiteKey: "fixture:judge", role: "JUDGE", lane: "served",
  bound: { maxAttempts: 1, tokenCeiling: 200_000, deadlineMs: 5_000 }, contractHash: "contract:synthetic",
  providerRef: HAIKU_REF, packet: framedFixturePacket("Synthetic school policy; no personal data.")
};

describe("Haiku's gateway, through the guarded fetch, sends the wire contract's body and no key", () => {
  it("clamps max_tokens to 32,768, sends effort high, and reads the native reply", async () => {
    const target = targets(PREVIEW_REVIEWED_PROVIDER_REFS).find(candidate => candidate.providerRef === HAIKU_REF)!;
    expect(target.adapterKind).toBe("anthropic-messages-http");
    const sent: Array<{ url: string; headers: Record<string, string> }> = [];
    const { executions, port } = recordingPorts();
    const guarded = createPreviewGuardedFetch({ anthropic: port("anthropic", () => haikuReply("{}")) });
    const fetchImplementation: typeof fetch = async (input, init) => {
      sent.push({ url: String(input), headers: Object.fromEntries(new Headers(init?.headers).entries()) });
      return guarded(input, init);
    };
    const config = parse(THREE_MAKERS)!;
    // The runner's preview wiring: the row's bound (previewTargetGatewayControls) caps max_tokens.
    const native = new OpenAICompatibleProviderGateway({ endpoint: target.baseUrl, model: target.model, maker: target.maker,
      ...providerTargetGatewayControls(target), ...previewTargetGatewayControls(config, target), fetchImplementation,
      persistRawArtifact: async artifact => artifact.artifactId, appendLedgerEntry: async entry => entry.attemptId,
      assertNoOpenWriteTransaction: () => undefined, sleepImplementation: async () => undefined });
    const gateway = withPreviewProviderCallPolicy(native, config, target);
    await gateway.call(REQUEST);
    expect(sent[0]!.url).toBe(PREVIEW_ANTHROPIC_MESSAGES_URL);
    expect(Object.keys(sent[0]!.headers)).not.toContain("x-api-key");
    const body = JSON.parse(executions.anthropic![0]!.requestBody);
    expect(body).toMatchObject({ model: HAIKU, max_tokens: 32_768, output_config: { effort: "high" } });
    expect(Object.keys(body).every(key => ["model", "max_tokens", "messages", "system", "output_config"].includes(key))).toBe(true);
  });
  it("every attempt, length retries included, stays at or below Haiku's 32,768 bound", async () => {
    const target = targets(PREVIEW_REVIEWED_PROVIDER_REFS).find(candidate => candidate.providerRef === HAIKU_REF)!;
    const { executions, port } = recordingPorts();
    const cut = JSON.stringify({ id: "msg_synthetic", type: "message", role: "assistant", model: HAIKU,
      content: [{ type: "text", text: "{\"cut" }], stop_reason: "max_tokens", usage: { input_tokens: 10, output_tokens: 20 } });
    const native = new OpenAICompatibleProviderGateway({ endpoint: target.baseUrl, model: target.model, maker: target.maker,
      ...providerTargetGatewayControls(target), ...previewTargetGatewayControls(parse(THREE_MAKERS)!, target),
      fetchImplementation: createPreviewGuardedFetch({ anthropic: port("anthropic", () => cut) }),
      persistRawArtifact: async artifact => artifact.artifactId, appendLedgerEntry: async entry => entry.attemptId,
      assertNoOpenWriteTransaction: () => undefined, sleepImplementation: async () => undefined });
    const classifyContent = (content: string) => {
      try { JSON.parse(content); return { parseStatus: "PARSED" as const, parseError: null }; }
      catch { return { parseStatus: "PARSE_FAILED" as const, parseError: "not json" }; }
    };
    await expect(native.call({ ...REQUEST, thinkingLevel: "high", classifyContent, bound: { maxAttempts: 4, tokenCeiling: 20_000, deadlineMs: 5_000 } })).rejects.toBeInstanceOf(Error);
    const sent = executions.anthropic!.map(execution => JSON.parse(execution.requestBody).max_tokens as number);
    expect(sent).toEqual([20_000, 32_768, 32_768, 32_768]);
    expect(sent.every(value => value <= 32_768)).toBe(true);
  });
  it("the discovery probe goes through the Anthropic gate with high and the generation floor", async () => {
    const target = targets(PREVIEW_REVIEWED_PROVIDER_REFS).find(candidate => candidate.providerRef === HAIKU_REF)!;
    expect(previewProbeControls(target)).toEqual({ thinkingLevel: "high", tokenCeiling: 8192 });
    const { executions, port } = recordingPorts();
    const fetcher = createPreviewGuardedFetch({ anthropic: port("anthropic", () => haikuReply()) });
    const observed = await observeProviderTarget({ target, timeoutMs: 5_000, clock: () => new Date(), fetchImplementation: fetcher, ...previewProbeControls(target) });
    expect(observed.state).toBe("HEALTHY");
    expect(JSON.parse(executions.anthropic![0]!.requestBody)).toMatchObject({ model: HAIKU, max_tokens: 8192, output_config: { effort: "high" } });
  });
});

// The packets the adapter fixture covers (also rebuilt by tests/unit/preview-anthropic-gate.test.ts).
const ADAPTER_CASES = [
  { name: "system and one user turn", maxTokens: 8192, messages: [
    { role: "system", content: "You are the synthetic judge." }, { role: "user", content: "Is the synthetic claim supported?" }] },
  { name: "two system messages joined, a full exchange", maxTokens: 32768, messages: [
    { role: "system", content: "Frame A." }, { role: "user", content: "First." }, { role: "system", content: "Frame B." },
    { role: "assistant", content: "Answer." }, { role: "user", content: "Second." }] },
  { name: "consecutive user turns joined, no system", maxTokens: 1, messages: [
    { role: "user", content: "Part one." }, { role: "user", content: "Part two." }] },
  { name: "non-ASCII text and escapes", maxTokens: 1024, messages: [
    { role: "system", content: "Răspunde în română. \"Citat\" \\ backslash\nnew line\ttab" },
    { role: "user", content: "Întrebare: 日本語? emoji 🙂 and   separator" }] },
  { name: "repair: user, assistant, user, assistant joined, user", maxTokens: 8192, messages: [
    { role: "user", content: "Q" }, { role: "assistant", content: "A1" }, { role: "assistant", content: "A2" },
    { role: "user", content: "Fix it." }] }
] as const;
const adapterBodies = JSON.parse(readFileSync(new URL("./fixtures/anthropic-adapter-bodies.json", import.meta.url), "utf8")) as {
  schema: string; sent: Array<{ name: string; body: string }>; refused: Array<{ name: string; body: string }> };

describe("the gate's shape mirrors the adapter's (the Python gate reads the same file)", () => {
  it("the fixture's sent bodies are the adapter's own output, byte for byte", () => {
    expect(adapterBodies.schema).toBe("anthropic-adapter-bodies-v1");
    expect(adapterBodies.sent.map(entry => entry.name)).toEqual(ADAPTER_CASES.map(entry => entry.name));
    ADAPTER_CASES.forEach((entry, index) => {
      expect(anthropicMessagesRequestBody({ model: HAIKU, maxTokens: entry.maxTokens, thinkingLevel: "high",
        messages: entry.messages as unknown as Parameters<typeof anthropicMessagesRequestBody>[0]["messages"] })).toBe(adapterBodies.sent[index]!.body);
    });
  });
  it("the guarded fetch takes every body the adapter sends and refuses every body it never sends", async () => {
    const { executions, port } = recordingPorts();
    const fetcher = createPreviewGuardedFetch({ anthropic: port("anthropic", () => haikuReply()) });
    for (const entry of adapterBodies.sent) await fetcher(PREVIEW_ANTHROPIC_MESSAGES_URL, { method: "POST", body: entry.body });
    expect(executions.anthropic!.map(execution => execution.requestBody)).toEqual(adapterBodies.sent.map(entry => entry.body));
    for (const entry of adapterBodies.refused) {
      await expect(fetcher(PREVIEW_ANTHROPIC_MESSAGES_URL, { method: "POST", body: entry.body }), entry.name)
        .rejects.toThrow("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
    }
    expect(executions.anthropic).toHaveLength(adapterBodies.sent.length);
  });
});
