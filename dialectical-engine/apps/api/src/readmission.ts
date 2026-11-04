import { isDeepStrictEqual } from "node:util";
import { AskRequestSchema, START_STEP_LIMITS, type AskRequest } from "@debateai/contract";
import type { RunSettingsClass } from "@debateai/budget";
import type { StartPathsStore, StoredAsk, StoredStartPathSet } from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import {
  debateShapePlanKeyOf, isShapeReceiptV2, type DebateShapePlanKey, type DebateShapeWidths, type PlanId
} from "@debateai/register";
import type { Pool } from "pg";
import { admittedShapeV2Of } from "./ask-model-picker.js";
import { runSettingsClassOfAsk } from "./ask-room.js";
import { askStartShapeOf, normaliseAskForDebateShape, type AskStartShape } from "./debate-shape-ask.js";
import { AskRefusal, type PlannedAskAdmission, type RunCreationSettings } from "./index.js";
import { readPurposeLinesOf, recordPurposeLinesAtAsk, type PurposeLinesPort } from "./purpose-lines.js";
import { runLanguageOf } from "./question-language/decider.js";

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
 * V4 start step, Task 39 (spec 2026-11-03 §4.2): a path debate keeps the paths its person chose. Between steps 2 and 3,
 * the waiting run's sealed set (`startPaths`) is the start the new evaluation prices (receipt v2), its count and source;
 * a set this version no longer offers is ASK_AGAIN before any probe (`keptStartOf`), and so is a set whose evaluation
 * is not receipt v2 (one maker on the panel), since the new run would argue without the chosen paths. Without a set, the
 * run builds its own list at the default width where the step runs for the person (`startWidths`, RUN_BUILT), and has
 * no start where it does not: then `evaluate` is called exactly as before (no start argument).
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

/**
 * V4 start step, Task 39: READMIT's `start` is the start the new evaluation was handed (null: none), its receipt v2 only
 * on a panel of two makers or more, as at submit; `startPaths` is the waiting run's set the plan was made with (null:
 * none), which `#readmit` seals again under the new run's key (`keepStartForReadmission`).
 */
export type ReadmissionPlan =
  | Readonly<{ kind: "READMIT"; ask: AskRequest; shapePlan: DebateShapePlanKey; planId: PlanId | null;
      evaluation: PlannedAskAdmission; settingsClass: RunSettingsClass; holdMicros: number | null; stored: StoredAsk;
      start: AskStartShape | null; startPaths: StoredStartPathSet | null }>
  | Readonly<{ kind: "ASK_AGAIN" }>
  | Readonly<{ kind: "NOT_NOW"; code: string }>;

const ASK_AGAIN: ReadmissionPlan = Object.freeze({ kind: "ASK_AGAIN" });

/**
 * V4 start step, Task 39: the start a waiting run's sealed set keeps under this version, or null when this version no
 * longer offers it: the start step off for the person (no widths), a menu's How wide not among the widths, a dig's picks
 * (or any other set) more than How wide's widest (START_PATHS_TOO_MANY at submit), or more than 3 paths on Free whatever
 * the widths say.
 */
function keptStartOf(set: StoredStartPathSet, widths: DebateShapeWidths | null, plan: DebateShapePlanKey): AskStartShape | null {
  if (widths === null) return null;
  const paths = set.paths.length;
  if (plan === "free" && paths > START_STEP_LIMITS.freePathsMax) return null;
  if (set.source === "MENU" ? !widths.options.includes(set.width) : paths > Math.max(...widths.options)) return null;
  return Object.freeze({ paths, pathsSource: set.source });
}

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

/**
 * Step 2: every member the person's stored settings had is still there, with the same value. Side-by-side spec §13
 * (Task S12): the same rule decides whether an ask's choices survive a settings version that changed under the page.
 */
export function keepsEveryStoredChoice(stored: Readonly<Record<string, unknown>>, normalised: Readonly<Record<string, unknown>>): boolean {
  return Object.entries(stored).every(([key, value]) => Object.hasOwn(normalised, key) && isDeepStrictEqual(normalised[key], value));
}

/**
 * V4 start step, Task 39: `startPaths` is the waiting run's sealed set (null or absent: none); `startWidths` answers the
 * plan's widths when the start step runs for the person under this version (`startStepWidthsFor`; absent: never), and
 * `evaluate` gets the start as its third argument only when there is one.
 */
