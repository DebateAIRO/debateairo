import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { AnswerStory } from "@debateai/contract";
import { tPlural } from "../../apps/ui/lib/i18n/translate.js";
import { STORY_FIXTURE_ANSWER, STORY_FIXTURE_DEBATE_ID, storyFixture } from "../../apps/ui/lib/v3/storyFixture.js";
import { toStoryView } from "../../apps/ui/lib/v3/storyView.js";
import { morePathsWords, storyFateWords, storyLabelWords } from "../../apps/ui/lib/v3/storyWords.js";

/**
 * R2 (spec 2026-09-26 §14.2, §14.3): every fixed string around the verdict
 * story is a catalogue key, worded in plain words, and the story's fixed text
 * is read from the catalogue of the QUESTION's locale.
 */

const MESSAGES = resolve(process.cwd(), "apps/ui/messages");
const catalog = (locale: string, namespace: string): Record<string, string> =>
  JSON.parse(readFileSync(resolve(MESSAGES, locale, `${namespace}.json`), "utf8")) as Record<string, string>;
const en = catalog("en", "public");
const ro = catalog("ro", "public");
const pl = catalog("pl", "public");

/** Every key R2 added: the story's words, the report's words and the language offer's. */
const STORY_KEY = /^(?:public\.story\.|public\.report\.|chrome\.languageOffer\.)/u;
const storyEntries = (locale: string): [string, string][] => [
  ...Object.entries(catalog(locale, "public")),
  ...Object.entries(catalog(locale, "chrome"))
].filter(([key]) => STORY_KEY.test(key));

/**
 * The engine's own vocabulary, which no fixed string the person reads may use
 * (the owner's rule, "no internals in anything the user reads"; R2 addendum).
 * The English words, then the Romanian words for the same machinery. Matched
 * as whole words, case-insensitive, so "checked" and "de acord" stay free.
 */
const STORY_ENGINE_WORDS = Object.freeze({
  en: ["reviewer", "reviewers", "evaluator", "checker", "checkers", "runner-up", "rung", "the engine", "judge", "judges",
    "margin", "band", "threshold", "score", "scores", "verdict rule"],
  ro: ["recenzent", "evaluator", "verificator", "verificatorul", "arbitru", "judecător", "judecătorii", "motorul",
    "prag", "pragul", "marjă", "marja", "scor", "scorul", "regula verdictului"]
});

/** The ban-list words are letters, spaces and hyphens only, none of which is special in a pattern outside a class. */
function engineWordsIn(text: string, words: readonly string[]): string[] {
  return words.filter((word) => new RegExp(`(?<![\\p{L}\\p{N}-])${word}(?![\\p{L}\\p{N}-])`, "iu").test(text));
}

