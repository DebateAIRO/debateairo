import { describe, expect, it } from "vitest";
import { resolveAcceptanceRisk, resolveAcceptanceTerminalActivations } from "./main.js";

describe("ACC-01 DR-135 refusing terminal evaluator", () => {
  it("returns no fabricated resolutions when no terminal WAIT rows remain", async () => {
    await expect(resolveAcceptanceTerminalActivations({
      runId: "run:zero-waits",
      waitingRows: []
    })).resolves.toEqual([]);
  });

  it("fails typed and names every outstanding WAIT row without resolving one", async () => {
    await expect(resolveAcceptanceTerminalActivations({
      runId: "run:has-waits",
      waitingRows: ["Q2", "R9"]
    })).rejects.toMatchObject({
      name: "TypedDomainError",
      code: "ACCEPTANCE_TERMINAL_WAIT_ROWS_UNRESOLVED",
      message: "DR-135 refusing evaluator: run run:has-waits retains terminal WAIT rows Q2,R9"
    });
  });
});

describe("ACC-01 acceptance risk wiring", () => {
  it("keeps equal or higher asker risk asker-owned and records policy only when it raises", () => {
    expect(resolveAcceptanceRisk("standard", "asker:standard", "standard")).toEqual({
      effectiveRiskTier: "standard",
      tierSource: "ASKER",
      tierProvenanceRef: "asker:standard",
      policySuppliedBy: null
    });
    expect(resolveAcceptanceRisk("casual", "asker:casual", "standard")).toEqual({
      effectiveRiskTier: "standard",
      tierSource: "DEPLOYMENT_POLICY",
      tierProvenanceRef: "asker:casual",
      policySuppliedBy: "deployment"
    });
    expect(resolveAcceptanceRisk("high-stakes", "asker:high", "standard")).toEqual({
      effectiveRiskTier: "high-stakes",
      tierSource: "ASKER",
      tierProvenanceRef: "asker:high",
      policySuppliedBy: null
    });
  });
});
