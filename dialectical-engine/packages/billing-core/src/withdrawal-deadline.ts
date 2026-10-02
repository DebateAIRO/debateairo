import { TypedDomainError } from "@debateai/kernel";

export type WithdrawalDeadline = Readonly<{
  /** The last day of the window in the consumer's calendar (ISO date), for the "withdraw until {date}" line. */
  lastDay: string;
  /** The instant the window closes: midnight after `lastDay`, consumer's time. Open while `now` is before it. */
  closesAt: Date;
}>;

/**
 * The time zones a tax country's consumer may live in, as the date zone (the easternmost: the latest local date
 * of the activation) and the closing zone (the westernmost: the latest local midnight). Using both keeps the answer
 * on the consumer's side in a country with several zones. A country outside this list gets the Earth's extremes.
 */
function consumerZones(country: string): Readonly<{ dateZone: string; closeZone: string }> {
  const single: Readonly<Record<string, string>> = {
    AT: "Europe/Vienna", BE: "Europe/Brussels", BG: "Europe/Sofia", HR: "Europe/Zagreb", CY: "Asia/Nicosia",
    CZ: "Europe/Prague", DK: "Europe/Copenhagen", EE: "Europe/Tallinn", FI: "Europe/Helsinki", FR: "Europe/Paris",
    DE: "Europe/Berlin", GR: "Europe/Athens", HU: "Europe/Budapest", IE: "Europe/Dublin", IT: "Europe/Rome",
    LV: "Europe/Riga", LT: "Europe/Vilnius", LU: "Europe/Luxembourg", MT: "Europe/Malta", NL: "Europe/Amsterdam",
    PL: "Europe/Warsaw", RO: "Europe/Bucharest", SK: "Europe/Bratislava", SI: "Europe/Ljubljana",
    SE: "Europe/Stockholm", IS: "Atlantic/Reykjavik", LI: "Europe/Vaduz", NO: "Europe/Oslo", GB: "Europe/London"
  };
  const split: Readonly<Record<string, Readonly<{ dateZone: string; closeZone: string }>>> = {
    PT: { dateZone: "Europe/Lisbon", closeZone: "Atlantic/Azores" },
    ES: { dateZone: "Europe/Madrid", closeZone: "Atlantic/Canary" }
  };
  const zone = single[country];
  if (zone !== undefined) return { dateZone: zone, closeZone: zone };
  return split[country] ?? { dateZone: "Pacific/Kiritimati", closeZone: "Etc/GMT+12" };
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
 * Spec §2.5.6 "within withdrawal_days of the first ACTIVATED", counted as the owner ruled (R2 Q-6): 14 calendar days
 * from the first activation — the activation's own day is not counted, so the first day is the next one — in the
 * consumer's time zone (the tax country's calendar), ending at the end of the last day. No weekend and no
 * public-holiday roll: business days are used only for xMoney's notice rules (A7). This function is the one place
 * the counting lives, so a later ruling changes it here alone.
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
  const lastDay = Date.UTC(start.year, start.month - 1, start.day + input.withdrawalDays);
  return Object.freeze({
    lastDay: new Date(lastDay).toISOString().slice(0, 10),
    closesAt: localMidnight(lastDay + dayMs, closeZone)
  });
}
