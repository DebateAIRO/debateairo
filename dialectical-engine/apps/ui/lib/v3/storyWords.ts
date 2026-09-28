import type { Answer, Edge, PublicStoryShort } from "@debateai/contract";
import { t, tPlural, type MessageCatalog } from "../i18n/translate.js";

/**
 * The fixed words around a verdict story (spec 2026-09-26 §14.2, §14.3), read
 * from the catalogue handed in. The owner's panel, the public short story and
 * the PDF all word a label, a fate and "and N more" through these, so the three
 * never differ. The catalogue is the `public` namespace of the QUESTION's
 * locale: the story's fixed text follows the language the debate was argued in,
 * not the interface's.
 */
export type StoryFateValue = PublicStoryShort["paths"][number]["fate"];
export type StoryLabel = NonNullable<Answer["verdict_state"]>;

/**
 * The arithmetic label in human words (spec §14.2): the engine's honesty signal,
 * said the way a person would. The label itself is never changed.
 */
export function storyLabelWords(label: StoryLabel, catalog: MessageCatalog): string {
  switch (label) {
    case "SUPPORTED": return t(catalog, "public.story.label.supported");
    case "CONTESTED": return t(catalog, "public.story.label.contested");
    case "UNSUPPORTED": return t(catalog, "public.story.label.unsupported");
  }
}

/** What happened to a position, in plain words. */
export function storyFateWords(fate: StoryFateValue, catalog: MessageCatalog): string {
  switch (fate) {
    case "HELD_UP": return t(catalog, "public.story.fate.heldUp");
    case "PARTLY_HELD": return t(catalog, "public.story.fate.partlyHeld");
    case "FELL": return t(catalog, "public.story.fate.fell");
    case "SET_ASIDE": return t(catalog, "public.story.fate.setAside");
  }
}

/**
 * The short version lists at most 8 positions; the rest are counted, never
 * dropped silently. A plural in the catalogue's locale (CLDR categories), so
 * Romanian says "și încă 20 de poziții" where English says "and 20 more".
 */
export function morePathsWords(count: number, catalog: MessageCatalog, locale: string): string | null {
  if (!Number.isInteger(count) || count <= 0) return null;
  return tPlural(catalog, "public.story.morePaths", count, locale);
}

/**
 * The number of positions the debate put forward, by the rule the story's own
 * material uses (a maker root, pre-flight ruling 2026-09-26): a node with no
 * outgoing edge of any kind. A point that argues about another point, or that
 * undercuts an arrow (an EDGE-targeting edge), is not a position; neither is a
 * point whose edge names a point missing from the snapshot. A self-referencing
 * edge (a NODE edge from a point to itself) is not an argument about another
 * point, so it does not by itself unmake a position (controller ruling,
 * confirmed in Task 11 fix round 1).
 *
 * This is deliberately NOT the tree's rule (apps/ui/lib/v3/adapter.ts
 * projectGraph), which puts an undercutter at the top of the tree because it
 * has no representable parent node.
 */
export function countStoryPositions(
  nodes: readonly Readonly<{ node_id: string }>[],
  edges: readonly Readonly<Pick<Edge, "from_node_ref" | "target_kind" | "target_ref">>[]
): number {
  const arguing = new Set<string>();
  for (const edge of edges) {
    // A self-referencing edge is not an argument about another point.
    if (edge.target_kind === "NODE" && edge.target_ref === edge.from_node_ref) continue;
    arguing.add(edge.from_node_ref);
  }
  return nodes.filter((node) => !arguing.has(node.node_id)).length;
}
