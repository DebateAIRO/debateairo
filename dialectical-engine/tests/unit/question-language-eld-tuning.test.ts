import { describe, expect, it } from "vitest";
import { SITE_LANGUAGES_ELD_LACKS, loadEldReader } from "../../apps/api/src/question-language/eld.js";
import {
  ELD_CONFUSED_SITES, ELD_SITE_ALIASES, ELD_TUNING, ELD_TUNING_BARS, eldConfident, eldSeesMix
} from "../../apps/api/src/question-language/eld-tuning.js";
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

  // Whole-branch review I-2: the set is read from the live Terms and Privacy text, which the owners edit, so the tests
  // below assert the RATES the tuning promises (ELD_TUNING_BARS), never a count measured on 2026-10-14 (those stay as
  // comments in eld-tuning.ts). A tuning that no longer meets its own bars still fails here.
  it("the chosen configuration meets its bars on the set: no ro/en confusion, at most one wrong-lockable sentence in 2,000", async () => {
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
    // Precondition: a set large enough for the rate to mean something (16,344 sentences on 2026-10-14).
    expect(sentences).toBeGreaterThanOrEqual(ELD_TUNING_BARS.wrongLockableOneIn);
    expect(roEn).toBe(0);
    expect(wrongLockable * ELD_TUNING_BARS.wrongLockableOneIn).toBeLessThanOrEqual(sentences);
    // Precondition first: the set has Romanian prose, and eld is confident on some of it, so the loop cannot pass by
    // reading nothing. Each sentence is then asserted (a reading that is not confident claims nothing: it stands as "ro").
    const roClaims = proseSentences("ro").map((sentence) => {
      const reading = reader.read(withoutDiacritics(sentence));
      return { sentence, confident: eldConfident(reading), code: reading.code };
    });
    expect(roClaims.length).toBeGreaterThan(0);
    expect(roClaims.filter((claim) => claim.confident).length).toBeGreaterThan(0);
    for (const claim of roClaims) expect(claim.confident ? claim.code : "ro", claim.sentence.slice(0, 40)).toBe("ro");
  });

  // Whole-branch review I-2: a site the set no longer confuses may stay listed (it only costs a fast check); a site the
  // set confuses that is NOT listed would let eld settle it alone, so that is what must never happen.
  it("CR-2: every site the set confuses at the chosen configuration is a recorded always-check site", async () => {
    expect(confusedSites({ ro: { en: 0 }, hr: { sl: 2 }, en: {} })).toEqual(["hr"]);
    const confused = confusedSites(await siteConfusions(ELD_TUNING.database, ELD_TUNING.minLetters));
    expect(confused.length).toBeGreaterThan(0);
    for (const site of confused) expect(ELD_CONFUSED_SITES, site).toContain(site);
    for (const site of ELD_CONFUSED_SITES) expect(LEGAL_LOCALES).toContain(site);
  });

  it("L-MIX: the clause choice rule — at most 5% of pure questions flagged, then the most mixes caught, then the longer minimum", () => {
    expect(chooseSegmentMinLetters([mixRow({ mixCaught: 990, pureFlagged: 1001 }), mixRow({ segmentMinLetters: 30, mixCaught: 950 })])?.segmentMinLetters).toBe(30);
    expect(chooseSegmentMinLetters([mixRow({ segmentMinLetters: 12 }), mixRow({ segmentMinLetters: 30 })])?.segmentMinLetters).toBe(30);
    expect(chooseSegmentMinLetters([mixRow({ pureFlagged: 1001 })])).toBeNull();
  });

  it("L-MIX: the chosen clause minimum meets its bars on the built mixed set and the pure controls", async () => {
    const reader = await loadEldReader(ELD_TUNING.database);
    const joins = mixedQuestions();
    const pure = pureControls();
    // Preconditions: both sets are there (1,036 joins and 16,862 pure questions on 2026-10-14).
    expect(joins.length).toBeGreaterThanOrEqual(100);
    expect(pure.length).toBeGreaterThanOrEqual(ELD_TUNING_BARS.pureFlaggedOneIn);
    const caught = joins.filter((question) => eldSeesMix(reader.read(question.text))).length;
    const flagged = pure.filter((question) => eldSeesMix(reader.read(question.text))).length;
    expect(caught * 100).toBeGreaterThanOrEqual(joins.length * ELD_TUNING_BARS.mixCaughtMinPercent);
    expect(flagged * ELD_TUNING_BARS.pureFlaggedOneIn).toBeLessThanOrEqual(pure.length);
  });

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
    expect(prose).toBeGreaterThan(0);
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
