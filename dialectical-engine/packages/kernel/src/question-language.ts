import { ARGUMENT_LANGUAGE_NAMES, argumentLanguageDirective } from "./argument-language.js";
import {
  majorityScript, replyLanguageCheck, replyLanguageIssues, replyProseFieldsAt, replyScriptOfTag,
  type ReplyLanguageExpectation, type ReplyLanguageIssue, type ReplyScript
} from "./reply-language.js";

/**
 * QUESTION LANGUAGE (question-language spec 2026-10-13, ruling L6). In a new-shape debate the language is decided
 * once, before the debate exists, and locked. Every AI call is told the named language (`questionLanguageSentence`)
 * and gets it as the material field `question_language`. Every reply is checked against the locked code
 * (`lockedReplyLanguageExpectation`), never against a new guess from the question. Today's shape keeps today's
 * directive and today's check: every helper here takes `null` for "no lock" and then does exactly what today's code
 * does.
 */
export type QuestionLanguage = Readonly<{ code: string; name: string }>;

/** The material field every new-shape call carries. Code-owned vocabulary, never translated. */
export const QUESTION_LANGUAGE_FIELD = "question_language" as const;

/** ISO 639-1: the only codes a lock may carry (the fast AI's answer and eld's both pass through this list). */
const ISO_639_1 = new Set([
  "aa", "ab", "ae", "af", "ak", "am", "an", "ar", "as", "av", "ay", "az", "ba", "be", "bg", "bi", "bm", "bn", "bo", "br",
  "bs", "ca", "ce", "ch", "co", "cr", "cs", "cu", "cv", "cy", "da", "de", "dv", "dz", "ee", "el", "en", "eo", "es", "et",
  "eu", "fa", "ff", "fi", "fj", "fo", "fr", "fy", "ga", "gd", "gl", "gn", "gu", "gv", "ha", "he", "hi", "ho", "hr", "ht",
  "hu", "hy", "hz", "ia", "id", "ie", "ig", "ii", "ik", "io", "is", "it", "iu", "ja", "jv", "ka", "kg", "ki", "kj", "kk",
  "kl", "km", "kn", "ko", "kr", "ks", "ku", "kv", "kw", "ky", "la", "lb", "lg", "li", "ln", "lo", "lt", "lu", "lv", "mg",
  "mh", "mi", "mk", "ml", "mn", "mr", "ms", "mt", "my", "na", "nb", "nd", "ne", "ng", "nl", "nn", "no", "nr", "nv", "ny",
  "oc", "oj", "om", "or", "os", "pa", "pi", "pl", "ps", "pt", "qu", "rm", "rn", "ro", "ru", "rw", "sa", "sc", "sd", "se",
  "sg", "si", "sk", "sl", "sm", "sn", "so", "sq", "sr", "ss", "st", "su", "sv", "sw", "ta", "te", "tg", "th", "ti", "tk",
  "tl", "tn", "to", "tr", "ts", "tt", "tw", "ty", "ug", "uk", "ur", "uz", "ve", "vi", "vo", "wa", "wo", "xh", "yi", "yo",
  "za", "zh", "zu"
]);

/** Languages commonly written in two scripts: the lock names the script the question itself uses. */
const TWO_SCRIPT_LANGUAGES = new Set(["sr", "uz", "az", "kk", "mn"]);
const SCRIPT_SUBTAGS: Readonly<Record<string, ReplyScript>> = Object.freeze({
  Latn: "Latin", Cyrl: "Cyrillic", Grek: "Greek", Arab: "Arabic", Hebr: "Hebrew", Deva: "Devanagari", Hang: "Hangul",
  Hani: "CJK", Hans: "CJK", Hant: "CJK", Jpan: "CJK"
});
const FALLBACK_NAME = "the same language as the question";
const SCRIPT_LETTERS_MIN = 12;
/** A stored name read back as a lock: one line, no control characters, at most this many UTF-8 bytes. */
const STORED_NAME_MAX_BYTES = 64;
/** A tag `questionLanguageOf` can emit: a two-letter primary, with `-Latn`/`-Cyrl` only for a two-script language. */
const EMITTED_TAG = /^([a-z]{2})(?:-(Latn|Cyrl))?$/u;
const ENGLISH_LANGUAGE_NAMES = new Intl.DisplayNames(["en"], { type: "language", fallback: "none" });
const UTF8 = new TextEncoder();

