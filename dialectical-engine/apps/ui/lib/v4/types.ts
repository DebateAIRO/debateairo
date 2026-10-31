import { TRUST_WORDS, type TrustWord } from "@debateai/contract";
import type {
  AnswerDig,
  DigSuggestion,
  PathRewrite,
  PathsChangedSince,
  StoryFate,
  WebOtherPage,
  WebSearchStatus,
  WebSource
} from "@debateai/contract";

/*
 * V4 initial (2026-10-28): the shapes every V4 page shares. V4 is built over today's V3 answer, story and run reads.
 * Owner decisions referenced: R/42 §7 (row D, decided 2026-10-27). Perplexity plan W2-6 (2026-10-30): the answer's
 * optional web fields (sources, each path's search and other pages) ride along; an answer without them reads as before.
 */

/**
 * Row D decision 2: the four trust words, in the order the bar and the panel show them. W4-8: the contract's codes, the
 * ones the server serves a rewritten path's words in.
 */
export { TRUST_WORDS, type TrustWord };
export type TrustCounts = Readonly<Record<TrustWord, number>>;

/**
 * Why a point carries its word, worked out from the second AI's review, how the point is known, the server's checked
 * looked-up flag, how fresh it is and whether its story path fell (lib/v4/trust.ts). Each basis has its own plain line
 * in the v4 catalogue (`basisKey`).
 */
export const TRUST_BASES = [
  /**
   * W2-6 (owner, 30 Oct): "Sure" — the point rests on an extract of a page this debate looked up (the server's
   * `looked_up_checked`), a second AI agreed and it is fresh. Its line is the approved "v4.web.sureBasis".
   */
  "WEB_CHECKED_AND_AGREED",
  /**
   * The point names where it comes from or how it was worked out (LOOKED_UP or RAN) and a second AI agreed, but no page
   * of this debate backs it (a remembered citation, or any debate from before R22): at most "Sure, for the case named".
   */
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

/** The catalogue key of a basis's plain line. */
export function basisKey(basis: TrustBasis): string {
  return basis === "WEB_CHECKED_AND_AGREED" ? "v4.web.sureBasis" : `v4.basis.${basis}`;
}

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
  /**
   * W2-6: the checked extracts the point rests on, quotes cut to 120 characters (page text, with reader 1's line in the
   * site's language). Absent or empty: none (Free, an old debate, a point resting on reasoning).
   */
  sources?: readonly WebSource[];
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
  /** W2-6: this path's web search and the other pages it found; absent when the answer says nothing about it. */
  web?: V4PathWeb;
  /**
   * W3-4: the path's dig suggestions (AI text, in the answer's order; lib/v4/suggestions.ts). Absent or empty: none (an
   * answer from before R22, a level-10 dig, whose paths cannot be dug).
   */
  suggestions?: readonly DigSuggestion[];
  /**
   * W4-6: the story position (or the dig's own path) this path stands for; `id` adds "#2" to a repeated one. Absent: the
   * stand-in path, which stands for no position.
   */
  positionRef?: string;
  /** W4-6: what digs did to this path (Answer.path_rewrites); absent when no dig rewrote it or changed anything below it. */
  rewrites?: V4PathRewrites;
}>;

/**
 * W4-6 (dig model revision, 5.5): one path's rewrites by digs as the map shows them. `line` and `fate` of the path are
 * already the newest finished rewrite's; `original` keeps what the path said before any dig rewrote it, so each earlier
 * text can be shown ("Show earlier text"). `history` is the contract's, newest last. `changedBelow`: a dig further down
 * changed part of this path (owner Q-D5: marked only, never rewritten).
 */
export type V4PathRewrites = Readonly<{
  original: Readonly<{ line: string; fate: StoryFate | null }>;
  history: readonly PathRewrite[];
  changedBelow: boolean;
}>;

/** W4-6: what became of a path's newest rewrite (the four states of draft 5.5). */
export const REWRITE_STATES = ["REWRITING", "REWRITTEN", "NO_CHANGE", "FAILED"] as const;
export type RewriteState = (typeof REWRITE_STATES)[number];

/** W2-6: one path's web part as the pages show it (never a grade: the contract carries none). */
export type V4PathWeb = Readonly<{ search: WebSearchStatus; otherPages: readonly WebOtherPage[] }>;

