import { describe, expect, it } from "vitest";
import { isRomanianPublicHoliday, orthodoxEasterSunday, romanianPublicHolidays } from "@debateai/billing-core";

/**
 * Orthodox Easter Sunday as Romania's church calendar publishes it, typed from that calendar. The module computes these
 * dates; this list is the independent check. When the current year comes within three years of its last entry, the
 * test below fails: re-read Labour Code art. 139(1) (Parliament adds holidays now and then), then add the next years.
 */
const PUBLISHED_ORTHODOX_EASTER: Readonly<Record<number, string>> = Object.freeze({
  2026: "2026-04-12", 2027: "2027-05-02", 2028: "2028-04-16", 2029: "2029-04-08", 2030: "2030-04-28",
  2031: "2031-04-13", 2032: "2032-05-02", 2033: "2033-04-24", 2034: "2034-04-09", 2035: "2035-04-29",
  2036: "2036-04-20", 2037: "2037-04-05", 2038: "2038-04-25", 2039: "2039-04-17", 2040: "2040-05-06"
});
const CHECKED_YEARS = Object.keys(PUBLISHED_ORTHODOX_EASTER).map(Number);
const LAST_CHECKED_YEAR = Math.max(...CHECKED_YEARS);

const iso = (utcMs: number): string => new Date(utcMs).toISOString().slice(0, 10);
const shift = (date: string, days: number): string => iso(Date.parse(`${date}T00:00:00.000Z`) + days * 86_400_000);

/**
 * A second, independent way to the same Sunday: Gauss's rule for the Julian Easter (M = 15, N = 6), moved onto the
 * Gregorian calendar by the century difference. The module uses Meeus's form; both must agree.
 */
function gaussOrthodoxEaster(year: number): string {
  const a = year % 19;
  const b = year % 4;
  const c = year % 7;
  const d = (19 * a + 15) % 30;
  const e = (2 * b + 4 * c + 6 * d + 6) % 7;
  const julianMarchDay = 22 + d + e;
  const gregorianShift = Math.floor(year / 100) - Math.floor(year / 400) - 2;
  return iso(Date.UTC(year, 2, julianMarchDay + gregorianShift));
}

describe("Romanian public holidays (Labour Code art. 139(1))", () => {
  it("computes Orthodox Easter as Romania's church calendar publishes it", () => {
    for (const year of CHECKED_YEARS) {
      expect(orthodoxEasterSunday(year), String(year)).toBe(PUBLISHED_ORTHODOX_EASTER[year]);
    }
  });

  it("agrees with a second rule for every year from 1900 to 2199, and always lands on a Sunday", () => {
    for (let year = 1900; year <= 2199; year += 1) {
      const easter = orthodoxEasterSunday(year);
      expect(easter, String(year)).toBe(gaussOrthodoxEaster(year));
      expect(new Date(`${easter}T00:00:00.000Z`).getUTCDay(), String(year)).toBe(0);
    }
  });

  it("lists every public holiday of 2026 and of 2027, in date order", () => {
    // 2026: Easter 12 April, so Good Friday is 10 April and Rusalii 31 May and 1 June (also Children's Day).
    expect(romanianPublicHolidays(2026)).toEqual([
      "2026-01-01", "2026-01-02", "2026-01-06", "2026-01-07", "2026-01-24",
      "2026-04-10", "2026-04-12", "2026-04-13", "2026-05-01", "2026-05-31", "2026-06-01",
      "2026-08-15", "2026-11-30", "2026-12-01", "2026-12-25", "2026-12-26"
    ]);
    // 2027: Easter 2 May, so Good Friday is 30 April, next to Labour Day; Rusalii 20 and 21 June.
    expect(romanianPublicHolidays(2027)).toEqual([
      "2027-01-01", "2027-01-02", "2027-01-06", "2027-01-07", "2027-01-24",
      "2027-04-30", "2027-05-01", "2027-05-02", "2027-05-03", "2027-06-01", "2027-06-20", "2027-06-21",
      "2027-08-15", "2027-11-30", "2027-12-01", "2027-12-25", "2027-12-26"
    ]);
  });

  it("holds the fixed days and the five days that move with Easter in every checked year", () => {
    const fixed = ["01-01", "01-02", "01-06", "01-07", "01-24", "05-01", "06-01", "08-15", "11-30", "12-01", "12-25", "12-26"];
    for (const year of CHECKED_YEARS) {
      const easter = PUBLISHED_ORTHODOX_EASTER[year] as string;
      // Good Friday, Easter Sunday and Monday, Rusalii (Pentecost, the 50th day) Sunday and Monday.
      const moving = [shift(easter, -2), easter, shift(easter, 1), shift(easter, 49), shift(easter, 50)];
      const expected = [...new Set([...fixed.map((day) => `${year}-${day}`), ...moving])].sort();
      expect(romanianPublicHolidays(year), String(year)).toEqual(expected);
      for (const day of expected) expect(isRomanianPublicHoliday(day), day).toBe(true);
    }
  });

  it("is not a holiday on an ordinary day, and on 2 December and 27 December", () => {
    for (const day of ["2026-12-02", "2026-12-27", "2026-11-17", "2027-04-29", "2027-05-04", "2027-01-08", "2027-01-23"]) {
      expect(isRomanianPublicHoliday(day), day).toBe(false);
    }
  });

  it("refuses a value that is not a calendar date", () => {
    for (const bad of ["2026-13-01", "2026-02-30", "26-12-25", "", "2026-12-25T00:00:00Z"]) {
      expect(() => isRomanianPublicHoliday(bad), bad).toThrow(expect.objectContaining({ code: "BILLING_DATE_INVALID" }));
    }
  });

  it("keeps the checked list at least three years ahead of today, so it never runs out unnoticed", () => {
    // Fails loudly once the list is about to end: extend PUBLISHED_ORTHODOX_EASTER and re-read art. 139(1) first.
    const thisYear = new Date().getUTCFullYear();
    expect(LAST_CHECKED_YEAR - thisYear,
      `the checked Orthodox Easter dates end in ${LAST_CHECKED_YEAR}; add the next years and re-read art. 139(1)`)
      .toBeGreaterThanOrEqual(3);
    // The checked list covers 2026 to 2036 at least, every year in between.
    expect(CHECKED_YEARS[0]).toBe(2026);
    expect(LAST_CHECKED_YEAR).toBeGreaterThanOrEqual(2036);
    expect(CHECKED_YEARS).toEqual(Array.from({ length: LAST_CHECKED_YEAR - 2025 }, (_, index) => 2026 + index));
  });
});