function englishNameOf(code: string): string | null {
  if (Object.hasOwn(ARGUMENT_LANGUAGE_NAMES, code)) return ARGUMENT_LANGUAGE_NAMES[code]!;
  let name: string | undefined;
  try {
    name = ENGLISH_LANGUAGE_NAMES.of(code);
  } catch {
    return null;
  }
  return name === undefined || name.trim() === "" || name === code ? null : name;
}

/** The UTF-8 bytes a lock adds to a call: its named sentence plus its material field. */
function framedBytes(language: QuestionLanguage): number {
  return UTF8.encode(questionLanguageSentence(language) + questionLanguageField(language).content).length;
}

/**
 * The lock for a code: our 35 named as the runs already store them, any other ISO 639-1 code in English. A two-script
 * language gets the question's script ("sr-Latn", "Serbian (Latin script)"). Null for anything else ("und",
 * "unknown", regional or three-letter codes): such a value is never locked. A decider's answer that carries a region or
 * script subtag ("pt-BR", "sr-Latn") must be reduced by the CALLER to its primary tag before it is passed here; a
 * two-script language then takes its script from the `questionLine` passed beside it.
 */
export function questionLanguageOf(code: string, questionLine?: string): QuestionLanguage | null {
  const primary = code.trim().toLowerCase();
  if (!ISO_639_1.has(primary)) return null;
  const name = englishNameOf(primary);
  if (name === null) return null;
  if (questionLine !== undefined && TWO_SCRIPT_LANGUAGES.has(primary)) {
    const letters = questionLine.match(/\p{L}/gu)?.length ?? 0;
    const script = letters >= SCRIPT_LETTERS_MIN ? majorityScript(questionLine) : null;
    if (script === "Latin") return Object.freeze({ code: `${primary}-Latn`, name: `${name} (Latin script)` });
    if (script === "Cyrillic") return Object.freeze({ code: `${primary}-Cyrl`, name: `${name} (Cyrillic script)` });
  }
  return Object.freeze({ code: primary, name });
}

/**
 * A run's stored tag and name read back as a lock value. It does NOT decide whether the run is locked: the CALLER
 * decides that from the run's shape receipt, never from this function's non-null result. Today's unshaped runs store
 * the detector's tag and name (for example "ro", "Romanian"), which read back non-null here, and they keep today's
 * directive and today's reply check.
 *
 * Null for anything `questionLanguageOf` could not have emitted: "und", today's fallback name, a tag that is not an
 * ISO 639-1 primary (with `-Latn`/`-Cyrl` only on a two-script language), or a name that is blank, spans lines, holds a
 * control character, is longer than 64 UTF-8 bytes, or would frame longer than `questionLanguageForBounds()` (the money
 * bound a price that must cover any lock frames with). So no stored value can make a call longer than that bound.
 */
export function questionLanguageFromRun(tag: string, name: string): QuestionLanguage | null {
  const parts = EMITTED_TAG.exec(tag);
  if (parts === null) return null;
  const [, primary, script] = parts;
  if (!ISO_639_1.has(primary!) || englishNameOf(primary!) === null) return null;
  if (script !== undefined && !TWO_SCRIPT_LANGUAGES.has(primary!)) return null;
  if (name.trim() === "" || name === FALLBACK_NAME || /[\p{Cc}\p{Zl}\p{Zp}]/u.test(name)) return null;
  if (UTF8.encode(name).length > STORED_NAME_MAX_BYTES) return null;
  const language: QuestionLanguage = Object.freeze({ code: tag, name });
  return framedBytes(language) > framedBytes(questionLanguageForBounds()) ? null : language;
}

/**
 * THE one sentence every new-shape call carries (ruling L6). It always names the language; there is no fallback
 * form. It is code, not owner text: the sealed fingerprints exclude it, so a change needs no new register version
 * (the story's per-call hash includes it, as it includes today's directive).
 */
export function questionLanguageSentence(language: QuestionLanguage): string {
  const name = language.name.trim();
  if (name === "") throw new TypeError("QUESTION_LANGUAGE_NAME_REQUIRED");
  return `Write every natural-language field in ${name}, the language this debate was set to and named in question_language, even where the material quotes another language. Keep JSON keys, enum tokens, JSON literals (null, true, false), and identifier-shaped values (including claim_type, basis, outcome, fatalFlags[].type, segment_id, node_refs, served_number_refs and question_language) in English exactly as specified; never translate an identifier or literal.`;
}

