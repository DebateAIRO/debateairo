import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { PLAN_TIER_ROSTERS, type Answer, type AnswerStory } from "@debateai/contract";
import { numberPoints } from "../../apps/ui/lib/report/pointNumbers.js";
import {
  REPORT_UNPRINTABLE_LOCALES,
  loadReportCatalogs,
  reportSupportedForLocale,
  type ReportCatalogLoader,
  type ReportCatalogs
} from "../../apps/ui/lib/report/reportLanguage.js";
import { buildReportModel, reportPageWords, reportWordPieces, type ReportModel, type ReportSpan } from "../../apps/ui/lib/report/reportModel.js";
import { LOCALES } from "../../apps/ui/lib/i18n/locales.js";
import composeEnglish from "../../apps/ui/messages/en/compose.json" with { type: "json" };
import {
  STORY_FIXTURE_ANSWER,
  STORY_FIXTURE_POINT_NUMBERS,
  storyFixture,
  storyFixtureEdge,
  storyFixtureNode
} from "../../apps/ui/lib/v3/storyFixture.js";

const GENERATED = new Date("2026-09-26T12:00:00.000Z");

/** The message files, read as the report route's loadNamespace reads them. */
const loadFromFiles: ReportCatalogLoader = async (locale, namespace) =>
  JSON.parse(readFileSync(resolve(process.cwd(), "apps/ui/messages", locale, `${namespace}.json`), "utf8")) as Record<string, string>;

/** One message from a locale's catalogue, so a test never repeats catalogue copy. */
function message(locale: string, namespace: string, key: string): string {
  const value = (JSON.parse(readFileSync(resolve(process.cwd(), "apps/ui/messages", locale, `${namespace}.json`), "utf8")) as Record<string, string>)[key];
  if (value === undefined) throw new Error(`${locale}/${namespace} lacks ${key}`);
  return value;
}

let ROMANIAN: ReportCatalogs;
let ENGLISH: ReportCatalogs;
beforeAll(async () => {
  ROMANIAN = await loadReportCatalogs({ questionTag: "ro", interfaceLocale: "en", load: loadFromFiles });
  ENGLISH = await loadReportCatalogs({ questionTag: "en", interfaceLocale: "en", load: loadFromFiles });
});

/** The fixture's makers use the premium roster's models; read them, never repeat them. */
function rosterModel(prefix: string): string {
  const model = PLAN_TIER_ROSTERS.premium.find((id) => id.startsWith(prefix));
  if (model === undefined) throw new Error(`no premium model starts with ${prefix}`);
  return model;
}
const OPENAI = `OpenAI · ${rosterModel("gpt-")}`;
const ANTHROPIC = `Anthropic · ${rosterModel("claude-")}`;
const XAI = `xAI · ${rosterModel("grok-")}`;

function allText(model: ReportModel): string {
  return JSON.stringify(model);
}

function spanText(spans: readonly ReportSpan[]): string {
  return spans.map((span) => (span.kind === "text" ? span.text : span.label)).join("");
}

/** A 150-character address, the kind a model may copy into its text: no space to break at. */
const LONG_URL =
  "https://www.exemplu-imobiliare.ro/anunturi/inchiriere/cluj-napoca/apartamente-3-camere/zorilor?pret_min=2500&pret_max=4200&sortare=pret&pagina=12&id=9";

function allSpans(model: ReportModel): ReportSpan[] {
  return [
    ...model.inShort.paths.flatMap((path) => path.line.spans),
    ...model.sections.flatMap((section) => section.paragraphs.flatMap((item) => item.spans)),
    ...(model.reviewerNote === null ? [] : model.reviewerNote.paragraph.spans),
    ...model.why.reasons.flatMap((reason) => reason.spans),
    ...model.why.change.spans
  ];
}

/**
 * The top-level entries of the first `StyleSheet.create({ ... })` in `source`, name to body text, read by
 * brackets rather than by line, so a style written across several lines is still one entry. Comments
 * are dropped and strings are skipped, so neither can be mistaken for a style.
 */
