import { DEFAULT_LOCALE, OFFERED_LOCALE_CODES, type CatalogLocaleCode } from "./locales.js";

/**
 * How much of an Accept-Language header is read. A browser sends a few dozen characters; a longer header is read only up
 * to the last whole entry inside this limit, so an oversized one costs no more than a normal one.
 */
const MAX_READ_LENGTH = 1024;
/** A language range: a primary subtag and optional subtags (ro, ro-RO, ro-MD, zh-Hant-TW). Its primary subtag counts. */
const LANGUAGE_RANGE = /^([a-z]{1,8})(?:-[a-z\d]{1,8})*$/u;
/** A weight as HTTP writes it: 0 to 1 with at most three decimals. Anything else makes the entry unreadable. */
const WEIGHT = /^q=(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/u;

type RankedRange = Readonly<{ language: string; q: number }>;

function wholeEntries(header: string): readonly string[] {
  if (header.length <= MAX_READ_LENGTH) return header.split(",");
  const end = header.lastIndexOf(",", MAX_READ_LENGTH);
  return end < 0 ? [] : header.slice(0, end).split(",");
}

/** The entries a header names, in its order. An unreadable entry is skipped; the others still count. */
function rankedRanges(header: string): readonly RankedRange[] {
  const ranked: RankedRange[] = [];
  for (const entry of wholeEntries(header)) {
    const [range = "", ...parameters] = entry.split(";").map((piece) => piece.trim().toLowerCase());
    const language = range === "*" ? "*" : LANGUAGE_RANGE.exec(range)?.[1];
    if (language === undefined || parameters.length > 1) continue;
    const [weight] = parameters;
    if (weight !== undefined && !WEIGHT.test(weight)) continue;
    ranked.push({ language, q: weight === undefined ? 1 : Number(weight.slice(2)) });
  }
  return ranked;
}

/**
 * The offered interface language a browser's Accept-Language ranks highest, or null when it accepts none of them.
 * The weights decide; on a tie the earlier entry wins. `ro-RO` and `ro-MD` count as `ro`, `en-US` as `en`. A weight of 0
 * refuses a language. `*` stands for every offered language the header does not name, and when it alone decides
 * between them the site's own order applies, English first.
 */
export function preferredOfferedLocale(header: string | null | undefined): CatalogLocaleCode | null {
  if (typeof header !== "string" || header.length === 0) return null;
  const ranked = rankedRanges(header);
  const named = new Set(ranked.map(({ language }) => language));
  let best: Readonly<{ code: CatalogLocaleCode; q: number }> | null = null;
  for (const { language, q } of ranked) {
    for (const code of OFFERED_LOCALE_CODES) {
      const covers = language === "*" ? !named.has(code) : language === code;
      if (covers && q > 0 && (best === null || q > best.q)) best = { code, q };
    }
  }
  return best?.code ?? null;
}

/**
 * The language shown to a visitor who has not picked one in the language list: the offered language the browser ranks
 * highest, or null when that is English or the browser names no offered language, because English is what such a
 * visitor sees anyway. A browser that prefers Romanian gets Romanian; a crawler that sends no header gets English.
 */
export function firstVisitLocale(header: string | null | undefined): CatalogLocaleCode | null {
  const preferred = preferredOfferedLocale(header);
  return preferred === DEFAULT_LOCALE ? null : preferred;
}
