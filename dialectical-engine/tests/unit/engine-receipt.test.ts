import { describe, expect, it } from "vitest";
import { parseCostEnvelopeBasis } from "@debateai/budget";
import {
  ENGINE_ONE, computeStructuralCeilingBasis, debateShapePolicyStartValues, engineOfRun, engineReceipt, engineSettingsOf,
  engineVersionPolicyStartValues, lengthGuidancePolicyStartValues, resolveDebateShapeV2, resolveLengthGuidance, type DebateShapePlanKey
} from "@debateai/register";
import { publicCostEnvelopeBasis } from "@debateai/serve"; // pre-flight PF-D2.3

const TERMS = Object.freeze({ judgeMaxAttempts: 3, organMaxAttempts: 3, maxRecompose: 1, maxCooldownHoldsPerRun: 2,
  finalRetryAttempts: 1, branchingFactor: 2, compositionSegmentCap: 4, fixedOrgansPerComposition: 6, reviewerCallsPerNode: 1,
  synthesizerMaxRounds: 3, evaluatorMaxRounds: 3, maxDepth: 5 });
/** Today's receipt keys (DR-184-v4), in their minted order. */
const TODAY_KEYS = Object.freeze(["kind", "max_model_attempts", "panel_size", "depth", "per_site_attempts", "call_sites",
  "serve_leg", "serve_reserve_attempts", "hold_cap", "final_retry_attempts", "formula_version", "bounds_source_ref"]);
const GUIDANCE = resolveLengthGuidance({ policy: lengthGuidancePolicyStartValues(), plan: "pro", answerLength: "detailed" });
/** Start values, three makers, the map opening: 3 comparing judges + 2 investigations + 1 answer check = 6 sites. */
const ENGINE = engineSettingsOf(engineVersionPolicyStartValues(), { makers: 3, mapOpening: true });
const refusedAs = (code: string) => expect.objectContaining({ code });
const unresolved = (reason: string) =>
  expect.objectContaining({ code: "RUN_COST_ENVELOPE_UNRESOLVED", message: expect.stringContaining(reason) });

describe("engine row absent: today's receipt, byte for byte (spec §15)", () => {
  it("no engine key on any receipt, today's keys and today's ceiling, with or without the length member", () => {
    for (const panelSize of [1, 2, 3, 4]) {
      for (const depth of [1, 2, 3]) {
        const at = `${String(panelSize)}/${String(depth)}`;
        const today = computeStructuralCeilingBasis({ ...TERMS, panelSize, depth });
        const guided = computeStructuralCeilingBasis({ ...TERMS, panelSize, depth, length: GUIDANCE });
        expect(Object.keys(today), at).toEqual(TODAY_KEYS);
        expect(Object.keys(guided), at).toEqual([...TODAY_KEYS, "length"]);
        expect(guided.max_model_attempts, at).toBe(today.max_model_attempts);
        for (const basis of [today, guided]) {
          expect(Object.hasOwn(basis, "engine"), at).toBe(false);
          const parsed = parseCostEnvelopeBasis(basis);
          expect(Object.hasOwn(parsed, "engine"), at).toBe(false);
          expect(engineOfRun(parsed), at).toBe(ENGINE_ONE);
          expect(parsed.maxModelAttempts, at).toBe(today.max_model_attempts);
        }
      }
    }
    // Three debaters, two rounds: (27 - 6 + 27) x 4 + 6 x 4 + 54 x 3 + 6 x 3 = 396 (DR-184-v4, the sealed arithmetic).
    expect(computeStructuralCeilingBasis({ ...TERMS, panelSize: 3, depth: 2 }).max_model_attempts).toBe(396);
  });
});

