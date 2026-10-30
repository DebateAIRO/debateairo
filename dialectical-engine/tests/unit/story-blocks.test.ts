import { describe, expect, it } from "vitest";
import { AnswerStorySchema, StoryTableSchema, type StoryBody } from "@debateai/contract";
import {
  STORY_BLOCK_MENU,
  STORY_CHARTS_ANSWER_FORM,
  STORY_QUESTION_FORMS,
  claimFigures,
  readStoryBlocks,
  restoreTableRefs,
  storyArgumentSides,
  storyBlockCallNeeded,
  storyBlockNeeds,
  storyFormIsProseOnly,
  storyRanking,
  type StoryBlocksContext
} from "@debateai/story";
import { buildReportTables } from "../../apps/ui/lib/report/reportTables.js";
import { STORY_TABLES_SAMPLE_ANSWER, storyTablesSample } from "../../apps/ui/lib/v3/storyTablesSample.js";

/**
 * Data blocks in the verdict PDF (owner decisions 2026-10-30): the test that decides whether the block call is made,
 * the menu each kind of question allows, the checks on every table (a cell not in its claim prints as "not stated"; a
 * table is left out only when too little is left), the ranking code builds, and the tables as the report prints them.
 */

type Position = { id: string; place: number; claim: string; won: boolean; within_tie_margin?: true };
type Point = { id: string; claim: string; known_by: "LOOKED_UP"; supports?: string[]; attacks?: string[] };

function material(positions: Position[], points: Point[]) {
  return { positions, points };
}

const PHONES: Position[] = [
  { id: "P1", place: 1, won: true, claim: "The iPhone 17 is the most secure: Apple promises at least 7 years of security updates." },
  { id: "P2", place: 2, won: false, within_tie_margin: true, claim: "The Galaxy S24 is the most secure: Samsung promises 7 years of security updates." },
  { id: "P3", place: 3, won: false, claim: "The Oppo Reno 12 is secure enough: it gets 4 years of security patches." }
];
const POINTS: Point[] = [
  { id: "P4", known_by: "LOOKED_UP", supports: ["P1"], claim: "Apple pays up to $2,000,000 for a working exploit chain." },
  { id: "P5", known_by: "LOOKED_UP", attacks: ["P1"], claim: "A second-hand iPhone 17 may have only 5 years of updates left." },
  { id: "P6", known_by: "LOOKED_UP", attacks: ["P3"], claim: "Oppo's patches arrive about 2 months after Google publishes them." }
];

const BODY: StoryBody = {
  shape_id: "general",
  short: {
    headline: "h", summary: "s", confidence: "c",
    paths: [{ position_ref: "P1", fate: "HELD_UP", line: "l", node_refs: ["P1"] }],
    change: { text: "t", node_refs: ["P1"] }
  },
  why: { reasons: [{ text: "Updates.", node_refs: ["P1", "P2", "P3"] }, { text: "Fixes.", node_refs: ["P4", "P5"] }] },
  long: {
    sections: [
      { title: "A", paragraphs: [{ text: "a", node_refs: ["P1"] }] },
      { title: "B", paragraphs: [{ text: "b", node_refs: ["P1", "P2"] }] },
      { title: "C", paragraphs: [{ text: "c", node_refs: ["P3"] }] }
    ]
  },
  reviewer_note: null
};

const CONTEXT: StoryBlocksContext = {
  body: BODY,
  claims: new Map([...PHONES, ...POINTS].map((entry) => [entry.id, entry.claim])),
  scoreTexts: new Set(["0.68"]),
  sides: storyArgumentSides(material(PHONES, POINTS))
};

function compare(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    after: "long.2.1",
    kind: "compare",
    title: "The phones side by side",
    columns: ["Security updates", "Bug rewards"],
    rows: [
      { label: "iPhone 17", cells: [{ text: "at least 7 years of security updates", node_ref: "P1" }, { text: "up to $2,000,000", node_ref: "P4" }] },
      { label: "Galaxy S24", cells: [{ text: "7 years of security updates", node_ref: "P2" }, null] },
      { label: "Oppo Reno 12", cells: [{ text: "4 years of security patches", node_ref: "P3" }, { text: "up to $1,000,000", node_ref: "P4" }] }
    ],
    ...overrides
  };
}

