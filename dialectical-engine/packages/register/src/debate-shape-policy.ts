import type { Pool } from "pg";
import { z } from "zod";
import { exhaustive, LENGTH_GUIDANCE_START } from "@debateai/kernel";
import {
  debateShapeSettingsOf, readingLevelOf, type AnswerLength, type DebateShapeSettings, type DepthMode, type DepthParams, type PlanTier, type Scrutiny
} from "@debateai/contract";
import type { PlanId } from "./billing-plans.js";
import type { LengthGuidancePolicy } from "./length-guidance-policy.js";
import { canonicalDecimal, canonicalRegisterJson, type CanonicalJsonAst, type CanonicalRegisterJson } from "./register-publication.js";

/**
 * Debate shape (spec docs/superpowers/specs/2026-10-12-debate-shape-design.md §3.1): ONE optional row in its own family,
 * like answerRoleRotationPolicy and callConcurrencyPolicy. It is NOT a register.required_row, not in the bootstrap and
 * not in the development rows, so every sealed version without it keeps parsing and reads ABSENT: today's shape, byte
 * for byte (the owners' rollback). A row that does not parse is loud: the API's and the runner's boots refuse.
 * A new value is a new register version, never an edit.
 */
export const DEBATE_SHAPE_POLICY_ROW_KEY = "debateShapePolicy" as const;
/** The plan keys a row sizes: the four sold plans, and `premium` for a premium ask with no plan id (billing off). */
export const DEBATE_SHAPE_PLAN_KEYS = Object.freeze(["free", "plus", "pro", "max", "premium"] as const);
export type DebateShapePlanKey = typeof DEBATE_SHAPE_PLAN_KEYS[number];
/** The openings Phase 1 compared; the owners' default is the angle map (ruling S1). */
export const DEBATE_SHAPE_OPENINGS = Object.freeze(["ANGLE_MAP", "BLIND_LISTS", "SNOWBALL"] as const);
export type DebateShapeOpening = typeof DEBATE_SHAPE_OPENINGS[number];

export type DebateShapeScrutinyBudget = Readonly<{ roundsPerPoint: number; pointsPerDebate: number }>;
export type DebateShapePlan = Readonly<{
  mapAIs: number;
  answers: number;
  graders: number;
  pointsPerAnswer: number;
  deeperTopPoints: number;
  gapRoundsMax: number;
  closeCallExtraGraders: number;
  fixedDepthAllowed: boolean;
  scrutiny: Readonly<{
    deep: DebateShapeScrutinyBudget | null;
    exhaustive: DebateShapeScrutinyBudget | null;
    scrutinyLeverageMin: number;
    scrutinyWeakBelow: number;
  }>;
  opening: DebateShapeOpening;
}>;
export type DebateShapeLength = Readonly<{ words: number; writerBound: number }>;
/** Controller ruling X1 (P2b ruling R-2): the max_tokens of the map's merge and choose calls, two long structured lists. */
export type DebateShapeMapStepBounds = Readonly<{ merge: number; choose: number }>;
export type DebateShapePolicy = Readonly<{
  kind: "DEBATE_SHAPE_POLICY";
  version: 1;
  plans: Readonly<Record<DebateShapePlanKey, DebateShapePlan>>;
  answerLength: Readonly<Record<AnswerLength, DebateShapeLength>>;
  /** A row written without it reads the start values (32,768 each); every other member stays required. */
  mapStepBounds: DebateShapeMapStepBounds;
  /**
   * Amendment 2026-10-13 (the preview's rollback): absent = on, so every sealed value keeps its meaning and its bytes;
   * `false` = no shape for the ASK side (`debateShapeInForce`). Never written by the start values.
   */
  readonly enabled?: boolean;
}>;

/**
 * The sizes ONE admitted debate runs (spec §3.1, §3.6): the plan's row capped by the makers present, the asked
 * settings (already normalised for the plan) and their budgets. Minted by the API at admission and frozen on the run's
 * receipt (`envelope_basis.shape`); the runner reads them back from there and never resolves the plan again.
 */
