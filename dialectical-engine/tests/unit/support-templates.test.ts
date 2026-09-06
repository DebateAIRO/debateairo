import { describe, expect, it } from "vitest";
import {
  OUTCOMES,
  SUPPORT_TEMPLATE_IDS,
  SUPPORT_TEMPLATES
} from "../../apps/api/src/support/templates.js";

describe("SUP-01 closed support copy", () => {
  it("exports the exact outcome vocabulary", () => {
    expect(OUTCOMES).toEqual([
      "ANSWER_GROUNDED", "NO_SOURCE", "REFUSE_ZONE", "REFUSE_INJECTION",
      "REFUSE_SAFETY", "DEGRADED", "DISABLED", "RATE_LIMITED"
    ]);
    expect(Object.isFrozen(OUTCOMES)).toBe(true);
  });

  it("has one frozen non-empty English and Romanian value for every fixed template", () => {
    expect(SUPPORT_TEMPLATE_IDS).toEqual([
      "DISCLOSURE", "NO_SOURCE", "REFUSE_ZONE", "REFUSE_INJECTION", "REFUSE_SAFETY",
      "DEGRADED", "DISABLED", "RATE_LIMITED", "RATING", "CASE_OPENED_MINIMAL", "SOURCE_LINE"
    ]);
    for (const id of SUPPORT_TEMPLATE_IDS) {
      expect(Object.keys(SUPPORT_TEMPLATES[id])).toEqual(["en", "ro"]);
      expect(SUPPORT_TEMPLATES[id].en.length).toBeGreaterThan(0);
      expect(SUPPORT_TEMPLATES[id].ro.length).toBeGreaterThan(0);
      expect(Object.isFrozen(SUPPORT_TEMPLATES[id])).toBe(true);
    }
  });
});
