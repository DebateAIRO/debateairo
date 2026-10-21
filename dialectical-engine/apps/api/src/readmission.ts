import { isDeepStrictEqual } from "node:util";
import { AskRequestSchema, type AskRequest } from "@debateai/contract";
import type { RunSettingsClass } from "@debateai/budget";
import type { StoredAsk } from "@debateai/db";
import { debateShapePlanKeyOf, type DebateShapePlanKey, type PlanId } from "@debateai/register";
import { runSettingsClassOfAsk } from "./ask-room.js";
import { normaliseAskForDebateShape } from "./debate-shape-ask.js";
import { AskRefusal, type PlannedAskAdmission, type RunCreationSettings } from "./index.js";

/**
 * Side-by-side uploads spec 2026-10-21 §4, O3 (Q1 → a; plan C task C10) — THE RE-ADMISSION PLAN. A debate that waited
 * in line across an upload was admitted by the previous release; it never runs on another release's settings (O1), so
 * the current release re-admits it as a NEW run (C11, `core.run_supersession`). Before anything is written, this plans
 * that new run from the old run's stored ask, under the current release: "the person's choices where the new version
 * still offers them, else please ask again".
 *
 *   1. The ask is rebuilt from the stored columns and the decrypted contract (`StoredAsk`). One that no longer parses as
 *      an ask is ASK_AGAIN.
 *   2. It is normalised for the current shape and length rows. A member the stored `depth_params` had that is now missing
 *      or different is a choice the new version no longer offers: ASK_AGAIN. A member the normaliser adds is a new
 *      default, kept.
 *   3. It is evaluated (`evaluate`: the waker passes `evaluationOrRefusal`). A refusal of the person's own choice
 *      (`READMISSION_CHOICE_REFUSALS`), or one that holds for as long as this version runs
 *      (`READMISSION_PERMANENT_REFUSALS`), is ASK_AGAIN; any other refusal (models busy, the daily envelope, the preview
 *      gate) is NOT_NOW and the run keeps its place in line; any other error is thrown.
 *   4. Otherwise READMIT, with the hold the picker planned (`pickedHoldMicros`, else null: the room's estimator) and
 *      the new ask's settings class.
 *
 * Nothing here writes, and nothing decides the question's language again (no fast call): the stored lock is carried
 * into the new run only when the new evaluation minted a shape (ruling L-SHAPED-ONLY, `readmittedAskContract`). The
 * plan is made only at the instant the waker's room says START (Q-11 stands for runs that are not re-admitted).
 */
export const READMISSION_CHOICE_REFUSALS: ReadonlySet<string> = new Set(["ASK_PLAN_TIER_INVALID"]);

/**
 * C10 review, item 3 — THE REFUSALS THAT DO NOT PASS. `evaluateAskAdmission` turns every typed failure into an
 * `AskRefusal`, so some refusals hold for as long as this version runs, whatever the waker's next tick sees: the depth
 * is above this version's sealed maximum, the debate costs more than this site allows for one debate, or this
 * version's own shape, length or engine rows cannot price it. The waiting line has no expiry of its own (0083, 0123
 * §4: a run waits until it starts, fails or is superseded), so as NOT_NOW such a run would be planned again, with its
 * probes, at every tick for ever. They are ASK_AGAIN instead: the person asks again, under what this version offers,
 * and nothing of their allowance was used. Every other refusal names something that passes (models busy or
 * unreachable, the day's envelope, the preview gate) and stays NOT_NOW.
 */
export const READMISSION_PERMANENT_REFUSALS: ReadonlySet<string> = new Set([
  "STRUCTURAL_CEILING_DEPTH_ABOVE_SEALED_MAXIMUM",
  "ASK_MODEL_STRENGTH_BUDGET_TOO_SMALL",
  "ENGINE_REQUIRES_LENGTH_POLICY",
  "STRUCTURAL_CEILING_ENGINE_INVALID",
  "STRUCTURAL_CEILING_TREE_INVALID"
]);

export type ReadmissionPlan =
  | Readonly<{ kind: "READMIT"; ask: AskRequest; shapePlan: DebateShapePlanKey; planId: PlanId | null;
      evaluation: PlannedAskAdmission; settingsClass: RunSettingsClass; holdMicros: number | null; stored: StoredAsk }>
  | Readonly<{ kind: "ASK_AGAIN" }>
  | Readonly<{ kind: "NOT_NOW"; code: string }>;

const ASK_AGAIN: ReadmissionPlan = Object.freeze({ kind: "ASK_AGAIN" });

