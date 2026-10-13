import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { BudgetRepository } from "@debateai/budget";
import type { ProviderCallRequest, ProviderCostEnvelopeSeam } from "@debateai/providers";
import { TypedDomainError } from "@debateai/kernel";
import { createPostgresProviderGateway } from "@debateai/runner";
import { createRunInFlight, type RunInFlight } from "../../apps/runner/src/run-in-flight.js";
import { fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import { framedFixturePacket } from "../support/framed-packet.js";

/**
 * Parallel AI calls (spec 2026-10-12 §3.5), Task 8 — CALLS IN FLIGHT COUNT.
 *
 * The run-wide attempt ceiling reads the ledger, and a call's ledger row is written only AFTER its HTTP call. With
 * several calls of one debate in flight, each would pass the same "read the total, then act" check. One runner
 * process owns a claimed debate, so an in-memory count of its calls in flight is exact, and the checks add it.
 */

describe("Task 8 · the per-run in-flight count", () => {
  it("counts each begun call and its projected micros, per run and over all runs", () => {
    const inFlight = createRunInFlight();
    const a1 = inFlight.begin("run-a", 100n);
    const a2 = inFlight.begin("run-a", 0n);
    const b1 = inFlight.begin("run-b", 7n);
    expect(inFlight.attempts("run-a")).toBe(2);
    expect(inFlight.projectedMicros("run-a")).toBe(100n);
    expect(inFlight.attempts("run-b")).toBe(1);
    expect(inFlight.projectedMicros("run-b")).toBe(7n);
    expect(inFlight.projectedMicrosAll()).toBe(107n);
    expect(inFlight.attempts("run-c")).toBe(0);
    expect(inFlight.projectedMicros("run-c")).toBe(0n);
    a1();
    expect(inFlight.attempts("run-a")).toBe(1);
    expect(inFlight.projectedMicros("run-a")).toBe(0n);
    expect(inFlight.projectedMicrosAll()).toBe(7n);
    a2();
    b1();
    expect(inFlight.attempts("run-a")).toBe(0);
    expect(inFlight.projectedMicrosAll()).toBe(0n);
  });

  it("releases each call exactly once, however often its release is called", () => {
    const inFlight = createRunInFlight();
    const first = inFlight.begin("run-a", 5n);
    inFlight.begin("run-a", 3n);
    first();
    first();
    first();
    expect(inFlight.attempts("run-a")).toBe(1);
    expect(inFlight.projectedMicros("run-a")).toBe(3n);
    expect(inFlight.projectedMicrosAll()).toBe(3n);
  });

  it("refuses a run id or a projection it cannot count", () => {
    const inFlight = createRunInFlight();
    expect(() => inFlight.begin("", 0n)).toThrow("RUN_IN_FLIGHT_INPUT_INVALID");
    expect(() => inFlight.begin("run-a", -1n)).toThrow("RUN_IN_FLIGHT_INPUT_INVALID");
    expect(() => inFlight.begin("run-a", 1 as unknown as bigint)).toThrow("RUN_IN_FLIGHT_INPUT_INVALID");
    expect(inFlight.attempts("run-a")).toBe(0);
  });
});

/** A pool double that answers the pinned basis and the run's attempt count, and nothing else. */
function ceilingPool(input: { readonly basis: unknown; readonly runAttempts: number; readonly siteAttempts?: number }) {
  return {
    query: vi.fn(async (sql: string) => {
      if (sql.includes("SELECT envelope_basis")) return { rows: [{ envelope_basis: input.basis }] };
      if (sql.includes("SELECT count(*)::text") && sql.includes("NOT LIKE 'STORY:%'")) {
        return { rows: [{ count: String(input.runAttempts) }] };
      }
      if (sql.includes("SELECT count(*)::text")) return { rows: [{ count: String(input.siteAttempts ?? 0) }] };
      throw new Error(`UNEXPECTED_QUERY:${sql}`);
    }),
    connect: vi.fn(async () => ({
      query: vi.fn(async (sql: string, values?: readonly unknown[]) => {
        if (sql.includes("pg_try_advisory_lock")) return { rows: [{ acquired: true }] };
        if (sql.includes("run_private_content_is_live")) return {
          rows: [{ run_id: String((values?.[0] as readonly string[])[0]), live: true }]
        };
        if (sql.includes("pg_advisory_unlock")) return { rows: [{ unlocked: true }] };
        throw new Error(`UNEXPECTED_CLIENT_QUERY:${sql}`);
      }),
      release: vi.fn()
    }))
  } as unknown as Pool;
}

async function outcomeOf(promise: Promise<unknown>): Promise<string> {
  return promise.then(
    () => "SENT",
    (error: unknown) => (error instanceof TypedDomainError ? error.code : String(error))
  );
}

describe("Task 8 · the attempt ceiling adds the debate's other calls in flight", () => {
  const repository = (runAttempts: number) =>
    new BudgetRepository(ceilingPool({ basis: fixtureStructuralCeiling(3), runAttempts }));

  it("refuses a new call at ceiling 3 with 2 consumed and one other call in flight", async () => {
    expect(await outcomeOf(repository(2).assertModelAttemptAllowed("run-1", "BODY", { inFlightAttempts: 1 })))
      .toBe("RUN_COST_ENVELOPE_EXHAUSTED");
  });

  it("allows the one call alone at ceiling 3 with 2 consumed", async () => {
    expect(await outcomeOf(repository(2).assertModelAttemptAllowed("run-1", "BODY", { inFlightAttempts: 0 })))
      .toBe("SENT");
    expect(await outcomeOf(repository(1).assertModelAttemptAllowed("run-1", "BODY", { inFlightAttempts: 1 })))
      .toBe("SENT");
  });

  it("decides exactly as before when nothing is in flight or nothing is passed", async () => {
    expect(await outcomeOf(repository(2).assertModelAttemptAllowed("run-1", "BODY"))).toBe("SENT");
    expect(await outcomeOf(repository(3).assertModelAttemptAllowed("run-1", "BODY"))).toBe("RUN_COST_ENVELOPE_EXHAUSTED");
  });

  it("names the calls in flight in its refusal", async () => {
    const refusal = await repository(2).assertModelAttemptAllowed("run-1", "BODY", { inFlightAttempts: 1 })
      .then(() => null, (error: unknown) => error);
    expect((refusal as Error).message).toContain("attempt 4 of a BODY ceiling of 3");
    expect((refusal as Error).message).toContain("1 other call in flight");
  });

  it("refuses an in-flight count it cannot add", async () => {
    for (const inFlightAttempts of [-1, 1.5, Number.NaN]) {
      await expect(repository(0).assertModelAttemptAllowed("run-1", "BODY", { inFlightAttempts }))
        .rejects.toThrow("MODEL_ATTEMPT_IN_FLIGHT_INVALID");
    }
  });
});

const SENT_NOTHING = "TASK8_TEST_SEAM_REFUSED_BEFORE_SENDING";
const RUN = "run:task8";

/**
 * The runner's gateway over the pool double. Its money seam records how many calls of the run were in flight when
 * the gateway reached it (the call itself included) and then refuses, so nothing is sent or written.
 */
function gatewayOver(input: {
  readonly runAttempts: number;
  readonly siteAttempts?: number;
  readonly inFlight?: RunInFlight;
  readonly seenAtSeam?: number[];
  readonly buildThrows?: boolean;
}) {
  const refusing = (): ProviderCostEnvelopeSeam => ({
    assertCallAllowed: () => {
      input.seenAtSeam?.push(input.inFlight?.attempts(RUN) ?? -1);
      throw new TypedDomainError(SENT_NOTHING, "refused before sending");
    },
    recordCall: () => undefined,
    assertUsageReported: () => undefined
  });
  return createPostgresProviderGateway(ceilingPool({
    basis: fixtureStructuralCeiling(3), runAttempts: input.runAttempts, siteAttempts: input.siteAttempts ?? 0
  }), {
    endpoint: "http://127.0.0.1:1",
    model: "test/model",
    maker: "test-maker",
    ...(input.inFlight === undefined ? {} : { inFlight: input.inFlight }),
    buildCostEnvelopeSeam: () => {
      if (input.buildThrows === true) throw new TypeError("TASK8_SEAM_BUILD_FAILED");
      return refusing();
    },
    buildStoryCostEnvelopeSeam: () => refusing()
  });
}

function judgeCall(overrides: Partial<ProviderCallRequest> = {}): ProviderCallRequest {
  return {
    runId: RUN,
    subjectItemId: "work:task8",
    callSiteKey: "JUDGE:node:1",
    role: "JUDGE",
    lane: "served",
    bound: { maxAttempts: 3, tokenCeiling: 64, deadlineMs: 1_000 },
    contractHash: "a".repeat(64),
    providerRef: "provider:test",
    packet: framedFixturePacket("task 8"),
    ...overrides
  };
}

describe("Task 8 · the runner's gateway counts its own calls in flight", () => {
  it("lets one call alone through at ceiling 3 with 2 consumed, counted once while it is in flight", async () => {
    const inFlight = createRunInFlight();
    const seenAtSeam: number[] = [];
    expect(await outcomeOf(gatewayOver({ runAttempts: 2, inFlight, seenAtSeam }).call(judgeCall())))
      .toBe(SENT_NOTHING);
    // Past both ceiling checks (the one before the call and the per-attempt hook), counted exactly once.
    expect(seenAtSeam).toEqual([1]);
    expect(inFlight.attempts(RUN)).toBe(0);
  });

  it("refuses a new call at ceiling 3 with 2 consumed while another call of the debate is in flight", async () => {
    const inFlight = createRunInFlight();
    const other = inFlight.begin(RUN, 0n);
    const seenAtSeam: number[] = [];
    expect(await outcomeOf(gatewayOver({ runAttempts: 2, inFlight, seenAtSeam }).call(judgeCall())))
      .toBe("RUN_COST_ENVELOPE_EXHAUSTED");
    expect(seenAtSeam).toEqual([]);
    // The refused call released itself; only the other call is still counted.
    expect(inFlight.attempts(RUN)).toBe(1);
    other();
    expect(inFlight.attempts(RUN)).toBe(0);
  });

  it("never counts a call of another debate", async () => {
    const inFlight = createRunInFlight();
    inFlight.begin("run:another", 0n);
    expect(await outcomeOf(gatewayOver({ runAttempts: 2, inFlight }).call(judgeCall()))).toBe(SENT_NOTHING);
    expect(inFlight.attempts(RUN)).toBe(0);
  });

  it("releases the call on the site's own exhaustion, before anything is sent", async () => {
    const inFlight = createRunInFlight();
    expect(await outcomeOf(gatewayOver({ runAttempts: 0, siteAttempts: 3, inFlight }).call(judgeCall())))
      .toBe("CALL_BUDGET_EXHAUSTED");
    expect(inFlight.attempts(RUN)).toBe(0);
  });

  it("releases the call when building its money seam throws synchronously", async () => {
    const inFlight = createRunInFlight();
    expect(await outcomeOf(gatewayOver({ runAttempts: 0, inFlight, buildThrows: true }).call(judgeCall())))
      .toContain("TASK8_SEAM_BUILD_FAILED");
    expect(inFlight.attempts(RUN)).toBe(0);
  });

  it("never counts a story call, which the run's attempt ceiling does not bound", async () => {
    const inFlight = createRunInFlight();
    const seenAtSeam: number[] = [];
    const story = judgeCall({ lane: "story", role: "SYNTHESIZER", callSiteKey: "STORY:STORYTELLER:1" });
    expect(await outcomeOf(gatewayOver({ runAttempts: 3, inFlight, seenAtSeam }).call(story))).toBe(SENT_NOTHING);
    expect(seenAtSeam).toEqual([0]);
    expect(inFlight.attempts(RUN)).toBe(0);
  });

  it("decides exactly as before without a counter", async () => {
    expect(await outcomeOf(gatewayOver({ runAttempts: 2 }).call(judgeCall()))).toBe(SENT_NOTHING);
    expect(await outcomeOf(gatewayOver({ runAttempts: 3 }).call(judgeCall()))).toBe("RUN_COST_ENVELOPE_EXHAUSTED");
  });
});
