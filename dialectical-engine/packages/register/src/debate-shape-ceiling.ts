import { z } from "zod";
import { AnswerLengthSchema, DepthModeSchema, ScrutinySchema } from "@debateai/contract";
import { TypedDomainError } from "@debateai/kernel";
import { DEBATE_SHAPE_OPENINGS, DEBATE_SHAPE_PLAN_KEYS, type DebateShapeCeilingInput } from "./debate-shape-policy.js";

/** The receipt name of a ceiling minted for the debate shape (spec 2026-10-12 §3.6). */
export const DEBATE_SHAPE_FORMULA_VERSION = "DR-185-shape-v1" as const;

export type DebateShapeSiteCounts = Readonly<{
  mapSites: number;
  positionNodes: number;
  pointNodes: number;
  crossNodes: number;
  deeperNodes: number;
  scrutinyNodes: number;
  nodes: number;
}>;

/**
 * The shape's call sites (spec §3.6, contract deviations 4-5). Map: the angle planner, every list TWICE (a failed list
 * is handed to another seat under its own key), the merge, each gap round and the choose. Nodes: the P positions, K
 * points under each, one cross-reply each, then per deeper round a reply and a defence under X top points per position
 * (adaptive) or under every one of the K chosen points (fixed), and the scrutiny budget's exchanges.
 */
export function debateShapeSiteCounts(shape: DebateShapeCeilingInput, depth: number): DebateShapeSiteCounts {
  if (!Number.isSafeInteger(depth) || depth < 1) throw new TypeError("DEBATE_SHAPE_ROUNDS_INVALID");
  const mapSites = 3 + 2 * shape.mapAIs + shape.gapRounds;
  const positionNodes = shape.answers;
  const pointNodes = shape.answers * shape.pointsPerAnswer;
  const crossNodes = shape.answers;
  const pointsPerDeeperRound = shape.depthMode === "fixed" ? shape.pointsPerAnswer : shape.deeperTopPoints;
  const deeperNodes = (depth - 1) * 2 * shape.answers * pointsPerDeeperRound;
  const scrutinyNodes = 2 * shape.scrutinyRoundsPerPoint * shape.scrutinyPointsPerDebate;
  return Object.freeze({
    mapSites, positionNodes, pointNodes, crossNodes, deeperNodes, scrutinyNodes,
    nodes: positionNodes + pointNodes + crossNodes + deeperNodes + scrutinyNodes
  });
}

/** Admission's shape must fit the panel it was resolved for; anything else is refused before a ceiling is minted. */
export function assertDebateShapeCeilingInput(shape: DebateShapeCeilingInput, panelSize: number): void {
  const refuse = (what: string): never => {
    throw new TypedDomainError("STRUCTURAL_CEILING_SHAPE_INVALID", `The debate shape's ${what} does not fit the admitted panel`);
  };
  const whole = (value: number, min: number): boolean => Number.isSafeInteger(value) && value >= min;
  if (!whole(panelSize, 2)) refuse("panel");
  if (!whole(shape.mapAIs, 2) || shape.mapAIs > panelSize) refuse("map size");
  if (!whole(shape.answers, 2) || shape.answers > panelSize) refuse("answers");
  if (!whole(shape.graders, 1) || !whole(shape.closeCallExtraGraders, 0)
    || shape.graders + shape.closeCallExtraGraders > panelSize - 1) refuse("graders");
  if (!whole(shape.pointsPerAnswer, 1) || !whole(shape.deeperTopPoints, 1) || !whole(shape.gapRounds, 0)) refuse("points");
  const noScrutiny = shape.scrutinyRoundsPerPoint === 0;
  if (!whole(shape.scrutinyRoundsPerPoint, 0) || !whole(shape.scrutinyPointsPerDebate, 0)
    || noScrutiny !== (shape.scrutinyPointsPerDebate === 0) || noScrutiny !== (shape.scrutiny === "standard")) refuse("scrutiny budget");
  if (!whole(shape.answerWords, 1) || !whole(shape.writerBound, 1)) refuse("answer length");
  if (!DepthModeSchema.safeParse(shape.depthMode).success || !ScrutinySchema.safeParse(shape.scrutiny).success
    || !AnswerLengthSchema.safeParse(shape.answerLength).success
    || !(DEBATE_SHAPE_PLAN_KEYS as readonly string[]).includes(shape.plan)
    || !(DEBATE_SHAPE_OPENINGS as readonly string[]).includes(shape.opening)) refuse("settings");
}

