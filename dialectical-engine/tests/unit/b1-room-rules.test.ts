import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  NO_PERSON_ALLOWANCE,
  decideAdmission,
  decideRoom,
  decideSharedWall,
  waitingUntil,
  type ScopeRoom
} from "@debateai/budget";

/**
 * Budget spec §2.3 / §2.14 and paid-plans spec §2.8 — THE RULES AT EVERY EDGE.
 * A limit of 100 000 micro-units makes every percentage a whole number: 1% = 1 000.
 */
const LIMIT = 100_000;
const CLOSE = 9_500;
const room = (usedMicros: number, estimateMicros = 0) =>
  decideRoom({ usedMicros, estimateMicros, limitMicros: LIMIT, closeBasisPoints: CLOSE });

describe("B1 decideRoom — FITS, CLOSE, FULL", () => {
  it.each([
    [94_990, "FITS"],
    [95_000, "CLOSE"],
    [99_990, "CLOSE"],
    [100_000, "FULL"],
    [109_990, "FULL"],
    [110_000, "FULL"],
    [110_010, "FULL"],
    [114_990, "FULL"],
    [115_000, "FULL"],
    [115_010, "FULL"]
  ] as const)("used %i of 100 000 is %s", (used, expected) => {
    expect(room(used)).toBe(expected);
  });

  it("is CLOSE when this question would take it past the limit, and FITS when it lands exactly on it", () => {
    expect(room(90_000, 10_000)).toBe("FITS");
    expect(room(90_000, 10_001)).toBe("CLOSE");
  });

  it("A5: an estimate far above the whole limit is CLOSE, never FULL, while nothing is used", () => {
    // Free's cold-start estimate is the run maximum (about 0.36 USD) against a 0.20 USD month.
    expect(decideRoom({
      usedMicros: 0, estimateMicros: 360_000, limitMicros: 200_000, closeBasisPoints: CLOSE
    })).toBe("CLOSE");
  });

  it("rounds the close edge DOWN, like every other share of a limit", () => {
    // 3 × 9 500 / 10 000 = 2.85 → 2: two used of three is already close.
    expect(decideRoom({ usedMicros: 2, estimateMicros: 0, limitMicros: 3, closeBasisPoints: CLOSE })).toBe("CLOSE");
    expect(decideRoom({ usedMicros: 1, estimateMicros: 0, limitMicros: 3, closeBasisPoints: CLOSE })).toBe("FITS");
  });

  it("refuses anything that is not whole, non-negative micro-units and lawful basis points", () => {
    const sound = { usedMicros: 0, estimateMicros: 0, limitMicros: LIMIT, closeBasisPoints: CLOSE };
    for (const broken of [
      { ...sound, usedMicros: -1 },
      { ...sound, usedMicros: 0.5 },
      { ...sound, estimateMicros: -1 },
      { ...sound, limitMicros: 0 },
      { ...sound, closeBasisPoints: 10_001 },
      { ...sound, closeBasisPoints: -1 }
    ]) {
      expect(() => decideRoom(broken)).toThrow(TypeError);
    }
  });
});

describe("B1 decideSharedWall — the running wall, real spend only", () => {
  const wall = (spentMicros: number, finishBasisPoints: number) =>
    decideSharedWall({ spentMicros, projectedMicros: 0, limitMicros: LIMIT, finishBasisPoints });

  it.each([[109_990, "WITHIN"], [110_000, "WITHIN"], [110_010, "WOULD_CROSS"]] as const)(
    "a person window (finish 110%%): %i spent is %s", (spent, expected) => {
      expect(wall(spent, 11_000)).toBe(expected);
    }
  );

  it.each([[114_990, "WITHIN"], [115_000, "WITHIN"], [115_010, "WOULD_CROSS"]] as const)(
    "the site's day (finish 115%%): %i spent is %s", (spent, expected) => {
      expect(wall(spent, 11_500)).toBe(expected);
    }
  );

  it("adds the projected call to what is spent", () => {
    expect(decideSharedWall({ spentMicros: 100_000, projectedMicros: 10_000, limitMicros: LIMIT, finishBasisPoints: 11_000 }))
      .toBe("WITHIN");
    expect(decideSharedWall({ spentMicros: 100_000, projectedMicros: 10_001, limitMicros: LIMIT, finishBasisPoints: 11_000 }))
      .toBe("WOULD_CROSS");
  });

  it("rounds the finish edge DOWN", () => {
    // 3 × 11 000 / 10 000 = 3.3 → 3.
    expect(decideSharedWall({ spentMicros: 3, projectedMicros: 0, limitMicros: 3, finishBasisPoints: 11_000 })).toBe("WITHIN");
    expect(decideSharedWall({ spentMicros: 3, projectedMicros: 1, limitMicros: 3, finishBasisPoints: 11_000 })).toBe("WOULD_CROSS");
  });

  it("refuses a finish edge below the limit or above twice it", () => {
    expect(() => wall(0, 9_999)).toThrow(TypeError);
    expect(() => wall(0, 20_001)).toThrow(TypeError);
    expect(wall(0, 10_000)).toBe("WITHIN");
    expect(wall(0, 20_000)).toBe("WITHIN");
  });
});

