import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AnswerDigSchema, AnswerPathRewritesSchema, AnswerSchema, AskRoomResponseSchema, BillingUsageResponseSchema, DIG_LEVEL_MAX,
  DIG_PICK_AUTHORS, DIG_TOO_DEEP, DigLevelSchema, DigTooDeepSchema, MonthPauseSchema, PATH_REWRITE_STATES, PathRewriteSchema,
  PathRewritesSchema, POINT_OF_VIEW_OUTCOMES, POINT_OF_VIEW_SCOPES, PointOfViewVerdictSchema, RUN_PAUSED_UNTIL_RESET,
  RunContinueRefusedSchema, RunContinueRequestSchema, RunContinuedSchema, RunProjectionSchema, TRUST_WORDS, UsageBorrowSchema,
  canDigFromLevel, contractInventory, trustOfPoint, webRanOnFree
} from "../../packages/contract/src/index.js";
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";

/**
 * W2-7 (plan 2026-10-30-dig-model-revision.md, owner answers of 30-31 Oct): the outside shapes of the new dig model (a dig
 * rewrites its parent path; digs nest up to 10 levels) and of the money rule (an estimate before a start, running work
 * borrowing from the next day or week, a month pause with Continue, new starts waiting for the reset). Every new member
 * that rides an existing answer, run, room or usage read is OPTIONAL, so everything made before R22 reads exactly as before.
 */
const RUN = "11111111-1111-4111-8111-111111111111";
const DIG = "88888888-8888-4888-8888-888888888888";
const DIG_TWO = "d2000000-0000-4000-8000-000000000002";

const TEXT_BEFORE = Object.freeze({ line: "Renewables and storage alone can carry the grid.", summary: "Cheap and fast to build.", fate: "PARTLY_HELD" });
const TEXT_AFTER = Object.freeze({
  line: "Renewables and storage can carry most of the year, but not several windless winter days yet.",
  summary: "Storage that lasts several days is still costly.", fate: "PARTLY_HELD"
});
const VIEW = Object.freeze({
  outcome: "HELPED", scope: "MAIN_QUESTION", reason: "The dig found the windless weeks you named are the costly part.",
  own_words: ["What about long windless weeks in winter?"]
});

function ready(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    rewrite_id: "rw-1", dig_run_id: DIG, dig_level: 1, dig_finished_at: "2026-10-29T08:12:00.000Z", state: "READY",
    rewritten_at: "2026-10-29T08:14:00.000Z", changed: true, text: TEXT_AFTER,
    what_changed: ["The dig found that storage covering several windless days is not yet cheap, so this path holds for most of the year only."],
    fate_before: "PARTLY_HELD", view: null,
    dig_paths: [{ position_ref: "n-renew", line: "Batteries cover hours, not days.", fate: "HELD_UP" }],
    ...overrides
  };
}
const writing = (overrides: Record<string, unknown> = {}) => ({
  rewrite_id: "rw-2", dig_run_id: DIG_TWO, dig_level: 1, dig_finished_at: "2026-10-30T09:00:00.000Z", state: "WRITING", ...overrides
});
const failed = (overrides: Record<string, unknown> = {}) => ({
  rewrite_id: "rw-3", dig_run_id: DIG_TWO, dig_level: 1, dig_finished_at: "2026-10-30T09:00:00.000Z", state: "FAILED",
  failed_at: "2026-10-30T09:03:00.000Z", ...overrides
});

describe("W2-7 the dig level: 0 for the first debate, at most 10, one constant", () => {
  it("DIG_LEVEL_MAX is 10 and the level schema takes 0-10 whole numbers only", () => {
    expect(DIG_LEVEL_MAX).toBe(10);
    for (const level of [0, 1, 5, 10]) expect(DigLevelSchema.safeParse(level).success, String(level)).toBe(true);
    for (const level of [-1, 11, 2.5, "3"]) expect(DigLevelSchema.safeParse(level).success, String(level)).toBe(false);
  });

  it("a person may dig from levels 0-9; level 10 offers no deeper dig", () => {
    expect([0, 1, 9].map(canDigFromLevel)).toEqual([true, true, true]);
    expect(canDigFromLevel(10)).toBe(false);
    for (const level of [-1, 11, 1.5]) expect(() => canDigFromLevel(level), String(level)).toThrow("DIG_LEVEL_INVALID");
  });

  it("the refusal of a dig past level 10 names the code and the fixed limit", () => {
    expect(DigTooDeepSchema.safeParse({ error: DIG_TOO_DEEP, message: DIG_TOO_DEEP, level_max: 10 }).success).toBe(true);
    expect(DigTooDeepSchema.safeParse({ error: DIG_TOO_DEEP, message: DIG_TOO_DEEP, level_max: 11 }).success).toBe(false);
  });
});

