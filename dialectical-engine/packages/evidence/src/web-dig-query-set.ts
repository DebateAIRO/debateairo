import { createHash } from "node:crypto";
import { TypedDomainError, type PersonalDataKind } from "@debateai/kernel";
import { guardSearch, type CleanedPart, type SearchHoldReason } from "./query-guard.js";
import type { QueryPolarity } from "./index.js";
import { localSearchTarget, type WebSearchScope } from "./web-query-set.js";
import { isWebPace, lookBackWindow, type WebPace } from "./window.js";

/**
 * THE FROZEN QUERY SET OF A DIG (web search plan 2026-10-30, task W4-2; R22 decision 9 of 2026-10-31, which replaces "one
 * search per pick": a dig works like a first debate; the owner's later answer: always a pair).
 *
 * A dig is a short follow-up debate on what the person picked on one path (AI suggestions, their edits, their own view).
 * Each pick's planner writes none, or a pair (one for, one against), and when it judges that worth it a local pair: 0, 2 or
 * 4 searches. This set freezes them in code, with no AI:
 * - every search belongs to a pick of the dig (a search for anything else is refused, OFF_PLAN_QUERY_REFUSED, the rule
 *   `freezeWebQuerySet` keeps for a debate's paths);
 * - each pick is kept under its own path_ref (`pathIdOf`), as a path of a first debate is: its searches, pages, top pages and
 *   pack are its own;
 * - each pair has its search for AND its search against, and the two may not be the same words once cleaned; anything else
 *   is refused (DIG_PLAN_PAIR_INVALID), so an odd number of searches can never be sent;
 * - each search is cleaned and guarded (`guardSearch`, W1-2's personal-data guard): a held search holds its partner back too,
 *   so a pick never sends one side of a pair alone (PAIR_PARTNER_HELD);
 * - the same words from two picks stay in both picks' sets, each with its pair whole: `distinctSends` counts them once, and the
 *   web step sends them once and hands the one answer to both (web-step.ts);
 * - the look-back date comes from the pick's pace word and the run's date;
 * - an English search carries no country; a local one carries `localSearchTarget`'s language and country, and is held back
 *   (NO_LOCAL_TARGET) when none can be worked out.
 */
export const DIG_SEARCHES_PER_PICK_MAX = 4 as const;
const POLARITIES: readonly QueryPolarity[] = ["SUPPORTING", "DISCONFIRMING"];

export type PlannedDigSearch = Readonly<{ scope: WebSearchScope; polarity: QueryPolarity; text: string }>;
/** One pick's plan: its searches (none: the planner decided no search is worth it), its pace and the country it read. */
export type PlannedDigPick = Readonly<{ pickId: string; pace: WebPace | null; country: string | null; searches: readonly PlannedDigSearch[] }>;

export type DigPlanContext = Readonly<{
  /** The dig's picks, in their order (0135's pick numbers as ids): the only things a search may belong to. */
  pickIds: readonly string[];
  /** The path_ref each pick's searches, pages and pack are kept under. */
  pathIdOf: (pickId: string) => string;
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
  searches: readonly FrozenDigSearch[];
  /** The searches that will really be sent: held ones are not, and the same words from two picks go once. */
  distinctSends: number;
  contentHash: string;
}>;

/** What makes two searches of a dig the same request: its reach and its cleaned words. The web step sends each once. */
export function digSearchSameAs(search: Pick<FrozenDigSearch, "scope" | "country" | "text" | "afterDate">): string | null {
  return search.text === null ? null : [search.scope, search.country ?? "", search.afterDate ?? "", search.text.toLocaleLowerCase("en")].join("\0");
}

const refuse = (code: string, message: string): never => {
  throw new TypedDomainError(code, message);
};

