import type { AnswerModelAssignment, PlanTier } from "@debateai/contract";
import { MODEL_STRENGTHS, type DebateRole, type ModelStrength } from "@debateai/kernel";

/**
 * A21 — the model-strength control as the asker reads it, now in the site's
 * language (owner decision O2; paid plans S1b): each visitor-facing sentence is a
 * catalogue key in `newDebate.json` (35 locales), read with `t(catalog, key)`.
 * The values are the kernel's (`MODEL_STRENGTHS`); only the words are the UI's.
 * No price appears here or beside the control: no contract field carries a price
 * estimate, and the UI invents none.
 * Owner decision O3: nothing here speaks of a strength being lowered.
 */
export const MODEL_STRENGTH_KEYS = Object.freeze({
  label: "newDebate.modelStrength",
  options: Object.freeze({
    ECONOMY: "newDebate.modelStrengthEconomy",
    BALANCED: "newDebate.modelStrengthBalanced",
    BEST: "newDebate.modelStrengthBest"
  } satisfies Record<ModelStrength, string>),
  hint: Object.freeze({
    // O4: shown on either plan while no scored model list is in force.
    notInEffect: "newDebate.modelStrengthNotInEffectHint",
    fixedByFree: "newDebate.modelStrengthFreeHint",
    yoursToChoose: "newDebate.modelStrengthPremiumHint",
    // A21.3 carry 14 (A21.2 review Minor 2): the session read FAILED, so the page does not know
    // whether a scored model list is in force, and claims no reason.
    notAvailable: "newDebate.modelStrengthUnavailableHint",
    // A21.3 fix round 1 (review Minor 3): while the session read is PENDING, the description alone.
    pending: "newDebate.modelStrengthPendingHint"
  })
});

/**
 * What /new knows about the scored model list: the session's yes or no, or that
 * the session read is still pending or has failed (A21.3 carry 14, fix round 1).
 */
export type ScorecardSignal = "IN_FORCE" | "NOT_IN_FORCE" | "PENDING" | "READ_FAILED";

/**
 * Final review C1 — the /new plan cards, true in every state. A card names its
 * plan's usual models (`PLAN_TIER_ROSTERS`) only when the session says NO scored
 * model list is in force: that is the one state in which that list is what a
 * debate is seated with. With one in force the models are chosen for each debate
 * job, from every reachable scored model, and the plan only caps the strength —
 * so the list would be untrue; while the session read is pending or has failed,
 * the page cannot vouch for it either. In those three states each card carries
 * this one plain line instead (a `newDebate.json` key, 35 locales).
 */
export const PLAN_CARD_KEYS = Object.freeze({ modelsChosenPerPart: "newDebate.planModelsChosenPerPart" });

/** C1: whether a plan card lists its plan's usual models, or shows `PLAN_CARD_KEYS`' line instead. */
export function planCardNamesRoster(scorecard: ScorecardSignal): boolean {
  return scorecard === "NOT_IN_FORCE";
}

export const MODEL_STRENGTH_OPTIONS: ReadonlyArray<{ readonly value: ModelStrength; readonly labelKey: string }> =
  Object.freeze(MODEL_STRENGTHS.map((value) => Object.freeze({ value, labelKey: MODEL_STRENGTH_KEYS.options[value] })));

export function isModelStrength(value: unknown): value is ModelStrength {
  return typeof value === "string" && (MODEL_STRENGTHS as readonly string[]).includes(value);
}

/**
 * Owner decision O4: while no VALID model scorecard is in force the control is
 * SHOWN, greyed out and marked not in effect — on either plan, because no plan
 * can make it work. Once one is, the Free plan fixes it like every other gauge
 * (controller default on O-6) and Premium leaves the choice to the asker. A
 * locked control sends nothing: the ask then carries no `model_strength`.
 *
 * While the page does not know, the control stays locked and its note gives no
 * reason the page cannot vouch for: a PENDING read shows the description alone,
 * and a FAILED read says only "not available right now" (A21.3 carry 14).
 */
export function modelStrengthControl(input: Readonly<{
  scorecard: ScorecardSignal;
  planTier: PlanTier;
}>): Readonly<{ locked: boolean; hintKey: string }> {
  if (input.scorecard === "PENDING") return Object.freeze({ locked: true, hintKey: MODEL_STRENGTH_KEYS.hint.pending });
  if (input.scorecard === "READ_FAILED") return Object.freeze({ locked: true, hintKey: MODEL_STRENGTH_KEYS.hint.notAvailable });
  if (input.scorecard === "NOT_IN_FORCE") return Object.freeze({ locked: true, hintKey: MODEL_STRENGTH_KEYS.hint.notInEffect });
  if (input.planTier === "free") return Object.freeze({ locked: true, hintKey: MODEL_STRENGTH_KEYS.hint.fixedByFree });
  return Object.freeze({ locked: false, hintKey: MODEL_STRENGTH_KEYS.hint.yoursToChoose });
}

