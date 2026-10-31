/*
 * The new dig model and the money rule in the mock's seeded debates (plan 2026-10-30-dig-model-revision.md, task W2-7; owner
 * answers of 30-31 Oct). The shapes are the contract's (packages/contract/src/web.ts); every text here is MADE UP.
 *
 * The dig trail, three levels down from the first debate (1111, level 0):
 *   - 8888 (level 1) dug 1111's path n-renew from an AI suggestion chosen as it was: READY rewrite, no verdict.
 *   - d100 (level 1) dug 1111's path n-mix with the person's own view and their edit of a suggestion: READY rewrite with
 *     the verdict "helped this path and the main question".
 *   - d200 (level 2) dug 8888's path n-renew with the person's own view: READY rewrite with "did not help this path"; so
 *     1111's n-renew (the path 8888 dug) is marked "a dig further down changed part of this".
 *   - d300 (level 3) dug d200's path n-nuclear from an AI suggestion: its rewrite is still WRITING.
 *   - d400 (level 1, task W4-6) dug 1111's path n-nuclear: its rewrite FAILED (the path keeps its text).
 *   - d500 (level 1, task W4-6) dug 1111's path n-smr: its rewrite is READY but changed nothing ("no change").
 * So the first debate's map shows all four states of draft 5.5: rewritten, rewriting (on d200), failed and no change.
 * Every dig keeps its points and its answer text (owner Q-D13); only its story is dropped. The mock's stories stay, but
 * since task W4-6 the website never reads a dig's story: a dig's map is drawn from its rewrite's own paths.
 *
 * The deepest level (task W3-4): a dig at level 10 (DIG_LEVEL_MAX), hung under d300 for the click-test of the "deepest
 * level" line. The six digs between levels 3 and 10 are NOT seeded: only its own answer says level 10, so its map offers
 * no dig anywhere. A dig the page sends from any other debate gets its parent's level + 1, and past 10 a 409 DIG_TOO_DEEP.
 *
 * The money rule: a paused debate (the month wall; Continue once the month resets) and a usage read that says running work
 * borrowed from tomorrow's allowance (switch usage=BORROWED).
 */
import type { AnswerDig, AnswerPathRewrites, DugPick, PathRewrite, UsageBorrow } from "../../packages/contract/src/web.js";

/** A finished rewrite (the checker passed it): it carries the path's new text. */
type ReadyRewrite = Extract<PathRewrite, { state: "READY" }>;

export const DIG_RUNS = Object.freeze({
  root: "11111111-1111-4111-8111-111111111111",
  levelOne: "88888888-8888-4888-8888-888888888888",
  ownView: "d1000000-0000-4000-8000-000000000001",
  levelTwo: "d2000000-0000-4000-8000-000000000002",
  levelThree: "d3000000-0000-4000-8000-000000000003",
  /** Task W4-6: a dig whose rewrite failed, and one whose rewrite changed nothing. */
  failed: "d4000000-0000-4000-8000-000000000004",
  noChange: "d5000000-0000-4000-8000-000000000005"
});
/** A debate whose planned AI calls and searches paused at the month wall. */
export const RUN_PAUSED = "e1000000-0000-4000-8000-000000000001";

/** When each seeded dig finished (its run settled); the mock's runs settle at these moments. */
export const DIG_FINISHED_AT = Object.freeze({
  levelOne: "2026-10-29T08:12:00.000Z",
  ownView: "2026-10-29T10:20:00.000Z",
  levelTwo: "2026-10-30T09:15:00.000Z",
  levelThree: "2026-10-30T15:40:00.000Z",
  failed: "2026-10-30T12:00:00.000Z",
  noChange: "2026-10-30T12:30:00.000Z"
});