function prosCons(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    after: "why.2",
    kind: "pros_cons",
    title: "For and against",
    options: [
      { label: "iPhone 17", position_ref: "P1",
        pros: [{ text: "Apple pays up to $2,000,000 for a working exploit chain.", node_ref: "P4" }],
        cons: [{ text: "may have only 5 years of updates left", node_ref: "P5" }] }
    ],
    ...overrides
  };
}

describe("claimFigures: the figures a claim states, as it writes them", () => {
  it("keeps a currency, a unit or a percent with its number, and leaves a bare year out", () => {
    expect(claimFigures("Apple pays up to $2,000,000 and promises 7 years.")).toEqual(["$2,000,000", "7 years"]);
    expect(claimFigures("Output rose 12% in 2024, at 52 %.")).toEqual(["12%", "52 %"]);
    expect(claimFigures("No numbers here.")).toEqual([]);
  });
});

describe("storyBlockNeeds: the block call is made only when the debate holds something worth showing", () => {
  it("three options argued for and against, with figures, need every block", () => {
    const needs = storyBlockNeeds(material(PHONES, POINTS));
    expect(needs).toEqual({ figures: true, compare: true, prosCons: true, ranking: true });
    expect(storyBlockCallNeeded(needs)).toBe(true);
  });

  it("one position with one objection and two numbers needs nothing: no call, no ranking", () => {
    const needs = storyBlockNeeds(material(
      [{ id: "P1", place: 1, won: true, claim: "Adopt it: output rose 12%." }],
      [{ id: "P2", known_by: "LOOKED_UP", attacks: ["P1"], claim: "Payroll rises 8% a year." }]
    ));
    expect(needs).toEqual({ figures: false, compare: false, prosCons: false, ranking: false });
    expect(storyBlockCallNeeded(needs)).toBe(false);
  });

  it("a v3 material that lists each position among the points counts it once", () => {
    const listed = POINTS.concat(PHONES.map((position) => ({ id: position.id, known_by: "LOOKED_UP" as const, claim: position.claim })));
    expect(storyBlockNeeds(material(PHONES, listed))).toEqual(storyBlockNeeds(material(PHONES, POINTS)));
  });
});

describe("the kinds of question and their menus", () => {
  it("the eight kinds answered in words carry no block; every other kind carries at least one", () => {
    const proseOnly = STORY_QUESTION_FORMS.filter((form) => storyFormIsProseOnly(form));
    expect(proseOnly).toEqual(["values", "personal", "taste", "interpretation", "definition", "hypothetical", "private-person", "simple-fact"]);
    expect(STORY_QUESTION_FORMS.filter((form) => STORY_BLOCK_MENU[form].length > 0)).toHaveLength(9);
    expect(storyFormIsProseOnly(null)).toBe(false);
  });

  it("the answer form names every kind with its menu, and the table limits", () => {
    for (const form of STORY_QUESTION_FORMS) expect(STORY_CHARTS_ANSWER_FORM).toContain(`"${form}"`);
    expect(STORY_CHARTS_ANSWER_FORM).toContain(`"values": what is right or wrong (no block)`);
    expect(STORY_CHARTS_ANSWER_FORM).toContain("2 to 5 columns and 2 to 8 rows");
    expect(STORY_CHARTS_ANSWER_FORM).toContain("tables 0 to 3");
  });
});

