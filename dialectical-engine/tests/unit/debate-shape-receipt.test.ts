import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseCostEnvelopeBasis } from "@debateai/budget";
import { publicCostEnvelopeBasis } from "@debateai/serve";
import { debateShapeSettingsOf } from "@debateai/contract";
import {
  DEBATE_SHAPE_PLAN_KEYS, computeStructuralCeilingBasis, debateShapePolicyStartValues, normaliseDepthParamsForShape,
  resolveDebateShape
} from "@debateai/register";

const TERMS = Object.freeze({ maxDepth: 5, judgeMaxAttempts: 3, organMaxAttempts: 3, finalRetryAttempts: 1, maxRecompose: 1,
  maxCooldownHoldsPerRun: 2, branchingFactor: 2, compositionSegmentCap: 3, fixedOrgansPerComposition: 5,
  reviewerCallsPerNode: 1, synthesizerMaxRounds: 3, evaluatorMaxRounds: 3 });
const POLICY = debateShapePolicyStartValues();
const SHAPE = resolveDebateShape({ policy: POLICY, plan: "pro", makers: 5,
  settings: { depthMode: "fixed", scrutiny: "deep", answerLength: "detailed" } })!;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const wire = (value: unknown): any => JSON.parse(JSON.stringify(value));
const shaped = (backup: 0 | 1 = 0) => wire(computeStructuralCeilingBasis({ ...TERMS, panelSize: 5, depth: 3, backupSequencesProvisioned: backup, shape: SHAPE }));
const legacy = (backup: 0 | 1 = 0) => wire(computeStructuralCeilingBasis({ ...TERMS, panelSize: 5, depth: 3, backupSequencesProvisioned: backup }));
/** The refusal's code AND its message, so a test can see WHICH check fired (PF8; budget/src/index.ts, T17B/B2). */
const refusal = (value: unknown): { code: unknown; message: string } | null => {
  try { parseCostEnvelopeBasis(value); return null; } catch (error) {
    return { code: (error as { code?: unknown }).code, message: String((error as { message?: unknown }).message) };
  }
};
const mintRefusal = (run: () => unknown): { code: unknown; message: string } | null => {
  try { run(); return null; } catch (error) {
    return { code: (error as { code?: unknown }).code, message: String((error as { message?: unknown }).message) };
  }
};

