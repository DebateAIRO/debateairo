import { ACCOUNT_MEMORY_LIMITS, DIG_LEVEL_MAX, FREE_DIG_PICKS_MAX, type AskParent, type DigPick } from "@debateai/contract";

/**
 * Plan 2026-10-30 dig-model revision, task W3-2 — A DIG'S ADMISSION, before anything is charged.
 *
 * `POST /v1/asks` with a `parent` is a dig of the parent debate. Before the question check (which costs a site call) and
 * before the room, in this order:
 *  1. Free combines at most FREE_DIG_PICKS_MAX picks (owner answer Q19) — no read needed.
 *  2. The parent is the person's: `PostgresDigModelRepository.readDigLevel` answers null otherwise (the closed 404).
 *  3. The parent is above the deepest level: a parent at DIG_LEVEL_MAX (10) cannot be dug, 409 DIG_TOO_DEEP. This is
 *     the dig level, how many digs sit above a debate; it is not how far one debate's argument tree grows.
 *  4. Every pick, and every place the dig names, is on ONE path of the parent's map (owner Q-D1): a dig only combines
 *     picks from the same path. Where a place hangs is read from the parent's story the way the map reads it
 *     (apps/ui/lib/v4/mapModel.ts): "path:<id>" is that path; "p:<node>" is every story path whose points include the
 *     node, or the question itself when none does (or there is no story yet); an objection ("o:<n>"), "w" and anything
 *     else hang under the question itself. The places must share one anchor.
 * At start, `joinAtStart` joins the dig to its parent's investigation through `PostgresInvestigationRepository.join`
 * (0134's join_investigation_nested, which writes 0131's dig link too and answers TOO_DEEP itself under its locks).
 * There are no search words: what is searched stays the planner's decision.
 *
 * W3-7: once the dig joined, `recordDigPicksAtStart` keeps what it was made of (0135, `PostgresDigPicksRepository`): the
 * path its places share (`digAnchorOf`, the one its path rewrite changes; none when they hang under the main question)
 * and each pick with who wrote it (`digPickAuthorOf`). The runner reads them back when the dig settles.
 */

/** The parent map's paths as the dig rule reads them: each path's id (the map's) and the points it holds. */
export type DigPathIndex = ReadonlyArray<Readonly<{ pathId: string; nodeRefs: readonly string[] }>>;

export interface DigAdmissionPorts {
  /** The parent's level (0 when it is in no investigation); null when it is not this account's. */
  readDigLevel(ownerRef: string, runId: string): Promise<number | null>;
  /** The parent's story paths; null when the parent has no story (yet). */
  readPathIndex?(ownerRef: string, parentRunId: string): Promise<DigPathIndex | null>;
}

export type DigAdmission =
  /** `positionRef`: the path of the parent's map the dig's places share (`digAnchorOf`); null: the main question itself. */
  | Readonly<{ kind: "ADMIT"; parentLevel: number; positionRef: string | null }>
  | Readonly<{ kind: "NOT_FOUND" }>
  | Readonly<{ kind: "TOO_DEEP" }>
  /** The request is not one the page sends: more picks than Free combines, or picks from more than one path. */
  | Readonly<{ kind: "MALFORMED"; reason: "FREE_PICKS_OVER" | "PICKS_NOT_ON_ONE_PATH" }>;

/** What a place hangs under on the parent's map: path ids, or the question itself. */
const QUESTION = "\u0000question";

/**
 * The paths a story lists, with the map's ids: a position argued by two paths names the second "<ref>#2", the third
 * "<ref>#3", exactly as the map does (mapModel.ts `storyPaths`).
 */
export function digPathIndexOf(paths: ReadonlyArray<Readonly<{ position_ref: string; node_refs: readonly string[] }>>): DigPathIndex {
  const seen = new Map<string, number>();
  return Object.freeze(paths.map((path) => {
    const times = (seen.get(path.position_ref) ?? 0) + 1;
    seen.set(path.position_ref, times);
    return Object.freeze({ pathId: times === 1 ? path.position_ref : `${path.position_ref}#${times}`, nodeRefs: Object.freeze([...path.node_refs]) });
  }));
}

function anchorsOf(place: string, index: DigPathIndex | null): ReadonlySet<string> {
  if (place.startsWith("path:")) return new Set([place.slice("path:".length)]);
  if (place.startsWith("p:") && index !== null) {
    const node = place.slice("p:".length);
    const paths = index.filter((path) => path.nodeRefs.includes(node)).map((path) => path.pathId);
    if (paths.length > 0) return new Set(paths);
  }
  return new Set([QUESTION]);
}