export type DebateShapeCeilingInput = Readonly<{
  plan: DebateShapePlanKey;
  depthMode: DepthMode;
  scrutiny: Scrutiny;
  answerLength: AnswerLength;
  mapAIs: number;
  answers: number;
  graders: number;
  pointsPerAnswer: number;
  deeperTopPoints: number;
  gapRounds: number;
  closeCallExtraGraders: number;
  scrutinyRoundsPerPoint: number;
  scrutinyPointsPerDebate: number;
  scrutinyLeverageMin: number;
  scrutinyWeakBelow: number;
  opening: DebateShapeOpening;
  answerWords: number;
  writerBound: number;
  /** X1: the map's merge and choose bounds, from the row's mapStepBounds (the runner asks max(judge bound, these)). */
  mapMergeBound: number;
  mapChooseBound: number;
}>;

const whole = (min: number, max: number) => z.number().int().min(min).max(max);
/** A share 0..1 with at most six decimals: the register's canonical decimal limit. */
const share = z.number().min(0).max(1).refine((value) => Number(value.toFixed(6)) === value);
const scrutinyBudget = (roundsMax: number, pointsMax: number) =>
  z.object({ roundsPerPoint: whole(1, roundsMax), pointsPerDebate: whole(1, pointsMax) }).strict();
const planSchema = z.object({
  mapAIs: whole(2, 9),
  // Ruling T-P5: 2..4, the map's own bound (MAP_LIMITS.chooseAnswersMax; migration 0117's answer ids a1..a4), so a
  // published plan never asks the map's storage for a fifth answer after the map is paid.
  answers: whole(2, 4),
  graders: whole(1, 5),
  pointsPerAnswer: whole(1, 6),
  deeperTopPoints: whole(1, 6),
  gapRoundsMax: whole(0, 3),
  closeCallExtraGraders: whole(0, 4),
  fixedDepthAllowed: z.boolean(),
  scrutiny: z.object({
    deep: scrutinyBudget(5, 30).nullable(),
    exhaustive: scrutinyBudget(8, 60).nullable(),
    scrutinyLeverageMin: share,
    scrutinyWeakBelow: share
  }).strict(),
  opening: z.enum(DEBATE_SHAPE_OPENINGS)
}).strict();
const lengthSchema = z.object({ words: whole(50, 5000), writerBound: whole(1024, 65536) }).strict();
/**
 * X1: each map step bound is at least the sealed judge bound's floor (8,192: a map call never asks for less than any
 * other debate call) and at most 32,768 (the practice tool's R-1 room, every reviewed preview row's answer cap).
 */
const mapStepBoundsSchema = z.object({ merge: whole(8192, 32768), choose: whole(8192, 32768) }).strict();
/** The start values of mapStepBounds, and what a row written without the member reads. */
const mapStepBoundsStartValues = (): DebateShapeMapStepBounds => ({ merge: 32768, choose: 32768 });
const policySchema = z.object({
  kind: z.literal("DEBATE_SHAPE_POLICY"),
  version: z.literal(1),
  plans: z.object({ free: planSchema, plus: planSchema, pro: planSchema, max: planSchema, premium: planSchema }).strict(),
  answerLength: z.object({ short: lengthSchema, standard: lengthSchema, detailed: lengthSchema }).strict(),
  mapStepBounds: mapStepBoundsSchema.default(mapStepBoundsStartValues),
  // Amendment 2026-10-13: optional with NO default, so a row written without it keeps its exact bytes and reads as on.
  enabled: z.boolean().optional()
}).strict().superRefine((policy, ctx) => {
  const { short, standard, detailed } = policy.answerLength;
  if (!(short.words < standard.words && standard.words < detailed.words)) {
    ctx.addIssue({ code: "custom", path: ["answerLength", "words"], message: "the words rise short < standard < detailed" });
  }
  if (!(short.writerBound <= standard.writerBound && standard.writerBound <= detailed.writerBound)) {
    ctx.addIssue({ code: "custom", path: ["answerLength", "writerBound"], message: "the writer bound never falls with length" });
  }
});

const invalid = (path: string): never => { throw new TypeError(`DEBATE_SHAPE_POLICY_INVALID:${path}`); };

