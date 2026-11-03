/**
 * V4 start step, Task 9 (spec 2026-11-03 §2, §4): the plain values the pre-Start step's engine (packages/map) and its
 * contract (packages/contract/src/start-paths.ts, which re-exports them unchanged) both need. Here because packages/map
 * may import the contract only as types. Imports nothing.
 */

/** Every limit of the step before Start, in one frozen place. Lengths count UTF-16 code units. */
export const START_STEP_LIMITS = Object.freeze({
  /** List writers: at most 9 lists (Max's 7 seats and room), each 1 to 6 viewpoints, 54 in all. */
  listsMax: 9, viewpointsPerListMax: 6, viewpointsMax: 54,
  /** The angle planner gives up to 7 angles, at most 4 to a list. */
  anglesMax: 7, anglesPerListMax: 4,
  titleMaxChars: 80, questionMaxChars: 240, whyMaxChars: 200, angleLabelMaxChars: 80,
  /** The menu: at most one path per viewpoint, at most 4 viewpoints to a path, 3 cards, 9 suggestions. */
  menuPathsMax: 54, viewpointsPerPathMax: 4, cardsMax: 3,
  cardSentenceMaxChars: 300, suggestionsMax: 9, suggestionReasonMaxChars: 200,
  /** Lists merged in after the first menu, and the menu's revisions (the first plus each late merge). */
  lateListsMax: 8, menuRevisionsMax: 9,
  /** Chosen paths: at most 7 (How wide's widest), 8 stored (b1..b8), Free at most 3. */
  pathsMax: 7, storedPathsMax: 8, freePathsMax: 3,
  pathTitleMaxChars: 120, pathQuestionMaxChars: 1000, ownTextMaxChars: 1000,
  /** A signed reference's length, and POST /v1/asks's route body limit (decided 3 Nov: 384 KiB, that route only). */
  refMaxChars: 4096, askBodyMaxBytes: 393_216
});

/** A chosen path's id: b<n>, the n-th path in the person's order (1..8). */
export const PATH_ID_PATTERN = /^b[1-8]$/u;
export type PathId = `b${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`;
/** The id of the `no`-th path (1..8); anything else is TypeError("PATH_NO_INVALID"). */
export function pathIdOf(no: number): PathId {
  if (!Number.isSafeInteger(no) || no < 1 || no > START_STEP_LIMITS.storedPathsMax) throw new TypeError("PATH_NO_INVALID");
  return `b${no}` as PathId;
}

/** A viewpoint: pt<list 1-9><item 1-6>, or a card's own path cd<1-3>. */
export const VIEWPOINT_ID_PATTERN = /^(pt[1-9][1-6]|cd[1-3])$/u;
/** A menu path's reference: kp<two digits>. */
export const MENU_PATH_REF_PATTERN = /^kp[0-5][0-9]$/u;
export const CARD_ID_PATTERN = /^cd[1-3]$/u;
export const SUGGESTION_ID_PATTERN = /^sg[1-9]$/u;
export const ANGLE_ID_PATTERN = /^g[1-7]$/u;
/** A menu's id: 22 base64url characters (128 random bits). */
export const MENU_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/u;
/** A signed reference: base64url body, a dot, base64url signature. */
export const START_REF_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u;

/** Where a run's chosen paths came from: the menu, built by the run itself (an old page's ask), or a dig's picks. */
export const START_PATHS_SOURCES = Object.freeze(["MENU", "RUN_BUILT", "DIG_PICKS"] as const);
/** Who wrote a chosen path. */
export const START_PATH_AUTHORS = Object.freeze(["AI_SUGGESTION", "AI_COMBINED", "PERSON_EDITED", "PERSON_OWN_VIEW"] as const);
/** The four kinds of "Another way to see it" card. */
export const START_CARD_KINDS = Object.freeze(["CHOICE_NOT_WEIGHED", "EITHER_OR", "WHAT_WOULD_CHANGE_IT", "OTHER_READING"] as const);

/**
 * V4 start step, Task 15 (spec 2026-11-03 §2.7, §4.3): a path's results: at most 3 "what changed" lines, 120 pieces of
 * evidence it rests on, a gap round's 40 points of at most 400 characters, and "+ N more to explore" at most 54.
 */
export const PATH_RESULT_LIMITS = Object.freeze({ whatChangedMax: 3, restsOnMax: 120, gapPointsMax: 40, gapPointMaxChars: 400, moreMax: 54 });