function styleEntries(source: string): Map<string, string> {
  const open = source.indexOf("StyleSheet.create({");
  if (open < 0) throw new Error("no StyleSheet.create({ in the source");
  const entries = new Map<string, string>();
  let depth = 0;
  let entry = "";
  const finish = () => {
    const text = entry.trim();
    entry = "";
    if (text.length === 0) return;
    const colon = text.indexOf(":");
    entries.set(text.slice(0, colon).trim(), text.slice(colon + 1).trim());
  };
  for (let index = open + "StyleSheet.create(".length; index < source.length; index += 1) {
    const char = source[index]!;
    if (char === "/" && source[index + 1] === "/") {
      index = source.indexOf("\n", index) - 1;
      continue;
    }
    if (char === "/" && source[index + 1] === "*") {
      index = source.indexOf("*/", index) + 1;
      continue;
    }
    if (char === "\"" || char === "'" || char === "`") {
      const close = source.indexOf(char, index + 1);
      if (depth >= 1) entry += source.slice(index, close + 1);
      index = close;
      continue;
    }
    if (char === "{") {
      depth += 1;
      if (depth === 1) continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        finish();
        break;
      }
    }
    if (depth === 1 && char === ",") {
      finish();
      continue;
    }
    if (depth >= 1) entry += char;
  }
  return entries;
}

function answerWithPoints(roots: number, childrenPerRoot: number): Answer {
  const nodes: Answer["nodes"] = [];
  const edges: Answer["edges"] = [];
  for (let root = 0; root < roots; root += 1) {
    nodes.push(storyFixtureNode({
      id: `r${root}`, claim: `Poziția ${root + 1}.`, way: "REASONING", base: 0.5, final: 0.5,
      maker: "OpenAI", review: null, locator: null, marks: []
    }));
    for (let child = 0; child < childrenPerRoot; child += 1) {
      nodes.push(storyFixtureNode({
        id: `r${root}-c${child}`, claim: `Argumentul ${child + 1} pentru poziția ${root + 1}.`, way: "REASONING",
        base: 0.4, final: 0.4, maker: "Anthropic", review: null, locator: null, marks: []
      }));
      edges.push(storyFixtureEdge({ from: `r${root}-c${child}`, to: `r${root}`, relation: "support", strength: 0.4 }));
    }
  }
  return { ...STORY_FIXTURE_ANSWER, nodes, edges };
}

describe("point numbers (the story's P1…Pn)", () => {
  it("without the story's numbers, numbers the positions first, then the other points depth-first", () => {
    expect([...numberPoints(STORY_FIXTURE_ANSWER, null, composeEnglish)]).toEqual([
      ["n-yes", "P1"], ["n-not-now", "P2"], ["n-hybrid", "P3"],
      ["n-yes-pay", "P4"], ["n-yes-rent", "P5"], ["n-not-now-once", "P6"],
      ["n-hybrid-school", "P7"], ["n-hybrid-forum", "P8"]
    ]);
    expect(Object.fromEntries(numberPoints(STORY_FIXTURE_ANSWER, null, composeEnglish))).toEqual(STORY_FIXTURE_POINT_NUMBERS);
  });

  it("uses the story's own numbers when it has them, so a mention of P3 in the text matches the appendix", () => {
    const story = storyFixture("READY");
    story.point_numbers = {
      "n-hybrid": "P1", "n-yes": "P2", "n-not-now": "P3", "n-hybrid-school": "P4",
      "n-hybrid-forum": "P5", "n-yes-pay": "P6", "n-yes-rent": "P7", "n-not-now-once": "P8"
    };
    expect([...numberPoints(STORY_FIXTURE_ANSWER, story, composeEnglish)]).toEqual([
      ["n-hybrid", "P1"], ["n-yes", "P2"], ["n-not-now", "P3"], ["n-hybrid-school", "P4"],
      ["n-hybrid-forum", "P5"], ["n-yes-pay", "P6"], ["n-yes-rent", "P7"], ["n-not-now-once", "P8"]
    ]);
  });

  it("gives a node the story's numbers miss the next free number after the highest", () => {
    const story = storyFixture("READY");
    story.point_numbers = { "n-yes": "P2", "n-hybrid": "P9" };
    expect([...numberPoints(STORY_FIXTURE_ANSWER, story, composeEnglish)]).toEqual([
      ["n-yes", "P2"], ["n-hybrid", "P9"], ["n-not-now", "P10"], ["n-yes-pay", "P11"],
      ["n-yes-rent", "P12"], ["n-not-now-once", "P13"], ["n-hybrid-school", "P14"], ["n-hybrid-forum", "P15"]
    ]);
  });
});

