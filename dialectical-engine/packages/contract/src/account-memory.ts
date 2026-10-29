import { z } from "zod";

/**
 * V4 account memory (owner rulings N7 and N11, 2026-10-29; migration 0130): what the V4 pages keep in the person's
 * account instead of the browser — the reading level, the last visit of each debate ("since your last visit") and the
 * link of each dig to the debate it was dug from. Ids, the level, state words, places and times only: no question or
 * answer text ever rides these shapes. The limits are 0130's own (identity.record_debate_last_visit,
 * identity.record_dig_link, identity.read_dig_links); a unit test holds them equal. It imports only zod (never
 * ./index.js), for the same module-cycle reason map-view.ts does.
 */
export const ACCOUNT_MEMORY_LIMITS = Object.freeze({
  /** Entries in one visit snapshot. */
  visitItemsMax: 512,
  /** A snapshot's stored size in bytes (0130's cap, visitItemsStoredBytes) and the visit write's body limit. */
  visitBodyMaxBytes: 65_536,
  /** Places one dig names on its parent's map. */
  digPlacesMax: 16,
  /** Digs one read lists under a debate (oldest first). */
  digChildrenMax: 200
});

/** The three reading levels, in the order the V4 pages offer them (apps/ui/lib/v4/types.ts READING_LEVELS). */
export const ACCOUNT_READING_LEVELS = ["plain", "background", "expert"] as const;
export const AccountReadingLevelSchema = z.enum(ACCOUNT_READING_LEVELS);
export type AccountReadingLevel = z.infer<typeof AccountReadingLevelSchema>;

/** GET /v1/account/reading-level and the answer to a save: null until the person first chooses. */
export const ReadingLevelStateSchema = z.object({ reading_level: AccountReadingLevelSchema.nullable() }).strict();
export type ReadingLevelState = z.infer<typeof ReadingLevelStateSchema>;
export const ReadingLevelSaveRequestSchema = z.object({ reading_level: AccountReadingLevelSchema }).strict();
export type ReadingLevelSaveRequest = z.infer<typeof ReadingLevelSaveRequestSchema>;

/**
 * The printable ASCII characters an id may hold: no space, no double quote and no backslash, so an id is written as itself
 * in JSON and the stored size below is exact. Map ids (run ids, node ids, story path ids, "o:<n>", "w") are of this kind.
 */
const ID_CHARACTERS = String.raw`[\x21\x23-\x5b\x5d-\x7e]`;
export const VISIT_ITEM_ID_PATTERN = new RegExp(`^(?:dig|path|open|point):${ID_CHARACTERS}{1,150}$`, "u");
export const VISIT_WORD_PATTERN = /^[A-Za-z_]{1,32}$/u;
export const DIG_PLACE_PATTERN = new RegExp(`^${ID_CHARACTERS}{1,160}$`, "u");

/**
 * The size 0130 stores a snapshot at (PostgreSQL's jsonb text, `{"k": "v", "k2": "v2"}`): two braces, each entry's key and
 * word with their quotes and ": ", and ", " between entries. Exact for keys and words that match the patterns above.
 */
export function visitItemsStoredBytes(items: Readonly<Record<string, string>>): number {
  const entries = Object.entries(items);
  return 2 + entries.reduce((sum, [key, word]) => sum + key.length + word.length + 6, 0) + Math.max(0, entries.length - 1) * 2;
}

/**
 * One visit snapshot: map item id → state word. Ids are "<dig|path|open|point>:<id>" with an id of 1-150 characters of
 * ID_CHARACTERS (a run id, a story path id, an open question id, a node id); words are 1-32 letters or "_" (a dig state,
 * a path fate, open/dug, a trust word). At most 512 entries, stored in at most 64 KiB.
 */
export const VisitItemsSchema = z.record(
  z.string().regex(VISIT_ITEM_ID_PATTERN),
  z.string().regex(VISIT_WORD_PATTERN)
).refine((items) => Object.keys(items).length <= ACCOUNT_MEMORY_LIMITS.visitItemsMax, { message: "VISIT_ITEMS_TOO_MANY" })
  .refine((items) => visitItemsStoredBytes(items) <= ACCOUNT_MEMORY_LIMITS.visitBodyMaxBytes, { message: "VISIT_ITEMS_TOO_LARGE" });
export type VisitItems = z.infer<typeof VisitItemsSchema>;

/** GET /v1/runs/{id}/last-visit: both null before a first visit. */
export const LastVisitSchema = z.union([
  z.object({ seen_at: z.null(), items: z.null() }).strict(),
  z.object({ seen_at: z.iso.datetime(), items: VisitItemsSchema }).strict()
]);
export type LastVisit = z.infer<typeof LastVisitSchema>;
export const LastVisitRecordRequestSchema = z.object({ items: VisitItemsSchema }).strict();
export type LastVisitRecordRequest = z.infer<typeof LastVisitRecordRequestSchema>;
export const LastVisitRecordedSchema = z.object({ seen_at: z.iso.datetime() }).strict();
export type LastVisitRecorded = z.infer<typeof LastVisitRecordedSchema>;

/** Row D decision 5: a dig is a quick look or a thorough one. */
export const DigLinkModeSchema = z.enum(["quick", "thorough"]);
export type DigLinkMode = z.infer<typeof DigLinkModeSchema>;
/** A place on the parent's map, as the map names it: "p:<node>", "o:<n>", "w" or "path:<id>"; 1-160 ID_CHARACTERS. */
export const DigLinkPlaceSchema = z.string().regex(DIG_PLACE_PATTERN);
const DigLinkPlacesSchema = z.array(DigLinkPlaceSchema).max(ACCOUNT_MEMORY_LIMITS.digPlacesMax);

export const DigLinkRecordSchema = z.object({
  parent_run_id: z.uuid(),
  child_run_id: z.uuid(),
  places: DigLinkPlacesSchema,
  mode: DigLinkModeSchema,
  created_at: z.iso.datetime()
}).strict();
export type DigLinkRecord = z.infer<typeof DigLinkRecordSchema>;
/** GET /v1/runs/{id}/dig-links: the link this debate was dug by (or null), and the digs made from it, oldest first. */
export const DigLinksSchema = z.object({
  parent: DigLinkRecordSchema.nullable(),
  children: z.array(DigLinkRecordSchema).max(ACCOUNT_MEMORY_LIMITS.digChildrenMax)
}).strict();
export type DigLinks = z.infer<typeof DigLinksSchema>;
export const DigLinkRecordRequestSchema = z.object({
  child_run_id: z.uuid(),
  places: DigLinkPlacesSchema,
  mode: DigLinkModeSchema
}).strict();
export type DigLinkRecordRequest = z.infer<typeof DigLinkRecordRequestSchema>;
export const DigLinkRecordedSchema = z.object({ recorded: z.literal(true) }).strict();
export type DigLinkRecorded = z.infer<typeof DigLinkRecordedSchema>;
