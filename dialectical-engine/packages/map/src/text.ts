import { replyTextLanguageVerdict, type ReplyLanguageExpectation } from "@debateai/kernel";

/**
 * The text a merge-by-rule compares: letters and digits only, lower case, diacritics dropped (Romanian ș/ş and ț/ţ and
 * their plain letters read alike), single spaces. Used only to group identical claims; never shown to anyone.
 */
export function mapNormaliseText(text: string): string {
  return text.normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/**
 * True when the text is clearly in another language than the question's (ruling R-5). The verdict is the kernel's
 * REPLY-side check (`replyTextLanguageVerdict`, no model), not the question detector, which is tuned for one-line
 * questions and misread plain Romanian sentences as French. Only "OTHER" refuses: "UNSURE" (a short text, an unknown
 * question script) and an empty text always pass. `expected` is built once per question from its line
 * (`replyLanguageExpectation`).
 */
export function mapWrongLanguage(text: string, expected: ReplyLanguageExpectation): boolean {
  if (text.trim() === "") return false;
  return replyTextLanguageVerdict(expected, text) === "OTHER";
}
