/**
 * REV(S01) p1 · security lens · refinement of the A3 surprise.
 * Question: is the `__proto__` pass-through a REAL data-safety defect (pollution or
 * a key on the wire), and is it S01's or pre-existing at base?  Refute before reporting.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AskRequestSchema } from "@debateai/contract";

const BASE = {
  question_line: "Remote work should be the default for knowledge workers.",
  plan_tier: "free",
  risk_tier: "standard",
  tier_source: "MACHINE_DEFAULT",
  tier_provenance_ref: "machine:plan-tier-free",
  composition_budget_tier: "low",
  depth_params: { depth: 2 },
  decision_scope: "general",
  as_of: "2026-09-10T00:00:00.000Z",
  steering_presets: [] as string[],
  steering_annotations: [] as string[]
};

describe("B1 — what the payload actually is", () => {
  it("a computed __proto__ key IS an own enumerable property before parsing", () => {
    const body: Record<string, unknown> = { ...BASE, ["__proto__"]: { polluted: 1 } };
    expect(Object.getOwnPropertyNames(body)).toContain("__proto__");
    expect(Object.keys(body)).toContain("__proto__");
  });
  it("JSON.parse — the shape the API actually receives — also makes it an own property", () => {
    const wire = JSON.parse(JSON.stringify({ ...BASE }).replace(/^\{/, '{"__proto__":{"polluted":1},'));
    expect(Object.getOwnPropertyNames(wire)).toContain("__proto__");
  });
});

describe("B2 — does .strict() flag it, and does the key survive to the output?", () => {
  it("safeParse SUCCEEDS despite .strict() (the A3 surprise, reproduced)", () => {
    const body: Record<string, unknown> = { ...BASE, ["__proto__"]: { polluted: 1 } };
    const r = AskRequestSchema.safeParse(body);
    expect(r.success).toBe(true);
  });
  it("the PARSED OUTPUT carries no __proto__ own key — the key is dropped, not forwarded", () => {
    const body: Record<string, unknown> = { ...BASE, ["__proto__"]: { polluted: 1 } };
    const r = AskRequestSchema.safeParse(body);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(Object.getOwnPropertyNames(r.data)).not.toContain("__proto__");
    expect(Object.keys(r.data as object).sort()).toEqual(Object.keys(BASE).sort());
  });
  it("Object.prototype is NOT polluted by the parse", () => {
    const body: Record<string, unknown> = { ...BASE, ["__proto__"]: { polluted: 1 } };
    AskRequestSchema.safeParse(body);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect((Object.prototype as unknown as Record<string, unknown>).polluted).toBeUndefined();
  });
  it("what the wire would carry after a parse-then-serialize round trip", () => {
    const body: Record<string, unknown> = { ...BASE, ["__proto__"]: { polluted: 1 } };
    const r = AskRequestSchema.safeParse(body);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(JSON.stringify(r.data)).not.toContain("polluted");
  });
});

describe("B3 — is this S01's, or zod .strict() at base?", () => {
  it("a MINIMAL .strict() zod object with no S01 field behaves identically", () => {
    const minimal = z.object({ a: z.string() }).strict();
    const body: Record<string, unknown> = { a: "x", ["__proto__"]: { polluted: 1 } };
    const r = minimal.safeParse(body);
    expect(r.success).toBe(true); // ⇒ the behaviour is zod's, not S01's
  });
  it("an ordinary unknown key IS still flagged, so .strict() is not broken in general", () => {
    const minimal = z.object({ a: z.string() }).strict();
    expect(minimal.safeParse({ a: "x", b: 1 }).success).toBe(false);
  });
});
