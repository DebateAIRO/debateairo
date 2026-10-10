import { describe, expect, it } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import {
  BUILT_IN_PROVIDER_ADAPTERS,
  GOOGLE_GEMINI_BASE_URL,
  GOOGLE_GEMINI_HTTP_ADAPTER_KIND,
  GeminiGenerateProviderGateway,
  OpenAICompatibleProviderGateway,
  PROVIDER_CONTENT_LENGTH_EXCEEDED,
  PROVIDER_CONTENT_REFUSED,
  ProviderCallFailedError,
  ProviderContentUnacceptedError,
  assertDeploymentProviderTargets,
  createProviderGatewayForAdapter,
  geminiGenerateContentBody,
  geminiGenerateContentUrl,
  geminiPreviewRequestBody,
  observeProviderTarget,
  parseProviderDiscoveryTargets,
  providerTargetGatewayControls,
  readGeminiReply,
  readGeminiUsage,
  type OpenAICompatibleGatewayOptions,
  type ProviderCostEnvelopeSeam,
  type ProviderDiscoveryTarget,
  type ProviderLedgerInput,
  type RawArtifactInput
} from "@debateai/providers";
import { chargeableUsage } from "@debateai/budget";
import { buildConfiguredProviderSetSealedRow } from "@debateai/register";
import { framedFixturePacket } from "../support/framed-packet.js";

/**
 * PR C (preview multi-model build) — the native Google Gemini `generateContent`
 * adapter, against a FAKE fetch: no network, no key. The wire shapes asserted
 * here are the lead's contract (Google section), which the preview gate
 * validates byte for byte, so these tests pin the exact bytes.
 */

const MODEL = "gemini-3.8-flash";
const URL_EXPECTED = `${GOOGLE_GEMINI_BASE_URL}/models/${MODEL}:generateContent`;
// A fixture value only: never a real key, and never sent anywhere.
const FIXTURE_CREDENTIAL = "fixture-gemini-credential";

type Captured = { url: string; init: RequestInit };

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function geminiAnswer(
  parts: readonly Record<string, unknown>[],
  extra: Readonly<Record<string, unknown>> = {},
  finishReason = "STOP"
): Record<string, unknown> {
  return {
    candidates: [{ content: { role: "model", parts }, finishReason, index: 0 }],
    usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, thoughtsTokenCount: 30, totalTokenCount: 150 },
    modelVersion: MODEL,
    responseId: "fixture-response-1",
    ...extra
  };
}

function scripted(replies: readonly (() => Response)[], captured: Captured[]): typeof fetch {
  let index = 0;
  return (async (input: string | URL | Request, init?: RequestInit) => {
    captured.push({ url: String(input), init: init ?? {} });
    const next = replies[Math.min(index, replies.length - 1)]!;
    index += 1;
    return next();
  }) as typeof fetch;
}

function harness(
  replies: readonly (() => Response)[],
  extra: Readonly<Record<string, unknown>> = {}
) {
  const captured: Captured[] = [];
  const ledger: ProviderLedgerInput[] = [];
  const artifacts: RawArtifactInput[] = [];
  const gateway = new GeminiGenerateProviderGateway({
    endpoint: GOOGLE_GEMINI_BASE_URL,
    model: MODEL,
    maker: "Google",
    authorizationHeader: FIXTURE_CREDENTIAL,
    fetchImplementation: scripted(replies, captured),
    sleepImplementation: async () => undefined,
    persistRawArtifact: async (artifact) => { artifacts.push(artifact); return `artifact:${artifacts.length}`; },
    appendLedgerEntry: async (entry) => { ledger.push(entry); return `ledger:${ledger.length}`; },
    assertNoOpenWriteTransaction: () => undefined,
    ...extra
  } as OpenAICompatibleGatewayOptions);
  return { gateway, captured, ledger, artifacts };
}

function callRequest(extra: Record<string, unknown> = {}) {
  return {
    runId: "run-1", subjectItemId: "node:test", callSiteKey: "fixture:judge",
    role: "JUDGE" as const, lane: "served" as const,
    bound: { maxAttempts: 3, tokenCeiling: 64, deadlineMs: 5_000 },
    contractHash: "contract:test", providerRef: "google:gemini",
    packet: framedFixturePacket("q"),
    ...extra
  };
}