describe("W2-7 one rewrite of a path by a dig", () => {
  it("has four states; a finished rewrite carries the new text, what the dig changed, its fate before and the dig's own paths", () => {
    expect(PATH_REWRITE_STATES).toEqual(["WRITING", "READY", "READY_WITH_RESERVATION", "FAILED"]);
    expect(PathRewriteSchema.safeParse(ready()).success).toBe(true);
    expect(PathRewriteSchema.safeParse(ready({ state: "READY_WITH_RESERVATION" })).success).toBe(true);
    expect(PathRewriteSchema.safeParse(writing()).success).toBe(true);
    expect(PathRewriteSchema.safeParse(failed()).success).toBe(true);
    // A rewrite still writing or one that failed has no text: the path keeps its earlier one.
    expect(PathRewriteSchema.safeParse(writing({ text: TEXT_AFTER })).success).toBe(false);
    expect(PathRewriteSchema.safeParse(failed({ text: TEXT_AFTER })).success).toBe(false);
  });

  it("'what the dig changed' is one to three plain sentences, never refs or numbers from the engine", () => {
    expect(PathRewriteSchema.safeParse(ready({ what_changed: [] })).success).toBe(false);
    expect(PathRewriteSchema.safeParse(ready({ what_changed: ["a.", "b.", "c."] })).success).toBe(true);
    expect(PathRewriteSchema.safeParse(ready({ what_changed: ["a.", "b.", "c.", "d."] })).success).toBe(false);
    expect(PathRewriteSchema.safeParse(ready({ what_changed: [{ text: "a.", rests_on: ["n-1"] }] })).success).toBe(false);
  });

  it("the fate is one of the four; 'no change' keeps the fate it had", () => {
    expect(PathRewriteSchema.safeParse(ready({ text: { ...TEXT_AFTER, fate: "SURE" } })).success).toBe(false);
    expect(PathRewriteSchema.safeParse(ready({ changed: false, text: TEXT_BEFORE })).success).toBe(true);
    expect(PathRewriteSchema.safeParse(ready({ changed: false, text: { ...TEXT_AFTER, fate: "FELL" } })).success).toBe(false);
  });

  it("is a dig's, at level 1-10, rewritten after the dig finished; each of the dig's own paths once", () => {
    expect(PathRewriteSchema.safeParse(ready({ dig_level: 10 })).success).toBe(true);
    expect(PathRewriteSchema.safeParse(ready({ dig_level: 0 })).success).toBe(false);
    expect(PathRewriteSchema.safeParse(ready({ dig_level: 11 })).success).toBe(false);
    expect(PathRewriteSchema.safeParse(ready({ rewritten_at: "2026-10-29T08:00:00.000Z" })).success).toBe(false);
    expect(PathRewriteSchema.safeParse(failed({ failed_at: "2026-10-30T08:00:00.000Z" })).success).toBe(false);
    const twice = [{ position_ref: "n-renew", line: "a", fate: "HELD_UP" }, { position_ref: "n-renew", line: "b", fate: "FELL" }];
    expect(PathRewriteSchema.safeParse(ready({ dig_paths: twice })).success).toBe(false);
  });
});

