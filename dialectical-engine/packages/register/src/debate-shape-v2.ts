import { z } from "zod";
import { AnswerLengthSchema, DepthModeSchema, ScrutinySchema, START_PATHS_SOURCES, type StartPathsSource } from "@debateai/contract";
import { TypedDomainError } from "@debateai/kernel";
import {
  DEBATE_SHAPE_PLAN_KEYS, notNormalised, scrutinyBudgetOf, type DebateShapePlanKey, type DebateShapePolicy
} from "./debate-shape-policy.js";
import { PATH_REWRITE_POLICY } from "./story-policy.js";
import type { AnswerLength, DepthMode, Scrutiny } from "@debateai/contract";

/**
 * V4 start step, Task 12 (spec 2026-11-03 §4.3, §5): SHAPE RECEIPT V2, a path debate's frozen sizes. Each chosen path is
 * its own root, argued for and against from its angle, so the debate has one position per path and no cross replies.
 * The lists before Start are not the run's own calls (a menu's lists were written, and charged, before Start), except
 * when the run builds its own list (RUN_BUILT: an old page's ask on a v2 version): then its list writers, their merge
 * and its choose are counted here. Free and a dig have no gap round. Every path has its answer so far: a writer and a
 * checker per round, 2 rounds on a paid plan and 1 on Free (the path rewrite's rounds). R22.1's v1 schema refuses a v2
 * receipt (`version: 2`), so an older runner never claims a v2 run.
 */
export const DEBATE_SHAPE_V2_FORMULA_VERSION = "DR-185-shape-v2" as const;

export type DebateShapeV2Input = Readonly<{
  plan: DebateShapePlanKey;
  depthMode: DepthMode;
  scrutiny: Scrutiny;
  answerLength: AnswerLength;
  /** The chosen paths, 1..8 (b1..b8). */
  paths: number;
  pathsSource: StartPathsSource;
  /** RUN_BUILT only: the plan's list writers, never capped by the makers present (a company may write twice). */
  runListWriters: number;
  graders: number;
  pointsPerPath: number;
  deeperTopPoints: number;
  gapRounds: number;
  closeCallExtraGraders: number;
  scrutinyRoundsPerPoint: number;
  scrutinyPointsPerDebate: number;
  scrutinyLeverageMin: number;
  scrutinyWeakBelow: number;
  answerWords: number;
  writerBound: number;
  mapMergeBound: number;
}>;

export type DebateShapeV2SiteCounts = Readonly<{
  mapSites: number;
  positionNodes: number;
  pointNodes: number;
  deeperNodes: number;
  scrutinyNodes: number;
  nodes: number;
  pathOutcomeSites: number;
}>;

/**
 * The call sites: map = (RUN_BUILT: its list writers, their merge and the choose) + each gap round; nodes = one root
 * per path, its points, per deeper round a reply and a defence under its top points (adaptive) or every point (fixed),
 * and the scrutiny budget's exchanges; each path's answer so far, a writer and a checker per round.
 */
export function debateShapeSiteCountsV2(shape: DebateShapeV2Input, depth: number): DebateShapeV2SiteCounts {
  if (!Number.isSafeInteger(depth) || depth < 1) throw new TypeError("DEBATE_SHAPE_ROUNDS_INVALID");
  const mapSites = (shape.pathsSource === "RUN_BUILT" ? 2 + shape.runListWriters : 0) + shape.gapRounds;
  const positionNodes = shape.paths;
  const pointNodes = shape.paths * shape.pointsPerPath;
  const pointsPerDeeperRound = shape.depthMode === "fixed" ? shape.pointsPerPath : shape.deeperTopPoints;
  const deeperNodes = (depth - 1) * 2 * shape.paths * pointsPerDeeperRound;
  const scrutinyNodes = 2 * shape.scrutinyRoundsPerPoint * shape.scrutinyPointsPerDebate;
  const outcomeRounds = shape.plan === "free" ? PATH_REWRITE_POLICY.freeMaxRounds : PATH_REWRITE_POLICY.maxRounds;
  return Object.freeze({
    mapSites, positionNodes, pointNodes, deeperNodes, scrutinyNodes,
    nodes: positionNodes + pointNodes + deeperNodes + scrutinyNodes,
    pathOutcomeSites: shape.paths * 2 * outcomeRounds
  });
}

