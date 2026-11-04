import { START_PATHS_NARROWED, START_PATHS_STALE, START_STEP_LIMITS, type AskRequest, type PurposeLines } from "@debateai/contract";
import type { StartPathsStore, StoredStartMenu, StoredStartPath, StoredStartPathSet } from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import { isShapeReceiptV2, type DebateShapePlanKey, type DebateShapeWidths } from "@debateai/register";
import type { Pool } from "pg";
import { askStartShapeOf, type AskStartShape } from "./debate-shape-ask.js";
import { readPurposeLinesOf, recordPurposeLinesAtAsk, type PurposeLinesPort } from "./purpose-lines.js";
import type { QuestionLanguageLock } from "./question-language/decider.js";

/**
 * V4 start step, Tasks 33 and 35 (spec 2026-11-03 §4.2) — THE CHOSEN PATHS AT START. `POST /v1/asks` checks the paths
 * signed at Next (Task 33's verifier) and hands them to `submit` (Task 36's route) bound to the plan and the settings
 * version they were signed for. `submit` decides the ask's start (`startOfAsk`), admits it with shape receipt v2 when the
 * panel allows (Task 34), and, as a setup step before the debate's first job (START_PATHS), seals the chosen set under
 * the run's own key and records the purpose lines (`sealStartPathsAtSetup`). A debate admitted without receipt v2 keeps
 * today's ask, byte for byte.
 */

/** The paths a person chose, as the verifier read them from the signed menu or a dig's picks (Task 33). */
export type VerifiedStartPaths = Readonly<{ source: "MENU" | "DIG_PICKS"; width: number; chosenBy: "PERSON" | "AIS"; carryOnToReport: boolean;
  questionSwap: Readonly<{ originalQuestionLine: string }> | null; paths: readonly StoredStartPath[]; menu: StoredStartMenu | null; ownWords: readonly string[] }>;

/** The set a run seals, from verified paths: one to one. */
export function storedSetOf(runId: string, verified: VerifiedStartPaths): StoredStartPathSet {
  return Object.freeze({ runId, source: verified.source, width: verified.width, chosenBy: verified.chosenBy,
    carryOnToReport: verified.carryOnToReport, paths: verified.paths, menu: verified.menu });
}

/**
 * What the route hands `submit` (Task 36): the plan key and settings version the step's references were signed for, the
 * verified paths (null when the ask carried none: a lone checked question), and the question-language lock the checked
 * line carried (null: the language decider is asked, as today).
 */
export type AskStartHandOver = Readonly<{ binding: Readonly<{ planKey: DebateShapePlanKey; settingsVersion: number }>;
  verified: VerifiedStartPaths | null; lock: QuestionLanguageLock | null }>;

/**
 * An ask's start: the shape admission prices (Task 34), the verified paths (null: the run builds its own list), the
 * purpose lines the run keeps (the ask's own; null: none, or a dig's first debate's, read at the seal), whether the AIs
 * carry on to the report (never on a dig), and the dig's first debate (the person's own, null otherwise).
 */
export type AskStart = Readonly<{ shape: AskStartShape; verified: VerifiedStartPaths | null; purposeLines: PurposeLines | null;
  carryOnToReport: boolean; parentRunId: string | null }>;

const stale = (): TypedDomainError => new TypedDomainError(START_PATHS_STALE, START_PATHS_STALE);
const narrowed = (): TypedDomainError => new TypedDomainError(START_PATHS_NARROWED, START_PATHS_NARROWED);

/**
 * V4 start step, Task 35b (owner answer Q8, 4 Nov): whether `paths` chosen paths fit a version's widths for the plan: at
 * most its widest option, and on Free at most 3 (the cap in code, whatever the row says). The width the person chose
 * need not be among the options.
 */
export function startPathsFit(widths: DebateShapeWidths, plan: DebateShapePlanKey, paths: number): boolean {
  return paths <= Math.max(...widths.options) && (plan !== "free" || paths <= START_STEP_LIMITS.freePathsMax);
}