describe("W2-7 'Your point of view': the verdict on the person's own words", () => {
  it("names an outcome, a scope and the AI's one-sentence reason, beside the person's own words", () => {
    expect(POINT_OF_VIEW_OUTCOMES).toEqual(["HELPED", "DID_NOT_HELP", "NOT_SETTLED"]);
    expect(POINT_OF_VIEW_SCOPES).toEqual(["PATH", "MAIN_QUESTION"]);
    for (const outcome of POINT_OF_VIEW_OUTCOMES) {
      for (const scope of POINT_OF_VIEW_SCOPES) {
        expect(PathRewriteSchema.safeParse(ready({ view: { ...VIEW, outcome, scope } })).success, `${outcome} ${scope}`).toBe(true);
      }
    }
    expect(PathRewriteSchema.safeParse(ready({ view: { ...VIEW, own_words: [] } })).success).toBe(false);
    expect(PathRewriteSchema.safeParse(ready({ view: { ...VIEW, reason: " " } })).success).toBe(false);
    expect(PathRewriteSchema.safeParse(ready({ view: { ...VIEW, outcome: "PROVEN" } })).success).toBe(false);
    expect(PathRewriteSchema.safeParse(ready({ view: { ...VIEW, confidence: 0.8 } })).success).toBe(false);
    expect(PointOfViewVerdictSchema.safeParse(VIEW).success).toBe(true);
  });
});

describe("W2-7 a path's rewrite history, newest last", () => {
  const path = (history: unknown[], current: unknown, extra: Record<string, unknown> = {}) => ({ position_ref: "n-renew", current, history, ...extra });

  it("the current text is the newest finished rewrite's; with none it is null and the story's line stands", () => {
    expect(PathRewritesSchema.safeParse(path([ready()], TEXT_AFTER)).success).toBe(true);
    expect(PathRewritesSchema.safeParse(path([ready()], null)).success).toBe(false);
    expect(PathRewritesSchema.safeParse(path([ready()], TEXT_BEFORE)).success).toBe(false);
    expect(PathRewritesSchema.safeParse(path([writing()], null)).success).toBe(true);
    expect(PathRewritesSchema.safeParse(path([failed()], null)).success).toBe(true);
    // A failed or writing rewrite after a finished one leaves the finished one's text.
    expect(PathRewritesSchema.safeParse(path([ready(), failed()], TEXT_AFTER)).success).toBe(true);
    expect(PathRewritesSchema.safeParse(path([ready(), writing()], TEXT_AFTER)).success).toBe(true);
  });

  it("goes in the order the digs finished, each rewrite based on the one before it", () => {
    const second = ready({
      rewrite_id: "rw-2", dig_run_id: DIG_TWO, dig_finished_at: "2026-10-30T09:00:00.000Z", rewritten_at: "2026-10-30T09:02:00.000Z",
      fate_before: "PARTLY_HELD", text: { ...TEXT_AFTER, line: "Mostly renewables, with firm power for winter.", fate: "HELD_UP" }
    });
    expect(PathRewritesSchema.safeParse(path([ready(), second], second.text)).success).toBe(true);
    expect(PathRewritesSchema.safeParse(path([second, ready()], TEXT_AFTER)).success).toBe(false);
    expect(PathRewritesSchema.safeParse(path([ready(), { ...second, fate_before: "FELL" }], second.text)).success).toBe(false);
    expect(PathRewritesSchema.safeParse(path([ready(), { ...second, rewrite_id: "rw-1" }], second.text)).success).toBe(false);
    expect(PathRewritesSchema.safeParse(path([ready(), { ...second, dig_run_id: DIG }], second.text)).success).toBe(false);
  });

  it("an ancestor path changed only further down says so, and nothing else", () => {
    expect(PathRewritesSchema.safeParse(path([], null, { changed_below: true })).success).toBe(true);
    expect(PathRewritesSchema.safeParse(path([], null)).success).toBe(false);
    expect(PathRewritesSchema.safeParse(path([], null, { changed_below: false })).success).toBe(false);
  });

  it("the answer lists each path once and says how many changed since the answer or the latest report", () => {
    const paths = [path([ready()], TEXT_AFTER), { ...path([], null, { changed_below: true }), position_ref: "n-mix" }];
    const block = (changed_since: unknown, list: unknown[] = paths) => ({ paths: list, changed_since });
    expect(AnswerPathRewritesSchema.safeParse(block({ count: 1, since_report_version: null })).success).toBe(true);
    expect(AnswerPathRewritesSchema.safeParse(block({ count: 0, since_report_version: 2 })).success).toBe(true);
    expect(AnswerPathRewritesSchema.safeParse(block({ count: 2, since_report_version: null })).success).toBe(false);
    expect(AnswerPathRewritesSchema.safeParse(block({ count: 1, since_report_version: 0 })).success).toBe(false);
    expect(AnswerPathRewritesSchema.safeParse(block({ count: 1, since_report_version: null }, [paths[0], paths[0]])).success).toBe(false);
  });
});

