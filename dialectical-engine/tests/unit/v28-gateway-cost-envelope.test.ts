import { describe, expect, it } from "vitest";
import {
  OpenAICompatibleProviderGateway,
  type ProviderCostEnvelopeSeam
} from "@debateai/providers";
import {
  chargeMicrosForUsage,
  CostEnvelopeGuard,
  costEnvelopeDay,
  decideRunCostEnvelope,
  projectedCallCeilingMicros,
  providerUsageUnreported,
  readReportedUsage,
  runCostEnvelopeReached,
  type ModelSpendEntry,
  type ModelSpendStore
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

/**
 * The seam rides on the REQUEST, not on the gateway: the price is the target's,
 * but the SPEND is the run's, and one gateway serves every run that reaches that
 * target. `gatewayWith` therefore builds the gateway and the request-shaped
 * envelope together, which is exactly what the runner's factory does.
 */
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
    assertNoOpenWriteTransaction: () => undefined
  });
  return {
    gateway: { call: (extra: Record<string, unknown> = {}) =>
      gateway.call(callRequest({ costEnvelope, ...extra })) },
    ledger
  };
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
    // I4: charging NEVER refuses. It records money the vendor has already
    // taken, and a refusal here would be a reason not to record it.
    recordCall: (observed) => {
      const usage = readReportedUsage(observed.usage);
      if (usage === null) return;
      const charge = chargeMicrosForUsage(PRICE, usage);
      state.charges.push(charge);
      state.spentMicros += charge;
    },
    assertUsageReported: (observed) => {
      if (!requireReportedUsage) return;
      if (readReportedUsage(observed.usage) === null) {
        throw providerUsageUnreported(observed.providerRef);
      }
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

    await gateway.call();

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

    await expect(gateway.call()).rejects.toThrowError(
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
        recordCall: (observed) => seam.recordCall(observed),
        assertUsageReported: (observed) => seam.assertUsageReported(observed)
      }
    );

    await expect(gateway.call()).rejects.toThrowError(
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

    await gateway.call();
    expect(state.charges).toEqual([500_000]);
    expect(state.spentMicros).toBe(500_000);

    await expect(gateway.call()).rejects.toThrowError(
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

    // No `costEnvelope` on the request at all: the money gate does not exist
    // for this call, and a vendor that reports no usage is answered normally.
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

    await expect(gateway.call()).rejects.toThrowError(
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

    await expect(gateway.call()).rejects.toThrowError(
      expect.objectContaining({ code: "PROVIDER_USAGE_UNREPORTED" })
    );
  });

  it("does not retry the refusal — a vendor that reports nothing will report nothing again", async () => {
    const calls = { count: 0 };
    const { seam } = meteredSeam(1_000_000_000, true);
    const { gateway } = gatewayWith(vendorReporting(undefined, calls), seam);

    await expect(gateway.call()).rejects.toThrowError(
      expect.objectContaining({ code: "PROVIDER_USAGE_UNREPORTED" })
    );

    expect(calls.count).toBe(1);
  });

  /**
   * I4 (review round 2) — A CALL THE VENDOR BILLED MUST BE CHARGED, EVEN WHEN
   * THE ENGINE THEN REFUSES ITS BODY.
   *
   * Round 1 charged after `assertBoundedProviderResponse`, so a 200 the vendor
   * had already billed — an over-long model id, a usage block with an unknown
   * field — threw before the charge and was never added to either total. The
   * attempt was then RETRIED, and the same thing happened again: real money,
   * spent repeatedly, invisible to both ceilings. The charge moves to the point
   * every completed attempt passes, right after the artifact is recorded.
   */
  it("charges a 200 whose body the engine then refuses", async () => {
    const calls = { count: 0 };
    const { seam, state } = meteredSeam(1_000_000_000);
    const { gateway } = gatewayWith(async () => {
      calls.count += 1;
      return new Response(JSON.stringify({
        id: "fixture-1",
        // Over-long: `assertBoundedProviderResponse` refuses it AFTER the call
        // was made and billed.
        model: "m".repeat(300),
        usage: { prompt_tokens: 1_000, completion_tokens: 500 },
        choices: [{ message: { content: "{}" }, finish_reason: "stop" }]
      }), { status: 200, headers: { "content-type": "application/json" } });
    }, seam);

    await expect(gateway.call()).rejects.toThrowError();

    expect(calls.count).toBeGreaterThan(0);
    // Every attempt the vendor billed is on the run's total.
    expect(state.charges).toHaveLength(calls.count);
    expect(state.spentMicros).toBe(1_500 * calls.count);
  });

  it("charges a non-OK response that still reported usage", async () => {
    const calls = { count: 0 };
    const { seam, state } = meteredSeam(1_000_000_000);
    const { gateway } = gatewayWith(async () => {
      calls.count += 1;
      return new Response(JSON.stringify({
        id: "fixture-1", model: MODEL,
        usage: { prompt_tokens: 10, completion_tokens: 0 },
        choices: [{ message: { content: "{}" } }]
      }), { status: 429, headers: { "content-type": "application/json" } });
    }, seam);

    await expect(gateway.call()).rejects.toThrowError();

    expect(state.charges).toHaveLength(calls.count);
  });

  it("does NOT turn a transport failure into a usage refusal", async () => {
    // A 503 with an empty body reports no usage, and must stay a transport
    // failure: the "vendor cannot be billed" refusal belongs to a SUCCESSFUL
    // completion, not to an error page.
    const { seam } = meteredSeam(1_000_000_000, true);
    const { gateway } = gatewayWith(
      async () => new Response("upstream is down", { status: 503 }), seam
    );

    const error = await gateway.call().then(() => null, (thrown: unknown) => thrown);
    expect(error).not.toMatchObject({ code: "PROVIDER_USAGE_UNREPORTED" });
  });

  it("admits the same answer when the seam does not require reported usage (local mode)", async () => {
    const calls = { count: 0 };
    const { seam, state } = meteredSeam(1_000_000_000, false);
    const { gateway } = gatewayWith(vendorReporting(undefined, calls), seam);

    await expect(gateway.call()).resolves.toMatchObject({ model: MODEL });
    expect(state.charges).toEqual([]);
  });
});

