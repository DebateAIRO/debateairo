import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import {
  ANTHROPIC_MESSAGES_HTTP_ADAPTER_KIND,
  AnthropicMessagesProviderGateway,
  BUILT_IN_PROVIDER_ADAPTERS,
  OpenAICompatibleProviderGateway,
  PROVIDER_CONTENT_LENGTH_EXCEEDED,
  PROVIDER_PACKET_UNSUPPORTED,
  PROVIDER_CONTENT_REFUSED,
  PROVIDER_REPLY_UNSUPPORTED,
  ProviderCallFailedError,
  anthropicMessagesRequestBody,
  anthropicUsageAsEngineUsage,
  observeProviderTarget,
  parseProviderDiscoveryTargets,
  providerTargetGatewayControls,
  type OpenAICompatibleGatewayOptions,
  type PromptPacket,
  type ProviderDiscoveryTarget
} from "@debateai/providers";
import { chargeMicrosForUsage, chargeableUsage } from "@debateai/budget";
import { readDeploymentMakerCapability } from "../../packages/critique/src/index.js";
import {
  buildConfiguredProviderSetDeploymentRow,
  buildConfiguredProviderSetSealedRow
} from "../../packages/register/src/configured-provider-set.js";
import { framedFixturePacket } from "../support/framed-packet.js";

// Multi-model preview, PR B: the native Anthropic Messages wire. Every test
// here runs on a fake fetch; nothing reaches the network.

const MODEL = "claude-haiku-5-5";
const BASE_URL = "https://api.anthropic.com/v1";
const TOKEN_CEILING = 64;
const PACKET = framedFixturePacket("anthropic");
const SYSTEM = PACKET.messages.find((message) => message.role === "system")!.content;
const USER = PACKET.messages.find((message) => message.role === "user")!.content;
const HIGH = { thinking: { parameter: "reasoning_effort" as const, levels: ["high"] } };

type Sent = { url: string; headers: Record<string, string>; body: string };

function gatewayWith(
  respond: (attempt: number) => Response,
  extra: Partial<OpenAICompatibleGatewayOptions> = {}
) {
  const sent: Sent[] = [];
  const ledger: Array<{ outcome: string }> = [];
  const artifacts: Array<{ provider: string; rawText: string; metadata: Readonly<Record<string, unknown>> }> = [];
  const gateway = new AnthropicMessagesProviderGateway({
    endpoint: BASE_URL, model: MODEL, maker: "Anthropic",
    fetchImplementation: async (url, init) => {
      sent.push({ url: String(url), headers: { ...(init?.headers as Record<string, string>) }, body: String(init?.body) });
      return respond(sent.length);
    },
    sleepImplementation: async () => undefined,
    persistRawArtifact: async (artifact) => { artifacts.push(artifact); return artifact.artifactId; },
    appendLedgerEntry: async (entry) => { ledger.push(entry); return `ledger:${ledger.length}`; },
    assertNoOpenWriteTransaction: () => undefined,
    ...extra
  });
  return { gateway, sent, ledger, artifacts };
}

function message(extra: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: "msg_fixture", type: "message", role: "assistant", model: MODEL,
    content: [{ type: "text", text: "{\"ok\":true}" }],
    stop_reason: "end_turn", stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    ...extra
  };
}

function reply(body: unknown, status = 200): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status, headers: { "content-type": "application/json" }
  });
}

function vendorError(status: number, type: string): Response {
  return reply({ type: "error", error: { type, message: "fixture" }, request_id: "req_fixture" }, status);
}

function request(extra: Readonly<Record<string, unknown>> = {}) {
  return {
    runId: null, subjectItemId: "node:anthropic", callSiteKey: "JUDGE",
    role: "JUDGE" as const, lane: "served" as const,
    bound: { maxAttempts: 3, tokenCeiling: TOKEN_CEILING, deadlineMs: 5_000 },
    contractHash: "contract:anthropic", providerRef: "provider:anthropic", packet: PACKET,
    ...extra
  };
}

function chargeSpy() {
  const charges: unknown[] = [];
  return {
    charges,
    costEnvelope: {
      assertCallAllowed: () => undefined,
      recordCall: (observed: { usage: unknown }) => { charges.push(observed.usage); },
      assertUsageReported: () => undefined
    }
  };
}

