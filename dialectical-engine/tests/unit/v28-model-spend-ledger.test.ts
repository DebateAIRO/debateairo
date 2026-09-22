import { describe, expect, it } from "vitest";
import {
  CostEnvelopeGuard,
  costEnvelopeDay,
  type ModelSpendEntry,
  type ModelSpendStore
} from "@debateai/budget";
import { costEnvelopePolicyFromValue, COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW } from "@debateai/register";

/**
 * V-28 — THE PERSISTED SPEND, BEHIND A REPOSITORY SEAM.
 *
 * The daily envelope is application-wide: it has to survive a restart, and it
 * has to be the same number for the API and for the runner, which are separate
 * processes. So the running totals live in the database (migration 0066,
 * `ledger.model_spend`) and every rule that reads them is expressed against the
 * SEAM below. The database-backed half is written in
 * `tests/integration/v28-model-spend.test.ts` and is NOT RUN here — Docker is
 * down on this host by the mission's own quiet rule.
 *
 * What is exercised here is the whole decision surface: what is charged, when a
 * call is refused, when a new run is refused, and what a restart sees.
 */
const POLICY = costEnvelopePolicyFromValue(
  COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW.value,
  COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW.sourceRef
);

const PRICE = Object.freeze({
  inputMicrosPerMillionTokens: 1_000_000,
  outputMicrosPerMillionTokens: 1_000_000
});

/** An in-memory stand-in for `ledger.model_spend`, with the same two questions. */
function fakeStore(seed: readonly ModelSpendEntry[] = []) {
  const rows: ModelSpendEntry[] = [...seed];
  const store: ModelSpendStore = {
    recordSpend: async (entry) => { rows.push(entry); },
    readRunSpentMicros: async (runId) => rows
      .filter((row) => row.runId === runId)
      .reduce((total, row) => total + row.chargeMicros, 0),
    readDaySpentMicros: async (day) => rows
      .filter((row) => row.chargedOn === day)
      .reduce((total, row) => total + row.chargeMicros, 0)
  };
  return { store, rows };
}

const TODAY = costEnvelopeDay(new Date("2026-09-22T11:00:00.000Z"));

function guardWith(store: ModelSpendStore, policy = POLICY) {
  return new CostEnvelopeGuard({
    store, policy, clock: () => new Date("2026-09-22T11:00:00.000Z")
  });
}

describe("V-28 the per-run seam reads and writes the persisted spend", () => {
  it("admits a call whose projected maximum fits in what the run has left", async () => {
    const { store } = fakeStore();
    const seam = guardWith(store).providerSeam({
      runId: "run-1", price: PRICE, requireReportedUsage: true
    });

    await expect(seam.assertCallAllowed({ requestBytes: 400, completionTokenCeiling: 64 }))
      .resolves.toBeUndefined();
  });

  it("refuses the call that would cross what a RESTART can still see", async () => {
    // A previous process of this run already spent the whole envelope. Nothing
    // is held in memory, so the refusal survives the restart.
    const { store } = fakeStore([{
      spendId: "spend-0", spendSource: "RUN", runId: "run-1", providerRef: "provider-1",
      chargedOn: TODAY, chargeMicros: POLICY.perRunCeilingMicros, inputTokens: 1, outputTokens: 1
    }]);
    const seam = guardWith(store).providerSeam({
      runId: "run-1", price: PRICE, requireReportedUsage: true
    });

    await expect(seam.assertCallAllowed({ requestBytes: 400, completionTokenCeiling: 64 }))
      .rejects.toThrowError(expect.objectContaining({ code: "RUN_COST_ENVELOPE_MONEY_REACHED" }));
  });

  it("charges vendor-reported usage to the run AND to the day, in one row", async () => {
    const { store, rows } = fakeStore();
    const seam = guardWith(store).providerSeam({
      runId: "run-1", price: PRICE, requireReportedUsage: true
    });

    await seam.recordCall({
      providerRef: "provider-1",
      usage: { prompt_tokens: 2_000_000, completion_tokens: 1_000_000 }
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      spendSource: "RUN",
      runId: "run-1",
      providerRef: "provider-1",
      chargedOn: TODAY,
      chargeMicros: 3_000_000,
      inputTokens: 2_000_000,
      outputTokens: 1_000_000
    });
    expect(await store.readRunSpentMicros("run-1")).toBe(3_000_000);
    expect(await store.readDaySpentMicros(TODAY)).toBe(3_000_000);
  });

  it("refuses an unreported usage block when the deployment requires one", async () => {
    const { store, rows } = fakeStore();
    const seam = guardWith(store).providerSeam({
      runId: "run-1", price: PRICE, requireReportedUsage: true
    });

    await expect(seam.recordCall({ providerRef: "provider-1", usage: null }))
      .rejects.toThrowError(expect.objectContaining({ code: "PROVIDER_USAGE_UNREPORTED" }));
    // Nothing is written for a call that cannot be billed: a zero row would read
    // as "this call was free", which is the falsehood the refusal exists to stop.
    expect(rows).toEqual([]);
  });

  it("records nothing and refuses nothing when reported usage is not required", async () => {
    const { store, rows } = fakeStore();
    const seam = guardWith(store).providerSeam({
      runId: "run-1", price: PRICE, requireReportedUsage: false
    });

    await expect(seam.recordCall({ providerRef: "provider-1", usage: null }))
      .resolves.toBeUndefined();
    expect(rows).toEqual([]);
  });
});

