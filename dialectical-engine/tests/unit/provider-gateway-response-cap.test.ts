import { describe, expect, it } from "vitest";
import { OpenAICompatibleProviderGateway, ProviderCallFailedError } from "@debateai/providers";
import {
  CostEnvelopeGuard,
  projectedCallCeilingMicros,
  type ModelSpendEntry,
  type ModelSpendStore
} from "@debateai/budget";
import { framedFixturePacket } from "../support/framed-packet.js";

const MIB = 1024 * 1024;
const CHUNK_BYTES = 64 * 1024;

function callRequest(maxAttempts = 1) {
  return {
    runId: null, subjectItemId: "node:test", callSiteKey: "fixture:judge", role: "JUDGE" as const,
    lane: "served" as const, bound: { maxAttempts, tokenCeiling: 64, deadlineMs: 5_000 },
    contractHash: "contract:test", providerRef: "provider:test",
    packet: framedFixturePacket("fixture")
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
// L4-F10: the response must assert the model this target is pinned to.
function completionOfExactly(totalBytes: number, model = "configured/model") {
  const head = `{"id":"call","model":${JSON.stringify(model)},"choices":[{"message":{"content":"`;
  const tail = "\"}}]}";
  const contentLength = totalBytes - Buffer.byteLength(head) - Buffer.byteLength(tail);
  return { text: `${head}${"a".repeat(contentLength)}${tail}`, contentLength };
}

/** One micro-unit per token on both sides, so a charge reads as a token count. */
const METERED_PRICE = Object.freeze({
  inputMicrosPerMillionTokens: 1_000_000,
  outputMicrosPerMillionTokens: 1_000_000
});

/**
 * The same gateway with the REAL money seam over an in-memory
 * `ledger.model_spend`: the charge is the shipped rule, not a fake of it, so a
 * row below is one row this deployment would really write. The request body is
 * captured, because the projection a fallback charge must equal is computed
 * from the exact bytes that were sent.
 */
function meteredGatewayWith(
  fetchImplementation: typeof fetch,
  deployment: Readonly<{ requireReportedUsage: boolean; price?: typeof METERED_PRICE }> =
    { requireReportedUsage: true }
) {
  const rows: ModelSpendEntry[] = [];
  const sent: { requestBytes: number } = { requestBytes: 0 };
  const store: ModelSpendStore = {
    recordSpend: async (entry) => { rows.push(entry); },
    readRunSpentMicros: async () => 0,
    readDaySpentMicros: async () => 0,
    admitNewRun: async () => Object.freeze({ admitted: true, committedMicros: 0 })
  };
  const seam = new CostEnvelopeGuard({
    store,
    policy: { perRunCeilingMicros: 1_000_000_000, dailyCeilingMicros: 1_000_000_000 }
  }).providerSeam({
    runId: "run-1",
    price: deployment.price ?? METERED_PRICE,
    requireReportedUsage: deployment.requireReportedUsage
  });
  const gateway = new OpenAICompatibleProviderGateway({
    endpoint: "http://fixture/v1", model: "configured/model", maker: "fixture",
    fetchImplementation: async (input, init) => {
      sent.requestBytes = Buffer.byteLength(String(init?.body ?? ""), "utf8");
      return fetchImplementation(input, init);
    },
    persistRawArtifact: async (artifact) => { artifacts.push(artifact); return artifact.artifactId; },
    appendLedgerEntry: async () => "ledger:1",
    assertNoOpenWriteTransaction: () => undefined,
    sleepImplementation: async () => {}
  });
  const artifacts: Array<{ metadata: Readonly<Record<string, unknown>> }> = [];
  return {
    gateway: {
      call: (request: ReturnType<typeof callRequest>) =>
        gateway.call({ ...request, costEnvelope: seam })
    },
    rows,
    artifacts,
    /** The MOST this call could cost, from the bytes actually sent. */
    projectedMicros: () => projectedCallCeilingMicros(deployment.price ?? METERED_PRICE, {
      requestBytes: sent.requestBytes,
      completionTokenCeiling: 64
    }),
    projectedPromptMicros: () => projectedCallCeilingMicros(deployment.price ?? METERED_PRICE, {
      requestBytes: sent.requestBytes,
      completionTokenCeiling: 0
    })
  };
}

function gatewayWith(fetchImplementation: typeof fetch, pinnedModel = "configured/model") {
  const artifacts: Array<{ rawText: string; model: string; modelVersion: string | null; metadata: Readonly<Record<string, unknown>> }> = [];
  const ledger: Array<{ outcome: string; rawArtifactRef: string | null }> = [];
  const gateway = new OpenAICompatibleProviderGateway({
    endpoint: "http://fixture/v1", model: pinnedModel, maker: "fixture",
    fetchImplementation,
    persistRawArtifact: async (artifact) => { artifacts.push(artifact); return artifact.artifactId; },
    appendLedgerEntry: async (entry) => { ledger.push(entry); return `ledger:${ledger.length}`; },
    assertNoOpenWriteTransaction: () => undefined,
    sleepImplementation: async () => {}
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
    await expect(gateway.call(callRequest())).resolves.toMatchObject({ model: "configured/model" });
  });
});

describe("L4-F3 — bounded usage counters, unknown members dropped", () => {
  const completionWithUsage = (usage: unknown) => JSON.stringify({
    id: "call", model: "configured/model", choices: [{ message: { content: "ok" } }], usage
  });

  /**
   * C-I1. Round 1 REFUSED the whole block for one unknown member, which is what
   * every real OpenAI 200 carries (`prompt_tokens_details`), so the answer was
   * thrown away, retried and never charged. The L4-F3 property is about what
   * gets PERSISTED, and stripping keeps it exactly: the artifact records the
   * four bounded members and nothing else.
   */
  it("accepts usage with unknown keys and never persists them", async () => {
    const { gateway, artifacts } = gatewayWith(async () => new Response(completionWithUsage({
      prompt_tokens: 1, completion_tokens: 1, total_tokens: 2,
      prompt_tokens_details: { cached_tokens: 0 },
      completion_tokens_details: { reasoning_tokens: 0 }
    })));

    await expect(gateway.call(callRequest())).resolves.toMatchObject({ content: "ok" });
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.metadata.usage)
      .toEqual({ prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 });
  });

  const MALFORMED_COUNTERS = Object.freeze([
    { prompt_tokens: 2 ** 31 },
    { completion_tokens: -1 },
    { total_tokens: 1.5 },
    { prompt_tokens: "3" }
  ]);

  it("bounds every counter to a non-negative integer at most 2^31 - 1", async () => {
    for (const usage of MALFORMED_COUNTERS) {
      const { gateway, artifacts } = gatewayWith(async () => new Response(completionWithUsage(usage)));
      // Fix round 1, Important 1: the refusal now leaves the attempt loop under
      // its OWN name instead of re-emerging as PROVIDER_CALL_FAILED three
      // billed calls later.
      await expect(gateway.call(callRequest())).rejects.toMatchObject({
        code: "PROVIDER_USAGE_INVALID"
      });
      expect(artifacts[0]?.metadata.usage).toBeNull();
    }
    const accepted = { prompt_tokens: 2 ** 31 - 1, completion_tokens: 0, total_tokens: 2 ** 31 - 1, x_cost_usd: 0.25 };
    const { gateway, artifacts } = gatewayWith(async () => new Response(completionWithUsage(accepted)));
    await expect(gateway.call(callRequest())).resolves.toMatchObject({ content: "ok" });
    expect(artifacts[0]?.metadata.usage).toEqual(accepted);
  });

  /**
   * FIX ROUND 1, Important 1 — A MALFORMED COUNTER IS STILL A BILLED CALL.
   *
   * The strict parse refuses the body, which is right: the engine cannot trust
   * a count it cannot read. But the vendor charged for the call, and round 1
   * still derived the CHARGE from that same strict parse, so the money
   * vanished — three billed attempts, no ledger row, neither ceiling moved —
   * and the comment claimed the case was covered.
   *
   * Two separate duties, so two separate reads: the charge reads the raw block
   * LENIENTLY and falls back to the call's own projected maximum for a part it
   * cannot read, and the acceptance decision keeps the strict parse. And
   * because the refusal is deterministic — the same vendor returns the same
   * malformed count on the retry — it now short-circuits: one billed call,
   * charged, then a typed stop.
   */
  it("charges a malformed counter once, on one call, and does not retry it", async () => {
    for (const usage of MALFORMED_COUNTERS) {
      let calls = 0;
      const { gateway, rows, projectedMicros } = meteredGatewayWith(async () => {
        calls += 1;
        return new Response(completionWithUsage(usage));
      });

      const refusal = await gateway.call(callRequest(3))
        .then(() => null, (thrown: unknown) => thrown);

      // ONE billed call — the retry cannot repair a count the vendor will
      // report the same way again...
      expect(calls, JSON.stringify(usage)).toBe(1);
      // ...ONE row for it, charged EXACTLY the maximum this call was admitted
      // against and never a micro-unit more (round 2, Critical A: the first of
      // these fixtures used to be charged its own 2 147 483 648, which is the
      // whole day)...
      expect(rows, JSON.stringify(usage)).toHaveLength(1);
      expect(rows[0]!.chargeMicros, JSON.stringify(usage)).toBe(projectedMicros());
      expect(rows[0]!.spendSource).toBe("RUN");
      // ...and the refusal arrives under its own name, not PROVIDER_CALL_FAILED.
      expect(refusal, JSON.stringify(usage)).toMatchObject({ code: "PROVIDER_USAGE_INVALID" });
    }
  });

  /**
   * Round 2, Critical B. `2**60` is not a safe integer, so before this round it
   * reached `chargeMicrosForUsage` and threw a BARE `TypeError` out of the
   * charge — which the gateway's short-circuit (`instanceof TypedDomainError`)
   * did not recognise, so the loop retried: three billed calls, no rows, the
   * original bug. It is now an unreadable count like any other.
   */
  it("charges a count past the bounded range at the projection, once", async () => {
    for (const usage of [{ prompt_tokens: 2 ** 31 }, { prompt_tokens: 2 ** 60 }]) {
      let calls = 0;
      const { gateway, rows, projectedMicros } = meteredGatewayWith(async () => {
        calls += 1;
        return new Response(completionWithUsage(usage));
      });

      const refusal = await gateway.call(callRequest(3))
        .then(() => null, (thrown: unknown) => thrown);

      expect(calls, JSON.stringify(usage)).toBe(1);
      expect(rows, JSON.stringify(usage)).toHaveLength(1);
      expect(rows[0]!.chargeMicros, JSON.stringify(usage)).toBe(projectedMicros());
      expect(refusal, JSON.stringify(usage)).toMatchObject({ code: "PROVIDER_USAGE_INVALID" });
    }
  });

  /**
   * Round 2, Important. An ABSENT side is not a malformed one: the vendor told
   * the truth about the part it reported, and the ledger stays honest to the
   * invoice for the rest.
   */
  it("charges an absent side as zero, beside a side the vendor did report", async () => {
    const { gateway, rows } = meteredGatewayWith(
      async () => new Response(completionWithUsage({ prompt_tokens: 1_000 }))
    );

    await expect(gateway.call(callRequest())).resolves.toMatchObject({ content: "ok" });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      inputTokens: 1_000, outputTokens: 0, chargeMicros: 1_000
    });
  });

  it("still records nothing for a vendor that reported no usage at all", async () => {
    const { gateway, rows } = meteredGatewayWith(async () => new Response(JSON.stringify({
      id: "call", model: "configured/model", choices: [{ message: { content: "ok" } }]
    })));

    // The hosted requirement still refuses it, and no row invents a charge for
    // a call the vendor said nothing about.
    await expect(gateway.call(callRequest())).rejects.toMatchObject({
      code: "PROVIDER_USAGE_UNREPORTED"
    });
    expect(rows).toEqual([]);
  });

  /**
   * Round 2, Important. A WELL-FORMED block that simply reports nothing this
   * can bill — `{}`, or one carrying only a total — is the "vendor reported
   * nothing" case, not the malformed one. Hosted refuses it as before, and
   * LOCAL, where the relays report nothing and cost nothing, must not gain a
   * fabricated row.
   */
  it("writes no fabricated row for an empty usage block in local mode", async () => {
    for (const usage of [{}, { total_tokens: 40 }]) {
      const { gateway, rows, artifacts } = meteredGatewayWith(
        async () => new Response(completionWithUsage(usage)),
        { requireReportedUsage: false }
      );

      await expect(gateway.call(callRequest()), JSON.stringify(usage))
        .resolves.toMatchObject({ content: "ok" });
      expect(rows, JSON.stringify(usage)).toEqual([]);
      // Minor 7, again at the gateway: a block that carries nothing the strict
      // schema keeps is recorded as absent, never as `{}`.
      expect(artifacts[0]?.metadata.usage, JSON.stringify(usage))
        .toEqual(Object.keys(usage).length === 0 ? null : usage);
    }
  });

  it("records artifact usage as null when the block strips to nothing", async () => {
    const { gateway, artifacts, rows } = meteredGatewayWith(
      async () => new Response(completionWithUsage({ prompt_tokens_details: { cached_tokens: 0 } })),
      { requireReportedUsage: false }
    );

    await expect(gateway.call(callRequest())).resolves.toMatchObject({ content: "ok" });
    expect(artifacts[0]?.metadata.usage).toBeNull();
    // ...and an unknown member is not a malformed count, so nothing is charged.
    expect(rows).toEqual([]);
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
    // L4-F10: the asserted model must also BE the pinned one, so the target is
    // pinned to the same 256-character id this case is about.
    const model = "m".repeat(256);
    const { gateway, artifacts } = gatewayWith(
      async () => new Response(completionOfExactly(512, model).text),
      model
    );
    await expect(gateway.call(callRequest())).resolves.toMatchObject({ model, modelVersion: model });
    expect(artifacts[0]).toMatchObject({ model, modelVersion: model });
  });
});