describe("buildReportModel in the question's language (spec §10, §14.2, §14.3)", () => {
  let model: ReportModel;
  beforeAll(() => {
    model = buildReportModel(STORY_FIXTURE_ANSWER, storyFixture("READY_WITH_RESERVATION"), GENERATED, ROMANIAN);
  });
  const ro = (key: string) => message("ro", "public", key);
  /** A percentage as Romanian writes it: "66 %", with a no-break space, and a comma for decimals ("30,5 %"). */
  const pct = (value: number) => new Intl.NumberFormat("ro", { style: "percent", maximumFractionDigits: 2 }).format(value);

  it("prints every part title in Romanian, and no computed-verdict page at all", () => {
    expect([model.inShort.title, model.storyTitle, model.why.title, model.appendix.title, model.about.title]).toEqual([
      "Pe scurt", "Povestea completă", "De ce acest răspuns", "Punctele dezbaterii", "Despre acest raport"
    ]);
    expect(Object.keys(model)).not.toContain("computation");
    const text = JSON.stringify(model);
    for (const retired of ["How this verdict was computed", "runner-up", "tie margin", "rule 5", "MID_BAND", "0.64", "0.05", "0.70"]) {
      expect(text).not.toContain(retired);
    }
  });

  it("builds the cover from the question, the label in human words and the storyteller's confidence sentence", () => {
    expect(model.language).toBe("ro");
    expect(model.cover.eyebrow).toBe(ro("public.report.eyebrow"));
    expect(model.cover.question).toBe(STORY_FIXTURE_ANSWER.question_line);
    expect(model.cover.labelWords).toBe("Decizie strânsă");
    expect(model.cover.confidence).toBe(storyFixture("READY").story!.short.confidence);
    expect(model.cover.generatedLine).toBe("Generat pe 26 septembrie 2026 la 12:00 UTC");
    expect(model.cover.models).toEqual([OPENAI, ANTHROPIC, XAI]);
    expect(model.cover.modelsLine).toBe(`Modele care au participat: ${OPENAI}, ${ANTHROPIC}, ${XAI}`);
    expect(model.cover.disclosure).toBe("Acest raport a fost scris de modele AI pe baza argumentelor din dezbatere.");
  });

  it("carries the English disclosure line in the PDF's metadata, for machines, whatever the page's language", () => {
    expect(model.metadataSubject).toBe(message("en", "public", "public.report.disclosure"));
    expect(model.metadataSubject).toBe("This report was written by AI models from the debate's arguments.");
    expect(model.documentTitle).toBe(`Raportul dezbaterii: ${STORY_FIXTURE_ANSWER.question_line}`);
  });

  it("writes the footer and its page numbers in Romanian", () => {
    expect(model.footer.text).toBe("DebateAI · Raport generat de AI");
    expect(reportPageWords(model, 3, 12)).toBe("Pagina 3 din 12");
    expect(reportPageWords(buildReportModel(STORY_FIXTURE_ANSWER, storyFixture("READY"), GENERATED, ENGLISH), 3, 12)).toBe("Page 3 of 12");
  });

  it("puts the short version first, with Romanian fate words, and counts the rest as a Romanian plural", () => {
    expect(model.inShort.headline).toBe(storyFixture("READY").story!.short.headline);
    expect(model.inShort.paths.map((path) => path.fateWords)).toEqual(["A rezistat parțial", "A rezistat parțial", "Nu a rezistat"]);
    expect(model.inShort.morePaths).toBeNull();
    const unnumbered: AnswerStory = { ...storyFixture("READY"), point_numbers: null };
    expect(buildReportModel(answerWithPoints(10, 1), unnumbered, GENERATED, ROMANIAN).inShort.morePaths).toBe("și încă 7 poziții");
    expect(buildReportModel(answerWithPoints(25, 0), unnumbered, GENERATED, ROMANIAN).inShort.morePaths).toBe("și încă 22 de poziții");
  });

  it("adds \"Why this answer\": the story's reasons with their [Pn] citations, then what would change the answer", () => {
    const reasons = storyFixture("READY").story!.why.reasons;
    expect(model.why.reasons).toHaveLength(reasons.length);
    expect(model.why.reasons.map((reason) => spanText(reason.spans.filter((span) => span.kind === "text"))))
      .toEqual(reasons.map((reason) => reason.text));
    expect(model.why.reasons[0]!.spans.filter((span) => span.kind === "cite").map((span) => span.kind === "cite" ? span.label : ""))
      .toEqual(["P4", "P6"]);
    expect(model.why.changeLead).toBe("Ce ar schimba răspunsul");
    expect(spanText(model.why.change.spans.filter((span) => span.kind === "text"))).toBe(storyFixture("READY").story!.short.change.text);
    expect(model.why.change.spans.slice(1).map((span) => span.kind === "cite" ? span.label : "")).toEqual(["P3", "P5"]);
  });

  it("keeps every section title of the long story, in order, with its [Pn] citations", () => {
    expect(model.sections.map((section) => section.title))
      .toEqual(storyFixture("READY").story!.long.sections.map((section) => section.title));
    expect(model.storyIntro).toBe(ro("public.report.storyIntro"));
    expect(model.storyIntro).toContain("[P3]");
    const first = model.sections[0]!.paragraphs[0]!;
    expect(first.spans[0]).toEqual({ kind: "text", text: storyFixture("READY").story!.long.sections[0]!.paragraphs[0]!.text });
    expect(first.spans.slice(1)).toEqual([
      { kind: "cite", label: "P1", anchor: "point-P1" },
      { kind: "cite", label: "P3", anchor: "point-P3" }
    ]);
  });

  it("links a point number the story's own text names to its entry, and leaves any other text alone", () => {
    const story = storyFixture("READY");
    story.story!.long.sections[1]!.paragraphs[0]!.text = "Vezi P3 și P12, nu P0, MP3 sau P3a; [P5](https://example.org) rămâne text.";
    const linked = buildReportModel(STORY_FIXTURE_ANSWER, story, GENERATED, ROMANIAN);
    expect(linked.sections[1]!.paragraphs[0]!.spans).toEqual([
      { kind: "text", text: "Vezi " },
      { kind: "mention", label: "P3", anchor: "point-P3" },
      { kind: "text", text: " și P12, nu P0, MP3 sau P3a; [" },
      { kind: "mention", label: "P5", anchor: "point-P5" },
      { kind: "text", text: "](https://example.org) rămâne text." },
      { kind: "cite", label: "P3", anchor: "point-P3" },
      { kind: "cite", label: "P1", anchor: "point-P1" }
    ]);
    // Every link in the report is code-built and internal: an entry's anchor, never model output.
    for (const span of allSpans(linked)) {
      if (span.kind !== "text") expect(span.anchor).toMatch(/^point-P[1-9][0-9]*$/);
    }
  });

  it("boxes the note worth knowing, and prints the gentle line for a reservation, never the checker's text", () => {
    expect(model.reviewerNote?.title).toBe("De reținut");
    expect(spanText(model.reviewerNote!.paragraph.spans.filter((span) => span.kind === "text")))
      .toBe(storyFixture("READY").story!.reviewer_note!.text);
    expect(model.reservation).toBe("Unele părți ale acestui rezumat nu au putut fi verificate pe deplin.");
    const checker = storyFixture("READY_WITH_RESERVATION").reservation!;
    expect(JSON.stringify(model)).not.toContain(checker.slice(0, 25));
    expect(buildReportModel(STORY_FIXTURE_ANSWER, storyFixture("READY"), GENERATED, ROMANIAN).reservation).toBeNull();
  });

  it("keeps exactly five About rows: question, report generated, story written, written by, checked by", () => {
    expect(model.about.rows).toEqual([
      { label: "Întrebarea", value: STORY_FIXTURE_ANSWER.question_line },
      { label: "Raport generat", value: "26 septembrie 2026 la 12:00 UTC" },
      { label: "Povestea a fost scrisă", value: "26 septembrie 2026 la 09:31 UTC" },
      { label: "Scrisă de", value: OPENAI },
      { label: "Verificată de", value: ANTHROPIC }
    ]);
    const about = JSON.stringify(model.about);
    const story = storyFixture("READY");
    for (const dropped of [STORY_FIXTURE_ANSWER.answer_id, story.pack!.version, story.pack!.fingerprint.slice(0, 8), "personal-choice", "Rule"]) {
      expect(about).not.toContain(dropped);
    }
  });

  it("says 'not recorded' in Romanian for what the story did not record", () => {
    const bare: AnswerStory = { ...storyFixture("READY"), written_at: null, storyteller: null, checker: null };
    const rows = buildReportModel(STORY_FIXTURE_ANSWER, bare, GENERATED, ROMANIAN).about.rows;
    expect(rows.slice(2).map((row) => row.value)).toEqual(["Neînregistrat", "Neînregistrat", "Neînregistrat"]);
  });

  it("describes every point in the list, in number order, in Romanian and in plain words", () => {
    expect(model.appendix.intro).toBe(ro("public.report.pointsIntro"));
    expect(model.appendix.entries.map((entry) => entry.number)).toEqual(["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"]);
    const byNumber = new Map(model.appendix.entries.map((entry) => [entry.number, entry]));
    expect(byNumber.get("P1")).toMatchObject({
      stance: "Poziție",
      strength: `${pct(0.66)} luat separat → ${pct(0.58)} după cântărire`,
      wayOfKnowing: `Cum se știe: ${message("ro", "compose", "compose.v3.wayOfKnowing.reasoning")}`,
      author: `Scris de ${OPENAI}`
    });
    expect(byNumber.get("P2")?.review).toBe(`Un al doilea model AI (${OPENAI}) l-a verificat și nu a fost de acord. Costul mutării se plătește o singură dată, nu în fiecare an.`);
    expect(byNumber.get("P4")?.stance).toBe("Susține P1");
    expect(byNumber.get("P5")?.stance).toBe("Contestă P1");
    expect(byNumber.get("P7")?.review).toBe(`Un al doilea model AI (${XAI}) l-a verificat, dar nu s-a putut pronunța. Nu există date despre școala copiilor.`);
    expect(byNumber.get("P8")?.stance).toBe("Contestă P3");
    // The forum objection was not followed further: it still counts, with little weight (round 2).
    expect(byNumber.get("P8")?.setAsideLine).toBe("A cântărit puțin în concluzie: nu ar fi putut schimba răspunsul.");
    expect(byNumber.get("P8")?.review).toBe("Niciun al doilea model AI nu a verificat acest punct.");
    expect(byNumber.get("P1")?.setAsideLine).toBeNull();
  });

  it("does not call a point that argues about a link a position", () => {
    const undercut = storyFixtureNode({
      id: "n-under", claim: "Comparația de chirii nu spune nimic despre cartierele mai ieftine.", way: "REASONING",
      base: 0.4, final: 0.4, maker: "xAI", review: null, locator: null, marks: []
    });
    const onLink = { ...storyFixtureEdge({ from: "n-under", to: "n-yes", relation: "attack", strength: 0.4 }), target_kind: "EDGE" as const, target_ref: "edge:n-yes-rent:n-yes" };
    const answer: Answer = { ...STORY_FIXTURE_ANSWER, nodes: [...STORY_FIXTURE_ANSWER.nodes, undercut], edges: [...STORY_FIXTURE_ANSWER.edges, onLink] };
    const story = storyFixture("READY");
    story.point_numbers = { ...STORY_FIXTURE_POINT_NUMBERS, "n-under": "P9" };
    const entry = buildReportModel(answer, story, GENERATED, ROMANIAN).appendix.entries.find((item) => item.number === "P9");
    expect(entry?.stance).toBe("Contestă legătura dintre P5 și P1");
    const english = buildReportModel(answer, story, GENERATED, ENGLISH).appendix.entries.find((item) => item.number === "P9");
    expect(english?.stance).toBe("Challenges the link from P5 to P1");
  });

  it("prints a point's notes, an unrecorded author and a withheld strength in the report's language", () => {
    const marked = storyFixtureNode({
      id: "n-marked", claim: "Un punct marcat.", way: "REASONING", base: 0.305, final: null,
      maker: null, review: null, locator: null, marks: ["STALE", "UNDER-REVIEW"]
    });
    const entry = buildReportModel({ ...STORY_FIXTURE_ANSWER, nodes: [marked], edges: [] }, storyFixture("READY"), GENERATED, ROMANIAN);
    expect(entry.cover.modelsLine).toBe("Modele care au participat: neînregistrate");
    expect(entry.appendix.entries[0]).toMatchObject({
      strength: `${pct(0.305)} luat separat · după cântărire: neafișat`,
      author: "Modelul care l-a scris nu a fost înregistrat",
      // STALE says something about the point; UNDER-REVIEW only about the machinery, so it is left out.
      notesLine: ro("public.report.point.noteOutdated")
    });
  });

  it("lists every one of 150 points, numbered in order, each with its own anchor", () => {
    const unnumbered: AnswerStory = { ...storyFixture("READY"), point_numbers: null };
    const big = buildReportModel(answerWithPoints(10, 14), unnumbered, GENERATED, ENGLISH);
    expect(big.appendix.entries).toHaveLength(150);
    expect(big.appendix.entries.map((entry) => entry.number))
      .toEqual(Array.from({ length: 150 }, (_, index) => `P${index + 1}`));
    expect(new Set(big.appendix.entries.map((entry) => entry.anchor)).size).toBe(150);
    expect(big.appendix.entries[9]!.stance).toBe("Position");
    expect(big.appendix.entries[10]!.stance).toBe("Supports P1");
    expect(big.appendix.entries[24]!.stance).toBe("Supports P2");
    expect(big.inShort.morePaths).toBe("and 7 more");
  });

  it("prints no fixed English in a Romanian report: every fixed word is from the Romanian catalogue", () => {
    const english = JSON.stringify(buildReportModel(STORY_FIXTURE_ANSWER, storyFixture("READY_WITH_RESERVATION"), GENERATED, ENGLISH));
    const romanian = JSON.stringify(model);
    for (const phrase of ["In short", "The full story", "Why this answer", "Question", "Written by", "Checked by", "on its own", "Supports", "Position", "Page {page}", "Worth knowing", "What would change"]) {
      expect(english).toContain(phrase);
      expect(romanian).not.toContain(phrase);
    }
  });

  it("keeps the Romanian text intact", () => {
    expect(JSON.stringify(model)).toContain("„nu acum”");
  });

  it("is pure: the same input gives the same model, and the input is left as it was", () => {
    const story = storyFixture("READY_WITH_RESERVATION");
    const storyBefore = structuredClone(story);
    const answerBefore = structuredClone(STORY_FIXTURE_ANSWER);
    expect(buildReportModel(STORY_FIXTURE_ANSWER, story, GENERATED, ROMANIAN)).toEqual(buildReportModel(STORY_FIXTURE_ANSWER, story, GENERATED, ROMANIAN));
    expect(story).toEqual(storyBefore);
    expect(STORY_FIXTURE_ANSWER).toEqual(answerBefore);
  });

  it("refuses a story that is not ready", () => {
    expect(() => buildReportModel(STORY_FIXTURE_ANSWER, storyFixture("WRITING"), GENERATED, ROMANIAN)).toThrow("REPORT_STORY_NOT_READY");
    expect(() => buildReportModel(STORY_FIXTURE_ANSWER, storyFixture("UNAVAILABLE"), GENERATED, ROMANIAN)).toThrow("REPORT_STORY_NOT_READY");
    const empty: AnswerStory = { ...storyFixture("READY"), story: null };
    expect(() => buildReportModel(STORY_FIXTURE_ANSWER, empty, GENERATED, ROMANIAN)).toThrow("REPORT_STORY_NOT_READY");
  });
});