/** The anchors every place of the dig (its own places and each pick's) shares; null when it names no place. */
function sharedAnchorsOf(parent: AskParent, index: DigPathIndex | null): ReadonlySet<string> | null {
  const places = [...parent.places, ...(parent.picks ?? []).map((pick) => pick.place)];
  let shared: ReadonlySet<string> | null = null;
  for (const place of places) {
    const anchors = anchorsOf(place, index);
    const before: ReadonlySet<string> | null = shared;
    shared = before === null ? new Set(anchors) : new Set([...before].filter((anchor: string) => anchors.has(anchor)));
    if (shared.size === 0) return shared;
  }
  return shared;
}

/** Owner Q-D1: every place of the dig (its own places and each pick's) shares one anchor on the parent's map. */
export function digPicksOnOnePath(parent: AskParent, index: DigPathIndex | null): boolean {
  const shared = sharedAnchorsOf(parent, index);
  return shared === null || shared.size > 0;
}

/**
 * W3-7: the one path of the parent's map a dig rewrites, the map's path id: the path every place shares, the first in the
 * story's order when a point the dig names is on two. Null when its places hang under the main question itself (no path
 * to rewrite), or when it names none.
 */
export function digAnchorOf(parent: AskParent, index: DigPathIndex | null): string | null {
  const shared = sharedAnchorsOf(parent, index);
  if (shared === null || shared.size === 0 || shared.has(QUESTION)) return null;
  const ordered = [...(index ?? []).map((path) => path.pathId).filter((pathId) => shared.has(pathId)),
    ...[...shared].filter((pathId) => !(index ?? []).some((path) => path.pathId === pathId)).sort()];
  return ordered[0] ?? null;
}

/** The contract's DIG_PICK_AUTHORS. */
export type DigPickAuthor = "AI_SUGGESTION" | "PERSON_EDITED" | "PERSON_OWN_VIEW";

/**
 * W3-7: who wrote a pick. The person's own view is theirs. A chosen suggestion is the AI's only when its text is the stored
 * suggestion's, word for word (both trimmed, as the contract keeps them); otherwise the person edited it. With no stored
 * suggestion to compare with, the text is what the person sent, and it is never passed off as an AI's: PERSON_EDITED.
 */
export function digPickAuthorOf(pick: DigPick, storedSuggestionText: string | null): DigPickAuthor {
  if (pick.kind === "OWN_VIEW") return "PERSON_OWN_VIEW";
  return storedSuggestionText !== null && storedSuggestionText.trim() === pick.text.trim() ? "AI_SUGGESTION" : "PERSON_EDITED";
}

/** The dig's checks, cheapest first; nothing is written and nothing charged. */
export async function admitDig(input: Readonly<{ ownerRef: string; parent: AskParent; free: boolean }>,
  ports: DigAdmissionPorts): Promise<DigAdmission> {
  if (input.free && (input.parent.picks?.length ?? 0) > FREE_DIG_PICKS_MAX) {
    return Object.freeze({ kind: "MALFORMED" as const, reason: "FREE_PICKS_OVER" as const });
  }
  const level = await ports.readDigLevel(input.ownerRef, input.parent.parent_run_id);
  if (level === null) return Object.freeze({ kind: "NOT_FOUND" as const });
  if (level >= DIG_LEVEL_MAX) return Object.freeze({ kind: "TOO_DEEP" as const });
  const index = ports.readPathIndex === undefined ? null : await ports.readPathIndex(input.ownerRef, input.parent.parent_run_id);
  if (!digPicksOnOnePath(input.parent, index)) {
    return Object.freeze({ kind: "MALFORMED" as const, reason: "PICKS_NOT_ON_ONE_PATH" as const });
  }
  return Object.freeze({ kind: "ADMIT" as const, parentLevel: level, positionRef: digAnchorOf(input.parent, index) });
}

export type DigJoinOutcome = "JOINED" | "ALREADY" | "NOT_OWNED" | "CLOSED" | "CONFLICT" | "TOO_DEEP";
export interface DigJoinPort {
  join(input: Readonly<{ ownerRef: string; parentRunId: string; childRunId: string; places: readonly string[];
    mode: "quick" | "thorough" }>): Promise<Readonly<{ outcome: DigJoinOutcome; investigationId: string | null; digLevel: number | null }>>;
  /** 0133's reopen_investigation: a closed investigation opens again (its earlier report versions are kept). */
  reopen(ownerRef: string, investigationId: string): Promise<"REOPENED" | "ALREADY_OPEN" | "NOT_OWNED">;
}