function recordingSeam() {
  const charges: unknown[] = [];
  const reported: unknown[] = [];
  const seam: ProviderCostEnvelopeSeam = {
    assertCallAllowed: () => undefined,
    recordCall: (observed) => { charges.push(observed.usage); },
    assertUsageReported: (observed) => { reported.push(observed.usage); }
  };
  return { seam, charges, reported };
}

const jsonClassifier = (content: string) => {
  try {
    JSON.parse(content);
    return { parseStatus: "PARSED" as const, parseError: null };
  } catch {
    return { parseStatus: "PARSE_FAILED" as const, parseError: "not JSON" };
  }
};

async function failure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected a refusal");
}

describe("PR C — the Gemini request: exact URL and body bytes", () => {
  it("posts the native body to {base}/models/{model}:generateContent with the key in x-goog-api-key", async () => {
    const { gateway, captured } = harness([() => reply(geminiAnswer([{ text: "{\"ok\":true}" }]))]);
    const packet = framedFixturePacket("q");
    await gateway.call(callRequest({ packet }));
    expect(captured).toHaveLength(1);
    const { url, init } = captured[0]!;
    expect(url).toBe(URL_EXPECTED);
    expect(url).not.toContain("?");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "content-type": "application/json", "x-goog-api-key": FIXTURE_CREDENTIAL });
    const [system, user] = packet.messages;
    expect(init.body).toBe(JSON.stringify({
      contents: [{ role: "user", parts: [{ text: user!.content }] }],
      systemInstruction: { parts: [{ text: system!.content }] },
      generationConfig: { maxOutputTokens: 64 }
    }));
    expect(Object.keys(JSON.parse(String(init.body)))).toEqual(["contents", "systemInstruction", "generationConfig"]);
  });

  it("puts thinkingConfig {thinkingLevel: high} inside generationConfig when the level is high", async () => {
    const { gateway, captured } = harness(
      [() => reply(geminiAnswer([{ text: "{\"ok\":true}" }]))],
      { thinking: { parameter: "reasoning_effort", levels: ["high"] } }
    );
    const result = await gateway.call(callRequest({ thinkingLevel: "high" }));
    const body = JSON.parse(String(captured[0]!.init.body)) as Record<string, unknown>;
    expect(body.generationConfig).toEqual({ maxOutputTokens: 64, thinkingConfig: { thinkingLevel: "high" } });
    expect(Object.keys(body.generationConfig as object)).toEqual(["maxOutputTokens", "thinkingConfig"]);
    expect(result.thinkingLevel).toBe("high");
  });

  it("refuses an undeclared level before anything is sent", async () => {
    const { gateway, captured } = harness([() => reply(geminiAnswer([{ text: "x" }]))]);
    await expect(gateway.call(callRequest({ thinkingLevel: "high" })))
      .rejects.toMatchObject({ code: "PROVIDER_THINKING_LEVEL_UNSUPPORTED" });
    expect(captured).toHaveLength(0);
  });

  it("sends no key header when no credential is configured (the preview gate adds it)", async () => {
    const { gateway, captured } = harness(
      [() => reply(geminiAnswer([{ text: "{\"ok\":true}" }]))],
      { authorizationHeader: undefined }
    );
    await gateway.call(callRequest());
    expect(captured[0]!.init.headers).toEqual({ "content-type": "application/json" });
  });

  it("builds the body without systemInstruction, speaks assistant as model, and joins system messages", () => {
    expect(geminiGenerateContentBody({
      messages: [{ role: "user", content: "a" }, { role: "assistant", content: "b" }, { role: "user", content: "c" }],
      maxOutputTokens: 10
    })).toBe('{"contents":[{"role":"user","parts":[{"text":"a"}]},{"role":"model","parts":[{"text":"b"}]},'
      + '{"role":"user","parts":[{"text":"c"}]}],"generationConfig":{"maxOutputTokens":10}}');
    expect(JSON.parse(geminiGenerateContentBody({
      messages: [{ role: "system", content: "s1" }, { role: "system", content: "s2" }, { role: "user", content: "u" }],
      maxOutputTokens: 10
    })).systemInstruction).toEqual({ parts: [{ text: "s1\n\ns2" }] });
    expect(() => geminiGenerateContentBody({ messages: [{ role: "assistant", content: "b" }], maxOutputTokens: 10 }))
      .toThrow(TypedDomainError);
    expect(() => geminiGenerateContentBody({ messages: [{ role: "user", content: "a" }], maxOutputTokens: 0 }))
      .toThrow(TypedDomainError);
  });

  it("never builds a URL with a query, another base, or a model id that is not one plain token", () => {
    expect(geminiGenerateContentUrl(GOOGLE_GEMINI_BASE_URL, MODEL)).toBe(URL_EXPECTED);
    for (const model of ["gemini-3.8-flash?key=x", "models/gemini", "gemini:x", "Gemini-3.8", "a%2fb", "", "a".repeat(65)]) {
      expect(() => geminiGenerateContentUrl(GOOGLE_GEMINI_BASE_URL, model)).toThrow(TypedDomainError);
    }
    expect(() => geminiGenerateContentUrl("https://generativelanguage.googleapis.com/v1", MODEL)).toThrow(TypedDomainError);
    expect(() => new GeminiGenerateProviderGateway({
      endpoint: "https://api.deepinfra.com/v1/openai", model: MODEL, maker: "Google",
      persistRawArtifact: async () => "a", appendLedgerEntry: async () => "l", assertNoOpenWriteTransaction: () => undefined
    })).toThrow("PROVIDER_GEMINI_ENDPOINT_INVALID");
  });

  it("refuses a credential in header-line form and a relay-style thinking parameter at construction", () => {
    const base = {
      endpoint: GOOGLE_GEMINI_BASE_URL, model: MODEL, maker: "Google",
      persistRawArtifact: async () => "a", appendLedgerEntry: async () => "l", assertNoOpenWriteTransaction: () => undefined
    };
    expect(() => new GeminiGenerateProviderGateway({ ...base, authorizationHeader: "Bearer fixture" }))
      .toThrow("PROVIDER_GEMINI_CREDENTIAL_FORM_INVALID");
    expect(() => new GeminiGenerateProviderGateway({ ...base, thinking: { parameter: "x_thinking_level", levels: ["high"] } }))
      .toThrow("PROVIDER_GEMINI_THINKING_INVALID");
    expect(() => new GeminiGenerateProviderGateway({ ...base, supportsJsonObjectResponse: true }))
      .toThrow(TypedDomainError);
  });
});

