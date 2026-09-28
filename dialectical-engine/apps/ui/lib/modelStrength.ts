import type { PlanTier } from "@debateai/contract";
import { MODEL_STRENGTHS, type ModelStrength } from "@debateai/kernel";

/**
 * A21 — the model-strength control as the asker reads it. The values are the
 * kernel's (`MODEL_STRENGTHS`); only the words are the UI's. No price appears
 * here or beside the control: no contract field carries a price estimate, and
 * the UI invents none.
 *
 * Owner decision O2 (2026-09-28): English for now, and EVERY visitor-facing
 * string of this control lives in `MODEL_STRENGTH_COPY` below, so the port to
 * the site's language catalogs at the merge with dev has one place to read.
 * Owner decision O3: nothing here speaks of a strength being lowered.
 */
export const MODEL_STRENGTH_COPY = Object.freeze({
  label: "Model strength",
  options: Object.freeze({
    ECONOMY: "Economy",
    BALANCED: "Balanced",
    BEST: "Best"
  } satisfies Record<ModelStrength, string>),
  hint: Object.freeze({
    // O4: shown on either plan while no scored model list is in force.
    notInEffect: "How strong the models doing each debate job are · not in effect until the models have been scored",
    fixedByFree: "How strong the models doing each debate job are · fixed by the Free plan",
    yoursToChoose: "How strong the models doing each debate job are · this site's usual setting applies until you choose"
  })
});

export const MODEL_STRENGTH_OPTIONS: ReadonlyArray<{ readonly value: ModelStrength; readonly label: string }> =
  Object.freeze(MODEL_STRENGTHS.map((value) => Object.freeze({ value, label: MODEL_STRENGTH_COPY.options[value] })));

export function isModelStrength(value: unknown): value is ModelStrength {
  return typeof value === "string" && (MODEL_STRENGTHS as readonly string[]).includes(value);
}

export function modelStrengthLabel(strength: ModelStrength): string {
  return MODEL_STRENGTH_COPY.options[strength];
}

/**
 * Owner decision O4: while no VALID model scorecard is in force the control is
 * SHOWN, greyed out and marked not in effect — on either plan, because no plan
 * can make it work. Once one is, the Free plan fixes it like every other gauge
 * (controller default on O-6) and Premium leaves the choice to the asker. A
 * locked control sends nothing: the ask then carries no `model_strength`.
 */
export function modelStrengthControl(input: Readonly<{
  scorecardInForce: boolean;
  planTier: PlanTier;
}>): Readonly<{ locked: boolean; hint: string }> {
  if (!input.scorecardInForce) return Object.freeze({ locked: true, hint: MODEL_STRENGTH_COPY.hint.notInEffect });
  if (input.planTier === "free") return Object.freeze({ locked: true, hint: MODEL_STRENGTH_COPY.hint.fixedByFree });
  return Object.freeze({ locked: false, hint: MODEL_STRENGTH_COPY.hint.yoursToChoose });
}