describe("readStoryBlocks: what the plan keeps", () => {
  it("empties a cell that is not in its claim, drops a column left with one cell, and keeps the table", () => {
    const read = readStoryBlocks({ question_form: "pick-option", charts: [], tables: [compare()] }, CONTEXT);
    expect(read.form).toBe("pick-option");
    expect(read.dropped).toEqual([]);
    const [table] = read.tables;
    expect(StoryTableSchema.parse(table)).toEqual(table);
    // "$1,000,000" is in no claim: emptied. The rewards column is left with one cell, so it goes; three rows of updates stay.
    expect(table).toMatchObject({ kind: "compare", columns: ["Security updates"] });
    expect(read.tables).toHaveLength(1);
  });

  it("drops a table only when too little is left of it", () => {
    const thin = compare({ rows: [
      { label: "iPhone 17", cells: [{ text: "invented", node_ref: "P1" }, { text: "also invented", node_ref: "P4" }] },
      { label: "Galaxy S24", cells: [{ text: "7 years of security updates", node_ref: "P2" }, null] }
    ] });
    expect(readStoryBlocks({ question_form: "pick-option", charts: [], tables: [thin] }, CONTEXT))
      .toMatchObject({ tables: [], dropped: ["TABLE_TOO_LITTLE_DATA"] });
  });

  it("keeps a two-column table whole when every cell is in its claim", () => {
    const whole = compare({ columns: ["Security updates", "Phone"], rows: [
      { label: "iPhone 17", cells: [{ text: "at least 7 years of security updates", node_ref: "P1" }, { text: "The iPhone 17", node_ref: "P1" }] },
      { label: "Galaxy S24", cells: [{ text: "7 years of security updates", node_ref: "P2" }, { text: "The Galaxy S24", node_ref: "P2" }] }
    ] });
    const read = readStoryBlocks({ question_form: "pick-option", charts: [], tables: [whole] }, CONTEXT);
    expect(read.tables[0]).toEqual(whole);
  });

  it("keeps only the pros that support and the cons that attack their position", () => {
    const swapped = prosCons({ options: [{ label: "iPhone 17", position_ref: "P1",
      pros: [{ text: "Apple pays up to $2,000,000 for a working exploit chain.", node_ref: "P4" },
        { text: "may have only 5 years of updates left", node_ref: "P5" }],
      cons: [{ text: "Oppo's patches arrive", node_ref: "P6" }] }] });
    const read = readStoryBlocks({ question_form: "pick-option", charts: [], tables: [prosCons(), swapped] }, CONTEXT);
    // The second list keeps one entry of three; one entry is too little. Its paragraph is taken by the first anyway.
    expect(read.tables).toHaveLength(1);
    expect(read.dropped).toEqual(["TABLE_TOO_LITTLE_DATA"]);
  });

  it.each([
    ["a kind answered in words drops every block", { question_form: "values", charts: [], tables: [compare()] }, ["BLOCK_NOT_FOR_QUESTION"]],
    ["a yes-or-no question has no comparison table", { question_form: "yes-no", charts: [], tables: [compare()] }, ["BLOCK_NOT_FOR_QUESTION"]],
    ["a model never plans the ranking", { question_form: "pick-option", charts: [], tables: [{ kind: "ranking", placement: "why", rows: [] }] }, ["TABLE_SCHEMA"]],
    ["a paragraph holds one block", { question_form: "pick-option", charts: [], tables: [compare(), compare({ title: "Again" })] }, ["TABLE_ANCHOR_TAKEN"]],
    ["a title may not print a score", { question_form: "pick-option", charts: [], tables: [compare({ title: "Strength 0.68" })] }, ["TABLE_TEXT_SCORE_VALUE"]],
    ["an anchor must exist", { question_form: "pick-option", charts: [], tables: [compare({ after: "long.9.1" })] }, ["TABLE_ANCHOR_UNKNOWN"]],
    ["rows have one cell per column", { question_form: "pick-option", charts: [], tables: [compare({ columns: ["A", "B", "C"] })] }, ["TABLE_SCHEMA"]]
  ])("%s", (_, reply, dropped) => {
    expect(readStoryBlocks(reply, CONTEXT).dropped).toEqual(dropped);
  });

  it("an unknown kind keeps every kind of block; a reply that is not a plan keeps none", () => {
    expect(readStoryBlocks({ question_form: "astrology", charts: [], tables: [compare()] }, CONTEXT)).toMatchObject({ form: null, dropped: [] });
    expect(readStoryBlocks({ charts: [] }, CONTEXT)).toEqual({ form: null, charts: [], tables: [], dropped: [] });
    expect(readStoryBlocks({ tables: [] }, CONTEXT).dropped).toEqual(["CHART_SCHEMA"]);
  });
});