/**
 * The ask's start, or null when the step does not run for it (`widths` null: `startStepWidthsFor`) and it carried no
 * paths. Paths signed for another plan, or carried to a version where the step is off, are STALE: the page offers "Read
 * it again", never a debate without the paths the person chose. Task 35b (owner answer Q8, 4 Nov): paths signed under
 * another settings version (older or, after a way back, newer) are not stale; the debate argues them as chosen, the set
 * sealed as handed over (its width kept), unless the active version allows fewer than were chosen (`startPathsFit`):
 * NARROWED, and the page asks to combine or remove down to its widest. Under the same version nothing changes. A dig
 * never carries on to the report (Task 56), whatever a client sends, so the verified set's flag follows the ask's own rule.
 */
export function startOfAsk(input: Readonly<{ widths: DebateShapeWidths | null; plan: DebateShapePlanKey; registerVersion: number;
  ask: AskRequest; handOver: AskStartHandOver | null }>): AskStart | null {
  const { widths, plan, ask, handOver } = input;
  if (handOver !== null && handOver.binding.planKey !== plan) throw stale();
  const given = handOver?.verified ?? null;
  if (widths === null) {
    if (given !== null) throw stale();
    return null;
  }
  const versionMoved = handOver !== null && handOver.binding.settingsVersion !== input.registerVersion;
  if (versionMoved && given !== null && !startPathsFit(widths, plan, given.paths.length)) throw narrowed();
  const carryOnToReport = ask.carry_on_to_report === true && ask.parent === undefined && ask.public_parent === undefined;
  const verified = given === null || given.carryOnToReport === carryOnToReport ? given : Object.freeze({ ...given, carryOnToReport });
  const shape = askStartShapeOf(widths, plan, verified);
  if (shape === null) throw new TypeError("START_SHAPE_MISSING");
  return Object.freeze({ shape, verified, purposeLines: ask.purpose_lines ?? null, carryOnToReport,
    parentRunId: ask.parent?.parent_run_id ?? null });
}

/**
 * THE START_PATHS SETUP STEP (submit, both paths, after the rotation pin and before the memory question; only on receipt
 * v2): the verified set, sealed under the run's key (a throw fails the step: RUN_SETUP_FAILED:START_PATHS; no store
 * composed: START_PATHS_STORE_UNAVAILABLE), then the purpose lines: the ask's own, or a dig's first debate's when it has
 * none, so place and time reach the dig. The lines are logged by code and never fail the run (`recordPurposeLinesAtAsk`).
 * A run that builds its own list has no set yet: its runner writes it.
 */
export async function sealStartPathsAtSetup(input: Readonly<{ runId: string; ownerRef: string; start: AskStart;
  store: StartPathsStore | undefined; purposeLines: PurposeLinesPort | undefined; pool: Pool }>): Promise<void> {
  const { runId, ownerRef, start } = input;
  if (start.verified !== null) {
    if (input.store === undefined) {
      throw new TypedDomainError("START_PATHS_STORE_UNAVAILABLE", "A debate with chosen paths needs the start paths store");
    }
    await input.store.recordStartPaths(storedSetOf(runId, start.verified));
  }
  if (input.purposeLines === undefined) return;
  const lines = start.purposeLines
    ?? (start.parentRunId === null ? null : await readPurposeLinesOf(input.pool, ownerRef, start.parentRunId));
  if (lines !== null) await recordPurposeLinesAtAsk({ ownerRef, runId, lines }, input.purposeLines);
}

/** The run's ask-contract member for the carry-on box: `{ carry_on_to_report: true }` only on receipt v2, only when asked. */
export function startAskContractMember(start: AskStart | null, envelopeBasis: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  return start !== null && start.carryOnToReport && isShapeReceiptV2(envelopeBasis)
    ? Object.freeze({ carry_on_to_report: true }) : Object.freeze({});
}
