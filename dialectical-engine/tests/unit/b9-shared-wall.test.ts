import { describe, expect, it } from "vitest";
import {
  CostEnvelopeGuard,
  NO_PERSON_ALLOWANCE,
  PERSON_ALLOWANCE_REACHED,
  costEnvelopeDay,
  projectedCallCeilingMicros,
  sharedWallReached,
  type ModelSpendStore,
  type PersonAllowanceSource,
  type PersonWindow,
  type RunOwnerSpendReader,
  type SharedWallApplication
} from "@debateai/budget";
import { TypedDomainError } from "@debateai/kernel";

/**
 * B9a (budget spec §2.3 "the running wall", §2.9; paid-plans spec §2.4.1) — THE SHARED WALL IN THE RUN'S SEAM.
 *
 * A call made while arguing (BODY) is measured, after the run's own ceiling admitted it, against:
 *  · the site's day: the day's whole spend plus this call, against 115% of the daily ceiling — only when the
 *    guard carries the site's finish edge (the register sealed the band; `finishBasisPoints: null` is none);
 *  · each of the run owner's windows: the owner's spend in the window plus this call, against 110% of the window,
 *    with or without the band.
 * Answer-writing calls, story calls and the first position's own call ("EXEMPT") are never walled.
 * Real spend only: holds are not counted here.
 */

const PRICE = Object.freeze({ inputMicrosPerMillionTokens: 1_000_000, outputMicrosPerMillionTokens: 1_000_000 });
/** At one micro-unit per token: ceil(800 / 2) = 400 input + 64 output = 464 micro-units. */
const PROJECTION = Object.freeze({ requestBytes: 800, completionTokenCeiling: 64 });
const PROJECTED = 464;
const NOW = new Date("2026-09-29T11:00:00.000Z");
const POLICY = Object.freeze({ perRunCeilingMicros: 250_000, dailyCeilingMicros: 2_000_000 });
/** floor(2 000 000 x 11 500 / 10 000): the site day's finish edge. */
const SITE_EDGE = 2_300_000;

const DAY_START = new Date("2026-09-29T00:00:00.000Z");
const WEEK_START = new Date("2026-09-24T00:00:00.000Z");
const MONTH_START = new Date("2026-09-10T00:00:00.000Z");

function store(input: Readonly<{ daySpent?: number; runSpent?: number }> = {}) {
  const dayReads: string[] = [];
  const spend: ModelSpendStore = {
    recordSpend: async () => undefined,
    readRunSpentMicros: async () => input.runSpent ?? 0,
    readRunStorySpentMicros: async () => 0,
    readDaySpentMicros: async (day) => { dayReads.push(day); return input.daySpent ?? 0; },
    admitNewRun: async () => Object.freeze({ admitted: true, committedMicros: 0 })
  };
  return { spend, dayReads };
}

function window(scope: PersonWindow["scope"], periodStart: Date, limitMicros: number): PersonWindow {
  return Object.freeze({
    scope, limitMicros, periodStart,
    resetsAt: new Date(periodStart.getTime() + 7 * 86_400_000),
    finishBasisPoints: 11_000,
    closeBasisPoints: 9_500
  });
}

/** The owner's windows, spend keyed by each window's start, and every read the wall made. */
function owner(ownerRef: string | null, windows: readonly PersonWindow[], spentByStart: ReadonlyMap<number, number>) {
  const spendReads: string[] = [];
  const windowReads: string[] = [];
  const owners: RunOwnerSpendReader = {
    readRunChargeOwnerRef: async () => ownerRef,
    readOwnerSpentMicros: async (reference, from, to) => {
      spendReads.push(`${reference}|${from.toISOString()}|${to.toISOString()}`);
      return spentByStart.get(from.getTime()) ?? 0;
    }
  };
  const persons: PersonAllowanceSource = {
    read: async (reference, now) => { windowReads.push(`${reference}|${now.toISOString()}`); return windows; }
  };
  return { owners, persons, spendReads, windowReads };
}

