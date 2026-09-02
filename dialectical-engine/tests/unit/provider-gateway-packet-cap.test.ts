import { describe, expect, it } from "vitest";
import { OpenAICompatibleProviderGateway, ProviderCallFailedError, type PromptPacket } from "@debateai/providers";

const KIB = 1024;
const MODEL = "configured/model";
const TOKEN_CEILING = 64;

/** UTF-8 bytes of the wire packet the gateway posts for `messages`. */
function wireBytes(messages: PromptPacket["messages"]): number {
  return Buffer.byteLength(JSON.stringify({ model: MODEL, max_tokens: TOKEN_CEILING, messages }), "utf8");
}

function userMessageOfWireSize(totalBytes: number): PromptPacket {
  const overhead = wireBytes([{ role: "user", content: "" }]);
  return { messages: [{ role: "user", content: "a".repeat(totalBytes - overhead) }] };
}

function gatewayWith(fetchImplementation: typeof fetch) {
  const artifacts: unknown[] = [];
  const ledger: Array<{ outcome: string; rawArtifactRef: string | null; inputHash: string }> = [];
  const gateway = new OpenAICompatibleProviderGateway({
    endpoint: "http://fixture/v1", model: MODEL, maker: "fixture",
    fetchImplementation,
    persistRawArtifact: async (artifact) => { artifacts.push(artifact); return artifact.artifactId; },
    appendLedgerEntry: async (entry) => { ledger.push(entry); return `ledger:${ledger.length}`; },
    assertNoOpenWriteTransaction: () => undefined
  });
  return { gateway, artifacts, ledger };
}

function callRequest(packet: PromptPacket, maxAttempts: number, extra: Record<string, unknown> = {}) {
  return {
    runId: null, subjectItemId: "node:test", callSiteKey: "fixture:judge", role: "JUDGE" as const,
    lane: "served" as const, bound: { maxAttempts, tokenCeiling: TOKEN_CEILING, deadlineMs: 5_000 },
    contractHash: "contract:test", providerRef: "provider:test", packet, ...extra
  };
}

const okCompletion = () => new Response(JSON.stringify({
  id: "call", model: MODEL, choices: [{ message: { content: "ok" } }]
}));

describe("L4-F2 — request packet cap", () => {
  it("refuses a packet over 256 KiB as PROVIDER_PACKET_TOO_LARGE: no fetch, one FAILED ledger row, no retry", async () => {
    let fetchCalls = 0;
    const { gateway, artifacts, ledger } = gatewayWith(async () => { fetchCalls += 1; return okCompletion(); });

    const failure = await gateway.call(callRequest(userMessageOfWireSize(256 * KIB + 1), 3))
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ProviderCallFailedError);
    expect(failure).toMatchObject({
      code: "PROVIDER_CALL_FAILED", attempts: 1, lastOutcome: "FAILED", lastLedgerEntryRef: "ledger:1",
      cause: { code: "PROVIDER_PACKET_TOO_LARGE" }
    });
    expect(fetchCalls).toBe(0);
    expect(artifacts).toEqual([]);
    expect(ledger).toEqual([expect.objectContaining({ outcome: "FAILED", rawArtifactRef: null })]);
  });

  it("accepts a packet of exactly 256 KiB on the wire", async () => {
    let fetchCalls = 0;
    const { gateway, ledger } = gatewayWith(async () => { fetchCalls += 1; return okCompletion(); });

    await expect(gateway.call(callRequest(userMessageOfWireSize(256 * KIB), 3))).resolves.toMatchObject({ content: "ok" });

    expect(fetchCalls).toBe(1);
    expect(ledger).toEqual([expect.objectContaining({ outcome: "OK" })]);
  });

  it("measures the whole wire packet in UTF-8 bytes, not characters", async () => {
    let fetchCalls = 0;
    const { gateway } = gatewayWith(async () => { fetchCalls += 1; return okCompletion(); });
    const overhead = wireBytes([{ role: "user", content: "" }]);
    // 3-byte characters: 256 KiB - overhead + 1 byte over the cap once serialised.
    const content = "€".repeat(Math.floor((256 * KIB - overhead) / 3)) + "aa";
    const packet: PromptPacket = { messages: [{ role: "user", content }] };
    expect(wireBytes(packet.messages)).toBeGreaterThan(256 * KIB);

    await expect(gateway.call(callRequest(packet, 1))).rejects.toMatchObject({ cause: { code: "PROVIDER_PACKET_TOO_LARGE" } });
    expect(fetchCalls).toBe(0);
  });

  it("refuses an oversized repair packet on its own attempt and stops the loop", async () => {
    let fetchCalls = 0;
    const { gateway, ledger } = gatewayWith(async () => { fetchCalls += 1; return okCompletion(); });

    const failure = await gateway.call(callRequest({ messages: [{ role: "user", content: "base" }] }, 3, {
      classifyContent: () => ({ parseStatus: "SCHEMA_FAILED", parseError: "fixture" }),
      buildRepairPacket: () => userMessageOfWireSize(300 * KIB)
    })).catch((error: unknown) => error);

    expect(failure).toMatchObject({ code: "PROVIDER_CALL_FAILED", attempts: 2, cause: { code: "PROVIDER_PACKET_TOO_LARGE" } });
    expect(fetchCalls).toBe(1);
    expect(ledger.map((entry) => entry.outcome)).toEqual(["FAILED", "FAILED"]);
  });
});