/** The dig's own paths (every mock answer is the same debate, so every dig has these four), with the rewrite's lines. */
const STORAGE_DIG_PATHS = [
  { position_ref: "n-mix", line: "Batteries for the hours, plus a firm back-up for windless weeks, cover the grid at a cost most countries can carry.", fate: "HELD_UP" },
  { position_ref: "n-renew", line: "Batteries and power lines alone can already cover several windless days.", fate: "FELL" },
  { position_ref: "n-nuclear", line: "Only firm plants such as nuclear can carry a windless week.", fate: "PARTLY_HELD" },
  { position_ref: "n-smr", line: "Storage lasting whole weeks will be cheap within a few years.", fate: "SET_ASIDE" }
] as const;

const PICK_STORAGE: DugPick = {
  kind: "CONTRADICTING", place: "p:n-renew-storage", by: "AI_SUGGESTION",
  text: "Can batteries and power lines really cover several windless days at an acceptable cost?"
};
const PICK_OWN_BACKUP: DugPick = {
  kind: "OWN_VIEW", place: "path:n-mix", by: "PERSON_OWN_VIEW",
  text: "Keeping some old gas plants as a back-up for winter might be cheaper than building new nuclear."
};
const PICK_EDITED_LAND: DugPick = {
  kind: "UNDOCUMENTED", place: "p:n-mix-land", by: "PERSON_EDITED",
  text: "Nuclear needs less land than wind or solar: does that matter in a small, crowded country like mine?"
};
const PICK_OWN_HYDRO: DugPick = {
  kind: "OWN_VIEW", place: "path:n-renew", by: "PERSON_OWN_VIEW",
  text: "Pumped hydro in the mountains could carry a windless week."
};
const PICK_BUILD_TIMES: DugPick = {
  kind: "HELPS_MAIN_QUESTION", place: "path:n-nuclear", by: "AI_SUGGESTION",
  text: "Were reactors built faster outside Europe and North America, and could that be repeated here?"
};

const REWRITE_LEVEL_ONE: ReadyRewrite = {
  rewrite_id: "rw-8888-n-renew", dig_run_id: DIG_RUNS.levelOne, dig_level: 1, dig_finished_at: DIG_FINISHED_AT.levelOne,
  state: "READY", rewritten_at: "2026-10-29T08:14:30.000Z", changed: true,
  text: {
    line: "Only renewables and storage: partly held. It is the cheapest and fastest way to add clean power, but batteries cover hours, not the several windless days a winter can bring.",
    summary: "Cheapest and fastest to build; storage that lasts several days is not yet affordable.",
    fate: "PARTLY_HELD"
  },
  what_changed: [
    "The dig found that today's batteries cover hours, not several windless days, so the claim this path rested on did not hold.",
    "It left open whether storage lasting whole weeks will become cheap."
  ],
  fate_before: "PARTLY_HELD", view: null, dig_paths: [...STORAGE_DIG_PATHS]
};

const REWRITE_OWN_VIEW: ReadyRewrite = {
  rewrite_id: "rw-d100-n-mix", dig_run_id: DIG_RUNS.ownView, dig_level: 1, dig_finished_at: DIG_FINISHED_AT.ownView,
  state: "READY", rewritten_at: "2026-10-29T10:23:00.000Z", changed: true,
  text: {
    line: "Mostly renewables, plus some firm power: held up. Keeping some existing plants as a winter back-up can be cheaper than building new nuclear, so new nuclear is one choice among several.",
    summary: "Wind and sun first; firm power for winter from existing plants or some new nuclear.",
    fate: "HELD_UP"
  },
  what_changed: [
    "The dig found that keeping some existing plants as a back-up costs less than building new firm power, so new nuclear is no longer the only firm choice here.",
    "Land use mattered only for the smallest, most crowded countries."
  ],
  fate_before: "HELD_UP",
  view: {
    outcome: "HELPED", scope: "MAIN_QUESTION",
    reason: "The back-up you named turned out to be the cheaper way to cover winter, which changes how much new nuclear the answer needs.",
    own_words: [PICK_OWN_BACKUP.text, PICK_EDITED_LAND.text]
  },
  dig_paths: [
    { position_ref: "n-mix", line: "Keep some existing plants as a winter back-up while wind and sun grow.", fate: "HELD_UP" },
    { position_ref: "n-renew", line: "Build only renewables and storage, and close every old plant.", fate: "PARTLY_HELD" },
    { position_ref: "n-nuclear", line: "Build new nuclear as the winter back-up.", fate: "FELL" },
    { position_ref: "n-smr", line: "Small reactors on old coal sites.", fate: "SET_ASIDE" }
  ]
};