/** The planners' replies for a dig as its frozen query set, or a typed refusal when a reply breaks a rule. */
export function freezeDigQuerySet(plan: readonly PlannedDigPick[], context: DigPlanContext): FrozenDigQuerySet {
  if (context.pickIds.length === 0 || new Set(context.pickIds).size !== context.pickIds.length
    || context.pickIds.some((pickId) => typeof pickId !== "string" || pickId.trim() === "")) {
    refuse("DIG_PLAN_PICKS_INVALID", "A dig's picks must be distinct, non-blank ids");
  }
  const planned = new Map<string, PlannedDigPick>();
  for (const pick of plan) {
    if (!context.pickIds.includes(pick.pickId)) refuse("OFF_PLAN_QUERY_REFUSED", "Retrieval queries must be derived from the dig's picks");
    if (planned.has(pick.pickId)) refuse("DIG_PLAN_PICK_REPEATED", "Each pick has one plan");
    if (pick.searches.length > DIG_SEARCHES_PER_PICK_MAX) refuse("DIG_PLAN_SEARCH_COUNT_INVALID", "A pick sends at most 4 searches");
    planned.set(pick.pickId, pick);
  }
  const searches: FrozenDigSearch[] = [];
  // A pick with no plan (its planner failed) or no search simply sends none, in the picks' order.
  for (const pickId of context.pickIds) {
    const pick = planned.get(pickId);
    if (pick === undefined || pick.searches.length === 0) continue;
    if (pick.pace === null || !isWebPace(pick.pace)) refuse("WEB_PACE_INVALID", "A dig's search needs a known pace word");
    const pathId = context.pathIdOf(pickId);
    if (typeof pathId !== "string" || pathId.trim() === "") refuse("DIG_PLAN_PATH_INVALID", "A dig's searches are kept under a path");
    const english = pick.searches.filter((search) => search.scope === "ENGLISH");
    const local = pick.searches.filter((search) => search.scope === "LOCAL");
    if (english.length + local.length !== pick.searches.length) refuse("DIG_PLAN_SEARCH_INVALID", "A dig's search is English or local");
    if (english.length === 0) refuse("DIG_PLAN_PAIR_INVALID", "A pick that searches has its English pair");
    const { afterDate } = lookBackWindow(pick.pace!, context.asOf);
    const target = local.length === 0 ? null : localSearchTarget({ questionLanguage: context.questionLanguage, placeCountry: pick.country });
    for (const [scope, pair] of [["ENGLISH", english], ["LOCAL", local]] as const) {
      if (pair.length === 0) continue;
      const bySide = POLARITIES.map((polarity) => pair.filter((search) => search.polarity === polarity));
      if (pair.length !== 2 || bySide.some((side) => side.length !== 1)) refuse("DIG_PLAN_PAIR_INVALID", "A pair is one search for and one against");
      for (const side of bySide) if (typeof side[0]!.text !== "string") refuse("DIG_PLAN_SEARCH_INVALID", "A dig's search is plain words");
      const guarded = bySide.map((side) => guardSearch(side[0]!.text));
      const [forWords, againstWords] = guarded.map((search) => search.text?.toLocaleLowerCase("en") ?? null);
      if (forWords !== null && forWords === againstWords) refuse("DIG_PLAN_PAIR_INVALID", "The search against must differ from the search for");
      const noTarget = scope === "LOCAL" && target === null;
      const partnerHeld = guarded.some((search) => search.outcome !== "SEND");
      POLARITIES.forEach((polarity, index) => {
        const search = guarded[index]!;
        const heldBecause: SearchHoldReason[] = [...search.reasons];
        if (heldBecause.length === 0 && partnerHeld) heldBecause.push("PAIR_PARTNER_HELD");
        if (noTarget) heldBecause.push("NO_LOCAL_TARGET");
        const held = heldBecause.length > 0;
        searches.push(Object.freeze({
          searchId: `${pathId}:DIG:${scope}:${polarity}`,
          pickId,
          pathId,
          side: "dig" as const,
          scope,
          polarity,
          language: scope === "ENGLISH" ? "en" : target?.language ?? null,
          country: scope === "ENGLISH" ? null : target?.country ?? null,
          pace: pick.pace!,
          status: held ? "HELD" as const : "SEND" as const,
          text: held ? null : search.text,
          heldBecause: Object.freeze(heldBecause),
          personalData: search.personalData,
          removed: search.removed,
          afterDate
        }));
      });
    }
  }
  const frozen = Object.freeze(searches);
  const sends = frozen.filter((search) => search.status === "SEND").map((search) => digSearchSameAs(search));
  const contentHash = createHash("sha256").update(JSON.stringify({ searches: frozen })).digest("hex");
  return Object.freeze({ searches: frozen, distinctSends: new Set(sends).size, contentHash });
}