export async function planReadmission(input: Readonly<{
  stored: StoredAsk;
  planId: PlanId | null;
  settings: Pick<RunCreationSettings, "debateShapePolicy" | "lengthGuidancePolicy" | "previewProviderTestConfig">;
  evaluate: (ask: AskRequest, shapePlan: DebateShapePlanKey, start?: AskStartShape) => Promise<PlannedAskAdmission | AskRefusal>;
  startPaths?: StoredStartPathSet | null;
  startWidths?: (shapePlan: DebateShapePlanKey) => DebateShapeWidths | null;
}>): Promise<ReadmissionPlan> {
  const rebuilt = rebuiltAsk(input.stored);
  if (rebuilt === null) return ASK_AGAIN;
  const shapePlan = debateShapePlanKeyOf(input.planId, rebuilt.plan_tier);
  const ask = normaliseAskForDebateShape(
    rebuilt, input.settings.debateShapePolicy ?? null, shapePlan, input.settings.lengthGuidancePolicy ?? null
  );
  if (!keepsEveryStoredChoice(input.stored.depthParams, ask.depth_params)) return ASK_AGAIN;
  const startPaths = input.startPaths ?? null;
  const widths = input.startWidths?.(shapePlan) ?? null;
  const start = startPaths === null ? askStartShapeOf(widths, shapePlan, null) : keptStartOf(startPaths, widths, shapePlan);
  if (startPaths !== null && start === null) return ASK_AGAIN;
  const evaluation = start === null ? await input.evaluate(ask, shapePlan) : await input.evaluate(ask, shapePlan, start);
  if (evaluation instanceof AskRefusal) {
    return READMISSION_CHOICE_REFUSALS.has(evaluation.code) || READMISSION_PERMANENT_REFUSALS.has(evaluation.code)
      ? ASK_AGAIN : Object.freeze({ kind: "NOT_NOW", code: evaluation.code });
  }
  // The chosen paths are argued only on receipt v2; a new run without them is not the debate the person chose.
  if (startPaths !== null && !isShapeReceiptV2(evaluation.envelopeBasis)) return ASK_AGAIN;
  return Object.freeze({
    kind: "READMIT",
    ask,
    shapePlan,
    planId: input.planId,
    evaluation,
    // V4 start step, Task 37: a path debate's class counts the paths its new receipt (v2) was minted for.
    settingsClass: runSettingsClassOfAsk(ask, input.settings.previewProviderTestConfig, shapePlan,
      admittedShapeV2Of(evaluation.envelopeBasis)?.shape.paths),
    holdMicros: evaluation.pickedHoldMicros ?? null,
    stored: input.stored,
    start,
    startPaths
  });
}

/**
 * The new run's ask contract, as the direct path and the room write one (`#submitWithRoom`): the person's scope and
 * steering from the re-admitted ask, the critic cap of the new evaluation, and — ruling L-SHAPED-ONLY — the stored
 * question-language lock only when the new evaluation minted a shape receipt. The language is never decided again.
 * V4 start step, Task 39: the carry-on box (`carry_on_to_report`, Task 35's member) only when the waiting run asked and
 * the new evaluation minted receipt v2, as submit writes it (`startAskContractMember`).
 */
export function readmittedAskContract(plan: Extract<ReadmissionPlan, { kind: "READMIT" }>): Readonly<Record<string, unknown>> {
  const language = plan.stored.askContract.question_language;
  const shaped = (plan.evaluation.envelopeBasis.shape ?? null) !== null;
  const carryOn = plan.stored.askContract.carry_on_to_report === true && isShapeReceiptV2(plan.evaluation.envelopeBasis);
  return Object.freeze({
    decision_scope: plan.ask.decision_scope,
    steering_presets: plan.ask.steering_presets,
    steering_annotations: plan.ask.steering_annotations,
    critic_unavailable_cap: plan.evaluation.criticUnavailableCap,
    ...(shaped && language !== undefined ? { question_language: language } : {}),
    ...(carryOn ? { carry_on_to_report: true } : {})
  });
}

const startChanged = (): TypedDomainError => new TypedDomainError("START_PATHS_READMISSION_CHANGED",
  "The waiting debate's chosen paths are not the ones its re-admission was planned with");

/**
 * V4 start step, Task 39 — THE NEW RUN KEEPS ITS START (`#readmit`, after the role pins and before the memory question,
 * only when the new evaluation minted receipt v2 for an owner's run): the waiting run's set sealed again under the new
 * run's own key (`copyStartPathsForReadmission`), then the waiting run's purpose lines, opened under its key, recorded for
 * the new run (logged by code, never failing it: `recordPurposeLinesAtAsk`), so its runner reads its own. The copy must
 * find what the plan read: a planned set it cannot find, or a set where the plan read none, throws
 * START_PATHS_READMISSION_CHANGED, so the new run is recorded FAILED (RUN_SETUP_FAILED:READMISSION) and the waiting run,
 * untouched, is planned again at the next tick. No store composed: nothing to copy, since a planned set came from it.
 */
export async function keepStartForReadmission(input: Readonly<{
  plan: Extract<ReadmissionPlan, { kind: "READMIT" }>; fromRunId: string; toRunId: string; ownerRef: string;
  store: StartPathsStore | undefined; purposeLines: PurposeLinesPort | undefined; pool: Pool;
}>): Promise<void> {
  const planned = input.plan.startPaths !== null;
  if (input.store === undefined) {
    if (planned) throw startChanged();
  } else if ((await input.store.copyStartPathsForReadmission(input.fromRunId, input.toRunId) === "COPIED") !== planned) {
    throw startChanged();
  }
  if (input.purposeLines === undefined) return;
  const lines = await readPurposeLinesOf(input.pool, input.ownerRef, input.fromRunId);
  if (lines !== null) await recordPurposeLinesAtAsk({ ownerRef: input.ownerRef, runId: input.toRunId, lines }, input.purposeLines);
}

/**
 * Side-by-side C11 (C10's open question, ruling L-SHAPED-ONLY): the new run's argument language. When the new evaluation
 * minted a shape and the stored contract carries the question-language lock — the member `readmittedAskContract`
 * carries — it is that lock's language, as the run stored it. Otherwise it is what the non-shaped path stores today:
 * the local guess from the question (`runLanguageOf(null, …)`). The language is never decided again: no fast call.
 */
export function readmittedArgumentLanguage(plan: Extract<ReadmissionPlan, { kind: "READMIT" }>): Readonly<{ tag: string; nameEn: string }> {
  const language = plan.stored.askContract.question_language as Readonly<Record<string, unknown>> | undefined;
  const shaped = (plan.evaluation.envelopeBasis.shape ?? null) !== null;
  if (shaped && typeof language?.code === "string" && typeof language.name === "string") {
    return Object.freeze({ tag: language.code, nameEn: language.name });
  }
  return runLanguageOf(null, plan.ask.question_line);
}
