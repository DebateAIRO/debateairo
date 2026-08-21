import { describe, expect, it } from "vitest";
import { parseAcceptanceArguments } from "./run-acceptance.js";

describe("ACC-01 one-shot ceremony arguments", () => {
  it("requires the ownership token", () => {
    expect(() => parseAcceptanceArguments([])).toThrow("ACCEPTANCE_TOKEN_REQUIRED");
  });

  it("documents and applies only asker-input defaults — the default question is self-contained (ACC-01 N1)", () => {
    const parsed = parseAcceptanceArguments(["--token", "same-ui-token"], new Date("2026-08-09T00:00:00.000Z"));
    expect(parsed.token).toBe("same-ui-token");
    expect(parsed.serve).toBe(false);
    expect(parsed.ask).toEqual({
      question_line: "What is the strongest case for adopting a four-day workweek at a software company?",
      risk_tier: "standard",
      tier_source: "ASKER",
      tier_provenance_ref: "acceptance:cli-default",
      composition_budget_tier: "low",
      depth_params: { depth: 1 },
      decision_owner: "acceptance-user",
      action_owner: "acceptance-user",
      decision_scope: "prototype-acceptance",
      caller_scope: "ASKER",
      as_of: "2026-08-09T00:00:00.000Z",
      steering_presets: [],
      steering_annotations: []
    });
  });

  it("rejects unknown arguments rather than silently ignoring them", () => {
    expect(() => parseAcceptanceArguments(["--token", "owner", "--mystery", "value"]))
      .toThrow("UNKNOWN_ACCEPTANCE_ARGUMENT:--mystery");
  });

  it("parses the --serve standing flag anywhere in the argument list", () => {
    expect(parseAcceptanceArguments(["--serve", "--token", "owner"]).serve).toBe(true);
    expect(parseAcceptanceArguments(["--token", "owner", "--serve"]).serve).toBe(true);
    const withValueArguments = parseAcceptanceArguments(["--token", "owner", "--serve", "--risk-tier", "casual"]);
    expect(withValueArguments.serve).toBe(true);
    expect(withValueArguments.ask.risk_tier).toBe("casual");
  });

  it("rejects a duplicated --serve flag", () => {
    expect(() => parseAcceptanceArguments(["--serve", "--serve", "--token", "owner"]))
      .toThrow("DUPLICATE_ACCEPTANCE_ARGUMENT:--serve");
  });
});
