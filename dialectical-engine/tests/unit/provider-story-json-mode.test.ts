import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  OpenAICompatibleProviderGateway, createPreviewGuardedFetch, providerTargetGatewayControls,
  type OpenAICompatibleGatewayOptions, type ProviderCallRequest, type ProviderLedgerInput,
  type RawArtifactInput
} from "@debateai/providers";
import { framedFixturePacket } from "../support/framed-packet.js";

const ENDPOINT = "https://api.deepinfra.com/v1/openai";
const MODEL = "zai-org/GLM-5.3-Flash";
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const request: ProviderCallRequest = {
  runId: null, subjectItemId: "synthetic:story", callSiteKey: "STORY:STORYTELLER:1",
  role: "SYNTHESIZER", lane: "story", bound: { maxAttempts: 1, tokenCeiling: 12_000, deadlineMs: 5_000 },
  contractHash: "contract:synthetic", providerRef: "provider:synthetic",
  packet: framedFixturePacket("Synthetic school policy; no personal data.")
};
function harness(extra: Partial<OpenAICompatibleGatewayOptions> = {}) {
  const bodies: string[] = [];
  const artifacts: RawArtifactInput[] = [];
  const ledger: ProviderLedgerInput[] = [];
  const options: OpenAICompatibleGatewayOptions = {
    endpoint: ENDPOINT, model: MODEL, maker: "Z.AI",
    ...providerTargetGatewayControls({ baseUrl: extra.endpoint ?? ENDPOINT, model: extra.model ?? MODEL,
      maker: "Z.AI", providerRef: request.providerRef }),
    thinking: { parameter: "reasoning_effort", levels: ["high"] },
    assertNoOpenWriteTransaction: () => undefined,
    persistRawArtifact: async artifact => { artifacts.push(artifact); return artifact.artifactId; },
    appendLedgerEntry: async entry => { ledger.push(entry); return entry.attemptId; },
    fetchImplementation: async (_input, init) => {
      bodies.push(String(init?.body));
      return new Response(JSON.stringify({ id: "synthetic", model: MODEL,
        choices: [{ message: { content: "{}" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 20 } }));
    }, ...extra
  };
  return { options, gateway: new OpenAICompatibleProviderGateway(options), bodies, artifacts, ledger };
}
const high = { ...request, thinkingLevel: "high" };

describe("story JSON mode is an effective, target-specific wire control", () => {
  it("infers support only for the exact verified endpoint and model", () => {
    const target = { providerRef: "synthetic", maker: "Z.AI", baseUrl: ENDPOINT, model: MODEL };
    expect(providerTargetGatewayControls(target)).toEqual({ supportsJsonObjectResponse: true });
    // Contract A §1: JSON mode is row-driven; the two other reviewed rows refuse it. The row's output
    // cap is the preview's alone (previewTargetGatewayControls), never added to an ordinary target.
    for (const model of ["deepseek-ai/DeepSeek-V4.1-Flash", "XiaomiMiMo/MiMo-V2.6-Pro"]) {
      expect(providerTargetGatewayControls({ ...target, model })).toEqual({});
    }
    for (const other of [
      { ...target, baseUrl: "https://other.example/v1/openai" },
      { ...target, baseUrl: `${ENDPOINT}/` },
      { ...target, model: "zai-org/GLM-5.3" }
    ]) expect(providerTargetGatewayControls(other)).toEqual({});
  });

  it("sends exact JSON mode and binds it in artifact/ledger hashes without changing the packet or contract", async () => {
    const { gateway, bodies, artifacts, ledger } = harness();
    const projections: unknown[] = [];
    const charges: unknown[] = [];
    await gateway.call({ ...high, preferredResponseFormat: "json_object", costEnvelope: {
      assertCallAllowed: projection => { projections.push(projection); },
      recordCall: observed => { charges.push(observed); }, assertUsageReported: () => undefined
    } });
    const responseFormat = { type: "json_object" };
    expect(JSON.parse(bodies[0]!)).toEqual({ model: MODEL, max_tokens: 12_000,
      reasoning_effort: "high", messages: request.packet.messages, response_format: responseFormat });
    const effectiveHash = sha(JSON.stringify({ ...request.packet, response_format: responseFormat }));
    expect(artifacts[0]?.inputHash).toBe(effectiveHash);
    expect(ledger[0]?.inputHash).toBe(effectiveHash);
    expect(effectiveHash).not.toBe(sha(JSON.stringify(request.packet)));
    expect(artifacts[0]?.contractHash).toBe(request.contractHash);
    expect(projections).toEqual([{ requestBytes: Buffer.byteLength(bodies[0]!), completionTokenCeiling: 12_000 }]);
    expect(charges[0]).toMatchObject({ projection: projections[0], usage: { prompt_tokens: 10, completion_tokens: 20 } });
    expect(artifacts[0]?.metadata).not.toHaveProperty("response_format");
    expect(request.packet).not.toHaveProperty("response_format");
  });

  it("leaves ordinary, unrequested, and unsupported calls byte-for-byte compatible", async () => {
    for (const variant of [
      { call: high, options: {} },
      { call: { ...high, lane: "served" as const, preferredResponseFormat: "json_object" as const }, options: {} },
      { call: { ...high, preferredResponseFormat: "json_object" as const }, options: { supportsJsonObjectResponse: false } },
      { call: { ...high, preferredResponseFormat: "json_object" as const }, options: { endpoint: "http://synthetic/v1" } }
    ]) {
      const { gateway, bodies, artifacts, ledger } = harness(variant.options);
      await gateway.call(variant.call);
      expect(bodies).toEqual([JSON.stringify({ model: MODEL, max_tokens: 12_000,
        reasoning_effort: "high", messages: request.packet.messages })]);
      expect(artifacts[0]?.inputHash).toBe(sha(JSON.stringify(request.packet)));
      expect(ledger[0]?.inputHash).toBe(sha(JSON.stringify(request.packet)));
    }
  });

  it("refuses malformed preferences before attempts, reservation, fetch, or persistence", async () => {
    for (const invalid of [null, false, "json_schema", {}, { type: "json_object" }]) {
      const { gateway, bodies, artifacts, ledger } = harness();
      let admissions = 0; let attempts = 0;
      await expect(gateway.call({ ...high, preferredResponseFormat: invalid,
        assertAttemptAllowed: () => { attempts++; }, costEnvelope: {
          assertCallAllowed: () => { admissions++; }, recordCall: () => undefined, assertUsageReported: () => undefined
        } } as unknown as ProviderCallRequest)).rejects.toMatchObject({ code: "PROVIDER_RESPONSE_FORMAT_INVALID" });
      expect([attempts, admissions, bodies.length, artifacts.length, ledger.length]).toEqual([0, 0, 0, 0, 0]);
    }
  });

  it("refuses malformed or contradictory runtime capability configuration", () => {
    const { options } = harness();
    for (const extra of [
      { supportsJsonObjectResponse: "true" }, { supportsJsonObjectResponse: null },
      { supportsJsonObjectResponse: true, endpoint: "https://other.example/v1/openai" },
      { supportsJsonObjectResponse: true, model: "other/model" }
    ]) expect(() => new OpenAICompatibleProviderGateway({ ...options, ...extra } as unknown as OpenAICompatibleGatewayOptions))
      .toThrow(expect.objectContaining({ code: "PROVIDER_RESPONSE_FORMAT_CAPABILITY_INVALID" }));
  });
});

describe("preview budget transport admits only the exact optional JSON mode", () => {
  const base = { model: MODEL, reasoning_effort: "high", max_tokens: 12_000,
    messages: request.packet.messages };
  it("forwards exact bytes, hashes and reservation for JSON mode", async () => {
    const calls: Array<{ requestBody: string; requestSha256: string; reservedUsd: string }> = [];
    const fetcher = createPreviewGuardedFetch({ execute: async input => {
      calls.push(input); return { status: 200, body: "{}" };
    } });
    const body = JSON.stringify({ ...base, response_format: { type: "json_object" } });
    await fetcher(`${ENDPOINT}/chat/completions`, { method: "POST", body });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ requestBody: body, requestSha256: sha(body) });
    const nano = BigInt(Buffer.byteLength(body) + 2048) * 150n + 163840n * 500n;
    expect(calls[0]?.reservedUsd).toBe(`${nano / 1_000_000_000n}.${(nano % 1_000_000_000n).toString().padStart(9, "0")}`);
  });

  it("refuses malformed mode, extra keys, weakened High/bounds, or wrong model before dispatch", async () => {
    let calls = 0;
    const fetcher = createPreviewGuardedFetch({ execute: async () => { calls++; return { status: 200, body: "{}" }; } });
    for (const body of [
      ...[null, [], "json_object", { type: "json_schema" }, {}, { type: "json_object", schema: {} }]
        .map(response_format => ({ ...base, response_format })),
      { ...base, response_format: { type: "json_object" }, stream: false },
      { ...base, response_format: { type: "json_object" }, reasoning_effort: "medium" },
      { ...base, response_format: { type: "json_object" }, max_tokens: 163841 },
      { ...base, response_format: { type: "json_object" }, model: "other/model" }
    ]) await expect(fetcher(`${ENDPOINT}/chat/completions`, { method: "POST", body: JSON.stringify(body) })).rejects.toThrow();
    expect(calls).toBe(0);
  });
});