describe("PR B — the Anthropic request on the wire", () => {
  it("posts exactly the contract body, with system hoisted, to {base}/messages with x-api-key", async () => {
    const { gateway, sent } = gatewayWith(() => reply(message()), { authorizationHeader: "fixture-key" });
    await gateway.call(request());
    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toBe("https://api.anthropic.com/v1/messages");
    expect(sent[0]!.headers).toStrictEqual({
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
      "x-api-key": "fixture-key"
    });
    expect(sent[0]!.body).toBe(
      `{"model":"claude-haiku-5-5","max_tokens":64,"messages":[{"role":"user","content":${JSON.stringify(USER)}}],`
      + `"system":${JSON.stringify(SYSTEM)}}`
    );
  });

  it("adds output_config.effort only when the high level is asked, and nothing at DEFAULT_ONLY", async () => {
    const { gateway, sent } = gatewayWith(() => reply(message()), HIGH);
    await gateway.call(request({ thinkingLevel: "high" }));
    await gateway.call(request({ thinkingLevel: "DEFAULT_ONLY" }));
    await gateway.call(request());
    const decoded = sent.map((entry) => JSON.parse(entry.body) as Record<string, unknown>);
    expect(Object.keys(decoded[0]!)).toStrictEqual(["model", "max_tokens", "messages", "system", "output_config"]);
    expect(decoded[0]!.output_config).toStrictEqual({ effort: "high" });
    expect(Object.keys(decoded[1]!)).toStrictEqual(["model", "max_tokens", "messages", "system"]);
    expect(sent[1]!.body).toBe(sent[2]!.body);
  });

  it("sends no key header at all when the target has no credential (the preview's gate adds it)", async () => {
    const { gateway, sent } = gatewayWith(() => reply(message()));
    await gateway.call(request());
    expect(Object.keys(sent[0]!.headers).sort()).toStrictEqual(["anthropic-version", "content-type"]);
  });

  it("joins every system message and merges consecutive turns of one role, in order", () => {
    const body = anthropicMessagesRequestBody({
      model: MODEL, maxTokens: 10, thinkingLevel: "DEFAULT_ONLY",
      messages: [
        { role: "system", content: "rule one" },
        { role: "user", content: "question" },
        { role: "system", content: "rule two" },
        { role: "assistant", content: "earlier answer" },
        { role: "user", content: "follow-up one" },
        { role: "user", content: "follow-up two" }
      ]
    });
    expect(body).toBe(JSON.stringify({
      model: MODEL, max_tokens: 10,
      messages: [
        { role: "user", content: "question" },
        { role: "assistant", content: "earlier answer" },
        { role: "user", content: "follow-up one\n\nfollow-up two" }
      ],
      system: "rule one\n\nrule two"
    }));
  });

  it("refuses a packet it cannot say: a final assistant turn, an assistant first, an empty message", () => {
    for (const messages of [
      [{ role: "user", content: "q" }, { role: "assistant", content: "prefill" }],
      [{ role: "system", content: "s" }, { role: "assistant", content: "a" }, { role: "user", content: "q" }],
      [{ role: "system", content: "only system" }],
      [{ role: "user", content: "" }]
    ] as PromptPacket["messages"][]) {
      expect(() => anthropicMessagesRequestBody({ model: MODEL, maxTokens: 10, thinkingLevel: "DEFAULT_ONLY", messages }))
        .toThrowError(expect.objectContaining({ code: PROVIDER_PACKET_UNSUPPORTED }));
    }
    expect(() => anthropicMessagesRequestBody({
      model: MODEL, maxTokens: 10, thinkingLevel: "low", messages: [{ role: "user", content: "q" }]
    })).toThrowError(expect.objectContaining({ code: "PROVIDER_THINKING_LEVEL_UNSUPPORTED" }));
  });
});

