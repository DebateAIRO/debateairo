import { CRISIS_LINE_DIRECTORY } from "./crisisLineDirectory.js";

/**
 * Helplines the crisis screen offers (V, 2026-09-30). Every number was confirmed on the
 * helpline's own site or an official government page on the date in `CRISIS_LINES_CHECKED_AT`;
 * the source of each is kept beside it in `crisisLineDirectory.ts`. A country without a
 * confirmed line shows its emergency number and the international directory instead — a
 * wrong number is worse than none.
 */
export type CrisisLine = Readonly<{
  /** The helpline's own name, in its own language. */
  name: string;
  phone: string | null;
  /** Dialable form for a `tel:` link. */
  tel: string | null;
  sms: string | null;
  chatUrl: string | null;
  website: string;
  /** Confirmed open around the clock. */
  open247: boolean;
  /**
   * When it is not: the published opening hours, local time. `days` is absent for every day;
   * `to` may be past midnight. `null` when neither 24/7 nor any
   * hours could be confirmed: the screen then shows no hours rather than guess.
   */
  hours: readonly CrisisHours[] | null;
  free: boolean | null;
  sourceUrl: string;
}>;

export type CrisisWeekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export type CrisisHours = Readonly<{ days?: readonly CrisisWeekday[]; from: string; to: string }>;

const WEEKDAY_ORDER: readonly CrisisWeekday[] = Object.freeze(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);

export type CrisisCountry = Readonly<{
  emergency: string;
  lines: readonly CrisisLine[];
}>;

export { CRISIS_LINES_CHECKED_AT } from "./crisisLineDirectory.js";

export const CRISIS_LINES: Readonly<Record<string, CrisisCountry>> = CRISIS_LINE_DIRECTORY;

/** The international directory of free helplines (Throughline), for every other country. */
export const FIND_A_HELPLINE_URL = "https://findahelpline.com";

/**
 * The country an interface language most likely means, used only when neither the edge nor the
 * browser names one. Languages spoken across many countries (Arabic, Chinese, Russian) name
 * none: the person picks.
 */
const LOCALE_COUNTRY: Readonly<Record<string, string>> = Object.freeze({
  bg: "BG", hr: "HR", cs: "CZ", da: "DK", nl: "NL", en: "GB", et: "EE", fi: "FI", fr: "FR",
  de: "DE", el: "GR", hu: "HU", ga: "IE", it: "IT", lv: "LV", lt: "LT", mt: "MT", pl: "PL",
  pt: "PT", ro: "RO", sk: "SK", sl: "SI", es: "ES", sv: "SE", uk: "UA", hi: "IN", id: "ID",
  ja: "JP", ko: "KR", vi: "VN", he: "IL", tr: "TR"
});

function known(country: string | null | undefined): string | null {
  const code = country?.trim().toUpperCase();
  return code !== undefined && Object.prototype.hasOwnProperty.call(CRISIS_LINES, code) ? code : null;
}

/**
 * The country whose helplines the screen shows first: the edge's country, else the region of
 * the browser's first language that names one we have (`en-GB` → GB), else the interface
 * language's usual country. `null` when none is known: the screen then asks.
 */
export function resolveCrisisCountry(input: Readonly<{
  hint?: string | null;
  browserLanguages?: readonly string[];
  locale: string;
}>): string | null {
  const fromHint = known(input.hint);
  if (fromHint !== null) return fromHint;
  for (const tag of input.browserLanguages ?? []) {
    let region: string | undefined;
    try {
      region = new Intl.Locale(tag).region;
    } catch {
      region = undefined;
    }
    const fromBrowser = known(region);
    if (fromBrowser !== null) return fromBrowser;
  }
  return known(LOCALE_COUNTRY[input.locale]);
}

/** The countries with a checked entry, named in the reader's language and sorted by that name. */
export function crisisCountryOptions(locale: string): readonly Readonly<{ code: string; name: string }>[] {
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames([locale, "en"], { type: "region" });
  } catch {
    names = null;
  }
  const collator = new Intl.Collator(locale);
  return Object.keys(CRISIS_LINES)
    .map((code) => ({ code, name: names?.of(code) ?? code }))
    .sort((left, right) => collator.compare(left.name, right.name));
}

/**
 * The country Cloudflare reports for the page request (`cf-ipcountry`), read by the server
 * pages. Only a hint for which helplines to show first: a wrong or forged value costs nothing
 * but a different default in the country list.
 */
export function readCrisisCountryHint(headers: Readonly<{ get(name: string): string | null }>): string | null {
  const value = headers.get("cf-ipcountry");
  return value !== null && /^[A-Z]{2}$/.test(value) && value !== "XX" && value !== "T1" ? value : null;
}

/**
 * Opening hours in the reader's language: weekday names from the browser (`Intl`), times as
 * published. "Fri, Sat, Sun 19:00–07:00" in English, "vin., sâm., dum. 19:00–07:00" in Romanian.
 */
export function formatCrisisHours(hours: readonly CrisisHours[], locale: string): string {
  let weekday: Intl.DateTimeFormat;
  try {
    weekday = new Intl.DateTimeFormat([locale, "en"], { weekday: "short", timeZone: "UTC" });
  } catch {
    weekday = new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" });
  }
  // 2024-01-01 was a Monday.
  const dayName = (day: CrisisWeekday): string =>
    weekday.format(new Date(Date.UTC(2024, 0, 1 + WEEKDAY_ORDER.indexOf(day))));
  return hours.map((range) => {
    const days = range.days === undefined ? "" : `${range.days.map(dayName).join(", ")} `;
    return `${days}${range.from}–${range.to}`;
  }).join(" · ");
}