describe("the strict receipt parser reads a debate shape receipt (spec 2026-10-12 §3.6)", () => {
  it("parses a shape receipt and hands back the sizes the run was admitted with", () => {
    const parsed = parseCostEnvelopeBasis(shaped());
    expect(parsed.shape).toEqual(SHAPE);
    expect(parsed.maxModelAttempts).toBe(shaped().max_model_attempts);
    expect(parsed.serveReserveAttempts).toBe(18);
    expect(parseCostEnvelopeBasis(shaped(1)).shape).toEqual(SHAPE);
  });
  it("reads a v4 or v5 receipt exactly as before: no shape member on the result", () => {
    for (const backup of [0, 1] as const) {
      const parsed = parseCostEnvelopeBasis(legacy(backup));
      expect("shape" in parsed).toBe(false);
      expect(parsed.wire).toEqual(legacy(backup));
    }
  });
  it("parses every shape receipt admission can mint, with and without the backup sequence", () => {
    for (const plan of DEBATE_SHAPE_PLAN_KEYS) for (let makers = 2; makers <= 7; makers += 1) for (let depth = 1; depth <= 3; depth += 1) {
      for (const depthMode of ["adaptive", "fixed"] as const) for (const backup of [0, 1] as const) {
        const depthParams = normaliseDepthParamsForShape({ depth, depthMode, scrutiny: "exhaustive" }, POLICY, plan);
        const shape = resolveDebateShape({ policy: POLICY, plan, makers, settings: debateShapeSettingsOf(depthParams) })!;
        // Admission mints at the NORMALISED depth (PF9: Free above 2 is stored as 2).
        const basis = wire(computeStructuralCeilingBasis({ ...TERMS, panelSize: makers, depth: depthParams.depth,
          backupSequencesProvisioned: backup, shape }));
        expect(parseCostEnvelopeBasis(basis).shape).toEqual(shape);
        // I1: every minted receipt splits its synthesis sites evenly between the writer and the checker.
        expect(basis.serve_leg.synthesis_loop_sites % 2).toBe(0);
      }
    }
  });
  it("T4: refuses a backup flag of 0 on a receipt whose per-site attempts show the backup", () => {
    const basis = shaped(1);
    basis.shape.backup_sequences = 0;
    const refused = refusal(basis);
    expect(refused?.code).toBe("RUN_COST_ENVELOPE_UNRESOLVED");
    expect(refused?.message).toContain("the backup flag and the per-site attempts disagree");
  });
  it("I1: refuses an odd synthesis-site count on today's receipt too, and keeps today's even one", () => {
    for (const backup of [0, 1] as const) {
      const basis = legacy(backup);
      expect(basis.serve_leg.synthesis_loop_sites % 2).toBe(0);
      expect(refusal(basis)).toBeNull();
      basis.serve_leg.synthesis_loop_sites = 7; basis.call_sites.serve = 7; basis.serve_reserve_attempts = 7 * basis.per_site_attempts.organ;
      const refused = refusal(basis);
      expect(refused?.code).toBe("RUN_COST_ENVELOPE_UNRESOLVED");
      expect(refused?.message).toContain("synthesis-loop sites 7 are odd");
    }
  });
  it.each([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ["a shape receipt under the v4 name", (b: any) => { b.formula_version = "DR-184-v4"; }, "DR-184-v4 and its shape member disagree"],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ["a v4 receipt carrying a shape member", (b: any) => { b.formula_version = "DR-184-v4"; b.call_sites = legacy().call_sites; b.max_model_attempts = legacy().max_model_attempts; },
      "DR-184-v4 and its shape member disagree"],
    // I3 (final review): the other direction — the shape formula's name with its member gone.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ["a shape-formula receipt with no shape member", (b: any) => { delete b.shape; }, "DR-185-shape-v1 and its shape member disagree"],
    // I1 (final review): the answer writer and checker split the synthesis sites evenly, so an odd count cannot be a receipt.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ["an odd synthesis-site count", (b: any) => {
      b.serve_leg.synthesis_loop_sites = 7; b.call_sites.serve = 7; b.serve_reserve_attempts = 7 * b.per_site_attempts.organ;
    }, "synthesis-loop sites 7 are odd"],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ["an author leg that is not map sites plus nodes", (b: any) => { b.call_sites.author += 1; }, "are not map plus nodes"],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ["a node count the sizes do not give", (b: any) => { b.shape.nodes += 2; b.call_sites.author += 2; b.call_sites.panel += 8; b.call_sites.reviewer += 2; },
      "disagree with its sizes"],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ["a panel leg that is not graders plus extras per node", (b: any) => { b.call_sites.panel -= 1; }, "are not graders per node"],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ["more answers than debaters", (b: any) => { b.panel_size = 3; }, "the shape's sizes exceed 3 debaters"],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ["an unknown key in the shape", (b: any) => { b.shape.extra = 1; }, "\"extra\""],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ["a backup flag the per-site attempts do not show", (b: any) => { b.shape.backup_sequences = 1; }, "the backup flag and the per-site attempts disagree"],
    // T4-ABSORB (b): standard scrutiny means 0 rounds and 0 points, and deep or exhaustive means a budget.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ["standard scrutiny that carries a scrutiny budget", (b: any) => { b.shape.scrutiny = "standard"; }, "standard scrutiny means 0 rounds and 0 points"],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ["deep scrutiny with no scrutiny budget", (b: any) => {
      const scrutinyNodes = 2 * b.shape.scrutiny_rounds_per_point * b.shape.scrutiny_points_per_debate;
      b.shape.scrutiny_rounds_per_point = 0; b.shape.scrutiny_points_per_debate = 0;
      b.shape.nodes -= scrutinyNodes; b.call_sites.author -= scrutinyNodes; b.call_sites.panel -= 4 * scrutinyNodes; b.call_sites.reviewer -= scrutinyNodes;
    }, "standard scrutiny means 0 rounds and 0 points"],
    // T4-ABSORB (b): reviewer sites are r reviews on every node, r >= 1 (the ceiling's r x nodes).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ["a reviewer leg that is not whole reviews per node", (b: any) => { b.call_sites.reviewer += 1; }, "are not whole reviews per node"],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ["a reviewer leg with no review per node", (b: any) => { b.call_sites.reviewer = 0; }, "are not whole reviews per node"],
    // T4-ABSORB (c): the site count throws on a depth below 1; the parser must refuse, never throw a TypeError.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ["a shape receipt whose rounds cannot be counted", (b: any) => { b.depth = 0; }, "shape sites cannot be counted"],
    // T4-ABSORB (a): the shares are 0..1 numbers on the wire too (a NaN is written as null).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ["a scrutiny leverage share above 1", (b: any) => { b.shape.scrutiny_leverage_min = 1.5; }, "scrutiny_leverage_min must be a share from 0 to 1"],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ["a weak-below share written as null (a NaN on the wire)", (b: any) => { b.shape.scrutiny_weak_below = null; }, "scrutiny_weak_below must be a share from 0 to 1"],
    // X1: the map step bounds are on every shape receipt, whole token counts.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ["a shape receipt without its merge bound", (b: any) => { delete b.shape.map_merge_bound; }, "map_merge_bound must be a whole number of tokens"],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ["a choose bound of 0", (b: any) => { b.shape.map_choose_bound = 0; }, "map_choose_bound must be a whole number of tokens"]
  ])("refuses %s", (_name, mutate, fired) => {
    const basis = shaped();
    mutate(basis);
    const refused = refusal(basis);
    expect(refused?.code).toBe("RUN_COST_ENVELOPE_UNRESOLVED");
    expect(refused?.message).toContain(fired);
  });
});

