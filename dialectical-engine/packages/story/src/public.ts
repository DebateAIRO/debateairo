import { PublicStoryShortSchema, type PublicStoryShort } from "@debateai/contract";
import type { StoredStory } from "./repository.js";

/**
 * The short story a public snapshot may carry (spec §10). Only a READY or
 * READY_WITH_RESERVATION story with a body is published; the checker's
 * reservation travels only with READY_WITH_RESERVATION. Nothing owner-only
 * crosses: no lineage, no point numbers, no verdict basis, no pack.
 */
export function toPublicStoryShort(stored: StoredStory): PublicStoryShort | null {
  const ready = stored.outcome === "READY" || stored.outcome === "READY_WITH_RESERVATION";
  if (!ready || stored.body === null) return null;
  return PublicStoryShortSchema.parse({
    headline: stored.body.short.headline,
    summary: stored.body.short.summary,
    paths: stored.body.short.paths,
    change: stored.body.short.change,
    reviewer_note: stored.body.reviewer_note,
    reservation: stored.outcome === "READY_WITH_RESERVATION" ? stored.reservation : null
  });
}
