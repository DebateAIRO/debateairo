import { describe, expect, it } from "vitest";
import { OpenAICompatibleProviderGateway, ProviderCallFailedError } from "@debateai/providers";
import { framedFixturePacket } from "../support/framed-packet.js";

/**
 * L4-F10 — the provider-asserted `model` was recorded as lineage and never
 * compared with the model the panel is pinned to. A gateway that answers a
 * request for `m1` with a cheaper `m2` produced a debate whose DR-115 lineage
 * and whose "different maker" honesty marks named a model that never ran.
 *
 * The comparison is fail-closed and happens BEFORE the OK ledger row, so a
 * relabelled response is recorded as the failure it is. The raw artifact is
 * persisted first either way — the evidence of what arrived is kept.
 */

const MODEL = "vendor/pinned-model";

function gatewayOver(responseModel: unknown, sink?: {
  artifacts: { model: string; parseStatus: string }[];
  ledger: { outcome: string }[];
}) {
  return new OpenAICompatibleProviderGateway({
    endpoint: "http://127.0.0.1:1/v1",
    model: MODEL,
    maker: "vendor",
    assertNoOpenWriteTransaction: () => undefined,
    sleepImplementation: async () => {},
    persistRawArtifact: async (artifact) => {
      sink?.artifacts.push({ model: artifact.model, parseStatus: artifact.parseStatus });
      return "artifact:1";
    },
    appendLedgerEntry: async (entry) => { sink?.ledger.push({ outcome: entry.outcome }); return "ledger:1"; },
    fetchImplementation: async () => new Response(JSON.stringify({
      id: "cmpl-1",
      model: responseModel,
      choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }]
    }), { status: 200, headers: { "content-type": "application/json" } })
  });
}

const REQUEST = {
  runId: null,
  subjectItemId: "node:identity",
  callSiteKey: "JUDGE",
  role: "JUDGE" as const,
  lane: "served" as const,
  bound: { maxAttempts: 1, tokenCeiling: 64, deadlineMs: 5_000 },
  contractHash: "contract:test",
  providerRef: "provider:test",
  packet: framedFixturePacket("Should the proposal stand?")
};

describe("L4-F10 — the provider-asserted model is compared with the pinned one", () => {
  it("refuses a relabelled response with a typed code", async () => {
    const sink = { artifacts: [] as { model: string; parseStatus: string }[], ledger: [] as { outcome: string }[] };
    const failure = await gatewayOver("vendor/cheaper-model", sink).call(REQUEST)
      .catch((error: unknown) => error);

    // Review item 8: the refusal propagates as ITSELF. It used to be retried to
    // exhaustion and re-emerge wrapped in a transport failure.
    expect(failure).toMatchObject({ code: "PROVIDER_MODEL_IDENTITY_CHANGED" });
    // The evidence of what arrived is kept, and the attempt is ledgered FAILED
    // rather than OK — a relabelled answer is never a successful call.
    expect(sink.artifacts).toHaveLength(1);
    expect(sink.ledger.map(({ outcome }) => outcome)).toEqual(["FAILED"]);
  });

  it("names the pinned model and the provider ref, never the response body", async () => {
    const failure = await gatewayOver("vendor/cheaper-model").call(REQUEST)
      .catch((error: unknown) => error) as { message: string };
    expect(failure.message).toContain(MODEL);
    expect(failure.message).not.toContain("ok");
  });

  it("accepts the pinned model", async () => {
    await expect(gatewayOver(MODEL).call(REQUEST)).resolves.toMatchObject({
      content: "ok", model: MODEL, modelVersion: MODEL
    });
  });

  /**
   * REVIEW ITEM 8 — a relabelled model is not a transient fault.
   *
   * The refusal was thrown INSIDE the attempt loop, so the gateway retried it to
   * exhaustion: three attempts, three ledger rows, three artifacts, three real
   * calls to a gateway that has already proved it answers with the wrong model.
   * Retrying cannot repair an identity mismatch — it is the same class as a
   * frame refusal, and it short-circuits the same way.
   */
  it("does not retry a relabelled model — one attempt, one ledger row", async () => {
    const sink = { artifacts: [] as { model: string; parseStatus: string }[], ledger: [] as { outcome: string }[] };
    let fetches = 0;
    const gateway = new OpenAICompatibleProviderGateway({
      endpoint: "http://127.0.0.1:1/v1",
      model: MODEL,
      maker: "vendor",
      assertNoOpenWriteTransaction: () => undefined,
      sleepImplementation: async () => {},
      persistRawArtifact: async (artifact) => {
        sink.artifacts.push({ model: artifact.model, parseStatus: artifact.parseStatus });
        return "artifact:1";
      },
      appendLedgerEntry: async (entry) => { sink.ledger.push({ outcome: entry.outcome }); return "ledger:1"; },
      fetchImplementation: async () => {
        fetches += 1;
        return new Response(JSON.stringify({
          id: "cmpl-1",
          model: "vendor/cheaper-model",
          choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }]
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
    });
    const failure = await gateway.call({ ...REQUEST, bound: { ...REQUEST.bound, maxAttempts: 3 } })
      .catch((error: unknown) => error);

    // The refusal propagates as itself, not wrapped in a transport failure.
    expect(failure).toMatchObject({ code: "PROVIDER_MODEL_IDENTITY_CHANGED" });
    expect(fetches).toBe(1);
    expect(sink.ledger).toHaveLength(1);
    expect(sink.artifacts).toHaveLength(1);
  });

  it("refuses an over-long model string before it is recorded as lineage", async () => {
    const failure = await gatewayOver(`${MODEL}${"x".repeat(4_096)}`).call(REQUEST)
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ProviderCallFailedError);
  });
});
