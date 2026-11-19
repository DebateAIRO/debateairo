import { TypedDomainError } from "@debateai/kernel";

const DAY_MS = 86_400_000;

/**
 * Romania's public holidays that fall on the same date every year (Labour Code, Law 53/2003, art. 139(1)), as
 * month-day. When Parliament adds a day to art. 139(1), it is added here, and the holiday test lists it.
 */
const FIXED_HOLIDAYS: ReadonlyArray<string> = Object.freeze([
  "01-01", "01-02", // New Year
  "01-06", "01-07", // Epiphany (Boboteaza) and Saint John (Sfântul Ion)
  "01-24", // Union of the Principalities
  "05-01", // Labour Day
  "06-01", // Children's Day
  "08-15", // Dormition of the Mother of God
  "11-30", // Saint Andrew
  "12-01", // National Day
  "12-25", "12-26" // Christmas
]);

/** The days art. 139(1) counts from Orthodox Easter Sunday: Good Friday, Easter Monday, Rusalii Sunday and Monday. */
const EASTER_OFFSETS: ReadonlyArray<number> = Object.freeze([-2, 0, 1, 49, 50]);

const isoDate = (utcMs: number): string => new Date(utcMs).toISOString().slice(0, 10);

/**
 * Orthodox Easter Sunday of `year` on the civil (Gregorian) calendar, as an ISO date. The Orthodox Church still
 * reckons Easter on the Julian calendar: Meeus's Julian rule gives that date, and the calendars' difference (13 days
 * from 1900 to 2099, 14 from 2100) moves it onto the civil calendar. Computed, not typed in, so no year runs out;
 * the holiday test checks the result against the published dates.
 */
export function orthodoxEasterSunday(year: number): string {
  if (!Number.isSafeInteger(year) || year < 1900 || year > 9999) {
    throw new TypedDomainError("BILLING_DATE_INVALID", "an Orthodox Easter year must be a whole year from 1900");
  }
  const d = (19 * (year % 19) + 15) % 30;
  const e = (2 * (year % 4) + 4 * (year % 7) - d + 34) % 7;
  const julianMonth = Math.floor((d + e + 114) / 31);
  const julianDay = ((d + e + 114) % 31) + 1;
  const calendarGap = Math.floor(year / 100) - Math.floor(year / 400) - 2;
  return isoDate(Date.UTC(year, julianMonth - 1, julianDay + calendarGap));
}

const byYear = new Map<number, ReadonlySet<string>>();

function holidaysOf(year: number): ReadonlySet<string> {
  const known = byYear.get(year);
  if (known !== undefined) return known;
  const easter = Date.parse(`${orthodoxEasterSunday(year)}T00:00:00.000Z`);
  const days = new Set<string>([
    ...FIXED_HOLIDAYS.map((monthDay) => `${year}-${monthDay}`),
    ...EASTER_OFFSETS.map((offset) => isoDate(easter + offset * DAY_MS))
  ]);
  const frozen: ReadonlySet<string> = Object.freeze(days);
  byYear.set(year, frozen);
  return frozen;
}

/** Every public holiday of `year` in Romania, as ISO dates in date order (a day that is two holidays appears once). */
export function romanianPublicHolidays(year: number): ReadonlyArray<string> {
  return Object.freeze([...holidaysOf(year)].sort());
}

/** Whether the civil date `date` (YYYY-MM-DD) is a public holiday in Romania. */
export function isRomanianPublicHoliday(date: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(date);
  const year = Number(match?.[1]);
  if (match === null || isoDate(Date.UTC(year, Number(match[2]) - 1, Number(match[3]))) !== date) {
    throw new TypedDomainError("BILLING_DATE_INVALID", "a holiday check needs a calendar date (YYYY-MM-DD)");
  }
  return holidaysOf(year).has(date);
}
