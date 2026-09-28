import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { PLAN_TIER_ROSTERS, type Answer, type AnswerDisclosure, type MakerLineage } from "@debateai/contract";
import { loadReportCatalogs, type ReportCatalogLoader, type ReportCatalogs } from "../../apps/ui/lib/report/reportLanguage.js";
import { buildReportModel, type ReportModel } from "../../apps/ui/lib/report/reportModel.js";
import {
  STORY_FIXTURE_ANSWER,
  STORY_FIXTURE_DEBATE_ID,
  STORY_FIXTURE_FLOOR_ANSWER,
  storyFixture,
  storyFixtureDisclosure
} from "../../apps/ui/lib/v3/storyFixture.js";

/**
 * Task M6 (spec 2026-09-26 §14.4.5): the PDF's "About this report" names the
 * models that actually wrote and checked the answer, and says in one plain
 * sentence each when a lower-cost model stood in, when the answer is the
 * debate's strongest position because no answer could be written, when the
 * debate stopped exploring early, and when the answer was written from the
 * debate's most important points. Nothing else in the report says so: never
 * the verdict text. No engine words, no engine numbers.
 */

const GENERATED = new Date("2026-09-26T12:00:00.000Z");
const MESSAGES = resolve(process.cwd(), "apps/ui/messages");
const load: ReportCatalogLoader = async (locale, namespace) =>
  JSON.parse(readFileSync(resolve(MESSAGES, locale, `${namespace}.json`), "utf8")) as Record<string, string>;
function message(locale: string, key: string): string {
  const value = (JSON.parse(readFileSync(resolve(MESSAGES, locale, "public.json"), "utf8")) as Record<string, string>)[key];
  if (value === undefined) throw new Error(`${locale}/public lacks ${key}`);
  return value;
}

let ROMANIAN: ReportCatalogs;
let ENGLISH: ReportCatalogs;
beforeAll(async () => {
  ROMANIAN = await loadReportCatalogs({ questionTag: "ro", interfaceLocale: "en", load });
  ENGLISH = await loadReportCatalogs({ questionTag: "en", interfaceLocale: "en", load });
});

function maker(name: "OpenAI" | "Anthropic" | "xAI", prefix: string): MakerLineage {
  const model = PLAN_TIER_ROSTERS.premium.find((id) => id.startsWith(prefix));
  if (model === undefined) throw new Error(`no premium model starts with ${prefix}`);
  return { maker: name, model_id: model, transport: "openai-compatible-http", provider_ref: `provider:${name.toLowerCase()}` };
}
const OPENAI = maker("OpenAI", "gpt-");
const ANTHROPIC = maker("Anthropic", "claude-");
const XAI = maker("xAI", "grok-");
const words = (lineage: MakerLineage) => `${lineage.maker} · ${lineage.model_id}`;

/** A served answer's record: planned models served, nothing cut short. */
function served(overrides: Partial<AnswerDisclosure> = {}): AnswerDisclosure {
  return {
    answer_id: STORY_FIXTURE_DEBATE_ID,
    answer_version: 1,
    floor: null,
    floor_reason: null,
    writer: { planned_model: OPENAI, served_model: OPENAI, lower_cost: false },
    checker: { planned_model: ANTHROPIC, served_model: ANTHROPIC, lower_cost: false },
    checker_same_as_writer: false,
    digest: { compacted: false, points_left_out: 0 },
    cut_short: { arguing: null, answer_writing: null },
    ...overrides
  };
}

/** A floor answer's record: no round was checked, so no writer, no checker, and no digest was ever sent. */
function floorRecord(reason: NonNullable<AnswerDisclosure["floor_reason"]>, overrides: Partial<AnswerDisclosure> = {}): AnswerDisclosure {
  return served({
    floor: { verdict_state: "CONTESTED", leading_node_id: "n-hybrid", basis_incomplete: false },
    floor_reason: reason,
    writer: null,
    checker: null,
    digest: null,
    cut_short: { arguing: null, answer_writing: reason === "ENVELOPE_EXHAUSTED" ? "MONEY" : reason === "DIGEST_CANNOT_EXIST" ? null : reason },
    ...overrides
  });
}

const FLOOR_ANSWER: Answer = {
  ...STORY_FIXTURE_ANSWER,
  terminal: "COMPONENTS_ONLY",
  serve_state: "COMPONENTS_ONLY",
  verdict_state: null,
  verdict_unavailable: { reason_ref: "serve-gate:COMPONENTS_ONLY_ENVELOPE" },
  confidence_band: null,
  band_ceiling: null,
  composed_text: []
};

function about(disclosure: AnswerDisclosure | null, catalogs: ReportCatalogs = ENGLISH, answer: Answer = STORY_FIXTURE_ANSWER): ReportModel["about"] {
  return buildReportModel(answer, storyFixture("READY"), GENERATED, catalogs, disclosure).about;
}

