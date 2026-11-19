import { TypedDomainError } from "@debateai/kernel";
import { isRomanianPublicHoliday } from "./romanian-public-holidays.js";

export type WithdrawalDeadline = Readonly<{
  /** The last day of the window in the consumer's calendar (ISO date), for the "withdraw until {date}" line. */
  lastDay: string;
  /** The instant the window closes: midnight after `lastDay`, consumer's time. Open while `now` is before it. */
  closesAt: Date;
}>;

/** The one time zone of each country of the withdrawal law's list (the EU, Iceland, Liechtenstein, Norway, the UK). */
const SINGLE_ZONE: Readonly<Record<string, string>> = Object.freeze({
  AT: "Europe/Vienna", BE: "Europe/Brussels", BG: "Europe/Sofia", HR: "Europe/Zagreb", CY: "Asia/Nicosia",
  CZ: "Europe/Prague", DK: "Europe/Copenhagen", EE: "Europe/Tallinn", FI: "Europe/Helsinki", FR: "Europe/Paris",
  DE: "Europe/Berlin", GR: "Europe/Athens", HU: "Europe/Budapest", IE: "Europe/Dublin", IT: "Europe/Rome",
  LV: "Europe/Riga", LT: "Europe/Vilnius", LU: "Europe/Luxembourg", MT: "Europe/Malta", NL: "Europe/Amsterdam",
  PL: "Europe/Warsaw", RO: "Europe/Bucharest", SK: "Europe/Bratislava", SI: "Europe/Ljubljana",
  SE: "Europe/Stockholm", IS: "Atlantic/Reykjavik", LI: "Europe/Vaduz", NO: "Europe/Oslo", GB: "Europe/London"
});

/** Portugal and Spain have islands an hour behind the mainland: the date is read on the mainland, the close on them. */
const SPLIT_ZONES: Readonly<Record<string, Readonly<{ dateZone: string; closeZone: string }>>> = Object.freeze({
  PT: Object.freeze({ dateZone: "Europe/Lisbon", closeZone: "Atlantic/Azores" }),
  ES: Object.freeze({ dateZone: "Europe/Madrid", closeZone: "Atlantic/Canary" })
});

/**
 * The one time zone of each other served country that has one. Only what the buyer reads (the day the plan started,
 * the time of the statement) uses it: the window of these countries is counted at the Earth's extremes, like that of
 * a country with several zones, which can only make it longer.
 */
const DISPLAY_ONLY_ZONE: Readonly<Record<string, string>> = Object.freeze({
  JP: "Asia/Tokyo", KR: "Asia/Seoul", MD: "Europe/Chisinau", SG: "Asia/Singapore"
});

/**
 * The time zones a tax country's consumer may live in, as the date zone (the easternmost: the latest local date
 * of the activation) and the closing zone (the westernmost: the latest local midnight). Using both keeps the answer
 * on the consumer's side in a country with several zones. A country outside this list gets the Earth's extremes.
 */
function consumerZones(country: string): Readonly<{ dateZone: string; closeZone: string }> {
  const zone = SINGLE_ZONE[country];
  if (zone !== undefined) return { dateZone: zone, closeZone: zone };
  return SPLIT_ZONES[country] ?? { dateZone: "Pacific/Kiritimati", closeZone: "Etc/GMT+12" };
}

/** The country's own time zone, or null when it has several. */
function ownZone(country: string): string | null {
  return SINGLE_ZONE[country] ?? DISPLAY_ONLY_ZONE[country] ?? null;
}

function localCalendarDate(instant: Date, zone: string): Readonly<{ year: number; month: number; day: number }> {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "numeric", day: "numeric" })
    .formatToParts(instant);
  const part = (type: "year" | "month" | "day"): number => Number(parts.find((entry) => entry.type === type)?.value);
  return { year: part("year"), month: part("month"), day: part("day") };
}

/** How far `zone`'s wall clock is ahead of UTC at `instant`, in milliseconds (DST included). */
function zoneOffsetMs(instant: number, zone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", second: "numeric"
  }).formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find((entry) => entry.type === type)?.value);
  const wall = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
  return wall - Math.floor(instant / 1_000) * 1_000;
}

/** 00:00 on a civil date in `zone`, as an instant; the second pass settles a DST change in between. */
function localMidnight(civilUtcMidnight: number, zone: string): Date {
  const first = civilUtcMidnight - zoneOffsetMs(civilUtcMidnight, zone);
  return new Date(civilUtcMidnight - zoneOffsetMs(first, zone));
}

