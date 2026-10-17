import { describe, expect, it } from "vitest";
import { OpenAICompatibleProviderGateway, type RawArtifactInput } from "@debateai/providers";
import { framedFixturePacket } from "../support/framed-packet.js";

// The fixture's text goes into the packet's question_line, so it must not contain "guided" (pre-flight PF-C3.3).
const PACKET = framedFixturePacket("length-record");
function recordingGateway() {
  const bodies: string[] = [];
  const artifacts: RawArtifactInput[] = [];
  const gateway = new OpenAICompatibleProviderGateway({
    endpoint: "http://fixture/v1", model: "fixture/model", maker: "fixture",
    fetchImplementation: async (_url, init) => {
      bodies.push(String(init?.body));
      return new Response(JSON.stringify({ id: "call", model: "fixture/model", choices: [{ message: { content: "ok" }, finish_reason: "stop" }] }));
    },
    sleepImplementation: async () => undefined,
    persistRawArtifact: async (artifact) => { artifacts.push(artifact); return artifact.artifactId; },
    appendLedgerEntry: async () => "ledger:1",
    assertNoOpenWriteTransaction: () => undefined
  });
  return { gateway, bodies, artifacts };
}
const request = (extra: Readonly<Record<string, unknown>> = {}) => ({
  runId: "11111111-1111-4111-8111-111111111111", subjectItemId: "node:guided", callSiteKey: "COMPOSER:SYNTHESIZER:INITIAL:1",
  role: "SYNTHESIZER" as const, lane: "served" as const, bound: { maxAttempts: 1, tokenCeiling: 64, deadlineMs: 5000 },
  contractHash: "contract:guided", providerRef: "provider:guided", packet: PACKET, ...extra
});

describe("guided words on the attempt row (spec §3.6; INTERFACE §4)", () => {
  it("records the request's guided words and never sends them", async () => {
    const { gateway, bodies, artifacts } = recordingGateway();
    await gateway.call(request({ guidedWords: 700 }));
    expect(artifacts.map((artifact) => artifact.guidedWords)).toEqual([700]);
    expect(bodies.join("")).not.toContain("guided");
    expect(bodies.join("")).not.toMatch(/guidedWords|guided_words/u);
  });
  it("records null when the call names none", async () => {
    const { gateway, artifacts } = recordingGateway();
    await gateway.call(request());
    // Task 7 review 5: the record's own member, exactly null (never undefined, never a stray number).
    expect(artifacts).toHaveLength(1);
    expect(Object.hasOwn(artifacts[0]!, "guidedWords")).toBe(true);
    expect(artifacts[0]!.guidedWords).toBeNull();
  });
  it("refuses a malformed number before anything is sent", async () => {
    for (const guidedWords of [0, -1, 1.5]) {
      const { gateway, bodies } = recordingGateway();
      await expect(gateway.call(request({ guidedWords }))).rejects.toThrowError(new TypeError("PROVIDER_CALL_RECORD_INVALID"));
      expect(bodies).toEqual([]);
    }
  });
});
