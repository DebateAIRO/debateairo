import { LEGAL_LOCALES, excludedLines, mixedQuestions, proseSentences, pureControls, withoutDiacritics } from "./legal-sentences.js";
import {
  ELD_LANGUAGES, SITE_LANGUAGES_ELD_LACKS, loadEldReader, type EldDatabaseSize, type EldReading
} from "../../apps/api/src/question-language/eld.js";
import { ELD_TUNING_BARS } from "../../apps/api/src/question-language/eld-tuning.js";

export type EldTuningRow = Readonly<{ size: EldDatabaseSize; minLetters: number; sentences: number;
  settlesOwnSite: number; wrongLockable: number; wrongLockableRoEn: number; roPlainSettles: number; roPlainWrong: number }>;

const confidentAt = (minLetters: number) => (reading: EldReading): boolean =>
  reading.code !== null && reading.reliable && reading.letters >= minLetters;

export async function measureEld(sizes: readonly EldDatabaseSize[], minLetters: readonly number[]): Promise<readonly EldTuningRow[]> {
  const rows: EldTuningRow[] = [];
  const corpus = LEGAL_LOCALES.map((locale) => [locale, proseSentences(locale)] as const);
  const roPlain = proseSentences("ro").map(withoutDiacritics);
  for (const size of sizes) {
    const reader = await loadEldReader(size);
    const readings = corpus.map(([locale, sentences]) => [locale, sentences.map((sentence) => reader.read(sentence))] as const);
    const plainReadings = roPlain.map((sentence) => reader.read(sentence));
    for (const min of minLetters) {
      const confident = confidentAt(min);
      let sentences = 0, settlesOwnSite = 0, wrongLockable = 0, wrongLockableRoEn = 0;
      for (const [locale, list] of readings) {
        for (const reading of list) {
          sentences += 1;
          if (!confident(reading)) continue;
          if (reading.code === locale) settlesOwnSite += 1;
          else if (LEGAL_LOCALES.includes(reading.code!) && !SITE_LANGUAGES_ELD_LACKS.includes(locale)) {   // PF-L10
            wrongLockable += 1;
            if ((locale === "ro" && reading.code === "en") || (locale === "en" && reading.code === "ro")) wrongLockableRoEn += 1;
          }
        }
      }
      const roPlainSettles = plainReadings.filter((reading) => confident(reading) && reading.code === "ro").length;
      const roPlainWrong = plainReadings.filter((reading) => confident(reading) && reading.code !== "ro").length;
      rows.push(Object.freeze({ size, minLetters: min, sentences, settlesOwnSite, wrongLockable, wrongLockableRoEn, roPlainSettles, roPlainWrong }));
    }
  }
  return Object.freeze(rows);
}

const SIZE_ORDER: readonly EldDatabaseSize[] = ["small", "medium", "large"];

export function chooseEldTuning(rows: readonly EldTuningRow[]): EldTuningRow | null {
  const safe = rows.filter((row) => row.wrongLockableRoEn === 0 && row.roPlainWrong === 0 && row.wrongLockable * ELD_TUNING_BARS.wrongLockableOneIn <= row.sentences);
  if (safe.length === 0) return null;
  return [...safe].sort((a, b) => b.settlesOwnSite - a.settlesOwnSite
    || SIZE_ORDER.indexOf(a.size) - SIZE_ORDER.indexOf(b.size) || a.minLetters - b.minLetters)[0]!;
}

/** For each site language eld lacks: the eld codes (not ours) it confidently names on that locale's sentences, most first. */
export async function siteAliasCandidates(size: EldDatabaseSize, minLetters: number): Promise<Readonly<Record<string, readonly string[]>>> {
  const reader = await loadEldReader(size);
  const confident = confidentAt(minLetters);
  const out: Record<string, readonly string[]> = {};
  for (const locale of ["ga", "id", "mt"]) {
    const counts = new Map<string, number>();
    for (const sentence of proseSentences(locale)) {
      const reading = reader.read(sentence);
      if (confident(reading) && ELD_LANGUAGES.includes(reading.code!) && !LEGAL_LOCALES.includes(reading.code!)) {
        counts.set(reading.code!, (counts.get(reading.code!) ?? 0) + 1);
      }
    }
    out[locale] = Object.freeze([...counts].sort((a, b) => b[1] - a[1]).map(([code]) => code));
  }
  return Object.freeze(out);
}

