import { describe, expect, it } from "vitest";
import { OpenAICompatibleProviderGateway, ProviderCallFailedError } from "@debateai/providers";

const MIB = 1024 * 1024;
const CHUNK_BYTES = 64 * 1024;

function callRequest(maxAttempts = 1) {
  return {
    runId: null, subjectItemId: "node:test", callSiteKey: "fixture:judge", role: "JUDGE" as const,
    lane: "served" as const, bound: { maxAttempts, tokenCeiling: 64, deadlineMs: 5_000 },
    contractHash: "contract:test", providerRef: "provider:test",
    packet: { messages: [{ role: "user" as const, content: "fixture" }] }
  };
}

/** A 200 response whose body arrives as a stream of 64 KiB chunks; the source reports what was pulled. */
function streamingBody(text: string) {
  const bytes = Buffer.from(text, "utf8");
  const source = { pulled: 0, cancelled: false };
  const response = () => {
    let offset = 0;
    return new Response(new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset >= bytes.byteLength) {
          controller.close();
          return;
        }
        const next = bytes.subarray(offset, Math.min(offset + CHUNK_BYTES, bytes.byteLength));
        offset += next.byteLength;
        source.pulled += next.byteLength;
        controller.enqueue(new Uint8Array(next));
      },
      cancel() {
        source.cancelled = true;
      }
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { source, response };
}

/** A syntactically valid completion whose serialised UTF-8 length is exactly `totalBytes`. */
function completionOfExactly(totalBytes: number, model = "fixture") {
  const head = `{"id":"call","model":${JSON.stringify(model)},"choices":[{"message":{"content":"`;
  const tail = "\"}}]}";
  const contentLength = totalBytes - Buffer.byteLength(head) - Buffer.byteLength(tail);
  return { text: `${head}${"a".repeat(contentLength)}${tail}`, contentLength };
}

function gatewayWith(fetchImplementation: typeof fetch) {
  const artifacts: Array<{ rawText: string; model: string; modelVersion: string | null; metadata: Readonly<Record<string, unknown>> }> = [];
  const ledger: Array<{ outcome: string; rawArtifactRef: string | null }> = [];
  const gateway = new OpenAICompatibleProviderGateway({
    endpoint: "http://fixture/v1", model: "configured/model", maker: "fixture",
    fetchImplementation,
    persistRawArtifact: async (artifact) => { artifacts.push(artifact); return artifact.artifactId; },
    appendLedgerEntry: async (entry) => { ledger.push(entry); return `ledger:${ledger.length}`; },
    assertNoOpenWriteTransaction: () => undefined
  });
  return { gateway, artifacts, ledger };
}

describe("L4-F3 — provider response body cap", () => {
  it("aborts a streamed body past 4 MiB with PROVIDER_RESPONSE_TOO_LARGE, persists nothing, and ledgers FAILED per attempt", async () => {
    const body = streamingBody(completionOfExactly(16 * MIB).text);
    let fetchCalls = 0;
    const { gateway, artifacts, ledger } = gatewayWith(async () => { fetchCalls += 1; return body.response(); });

    const failure = await gateway.call(callRequest(2)).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ProviderCallFailedError);
    expect(failure).toMatchObject({
      code: "PROVIDER_CALL_FAILED", attempts: 2, lastOutcome: "FAILED",
      cause: { code: "PROVIDER_RESPONSE_TOO_LARGE" }
    });
    expect(fetchCalls).toBe(2);
    expect(artifacts).toEqual([]);
    expect(ledger).toEqual([
      { outcome: "FAILED", rawArtifactRef: null },
      { outcome: "FAILED", rawArtifactRef: null }
    ].map((row) => expect.objectContaining(row)));
    expect(body.source.cancelled).toBe(true);
    expect(body.source.pulled).toBeLessThanOrEqual(2 * (4 * MIB + 2 * CHUNK_BYTES));
  });

  it("accepts a streamed body of exactly 4 MiB", async () => {
    const completion = completionOfExactly(4 * MIB);
    const body = streamingBody(completion.text);
    const { gateway, artifacts, ledger } = gatewayWith(async () => body.response());

    const result = await gateway.call(callRequest());

    expect(result.content).toHaveLength(completion.contentLength);
    expect(artifacts[0]?.rawText).toHaveLength(4 * MIB);
    expect(ledger).toEqual([expect.objectContaining({ outcome: "OK" })]);
  });

  it("does not add the body cap to the stub-less non-streaming path: a small Response still works", async () => {
    const { gateway } = gatewayWith(async () => new Response(completionOfExactly(256).text));
    await expect(gateway.call(callRequest())).resolves.toMatchObject({ model: "fixture" });
  });
});

describe("L4-F3 — strict, bounded usage", () => {
  const completionWithUsage = (usage: unknown) => JSON.stringify({
    id: "call", model: "fixture", choices: [{ message: { content: "ok" } }], usage
  });

  it("refuses usage with unknown keys as PROVIDER_USAGE_INVALID and never persists them", async () => {
    const { gateway, artifacts } = gatewayWith(async () => new Response(completionWithUsage({
      prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, prompt_tokens_details: { cached_tokens: 0 }
    })));

    await expect(gateway.call(callRequest())).rejects.toMatchObject({
      code: "PROVIDER_CALL_FAILED", cause: { code: "PROVIDER_USAGE_INVALID" }
    });
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.metadata.usage).toBeNull();
  });

  it("bounds every counter to a non-negative integer at most 2^31 - 1", async () => {
    for (const usage of [
      { prompt_tokens: 2 ** 31 },
      { completion_tokens: -1 },
      { total_tokens: 1.5 },
      { prompt_tokens: "3" }
    ]) {
      const { gateway, artifacts } = gatewayWith(async () => new Response(completionWithUsage(usage)));
      await expect(gateway.call(callRequest())).rejects.toMatchObject({
        code: "PROVIDER_CALL_FAILED", cause: { code: "PROVIDER_USAGE_INVALID" }
      });
      expect(artifacts[0]?.metadata.usage).toBeNull();
    }
    const accepted = { prompt_tokens: 2 ** 31 - 1, completion_tokens: 0, total_tokens: 2 ** 31 - 1, x_cost_usd: 0.25 };
    const { gateway, artifacts } = gatewayWith(async () => new Response(completionWithUsage(accepted)));
    await expect(gateway.call(callRequest())).resolves.toMatchObject({ content: "ok" });
    expect(artifacts[0]?.metadata.usage).toEqual(accepted);
  });
});

describe("L4-F3 — bounded response model id", () => {
  it("refuses a 300-character model id as PROVIDER_MODEL_INVALID without persisting it", async () => {
    const { gateway, artifacts, ledger } = gatewayWith(async () => new Response(completionOfExactly(512, "m".repeat(300)).text));

    await expect(gateway.call(callRequest())).rejects.toMatchObject({
      code: "PROVIDER_CALL_FAILED", cause: { code: "PROVIDER_MODEL_INVALID" }
    });
    expect(artifacts).toEqual([expect.objectContaining({ model: "configured/model", modelVersion: null })]);
    expect(ledger).toEqual([expect.objectContaining({ outcome: "FAILED" })]);
  });

  it("accepts a 256-character model id", async () => {
    const model = "m".repeat(256);
    const { gateway, artifacts } = gatewayWith(async () => new Response(completionOfExactly(512, model).text));
    await expect(gateway.call(callRequest())).resolves.toMatchObject({ model, modelVersion: model });
    expect(artifacts[0]).toMatchObject({ model, modelVersion: model });
  });
});
