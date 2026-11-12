import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import {
  OpenAICompatibleProviderGateway,
  PreviewChargeBookedMax,
  PreviewGateUnavailable,
  type OpenAICompatibleGatewayOptions,
  type ProviderCostEnvelopeSeam
} from "@debateai/providers";
import {
  chargeMicrosForUsage,
  chargeableUsage,
  CostEnvelopeGuard,
  costEnvelopeDay,
  decideRunCostEnvelope,
  projectedCallCeilingMicros,
  projectedCallUsage,
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
  costEnvelope: ProviderCostEnvelopeSeam,
  overrides: Partial<OpenAICompatibleGatewayOptions> = {}
) {
  const ledger: Array<{ outcome: string; attemptId?: string }> = [];
  const gateway = new OpenAICompatibleProviderGateway({
    endpoint: "http://fixture/v1", model: MODEL, maker: "fixture",
    fetchImplementation,
    sleepImplementation: async () => undefined,
    persistRawArtifact: async (artifact) => artifact.artifactId,
    appendLedgerEntry: async (entry) => { ledger.push(entry); return `ledger:${ledger.length}`; },
    assertNoOpenWriteTransaction: () => undefined,
    ...overrides
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
function meteredSeam(
  ceilingMicros: number,
  requireReportedUsage = false,
  options: Readonly<{ failUnanswered?: boolean; failCharge?: boolean }> = {}
) {
  const state = {
    spentMicros: 0,
    projections: [] as number[],
    charges: [] as number[],
    // NV-50: the attempts charged as sent and never answered, at their usage or else their projection.
    unanswered: [] as Array<{ charge: number; attemptId: string }>
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
    // Important 1: it charges through `chargeableUsage`, the same function the
    // shipped seam uses, so a count this cannot read falls back to the call's
    // own projected maximum here exactly as it does in production.
    recordCall: (observed) => {
      // NV-50 (case l): the store write failing untyped, as `PostgresModelSpendStore.recordSpend` can.
      if (options.failCharge === true) throw new Error("db down");
      const usage = chargeableUsage(observed.usage, observed.projection);
      if (usage === null) return;
      const charge = chargeMicrosForUsage(PRICE, usage);
      state.charges.push(charge);
      state.spentMicros += charge;
    },
    // NV-50: the shipped seam's rule, by the same exported functions: the body's usage when one was read, else the
    // attempt's projected maximum.
    recordUnanswered: async (observed) => {
      if (options.failUnanswered === true) throw new Error("db down");
      const usage = chargeableUsage(observed.usage, observed.projection) ?? projectedCallUsage(observed.projection);
      const charge = chargeMicrosForUsage(PRICE, usage);
      state.unanswered.push({ charge, attemptId: observed.attemptId });
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
  /**
   * Verbatim from OpenAI's `chat/completions` today, counts aside.
   *
   * The counts are fixture arithmetic, derived here so nobody has to re-derive
   * them. The case below needs ONE answer to cost exactly the whole of both
   * ceilings, AND needs that answer's call to be ADMITTED first — so the
   * answer's charge (prompt + completion tokens at one micro-unit each) must be
   * at least the call's pre-send projection: ceil(request bytes / 2) + the
   * 64-token bound. Frame v2 (hate-speech S01) carries the content rule, and its
   * 1 929 JSON bytes took the fixture request from 1 858 to 3 787 bytes, so the
   * projection went from 993 to 1 958 micro-units — past the old 1 500-token
   * answer, which then had its own call refused before it was made. Ten times
   * those counts (15 000) leaves the frame room to grow to ~29.8 kB before the
   * precondition the case asserts first — projection within the ceiling — fails
   * by name.
   */
  const OPENAI_USAGE = Object.freeze({
    prompt_tokens: 12_000,
    completion_tokens: 3_000,
    total_tokens: 15_000,
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
      readRunSpentMicros: async (runId) => sum(rows.filter((row) => row.runId === runId && row.spendSource !== "STORY")),
      readRunStorySpentMicros: async (runId) => sum(rows.filter((row) => row.runId === runId && row.spendSource === "STORY")),
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
    // Prompt + completion tokens at one micro-unit each (PRICE).
    const answerMicros = OPENAI_USAGE.prompt_tokens + OPENAI_USAGE.completion_tokens;
    const guard = new CostEnvelopeGuard({
      store,
      // Deliberately tight: ONE such answer costs the whole of both ceilings,
      // so the run lands EXACTLY on its own (J28's boundary: still within) and
      // the day is REACHED.
      policy: { perRunCeilingMicros: answerMicros, dailyCeilingMicros: answerMicros },
      clock: () => NOW
    });
    const seam = guard.providerSeam({ runId: "run-1", price: PRICE, requireReportedUsage: true, phase: "BODY" });
    // What the guard was asked to admit, priced by the same function it uses.
    const projected: number[] = [];
    const { gateway } = gatewayWith(vendorReporting(OPENAI_USAGE, calls), {
      assertCallAllowed: (projection) => {
        projected.push(projectedCallCeilingMicros(PRICE, projection));
        return seam.assertCallAllowed(projection);
      },
      recordCall: (observed) => seam.recordCall(observed),
      assertUsageReported: (observed) => seam.assertUsageReported(observed)
    });

    const answered = await gateway.call().then((result) => result, (error: unknown) => error);

    // The PRECONDITION, first and by name: a projection larger than the ceiling
    // refuses the first call before it is made, which says the fixture's counts
    // no longer cover the frame — not that the money path broke.
    expect(projected).toHaveLength(1);
    expect(projected[0]!).toBeLessThanOrEqual(answerMicros);
    expect(answered).toMatchObject({ model: MODEL });

    expect(calls.count).toBe(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      spendSource: "RUN",
      runId: "run-1",
      providerRef: "provider:test",
      chargedOn: costEnvelopeDay(NOW),
      chargeMicros: answerMicros,
      inputTokens: OPENAI_USAGE.prompt_tokens,
      outputTokens: OPENAI_USAGE.completion_tokens
    });
    expect(await store.readRunSpentMicros("run-1")).toBe(answerMicros);
    expect(await store.readDaySpentMicros(costEnvelopeDay(NOW))).toBe(answerMicros);

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
      prompt_tokens: OPENAI_USAGE.prompt_tokens,
      completion_tokens: OPENAI_USAGE.completion_tokens,
      total_tokens: OPENAI_USAGE.total_tokens
    });
  });
});

/**
 * NV-50 (security audit run 3) — A SENT ATTEMPT THAT NEVER ANSWERED IS CHARGED.
 *
 * The only charge point used to be `recordCall`, reached only once a body was read and its artifact stored. A deadline,
 * a dropped connection or a store failure after the send went to the catch, which retried: each retry was admitted
 * against a total that never saw the attempt before it. Now the catch charges such an attempt through the seam's
 * `recordUnanswered` (the body's usage when one was read, else its projected maximum) before the next attempt is
 * admitted; provably unsent failures (a connection never made, the preview gate's own refusals, fetch's argument
 * checks) are not charged; and a charge that cannot be written stops the call.
 */
describe("NV-50 a sent attempt that never answered is charged", () => {
  const timingOut = (sends: { count: number }): typeof fetch => async () => {
    sends.count += 1;
    throw new DOMException("timeout", "TimeoutError");
  };
  const throwing = (sends: { count: number }, error: () => unknown): typeof fetch => async () => {
    sends.count += 1;
    throw error();
  };

  it("(a) charges each timed-out attempt at its projection, under its ledger row's attempt id", async () => {
    const sends = { count: 0 };
    const { seam, state } = meteredSeam(1_000_000_000);
    const { gateway, ledger } = gatewayWith(timingOut(sends), seam);

    await expect(gateway.call()).rejects.toThrowError(expect.objectContaining({ code: "PROVIDER_CALL_FAILED" }));

    expect(sends.count).toBe(3);
    expect(ledger.map((entry) => entry.outcome)).toEqual(["TIMED_OUT", "TIMED_OUT", "TIMED_OUT"]);
    expect(state.unanswered.map((entry) => entry.charge)).toEqual(state.projections);
    expect(state.unanswered).toHaveLength(3);
    const ids = state.unanswered.map((entry) => entry.attemptId);
    expect(new Set(ids).size).toBe(3);
    expect(ids).toEqual(ledger.map((entry) => entry.attemptId));
    expect(state.charges).toEqual([]);
  });

  it("(b) charges a dropped connection (fetch failed, no cause)", async () => {
    const sends = { count: 0 };
    const { seam, state } = meteredSeam(1_000_000_000);
    const { gateway, ledger } = gatewayWith(throwing(sends, () => new TypeError("fetch failed")), seam);

    await expect(gateway.call()).rejects.toThrowError(expect.objectContaining({ code: "PROVIDER_CALL_FAILED" }));

    expect(ledger.map((entry) => entry.outcome)).toEqual(["FAILED", "FAILED", "FAILED"]);
    expect(state.unanswered).toHaveLength(3);
  });

  it("(c) guard: a connection that was never made is not charged", async () => {
    const sends = { count: 0 };
    const { seam, state } = meteredSeam(1_000_000_000);
    const { gateway, ledger } = gatewayWith(throwing(sends, () => new TypeError("fetch failed", {
      cause: Object.assign(new Error("connect"), { code: "ECONNREFUSED" })
    })), seam);

    await expect(gateway.call()).rejects.toThrowError(expect.objectContaining({ code: "PROVIDER_CALL_FAILED" }));

    expect(ledger.map((entry) => entry.outcome)).toEqual(["FAILED", "FAILED", "FAILED"]);
    expect(state.unanswered).toEqual([]);
  });

  it("(d) the run's ceiling stops the retries: the next attempt is refused for money after one unanswered charge", async () => {
    // P = one attempt's projection, read off a probe call.
    const probe = meteredSeam(1_000_000_000);
    await gatewayWith(vendorReporting({ prompt_tokens: 1, completion_tokens: 1 }, { count: 0 }), probe.seam).gateway.call();
    const projection = probe.state.projections[0]!;
    const sends = { count: 0 };
    const { seam, state } = meteredSeam(projection);
    const { gateway } = gatewayWith(timingOut(sends), seam);

    await expect(gateway.call()).rejects.toThrowError(
      expect.objectContaining({ code: "RUN_COST_ENVELOPE_MONEY_REACHED" })
    );

    expect(sends.count).toBe(1);
    expect(state.unanswered.map((entry) => entry.charge)).toEqual([projection]);
  });

  it("(e) charges an answered attempt whose artifact could not be stored at the body's usage, not the projection", async () => {
    const sends = { count: 0 };
    const { seam, state } = meteredSeam(1_000_000_000);
    const { gateway, ledger } = gatewayWith(
      vendorReporting({ prompt_tokens: 10, completion_tokens: 5 }, sends), seam,
      { persistRawArtifact: async () => { throw new Error("store down"); } }
    );

    await expect(gateway.call()).rejects.toThrowError(expect.objectContaining({ code: "PROVIDER_CALL_FAILED" }));

    expect(sends.count).toBe(3);
    expect(ledger.map((entry) => entry.outcome)).toEqual(["FAILED", "FAILED", "FAILED"]);
    const answered = chargeMicrosForUsage(PRICE, { promptTokens: 10, completionTokens: 5 });
    expect(state.unanswered.map((entry) => entry.charge)).toEqual([answered, answered, answered]);
    expect(state.charges).toEqual([]);
  });

  it("(f) stops the call when the unanswered charge cannot be written: no attempt is sent on unrecorded money", async () => {
    const sends = { count: 0 };
    const { seam } = meteredSeam(1_000_000_000, false, { failUnanswered: true });
    const { gateway, ledger } = gatewayWith(timingOut(sends), seam);

    await expect(gateway.call()).rejects.toThrowError(expect.objectContaining({ code: "PROVIDER_CALL_FAILED" }));

    expect(sends.count).toBe(1);
    expect(ledger.map((entry) => entry.outcome)).toEqual(["TIMED_OUT"]);
  });

  it("(g) guard: a seam without recordUnanswered keeps today's three sends", async () => {
    const sends = { count: 0 };
    const { seam } = meteredSeam(1_000_000_000);
    const { recordUnanswered: _absent, ...withoutUnanswered } = seam as ProviderCostEnvelopeSeam
      & { recordUnanswered?: unknown };
    const { gateway } = gatewayWith(timingOut(sends), withoutUnanswered);

    await expect(gateway.call()).rejects.toThrowError(expect.objectContaining({ code: "PROVIDER_CALL_FAILED" }));

    expect(sends.count).toBe(3);
  });

  it("(h) preview: the gate found halted before anything was reserved is not charged", async () => {
    const sends = { count: 0 };
    const { seam, state } = meteredSeam(1_000_000_000);
    const { gateway } = gatewayWith(throwing(sends, () => new PreviewGateUnavailable()), seam);

    await expect(gateway.call()).rejects.toThrowError();

    expect(sends.count).toBeGreaterThan(0);
    expect(state.unanswered).toEqual([]);
  });

  it("(i) preview: the gate's daily refusal stops the call and is not charged", async () => {
    const sends = { count: 0 };
    const { seam, state } = meteredSeam(1_000_000_000);
    const { gateway } = gatewayWith(
      throwing(sends, () => new TypedDomainError("DAILY_COST_ENVELOPE_REACHED", "x")), seam
    );

    await expect(gateway.call()).rejects.toThrowError(expect.objectContaining({ code: "DAILY_COST_ENVELOPE_REACHED" }));

    expect(sends.count).toBe(1);
    expect(state.unanswered).toEqual([]);
  });

  it("(j) preview: a call the gate says was sent and booked at its maximum is charged at its projection", async () => {
    const sends = { count: 0 };
    const { seam, state } = meteredSeam(1_000_000_000);
    const { gateway } = gatewayWith(throwing(sends, () => new PreviewChargeBookedMax()), seam);

    await expect(gateway.call({ bound: { maxAttempts: 1, tokenCeiling: 64, deadlineMs: 5_000 } }))
      .rejects.toThrowError(expect.objectContaining({ code: "PROVIDER_CALL_FAILED" }));

    expect(sends.count).toBe(1);
    expect(state.unanswered.map((entry) => entry.charge)).toEqual([state.projections[0]]);
  });

  it("(k) guard: a TypeError the in-process fetch raises before sending is not charged", async () => {
    const sends = { count: 0 };
    const { seam, state } = meteredSeam(1_000_000_000);
    const { gateway } = gatewayWith(
      throwing(sends, () => new TypeError("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID")), seam
    );

    await expect(gateway.call()).rejects.toThrowError();

    expect(state.unanswered).toEqual([]);
  });

  it("(l) stops the call when recordCall's own store write fails: one send, nothing charged twice", async () => {
    const sends = { count: 0 };
    const { seam, state } = meteredSeam(1_000_000_000, false, { failCharge: true });
    const { gateway } = gatewayWith(vendorReporting({ prompt_tokens: 10, completion_tokens: 5 }, sends), seam);

    await expect(gateway.call()).rejects.toThrowError(expect.objectContaining({ code: "PROVIDER_CALL_FAILED" }));

    expect(sends.count).toBe(1);
    expect(state.unanswered).toEqual([]);
  });

  /**
   * Review r2 minor 10: rule 5 reads Node's own fetch failure by its message. These two run the REAL fetch against a
   * loopback port (nothing leaves the machine), so a Node that renames "fetch failed" or its causes reddens here first.
   */
  it("(m) real fetch: a refused connection is \"fetch failed\" with an ECONNREFUSED cause, and is not charged", async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const refused = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, { method: "POST", body: "{}" })
      .then(() => null, (error: unknown) => error);
    expect(refused).toBeInstanceOf(TypeError);
    expect((refused as TypeError).message).toBe("fetch failed");
    expect(((refused as TypeError).cause as { code?: unknown }).code).toBe("ECONNREFUSED");

    const { seam, state } = meteredSeam(1_000_000_000);
    const { gateway } = gatewayWith(fetch, seam, { endpoint: `http://127.0.0.1:${port}/v1` });
    await expect(gateway.call()).rejects.toThrowError(expect.objectContaining({ code: "PROVIDER_CALL_FAILED" }));
    expect(state.unanswered).toEqual([]);
  });

  it("(n) real fetch: a connection dropped after the request arrived is charged on every attempt", async () => {
    let received = 0;
    const server = createServer((request) => {
      request.resume();
      request.on("end", () => { received += 1; request.socket.destroy(); });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    try {
      const { seam, state } = meteredSeam(1_000_000_000);
      const { gateway } = gatewayWith(fetch, seam, { endpoint: `http://127.0.0.1:${port}/v1` });
      const failed = await gateway.call().then(() => null, (error: unknown) => error);
      expect(failed).toMatchObject({ code: "PROVIDER_CALL_FAILED" });
      expect(received).toBe(3);
      expect(state.unanswered.map((entry) => entry.charge)).toEqual(state.projections);
      expect(state.unanswered).toHaveLength(3);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