/**
 * A21.3 — the finished debate's honesty drawer: which models were chosen for
 * each debate job, in `misc.json` (35 locales; owner decision O2, paid plans S1b).
 *
 * Owner decision O1: a PLAIN list — per job, the names of the models chosen, and
 * one sentence that another model may have stepped in. No seat number, thinking
 * level, backup share or scorecard version reaches the visitor; that detail
 * stays in the JSON export (`answer.model_assignment` rides in it whole).
 *
 * Owner decision O3: nothing here words the applied strength or a step-down.
 * (`stepped_down` is set only by the hosted money ceiling; a hosted plan cap
 * lowers the strength WITHOUT setting it — packages/scorecard/src/picker.ts
 * `pickRoleAssignment` — so that flag could not tell of a cap either way. Both
 * stay pinned and in the export, for audit.)
 */
export const MODEL_ASSIGNMENT_KEYS = Object.freeze({
  // Carry 6: the drawer shows the PINNED choice, not a record of use (a backup may answer some calls).
  // Final review I4: an answer with no assignment (no scorecard was in force, or its pin is
  // unreadable) shows NO section at all, so there is no absent-field sentence to hold here.
  title: "misc.answerHonesty.modelsChosen.title",
  // O1: the one sentence about stand-ins, worded like the committed backup-mark label (final review m1:
  // "could not be used" is true even when a model is handed over after only OK answers).
  standIn: "misc.answerHonesty.modelsChosen.standIn",
  // Carry 4: a FALLBACK answer-writer or answer-checker seat is never sat; the site's configured model answers.
  siteSetting: "misc.answerHonesty.modelsChosen.siteSetting",
  // Carry 5: a cross-exchange defends a root, so the root's writer writes it; it has no backup of its own.
  crossExchange: "misc.answerHonesty.modelsChosen.crossExchange",
  // O1 / O-11: the seven debate jobs in plain words.
  jobs: Object.freeze({
    POSITION: "misc.answerHonesty.modelsChosen.job.position",
    SUPPORT_ATTACK: "misc.answerHonesty.modelsChosen.job.supportAttack",
    CROSS_EXCHANGE: "misc.answerHonesty.modelsChosen.job.crossExchange",
    JUDGE: "misc.answerHonesty.modelsChosen.job.judge",
    REVIEWER: "misc.answerHonesty.modelsChosen.job.reviewer",
    ANSWER_WRITER: "misc.answerHonesty.modelsChosen.job.answerWriter",
    ANSWER_CHECKER: "misc.answerHonesty.modelsChosen.job.answerChecker"
  } satisfies Record<DebateRole, string>)
});

/** One model as the node badges present it (`makerIdentityLabel`): its maker and its model id, nothing else. */
export type ChosenModel = Readonly<{ maker: string; modelId: string }>;

/** One debate job in the drawer: its plain name's key, and EITHER the models chosen for it OR one fixed line's key. */
export type ModelAssignmentJob = Readonly<{
  role: DebateRole;
  labelKey: string;
  models: readonly ChosenModel[];
  /** The fixed line shown INSTEAD of model names (carries 4 and 5); null when models are named. */
  noteKey: string | null;
}>;

/**
 * The drawer's list, in the pinned (kernel) order. A job with no seats in this
 * debate is left out. Each other job names every model chosen for it — mains and
 * backups alike, each model once, whatever its thinking level — except:
 *  - CROSS_EXCHANGE (carry 5): its seats mirror the opening positions, and at run
 *    time each reply is written by whoever wrote that position, with no backup;
 *  - a FALLBACK ANSWER_WRITER / ANSWER_CHECKER seat (carry 4): the runner never
 *    sits it (the sealed register refs answer), so it names no model.
 */
export function modelAssignmentJobs(assignment: AnswerModelAssignment): readonly ModelAssignmentJob[] {
  const jobs: ModelAssignmentJob[] = [];
  for (const entry of assignment.roles) {
    if (entry.seats.length === 0) continue;
    const job = (models: readonly ChosenModel[], noteKey: string | null): ModelAssignmentJob =>
      Object.freeze({ role: entry.role, labelKey: MODEL_ASSIGNMENT_KEYS.jobs[entry.role], models: Object.freeze(models), noteKey });
    if (entry.role === "CROSS_EXCHANGE") {
      jobs.push(job([], MODEL_ASSIGNMENT_KEYS.crossExchange));
      continue;
    }
    if ((entry.role === "ANSWER_WRITER" || entry.role === "ANSWER_CHECKER")
      && entry.seats.some((seat) => seat.source === "FALLBACK")) {
      jobs.push(job([], MODEL_ASSIGNMENT_KEYS.siteSetting));
      continue;
    }
    const seen = new Set<string>();
    const models: ChosenModel[] = [];
    for (const seat of entry.seats) {
      for (const candidate of [seat.main, seat.runner_up]) {
        if (candidate === null) continue;
        const key = JSON.stringify([candidate.maker, candidate.model_id]);
        if (seen.has(key)) continue;
        seen.add(key);
        models.push(Object.freeze({ maker: candidate.maker, modelId: candidate.model_id }));
      }
    }
    jobs.push(job(models, null));
  }
  return Object.freeze(jobs);
}