describe("W2-7 a dig's own answer says what it dug and what became of the path", () => {
  const PICK_AI = Object.freeze({ kind: "CONTRADICTING", place: "p:n-renew-storage", text: "Can batteries cover several windless days?", by: "AI_SUGGESTION" });
  const PICK_EDITED = Object.freeze({ ...PICK_AI, text: "Can batteries cover a windless week in January?", by: "PERSON_EDITED" });
  const PICK_OWN = Object.freeze({ kind: "OWN_VIEW", place: "path:n-renew", text: "What about long windless weeks in winter?", by: "PERSON_OWN_VIEW" });
  const dig = (picks: unknown[], rewrite: unknown, extra: Record<string, unknown> = {}) => ({
    parent_run_id: RUN, position_ref: "n-renew", places: ["p:n-renew-storage"], level: 1, picks, rewrite, ...extra
  });

  it("names who wrote each pick: an AI suggestion as it was, the person's edit of one, or the person's own view", () => {
    expect(DIG_PICK_AUTHORS).toEqual(["AI_SUGGESTION", "PERSON_EDITED", "PERSON_OWN_VIEW"]);
    expect(AnswerDigSchema.safeParse(dig([PICK_AI], ready())).success).toBe(true);
    expect(AnswerDigSchema.safeParse(dig([{ ...PICK_OWN, by: "AI_SUGGESTION" }], ready())).success).toBe(false);
    expect(AnswerDigSchema.safeParse(dig([{ ...PICK_AI, by: "PERSON_OWN_VIEW" }], ready())).success).toBe(false);
  });

  it("carries the verdict exactly when a pick carries the person's own words (owner Q-D4), quoting them in order", () => {
    expect(AnswerDigSchema.safeParse(dig([PICK_AI], ready({ view: VIEW }))).success).toBe(false);
    expect(AnswerDigSchema.safeParse(dig([PICK_OWN], ready())).success).toBe(false);
    expect(AnswerDigSchema.safeParse(dig([PICK_OWN], ready({ view: VIEW }))).success).toBe(true);
    expect(AnswerDigSchema.safeParse(dig([PICK_EDITED, PICK_OWN], ready({ view: { ...VIEW, own_words: [PICK_EDITED.text, PICK_OWN.text] } }))).success).toBe(true);
    expect(AnswerDigSchema.safeParse(dig([PICK_EDITED, PICK_OWN], ready({ view: { ...VIEW, own_words: [PICK_OWN.text, PICK_EDITED.text] } }))).success).toBe(false);
    // Still writing or failed: no verdict yet, whoever wrote the picks.
    expect(AnswerDigSchema.safeParse(dig([PICK_OWN], writing({ dig_run_id: DIG }))).success).toBe(true);
  });

  it("sits at level 1-10, and its rewrite is of its own level", () => {
    expect(AnswerDigSchema.safeParse(dig([PICK_AI], ready({ dig_level: 10 }), { level: 10 })).success).toBe(true);
    expect(AnswerDigSchema.safeParse(dig([PICK_AI], ready(), { level: 0 })).success).toBe(false);
    expect(AnswerDigSchema.safeParse(dig([PICK_AI], ready(), { level: 11 })).success).toBe(false);
    expect(AnswerDigSchema.safeParse(dig([PICK_AI], ready(), { level: 3 })).success).toBe(false);
  });

  it("a dig of an open question under the main question rewrites no path", () => {
    expect(AnswerDigSchema.safeParse(dig([PICK_AI], null, { position_ref: null })).success).toBe(true);
    expect(AnswerDigSchema.safeParse(dig([PICK_AI], ready(), { position_ref: null })).success).toBe(false);
  });
});

