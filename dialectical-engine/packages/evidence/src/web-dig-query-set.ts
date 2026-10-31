import { createHash } from "node:crypto";
import { TypedDomainError, type PersonalDataKind } from "@debateai/kernel";
import { guardSearch, type CleanedPart, type SearchHoldReason } from "./query-guard.js";
import type { QueryPolarity } from "./index.js";
import { localSearchTarget, type WebSearchScope } from "./web-query-set.js";
import { isWebPace, lookBackWindow, type WebPace } from "./window.js";

/**
 * THE FROZEN QUERY SET OF A DIG (web search plan 2026-10-30, task W4-2; R22 decision 9 of 2026-10-31, which replaces "one
 * search per pick": a dig works like a first debate, each chosen path has its own AI that decides whether and what to
 * search, up to 4 searches, "if the AI decides it's worth searching in that language as well").
 *
 * A dig is a short follow-up debate on what the person picked on one path (AI suggestions, their edits, their own view).
 * Each pick's planner writes 0 to 4 searches; this set freezes them in code, with no AI:
 * - every search belongs to a pick of the dig (a search for anything else is refused, OFF_PLAN_QUERY_REFUSED, the rule
 *   `freezeWebQuerySet` keeps for a debate's paths), and a pick has at most 4 (5 is refused, DIG_PLAN_SEARCH_COUNT_INVALID);
 * - a pick need not send a pair: it may send one search, or none. Side `dig` in 0132 whichever side it looks on;
 * - each search is cleaned and guarded (`guardSearch`, W1-2's personal-data guard): a held one keeps no words and holds
 *   back no other;
 * - the same words twice in a dig are sent once: the later one is left out, never paid for, whichever pick wrote it (each
 *   planner works alone, so two picks may well write the same search);
 * - the look-back date comes from the pick's pace word and the run's date;
 * - an English search carries no country; a local one carries `localSearchTarget`'s language and country, and is held back
 *   (NO_LOCAL_TARGET) when none can be worked out.
 * All of a dig's searches are kept under one path of the dig's map (`pathId`): its pages, its extracts and its one pack,
 * which every path of the dig shares (plan W4-2, "the pack is shared by the dig's paths").
 */
export const DIG_SEARCHES_PER_PICK_MAX = 4 as const;

export type PlannedDigSearch = Readonly<{ scope: WebSearchScope; polarity: QueryPolarity; text: string }>;
/** One pick's plan: its searches (none: the planner decided no search is worth it), its pace and the country it read. */
export type PlannedDigPick = Readonly<{ pickId: string; pace: WebPace | null; country: string | null; searches: readonly PlannedDigSearch[] }>;

export type DigPlanContext = Readonly<{
  /** The dig's picks, in their order (0135's pick numbers as ids): the only things a search may belong to. */
  pickIds: readonly string[];
  /** The dig's path its searches are kept under (the pack's path). */
  pathId: string;
  /** The run's date; the look-back window counts back from it. */
  asOf: Date;
  /** The run's locked language tag, or null when the run has none. */
  questionLanguage: string | null;
}>;

export type FrozenDigSearch = Readonly<{
  searchId: string;
  pickId: string;
  pathId: string;
  side: "dig";
  scope: WebSearchScope;
  polarity: QueryPolarity;
  language: string | null;
  country: string | null;
  pace: WebPace;
  status: "SEND" | "HELD";
  /** The cleaned words; null when they were held for personal data or first-person words (no copy is kept). */
  text: string | null;
  heldBecause: readonly SearchHoldReason[];
  personalData: readonly PersonalDataKind[];
  removed: readonly CleanedPart[];
  afterDate: string | null;
}>;

export type FrozenDigQuerySet = Readonly<{
  pathId: string;
  searches: readonly FrozenDigSearch[];
  contentHash: string;
}>;

const refuse = (code: string, message: string): never => {
  throw new TypedDomainError(code, message);
};

/** The planners' replies for a dig as its frozen query set, or a typed refusal when a reply breaks a rule. */
export function freezeDigQuerySet(plan: readonly PlannedDigPick[], context: DigPlanContext): FrozenDigQuerySet {
  if (context.pickIds.length === 0 || new Set(context.pickIds).size !== context.pickIds.length
    || context.pickIds.some((pickId) => typeof pickId !== "string" || pickId.trim() === "")) {
    refuse("DIG_PLAN_PICKS_INVALID", "A dig's picks must be distinct, non-blank ids");
  }
  if (typeof context.pathId !== "string" || context.pathId.trim() === "") {
    refuse("DIG_PLAN_PATH_INVALID", "A dig's searches are kept under one of its paths");
  }
  const planned = new Map<string, PlannedDigPick>();
  for (const pick of plan) {
    if (!context.pickIds.includes(pick.pickId)) refuse("OFF_PLAN_QUERY_REFUSED", "Retrieval queries must be derived from the dig's picks");
    if (planned.has(pick.pickId)) refuse("DIG_PLAN_PICK_REPEATED", "Each pick has one plan");
    if (pick.searches.length > DIG_SEARCHES_PER_PICK_MAX) refuse("DIG_PLAN_SEARCH_COUNT_INVALID", "A pick sends at most 4 searches");
    planned.set(pick.pickId, pick);
  }
  const searches: FrozenDigSearch[] = [];
  const sent = new Set<string>();
  // A pick with no plan (its planner failed) or no search simply sends none, in the picks' order.
  for (const pickId of context.pickIds) {
    const pick = planned.get(pickId);
    if (pick === undefined) continue;
    pick.searches.forEach((search, order) => {
      if (search.scope !== "ENGLISH" && search.scope !== "LOCAL") refuse("DIG_PLAN_SEARCH_INVALID", "A dig's search is English or local");
      if (typeof search.text !== "string") refuse("DIG_PLAN_SEARCH_INVALID", "A dig's search is plain words");
      if (pick.pace === null || !isWebPace(pick.pace)) return refuse("WEB_PACE_INVALID", "A dig's search needs a known pace word");
      const guarded = guardSearch(search.text);
      const target = search.scope === "LOCAL"
        ? localSearchTarget({ questionLanguage: context.questionLanguage, placeCountry: pick.country }) : null;
      const noTarget = search.scope === "LOCAL" && target === null;
      const key = guarded.text === null ? null : `${search.scope}:${target?.country ?? ""}:${guarded.text.toLocaleLowerCase("en")}`;
      if (key !== null && sent.has(key)) return;
      if (key !== null) sent.add(key);
      const { afterDate } = lookBackWindow(pick.pace, context.asOf);
      const held = guarded.outcome !== "SEND" || noTarget;
      searches.push(Object.freeze({
        searchId: `${context.pathId}:DIG:${pickId}:${String(order + 1)}`,
        pickId,
        pathId: context.pathId,
        side: "dig" as const,
        scope: search.scope,
        polarity: search.polarity,
        language: search.scope === "ENGLISH" ? "en" : target?.language ?? null,
        country: search.scope === "ENGLISH" ? null : target?.country ?? null,
        pace: pick.pace,
        status: held ? "HELD" as const : "SEND" as const,
        text: held ? null : guarded.text,
        heldBecause: Object.freeze([...guarded.reasons, ...(noTarget ? ["NO_LOCAL_TARGET" as const] : [])]),
        personalData: guarded.personalData,
        removed: guarded.removed,
        afterDate
      }));
    });
  }
  const frozen = Object.freeze(searches);
  const contentHash = createHash("sha256").update(JSON.stringify({ pathId: context.pathId, searches: frozen })).digest("hex");
  return Object.freeze({ pathId: context.pathId, searches: frozen, contentHash });
}
