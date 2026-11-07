/**
 * V4 start step, Task 39c (saved questions spec 2026-11-04 §3.2, §3.12, §3.14; owner answers S1-S4 A of 4 Nov): what the
 * account keeps of a question not started yet, its limits, and the ask's `saved_question_id`. The saved step 2 has two
 * halves: the reading the server signed (strict, checked again at every save and at Pick up) and the page's own state
 * (passthrough, stored as sent: a parse is a check, never the stored value, so nothing in it is trimmed). A save screens
 * only the person's own words for crisis words, wherever they sit (the list, "+ N more", an Undo step, an "Other…" answer),
 * never the AIs' text. Every text here is made up.
 */
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AskRequestSchema, SAVED_QUESTION_ENDS, SAVED_QUESTION_LIMITS, SAVED_QUESTION_REFUSALS, SAVED_QUESTION_STATES, START_STEP_LIMITS,
  SavedQuestionCreateSchema, SavedQuestionDocSchema, SavedQuestionListSchema, SavedQuestionPageSchema, SavedQuestionReadSchema,
  SavedQuestionReadingSchema, SavedQuestionSaveSchema, SavedQuestionSummarySchema, SavedQuestionWrittenSchema, askQuestionMaxBytes,
  savedQuestionDocFits, savedQuestionOwnWords, savedQuestionPartBytes, savedQuestionTitleOf, type SavedQuestionDoc
} from "@debateai/contract";
import { PATH_PLAN_LIMITS, pathPlanFromMenu, pathPlanReduce } from "../../apps/ui/lib/v4/pathPlan.js";
import { NUCLEAR_MENU, START_FIXTURE_QUESTION, TWO_PATH_MENU, signedList, signedMenu } from "../support/v4-start-menu.js";

const ID = "3f2c1a9e-7b4d-4c2a-9e8f-1a2b3c4d5e6f";
const SAVED_AT = "2026-11-05T09:30:00.000Z";
const ASK = { question_line: "q", risk_tier: "casual", tier_source: "ASKER", tier_provenance_ref: "asker:test",
  composition_budget_tier: "low", depth_params: { depth: 1 }, decision_scope: "s", as_of: "2026-10-13T00:00:00.000Z",
  steering_presets: [], plan_tier: "free", steering_annotations: [] };

/** A v1 clarifying reply (ask.clarify.v1): one question and the one about what the answer is for. */
const CLARIFY_V1 = { source: "AI", questions: [{ text: "Which region?", answers: ["The north", "The south"] }],
  purpose: { text: "What is the answer for?", answers: ["A school essay", "A vote"] } };

const BOX_TEXT = "Should Romania build new nuclear plants?\n\nThe north.\n";
const REWRITTEN_TITLE = "My bills ";
const REWRITTEN_QUESTION = "What will new plants do to my power bills?";
const OWN_VIEW = "Cernavodă jobs matter to my town";
const OWN_IN_MORE = "Would solar panels on every roof do more?";
const OWN_ONLY_IN_UNDO = "What if the plants are never finished?";
const TYPED_ANSWER = "For my town council's meeting";
const COMBINED_TITLE = "Costs and security";
const COMBINED_QUESTION = "What would new plants cost Romania, and would they make it less safe?";

type Kind = "MENU" | "PICK" | "OWN";
const menuViewpoint = (id: string) => {
  const one = NUCLEAR_MENU.viewpoints.find((viewpoint) => viewpoint.viewpoint_id === id)!;
  return { key: id, source: { kind: "MENU" as Kind, viewpointId: id }, title: one.title, question: one.question, angleId: one.angle_id };
};
const ownViewpoint = (key: string, question: string) => ({ key, source: { kind: "OWN" as Kind }, title: null, question, angleId: null });
/** A menu path as the page's plan holds it (apps/ui/lib/v4/pathPlan.ts PlanPath), in the AI's words. */
const aiPath = (ref: string) => {
  const one = NUCLEAR_MENU.paths.find((path) => path.path_ref === ref)!;
  return { key: ref, title: one.title, question: one.question, viewpoints: one.viewpoint_ids.map(menuViewpoint), wording: "AI",
    combineRef: null, menuPathRef: ref, isNew: false, tag: one.put_together ? "PUT_TOGETHER_BY_US" : null, askReword: false };
};
/** The person's own path: their words as title and question, one own viewpoint. */
const ownPath = (key: string, words: string) => ({ key, title: words, question: words, viewpoints: [ownViewpoint(`o${key}`, words)],
  wording: "PERSON", combineRef: null, menuPathRef: null, isNew: false, tag: "ADDED_BY_YOU", askReword: false });

