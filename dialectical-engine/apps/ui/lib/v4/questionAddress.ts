import { WEB_CONTRACT_LIMITS, WEB_REF_PATTERN } from "@debateai/contract";
import { uniqueOpenQuestions } from "./mapModel.js";
import { addPick, EMPTY_DRAFT, openPick, suggestionPick } from "./suggestions.js";
import type { V4DigDraft, V4DigPick, V4Map, V4Selection } from "./types.js";

/*
 * V4 screen review, 3 Nov (journey-d4 A, map-f24, dig-f23): the map page's address says where the person is and what
 * they ticked, so Back, a reload and a shared link all keep it. Nothing here is kept in the browser's storage (the cookie
 * inventory is law): the address is the only memory.
 *  - The opened question: `?path=<path id>` (the name links back from a dig already use), `?open=<open question id>` or
 *    `?dig=<the dig's run id>`; none of them is the main question.
 *  - The ticked picks, in the order they were ticked: `?pick=s.<suggestion id>` for a dig suggestion, `?pick=o.<open
 *    question id>` for an open question. Only ids, never words: an edited wording or the person's own view stays in the
 *    page (personal words do not go in an address), so a reload brings back the tick and not the edit.
 * Every other parameter (the reading level's `?level=`) and any `#part` are kept as they are. Pure functions only.
 */

export const QUESTION_PARAMS = Object.freeze({ path: "path", open: "open", dig: "dig", pick: "pick" });

/** A path id as the map names it (a story position, "#2" on a repeat); the server page reads `?path=` the same way. */
const PATH_ID = /^[A-Za-z0-9_.:#-]{1,160}$/u;
/** An open question's id ("p:<point>", "o:<n>", "w"): printable characters without spaces, quotes or backslashes. */
const OPEN_ID = /^[\x21\x23-\x5b\x5d-\x7e]{1,160}$/u;
/** A dig's run id. */
const DIG_ID = /^[A-Za-z0-9-]{1,64}$/u;

/** One tick the address keeps: a dig suggestion or an open question, by id only. */
export type AddressPick = Readonly<{ kind: "SUGGESTION" | "OPEN"; id: string }>;

/** The most ticks one address carries: as many as one dig may combine on a paid plan. */
const PICKS_MAX = WEB_CONTRACT_LIMITS.digPicksMax;

function paramsOf(search: string): URLSearchParams {
  try {
    return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  } catch {
    return new URLSearchParams();
  }
}

/** The question the address names, or null when it names none (then the page opens the main question). */
export function selectionFromSearch(search: string): V4Selection | null {
  const params = paramsOf(search);
  const path = params.get(QUESTION_PARAMS.path);
  if (path !== null && PATH_ID.test(path)) return `path:${path}`;
  const open = params.get(QUESTION_PARAMS.open);
  if (open !== null && OPEN_ID.test(open)) return `open:${open}`;
  const dig = params.get(QUESTION_PARAMS.dig);
  if (dig !== null && DIG_ID.test(dig)) return `dig:${dig}`;
  return null;
}

/** The ticks the address keeps, in order, each once; anything malformed is left out. */
export function picksFromSearch(search: string): readonly AddressPick[] {
  const seen = new Set<string>();
  const picks: AddressPick[] = [];
  for (const raw of paramsOf(search).getAll(QUESTION_PARAMS.pick)) {
    const pick = parsePick(raw);
    if (pick === null) continue;
    const key = `${pick.kind}/${pick.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    picks.push(pick);
    if (picks.length === PICKS_MAX) break;
  }
  return Object.freeze(picks);
}

function parsePick(raw: string): AddressPick | null {
  if (raw.startsWith("s.")) {
    const id = raw.slice(2);
    return WEB_REF_PATTERN.test(id) ? Object.freeze({ kind: "SUGGESTION", id }) : null;
  }
  if (raw.startsWith("o.")) {
    const id = raw.slice(2);
    return OPEN_ID.test(id) ? Object.freeze({ kind: "OPEN", id }) : null;
  }
  return null;
}

function pickParam(pick: AddressPick): string {
  return `${pick.kind === "SUGGESTION" ? "s" : "o"}.${pick.id}`;
}

/** The ticks of a draft the address may keep: suggestions and open questions by id; the person's own views never. */
export function addressPicksOf(draft: V4DigDraft): readonly AddressPick[] {
  return Object.freeze(draft.picks.flatMap((pick: V4DigPick): AddressPick[] => {
    if (pick.kind === "SUGGESTION") return [{ kind: "SUGGESTION", id: pick.suggestion.suggestion_id }];
    if (pick.kind === "OPEN") return [{ kind: "OPEN", id: pick.question.id }];
    return [];
  }).slice(0, PICKS_MAX));
}

/** A short key for a list of ticks (equal lists, equal keys). */
export function picksKeyOf(picks: readonly AddressPick[]): string {
  return picks.map(pickParam).join("\n");
}

/**
 * `href` (a path with its `?query` and `#part`) naming `selection` and `picks` instead of whatever it named: every other
 * parameter and the `#part` are kept. `picks` null leaves the address's own ticks as they are.
 */
export function addressWith(href: string, selection: V4Selection, picks: readonly AddressPick[] | null): string {
  const hashAt = href.indexOf("#");
  const hash = hashAt === -1 ? "" : href.slice(hashAt);
  const beforeHash = hashAt === -1 ? href : href.slice(0, hashAt);
  const queryAt = beforeHash.indexOf("?");
  const base = queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt);
  const params = paramsOf(queryAt === -1 ? "" : beforeHash.slice(queryAt + 1));
  const keptPicks = picks === null ? params.getAll(QUESTION_PARAMS.pick) : picks.slice(0, PICKS_MAX).map(pickParam);
  for (const name of Object.values(QUESTION_PARAMS)) params.delete(name);
  if (selection.startsWith("path:")) params.set(QUESTION_PARAMS.path, selection.slice("path:".length));
  else if (selection.startsWith("open:")) params.set(QUESTION_PARAMS.open, selection.slice("open:".length));
  else if (selection.startsWith("dig:")) params.set(QUESTION_PARAMS.dig, selection.slice("dig:".length));
  for (const pick of keptPicks) params.append(QUESTION_PARAMS.pick, pick);
  const query = params.toString();
  return `${base}${query.length === 0 ? "" : `?${query}`}${hash}`;
}

/**
 * The draft the address's ticks make on this map: each suggestion on the path that offers it, each open question as the
 * map has it, by the same rules as a tick on the page (owner Q-D1: one path; a pick of another path is left out). A tick
 * the map no longer has is left out. The paid plan's cap: the address was written by the person's own page.
 */
export function draftFromAddress(map: V4Map, picks: readonly AddressPick[]): V4DigDraft {
  let draft = EMPTY_DRAFT;
  const open = uniqueOpenQuestions(map);
  for (const pick of picks) {
    let made: V4DigPick | null = null;
    if (pick.kind === "SUGGESTION") {
      for (const path of map.paths) {
        const suggestion = (path.suggestions ?? []).find((candidate) => candidate.suggestion_id === pick.id);
        if (suggestion !== undefined) {
          made = suggestionPick(path.id, suggestion);
          break;
        }
      }
    } else {
      const question = open.find((candidate) => candidate.id === pick.id);
      if (question !== undefined) made = openPick(question);
    }
    if (made !== null) draft = addPick(draft, made, "premium").draft;
  }
  return draft;
}