describe("PR C — the Gemini reply", () => {
  it("joins the text parts, ignores thought parts, records the wire and the thinking tokens", async () => {
    const { gateway, artifacts, ledger } = harness([() => reply(geminiAnswer([
      { text: "private reasoning", thought: true },
      { text: "{\"ok\":" },
      { text: "true}", thoughtSignature: "c2ln" }
    ]))]);
    const result = await gateway.call(callRequest());
    expect(result).toMatchObject({
      content: "{\"ok\":true}", provider: GOOGLE_GEMINI_HTTP_ADAPTER_KIND,
      model: MODEL, modelVersion: MODEL, maker: "Google", reasoningTokens: 30
    });
    expect(artifacts[0]).toMatchObject({
      provider: GOOGLE_GEMINI_HTTP_ADAPTER_KIND, model: MODEL, modelVersion: MODEL, thinkingTokens: 30,
      metadata: {
        status: 200, attempt: 1, finish_reason: "STOP", token_ceiling: 64,
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }
      }
    });
    expect(Object.keys(artifacts[0]!.metadata).sort()).toEqual(["attempt", "finish_reason", "status", "token_ceiling", "usage"]);
    expect(ledger.map((entry) => entry.outcome)).toEqual(["OK"]);
  });

  it("names MAX_TOKENS a truncation and retries the ORIGINAL packet under a raised bound", async () => {
    const { gateway, captured, ledger, artifacts } = harness([
      () => reply(geminiAnswer([{ text: "{\"ok\":" }], {}, "MAX_TOKENS")),
      () => reply(geminiAnswer([{ text: "thinking only", thought: true }], {}, "MAX_TOKENS")),
      () => reply(geminiAnswer([{ text: "{\"ok\":true}" }]))
    ]);
    const result = await gateway.call(callRequest({ classifyContent: jsonClassifier }));
    expect(result.content).toBe("{\"ok\":true}");
    const bounds = captured.map((call) => (JSON.parse(String(call.init.body)) as {
      generationConfig: { maxOutputTokens: number };
    }).generationConfig.maxOutputTokens);
    expect(bounds).toEqual([64, 128, 192]);
    expect(captured[1]!.init.body).toBe(String(captured[0]!.init.body).replace("\"maxOutputTokens\":64", "\"maxOutputTokens\":128"));
    expect(ledger.map((entry) => entry.outcome)).toEqual(["FAILED", "FAILED", "OK"]);
    expect(artifacts.map((artifact) => artifact.metadata.finish_reason)).toEqual(["MAX_TOKENS", "MAX_TOKENS", "STOP"]);
  });

  it("ends a call truncated on every attempt as LENGTH_EXCEEDED", async () => {
    const { gateway } = harness([() => reply(geminiAnswer([{ text: "{" }], {}, "MAX_TOKENS"))]);
    const error = await failure(gateway.call(callRequest({ classifyContent: jsonClassifier })));
    expect(error).toBeInstanceOf(ProviderContentUnacceptedError);
    expect((error as ProviderContentUnacceptedError).lastParseStatus).toBe(PROVIDER_CONTENT_LENGTH_EXCEEDED);
  });

  for (const [name, body] of [
    ["a SAFETY finish", geminiAnswer([], {}, "SAFETY")],
    ["a RECITATION finish", geminiAnswer([{ text: "partial" }], {}, "RECITATION")],
    ["an unknown finish reason", geminiAnswer([{ text: "{}" }], {}, "SOMETHING_NEW")],
    ["a blocked prompt", { promptFeedback: { blockReason: "PROHIBITED_CONTENT" }, usageMetadata: { promptTokenCount: 100, totalTokenCount: 100 }, modelVersion: MODEL }],
    ["no candidate", { candidates: [], usageMetadata: { promptTokenCount: 100, totalTokenCount: 100 }, modelVersion: MODEL }]
  ] as const) {
    it(`refuses ${name} as the vendor's own stop: charged, one FAILED row, not retried`, async () => {
      const { seam, charges } = recordingSeam();
      const { gateway, captured, ledger } = harness([() => reply(body)]);
      const error = await failure(gateway.call(callRequest({ costEnvelope: seam })));
      expect(error).toBeInstanceOf(ProviderCallFailedError);
      expect(((error as ProviderCallFailedError).cause as TypedDomainError).code).toBe(PROVIDER_CONTENT_REFUSED);
      expect(captured).toHaveLength(1);
      expect(ledger.map((entry) => entry.outcome)).toEqual(["FAILED"]);
      expect(charges).toHaveLength(1);
    });
  }

  it("records a prompt block's reason as a code token", () => {
    expect(readGeminiReply({ promptFeedback: { blockReason: "SAFETY" } })).toMatchObject({
      verdict: "REFUSED", blockReason: "SAFETY", recordedFinishReason: "PROMPT_BLOCKED:SAFETY", content: null
    });
  });

  it("refuses a modelVersion that is not exactly the pinned id, unwrapped and not retried", async () => {
    const { gateway, captured, ledger } = harness([
      () => reply(geminiAnswer([{ text: "{\"ok\":true}" }], { modelVersion: `${MODEL}-001` }))
    ]);
    await expect(gateway.call(callRequest())).rejects.toMatchObject({ code: "PROVIDER_MODEL_IDENTITY_CHANGED" });
    expect(captured).toHaveLength(1);
    expect(ledger.map((entry) => entry.outcome)).toEqual(["FAILED"]);
  });

  it("treats a function-call part (no tool was offered) as an unreadable reply and retries it", async () => {
    const { gateway, captured } = harness([
      () => reply(geminiAnswer([{ functionCall: { name: "x", args: {} } }]))
    ]);
    const error = await failure(gateway.call(callRequest()));
    expect(error).toBeInstanceOf(ProviderCallFailedError);
    expect(((error as ProviderCallFailedError).cause as TypedDomainError).code).toBe("PROVIDER_RESPONSE_INVALID");
    expect(captured).toHaveLength(3);
  });
});

