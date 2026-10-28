import { describe, expect, it } from "vitest";
import { z } from "zod";
import { admitsOnlyTheEmptyList, fixReplyStructure } from "@debateai/providers";

/**
 * The "only-empty list" reading (2026-10-25, zod 4.6). The reply fixer and the S04 review salvage fill a missing member
 * with [] only when its schema admits nothing else: a list limited to 0 entries (`.max(0)` or `.length(0)`). zod 4.6
 * stopped writing that limit where this code used to read it (the internal `_zod.bag`), and the fill silently stopped:
 * a real practice reply (MiMo, `edge_bearings` left out) was refused instead of repaired. These cases pin the answer
 * for each form directly, so a future zod change that moves the limit again fails here, by name.
 */
describe("admitsOnlyTheEmptyList", () => {
  const entry = z.object({ edge_id: z.string(), bearing: z.enum(["supports", "attacks"]) });

  it.each([
    ["a list limited to at most 0 entries (.max(0))", z.array(entry).max(0)],
    ["a list of exactly 0 entries (.length(0))", z.array(entry).length(0)],
    ["a list limited to 0, then to 3 (the tighter limit wins)", z.array(entry).max(0).max(3)],
    ["a list limited to 0 that carries a schema id", z.array(z.string()).max(0).meta({ id: "only_empty_list_probe" })],
    ["a list limited to 0 whose entries JSON Schema cannot write (a date)", z.array(z.date()).max(0)],
    ["a list limited to 0 with a refinement that accepts []", z.array(z.string()).max(0).refine(() => true)]
  ])("yes: %s", (_name, schema) => {
    expect(admitsOnlyTheEmptyList(schema)).toBe(true);
  });

  it.each([
    ["a list with no limit", z.array(entry)],
    ["a list limited to 1 entry", z.array(entry).max(1)],
    ["a list of exactly 1 entry", z.array(entry).length(1)],
    ["a list that must hold an entry and at most 0 (admits nothing)", z.array(entry).min(1).max(0)],
    ["a list limited to 0 whose refinement refuses []", z.array(z.string()).max(0).refine((list) => list.length > 0)],
    ["an optional list limited to 0 (not a list schema itself)", z.array(entry).max(0).optional()],
    ["a text limited to 0 characters (not a list)", z.string().max(0)],
    ["a tuple of no entries (not a list schema)", z.tuple([])]
  ])("no: %s", (_name, schema) => {
    expect(admitsOnlyTheEmptyList(schema)).toBe(false);
  });

  it("the reply fixer fills a missing list limited to 0 with [] and leaves a missing open list missing", () => {
    const schema = z.object({ summary: z.string(), edge_bearings: z.array(entry).length(0) }).strict();
    const fixed = fixReplyStructure({ summary: "No edge starts here." }, schema);
    expect(fixed).toEqual({ value: { summary: "No edge starts here.", edge_bearings: [] }, repairs: ["ONLY_VALUE_FILLED"] });

    const open = z.object({ summary: z.string(), edge_bearings: z.array(entry) }).strict();
    expect(fixReplyStructure({ summary: "No edge starts here." }, open)).toBeNull();
  });
});
