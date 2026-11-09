import type { PathGapRound } from "@debateai/contract";
import type { StoredPathViewpoint, StoredStartPathSet } from "@debateai/db";
import { START_STEP_LIMITS, type PathId } from "@debateai/kernel";
import { debateShapeSiteCountsV2, type DebateShapeCeilingInput, type DebateShapeV2Input } from "@debateai/register";
import { shapeRunnableLegs, type ShapeLeg, type ShapePlan, type ShapePointSpec, type ShapePositionPlan } from "./shape-plan.js";

/**
 * V4 start step, Task 45 (spec 2026-11-03 §4.3, option A) — A PATH DEBATE'S PLAN, pure. Each chosen path (b1..b8, in the
 * person's order) is its own root: one AI writes what the path's angle shows about the question and where it comes out,
 * and other companies' AIs argue for and against it with today's legs, each built on one of the path's considerations
 * (its viewpoints, then the gap round's points raised for it). Paths are not rivals, so the plan has no cross-replies
 * (`buildShapePlan(…, cross: false)`), and one path is a whole plan. The receipt v2 (`DR-185-shape-v2`) priced it; the
 * runner argues it through today's shape code, so its sizes are read as a shape (`shapeViewOfV2`) and the plan is checked
 * against what was priced before any call (`pathPlanFitsReceipt`).
 */
export const PATH_ROOT_LIMITS = Object.freeze({
  /** The gap round's points a path's root writer is told, at most. */
  gapPointsPerPathMax: 8,
  /** The root writer's path material (title, question, viewpoints and points raised together), in UTF-16 code units. */
  materialMaxChars: 9_152
});

/** One path as the run argues it: the stored path, and the gap round's points raised for it, in their order. */
export type PathsRunPath = Readonly<{
  pathNo: number; pathId: PathId; title: string; question: string;
  viewpoints: readonly StoredPathViewpoint[]; ownWords: readonly string[]; gapPoints: readonly string[];
}>;

/** The run's paths in their order (b1 first), each with the gap round's points for it; a point for no path goes to none. */
export function pathsRunPathsOf(set: StoredStartPathSet, gap: PathGapRound | null): readonly PathsRunPath[] {
  const points = gap?.points ?? [];
  return Object.freeze([...set.paths].sort((left, right) => left.pathNo - right.pathNo).map((path): PathsRunPath => Object.freeze({
    pathNo: path.pathNo, pathId: path.pathId, title: path.title, question: path.question,
    viewpoints: path.viewpoints, ownWords: path.ownWords,
    gapPoints: Object.freeze(points.filter((point) => point.path_id === path.pathId).map((point) => point.text))
  })));
}

/** A viewpoint as one line: "<title>: <question>"; the person's own view (or a viewpoint without a title) is its text alone. */
const viewpointLine = (viewpoint: StoredPathViewpoint): string =>
  viewpoint.own || viewpoint.title === null ? viewpoint.question : `${viewpoint.title}: ${viewpoint.question}`;

/** What a path's legs are built on, in order: its viewpoints, then the gap round's points raised for it. */
export function pathConsiderationsOf(path: PathsRunPath): readonly string[] {
  return Object.freeze([...path.viewpoints.map(viewpointLine), ...path.gapPoints]);
}

/** Round 1 of a path: K legs, against first and alternating, the i-th built on the i-th consideration (none past the last). */
export function pathRoundOnePoints(considerations: readonly string[], k: number): readonly ShapePointSpec[] {
  if (!Number.isSafeInteger(k) || k < 0) throw new TypeError("PATH_ROUND_ONE_POINTS_INVALID");
  return Object.freeze(Array.from({ length: k }, (_point, at): ShapePointSpec => Object.freeze({
    polarity: at % 2 === 0 ? "attack" : "support", consideration: considerations[at] ?? null, keyPointId: null })));
}

/**
 * The paths as positions: the path's id and question, no map points, K legs each. A path has no rival, so its rival is
 * itself: a plan built with cross-replies refuses these positions (SHAPE_PLAN_RIVAL_INVALID), never answers one path
 * with another.
 */
export function shapePositionsFromPaths(paths: readonly PathsRunPath[], pointsPerPath: number): readonly ShapePositionPlan[] {
  return Object.freeze(paths.map((path, index): ShapePositionPlan => Object.freeze({
    answerId: path.pathId, statement: path.question, mapPoints: null,
    points: pathRoundOnePoints(pathConsiderationsOf(path), pointsPerPath), rivalIndex: index
  })));
}

/** A cut that never splits a surrogate pair: at most `room` code units, the last one "…" when anything was cut. */
function cutLine(line: string, room: number): string {
  if (line.length <= room) return line;
  if (room < 1) return "";
  let end = room - 1;
  const last = line.charCodeAt(end - 1);
  if (end > 0 && last >= 0xd800 && last <= 0xdbff) end -= 1;
  return `${line.slice(0, end)}…`;
}

/**
 * The lines cut to fit `room` code units joined by "\n": the largest cap every line can keep, the longest lines cut to it
 * first (a short line keeps its words). Lines that already fit come back as they are.
 */
