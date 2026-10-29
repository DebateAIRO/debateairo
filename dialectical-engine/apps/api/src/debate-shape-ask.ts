import { debateShapeSettingsOf, type AnswerLength, type AskRequest, type DepthMode, type DepthParams, type Scrutiny } from "@debateai/contract";
import type { RunShapeClass } from "@debateai/budget";
import {
  normaliseDepthParamsForShape, resolveDebateShape,
  type DebateShapeCeilingInput, type DebateShapePlanKey, type DebateShapePolicy, type LengthGuidancePolicy
} from "@debateai/register";

/**
 * Debate shape (spec 2026-10-12 §3.6): an ask's or run's shape class for the history estimate. Present exactly when
 * its depth_params carries the settings, which the API writes only while the register's row is in force (Task 8).
 */
export function runShapeClassOf(depthParams: DepthParams, plan: DebateShapePlanKey): RunShapeClass | null {
  if (depthParams.depthMode === undefined) return null;
  return Object.freeze({ plan, ...debateShapeSettingsOf(depthParams) });
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
