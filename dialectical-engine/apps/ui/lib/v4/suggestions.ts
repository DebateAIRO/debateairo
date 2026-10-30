import {
  ACCOUNT_MEMORY_LIMITS,
  AskParentSchema,
  DIG_PLACE_PATTERN,
  DIG_SUGGESTION_KINDS,
  FREE_DIG_PICKS_MAX,
  WEB_CONTRACT_LIMITS,
  type Answer,
  type AskParent,
  type DigPick,
  type DigSuggestion
} from "@debateai/contract";
import type { DigMode, DigTarget, V4DigDraft, V4DigPick, V4OpenQuestion, V4Path } from "./types.js";

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
 * is reached; on Free, 3), EMPTY (a text with nothing in it), TOO_LONG (past the contract's 2,000 characters).
 */
export type PickRefusal = "OTHER_PATH" | "FULL" | "EMPTY" | "TOO_LONG";

/** Whether a new pick of `group` may join `draft` (null: it may). An empty draft takes a pick of any group. */
export function pickRefusal(draft: V4DigDraft, group: string | null, planTier: V4PlanTier): PickRefusal | null {
  if (draft.picks.length > 0 && draft.group !== group) return "OTHER_PATH";
  if (draft.picks.length >= picksMax(planTier)) return "FULL";
  return null;
}

function textRefusal(text: string): PickRefusal | null {
  const clean = text.trim();
  if (clean.length === 0) return "EMPTY";
  if (Array.from(clean).length > WEB_CONTRACT_LIMITS.pickTextMaxChars) return "TOO_LONG";
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

/** Adds `pick` (refused, the draft unchanged, when pickRefusal or its text says no). The same key twice is one pick. */
export function addPick(draft: V4DigDraft, pick: V4DigPick, planTier: V4PlanTier): DraftChange {
  if (draft.picks.some((known) => known.key === pick.key)) return changed(draft);
  const refused = pickRefusal(draft, pick.group, planTier) ?? (pick.kind === "OPEN" ? null : textRefusal(pick.text));
  if (refused !== null) return refusedWith(draft, refused);
  const kept: V4DigPick = pick.kind === "OPEN" ? pick : Object.freeze({ ...pick, text: pick.text.trim() });
  return changed(withPicks(pick.group, [...draft.picks, kept]));
}

export function removePick(draft: V4DigDraft, key: string): V4DigDraft {
  return withPicks(draft.group, draft.picks.filter((pick) => pick.key !== key));
}

/** Adds the pick, or takes it out when it is already there (a pick box). */
export function togglePick(draft: V4DigDraft, pick: V4DigPick, planTier: V4PlanTier): DraftChange {
  return draft.picks.some((known) => known.key === pick.key) ? changed(removePick(draft, pick.key)) : addPick(draft, pick, planTier);
}

/** A suggestion or own view's new text (an open question's text is never edited). Refused when empty or too long. */
export function editPick(draft: V4DigDraft, key: string, text: string): DraftChange {
  const at = draft.picks.findIndex((pick) => pick.key === key);
  const pick = draft.picks[at];
  if (pick === undefined || pick.kind === "OPEN") return changed(draft);
  const refused = textRefusal(text);
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

/** Whether the person changed a suggestion's text (spaces closed up). */
export function isEdited(pick: V4DigPick): boolean {
  return pick.kind === "SUGGESTION" && oneLine(pick.text) !== oneLine(pick.suggestion.text);
}

/** The picks' open questions, in order (the page's pick boxes read these). */
export function pickedOpenIds(draft: V4DigDraft): ReadonlySet<string> {
  return new Set(draft.picks.flatMap((pick) => (pick.kind === "OPEN" ? [pick.question.id] : [])));
}

export function pickedSuggestionIds(draft: V4DigDraft): ReadonlySet<string> {
  return new Set(draft.picks.flatMap((pick) => (pick.kind === "SUGGESTION" ? [pick.suggestion.suggestion_id] : [])));
}

/** The place one pick names on the parent's map: the question's id, the suggestion's first place, the own view's path. */
function placeOf(pick: V4DigPick): string {
  if (pick.kind === "OPEN") return pick.question.id;
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
  const text = pick.text.trim();
  if (pick.kind === "OWN_VIEW") return { kind: "OWN_VIEW", suggestion_id: null, place: placeOf(pick), text };
  return { kind: pick.suggestion.kind, suggestion_id: pick.suggestion.suggestion_id, place: placeOf(pick), text };
}

/**
 * The ask's `parent` for a dig of `target` from `parentRunId`: its places, its mode, and its picks (only the suggestions
 * and own views; absent when it has none, as the contract asks). Checked against AskParentSchema, so a page can never
 * send a parent the API would refuse for its shape; null when it does not pass (the dig then goes without it, linked
 * after start as before).
 */
export function askParentOf(parentRunId: string, target: DigTarget, mode: DigMode): AskParent | null {
  const picks = target.kind === "picks"
    ? target.picks.map(digPickOf).filter((pick): pick is DigPick => pick !== null).slice(0, WEB_CONTRACT_LIMITS.digPicksMax)
    : [];
  const parsed = AskParentSchema.safeParse({
    parent_run_id: parentRunId,
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