describe("PR B — reading the Anthropic reply", () => {
  it("joins the text blocks in order, ignores thinking blocks, and records the vendor's own bytes", async () => {
    const body = message({
      content: [
        { type: "thinking", thinking: "", signature: "sig" },
        { type: "text", text: "{\"a\":" },
        { type: "redacted_thinking", data: "opaque" },
        { type: "text", text: "1}" }
      ]
    });
    const { gateway, artifacts, ledger } = gatewayWith(() => reply(body));
    const result = await gateway.call(request());
    expect(result).toMatchObject({
      content: "{\"a\":1}", provider: ANTHROPIC_MESSAGES_HTTP_ADAPTER_KIND, model: MODEL, modelVersion: MODEL,
      reasoningTokens: null
    });
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]!.provider).toBe(ANTHROPIC_MESSAGES_HTTP_ADAPTER_KIND);
    expect(artifacts[0]!.rawText).toBe(JSON.stringify(body));
    expect(artifacts[0]!.metadata).toMatchObject({ finish_reason: "end_turn" });
    expect(ledger.map((row) => row.outcome)).toEqual(["OK"]);
  });

  for (const [label, body, code] of [
    ["a tool_use block", message({ content: [{ type: "tool_use", id: "t", name: "x", input: {} }], stop_reason: "tool_use" }), PROVIDER_REPLY_UNSUPPORTED],
    ["a server_tool_use block", message({ content: [{ type: "server_tool_use", id: "s", name: "web_search", input: {} }, { type: "text", text: "x" }] }), PROVIDER_REPLY_UNSUPPORTED],
    ["a pause_turn stop", message({ stop_reason: "pause_turn" }), PROVIDER_REPLY_UNSUPPORTED],
    ["an unknown stop reason", message({ stop_reason: "something_new" }), PROVIDER_REPLY_UNSUPPORTED],
    ["a context-window stop (not a truncation: no raised retry)", message({ stop_reason: "model_context_window_exceeded" }), PROVIDER_REPLY_UNSUPPORTED],
    ["a refusal", message({ content: [], stop_reason: "refusal" }), PROVIDER_CONTENT_REFUSED]
  ] as const) {
    it(`fails ${label} once — charged, ledgered FAILED, never retried`, async () => {
      const { gateway, sent, ledger, artifacts } = gatewayWith(() => reply(body));
      const spy = chargeSpy();
      const failure = await gateway.call(request({ costEnvelope: spy.costEnvelope })).catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(ProviderCallFailedError);
      expect((failure as ProviderCallFailedError).cause).toMatchObject({ code });
      expect((failure as ProviderCallFailedError).attempts).toBe(1);
      expect(sent).toHaveLength(1);
      expect(artifacts).toHaveLength(1);
      expect(spy.charges).toHaveLength(1);
      expect(ledger.map((row) => row.outcome)).toEqual(["FAILED"]);
    });
  }

  it("treats max_tokens as a truncation: LENGTH_EXCEEDED, then a retry under a raised bound", async () => {
    const { gateway, sent, artifacts } = gatewayWith((attempt) => reply(attempt === 1
      ? message({ content: [{ type: "text", text: "{\"cut" }], stop_reason: "max_tokens" })
      : message()));
    const classifyContent = (content: string) => {
      try { JSON.parse(content); return { parseStatus: "PARSED" as const, parseError: null }; }
      catch { return { parseStatus: "PARSE_FAILED" as const, parseError: "not json" }; }
    };
    const result = await gateway.call(request({ classifyContent }));
    expect(result.content).toBe("{\"ok\":true}");
    expect(sent.map((entry) => JSON.parse(entry.body).max_tokens)).toEqual([TOKEN_CEILING, TOKEN_CEILING * 2]);
    expect(artifacts[0]!.metadata).toMatchObject({ finish_reason: "length" });
    // Control: the same truncation on the last attempt surfaces as the length refusal.
    const cut = gatewayWith(() => reply(message({ content: [{ type: "text", text: "{" }], stop_reason: "max_tokens" })));
    await expect(cut.gateway.call(request({ classifyContent })))
      .rejects.toMatchObject({ code: "PROVIDER_CONTENT_UNACCEPTED", lastParseStatus: PROVIDER_CONTENT_LENGTH_EXCEEDED });
  });

  it("refuses a reply naming another model: PROVIDER_MODEL_IDENTITY_CHANGED, one call", async () => {
    const { gateway, sent } = gatewayWith(() => reply(message({ model: "claude-haiku-5-5-other" })));
    await expect(gateway.call(request())).rejects.toMatchObject({ code: "PROVIDER_MODEL_IDENTITY_CHANGED" });
    expect(sent).toHaveLength(1);
  });
});

