import { debateShapeSettingsOf, type DepthParams } from "@debateai/contract";
import type { RunShapeClass } from "@debateai/budget";
import type { DebateShapePlanKey } from "@debateai/register";

/**
 * Debate shape (spec 2026-10-12 §3.6): an ask's or run's shape class for the history estimate. Present exactly when
 * its depth_params carries the settings, which the API writes only while the register's row is in force (Task 8).
 */
export function runShapeClassOf(depthParams: DepthParams, plan: DebateShapePlanKey): RunShapeClass | null {
  if (depthParams.depthMode === undefined) return null;
  return Object.freeze({ plan, ...debateShapeSettingsOf(depthParams) });
}