describe("About this report: who wrote and checked the answer", () => {
  it("adds the answer's writer and checker after the report's date, before the story's own rows", () => {
    const { rows, notes } = about(served());
    expect(rows.map((row) => row.label)).toEqual([
      "Question", "Report generated", "Answer written by", "Answer checked by", "Story written", "Written by", "Checked by"
    ]);
    expect(rows[2]!.value).toBe(words(OPENAI));
    expect(rows[3]!.value).toBe(words(ANTHROPIC));
    expect(notes).toEqual([]);
  });

  it("says it in Romanian for a Romanian question", () => {
    const { rows } = about(served(), ROMANIAN);
    expect(rows[2]).toEqual({ label: message("ro", "public.report.about.answerWrittenBy"), value: words(OPENAI) });
    expect(rows[3]).toEqual({ label: message("ro", "public.report.about.answerCheckedBy"), value: words(ANTHROPIC) });
    expect(rows[2]!.label).toBe("Răspuns scris de");
  });

  it("shows a row only when the record names the model", () => {
    const unnamed = served({ checker: { planned_model: ANTHROPIC, served_model: null, lower_cost: false } });
    expect(about(unnamed).rows.map((row) => row.label)).not.toContain("Answer checked by");
    expect(about(unnamed).rows.map((row) => row.label)).toContain("Answer written by");
    expect(about(null).rows).toHaveLength(5);
    expect(about(null).notes).toEqual([]);
  });
});

