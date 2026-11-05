// tests/unit/v4-clarify-place.test.ts
// V4 start step, Task 76d (owner answers Q4 and Q5 of 4 Nov; read-d3, read-f22, r2-5): an answer's sentence in the question box is the
// small AI's own sentence ("I mean the next 25 years.") when version 2 wrote one; a typed "Other…" answer, or an answer with no
// sentence, keeps today's pair ("Over what time? 2040."). The care question's sentences say "What I care about is: …". The site's
// country is put first among the place question's answers by code, never ticked: Romania on the Romanian site, the visitor's country
// elsewhere, named in the question's language. Data is made up.
import { describe, expect, it } from "vitest";
import type { ClarifyQuestion } from "@debateai/contract";
import { answerSentenceOf, purposeLinesOfGoal } from "../../apps/ui/lib/v4/askText.js";
import { siteCountryOf, withSiteCountryFirst } from "../../apps/ui/lib/v4/clarifyPlace.js";
import { EMPTY_GOAL } from "../../apps/ui/lib/v4/types.js";

const WHEN: ClarifyQuestion = { text: "Over what time?", answers: ["The next 25 years", "Until 2030"],
  sentences: ["I mean the next 25 years.", "I mean until 2030."] };
const CARES: ClarifyQuestion = { text: "What do you care about most?", answers: ["Keeping bills low", "Keeping the lights on", "Less harm to the climate"],
  sentences: ["What I care about is: keeping bills low.", "What I care about is: keeping the lights on.", "What I care about is: less harm to the climate."] };
const WHERE: ClarifyQuestion = { text: "Which region?", answers: ["Transylvania", "Dobruja"], sentences: ["I mean Transylvania.", "I mean Dobruja."],
  about_place: true };
const ROMANIA = { code: "RO", name: "Romania" } as const;

describe("answerSentenceOf (Q5, read-f22)", () => {
  it("an offered answer with the AI's sentence: that sentence; a typed 'Other…' answer: today's pair", () => {
    expect(answerSentenceOf(WHEN, { question: WHEN.text, answer: "The next 25 years", other: false })).toBe("I mean the next 25 years.");
    expect(answerSentenceOf(WHEN, { question: WHEN.text, answer: "2040", other: true })).toBe("Over what time? 2040.");
  });

  it("no sentence written (version 1, until it is sealed): today's pair, as the stored lines say it", () => {
    const v1: ClarifyQuestion = { text: WHEN.text, answers: [...WHEN.answers] };
    expect(answerSentenceOf(v1, { question: v1.text, answer: "Until 2030", other: false })).toBe("Over what time? Until 2030.");
    // An "Other…" typed with the very words of an offered answer is still the person's own: the pair.
    expect(answerSentenceOf(WHEN, { question: WHEN.text, answer: "Until 2030", other: true })).toBe("Over what time? Until 2030.");
  });

  it("the care question (Q4): a tap gives 'What I care about is: …'; typed words keep the pair; both travel as {question, answer}", () => {
    const tapped = { question: CARES.text, answer: "Keeping bills low", other: false };
    const typed = { question: CARES.text, answer: "Lower bills", other: true };
    expect(answerSentenceOf(CARES, tapped)).toBe("What I care about is: keeping bills low.");
    expect(answerSentenceOf(CARES, typed)).toBe("What do you care about most? Lower bills.");
    expect(purposeLinesOfGoal({ ...EMPTY_GOAL, answers: [tapped] })).toEqual({ answers: [{ question: "What do you care about most?", answer: "Keeping bills low" }] });
  });
});

describe("withSiteCountryFirst (r2-5)", () => {
  it("puts the site's country first on the place question when the AI left it out, with the pair as its sentence, and ticks nothing", () => {
    const shown = withSiteCountryFirst(WHERE, ROMANIA);
    expect(shown.answers).toEqual(["Romania", "Transylvania", "Dobruja"]);
    expect(shown.sentences).toEqual(["Which region? Romania.", "I mean Transylvania.", "I mean Dobruja."]);
    expect(shown.about_place).toBe(true);
    expect(answerSentenceOf(shown, { question: shown.text, answer: "Romania", other: false })).toBe("Which region? Romania.");
    // Never in the person's answers: the question is all that changes, and the AI's own question is left as it was.
    expect(WHERE.answers).toEqual(["Transylvania", "Dobruja"]);
    expect(purposeLinesOfGoal(EMPTY_GOAL)).toBeUndefined();
  });

  it("an answer that already names the country (case and accents aside) keeps the AI's order; no sentences: none are made", () => {
    const named: ClarifyQuestion = { ...WHERE, answers: ["Transylvania", "romania"], sentences: ["I mean Transylvania.", "I mean all of Romania."] };
    expect(withSiteCountryFirst(named, ROMANIA)).toBe(named);
    expect(withSiteCountryFirst(named, { code: "RO", name: "România" })).toBe(named);
    const v1: ClarifyQuestion = { text: "Where?", answers: ["Cluj", "Iași"], about_place: true };
    expect(withSiteCountryFirst(v1, ROMANIA)).toEqual({ text: "Where?", answers: ["Romania", "Cluj", "Iași"], about_place: true });
  });

  it("a question that does not ask where, or no country known: as it is", () => {
    expect(withSiteCountryFirst(WHEN, ROMANIA)).toBe(WHEN);
    expect(withSiteCountryFirst(CARES, ROMANIA)).toBe(CARES);
    expect(withSiteCountryFirst(WHERE, null)).toBe(WHERE);
  });
});

describe("siteCountryOf (r2-5)", () => {
  it("the Romanian site: Romania, whatever the visitor's country, named in the question's language", () => {
    expect(siteCountryOf({ locale: "ro", countryHint: "DE", questionLanguage: "ro" })).toEqual({ code: "RO", name: "România" });
    expect(siteCountryOf({ locale: "ro", countryHint: null, questionLanguage: "en" })).toEqual({ code: "RO", name: "Romania" });
  });

  it("elsewhere: the visitor's country from the edge's hint; no hint, or one no language can name: none", () => {
    expect(siteCountryOf({ locale: "en", countryHint: "DE", questionLanguage: "en" })).toEqual({ code: "DE", name: "Germany" });
    expect(siteCountryOf({ locale: "de", countryHint: "DE", questionLanguage: "de" })).toEqual({ code: "DE", name: "Deutschland" });
    expect(siteCountryOf({ locale: "en", countryHint: null, questionLanguage: "en" })).toBeNull();
    expect(siteCountryOf({ locale: "en", countryHint: "de", questionLanguage: "en" })).toBeNull();
    expect(siteCountryOf({ locale: "en", countryHint: "QQ", questionLanguage: "en" })).toBeNull();
  });
});
