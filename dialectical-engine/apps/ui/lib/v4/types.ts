import type { StoryFate } from "@debateai/contract";

/*
 * V4 initial (2026-10-28): the shapes every V4 page shares. V4 is built over today's V3 answer, story and run reads;
 * nothing here needs a new API field. Owner decisions referenced: R/42 §7 (row D, decided 2026-10-27).
 */

/** Row D decision 2: the four trust words, in the order the bar and the panel show them. */
export const TRUST_WORDS = ["SURE", "SURE_FOR_CASE", "STILL_ARGUED", "DIDNT_HOLD"] as const;
export type TrustWord = (typeof TRUST_WORDS)[number];
export type TrustCounts = Readonly<Record<TrustWord, number>>;

/**
 * Why a point carries its word. V3 has no sources, so the words are worked out from the second AI's review, how the
 * point is known, how fresh it is and whether its story path fell (lib/v4/trust.ts). Each basis has its own
 * plain line in the v4 catalogue ("v4.basis.<BASIS>").
 */
export const TRUST_BASES = [
  "LOOKED_UP_AND_AGREED",
  "ARGUED_AND_AGREED",
  "AGREED_BUT_DATED",
  "DISPUTED",
  "COULD_NOT_CHECK",
  /** Not produced tonight (Decision B: no edge or defeater rule yet); kept so existing key tables stay whole. */
  "ANSWERED",
  /** Decision B (fix wave 1): the position of a story path whose fate is FELL. */
  "FELL"
] as const;
export type TrustBasis = (typeof TRUST_BASES)[number];

/** One point the debate made (a V3 node), in words only: no scores ever reach a V4 page. */
export type V4Point = Readonly<{
  id: string;
  text: string;
  /** null: no second AI has checked it yet. Row D decision 6: such points stay out of the groups and the bar. */
  trust: TrustWord | null;
  basis: TrustBasis | null;
  /** The second AI's reasons, as written (AI text). */
  reasons: readonly string[];
  /** DIDNT_HOLD: the point that answered it (AI text). */
  answeredBy: string | null;
  /** AGREED_BUT_DATED: the date the point was true as of (ISO). */
  asOf: string | null;
}>;

/** Row D decision 9: everything on the map is "a question". These are the open ones a person can dig into. */
export const OPEN_QUESTION_KINDS = ["STILL_ARGUED", "OBJECTION", "WOULD_CHANGE"] as const;
export type OpenQuestionKind = (typeof OPEN_QUESTION_KINDS)[number];

export type V4OpenQuestion = Readonly<{
  /** Stable within one answer version: "p:<nodeId>" (a still-argued point), "o:<index>" (an objection), "w" (what would change it). */
  id: string;
  kind: OpenQuestionKind;
  /** AI text: the claim, objection or turning point it starts from. */
  text: string;
  /** The single biggest open question on the map (at most one per map). */
  star: boolean;
  /** The path it hangs under; null when it hangs under the question itself. */
  pathId: string | null;
}>;

/** One path the debate followed (a story path: one answer it weighed and what became of it). */
export type V4Path = Readonly<{
  id: string;
  /** null only for the stand-in path used when no story is available (no fate is invented). */
  fate: StoryFate | null;
  /** AI text: the story's one line about this path. */
  line: string;
  points: readonly V4Point[];
  counts: TrustCounts;
  unchecked: number;
  open: readonly V4OpenQuestion[];
}>;

export type V4Section = Readonly<{ title: string; paragraphs: readonly string[] }>;

/** Everything the map, the panel and the report show for one served answer. */
export type V4Map = Readonly<{
  runId: string;
  answerId: string;
  answerVersion: number;
  question: string;
  headline: string | null;
  summary: string | null;
  confidence: string | null;
  why: readonly string[];
  sections: readonly V4Section[];
  paths: readonly V4Path[];
  /** Every point once, in the answer's order (the question's own panel groups them all). */
  points: readonly V4Point[];
  /** Open questions that hang under the question itself (objections still standing, what would change the answer). */
  open: readonly V4OpenQuestion[];
  counts: TrustCounts;
  unchecked: number;
  wouldChange: string | null;
  /**
   * R2DIG-4 / R2REG-2: the other text of the open question "w" — the answer's raw reversal_point without node ids —
   * when the story's change text is the one shown (`wouldChange`); null otherwise. A dig sent before the story was
   * ready names this text, so it is still placed under "w" once the story arrives. AI text.
   */
  wouldChangeAlt: string | null;
  objections: readonly string[];
  storyState: "READY" | "WRITING" | "UNAVAILABLE";
  /**
   * DATA-2: the whole composed answer (V3's toStoryView fallback), set only when there is no ready story body, so the
   * page still has the answer to show while the story is missing or being written. AI text.
   */
  fallbackText: string | null;
  /** RULES-1: the story is READY_WITH_RESERVATION with a body (parts of the summary could not be double-checked). */
  reservation: boolean;
}>;

