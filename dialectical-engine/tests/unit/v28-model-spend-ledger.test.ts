import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  CostEnvelopeGuard,
  costEnvelopeDay,
  DEFAULT_RESERVATION_TTL_MS,
  type ModelSpendEntry,
  type ModelSpendStore
} from "@debateai/budget";
import { costEnvelopePolicyFromValue, COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW } from "@debateai/register";
import {
  DEVELOPMENT_ORGAN_COST_BOUNDS,
  DEVELOPMENT_RUN_DEATH_POLICY
} from "../../apps/runner/src/dev-deployment-register.js";

/**
 * V-28 — THE PERSISTED SPEND, BEHIND A REPOSITORY SEAM.
 *
 * The daily envelope is application-wide: it has to survive a restart, and it
 * has to be the same number for the API and for the runner, which are separate
 * processes. So the running totals live in the database (migration 0066,
 * `ledger.model_spend`) and every rule that reads them is expressed against the
 * SEAM below. The database-backed half is written in
 * `tests/integration/v28-model-spend.test.ts`, which runs on the embedded test
 * Postgres in `test:s00` (no Docker — it first ran, and passed, on 2026-09-23 at
 * the third dev sync).
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
 * The call's own pre-send maximum, the two facts the gateway hands the seam.
 * At one micro-unit per token it projects 400 input + 64 output tokens — the
 * figure a charge falls back to for a count the vendor's block carries but this
 * cannot read (fix round 1, Important 1).
 */