const REWRITTEN = { ...aiPath("kp01"), title: REWRITTEN_TITLE, question: REWRITTEN_QUESTION, wording: "PERSON" };
/** An AI combine of a menu point and the person's own point of view: AI words, one OWN chip. */
const COMBINED = { key: "p2", title: COMBINED_TITLE, question: COMBINED_QUESTION,
  viewpoints: [menuViewpoint("pt14"), ownViewpoint("o3", OWN_VIEW)], wording: "COMBINED", combineRef: "comb.sig", menuPathRef: null,
  isNew: false, tag: "COMBINED_BY_YOU", askReword: false };

function docOf(overrides: Readonly<{ reading?: object; page?: object }> = {}): SavedQuestionDoc {
  return {
    v: 1,
    reading: {
      read_line: START_FIXTURE_QUESTION, reading_level: "plain", check: { ref: "chk.sig" }, language: { code: "en", name: "English" },
      seats: 4, clarify: CLARIFY_V1, menu: signedMenu(NUCLEAR_MENU), late_lists: [signedList(3)], end: "READY", ...overrides.reading
    },
    page: {
      box: { text: BOX_TEXT, placed: [{ key: "Which region?", text: "The north." }] },
      sent_goal: { answers: [{ question: "Which region?", answer: "The north", other: false },
        { question: "What is the answer for?", answer: TYPED_ANSWER, other: true }], matters: "", angles: [] },
      plan: {
        paths: [REWRITTEN, aiPath("kp02"), COMBINED, aiPath("kp04"), aiPath("kp05")],
        more: [aiPath("kp06"), aiPath("kp07"), ownPath("p5", OWN_IN_MORE), aiPath("kp08"), aiPath("kp09")],
        selected: [], width: 5, freePlan: false,
        undo: [
          { paths: [aiPath("kp01"), aiPath("kp02"), aiPath("kp03"), aiPath("kp04"), aiPath("kp05")], more: [aiPath("kp06")], width: 5, done: [],
            questionSwap: null, kind: "CHANGE" },
          { paths: [REWRITTEN, ownPath("p4", OWN_ONLY_IN_UNDO)], more: [], width: 5, done: [], questionSwap: null, kind: "CHANGE" }
        ],
        cards: NUCLEAR_MENU.cards, suggestions: NUCLEAR_MENU.suggestions, done: [], questionSwap: null,
        seenPathRefs: NUCLEAR_MENU.paths.map((path) => path.path_ref), nextKey: 6
      },
      width: 5, mode: "thorough", carry_on: true, ...overrides.page
    }
  } as SavedQuestionDoc;
}
const DOC = docOf();
const parses = (doc: unknown) => SavedQuestionDocSchema.safeParse(doc).success;
/** The page part padded with an unknown key until its JSON is exactly `bytes` long. */
function pageOfBytes(bytes: number): SavedQuestionDoc["page"] {
  const page = { ...DOC.page, pad: "" };
  return { ...page, pad: "x".repeat(bytes - savedQuestionPartBytes(page)) };
}
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u;