describe("the report's language (lib/report/reportLanguage.ts)", () => {
  it("prints the Latin, Cyrillic, Greek and Devanagari locales, and refuses the scripts it cannot print correctly yet", () => {
    const refused = LOCALES.map(({ code }) => code).filter((code) => !reportSupportedForLocale(code)).sort();
    expect(refused).toEqual(["ar", "he", "ja", "ko", "zh"]);
    expect([...REPORT_UNPRINTABLE_LOCALES].sort()).toEqual(refused);
    // One per script group: Latin (with and without diacritics, Vietnamese), Cyrillic, Greek, Devanagari.
    expect(["ro", "en", "vi", "pl", "tr", "ru", "bg", "uk", "el", "hi"].every(reportSupportedForLocale)).toBe(true);
  });

  it("loads the question's catalogues, and the English public catalogue for the metadata only", async () => {
    const calls: string[] = [];
    const load: ReportCatalogLoader = async (locale, namespace) => {
      calls.push(`${locale}/${namespace}`);
      return loadFromFiles(locale, namespace);
    };
    const catalogs = await loadReportCatalogs({ questionTag: "ro", interfaceLocale: "de", load });
    expect(catalogs.locale).toBe("ro");
    expect(calls.sort()).toEqual(["en/public", "ro/compose", "ro/public"]);
  });

  it("falls back to the interface locale for und and for an unknown tag", async () => {
    expect((await loadReportCatalogs({ questionTag: "und", interfaceLocale: "de", load: loadFromFiles })).locale).toBe("de");
    expect((await loadReportCatalogs({ questionTag: "tlh", interfaceLocale: "fr", load: loadFromFiles })).locale).toBe("fr");
    expect((await loadReportCatalogs({ questionTag: null, interfaceLocale: "en", load: loadFromFiles })).locale).toBe("en");
    expect((await loadReportCatalogs({ questionTag: "pt-BR", interfaceLocale: "en", load: loadFromFiles })).locale).toBe("pt");
  });

  it("refuses a question in a script the report cannot print, before loading anything", async () => {
    const load: ReportCatalogLoader = async () => { throw new Error("must not load"); };
    await expect(loadReportCatalogs({ questionTag: "ar", interfaceLocale: "en", load })).rejects.toThrow("REPORT_LOCALE_UNSUPPORTED");
    // und falls back to an interface locale the report cannot print either.
    await expect(loadReportCatalogs({ questionTag: "und", interfaceLocale: "ar", load })).rejects.toThrow("REPORT_LOCALE_UNSUPPORTED");
  });
});