/**
 * Step 1: the ask the run was stored with, as an `AskRequest`; null when it no longer parses as one.
 * C10 review, item 1: `core.run.tier_source` keeps the RESOLVED source, which is DEPLOYMENT_POLICY whenever the
 * deployment's risk tier outranked the asker's (`preserveSubmittedTierSource`), while an ask's source is only ASKER or
 * MACHINE_DEFAULT. The stored `asker_risk_tier` is the person's own tier, so a stored DEPLOYMENT_POLICY is read as
 * ASKER: the re-evaluation resolves DEPLOYMENT_POLICY again by itself for as long as the policy still outranks.
 */
function rebuiltAsk(stored: StoredAsk): AskRequest | null {
  const contract = stored.askContract;
  const parsed = AskRequestSchema.safeParse({
    question_line: stored.questionLine,
    risk_tier: stored.askerRiskTier,
    tier_source: stored.tierSource === "DEPLOYMENT_POLICY" ? "ASKER" : stored.tierSource,
    tier_provenance_ref: stored.tierProvenanceRef,
    composition_budget_tier: stored.compositionBudgetTier,
    plan_tier: stored.planTier,
    depth_params: stored.depthParams,
    as_of: stored.asOf.toISOString(),
    decision_scope: contract.decision_scope,
    steering_presets: contract.steering_presets,
    steering_annotations: contract.steering_annotations
  });
  return parsed.success ? Object.freeze(parsed.data) : null;
}

/** Step 2: every member the person's stored settings had is still there, with the same value. */
function keepsEveryStoredChoice(stored: Readonly<Record<string, unknown>>, normalised: Readonly<Record<string, unknown>>): boolean {
  return Object.entries(stored).every(([key, value]) => Object.hasOwn(normalised, key) && isDeepStrictEqual(normalised[key], value));
}

export async function planReadmission(input: Readonly<{
  stored: StoredAsk;
  planId: PlanId | null;
  settings: Pick<RunCreationSettings, "debateShapePolicy" | "lengthGuidancePolicy" | "previewProviderTestConfig">;
  evaluate: (ask: AskRequest, shapePlan: DebateShapePlanKey) => Promise<PlannedAskAdmission | AskRefusal>;
}>): Promise<ReadmissionPlan> {
  const rebuilt = rebuiltAsk(input.stored);
  if (rebuilt === null) return ASK_AGAIN;
  const shapePlan = debateShapePlanKeyOf(input.planId, rebuilt.plan_tier);
  const ask = normaliseAskForDebateShape(
    rebuilt, input.settings.debateShapePolicy ?? null, shapePlan, input.settings.lengthGuidancePolicy ?? null
  );
  if (!keepsEveryStoredChoice(input.stored.depthParams, ask.depth_params)) return ASK_AGAIN;
  const evaluation = await input.evaluate(ask, shapePlan);
  if (evaluation instanceof AskRefusal) {
    return READMISSION_CHOICE_REFUSALS.has(evaluation.code) || READMISSION_PERMANENT_REFUSALS.has(evaluation.code)
      ? ASK_AGAIN : Object.freeze({ kind: "NOT_NOW", code: evaluation.code });
  }
  return Object.freeze({
    kind: "READMIT",
    ask,
    shapePlan,
    planId: input.planId,
    evaluation,
    settingsClass: runSettingsClassOfAsk(ask, input.settings.previewProviderTestConfig, shapePlan),
    holdMicros: evaluation.pickedHoldMicros ?? null,
    stored: input.stored
  });
}

/**
 * The new run's ask contract, as the direct path and the room write one (`#submitWithRoom`): the person's scope and
 * steering from the re-admitted ask, the critic cap of the new evaluation, and — ruling L-SHAPED-ONLY — the stored
 * question-language lock only when the new evaluation minted a shape receipt. The language is never decided again.
 */
export function readmittedAskContract(plan: Extract<ReadmissionPlan, { kind: "READMIT" }>): Readonly<Record<string, unknown>> {
  const language = plan.stored.askContract.question_language;
  const shaped = (plan.evaluation.envelopeBasis.shape ?? null) !== null;
  return Object.freeze({
    decision_scope: plan.ask.decision_scope,
    steering_presets: plan.ask.steering_presets,
    steering_annotations: plan.ask.steering_annotations,
    critic_unavailable_cap: plan.evaluation.criticUnavailableCap,
    ...(shaped && language !== undefined ? { question_language: language } : {})
  });
}