async function decide(
  guard: CostEnvelopeGuard,
  phase: "BODY" | "SERVE",
  sharedWall?: SharedWallApplication
): Promise<string> {
  return guard.providerSeam({
    runId: "run-1", price: PRICE, requireReportedUsage: true, phase,
    ...(sharedWall === undefined ? {} : { sharedWall })
  }).assertCallAllowed(PROJECTION).then(
    () => "ADMITTED",
    (error: unknown) => (error instanceof TypedDomainError ? error.code : "UNTYPED")
  );
}

describe("B9a · the site's day, walled at its finish edge while arguing", () => {
  it("is measured on the seam's own projection", () => {
    expect(projectedCallCeilingMicros(PRICE, PROJECTION)).toBe(PROJECTED);
  });

  it("admits a call that lands exactly on 115% of the day, and refuses one micro-unit more", async () => {
    const persons = owner(null, [], new Map());
    const at = (daySpent: number) => new CostEnvelopeGuard({
      store: store({ daySpent }).spend, policy: POLICY, clock: () => NOW,
      sharedWall: { finishBasisPoints: 11_500, persons: persons.persons, owners: persons.owners }
    });
    expect(await decide(at(SITE_EDGE - PROJECTED), "BODY")).toBe("ADMITTED");
    expect(await decide(at(SITE_EDGE - PROJECTED + 1), "BODY")).toBe("DAILY_COST_ENVELOPE_REACHED");
  });

  it("reads the day the guard's clock is in, once per call", async () => {
    const spend = store({ daySpent: 0 });
    const persons = owner(null, [], new Map());
    const guard = new CostEnvelopeGuard({
      store: spend.spend, policy: POLICY, clock: () => NOW,
      sharedWall: { finishBasisPoints: 11_500, persons: persons.persons, owners: persons.owners }
    });
    await decide(guard, "BODY");
    expect(spend.dayReads).toEqual([costEnvelopeDay(NOW)]);
  });

  it("never walls an answer-writing call, nor the first position's own call", async () => {
    const spend = store({ daySpent: 10_000_000 });
    const persons = owner("owner-1", [window("PERSON_DAY", DAY_START, 1)], new Map([[DAY_START.getTime(), 10]]));
    const guard = new CostEnvelopeGuard({
      store: spend.spend, policy: POLICY, clock: () => NOW,
      sharedWall: { finishBasisPoints: 11_500, persons: persons.persons, owners: persons.owners }
    });
    expect(await decide(guard, "SERVE")).toBe("ADMITTED");
    expect(await decide(guard, "SERVE", "APPLY")).toBe("ADMITTED");
    expect(await decide(guard, "BODY", "EXEMPT")).toBe("ADMITTED");
    expect(spend.dayReads).toEqual([]);
    expect(persons.windowReads).toEqual([]);
  });

  it("behaves exactly as before when the guard has no wall at all (local mode)", async () => {
    const spend = store({ daySpent: 10_000_000 });
    const guard = new CostEnvelopeGuard({ store: spend.spend, policy: POLICY, clock: () => NOW });
    expect(await decide(guard, "BODY")).toBe("ADMITTED");
    expect(spend.dayReads).toEqual([]);
  });

  it("asks the run's own ceiling first: a run that cannot pay is refused as a run, and the day is not read", async () => {
    const spend = store({ daySpent: 10_000_000, runSpent: 250_000 });
    const persons = owner(null, [], new Map());
    const guard = new CostEnvelopeGuard({
      store: spend.spend, policy: POLICY, clock: () => NOW,
      sharedWall: { finishBasisPoints: 11_500, persons: persons.persons, owners: persons.owners }
    });
    expect(await decide(guard, "BODY")).toBe("RUN_COST_ENVELOPE_MONEY_REACHED");
    expect(spend.dayReads).toEqual([]);
  });

  it("never walls a story call", async () => {
    const spend = store({ daySpent: 10_000_000 });
    const persons = owner(null, [], new Map());
    const guard = new CostEnvelopeGuard({
      store: spend.spend, policy: { ...POLICY, perStoryCeilingMicros: 50_000 }, clock: () => NOW,
      sharedWall: { finishBasisPoints: 11_500, persons: persons.persons, owners: persons.owners }
    });
    await expect(guard.storySeam({ runId: "run-1", price: PRICE, requireReportedUsage: true })
      .assertCallAllowed(PROJECTION)).resolves.toBeUndefined();
    expect(spend.dayReads).toEqual([]);
  });
});