/**
 * For the alias rule (keep a code only when it covers at least 5% of the locale's confident readings): every confident
 * reading of the ga, id and mt sentences by code, ours included, with the total.
 */
export async function siteAliasCounts(size: EldDatabaseSize, minLetters: number):
  Promise<Readonly<Record<string, Readonly<{ confident: number; byCode: Readonly<Record<string, number>> }>>>> {
  const reader = await loadEldReader(size);
  const confident = confidentAt(minLetters);
  return Object.freeze(Object.fromEntries(SITE_LANGUAGES_ELD_LACKS.map((locale) => {
    const counts = new Map<string, number>();
    for (const sentence of proseSentences(locale)) {
      const reading = reader.read(sentence);
      if (confident(reading)) counts.set(reading.code!, (counts.get(reading.code!) ?? 0) + 1);
    }
    const byCode = Object.freeze(Object.fromEntries([...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))));
    return [locale, Object.freeze({ confident: [...counts.values()].reduce((sum, count) => sum + count, 0), byCode })];
  })));
}

/** CR-2: per site S, the confident readings naming S on another legal locale's sentences, by that locale (and the Romanian set without diacritics). */
export async function siteConfusions(size: EldDatabaseSize, minLetters: number): Promise<Readonly<Record<string, Readonly<Record<string, number>>>>> {
  const reader = await loadEldReader(size);
  const confident = confidentAt(minLetters);
  const out: Record<string, Record<string, number>> = Object.fromEntries(LEGAL_LOCALES.map((site) => [site, {}]));
  const note = (from: string, sentence: string): void => {
    const reading = reader.read(sentence);
    if (!confident(reading) || reading.code === from.split("-")[0] || !LEGAL_LOCALES.includes(reading.code!)) return;
    out[reading.code!]![from] = (out[reading.code!]![from] ?? 0) + 1;
  };
  for (const locale of LEGAL_LOCALES) for (const sentence of proseSentences(locale)) note(locale, sentence);
  for (const sentence of proseSentences("ro")) note("ro-plain", withoutDiacritics(sentence));
  return Object.freeze(Object.fromEntries(Object.entries(out).map(([site, from]) => [site, Object.freeze(from)])));
}

export function confusedSites(confusions: Readonly<Record<string, Readonly<Record<string, number>>>>): readonly string[] {
  return Object.freeze(Object.entries(confusions).filter(([, from]) => Object.values(from).some((count) => count > 0)).map(([site]) => site).sort());
}

/** Ruling L-MIX: per clause minimum, how many built mixes eld sees as a mix and how many pure questions it flags. */
export type EldMixRow = Readonly<{ segmentMinLetters: number; joins: number; mixCaught: number; pure: number; pureFlagged: number }>;

export async function measureEldMix(size: EldDatabaseSize, segmentMinLetters: readonly number[]): Promise<readonly EldMixRow[]> {
  const reader = await loadEldReader(size);
  const joins = mixedQuestions().map((question) => reader.read(question.text));
  const pure = pureControls().map((question) => reader.read(question.text));
  return Object.freeze(segmentMinLetters.map((min) => {
    const seesMix = (reading: EldReading): boolean => new Set(reading.segments
      .filter((segment) => segment.code !== null && segment.reliable && segment.letters >= min)
      .map((segment) => segment.code)).size >= 2;
    return Object.freeze({ segmentMinLetters: min, joins: joins.length, mixCaught: joins.filter(seesMix).length,
      pure: pure.length, pureFlagged: pure.filter(seesMix).length });
  }));
}

export function chooseSegmentMinLetters(rows: readonly EldMixRow[]): EldMixRow | null {
  const safe = rows.filter((row) => row.pureFlagged * ELD_TUNING_BARS.pureFlaggedOneIn <= row.pure);
  if (safe.length === 0) return null;
  return [...safe].sort((a, b) => b.mixCaught - a.mixCaught || b.segmentMinLetters - a.segmentMinLetters)[0]!;
}

