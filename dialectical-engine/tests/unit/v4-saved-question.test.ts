import { describe, expect, it } from "vitest";
import {
  SAVED_QUESTION_LIMITS, SavedQuestionDocSchema, savedQuestionDocFits, savedQuestionPartBytes, type AskClarifyResponse, type AskRequest,
  type ContractClient, type SavedQuestionDoc
} from "@debateai/contract";

// @ts-expect-error -- the root test compiler has no JSX mode; Vitest transpiles this TSX module.
import { buildNewDebateAskConfig } from "../../apps/ui/app/new/defaults.js";
import { createDebate } from "../../apps/ui/lib/api.js";
import { pathPlanChanged, pathPlanFromMenu, pathPlanReduce, type PathPlan, type PathPlanAction, type PathPlanSnapshot } from "../../apps/ui/lib/v4/pathPlan.js";
import { boxOf, boxPlace } from "../../apps/ui/lib/v4/questionBox.js";
import { keptOfSaved, SAVE_PAUSE_MS, savedDocOf, withUndoTrimmed } from "../../apps/ui/lib/v4/savedQuestion.js";
import type { V4StartKept, V4StartReading } from "../../apps/ui/lib/v4/startKept.js";
import { NUCLEAR_MENU, START_FIXTURE_QUESTION, signedList, signedMenu } from "../support/v4-start-menu.js";

/*
 * V4 start step, Task 76f (saved-questions spec 2026-11-04 §3.2, §3.3, §3.14; owner answers S1 A and S3 A): step 2 as the
 * account keeps it. savedDocOf writes the page's kept step 2 and the reading the server signed as one document; keptOfSaved
 * reads it back for the page's restore (null for a version the page cannot read); withUndoTrimmed drops the oldest Undo steps
 * until the page's part fits. Every text and figure is made up.
 */

const Q = START_FIXTURE_QUESTION;
const PAGE_MAX = SAVED_QUESTION_LIMITS.pageMaxBytes;

function reduced(plan: PathPlan, ...actions: PathPlanAction[]): PathPlan {
  return actions.reduce((held, action) => pathPlanReduce(held, action).plan, plan);
}

/** Five shaped paths: kp01 and kp02 combined and written by the AI combine ("cmb.sig"), then an own path; a width step too. */
function shapedPlan(): PathPlan {
  const combined = reduced(pathPlanFromMenu(NUCLEAR_MENU, 5, false), { type: "SELECT", key: "kp01" }, { type: "SELECT", key: "kp02" },
    { type: "COMBINE_SELECTED" });
  const writing = combined.paths.find((path) => path.wording === "WRITING")!;
  return reduced(combined,
    { type: "COMBINE_WRITTEN", key: writing.key, title: "Hard weeks and using less", question: "How would Romania get through its hardest weeks?",
      combineRef: "cmb.sig" },
    { type: "ADD_OWN", text: "Fish in the Danube", intoPathKey: null });
}

const BOX = boxPlace(boxOf(Q), { key: "Until when?", text: "Until when? Up to 2050." }, ["Until when?"]);
const CLARIFY: AskClarifyResponse = { source: "AI", questions: [{ text: "Until when?", answers: ["Up to 2030.", "Up to 2050."] }] };

function keptOf(plan: PathPlan = shapedPlan(), over: Partial<V4StartKept> = {}): V4StartKept {
  return {
    v: 1, readLine: Q, box: BOX, sentGoal: { answers: [{ question: "Until when?", answer: "Up to 2050.", other: false }], matters: "" },
    clarify: CLARIFY, check: { ref: "chk.sig" }, menu: signedMenu(NUCLEAR_MENU), lists: [], lateLists: [signedList(3)], end: "READY",
    plan, width: plan.width, mode: "thorough", carryOn: true, ...over
  };
}

function readingOf(over: Partial<V4StartReading> = {}): V4StartReading {
  return {
    check: { ref: "chk.sig" }, menu: signedMenu(NUCLEAR_MENU), lateLists: [signedList(3)], end: "READY", checkedLine: Q,
    readingLevel: "background", language: { code: "en", name: "English" }, seats: 4, ...over
  };
}

/** The document as the wire carries it (and as Pick up answers it): JSON text, parsed again. */
function overTheWire(doc: SavedQuestionDoc): SavedQuestionDoc {
  return JSON.parse(JSON.stringify(doc)) as SavedQuestionDoc;
}

/** One Undo step whose single path carries `bytes` letters of made-up words. */
function bigStep(kind: "CHANGE" | "WIDTH", bytes: number, base: PathPlan): PathPlanSnapshot {
  const path = base.paths[0]!;
  return { paths: [{ ...path, question: "x".repeat(bytes) }], more: [], width: base.width, done: [], questionSwap: null, kind };
}