/**
 * The withdrawal window: 14 calendar days (the register's `withdrawalDays`) from the first activation, counted in the
 * consumer's calendar (the tax country's time zone). The activation's own day is not counted, so the first day is the
 * next one, and the window ends at the end of the last day. When the last day is a Saturday, a Sunday or a Romanian
 * public holiday, the window ends at the end of the next working day instead, as Regulation (EEC, Euratom) No 1182/71
 * art. 3(4) and the Romanian Civil Code art. 2554 end such a period (Directive 2011/83/EU recital 41 applies the
 * Regulation). The Romanian holidays apply to every buyer: they are exact for a Romanian buyer and can only lengthen
 * anyone else's window. This function is the one place the counting lives.
 */
export function withdrawalDeadline(input: Readonly<{
  activatedAt: Date; taxCountry: string; withdrawalDays: number;
}>): WithdrawalDeadline {
  if (!Number.isSafeInteger(input.withdrawalDays) || input.withdrawalDays < 1) {
    throw new TypedDomainError("BILLING_WITHDRAWAL_DAYS_INVALID", "The withdrawal period is a whole number of days");
  }
  if (!Number.isFinite(input.activatedAt.getTime())) {
    throw new TypedDomainError("BILLING_PERIOD_INVALID", "The activation instant is not a date");
  }
  const dayMs = 86_400_000;
  const { dateZone, closeZone } = consumerZones(input.taxCountry);
  const start = localCalendarDate(input.activatedAt, dateZone);
  let lastDay = Date.UTC(start.year, start.month - 1, start.day + input.withdrawalDays);
  // A civil date's weekday is the same in every zone. Each day off moves the end one day on, as often as needed.
  while (!isWorkingDay(lastDay)) lastDay += dayMs;
  return Object.freeze({
    lastDay: civilDate(lastDay),
    closesAt: localMidnight(lastDay + dayMs, closeZone)
  });
}

const civilDate = (civilUtcMidnight: number): string => new Date(civilUtcMidnight).toISOString().slice(0, 10);

/** Monday to Friday and not a Romanian public holiday (Labour Code art. 139(1)). */
function isWorkingDay(civilUtcMidnight: number): boolean {
  const weekday = new Date(civilUtcMidnight).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !isRomanianPublicHoliday(civilDate(civilUtcMidnight));
}

/**
 * The civil date of `instant` in the buyer's calendar, as an ISO date: the day a plan started, as the withdrawal
 * statement and its acknowledgement name it. It is read in the tax country's own zone; in Portugal and Spain on the
 * mainland, where their 14 days are counted; in any other country with several zones in UTC, the zone the
 * acknowledgement prints the statement's time in and the invoice is dated in, so the email's dates read in one named
 * calendar. (The Earth's extremes, where such a country's window is counted, are no buyer's calendar.)
 */
export function consumerCalendarDay(instant: Date, taxCountry: string): string {
  if (!Number.isFinite(instant.getTime())) {
    throw new TypedDomainError("BILLING_PERIOD_INVALID", "The instant is not a date");
  }
  const zone = ownZone(taxCountry) ?? SPLIT_ZONES[taxCountry]?.dateZone ?? "UTC";
  const day = localCalendarDate(instant, zone);
  return civilDate(Date.UTC(day.year, day.month - 1, day.day));
}

/**
 * The time zone a consumer's clock reads in, for the date and time an email prints: the tax country's own zone, or
 * UTC when the country has several zones (or is unknown), so the printed time is never a guess.
 */
export function consumerTimeZone(taxCountry: string | null): string {
  return (taxCountry === null ? null : ownZone(taxCountry)) ?? "UTC";
}

/** Directive 2011/83/EU art. 13(1) (RO: OUG 34/2014 art. 13(1)): the refund is due within 14 days of the withdrawal. */
const WITHDRAWAL_REFUND_DAYS = 14;

/**
 * W9 (P2-I11, P2-M8): the latest instant the refund of a withdrawal is due, told to the owner when it must be made by
 * hand (O2_WITHDRAWAL, and O2 for a dead withdrawal refund): 14 days of 24 hours after `withdrewAt` (when the person
 * withdrew: the Settings click, or the arrival of the email or form). It is the law's fixed period, not the register's
 * `withdrawalDays` (the length of the window to withdraw), and it never moves to a later weekday: an owner refunding
 * by it is never late.
 */
export function withdrawalRefundDeadline(withdrewAt: Date): Date {
  if (!Number.isFinite(withdrewAt.getTime())) {
    throw new TypedDomainError("BILLING_PERIOD_INVALID", "The withdrawal instant is not a date");
  }
  return new Date(withdrewAt.getTime() + WITHDRAWAL_REFUND_DAYS * 86_400_000);
}