describe("the story's fixed words speak to the person, never about the engine (R2 addendum)", () => {
  it("finds the words it bans (control)", () => {
    expect(engineWordsIn("The reviewer's note", STORY_ENGINE_WORDS.en)).toEqual(["reviewer"]);
    expect(engineWordsIn("ahead of the runner-up by a margin", STORY_ENGINE_WORDS.en)).toEqual(["runner-up", "margin"]);
    expect(engineWordsIn("Nota verificatorului: scorul e sub prag", STORY_ENGINE_WORDS.ro)).toEqual(["prag", "scorul"]);
    expect(engineWordsIn("A second AI model checked it", STORY_ENGINE_WORDS.en)).toEqual([]);
  });

  it("keeps every English and Romanian story, report and offer value free of engine words", () => {
    const english = storyEntries("en");
    const romanian = storyEntries("ro");
    expect(english.length).toBeGreaterThan(60);
    expect(romanian.length).toBe(english.length + 1); // Romanian has a third plural form ("few").
    const found = [
      ...english.flatMap(([key, value]) => engineWordsIn(value, STORY_ENGINE_WORDS.en).map((word) => `en ${key}: ${word}`)),
      ...romanian.flatMap(([key, value]) => engineWordsIn(value, [...STORY_ENGINE_WORDS.en, ...STORY_ENGINE_WORDS.ro])
        .map((word) => `ro ${key}: ${word}`))
    ];
    expect(found).toEqual([]);
  });

  it("uses no English value as Romanian: the owner reviews in Romanian", () => {
    const romanian = new Map(storyEntries("ro"));
    const copied = storyEntries("en").filter(([key, value]) => romanian.get(key) === value).map(([key]) => key);
    expect(copied).toEqual([]);
  });

  it("carries every story key in all 35 locales (English copies until R3 translates them)", () => {
    const locales = readdirSync(MESSAGES, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    expect(locales).toHaveLength(35);
    const keysOf = (locale: string) => storyEntries(locale).map(([key]) => key.replace(/\.(zero|one|two|few|many|other)$/u, ".#")).sort();
    const expected = [...new Set(keysOf("en"))];
    for (const locale of locales) expect([...new Set(keysOf(locale))], locale).toEqual(expected);
  });

  it("drops the retired engine-worded copy", () => {
    const all = JSON.stringify(storyEntries("en"));
    for (const retired of ["Reviewer's note", "Our checker's reservation", "It does not change the verdict", "a reviewer disputed a point", "How this verdict was computed"]) {
      expect(all).not.toContain(retired);
    }
  });
});

describe("label, fate and plural words come from the catalogue handed in", () => {
  it("words each label as the owner approved, in English and in Romanian", () => {
    expect(["SUPPORTED", "CONTESTED", "UNSUPPORTED"].map((label) => storyLabelWords(label as never, en)))
      .toEqual(["Clear answer", "Close call", "Best guess, weak evidence"]);
    expect(["SUPPORTED", "CONTESTED", "UNSUPPORTED"].map((label) => storyLabelWords(label as never, ro)))
      .toEqual(["Răspuns clar", "Decizie strânsă", "Cea mai bună presupunere, dovezi slabe"]);
  });

  it("words each fate from the catalogue", () => {
    expect(["HELD_UP", "PARTLY_HELD", "FELL", "SET_ASIDE"].map((fate) => storyFateWords(fate as never, en)))
      .toEqual(["Held up", "Partly held", "Fell", "Set aside"]);
    expect(storyFateWords("FELL", ro)).toBe("Nu a rezistat");
  });

  it("says 'and N more' as a plural in the catalogue's locale", () => {
    expect(morePathsWords(0, en, "en")).toBeNull();
    expect(morePathsWords(-1, en, "en")).toBeNull();
    expect(morePathsWords(1, en, "en")).toBe("and 1 more");
    expect(morePathsWords(4, en, "en")).toBe("and 4 more");
    expect(morePathsWords(1, ro, "ro")).toBe("și încă 1 poziție");
    expect(morePathsWords(5, ro, "ro")).toBe("și încă 5 poziții");
    expect(morePathsWords(20, ro, "ro")).toBe("și încă 20 de poziții");
  });

  it("gives Polish its four plural forms and picks the right one", () => {
    expect(Object.keys(pl).filter((key) => key.startsWith("public.story.morePaths.")).sort())
      .toEqual(["one", "few", "many", "other"].map((category) => `public.story.morePaths.${category}`).sort());
    const probe = {
      "public.story.morePaths.one": "ONE {count}",
      "public.story.morePaths.few": "FEW {count}",
      "public.story.morePaths.many": "MANY {count}",
      "public.story.morePaths.other": "OTHER {count}"
    };
    expect([1, 3, 5, 22, 25].map((count) => morePathsWords(count, probe, "pl")))
      .toEqual(["ONE 1", "FEW 3", "MANY 5", "FEW 22", "MANY 25"]);
    // The real Polish catalogue answers every count (English copies until R3).
    for (const count of [1, 3, 5]) expect(tPlural(pl, "public.story.morePaths", count, "pl")).toBe(`and ${count} more`);
  });
});

describe("toStoryView holds data, never words (R2, spec §14.2)", () => {
  const view = (status: AnswerStory["status"], locale = "ro") =>
    toStoryView(STORY_FIXTURE_ANSWER, storyFixture(status), STORY_FIXTURE_DEBATE_ID, locale);

  it("carries the arithmetic label and the storyteller's confidence sentence", () => {
    const ready = view("READY");
    expect(ready.label).toBe("CONTESTED");
    expect(ready.verdictState).toBe("contested");
    expect(ready.confidence).toBe(storyFixture("READY").story!.short.confidence);
  });

  it("shows no confidence sentence with no story", () => {
    expect(view("WRITING").confidence).toBeNull();
    expect(view("UNAVAILABLE").confidence).toBeNull();
    expect(toStoryView(STORY_FIXTURE_ANSWER, null, STORY_FIXTURE_DEBATE_ID, "ro").confidence).toBeNull();
  });

  it("marks the reservation for READY_WITH_RESERVATION only, and never carries the checker's text", () => {
    expect(view("READY_WITH_RESERVATION").reservation).toBe(true);
    for (const status of ["READY", "WRITING", "UNAVAILABLE"] as const) expect(view(status).reservation).toBe(false);
    const checkerText = storyFixture("READY_WITH_RESERVATION").reservation!;
    expect(JSON.stringify(view("READY_WITH_RESERVATION"))).not.toContain(checkerText.slice(0, 20));
  });

  it("offers the PDF only in a language the report can print, and says so otherwise", () => {
    expect(view("READY", "ro")).toMatchObject({ pdfHref: `/debate/${STORY_FIXTURE_DEBATE_ID}/report`, reportUnsupported: false });
    expect(view("READY", "ru")).toMatchObject({ pdfHref: null, reportUnsupported: true });
    expect(view("WRITING", "ru")).toMatchObject({ pdfHref: null, reportUnsupported: false });
  });

  it("holds no fixed English words at all", () => {
    const text = JSON.stringify([view("READY"), view("READY_WITH_RESERVATION"), view("WRITING"), view("UNAVAILABLE")]);
    for (const english of ["Contested", "Close call", "Confidence", "Partly held", "Fell", "Writing", "available"]) {
      expect(text).not.toContain(english);
    }
  });
});
