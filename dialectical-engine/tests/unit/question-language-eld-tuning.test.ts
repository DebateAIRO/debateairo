import { describe, expect, it } from "vitest";
import { SITE_LANGUAGES_ELD_LACKS, loadEldReader } from "../../apps/api/src/question-language/eld.js";
import { ELD_CONFUSED_SITES, ELD_SITE_ALIASES, ELD_TUNING, eldConfident, eldSeesMix } from "../../apps/api/src/question-language/eld-tuning.js";
import {
  LEGAL_LOCALES, excludedLines, legalSentences, mixedQuestions, nonProseReason, proseSentences, pureControls, withoutDiacritics
} from "../../tools/question-language-tune/legal-sentences.js";
import {
  chooseEldTuning, chooseSegmentMinLetters, confusedSites, siteConfusions, type EldMixRow, type EldTuningRow
} from "../../tools/question-language-tune/measure-eld.js";

const row = (over: Partial<EldTuningRow>): EldTuningRow => ({ size: "medium", minLetters: 20, sentences: 20_000, settlesOwnSite: 10_000,
  wrongLockable: 0, wrongLockableRoEn: 0, roPlainSettles: 500, roPlainWrong: 0, ...over });
const mixRow = (over: Partial<EldMixRow>): EldMixRow => ({ segmentMinLetters: 20, joins: 1000, mixCaught: 900, pure: 20_000, pureFlagged: 100, ...over });