const REST = { box: BOX, sent_goal: { answers: [], matters: "" }, width: 5, mode: "quick", carry_on: false };
const pageBytes = (plan: PathPlan, rest: unknown = REST): number => savedQuestionPartBytes({ ...(rest as object), plan });

describe("the saved document (saved-questions spec §3.2)", () => {
  it("SAVE_PAUSE_MS is one second", () => {
    expect(SAVE_PAUSE_MS).toBe(1_000);
  });

  it("savedDocOf, then keptOfSaved over the wire, gives back the plan, the box, the answers, the menu, the late lists, How wide, the mode and the carry-on tick", () => {
    const kept = keptOf();
    const doc = savedDocOf({ kept, reading: readingOf() });
    expect(SavedQuestionDocSchema.safeParse(doc).success).toBe(true);
    expect(savedQuestionDocFits(doc)).toBe("FITS");
    expect(doc.reading).toEqual({
      read_line: Q, reading_level: "background", check: { ref: "chk.sig" }, language: { code: "en", name: "English" }, seats: 4,
      clarify: CLARIFY, menu: signedMenu(NUCLEAR_MENU), late_lists: [signedList(3)], end: "READY"
    });
    const back = keptOfSaved(overTheWire(doc));
    expect(back).not.toBeNull();
    expect(back!.plan).toEqual(kept.plan);
    expect(back!.box).toEqual(kept.box);
    expect(back!.sentGoal).toEqual(kept.sentGoal);
    expect(back!.clarify).toEqual(kept.clarify);
    expect(back!.menu).toEqual(kept.menu);
    expect(back!.lateLists).toEqual(kept.lateLists);
    expect(back!.check).toEqual(kept.check);
    expect(back!.readLine).toBe(Q);
    expect(back!.end).toBe("READY");
    expect(back!.width).toBe(kept.width);
    expect(back!.mode).toBe("thorough");
    expect(back!.carryOn).toBe(true);
    // Every combined path, on the list, under "+ N more" and in every Undo step, comes back character for character.
    const combinedOf = (plan: PathPlan) => [plan, ...plan.undo].flatMap((step) => [...step.paths, ...step.more])
      .filter((path) => path.wording === "COMBINED");
    const before = combinedOf(kept.plan);
    const after = combinedOf(back!.plan);
    expect(before.length).toBeGreaterThan(0);
    expect(after).toHaveLength(before.length);
    before.forEach((path, at) => {
      expect(after[at]!.title).toBe(path.title);
      expect(after[at]!.question).toBe(path.question);
      expect(after[at]!.combineRef).toBe(path.combineRef);
    });
    expect(after.some((path) => path.combineRef === "cmb.sig")).toBe(true);
  });

  it("an accepted rewrite keeps the person's words in the check; a reading with no list keeps an empty plan and its reason", () => {
    const rewritten = savedDocOf({ kept: keptOf(), reading: readingOf({ check: { ref: "chk.sig", original_question_line: "Romania, nuclear?" } }) });
    expect(keptOfSaved(overTheWire(rewritten))!.check).toEqual({ ref: "chk.sig", original_question_line: "Romania, nuclear?" });
    const empty: PathPlan = { ...shapedPlan(), paths: [], more: [], undo: [], selected: [] };
    const none = savedDocOf({ kept: keptOf(empty, { menu: null, end: "NONE", noneReason: "DEADLINE", lateLists: [] }),
      reading: readingOf({ menu: null, end: "NONE", noneReason: "DEADLINE", lateLists: [], language: null, seats: null }) });
    expect(none.reading).toMatchObject({ end: "NONE", none_reason: "DEADLINE", menu: null });
    expect(none.reading).not.toHaveProperty("language");
    expect(none.reading).not.toHaveProperty("seats");
    expect(SavedQuestionDocSchema.safeParse(none).success).toBe(true);
    const back = keptOfSaved(overTheWire(none))!;
    expect(back).toMatchObject({ end: "NONE", noneReason: "DEADLINE", menu: null });
    expect(back.plan.paths).toEqual([]);
  });

  it("only version 1 reads: v 2, a missing half or no object at all is null", () => {
    const doc = overTheWire(savedDocOf({ kept: keptOf(), reading: readingOf() }));
    expect(keptOfSaved({ ...doc, v: 2 } as unknown as SavedQuestionDoc)).toBeNull();
    const { page: _page, ...noPage } = doc;
    expect(keptOfSaved(noPage as unknown as SavedQuestionDoc)).toBeNull();
    expect(keptOfSaved(null as unknown as SavedQuestionDoc)).toBeNull();
    expect(keptOfSaved({ ...doc, reading: { ...doc.reading, end: "READY", menu: null } })).toBeNull();
  });
});

