// packages/payments-netopia/src/facts.ts

/*
 * Spec 2026-10-05 §2.4.7: every NETOPIA fact the build cannot yet prove, in ONE object, each pinned by N22's recorded suite:
 * clientIdLocation (N-2), tokenPaths (N-4; dot paths from the answer's or message's root, in the order tried), paidStatuses
 * (N-9), the decline tables (N-12), installments (N-24), the page's languages, and notFoundCodes (N-16: NETOPIA documents no
 * "no such order" answer; "404" is the build's assumption, after NETOPIA's HTTP-like error codes such as {"code":"401"}).
 */
export const NETOPIA_FACTS: Readonly<{
  clientIdLocation: "order" | "instrument"; tokenPaths: ReadonlyArray<string>; paidStatuses: ReadonlyArray<number>;
  cardDeclineCodes: ReadonlyArray<string>; bankDeclineCodes: ReadonlyArray<string>; installments: number;
  pageLanguages: ReadonlyArray<string>; notFoundCodes: ReadonlyArray<string>;
}> = Object.freeze({
  clientIdLocation: "order",
  tokenPaths: Object.freeze(["payment.binding.token", "payment.instrument.token", "payment.token"]),
  paidStatuses: Object.freeze([3, 5]),
  cardDeclineCodes: Object.freeze(["16", "17", "18", "19", "20", "21", "22", "26", "34", "35", "36", "37", "39"]),
  bankDeclineCodes: Object.freeze(["17", "18", "19", "20", "21", "22", "26", "34", "35", "37"]),
  installments: 0,
  pageLanguages: Object.freeze(["ro", "en", "bg", "es", "hu", "it", "nl", "de", "fr"]),
  notFoundCodes: Object.freeze(["404"])
});

const LOCALE_SEPARATOR = /[-_]/u;
/** The buyer's locale when NETOPIA's page speaks it (its primary subtag), else English (spec §2.4.2). */
export function netopiaLanguageOf(locale: string): string {
  const primary = (typeof locale === "string" ? locale.trim().toLowerCase().split(LOCALE_SEPARATOR)[0] : undefined) ?? "";
  return NETOPIA_FACTS.pageLanguages.includes(primary) ? primary : "en";
}
