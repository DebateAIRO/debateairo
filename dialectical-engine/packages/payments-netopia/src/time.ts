// packages/payments-netopia/src/time.ts

/*
 * Spec 2026-10-05 §2.4.3: `operationDate` counts only as an ISO date-time with Z or an offset, after 1 January 2020 and at
 * most five minutes ahead of our clock; anything else (the placeholder 0001-01-01T00:00:00, no zone, no such date) is null.
 */
const ISO_WITH_ZONE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|([+-])(\d{2}):(\d{2}))$/u;
const EARLIEST_MS = Date.UTC(2020, 0, 1);
const AHEAD_MS = 300_000;
const MINUTE_MS = 60_000;
const MAX_OFFSET_HOURS = 14;

export function parseOccurredAt(text: string | null | undefined, now: Date): Date | null {
  const match = typeof text === "string" ? ISO_WITH_ZONE.exec(text) : null;
  if (match === null) return null;
  // Each field read by name: the S1-1 scan of shipped code refuses a small numeric array such as [1, …, 6].
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > lastDay || hour > 23 || minute > 59 || second > 59) return null;
  const milliseconds = Number((match[7] ?? "").padEnd(3, "0").slice(0, 3));
  let offsetMinutes = 0;
  if (match[8] !== "Z") {
    const hours = Number(match[10]);
    const minutes = Number(match[11]);
    if (hours > MAX_OFFSET_HOURS || minutes > 59) return null;
    offsetMinutes = (match[9] === "-" ? -1 : 1) * (hours * 60 + minutes);
  }
  const at = Date.UTC(year, month - 1, day, hour, minute, second, milliseconds) - offsetMinutes * MINUTE_MS;
  return at <= EARLIEST_MS || at > now.getTime() + AHEAD_MS ? null : new Date(at);
}