/**
 * C-I1 (final review, area C) — THE SHAPE A REAL VENDOR ACTUALLY RETURNS.
 *
 * Everything above drives the seam from a fake whose `usage` carries only the
 * four bounded members. OpenAI's chat completions have not returned that shape
 * since 2024: every 200 also carries `prompt_tokens_details` and
 * `completion_tokens_details`. The gateway derived `reportedUsage` from the
 * STRICT usage schema, so one unknown member turned the whole block into "the
 * vendor reported nothing": no ledger row, no movement on either ceiling, and
 * the answer refused as `PROVIDER_USAGE_INVALID` and RETRIED — every attempt
 * billed by the vendor and invisible to the money.
 *
 * So this case runs the REAL guard over a real ledger store, and asks the only
 * question that matters: after one such answer, is the money on the ledger, and
 * do both ceilings know about it?
 */
describe("C-I1 a 200 carrying a real vendor's usage block is charged", () => {
  const NOW = new Date("2026-09-22T11:00:00.000Z");
  /** Verbatim from OpenAI's `chat/completions` today, counts aside. */
  const OPENAI_USAGE = Object.freeze({
    prompt_tokens: 1_200,
    completion_tokens: 300,
    total_tokens: 1_500,
    prompt_tokens_details: { cached_tokens: 0, audio_tokens: 0 },
    completion_tokens_details: {
      reasoning_tokens: 0,
      audio_tokens: 0,
      accepted_prediction_tokens: 0,
      rejected_prediction_tokens: 0
    }
  });

  /** `ledger.model_spend` and its reservations, in memory: the rules, not the SQL. */
  function ledgerStore() {
    const rows: ModelSpendEntry[] = [];
    const reservations: Array<{ reservedMicros: number; expiresAt: Date }> = [];
    const sum = (kept: readonly ModelSpendEntry[]) =>
      kept.reduce((total, row) => total + row.chargeMicros, 0);
    const store: ModelSpendStore = {
      recordSpend: async (entry) => { rows.push(entry); },
      readRunSpentMicros: async (runId) => sum(rows.filter((row) => row.runId === runId)),
      readDaySpentMicros: async (day) => sum(rows.filter((row) => row.chargedOn === day)),
      admitNewRun: async (input) => {
        const held = reservations
          .filter((reservation) => reservation.expiresAt.getTime() > input.now.getTime())
          .reduce((total, reservation) => total + reservation.reservedMicros, 0);
        const committedMicros = sum(rows.filter((row) => row.chargedOn === input.day)) + held;
        const admitted = input.decide(committedMicros);
        if (admitted) {
          reservations.push({
            reservedMicros: input.reservedMicros,
            expiresAt: input.expiresAt
          });
        }
        return Object.freeze({ admitted, committedMicros });
      }
    };
    return { store, rows };
  }

  it("charges it to the ledger, to the run's ceiling and to the day's", async () => {
    const calls = { count: 0 };
    const { store, rows } = ledgerStore();
    const guard = new CostEnvelopeGuard({
      store,
      // Deliberately tight: ONE such answer costs the whole of both ceilings,
      // so the run lands EXACTLY on its own (J28's boundary: still within) and
      // the day is REACHED. A projection larger than this would refuse the
      // first call outright and fail the case below, never pass it quietly.
      policy: { perRunCeilingMicros: 1_500, dailyCeilingMicros: 1_500 },
      clock: () => NOW
    });
    const { gateway } = gatewayWith(
      vendorReporting(OPENAI_USAGE, calls),
      guard.providerSeam({ runId: "run-1", price: PRICE, requireReportedUsage: true })
    );

    await expect(gateway.call()).resolves.toMatchObject({ model: MODEL });

    expect(calls.count).toBe(1);
    // 1 200 + 300 tokens at one micro-unit each.
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      spendSource: "RUN",
      runId: "run-1",
      providerRef: "provider:test",
      chargedOn: costEnvelopeDay(NOW),
      chargeMicros: 1_500,
      inputTokens: 1_200,
      outputTokens: 300
    });
    expect(await store.readRunSpentMicros("run-1")).toBe(1_500);
    expect(await store.readDaySpentMicros(costEnvelopeDay(NOW))).toBe(1_500);

    // The RUN's ceiling now refuses this run's next call...
    await expect(gateway.call()).rejects.toThrowError(
      expect.objectContaining({ code: "RUN_COST_ENVELOPE_MONEY_REACHED" })
    );
    expect(calls.count).toBe(1);
    // ...and the DAY's ceiling refuses the next run.
    await expect(guard.assertDailyEnvelopeAdmitsNewRun()).rejects.toThrowError(
      expect.objectContaining({ code: "DAILY_COST_ENVELOPE_REACHED" })
    );
  });

  it("persists only the four bounded members on the artifact, never the vendor's extras", async () => {
    const calls = { count: 0 };
    const artifacts: Array<Readonly<Record<string, unknown>>> = [];
    const gateway = new OpenAICompatibleProviderGateway({
      endpoint: "http://fixture/v1", model: MODEL, maker: "fixture",
      fetchImplementation: vendorReporting(OPENAI_USAGE, calls),
      sleepImplementation: async () => undefined,
      persistRawArtifact: async (artifact) => {
        artifacts.push(artifact.metadata);
        return artifact.artifactId;
      },
      appendLedgerEntry: async () => "ledger:1",
      assertNoOpenWriteTransaction: () => undefined
    });

    await expect(gateway.call(callRequest())).resolves.toMatchObject({ model: MODEL });

    expect(artifacts[0]?.usage).toEqual({
      prompt_tokens: 1_200, completion_tokens: 300, total_tokens: 1_500
    });
  });
});