describe("PR C — Gemini usage: input = prompt, output = candidates + thoughts", () => {
  it("hands the money seam the engine's spelling, with thoughts billed as output", async () => {
    const { seam, charges, reported } = recordingSeam();
    const { gateway } = harness([() => reply(geminiAnswer([{ text: "{\"ok\":true}" }]))]);
    await gateway.call(callRequest({ costEnvelope: seam }));
    expect(charges).toEqual([{ prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }]);
    expect(reported).toEqual([{ prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }]);
  });

  it("reads Google's omitted zero counters as zero inside a present block", () => {
    expect(readGeminiUsage({ promptTokenCount: 7, totalTokenCount: 7 })).toEqual({
      charge: { prompt_tokens: 7, completion_tokens: 0, total_tokens: 7 },
      reported: { prompt_tokens: 7, completion_tokens: 0, total_tokens: 7 },
      thoughtsTokens: null,
      problem: null
    });
    expect(readGeminiUsage({ promptTokenCount: 7, cachedContentTokenCount: 5, candidatesTokenCount: 3, totalTokenCount: 10 }).problem)
      .toBeNull();
  });

  it("reports nothing chargeable when the block is absent or empty", () => {
    expect(readGeminiUsage(undefined)).toEqual({ charge: undefined, reported: null, thoughtsTokens: null, problem: null });
    expect(readGeminiUsage({})).toEqual({ charge: {}, reported: null, thoughtsTokens: null, problem: null });
    expect(chargeableUsage(readGeminiUsage({}).charge, { requestBytes: 10, completionTokenCeiling: 10 })).toBeNull();
  });

  it("charges a total that does not add up at the higher reading, then refuses it unwrapped", async () => {
    expect(readGeminiUsage({ promptTokenCount: 100, candidatesTokenCount: 20, thoughtsTokenCount: 30, totalTokenCount: 170 }))
      .toMatchObject({ charge: { prompt_tokens: 100, completion_tokens: 70, total_tokens: 170 }, reported: null, problem: "INCONSISTENT" });
    expect(readGeminiUsage({ promptTokenCount: 100, candidatesTokenCount: 20, totalTokenCount: 90 }))
      .toMatchObject({ charge: { prompt_tokens: 100, completion_tokens: 20 }, problem: "INCONSISTENT" });
    expect(readGeminiUsage({ promptTokenCount: 100, toolUsePromptTokenCount: 5, candidatesTokenCount: 20, totalTokenCount: 120 }))
      .toMatchObject({ charge: { prompt_tokens: 105, completion_tokens: 20 }, problem: "INCONSISTENT" });
    const { seam, charges } = recordingSeam();
    const { gateway, captured } = harness([() => reply(geminiAnswer([{ text: "{}" }], {
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, totalTokenCount: 999 }
    }))]);
    await expect(gateway.call(callRequest({ costEnvelope: seam }))).rejects.toMatchObject({ code: "PROVIDER_USAGE_INVALID" });
    expect(captured).toHaveLength(1);
    expect(charges).toEqual([{ prompt_tokens: 100, completion_tokens: 899, total_tokens: 999 }]);
  });

  it("charges an unreadable side at this attempt's projection", () => {
    const usage = readGeminiUsage({ promptTokenCount: 1.5, candidatesTokenCount: 20, totalTokenCount: 21 });
    expect(usage.problem).toBe("MALFORMED");
    expect(chargeableUsage(usage.charge, { requestBytes: 2_000, completionTokenCeiling: 64 }))
      .toEqual({ promptTokens: expect.any(Number), completionTokens: 20 });
    const missingPrompt = readGeminiUsage({ candidatesTokenCount: 20, totalTokenCount: 20 });
    expect(missingPrompt.problem).toBe("INCONSISTENT");
    expect(chargeableUsage(missingPrompt.charge, { requestBytes: 2_000, completionTokenCeiling: 64 })!.promptTokens)
      .toBeGreaterThan(0);
    expect(readGeminiUsage("nonsense").problem).toBe("MALFORMED");
  });
});

