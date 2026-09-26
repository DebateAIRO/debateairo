import { PublicStoryShortSchema, type PublicStoryShort } from "@debateai/contract";
import type { StoredStory } from "./repository.js";

/**
 * The short story a public snapshot may carry (spec §10): the short fields,
 * the confidence sentence among them (§14.2), and the reviewer's note. Only a
 * READY or READY_WITH_RESERVATION story with a body is published. Nothing
 * owner-only crosses: not the checker's reservation (it names points by numbers
 * only the owner's appendix explains), not the reasons in `why` (full report
 * only), no lineage, no point numbers, no verdict basis, no pack. The question's
 * language is not private, but it is not published here either: a later task
 * decides how the public page learns it.
 */
export function toPublicStoryShort(stored: StoredStory): PublicStoryShort | null {
  const ready = stored.outcome === "READY" || stored.outcome === "READY_WITH_RESERVATION";
  if (!ready || stored.body === null) return null;
  return PublicStoryShortSchema.parse({
    headline: stored.body.short.headline,
    summary: stored.body.short.summary,
    confidence: stored.body.short.confidence,
    paths: stored.body.short.paths,
    change: stored.body.short.change,
    reviewer_note: stored.body.reviewer_note
  });
}