describe("storyRanking: code's own ranking of the answers", () => {
  it("lists the positions by place, with the winner and the close rival, and needs three", () => {
    expect(storyRanking(material([...PHONES].reverse(), []), "why")).toEqual({
      kind: "ranking", placement: "why", rows: [
        { node_ref: "P1", won: true, close: false },
        { node_ref: "P2", won: false, close: true },
        { node_ref: "P3", won: false, close: false }
      ]
    });
    expect(storyRanking(material(PHONES.slice(0, 2), []), "why")).toBeNull();
  });

  it("restores every reference to its node id for storage", () => {
    const refs = new Map([["P1", "n1"], ["P2", "n2"], ["P3", "n3"], ["P4", "n4"], ["P5", "n5"]]);
    const [ranking, list] = restoreTableRefs([storyRanking(material(PHONES, []), "appendix")!,
      readStoryBlocks({ question_form: "pick-option", charts: [], tables: [prosCons()] }, CONTEXT).tables[0]!], refs);
    expect(ranking).toMatchObject({ rows: [{ node_ref: "n1" }, { node_ref: "n2" }, { node_ref: "n3" }] });
    expect(list).toMatchObject({ options: [{ position_ref: "n1", pros: [{ node_ref: "n4" }], cons: [{ node_ref: "n5" }] }] });
    expect(() => restoreTableRefs([storyRanking(material(PHONES, []), "why")!], new Map()))
      .toThrow(expect.objectContaining({ code: "STORY_REF_UNMAPPED" }));
  });
});

describe("the report prints the stored tables", () => {
  const catalog: Record<string, string> = {
    "public.report.table.notStated": "Not stated in the debate",
    "public.report.table.aiNote": "Table generated by AI.",
    "public.report.table.pros": "For",
    "public.report.table.cons": "Against",
    "public.report.table.rankingTitle": "How the answers placed",
    "public.report.table.place": "Place",
    "public.report.table.answer": "Answer",
    "public.report.table.strength": "Strength",
    "public.report.table.won": "Chosen answer",
    "public.report.table.close": "Close to the chosen answer",
    "public.report.chart.points": "From points {points}",
    "public.report.chart.strengthNote": "Strengths were calculated by Dialectical Engine."
  };
  const story = storyTablesSample();
  const numbers = new Map(Object.entries(story.point_numbers ?? {}));
  const build = (tables: NonNullable<typeof story.tables>) => buildReportTables({
    story: { tables }, answer: STORY_TABLES_SAMPLE_ANSWER, numbers, locale: "en", catalog,
    listWords: (items) => items.join(", ")
  });

  it("the sample story parses, and every table reaches the report", () => {
    expect(AnswerStorySchema.parse(story).tables).toHaveLength(3);
    const { tables, ranking } = build(story.tables!);
    expect(tables.map((table) => table.kind)).toEqual(["compare", "pros_cons"]);
    expect(tables[0]).toMatchObject({ sources: "From points P1, P2, P3, P6, P8", rows: [{ cells: [{ cite: "P1" }, { cite: "P1" }, null] }, {}, {}] });
    expect(ranking).toMatchObject({
      placement: "why",
      rows: [
        { place: "1", strength: "68%", mark: "Chosen answer", cite: "P1" },
        { place: "2", strength: "63%", mark: "Close to the chosen answer" },
        { place: "3", strength: "39%", mark: null }
      ]
    });
  });

  it("a ranking with fewer than three answers the answer holds is left out", () => {
    const [ranking] = story.tables!;
    const thinned = { ...ranking!, rows: ranking!.kind === "ranking" ? ranking!.rows.map((row, index) => (index === 0 ? { ...row, node_ref: "gone" } : row)) : [] };
    expect(build([thinned as typeof ranking & object]).ranking).toBeNull();
  });
});