const count = z.number().int().min(0);
/** A share from 0 to 1 that names itself when refused (a NaN, an Infinity or a null is refused too). */
const share = (name: string) => {
  const error = `${name} must be a share from 0 to 1`;
  return z.number({ error }).min(0, { error }).max(1, { error });
};
/** The receipt's `shape` member: the run's frozen sizes (contract deviation 3) and the site counts it was billed for. */
export const debateShapeReceiptSchema = z.object({
  version: z.literal(1),
  plan: z.enum(DEBATE_SHAPE_PLAN_KEYS),
  depth_mode: DepthModeSchema,
  scrutiny: ScrutinySchema,
  answer_length: AnswerLengthSchema,
  map_ais: z.number().int().min(2),
  answers: z.number().int().min(2),
  graders: z.number().int().min(1),
  points_per_answer: z.number().int().min(1),
  deeper_top_points: z.number().int().min(1),
  gap_rounds: count,
  close_call_extra_graders: count,
  scrutiny_rounds_per_point: count,
  scrutiny_points_per_debate: count,
  scrutiny_leverage_min: share("scrutiny_leverage_min"),
  scrutiny_weak_below: share("scrutiny_weak_below"),
  opening: z.enum(DEBATE_SHAPE_OPENINGS),
  answer_words: z.number().int().positive(),
  writer_bound: z.number().int().positive(),
  map_sites: z.number().int().positive(),
  nodes: z.number().int().positive(),
  cross_nodes: z.number().int().positive(),
  backup_sequences: z.union([z.literal(0), z.literal(1)])
}).strict();
export type DebateShapeReceipt = z.infer<typeof debateShapeReceiptSchema>;

/**
 * The receipt member, parsed with its OWN schema before it is handed back (T4-ABSORB a): a receipt the strict parser
 * would later refuse (`parseCostEnvelopeBasis`) is never minted, it is refused here, at admission, before any spend.
 */
export function debateShapeReceipt(shape: DebateShapeCeilingInput, counts: DebateShapeSiteCounts, backupSequences: 0 | 1): DebateShapeReceipt {
  const receipt: DebateShapeReceipt = Object.freeze({
    version: 1 as const,
    plan: shape.plan,
    depth_mode: shape.depthMode,
    scrutiny: shape.scrutiny,
    answer_length: shape.answerLength,
    map_ais: shape.mapAIs,
    answers: shape.answers,
    graders: shape.graders,
    points_per_answer: shape.pointsPerAnswer,
    deeper_top_points: shape.deeperTopPoints,
    gap_rounds: shape.gapRounds,
    close_call_extra_graders: shape.closeCallExtraGraders,
    scrutiny_rounds_per_point: shape.scrutinyRoundsPerPoint,
    scrutiny_points_per_debate: shape.scrutinyPointsPerDebate,
    scrutiny_leverage_min: shape.scrutinyLeverageMin,
    scrutiny_weak_below: shape.scrutinyWeakBelow,
    opening: shape.opening,
    answer_words: shape.answerWords,
    writer_bound: shape.writerBound,
    map_sites: counts.mapSites,
    nodes: counts.nodes,
    cross_nodes: counts.crossNodes,
    backup_sequences: backupSequences
  });
  const parsed = debateShapeReceiptSchema.safeParse(receipt);
  if (!parsed.success) {
    throw new TypedDomainError("STRUCTURAL_CEILING_SHAPE_INVALID", "The debate shape's receipt does not parse: "
      + parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "));
  }
  return receipt;
}

/** The sizes a run was admitted with, read back from its receipt (the runner's source of truth, P2b). */
export function debateShapeOfReceipt(receipt: DebateShapeReceipt): DebateShapeCeilingInput {
  return Object.freeze({
    plan: receipt.plan,
    depthMode: receipt.depth_mode,
    scrutiny: receipt.scrutiny,
    answerLength: receipt.answer_length,
    mapAIs: receipt.map_ais,
    answers: receipt.answers,
    graders: receipt.graders,
    pointsPerAnswer: receipt.points_per_answer,
    deeperTopPoints: receipt.deeper_top_points,
    gapRounds: receipt.gap_rounds,
    closeCallExtraGraders: receipt.close_call_extra_graders,
    scrutinyRoundsPerPoint: receipt.scrutiny_rounds_per_point,
    scrutinyPointsPerDebate: receipt.scrutiny_points_per_debate,
    scrutinyLeverageMin: receipt.scrutiny_leverage_min,
    scrutinyWeakBelow: receipt.scrutiny_weak_below,
    opening: receipt.opening,
    answerWords: receipt.answer_words,
    writerBound: receipt.writer_bound
  });
}

/** Whether a receipt provisions the runner-up's backup sequence: DR-184-v5, or a shape receipt that says so. */
export function structuralBasisProvisionsBackup(basis: Readonly<Record<string, unknown>>): boolean {
  if (basis.formula_version === "DR-184-v5") return true;
  if (basis.formula_version !== DEBATE_SHAPE_FORMULA_VERSION) return false;
  const shape = basis.shape;
  return typeof shape === "object" && shape !== null && (shape as { backup_sequences?: unknown }).backup_sequences === 1;
}
