import {
  ACCOUNT_MEMORY_LIMITS,
  AskParentSchema,
  PublicDigParentSchema,
  DIG_PLACE_PATTERN,
  DIG_SUGGESTION_KINDS,
  FREE_DIG_PICKS_MAX,
  START_STEP_LIMITS,
  WEB_CONTRACT_LIMITS,
  type Answer,
  type AskParent,
  type PublicDigParent,
  type DigPick,
  type DigSuggestion
} from "@debateai/contract";
import type { DigMode, DigTarget, V4DigDraft, V4DigPick, V4MoreItem, V4OpenQuestion, V4Path } from "./types.js";

/*
 * Perplexity plan W3-4 and the dig model revision (2026-10-30/31): choosing what to dig, on the map. A path offers its dig
 * suggestions by kind (contract DigSuggestionSchema); the person picks and combines them, edits a suggestion's text, adds
 * their own view at any path, or picks open questions. Owner rulings this file holds, so no page can break them:
 *  - Q-D1: a dig combines picks of ONE path (or of the main question's own open questions); a pick from another path is
 *    refused, never mixed in;
 *  - Q19: on Free a dig combines at most FREE_DIG_PICKS_MAX picks; a paid plan at most as many places as one dig names;
 *  - the owner's 31 Oct correction: no search words from the person, anywhere. A pick carries its text only.
 * Pure functions: nothing here fetches, stores or keeps anything (nothing is kept in the browser).
 */

/** The kinds in the order a path shows them; "helps the main question" is split by its side. */
export const SUGGESTION_GROUPS = [
  "CONTRADICTING",
  "UNDOCUMENTED",
  "NEEDS_MORE_WEB",
  "HELPS_MAIN_QUESTION.FOR",
  "HELPS_MAIN_QUESTION.AGAINST"
] as const;
export type SuggestionGroup = (typeof SUGGESTION_GROUPS)[number];

/** The catalogue key of a suggestion's kind (and side): "v4.suggest.kind.<KIND>[.<SIDE>]". */
export function suggestionKindKey(suggestion: Pick<DigSuggestion, "kind" | "side">): string {
  return `v4.suggest.kind.${groupOf(suggestion)}`;
}

function groupOf(suggestion: Pick<DigSuggestion, "kind" | "side">): SuggestionGroup {
  if (suggestion.kind !== "HELPS_MAIN_QUESTION") return suggestion.kind;
  return suggestion.side === "AGAINST" ? "HELPS_MAIN_QUESTION.AGAINST" : "HELPS_MAIN_QUESTION.FOR";
}

/** A path's suggestions shown by kind: only kinds that have one, in SUGGESTION_GROUPS order, each in the answer's order. */
export function suggestionsByKind(suggestions: readonly DigSuggestion[]): ReadonlyArray<Readonly<{
  group: SuggestionGroup; key: string; suggestions: readonly DigSuggestion[];
}>> {
  return SUGGESTION_GROUPS
    .map((group) => ({
      group,
      key: `v4.suggest.kind.${group}`,
      suggestions: Object.freeze(suggestions.filter((suggestion) => groupOf(suggestion) === group))
    }))
    .filter((entry) => entry.suggestions.length > 0);
}

/**
 * The suggestions of one path, from the answer's web part, by the position that argued it. Only well-formed ones of the
 * four kinds, each id once, at most the contract's 20. None at all when the debate is at the deepest level (its paths
 * cannot be dug, so the server writes none; an answer that still carries some does not offer them).
 */
export function pathSuggestionsOf(answer: Answer, positionRef: string): readonly DigSuggestion[] {
  const path = (answer.web?.paths ?? []).find((candidate) => candidate.position_ref === positionRef);
  if (path === undefined) return Object.freeze([]);
  const seen = new Set<string>();
  const kept: DigSuggestion[] = [];
  for (const suggestion of path.suggestions) {
    if (!(DIG_SUGGESTION_KINDS as readonly string[]).includes(suggestion.kind) || seen.has(suggestion.suggestion_id)) continue;
    if (oneLine(suggestion.text).length === 0) continue;
    seen.add(suggestion.suggestion_id);
    kept.push(suggestion);
    if (kept.length === WEB_CONTRACT_LIMITS.suggestionsPerPathMax) break;
  }
  return Object.freeze(kept);
}