describe("About this report: the plain sentences", () => {
  const EN = (key: string) => message("en", `public.report.about.${key}`);

  it("says when a lower-cost model wrote, checked, or wrote and checked the answer", () => {
    const writer = served({ writer: { planned_model: OPENAI, served_model: XAI, lower_cost: true } });
    const checker = served({ checker: { planned_model: ANTHROPIC, served_model: XAI, lower_cost: true } });
    const both = served({
      writer: { planned_model: OPENAI, served_model: XAI, lower_cost: true },
      checker: { planned_model: ANTHROPIC, served_model: OPENAI, lower_cost: true }
    });
    expect(about(writer).notes).toEqual([EN("lowerCostWriter")]);
    expect(about(checker).notes).toEqual([EN("lowerCostChecker")]);
    expect(about(both).notes).toEqual([EN("lowerCostBoth")]);
    expect(EN("lowerCostWriter")).toBe("A lower-cost AI model wrote this answer, to stay within the debate's budget.");
    // The rows name the model that actually served.
    expect(about(writer).rows[2]!.value).toBe(words(XAI));
  });

  it("says when the debate stopped exploring early, without a number", () => {
    for (const arguing of ["MONEY", "ATTEMPTS", "DAILY"] as const) {
      expect(about(served({ cut_short: { arguing, answer_writing: null } })).notes, arguing).toEqual([EN("cutShort")]);
    }
  });

  it("does not call a vendor that reports no usage a budget: it says an AI service had a problem (fix round 1)", () => {
    expect(about(served({ cut_short: { arguing: "USAGE", answer_writing: null } })).notes).toEqual([EN("cutShortService")]);
    expect(EN("cutShortService")).toBe(
      "The debate stopped exploring early because of a problem with an AI service; the answer uses everything argued until then."
    );
  });

  it("says one lower-cost model wrote and checked the answer when one model did both (fix round 1)", () => {
    const one = served({
      writer: { planned_model: OPENAI, served_model: XAI, lower_cost: true },
      checker: { planned_model: ANTHROPIC, served_model: XAI, lower_cost: true },
      checker_same_as_writer: true
    });
    expect(about(one).notes).toEqual([EN("lowerCostOneModel")]);
    expect(EN("lowerCostOneModel")).toBe("A lower-cost AI model wrote and checked this answer, to stay within the debate's budget.");
    expect(about(one, ROMANIAN).notes).toEqual([message("ro", "public.report.about.lowerCostOneModel")]);
  });

  it("says when the answer was written from the debate's most important points, only when a model wrote it", () => {
    expect(about(served({ digest: { compacted: true, points_left_out: 42 } })).notes).toEqual([EN("mostImportantPoints")]);
    // Every point kept (a shorter summary only): nothing to say.
    expect(about(served({ digest: { compacted: true, points_left_out: 0 } })).notes).toEqual([]);
    expect(about(served({ digest: null })).notes).toEqual([]);
    // No model served the answer: the digest was never sent, so it is never mentioned (M4 review carry).
    const unwritten = served({ writer: { planned_model: OPENAI, served_model: null, lower_cost: false }, digest: { compacted: true, points_left_out: 42 } });
    expect(about(unwritten).notes).toEqual([]);
    expect(JSON.stringify(about(served({ digest: { compacted: true, points_left_out: 42 } })))).not.toContain("42");
  });

  it("says why a floor answer is the debate's strongest position, by its cause", () => {
    expect(about(floorRecord("ENVELOPE_EXHAUSTED"), ENGLISH, FLOOR_ANSWER).notes).toEqual([EN("floorBudget")]);
    expect(about(floorRecord("DIGEST_CANNOT_EXIST"), ENGLISH, FLOOR_ANSWER).notes).toEqual([EN("floorTooLarge")]);
    expect(about(floorRecord("TRANSPORT_DEATH"), ENGLISH, FLOOR_ANSWER).notes).toEqual([EN("floorProblem")]);
    expect(about(floorRecord("NO_ARTIFACT"), ENGLISH, FLOOR_ANSWER).notes).toEqual([EN("floorProblem")]);
    // A vendor that reports no usage is not the budget.
    const usage = floorRecord("ENVELOPE_EXHAUSTED", { cut_short: { arguing: null, answer_writing: "USAGE" } });
    expect(about(usage, ENGLISH, FLOOR_ANSWER).notes).toEqual([EN("floorProblem")]);
    // A floor answer has no writer or checker row.
    expect(about(floorRecord("ENVELOPE_EXHAUSTED"), ENGLISH, FLOOR_ANSWER).rows).toHaveLength(5);
  });

  it("puts the sentences in one order: the floor, the stop, the lower-cost model, the most important points", () => {
    const everything = served({
      cut_short: { arguing: "MONEY", answer_writing: null },
      writer: { planned_model: OPENAI, served_model: XAI, lower_cost: true },
      digest: { compacted: true, points_left_out: 7 }
    });
    expect(about(everything).notes).toEqual([EN("cutShort"), EN("lowerCostWriter"), EN("mostImportantPoints")]);
    const floorCut = floorRecord("ENVELOPE_EXHAUSTED", { cut_short: { arguing: "MONEY", answer_writing: "MONEY" } });
    expect(about(floorCut, ENGLISH, FLOOR_ANSWER).notes).toEqual([EN("floorBudget"), EN("cutShort")]);
  });

  it("prints the floor's label on the cover of a floor answer's report", () => {
    const model = buildReportModel(FLOOR_ANSWER, storyFixture("READY"), GENERATED, ROMANIAN, floorRecord("ENVELOPE_EXHAUSTED"));
    expect(model.cover.labelWords).toBe("Decizie strânsă");
  });

  it("keeps a floor story's label on the cover when the record could not be read (fix round 1)", () => {
    // The story's own sealed basis carries the label the floor rests on.
    expect(buildReportModel(FLOOR_ANSWER, storyFixture("READY"), GENERATED, ROMANIAN, null).cover.labelWords).toBe("Decizie strânsă");
    const bare = { ...storyFixture("READY"), verdict_basis: null };
    expect(buildReportModel(FLOOR_ANSWER, bare, GENERATED, ROMANIAN, null).cover.labelWords).toBeNull();
    // Only a components-only answer can stand on a floor: a served answer without a label shows none.
    expect(buildReportModel({ ...STORY_FIXTURE_ANSWER, verdict_state: null }, storyFixture("READY"), GENERATED, ROMANIAN, null).cover.labelWords).toBeNull();
    // A served answer's own label always wins.
    const served = buildReportModel(STORY_FIXTURE_ANSWER, { ...storyFixture("READY"), verdict_basis: { ...storyFixture("READY").verdict_basis!, label: "SUPPORTED" } }, GENERATED, ROMANIAN, null);
    expect(served.cover.labelWords).toBe("Decizie strânsă");
  });

  it("never says a lower-cost model anywhere but About", () => {
    const record = served({
      writer: { planned_model: OPENAI, served_model: XAI, lower_cost: true },
      checker: { planned_model: ANTHROPIC, served_model: OPENAI, lower_cost: true }
    });
    const model = buildReportModel(STORY_FIXTURE_ANSWER, storyFixture("READY"), GENERATED, ROMANIAN, record);
    const { about: aboutPart, ...rest } = model;
    expect(JSON.stringify(aboutPart)).toContain(message("ro", "public.report.about.lowerCostBoth"));
    expect(JSON.stringify(rest)).not.toContain(message("ro", "public.report.about.lowerCostBoth"));
    // The story's own text may say "mai ieftine" of flats in Cluj; no fixed words say a model was cheaper.
    expect(JSON.stringify(rest)).not.toMatch(/(?:model|modele) AI mai ieftin|lower-cost/iu);
  });
});

describe("the owner's sample report variants (apps/ui/scripts/story-sample-pdf.ts)", () => {
  const RO = (key: string) => message("ro", `public.report.about.${key}`);

  it("prints the answer's two models for the plain sample", () => {
    const { rows, notes } = about(storyFixtureDisclosure("served"), ROMANIAN);
    expect(rows.map((row) => row.label)).toContain(RO("answerWrittenBy"));
    expect(notes).toEqual([]);
  });

  it("prints the stop, the lower-cost writer and the most important points for the lower-cost sample", () => {
    expect(about(storyFixtureDisclosure("lower-cost"), ROMANIAN).notes)
      .toEqual([RO("cutShort"), RO("lowerCostWriter"), RO("mostImportantPoints")]);
  });

  it("prints the floor and the stop for the floor sample, with the floor's label on the cover", () => {
    const model = buildReportModel(STORY_FIXTURE_FLOOR_ANSWER, storyFixture("READY"), GENERATED, ROMANIAN, storyFixtureDisclosure("floor"));
    expect(model.about.notes).toEqual([RO("floorBudget"), RO("cutShort")]);
    expect(model.cover.labelWords).toBe("Decizie strânsă");
  });
});
