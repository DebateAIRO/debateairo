import { describe, expect, it } from "vitest";
import { MODEL_STRENGTHS } from "@debateai/kernel";
import { AskAcceptedSchema, AskRequestSchema, ModelStrengthSchema } from "@debateai/contract";

const ASK = {
  question_line: "What follows from this evidence?",
  risk_tier: "casual",
  tier_source: "ASKER",
  tier_provenance_ref: "asker-declaration:test",
  composition_budget_tier: "low",
  depth_params: { depth: 1 },
  decision_scope: "test-layer scope",
  as_of: "2026-08-07T00:00:00.000Z",
  steering_presets: [],
  plan_tier: "free",
  steering_annotations: []
};

describe("model-scorecard §2.5 — the asker's model strength on the wire", () => {
  it("is the kernel's three strengths, nothing more", () => {
    expect(ModelStrengthSchema.options).toEqual([...MODEL_STRENGTHS]);
  });

  it("is optional: an ask without it parses exactly as before", () => {
    const parsed = AskRequestSchema.parse(ASK);
    expect("model_strength" in parsed).toBe(false);
  });

  it.each([...MODEL_STRENGTHS])("admits %s", (strength) => {
    expect(AskRequestSchema.parse({ ...ASK, model_strength: strength }).model_strength).toBe(strength);
  });

  it.each(["MAXIMUM", "best", "", null, 2])("refuses %s", (value) => {
    expect(() => AskRequestSchema.parse({ ...ASK, model_strength: value })).toThrow();
  });

  it("lets the accepted ask say which strength was applied and whether it was stepped down", () => {
    expect(AskAcceptedSchema.parse({ run_ref: "run:test", status: "QUEUED" }))
      .toEqual({ run_ref: "run:test", status: "QUEUED" });
    expect(AskAcceptedSchema.parse({
      run_ref: "run:test", status: "QUEUED", model_strength_applied: "BALANCED", model_strength_stepped_down: true
    })).toEqual({
      run_ref: "run:test", status: "QUEUED", model_strength_applied: "BALANCED", model_strength_stepped_down: true
    });
    expect(() => AskAcceptedSchema.parse({ run_ref: "run:test", status: "QUEUED", model_strength_applied: "MAXIMUM" }))
      .toThrow();
    expect(() => AskAcceptedSchema.parse({ run_ref: "run:test", status: "QUEUED", model_strength_stepped_down: "yes" }))
      .toThrow();
    expect(() => AskAcceptedSchema.parse({ run_ref: "run:test", status: "QUEUED", model_strength_note: "x" }))
      .toThrow();
  });
});