describe("B9a · each of the run owner's windows, walled at its own finish edge (110%)", () => {
  const WINDOWS = [
    window("PERSON_DAY", DAY_START, 100_000),     // edge 110 000
    window("PERSON_WEEK", WEEK_START, 250_000),   // edge 275 000
    window("PERSON_MONTH", MONTH_START, 1_000_000) // edge 1 100 000
  ];

  function guardFor(spent: ReadonlyMap<number, number>) {
    const persons = owner("owner-1", WINDOWS, spent);
    const guard = new CostEnvelopeGuard({
      store: store({ daySpent: 0 }).spend, policy: POLICY, clock: () => NOW,
      sharedWall: { finishBasisPoints: 11_500, persons: persons.persons, owners: persons.owners }
    });
    return { guard, persons };
  }

  it("admits exact equality at a window's edge and refuses one micro-unit more, naming the window", async () => {
    expect(await decide(guardFor(new Map([[DAY_START.getTime(), 110_000 - PROJECTED]])).guard, "BODY")).toBe("ADMITTED");
    const refused = guardFor(new Map([[DAY_START.getTime(), 110_000 - PROJECTED + 1]]));
    await expect(refused.guard.providerSeam({ runId: "run-1", price: PRICE, requireReportedUsage: true, phase: "BODY" })
      .assertCallAllowed(PROJECTION)).rejects.toThrowError(expect.objectContaining({
      code: PERSON_ALLOWANCE_REACHED,
      message: expect.stringContaining("PERSON_DAY")
    }));
    expect(await decide(guardFor(new Map([[WEEK_START.getTime(), 275_000 - PROJECTED + 1]])).guard, "BODY"))
      .toBe("PERSON_ALLOWANCE_REACHED");
    expect(await decide(guardFor(new Map([[MONTH_START.getTime(), 1_100_000 - PROJECTED + 1]])).guard, "BODY"))
      .toBe("PERSON_ALLOWANCE_REACHED");
  });

  it("reads each window's spend from the window's start to its reset, for the pinned owner", async () => {
    const { guard, persons } = guardFor(new Map());
    await decide(guard, "BODY");
    expect(persons.windowReads).toEqual([`owner-1|${NOW.toISOString()}`]);
    expect(persons.spendReads).toEqual(WINDOWS.map((entry) =>
      `owner-1|${entry.periodStart.toISOString()}|${entry.resetsAt.toISOString()}`));
  });

  it("has no person scope for a run billing pinned no owner on, and never asks for windows", async () => {
    const persons = owner(null, WINDOWS, new Map([[DAY_START.getTime(), 10_000_000]]));
    const guard = new CostEnvelopeGuard({
      store: store({ daySpent: 0 }).spend, policy: POLICY, clock: () => NOW,
      sharedWall: { finishBasisPoints: 11_500, persons: persons.persons, owners: persons.owners }
    });
    expect(await decide(guard, "BODY")).toBe("ADMITTED");
    expect(persons.windowReads).toEqual([]);
  });

  it("leaves only the site's day when billing supplies no allowance (NO_PERSON_ALLOWANCE)", async () => {
    const persons = owner("owner-1", [], new Map());
    const guard = new CostEnvelopeGuard({
      store: store({ daySpent: 0 }).spend, policy: POLICY, clock: () => NOW,
      sharedWall: { finishBasisPoints: 11_500, persons: NO_PERSON_ALLOWANCE, owners: persons.owners }
    });
    expect(await decide(guard, "BODY")).toBe("ADMITTED");
    expect(persons.spendReads).toEqual([]);
  });

  // Hosted without the band (a register version older than the band members): no site-day wall, but the person
  // half stands, so a run billing pinned an owner on is still held to that owner's windows (ruling R-19).
  it("walls the owner's windows with no site-day wall when the guard has no site finish edge (null)", async () => {
    const spend = store({ daySpent: 10_000_000 });
    const pinned = owner("owner-1", WINDOWS, new Map([[DAY_START.getTime(), 110_000 - PROJECTED + 1]]));
    const guard = new CostEnvelopeGuard({
      store: spend.spend, policy: POLICY, clock: () => NOW,
      sharedWall: { finishBasisPoints: null, persons: pinned.persons, owners: pinned.owners }
    });
    expect(await decide(guard, "BODY")).toBe("PERSON_ALLOWANCE_REACHED");
    // The day is never read, however far past any edge it stands.
    expect(spend.dayReads).toEqual([]);
  });

  it("leaves a run with no pinned owner untouched when there is no site finish edge, and reads neither", async () => {
    const spend = store({ daySpent: 10_000_000 });
    const unpinned = owner(null, WINDOWS, new Map([[DAY_START.getTime(), 10_000_000]]));
    const guard = new CostEnvelopeGuard({
      store: spend.spend, policy: POLICY, clock: () => NOW,
      sharedWall: { finishBasisPoints: null, persons: unpinned.persons, owners: unpinned.owners }
    });
    expect(await decide(guard, "BODY")).toBe("ADMITTED");
    expect(spend.dayReads).toEqual([]);
    expect(unpinned.windowReads).toEqual([]);
  });
});

