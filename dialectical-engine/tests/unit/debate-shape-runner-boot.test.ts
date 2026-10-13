import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseCostEnvelopeBasis } from "@debateai/budget";
import { computeStructuralCeilingBasis, debateShapePolicyStartValues, resolveDebateShape } from "@debateai/register";
import { refuseDebateShapeReceiptInPhase2a } from "@debateai/runner";

describe("the runner resolves the debate shape at its register version, at boot (spec 2026-10-12 §3.1, §4)", () => {
  it("reads the row and the map hash once, before the runner is built, and carries no Phase 2a boot guard", async () => {
    const main = await readFile("apps/runner/src/main.ts", "utf8");
    const resolve = "const debateShape = resolveDebateShapeRunnerSettings({";
    expect(main.split(resolve)).toHaveLength(2);
    // Before the runner is built, so a refused boot claims no debate.
    expect(main.indexOf(resolve)).toBeLessThan(main.indexOf("new WalkingSkeletonRunner("));
    expect(main).not.toContain("assertDebateShapeRunnerReady");
  });
});

describe("I2(b), Phase 2a: the runner refuses a claimed run's debate-shape receipt, whatever its own register says", () => {
  const TERMS = Object.freeze({ maxDepth: 5, judgeMaxAttempts: 3, organMaxAttempts: 3, finalRetryAttempts: 1, maxRecompose: 1,
    maxCooldownHoldsPerRun: 2, branchingFactor: 2, compositionSegmentCap: 3, fixedOrgansPerComposition: 5,
    reviewerCallsPerNode: 1, synthesizerMaxRounds: 3, evaluatorMaxRounds: 3 });
  const shape = resolveDebateShape({ policy: debateShapePolicyStartValues(), plan: "pro", makers: 3,
    settings: { depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" } })!;
  const wire = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

  it("a shaped receipt is refused RUN_ENVELOPE_BASIS_INVALID naming Phase 2a; today's receipts (v4 and v5) are not", () => {
    const shaped = parseCostEnvelopeBasis(wire(computeStructuralCeilingBasis({ ...TERMS, panelSize: 3, depth: 2, shape })));
    expect(() => refuseDebateShapeReceiptInPhase2a(shaped)).toThrowError(expect.objectContaining({
      name: "TypedDomainError", code: "RUN_ENVELOPE_BASIS_INVALID", message: expect.stringContaining("Phase 2a")
    }));
    for (const backup of [0, 1] as const) {
      const today = parseCostEnvelopeBasis(wire(computeStructuralCeilingBasis({ ...TERMS, panelSize: 3, depth: 2,
        backupSequencesProvisioned: backup })));
      expect(() => refuseDebateShapeReceiptInPhase2a(today)).not.toThrow();
    }
  });

  it("the claim path asks it right after the strict basis parse, before anything else of the run is read", async () => {
    const index = await readFile("apps/runner/src/index.ts", "utf8");
    const parse = "envelopeBasis = parseCostEnvelopeBasis(run.envelopeBasis);";
    const guard = "refuseDebateShapeReceiptInPhase2a(envelopeBasis);";
    expect(index.split(guard)).toHaveLength(2);
    expect(index.indexOf(parse)).toBeLessThan(index.indexOf(guard));
    expect(index.indexOf(guard)).toBeLessThan(index.indexOf("const expansionDepth = resolveExpansionDepth(run.depthParams);"));
  });
});
