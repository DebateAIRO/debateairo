import { TypedDomainError } from "@debateai/kernel";

/**
 * HOW FAR BACK A SEARCH LOOKS (web search plan W1-2, 2026-10-30; design §3.1, owner-approved; the sieve's rule).
 *
 * The planner gives a pace word per path; code turns it into a date, counted back from the run's own date in UTC, so a
 * resumed run works out the same date. Fast topics look back 12 months, normal ones 3 years, slow ones have no limit.
 * The searches themselves carry no dates (the search guard removes them).
 */
export type WebPace = "FAST" | "NORMAL" | "SLOW";

/** Months each pace looks back; null is no limit. */
export const WEB_LOOK_BACK_MONTHS: Readonly<Record<WebPace, number | null>> = Object.freeze({ FAST: 12, NORMAL: 36, SLOW: null });

export type LookBackWindow = Readonly<{ pace: WebPace; months: number | null; afterDate: string | null }>;

export function isWebPace(value: unknown): value is WebPace {
  return typeof value === "string" && Object.hasOwn(WEB_LOOK_BACK_MONTHS, value);
}

const twoDigits = (value: number): string => String(value).padStart(2, "0");

/** The earliest date a search may find pages from (ISO `YYYY-MM-DD`), or null when the pace sets no limit. */
export function lookBackWindow(pace: WebPace, asOf: Date): LookBackWindow {
  if (!isWebPace(pace)) throw new TypedDomainError("WEB_PACE_INVALID", "A web search needs a known pace word");
  if (!(asOf instanceof Date) || Number.isNaN(asOf.getTime())) {
    throw new TypedDomainError("WEB_WINDOW_DATE_INVALID", "The look-back window needs the run's date");
  }
  const months = WEB_LOOK_BACK_MONTHS[pace];
  if (months === null) return Object.freeze({ pace, months, afterDate: null });
  const monthIndex = asOf.getUTCFullYear() * 12 + asOf.getUTCMonth() - months;
  const year = Math.floor(monthIndex / 12);
  const month = monthIndex % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(asOf.getUTCDate(), lastDay);
  return Object.freeze({ pace, months, afterDate: `${year}-${twoDigits(month + 1)}-${twoDigits(day)}` });
}

/** The date as Perplexity's search date filter reads it (`MM/DD/YYYY`). */
export function perplexityAfterDateFilter(afterDate: string): string {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(afterDate);
  if (parts === null) throw new TypedDomainError("WEB_WINDOW_DATE_INVALID", "A look-back date must be written YYYY-MM-DD");
  return `${parts[2]}/${parts[3]}/${parts[1]}`;
}