/** One line of text: runs of spaces and line breaks become one space. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export const EMPTY_DRAFT: V4DigDraft = Object.freeze({ group: null, picks: Object.freeze([]) });

export type V4PlanTier = "free" | "premium";

/** How many picks one dig may combine: Free FREE_DIG_PICKS_MAX (owner Q19), a paid plan as many places as a dig names. */
export function picksMax(planTier: V4PlanTier): number {
  return planTier === "free" ? FREE_DIG_PICKS_MAX : WEB_CONTRACT_LIMITS.digPicksMax;
}

/**
 * Why a pick cannot join the draft: OTHER_PATH (owner Q-D1: the draft holds picks of another path), FULL (the plan's cap
 * is reached; on Free, 3), EMPTY (a text with nothing in it), TOO_LONG (past the contract's 2,000 characters). V4 start step,
 * Task 79 (spec 2026-11-03 §4.4): on a path debate's dig each pick is a path, so its words are a path's question (TOO_LONG past
 * 1,000), and one more path than a dig may look into is PATHS_FULL (lib/v4/digPathPlan.ts says when).
 */
export type PickRefusal = "OTHER_PATH" | "FULL" | "EMPTY" | "TOO_LONG" | "PATHS_FULL";

/** Whether a new pick of `group` may join `draft` (null: it may). An empty draft takes a pick of any group. */
export function pickRefusal(draft: V4DigDraft, group: string | null, planTier: V4PlanTier): PickRefusal | null {
  if (draft.picks.length > 0 && draft.group !== group) return "OTHER_PATH";
  if (draft.picks.length >= picksMax(planTier)) return "FULL";
  return null;
}

/**
 * `pathsParent` (Task 79): a path debate's dig, where the words become a path's question, so they stay within its 1,000 UTF-16
 * code units (the start step's lengths), well inside the pick's own 2,000 characters.
 */
function textRefusal(text: string, pathsParent: boolean): PickRefusal | null {
  const clean = text.trim();
  if (clean.length === 0) return "EMPTY";
  if (Array.from(clean).length > WEB_CONTRACT_LIMITS.pickTextMaxChars) return "TOO_LONG";
  if (pathsParent && clean.length > START_STEP_LIMITS.pathQuestionMaxChars) return "TOO_LONG";
  return null;
}

export type DraftChange = Readonly<{ draft: V4DigDraft; refused: PickRefusal | null }>;

function changed(draft: V4DigDraft): DraftChange {
  return Object.freeze({ draft, refused: null });
}

function refusedWith(draft: V4DigDraft, refused: PickRefusal): DraftChange {
  return Object.freeze({ draft, refused });
}

function withPicks(group: string | null, picks: readonly V4DigPick[]): V4DigDraft {
  return picks.length === 0 ? EMPTY_DRAFT : Object.freeze({ group, picks: Object.freeze([...picks]) });
}

/**
 * Adds `pick` (refused, the draft unchanged, when pickRefusal or its text says no). The same key twice is one pick. Task 79:
 * `pathsParent`, a path debate's dig (its words are a path's question).
 */
export function addPick(draft: V4DigDraft, pick: V4DigPick, planTier: V4PlanTier, pathsParent = false): DraftChange {
  if (draft.picks.some((known) => known.key === pick.key)) return changed(draft);
  // V4 start step, Task 60: a "+ N more" item (MORE) keeps the AIs' words, as an open question does.
  const refused = pickRefusal(draft, pick.group, planTier)
    ?? (pick.kind === "OPEN" || pick.kind === "MORE" ? null : textRefusal(pick.text, pathsParent));
  if (refused !== null) return refusedWith(draft, refused);
  const kept: V4DigPick = pick.kind === "OPEN" || pick.kind === "MORE" ? pick : Object.freeze({ ...pick, text: pick.text.trim() });
  return changed(withPicks(pick.group, [...draft.picks, kept]));
}

export function removePick(draft: V4DigDraft, key: string): V4DigDraft {
  return withPicks(draft.group, draft.picks.filter((pick) => pick.key !== key));
}

/** Adds the pick, or takes it out when it is already there (a pick box). Task 79: `pathsParent` as addPick's. */
export function togglePick(draft: V4DigDraft, pick: V4DigPick, planTier: V4PlanTier, pathsParent = false): DraftChange {
  return draft.picks.some((known) => known.key === pick.key) ? changed(removePick(draft, pick.key)) : addPick(draft, pick, planTier, pathsParent);
}

/**
 * A suggestion or own view's new text (an open question's text is never edited). Refused when empty or too long (Task 79:
 * `pathsParent` as addPick's).
 */