function fitLines(lines: readonly string[], room: number): readonly string[] {
  const joined = lines.reduce((sum, line) => sum + line.length, 0) + Math.max(0, lines.length - 1);
  if (joined <= room) return lines;
  let left = room - Math.max(0, lines.length - 1);
  const lengths = lines.map((line) => line.length).sort((low, high) => low - high);
  let cap = 0;
  for (let at = 0; at < lengths.length; at += 1) {
    const share = Math.floor(Math.max(0, left) / (lengths.length - at));
    if (lengths[at]! > share) { cap = share; break; }
    left -= lengths[at]!;
  }
  return Object.freeze(lines.map((line) => cutLine(line, cap)));
}

/**
 * The root writer's path material: its title and question, one line per viewpoint ("<title>: <question>", the person's
 * own text alone) and one line per gap point raised for it (at most `gapPointsPerPathMax`). Over `materialMaxChars`, the
 * gap points go from the end first, then the viewpoint lines are cut at code-point edges with "…".
 */
export function pathRootLegMaterial(path: PathsRunPath): Readonly<{ pathTitle: string; pathQuestion: string; viewpoints: string; pointsRaised: string }> {
  const max = PATH_ROOT_LIMITS.materialMaxChars;
  const fixed = path.title.length + path.question.length;
  const lines = path.viewpoints.map(viewpointLine);
  const points = path.gapPoints.slice(0, PATH_ROOT_LIMITS.gapPointsPerPathMax);
  const size = (): number => fixed + lines.join("\n").length + points.join("\n").length;
  while (size() > max && points.length > 0) points.pop();
  const viewpoints = size() > max ? fitLines(lines, max - fixed) : lines;
  return Object.freeze({ pathTitle: path.title, pathQuestion: path.question, viewpoints: viewpoints.join("\n"), pointsRaised: points.join("\n") });
}

/** The root seats of a run with `paths` paths: the ordered seats in turn, again from the first when paths outnumber them. */
export function pathRootSeats<T>(ordered: readonly T[], paths: number): readonly T[] {
  if (ordered.length === 0 || !Number.isSafeInteger(paths) || paths < 1 || paths > START_STEP_LIMITS.storedPathsMax) {
    throw new TypeError("PATH_ROOT_SEATS_INVALID");
  }
  return Object.freeze(Array.from({ length: paths }, (_seat, index) => ordered[index % ordered.length]!));
}

/**
 * A v2 receipt's sizes as the shape the runner argues with: each path an answer, its points per path the points per
 * answer, the list writers (RUN_BUILT; never fewer than the shape's two) as the map's AIs, the angle map as the opening,
 * and the merge bound for the choose (a path run has no choose of its own).
 */
export function shapeViewOfV2(v2: DebateShapeV2Input): DebateShapeCeilingInput {
  return Object.freeze({
    plan: v2.plan, depthMode: v2.depthMode, scrutiny: v2.scrutiny, answerLength: v2.answerLength,
    mapAIs: Math.max(2, v2.runListWriters), answers: v2.paths, graders: v2.graders, pointsPerAnswer: v2.pointsPerPath,
    deeperTopPoints: v2.deeperTopPoints, gapRounds: v2.gapRounds, closeCallExtraGraders: v2.closeCallExtraGraders,
    scrutinyRoundsPerPoint: v2.scrutinyRoundsPerPoint, scrutinyPointsPerDebate: v2.scrutinyPointsPerDebate,
    scrutinyLeverageMin: v2.scrutinyLeverageMin, scrutinyWeakBelow: v2.scrutinyWeakBelow, opening: "ANGLE_MAP",
    answerWords: v2.answerWords, writerBound: v2.writerBound, mapMergeBound: v2.mapMergeBound, mapChooseBound: v2.mapMergeBound
  });
}

/**
 * Whether a path plan stays inside what its receipt priced (`debateShapeSiteCountsV2` at `depth`): one root per path, no
 * cross-reply, no leg deeper than the depth, and its runnable points, deeper legs and scrutiny slots each within their
 * site, counted from the plan's own legs (`shapeRunnableLegs`), never from a formula.
 */
export function pathPlanFitsReceipt(plan: ShapePlan, v2: DebateShapeV2Input, depth: number): boolean {
  if (plan.rootCount !== v2.paths || plan.legs.some((leg) => leg.kind === "CROSS" || leg.round > depth)) return false;
  const priced = debateShapeSiteCountsV2(v2, depth);
  const runnable = shapeRunnableLegs(plan, depth, v2.depthMode, v2.deeperTopPoints);
  const count = (...kinds: readonly ShapeLeg["kind"][]): number => runnable.filter((leg) => kinds.includes(leg.kind)).length;
  return count("POINT") <= priced.pointNodes && count("REPLY", "DEFENCE") <= priced.deeperNodes
    && plan.scrutiny.count <= priced.scrutinyNodes && plan.rootCount + runnable.length + plan.scrutiny.count <= priced.nodes;
}
