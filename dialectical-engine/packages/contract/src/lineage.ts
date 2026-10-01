import { z } from "zod";

/**
 * Who made a piece of model output. Moved out of index.ts so that story.ts
 * (the verdict story schemas) can use it: index.ts imports story.ts, so a
 * story.ts import of index.ts would be an ES-module cycle whose top-level
 * schema reads hit the temporal dead zone. index.ts re-exports this module,
 * so every existing import of MakerLineageSchema is unchanged.
 */
export const MakerLineageSchema = z.object({
  maker: z.string().min(1),
  model_id: z.string().min(1),
  transport: z.string().min(1),
  provider_ref: z.string().min(1)
}).strict();
export type MakerLineage = z.infer<typeof MakerLineageSchema>;

/**
 * The lineage an anonymous reader gets: who made it and which model, nothing
 * about how we reached the model. transport and provider_ref name our own
 * wiring (compliance C17/B11), so they stay owner-side. Not strict on purpose:
 * snapshots published before the trim still carry both fields inside their
 * ciphertext, and parsing strips them on the way out instead of refusing the
 * whole debate.
 */
export const PublicMakerLineageSchema = z.object({
  maker: MakerLineageSchema.shape.maker,
  model_id: MakerLineageSchema.shape.model_id
});
export type PublicMakerLineage = z.infer<typeof PublicMakerLineageSchema>;
