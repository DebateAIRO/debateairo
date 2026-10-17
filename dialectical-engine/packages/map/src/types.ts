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

/** The limits a map call reads: every member of MAP_LIMITS. */
export type MapLimits = Readonly<{ [K in keyof typeof MAP_LIMITS]: number }>;

/**
 * Length guidance (spec 2026-10-15 §3.9, ruling L19; INTERFACE §5.7): with the length row the map's TEXT limits are
 * runaway guards only, about 8 x today's, since each text is guided to about N words. Ids keep their 24 characters and
 * every count stays.
 */
export const MAP_RUNAWAY_LIMITS = Object.freeze({
  claimMaxChars: 2000, whyMaxChars: 2000, candidateAnswerMaxChars: 1300, angleLabelMaxChars: 650, angleFocusMaxChars: 2000
});
const MAP_LENGTHED_LIMITS: MapLimits = Object.freeze({ ...MAP_LIMITS, ...MAP_RUNAWAY_LIMITS });

/** Today's limits, or (a run admitted with the length row) the same with its text limits at runaway level. */
export function mapLimitsFor(lengthed: boolean): MapLimits {
  return lengthed ? MAP_LENGTHED_LIMITS : MAP_LIMITS;
}

/**
 * Engine redesign (spec 2026-10-15 §5.2 item 2, P2.2): what a point rests on — a fact the question gives, or an
 * assumption. Engine 2 only: every engine-1 item, key point and stored map has no such member.
 */
export const MAP_RESTS_ON = Object.freeze(["question", "assumption"] as const);
export type MapRestsOn = typeof MAP_RESTS_ON[number];

/** Engine redesign (spec §5.2 items 3 and 5, §3.4): the choose's and the check's counts, one frozen object. */
export const MAP_ENGINE_LIMITS = Object.freeze({
  /** Assumptions one chosen or reserve answer may name. */
  assumptionsMax: 3,
  /** Reserve answers choose may name, in order. */
  reservesMax: 2,
  /** Ids one check may name: up to four chosen answers and up to four candidates. */
  checkIdsMax: 8,
  /** Candidates one check may hold (`c1..c4`); the engine row's `answerCheck.candidates` is at most this. */
  candidatesMax: 4
});

/**
 * Spec §5.5 + owner decision D4(b) (2026-10-16): the check's verdict on one answer. The check asks three tests (does it
 * answer the question as asked; does it state as the asker's fact something the question does not give; unless it
 * challenges the question's premise, can a cost of following it be named). Each failed test is named, in that fixed
 * order, so the stored code says exactly which tests failed (INTERFACE §10.4's BOTH is retired: deviation 12).
 * UNCHECKED when the call did not happen or failed. Every verdict is the checker AI's; code judges none (G1).
 */
export const MAP_ANSWER_CHECK_OUTCOMES = Object.freeze(["PASSED", "NOT_AN_ANSWER", "ADDED_FACT", "NO_COST",
  "NOT_AN_ANSWER+ADDED_FACT", "NOT_AN_ANSWER+NO_COST", "ADDED_FACT+NO_COST", "NOT_AN_ANSWER+ADDED_FACT+NO_COST",
  "UNCHECKED"] as const);
export type MapAnswerCheckOutcome = typeof MAP_ANSWER_CHECK_OUTCOMES[number];

/** The marks the spec names (§1.1, §1.2). The kernel's CONDITION_MARKS lists them too (Phase 2), with typed records. */
export const MAP_MARKS = Object.freeze(["MAP_ANGLES_FALLBACK", "MAP_MERGE_FALLBACK", "MAP_CHOOSE_FALLBACK",
  "MAP_UNAVAILABLE_TODAYS_OPENING", "ANSWERS_FILLED", "CHOOSE_QUOTA_FILLED",
  // Engine redesign R3 (spec 2026-10-15 §5.5): the answer check's four outcomes that change or doubt the debated answers.
  "MAP_CHECK_UNAVAILABLE", "MAP_ANSWER_REPLACED", "MAP_ANSWER_DROPPED", "MAP_ANSWER_KEPT_UNCHECKED"] as const);
export type MapMark = typeof MAP_MARKS[number];

/** What happened along the way that is not a mark: kept for the practice record and the owners' reading. */
export const MAP_NOTES = Object.freeze(["LIST_REASSIGNED", "LIST_DROPPED", "MERGE_ITEMS_KEPT", "GAP_SKIPPED", "GAP_STOPPED", "MAP_STOPPED",
  // Question language (spec 2026-10-13, L7; ruling CR-3): the angle planner named another language than the lock. Measurement only, for operators: never a condition mark, never shown, never acted on.
  "LANGUAGE_PLANNER_DISAGREES",
  // Practice 2026-10-15: how many key points and merged answers named an internal field or item id, so were left out of
  // the choice and of "also raised" (mapInternalWordsSkipped). Operators only: never a condition mark, never shown.
  "INTERNAL_WORDS_SKIPPED"] as const);
export type MapNote = typeof MAP_NOTES[number];

export const MAP_STEPS = Object.freeze(["ANGLES", "LIST", "SNOWBALL", "MERGE", "GAP", "CHOOSE", "CHECK"] as const);
export type MapStep = typeof MAP_STEPS[number];

/** A: snowball from the first AI. B: blind lists with no angle. C: the angle map (the spec's opening, ruling S1). */
export type MapArm = "A" | "B" | "C";

