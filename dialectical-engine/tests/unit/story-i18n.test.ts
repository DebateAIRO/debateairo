import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Answer, AnswerStory } from "@debateai/contract";
import { CONDITION_MARKS } from "@debateai/kernel";
import { tPlural } from "../../apps/ui/lib/i18n/translate.js";
import { loadReportCatalogs, type ReportCatalogLoader } from "../../apps/ui/lib/report/reportLanguage.js";
import { buildReportModel } from "../../apps/ui/lib/report/reportModel.js";
import {
  STORY_FIXTURE_ANSWER,
  STORY_FIXTURE_DEBATE_ID,
  STORY_FIXTURE_POINT_NUMBERS,
  storyFixture,
  storyFixtureEdge,
  storyFixtureNode
} from "../../apps/ui/lib/v3/storyFixture.js";
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

/**
 * Fix round 1 (review, Important): the PDF's list of points printed the
 * engine's own record text ("Recorded strength 0.21 is at or below the ruled
 * hidden-node threshold"), dev's machinery labels ("Some judges could not
 * assess this point") and scores. The report now words a set-aside point and a
 * point's notes from its own plain keys, drops marks that only describe the
 * machinery, and never prints a record's reason.
 */
describe("the report's list of points speaks to the person too (fix round 1)", () => {
  const load: ReportCatalogLoader = async (locale, namespace) => catalog(locale, namespace);
  const ENGINE_REASON = "Recorded strength 0.21 is at or below the ruled hidden-node threshold of 0.25 (register v1).";

  /** A condition-mark record as the answer carries one, for the marked point only. */
  function record(mark: "HIDDEN-UNJUDGEABLE" | "HIDDEN-LOW-SCORE"): Answer["condition_mark_records"][number] {
    return {
      mark, scope: "node", subject_ref: "n-marked", reason: ENGINE_REASON, lift_path: null, served_root_rule: null,
      call_site_key: null, planned_leg_count: null, terminal_transport_outcome: null, review_outcome: null,
      hidden_strength: 0.21, hidden_score_threshold: 0.25, hidden_score_threshold_source_ref: "register:v1",
      excluded_from_served_number: true, judged_basis_count: null, affected_node_ids: ["n-marked"]
    };
  }

  /** The fixture plus one point that carries every condition mark there is, and both hidden-node records. */
  function markedAnswer(records: readonly ("HIDDEN-UNJUDGEABLE" | "HIDDEN-LOW-SCORE")[]): Answer {
    const marked = storyFixtureNode({
      id: "n-marked", claim: "Un punct marcat.", way: "LOOKED_UP", base: 0.5, final: null,
      maker: "OpenAI", review: null, locator: "o sursă", marks: [...CONDITION_MARKS]
    });
    return {
      ...STORY_FIXTURE_ANSWER,
      nodes: [...STORY_FIXTURE_ANSWER.nodes, marked],
      edges: [...STORY_FIXTURE_ANSWER.edges, storyFixtureEdge({ from: "n-marked", to: "n-hybrid", relation: "attack", strength: 0.2 })],
      condition_mark_records: records.map(record)
    };
  }

  async function entryFor(answer: Answer, locale: string) {
    const story = storyFixture("READY");
    story.point_numbers = { ...STORY_FIXTURE_POINT_NUMBERS, "n-marked": "P9" };
    const model = buildReportModel(answer, story, new Date("2026-09-26T12:00:00.000Z"), await loadReportCatalogs({ questionTag: locale, interfaceLocale: "en", load }));
    const entry = model.appendix.entries.find((item) => item.number === "P9");
    if (entry === undefined) throw new Error("P9 missing");
    return entry;
  }

  /** Every fixed English phrase the old list of points could print: dev's mark labels and hidden-node lines. */
  const englishEngineCopy = [
    ...Object.entries(catalog("en", "debateChrome")).filter(([key]) => key.startsWith("debateChrome.condition.")).map(([, value]) => value),
    ...Object.entries(catalog("en", "compose")).filter(([key]) => key.startsWith("compose.v3.hidden.")).map(([, value]) => value.split("{")[0]!.trim()),
    ...Object.entries(catalog("en", "public")).filter(([key]) => key.startsWith("public.report.point.")).map(([, value]) => value.split("{")[0]!.trim())
  ].filter((phrase) => phrase.length > 3);

  it("prints a point carrying every mark and both hidden records with no engine word, no score and no English (Romanian)", async () => {
    const entry = await entryFor(markedAnswer(["HIDDEN-UNJUDGEABLE", "HIDDEN-LOW-SCORE"]), "ro");
    const printed = [entry.stance, entry.strength, entry.wayOfKnowing, entry.author, entry.review, entry.setAsideLine, entry.notesLine]
      .filter((line): line is string => line !== null).join("\n");
    expect(engineWordsIn(printed, [...STORY_ENGINE_WORDS.en, ...STORY_ENGINE_WORDS.ro])).toEqual([]);
    expect(printed).not.toMatch(/(?<![\p{N}])0[.,][0-9]/u);
    expect(printed).not.toContain("Recorded strength");
    expect(englishEngineCopy.filter((phrase) => printed.includes(phrase))).toEqual([]);
    for (const retired of ["Lăsat deoparte:", "Mențiuni:", "Ramură", "evaluatori", "pragul", "punctaj"]) expect(printed).not.toContain(retired);
    // The one set-aside line (the strongest reason wins) and the few notes a reader can use, in plain Romanian.
    // A point only one model could weigh says so, and not also that fewer models than usual could (round 2).
    expect(entry.setAsideLine).toBe(catalog("ro", "public")["public.report.point.setAsideUnweighed"]);
    expect(entry.notesLine).toBe([
      "public.report.point.noteOneModel", "public.report.point.noteSourceUnconfirmed",
      "public.report.point.noteOutdated", "public.report.point.noteFigureRemoved"
    ].map((key) => catalog("ro", "public")[key]).join(" "));
  });

  it("words each set-aside reason plainly, and never prints the record's own reason", async () => {
    const ro = catalog("ro", "public");
    expect((await entryFor(markedAnswer(["HIDDEN-LOW-SCORE"]), "ro")).setAsideLine).toBe(ro["public.report.point.setAsideWeak"]);
    const english = await entryFor(markedAnswer(["HIDDEN-LOW-SCORE"]), "en");
    expect(english.setAsideLine).toBe("Left out of the conclusion: it was too weak to count.");
    expect(JSON.stringify(english)).not.toContain(ENGINE_REASON.slice(0, 20));
  });

  it("says a point the debate did not follow further carried little weight, never that it was left out (round 2)", async () => {
    // BRANCH-FROZEN-LOW-LEVERAGE: the point still counts; the debate only did not follow it further.
    expect((await entryFor(markedAnswer([]), "ro")).setAsideLine).toBe("Nu a cântărit în concluzie: nu ar fi putut schimba răspunsul.");
    expect((await entryFor(markedAnswer([]), "en")).setAsideLine)
      .toBe("Carried little weight in the conclusion: it could not have changed the answer.");
  });

  it("says only one model could weigh a point whose panel fell to one voice (round 2)", async () => {
    const one = (marks: Answer["nodes"][number]["condition_marks"]): Answer => ({
      ...STORY_FIXTURE_ANSWER,
      nodes: [...STORY_FIXTURE_ANSWER.nodes, storyFixtureNode({
        id: "n-marked", claim: "Un punct.", way: "REASONING", base: 0.5, final: 0.5, maker: "OpenAI", review: null, locator: null, marks
      })]
    });
    expect((await entryFor(one(["PANEL-DEGRADED-SINGLE-VOICE"]), "ro")).notesLine).toBe("Un singur model AI a putut cântări acest punct.");
    expect((await entryFor(one(["PANEL-DEGRADED-SINGLE-VOICE"]), "en")).notesLine).toBe("Only one AI model could weigh this point.");
    expect((await entryFor(one(["PANEL-PARTIAL"]), "en")).notesLine).toBe("Fewer AI models than usual could weigh it.");
  });

  it("prints no notes line for a point whose marks only describe the machinery", async () => {
    const machinery = storyFixtureNode({
      id: "n-marked", claim: "Un punct.", way: "REASONING", base: 0.5, final: 0.5, maker: "OpenAI", review: null, locator: null,
      marks: ["SKIPPED-BY-BUDGET", "ENVELOPE_EXHAUSTED", "LEVERAGE_UNRESOLVED", "DIGEST-COMPRESSED", "UNDER-EXPLORED", "SYNTHESIS-OBJECTION-STANDING"]
    });
    const answer: Answer = { ...STORY_FIXTURE_ANSWER, nodes: [...STORY_FIXTURE_ANSWER.nodes, machinery] };
    const entry = await entryFor(answer, "ro");
    expect([entry.setAsideLine, entry.notesLine]).toEqual([null, null]);
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