const REWRITE_LEVEL_TWO: ReadyRewrite = {
  rewrite_id: "rw-d200-n-renew", dig_run_id: DIG_RUNS.levelTwo, dig_level: 2, dig_finished_at: DIG_FINISHED_AT.levelTwo,
  state: "READY", rewritten_at: "2026-10-30T09:18:00.000Z", changed: true,
  text: {
    line: "Batteries and power lines alone can already cover several windless days: did not hold. Pumped hydro helps where there are mountains, but only a few countries have enough of it.",
    summary: "Batteries cover hours; pumped hydro covers days only in a few countries.",
    fate: "FELL"
  },
  what_changed: ["The dig found that pumped hydro can carry a few windless days, but only in countries with large mountain reservoirs."],
  fate_before: "FELL",
  view: {
    outcome: "DID_NOT_HELP", scope: "PATH",
    reason: "Pumped hydro covers a windless week only where large reservoirs already exist, which most countries in the question lack.",
    own_words: [PICK_OWN_HYDRO.text]
  },
  dig_paths: [
    { position_ref: "n-mix", line: "Pumped hydro plus batteries, where the mountains allow it.", fate: "PARTLY_HELD" },
    { position_ref: "n-renew", line: "Pumped hydro can carry a windless week anywhere.", fate: "FELL" },
    { position_ref: "n-nuclear", line: "Firm plants are still needed where there are no mountains.", fate: "HELD_UP" },
    { position_ref: "n-smr", line: "New reservoirs can be built in time.", fate: "SET_ASIDE" }
  ]
};

const PICK_BUILD_RECORD: DugPick = {
  kind: "CONTRADICTING", place: "p:n-nuclear-build", by: "AI_SUGGESTION",
  text: "Did any reactor in Europe or North America finish on time and on budget since 2005?"
};
const PICK_SMR_COST: DugPick = {
  kind: "NEEDS_MORE_WEB", place: "path:n-smr", by: "AI_SUGGESTION",
  text: "Is there any published cost for a small modular reactor that is already running?"
};

/** Task W4-6: the dig ran, but its rewrite failed twice: the path keeps its text; the report reads the dig directly. */
const REWRITE_FAILED: PathRewrite = {
  rewrite_id: "rw-d400-n-nuclear", dig_run_id: DIG_RUNS.failed, dig_level: 1, dig_finished_at: DIG_FINISHED_AT.failed,
  state: "FAILED", failed_at: "2026-10-30T12:04:00.000Z"
};

/** Task W4-6: the dig found nothing that changes the path; its "what the dig changed" sentence is still shown. */
const REWRITE_NO_CHANGE: ReadyRewrite = {
  rewrite_id: "rw-d500-n-smr", dig_run_id: DIG_RUNS.noChange, dig_level: 1, dig_finished_at: DIG_FINISHED_AT.noChange,
  state: "READY", rewritten_at: "2026-10-30T12:33:00.000Z", changed: false,
  text: {
    line: "Wait for small modular reactors: set aside. None is running commercially in Europe or North America yet, so their cost could not be weighed.",
    summary: "Too early to weigh: no small reactor is running commercially here yet.",
    fate: "SET_ASIDE"
  },
  what_changed: ["The dig found no published cost for a small reactor already running, so the path stays as it was."],
  fate_before: "SET_ASIDE", view: null,
  dig_paths: [
    { position_ref: "n-mix", line: "Build what works today, and keep a place for small reactors later.", fate: "HELD_UP" },
    { position_ref: "n-renew", line: "Small reactors will not be needed at all.", fate: "PARTLY_HELD" },
    { position_ref: "n-nuclear", line: "Build large reactors now and small ones later.", fate: "FELL" },
    { position_ref: "n-smr", line: "Small reactors will be cheap within a decade.", fate: "SET_ASIDE" }
  ]
};

