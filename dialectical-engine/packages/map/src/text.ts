import { detectArgumentLanguage } from "@debateai/kernel";

/**
 * The text a merge-by-rule compares: letters and digits only, lower case, diacritics dropped (Romanian ș/ş and ț/ţ and
 * their plain letters read alike), single spaces. Used only to group identical claims; never shown to anyone.
 */
export function mapNormaliseText(text: string): string {
  return text.normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/**
 * True when the text is confidently in another language than the question's (`languageTag`). The detector is the
 * engine's own (no model); a low-confidence reading, an empty text or an unknown question language never refuses.
 */
export function mapWrongLanguage(text: string, languageTag: string): boolean {
  if (languageTag === "und" || text.trim() === "") return false;
  const detected = detectArgumentLanguage(text);
  return detected.confidence === "high" && detected.tag !== "und" && detected.tag !== languageTag;
}
