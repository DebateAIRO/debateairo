import { createHash } from "node:crypto";
import { DigSuggestionSchema, WEB_CONTRACT_LIMITS, DIG_LEVEL_MAX, type AnswerWeb, type DigSuggestion, type Edge, type Node } from "@debateai/contract";

/**
 * THE DIG SUGGESTIONS CODE FINDS (plan 2026-10-30 task W4-3; owner, 30 Oct: "contradicting parts, undocumented parts, things
 * that need more web-search"; F14: Free gets only these, with no AI call). Worked out from what the answer already holds, with
 * no AI and nothing stored, so a first debate, a dig and Free all have them. The AI's own suggestions (on a dig's paths) are
 * sealed with its rewrite (apps/runner dig-suggestions-step.ts) and joined beside these.
 *  - CONTRADICTING: a point of the path the second AI disputed;
 *  - UNDOCUMENTED: a point of the path that rests on reasoning alone and names no source;
 *  - NEEDS_MORE_WEB: what the readers said is still worth looking into (their lines, from the path's pack).
 * Each carries the point's or line's own words, never a score or an engine word, and the path it hangs under ("path:<id>", so a
 * dig of it rewrites that path, at any level). None at level 10: those paths cannot be dug. At most CODE_KIND_MAX of a kind.
 */
const CODE_KIND_MAX = 2;

const idOf = (runOrNode: string, kind: string, words: string): string =>
  `c-${createHash("sha256").update(["debateai.dig-suggestion.code.v1", runOrNode.toLowerCase(), kind, words].join("\0"), "utf8").digest("hex").slice(0, 32)}`;
const cut = (words: string): string => words.trim().slice(0, WEB_CONTRACT_LIMITS.suggestionTextMaxChars);

/** The readers' lines kept in a pack's sealed value; none when it holds none. Nothing else of the pack is read. */
export function digLeadsOfPack(opened: unknown): readonly string[] {
  if (typeof opened !== "object" || opened === null) return [];
  const leads = (opened as { readonly leads?: unknown }).leads;
  return Array.isArray(leads) ? leads.filter((lead): lead is string => typeof lead === "string" && lead.trim() !== "") : [];
}

/** NEEDS_MORE_WEB: the readers' lines of a path, at most CODE_KIND_MAX. */
export function digLeadSuggestions(runId: string, positionRef: string, leads: readonly string[]): readonly DigSuggestion[] {
  return leads.slice(0, CODE_KIND_MAX).map((lead) => ({ suggestion_id: idOf(runId, "NEEDS_MORE_WEB", `${positionRef}\0${lead}`),
    kind: "NEEDS_MORE_WEB" as const, side: null, text: cut(lead), places: [`path:${positionRef}`] }));
}

/** Every point under a path's root, following the arrows from the root down, the nearest first, each once. */
function pointsUnder(root: string, nodes: readonly Node[], edges: readonly Pick<Edge, "from_node_ref" | "target_kind" | "target_ref">[]): readonly Node[] {
  const byId = new Map(nodes.map((node) => [node.node_id, node] as const));
  const seen = new Set([root]);
  const found: Node[] = [];
  const queue = [root];
  while (queue.length > 0) {
    const target = queue.shift()!;
    for (const edge of edges) {
      if (edge.target_kind !== "NODE" || edge.target_ref !== target || seen.has(edge.from_node_ref)) continue;
      seen.add(edge.from_node_ref);
      queue.push(edge.from_node_ref);
      const node = byId.get(edge.from_node_ref);
      if (node !== undefined) found.push(node);
    }
  }
  return found;
}

/** 0141's opened set: the suggestions that parse, one by one; none when it is not a set. */
export function pathSuggestionsOfSet(opened: unknown): readonly DigSuggestion[] {
  const list = typeof opened === "object" && opened !== null ? (opened as { readonly suggestions?: unknown }).suggestions : undefined;
  if (!Array.isArray(list)) return [];
  return list.flatMap((entry: unknown) => {
    const parsed = DigSuggestionSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

/**
 * What code finds on the points of one path. V4 start step, Task 79a (owner answer Q18 A): on a path debate's path (`namePoints`)
 * each names the point it is about, `points: [node_id]`, so the page can see two picks resting on one point; the id is unchanged.
 */
export function digPointSuggestions(positionRef: string, points: readonly Node[], namePoints = false): readonly DigSuggestion[] {
  const offer = (kind: "CONTRADICTING" | "UNDOCUMENTED", list: readonly Node[]): DigSuggestion[] =>
    list.slice(0, CODE_KIND_MAX).map((node) => ({ suggestion_id: idOf(node.node_id, kind, positionRef), kind, side: null, text: cut(node.claim),
      places: [`path:${positionRef}`], ...(namePoints ? { points: [node.node_id] } : {}) }));
  const disputed = points.filter((node) => node.review?.outcome === "dispute");
  const shown = new Set(disputed.slice(0, CODE_KIND_MAX).map((node) => node.node_id));
  return [...offer("CONTRADICTING", disputed),
    ...offer("UNDOCUMENTED", points.filter((node) => !shown.has(node.node_id) && node.way_of_knowing === "REASONING" && (node.sources?.length ?? 0) === 0))];
}

/**
 * The answer's web part with what code finds joined to each path's suggestions, each id once, within the contract's count.
 * At level 10 no path offers any. A web part with no suggestions to add comes back as the same paths.
 * V4 start step, Task 55b (owner F14): a path debate names its web paths by path id (b<n>), which names no node, so `rootOf` (each
 * path id's root in force, 0159) says where its points hang; each suggestion still hangs under its path, "path:b<n>". Absent (R22):
 * the path's own ref is its root, as today.
 * Task 79a: a path the root map names is a path debate's, so what code finds on it names its point (`points`); an R22 path never.
 */
export function webWithDigSuggestions(web: AnswerWeb, nodes: readonly Node[],
  edges: readonly Pick<Edge, "from_node_ref" | "target_kind" | "target_ref">[], level: number | null,
  newest: ReadonlyMap<string, readonly DigSuggestion[]> = new Map(), rootOf?: ReadonlyMap<string, string>): AnswerWeb {
  if (level !== null && level >= DIG_LEVEL_MAX) return { paths: web.paths.map((path) => ({ ...path, suggestions: [] })) };
  return { paths: web.paths.map((path) => {
    const seen = new Set<string>();
    // 0141's newest set is what the AI offers on this path now: a rewrite's refresh replaces the set sealed with the dig, and an old
    // set is no longer offered, even when the new one is empty (owner Q-D8).
    const set = newest.get(path.position_ref.toLowerCase());
    const offered = set === undefined ? path.suggestions : [...path.suggestions.filter((suggestion) => suggestion.kind !== "HELPS_MAIN_QUESTION"), ...set];
    const root = rootOf?.get(path.position_ref);
    const suggestions = [...offered, ...digPointSuggestions(path.position_ref, pointsUnder(root ?? path.position_ref, nodes, edges), root !== undefined)]
      .filter((suggestion) => { if (seen.has(suggestion.suggestion_id)) return false; seen.add(suggestion.suggestion_id); return true; })
      .slice(0, WEB_CONTRACT_LIMITS.suggestionsPerPathMax);
    return { ...path, suggestions };
  }) };
}