describe("B9a · the refusals", () => {
  it("keep the day's code for the site and give a person's window its own, with no figure in either", () => {
    expect(sharedWallReached("SITE_DAY").code).toBe("DAILY_COST_ENVELOPE_REACHED");
    for (const scope of ["PERSON_DAY", "PERSON_WEEK", "PERSON_MONTH"] as const) {
      const refusal = sharedWallReached(scope);
      expect(refusal.code, scope).toBe("PERSON_ALLOWANCE_REACHED");
      expect(refusal.message, scope).toContain(scope);
      expect(refusal.message, scope).not.toMatch(/\d/u);
    }
    expect(sharedWallReached("SITE_DAY").message).not.toMatch(/\d/u);
  });

  it("refuse to build a guard over a wall it could not ask", () => {
    const persons = owner(null, [], new Map());
    // B1's decideSharedWall answers only for a finish edge of 10 000-20 000 basis points; outside it, the guard is
    // refused here, at boot, instead of every walled call failing untyped mid-run. Null (no band, so no site-day
    // wall) is not an edge and is accepted.
    for (const finishBasisPoints of [0, 9_999, 20_001, 11_500.5]) {
      expect(() => new CostEnvelopeGuard({
        store: store().spend, policy: POLICY,
        sharedWall: { finishBasisPoints, persons: persons.persons, owners: persons.owners }
      }), String(finishBasisPoints)).toThrowError("COST_ENVELOPE_GUARD_INPUT_INVALID");
    }
    for (const finishBasisPoints of [10_000, 20_000, null]) {
      expect(() => new CostEnvelopeGuard({
        store: store().spend, policy: POLICY,
        sharedWall: { finishBasisPoints, persons: persons.persons, owners: persons.owners }
      }), String(finishBasisPoints)).not.toThrow();
    }
    expect(() => new CostEnvelopeGuard({
      store: store().spend, policy: POLICY,
      sharedWall: { finishBasisPoints: 11_500, persons: persons.persons, owners: {} as RunOwnerSpendReader }
    })).toThrowError("COST_ENVELOPE_GUARD_INPUT_INVALID");
  });
});