/** Admission's v2 shape must fit the panel it was resolved for and its own rules; paths are not bounded by the panel. */
export function assertDebateShapeV2Input(shape: DebateShapeV2Input, panelSize: number): void {
  const refuse = (what: string): never => {
    throw new TypedDomainError("STRUCTURAL_CEILING_SHAPE_INVALID", `The debate shape's ${what} does not fit the admitted panel`);
  };
  const whole = (value: number, min: number, max = Number.MAX_SAFE_INTEGER): boolean => Number.isSafeInteger(value) && value >= min && value <= max;
  if (!whole(panelSize, 2)) refuse("panel");
  if (!whole(shape.paths, 1, 8)) refuse("paths");
  if (!(START_PATHS_SOURCES as readonly string[]).includes(shape.pathsSource)) refuse("paths source");
  const builtByRun = shape.pathsSource === "RUN_BUILT";
  if (!whole(shape.runListWriters, builtByRun ? 1 : 0, builtByRun ? 9 : 0)) refuse("list writers");
  if (!whole(shape.graders, 1) || !whole(shape.closeCallExtraGraders, 0)
    || shape.graders + shape.closeCallExtraGraders > panelSize - 1) refuse("graders");
  if (!whole(shape.pointsPerPath, 1) || !whole(shape.deeperTopPoints, 1) || !whole(shape.gapRounds, 0)) refuse("points");
  if ((shape.plan === "free" || shape.pathsSource === "DIG_PICKS") && shape.gapRounds !== 0) refuse("gap rounds");
  const noScrutiny = shape.scrutinyRoundsPerPoint === 0;
  if (!whole(shape.scrutinyRoundsPerPoint, 0) || !whole(shape.scrutinyPointsPerDebate, 0)
    || noScrutiny !== (shape.scrutinyPointsPerDebate === 0) || noScrutiny !== (shape.scrutiny === "standard")) refuse("scrutiny budget");
  if (!whole(shape.answerWords, 1) || !whole(shape.writerBound, 1)) refuse("answer length");
  if (!whole(shape.mapMergeBound, 1)) refuse("map step bounds");
  if (!DepthModeSchema.safeParse(shape.depthMode).success || !ScrutinySchema.safeParse(shape.scrutiny).success
    || !AnswerLengthSchema.safeParse(shape.answerLength).success
    || !(DEBATE_SHAPE_PLAN_KEYS as readonly string[]).includes(shape.plan)) refuse("settings");
}

/** A share from 0 to 1 that names itself when refused. */
const share = (name: string) => {
  const error = `${name} must be a share from 0 to 1`;
  return z.number({ error }).min(0, { error }).max(1, { error });
};
/** The receipt's `shape` member, version 2: the run's frozen sizes and the site counts it was billed for. */
export const debateShapeReceiptV2Schema = z.object({
  version: z.literal(2),
  plan: z.enum(DEBATE_SHAPE_PLAN_KEYS),
  depth_mode: DepthModeSchema,
  scrutiny: ScrutinySchema,
  answer_length: AnswerLengthSchema,
  paths: z.number().int().min(1).max(8),
  paths_source: z.enum(START_PATHS_SOURCES),
  run_list_writers: z.number().int().min(0).max(9),
  graders: z.number().int().min(1),
  points_per_path: z.number().int().min(1),
  deeper_top_points: z.number().int().min(1),
  gap_rounds: z.number().int().min(0),
  close_call_extra_graders: z.number().int().min(0),
  scrutiny_rounds_per_point: z.number().int().min(0),
  scrutiny_points_per_debate: z.number().int().min(0),
  scrutiny_leverage_min: share("scrutiny_leverage_min"),
  scrutiny_weak_below: share("scrutiny_weak_below"),
  answer_words: z.number().int().positive(),
  writer_bound: z.number().int().positive(),
  map_sites: z.number().int().min(0),
  nodes: z.number().int().min(1),
  path_outcome_sites: z.number().int().min(2),
  backup_sequences: z.literal(0),
  map_merge_bound: z.number().int().positive()
}).strict();
export type DebateShapeReceiptV2 = z.infer<typeof debateShapeReceiptV2Schema>;