describe("W2-7 the money rule's words: estimate, borrow, month pause, new starts after the reset", () => {
  const ROOM_FITS = Object.freeze({ room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: "PLUS" });
  const FULL_DAY = Object.freeze({ room: "FULL", scope: "PERSON_DAY", resets_at: "2026-11-01T00:00:00.000Z", waiting_run_ref: null, plan_id: "PLUS" });

  it("a new question's estimate is a share of today in steps of 5, never beside a dig's", () => {
    expect(AskRoomResponseSchema.safeParse({ ...ROOM_FITS, start_share_percent: 15 }).success).toBe(true);
    expect(AskRoomResponseSchema.safeParse({ ...ROOM_FITS, start_share_percent: 12 }).success).toBe(false);
    expect(AskRoomResponseSchema.safeParse({ ...ROOM_FITS, start_share_percent: 15, dig_share_percent: 20 }).success).toBe(false);
  });

  it("new starts wait for the reset of a full person window; running work goes on", () => {
    expect(AskRoomResponseSchema.safeParse({ ...FULL_DAY, new_starts: "BLOCKED_UNTIL_RESET" }).success).toBe(true);
    expect(AskRoomResponseSchema.safeParse({ ...FULL_DAY, scope: "PERSON_WEEK", new_starts: "BLOCKED_UNTIL_RESET" }).success).toBe(true);
    expect(AskRoomResponseSchema.safeParse({ ...FULL_DAY, scope: "PERSON_MONTH", new_starts: "BLOCKED_UNTIL_RESET" }).success).toBe(true);
    expect(AskRoomResponseSchema.safeParse({ ...ROOM_FITS, new_starts: "BLOCKED_UNTIL_RESET" }).success).toBe(false);
    expect(AskRoomResponseSchema.safeParse({ ...FULL_DAY, scope: "SITE_DAY", new_starts: "BLOCKED_UNTIL_RESET" }).success).toBe(false);
    expect(AskRoomResponseSchema.safeParse({ ...FULL_DAY, new_starts: "QUEUED" }).success).toBe(false);
  });

  it("the usage read tells what running work borrowed from the next day or week, as a whole share", () => {
    const usage = {
      plan_id: "PLUS",
      windows: [{ scope: "PERSON_DAY", percent: 104, resets_at: "2026-11-01T00:00:00.000Z" }]
    };
    const borrow = { scope: "PERSON_DAY", run_ref: RUN, percent: 4, next_window_starts_at: "2026-11-01T00:00:00.000Z" };
    expect(BillingUsageResponseSchema.safeParse(usage).success).toBe(true);
    expect(BillingUsageResponseSchema.safeParse({ ...usage, borrowed: [borrow] }).success).toBe(true);
    expect(BillingUsageResponseSchema.safeParse({ ...usage, borrowed: [{ ...borrow, scope: "PERSON_WEEK" }, borrow] }).success).toBe(true);
    expect(BillingUsageResponseSchema.safeParse({ ...usage, borrowed: [borrow, borrow] }).success).toBe(false);
    // The month is the wall: nothing is borrowed from the next month.
    expect(UsageBorrowSchema.safeParse({ ...borrow, scope: "PERSON_MONTH" }).success).toBe(false);
    for (const percent of [0, 2.5, 101]) expect(UsageBorrowSchema.safeParse({ ...borrow, percent }).success, String(percent)).toBe(false);
    expect(UsageBorrowSchema.safeParse({ ...borrow, micros: 40_000 }).success).toBe(false);
  });

  it("a running debate paused at the month wall says until when, and offers Continue once the month reset", () => {
    const run = { run_ref: RUN, question_line: "Should I move?", state: "RUNNING", terminal_reason: null, hold_until: null };
    const pause = { until: "2026-11-01T00:00:00.000Z", can_continue: false };
    expect(RunProjectionSchema.safeParse(run).success).toBe(true);
    expect(RunProjectionSchema.safeParse({ ...run, month_pause: pause }).success).toBe(true);
    expect(RunProjectionSchema.safeParse({ ...run, month_pause: { ...pause, can_continue: true } }).success).toBe(true);
    for (const state of ["SETTLED", "WAITING", "QUEUED"]) {
      const other = state === "WAITING" ? { ...run, state, waits_until: pause.until } : { ...run, state };
      expect(RunProjectionSchema.safeParse({ ...other, month_pause: pause }).success, state).toBe(false);
    }
    expect(MonthPauseSchema.safeParse({ until: "next month", can_continue: false }).success).toBe(false);
    expect(RunContinueRequestSchema.safeParse({}).success).toBe(true);
    expect(RunContinueRequestSchema.safeParse({ pay_again: true }).success).toBe(false);
    expect(RunContinuedSchema.safeParse({ state: "CONTINUING" }).success).toBe(true);
    expect(RunContinueRefusedSchema.safeParse({ error: RUN_PAUSED_UNTIL_RESET, message: RUN_PAUSED_UNTIL_RESET, until: pause.until }).success).toBe(true);
  });
});