export function questionLanguageField(language: QuestionLanguage): Readonly<{ name: typeof QUESTION_LANGUAGE_FIELD; content: string }> {
  return Object.freeze({ name: QUESTION_LANGUAGE_FIELD, content: JSON.stringify({ code: language.code, name: language.name }) });
}

/** The material with the language field LAST; the same array, untouched, when nothing is locked (today's bytes). */
export function withQuestionLanguageField<T extends Readonly<{ name: string; content: string }>>(
  material: readonly T[], language: QuestionLanguage | null | undefined
): readonly Readonly<{ name: string; content: string }>[] {
  if (language === null || language === undefined) return material;
  return Object.freeze([...material, questionLanguageField(language)]);
}

/** The writing system a language code is written in by default (CLDR likely subtags), or undefined when unknown. */
function scriptOfCode(primary: string): ReplyScript | undefined {
  let script: string | undefined;
  try {
    script = new Intl.Locale(primary).maximize().script;
  } catch {
    return undefined;
  }
  if (script === undefined) return undefined;
  return Object.hasOwn(SCRIPT_SUBTAGS, script) ? SCRIPT_SUBTAGS[script] : "Other";
}

/**
 * What a reply is checked against: the locked code and its script, read from the CODE (own table, script subtag, our
 * 35, then the code's default script: Thai → Other, Persian → Arabic); the question's letters only when the code names
 * no script. A kept-wording question in Latin letters never makes a Thai lock expect Latin replies.
 */
export function lockedReplyLanguageExpectation(language: QuestionLanguage, questionLine: string): ReplyLanguageExpectation {
  const [primaryRaw, ...rest] = language.code.split("-");
  const primary = (primaryRaw ?? "").toLowerCase();
  const subtag = rest.find((part) => part.length === 4);
  const fromSubtag = subtag === undefined ? undefined : SCRIPT_SUBTAGS[subtag[0]!.toUpperCase() + subtag.slice(1).toLowerCase()];
  const known = replyScriptOfTag(primary) ?? fromSubtag;
  if (known !== undefined) return Object.freeze({ tag: primary, script: known });
  if (Object.hasOwn(ARGUMENT_LANGUAGE_NAMES, primary)) return Object.freeze({ tag: primary, script: "Latin" });
  const ofCode = scriptOfCode(primary);
  if (ofCode !== undefined) return Object.freeze({ tag: primary, script: ofCode });
  const letters = questionLine.match(/\p{L}/gu)?.length ?? 0;
  return Object.freeze({ tag: primary, script: letters >= SCRIPT_LETTERS_MIN ? majorityScript(questionLine) : null });
}

/** Today's check without a lock; the locked check with one (never a re-guess of the question). */
export function replyLanguageCheckFor(
  questionLine: string, language: QuestionLanguage | null | undefined, patterns: readonly string[]
): (value: unknown) => readonly ReplyLanguageIssue[] {
  if (language === null || language === undefined) return replyLanguageCheck(questionLine, patterns);
  const expected = lockedReplyLanguageExpectation(language, questionLine);
  return (value) => replyLanguageIssues(expected, replyProseFieldsAt(value, patterns));
}

/**
 * Pre-flight PF-L38: the lock whose named sentence and field are the longest in UTF-8 bytes among every lock
 * `questionLanguageOf` can return (each two-script language in both scripts). A price that must cover ANY lock (the
 * API's B9 first-call price) frames with it. Ties: the first code in alphabetical order. Computed once per process.
 */
let boundsLanguage: QuestionLanguage | undefined;
export function questionLanguageForBounds(): QuestionLanguage {
  if (boundsLanguage !== undefined) return boundsLanguage;
  const candidates = [...ISO_639_1].sort().flatMap((code) => {
    const plain = questionLanguageOf(code);
    if (plain === null) return [];
    return TWO_SCRIPT_LANGUAGES.has(code)
      ? [plain, Object.freeze({ code: `${code}-Latn`, name: `${plain.name} (Latin script)` }),
        Object.freeze({ code: `${code}-Cyrl`, name: `${plain.name} (Cyrillic script)` })]
      : [plain];
  });
  boundsLanguage = candidates.reduce((longest, candidate) => framedBytes(candidate) > framedBytes(longest) ? candidate : longest);
  return boundsLanguage;
}

/** Today's directive without a lock (byte for byte); the named sentence with one. */
export function languageDirectiveFor(argumentLanguageName: string | null | undefined, language: QuestionLanguage | null | undefined): string {
  return language === null || language === undefined
    ? argumentLanguageDirective(argumentLanguageName ?? "")
    : questionLanguageSentence(language);
}