describe("PR C — Gemini HTTP errors map to the OpenAI gateway's codes", () => {
  for (const [status, name] of [[429, "RESOURCE_EXHAUSTED"], [500, "INTERNAL"], [503, "UNAVAILABLE"]] as const) {
    it(`retries ${status} ${name} as a transport failure and never quotes the vendor's message`, async () => {
      const { seam, charges } = recordingSeam();
      const { gateway, captured, ledger } = harness([
        () => reply({ error: { code: status, status: name, message: "vendor text that must not travel" } }, status)
      ]);
      const error = await failure(gateway.call(callRequest({ costEnvelope: seam })));
      expect(error).toBeInstanceOf(ProviderCallFailedError);
      const cause = (error as ProviderCallFailedError).cause as Error;
      expect(cause.message).toBe(`PROVIDER_HTTP_STATUS_${status}`);
      expect(String((error as Error).message)).not.toContain("vendor text");
      expect(captured).toHaveLength(3);
      expect(ledger.map((entry) => entry.outcome)).toEqual(["FAILED", "FAILED", "FAILED"]);
      expect(charges).toEqual([undefined, undefined, undefined]);
    });
  }
});

const GEMINI_ROW = Object.freeze({
  provider_ref: "google:gemini",
  base_url: GOOGLE_GEMINI_BASE_URL,
  model: MODEL,
  authorization_file: "/fixture/credentials/google"
});