/** An own `__proto__` key (as JSON.parse makes one) is refused by name, never dropped by a parse. */
function protoKeyPath(value: unknown, path: readonly string[]): string | null {
  if (value === null || typeof value !== "object") return null;
  for (const key of Object.keys(value)) {
    if (key === "__proto__") return [...path, key].join(".");
    const inner = protoKeyPath((value as Record<string, unknown>)[key], [...path, key]);
    if (inner !== null) return inner;
  }
  return null;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const inner of Object.values(value)) deepFreeze(inner);
    Object.freeze(value);
  }
  return value;
}

/** Strict: any defect throws `DEBATE_SHAPE_POLICY_INVALID:<path>` (`$` for the root). */
export function parseDebateShapePolicy(value: unknown): DebateShapePolicy {
  const proto = protoKeyPath(value, []);
  if (proto !== null) return invalid(proto);
  const parsed = policySchema.safeParse(value);
  if (!parsed.success) {
    const path = parsed.error.issues[0]?.path ?? [];
    return invalid(path.length === 0 ? "$" : path.map(String).join("."));
  }
  return deepFreeze(parsed.data) as DebateShapePolicy;
}

/** ABSENT reads as null (today's shape); a malformed row throws, so the caller's boot refuses. */
export async function readDebateShapePolicy(pool: Pick<Pool, "query">, registerVersion: number): Promise<DebateShapePolicy | null> {
  const result = await pool.query<{ value_json: unknown }>(
    `SELECT value_json FROM register.register_row WHERE register_version=$1 AND row_key=$2`,
    [registerVersion, DEBATE_SHAPE_POLICY_ROW_KEY]
  );
  const row = result.rows[0];
  return row === undefined ? null : parseDebateShapePolicy(row.value_json);
}

/**
 * The row as the ASK side must read it (amendment 2026-10-13, the preview's rollback): absent, or written with
 * `enabled: false`, is no row — today's asks and today's receipts. The runner and the hosted readiness check read the
 * row raw, so a disabled row still needs its sealed map hash and shaped runs admitted before the switch still finish.
 */
export function debateShapeInForce(policy: DebateShapePolicy | null): DebateShapePolicy | null {
  return policy === null || policy.enabled === false ? null : policy;
}

/** The largest output bounds a run under this row may ask for: the writer (detailed is never below the others, the
 * parser checks it) and the larger map step. The Free boot eligibility check asks the WRITER bound (never only the
 * sealed one); the map bound is not checked at boot (POSITION can fall back; a recorded known limit, pre-flight PF-B22). */
export function debateShapeLargestBounds(policy: DebateShapePolicy): Readonly<{ writer: number; map: number }> {
  return Object.freeze({ writer: policy.answerLength.detailed.writerBound, map: Math.max(policy.mapStepBounds.merge, policy.mapStepBounds.choose) });
}

/**
 * The answer writer's ceiling the Free answer-job eligibility check asks (pre-flight PF-B22), at the API boot and at
 * the hosted publish alike: the sealed writer bound with no row in force, else the larger of it and the row's largest
 * writer bound (a Free `detailed` answer asks that much, and Free's writer has no fallback).
 */
export function debateShapeWriterCeiling(sealedWriterBound: number, policyInForce: DebateShapePolicy | null): number {
  return policyInForce === null ? sealedWriterBound : Math.max(sealedWriterBound, debateShapeLargestBounds(policyInForce).writer);
}

/** The canonical AST: every number a DECIMAL node (integers and the six-decimal shares alike). */
function shapeAst(value: unknown): CanonicalJsonAst {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") return canonicalDecimal(String(value));
  return Object.freeze(Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, inner]) => [key, shapeAst(inner)])
  ));
}

/** The row a publisher seals (the preview's v2 kit; the hosted file's optional member), re-checked by the parser. */
export function debateShapePolicyRow(policy: DebateShapePolicy, sourceRef: string): Readonly<{
  rowKey: typeof DEBATE_SHAPE_POLICY_ROW_KEY; valueJsonText: CanonicalRegisterJson; sourceRef: string;
}> {
  if (typeof sourceRef !== "string" || sourceRef.trim() === "") return invalid("sourceRef");
  const checked = parseDebateShapePolicy(policy);
  return Object.freeze({ rowKey: DEBATE_SHAPE_POLICY_ROW_KEY, valueJsonText: canonicalRegisterJson(shapeAst(checked)), sourceRef });
}