describe("PR B — usage in the engine's shape", () => {
  it("input = input + cache creation + cache read; output = output_tokens", () => {
    expect(anthropicUsageAsEngineUsage({
      input_tokens: 100, output_tokens: 40, cache_creation_input_tokens: 7, cache_read_input_tokens: 3,
      service_tier: "standard"
    })).toStrictEqual({ prompt_tokens: 110, completion_tokens: 40, total_tokens: 150 });
    expect(anthropicUsageAsEngineUsage({
      input_tokens: 5, output_tokens: 1, cache_creation_input_tokens: null
    })).toStrictEqual({ prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 });
    expect(anthropicUsageAsEngineUsage(undefined)).toBeUndefined();
    expect(anthropicUsageAsEngineUsage(null)).toBeUndefined();
  });

  it("marks a missing or malformed counter as invalid, never as zero", () => {
    expect(anthropicUsageAsEngineUsage({ output_tokens: 3 })).toStrictEqual({ prompt_tokens: -1, completion_tokens: 3 });
    expect(anthropicUsageAsEngineUsage({ input_tokens: 3, output_tokens: 1.5 })).toStrictEqual({ prompt_tokens: 3, completion_tokens: -1 });
    expect(anthropicUsageAsEngineUsage({ input_tokens: 3, output_tokens: 1, cache_read_input_tokens: -2 }))
      .toStrictEqual({ prompt_tokens: -1, completion_tokens: 1 });
    expect(anthropicUsageAsEngineUsage("x")).toStrictEqual({ prompt_tokens: -1, completion_tokens: -1 });
  });

  it("charges and records the mapped usage; a malformed counter is PROVIDER_USAGE_INVALID after one charged call", async () => {
    const body = message({ usage: { input_tokens: 20, output_tokens: 9, cache_creation_input_tokens: 4, cache_read_input_tokens: 6 } });
    const { gateway, artifacts } = gatewayWith(() => reply(body));
    const spy = chargeSpy();
    await gateway.call(request({ costEnvelope: spy.costEnvelope }));
    expect(spy.charges).toStrictEqual([{ prompt_tokens: 30, completion_tokens: 9, total_tokens: 39 }]);
    expect(artifacts[0]!.metadata.usage).toStrictEqual({ prompt_tokens: 30, completion_tokens: 9, total_tokens: 39 });

    const bad = gatewayWith(() => reply(message({ usage: { input_tokens: 20 } })));
    const badSpy = chargeSpy();
    await expect(bad.gateway.call(request({ costEnvelope: badSpy.costEnvelope })))
      .rejects.toMatchObject({ code: "PROVIDER_USAGE_INVALID" });
    expect(bad.sent).toHaveLength(1);
    expect(badSpy.charges).toHaveLength(1);
  });
});

describe("PR B — a billed reply with no usage is never charged as zero", () => {
  const PRICE = { inputMicrosPerMillionTokens: 500_000, outputMicrosPerMillionTokens: 2_500_000 };
  const observed: Array<{ usage: unknown; projection: { requestBytes: number; completionTokenCeiling: number } }> = [];
  const seam = {
    assertCallAllowed: () => undefined,
    recordCall: (call: { usage: unknown; projection: { requestBytes: number; completionTokenCeiling: number } }) => { observed.push(call); },
    assertUsageReported: () => undefined
  };

  for (const [label, usage] of [["absent", undefined], ["null", null]] as const) {
    it(`a refusal whose usage is ${label} is charged the projected maximum, exactly, then refused as PROVIDER_USAGE_INVALID`, async () => {
      observed.length = 0;
      const body = message({ content: [], stop_reason: "refusal" });
      if (usage === undefined) delete body.usage; else body.usage = usage;
      const { gateway, sent, ledger } = gatewayWith(() => reply(body));
      await expect(gateway.call(request({ costEnvelope: seam }))).rejects.toMatchObject({ code: "PROVIDER_USAGE_INVALID" });
      expect(sent).toHaveLength(1);
      expect(ledger.map((row) => row.outcome)).toEqual(["FAILED"]);
      expect(observed).toHaveLength(1);
      const requestBytes = Buffer.byteLength(sent[0]!.body, "utf8");
      expect(observed[0]!.projection).toStrictEqual({ requestBytes, completionTokenCeiling: TOKEN_CEILING });
      const charged = chargeableUsage(observed[0]!.usage, observed[0]!.projection);
      expect(charged).toStrictEqual({ promptTokens: Math.ceil(requestBytes / 2), completionTokens: TOKEN_CEILING });
      expect(chargeMicrosForUsage(PRICE, charged!)).toBe(
        Math.ceil(Math.ceil(requestBytes / 2) * 500_000 / 1_000_000) + Math.ceil(TOKEN_CEILING * 2_500_000 / 1_000_000)
      );
    });
  }

  it("a usable reply with no usage is charged the projection too; a vendor error page is charged nothing", async () => {
    observed.length = 0;
    const body = message();
    delete body.usage;
    const { gateway } = gatewayWith(() => reply(body));
    await expect(gateway.call(request({ costEnvelope: seam }))).rejects.toMatchObject({ code: "PROVIDER_USAGE_INVALID" });
    expect(chargeableUsage(observed[0]!.usage, observed[0]!.projection)).not.toBeNull();
    observed.length = 0;
    const failing = gatewayWith(() => vendorError(529, "overloaded_error"));
    await expect(failing.gateway.call(request({ costEnvelope: seam }))).rejects.toBeInstanceOf(ProviderCallFailedError);
    expect(observed.map((call) => chargeableUsage(call.usage, call.projection))).toEqual([null, null, null]);
  });

  it("a refusal WITH usage is charged its own counts before it is raised", async () => {
    observed.length = 0;
    const { gateway } = gatewayWith(() => reply(message({ content: [], stop_reason: "refusal" })));
    const failure = await gateway.call(request({ costEnvelope: seam })).catch((error: unknown) => error);
    expect((failure as ProviderCallFailedError).cause).toMatchObject({ code: PROVIDER_CONTENT_REFUSED });
    expect(chargeableUsage(observed[0]!.usage, observed[0]!.projection)).toStrictEqual({ promptTokens: 10, completionTokens: 5 });
  });
});