describe("PR C — the Gemini base URL rule and the adapter kind", () => {
  const parse = (row: Readonly<Record<string, unknown>>, adapterKind?: string) => parseProviderDiscoveryTargets(
    JSON.stringify([row]),
    [{ providerRef: "google:gemini", maker: "Google", ...(adapterKind === undefined ? {} : { adapterKind }) }]
  );

  it("accepts exactly the Gemini base and marks the target with the native wire", () => {
    for (const baseUrl of [GOOGLE_GEMINI_BASE_URL, `${GOOGLE_GEMINI_BASE_URL}/`]) {
      const [target] = parse({ ...GEMINI_ROW, base_url: baseUrl }, GOOGLE_GEMINI_HTTP_ADAPTER_KIND);
      expect(target).toMatchObject({ baseUrl: GOOGLE_GEMINI_BASE_URL, adapterKind: GOOGLE_GEMINI_HTTP_ADAPTER_KIND });
      expect(providerTargetGatewayControls(target!)).toEqual({ adapterKind: GOOGLE_GEMINI_HTTP_ADAPTER_KIND });
    }
    expect(parse(GEMINI_ROW)[0]!.adapterKind).toBe(GOOGLE_GEMINI_HTTP_ADAPTER_KIND);
  });

  it("refuses the nearby variants", () => {
    for (const baseUrl of [
      "http://generativelanguage.googleapis.com/v1beta",
      "https://generativelanguage.googleapis.com/v1beta1",
      "https://generativelanguage.googleapis.com/v1beta/models",
      "https://generativelanguage.googleapis.com/v1beta/openai",
      "https://generativelanguage.googleapis.com/v1beta?key=x",
      "https://generativelanguage.googleapis.com:8443/v1beta",
      "https://generativelanguage.googleapis.com.example/v1beta",
      "https://generativelanguage.googleapis.com/V1BETA",
      "https://user@generativelanguage.googleapis.com/v1beta"
    ]) {
      expect(() => parse({ ...GEMINI_ROW, base_url: baseUrl }), baseUrl).toThrow("PROVIDER_DISCOVERY_TARGET_BASE_URL_INVALID");
    }
  });

  it("refuses an adapter kind that disagrees with the base URL, and a relay-style thinking spelling", () => {
    expect(() => parse(GEMINI_ROW, "openai-compatible-http")).toThrow("PROVIDER_DISCOVERY_TARGET_ADAPTER_MISMATCH");
    expect(() => parse({ ...GEMINI_ROW, base_url: "https://api.deepinfra.com/v1/openai" }, GOOGLE_GEMINI_HTTP_ADAPTER_KIND))
      .toThrow("PROVIDER_DISCOVERY_TARGET_ADAPTER_MISMATCH");
    expect(() => parse({ ...GEMINI_ROW, model: "gemini-3.8-flash:generateContent?key=x" }))
      .toThrow("PROVIDER_DISCOVERY_TARGET_MODEL_INVALID");
    expect(() => parse({ ...GEMINI_ROW, thinking_parameter: "x_thinking_level", thinking_levels: ["high"] }))
      .toThrow("PROVIDER_DISCOVERY_TARGET_THINKING_INVALID");
    expect(parse({ ...GEMINI_ROW, thinking_parameter: "reasoning_effort", thinking_levels: ["high"] })[0])
      .toMatchObject({ thinkingParameter: "reasoning_effort", thinkingLevels: ["high"] });
  });

  it("leaves every other target exactly as it was (no adapterKind member)", () => {
    const [target] = parseProviderDiscoveryTargets(
      JSON.stringify([{ provider_ref: "p", base_url: "https://api.deepinfra.com/v1/openai", model: "m" }]),
      [{ providerRef: "p", maker: "Z.AI", adapterKind: "openai-compatible-http" }]
    );
    expect(target).toEqual({ providerRef: "p", maker: "Z.AI", baseUrl: "https://api.deepinfra.com/v1/openai", model: "m" });
  });

  it("registers the adapter kind, admits it in the configured provider set, and dispatches on it", () => {
    expect(BUILT_IN_PROVIDER_ADAPTERS.map((adapter) => adapter.adapterKind)).toContain(GOOGLE_GEMINI_HTTP_ADAPTER_KIND);
    expect(buildConfiguredProviderSetSealedRow({
      requiredDistinctMakers: 1,
      providers: [{ providerRef: "google:gemini", adapterKind: GOOGLE_GEMINI_HTTP_ADAPTER_KIND, maker: "Google" }]
    }, "fixture").value).toMatchObject({ providers: [{ adapterKind: GOOGLE_GEMINI_HTTP_ADAPTER_KIND }] });
    const options = {
      endpoint: GOOGLE_GEMINI_BASE_URL, model: MODEL, maker: "Google",
      persistRawArtifact: async () => "a", appendLedgerEntry: async () => "l", assertNoOpenWriteTransaction: () => undefined
    };
    expect(createProviderGatewayForAdapter(GOOGLE_GEMINI_HTTP_ADAPTER_KIND, options)).toBeInstanceOf(GeminiGenerateProviderGateway);
    expect(createProviderGatewayForAdapter(undefined, { ...options, endpoint: "https://api.deepinfra.com/v1/openai" }))
      .toBeInstanceOf(OpenAICompatibleProviderGateway);
    expect(() => createProviderGatewayForAdapter("unknown-wire", options)).toThrow("PROVIDER_ADAPTER_KIND_UNSUPPORTED");
  });

  it("refuses a Gemini target at a hosted boot by name, and admits it locally", () => {
    const targets = parseProviderDiscoveryTargets(JSON.stringify([GEMINI_ROW]), [{ providerRef: "google:gemini", maker: "Google" }]);
    expect(() => assertDeploymentProviderTargets(targets, { mode: "hosted", nodeEnv: "production" }))
      .toThrow("PROVIDER_ADAPTER_NOT_HOSTED:google:gemini");
    expect(() => assertDeploymentProviderTargets(targets, { mode: "local", nodeEnv: "production" })).not.toThrow();
  });
});