describe("long unbroken words (reportWordPieces, used as the PDF's line-break rule)", () => {
  const graphemes = (text: string) => [...new Intl.Segmenter("und", { granularity: "grapheme" }).segment(text)].length;

  it("keeps every ordinary word whole, Romanian included", () => {
    for (const word of ["Chiriile", "încrederea", "două-trei", "0.25\u00A0→\u00A0Contested", "ș".repeat(30)]) {
      expect(reportWordPieces(word)).toEqual([word]);
    }
  });

  it("cuts a 150-character address after / ? & = - _ . and at least every 20 characters, losing nothing", () => {
    expect(LONG_URL).toHaveLength(150);
    const pieces = reportWordPieces(LONG_URL);
    expect(pieces.join("")).toBe(LONG_URL);
    expect(pieces.length).toBeGreaterThan(7);
    for (const piece of pieces) expect(graphemes(piece)).toBeLessThanOrEqual(20);
    expect(pieces.slice(0, 4)).toEqual(["https:/", "/", "www.", "exemplu-"]);
    // A word with no break character is cut every 20 characters, never inside a letter with its accent.
    expect(reportWordPieces("ș".repeat(45))).toEqual(["ș".repeat(20), "ș".repeat(20), "ș".repeat(5)]);
  });

  it("gives a long address in a story paragraph and in an appendix claim its break points", () => {
    const story = storyFixture("READY");
    story.story!.long.sections[0]!.paragraphs[0]!.text = `Anunțurile sunt aici: ${LONG_URL} și arată chirii mai mari.`;
    const answer: Answer = {
      ...STORY_FIXTURE_ANSWER,
      nodes: STORY_FIXTURE_ANSWER.nodes.map((node) => node.node_id === "n-yes-rent" ? { ...node, claim: `Vezi ${LONG_URL}` } : node)
    };
    const built = buildReportModel(answer, story, GENERATED, ROMANIAN);
    const longest = (text: string) => text.split(/\s+/u).reduce((a, b) => (b.length > a.length ? b : a), "");
    const paragraph = spanText(built.sections[0]!.paragraphs[0]!.spans);
    const claim = built.appendix.entries.find((entry) => entry.number === "P5")!.claim;
    for (const text of [paragraph, claim]) {
      const pieces = reportWordPieces(longest(text));
      expect(pieces.length).toBeGreaterThan(7);
      expect(Math.max(...pieces.map(graphemes))).toBeLessThanOrEqual(20);
    }
    // The model's text itself is untouched: nothing invisible is added, so a copied address still works.
    expect(paragraph).toContain(LONG_URL);
    expect(claim).toBe(`Vezi ${LONG_URL}`);
  });
});

