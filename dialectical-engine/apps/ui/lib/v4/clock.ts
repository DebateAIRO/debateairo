import { formatDate } from "../i18n/translate.js";

/*
 * journey-f15 (owner's screen review, 3 Nov 2026): every V4 page writes a clock time one way, on the 24-hour clock
 * ("after 08:00", "Started 14:31"), never "02:00 AM" or "02:14 PM", in the page's language and the viewer's time zone,
 * from the server's own instant. One set of options, so the wait card, the Undo note, the reset lines and the shelf
 * cannot drift apart again.
 */
export const CLOCK_24H: Intl.DateTimeFormatOptions = Object.freeze({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** "14:31" for `value` in the page's language, or null when it cannot be read. */
export function clock24(value: string | number | Date | null | undefined, locale: string): string | null {
  if (value === null || value === undefined) return null;
  const when = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(when.getTime())) return null;
  return formatDate(locale, when, CLOCK_24H);
}