describe("PR C — the health probe through the Gemini wire", () => {
  const target: ProviderDiscoveryTarget = Object.freeze({
    providerRef: "google:gemini", maker: "Google", baseUrl: GOOGLE_GEMINI_BASE_URL, model: MODEL,
    authorizationHeader: FIXTURE_CREDENTIAL, adapterKind: GOOGLE_GEMINI_HTTP_ADAPTER_KIND,
    thinkingParameter: "reasoning_effort", thinkingLevels: ["high"]
  });
  const probe = (fetchImplementation: typeof fetch, extra: Record<string, unknown> = {}) => observeProviderTarget({
    target, timeoutMs: 1_000, fetchImplementation, clock: () => new Date(0), ...extra
  });

  it("is HEALTHY on a clean STOP with exactly OK from exactly the pinned model", async () => {
    const captured: Captured[] = [];
    const observation = await probe(scripted([() => reply(geminiAnswer([{ text: "OK" }]))], captured));
    expect(observation).toMatchObject({ state: "HEALTHY", modelId: MODEL, failureCode: null });
    expect(captured[0]!.url).toBe(URL_EXPECTED);
    expect(captured[0]!.init.headers).toEqual({ "content-type": "application/json", "x-goog-api-key": FIXTURE_CREDENTIAL });
    expect(JSON.parse(String(captured[0]!.init.body))).toEqual({
      contents: [{ role: "user", parts: [{ text: "DR-181 discovery health probe. Reply exactly: OK" }] }],
      generationConfig: { maxOutputTokens: 1024 }
    });
  });

  it("carries the caller's level and bound", async () => {
    const captured: Captured[] = [];
    await probe(scripted([() => reply(geminiAnswer([{ text: "OK" }]))], captured), { thinkingLevel: "high", tokenCeiling: 8192 });
    expect(JSON.parse(String(captured[0]!.init.body)).generationConfig)
      .toEqual({ maxOutputTokens: 8192, thinkingConfig: { thinkingLevel: "high" } });
  });

  it("is ABSENT on another modelVersion, another answer, a truncation or an error", async () => {
    for (const body of [
      geminiAnswer([{ text: "OK" }], { modelVersion: "gemini-other" }),
      geminiAnswer([{ text: "Sure: OK" }]),
      geminiAnswer([{ text: "OK" }], {}, "MAX_TOKENS")
    ]) {
      expect((await probe(scripted([() => reply(body)], []))).state).toBe("ABSENT");
    }
    expect((await probe(scripted([() => reply({ error: { code: 503 } }, 503)], []))).state).toBe("ABSENT");
  });

  it("still probes an OpenAI-compatible target on chat/completions", async () => {
    const captured: Captured[] = [];
    await observeProviderTarget({
      target: { providerRef: "p", maker: "Z.AI", baseUrl: "https://api.deepinfra.com/v1/openai", model: "m" },
      timeoutMs: 1_000, clock: () => new Date(0),
      fetchImplementation: scripted([() => reply({ model: "m", choices: [{ message: { content: "OK" } }] })], captured)
    });
    expect(captured[0]!.url).toBe("https://api.deepinfra.com/v1/openai/chat/completions");
  });
});

describe("PR C — the preview framing helper", () => {
  it("wraps the very native bytes as {model, request}, exactly two keys", () => {
    const nativeBody = geminiGenerateContentBody({ messages: [{ role: "user", content: "q" }], maxOutputTokens: 5 });
    const framed = geminiPreviewRequestBody(MODEL, nativeBody);
    expect(framed).toBe(`{"model":"${MODEL}","request":${nativeBody}}`);
    expect(Object.keys(JSON.parse(framed))).toEqual(["model", "request"]);
    expect(framed.includes(nativeBody)).toBe(true);
  });

  it("refuses a bad model id or a body that is not one generateContent object", () => {
    const nativeBody = geminiGenerateContentBody({ messages: [{ role: "user", content: "q" }], maxOutputTokens: 5 });
    expect(() => geminiPreviewRequestBody("models/x", nativeBody)).toThrow(TypedDomainError);
    expect(() => geminiPreviewRequestBody(MODEL, "not json")).toThrow(TypedDomainError);
    expect(() => geminiPreviewRequestBody(MODEL, "[]")).toThrow(TypedDomainError);
    expect(() => geminiPreviewRequestBody(MODEL, ` ${nativeBody}`)).toThrow(TypedDomainError);
  });
});
