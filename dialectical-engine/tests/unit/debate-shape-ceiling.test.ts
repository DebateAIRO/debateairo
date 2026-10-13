import { describe, expect, it } from "vitest";
import { debateShapeSettingsOf, type AnswerLength, type DepthMode, type Scrutiny } from "@debateai/contract";
import {
  DEBATE_SHAPE_FORMULA_VERSION, DEBATE_SHAPE_PLAN_KEYS, computeStructuralCeilingBasis, debateShapeOfReceipt,
  debateShapePolicyStartValues, debateShapeReceiptSchema, debateShapeSiteCounts, normaliseDepthParamsForShape, resolveDebateShape, structuralBasisProvisionsBackup,
  type DebateShapeCeilingInput, type DebateShapePlanKey
} from "@debateai/register";

const TERMS = Object.freeze({ maxDepth: 5, judgeMaxAttempts: 3, organMaxAttempts: 3, finalRetryAttempts: 1, maxRecompose: 1,
  maxCooldownHoldsPerRun: 2, branchingFactor: 2, compositionSegmentCap: 3, fixedOrgansPerComposition: 5,
  reviewerCallsPerNode: 1, synthesizerMaxRounds: 3, evaluatorMaxRounds: 3 });
const POLICY = debateShapePolicyStartValues();
type Asked = Readonly<{ depthMode: DepthMode; scrutiny: Scrutiny; answerLength: AnswerLength }>;
const STANDARD: Asked = Object.freeze({ depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" });

function shapeFor(plan: DebateShapePlanKey, makers: number, asked: Asked, depth: number): DebateShapeCeilingInput {
  const depthParams = normaliseDepthParamsForShape({ depth, ...asked }, POLICY, plan);
  const shape = resolveDebateShape({ policy: POLICY, plan, makers, settings: debateShapeSettingsOf(depthParams) });
  if (shape === null) throw new Error("a one-maker panel has no shape");
  return shape;
}
const basisOf = (shape: DebateShapeCeilingInput | undefined, panelSize: number, depth: number, backup: 0 | 1 = 0) =>
  computeStructuralCeilingBasis({ ...TERMS, panelSize, depth, backupSequencesProvisioned: backup, ...(shape === undefined ? {} : { shape }) });

/**
 * An INDEPENDENT count: every call the shape can make, listed one by one, each at the attempts its site may spend
 * (the t17 rule: cooldown-wrapped sites judge + final (+ judge with a backup), cross-exchange authors judge + final,
 * panel members judge (+ judge), serve organ (+ organ)). Close-call extras are counted on EVERY node.
 */
function enumerateAttempts(shape: DebateShapeCeilingInput, depth: number, backup: 0 | 1): number {
  const cooldown = TERMS.judgeMaxAttempts + TERMS.finalRetryAttempts + backup * TERMS.judgeMaxAttempts;
  const crossSite = TERMS.judgeMaxAttempts + TERMS.finalRetryAttempts;
  const member = TERMS.judgeMaxAttempts + backup * TERMS.judgeMaxAttempts;
  const serve = TERMS.organMaxAttempts + backup * TERMS.organMaxAttempts;
  const calls: number[] = [];
  calls.push(cooldown); // MAP:angles
  for (let list = 0; list < shape.mapAIs; list += 1) calls.push(cooldown, cooldown); // MAP:list:<i>, and again when handed on
  calls.push(cooldown); // MAP:merge
  for (let gap = 0; gap < shape.gapRounds; gap += 1) calls.push(cooldown); // MAP:gap:<k>
  calls.push(cooldown); // MAP:choose
  const node = (author: number): void => {
    calls.push(author);
    for (let grader = 0; grader < shape.graders + shape.closeCallExtraGraders; grader += 1) calls.push(member);
    for (let review = 0; review < TERMS.reviewerCallsPerNode; review += 1) calls.push(cooldown);
  };
  for (let position = 0; position < shape.answers; position += 1) {
    node(cooldown);
    for (let point = 0; point < shape.pointsPerAnswer; point += 1) node(cooldown);
    node(crossSite);
  }
  const deeper = shape.depthMode === "fixed" ? shape.pointsPerAnswer : shape.deeperTopPoints;
  for (let round = 2; round <= depth; round += 1) {
    for (let position = 0; position < shape.answers; position += 1) {
      for (let point = 0; point < deeper; point += 1) { node(cooldown); node(cooldown); }
    }
  }
  for (let point = 0; point < shape.scrutinyPointsPerDebate; point += 1) {
    for (let round = 0; round < shape.scrutinyRoundsPerPoint; round += 1) { node(cooldown); node(cooldown); }
  }
  for (let round = 0; round < TERMS.synthesizerMaxRounds + TERMS.evaluatorMaxRounds; round += 1) calls.push(serve);
  return calls.reduce((sum, attempts) => sum + attempts, 0);
}

describe("the structural ceiling learns the debate shape (spec 2026-10-12 §3.6)", () => {
  it("row absent: today's receipt, byte for byte, and never a shape key", () => {
    expect(JSON.stringify(basisOf(undefined, 2, 1))).toBe(
      '{"kind":"COMPUTED_STRUCTURAL_CEILING","max_model_attempts":106,"panel_size":2,"depth":1,'
      + '"per_site_attempts":{"judge":3,"organ":3,"panel_member":3,"cooldown_site":4},'
      + '"call_sites":{"author":8,"panel":8,"reviewer":8,"serve":6},'
      + '"serve_leg":{"synthesis_loop_sites":6,"selected":"SYNTHESIS_LOOP"},"serve_reserve_attempts":18,"hold_cap":2,'
      + '"final_retry_attempts":1,"formula_version":"DR-184-v4","bounds_source_ref":"engine-exports+register"}');
    for (const panelSize of [1, 2, 3, 4]) for (const depth of [1, 2, 3, 4, 5]) for (const backup of [0, 1] as const) {
      const basis = basisOf(undefined, panelSize, depth, backup);
      expect("shape" in basis).toBe(false);
      expect(basis.formula_version).toBe(backup === 1 ? "DR-184-v5" : "DR-184-v4");
    }
  });

  it("pins Free with 3 makers at depth 2 (adaptive, standard): 352 attempts", () => {
    const basis = basisOf(shapeFor("free", 3, STANDARD, 2), 3, 2);
    expect(basis.max_model_attempts).toBe(352);
    expect(basis.call_sites).toEqual({ author: 31, panel: 42, reviewer: 21, serve: 6 });
    expect(basis.serve_reserve_attempts).toBe(18);
    expect(basis.formula_version).toBe(DEBATE_SHAPE_FORMULA_VERSION);
    expect(basis.shape).toMatchObject({ plan: "free", map_sites: 10, nodes: 21, cross_nodes: 3, backup_sequences: 0, writer_bound: 12288 });
  });
  it("pins Max with 7 makers at depth 2, exhaustive scrutiny: 3,084 attempts", () => {
    const basis = basisOf(shapeFor("max", 7, { ...STANDARD, scrutiny: "exhaustive" }, 2), 7, 2);
    expect(basis.max_model_attempts).toBe(3084);
    expect(basis.call_sites).toEqual({ author: 149, panel: 650, reviewer: 130, serve: 6 });
  });
  it("pins Pro with 5 makers at depth 3, fixed, deep, with a backup sequence: 4,385 attempts", () => {
    const basis = basisOf(shapeFor("pro", 5, { depthMode: "fixed", scrutiny: "deep", answerLength: "detailed" }, 3), 5, 3, 1);
    expect(basis.max_model_attempts).toBe(4385);
    expect(basis.per_site_attempts).toEqual({ judge: 3, organ: 6, panel_member: 6, cooldown_site: 7, cross_exchange_site: 4 });
    expect(basis.serve_reserve_attempts).toBe(36);
    expect(structuralBasisProvisionsBackup(basis)).toBe(true);
  });
  it("two makers: one grader and no close-call extra, 160 attempts at depth 1", () => {
    const shape = shapeFor("free", 2, STANDARD, 1);
    expect(shape).toMatchObject({ answers: 2, graders: 1, closeCallExtraGraders: 0, mapAIs: 2 });
    expect(basisOf(shape, 2, 1).max_model_attempts).toBe(160);
    expect(debateShapeSiteCounts(shape, 1)).toEqual({ mapSites: 8, positionNodes: 2, pointNodes: 6, crossNodes: 2,
      deeperNodes: 0, scrutinyNodes: 0, nodes: 10 });
  });

  it("EQUALS an independent call-by-call enumeration over the whole grid (never under-counts)", () => {
    const modes: readonly DepthMode[] = ["adaptive", "fixed"];
    const scrutinies: readonly Scrutiny[] = ["standard", "deep", "exhaustive"];
    let checked = 0;
    for (const plan of DEBATE_SHAPE_PLAN_KEYS) for (let makers = 2; makers <= 9; makers += 1) {
      for (let depth = 1; depth <= TERMS.maxDepth; depth += 1) for (const depthMode of modes) for (const scrutiny of scrutinies) {
        for (const backup of [0, 1] as const) {
          const shape = shapeFor(plan, makers, { depthMode, scrutiny, answerLength: "standard" }, depth);
          const basis = basisOf(shape, makers, depth, backup);
          expect(basis.max_model_attempts, `${plan} M${makers} d${depth} ${depthMode} ${scrutiny} b${backup}`)
            .toBe(enumerateAttempts(shape, depth, backup));
          expect(basis.max_model_attempts).toBeGreaterThan(basis.serve_reserve_attempts);
          checked += 1;
        }
      }
    }
    expect(checked).toBe(5 * 8 * 5 * 2 * 3 * 2);
  });

  it("refuses a shape the panel cannot run", () => {
    const shape = shapeFor("pro", 5, STANDARD, 1);
    const code = (run: () => unknown): unknown => { try { run(); return null; } catch (error) { return (error as { code?: unknown }).code; } };
    expect(code(() => basisOf(shape, 1, 1))).toBe("STRUCTURAL_CEILING_SHAPE_INVALID");
    expect(code(() => basisOf(shape, 3, 1))).toBe("STRUCTURAL_CEILING_SHAPE_INVALID");
    expect(code(() => basisOf({ ...shape, closeCallExtraGraders: 2 }, 5, 1))).toBe("STRUCTURAL_CEILING_SHAPE_INVALID");
    expect(code(() => basisOf({ ...shape, scrutinyRoundsPerPoint: 2 }, 5, 1))).toBe("STRUCTURAL_CEILING_SHAPE_INVALID");
    // X1: the map step bounds are whole token counts.
    expect(code(() => basisOf({ ...shape, mapMergeBound: 0 }, 5, 1))).toBe("STRUCTURAL_CEILING_SHAPE_INVALID");
    expect(code(() => basisOf({ ...shape, mapChooseBound: 1.5 }, 5, 1))).toBe("STRUCTURAL_CEILING_SHAPE_INVALID");
  });

  it("the shape receipt parses under its own strict schema and reads back as the sizes it was minted from", () => {
    const shape = shapeFor("pro", 5, { depthMode: "fixed", scrutiny: "deep", answerLength: "detailed" }, 3);
    const receipt = debateShapeReceiptSchema.parse(basisOf(shape, 5, 3, 1).shape);
    expect(receipt).toMatchObject({ backup_sequences: 1, map_sites: 15, nodes: 112, cross_nodes: 4 });
    expect(debateShapeOfReceipt(receipt)).toEqual(shape);
    // X1: the map step bounds ride the receipt as its LAST two members, so every earlier member keeps its bytes.
    expect(receipt).toMatchObject({ map_merge_bound: 32_768, map_choose_bound: 32_768 });
    expect(Object.keys(basisOf(shape, 5, 3, 1).shape!).slice(-3)).toEqual(["backup_sequences", "map_merge_bound", "map_choose_bound"]);
    expect(debateShapeReceiptSchema.safeParse({ ...receipt, extra: 1 }).success).toBe(false);
  });

  it("the backup test reads v5 and a shape receipt's own flag, nothing else", () => {
    expect(structuralBasisProvisionsBackup(basisOf(undefined, 3, 1, 1))).toBe(true);
    expect(structuralBasisProvisionsBackup(basisOf(undefined, 3, 1, 0))).toBe(false);
    expect(structuralBasisProvisionsBackup(basisOf(shapeFor("free", 3, STANDARD, 1), 3, 1, 0))).toBe(false);
    expect(structuralBasisProvisionsBackup({ formula_version: DEBATE_SHAPE_FORMULA_VERSION })).toBe(false);
  });
});