describe("PR B — the key never leaves the request headers", () => {
  const KEY = "sk-ant-fixture-SECRET-0123456789";
  const scenarios: ReadonlyArray<readonly [string, (attempt: number) => Response, Readonly<Record<string, unknown>>]> = [
    ["an accepted reply", () => reply(message()), {}],
    ["a refusal", () => reply(message({ content: [], stop_reason: "refusal" })), {}],
    ["a tool call", () => reply(message({ content: [{ type: "tool_use", id: "t", name: "x", input: {} }] })), {}],
    ["a 401", () => vendorError(401, "authentication_error"), {}],
    ["a 529", () => vendorError(529, "overloaded_error"), {}],
    ["a body that is not JSON", () => reply("not json"), {}],
    ["another model", () => reply(message({ model: "claude-other" })), {}],
    ["malformed usage", () => reply(message({ usage: { input_tokens: "x" } })), {}],
    ["a packet it cannot say", () => reply(message()), { packet: { messages: [...PACKET.messages, { role: "assistant", content: "p" }] } }]
  ];
  for (const [label, respond, extra] of scenarios) {
    it(`is in no error, artifact, ledger row or usage record on ${label}`, async () => {
      const { gateway, sent, ledger, artifacts } = gatewayWith(respond, { authorizationHeader: KEY });
      const charges: unknown[] = [];
      const outcome = await gateway.call(request({
        ...extra,
        costEnvelope: {
          assertCallAllowed: () => undefined,
          recordCall: (call: unknown) => { charges.push(call); },
          assertUsageReported: () => undefined
        }
      })).then((value) => value, (error: unknown) => error);
      const error = outcome instanceof Error ? outcome : null;
      const recorded = JSON.stringify({ outcome, artifacts, ledger, charges })
        + (error === null ? "" : `${String(error)} ${error.stack ?? ""} ${String((error as { cause?: unknown }).cause)}`);
      expect(recorded).not.toContain(KEY);
      expect(recorded).not.toContain("SECRET");
      // Control: the key WAS on the wire, in the one header meant for it.
      for (const call of sent) expect(call.headers["x-api-key"]).toBe(KEY);
    });
  }

  it("a refused credential is named by code only", () => {
    const thrown = (() => {
      try {
        new AnthropicMessagesProviderGateway({
          endpoint: BASE_URL, model: MODEL, maker: "Anthropic", authorizationHeader: `Bearer ${KEY}`,
          persistRawArtifact: async () => "a", appendLedgerEntry: async () => "l", assertNoOpenWriteTransaction: () => undefined
        });
      } catch (error) { return error as Error; }
      return null;
    })();
    expect(thrown?.message).toBe("PROVIDER_GATEWAY_CREDENTIAL_INVALID");
    expect(`${String(thrown)} ${thrown?.stack ?? ""}`).not.toContain("SECRET");
  });
});

describe("PR B — vendor errors take the shared transport path", () => {
  for (const [status, type] of [[400, "invalid_request_error"], [401, "authentication_error"], [429, "rate_limit_error"], [529, "overloaded_error"]] as const) {
    it(`HTTP ${status} ${type} is PROVIDER_HTTP_STATUS_${status}, within the call bound`, async () => {
      const { gateway, sent, ledger } = gatewayWith(() => vendorError(status, type));
      const failure = await gateway.call(request()).catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(ProviderCallFailedError);
      expect(((failure as ProviderCallFailedError).cause as Error).message).toBe(`PROVIDER_HTTP_STATUS_${status}`);
      expect(sent).toHaveLength(3);
      expect(ledger.map((row) => row.outcome)).toEqual(["FAILED", "FAILED", "FAILED"]);
    });
  }

  it("a 200 with a body that is not JSON is a failed call, within the call bound", async () => {
    const { gateway, sent } = gatewayWith(() => reply("not json"));
    await expect(gateway.call(request())).rejects.toBeInstanceOf(ProviderCallFailedError);
    expect(sent).toHaveLength(3);
  });
});