describe("Start names the saved question (spec §3.7)", () => {
  const ID = "5a1c0f3e-2b7d-4c9e-8f00-000000000a01";
  const BASE = {
    riskTier: "standard", budgetTier: "low", decisionScope: "saved question", asOf: "2026-11-05T09:00:00.000Z",
    depth: 2, asOfWasEdited: false, planTier: "premium"
  } as const;

  it("createDebate sends the lane's savedQuestionId as saved_question_id; without it the ask is today's", async () => {
    const asks: AskRequest[] = [];
    const client = { submitAsk: async (ask: AskRequest) => { asks.push(ask); return { run_ref: "run:saved", status: "QUEUED" }; } } as unknown as ContractClient;
    const config = buildNewDebateAskConfig(BASE, new Date("2026-11-05T10:00:00.000Z"));
    await createDebate(Q, config, "test-token", client, undefined, undefined, undefined, undefined,
      { startCheck: { ref: "chk.sig" }, savedQuestionId: ID });
    expect(asks[0]!.saved_question_id).toBe(ID);
    expect(asks[0]!.start_check).toEqual({ ref: "chk.sig" });
    await createDebate(Q, config, "test-token", client, undefined, undefined, undefined, undefined, { startCheck: { ref: "chk.sig" } });
    expect(asks[1]).not.toHaveProperty("saved_question_id");
    expect(Object.keys(asks[1]!)).toEqual(Object.keys(asks[0]!).filter((key) => key !== "saved_question_id"));
  });
});

describe("withUndoTrimmed (saved-questions spec §3.14: the oldest Undo steps go first)", () => {
  it("a plan with no Undo comes back unchanged, and so does one that fits", () => {
    const plain = pathPlanFromMenu(NUCLEAR_MENU, 5, false);
    expect(withUndoTrimmed(plain, PAGE_MAX, REST)).toBe(plain);
    const shaped = shapedPlan();
    expect(shaped.undo.length).toBeGreaterThan(0);
    expect(withUndoTrimmed(shaped, PAGE_MAX, REST)).toBe(shaped);
  });

  it("drops the oldest steps first until the page part is within 262_144 bytes", () => {
    const base = pathPlanFromMenu(NUCLEAR_MENU, 5, false);
    const undo = Array.from({ length: 8 }, (_, at) => bigStep(at % 2 === 0 ? "CHANGE" : "WIDTH", 40_000, base));
    const plan: PathPlan = { ...base, undo };
    expect(pageBytes(plan)).toBeGreaterThan(PAGE_MAX);
    const trimmed = withUndoTrimmed(plan, PAGE_MAX, REST)!;
    expect(trimmed).not.toBeNull();
    expect(trimmed.undo.length).toBeLessThan(undo.length);
    expect(trimmed.undo.length).toBeGreaterThan(0);
    // The newest steps stay, in their order; one more older step would not fit.
    expect(trimmed.undo).toEqual(undo.slice(-trimmed.undo.length));
    expect(pageBytes(trimmed)).toBeLessThanOrEqual(PAGE_MAX);
    expect(pageBytes({ ...plan, undo: undo.slice(-(trimmed.undo.length + 1)) })).toBeGreaterThan(PAGE_MAX);
    expect(trimmed.paths).toBe(plan.paths);
  });

  it("keeps the newest CHANGE step when dropping the oldest would take every one, so pathPlanChanged stays true", () => {
    const base = pathPlanFromMenu(NUCLEAR_MENU, 5, false);
    const change = bigStep("CHANGE", 60_000, base);
    const width = bigStep("WIDTH", 220_000, base);
    const plan: PathPlan = { ...base, undo: [change, width] };
    expect(pathPlanChanged(plan)).toBe(true);
    expect(pageBytes(plan)).toBeGreaterThan(PAGE_MAX);
    const trimmed = withUndoTrimmed(plan, PAGE_MAX, REST)!;
    expect(trimmed.undo).toEqual([change]);
    expect(pathPlanChanged(trimmed)).toBe(true);
    // When even the newest CHANGE step does not fit, every Undo step goes.
    const huge: PathPlan = { ...base, undo: [bigStep("CHANGE", 300_000, base)] };
    expect(withUndoTrimmed(huge, PAGE_MAX, REST)!.undo).toEqual([]);
  });

  it("a page part over 262_144 bytes with no Undo at all is null (that change is not sent)", () => {
    const base = pathPlanFromMenu(NUCLEAR_MENU, 5, false);
    const rest = { ...REST, box: { text: "y".repeat(PAGE_MAX), placed: [] } };
    expect(withUndoTrimmed(base, PAGE_MAX, rest)).toBeNull();
    expect(withUndoTrimmed({ ...base, undo: [bigStep("CHANGE", 1_000, base)] }, PAGE_MAX, rest)).toBeNull();
  });
});