/** The owners' start values (rulings S5-S8; answer words OVERVIEW C-1); `opening` is the Phase 1 pick (ruling S1: the angle map). */
export function debateShapePolicyStartValues(opening: DebateShapeOpening = "ANGLE_MAP"): DebateShapePolicy {
  const premiumScrutiny = {
    deep: { roundsPerPoint: 2, pointsPerDebate: 6 },
    exhaustive: { roundsPerPoint: 3, pointsPerDebate: 15 },
    scrutinyLeverageMin: 0.05,
    scrutinyWeakBelow: 0.5
  };
  const premium = (mapAIs: number, answers: number) => ({
    mapAIs, answers, graders: 3, pointsPerAnswer: 4, deeperTopPoints: 2, gapRoundsMax: 2, closeCallExtraGraders: 2,
    fixedDepthAllowed: true, scrutiny: premiumScrutiny, opening
  });
  return parseDebateShapePolicy({
    kind: "DEBATE_SHAPE_POLICY",
    version: 1,
    plans: {
      free: {
        mapAIs: 3, answers: 3, graders: 2, pointsPerAnswer: 3, deeperTopPoints: 1, gapRoundsMax: 1, closeCallExtraGraders: 2,
        fixedDepthAllowed: false,
        scrutiny: { deep: null, exhaustive: null, scrutinyLeverageMin: 0.05, scrutinyWeakBelow: 0.5 },
        opening
      },
      plus: premium(4, 3),
      pro: premium(5, 4),
      max: premium(7, 4),
      premium: premium(5, 4)
    },
    // OVERVIEW C-1 / engine INTERFACE §4.1 (owner G5): the answer writer's words are the length row's start words, one
    // vocabulary (200 / 350 / 1,000); the writer bounds are unchanged. A sealed version keeps its own words: start
    // values seed only new versions.
    answerLength: {
      short: { words: LENGTH_GUIDANCE_START.answerWriterWords.short, writerBound: 8192 },
      standard: { words: LENGTH_GUIDANCE_START.answerWriterWords.standard, writerBound: 12288 },
      detailed: { words: LENGTH_GUIDANCE_START.answerWriterWords.detailed, writerBound: 16384 }
    },
    mapStepBounds: mapStepBoundsStartValues()
  });
}

/** INTERFACE §1: the run's plan id when billing is on, else the tier (free -> free, premium -> premium). */
export function debateShapePlanKeyOf(planId: PlanId | null, planTier: PlanTier): DebateShapePlanKey {
  if (planId !== null) {
    switch (planId) {
      case "FREE": return "free";
      case "PLUS": return "plus";
      case "PRO": return "pro";
      case "MAX": return "max";
      default: return exhaustive(planId);
    }
  }
  switch (planTier) {
    case "free": return "free";
    case "premium": return "premium";
    default: return exhaustive(planTier);
  }
}

function scrutinyBudgetOf(plan: DebateShapePlan, scrutiny: Scrutiny): DebateShapeScrutinyBudget | null {
  switch (scrutiny) {
    case "standard": return Object.freeze({ roundsPerPoint: 0, pointsPerDebate: 0 });
    case "deep": return plan.scrutiny.deep;
    case "exhaustive": return plan.scrutiny.exhaustive;
    default: return exhaustive(scrutiny);
  }
}

/** Ruling S6 (controller ruling PF9): with the row present, Free is adaptive with this depth ceiling, billing on or off. */
const FREE_SHAPE_DEPTH_CEILING = 2;

/**
 * The plan's normalisation (spec §3.2). With the row: fixed -> adaptive where the plan does not allow it, a scrutiny
 * the plan has no budget for -> standard, Free's depth capped at its ceiling (ruling S6), and every key written in one
 * order. Without it: `{ depth }` exactly (the same object for a depth-only ask), so nothing a client sends can change
 * today's stored bytes and the depth is untouched. Length guidance (spec 2026-10-15 §3.1): with the shape row absent and
 * the length row in force, `{ depth, answerLength }` exactly, in that order (the answer length is the one setting the
 * length row reads). With billing on, billing's Free gauge sets the depth first; this ceiling can only lower it.
 * V4 reading level (owner N6, 2026-10-29): an asked `readingLevel` is kept, last, in every branch; it is no shape setting
 * and no row changes it. An ask without one is normalised exactly as before (the same object for `{ depth }`).
 */