/** Row D / sieve 2026-10-26: the reading level is chosen once; ids follow the D1 prototype's three choices. */
export const READING_LEVELS = ["plain", "background", "expert"] as const;
export type ReadingLevel = (typeof READING_LEVELS)[number];

/** Row D decision 5: a Quick/Thorough switch on every dig, quick by default. */
export const DIG_MODES = ["quick", "thorough"] as const;
export type DigMode = (typeof DIG_MODES)[number];

/**
 * V4 initial: a dig is a follow-up debate started from an open question. Fix wave 1 (Decision A): nothing is stored in
 * the browser; links are kept in memory for this visit. N11 (2026-10-29): each new dig's link is recorded in the account
 * (lib/v4/accountMemory.ts); digs made before that are found again from the account's question list by text
 * (lib/v4/digIndex.ts).
 */
export type DigLink = Readonly<{
  parentRunId: string;
  childRunId: string;
  /** The open question ids it was started from (several when picked together in the tray). */
  openQuestionIds: readonly string[];
  /** The questions as shown when the dig started (AI text). */
  questions: readonly string[];
  /** null: unknown (a dig found again from the account's question list by text; a recorded dig knows it). */
  mode: DigMode | null;
  /** ISO time; null when unknown (a dig found again from the account's question list by text; a recorded dig knows it). */
  startedAt: string | null;
}>;

/** D2 "How we read your question": the optional parts a person may set. Every part is optional and starts unset. */
export const GOAL_PLACES = ["ANYWHERE", "ROMANIA", "EU", "OTHER"] as const;
export type GoalPlace = (typeof GOAL_PLACES)[number];
export const GOAL_HORIZONS = ["NOW", "FIVE_YEARS", "TWENTY_FIVE_YEARS", "LONG_RUN"] as const;
export type GoalHorizon = (typeof GOAL_HORIZONS)[number];
export const GOAL_PURPOSES = ["DECIDE", "UNDERSTAND", "WRITE"] as const;
export type GoalPurpose = (typeof GOAL_PURPOSES)[number];

export type V4Goal = Readonly<{
  place: GoalPlace | null;
  /** The place typed when place is OTHER. */
  placeOther: string;
  horizon: GoalHorizon | null;
  purpose: GoalPurpose | null;
  /** What matters most when the answers pull apart, in the person's words. */
  matters: string;
  /** The person's own angles ("Add your own angle"), at most five. */
  angles: readonly string[];
}>;

export const EMPTY_GOAL: V4Goal = Object.freeze({
  place: null,
  placeOther: "",
  horizon: null,
  purpose: null,
  matters: "",
  angles: Object.freeze([])
});

/**
 * What the page saw earlier, per item id: the item's word (a trust word, a fate or a dig state). In memory for this visit;
 * N7: the account keeps the last one per debate (lib/v4/accountMemory.ts), never the browser.
 */
export type SeenSnapshot = Readonly<{ at: string; items: Readonly<Record<string, string>> }>;

/** D4: what changed while the person was on the page (fix wave 1: "while you were here", in memory only). */
export type V4Change = Readonly<{
  id: string;
  kind: "ADDED" | "CHANGED";
  /** The word it had before (CHANGED only). */
  before: string | null;
  now: string;
}>;

/** A dig as the map shows it: the link, plus what its follow-up debate has become. */
export const DIG_STATES = ["WAITING", "RUNNING", "DONE", "FAILED"] as const;
export type DigState = (typeof DIG_STATES)[number];
export type DigView = Readonly<{
  link: DigLink;
  state: DigState;
  /** DONE: the follow-up's story headline (AI text), when its story is ready. */
  headline: string | null;
  /** DONE: the follow-up's trust counts. */
  counts: TrustCounts | null;
}>;

/** What the panel shows: the question itself, one path, one open question or one dig. */
export type V4Selection = "root" | `path:${string}` | `open:${string}` | `dig:${string}`;

/** What a dig button digs into: one path, or one or more open questions (the tray). */
export type DigTarget =
  | Readonly<{ kind: "path"; path: V4Path }>
  | Readonly<{ kind: "open"; questions: readonly V4OpenQuestion[] }>;

/** A dig waiting out its 10-second Undo (row D decision 1). Nothing is sent before `sendsAt`. */
export type PendingDig = Readonly<{ target: DigTarget; mode: DigMode; sendsAt: number }>;