describe("the limits", () => {
  it("are the owner's and the start step's, each equal to the value it repeats", () => {
    expect(SAVED_QUESTION_LIMITS).toEqual({ kept: 20, shown: 5, titleMaxChars: 300, boxMaxBytes: 8_192, readingMaxBytes: 393_216,
      pageMaxBytes: 262_144, docMaxBytes: 656_384, saveBodyMaxBytes: 720_896 });
    expect(Object.isFrozen(SAVED_QUESTION_LIMITS)).toBe(true);
    expect(SAVED_QUESTION_LIMITS.readingMaxBytes).toBe(START_STEP_LIMITS.askBodyMaxBytes);
    expect(SAVED_QUESTION_LIMITS.boxMaxBytes).toBe(askQuestionMaxBytes());
    expect(SAVED_QUESTION_LIMITS.docMaxBytes).toBe(SAVED_QUESTION_LIMITS.readingMaxBytes + SAVED_QUESTION_LIMITS.pageMaxBytes + 1_024);
    expect(SAVED_QUESTION_LIMITS.saveBodyMaxBytes).toBeGreaterThan(SAVED_QUESTION_LIMITS.docMaxBytes);
  });

  it("names how a reading ended, what Pick up finds and the routes' refusals", () => {
    expect(SAVED_QUESTION_ENDS).toEqual(["READY", "NONE", "LEFT_EARLY"]);
    expect(SAVED_QUESTION_STATES).toEqual(["READY", "NEEDS_READING"]);
    expect(SAVED_QUESTION_REFUSALS).toEqual(["SAVED_QUESTION_INVALID", "SAVED_QUESTION_GONE", "SAVED_QUESTION_REVISION",
      "SAVED_QUESTION_TOO_LARGE", "SAVED_QUESTIONS_OFF", "SAVED_QUESTIONS_UNAVAILABLE", "SAVED_QUESTIONS_FULL"]);
    for (const list of [SAVED_QUESTION_ENDS, SAVED_QUESTION_STATES, SAVED_QUESTION_REFUSALS]) expect(Object.isFrozen(list)).toBe(true);
  });

  it("the module imports only zod and the contract's leaf modules (never ./index.js), and counts bytes without Buffer", async () => {
    const source = await readFile("packages/contract/src/saved-questions.ts", "utf8");
    const imported = [...source.matchAll(/^import [^;]*? from "([^"]+)";/gmsu)].map((match) => match[1]).sort();
    expect(imported).toEqual(["./account-memory.js", "./question-language.js", "./start-paths.js", "./web.js", "zod"]);
    expect(source).not.toMatch(/\bBuffer\b/u);
  });
});