/**
 * W2-6: one note for the whole debate when its paths share it: FREE (Free never searches: "Not checked on the web; paid
 * plans look things up."), FAILED (the search failed: the debate went on without the web) or SWITCHED_OFF.
 */
export const WEB_NOTES = ["FREE", "FAILED", "SWITCHED_OFF"] as const;
export type V4WebNote = (typeof WEB_NOTES)[number];

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
  /** W4-6: NONE on a dig's own map: a dig keeps its points and its answer text and writes no story (owner Q-D13). */
  storyState: "READY" | "WRITING" | "UNAVAILABLE" | "NONE";
  /**
   * DATA-2: the whole composed answer (V3's toStoryView fallback), set only when there is no ready story body, so the
   * page still has the answer to show while the story is missing or being written. AI text.
   */
  fallbackText: string | null;
  /** RULES-1: the story is READY_WITH_RESERVATION with a body (parts of the summary could not be double-checked). */
  reservation: boolean;
  /** W2-6: the debate's web note (above); null or absent when there is none (it searched, or an answer from before R22). */
  webNote?: V4WebNote | null;
  /**
   * W3-4: this debate's dig level from its answer (`Answer.dig.level`, 1 to DIG_LEVEL_MAX); null or absent when the
   * answer does not say (a first debate, or a dig from before R22). Never the debate's own argument bound.
   */
  digLevel?: number | null;
  /**
   * W4-6: "Paths changed since the answer was written" (or since report version n), as the answer says it; null or
   * absent when the answer says nothing (no dig has rewritten any of its paths, or an answer from before R22).
   */
  changedSince?: PathsChangedSince | null;
  /** W4-6: on a dig's own map, what it dug and its rewrite of the path it came from (`Answer.dig`); null otherwise. */
  dig?: AnswerDig | null;
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
  /**
   * W4-6: a dig of the new model (its answer says what it dug) rewrites the path it came from instead of writing a
   * story: its rewrite (null: it rewrites no path, a dig of an open question under the main question). Absent: a dig from
   * before R22, read by its story headline as before.
   */
  rewrite?: PathRewrite | null;
  /** W4-6: DONE, a new-model dig: its own points, each with its trust word and sources ("See the dig's points and sources"). */
  points?: readonly V4Point[];
  /** W4-6 (the money rule): the dig's own run is paused at the month wall until this time (ISO); absent when it is not. */
  pausedUntil?: string;
}>;

/** What the panel shows: the question itself, one path, one open question or one dig. */
export type V4Selection = "root" | `path:${string}` | `open:${string}` | `dig:${string}`;

/**
 * W3-4: one thing a dig is made of, chosen on the map: an open question, one of a path's dig suggestions (its text as the
 * person left it: as written, or edited), or the person's own view at a path. `group` is the path it belongs to (null:
 * the main question itself); owner Q-D1, a dig combines picks of one group only (lib/v4/suggestions.ts).
 */
export type V4DigPick =
  | Readonly<{ kind: "OPEN"; key: string; group: string | null; question: V4OpenQuestion }>
  | Readonly<{ kind: "SUGGESTION"; key: string; group: string; suggestion: DigSuggestion; text: string }>
  | Readonly<{ kind: "OWN_VIEW"; key: string; group: string; text: string }>;

/** W3-4: what the person has chosen to dig so far: picks of one group, in the order they were chosen. */
export type V4DigDraft = Readonly<{ group: string | null; picks: readonly V4DigPick[] }>;

/** What a dig button digs into: one path, one or more open questions (the tray), or the person's picks (W3-4). */
export type DigTarget =
  | Readonly<{ kind: "path"; path: V4Path }>
  | Readonly<{ kind: "open"; questions: readonly V4OpenQuestion[] }>
  /** `path`: the path the picks belong to (null: the main question), whose line the dig's question names first. */
  | Readonly<{ kind: "picks"; path: V4Path | null; picks: readonly V4DigPick[] }>;

/** A dig waiting out its 10-second Undo (row D decision 1). Nothing is sent before `sendsAt`. */
export type PendingDig = Readonly<{ target: DigTarget; mode: DigMode; sendsAt: number }>;
