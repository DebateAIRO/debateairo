import { PublicStoryShortSchema, type PublicStoryShort } from "@debateai/contract";
import type { StoredStory } from "./repository.js";

/**
 * The short story a public snapshot may carry (spec §10): the short fields,
 * the confidence sentence among them (§14.2), and the reviewer's note. Only a
 * READY or READY_WITH_RESERVATION story with a body is published. Nothing
 * owner-only crosses: not the checker's reservation text (it names points by
 * numbers only the owner's appendix explains), not the reasons in `why` (full
 * report only), no lineage, no point numbers, no verdict basis, no pack. The
 * question's language rides on the snapshot itself, not here (R2).
 *
 * Final review, Important 2: a READY_WITH_RESERVATION story is published with
 * `double_checked: false`, so the public page shows the same gentle catalogue
 * line as the owner's page and the PDF (§14.2). Only that fact crosses; a
 * READY story carries no flag, exactly as before.
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
    reviewer_note: stored.body.reviewer_note,
    ...(stored.outcome === "READY_WITH_RESERVATION" ? { double_checked: false } : {})
  });
}