describe("what a saved step 2 holds", () => {
  it("a document of the shared fixture parses: its signed menu, one late list, the check and a v1 clarifying reply", () => {
    const parsed = SavedQuestionDocSchema.parse(DOC);
    expect(parsed.reading.menu).toEqual(signedMenu(NUCLEAR_MENU));
    expect(parsed.reading.late_lists).toEqual([signedList(3)]);
    expect(parsed.reading.check).toEqual({ ref: "chk.sig" });
    expect(parsed.reading.clarify).toEqual(CLARIFY_V1);
    expect(SavedQuestionReadingSchema.safeParse(DOC.reading).success).toBe(true);
    expect(SavedQuestionPageSchema.safeParse(DOC.page).success).toBe(true);
  });

  it("refuses an extra key at the top, in the reading and in its check", () => {
    expect(parses({ ...DOC, extra: 1 })).toBe(false);
    expect(parses({ ...DOC, reading: { ...DOC.reading, extra: 1 } })).toBe(false);
    expect(parses({ ...DOC, reading: { ...DOC.reading, check: { ref: "chk.sig", extra: 1 } } })).toBe(false);
    expect(parses({ ...DOC, v: 2 })).toBe(false);
  });

  it("keeps unknown keys inside the page and its plan (the page's own state, stored as sent)", () => {
    const parsed = SavedQuestionDocSchema.parse(docOf({ page: { scroll: { top: 12 } } }));
    expect((parsed.page as Record<string, unknown>).scroll).toEqual({ top: 12 });
    const plan = parsed.page.plan as Record<string, unknown>;
    expect(plan.seenPathRefs).toEqual(NUCLEAR_MENU.paths.map((path) => path.path_ref));
    expect(plan.nextKey).toBe(6);
    expect(plan.cards).toEqual(NUCLEAR_MENU.cards);
    expect((parsed.page.plan.paths[0] as Record<string, unknown>).menuPathRef).toBe("kp01");
    expect((parsed.page.plan.undo[0] as Record<string, unknown>).kind).toBe("CHANGE");
  });

  it("a copy saved before the list came (no menu, LEFT_EARLY) parses, and so does one that came to nothing", () => {
    expect(parses(docOf({ reading: { menu: null, late_lists: [], end: "LEFT_EARLY" } }))).toBe(true);
    expect(parses(docOf({ reading: { menu: null, late_lists: [], end: "NONE", none_reason: "DEADLINE" } }))).toBe(true);
    expect(parses(docOf({ reading: { end: "DONE" } }))).toBe(false);
    expect(parses(docOf({ reading: { menu: null, late_lists: [], end: "NONE", none_reason: "LATER" } }))).toBe(false);
  });

  it("holds at most eight late lists", () => {
    const lists = (count: number) => Array.from({ length: count }, (_, index) => signedList(index + 1));
    expect(parses(docOf({ reading: { late_lists: lists(START_STEP_LIMITS.lateListsMax) } }))).toBe(true);
    expect(parses(docOf({ reading: { late_lists: lists(9) } }))).toBe(false);
  });

  it("How wide is a whole number of paths from 1 to 7", () => {
    for (const width of [1, 7]) expect(parses(docOf({ page: { width } }))).toBe(true);
    for (const width of [0, 8, 2.5]) expect(parses(docOf({ page: { width } }))).toBe(false);
    expect(parses(docOf({ page: { mode: "slow" } }))).toBe(false);
    expect(parses(docOf({ page: { carry_on: "yes" } }))).toBe(false);
  });

  it("trims nothing in the page: a box ending in a line break and a title ending in a space come back unchanged", () => {
    const parsed = SavedQuestionDocSchema.parse(DOC);
    expect(parsed.page.box.text).toBe(BOX_TEXT);
    expect(parsed.page.plan.paths[0]!.title).toBe(REWRITTEN_TITLE);
    expect(parsed.page.plan.undo[1]!.paths[0]!.title).toBe(REWRITTEN_TITLE);
  });

  it("a plan the page's own reducer made (a rewrite, an own path added, then removed) parses as it is", () => {
    let plan = pathPlanFromMenu(TWO_PATH_MENU, 5, false);
    const steps = [{ type: "REWRITE", key: "kp01", title: "Bills", question: REWRITTEN_QUESTION },
      { type: "ADD_OWN", text: OWN_ONLY_IN_UNDO, intoPathKey: null }] as const;
    for (const action of steps) {
      const result = pathPlanReduce(plan, action);
      expect(result.refusal).toBeNull();
      plan = result.plan;
    }
    const own = plan.paths.find((path) => path.wording === "PERSON" && path.key !== "kp01")!;
    const removed = pathPlanReduce(plan, { type: "REMOVE", key: own.key });
    expect(removed.refusal).toBeNull();
    const doc = docOf({ page: { plan: removed.plan } });
    expect(SavedQuestionDocSchema.parse(doc).page.plan).toEqual(removed.plan);
    expect(savedQuestionOwnWords(doc)).toEqual(expect.arrayContaining(["Bills", REWRITTEN_QUESTION, OWN_ONLY_IN_UNDO]));
  });
});

/**
 * Task 39c review: the page part's caps are this task's own choice, and a save over one answers 400, after which the page
 * stops saving quietly. So each cap must admit the longest words the page's own reducer lets a person write, and refuse one
 * code unit more, wherever the words sit (the list, "+ N more", an Undo step).
 */
