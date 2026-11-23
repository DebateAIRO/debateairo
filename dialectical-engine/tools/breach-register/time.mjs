// Moments for the breach register: how a time is read, and how it is shown.
//
// A time typed without a zone is Romanian time (Europe/Bucharest), because that is the clock on the owner's wall.
// A time with a zone ("Z" or "+02:00") is taken as written. Every moment is shown in Romanian time AND in UTC, so a
// deadline can be read by the owner and pasted into an authority's form without arithmetic.

export const OWNER_TIME_ZONE = "Europe/Bucharest";

const MOMENT = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?\s*(Z|[+-]\d{2}:\d{2})?$/u;

/** The wall-clock parts of an instant in a zone, as numbers. */
function partsIn(zone, date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  }).formatToParts(date);
  const read = (type) => Number(parts.find((part) => part.type === type)?.value);
  return { year: read("year"), month: read("month"), day: read("day"), hour: read("hour"), minute: read("minute"), second: read("second") };
}

/** How far the zone's wall clock is ahead of UTC at that instant, in milliseconds. */
function offsetMs(zone, date) {
  const wall = partsIn(zone, date);
  return Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second) - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * Reads "2026-11-22 14:05", "2026-11-22T14:05:30" (Romanian time) or the same with "Z" / "+02:00".
 * Returns a Date, or null when the text is not a moment. A day that does not exist (30 February) is not a moment.
 */
export function parseMoment(text) {
  const match = MOMENT.exec(String(text).trim());
  if (match === null) return null;
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map((value) => Number(value ?? 0));
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) return null;
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  if (new Date(wallAsUtc).getUTCDate() !== day) return null;
  const zone = match[7];
  if (zone === "Z") return new Date(wallAsUtc);
  if (zone !== undefined) {
    const sign = zone.startsWith("-") ? -1 : 1;
    const zoneHours = Number(zone.slice(1, 3));
    const zoneMinutes = Number(zone.slice(4, 6));
    if (zoneHours > 14 || zoneMinutes > 59) return null;
    return new Date(wallAsUtc - sign * (zoneHours * 60 + zoneMinutes) * 60_000);
  }
  // Romanian wall time: guess with the offset at that UTC moment, then correct once (this crosses a clock change).
  let instant = new Date(wallAsUtc - offsetMs(OWNER_TIME_ZONE, new Date(wallAsUtc)));
  instant = new Date(wallAsUtc - offsetMs(OWNER_TIME_ZONE, instant));
  return instant;
}

const two = (value) => String(value).padStart(2, "0");

/** "2026-11-22 14:05" in Romanian time. */
export function ownerTime(date) {
  const wall = partsIn(OWNER_TIME_ZONE, date);
  return `${wall.year}-${two(wall.month)}-${two(wall.day)} ${two(wall.hour)}:${two(wall.minute)}`;
}

/** "2026-11-22 12:05 UTC". */
export function utcTime(date) {
  return `${date.getUTCFullYear()}-${two(date.getUTCMonth() + 1)}-${two(date.getUTCDate())} ${two(date.getUTCHours())}:${two(date.getUTCMinutes())} UTC`;
}

/** "2026-11-22 14:05 Romanian time (2026-11-22 12:05 UTC)": the one way a moment is printed. */
export function showMoment(date) {
  return `${ownerTime(date)} Romanian time (${utcTime(date)})`;
}

/** What `open` writes into a record: Romanian wall time with its offset, so the line means one instant for ever. */
export function storedMoment(date) {
  const minutes = Math.round(offsetMs(OWNER_TIME_ZONE, date) / 60_000);
  const sign = minutes < 0 ? "-" : "+";
  const absolute = Math.abs(minutes);
  return `${ownerTime(date).replace(" ", "T")}${sign}${two(Math.floor(absolute / 60))}:${two(absolute % 60)}`;
}

export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;

/** "in 2 days 3 hours" / "5 hours ago": how far a moment is from now, in words. */
export function distance(from, to) {
  const gap = to.getTime() - from.getTime();
  const size = Math.abs(gap);
  const days = Math.floor(size / DAY_MS);
  const hours = Math.floor((size % DAY_MS) / HOUR_MS);
  const minutes = Math.floor((size % HOUR_MS) / 60_000);
  const words = days > 0 ? `${days} day${days === 1 ? "" : "s"} ${hours} h` : hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
  return gap >= 0 ? `in ${words}` : `${words} ago`;
}
