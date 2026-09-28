import type { AnswerModelAssignment, PlanTier } from "@debateai/contract";
import { MODEL_STRENGTHS, type DebateRole, type ModelStrength } from "@debateai/kernel";

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
    yoursToChoose: "How strong the models doing each debate job are · this site's usual setting applies until you choose",
    // A21.3 carry 14 (A21.2 review Minor 2): the session read FAILED, so the page does not know
    // whether a scored model list is in force, and claims no reason.
    notAvailable: "How strong the models doing each debate job are · not available right now",
    // A21.3 fix round 1 (review Minor 3): while the session read is PENDING, the description alone.
    pending: "How strong the models doing each debate job are"
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
 * this one plain line instead.
 *
 * Owner decision O2: English for now, kept here beside the control's copy so
 * the port to the site's language catalogs has one place to read.
 */
export const PLAN_CARD_COPY = Object.freeze({
  modelsChosenPerPart: "The AI models are chosen for each part of the debate."
});

/** C1: whether a plan card lists its plan's usual models, or shows `PLAN_CARD_COPY` instead. */
export function planCardNamesRoster(scorecard: ScorecardSignal): boolean {
  return scorecard === "NOT_IN_FORCE";
}

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
 *
 * While the page does not know, the control stays locked and its note gives no
 * reason the page cannot vouch for: a PENDING read shows the description alone,
 * and a FAILED read says only "not available right now" (A21.3 carry 14).
 */
export function modelStrengthControl(input: Readonly<{
  scorecard: ScorecardSignal;
  planTier: PlanTier;
}>): Readonly<{ locked: boolean; hint: string }> {
  if (input.scorecard === "PENDING") return Object.freeze({ locked: true, hint: MODEL_STRENGTH_COPY.hint.pending });
  if (input.scorecard === "READ_FAILED") return Object.freeze({ locked: true, hint: MODEL_STRENGTH_COPY.hint.notAvailable });
  if (input.scorecard === "NOT_IN_FORCE") return Object.freeze({ locked: true, hint: MODEL_STRENGTH_COPY.hint.notInEffect });
  if (input.planTier === "free") return Object.freeze({ locked: true, hint: MODEL_STRENGTH_COPY.hint.fixedByFree });
  return Object.freeze({ locked: false, hint: MODEL_STRENGTH_COPY.hint.yoursToChoose });
}

/**
 * A21.3 — the finished debate's honesty drawer: which models were chosen for
 * each debate job. Owner decision O2: English for now, and EVERY visitor-facing
 * string of that section lives in `MODEL_ASSIGNMENT_COPY`, beside the control's
 * copy, so the port to the site's language catalogs has one place to read.
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
export const MODEL_ASSIGNMENT_COPY = Object.freeze({
  // Carry 6: the drawer shows the PINNED choice, not a record of use (a backup may answer some calls).
  // Final review I4: an answer with no assignment (no scorecard was in force, or its pin is
  // unreadable) shows NO section at all, so there is no absent-field sentence to hold here.
  title: "Models chosen for this debate",
  // O1: the one sentence about stand-ins, worded like the committed backup-mark label (final review m1:
  // "could not be used" is true even when a model is handed over after only OK answers).
  standIn: "Where a chosen model could not be used, another AI model may have stepped in.",
  // Carry 4: a FALLBACK answer-writer or answer-checker seat is never sat; the site's configured model answers.
  siteSetting: "This site's usual setting chooses the model for this job.",
  // Carry 5: a cross-exchange defends a root, so the root's writer writes it; it has no backup of its own.
  crossExchange: "The model that wrote each opening position also writes its replies to the other positions.",
  // O1 / O-11: the seven debate jobs in plain words.
  jobs: Object.freeze({
    POSITION: "Writing the opening positions",
    SUPPORT_ATTACK: "Writing supporting and opposing arguments",
    CROSS_EXCHANGE: "Replying to the other positions",
    JUDGE: "Judging the arguments",
    REVIEWER: "Reviewing the arguments",
    ANSWER_WRITER: "Writing the answer",
    ANSWER_CHECKER: "Checking the answer"
  } satisfies Record<DebateRole, string>)
});

export function debateRoleLabel(role: DebateRole): string {
  return MODEL_ASSIGNMENT_COPY.jobs[role];
}

/** One model as the node badges present it (`makerIdentityLabel`): its maker and its model id, nothing else. */
export type ChosenModel = Readonly<{ maker: string; modelId: string }>;

/** One debate job in the drawer: its plain name, and EITHER the models chosen for it OR one fixed line. */
export type ModelAssignmentJob = Readonly<{
  role: DebateRole;
  label: string;
  models: readonly ChosenModel[];
  /** The fixed line shown INSTEAD of model names (carries 4 and 5); null when models are named. */
  note: string | null;
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
    const job = (models: readonly ChosenModel[], note: string | null): ModelAssignmentJob =>
      Object.freeze({ role: entry.role, label: debateRoleLabel(entry.role), models: Object.freeze(models), note });
    if (entry.role === "CROSS_EXCHANGE") {
      jobs.push(job([], MODEL_ASSIGNMENT_COPY.crossExchange));
      continue;
    }
    if ((entry.role === "ANSWER_WRITER" || entry.role === "ANSWER_CHECKER")
      && entry.seats.some((seat) => seat.source === "FALLBACK")) {
      jobs.push(job([], MODEL_ASSIGNMENT_COPY.siteSetting));
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
