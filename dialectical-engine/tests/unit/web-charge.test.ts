import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CostEnvelopeGuard,
  RUN_COST_ENVELOPE_MONEY_REACHED,
  RUN_COST_ENVELOPE_ROOM_KEPT,
  WEB_SEARCH_MODEL,
  WEB_SEARCH_PROVIDER_REF,
  WEB_SEARCH_REQUEST_MICROS,
  isWebSearchProviderRef,
  priceRecentRun,
  webSearchChargeMicros,
  type InFlightSpend,
  type ModelSpendEntry,
  type ModelSpendStore,
  type PersonAllowanceSource,
  type PersonWindow,
  type RunOwnerSpendReader
} from "@debateai/budget";
import { TypedDomainError } from "@debateai/kernel";

/**
 * Web search (plan 2026-10-30, task W2-2) — ONE SEARCH'S CHARGE.
 *
 * A successful search is 0.1 cent ($0.001, W1-1's gate row), written as a RUN row of its debate (phase BODY, 0 tokens),
 * so every window reader counts it unchanged; a failed search costs nothing and writes nothing. Before it is sent it is
 * admitted like a call made while arguing: the run's body ceiling, the room the web step keeps for root 0, the shared
 * wall (the person's windows at their edges) and the calls in flight.
 */

const FIXTURE = JSON.parse(readFileSync(new URL("./fixtures/preview-search-rows.json", import.meta.url), "utf8")) as {
  rows: readonly { model: string; request_usd: string; request_nano_usd: number }[];
  per_call_cap_usd: string;
};
const NOW = new Date("2026-10-30T11:00:00.000Z");
const POLICY = Object.freeze({ perRunCeilingMicros: 250_000, dailyCeilingMicros: 2_000_000 });

function store(input: Readonly<{ runSpent?: number }> = {}) {
  const written: ModelSpendEntry[] = [];
  const spend: ModelSpendStore = {
    recordSpend: async (entry) => { written.push(entry); },
    readRunSpentMicros: async () => input.runSpent ?? 0,
    readRunStorySpentMicros: async () => 0,
    readDaySpentMicros: async () => 0,
    admitNewRun: async () => Object.freeze({ admitted: true, committedMicros: 0 })
  };
  return { spend, written };
}

const code = (promise: Promise<unknown>): Promise<string> =>
  promise.then(() => "ADMITTED", (error: unknown) => (error instanceof TypedDomainError ? error.code : `UNTYPED:${String(error)}`));

describe("W2-2 · the search price is the gate's reviewed row", () => {
  it("equals W1-1's fixture to the micro-unit: $0.001, 1,000,000 nano-USD, one row named perplexity-search-fast", () => {
    expect(FIXTURE.rows).toHaveLength(1);
    expect(FIXTURE.rows[0]!.model).toBe(WEB_SEARCH_MODEL);
    expect(FIXTURE.rows[0]!.request_usd).toBe("0.001");
    expect(FIXTURE.rows[0]!.request_nano_usd / 1000).toBe(WEB_SEARCH_REQUEST_MICROS);
    expect(Number(FIXTURE.per_call_cap_usd) * 1_000_000).toBe(WEB_SEARCH_REQUEST_MICROS);
    expect(WEB_SEARCH_PROVIDER_REF).toBe("search:perplexity-search-fast");
    expect(isWebSearchProviderRef(WEB_SEARCH_PROVIDER_REF)).toBe(true);
    for (const other of ["search:", "preview:claude-haiku-5-5", "", null]) expect(isWebSearchProviderRef(other)).toBe(false);
  });

  it("charges 0.1 cent for a search that succeeded and nothing for one that failed", () => {
    expect(webSearchChargeMicros("SUCCEEDED")).toBe(1_000);
    expect(webSearchChargeMicros("FAILED")).toBe(0);
    expect(() => webSearchChargeMicros("SKIPPED" as never)).toThrow(TypedDomainError);
    expect(() => webSearchChargeMicros("SUCCEEDED", 0)).toThrow(TypedDomainError);
  });
});

