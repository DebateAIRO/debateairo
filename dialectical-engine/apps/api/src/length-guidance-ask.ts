import { debateShapeSettingsOf, type DepthParams } from "@debateai/contract";
import {
  lengthAnswerWordsOf, resolveLengthGuidance, type DebateShapePlanKey, type DebateShapePolicy, type LengthGuidance,
  type LengthGuidancePolicy, type LengthLevels
} from "@debateai/register";

/**
 * Length guidance (spec 2026-10-15 §3.1): the debate's numbers for its plan key and its (already normalised) answer-length
 * choice, frozen on its receipt by the composition; null without the row, so the receipt keeps today's bytes. Called
 * where `debateShapeForPanel` is, with the same plan key.
 */
export function lengthGuidanceForAsk(
  policy: LengthGuidancePolicy | undefined, depthParams: DepthParams, plan: DebateShapePlanKey
): LengthGuidance | null {
  return policy === undefined ? null
    : resolveLengthGuidance({ policy, plan, answerLength: debateShapeSettingsOf(depthParams).answerLength });
}

/**
 * The answer writer's three targets the /new page shows for a plan (spec §3.8): the length row's, else the shape row's
 * answer lengths, else null (the page shows its own fallback numbers).
 */
export function lengthAnswerWordsFor(
  lengthPolicy: LengthGuidancePolicy | undefined, shapePolicy: DebateShapePolicy | undefined, plan: DebateShapePlanKey
): LengthLevels | null {
  if (lengthPolicy !== undefined) return lengthAnswerWordsOf(lengthPolicy, plan);
  if (shapePolicy === undefined) return null;
  const { short, standard, detailed } = shapePolicy.answerLength;
  return Object.freeze({ short: short.words, standard: standard.words, detailed: detailed.words });
}
