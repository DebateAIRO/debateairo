import { describe, expect, it } from "vitest";
import { AskRequestSchema, AskRoomQuerySchema, DepthParamsSchema, debateShapeSettingsOf } from "@debateai/contract";

describe("debate shape ask settings (spec 2026-10-12 §3.2)", () => {
  it("accepts the three optional settings and keeps a depth-only ask byte for byte", () => {
    expect(JSON.stringify(DepthParamsSchema.parse({ depth: 2 }))).toBe('{"depth":2}');
    expect(DepthParamsSchema.parse({ depth: 2, depthMode: "fixed", scrutiny: "deep", answerLength: "detailed" }))
      .toEqual({ depth: 2, depthMode: "fixed", scrutiny: "deep", answerLength: "detailed" });
  });
  it.each([
    ["an unknown depth mode", { depth: 2, depthMode: "manual" }],
    ["an unknown scrutiny", { depth: 2, scrutiny: "max" }],
    ["an unknown answer length", { depth: 2, answerLength: "long" }],
    ["an unknown key", { depth: 2, concurrency: 3 }],
    ["a capitalised value", { depth: 2, depthMode: "Adaptive" }]
  ])("refuses %s", (_name, value) => {
    expect(DepthParamsSchema.safeParse(value).success).toBe(false);
  });
  it("reads missing keys as the defaults (old runs) and refuses a stored value outside the enums", () => {
    expect(debateShapeSettingsOf({ depth: 1 })).toEqual({ depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" });
    expect(debateShapeSettingsOf({ depth: 3, depthMode: "fixed", scrutiny: "exhaustive", answerLength: "short" }))
      .toEqual({ depthMode: "fixed", scrutiny: "exhaustive", answerLength: "short" });
    expect(() => debateShapeSettingsOf({ depth: 1, scrutiny: "max" })).toThrow("DEPTH_PARAMS_SHAPE_INVALID:scrutiny");
  });
  it("the room query carries the same three settings, optional", () => {
    const base = { plan_tier: "premium", composition_budget_tier: "low", depth: "2" };
    expect(AskRoomQuerySchema.parse(base)).toEqual({ plan_tier: "premium", composition_budget_tier: "low", depth: 2 });
    expect(AskRoomQuerySchema.parse({ ...base, depth_mode: "fixed", scrutiny: "deep", answer_length: "short" }))
      .toMatchObject({ depth_mode: "fixed", scrutiny: "deep", answer_length: "short" });
    expect(AskRoomQuerySchema.safeParse({ ...base, scrutiny: "max" }).success).toBe(false);
  });
  it("the ask accepts them inside depth_params only", () => {
    const ask = { question_line: "q", risk_tier: "casual", tier_source: "ASKER", tier_provenance_ref: "asker:test",
      composition_budget_tier: "low", depth_params: { depth: 1, answerLength: "short" }, decision_scope: "s",
      as_of: "2026-10-12T00:00:00.000Z", steering_presets: [], plan_tier: "free", steering_annotations: [] };
    expect(AskRequestSchema.safeParse(ask).success).toBe(true);
    expect(AskRequestSchema.safeParse({ ...ask, answerLength: "short" }).success).toBe(false);
  });
});