describe("W2-2 · the search seam writes one RUN row per successful search", () => {
  it("a successful search: one RUN row of its run, phase BODY, 0 tokens, 1,000 micro-units, the search's own name", async () => {
    const { spend, written } = store();
    const seam = new CostEnvelopeGuard({ store: spend, policy: POLICY, clock: () => NOW }).searchSeam({ runId: "run-1" });
    expect(await code(seam.assertSearchAllowed())).toBe("ADMITTED");
    await seam.recordSearch({ outcome: "SUCCEEDED" });
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ spendSource: "RUN", runId: "run-1", providerRef: "search:perplexity-search-fast",
      chargedOn: "2026-10-30", chargeMicros: 1_000, inputTokens: 0, outputTokens: 0, spendPhase: "BODY", attemptId: null });
  });

  it("a failed search writes nothing", async () => {
    const { spend, written } = store();
    const seam = new CostEnvelopeGuard({ store: spend, policy: POLICY, clock: () => NOW }).searchSeam({ runId: "run-1" });
    await seam.assertSearchAllowed();
    await seam.recordSearch({ outcome: "FAILED" });
    expect(written).toEqual([]);
  });

  it("refuses a search that would take the run past its ceiling, at exactly one micro-unit over", async () => {
    const at = (runSpent: number) => new CostEnvelopeGuard({ store: store({ runSpent }).spend, policy: POLICY, clock: () => NOW })
      .searchSeam({ runId: "run-1" }).assertSearchAllowed();
    expect(await code(at(250_000 - 1_000))).toBe("ADMITTED");
    expect(await code(at(250_000 - 999))).toBe(RUN_COST_ENVELOPE_MONEY_REACHED);
  });

  it("keeps the room the web step names for root 0 (its own refusal: only the web step stops)", async () => {
    const seam = new CostEnvelopeGuard({ store: store({ runSpent: 200_000 }).spend, policy: POLICY, clock: () => NOW })
      .searchSeam({ runId: "run-1" });
    expect(await code(seam.assertSearchAllowed({ keepRoomMicros: 49_000 }))).toBe("ADMITTED");
    expect(await code(seam.assertSearchAllowed({ keepRoomMicros: 49_001 }))).toBe(RUN_COST_ENVELOPE_ROOM_KEPT);
  });

  it("is walled by the person's windows at their edges, like any call made while arguing", async () => {
    const day: PersonWindow = Object.freeze({ scope: "PERSON_DAY", limitMicros: 1_000_000, periodStart: new Date("2026-10-30T00:00:00.000Z"),
      resetsAt: new Date("2026-10-31T00:00:00.000Z"), finishBasisPoints: 10_000, finishOverflowMicros: 200_000, closeBasisPoints: 9_500 });
    const at = (ownerSpent: number) => {
      const owners: RunOwnerSpendReader = { readRunChargeOwnerRef: async () => "owner-1", readOwnerSpentMicros: async () => ownerSpent };
      const persons: PersonAllowanceSource = { read: async () => [day] };
      return new CostEnvelopeGuard({ store: store().spend, policy: POLICY, clock: () => NOW,
        sharedWall: { finishBasisPoints: null, persons, owners } }).searchSeam({ runId: "run-1" }).assertSearchAllowed();
    };
    expect(await code(at(1_200_000 - 1_000))).toBe("ADMITTED");
    expect(await code(at(1_200_000 - 999))).toBe("PERSON_ALLOWANCE_REACHED");
  });

  it("counts the search in flight at its price until it is recorded, and releases a refused one", async () => {
    const held: bigint[] = [];
    let open = 0n;
    const inFlight: InFlightSpend = {
      begin: (_runId, projected) => { held.push(projected); open += projected; let done = false;
        return () => { if (!done) { done = true; open -= projected; } }; },
      projectedMicros: () => open,
      projectedMicrosAll: () => open
    };
    const guard = new CostEnvelopeGuard({ store: store().spend, policy: POLICY, clock: () => NOW, inFlight });
    const seam = guard.searchSeam({ runId: "run-1" });
    await seam.assertSearchAllowed();
    expect(held).toEqual([1_000n]);
    expect(open).toBe(1_000n);
    await seam.recordSearch({ outcome: "SUCCEEDED" });
    expect(open).toBe(0n);
    const full = new CostEnvelopeGuard({ store: store({ runSpent: 250_000 }).spend, policy: POLICY, clock: () => NOW, inFlight });
    expect(await code(full.searchSeam({ runId: "run-1" }).assertSearchAllowed())).toBe(RUN_COST_ENVELOPE_MONEY_REACHED);
    expect(open).toBe(0n);
  });

  it("refuses a seam with no run or a name that is not a search", () => {
    const guard = new CostEnvelopeGuard({ store: store().spend, policy: POLICY });
    expect(() => guard.searchSeam({ runId: " " })).toThrow("COST_ENVELOPE_RUN_REQUIRED");
    expect(() => guard.searchSeam({ runId: "run-1", providerRef: "preview:claude-haiku-5-5" })).toThrow("WEB_SEARCH_PROVIDER_REF_INVALID");
  });
});

describe("W2-2 · the recent-runs estimate prices a sample's searches per search", () => {
  it("a search row (0 tokens) is priced at today's 0.1 cent, never at its tokens", () => {
    const prices = new Map([["preview:claude-haiku-5-5", Object.freeze({ inputMicrosPerMillionTokens: 100_000, outputMicrosPerMillionTokens: 500_000 })]]);
    const run = Object.freeze({ runId: "run-1", charges: Object.freeze([
      Object.freeze({ providerRef: "search:perplexity-search-fast", inputTokens: 0, outputTokens: 0 }),
      Object.freeze({ providerRef: "search:perplexity-search-fast", inputTokens: 0, outputTokens: 0 }),
      Object.freeze({ providerRef: "preview:claude-haiku-5-5", inputTokens: 10_000, outputTokens: 2_000 })
    ]) });
    // 2 x 1,000 + ceil(10,000 x 0.1) + ceil(2,000 x 0.5)
    expect(priceRecentRun(run, prices)).toBe(2_000 + 1_000 + 1_000);
  });
});
