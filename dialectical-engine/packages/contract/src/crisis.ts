import { CRISIS_LEXICONS, type CrisisLexicon, type CrisisSignal } from "./crisis-lexicon/index.js";

export type { CrisisLexicon, CrisisSignal } from "./crisis-lexicon/index.js";

/**
 * Crisis check (V, 2026-09-30): "we need to generate help numbers instead of debates for people
 * who seem to be in a crisis. We should not condone people to commit self-harm in any way."
 *
 * A question that reads as a person thinking about ending their life or harming themselves — or
 * asking how to — never becomes a debate: two models arguing "for" would be exactly the
 * condoning V ruled out. The person sees help numbers instead. The check runs twice with the
 * same code: in the browser, before any other screen (a person in crisis is not asked for
 * consent first), and on `POST /v1/asks`, which refuses the ask before admission with
 * `CRISIS_SUPPORT_OFFERED` — so no quota is spent and nothing is stored.
 *
 * It is a phrase check, not a model: deterministic, instant, offline and the same on both
 * sides. It aims at first-person crisis, method-seeking and a named person at risk. A policy
 * question ("Should assisted dying be legal?", "Does social media raise teen suicide rates?")
 * is not a crisis and still becomes a debate; the models' own prompt rule covers those.
 */
export const CRISIS_SUPPORT_OFFERED = "CRISIS_SUPPORT_OFFERED" as const;

/** Names the phrase lists in force; bump with any lexicon change. */
export const CRISIS_CHECK_VERSION = "debateai.crisis-check.v1" as const;

export type CrisisCheck = Readonly<
  | { crisis: false }
  | { crisis: true; signal: CrisisSignal; language: string }
>;

/**
 * The letters of every script whose lexicon uses `\b` (Latin, IPA, Greek, Cyrillic, Hebrew,
 * Arabic, Devanagari, Hangul), as plain ranges. `\p{L}` would say the same for these texts, but
 * V8 builds a full Unicode table for every occurrence: with a few hundred `\b` across 35 lists
 * the check ran out of memory. Punctuation inside those blocks (× ÷, Greek ; ·, Hebrew ־ ׀ ׃ ׆,
 * Arabic ، ؛ ؟ ٪ ۔, Devanagari । ॥) is left out, so "أنتحر؟" ends a word. Chinese and Japanese
 * lists do not use `\b`.
 */
const LETTER_OR_DIGIT = String.raw`[\u0030-\u0039\u0061-\u007A\u00AA\u00B5\u00BA\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02AF\u0300-\u036F\u0370-\u037D\u037F-\u0386\u0388-\u03FF\u0400-\u052F\u0590-\u05BD\u05BF\u05C1-\u05C2\u05C4-\u05C5\u05C7-\u05FF\u0610-\u061A\u0620-\u0669\u066E-\u06D3\u06D5-\u06FF\u0750-\u077F\u0900-\u0963\u0966-\u097F\u1100-\u11FF\u1E00-\u1FFF\u3130-\u318F\uAC00-\uD7AF]`;
/**
 * `\b` in a lexicon means a word edge over those letters (the engine's own `\b` is ASCII-only):
 * a letter on at most one side. Lexicons put `\b` next to a letter, where that is exactly the
 * edge.
 */
const WORD_EDGE = `(?:(?<!${LETTER_OR_DIGIT})|(?!${LETTER_OR_DIGIT}))`;

/**
 * One spelling for the question and the phrase lists alike: compatibility forms folded, lower
 * case, accents dropped from Latin, Greek and Cyrillic letters (people type "sa ma sinucid" for
 * "să mă sinucid"), ł đ ø ħ ı written bare, Arabic and Hebrew vowel marks dropped, curly
 * apostrophes straightened, runs of space collapsed. Marks on other scripts (Devanagari vowel
 * signs, Japanese voicing marks, Hangul) are part of the letter and are kept.
 */
export function normalizeForCrisisCheck(text: string): string {
  return foldCommon(text
    .normalize("NFKC")
    .toLowerCase()
    .normalize("NFD")
    .replace(/([\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}])\p{M}+/gu, "$1")
    .normalize("NFC")
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/gu, "")
    .replace(/[\u0591-\u05C7]/gu, "")
    // Letters that carry their mark inside them, typed bare as often as not: ł đ ø ħ ı.
    .replace(/[\u0142\u0111\u00F8\u0127\u0131]/gu, (letter) => BARE_LETTER[letter] ?? letter));
}

const BARE_LETTER: Readonly<Record<string, string>> = Object.freeze({
  "\u0142": "l", "\u0111": "d", "\u00F8": "o", "\u0127": "h", "\u0131": "i"
});

