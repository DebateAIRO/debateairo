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
 * model that sat out cannot be picked: the report says the pin did not hold (PRACTICE_PIN_NOT_HELD, NOT_PROVEN). A pin
 * holds only when the pinned model actually SERVED its step, read from the run's own facts (its answered final-writer
 * calls; the stored story's storyteller): a cost fallback or a backup storyteller serving instead is not held.
 * Debate mode only; the model must be one of the preview's premium models; role rotation must be on in the practice
 * register. A refused value is never repeated.
 */
import type { MakerLineage } from "@debateai/contract";
import type { RoleRotationCounts, RotatedRole } from "@debateai/scorecard";
import { practiceModelOfRef, type PracticeCallFamily } from "./practice-lanes.js";
import { PracticeRefusal } from "./practice-settings.js";
import { practiceCallFacts, type PracticeCallTry } from "./practice-verdict.js";

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
    // An invariant, not a refusal: practiceWriterPinsFromArgs already refused (by its flag) a model outside the same
    // premium list, before any gate was asked, so only a caller that skipped that check reaches this.
    if (!eligibleModelIds.includes(model)) throw new TypeError(`PRACTICE_PIN_UNCHECKED: ${role}`);
    return { [role]: Object.freeze(Object.fromEntries(eligibleModelIds.map((id) => [id, id === model
      ? Object.freeze({ picked: 0, eligible: 0 }) : Object.freeze({ picked: 1, eligible: 1 })]))) };
  };
  return Object.freeze({ ...counts, ...pinned("ANSWER_WRITER", pins.answerWriter), ...pinned("STORYTELLER", pins.storyteller) });
}

/* ------------------------------------------------------------------ what the run did (report.json `writerPins`) */

/**
 * One pinned role: the model asked for, the model the run's own pin names (null: no rotation was picked), the models
 * that actually served the step (`servedBy`, from the run's own facts), and whether the pin held: the run's pin names
 * the pinned model AND every serving was the pinned model's (at least one).
 */
export type PracticePinOutcome = Readonly<{ pinnedModel: string; wroteModel: string | null; servedBy: readonly string[]; held: boolean }>;
export type PracticeWriterPinsBlock = Readonly<{ answerWriter: PracticePinOutcome | null; storyteller: PracticePinOutcome | null }>;

/** What served each final step (Task 21 review, ruling A1): the models, once each, in the order the run's facts list them. */
export type PracticeServedWriters = Readonly<{ answerWriter: readonly string[]; storyteller: readonly string[] }>;

/**
 * The models whose calls of one family were answered, once each, in the order given (ledger order): each call is its own
 * AI's (`model`, the call join's call AI: a structure-repaired call stays the original AI's; a cost fallback's call is
 * the fallback's). Pure.
 */
export function practiceServedModels(calls: readonly Readonly<{ model: string; family: PracticeCallFamily; tries: readonly PracticeCallTry[] }>[],
  family: PracticeCallFamily): readonly string[] {
  return Object.freeze([...new Set(calls.filter((call) => call.family === family && practiceCallFacts(call.tries).answered)
    .map((call) => call.model))]);
}

/** The stored story's storyteller (its lineage: the first storyteller, a cost fallback or the backup), or none. Pure. */
export function practiceServedStoryteller(story: Readonly<{ storytellerLineage: MakerLineage | null }> | null): readonly string[] {
  const ref = story?.storytellerLineage?.provider_ref;
  return Object.freeze(ref === undefined ? [] : [practiceModelOfRef(ref)]);
}

/**
 * From the run's own pin (core.run_role_rotation, read back by practice-debate.ts as provider refs) and what served each
 * step (`served`; null: no run): which model the pin named, which served, beside the pins. A story told by the backup
 * storyteller (engine 2) is also in the report's storyBackups.
 */
export function practiceWriterPinsBlock(pins: PracticeWriterPins,
  rotation: Readonly<{ answerWriter: string; storyteller: string }> | null,
  served: PracticeServedWriters | null): PracticeWriterPinsBlock {
  const outcome = (pinned: string | null, ref: string | null, servedBy: readonly string[]): PracticePinOutcome | null => {
    if (pinned === null) return null;
    const wroteModel = ref === null ? null : practiceModelOfRef(ref);
    const held = wroteModel === pinned && servedBy.length > 0 && servedBy.every((model) => model === pinned);
    return Object.freeze({ pinnedModel: pinned, wroteModel, servedBy: Object.freeze([...servedBy]), held });
  };
  return Object.freeze({
    answerWriter: outcome(pins.answerWriter, rotation?.answerWriter ?? null, served?.answerWriter ?? []),
    storyteller: outcome(pins.storyteller, rotation?.storyteller ?? null, served?.storyteller ?? [])
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
    : [`- ${name}: pinned ${entry.pinnedModel}, wrote ${entry.wroteModel ?? "none (no rotation was picked)"}, served by ${
      entry.servedBy.length === 0 ? "none" : entry.servedBy.join(", ")}, held: ${entry.held ? "yes" : "no"}`];
  return Object.freeze(["Pinned final writers (read back from the run's own role pin):", "",
    ...line("answer writer", block.answerWriter), ...line("storyteller", block.storyteller), ""]);
}
