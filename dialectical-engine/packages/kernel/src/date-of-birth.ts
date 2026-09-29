/**
 * Age gate — the date-of-birth rules shared by the sign-up widget (UX) and the
 * API (the authority). Design document Turn 8 · 8d/8f/8g.
 *
 * One minimum age for every country. The consent row records the age that was
 * applied, the country the request came from, and the rule version below —
 * never the date itself.
 */
export const MIN_AGE = 18 as const;

/**
 * Bumped whenever the rule a consent row was decided under changes. v1 was the
 * per-country table of the age-gate brief; v2 is the single MIN_AGE for every
 * country (Turn 8 implementation prompt, change 1).
 */
export const AGE_RULE_VERSION = "age-gate/v2-single-min-age-18" as const;

/** The first year a date of birth may carry. */
export const DOB_MIN_YEAR = 1900 as const;

export type DobPart = "d" | "m" | "y";
export type DobOrder = readonly [DobPart, DobPart, DobPart];
export type DobParts = Readonly<{ d: string; m: string; y: string }>;

export const DOB_ORDER_DMY: DobOrder = Object.freeze(["d", "m", "y"] as const);
export const DOB_ORDER_MDY: DobOrder = Object.freeze(["m", "d", "y"] as const);
export const DOB_ORDER_YMD: DobOrder = Object.freeze(["y", "m", "d"] as const);

const YEAR_FIRST_LANGUAGES = new Set(["ja", "zh", "ko", "hu"]);

/**
 * The field order for a UI locale: YMD for ja, zh, ko, hu; MDY for en-US; DMY
 * for everything else. `locale` is a BCP 47 tag; only its language and region
 * are read ("en-US" → MDY, "en" or "en-GB" → DMY).
 */
export function dobOrderForLocale(locale: string): DobOrder {
  const [language = "", region = ""] = locale.toLowerCase().split(/[-_]/);
  if (YEAR_FIRST_LANGUAGES.has(language)) return DOB_ORDER_YMD;
  if (language === "en" && region === "us") return DOB_ORDER_MDY;
  return DOB_ORDER_DMY;
}

const pad2 = (value: string) => value.padStart(2, "0");

/**
 * Reads a pasted full date into its three parts, or null when the text is not
 * a full date. Accepts 14/03/1998, 14.03.1998, 1998-03-14, 14031998 and
 * 19980314. A year-last date is read in the locale's day/month order; eight
 * bare digits are read year-first when the order is year-first or when they
 * cannot be a day-month-year date.
 */
export function parseDobPaste(text: string, order: DobOrder): DobParts | null {
  let parts = text.trim().split(/[^0-9]+/).filter(Boolean);
  if (parts.length === 1 && parts[0]!.length === 8) {
    const s = parts[0]!;
    const canBeYearFirst = /^(1[89]|20)\d\d/.test(s);
    const canBeYearLast = /(1[89]|20)\d\d$/.test(s);
    // The locale's own order wins when both readings are possible.
    const yearFirst = order[0] === "y" ? canBeYearFirst || !canBeYearLast : canBeYearFirst && !canBeYearLast;
    parts = yearFirst ? [s.slice(0, 4), s.slice(4, 6), s.slice(6)] : [s.slice(0, 2), s.slice(2, 4), s.slice(4)];
  }
  if (parts.length !== 3) return null;
  const [a, b, c] = parts as [string, string, string];
  if (a.length === 4 && b.length <= 2 && c.length <= 2) return { y: a, m: pad2(b), d: pad2(c) };
  if (c.length === 4 && a.length <= 2 && b.length <= 2) {
    const dayMonth = order.filter((part) => part !== "y");
    const result: Record<DobPart, string> = { d: "", m: "", y: c };
    result[dayMonth[0]!] = pad2(a);
    result[dayMonth[1]!] = pad2(b);
    // The locale decides an ambiguous date; a date only one reading makes valid is read that way.
    if (Number(result.m) > 12 && Number(result.d) <= 12) return { d: result.m, m: result.d, y: c };
    return result;
  }
  return null;
}

export type DobCheck =
  | Readonly<{ code: "incomplete" }>
  | Readonly<{ code: "before" }>
  | Readonly<{ code: "impossible" }>
  | Readonly<{ code: "future" }>
  | Readonly<{ code: "ok"; age: number }>;

export type DobErrorCode = Exclude<DobCheck["code"], "ok">;

/** The calendar date `now` falls on, in UTC. */
function utcToday(now: Date): Readonly<{ y: number; m: number; d: number }> {
  return { y: now.getUTCFullYear(), m: now.getUTCMonth() + 1, d: now.getUTCDate() };
}

/**
 * Validates the three parts and, when valid, computes the age as a UTC date.
 * The first failing rule wins, in the order incomplete → before 1900 →
 * impossible → future.
 */
export function checkDob(parts: DobParts, now: Date = new Date()): DobCheck {
  const { d, m, y } = parts;
  if (!/^\d{1,2}$/.test(d) || !/^\d{1,2}$/.test(m) || !/^\d{4}$/.test(y)) return { code: "incomplete" };
  const day = Number(d);
  const month = Number(m);
  const year = Number(y);
  if (year < DOB_MIN_YEAR) return { code: "before" };
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    month < 1 || month > 12 || day < 1 ||
    date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day
  ) {
    return { code: "impossible" };
  }
  const today = utcToday(now);
  if (date.getTime() > Date.UTC(today.y, today.m - 1, today.d)) return { code: "future" };
  const beforeBirthday = today.m < month || (today.m === month && today.d < day);
  return { code: "ok", age: today.y - year - (beforeBirthday ? 1 : 0) };
}

/** True when a valid date of birth is at least MIN_AGE years before `now` (UTC). */
export function meetsMinimumAge(parts: DobParts, now: Date = new Date()): boolean {
  const result = checkDob(parts, now);
  return result.code === "ok" && result.age >= MIN_AGE;
}

/** The ISO wire form (YYYY-MM-DD) of three valid parts. */
export function dobToIso(parts: DobParts): string {
  return `${parts.y}-${pad2(parts.m)}-${pad2(parts.d)}`;
}

/** The three parts of an ISO wire date, or null when it is not YYYY-MM-DD. */
export function dobFromIso(iso: string): DobParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match === null ? null : { y: match[1]!, m: match[2]!, d: match[3]! };
}
