import { describe, expect, it } from "vitest";
import {
  OpenAICompatibleProviderGateway,
  type ProviderCostEnvelopeSeam
} from "@debateai/providers";
import {
  chargeMicrosForUsage,
  decideRunCostEnvelope,
  projectedCallCeilingMicros,
  providerUsageUnreported,
  readReportedUsage,
  runCostEnvelopeReached
} from "@debateai/budget";
import { framedFixturePacket } from "../support/framed-packet.js";

/**
 * V-28 (DL4-F2) — THE MONEY GATE AT THE GATEWAY, against a FAKE VENDOR THAT
 * REPORTS USAGE.
 *
 * The gateway is where every model call in the engine leaves the process, so it
 * is where the money decision has to be taken: the run's spend so far plus what
 * THIS call could cost, compared with the sealed ceiling, BEFORE the first byte
 * is sent. The gateway itself holds no policy — it hands the seam the two facts
 * only it knows (the exact bytes about to be sent, and this attempt's token
 * bound) and records what the vendor reported afterwards.
 */
const MODEL = "configured/model";
const PRICE = Object.freeze({
  inputMicrosPerMillionTokens: 1_000_000,
  outputMicrosPerMillionTokens: 1_000_000
});

function vendorReporting(usage: unknown, calls: { count: number }): typeof fetch {
  return async () => {
    calls.count += 1;
    return new Response(JSON.stringify({
      id: "fixture-1",
      model: MODEL,
      ...(usage === undefined ? {} : { usage }),
      choices: [{ message: { content: "{\"ok\":true}" }, finish_reason: "stop" }]
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
}

function gatewayWith(
  fetchImplementation: typeof fetch,
  costEnvelope: ProviderCostEnvelopeSeam
) {
  const ledger: Array<{ outcome: string }> = [];
  const gateway = new OpenAICompatibleProviderGateway({
    endpoint: "http://fixture/v1", model: MODEL, maker: "fixture",
    fetchImplementation,
    sleepImplementation: async () => undefined,
    persistRawArtifact: async (artifact) => artifact.artifactId,
    appendLedgerEntry: async (entry) => { ledger.push(entry); return `ledger:${ledger.length}`; },
    assertNoOpenWriteTransaction: () => undefined,
    costEnvelope
  });
  return { gateway, ledger };
}

function callRequest(extra: Record<string, unknown> = {}) {
  return {
    runId: "run-1", subjectItemId: "node:test", callSiteKey: "fixture:judge",
    role: "JUDGE" as const, lane: "served" as const,
    bound: { maxAttempts: 3, tokenCeiling: 64, deadlineMs: 5_000 },
    contractHash: "contract:test", providerRef: "provider:test",
    packet: framedFixturePacket("q"),
    ...extra
  };
}

/**
 * The shipped composition's own wiring, in miniature: the seam projects with
 * `projectedCallCeilingMicros`, decides with `decideRunCostEnvelope` against a
 * ceiling, and charges with `chargeMicrosForUsage`. Nothing here is a second
 * implementation of the rule — every line calls the same exported function the
 * runner does.
 */
function meteredSeam(ceilingMicros: number, requireReportedUsage = false) {
  const state = {
    spentMicros: 0,
    projections: [] as number[],
    charges: [] as number[]
  };
  const seam: ProviderCostEnvelopeSeam = {
    assertCallAllowed: (projection) => {
      const projectedMicros = projectedCallCeilingMicros(PRICE, projection);
      state.projections.push(projectedMicros);
      const decision = decideRunCostEnvelope({
        spentMicros: state.spentMicros, projectedMicros, ceilingMicros
      });
      if (decision.kind === "WOULD_CROSS") throw runCostEnvelopeReached(decision);
    },
    recordCall: (observed) => {
      const usage = readReportedUsage(observed.usage);
      if (usage === null) {
        if (requireReportedUsage) throw providerUsageUnreported(observed.providerRef);
        return;
      }
      const charge = chargeMicrosForUsage(PRICE, usage);
      state.charges.push(charge);
      state.spentMicros += charge;
    }
  };
  return { seam, state };
}

describe("V-28 the gateway refuses the call that would cross, BEFORE making it", () => {
  it("asks the seam before the first byte leaves, with the bytes and the token bound", async () => {
    const calls = { count: 0 };
    const { seam, state } = meteredSeam(1_000_000_000);
    const { gateway } = gatewayWith(
      vendorReporting({ prompt_tokens: 100, completion_tokens: 20 }, calls), seam
    );

    await gateway.call(callRequest());

    expect(calls.count).toBe(1);
    expect(state.projections).toHaveLength(1);
    // The projection must cover the answer bound as well as the request, so it
    // is strictly greater than the 64-token ceiling priced on its own.
    expect(state.projections[0]!).toBeGreaterThan(64);
  });

  it("makes NO call and writes NO ledger row when the projection would cross", async () => {
    const calls = { count: 0 };
    const { seam } = meteredSeam(1);
    const { gateway, ledger } = gatewayWith(
      vendorReporting({ prompt_tokens: 100, completion_tokens: 20 }, calls), seam
    );

    await expect(gateway.call(callRequest())).rejects.toThrowError(
      expect.objectContaining({ code: "RUN_COST_ENVELOPE_MONEY_REACHED" })
    );

    expect(calls.count).toBe(0);
    expect(ledger).toEqual([]);
  });

  it("does not retry a money refusal — it is deterministic and would only re-refuse", async () => {
    const calls = { count: 0 };
    let checks = 0;
    const { seam } = meteredSeam(1);
    const { gateway } = gatewayWith(
      vendorReporting({ prompt_tokens: 1, completion_tokens: 1 }, calls),
      {
        assertCallAllowed: (projection) => { checks += 1; seam.assertCallAllowed(projection); },
        recordCall: (observed) => seam.recordCall(observed)
      }
    );

    await expect(gateway.call(callRequest())).rejects.toThrowError(
      expect.objectContaining({ code: "RUN_COST_ENVELOPE_MONEY_REACHED" })
    );

    expect(checks).toBe(1);
  });

  it("charges vendor-reported usage after the call and stops when the sum would cross", async () => {
    const calls = { count: 0 };
    // Each answer costs 300 000 + 200 000 = 500 000 micro-units, which is the
    // whole ceiling. The first call is admitted — its projection is a few
    // hundred micro-units, far under — and its charge lands the run EXACTLY on
    // the ceiling, which J28's boundary says is still within. The second call
    // is then refused, because any further spend takes the run past it.
    const { seam, state } = meteredSeam(500_000);
    const { gateway } = gatewayWith(
      vendorReporting({ prompt_tokens: 300_000, completion_tokens: 200_000 }, calls), seam
    );

    await gateway.call(callRequest());
    expect(state.charges).toEqual([500_000]);
    expect(state.spentMicros).toBe(500_000);

    await expect(gateway.call(callRequest())).rejects.toThrowError(
      expect.objectContaining({ code: "RUN_COST_ENVELOPE_MONEY_REACHED" })
    );
    expect(calls.count).toBe(1);
  });

  it("is INERT when no envelope seam is supplied — local mode is untouched", async () => {
    const calls = { count: 0 };
    const ledger: Array<{ outcome: string }> = [];
    const gateway = new OpenAICompatibleProviderGateway({
      endpoint: "http://fixture/v1", model: MODEL, maker: "fixture",
      fetchImplementation: vendorReporting(undefined, calls),
      sleepImplementation: async () => undefined,
      persistRawArtifact: async (artifact) => artifact.artifactId,
      appendLedgerEntry: async (entry) => { ledger.push(entry); return `ledger:${ledger.length}`; },
      assertNoOpenWriteTransaction: () => undefined
    });

    const result = await gateway.call(callRequest());

    expect(result.model).toBe(MODEL);
    expect(calls.count).toBe(1);
    expect(ledger.map((entry) => entry.outcome)).toEqual(["OK"]);
  });
});

/**
 * A vendor that answers with no usage block cannot be billed, so in hosted mode
 * the answer is REFUSED rather than charged as zero — V-28(3), "because its cost
 * cannot be bounded". The call has already been made and paid for by then, so
 * the attempt is recorded like any other before the refusal leaves.
 */
describe("V-28 a hosted target whose vendor reports no usage is refused", () => {
  it("refuses with the typed code when the usage block is absent", async () => {
    const calls = { count: 0 };
    const { seam } = meteredSeam(1_000_000_000, true);
    const { gateway, ledger } = gatewayWith(vendorReporting(undefined, calls), seam);

    await expect(gateway.call(callRequest())).rejects.toThrowError(
      expect.objectContaining({ code: "PROVIDER_USAGE_UNREPORTED" })
    );

    expect(calls.count).toBe(1);
    // The money was spent: the attempt is in the ledger with its artifact.
    expect(ledger).toHaveLength(1);
  });

  it("refuses a usage block carrying only a total, which cannot be split by price", async () => {
    const calls = { count: 0 };
    const { seam } = meteredSeam(1_000_000_000, true);
    const { gateway } = gatewayWith(vendorReporting({ total_tokens: 40 }, calls), seam);

    await expect(gateway.call(callRequest())).rejects.toThrowError(
      expect.objectContaining({ code: "PROVIDER_USAGE_UNREPORTED" })
    );
  });

  it("does not retry the refusal — a vendor that reports nothing will report nothing again", async () => {
    const calls = { count: 0 };
    const { seam } = meteredSeam(1_000_000_000, true);
    const { gateway } = gatewayWith(vendorReporting(undefined, calls), seam);

    await expect(gateway.call(callRequest())).rejects.toThrowError(
      expect.objectContaining({ code: "PROVIDER_USAGE_UNREPORTED" })
    );

    expect(calls.count).toBe(1);
  });

  it("admits the same answer when the seam does not require reported usage (local mode)", async () => {
    const calls = { count: 0 };
    const { seam, state } = meteredSeam(1_000_000_000, false);
    const { gateway } = gatewayWith(vendorReporting(undefined, calls), seam);

    await expect(gateway.call(callRequest())).resolves.toMatchObject({ model: MODEL });
    expect(state.charges).toEqual([]);
  });
});