const PROJECTION = Object.freeze({ requestBytes: 800, completionTokenCeiling: 64 });

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
      usage: { prompt_tokens: 2_000_000, completion_tokens: 1_000_000 },
      projection: PROJECTION
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
    await expect(seam.recordCall({
      providerRef: "provider-1", usage: null, projection: PROJECTION
    })).resolves.toBeUndefined();
    expect(rows).toEqual([]);

    await expect(seam.assertUsageReported({ providerRef: "provider-1", usage: null }))
      .rejects.toThrowError(expect.objectContaining({ code: "PROVIDER_USAGE_UNREPORTED" }));
  });

  /**
   * FIX ROUND 1, Important 1 — a usage block that IS there but carries a count
   * this cannot read is still a call the vendor billed. The readable side is
   * charged as reported; the unreadable one falls back to the call's own
   * projected maximum, which is the number `assertCallAllowed` already admitted
   * the call against, so the charge can never exceed what the gate allowed.
   */
  it("charges the projected maximum for a side whose count it cannot read", async () => {
    for (const [usage, inputTokens, outputTokens, billable] of [
      // Readable prompt count, unreadable completion count → 1 000 + 64.
      [{ prompt_tokens: 1_000, completion_tokens: 300.5 }, 1_000, 64, true],
      // Neither side readable → the whole projection, 400 + 64.
      [{ completion_tokens: -1 }, 400, 64, false],
      [{ total_tokens: 1.5 }, 400, 64, false],
      [{ prompt_tokens: "3" }, 400, 64, false]
    ] as const) {
      const { store, rows } = fakeStore();
      const seam = guardWith(store).providerSeam({
        runId: "run-1", price: PRICE, requireReportedUsage: true
      });

      await seam.recordCall({ providerRef: "provider-1", usage, projection: PROJECTION });

      expect(rows, JSON.stringify(usage)).toHaveLength(1);
      expect(rows[0], JSON.stringify(usage)).toMatchObject({
        inputTokens, outputTokens, chargeMicros: inputTokens + outputTokens
      });
      // The REFUSAL is still its own question and still answers it on what the
      // vendor REPORTED, not on what was charged: a block with one readable
      // side is billable, one with neither is not. (In the gateway both are
      // refused anyway, one step earlier, as PROVIDER_USAGE_INVALID.)
      const reported = seam.assertUsageReported({ providerRef: "provider-1", usage });
      if (billable) await expect(reported).resolves.toBeUndefined();
      else {
        await expect(reported)
          .rejects.toThrowError(expect.objectContaining({ code: "PROVIDER_USAGE_UNREPORTED" }));
      }
    }
  });

  it("records nothing and refuses nothing when reported usage is not required", async () => {
    const { store, rows } = fakeStore();
    const seam = guardWith(store).providerSeam({
      runId: "run-1", price: PRICE, requireReportedUsage: false
    });

    await expect(seam.recordCall({
      providerRef: "provider-1", usage: null, projection: PROJECTION
    })).resolves.toBeUndefined();
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
      providerRef: "provider-1",
      usage: { prompt_tokens: 400, completion_tokens: 0 },
      projection: PROJECTION
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

/**
 * C-I2 (final review, area C) — HOW LONG AN ADMISSION RESERVATION MUST HOLD.
 *
 * The reservation is the only thing that makes an ADMITTED run visible to the
 * day before its first charge lands. At two minutes it expired long before a
 * slow first call reported anything, and in that gap the daily ceiling degraded
 * to the ask rate limit: during a vendor outage every ask saw committed = 0,
 * was admitted, and could later spend a whole per-run ceiling. The window has to
 * cover the WORST first-charge latency the deployment's own sealed rows allow,
 * and the two that set it are the judge's deadline times its attempts and the
 * run-death cooldown.
 */
describe("C-I2 the reservation covers the wait for a first charge", () => {
  it("holds for thirty minutes by default", () => {
    expect(DEFAULT_RESERVATION_TTL_MS).toBe(30 * 60_000);
  });

  it("covers the judge's deadline x attempts plus EVERY cooldown hold the policy allows", () => {
    // No number is restated here: every one is read from the frozen policy
    // objects the dev deployment seeds, so a change to either row moves this
    // margin instead of leaving a stale sentence behind (fix round 1, Minor 2 —
    // the first version of this pin counted ONE cooldown hold, while the policy
    // allows two).
    const judge = DEVELOPMENT_ORGAN_COST_BOUNDS.organs.JUDGE;
    const exhaustion = judge.deadlineMs * judge.maxAttempts;
    const cooldown = DEVELOPMENT_RUN_DEATH_POLICY.cooldown_ms
      * DEVELOPMENT_RUN_DEATH_POLICY.max_cooldown_holds_per_run;
    expect(exhaustion + cooldown).toBeLessThanOrEqual(DEFAULT_RESERVATION_TTL_MS);
    // The margin the window actually leaves, computed and pinned exactly: one
    // minute, which is what the comment beside the constant must say.
    expect(DEFAULT_RESERVATION_TTL_MS - (exhaustion + cooldown)).toBe(60_000);
  });

  it("stamps that window on the reservation the guard opens", async () => {
    const { store, reservations } = fakeStore();
    const now = new Date("2026-09-22T11:00:00.000Z");
    await new CostEnvelopeGuard({
      store,
      policy: { perRunCeilingMicros: 1_000, dailyCeilingMicros: 1_000 },
      clock: () => now
    }).assertDailyEnvelopeAdmitsNewRun();

    expect(reservations).toHaveLength(1);
    expect(reservations[0]!.expiresAt.getTime() - now.getTime())
      .toBe(DEFAULT_RESERVATION_TTL_MS);
  });

  it("says, where the value is, that it is PROVISIONAL and what it must cover", async () => {
    const source = await readFile(
      new URL("../../packages/budget/src/model-spend.ts", import.meta.url), "utf8"
    );
    const stated = source.slice(
      source.indexOf("* I1 — how long an admission reservation"),
      source.indexOf("export const DEFAULT_RESERVATION_TTL_MS")
    );
    expect(stated).toContain("PROVISIONAL");
    expect(stated).toMatch(/judge deadline/iu);
    expect(stated).toMatch(/cooldown/u);
    expect(stated).toMatch(/queue/iu);
    // Minor 2: the arithmetic in that paragraph is the two-hold one, and it
    // names the margin it really leaves rather than a comfortable one.
    expect(stated).toMatch(/max_cooldown_holds_per_run/u);
    expect(stated).toMatch(/SIXTY SECONDS/u);
  });
});
