/**
 * Privacy Policy 3.14, effective 19 November 2026. We send no marketing email: there is no box at sign-up, no Settings
 * control and no unsubscribe link. Yet 3.13 promised all three, so 3.14 drops what promised them: section 4's "Sending
 * you product news" row, the Objection row's last sentence (object to marketing), the Withdraw consent row's first
 * clause (withdraw marketing consent from any email or from Settings) and Annex B.3's sentence on marketing email under
 * CASL. The archive already holds 3.13, so the changed text takes a new number; the number is one anchor for every
 * language, so all 35 drafts carry it, and the marketing lines leave every language. English, Romanian and French,
 * the languages the release offers, gain the 3.14 history entry. Nobody has to accept again.
 */

export const PRIVACY_314_ENTRY =
  "Version 3.14 replaced version 3.13: it no longer says that we send product news by email if you agree, that you can withdraw that consent or object to marketing from any email or from Settings, or that marketing email reaches you in Canada only with your express consent. We send no marketing email (sections 4 and 10, and Annex B).";

/** English, [what 3.13 said, what 3.14 says]: the number, the date line and the history's first entry. */
export const PRIVACY_314_RELEASE_SWAPS: readonly (readonly [string, string])[] = [
  ["eyebrow: PRIVACY POLICY · v3.13 · EFFECTIVE 19 NOVEMBER 2026", "eyebrow: PRIVACY POLICY · v3.14 · EFFECTIVE 19 NOVEMBER 2026"],
  ["endMarker: END OF POLICY · GDPR (EU) 2016/679 · v3.13", "endMarker: END OF POLICY · GDPR (EU) 2016/679 · v3.14"],
  ["**Version 3.13 · Effective 19 November 2026 · ", "**Version 3.14 · Effective 19 November 2026 · "],
  [
    "This policy was last updated on 19 November 2026. Version 3.13 replaced",
    `This policy was last updated on 19 November 2026. ${PRIVACY_314_ENTRY} Version 3.13 replaced`
  ]
];

/** English, [what 3.13 said, what 3.14 says]: the four marketing promises, each gone and nothing else changed. */
export const PRIVACY_314_MARKETING_SWAPS: readonly (readonly [string, string])[] = [
  [
    "| Sending you product news | Email address | **Consent** — Art. 6(1)(a), an unticked box; withdraw any time from any email or from Settings |\n| Meeting tax,",
    "| Meeting tax,"
  ],
  ["section 6 says how we decide. Object to marketing at any time, and we stop |", "section 6 says how we decide |"],
  [
    "| Withdraw marketing consent from any email or from Settings; withdraw the sensitive-data consent",
    "| Withdraw the sensitive-data consent"
  ],
  [
    "including lawful access by authorities. Marketing email is sent only with your express consent under CASL. We report",
    "including lawful access by authorities. We report"
  ]
];

/** The English Privacy Policy as 3.13 wrote it: `text` with 3.14 undone, or only its number and entry undone. */
export const withoutPrivacy314 = (
  text: string,
  swaps: readonly (readonly [string, string])[] = [...PRIVACY_314_RELEASE_SWAPS, ...PRIVACY_314_MARKETING_SWAPS]
): string =>
  swaps.reduce((current, [before, after]) => {
    if (current.split(after).length !== 2) throw new Error(`the 3.14 text is not there exactly once: ${after.slice(0, 60)}`);
    return current.replace(after, () => before);
  }, text);

/**
 * A translation's draft with 3.14's number put back to 3.13: the eyebrow, the end marker and the version line, which
 * every language carries in the same places. The marketing lines are not put back (they differ in each language);
 * checks that compare a translation with an older text take them out of the older text instead.
 */
export const withoutPrivacy314Number = (text: string): string => {
  const lines = text.split("\n");
  const swap = (at: number, from: string, to: string): void => {
    if (lines[at]!.split(from).length !== 2) throw new Error(`line ${at} does not carry "${from}" once`);
    lines[at] = lines[at]!.replace(from, to);
  };
  swap(4, " v3.14 · ", " v3.13 · ");
  if (!lines[7]!.endsWith(" v3.14")) throw new Error("the end marker does not name 3.14");
  lines[7] = `${lines[7]!.slice(0, -4)}3.13`;
  swap(21, "**Version 3.14 · ", "**Version 3.13 · ");
  return lines.join("\n");
};
