import type { EldDatabaseSize, EldReading, EldSegmentReading } from "./eld.js";

/**
 * eld's confidence as measured on the legal-page set (#158; tools/question-language-tune/measure-eld.ts, run on
 * 2026-10-14). Ruling L-TUNE: only the set's question-like prose is measured (lines with an email address, a URL, or
 * more than 20% digits are left out: 1,518 of 17,862), and eld settles only on its plain-word reading (eld.ts `read`:
 * the plain words of every clause, read together; names, brands and codes never decide). Confident = isReliable() AND
 * at least `minLetters` plain letters. Chosen by chooseEldTuning: no Romanian/English confusion, no
 * Romanian-without-diacritics sentence read as anything else, at most one sentence in two thousand readable as another of our
 * languages, then the most questions settled with no fast call.
 *
 * size    minLetters sentences settlesOwnSite wrongLockable wrongLockableRoEn roPlainSettles roPlainWrong
 * small    0         16344     14758          23            0                 518            0
 * small   12         16344     14752          22            0                 518            0
 * small   20         16344     14637          20            0                 518            0
 * small   30         16344     13947          18            0                 505            0
 * small   40         16344     12510          11            0                 463            0
 * medium   0         16344     14762          20            0                 518            0
 * medium  12         16344     14756          19            0                 518            0
 * medium  20         16344     14640          17            0                 518            0
 * medium  30         16344     13950          15            0                 505            0
 * medium  40         16344     12513           8            0                 463            0
 * large    0         16344     14771          12            0                 518            0
 * large   12         16344     14765          11            0                 518            0
 * large   20         16344     14649          10            0                 518            0
 * large   30         16344     13959           8            0                 505            0   <- chosen (bar: 8)
 * large   40         16344     12519           5            0                 463            0
 *
 * The large database costs about 138 MB resident in the API (medium about 71 MB, small about 54 MB).
 *
 * Measured at the chosen configuration on 2026-10-14 (kept as a record, never asserted: the set is read from the live
 * Terms and Privacy text, which the owners edit; whole-branch review I-2): 16,344 prose sentences, 13,959 settled on
 * their own site, 8 wrong-lockable, 0 Romanian/English. The unit test asserts the bars in ELD_TUNING_BARS instead.
 */
export const ELD_TUNING = Object.freeze({
  database: "large" as EldDatabaseSize,
  minLetters: 30,
  // Ruling L-MIX: a clause is a confident reading with at least this many letters of plain words (chooseSegmentMinLetters).
  segmentMinLetters: 12,
  // Measured on 2026-10-14 (a record, not asserted; see above):
  // segmentMinLetters joins mixCaught pure  pureFlagged
  // 12                1036  1032      16862 322   <- chosen (at most 5% flagged, then the most caught)
  // 20                1036   988      16862 151
  // 30                1036   818      16862  34
  // 40                1036   500      16862   4
  // joins = the built RO+EN / EN+RO set, pure = every prose legal sentence + RO without diacritics.
});

/**
 * The bars the tuning promises, as rates, so an edit to the legal text cannot break them by moving a count
 * (whole-branch review I-2). chooseEldTuning and chooseSegmentMinLetters (tools/question-language-tune/measure-eld.ts)
 * choose by the first two; the unit test re-measures the set and asserts all three at the chosen configuration.
 * - wrongLockableOneIn: at most one prose sentence in this many is read confidently as another of our languages
 *   (measured 8 in 16,344), and never Romanian as English or English as Romanian;
 * - pureFlaggedOneIn: at most one single-language question in this many is seen as a mix (measured 322 in 16,862);
 * - mixCaughtMinPercent: at least this share of the built Romanian+English mixes is seen as a mix (measured 1,032 of
 *   1,036, 99.6%; the next clause minimum, 20 letters, caught 95.4%).
 */
export const ELD_TUNING_BARS = Object.freeze({ wrongLockableOneIn: 2000, pureFlaggedOneIn: 20, mixCaughtMinPercent: 99 });

/**
 * Only in the FALLBACK (fast AI down, or no paid AI): an eld reading that names one of these codes on the given site
 * reads as the site language. eld never SETTLES a site language it lacks (decide.ts). Kept: codes covering at least 5%
 * of the locale's confident readings, never one of our 35 and never a major language (ga: 19 confident readings,
 * yo 5, tl 2, is 1; en 4, cs/es/pt 2 and ro 1 dropped. mt: 33, ca 4; it 21, ro 3, cs 2, hr/lt 1 dropped, tl 1 under
 * 5%. id: 510, all ms).
 */
export const ELD_SITE_ALIASES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  ga: Object.freeze(["yo", "tl", "is"]),
  id: Object.freeze(["ms"]),
  mt: Object.freeze(["ca"])
});

/**
 * Ruling CR-2: our sites eld confidently named for another locale's sentence on the legal-page prose at the chosen
 * configuration (measured, sorted). The counts, by the sentence's locale: bg ru 1; cs ga 2, mt 2; en ga 4; es ga 2;
 * hr mt 1, sl 1; it mt 21; lt mt 1; pt es 1, ga 2; ro de 1, et 1, ga 1, hu 1, it 1, mt 3; ru uk 1.
 * On these sites the fast AI always checks (decide.ts FAST_CHECK_ALWAYS_SITES), even when eld names the site language.
 */
export const ELD_CONFUSED_SITES: readonly string[] = Object.freeze(["bg", "cs", "en", "es", "hr", "it", "lt", "pt", "ro", "ru"]);

export function eldConfident(reading: EldReading): boolean {
  return reading.code !== null && reading.reliable && reading.letters >= ELD_TUNING.minLetters;
}

/** Ruling L-MIX: one clause read confidently (its letters are plain words only: never names, brands or acronyms). */
export function eldSegmentConfident(segment: EldSegmentReading): boolean {
  return segment.code !== null && segment.reliable && segment.letters >= ELD_TUNING.segmentMinLetters;
}

/** Ruling L-MIX: eld sees a mix when at least two clauses read confidently as DIFFERENT languages. Then eld never settles. */
export function eldSeesMix(reading: EldReading): boolean {
  return new Set(reading.segments.filter(eldSegmentConfident).map((segment) => segment.code)).size >= 2;
}