/**
 * For the report (not a choice input): per locale at one configuration, how the sentences fall. `settles` names the
 * locale itself; `wrongLock` confidently names ANOTHER of our 35 (for ga, id and mt every such reading is a neighbour,
 * see siteConfusions); `outside` confidently names a language outside our 35; `unsure` is not confident; `falseMix` is
 * a single-language sentence eld sees as a mix at `segmentMinLetters` (ruling L-MIX). "ro-plain" is Romanian without
 * diacritics. `eldOnly` settles with no fast call on a site that is not always-ask: confident, its own language, no mix.
 */
export type EldLocaleRow = Readonly<{ locale: string; sentences: number; settles: number; wrongLock: number; outside: number;
  unsure: number; falseMix: number; eldOnly: number }>;

export async function measureEldByLocale(size: EldDatabaseSize, minLetters: number, segmentMinLetters: number): Promise<readonly EldLocaleRow[]> {
  const reader = await loadEldReader(size);
  const confident = confidentAt(minLetters);
  const sets = [...LEGAL_LOCALES.map((locale) => [locale, proseSentences(locale)] as const),
    ["ro-plain", proseSentences("ro").map(withoutDiacritics)] as const];
  return Object.freeze(sets.map(([locale, list]) => {
    const own = locale.split("-")[0]!;
    let settles = 0, wrongLock = 0, outside = 0, unsure = 0, falseMix = 0, eldOnly = 0;
    for (const sentence of list) {
      const reading = reader.read(sentence);
      const mix = new Set(reading.segments.filter((segment) => segment.code !== null && segment.reliable && segment.letters >= segmentMinLetters)
        .map((segment) => segment.code)).size >= 2;
      if (mix) falseMix += 1;
      if (!confident(reading)) unsure += 1;
      else if (reading.code === own) { settles += 1; if (!mix) eldOnly += 1; }
      else if (LEGAL_LOCALES.includes(reading.code!)) wrongLock += 1;
      else outside += 1;
    }
    return Object.freeze({ locale, sentences: list.length, settles, wrongLock, outside, unsure, falseMix, eldOnly });
  }));
}

if (import.meta.url === `file://${process.argv[1] ?? ""}`) {
  // Ruling L-TUNE: the non-prose lines left out of every figure below, per locale and reason, then each line.
  const excluded = excludedLines();
  console.table(LEGAL_LOCALES.map((locale) => ({ locale, ...Object.fromEntries((["email", "url", "digits"] as const)
    .map((reason) => [reason, excluded.filter((line) => line.locale === locale && line.reason === reason).length])) })));
  for (const line of excluded) console.log(`EXCLUDED\t${line.locale}\t${line.reason}\t${line.text}`);
  const rows = await measureEld(["small", "medium", "large"], [0, 12, 20, 30, 40]);
  console.table(rows);
  const chosen = chooseEldTuning(rows);
  console.log(JSON.stringify({ chosen }, null, 2));
  if (chosen !== null) {
    console.log(JSON.stringify(await siteAliasCandidates(chosen.size, chosen.minLetters), null, 2));
    console.log(JSON.stringify({ aliasCounts: await siteAliasCounts(chosen.size, chosen.minLetters) }, null, 2));
    const confusions = await siteConfusions(chosen.size, chosen.minLetters);
    console.log(JSON.stringify({ confusions, confusedSites: confusedSites(confusions) }, null, 2));
    const mixRows = await measureEldMix(chosen.size, [12, 20, 30, 40]);
    console.table(mixRows);
    const chosenMix = chooseSegmentMinLetters(mixRows);
    console.log(JSON.stringify({ chosenMix }, null, 2));
    // The report's per-locale table, at the chosen clause minimum (or 40 when none is chosen).
    console.table(await measureEldByLocale(chosen.size, chosen.minLetters, chosenMix?.segmentMinLetters ?? 40));
  }
}