describe("a shape receipt that would not parse is never minted (T4-ABSORB a)", () => {
  it.each([
    ["scrutinyLeverageMin", Number.NaN, "scrutiny_leverage_min"],
    ["scrutinyLeverageMin", 1.5, "scrutiny_leverage_min"],
    ["scrutinyWeakBelow", -0.01, "scrutiny_weak_below"],
    ["scrutinyWeakBelow", Number.POSITIVE_INFINITY, "scrutiny_weak_below"]
  ] as const)("refuses %s = %s at mint time", (key, value, wireKey) => {
    const refused = mintRefusal(() => computeStructuralCeilingBasis({ ...TERMS, panelSize: 5, depth: 3, shape: { ...SHAPE, [key]: value } }));
    expect(refused?.code).toBe("STRUCTURAL_CEILING_SHAPE_INVALID");
    expect(refused?.message).toContain(`${wireKey} must be a share from 0 to 1`);
  });
});

describe("PF9 pin: a Free shaped ask above depth 2 is billed at depth 2", () => {
  it("a Free ask at depth 3 with three makers is normalised to depth 2 and yields the depth-2 ceiling 352", () => {
    const depthParams = normaliseDepthParamsForShape({ depth: 3 }, POLICY, "free");
    expect(depthParams.depth).toBe(2);
    const shape = resolveDebateShape({ policy: POLICY, plan: "free", makers: 3, settings: debateShapeSettingsOf(depthParams) })!;
    const basis = wire(computeStructuralCeilingBasis({ ...TERMS, panelSize: 3, depth: depthParams.depth, shape }));
    expect(basis.max_model_attempts).toBe(352);
    const parsed = parseCostEnvelopeBasis(basis);
    expect(parsed.depth).toBe(2);
    expect(parsed.maxModelAttempts).toBe(352);
    expect(parsed.shape).toEqual(shape);
  });
});

describe("M8 (controller ruling): the public answer read carries no shape member", () => {
  it("a shaped receipt's public basis has no shape key and every other member as stored; today's is the same object", () => {
    const stored = shaped();
    const shown = publicCostEnvelopeBasis(stored);
    expect("shape" in shown).toBe(false);
    const { shape: _shape, ...rest } = stored;
    expect(shown).toEqual(rest);
    expect(JSON.stringify(shown)).toBe(JSON.stringify(rest));
    // The stored receipt itself is never changed.
    expect(stored.shape).toBeDefined();
    for (const backup of [0, 1] as const) {
      const today = legacy(backup);
      expect(publicCostEnvelopeBasis(today)).toBe(today);
    }
  });
  it("the answer body's cost_envelope.basis is read through it", async () => {
    const serve = await readFile(new URL("../../packages/serve/src/index.ts", import.meta.url), "utf8");
    expect(serve).toContain("basis: publicCostEnvelopeBasis(row.envelope_basis),");
    expect(serve).not.toContain("basis: row.envelope_basis,");
  });
});