describe("PR B — construction refuses what would fail on every call", () => {
  const base = {
    endpoint: BASE_URL, model: MODEL, maker: "Anthropic",
    persistRawArtifact: async () => "a", appendLedgerEntry: async () => "l",
    assertNoOpenWriteTransaction: () => undefined
  };
  it("refuses a credential carrying an auth scheme, a relay level spelling, an unlisted level and an unknown kind", () => {
    expect(() => new AnthropicMessagesProviderGateway({ ...base, authorizationHeader: "Bearer fixture" }))
      .toThrowError(new TypeError("PROVIDER_GATEWAY_CREDENTIAL_INVALID"));
    expect(() => new AnthropicMessagesProviderGateway({ ...base, thinking: { parameter: "x_thinking_level", levels: ["high"] } }))
      .toThrowError(new TypeError("PROVIDER_GATEWAY_THINKING_INVALID"));
    expect(() => new AnthropicMessagesProviderGateway({ ...base, thinking: { parameter: "reasoning_effort", levels: ["low", "high"] } }))
      .toThrowError(new TypeError("PROVIDER_GATEWAY_THINKING_INVALID"));
    for (const credential of ["", "key with space", "key\twith-tab", "k\u00e9y", "key\n"]) {
      expect(() => new AnthropicMessagesProviderGateway({ ...base, authorizationHeader: credential }))
        .toThrowError(new TypeError("PROVIDER_GATEWAY_CREDENTIAL_INVALID"));
    }
    expect(() => new OpenAICompatibleProviderGateway({ ...base, adapterKind: "other" as never }))
      .toThrowError(new TypeError("PROVIDER_ADAPTER_KIND_UNKNOWN"));
    expect(() => new AnthropicMessagesProviderGateway({ ...base, authorizationHeader: "fixture-key", ...HIGH })).not.toThrow();
  });

  it("ties the wire to the host both ways", () => {
    for (const endpoint of ["https://proxy.example/v1", "https://api.anthropic.com/v2/v1", "http://api.anthropic.com/v1"]) {
      expect(() => new AnthropicMessagesProviderGateway({ ...base, endpoint }))
        .toThrowError(new TypeError("PROVIDER_ADAPTER_HOST_MISMATCH"));
    }
    for (const endpoint of [BASE_URL, "https://API.anthropic.com./v1"]) {
      expect(() => new OpenAICompatibleProviderGateway({ ...base, endpoint }))
        .toThrowError(new TypeError("PROVIDER_ADAPTER_HOST_MISMATCH"));
    }
    // Control: the OpenAI wire on any other host is untouched.
    expect(() => new OpenAICompatibleProviderGateway({ ...base, endpoint: "https://api.deepinfra.com/v1/openai" })).not.toThrow();
  });

  it("is registered as a built-in adapter", () => {
    expect(BUILT_IN_PROVIDER_ADAPTERS.map((row) => row.adapterKind)).toContain(ANTHROPIC_MESSAGES_HTTP_ADAPTER_KIND);
  });
});

