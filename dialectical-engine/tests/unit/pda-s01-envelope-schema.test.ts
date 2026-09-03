import { describe, expect, it } from "vitest";
import { z } from "zod";
import { PublicDebateSchema } from "@debateai/contract";

const oldShape = {
  public_ref: "22222222-2222-4222-8222-222222222222",
  author_pseudonym: "Stable Public Name",
  question: "Should the public see this?",
  published_at: "2026-08-24T00:00:00.000Z",
  answer: {
    terminal: "SERVED",
    verdict: "SUPPORTED",
    verdict_available: true,
    confidence_band: "moderate",
    summary_segments: [{ text: "Only presentation text crosses the boundary." }],
    badges: [],
    residual_objections: [],
    reversal_point: "Contrary public evidence",
    as_of: "2026-08-24T00:00:00.000Z"
  }
} as const;

const requiredWidenSchema = z.object({
  public_ref: z.uuid(),
  author_pseudonym: z.string().trim().min(1),
  question: z.string().trim().min(1),
  published_at: z.iso.datetime(),
  answer: z.object({
    terminal: z.enum(["SERVED", "DOWNGRADED", "COMPONENTS_ONLY"]),
    verdict: z.enum(["SUPPORTED", "CONTESTED", "UNSUPPORTED"]).nullable(),
    verdict_available: z.boolean(),
    confidence_band: z.string().trim().min(1).nullable(),
    summary_segments: z.array(z.object({ text: z.string().min(1) }).strict()),
    badges: z.array(z.string()),
    residual_objections: z.array(z.string()),
    reversal_point: z.string().min(1),
    as_of: z.iso.datetime(),
    nodes: z.array(z.unknown())
  }).strict()
}).strict();

describe("S01 public debate envelope schema", () => {
  it("accepts an old-shape snapshot with tree fields absent", () => {
    expect(PublicDebateSchema.safeParse(oldShape).success).toBe(true);

    const parsed = PublicDebateSchema.parse(oldShape);
    expect.soft(parsed.answer.tree_included).toBeUndefined();
    expect.soft(parsed.answer.nodes).toBeUndefined();
    expect.soft(parsed.answer.edges).toBeUndefined();
  });

  it("strictly rejects old-shape snapshots after a required tree widening", () => {
    expect(requiredWidenSchema.safeParse(oldShape).success).toBe(false);
    expect(PublicDebateSchema.safeParse(oldShape).success).toBe(true);
  });

  it("accepts a new-shape snapshot with optional tree fields", () => {
    const parsed = PublicDebateSchema.parse({
      ...oldShape,
      answer: {
        ...oldShape.answer,
        nodes: [],
        edges: [],
        tree_included: true
      }
    });

    expect.soft(parsed.answer.nodes).toEqual([]);
    expect.soft(parsed.answer.edges).toEqual([]);
    expect(parsed.answer.tree_included).toBe(true);
  });
});
