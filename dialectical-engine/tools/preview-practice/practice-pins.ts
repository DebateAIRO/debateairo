/**
 * Preview practice, mode "debate": pinning the final writers (spec docs/superpowers/specs/2026-10-15-engine-redesign-design.md
 * §14; plan INTERFACE §15.2).
 *
 * Plain words: to compare the AIs as final writers, question by question, a practice debate may name the model that
 * writes the answer (`--answer-writer-model`) and the one that tells the story (`--storyteller-model`). The pin never
 * touches the run's role table (core.run_role_rotation is written once, by the ask, and can never change). Instead the
 * counts the role rotation reads are shaped so the rotation's own rule picks the pinned model when it is on the
 * debate's panel: the pinned model has share 0 in its role and every other preview model share 1 (least share first,
 * packages/scorecard/src/role-rotation.ts). The checkers are still picked by the rotation, from another maker. A pinned
 * model that sat out cannot be picked: the report says the pin did not hold (PRACTICE_PIN_NOT_HELD, NOT_PROVEN).
 * Debate mode only; the model must be one of the preview's premium models; role rotation must be on in the practice
 * register. A refused value is never repeated.
 */
import { PREVIEW_PROVIDER_REF_MODELS } from "@debateai/providers";
import type { RoleRotationCounts, RotatedRole } from "@debateai/scorecard";
import { PracticeRefusal } from "./practice-settings.js";

export const PRACTICE_PIN_FLAGS = Object.freeze(["--answer-writer-model", "--storyteller-model"] as const);
type PracticePinFlag = typeof PRACTICE_PIN_FLAGS[number];

/** The pinned model ids; null: that role is the rotation's own pick. */
export type PracticeWriterPins = Readonly<{ answerWriter: string | null; storyteller: string | null }>;

/** The two flags of a command line, checked before any gate is asked: debate-only, each a premium preview model. */
export function practiceWriterPinsFromArgs(mode: string, flags: ReadonlyMap<string, string>,
  panelModelIds: readonly string[]): PracticeWriterPins {
  const given = PRACTICE_PIN_FLAGS.filter((flag) => flags.has(flag));
  if (given.length > 0 && mode !== "debate") throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", `${given[0]!} (debate mode only)`);
  const pinOf = (flag: PracticePinFlag): string | null => {
    const model = flags.get(flag);
    if (model === undefined) return null;
    // The flag is named, never the value typed.
    if (!panelModelIds.includes(model)) throw new PracticeRefusal("PRACTICE_PIN_MODEL_INVALID", flag);
    return model;
  };
  return Object.freeze({ answerWriter: pinOf("--answer-writer-model"), storyteller: pinOf("--storyteller-model") });
}

/** True when at least one role is pinned. */
export function practicePinsGiven(pins: PracticeWriterPins): boolean {
  return pins.answerWriter !== null || pins.storyteller !== null;
}

/** A pin works through the role rotation; with the rotation off in the practice register there is nothing to steer. */
export function practicePinsRequireRotation(pins: PracticeWriterPins, rotationOn: boolean): void {
  if (practicePinsGiven(pins) && !rotationOn) {
    throw new PracticeRefusal("PRACTICE_PIN_NEEDS_ROLE_ROTATION",
      "the practice register has role rotation off (answerRoleRotationPolicy); with --register-next give --role-rotation on");
  }
}

/**
 * The counts the rotation reads, with each pinned role replaced: the pinned model picked 0 of 0 (share 0), every other
 * preview model picked 1 of 1 (share 1), so the least-share rule picks the pinned model whenever it is eligible. Every
 * other role (the checkers, the opener) keeps the database's counts. Pure.
 */
export function practiceRotationCountsWithPins(counts: RoleRotationCounts, pins: PracticeWriterPins,
  eligibleModelIds: readonly string[]): RoleRotationCounts {
  const pinned = (role: "ANSWER_WRITER" | "STORYTELLER", model: string | null): RoleRotationCounts => {
    if (model === null) return {};
    if (!eligibleModelIds.includes(model)) throw new PracticeRefusal("PRACTICE_PIN_MODEL_INVALID", role);
    return { [role]: Object.freeze(Object.fromEntries(eligibleModelIds.map((id) => [id, id === model
      ? Object.freeze({ picked: 0, eligible: 0 }) : Object.freeze({ picked: 1, eligible: 1 })]))) };
  };
  return Object.freeze({ ...counts, ...pinned("ANSWER_WRITER", pins.answerWriter), ...pinned("STORYTELLER", pins.storyteller) });
}

/* ------------------------------------------------------------------ what the run did (report.json `writerPins`) */

/** One pinned role: the model asked for, the model the run's own pin names (null: no rotation was picked), whether they agree. */
export type PracticePinOutcome = Readonly<{ pinnedModel: string; wroteModel: string | null; held: boolean }>;
export type PracticeWriterPinsBlock = Readonly<{ answerWriter: PracticePinOutcome | null; storyteller: PracticePinOutcome | null }>;

function modelOfRef(providerRef: string): string {
  return PREVIEW_PROVIDER_REF_MODELS[providerRef] ?? `unreviewed:${providerRef}`;
}

/**
 * From the run's own pin (core.run_role_rotation, read back by practice-debate.ts as provider refs): which model wrote
 * the answer and which told the story, beside the pins. A story told by the backup storyteller (engine 2) is in the
 * report's storyBackups, not here.
 */
export function practiceWriterPinsBlock(pins: PracticeWriterPins,
  rotation: Readonly<{ answerWriter: string; storyteller: string }> | null): PracticeWriterPinsBlock {
  const outcome = (pinned: string | null, ref: string | null): PracticePinOutcome | null => {
    if (pinned === null) return null;
    const wroteModel = ref === null ? null : modelOfRef(ref);
    return Object.freeze({ pinnedModel: pinned, wroteModel, held: wroteModel === pinned });
  };
  return Object.freeze({
    answerWriter: outcome(pins.answerWriter, rotation?.answerWriter ?? null),
    storyteller: outcome(pins.storyteller, rotation?.storyteller ?? null)
  });
}

/** The pinned roles whose pin did not hold, in the rotation's role names. */
export function practicePinsNotHeld(block: PracticeWriterPinsBlock): readonly RotatedRole[] {
  return Object.freeze([
    ...(block.answerWriter !== null && !block.answerWriter.held ? ["ANSWER_WRITER" as const] : []),
    ...(block.storyteller !== null && !block.storyteller.held ? ["STORYTELLER" as const] : [])
  ]);
}

/** report.md lines: model ids and yes/no only. */
export function practiceWriterPinsLines(block: PracticeWriterPinsBlock): readonly string[] {
  const line = (name: string, entry: PracticePinOutcome | null): string[] => entry === null ? []
    : [`- ${name}: pinned ${entry.pinnedModel}, wrote ${entry.wroteModel ?? "none (no rotation was picked)"}, held: ${entry.held ? "yes" : "no"}`];
  return Object.freeze(["Pinned final writers (read back from the run's own role pin):", "",
    ...line("answer writer", block.answerWriter), ...line("storyteller", block.storyteller), ""]);
}