describe("PR B — the target and the register pick the wire", () => {
  const targetJson = (extra: Readonly<Record<string, unknown>> = {}) => JSON.stringify([{
    provider_ref: "vendor:anthropic", base_url: BASE_URL, model: MODEL, ...extra
  }]);

  it("accepts the Anthropic base URL and marks the target native only when the register row says so", () => {
    const native = parseProviderDiscoveryTargets(targetJson({ thinking_parameter: "reasoning_effort", thinking_levels: ["high"] }), [
      { providerRef: "vendor:anthropic", maker: "Anthropic", adapterKind: ANTHROPIC_MESSAGES_HTTP_ADAPTER_KIND }
    ])[0]!;
    expect(native.baseUrl).toBe(BASE_URL);
    expect(native.adapterKind).toBe(ANTHROPIC_MESSAGES_HTTP_ADAPTER_KIND);
    // The gate PR: Claude Haiku is a reviewed preview row, so its output bound (32,768) caps max_tokens.
    expect(providerTargetGatewayControls(native)).toStrictEqual({
      thinking: { parameter: "reasoning_effort", levels: ["high"] },
      adapterKind: ANTHROPIC_MESSAGES_HTTP_ADAPTER_KIND,
      maxOutputTokens: 32_768
    });
    const elsewhere = JSON.stringify([{ provider_ref: "vendor:anthropic", base_url: "https://api.deepinfra.com/v1/openai", model: MODEL }]);
    for (const configured of [
      { providerRef: "vendor:anthropic", maker: "Anthropic" },
      { providerRef: "vendor:anthropic", maker: "Anthropic", adapterKind: "openai-compatible-http" }
    ]) {
      const plain = parseProviderDiscoveryTargets(elsewhere, [configured])[0]!;
      expect(Object.hasOwn(plain, "adapterKind")).toBe(false);
      expect(providerTargetGatewayControls(plain)).toStrictEqual({});
    }
  });

  it("refuses a kind no shipped adapter serves, and a wire on the wrong host", () => {
    expect(() => parseProviderDiscoveryTargets(targetJson(), [{ providerRef: "vendor:anthropic", maker: "Anthropic", adapterKind: "provider-plugin" }]))
      .toThrowError(new TypeError("PROVIDER_ADAPTER_KIND_UNKNOWN"));
    expect(() => parseProviderDiscoveryTargets(JSON.stringify([{ provider_ref: "vendor:anthropic", base_url: "https://proxy.example/v1", model: MODEL }]),
      [{ providerRef: "vendor:anthropic", maker: "Anthropic", adapterKind: ANTHROPIC_MESSAGES_HTTP_ADAPTER_KIND }]))
      .toThrowError(new TypeError("PROVIDER_ADAPTER_HOST_MISMATCH"));
    for (const configured of [
      { providerRef: "vendor:anthropic", maker: "Anthropic" },
      { providerRef: "vendor:anthropic", maker: "Anthropic", adapterKind: "openai-compatible-http" },
      { providerRef: "vendor:anthropic", maker: "Anthropic", adapterKind: "vllm-openai-compatible-http" }
    ]) {
      expect(() => parseProviderDiscoveryTargets(targetJson(), [configured]))
        .toThrowError(new TypeError("PROVIDER_ADAPTER_HOST_MISMATCH"));
    }
  });

  it("refuses a native target declaring a level its wire cannot carry, or the relay spelling", () => {
    const configured = [{ providerRef: "vendor:anthropic", maker: "Anthropic", adapterKind: ANTHROPIC_MESSAGES_HTTP_ADAPTER_KIND }];
    for (const thinking of [
      { thinking_parameter: "reasoning_effort", thinking_levels: ["low", "high"] },
      { thinking_parameter: "x_thinking_level", thinking_levels: ["high"] }
    ]) {
      expect(() => parseProviderDiscoveryTargets(targetJson(thinking), configured))
        .toThrowError(new TypeError("PROVIDER_DISCOVERY_TARGET_THINKING_INVALID"));
    }
    // Control: the same declaration on an OpenAI-compatible target is still lawful.
    expect(() => parseProviderDiscoveryTargets(
      JSON.stringify([{ provider_ref: "vendor:anthropic", base_url: "https://api.deepinfra.com/v1/openai", model: MODEL,
        thinking_parameter: "reasoning_effort", thinking_levels: ["low", "high"] }]),
      [{ providerRef: "vendor:anthropic", maker: "Anthropic" }]
    )).not.toThrow();
  });

  const registerPool = (value: unknown): Pool => ({
    query: async () => ({ rows: [{ value_json: value, source_ref: "fixture-source-ref" }] })
  }) as unknown as Pool;
  const vetting = { dataUseTermsReviewedOn: "2026-10-10", retentionTermsReviewedOn: "2026-10-10", namedInPrivacyNotice: true };

  it("the register row accepts the kind, and the reader carries it only for the native wire", async () => {
    const row = buildConfiguredProviderSetDeploymentRow({
      requiredDistinctMakers: 2,
      providers: [
        { providerRef: "vendor:glm", adapterKind: "openai-compatible-http", maker: "Z.AI", vetting },
        { providerRef: "vendor:anthropic", adapterKind: ANTHROPIC_MESSAGES_HTTP_ADAPTER_KIND, maker: "Anthropic", vetting }
      ]
    }, "fixture-source-ref");
    const capability = await readDeploymentMakerCapability(registerPool(row.value), 3);
    expect(capability.configuredProviders).toStrictEqual([
      { providerRef: "vendor:glm", maker: "Z.AI" },
      { providerRef: "vendor:anthropic", maker: "Anthropic", adapterKind: ANTHROPIC_MESSAGES_HTTP_ADAPTER_KIND }
    ]);
    expect(capability.deploymentMakerCapability).toBe(true);
  });

  it("the reader passes a kind no shipped adapter serves, so the target parser refuses it by name", async () => {
    const sealed = buildConfiguredProviderSetSealedRow({
      requiredDistinctMakers: 1,
      providers: [{ providerRef: "vendor:odd", adapterKind: "provider-plugin", maker: "Odd" }]
    }, "fixture-source-ref");
    const capability = await readDeploymentMakerCapability(registerPool(sealed.value), 1);
    expect(capability.configuredProviders).toStrictEqual([{ providerRef: "vendor:odd", maker: "Odd", adapterKind: "provider-plugin" }]);
    expect(() => parseProviderDiscoveryTargets(
      JSON.stringify([{ provider_ref: "vendor:odd", base_url: "https://odd.example/v1", model: "m" }]),
      capability.configuredProviders
    )).toThrowError(new TypeError("PROVIDER_ADAPTER_KIND_UNKNOWN"));
  });

  it("an old sealed row still reads as exactly two members per provider", async () => {
    const sealed = buildConfiguredProviderSetSealedRow({
      requiredDistinctMakers: 1,
      providers: [
        { providerRef: "development:codex-cli", adapterKind: "openai-compatible-http", maker: "OpenAI" },
        { providerRef: "development:vllm", adapterKind: "vllm-openai-compatible-http", maker: "Local" }
      ]
    }, "fixture-source-ref");
    const capability = await readDeploymentMakerCapability(registerPool(sealed.value), 1);
    expect(capability.configuredProviders).toStrictEqual([
      { providerRef: "development:codex-cli", maker: "OpenAI" },
      { providerRef: "development:vllm", maker: "Local" }
    ]);
  });
});

