import { formatNumber, type MessageCatalog } from "./i18n/translate.js";

const UPVOTE_PREFIX = "home.upvote.";

/**
 * The part of a `home` catalogue the upvote button says: its spoken name in every plural form the language has, the
 * signed-out line and the failure line. The button is a client component, so every prop ships to the browser: these
 * values, not the whole catalogue. They are picked by prefix, not from a fixed key list, because the plural forms a
 * language has differ from one language to the next. `PublicDebatesBuffer`, a SERVER component, calls this, which is
 * why it lives apart from the button's file.
 */
export function upvoteMessageCatalog(catalog: MessageCatalog): MessageCatalog {
  return Object.freeze(Object.fromEntries(Object.entries(catalog).filter(([key]) => key.startsWith(UPVOTE_PREFIX))));
}

/**
 * The number shown in the upvote box. Below a thousand it is the count itself; from a thousand it is cut to one
 * decimal of thousands (`k`) or millions (`M`). It never rounds up, so the box never shows more votes than there are.
 * The decimal mark is the reader's language's own and the digits stay Latin, so the server and the browser write the
 * same characters. The exact count is in the button's spoken name.
 */
export function shortVoteCount(locale: string, count: number): string {
  const whole = Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
  if (whole < 1000) return String(whole);
  const written = (value: number): string =>
    formatNumber(locale, value, { maximumFractionDigits: 1, useGrouping: false, numberingSystem: "latn" });
  if (whole < 100_000) return `${written(Math.floor(whole / 100) / 10)}k`;
  if (whole < 1_000_000) return `${written(Math.floor(whole / 1000))}k`;
  return `${written(Math.floor(whole / 100_000) / 10)}M`;
}
