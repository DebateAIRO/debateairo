import { describe, expect, it } from "vitest";
import {
  CLI_RELAY_CONTEXT_WINDOW_EXCEEDED,
  CLI_RELAY_THINKING_LEVEL_UNSUPPORTED,
  CLI_RELAY_USAGE_CAP,
  OpenAICompatibleProviderGateway,
  PROVIDER_CONTEXT_WINDOW_EXCEEDED,
  PROVIDER_THINKING_LEVEL_CHANGED,
  PROVIDER_THINKING_LEVEL_UNSUPPORTED,
  PROVIDER_USAGE_CAP,
  ProviderCallFailedError,
  estimatePromptTokens,
  estimateWindowTokens,
  reportedReasoningTokens,
  type OpenAICompatibleGatewayOptions,
  type PromptPacket
} from "@debateai/providers";
import { framedFixturePacket } from "../support/framed-packet.js";

// Model scorecard §2.2 / §2.10 / R4 / R7: the level reaches the wire only when
// asked and only in the target's own member; an undeclared level, a relay that
// ran another level, a prompt over the declared window and a subscription at
// its cap are each a typed refusal that is never retried.

const MODEL = "fixture/model";
const TOKEN_CEILING = 64;
const PACKET = framedFixturePacket("thinking");
const RELAY = { thinking: { parameter: "x_thinking_level" as const, levels: ["low", "high"] } };
const VENDOR = { thinking: { parameter: "reasoning_effort" as const, levels: ["low", "medium", "high"] } };

type Controls = Pick<OpenAICompatibleGatewayOptions, "thinking" | "contextWindowTokens">;

function gatewayWith(respond: (attempt: number) => Response, controls: Controls = {}) {
  const bodies: string[] = [];
  const ledger: Array<{ outcome: string }> = [];
  const artifacts: Array<{ metadata: Readonly<Record<string, unknown>> }> = [];
  const gateway = new OpenAICompatibleProviderGateway({
    endpoint: "http://fixture/v1", model: MODEL, maker: "fixture",
    fetchImplementation: async (_url, init) => {
      bodies.push(String(init?.body));
      return respond(bodies.length);
    },
    sleepImplementation: async () => undefined,
    persistRawArtifact: async (artifact) => { artifacts.push(artifact); return artifact.artifactId; },
    appendLedgerEntry: async (entry) => { ledger.push(entry); return `ledger:${ledger.length}`; },
    assertNoOpenWriteTransaction: () => undefined,
    ...controls
  });
  return { gateway, bodies, ledger, artifacts };
}

function completion(extra: Readonly<Record<string, unknown>> = {}): Response {
  return new Response(JSON.stringify({
    id: "call", model: MODEL, choices: [{ message: { content: "ok" }, finish_reason: "stop" }], ...extra
  }));
}

function request(extra: Readonly<Record<string, unknown>> = {}) {
  return {
    runId: null, subjectItemId: "node:thinking", callSiteKey: "JUDGE",
    role: "JUDGE" as const, lane: "served" as const,
    bound: { maxAttempts: 3, tokenCeiling: TOKEN_CEILING, deadlineMs: 5_000 },
    contractHash: "contract:thinking", providerRef: "provider:thinking", packet: PACKET,
    ...extra
  };
}