describe("W4-8 a rewritten path's points and trust words (owner Q-D3)", () => {
  const SURE_POINT = { review: { outcome: "agree" }, staleness_state: "FRESH", way_of_knowing: "LOOKED_UP", looked_up_checked: true };

  it("a finished rewrite may name the points it rests on and the words of every point the path counts; old ones parse unchanged", () => {
    const old = ready();
    expect(PathRewriteSchema.parse(old)).toEqual(old);
    const served = ready({ rests_on: ["n-1", "n-dig-2"], trust: [{ node_id: "n-1", word: "SURE" }, { node_id: "n-dig-2", word: null }] });
    expect(PathRewriteSchema.parse(served)).toEqual(served);
    expect(PathRewriteSchema.safeParse(ready({ rests_on: [] })).success).toBe(true);
    // A writing or failed rewrite carries neither.
    expect(PathRewriteSchema.safeParse(writing({ rests_on: [] })).success).toBe(false);
    expect(PathRewriteSchema.safeParse(failed({ trust: [] })).success).toBe(false);
  });

  it("each point once; words are the page's four codes or none, never a number", () => {
    expect(PathRewriteSchema.safeParse(ready({ rests_on: ["n-1", "n-1"] })).success).toBe(false);
    expect(PathRewriteSchema.safeParse(ready({ trust: [{ node_id: "n-1", word: "SURE" }, { node_id: "n-1", word: "SURE" }] })).success).toBe(false);
    expect(TRUST_WORDS).toEqual(["SURE", "SURE_FOR_CASE", "STILL_ARGUED", "DIDNT_HOLD"]);
    for (const word of TRUST_WORDS) expect(PathRewriteSchema.safeParse(ready({ trust: [{ node_id: "n-1", word }] })).success, word).toBe(true);
    for (const word of ["UNSURE", 0.9, 1]) expect(PathRewriteSchema.safeParse(ready({ trust: [{ node_id: "n-1", word }] })).success, String(word)).toBe(false);
    expect(PathRewriteSchema.safeParse(ready({ trust: [{ node_id: "n-1", word: "SURE", score: 0.9 }] })).success).toBe(false);
  });

  it("the one rule: 'Sure' only with the server's checked looked-up flag, a second AI agreeing, fresh, and never on Free", () => {
    expect(trustOfPoint(SURE_POINT, { free: false, fell: false })).toEqual({ trust: "SURE", basis: "WEB_CHECKED_AND_AGREED" });
    expect(trustOfPoint({ ...SURE_POINT, looked_up_checked: false }, { free: false, fell: false }))
      .toEqual({ trust: "SURE_FOR_CASE", basis: "LOOKED_UP_AND_AGREED" });
    expect(trustOfPoint({ ...SURE_POINT, looked_up_checked: undefined }, { free: false, fell: false }).trust).toBe("SURE_FOR_CASE");
    expect(trustOfPoint(SURE_POINT, { free: true, fell: false }).trust).toBe("SURE_FOR_CASE");
    expect(trustOfPoint({ ...SURE_POINT, staleness_state: "STALE" }, { free: false, fell: false }))
      .toEqual({ trust: "SURE_FOR_CASE", basis: "AGREED_BUT_DATED" });
    expect(trustOfPoint({ ...SURE_POINT, way_of_knowing: "REASONING" }, { free: false, fell: false }))
      .toEqual({ trust: "SURE_FOR_CASE", basis: "ARGUED_AND_AGREED" });
    expect(trustOfPoint({ ...SURE_POINT, review: { outcome: "dispute" } }, { free: false, fell: false }))
      .toEqual({ trust: "STILL_ARGUED", basis: "DISPUTED" });
    expect(trustOfPoint({ ...SURE_POINT, review: { outcome: "cannot-assess" } }, { free: false, fell: false }))
      .toEqual({ trust: "STILL_ARGUED", basis: "COULD_NOT_CHECK" });
    expect(trustOfPoint({ ...SURE_POINT, review: null }, { free: false, fell: false })).toEqual({ trust: null, basis: null });
    // The position of a path that fell does not hold, whatever its review said.
    expect(trustOfPoint({ ...SURE_POINT, review: null }, { free: false, fell: true })).toEqual({ trust: "DIDNT_HOLD", basis: "FELL" });
  });

  it("a debate ran on Free when its web part has a path not on the plan", () => {
    expect(webRanOnFree(undefined)).toBe(false);
    expect(webRanOnFree({ paths: [{ search: { status: "SEARCHED" } }] })).toBe(false);
    expect(webRanOnFree({ paths: [{ search: { status: "SEARCHED" } }, { search: { status: "NOT_ON_PLAN" } }] })).toBe(true);
  });
});