/** The same spelling with every accent kept, for patterns marked `accents: "keep"`. */
export function normalizeKeepingAccents(text: string): string {
  return foldCommon(text.normalize("NFKC").toLowerCase().normalize("NFC"));
}

/**
 * Cyrillic letters drawn like Latin ones, written as the Latin letter on both sides (question and
 * phrase list alike), so "kіll myself" typed with a Cyrillic і is still "kill myself". Russian,
 * Ukrainian and Bulgarian lists are folded the same way, so they still match their own text.
 */
const LATIN_LOOKALIKE: Readonly<Record<string, string>> = Object.freeze({
  "\u0430": "a", "\u0435": "e", "\u043E": "o", "\u0440": "p", "\u0441": "c", "\u0445": "x", "\u0443": "y", "\u0456": "i", "\u0458": "j", "\u0455": "s", "\u0501": "d", "\u04BB": "h", "\u04CF": "l"
});

const LEET: Readonly<Record<string, string>> = Object.freeze({ 0: "o", 1: "i", 3: "e", 4: "a", 5: "s", 7: "t" });

function foldCommon(text: string): string {
  return text
    // Invisible characters (zero-width space and joiners, soft hyphen, word joiner, BOM) are
    // removed, not spaced: "ki\u200Bll" is "kill".
    .replace(/[\u200B-\u200D\u2060\uFEFF\u00AD]/gu, "")
    .replace(/[\u0430\u0435\u043E\u0440\u0441\u0445\u0443\u0456\u0458\u0455\u0501\u04BB\u04CF]/gu, (letter) => LATIN_LOOKALIKE[letter] ?? letter)
    .replace(/[\u2018\u2019\u02BC`\u00B4]/gu, "'")
    // A digit typed inside a Latin word for the letter it looks like: "k1ll", "d1e", "sh0uld".
    .replace(/(?<=[a-z])[013457]+(?=[a-z])/gu, (digits) => digits.replace(/[013457]/gu, (digit) => LEET[digit] ?? digit))
    .replace(/\s+/gu, " ")
    .trim();
}

type CompiledPattern = Readonly<{
  signal: CrisisSignal;
  language: string;
  pattern: RegExp;
  keepAccents: boolean;
}>;

/** A lexicon pattern is written in plain spelling; it is normalised exactly as questions are. */
export function compileCrisisPattern(source: string, accents?: "keep"): RegExp {
  const spelled = accents === "keep" ? normalizeKeepingAccents(source) : normalizeForCrisisCheck(source);
  return new RegExp(spelled.replaceAll(String.raw`\b`, WORD_EDGE), "u");
}

function compile(lexicons: readonly CrisisLexicon[]): readonly CompiledPattern[] {
  return Object.freeze(lexicons.flatMap((lexicon) => lexicon.patterns.map((entry) => Object.freeze({
    signal: entry.signal,
    language: lexicon.language,
    pattern: compileCrisisPattern(entry.pattern, entry.accents),
    keepAccents: entry.accents === "keep"
  }))));
}

const COMPILED = compile(CRISIS_LEXICONS);

/**
 * Every language's list is tried whatever the interface language is: people write in the
 * language they think in, not the one the menu is set to.
 */
export function detectCrisis(text: string): CrisisCheck {
  const normalized = normalizeForCrisisCheck(text);
  if (normalized.length === 0) return Object.freeze({ crisis: false });
  const accented = normalizeKeepingAccents(text);
  for (const entry of COMPILED) {
    if (entry.pattern.test(entry.keepAccents ? accented : normalized)) {
      return Object.freeze({ crisis: true, signal: entry.signal, language: entry.language });
    }
  }
  return Object.freeze({ crisis: false });
}

// V8 compiles a pattern separately for one-byte (Latin-1) and two-byte text: warm both.
const WARM_SAMPLES = Object.freeze([
  normalizeForCrisisCheck("warm up the crisis check before anyone needs it ".repeat(15)),
  normalizeKeepingAccents("warm up the crisis check before anyone needs it \u0219 ".repeat(15))
]);
let warmedThrough = 0;

/**
 * The first check compiles about 1,500 patterns, and V8 runs each through its interpreter before
 * compiling it to native code: close to a second on the first question, then a few milliseconds.
 * Warming moves that cost off the critical path. Resumable: pass `keepGoing`, which is asked
 * before each pattern (a browser's idle deadline), and call again until it answers `true`. With
 * no argument it warms everything at once (the API, at start).
 */
export function warmCrisisCheck(keepGoing: () => boolean = () => true): boolean {
  while (warmedThrough < COMPILED.length && keepGoing()) {
    const pattern = COMPILED[warmedThrough]!.pattern;
    for (const sample of WARM_SAMPLES) {
      pattern.test(sample);
      pattern.test(sample);
    }
    warmedThrough += 1;
  }
  return warmedThrough >= COMPILED.length;
}
