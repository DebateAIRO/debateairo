import {
  START_STEP_LIMITS, debateShapeSettingsOf, type AnswerLength, type AskRequest, type DepthMode, type DepthParams, type Scrutiny,
  type StartPathsSource
} from "@debateai/contract";
import type { RunShapeClass } from "@debateai/budget";
import {
  debateShapeStartStepOf, normaliseDepthParamsForShape, resolveDebateShape, resolveDebateShapeV2,
  type DebateShapeCeilingInput, type DebateShapePlanKey, type DebateShapePolicy, type DebateShapeV2Input, type DebateShapeWidths,
  type LengthGuidancePolicy
} from "@debateai/register";

/**
 * Debate shape (spec 2026-10-12 §3.6): an ask's or run's shape class for the history estimate. Present exactly when
 * its depth_params carries the settings, which the API writes only while the register's row is in force (Task 8).
 * V4 start step, Task 37: `paths`, a path debate's number of paths (shape receipt v2 only), joins the class; a path debate
 * always carries the settings (its switch lives in the shape row), so without them there is no class to join.
 */
export function runShapeClassOf(depthParams: DepthParams, plan: DebateShapePlanKey, paths?: number): RunShapeClass | null {
  if (depthParams.depthMode === undefined) return null;
  return Object.freeze({ plan, ...debateShapeSettingsOf(depthParams), ...(paths === undefined ? {} : { paths }) });
}

/**
 * The plan's normalisation applied to an ask (spec §3.2): the same object when nothing changes. Every ask the API
 * stores, prices or admits passes through here first, so its depth_params is `{ depth }` exactly (no row),
 * `{ depth, answerLength }` (the length row alone, spec 2026-10-15 §3.1) or `{ depth, depthMode, scrutiny, answerLength }`
 * (the shape row in force), never anything in between — each with the V4 reading level last when the ask carried one
 * (`readingLevel`, owner N6, 2026-10-29), which the runner reads back for the final writers.
 */
export function normaliseAskForDebateShape<T extends Pick<AskRequest, "depth_params">>(
  ask: T, policy: DebateShapePolicy | null, plan: DebateShapePlanKey, lengthPolicy: LengthGuidancePolicy | null = null
): T {
  const depthParams = normaliseDepthParamsForShape(ask.depth_params, policy, plan, lengthPolicy);
  return depthParams === ask.depth_params ? ask : Object.freeze({ ...ask, depth_params: depthParams }) as T;
}

/** The sizes `makers` distinct makers run under the row (null: no row, or one maker). Admission calls this per panel. */
export function debateShapeForPanel(
  policy: DebateShapePolicy | undefined, depthParams: DepthParams, plan: DebateShapePlanKey, makers: number
): DebateShapeCeilingInput | null {
  return policy === undefined ? null : resolveDebateShape({ policy, plan, makers, settings: debateShapeSettingsOf(depthParams) });
}

/**
 * V4 start step, Task 34 (spec 2026-11-03 §4.2, §5): what shape receipt v2 needs from an admitted ask's paths: how many
 * there are and where they came from (the person's menu, a dig's picks, or the run's own list when the ask carried none).
 */
export type AskStartShape = Readonly<{ paths: number; pathsSource: StartPathsSource }>;

/**
 * V4 start step, Task 34: what decides whether the start step runs for one ask: the version's shape row in force (null:
 * absent or switched off), whether its engine-2 row is in force, whether its model scorecard is VALID, and whether the
 * ask has a signed-in person (a server principal).
 */
export type StartStepGate = Readonly<{
  policy: DebateShapePolicy | null;
  engineInForce: boolean;
  scorecardInForce: boolean;
  serverPrincipal: boolean;
}>;

/**
 * THE ONE V2 PREDICATE (V4 start step, Task 34): the plan's widths when the start step runs for this ask, else null. It
 * runs only with the switch on for the plan (`debateShapeStartStepOf`, Free capped at 3 paths), engine 2 in force, no
 * VALID scorecard (receipt v2 pins backup 0, and the picker's admission may seat a runner-up) and a signed-in person.
 * Admission adds the rule's second half: two makers or more on the panel (`askShapesForPanel`); with one, today's receipt.
 */
export function startStepWidthsFor(gate: StartStepGate, plan: DebateShapePlanKey): DebateShapeWidths | null {
  if (gate.policy === null || !gate.engineInForce || gate.scorecardInForce || !gate.serverPrincipal) return null;
  return debateShapeStartStepOf(gate.policy, plan);
}

/** How many paths a run builds itself (RUN_BUILT: an old page's ask on a v2 version): the default width, Free at most 3. */
export function startRunBuiltPaths(widths: DebateShapeWidths, plan: DebateShapePlanKey): number {
  return plan === "free" ? Math.min(widths.default, START_STEP_LIMITS.freePathsMax) : widths.default;
}

/**
 * The ask's start shape: null when the step does not run for it (no widths); the verified paths' count and source when
 * the ask carried them (their check against How wide is the verifier's, Task 33); else the run builds its own list at
 * the default width (RUN_BUILT).
 */
export function askStartShapeOf(widths: DebateShapeWidths | null, plan: DebateShapePlanKey,
  verified: Readonly<{ source: "MENU" | "DIG_PICKS"; paths: readonly unknown[] }> | null): AskStartShape | null {
  if (widths === null) return null;
  if (verified === null) return Object.freeze({ paths: startRunBuiltPaths(widths, plan), pathsSource: "RUN_BUILT" as const });
  return Object.freeze({ paths: verified.paths.length, pathsSource: verified.source });
}

/**
 * The sizes one panel runs, as admission resolves them for each panel: with a start and two makers or more, receipt v2's
 * (`resolveDebateShapeV2`) and never today's shape; otherwise today's (`debateShapeForPanel`) and no v2. A start on a
 * one-maker panel is dropped: that debate is today's single position, as it is without the row.
 */
export function askShapesForPanel(
  policy: DebateShapePolicy | null | undefined, depthParams: DepthParams, plan: DebateShapePlanKey, makers: number, start: AskStartShape | null
): Readonly<{ shape: DebateShapeCeilingInput | null; shapeV2: DebateShapeV2Input | null }> {
  const row = policy ?? undefined;
  if (start !== null && row !== undefined && makers >= 2) {
    const shapeV2 = resolveDebateShapeV2(row, plan,
      { ...debateShapeSettingsOf(depthParams), paths: start.paths, pathsSource: start.pathsSource }, makers);
    return Object.freeze({ shape: null, shapeV2 });
  }
  return Object.freeze({ shape: debateShapeForPanel(row, depthParams, plan, makers), shapeV2: null });
}

/** GET /v1/asks/room: the query's settings as the depth_params an ask would carry (only the ones it carries). */
export function roomDepthParams(query: Readonly<{
  depth: number; depth_mode?: DepthMode | undefined; scrutiny?: Scrutiny | undefined; answer_length?: AnswerLength | undefined;
}>): DepthParams {
  return Object.freeze({
    depth: query.depth,
    ...(query.depth_mode === undefined ? {} : { depthMode: query.depth_mode }),
    ...(query.scrutiny === undefined ? {} : { scrutiny: query.scrutiny }),
    ...(query.answer_length === undefined ? {} : { answerLength: query.answer_length })
  });
}