describe("model scorecard — the thinking level on the wire", () => {
  it("sends today's three-member body, byte for byte, when no level is requested — declared levels or not", async () => {
    const expected = JSON.stringify({ model: MODEL, max_tokens: TOKEN_CEILING, messages: PACKET.messages });
    for (const controls of [{}, RELAY, VENDOR]) {
      const { gateway, bodies } = gatewayWith(() => completion(), controls);
      await gateway.call(request());
      await gateway.call(request({ thinkingLevel: "DEFAULT_ONLY" }));
      expect(bodies).toEqual([expected, expected]);
    }
  });

  it("adds exactly one member, named by the target, when a declared level is requested", async () => {
    for (const [controls, member] of [[RELAY, "x_thinking_level"], [VENDOR, "reasoning_effort"]] as const) {
      const { gateway, bodies } = gatewayWith(() => completion(), controls);
      await gateway.call(request({ thinkingLevel: "high" }));
      expect(bodies).toEqual([JSON.stringify({
        model: MODEL, max_tokens: TOKEN_CEILING, [member]: "high", messages: PACKET.messages
      })]);
    }
  });

  it("refuses an undeclared level BEFORE sending: PROVIDER_THINKING_LEVEL_UNSUPPORTED, no call, no ledger row", async () => {
    for (const [controls, level] of [[{}, "high"], [RELAY, "medium"], [RELAY, "HIGH"], [VENDOR, "--effort"]] as const) {
      const { gateway, bodies, ledger } = gatewayWith(() => completion(), controls);
      await expect(gateway.call(request({ thinkingLevel: level })))
        .rejects.toMatchObject({ code: PROVIDER_THINKING_LEVEL_UNSUPPORTED });
      expect(bodies).toEqual([]);
      expect(ledger).toEqual([]);
    }
  });

  it("reports the level the call ran at: the relay's echo, else the level sent, else DEFAULT_ONLY", async () => {
    const cases = [
      { controls: RELAY, reply: completion({ x_thinking_level: "high" }), asked: {}, used: "high" },
      { controls: RELAY, reply: completion({ x_thinking_level: "low" }), asked: { thinkingLevel: "low" }, used: "low" },
      { controls: VENDOR, reply: completion(), asked: { thinkingLevel: "medium" }, used: "medium" },
      { controls: {}, reply: completion(), asked: {}, used: "DEFAULT_ONLY" }
    ];
    for (const { controls, reply, asked, used } of cases) {
      const { gateway } = gatewayWith(() => reply, controls);
      await expect(gateway.call(request(asked))).resolves.toMatchObject({ thinkingLevel: used });
    }
  });

  it("refuses a relay that ran another level than asked: PROVIDER_THINKING_LEVEL_CHANGED, one FAILED row, no retry", async () => {
    const { gateway, bodies, ledger } = gatewayWith(() => completion({ x_thinking_level: "low" }), RELAY);
    await expect(gateway.call(request({ thinkingLevel: "high" })))
      .rejects.toMatchObject({ code: PROVIDER_THINKING_LEVEL_CHANGED });
    expect(bodies).toHaveLength(1);
    expect(ledger.map((entry) => entry.outcome)).toEqual(["FAILED"]);
  });
});

describe("model scorecard — the context window and the usage cap", () => {
  it("estimates prompt tokens as characters / 4, rounded up, over every message", () => {
    const messages: PromptPacket["messages"] = [
      { role: "system", content: "abcd" },
      { role: "user", content: "efghi" }
    ];
    expect(estimatePromptTokens(messages)).toBe(3);
    expect(estimatePromptTokens([])).toBe(0);
  });

  it("sizes the window wall as UTF-8 bytes / 2, rounded up — the relays' same rule (R1)", () => {
    // "ăîșțâ" is 5 characters but 10 UTF-8 bytes: the wall counts 5 tokens, the plain estimate 2.
    const romanian: PromptPacket["messages"] = [{ role: "user", content: "ăîșțâ" }];
    expect(estimateWindowTokens(romanian)).toBe(5);
    expect(estimatePromptTokens(romanian)).toBe(2);
    expect(estimateWindowTokens([{ role: "user", content: "abc" }])).toBe(2);
    expect(estimateWindowTokens([])).toBe(0);
  });

  it("refuses a prompt that cannot fit the declared window before sending: one FAILED row, no retry", async () => {
    const fits = estimateWindowTokens(PACKET.messages) + TOKEN_CEILING;
    const refused = gatewayWith(() => completion(), { contextWindowTokens: fits - 1 });
    await expect(refused.gateway.call(request()))
      .rejects.toMatchObject({ code: PROVIDER_CONTEXT_WINDOW_EXCEEDED });
    expect(refused.bodies).toEqual([]);
    expect(refused.ledger.map((entry) => entry.outcome)).toEqual(["FAILED"]);
    const admitted = gatewayWith(() => completion(), { contextWindowTokens: fits });
    await expect(admitted.gateway.call(request())).resolves.toMatchObject({ content: "ok" });
  });

  it("stops at the relay's usage cap without retrying, and still retries a bare 429", async () => {
    const capped = gatewayWith(() => new Response(JSON.stringify({
      error: CLI_RELAY_USAGE_CAP, x_cli_relay_error: CLI_RELAY_USAGE_CAP
    }), { status: 429 }));
    // Pre-flight ruling F11: today's PROVIDER_CALL_FAILED, with the cap as its cause, after ONE attempt.
    const cap = await capped.gateway.call(request()).catch((error: unknown) => error);
    expect(cap).toBeInstanceOf(ProviderCallFailedError);
    expect(cap).toMatchObject({ code: "PROVIDER_CALL_FAILED", attempts: 1, lastOutcome: "FAILED" });
    expect((cap as ProviderCallFailedError).cause).toMatchObject({ code: PROVIDER_USAGE_CAP });
    expect(capped.bodies).toHaveLength(1);
    expect(capped.ledger.map((entry) => entry.outcome)).toEqual(["FAILED"]);

    const limited = gatewayWith(() => new Response(JSON.stringify({ error: "rate_limited" }), { status: 429 }));
    const failure = await limited.gateway.call(request()).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ProviderCallFailedError);
    expect(limited.bodies).toHaveLength(3);
  });
});