/** The receipt member, parsed with its own schema before it is handed back: one the parser would refuse is never minted. */
export function debateShapeReceiptV2(shape: DebateShapeV2Input, counts: DebateShapeV2SiteCounts, backupSequences: 0): DebateShapeReceiptV2 {
  const receipt: DebateShapeReceiptV2 = Object.freeze({
    version: 2 as const,
    plan: shape.plan,
    depth_mode: shape.depthMode,
    scrutiny: shape.scrutiny,
    answer_length: shape.answerLength,
    paths: shape.paths,
    paths_source: shape.pathsSource,
    run_list_writers: shape.runListWriters,
    graders: shape.graders,
    points_per_path: shape.pointsPerPath,
    deeper_top_points: shape.deeperTopPoints,
    gap_rounds: shape.gapRounds,
    close_call_extra_graders: shape.closeCallExtraGraders,
    scrutiny_rounds_per_point: shape.scrutinyRoundsPerPoint,
    scrutiny_points_per_debate: shape.scrutinyPointsPerDebate,
    scrutiny_leverage_min: shape.scrutinyLeverageMin,
    scrutiny_weak_below: shape.scrutinyWeakBelow,
    answer_words: shape.answerWords,
    writer_bound: shape.writerBound,
    map_sites: counts.mapSites,
    nodes: counts.nodes,
    path_outcome_sites: counts.pathOutcomeSites,
    backup_sequences: backupSequences,
    map_merge_bound: shape.mapMergeBound
  });
  const parsed = debateShapeReceiptV2Schema.safeParse(receipt);
  if (!parsed.success) {
    throw new TypedDomainError("STRUCTURAL_CEILING_SHAPE_INVALID", "The debate shape's receipt does not parse: "
      + parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "));
  }
  return receipt;
}

/** The sizes a v2 run was admitted with, read back from its receipt (the runner's source of truth). */
export function debateShapeV2OfReceipt(receipt: DebateShapeReceiptV2): DebateShapeV2Input {
  return Object.freeze({
    plan: receipt.plan,
    depthMode: receipt.depth_mode,
    scrutiny: receipt.scrutiny,
    answerLength: receipt.answer_length,
    paths: receipt.paths,
    pathsSource: receipt.paths_source,
    runListWriters: receipt.run_list_writers,
    graders: receipt.graders,
    pointsPerPath: receipt.points_per_path,
    deeperTopPoints: receipt.deeper_top_points,
    gapRounds: receipt.gap_rounds,
    closeCallExtraGraders: receipt.close_call_extra_graders,
    scrutinyRoundsPerPoint: receipt.scrutiny_rounds_per_point,
    scrutinyPointsPerDebate: receipt.scrutiny_points_per_debate,
    scrutinyLeverageMin: receipt.scrutiny_leverage_min,
    scrutinyWeakBelow: receipt.scrutiny_weak_below,
    answerWords: receipt.answer_words,
    writerBound: receipt.writer_bound,
    mapMergeBound: receipt.map_merge_bound
  });
}

/** Whether a structural basis is a v2 shape receipt: its formula and a `shape` member its own schema accepts. */
export function isShapeReceiptV2(basis: Readonly<Record<string, unknown>>): boolean {
  return basis.formula_version === DEBATE_SHAPE_V2_FORMULA_VERSION && debateShapeReceiptV2Schema.safeParse(basis.shape).success;
}

/**
 * The sizes of one path debate for `makers` distinct makers: graders <= makers - 1, the close-call extras only from
 * makers not already grading; the list writers (RUN_BUILT only) are the plan's, never capped by the makers; no gap
 * round on Free or for a dig. The settings must already be normalised for `plan`.
 */
export function resolveDebateShapeV2(policy: DebateShapePolicy, plan: DebateShapePlanKey,
  ask: Readonly<{ depthMode: DepthMode; scrutiny: Scrutiny; answerLength: AnswerLength; paths: number; pathsSource: StartPathsSource }>,
  makers: number): DebateShapeV2Input {
  if (!Number.isSafeInteger(makers) || makers < 2) throw new TypeError("DEBATE_SHAPE_MAKERS_INVALID");
  if (!Number.isSafeInteger(ask.paths) || ask.paths < 1 || ask.paths > 8) throw new TypeError("DEBATE_SHAPE_PATHS_INVALID");
  const rules = policy.plans[plan];
  if (ask.depthMode === "fixed" && !rules.fixedDepthAllowed) return notNormalised("depthMode");
  const budget = scrutinyBudgetOf(rules, ask.scrutiny) ?? notNormalised("scrutiny");
  const graders = Math.min(rules.graders, makers - 1);
  const length = policy.answerLength[ask.answerLength];
  return Object.freeze({
    plan,
    depthMode: ask.depthMode,
    scrutiny: ask.scrutiny,
    answerLength: ask.answerLength,
    paths: ask.paths,
    pathsSource: ask.pathsSource,
    runListWriters: ask.pathsSource === "RUN_BUILT" ? rules.mapAIs : 0,
    graders,
    pointsPerPath: rules.pointsPerAnswer,
    deeperTopPoints: rules.deeperTopPoints,
    gapRounds: plan === "free" || ask.pathsSource === "DIG_PICKS" ? 0 : rules.gapRoundsMax,
    closeCallExtraGraders: Math.min(rules.closeCallExtraGraders, makers - 1 - graders),
    scrutinyRoundsPerPoint: budget.roundsPerPoint,
    scrutinyPointsPerDebate: budget.pointsPerDebate,
    scrutinyLeverageMin: rules.scrutiny.scrutinyLeverageMin,
    scrutinyWeakBelow: rules.scrutiny.scrutinyWeakBelow,
    answerWords: length.words,
    writerBound: length.writerBound,
    mapMergeBound: policy.mapStepBounds.merge
  });
}