const REWRITE_LEVEL_THREE: PathRewrite = {
  rewrite_id: "rw-d300-n-nuclear", dig_run_id: DIG_RUNS.levelThree, dig_level: 3, dig_finished_at: DIG_FINISHED_AT.levelThree,
  state: "WRITING"
};

/** `Answer.path_rewrites` per seeded run (absent: no dig has touched that debate's paths). */
export const PATH_REWRITES: Readonly<Record<string, AnswerPathRewrites>> = Object.freeze({
  // The first debate: two paths rewritten since its report (version 1, closed 28 Oct); n-renew also changed further down.
  [DIG_RUNS.root]: {
    paths: [
      { position_ref: "n-mix", current: REWRITE_OWN_VIEW.text, history: [REWRITE_OWN_VIEW] },
      { position_ref: "n-renew", current: REWRITE_LEVEL_ONE.text, history: [REWRITE_LEVEL_ONE], changed_below: true },
      // Task W4-6: a failed rewrite (no text: the path keeps its own) and one that changed nothing; neither is counted.
      { position_ref: "n-nuclear", current: null, history: [REWRITE_FAILED] },
      { position_ref: "n-smr", current: REWRITE_NO_CHANGE.text, history: [REWRITE_NO_CHANGE] }
    ],
    changed_since: { count: 2, since_report_version: 1 }
  },
  [DIG_RUNS.levelOne]: {
    paths: [{ position_ref: "n-renew", current: REWRITE_LEVEL_TWO.text, history: [REWRITE_LEVEL_TWO] }],
    changed_since: { count: 1, since_report_version: null }
  },
  [DIG_RUNS.levelTwo]: {
    paths: [{ position_ref: "n-nuclear", current: null, history: [REWRITE_LEVEL_THREE] }],
    changed_since: { count: 0, since_report_version: null }
  }
});

/** `Answer.dig` per seeded dig: what it dug and its rewrite of the parent path. */
export const DIG_ANSWERS: Readonly<Record<string, AnswerDig>> = Object.freeze({
  [DIG_RUNS.levelOne]: {
    parent_run_id: DIG_RUNS.root, position_ref: "n-renew", places: ["p:n-renew-storage"], level: 1, picks: [PICK_STORAGE], rewrite: REWRITE_LEVEL_ONE
  },
  [DIG_RUNS.ownView]: {
    parent_run_id: DIG_RUNS.root, position_ref: "n-mix", places: ["path:n-mix", "p:n-mix-land"], level: 1,
    picks: [PICK_OWN_BACKUP, PICK_EDITED_LAND], rewrite: REWRITE_OWN_VIEW
  },
  [DIG_RUNS.levelTwo]: {
    parent_run_id: DIG_RUNS.levelOne, position_ref: "n-renew", places: ["path:n-renew"], level: 2, picks: [PICK_OWN_HYDRO], rewrite: REWRITE_LEVEL_TWO
  },
  [DIG_RUNS.levelThree]: {
    parent_run_id: DIG_RUNS.levelTwo, position_ref: "n-nuclear", places: ["path:n-nuclear"], level: 3, picks: [PICK_BUILD_TIMES], rewrite: REWRITE_LEVEL_THREE
  },
  [DIG_RUNS.failed]: {
    parent_run_id: DIG_RUNS.root, position_ref: "n-nuclear", places: ["p:n-nuclear-build"], level: 1, picks: [PICK_BUILD_RECORD], rewrite: REWRITE_FAILED
  },
  [DIG_RUNS.noChange]: {
    parent_run_id: DIG_RUNS.root, position_ref: "n-smr", places: ["path:n-smr"], level: 1, picks: [PICK_SMR_COST], rewrite: REWRITE_NO_CHANGE
  }
});

