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

/**
 * An in-memory stand-in for `ledger.model_spend` and its reservations.
 *
 * `admitNewRun` SERIALISES, which is what the shipped store's transaction-scoped
 * advisory lock does in Postgres: one admission decision at a time per day. That
 * is the property I1 is about, so the fake has to have it or the racing test
 * would pass against a store that does not.
 */
function fakeStore(seed: readonly ModelSpendEntry[] = []) {
  const rows: ModelSpendEntry[] = [...seed];
  const reservations: Array<{ reservedMicros: number; expiresAt: Date }> = [];
  let queue: Promise<unknown> = Promise.resolve();
  const spentOn = (day: string) => rows
    .filter((row) => row.chargedOn === day)
    .reduce((total, row) => total + row.chargeMicros, 0);
  const spentByRun = (runId: string) => rows
    .filter((row) => row.runId === runId)
    .reduce((total, row) => total + row.chargeMicros, 0);
  const store: ModelSpendStore = {
    recordSpend: async (entry) => { rows.push(entry); },
    readRunSpentMicros: async (runId) => spentByRun(runId),
    readDaySpentMicros: async (day) => spentOn(day),
    admitNewRun: async (input) => {
      const run = queue.then(async () => {
        // Committed = money already spent today PLUS what every live admission
        // token could still spend.
        const headroom = reservations
          .filter((reservation) => reservation.expiresAt.getTime() > input.now.getTime())
          .reduce((total, reservation) => total + reservation.reservedMicros, 0);
        const committedMicros = spentOn(input.day) + headroom;
        const admitted = input.decide(committedMicros);
        if (admitted) {
          reservations.push({
            reservedMicros: input.reservedMicros,
            expiresAt: input.expiresAt
          });
        }
        return { admitted, committedMicros };
      });
      queue = run.catch(() => undefined);
      return run;
    }
  };
  return { store, rows, reservations };
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

    // I4: the two duties are separate. CHARGING never refuses — it records money
    // already taken — and writes nothing for a call that reported nothing,
    // because a zero row would read as "this call was free". The REFUSAL is its
    // own question, asked only of a successful completion.
    await expect(seam.recordCall({ providerRef: "provider-1", usage: null }))
      .resolves.toBeUndefined();
    expect(rows).toEqual([]);

    await expect(seam.assertUsageReported({ providerRef: "provider-1", usage: null }))
      .rejects.toThrowError(expect.objectContaining({ code: "PROVIDER_USAGE_UNREPORTED" }));
  });

  it("records nothing and refuses nothing when reported usage is not required", async () => {
    const { store, rows } = fakeStore();
    const seam = guardWith(store).providerSeam({
      runId: "run-1", price: PRICE, requireReportedUsage: false
    });

    await expect(seam.recordCall({ providerRef: "provider-1", usage: null }))
      .resolves.toBeUndefined();
    await expect(seam.assertUsageReported({ providerRef: "provider-1", usage: null }))
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

/**
 * I1 (review round 2) — TWO ASKS AT ONCE MUST NOT BOTH BE ADMITTED.
 *
 * Round 1 read the day's spend and then decided, with nothing in between. N
 * simultaneous asks all saw the same low number, all passed, and each could then
 * spend a full per-run ceiling: the daily ceiling bounded one run at a time and
 * nothing at all under load — which is exactly when it matters.
 *
 * The fix adds no second source of truth. An ADMITTED ask reserves one per-run
 * ceiling against the day, and the day's committed total is what has been spent
 * plus what live reservations could still spend. The decision and the
 * reservation happen together under one lock, so the second ask sees the first
 * one's reservation.
 *
 * WHY A SHORT-LIVED TOKEN AND NOT A RUN. The gate is asked BEFORE the run
 * exists — that is the whole point of "no new run starts" — so a reservation
 * cannot be keyed on a run id and cannot be released when a run ends. It EXPIRES
 * instead, over a window long enough to cover admission reaching its first
 * charged call. That window is exactly the race, and it makes the control
 * self-healing: a run that dies at birth cannot wedge the day shut.
 *
 * The residual, stated rather than hidden: inside the window a reservation and
 * that run's first charges are both counted, so the gate is CONSERVATIVE there
 * (it may refuse slightly early); past the window a run that has not spent
 * anything yet no longer reserves. Both directions are bounded by one per-run
 * ceiling per admitted ask, and the conservative one is the safe one.
 */
describe("I1 — the daily gate reserves what it admits", () => {
  const RESERVED = 1_000;

  function racingGuard(seed: readonly ModelSpendEntry[] = []) {
    const { store, reservations } = fakeStore(seed);
    const guard = new CostEnvelopeGuard({
      store,
      policy: { perRunCeilingMicros: RESERVED, dailyCeilingMicros: 2 * RESERVED },
      clock: () => new Date("2026-09-22T11:00:00.000Z")
    });
    return { guard, reservations };
  }

  it("admits two runs into a two-run day", async () => {
    const { guard, reservations } = racingGuard();
    await expect(Promise.all([
      guard.assertDailyEnvelopeAdmitsNewRun(),
      guard.assertDailyEnvelopeAdmitsNewRun()
    ])).resolves.toEqual([undefined, undefined]);
    expect(reservations).toHaveLength(2);
  });

  it("refuses the THIRD of three simultaneous asks, which round 1 admitted", async () => {
    const { guard, reservations } = racingGuard();
    const outcomes = await Promise.all(
      [0, 1, 2].map(() =>
        guard.assertDailyEnvelopeAdmitsNewRun().then(() => "ADMITTED", () => "REFUSED"))
    );

    expect(outcomes.filter((outcome) => outcome === "ADMITTED")).toHaveLength(2);
    expect(outcomes.filter((outcome) => outcome === "REFUSED")).toHaveLength(1);
    expect(reservations).toHaveLength(2);
  });

  it("counts real spend AND live reservations, and refuses on their sum", async () => {
    // A 2 000 day, a 1 000 per-run ceiling. The first ask reserves 1 000, so the
    // committed total is 1 000. A charge of 400 against that run takes it to
    // 1 400 — inside the window both are counted, which is the conservative
    // direction — so a second ask still fits. That second reservation takes the
    // committed total to 2 400, and the third ask is refused.
    const { guard } = racingGuard();
    await guard.assertDailyEnvelopeAdmitsNewRun();
    const spendSeam = guard.providerSeam({
      runId: "run-a", price: PRICE, requireReportedUsage: true
    });
    await spendSeam.recordCall({
      providerRef: "provider-1", usage: { prompt_tokens: 400, completion_tokens: 0 }
    });

    await expect(guard.assertDailyEnvelopeAdmitsNewRun()).resolves.toBeUndefined();
    await expect(guard.assertDailyEnvelopeAdmitsNewRun())
      .rejects.toThrowError(expect.objectContaining({ code: "DAILY_COST_ENVELOPE_REACHED" }));
  });

  it("lets an EXPIRED reservation go, so a dead run cannot wedge the day shut", async () => {
    const { store } = fakeStore();
    const guard = new CostEnvelopeGuard({
      store,
      policy: { perRunCeilingMicros: RESERVED, dailyCeilingMicros: RESERVED },
      clock: () => new Date("2026-09-22T11:00:00.000Z"),
      reservationTtlMs: 60_000
    });
    await guard.assertDailyEnvelopeAdmitsNewRun();
    await expect(guard.assertDailyEnvelopeAdmitsNewRun())
      .rejects.toThrowError(expect.objectContaining({ code: "DAILY_COST_ENVELOPE_REACHED" }));

    const later = new CostEnvelopeGuard({
      store,
      policy: { perRunCeilingMicros: RESERVED, dailyCeilingMicros: RESERVED },
      // Two minutes on, the dead run's reservation has expired and it spent
      // nothing, so the day is open again.
      clock: () => new Date("2026-09-22T11:02:00.000Z"),
      reservationTtlMs: 60_000
    });
    await expect(later.assertDailyEnvelopeAdmitsNewRun()).resolves.toBeUndefined();
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