export function editPick(draft: V4DigDraft, key: string, text: string, pathsParent = false): DraftChange {
  const at = draft.picks.findIndex((pick) => pick.key === key);
  const pick = draft.picks[at];
  // V4 start step, Task 62: a "+ N more" item (MORE) keeps the AIs' words, as an open question does.
  if (pick === undefined || pick.kind === "OPEN" || pick.kind === "MORE") return changed(draft);
  const refused = textRefusal(text, pathsParent);
  if (refused !== null) return refusedWith(draft, refused);
  const picks = [...draft.picks];
  picks[at] = Object.freeze({ ...pick, text: text.trim() });
  return changed(withPicks(draft.group, picks));
}

export function openPick(question: V4OpenQuestion): V4DigPick {
  return Object.freeze({ kind: "OPEN", key: `open:${question.id}`, group: question.pathId, question });
}

export function suggestionPick(pathId: string, suggestion: DigSuggestion, text: string = suggestion.text): V4DigPick {
  return Object.freeze({ kind: "SUGGESTION", key: `suggestion:${suggestion.suggestion_id}`, group: pathId, suggestion, text });
}

/** The person's own view at a path; `serial` tells several own views on one path apart (the page counts them). */
export function ownViewPick(pathId: string, text: string, serial: number): V4DigPick {
  return Object.freeze({ kind: "OWN_VIEW", key: `own:${pathId}:${serial}`, group: pathId, text });
}

/** V4 start step, Task 62: a "+ N more to explore" item as a pick of the main question (its words are the AIs', never edited). */
export function morePick(item: V4MoreItem): V4DigPick {
  return Object.freeze({ kind: "MORE", key: `more:${item.id}`, group: null, more: item });
}

/**
 * V4 start step, Task 62 (spec §2.5: "it is offered first when you dig"): what the main question offers to dig. On a path
 * debate (`answer.branches`) the menu paths the person left out before Start come first, in menu order, each a MORE pick, then
 * `suggestions` as given; an R22 answer gets `suggestions` back unchanged. A MORE pick already in `suggestions` is listed once.
 */
export function digSuggestionsWithMore(answer: Answer, suggestions: readonly V4DigPick[]): readonly V4DigPick[] {
  const more = answer.branches?.more;
  if (more === undefined) return suggestions;
  const given = new Set(suggestions.map((pick) => pick.key));
  const first = more
    .map((item) => morePick(Object.freeze({ id: item.more_id, title: item.title, question: item.question, isNew: item.is_new })))
    .filter((pick) => !given.has(pick.key));
  return Object.freeze([...first, ...suggestions]);
}

/**
 * V4 start step, Task 62: the dig the main question's own button makes of the picks, only when that panel lists every one of
 * them (its open questions, `listed`, and its MORE picks, `mainPicks`); else null (the tray digs them). As digDock.ts's
 * rootPicksTarget, with the MORE picks.
 */
export function mainQuestionTarget(listed: readonly V4OpenQuestion[], mainPicks: readonly V4DigPick[], draft: V4DigDraft,
  paths: readonly V4Path[]): DigTarget | null {
  if (draft.picks.length === 0) return null;
  const open = new Set(listed.map((question) => question.id));
  const more = new Set(mainPicks.flatMap((pick) => (pick.kind === "MORE" ? [pick.key] : [])));
  const all = draft.picks.every((pick) => (pick.kind === "OPEN" && open.has(pick.question.id)) || (pick.kind === "MORE" && more.has(pick.key)));
  return all ? draftTarget(draft, paths) : null;
}

/** Whether the person changed a suggestion's text (spaces closed up). */
export function isEdited(pick: V4DigPick): boolean {
  return pick.kind === "SUGGESTION" && oneLine(pick.text) !== oneLine(pick.suggestion.text);
}

/**
 * V4 start step, Task 79a (owner answer Q18 A: code finds overlapping dig picks, no AI call, nothing counted): the points of the
 * map a pick rests on. A suggestion: the points the server names (a path debate's; none on R22); a still-argued point's open
 * question ("p:<node>"): that point; an own view, a "+ N more" item and the other open questions: none.
 */
export function pickPointsOf(pick: V4DigPick): readonly string[] {
  if (pick.kind === "SUGGESTION") return pick.suggestion.points ?? [];
  if (pick.kind === "OPEN" && pick.question.id.startsWith("p:") && pick.question.id.length > 2) return [pick.question.id.slice(2)];
  return [];
}

/** The picks' open questions, in order (the page's pick boxes read these). */
export function pickedOpenIds(draft: V4DigDraft): ReadonlySet<string> {
  return new Set(draft.picks.flatMap((pick) => (pick.kind === "OPEN" ? [pick.question.id] : [])));
}