describe("W2-7 old answers read unchanged; the inventory and the no-number rule", () => {
  it("an answer made before R22 parses as it was; a new one may carry the rewrites and, for a dig, what it dug", () => {
    const old = buildFairShapedAnswer();
    expect(AnswerSchema.parse(old)).toEqual(old);
    const rewrites = { paths: [{ position_ref: "n-renew", current: TEXT_AFTER, history: [ready()] }], changed_since: { count: 1, since_report_version: null } };
    expect(AnswerSchema.safeParse({ ...old, path_rewrites: rewrites }).success).toBe(true);
    const digPart = { parent_run_id: RUN, position_ref: "n-renew", places: ["p:n-renew-storage"], level: 1, picks: [], rewrite: ready() };
    expect(AnswerSchema.safeParse({ ...old, dig: digPart }).success).toBe(true);
    expect(AnswerSchema.safeParse({ ...old, dig: { ...digPart, level: 12 } }).success).toBe(false);
  });

  const NEW = {
    PathRewriteSchema, PathRewritesSchema, AnswerPathRewritesSchema, AnswerDigSchema, PointOfViewVerdictSchema, DigTooDeepSchema, MonthPauseSchema,
    UsageBorrowSchema, RunContinueRequestSchema, RunContinuedSchema, RunContinueRefusedSchema
  };

  function keysOf(schema: z.core.$ZodType, seen = new Set<z.core.$ZodType>()): string[] {
    if (seen.has(schema)) return [];
    seen.add(schema);
    if (schema instanceof z.ZodObject) return Object.entries(schema.shape).flatMap(([key, child]) => [key, ...keysOf(child as z.core.$ZodType, seen)]);
    if (schema instanceof z.ZodArray) return keysOf(schema.element as z.core.$ZodType, seen);
    if (schema instanceof z.ZodNullable || schema instanceof z.ZodOptional) return keysOf(schema.unwrap() as z.core.$ZodType, seen);
    if (schema instanceof z.ZodUnion) return schema.options.flatMap((option) => keysOf(option as z.core.$ZodType, seen));
    return [];
  }

  it("no new shape carries a grade, score, price, cost or amount", () => {
    for (const [name, schema] of Object.entries(NEW)) {
      expect(keysOf(schema).filter((key) => /grade|score|strength|price|cost|micros|amount/iu.test(key)), name).toEqual([]);
    }
  });

  it("lists every new shape in the contract inventory and adds no route", () => {
    const resources = contractInventory.resources as unknown as Record<string, unknown>;
    for (const [name, schema] of Object.entries(NEW)) expect(resources[name], name).toBe(schema);
    // R22 W3-8 later registered one route for these shapes, Continue (POST /v1/runs/{id}/continue): 180 + 1.
    expect(contractInventory.routes).toHaveLength(181);
  });
});
