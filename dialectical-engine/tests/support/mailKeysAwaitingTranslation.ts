/**
 * Mail copy that is written in English first and translated before a release. A key whose name starts with one of
 * these prefixes holds the English sentence in every language's catalogue until then. The mail-language tests leave
 * such keys out of their "no English value is shipped" walk and check instead that every catalogue has them, with the
 * English placeholders. Translating a group means removing its prefix here, which puts its keys back under that walk.
 */
export const MAIL_KEY_PREFIXES_AWAITING_TRANSLATION: readonly string[] = Object.freeze([
  // The Owner's permit for a locked-out account: the mailbox link, the notice of the 72 hours, the finish link, and the two short endings.
  "auth.emr.permit."
]);

export const awaitsTranslation = (key: string): boolean => MAIL_KEY_PREFIXES_AWAITING_TRANSLATION.some((prefix) => key.startsWith(prefix));
