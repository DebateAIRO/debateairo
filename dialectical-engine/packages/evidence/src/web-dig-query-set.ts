import { createHash } from "node:crypto";
import { TypedDomainError, type PersonalDataKind } from "@debateai/kernel";
import { guardSearch, type CleanedPart, type SearchHoldReason } from "./query-guard.js";
import { isWebPace, lookBackWindow, type WebPace } from "./window.js";

/**
 * THE FROZEN QUERY SET OF A DIG (web search plan 2026-10-30, task W4-2; dig-model revision 2026-10-30 with the owner's
 * corrections of 31 Oct: the person writes no search words, the planner alone writes what is sent; owner Q9: "one search
 * per suggestion (5 articles each)").
 *
 * A dig is a short follow-up debate on what the person picked on one path (AI suggestions, their edits, their own view).
 * The planner writes ONE search per pick; this set freezes them in code, with no AI:
 * - every search belongs to a pick of the dig (a search for anything else is refused, OFF_PLAN_QUERY_REFUSED, the rule
 *   `freezeWebQuerySet` keeps for a debate's paths), each pick has exactly one, and no two picks send the same words;
 * - there is NO for-and-against pair: a dig's search looks for what would settle the pick either way (side `dig` in 0132);
 * - each search is cleaned and guarded (`guardSearch`, W1-2's personal-data guard): a held one keeps no words and holds
 *   back no other (there is no partner);
 * - the look-back date comes from the search's pace word and the run's date;
 * - every search is in English with no country (a dig's searches are not split into local ones).
 * All of a dig's searches are kept under one path of the dig's map (`pathId`): its pages, its extracts and its one pack,
 * which every path of the dig shares (plan W4-2, "the pack is shared by the dig's paths").
 */
export type PlannedDigSearch = Readonly<{ pickId: string; pace: WebPace; text: string }>;

export type DigPlanContext = Readonly<{
  /** The dig's picks, in their order (0135's pick numbers as ids): the only things a search may belong to. */
  pickIds: readonly string[];
  /** The dig's path its searches are kept under (the pack's path). */
  pathId: string;
  /** The run's date; the look-back window counts back from it. */
  asOf: Date;
}>;

export type FrozenDigSearch = Readonly<{
  searchId: string;
  pickId: string;
  pathId: string;
  side: "dig";
  scope: "ENGLISH";
  language: "en";
  country: null;
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

/** The planner's reply for a dig as its frozen query set, or a typed refusal when the reply breaks a rule. */
export function freezeDigQuerySet(plan: readonly PlannedDigSearch[], context: DigPlanContext): FrozenDigQuerySet {
  if (context.pickIds.length === 0 || new Set(context.pickIds).size !== context.pickIds.length
    || context.pickIds.some((pickId) => typeof pickId !== "string" || pickId.trim() === "")) {
    refuse("DIG_PLAN_PICKS_INVALID", "A dig's picks must be distinct, non-blank ids");
  }
  if (typeof context.pathId !== "string" || context.pathId.trim() === "") {
    refuse("DIG_PLAN_PATH_INVALID", "A dig's searches are kept under one of its paths");
  }
  const planned = new Map<string, PlannedDigSearch>();
  for (const search of plan) {
    if (!context.pickIds.includes(search.pickId)) refuse("OFF_PLAN_QUERY_REFUSED", "Retrieval queries must be derived from the dig's picks");
    if (planned.has(search.pickId)) refuse("DIG_PLAN_PICK_REPEATED", "Each pick has one search");
    planned.set(search.pickId, search);
  }
  const searches: FrozenDigSearch[] = [];
  const sent = new Set<string>();
  for (const pickId of context.pickIds) {
    const search = planned.get(pickId) ?? refuse("DIG_PLAN_PICK_MISSING", "Every pick of the dig needs its search");
    if (!isWebPace(search.pace)) refuse("WEB_PACE_INVALID", "A dig's search needs a known pace word");
    if (typeof search.text !== "string") refuse("DIG_PLAN_SEARCH_INVALID", "A dig's search is plain words");
    const guarded = guardSearch(search.text);
    const key = guarded.text?.toLocaleLowerCase("en") ?? null;
    if (key !== null && sent.has(key)) refuse("DIG_QUERY_REPEATED", "Two picks may not send the same search");
    if (key !== null) sent.add(key);
    const { afterDate } = lookBackWindow(search.pace, context.asOf);
    searches.push(Object.freeze({
      searchId: `${context.pathId}:DIG:${pickId}`,
      pickId,
      pathId: context.pathId,
      side: "dig" as const,
      scope: "ENGLISH" as const,
      language: "en" as const,
      country: null,
      pace: search.pace,
      status: guarded.outcome === "SEND" ? "SEND" as const : "HELD" as const,
      text: guarded.text,
      heldBecause: guarded.reasons,
      personalData: guarded.personalData,
      removed: guarded.removed,
      afterDate
    }));
  }
  const frozen = Object.freeze(searches);
  const contentHash = createHash("sha256").update(JSON.stringify({ pathId: context.pathId, searches: frozen })).digest("hex");
  return Object.freeze({ pathId: context.pathId, searches: frozen, contentHash });
}
