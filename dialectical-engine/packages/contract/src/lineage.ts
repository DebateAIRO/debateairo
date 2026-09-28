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
