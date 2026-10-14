import { exhaustive } from "@debateai/kernel";

/**
 * eld (Efficient Language Detector) 2.1.0, Apache-2.0, pure JavaScript, no dependencies (question-language spec
 * 2026-10-13, ruling L2): the free, local first look at a question. It runs over its whole 60-language set. It is
 * never restricted to our 35, because a restricted eld would force an outside question (Catalan, Malay) into one of
 * ours. Our rule restricts by itself: eld only ever SETTLES a question when its top language equals the person's
 * site language (decide.ts).
 */
export const ELD_LANGUAGES: readonly string[] = Object.freeze([
  "am", "ar", "az", "be", "bg", "bn", "ca", "cs", "da", "de", "el", "en", "es", "et", "eu", "fa", "fi", "fr", "gu", "he",
  "hi", "hr", "hu", "hy", "is", "it", "ja", "ka", "kn", "ko", "ku", "lo", "lt", "lv", "ml", "mr", "ms", "nl", "no", "or",
  "pa", "pl", "pt", "ro", "ru", "sk", "sl", "sq", "sr", "sv", "ta", "te", "th", "tl", "tr", "uk", "ur", "vi", "yo", "zh"
]);
/** Our site languages eld cannot name: on these sites the fast AI always checks (the spec's default). */
export const SITE_LANGUAGES_ELD_LACKS: readonly string[] = Object.freeze(["ga", "id", "mt"]);

export type EldDatabaseSize = "small" | "medium" | "large";
export type EldSegmentReading = Readonly<{ code: string | null; reliable: boolean; letters: number }>;
/** The whole question's reading, and one reading per clause that has plain words (ruling L-MIX). */
export type EldReading = Readonly<{ code: string | null; reliable: boolean; letters: number; segments: readonly EldSegmentReading[] }>;
export interface EldReader {
  read(text: string): EldReading;
  languages(): readonly string[];
}

// eld's own declaration (apps/api/node_modules/eld/index.d.ts): info() names its languages under "Languages",
// a record keyed by number (pre-flight PF-L6).
type EldDetector = Readonly<{
  detect(text: string): Readonly<{ language: string; isReliable(): boolean }>;
  info(): Readonly<{ Languages?: Readonly<Record<number, string>> }>;
}>;

/**
 * Ruling L-MIX: where a question is cut into clauses. At every . ! ? ; : , and their full-width forms, at a dash
 * with a space on each side (hyphen, en dash, em dash), at ( and ), and at line breaks.
 */
const CLAUSE_BREAK = /[.!?;:,。！？；：，、()\n\r]+|\s[-–—]\s/u;

/** Ruling L-MIX: the clauses eld also reads, each trimmed, empty ones dropped; no mark at all is one clause. */
export function questionSegments(text: string): readonly string[] {
  return Object.freeze(text.split(CLAUSE_BREAK).map((piece) => piece.trim()).filter((piece) => piece !== ""));
}

/**
 * Ruling L-MIX: the clause without names, brands, acronyms and anything with a digit. A word counts only when it
 * has a letter, no digit, nothing inside but letters, combining marks, an apostrophe or a hyphen, and no upper- or
 * title-case letter except as the very first character of the clause's first word. A caseless script counts whole.
 */
export function plainWordsOf(segment: string): string {
  const words = segment.split(/\s+/u).map((word) => word.replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu, ""));
  return words.filter((word, index) => /\p{L}/u.test(word)
    && /^[\p{L}\p{M}'’-]+$/u.test(word)
    && !/[\p{Lu}\p{Lt}]/u.test(index === 0 ? word.slice(1) : word)).join(" ");
}

async function eldModule(size: EldDatabaseSize): Promise<EldDetector> {
  // Static entry points: the database ships inside the package, so nothing is fetched or written at run time.
  switch (size) {
    case "small": return (await import("eld/small")).eld as unknown as EldDetector;
    case "medium": return (await import("eld/medium")).eld as unknown as EldDetector;
    case "large": return (await import("eld/large")).eld as unknown as EldDetector;
    default: return exhaustive(size);
  }
}

const letterCount = (text: string): number => text.match(/\p{L}/gu)?.length ?? 0;

/** Loaded once at the API's boot, and only when the debate shape row is present (eld's memory: 54–138 MB). */
export async function loadEldReader(size: EldDatabaseSize): Promise<EldReader> {
  const detector = await eldModule(size);
  const readOne = (text: string, letters: number): EldSegmentReading => {
    const result = detector.detect(text);
    const code = typeof result.language === "string" && result.language !== "" ? result.language : null;
    return Object.freeze({ code, reliable: code !== null && result.isReliable(), letters });
  };
  return Object.freeze({
    read(text: string): EldReading {
      const letters = letterCount(text);
      if (letters === 0) return Object.freeze({ code: null, reliable: false, letters, segments: Object.freeze([]) });
      const whole = readOne(text, letters);
      const segments = questionSegments(text).flatMap((segment) => {
        const plain = plainWordsOf(segment);
        const plainLetters = letterCount(plain);
        return plainLetters === 0 ? [] : [readOne(plain, plainLetters)];
      });
      return Object.freeze({ ...whole, segments: Object.freeze(segments) });
    },
    languages(): readonly string[] {
      return Object.freeze(Object.values(detector.info().Languages ?? {}).map(String));
    }
  });
}
