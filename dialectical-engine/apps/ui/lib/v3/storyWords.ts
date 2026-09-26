import type { Edge, PublicStoryShort } from "@debateai/contract";

/**
 * Plain words the site uses around a verdict story (spec 2026-09-26 §10).
 * Shared by the public overview, the owner's StoryPanel and the PDF, so the
 * three never word a fate differently. Copy is English; the story itself is in
 * the language of the question.
 */
export type StoryFateValue = PublicStoryShort["paths"][number]["fate"];

export const STORY_FATE_WORDS: Readonly<Record<StoryFateValue, string>> = Object.freeze({
  HELD_UP: "Held up",
  PARTLY_HELD: "Partly held",
  FELL: "Fell",
  SET_ASIDE: "Set aside"
});

export const STORY_CHANGE_LEAD = "What would change the answer:";
export const STORY_REVIEWER_NOTE_TITLE = "Reviewer's note";
export const STORY_REVIEWER_NOTE_CAVEAT = "Written by the AI storyteller. It does not change the verdict.";
/** The reservation box's title; the box then shows the checker's own words, with no second lead. */
export const STORY_RESERVATION_TITLE = "Our checker's reservation";
/**
 * The accessible name of the short story's list of positions.
 * TODO(story localization): like every other string in this file it is English
 * only. It moved here out of the JSX attribute in StoryShortBlocks.tsx when
 * dev's no-hardcoded-english scanner arrived; the localization task moves it,
 * with the rest of the story's words, into the catalogues for all 35 locales.
 */
export const STORY_PATHS_LIST_NAME = "Positions the debate explored";

/**
 * The line under the checker's reservation when it names a point by number
 * (the owner's panel only): those numbers are explained only in the full
 * report's appendix.
 */
export function storyPointNumbersNote(example: string): string {
  return `Point numbers like ${example} refer to the numbered points in the full report (PDF).`;
}

/** The short version lists at most 8 positions; the rest are counted, never dropped silently. */
export function morePathsWords(count: number): string | null {
  if (!Number.isInteger(count) || count <= 0) return null;
  return count === 1 ? "and 1 more position" : `and ${count} more positions`;
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