/**
 * At start (the dig's run exists, started or waiting in line): the dig joins its parent's investigation, and its dig
 * link is written with it. Its places are the dig's own and its picks', each once, in order. A join that does not take
 * (two quick clicks raced past level 10, the parent closed or changed hands meanwhile) leaves the run as it is: the
 * page's own after-start call (POST /v1/runs/{id}/dig-links) stays as the fallback, and the line names only the
 * outcome code, never the question. The link's places are the dig's own, or (a page that names none) its picks', each
 * once, at most the link's 16. Digging into a CLOSED investigation (after "Write my report") reopens it first, then
 * joins: a new dig always belongs to its parent's investigation, at any level.
 */
export async function joinAtStart(input: Readonly<{ ownerRef: string; parent: AskParent; childRunId: string }>,
  port: DigJoinPort, log: (line: string) => void = (line) => console.error(line)): Promise<DigJoinOutcome> {
  const named = input.parent.places.length > 0 ? input.parent.places : (input.parent.picks ?? []).map((pick) => pick.place);
  const places = [...new Set(named)].slice(0, ACCOUNT_MEMORY_LIMITS.digPlacesMax);
  const join = () => port.join({ ownerRef: input.ownerRef, parentRunId: input.parent.parent_run_id, childRunId: input.childRunId,
    places, mode: input.parent.mode });
  let joined = await join();
  if (joined.outcome === "CLOSED" && joined.investigationId !== null
    && await port.reopen(input.ownerRef, joined.investigationId) !== "NOT_OWNED") {
    joined = await join();
  }
  if (joined.outcome !== "JOINED" && joined.outcome !== "ALREADY") {
    log(JSON.stringify({ kind: "DEBATEAI_DIG_JOIN", code: `DIG_JOIN_${joined.outcome}` }));
  }
  return joined.outcome;
}

/** W3-7: 0135's picks writer (`PostgresDigPicksRepository.record`). */
export interface DigPicksPort {
  record(input: Readonly<{ ownerRef: string; runId: string; parentRunId: string; positionRef: string | null;
    picks: readonly Readonly<{ kind: DigPick["kind"]; suggestionId: string | null; place: string; author: DigPickAuthor; text: string }>[] }>):
    Promise<"RECORDED" | "ALREADY" | "NOT_OWNED" | "NOT_A_DIG" | "NOT_SEALED">;
}
/** The stored text of a dig suggestion of the parent (W4-3's store), or null when none is stored under that id. */
export type DigSuggestionTextReader = (ownerRef: string, parentRunId: string, suggestionId: string) => Promise<string | null>;

/**
 * W3-7: once the dig joined its parent's investigation (JOINED or ALREADY), what it was made of is kept once (0135), each
 * pick's text sealed under the dig's run key by the store. Never throws: a write that does not take, or fails, leaves the
 * run as it is (its rewrite then has no picks to read, and the dig gets its story) and is one code line, never a pick.
 */
export async function recordDigPicksAtStart(input: Readonly<{ ownerRef: string; parent: AskParent; childRunId: string;
  positionRef: string | null }>, port: DigPicksPort, suggestionTextOf?: DigSuggestionTextReader,
log: (line: string) => void = (line) => console.error(line)): Promise<"RECORDED" | "ALREADY" | "NOT_OWNED" | "NOT_A_DIG" | "NOT_SEALED" | "FAILED"> {
  let outcome: Awaited<ReturnType<DigPicksPort["record"]>> | "FAILED";
  try {
    const picks = [];
    for (const pick of input.parent.picks ?? []) {
      const stored = pick.suggestion_id === null || suggestionTextOf === undefined ? null
        : await suggestionTextOf(input.ownerRef, input.parent.parent_run_id, pick.suggestion_id);
      picks.push(Object.freeze({ kind: pick.kind, suggestionId: pick.suggestion_id, place: pick.place, author: digPickAuthorOf(pick, stored),
        text: pick.text }));
    }
    outcome = await port.record({ ownerRef: input.ownerRef, runId: input.childRunId, parentRunId: input.parent.parent_run_id,
      positionRef: input.positionRef, picks });
  } catch {
    outcome = "FAILED";
  }
  if (outcome !== "RECORDED" && outcome !== "ALREADY") log(JSON.stringify({ kind: "DEBATEAI_DIG_PICKS", code: `DIG_PICKS_${outcome}` }));
  return outcome;
}
