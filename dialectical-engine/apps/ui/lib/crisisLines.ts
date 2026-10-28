import { CRISIS_LINE_DIRECTORY } from "./crisisLineDirectory.js";
import { CRISIS_COUNTRY_NAMES, CRISIS_WEEKDAY_NAMES } from "./crisisNames.generated.js";

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
  const language = locale.toLowerCase().split("-")[0] ?? "en";
  const fixed = CRISIS_COUNTRY_NAMES[language];
  return fixed === undefined ? STABLE_CRISIS_COUNTRY_OPTIONS
    : fixed.map(([code, name]) => ({ code, name }));
}

// English fallback for unknown locales. Shipped locales use the fixed localized
// table above on both the server and the first browser render.
export const STABLE_CRISIS_COUNTRY_OPTIONS: readonly Readonly<{ code: string; name: string }>[] = Object.freeze(([
  ["AR", "Argentina"], ["AU", "Australia"], ["AT", "Austria"], ["BE", "Belgium"],
  ["BR", "Brazil"], ["BG", "Bulgaria"], ["CA", "Canada"], ["CL", "Chile"],
  ["CO", "Colombia"], ["HR", "Croatia"], ["CY", "Cyprus"], ["CZ", "Czechia"],
  ["DK", "Denmark"], ["EE", "Estonia"], ["FI", "Finland"], ["FR", "France"],
  ["DE", "Germany"], ["GR", "Greece"], ["HK", "Hong Kong SAR China"],
  ["HU", "Hungary"], ["IS", "Iceland"], ["IN", "India"], ["ID", "Indonesia"],
  ["IE", "Ireland"], ["IL", "Israel"], ["IT", "Italy"], ["JP", "Japan"],
  ["LV", "Latvia"], ["LT", "Lithuania"], ["LU", "Luxembourg"], ["MY", "Malaysia"],
  ["MT", "Malta"], ["MX", "Mexico"], ["MD", "Moldova"], ["NL", "Netherlands"],
  ["NZ", "New Zealand"], ["NO", "Norway"], ["PE", "Peru"], ["PL", "Poland"],
  ["PT", "Portugal"], ["RO", "Romania"], ["SG", "Singapore"], ["SK", "Slovakia"],
  ["SI", "Slovenia"], ["ZA", "South Africa"], ["KR", "South Korea"],
  ["ES", "Spain"], ["SE", "Sweden"], ["CH", "Switzerland"], ["TW", "Taiwan"],
  ["TR", "Türkiye"], ["UA", "Ukraine"], ["AE", "United Arab Emirates"],
  ["GB", "United Kingdom"], ["US", "United States"], ["VN", "Vietnam"]
] as const).map(([code, name]) => Object.freeze({ code, name })));

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
 * Opening hours in the reader's language: weekday names from fixed CLDR data, times as
 * published. The fixed labels keep server rendering and hydration identical across ICU builds.
 */
export function formatCrisisHours(hours: readonly CrisisHours[], locale: string): string {
  const language = locale.toLowerCase().split("-")[0] ?? "en";
  const weekday = CRISIS_WEEKDAY_NAMES[language] ?? CRISIS_WEEKDAY_NAMES.en ?? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const dayName = (day: CrisisWeekday): string =>
    weekday[WEEKDAY_ORDER.indexOf(day)] ?? day;
  return hours.map((range) => {
    const days = range.days === undefined ? "" : `${range.days.map(dayName).join(", ")} `;
    return `${days}${range.from}–${range.to}`;
  }).join(" · ");
}
