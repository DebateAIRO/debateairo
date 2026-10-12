/**
 * The map (spec 2026-10-12 "a better debate shape", §1): Stage 1's shared vocabulary.
 *
 * Plain words: before a debate is argued, several AIs look at the question from a few angles and list short points;
 * one AI merges the lists, one or two "what is still missing?" rounds follow, and one AI chooses 2-4 genuinely
 * different answers with the points for and against each. This file names the pieces. It is pure data: no clock, no
 * randomness, no I/O. Phase 1 drives it from the practice tool; Phase 2 from the runner.
 */

export const MAP_FIXED_ANGLE_KINDS = Object.freeze(["OPPOSITE_CASE", "ASKER_WORRY", "PRACTICAL"] as const);
export type MapFixedAngleKind = typeof MAP_FIXED_ANGLE_KINDS[number];
/** SPECIFIC: an angle the planner wrote for this question. GENERAL: the code's own, only in the angles fallback. */
export type MapAngleKind = MapFixedAngleKind | "SPECIFIC" | "GENERAL";

export const MAP_LEANS = Object.freeze(["for_some_answer", "against_some_answer", "context"] as const);
export type MapLean = typeof MAP_LEANS[number];

/** The spec's lengths and counts (§1.1, §1.2), in one frozen object: a policy number is never a bare exported constant. */
export const MAP_LIMITS = Object.freeze({
  claimMaxChars: 240,
  whyMaxChars: 240,
  candidateAnswerMaxChars: 160,
  angleLabelMaxChars: 80,
  angleFocusMaxChars: 240,
  idMaxChars: 24,
  anglesMin: 4,
  anglesMax: 7,
  specificAnglesMin: 1,
  specificAnglesMax: 4,
  listPointsMin: 3,
  listPointsMax: 8,
  listAnswersMin: 1,
  listAnswersMax: 3,
  snowballPointsMax: 8,
  snowballAnswersMax: 3,
  gapPointsMax: 8,
  framingChallengesMax: 3,
  chooseAnswersMin: 1,
  chooseAnswersMax: 4,
  chooseDistinctAnswersMin: 2,
  choosePointsPerSideMax: 6,
  gapRoundNewPointsToContinue: 2
});

/** The marks the spec names (§1.1, §1.2). Phase 2 adds them to the kernel's CONDITION_MARKS with typed records. */
export const MAP_MARKS = Object.freeze(["MAP_ANGLES_FALLBACK", "MAP_MERGE_FALLBACK", "MAP_CHOOSE_FALLBACK",
  "MAP_UNAVAILABLE_TODAYS_OPENING", "ANSWERS_FILLED", "CHOOSE_QUOTA_FILLED"] as const);
export type MapMark = typeof MAP_MARKS[number];

/** What happened along the way that is not a mark: kept for the practice record and the owners' reading. */
export const MAP_NOTES = Object.freeze(["LIST_REASSIGNED", "LIST_DROPPED", "MERGE_ITEMS_KEPT", "GAP_SKIPPED", "GAP_STOPPED"] as const);
export type MapNote = typeof MAP_NOTES[number];

export const MAP_STEPS = Object.freeze(["ANGLES", "LIST", "SNOWBALL", "MERGE", "GAP", "CHOOSE"] as const);
export type MapStep = typeof MAP_STEPS[number];

/** A: snowball from the first AI. B: blind lists with no angle. C: the angle map (the spec's opening, ruling S1). */
export type MapArm = "A" | "B" | "C";

/** One AI taking part: its reference (a provider ref) and its maker. */
export type MapSeat = Readonly<{ aiRef: string; maker: string }>;

export type MapAngle = Readonly<{ angleId: string; kind: MapAngleKind; label: string; focus: string }>;

/** BLIND: written without seeing anyone's points. SHOWN: written after seeing earlier points (snowball). GAP: a gap round. */
export type MapItemOrigin = "BLIND" | "SHOWN" | "GAP";

type MapItemBase = Readonly<{
  /** Opaque, short (`pt01`, `ca01`): never says who wrote it or in which list. */
  itemId: string;
  seat: MapSeat;
  origin: MapItemOrigin;
  angleId: string | null;
  angleKind: MapAngleKind | null;
  listIndex: number;
}>;
export type MapPointItem = MapItemBase & Readonly<{ kind: "POINT"; claim: string; whyItMatters: string; leans: MapLean }>;
export type MapAnswerItem = MapItemBase & Readonly<{ kind: "ANSWER"; answer: string }>;
export type MapItem = MapPointItem | MapAnswerItem;

export type MapKeyPoint = Readonly<{
  keyPointId: string;
  claim: string;
  memberItemIds: readonly string[];
  /** Distinct makers that raised it blind: the spec's "raised independently by N makers". */
  blindMakers: readonly string[];
  /** Distinct makers that raised it in a gap round. */
  gapMakers: readonly string[];
  /** Distinct makers that raised it at all (blind, shown or gap). */
  makers: readonly string[];
  /** The fixed angle kinds its members came from, in the fixed order. */
  fixedAngleKinds: readonly MapFixedAngleKind[];
  /** More of its members lean against some answer than for one. */
  leansAgainst: boolean;
}>;

export type MapMergedAnswer = Readonly<{
  answerId: string;
  answer: string;
  memberItemIds: readonly string[];
  blindMakers: readonly string[];
  makers: readonly string[];
  fromOppositeCase: boolean;
}>;

export type MapChosenAnswer = Readonly<{
  answerId: string;
  statement: string;
  forKeyPointIds: readonly string[];
  againstKeyPointIds: readonly string[];
  strongestRival: string;
  /** Added by the code (ANSWERS_FILLED), not named by the choose AI. */
  filled: boolean;
}>;

/** The chosen answers, and every key point not chosen ("also raised, not debated"), most-raised first. */
export type MapChoice = Readonly<{ answers: readonly MapChosenAnswer[]; alsoRaised: readonly string[] }>;

export type MapMarkRecord = Readonly<{ mark: MapMark; step: MapStep | "MAP"; detail: string }>;
export type MapNoteRecord = Readonly<{ note: MapNote; step: MapStep; detail: string }>;

/** One model call the map made, in plan order (`order`), whatever order the calls finished in. */
export type MapCallRecord = Readonly<{
  step: MapStep;
  callSiteKey: string;
  aiRef: string;
  maker: string;
  order: number;
  /** BLIND, or the ids of what the AI was shown. */
  shown: "BLIND" | readonly string[];
  outcome: "OK" | "FAILED" | "BUSY";
  code: string | null;
}>;

export type MapResult = Readonly<{
  arm: MapArm;
  /** UNAVAILABLE: fewer than two lists arrived; the caller falls back to today's opening (MAP_UNAVAILABLE_TODAYS_OPENING). */
  kind: "MAP" | "UNAVAILABLE";
  angles: readonly MapAngle[];
  items: readonly MapItem[];
  keyPoints: readonly MapKeyPoint[];
  mergedAnswers: readonly MapMergedAnswer[];
  framingChallenges: readonly string[];
  choice: MapChoice | null;
  marks: readonly MapMarkRecord[];
  notes: readonly MapNoteRecord[];
  calls: readonly MapCallRecord[];
}>;