/** One AI taking part: its reference (a provider ref) and its maker. */
export type MapSeat = Readonly<{ aiRef: string; maker: string }>;

export type MapAngle = Readonly<{
  /** `g1`..`gN` in plan order, minted by code (ruling T7-PRIV): never the planner's own angle_id. */
  angleId: string;
  kind: MapAngleKind;
  label: string;
  focus: string;
}>;

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
export type MapPointItem = MapItemBase & Readonly<{ kind: "POINT"; claim: string; whyItMatters: string; leans: MapLean;
  /** Engine 2 only (P2.2): what the list said this point rests on. Absent under engine 1. */
  restsOn?: MapRestsOn }>;
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
  /** Engine 2 only (P2.2, `mapGroupRestsOn`): "assumption" when any member (or the merger) said so. Absent under engine 1. */
  restsOn?: MapRestsOn;
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
  /** `a1`..`aN` in choice order, minted by code (ruling T7-PRIV): never the chooser's own answer_id. */
  answerId: string;
  statement: string;
  forKeyPointIds: readonly string[];
  againstKeyPointIds: readonly string[];
  /** Another chosen answer's answerId. */
  strongestRival: string;
  /** Added by the code (ANSWERS_FILLED), not named by the choose AI. */
  filled: boolean;
  /** Engine 2 only (spec §5.2 item 2): the chooser's assumptions for this answer, AI-written; [] for a code-made answer. */
  assumptions?: readonly string[];
  /**
   * Engine 2 only (spec §5.2 rule 4): key point ids given to this answer's writer UNSIDED ("points raised"): the
   * most-raised points for an answer with no sided points, and the quota fills. Never for or against by code.
   */
  pointsRaised?: readonly string[];
}>;

/** Engine 2 only (spec §5.2 item 3): a reserve answer choose named, in its order (`r1`, `r2`, minted by code). */
export type MapReserveAnswer = Readonly<{
  reserveId: "r1" | "r2";
  statement: string;
  forKeyPointIds: readonly string[];
  againstKeyPointIds: readonly string[];
  assumptions: readonly string[];
}>;

/** The chosen answers, and every key point not chosen ("also raised, not debated"), most-raised first. */
export type MapChoice = Readonly<{ answers: readonly MapChosenAnswer[]; alsoRaised: readonly string[];
  /** Engine 2 only: choose's reserve answers (0..2), kept as named even when the check used none. */
  reserves?: readonly MapReserveAnswer[] }>;

/** One answer the check may promote (spec §5.2 item 5): a reserve (with its sides) or an unchosen merged answer (none). */
export type MapCheckCandidate = Readonly<{
  /** `c1..c4`, in candidate order. */
  checkId: string;
  statement: string;
  source: "RESERVE" | "MERGED";
  forKeyPointIds: readonly string[];
  againstKeyPointIds: readonly string[];
  assumptions: readonly string[];
}>;

/** What the checker AI said (deviation 2): its seat, an outcome per id shown, a reason per id it gave one for. */
export type MapAnswerCheckReading = Readonly<{
  checker: MapSeat;
  outcomes: Readonly<Record<string, Exclude<MapAnswerCheckOutcome, "UNCHECKED">>>;
  reasons: Readonly<Record<string, string>>;
  /**
   * D4(b), deviation 12: the check ids the checker answered `cost_can_be_named: null` for (it said the answer challenges
   * the question's premise, so the third test does not apply), in the order shown; [] when none. The stored code shows
   * such an answer as PASSED, so D1 counts the exemptions from here. The checker's own word: code never decides it.
   */
  premiseExempt: readonly string[];
}>;

/** INTERFACE §10.4, with deviation 2's members. Stored inside the encrypted map choice; its codes in core.map_answer_check. */
export type MapAnswerCheckResult = Readonly<{
  /** Null when no check was made (no seat, a stop, a failed call). */
  checker: MapSeat | null;
  /** By check id: every chosen answer checked, then every candidate shown. */
  outcomes: Readonly<Record<string, MapAnswerCheckOutcome>>;
  reasons: Readonly<Record<string, string>>;
  /** D4(b), deviation 12: the reading's `premiseExempt`, copied; [] when no check was made. */
  premiseExempt: readonly string[];
  candidates: readonly Readonly<{ checkId: string; statement: string; source: "RESERVE" | "MERGED" }>[];
  replacements: readonly Readonly<{
    answerId: string;
    /** The words the checker saw for this answer, before any replacement. */
    statement: string;
    /** A check id (`c<n>`), or null when dropped or kept. */
    replacedBy: string | null;
    action: "REPLACED" | "DROPPED" | "KEPT_UNCHECKED";
  }>[];
}>;

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
  outcome: "OK" | "FAILED" | "BUSY" | "STOPPED";
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
  /** Engine 2 only (spec §5.2 item 5): the one answer check and what it changed. Absent under engine 1. */
  answerCheck?: MapAnswerCheckResult;
  marks: readonly MapMarkRecord[];
  notes: readonly MapNoteRecord[];
  calls: readonly MapCallRecord[];
  /** The code of the stop (money, attempts, lane) that ended the map early; null when it ran to its end. */
  stoppedBy: string | null;
  /** What the angle planner named in question_language, as a primary subtag; null when it named nothing usable (operators only). */
  plannerLanguage: string | null;
}>;