/** The seeded digs beyond 8888 (which server.ts already seeds): their question line and when they ran. */
export const SEEDED_NEW_DIGS = Object.freeze([
  {
    runRef: DIG_RUNS.ownView, answerId: "aaaad100-0000-4000-8000-000000000001", seq: 9, mode: "quick" as const,
    question: "Would keeping some old plants as a winter back-up be cheaper than new nuclear, and does land use matter in a small country?",
    askedAt: "2026-10-29T10:05:00.000Z", settledAt: DIG_FINISHED_AT.ownView
  },
  {
    runRef: DIG_RUNS.levelTwo, answerId: "aaaad200-0000-4000-8000-000000000002", seq: 10, mode: "quick" as const,
    question: "Could pumped hydro in the mountains carry a windless week?",
    askedAt: "2026-10-30T09:00:00.000Z", settledAt: DIG_FINISHED_AT.levelTwo
  },
  {
    runRef: DIG_RUNS.levelThree, answerId: "aaaad300-0000-4000-8000-000000000003", seq: 11, mode: "thorough" as const,
    question: "Were reactors built faster outside Europe and North America, and could that be repeated here?",
    askedAt: "2026-10-30T15:10:00.000Z", settledAt: DIG_FINISHED_AT.levelThree
  },
  {
    runRef: DIG_RUNS.failed, answerId: "aaaad400-0000-4000-8000-000000000004", seq: 14, mode: "quick" as const,
    question: "Did any reactor in Europe or North America finish on time and on budget since 2005?",
    askedAt: "2026-10-30T11:40:00.000Z", settledAt: DIG_FINISHED_AT.failed
  },
  {
    runRef: DIG_RUNS.noChange, answerId: "aaaad500-0000-4000-8000-000000000005", seq: 15, mode: "quick" as const,
    question: "Is there any published cost for a small modular reactor that is already running?",
    askedAt: "2026-10-30T12:10:00.000Z", settledAt: DIG_FINISHED_AT.noChange
  }
]);

/** The month pause of RUN_PAUSED: until the next month starts; `canContinue` once the mock plays the new month. */
export function monthPause(nextMonthStartsAt: string, canContinue: boolean): { until: string; can_continue: boolean } {
  return { until: nextMonthStartsAt, can_continue: canContinue };
}

/** The usage read's borrow notice (switch usage=BORROWED): finishing the running debate used 4% of tomorrow's allowance. */
export function borrowNotice(runRef: string, tomorrowStartsAt: string): UsageBorrow {
  return { scope: "PERSON_DAY", run_ref: runRef, percent: 4, next_window_starts_at: tomorrowStartsAt };
}

/**
 * Task W3-4: a dig at the deepest level (10), for the click-test of the "deepest level" line. Its parent is d300 (level 3);
 * the levels in between are not seeded, so only this answer's own `dig` says 10. It rewrote nothing yet (its rewrite is
 * null): what the page shows of it is that nothing more can be dug from its map.
 */
export const DEEPEST_DIG = Object.freeze({
  runRef: "d1000000-0000-4000-8000-000000000010",
  answerId: "aaaad110-0000-4000-8000-000000000010",
  seq: 13,
  mode: "quick" as const,
  question: "Could reactors in my country be built in seven years, if the first ones were?",
  askedAt: "2026-10-30T16:00:00.000Z",
  settledAt: "2026-10-30T16:20:00.000Z",
  dig: {
    parent_run_id: DIG_RUNS.levelThree, position_ref: "n-nuclear", places: ["path:n-nuclear"], level: 10, picks: [], rewrite: null
  } satisfies AnswerDig
});