describe("the page part's caps", () => {
  const withPlan = (plan: object) => docOf({ page: { plan } });
  const longest = (count: number) => "中".repeat(count);

  it("admit the longest words the page's reducer lets a person write: a rewrite, an own path, an own point of view in a path", () => {
    let plan = pathPlanFromMenu(TWO_PATH_MENU, 5, false);
    const steps = [
      { type: "REWRITE", key: "kp01", title: longest(PATH_PLAN_LIMITS.titleMaxChars), question: longest(PATH_PLAN_LIMITS.questionMaxChars) },
      { type: "ADD_OWN", text: longest(PATH_PLAN_LIMITS.ownTextMaxChars), intoPathKey: null },
      { type: "ADD_OWN", text: `${longest(PATH_PLAN_LIMITS.ownTextMaxChars - 1)}x`, intoPathKey: "kp02" }
    ] as const;
    for (const action of steps) {
      const result = pathPlanReduce(plan, action);
      expect(result.refusal).toBeNull();
      plan = result.plan;
    }
    expect(plan.paths.map((path) => path.title.length)).toContain(PATH_PLAN_LIMITS.titleMaxChars);
    expect(plan.paths.flatMap((path) => path.viewpoints.map((viewpoint) => viewpoint.question.length))).toContain(PATH_PLAN_LIMITS.ownTextMaxChars);
    expect(parses(withPlan(plan))).toBe(true);
  });

  it("refuse one code unit over each cap, on the list, under \"+ N more\" and in an Undo step", () => {
    const { pathTitleMaxChars: title, pathQuestionMaxChars: question, ownTextMaxChars: own } = START_STEP_LIMITS;
    const pathOf = (titleLength: number, questionLength: number, ownLength: number) => ({ ...REWRITTEN, title: "t".repeat(titleLength),
      question: "q".repeat(questionLength), viewpoints: [ownViewpoint("o9", "o".repeat(ownLength))] });
    const placings = (path: object) => [{ ...DOC.page.plan, paths: [path] }, { ...DOC.page.plan, more: [path] },
      { ...DOC.page.plan, undo: [{ paths: [path], more: [] }] }];
    for (const plan of placings(pathOf(title, question, own))) expect(parses(withPlan(plan))).toBe(true);
    for (const path of [pathOf(title + 1, question, own), pathOf(title, question + 1, own), pathOf(title, question, own + 1)]) {
      for (const plan of placings(path)) expect(parses(withPlan(plan))).toBe(false);
    }
  });

  it("hold the box and the read line to 8_192 code units (the read line with words), 8 paths and 54 under \"+ N more\"", () => {
    const max = SAVED_QUESTION_LIMITS.boxMaxBytes;
    const box = (text: string) => docOf({ page: { box: { text, placed: [{ key: "Which region?", text }] } } });
    expect(parses(box("a".repeat(max)))).toBe(true);
    expect(parses(box("a".repeat(max + 1)))).toBe(false);
    const readLine = (line: string) => docOf({ reading: { read_line: line } });
    expect(parses(readLine("a".repeat(max)))).toBe(true);
    for (const line of ["", " \n\t", "a".repeat(max + 1)]) expect(parses(readLine(line))).toBe(false);
    const paths = (count: number) => Array.from({ length: count }, (_, index) => ({ ...aiPath("kp02"), key: `p${index}` }));
    const { storedPathsMax, menuPathsMax } = START_STEP_LIMITS;
    expect(parses(withPlan({ ...DOC.page.plan, paths: paths(storedPathsMax), more: paths(menuPathsMax) }))).toBe(true);
    expect(parses(withPlan({ ...DOC.page.plan, paths: paths(storedPathsMax + 1) }))).toBe(false);
    expect(parses(withPlan({ ...DOC.page.plan, more: paths(menuPathsMax + 1) }))).toBe(false);
    expect(parses(withPlan({ ...DOC.page.plan, undo: [{ paths: [], more: paths(menuPathsMax + 1) }] }))).toBe(false);
  });

  it("a reading whose clarifying call found no AI, or showed no questions, parses", () => {
    expect(parses(docOf({ reading: { clarify: { source: "NONE" } } }))).toBe(true);
    expect(parses(docOf({ reading: { clarify: null } }))).toBe(true);
  });
});