export function pickedSuggestionIds(draft: V4DigDraft): ReadonlySet<string> {
  return new Set(draft.picks.flatMap((pick) => (pick.kind === "SUGGESTION" ? [pick.suggestion.suggestion_id] : [])));
}

/**
 * The place one pick names on the parent's map: the question's id, the suggestion's first place, the own view's path. V4 start
 * step, Task 62: a "+ N more" item names its own id (`more-<path_ref>`), under the main question.
 */
function placeOf(pick: V4DigPick): string {
  if (pick.kind === "OPEN") return pick.question.id;
  if (pick.kind === "MORE") return pick.more.id;
  if (pick.kind === "SUGGESTION") return pick.suggestion.places[0] ?? `path:${pick.group}`;
  return `path:${pick.group}`;
}

/**
 * The map places a dig of `target` names: a path's dig names its path first (so the dig hangs under it), then each
 * pick's place; each once, only places the account can keep, at most 16.
 */
export function placesOf(target: DigTarget): readonly string[] {
  const all = target.kind === "path"
    ? [`path:${target.path.id}`]
    : target.kind === "open"
      ? target.questions.map((question) => question.id)
      : [...(target.path === null ? [] : [`path:${target.path.id}`]), ...target.picks.map(placeOf)];
  return Object.freeze([...new Set(all)].filter((place) => DIG_PLACE_PATTERN.test(place)).slice(0, ACCOUNT_MEMORY_LIMITS.digPlacesMax));
}

/** One pick as the ask sends it: a suggestion with its text as sent (edited or not), or the person's own view. */
function digPickOf(pick: V4DigPick): DigPick | null {
  if (pick.kind === "OPEN") return null;
  // V4 start step, Task 62: a "+ N more" item is sent as the AIs' words for the main question, at its own place.
  if (pick.kind === "MORE") {
    return { kind: "HELPS_MAIN_QUESTION", suggestion_id: pick.more.id, place: placeOf(pick), text: pick.more.question.trim() };
  }
  const text = pick.text.trim();
  if (pick.kind === "OWN_VIEW") return { kind: "OWN_VIEW", suggestion_id: null, place: placeOf(pick), text };
  return { kind: pick.suggestion.kind, suggestion_id: pick.suggestion.suggestion_id, place: placeOf(pick), text };
}

/** The picks a dig of `target` sends (open questions travel in its places instead). */
function digPicksOf(target: DigTarget): readonly DigPick[] {
  return target.kind === "picks"
    ? target.picks.map(digPickOf).filter((pick): pick is DigPick => pick !== null).slice(0, WEB_CONTRACT_LIMITS.digPicksMax)
    : [];
}

/**
 * The ask's `parent` for a dig of `target` from `parentRunId`: its places, its mode, and its picks (only the suggestions
 * and own views; absent when it has none, as the contract asks). Checked against AskParentSchema, so a page can never
 * send a parent the API would refuse for its shape; null when it does not pass (the dig then goes without it, linked
 * after start as before).
 */
export function askParentOf(parentRunId: string, target: DigTarget, mode: DigMode): AskParent | null {
  const picks = digPicksOf(target);
  const parsed = AskParentSchema.safeParse({
    parent_run_id: parentRunId,
    places: [...placesOf(target)],
    mode,
    ...(picks.length === 0 ? {} : { picks })
  });
  return parsed.success ? parsed.data : null;
}

/**
 * Decision 13: the same dig named by a public page instead: `public_ref` is all a stranger knows of the debate, `dig_ref` the contribution they dig under
 * (null: the first debate). Null when it does not pass PublicDigParentSchema.
 */
export function publicParentOf(publicRef: string, digRef: string | null, target: DigTarget, mode: DigMode): PublicDigParent | null {
  const picks = digPicksOf(target);
  const parsed = PublicDigParentSchema.safeParse({
    public_ref: publicRef,
    ...(digRef === null ? {} : { dig_ref: digRef }),
    places: [...placesOf(target)],
    mode,
    ...(picks.length === 0 ? {} : { picks })
  });
  return parsed.success ? parsed.data : null;
}

/** The dig the draft makes: its picks, under the path they belong to (null: the main question's own open questions). */
export function draftTarget(draft: V4DigDraft, paths: readonly V4Path[]): DigTarget | null {
  if (draft.picks.length === 0) return null;
  const path = draft.group === null ? null : paths.find((candidate) => candidate.id === draft.group) ?? null;
  return Object.freeze({ kind: "picks", path, picks: draft.picks });
}