describe("model scorecard — a relay's own refusals (R1, pre-flight fix F1)", () => {
  it.each([
    { status: 413, marker: CLI_RELAY_CONTEXT_WINDOW_EXCEEDED, code: PROVIDER_CONTEXT_WINDOW_EXCEEDED },
    { status: 400, marker: CLI_RELAY_THINKING_LEVEL_UNSUPPORTED, code: PROVIDER_THINKING_LEVEL_UNSUPPORTED }
  ])("maps the relay's $status $marker to $code: one FAILED row, no retry, never a transport failure", async ({ status, marker, code }) => {
    const refused = gatewayWith(() => new Response(JSON.stringify({ error: marker, x_cli_relay_error: marker }), { status }));
    const failure = await refused.gateway.call(request()).catch((error: unknown) => error);
    expect(failure).not.toBeInstanceOf(ProviderCallFailedError);
    expect(failure).toMatchObject({ code });
    expect(refused.bodies).toHaveLength(1);
    expect(refused.ledger.map((entry) => entry.outcome)).toEqual(["FAILED"]);
  });

  it("still retries a bare 413 or 400 without the relay's marker, as today", async () => {
    for (const status of [413, 400]) {
      const plain = gatewayWith(() => new Response(JSON.stringify({ error: "vendor_refusal" }), { status }));
      const failure = await plain.gateway.call(request()).catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(ProviderCallFailedError);
      expect(plain.bodies).toHaveLength(3);
    }
  });
});

describe("model scorecard — thinking tokens", () => {
  it("reads completion_tokens_details.reasoning_tokens, and nothing else", () => {
    expect(reportedReasoningTokens({ completion_tokens_details: { reasoning_tokens: 7 } })).toBe(7);
    expect(reportedReasoningTokens({ completion_tokens_details: { reasoning_tokens: 0 } })).toBe(0);
    for (const unreported of [
      undefined, null, [], {}, { completion_tokens_details: null },
      { completion_tokens_details: { reasoning_tokens: -1 } },
      { completion_tokens_details: { reasoning_tokens: 1.5 } },
      { completion_tokens_details: { reasoning_tokens: "7" } },
      { completion_tokens_details: { reasoning_tokens: 2 ** 31 } },
      { reasoning_tokens: 7 }
    ]) {
      expect(reportedReasoningTokens(unreported)).toBeNull();
    }
  });

  it("returns the thinking tokens while the artifact's usage keeps only its four counters", async () => {
    const { gateway, artifacts } = gatewayWith(() => completion({
      usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5, completion_tokens_details: { reasoning_tokens: 7 } }
    }));
    await expect(gateway.call(request())).resolves.toMatchObject({ reasoningTokens: 7 });
    expect(artifacts[0]?.metadata.usage).toEqual({ prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 });
  });
});