describe("savedQuestionDocFits", () => {
  it("lets the fixture and a page of exactly 256 KiB through, and refuses a page one byte over", () => {
    expect(savedQuestionDocFits(DOC)).toBe("FITS");
    expect(savedQuestionPartBytes(pageOfBytes(262_144))).toBe(262_144);
    expect(savedQuestionDocFits({ ...DOC, page: pageOfBytes(262_144) })).toBe("FITS");
    expect(savedQuestionDocFits({ ...DOC, page: pageOfBytes(262_145) })).toBe("TOO_LARGE");
  });

  it("refuses a box over 8 KiB of UTF-8, in bytes, not characters", () => {
    const box = (text: string) => docOf({ page: { box: { text, placed: [] } } });
    expect(savedQuestionDocFits(box("a".repeat(8_192)))).toBe("FITS");
    expect(savedQuestionDocFits(box("a".repeat(8_193)))).toBe("TOO_LARGE");
    expect(savedQuestionDocFits(box("中".repeat(2_731)))).toBe("TOO_LARGE");
  });

  it("refuses a reading over the largest ask, and a whole document over its limit", () => {
    expect(savedQuestionDocFits(docOf({ reading: { read_line: "x".repeat(SAVED_QUESTION_LIMITS.readingMaxBytes) } }))).toBe("TOO_LARGE");
    const fullReading = { ...DOC.reading, pad: "" };
    const reading = { ...fullReading, pad: "x".repeat(SAVED_QUESTION_LIMITS.readingMaxBytes - savedQuestionPartBytes(fullReading)) };
    const full = { v: 1, reading, page: pageOfBytes(SAVED_QUESTION_LIMITS.pageMaxBytes) } as SavedQuestionDoc;
    expect(savedQuestionDocFits(full)).toBe("FITS");
    expect(savedQuestionDocFits({ ...full, wrapper: "x".repeat(1_024) } as SavedQuestionDoc)).toBe("TOO_LARGE");
  });
});

describe("savedQuestionTitleOf", () => {
  const titled = (text: string) => savedQuestionTitleOf(docOf({ page: { box: { text, placed: [] } } }));

  it("is the box's first line that holds words, trimmed", () => {
    expect(titled("Should Romania build new nuclear plants?\n\nUp to 2050.")).toBe("Should Romania build new nuclear plants?");
    expect(titled("\n \n  Up to 2050, please.  \r\nMore")).toBe("Up to 2050, please.");
  });

  it("is the read line when the box holds no words", () => {
    expect(titled("")).toBe(START_FIXTURE_QUESTION);
    expect(titled(" \n\t\n ")).toBe(START_FIXTURE_QUESTION);
  });

  it("is cut to 300 code units, never inside a surrogate pair", () => {
    const emoji = titled("😀".repeat(400));
    expect(emoji).toHaveLength(300);
    expect(emoji).not.toMatch(LONE_SURROGATE);
    const odd = titled(`a${"😀".repeat(400)}`);
    expect(odd).toHaveLength(299);
    expect(odd).not.toMatch(LONE_SURROGATE);
  });
});

describe("savedQuestionOwnWords (what a save screens for crisis words)", () => {
  it("holds the person's own words wherever they sit, each once, and no AI text", () => {
    const words = savedQuestionOwnWords(DOC);
    expect([...words].sort()).toEqual([BOX_TEXT, REWRITTEN_TITLE, REWRITTEN_QUESTION, OWN_VIEW, OWN_IN_MORE, OWN_ONLY_IN_UNDO,
      TYPED_ANSWER].sort());
    expect(new Set(words).size).toBe(words.length);
    const aiText = [COMBINED_TITLE, COMBINED_QUESTION, "The north", "Which region?", "What is the answer for?",
      ...NUCLEAR_MENU.paths.flatMap((path) => [path.title, path.question]),
      ...NUCLEAR_MENU.viewpoints.flatMap((viewpoint) => [viewpoint.title, viewpoint.question])];
    for (const text of aiText) expect(words).not.toContain(text);
  });
});

describe("savedQuestionPartBytes", () => {
  it("counts the UTF-8 bytes of the JSON text", () => {
    expect(savedQuestionPartBytes("中")).toBe(5);
    expect(savedQuestionPartBytes({ a: 1 })).toBe(7);
  });
});