describe("PR B — the discovery probe speaks the target's wire", () => {
  const target: ProviderDiscoveryTarget = Object.freeze({
    providerRef: "vendor:anthropic", maker: "Anthropic", baseUrl: BASE_URL, model: MODEL,
    authorizationHeader: "fixture-key", adapterKind: ANTHROPIC_MESSAGES_HTTP_ADAPTER_KIND,
    thinkingParameter: "reasoning_effort", thinkingLevels: ["high"]
  });

  async function probe(response: () => Response, extra: Readonly<{ thinkingLevel?: string; tokenCeiling?: number }> = {}) {
    const sent: Sent[] = [];
    const observation = await observeProviderTarget({
      target, timeoutMs: 1_000, clock: () => new Date(0), ...extra,
      fetchImplementation: async (url, init) => {
        sent.push({ url: String(url), headers: { ...(init?.headers as Record<string, string>) }, body: String(init?.body) });
        return response();
      }
    });
    return { observation, sent };
  }
  const okReply = () => reply(message({ content: [{ type: "thinking", thinking: "" }, { type: "text", text: "OK" }] }));

  it("is HEALTHY on an \"OK\" from the pinned model, sent as a Messages body", async () => {
    const { observation, sent } = await probe(okReply);
    expect(observation).toMatchObject({ state: "HEALTHY", modelId: MODEL, failureCode: null });
    expect(sent[0]!.url).toBe("https://api.anthropic.com/v1/messages");
    expect(sent[0]!.headers["x-api-key"]).toBe("fixture-key");
    expect(Object.hasOwn(sent[0]!.headers, "authorization")).toBe(false);
    expect(JSON.parse(sent[0]!.body)).toStrictEqual({
      model: MODEL, max_tokens: 512,
      messages: [{ role: "user", content: "DR-181 discovery health probe. Reply exactly: OK" }]
    });
    const high = await probe(okReply, { thinkingLevel: "high", tokenCeiling: 300 });
    expect(JSON.parse(high.sent[0]!.body)).toMatchObject({ max_tokens: 300, output_config: { effort: "high" } });
  });

  for (const [label, response] of [
    ["another model", () => reply(message({ model: "claude-other", content: [{ type: "text", text: "OK" }] }))],
    ["another answer", () => reply(message({ content: [{ type: "text", text: "Sure, OK" }] }))],
    ["a refusal", () => reply(message({ content: [{ type: "text", text: "OK" }], stop_reason: "refusal" }))],
    ["a truncation", () => reply(message({ content: [{ type: "text", text: "OK" }], stop_reason: "max_tokens" }))],
    ["an overloaded vendor", () => vendorError(529, "overloaded_error")]
  ] as const) {
    it(`is ABSENT on ${label}`, async () => {
      expect((await probe(response)).observation).toMatchObject({ state: "ABSENT", failureCode: "PROVIDER_PROBE_FAILED" });
    });
  }
});
