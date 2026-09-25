import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  OpenAICompatibleProviderGateway,
  recordableFinishReason,
  type ProviderCallRequest,
  type RawArtifactInput
} from "@debateai/providers";
import { framedFixturePacket } from "../support/framed-packet.js";

// V-6 fix round 1 / 5c. An encrypted run's raw_artifact.metadata_json accepts
// only engine tokens (migration 0069). finish_reason is vendor-written, so the
// gateway maps it to a typed, deterministic token BEFORE the artifact is
// persisted — one odd vendor string must not block the write whose charge is
// recorded right after it.

function gatewayAnswering(finishReason: string): {
  readonly gateway: OpenAICompatibleProviderGateway;
  readonly artifacts: RawArtifactInput[];
} {
  const artifacts: RawArtifactInput[] = [];
  const gateway = new OpenAICompatibleProviderGateway({
    endpoint: "http://fixture/v1",
    model: "fixture/model",
    maker: "fixture",
    fetchImplementation: async () => new Response(JSON.stringify({
      id: "fixture-1",
      model: "fixture/model",
      choices: [{ message: { content: "{\"ok\":true}" }, finish_reason: finishReason }]
    })),
    persistRawArtifact: async (artifact) => {
      artifacts.push(artifact);
      return `artifact:${String(artifacts.length)}`;
    },
    appendLedgerEntry: async () => "ledger:v6",
    assertNoOpenWriteTransaction: () => undefined
  });
  return { gateway, artifacts };
}

function request(): ProviderCallRequest {
  return {
    runId: null,
    subjectItemId: "node:v6",
    callSiteKey: "fixture:v6",
    role: "SYNTHESIZER",
    lane: "served",
    bound: { maxAttempts: 1, tokenCeiling: 256, deadlineMs: 10_000 },
    contractHash: "contract:v6",
    providerRef: "provider:v6",
    packet: framedFixturePacket("answer"),
    classifyContent: () => ({ parseStatus: "PARSED", parseError: null }) as never
  };
}

describe("V-6 — the recorded finish_reason is always one engine token", () => {
  it("keeps a token verbatim and maps anything else to a typed deterministic token", () => {
    expect(recordableFinishReason(null)).toBeNull();
    for (const token of ["stop", "length", "tool_calls", "content_filter", "end_turn"]) {
      expect(recordableFinishReason(token)).toBe(token);
    }
    const odd = "stopped: the defendant's closing statement";
    const expected = `UNRECOGNIZED:sha256:${createHash("sha256").update(odd).digest("hex").slice(0, 16)}`;
    expect(recordableFinishReason(odd)).toBe(expected);
    expect(recordableFinishReason(odd)).toBe(expected);
    expect(recordableFinishReason("x".repeat(65))).toMatch(/^UNRECOGNIZED:sha256:[0-9a-f]{16}$/);
    expect(recordableFinishReason("")).toMatch(/^UNRECOGNIZED:sha256:[0-9a-f]{16}$/);
  });

  it("records the mapped token on the persisted artifact", async () => {
    const odd = "stopped: the defendant's closing statement";
    const { gateway, artifacts } = gatewayAnswering(odd);
    await gateway.call(request());
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]!.metadata.finish_reason).toBe(recordableFinishReason(odd));
    expect(JSON.stringify(artifacts[0]!.metadata)).not.toContain("defendant");

    const plain = gatewayAnswering("stop");
    await plain.gateway.call(request());
    expect(plain.artifacts[0]!.metadata.finish_reason).toBe("stop");
  });
});
