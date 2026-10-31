import { createHash } from "node:crypto";
import { WEB_CONTRACT_LIMITS, DIG_LEVEL_MAX, type AnswerWeb, type DigSuggestion, type Edge, type Node } from "@debateai/contract";

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

/** What code finds on the points of one path. */
export function digPointSuggestions(positionRef: string, points: readonly Node[]): readonly DigSuggestion[] {
  const offer = (kind: "CONTRADICTING" | "UNDOCUMENTED", list: readonly Node[]): DigSuggestion[] =>
    list.slice(0, CODE_KIND_MAX).map((node) => ({ suggestion_id: idOf(node.node_id, kind, positionRef), kind, side: null, text: cut(node.claim),
      places: [`path:${positionRef}`] }));
  const disputed = points.filter((node) => node.review?.outcome === "dispute");
  const shown = new Set(disputed.slice(0, CODE_KIND_MAX).map((node) => node.node_id));
  return [...offer("CONTRADICTING", disputed),
    ...offer("UNDOCUMENTED", points.filter((node) => !shown.has(node.node_id) && node.way_of_knowing === "REASONING" && (node.sources?.length ?? 0) === 0))];
}

/**
 * The answer's web part with what code finds joined to each path's suggestions, each id once, within the contract's count.
 * At level 10 no path offers any. A web part with no suggestions to add comes back as the same paths.
 */
export function webWithDigSuggestions(web: AnswerWeb, nodes: readonly Node[],
  edges: readonly Pick<Edge, "from_node_ref" | "target_kind" | "target_ref">[], level: number | null): AnswerWeb {
  if (level !== null && level >= DIG_LEVEL_MAX) return { paths: web.paths.map((path) => ({ ...path, suggestions: [] })) };
  return { paths: web.paths.map((path) => {
    const seen = new Set<string>();
    const suggestions = [...path.suggestions, ...digPointSuggestions(path.position_ref, pointsUnder(path.position_ref, nodes, edges))]
      .filter((suggestion) => { if (seen.has(suggestion.suggestion_id)) return false; seen.add(suggestion.suggestion_id); return true; })
      .slice(0, WEB_CONTRACT_LIMITS.suggestionsPerPathMax);
    return { ...path, suggestions };
  }) };
}