describe("engine row in force: the member rides last (INTERFACE §3.2)", () => {
  const lengthOnly = computeStructuralCeilingBasis({ ...TERMS, panelSize: 3, depth: 2, length: GUIDANCE });
  const both = computeStructuralCeilingBasis({ ...TERMS, panelSize: 3, depth: 2, length: GUIDANCE, engine: ENGINE });

  it("adds the engine's calls to the ceiling and changes no other member's bytes", () => {
    expect(Object.keys(both)).toEqual([...Object.keys(lengthOnly), "engine"]);
    expect(Object.keys(both).at(-2)).toBe("length");
    const { engine: member, max_model_attempts: engineCeiling, ...rest } = both as Record<string, unknown>;
    const { max_model_attempts: lengthCeiling, ...lengthRest } = lengthOnly as Record<string, unknown>;
    expect(JSON.stringify(rest)).toBe(JSON.stringify(lengthRest));
    expect(lengthCeiling).toBe(396);
    // 6 sites x 3 panel-member attempts = 18.
    expect(engineCeiling).toBe(414);
    expect(member).toEqual(engineReceipt(ENGINE, 3));
    // Task 3 review 1 (final wave B2): one literal, not only the minter compared with itself.
    expect((member as { sites: unknown }).sites).toEqual({ comparing_judges: 3, investigations: 2, answer_check: 1, added_model_attempts: 18 });
    expect(both.formula_version).toBe("DR-184-v4");
    expect(both.serve_reserve_attempts).toBe(lengthOnly.serve_reserve_attempts);
  });

  it("prices the added calls at the panel member's allowance, backup included", () => {
    const backed = computeStructuralCeilingBasis({ ...TERMS, panelSize: 3, depth: 2, backupSequencesProvisioned: 1, length: GUIDANCE });
    const backedEngine = computeStructuralCeilingBasis({ ...TERMS, panelSize: 3, depth: 2, backupSequencesProvisioned: 1,
      length: GUIDANCE, engine: ENGINE });
    expect((backedEngine.per_site_attempts as { panel_member: number }).panel_member).toBe(6);
    expect(backedEngine.max_model_attempts - backed.max_model_attempts).toBe(36);
    expect(backedEngine.formula_version).toBe("DR-184-v5");
    expect(backed.formula_version).toBe("DR-184-v5");
    expect(parseCostEnvelopeBasis(backedEngine).engine).toEqual(ENGINE);
  });

  it("parses back strictly to the same settings, beside the length", () => {
    const parsed = parseCostEnvelopeBasis(both);
    expect(parsed.engine).toEqual(ENGINE);
    expect(parsed.length).toEqual(GUIDANCE);
    expect(parsed.maxModelAttempts).toBe(414);
    expect(engineOfRun(parsed)).toEqual(ENGINE);
    expect(parseCostEnvelopeBasis(JSON.parse(JSON.stringify(both))).engine).toEqual(ENGINE);
  });

  it("the constructor never mints an engine member without the length member", () => {
    expect(() => computeStructuralCeilingBasis({ ...TERMS, panelSize: 3, depth: 2, engine: ENGINE }))
      .toThrowError(refusedAs("STRUCTURAL_CEILING_ENGINE_INVALID"));
  });

  it("the constructor refuses a malformed engine input", () => {
    const tooMany = { ...ENGINE, sites: { ...ENGINE.sites, comparingJudges: 4 } };
    expect(() => computeStructuralCeilingBasis({ ...TERMS, panelSize: 3, depth: 2, length: GUIDANCE, engine: tooMany }))
      .toThrowError(refusedAs("STRUCTURAL_CEILING_ENGINE_INVALID"));
  });

  it("the parser refuses an engine member without the length member", () => {
    const { length: _length, ...withoutLength } = both as Record<string, unknown>;
    expect(() => parseCostEnvelopeBasis(withoutLength)).toThrowError(unresolved("the engine member needs the length member"));
  });

  it("the parser refuses added attempts its own sites do not give", () => {
    const member = both.engine as { sites: Record<string, number> };
    for (const added of [17, 19, 0]) {
      const tampered = { ...both, engine: { ...member, sites: { ...member.sites, added_model_attempts: added } } };
      expect(() => parseCostEnvelopeBasis(tampered), String(added)).toThrowError(unresolved("engine added attempts"));
    }
  });

  it("the parser refuses a malformed member", () => {
    const member = both.engine as Record<string, unknown> & { sites: Record<string, unknown> };
    for (const bad of [null, { ...member, extra: 1 }, { ...member, version: 2 }, { ...member, engine: 1 },
      { ...member, sites: { ...member.sites, answer_check: 2 } }]) {
      expect(() => parseCostEnvelopeBasis({ ...both, engine: bad }), JSON.stringify(bad).slice(0, 60))
        .toThrowError(refusedAs("RUN_COST_ENVELOPE_UNRESOLVED"));
    }
  });

  // Pre-flight PF-D2.3 (controller ruling; M8; owner rule: no internals in user-facing output). Compared with the public
  // read of the same receipt minus `engine`, so the case holds whatever else the public read drops (`shape`; `length`
  // since R1c part 2's final fix wave).
  it("the public answer read carries no engine member; a receipt without it is the same object", () => {
    const stored = JSON.parse(JSON.stringify(both)) as Record<string, unknown>;
    const shown = publicCostEnvelopeBasis(stored);
    expect(Object.hasOwn(shown, "engine")).toBe(false);
    // pre-flight consistency: the length member is never public either (R1c part 2's wave, or Step 4b Case B).
    expect(Object.hasOwn(shown, "length")).toBe(false);
    const { engine: _engine, ...withoutEngine } = stored;
    expect(JSON.stringify(shown)).toBe(JSON.stringify(publicCostEnvelopeBasis(withoutEngine)));
    // The stored receipt itself is never changed.
    expect(Object.hasOwn(stored, "engine")).toBe(true);
    const today = JSON.parse(JSON.stringify(computeStructuralCeilingBasis({ ...TERMS, panelSize: 3, depth: 2 }))) as Record<string, unknown>;
    expect(publicCostEnvelopeBasis(today)).toBe(today);
  });
});