describe("the PDF's text styles (apps/ui/lib/report/ReportDocument.tsx)", () => {
  const source = readFileSync(resolve(process.cwd(), "apps/ui/lib/report/ReportDocument.tsx"), "utf8");
  const styles = styleEntries(source);
  const lineHeightWithoutFontSize = (entries: ReadonlyMap<string, string>) =>
    [...entries].filter(([, body]) => /\blineHeight\s*:/u.test(body) && !/\bfontSize\s*:/u.test(body)).map(([name]) => name);

  it("reads the style object itself, whatever the line layout (control)", () => {
    const sample = [
      "const styles = StyleSheet.create({",
      "  // lineHeight in a comment is not a style",
      "  one: { fontSize: 9, lineHeight: 1.4 },",
      "  two: {",
      "    color: \"#000\",",
      "    lineHeight: 1.5",
      "  },",
      "  three: { label: \"a, b: { c }\" }",
      "});"
    ].join("\n");
    const entries = styleEntries(sample);
    expect([...entries.keys()]).toEqual(["one", "two", "three"]);
    expect(lineHeightWithoutFontSize(entries)).toEqual(["two"]);
  });

  it("sets no line height on the page, only on text styles", () => {
    // A Page-level lineHeight next to the page-number footer crashed 4.9.0 past ~15 pages (measured 2026-09-26).
    expect(styles.get("page")).toBeDefined();
    expect(styles.get("page")).not.toMatch(/\blineHeight\s*:/u);
  });

  it("gives every style that sets a line height its own font size", () => {
    // react-pdf resolves a unitless lineHeight against the fontSize of the SAME style (18 when absent),
    // so a bare lineHeight of 1.6 spaced 10.5pt body text 29pt apart (measured 2026-09-26).
    expect(styles.size).toBeGreaterThan(30);
    expect([...styles.values()].filter((body) => /\blineHeight\s*:/u.test(body)).length).toBeGreaterThan(10);
    expect(lineHeightWithoutFontSize(styles)).toEqual([]);
  });

  it("draws no computed-verdict page any more: its rule table and its styles are gone (R2)", () => {
    for (const retired of ["ruleRow", "ruleHead", "decision", "numberRow", "Computation"]) expect(source).not.toContain(retired);
    expect(source).toContain("function Why(");
    expect(source).toMatch(/subject=\{model\.metadataSubject\}/u);
    expect(source).toMatch(/language=\{model\.language\}/u);
  });

  it("uses the serif family for the fixed headings only", () => {
    expect([...styles].filter(([, body]) => body.includes("REPORT_FONT_SERIF")).map(([name]) => name)).toEqual(["heading"]);
    // The report's language adds its own faces (lib/report/reportFonts.ts): Fraunces first only in a Latin report.
    expect(source.match(/style=\{\[styles\.heading, look\.heading\]\}/gu)).toHaveLength(1);
    expect(source.match(/styles\.heading\b/gu)).toHaveLength(1);
  });

  it("underlines a point number the text names, and keeps each [Pn] citation with the word before it", () => {
    expect(styles.get("mention")).toMatch(/textDecoration:\s*"underline"/u);
    // A no-break space before each citation marker, so "[P5]" never starts a line on its own.
    expect(source).toContain("`\\u00A0[${span.label}]`");
  });

  it("never lets story text break between runs (where textkit would print a stray hyphen)", () => {
    // textkit 7.0.1 treats every run boundary (a word, then a [Pn] marker or an underlined P5) as a
    // hyphenation point; at its own infinity, 10000, a penalty is never a line break.
    expect(source).toMatch(/^const NEVER_BREAK_BETWEEN_RUNS = 10000;$/mu);
    expect(source).toMatch(/<Text style=\{style\} hyphenationPenalty=\{NEVER_BREAK_BETWEEN_RUNS\}>/u);
    expect(source.match(/hyphenationPenalty=/gu)).toHaveLength(1);
  });
});