describe("C2 — the guard refuses to build a hosted seam that cannot bound anything", () => {
  it("refuses a zero price where reported usage is required", () => {
    const { store } = fakeStore();
    expect(() => guardWith(store).providerSeam({
      runId: "run-1",
      price: { inputMicrosPerMillionTokens: 0, outputMicrosPerMillionTokens: 0 },
      requireReportedUsage: true
    })).toThrowError(expect.objectContaining({ code: "COST_ENVELOPE_PRICE_UNPRICED" }));
  });

  it("still builds one where it is not — local mode meters nothing", () => {
    const { store } = fakeStore();
    expect(() => guardWith(store).providerSeam({
      runId: "run-1",
      price: { inputMicrosPerMillionTokens: 0, outputMicrosPerMillionTokens: 0 },
      requireReportedUsage: false
    })).not.toThrow();
  });
});

describe("V-28 the daily envelope stops the NEXT run, never the running one", () => {
  it("admits a new run while the day is under the ceiling", async () => {
    const { store } = fakeStore([{
      spendId: "spend-0", spendSource: "RUN", runId: "run-0", providerRef: "provider-1",
      chargedOn: TODAY, chargeMicros: POLICY.dailyCeilingMicros - 1, inputTokens: 1, outputTokens: 1
    }]);

    await expect(guardWith(store).assertDailyEnvelopeAdmitsNewRun()).resolves.toBeUndefined();
  });

  it("refuses a new run once the day has REACHED the ceiling", async () => {
    const { store } = fakeStore([{
      spendId: "spend-0", spendSource: "RUN", runId: "run-0", providerRef: "provider-1",
      chargedOn: TODAY, chargeMicros: POLICY.dailyCeilingMicros, inputTokens: 1, outputTokens: 1
    }]);

    await expect(guardWith(store).assertDailyEnvelopeAdmitsNewRun())
      .rejects.toThrowError(expect.objectContaining({ code: "DAILY_COST_ENVELOPE_REACHED" }));
  });

  it("lets a run already under way keep spending past the daily ceiling", async () => {
    // The day is spent, but this run has its own envelope and is mid-flight.
    // V-28(2): "when reached, no new run starts until the next day; running ones
    // finish." Stopping it would throw away work already paid for.
    const { store } = fakeStore([{
      spendId: "spend-0", spendSource: "RUN", runId: "run-0", providerRef: "provider-1",
      chargedOn: TODAY, chargeMicros: POLICY.dailyCeilingMicros, inputTokens: 1, outputTokens: 1
    }]);
    const seam = guardWith(store).providerSeam({
      runId: "run-1", price: PRICE, requireReportedUsage: true
    });

    await expect(seam.assertCallAllowed({ requestBytes: 400, completionTokenCeiling: 64 }))
      .resolves.toBeUndefined();
  });

  it("counts the day in UTC, so the ceiling resets once and at the same instant everywhere", async () => {
    const { store } = fakeStore([{
      spendId: "spend-0", spendSource: "RUN", runId: "run-0", providerRef: "provider-1",
      chargedOn: costEnvelopeDay(new Date("2026-09-21T23:59:59.999Z")),
      chargeMicros: POLICY.dailyCeilingMicros, inputTokens: 1, outputTokens: 1
    }]);

    // Yesterday's spend is yesterday's. The new UTC day starts clean.
    await expect(guardWith(store).assertDailyEnvelopeAdmitsNewRun()).resolves.toBeUndefined();
  });
});

describe("V-28 the day boundary", () => {
  it("names the UTC day of an instant", () => {
    expect(costEnvelopeDay(new Date("2026-09-22T00:00:00.000Z"))).toBe("2026-09-22");
    expect(costEnvelopeDay(new Date("2026-09-22T23:59:59.999Z"))).toBe("2026-09-22");
    expect(costEnvelopeDay(new Date("2026-09-23T00:00:00.000Z"))).toBe("2026-09-23");
  });

  it("refuses an instant that is not one", () => {
    expect(() => costEnvelopeDay(new Date("nonsense"))).toThrowError(TypeError);
  });
});