describe("eld's confidence, tuned on the legal-page set (question-language spec 2026-10-13)", () => {
  it("the choice rule: no ro/en confusion, at most 0.05% wrong-lockable, then the most questions settled", () => {
    expect(chooseEldTuning([row({ settlesOwnSite: 12_000, wrongLockableRoEn: 1 }), row({ settlesOwnSite: 11_000 })])?.settlesOwnSite).toBe(11_000);
    expect(chooseEldTuning([row({ settlesOwnSite: 12_000, wrongLockable: 11 }), row({ settlesOwnSite: 11_000, wrongLockable: 10 })])?.settlesOwnSite).toBe(11_000);
    expect(chooseEldTuning([row({ size: "large" }), row({ size: "small", minLetters: 30 }), row({ size: "small", minLetters: 12 })]))
      .toMatchObject({ size: "small", minLetters: 12 });
    expect(chooseEldTuning([row({ roPlainWrong: 1 })])).toBeNull();
  });

  it("the recorded configuration still holds on the set (a floor to keep, not a target)", async () => {
    const reader = await loadEldReader(ELD_TUNING.database);
    let sentences = 0;
    let wrongLockable = 0;
    let roEn = 0;
    for (const locale of LEGAL_LOCALES) {
      for (const sentence of proseSentences(locale)) {   // ruling L-TUNE: question-like prose only
        sentences += 1;
        const reading = reader.read(sentence);
        if (!eldConfident(reading) || reading.code === locale || !LEGAL_LOCALES.includes(reading.code!)) continue;
        if (SITE_LANGUAGES_ELD_LACKS.includes(locale)) continue;   // PF-L10: counted by siteConfusions instead
        wrongLockable += 1;
        if ((locale === "ro" && reading.code === "en") || (locale === "en" && reading.code === "ro")) roEn += 1;
      }
    }
    expect(LEGAL_LOCALES).toHaveLength(35);
    expect(sentences).toBe(ELD_TUNING.measured.sentences);
    expect(roEn).toBe(0);
    expect(wrongLockable).toBeLessThanOrEqual(ELD_TUNING.measured.wrongLockable);
    for (const sentence of proseSentences("ro")) {
      const reading = reader.read(withoutDiacritics(sentence));
      if (eldConfident(reading)) expect(reading.code, sentence.slice(0, 40)).toBe("ro");
    }
  }, 120_000);

  it("CR-2: the recorded confused sites are exactly the sites the set confuses at the chosen configuration", async () => {
    expect(confusedSites({ ro: { en: 0 }, hr: { sl: 2 }, en: {} })).toEqual(["hr"]);
    expect(ELD_CONFUSED_SITES).toEqual(confusedSites(await siteConfusions(ELD_TUNING.database, ELD_TUNING.minLetters)));
    for (const site of ELD_CONFUSED_SITES) expect(LEGAL_LOCALES).toContain(site);
  }, 120_000);

  it("L-MIX: the clause choice rule — at most 5% of pure questions flagged, then the most mixes caught, then the longer minimum", () => {
    expect(chooseSegmentMinLetters([mixRow({ mixCaught: 990, pureFlagged: 1001 }), mixRow({ segmentMinLetters: 30, mixCaught: 950 })])?.segmentMinLetters).toBe(30);
    expect(chooseSegmentMinLetters([mixRow({ segmentMinLetters: 12 }), mixRow({ segmentMinLetters: 30 })])?.segmentMinLetters).toBe(30);
    expect(chooseSegmentMinLetters([mixRow({ pureFlagged: 1001 })])).toBeNull();
  });

  it("L-MIX: the recorded clause numbers hold on the built mixed set and the pure controls (exact; eld is deterministic)", async () => {
    const reader = await loadEldReader(ELD_TUNING.database);
    const joins = mixedQuestions();
    const pure = pureControls();
    expect(joins.length).toBe(ELD_TUNING.measuredMix.joins);
    expect(pure.length).toBe(ELD_TUNING.measuredMix.pure);
    expect(joins.filter((question) => eldSeesMix(reader.read(question.text))).length).toBe(ELD_TUNING.measuredMix.mixCaught);
    expect(pure.filter((question) => eldSeesMix(reader.read(question.text))).length).toBe(ELD_TUNING.measuredMix.pureFlagged);
    expect(ELD_TUNING.measuredMix.pureFlagged * 20).toBeLessThanOrEqual(ELD_TUNING.measuredMix.pure);
  }, 120_000);

  it("L-MIX: the practice cases — a Romanian question with an English clause is a mix; borrowed words are not", async () => {
    const reader = await loadEldReader(ELD_TUNING.database);
    expect(eldSeesMix(reader.read("Ar trebui România să adopte euro, or should it wait until wages catch up?"))).toBe(true);
    expect(eldSeesMix(reader.read("Merită să lucrez la un startup de AI în loc de o corporație?"))).toBe(false);
    expect(eldSeesMix(reader.read("Should Romania adopt the euro before 2030?"))).toBe(false);
  });

  it("aliases exist only for the site languages eld lacks, and never name one of our other site languages", () => {
    expect(Object.keys(ELD_SITE_ALIASES).sort()).toEqual(["ga", "id", "mt"]);
    expect(ELD_SITE_ALIASES.id).toContain("ms");
    for (const aliases of Object.values(ELD_SITE_ALIASES)) for (const alias of aliases) expect(LEGAL_LOCALES).not.toContain(alias);
  });

  it("L-TUNE: the set measures question-like prose; the left-out lines are listed, never silently dropped", () => {
    expect(nonProseReason("support@dezbatere.ro · DMS Merchandise Shop S.R.L., Str.")).toBe("email");
    expect(nonProseReason("Our Privacy Policy at dezbatere.ro/privacy explains how we handle personal data.")).toBe("url");
    expect(nonProseReason("80A, Piatra Neamț, Romania, Trade Register J2022000426271, CUI 45935221.")).toBe("digits");
    expect(nonProseReason("Complaints may be made to the Office of the Australian Information Commissioner.")).toBeNull();
    expect(nonProseReason("Should Romania adopt the euro before 2030, and what happens to the S.R.L. companies?")).toBeNull();
    const all = LEGAL_LOCALES.reduce((sum, locale) => sum + legalSentences(locale).length, 0);
    const prose = LEGAL_LOCALES.reduce((sum, locale) => sum + proseSentences(locale).length, 0);
    expect(prose).toBe(ELD_TUNING.measured.sentences);
    expect(excludedLines()).toHaveLength(all - prose);
  });

  it("L-TUNE: eld settles only on its plain-word reading — names, brands and codes never decide the language", async () => {
    const reader = await loadEldReader(ELD_TUNING.database);
    const reading = reader.read("Should Apple and OpenAI sell the iPhone 17 in România?");
    expect(reading.letters).toBe(18);   // "Should and sell the in": the names, the brand and the number never count
    expect(eldConfident(reading)).toBe(false);
    expect(reader.read("support@dezbatere.ro · DMS Merchandise Shop S.R.L., Str.").letters).toBeLessThan(ELD_TUNING.minLetters);
  });
});