describe("B1 decideAdmission — START, WAIT, REFUSE_ALREADY_WAITING", () => {
  const MIDNIGHT = new Date("2026-10-01T00:00:00.000Z");
  const DAY_END = new Date("2026-10-01T09:30:00.000Z");
  const WEEK_END = new Date("2026-10-04T09:30:00.000Z");
  const MONTH_END = new Date("2026-10-29T09:30:00.000Z");
  const NEXT_TICK = new Date("2026-09-30T18:01:00.000Z");
  const site = (value: ScopeRoom["room"]): ScopeRoom => ({ scope: "SITE_DAY", room: value, resetsAt: MIDNIGHT });
  const day = (value: ScopeRoom["room"]): ScopeRoom => ({ scope: "PERSON_DAY", room: value, resetsAt: DAY_END });
  const week = (value: ScopeRoom["room"]): ScopeRoom => ({ scope: "PERSON_WEEK", room: value, resetsAt: WEEK_END });
  const month = (value: ScopeRoom["room"]): ScopeRoom => ({ scope: "PERSON_MONTH", room: value, resetsAt: MONTH_END });
  const admit = (rooms: readonly ScopeRoom[], extra: Partial<{ siteLineBlocking: boolean; personWaitingCount: number }> = {}) =>
    decideAdmission({
      rooms, siteLineBlocking: false, personWaitingCount: 0, waitingLinePerPerson: 1, nextTickAt: NEXT_TICK, ...extra
    });

  it("STARTs when nothing is full and nobody waits for the site, naming the worst room", () => {
    expect(admit([site("FITS")])).toEqual({ kind: "START", worst: "FITS", worstScope: null });
    expect(admit([site("CLOSE"), day("FITS")])).toEqual({ kind: "START", worst: "CLOSE", worstScope: "SITE_DAY" });
    // Two CLOSE rooms: the person's window names it, the longest first.
    expect(admit([site("CLOSE"), day("CLOSE"), month("CLOSE")]))
      .toEqual({ kind: "START", worst: "CLOSE", worstScope: "PERSON_MONTH" });
  });

  it("WAITs when any scope is FULL, until the LATEST reset among the full ones", () => {
    expect(admit([site("FULL"), week("FULL"), month("FITS")]))
      .toEqual({ kind: "WAIT", waitsUntil: WEEK_END, worstScope: "PERSON_WEEK" });
    expect(admit([site("FULL"), week("FITS")]))
      .toEqual({ kind: "WAIT", waitsUntil: MIDNIGHT, worstScope: "SITE_DAY" });
    expect(admit([site("FITS"), day("FULL"), month("FULL")]))
      .toEqual({ kind: "WAIT", waitsUntil: MONTH_END, worstScope: "PERSON_MONTH" });
  });

  it("never lets a new question jump the line: a site-blocked line makes it wait for the next tick", () => {
    expect(admit([site("FITS")], { siteLineBlocking: true }))
      .toEqual({ kind: "WAIT", waitsUntil: NEXT_TICK, worstScope: "SITE_DAY" });
  });

  it("refuses a second waiting question, for a FULL scope and for a blocked line alike", () => {
    expect(admit([site("FULL")], { personWaitingCount: 1 })).toEqual({ kind: "REFUSE_ALREADY_WAITING" });
    expect(admit([site("FITS")], { personWaitingCount: 1, siteLineBlocking: true }))
      .toEqual({ kind: "REFUSE_ALREADY_WAITING" });
  });

  it("lets a person who already waits START another question that nothing makes wait", () => {
    expect(admit([site("CLOSE")], { personWaitingCount: 1 }))
      .toEqual({ kind: "START", worst: "CLOSE", worstScope: "SITE_DAY" });
  });

  it("A5: the Free month whose estimate crosses the limit is CLOSE, and the question STARTS", () => {
    const monthRoom = decideRoom({ usedMicros: 0, estimateMicros: 360_000, limitMicros: 200_000, closeBasisPoints: CLOSE });
    expect(admit([site("FITS"), month(monthRoom)])).toEqual({ kind: "START", worst: "CLOSE", worstScope: "PERSON_MONTH" });
  });

  it("refuses a malformed input", () => {
    expect(() => admit([site("FITS"), site("FITS")])).toThrow(TypeError);
    expect(() => admit([site("FITS")], { personWaitingCount: -1 })).toThrow(TypeError);
    expect(() => decideAdmission({
      rooms: [site("FITS")], siteLineBlocking: false, personWaitingCount: 0, waitingLinePerPerson: 0, nextTickAt: NEXT_TICK
    })).toThrow(TypeError);
    expect(() => decideAdmission({
      rooms: [site("FITS")], siteLineBlocking: false, personWaitingCount: 0, waitingLinePerPerson: 1, nextTickAt: new Date(Number.NaN)
    })).toThrow(TypeError);
  });

  it("waitingUntil names the next tick when nothing is full", () => {
    expect(waitingUntil({ rooms: [site("CLOSE")], nextTickAt: NEXT_TICK }))
      .toEqual({ waitsUntil: NEXT_TICK, worstScope: "SITE_DAY" });
  });
});

describe("B1 NO_PERSON_ALLOWANCE", () => {
  it("reads no window for anyone: billing off, local mode, a legacy asker", async () => {
    await expect(NO_PERSON_ALLOWANCE.read(randomUUID(), new Date())).resolves.toEqual([]);
  });
});