export function normaliseDepthParamsForShape(depthParams: DepthParams, policy: DebateShapePolicy | null, plan: DebateShapePlanKey,
  lengthPolicy: LengthGuidancePolicy | null = null): DepthParams {
  const readingLevel = readingLevelOf(depthParams);
  const level = readingLevel === null ? {} : { readingLevel };
  if (policy === null) {
    if (lengthPolicy !== null) {
      return Object.freeze({ depth: depthParams.depth, answerLength: debateShapeSettingsOf(depthParams).answerLength, ...level });
    }
    return Object.keys(depthParams).length === 1 + Object.keys(level).length
      ? depthParams : Object.freeze({ depth: depthParams.depth, ...level });
  }
  const rules = policy.plans[plan];
  const asked = debateShapeSettingsOf(depthParams);
  const depth = plan === "free" ? Math.min(depthParams.depth, FREE_SHAPE_DEPTH_CEILING) : depthParams.depth;
  const depthMode: DepthMode = asked.depthMode === "fixed" && !rules.fixedDepthAllowed ? "adaptive" : asked.depthMode;
  const scrutiny: Scrutiny = scrutinyBudgetOf(rules, asked.scrutiny) === null ? "standard" : asked.scrutiny;
  return Object.freeze({ depth, depthMode, scrutiny, answerLength: asked.answerLength, ...level });
}

const notNormalised = (key: string): never => { throw new TypeError(`DEBATE_SHAPE_SETTINGS_NOT_NORMALISED:${key}`); };

/**
 * The sizes for `makers` distinct makers (INTERFACE §1): answers <= makers, map AIs <= makers, graders <= makers - 1 and
 * the close-call extras only from makers not already grading. Fewer than two makers: null (today's single position).
 * The settings must already be normalised for `plan`; an un-normalised one is an engine fault, never a silent fix.
 */
export function resolveDebateShape(input: Readonly<{
  policy: DebateShapePolicy; plan: DebateShapePlanKey; makers: number; settings: DebateShapeSettings;
}>): DebateShapeCeilingInput | null {
  if (!Number.isSafeInteger(input.makers) || input.makers < 1) throw new TypeError("DEBATE_SHAPE_MAKERS_INVALID");
  if (input.makers < 2) return null;
  const rules = input.policy.plans[input.plan];
  const { depthMode, scrutiny, answerLength } = input.settings;
  if (depthMode === "fixed" && !rules.fixedDepthAllowed) return notNormalised("depthMode");
  const budget = scrutinyBudgetOf(rules, scrutiny) ?? notNormalised("scrutiny");
  const graders = Math.min(rules.graders, input.makers - 1);
  const length = input.policy.answerLength[answerLength];
  return Object.freeze({
    plan: input.plan,
    depthMode,
    scrutiny,
    answerLength,
    mapAIs: Math.min(rules.mapAIs, input.makers),
    answers: Math.min(rules.answers, input.makers),
    graders,
    pointsPerAnswer: rules.pointsPerAnswer,
    deeperTopPoints: rules.deeperTopPoints,
    gapRounds: rules.gapRoundsMax,
    closeCallExtraGraders: Math.min(rules.closeCallExtraGraders, input.makers - 1 - graders),
    scrutinyRoundsPerPoint: budget.roundsPerPoint,
    scrutinyPointsPerDebate: budget.pointsPerDebate,
    scrutinyLeverageMin: rules.scrutiny.scrutinyLeverageMin,
    scrutinyWeakBelow: rules.scrutiny.scrutinyWeakBelow,
    opening: rules.opening,
    answerWords: length.words,
    writerBound: length.writerBound,
    mapMergeBound: input.policy.mapStepBounds.merge,
    mapChooseBound: input.policy.mapStepBounds.choose
  });
}
