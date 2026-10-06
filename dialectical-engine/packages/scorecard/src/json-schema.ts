import { z } from "zod";
import { MomentFileSchema, ReplayResultSchema } from "./moment.js";
import { ScorecardSchema } from "./schema.js";

export type PublishedJsonSchema = Readonly<Record<string, unknown>>;

/**
 * The published JSON Schemas, RENDERED from the zod schemas the engine parses with
 * (`z.toJSONSchema`, as apps/api/src/support/response-policy.ts renders its answer form) and
 * never written by hand. `io: "input"` renders what a FILE may contain: a plain `z.object` then
 * stays open to unknown keys — the scorecard's "an unknown future field is ignored" rule — while
 * the closed moment and replay-result shapes stay closed. The refinements (low <= score <= high,
 * duplicate ids, NUMBER_SHAPE, the moment id) are not expressible in JSON Schema; the parsers
 * enforce them.
 *
 * `packages/scorecard/schema/*.schema.json` are these values as written by
 * `pnpm --filter @debateai/scorecard run schema:write`; tests/unit/scorecard-json-schema.test.ts
 * fails when a checked-in file differs from what would be written.
 */
function renderPublishedJsonSchema(schema: z.ZodType): PublishedJsonSchema {
  return Object.freeze(z.toJSONSchema(schema, { io: "input" }) as Record<string, unknown>);
}

export const SCORECARD_JSON_SCHEMA: PublishedJsonSchema = renderPublishedJsonSchema(ScorecardSchema);
export const MOMENT_JSON_SCHEMA: PublishedJsonSchema = renderPublishedJsonSchema(MomentFileSchema);
export const REPLAY_RESULT_JSON_SCHEMA: PublishedJsonSchema = renderPublishedJsonSchema(ReplayResultSchema);

/** File name under packages/scorecard/schema/ → the schema written there. */
export const PUBLISHED_JSON_SCHEMA_FILES: Readonly<Record<string, PublishedJsonSchema>> = Object.freeze({
  "scorecard.schema.json": SCORECARD_JSON_SCHEMA,
  "moment.schema.json": MOMENT_JSON_SCHEMA,
  "replay-result.schema.json": REPLAY_RESULT_JSON_SCHEMA
});

export function publishedJsonSchemaFileText(schema: PublishedJsonSchema): string {
  return `${JSON.stringify(schema, null, 2)}\n`;
}
