/**
 * `{time}` in the waiting, room and usage sentences (budget spec §2.11;
 * interface contract §10). It uses the site locale and the viewer's time zone:
 *  - the time alone when the instant falls on the viewer's today;
 *  - the weekday and time within the next six calendar days;
 *  - the date AND time otherwise ("19 Oct, 03:00"): a person's week or month
 *    wait still says when, to the minute, the debate starts.
 * How each shape reads inside sentences C, D and P1–P4 is an owner wording
 * pick (Open questions). `timeZone` is for tests; the browser's own zone is
 * used when it is absent.
 */
export function formatReset(at: Date, now: Date, locale: string, timeZone?: string): string {
  const zone: Intl.DateTimeFormatOptions = timeZone === undefined ? {} : { timeZone };
  const calendarDay = (value: Date): number => {
    const parts = new Intl.DateTimeFormat("en-CA", { ...zone, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(value);
    const part = (type: Intl.DateTimeFormatPartTypes): number =>
      Number(parts.find((candidate) => candidate.type === type)?.value);
    return Math.round(Date.UTC(part("year"), part("month") - 1, part("day")) / 86_400_000);
  };
  const format = (options: Intl.DateTimeFormatOptions): string => {
    try {
      return new Intl.DateTimeFormat(locale, { ...zone, ...options }).format(at);
    } catch {
      return new Intl.DateTimeFormat("en", { ...zone, ...options }).format(at);
    }
  };
  const daysAhead = calendarDay(at) - calendarDay(now);
  if (daysAhead === 0) return format({ hour: "2-digit", minute: "2-digit" });
  if (daysAhead > 0 && daysAhead <= 6) return format({ weekday: "short", hour: "2-digit", minute: "2-digit" });
  return format({ day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
