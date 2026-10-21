import { replyTextHasStrayScript, replyTextLanguageVerdict, type ReplyLanguageExpectation } from "@debateai/kernel";

/**
 * The primary language subtag ("ro-RO" → "ro"), lower case; "und" stays "und". An empty tag gives "" (which no
 * template table holds, so a reader falls back to English).
 */
export function mapPrimarySubtag(tag: string): string {
  return tag.trim().toLowerCase().replace(/[-_].*$/su, "");
}

/**
 * The text a merge-by-rule compares: letters and digits only, lower case, single spaces. Combining marks are dropped
 * after a LATIN letter (Romanian ș/ş and ț/ţ read alike), and so are Russian ё's diaeresis (ё reads as е) and Arabic
 * short-vowel signs (tashkeel, U+064B..U+0652, usually left out in writing). Any other mark that follows a letter is part
 * of that letter (Hindi vowel signs, Japanese dakuten, Ukrainian ї) and is kept; a mark that follows no letter (an emoji's
 * variation selector, as in "✔️") is dropped, so a text of signs only normalises to "". Used only to group identical
 * claims; never shown to anyone.
 */
export function mapNormaliseText(text: string): string {
  return text.normalize("NFKD")
    .replace(/(\p{Script=Latin})\p{M}+/gu, "$1")
    .replace(/([\u0415\u0435])\u0308/gu, "$1")
    .replace(/[\u064B-\u0652]+/gu, "")
    .replace(/(?<![\p{L}\p{M}])\p{M}+/gu, "")
    .normalize("NFC")
    .toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, " ").trim();
}

/**
 * True when the text is clearly in another language than the question's (ruling R-5). The verdict is the kernel's
 * REPLY-side check (`replyTextLanguageVerdict`, no model), not the question detector, which is tuned for one-line
 * questions and misread plain Romanian sentences as French. Only "OTHER" refuses: "UNSURE" (a short text, an unknown
 * question script) and an empty text always pass. `expected` is built once per question from its line
 * (`replyLanguageExpectation`). Stray script (2026-10-21): Chinese characters, Japanese kana or Korean Hangul inside a text
 * whose expected script is another one (GLM's "lovit毙 salariații", practice 2026-10-14) are the wrong language too, by the
 * same rule the shared reply-language check applies (`replyTextHasStrayScript`).
 */
export function mapWrongLanguage(text: string, expected: ReplyLanguageExpectation): boolean {
  if (text.trim() === "") return false;
  return replyTextLanguageVerdict(expected, text) === "OTHER" || replyTextHasStrayScript(expected, text);
}