describe("the routes' shapes", () => {
  it("a first save carries the document, a later one its revision too; nothing else", () => {
    expect(SavedQuestionCreateSchema.safeParse({ doc: DOC }).success).toBe(true);
    expect(SavedQuestionCreateSchema.safeParse({ doc: DOC, id: ID }).success).toBe(false);
    expect(SavedQuestionSaveSchema.safeParse({ revision: 3, doc: DOC }).success).toBe(true);
    expect(SavedQuestionSaveSchema.safeParse({ revision: 0, doc: DOC }).success).toBe(false);
    expect(SavedQuestionSaveSchema.safeParse({ doc: DOC }).success).toBe(false);
  });

  it("the list holds at most 20 titles of at most 300 code units", () => {
    const item = { id: ID, question: "q".repeat(300), saved_at: SAVED_AT };
    expect(SavedQuestionSummarySchema.safeParse(item).success).toBe(true);
    expect(SavedQuestionSummarySchema.safeParse({ ...item, question: "q".repeat(301) }).success).toBe(false);
    expect(SavedQuestionSummarySchema.safeParse({ ...item, saved_at: "yesterday" }).success).toBe(false);
    expect(SavedQuestionListSchema.safeParse({ questions: Array.from({ length: 20 }, () => item) }).success).toBe(true);
    expect(SavedQuestionListSchema.safeParse({ questions: Array.from({ length: 21 }, () => item) }).success).toBe(false);
  });

  it("Pick up answers the stored document raw (never parsed, so never trimmed) and whether it is ready", () => {
    const raw = { v: 2, page: { box: { text: " kept as sent \n" } } };
    const parsed = SavedQuestionReadSchema.parse({ id: ID, revision: 2, saved_at: SAVED_AT, state: "NEEDS_READING", doc: raw });
    expect(parsed.doc).toEqual(raw);
    expect(SavedQuestionReadSchema.safeParse({ id: ID, revision: 2, saved_at: SAVED_AT, state: "STALE", doc: raw }).success).toBe(false);
    expect(SavedQuestionWrittenSchema.safeParse({ id: ID, revision: 1 }).success).toBe(true);
    expect(SavedQuestionWrittenSchema.safeParse({ id: ID, revision: 1, saved_at: SAVED_AT }).success).toBe(false);
  });
});

describe("the ask's saved_question_id", () => {
  it("is an optional lowercase uuid, the ask's last key", () => {
    expect(AskRequestSchema.parse({ ...ASK, saved_question_id: ID }).saved_question_id).toBe(ID);
    for (const id of ["abc", "", ID.toUpperCase(), 7]) expect(AskRequestSchema.safeParse({ ...ASK, saved_question_id: id }).success).toBe(false);
    // Task 57e's "Ask this again" link (`again_of`) comes after it.
    expect(Object.keys(AskRequestSchema.shape).slice(-2)).toEqual(["saved_question_id", "again_of"]);
    // The 39d review: PostgreSQL finds an id in capitals, the question-key store (which compares ids as written) does not.
    expect(SavedQuestionSummarySchema.safeParse({ id: ID.toUpperCase(), question: "q", saved_at: SAVED_AT }).success).toBe(false);
    expect(SavedQuestionWrittenSchema.safeParse({ id: ID.toUpperCase(), revision: 1 }).success).toBe(false);
    expect(SavedQuestionWrittenSchema.safeParse({ id: ID, revision: 1 }).success).toBe(true);
  });

  it("an ask without it parses to an object with no saved_question_id key", () => {
    const parsed = AskRequestSchema.parse(ASK);
    expect(Object.hasOwn(parsed, "saved_question_id")).toBe(false);
    expect(parsed).toEqual(ASK);
  });

  it("the generated contract lists it on the ask, optional", async () => {
    const inventory = JSON.parse(await readFile("packages/contract/generated/field-inventory.json", "utf8")) as
      { resources: Record<string, string[]> };
    expect(inventory.resources.AskRequestSchema).toContain("saved_question_id");
    // generate.ts writes each schema it documents as z.toJSONSchema(schema); the ask's is the same call.
    const json = z.toJSONSchema(AskRequestSchema, { unrepresentable: "any" }) as { properties: Record<string, { format?: string }>; required: string[] };
    expect(json.properties.saved_question_id?.format).toBe("uuid");
    expect(json.required).not.toContain("saved_question_id");
    expect(json.required).toContain("question_line");
  });
});
