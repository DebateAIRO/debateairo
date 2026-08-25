import { describe, expect, it } from "vitest";
import { parseAcceptanceArguments } from "./run-acceptance.js";

describe("ACC-01 one-shot ceremony arguments", () => {
  const serviceCredential = "s".repeat(43);

  it("requires the service credential", () => {
    expect(() => parseAcceptanceArguments([])).toThrow("ACCEPTANCE_SERVICE_CREDENTIAL_REQUIRED");
  });

  it("documents and applies only asker-input defaults — the default question is self-contained (ACC-01 N1)", () => {
    const parsed = parseAcceptanceArguments(["--service-credential", serviceCredential], new Date("2026-08-09T00:00:00.000Z"));
    expect(parsed.serviceCredential).toBe(serviceCredential);
    expect(parsed.serve).toBe(false);
    expect(parsed.ask).toEqual({
      question_line: "What is the strongest case for adopting a four-day workweek at a software company?",
      risk_tier: "standard",
      tier_source: "ASKER",
      tier_provenance_ref: "acceptance:cli-default",
      composition_budget_tier: "low",
      depth_params: { depth: 1 },
      decision_scope: "prototype-acceptance",
      as_of: "2026-08-09T00:00:00.000Z",
      steering_presets: [],
      steering_annotations: []
    });
  });

  it("rejects unknown arguments rather than silently ignoring them", () => {
    expect(() => parseAcceptanceArguments(["--service-credential", serviceCredential, "--mystery", "value"]))
      .toThrow("UNKNOWN_ACCEPTANCE_ARGUMENT:--mystery");
  });

  it.each(["--decision-owner", "--action-owner"])(
    "rejects retired ownership input %s instead of silently dropping it",
    (argument) => {
      expect(() => parseAcceptanceArguments(["--service-credential", serviceCredential, argument, "acceptance-user"]))
        .toThrow(`UNKNOWN_ACCEPTANCE_ARGUMENT:${argument}`);
    }
  );

  it("parses the --serve standing flag anywhere in the argument list", () => {
    expect(parseAcceptanceArguments(["--serve", "--service-credential", serviceCredential]).serve).toBe(true);
    expect(parseAcceptanceArguments(["--service-credential", serviceCredential, "--serve"]).serve).toBe(true);
    const withValueArguments = parseAcceptanceArguments(["--service-credential", serviceCredential, "--serve", "--risk-tier", "casual"]);
    expect(withValueArguments.serve).toBe(true);
    expect(withValueArguments.ask.risk_tier).toBe("casual");
  });

  it("rejects a duplicated --serve flag", () => {
    expect(() => parseAcceptanceArguments(["--serve", "--serve", "--service-credential", serviceCredential]))
      .toThrow("DUPLICATE_ACCEPTANCE_ARGUMENT:--serve");
  });
});
