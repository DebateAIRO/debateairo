/**
 * Terms of Service 2.19 and Privacy Policy 3.13, effective 19 November 2026. The English texts changed after the
 * archive took Terms 2.18 and Privacy 3.12, and the release check refuses a changed text under a number the archive
 * already holds, so both get new numbers. The number is one anchor for every language, so all 35 drafts carry it; only
 * the English body changes here, and the translations follow it before release (English first).
 *
 * Each change history gains an entry that names, in plain words, what changed since the archived text. The 2.18 and
 * 3.12 entries read again as the archived 2.18 and 3.12 wrote them: the sentences added to them later (DeepInfra, and
 * how you sign in) describe text those archived versions do not hold, so they move into the new entries.
 */

export const TERMS_219_ENTRY =
  "Version 2.19 replaced version 2.18: section 6 says how you can sign in: with a passkey, or with your password or, where the sign-in page offers it, your Google, Apple or X account, each followed by a second step; and that a recovery email address and a phone number are optional, and a phone number is not a way to sign in. Version 2.19 also says that a public debate stays public after its author leaves, that this is a term of our contract with you, that nobody owns the page, and that a flagged debate you publish after our approval stays public like any other (section 9); that the licence you give when something of yours becomes public also lets us adapt it and lets others build on it, lasts after you close your account and cannot be withdrawn, except where the law says otherwise (section 9); what you agree to about your rights as the author of what you publish (section 9 and, for Canada, Annex A.3); that starting, steering or digging into a debate does not by itself make you the author of the text the AIs write (section 8); and that we hold the rights the law gives to the maker of the collection of public debates (section 16). Version 2.19 also names DeepInfra, the company that receives most of a debate's text, says that it passes one model's requests to a partner company, says for which providers we have confirmed that their terms do not allow training on your content, and says that the web search provider receives only the short search phrases the models write and that its terms let it keep and use them (section 8). Version 2.19 also says that prices include tax (section 12); that you may withdraw within 14 days wherever you live, and that a refund, when you cancel or withdraw, is measured by the share of the plan's credit you have used (sections 12 and 13, and Annex A); and that we offer Dialectical Engine in fewer places (section 2 and Annex A).";

export const PRIVACY_313_ENTRY =
  "Version 3.13 replaced version 3.12: it says how you can sign in and what each way keeps: passkeys, your Google, Apple or X account where the sign-in page offers it, and a phone number, which is optional and is not a way to sign in; and that a password, or a Google, Apple or X account, always needs a second step (sections 2 and 9). Version 3.13 also says that a public debate stays public after you close your account, on what basis we keep it then, and that you can object to our keeping it; and that a flagged debate you publish after our approval stays public like any other (sections 4, 6 and 10). Version 3.13 also names DeepInfra, the company that receives most of a debate's text, says that it passes one model's requests to a partner company, says for which providers we have confirmed that their terms do not allow training on your content and which transfer mechanism each relies on, and says that the web search provider receives only the short search phrases the models write and that its terms let it keep and use them (sections 4 and 5). Version 3.13 also leaves out Annex B's parts for two countries where we no longer offer the service, and says that in Quebec too, debates on the Free plan are public (Annex B).";

/** The Terms' 2.18 entry, as the archived 2.18 wrote it, and as the history reads again. */
export const TERMS_218_ENTRY =
  "Version 2.18 replaced version 2.17: Annex A.3 says that, in Quebec too, debates on a paid plan are private by default and debates on the Free plan are public, as section 9 says; what we are liable for, and every right in these Terms, is unchanged.";

/** The two sentences the 2.18 entry had gained after the archive took 2.18: they now stand, reworded, in 2.19's. */
export const TERMS_218_LATER =
  " Version 2.18 also names DeepInfra, the company that receives most of a debate's text, says that it passes one model's requests to a partner company, and says for which providers we have confirmed that their terms do not allow training on your content (section 8). Version 2.18 also says how you can sign in: with a passkey, or with your password or, where the sign-in page offers it, your Google, Apple or X account, each followed by a second step; and that a phone number is optional and is not a way to sign in (section 6).";

/**
 * The 3.12 entry's sentence on DeepInfra, added after the archive took 3.12 (the sentence on how you sign in, added
 * after it, is in tests/support/legalSignIn.ts's history). Both now stand, reworded, in 3.13's entry.
 */
export const PRIVACY_312_DEEPINFRA =
  "Version 3.12 also names DeepInfra, the company that receives most of a debate's text, says that it passes one model's requests to a partner company, and says for which providers we have confirmed that their terms do not allow training on your content and which transfer mechanism each relies on (sections 4 and 5).";

/**
 * English Privacy Policy, [what the line said under 3.12, as legal-privacy-312 compares it with 3.11, what it says
 * now]. The 3.12 entry is restored with its DeepInfra sentence and without the sign-in sentence, which
 * tests/support/legalSignIn.ts's swaps leave out too.
 */
export const PRIVACY_RELEASE_SWAPS: readonly (readonly [string, string])[] = [
  ["eyebrow: PRIVACY POLICY · v3.12 · EFFECTIVE 4 NOVEMBER 2026", "eyebrow: PRIVACY POLICY · v3.13 · EFFECTIVE 19 NOVEMBER 2026"],
  ["endMarker: END OF POLICY · GDPR (EU) 2016/679 · v3.12", "endMarker: END OF POLICY · GDPR (EU) 2016/679 · v3.13"],
  ["**Version 3.12 · Effective 4 November 2026 · ", "**Version 3.13 · Effective 19 November 2026 · "],
  [
    "This policy was last updated on 4 November 2026. Version 3.12 replaced version 3.11:",
    `This policy was last updated on 19 November 2026. ${PRIVACY_313_ENTRY} Version 3.12 replaced version 3.11:`
  ],
  [
    `(sections 2, 3, 4, 6, 7, 9 and 10). ${PRIVACY_312_DEEPINFRA} Version 3.11 replaced`,
    "(sections 2, 3, 4, 6, 7, 9 and 10). Version 3.11 replaced"
  ]
];

/** English Terms of Service, [what the line said under 2.18 just before the release, what it says now]. */
export const TERMS_RELEASE_SWAPS: readonly (readonly [string, string])[] = [
  ["eyebrow: TERMS OF SERVICE · v2.18 · EFFECTIVE 1 NOVEMBER 2026", "eyebrow: TERMS OF SERVICE · v2.19 · EFFECTIVE 19 NOVEMBER 2026"],
  ["endMarker: END OF TERMS · v2.18", "endMarker: END OF TERMS · v2.19"],
  ["**Version 2.18 · Effective 1 November 2026 · ", "**Version 2.19 · Effective 19 November 2026 · "],
  [`${TERMS_218_ENTRY}${TERMS_218_LATER}`, `${TERMS_219_ENTRY}\n\n${TERMS_218_ENTRY}`]
];

/** `text` with the release undone: each new text stands in it exactly once and goes back to what it replaced. */
export const withoutRelease = (text: string, swaps: readonly (readonly [string, string])[]): string =>
  swaps.reduce((current, [before, after]) => {
    if (current.split(after).length !== 2) throw new Error(`the release text is not there exactly once: ${after.slice(0, 60)}`);
    return current.replace(after, () => before);
  }, text);