/**
 * V4 start step, Task 54e (the owner's answer of 5 Nov, "One per path": every path gets one look-up, 3 paths = 3): on a paid path
 * debate (shape receipt v2) the ceiling counts max(cap, paths) investigation sites, each one call at the panel member's allowance,
 * so the price never under-counts the look-ups the runner makes; Free keeps the cap; a debate without paths (R22) is unchanged.
 */
describe("Task 54e: the ceiling counts a paid path debate's investigations, one per path at least", () => {
  const POLICY = debateShapePolicyStartValues();
  const S = { depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" } as const;
  const shapeOf = (plan: DebateShapePlanKey, paths: number) => resolveDebateShapeV2(POLICY, plan, { ...S, paths, pathsSource: "MENU" }, 4);
  /** Four makers, the map never opening a path debate: 3 comparing judges, the cap of 2, no answer check. */
  const ENGINE4 = engineSettingsOf(engineVersionPolicyStartValues(), { makers: 4, mapOpening: false });
  const mint = (plan: DebateShapePlanKey, paths: number, engine = true) => computeStructuralCeilingBasis({ ...TERMS, panelSize: 4, depth: 1,
    shapeV2: shapeOf(plan, paths), length: GUIDANCE, ...(engine ? { engine: ENGINE4 } : {}) });
  type Sites = Readonly<{ comparing_judges: number; investigations: number; answer_check: number; added_model_attempts: number }>;
  const sitesOf = (basis: Readonly<Record<string, unknown>>) => (basis.engine as { sites: Sites }).sites;
  const panelMember = (basis: Readonly<Record<string, unknown>>) => (basis.per_site_attempts as { panel_member: number }).panel_member;

  it("Plus, 3 paths: 3 investigation sites, each one call at the panel member's allowance in the ceiling", () => {
    const plus3 = mint("plus", 3);
    expect(sitesOf(plus3)).toMatchObject({ comparing_judges: 3, investigations: 3, answer_check: 0 });
    expect(plus3.max_model_attempts - mint("plus", 3, false).max_model_attempts).toBe((3 + 3) * panelMember(plus3));
    expect((plus3.engine as { investigate: unknown }).investigate).toEqual({ max_per_debate: 2 });
  });

  it("from 2 paths to 3, the engine's calls rise by one investigation; 1 path keeps the cap; 7 paths count 7", () => {
    expect(sitesOf(mint("plus", 2)).investigations).toBe(2);
    expect(sitesOf(mint("plus", 3)).added_model_attempts - sitesOf(mint("plus", 2)).added_model_attempts).toBe(panelMember(mint("plus", 3)));
    expect(sitesOf(mint("plus", 1)).investigations).toBe(2);
    expect(sitesOf(mint("max", 7)).investigations).toBe(7);
  });

  it("Free, 3 paths: the cap, as before", () => {
    expect(sitesOf(mint("free", 3)).investigations).toBe(2);
  });

  it("an R22 debate (no paths): the cap, today's receipt byte for byte", () => {
    const r22 = computeStructuralCeilingBasis({ ...TERMS, panelSize: 3, depth: 2, length: GUIDANCE, engine: ENGINE });
    expect(r22.max_model_attempts).toBe(414);
    expect(r22.engine).toEqual(engineReceipt(ENGINE, 3));
    expect(sitesOf(r22).investigations).toBe(2);
  });

  it("the strict parser reads them back, and refuses a paid path debate priced at the bare cap or a Free one above it", () => {
    const plus3 = mint("plus", 3);
    expect(parseCostEnvelopeBasis(plus3).engine?.sites.investigations).toBe(3);
    expect(parseCostEnvelopeBasis(JSON.parse(JSON.stringify(plus3))).engine?.sites.investigations).toBe(3);
    const reSited = (basis: Readonly<Record<string, unknown>>, investigations: number) => {
      const copy = JSON.parse(JSON.stringify(basis)) as Record<string, unknown> & { engine: { sites: Record<string, number> } };
      const step = (investigations - copy.engine.sites.investigations!) * panelMember(basis);
      copy.engine.sites.investigations = investigations;
      copy.engine.sites.added_model_attempts = copy.engine.sites.added_model_attempts! + step;
      copy.max_model_attempts = Number(copy.max_model_attempts) + step;
      return copy;
    };
    expect(() => parseCostEnvelopeBasis(reSited(plus3, 2))).toThrowError(unresolved("investigation sites 2 are not 3"));
    expect(() => parseCostEnvelopeBasis(reSited(mint("free", 3), 3))).toThrowError(unresolved("investigation sites 3 are not 2"));
    // Review of Task 54e: the engine member alone now lets sites above a non-zero cap through, so only the strict parser keeps an
    // R22 receipt (no paths) at the cap.
    const r22 = computeStructuralCeilingBasis({ ...TERMS, panelSize: 3, depth: 2, length: GUIDANCE, engine: ENGINE });
    expect(() => parseCostEnvelopeBasis(reSited(r22, 3))).toThrowError(unresolved("investigation sites 3 are not 2"));
  });

  /**
   * Review of Task 54e: the investigation count runs on a receipt that already failed a non-aborting check (as T4-ABSORB (c)'s
   * site count does), and `pathRunInvestigations` throws a plain TypeError on a count below 0 (a range check, which does not
   * stop the refinements). A bad receipt is an ISSUE: the refusal stays RUN_COST_ENVELOPE_UNRESOLVED and never escapes the
   * parser as a thrown TypeError.
   */
  it("a paid path debate's receipt whose paths or cap cannot be counted is refused, never a thrown TypeError", () => {
    const bent = (change: (copy: Record<string, unknown> & { shape: Record<string, unknown>; engine: { investigate: Record<string, unknown> } }) => void) => {
      const copy = JSON.parse(JSON.stringify(mint("plus", 3))) as Record<string, unknown> & { shape: Record<string, unknown>;
        engine: { investigate: Record<string, unknown> } };
      change(copy);
      return copy;
    };
    expect(() => parseCostEnvelopeBasis(bent((copy) => { copy.shape.paths = -1; }))).toThrowError(unresolved("investigation sites cannot be counted"));
    expect(() => parseCostEnvelopeBasis(bent((copy) => { copy.engine.investigate.max_per_debate = -1; })))
      .toThrowError(unresolved("investigation sites cannot be counted"));
  });
});
