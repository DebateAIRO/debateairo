import { DepthParamsSchema, START_PATHS_NARROWED, type AskRequest, type DepthParams, type PurposeLines } from "@debateai/contract";
import type { Pool, StartPathsStore, StoredAsk, StoredStartPathSet } from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import type { DebateShapePlanKey } from "@debateai/register";
import { readPurposeLinesOf } from "./purpose-lines.js";
import {
  startPathsFit, startWidthsOfView, type AskStartHandOver, type StartStepView, type VerifiedStartPaths
} from "./start-paths-at-ask.js";

/*
 * V4 start step, Task 57e (the owner's 6 Nov rule, in his words: "either we fix the code that produced the error, we should re-use what we
 * already paid for, and only in case it's something that we've triggered and there's no way we can re-use those parts, then of course we
 * will give the user back that credit"; confirmed plan, card "Build this (Recommended)") — "ASK THIS AGAIN" RE-USES WHAT WAS PAID FOR.
 *
 * A first question that failed (after its one automatic retry, the runner's) keeps what its calls before Start bought: its whole line (the
 * person's words and the clarifying answers the page wrote into it), its place, time and purpose lines, and the paths the person chose from
 * the list (0158's set, sealed under the debate's key). Its charges before Start are therefore not given back (0164, core.run_pre_start_kept),
 * and "Ask this again" (`again_of`) starts the question again on exactly those, at no new charge: no clarifying call, no list, no merge, no
 * charge before Start and no try linked. Only the debate itself runs again. Its depth and reading level are the stored ones too, so the
 * question is the same question.
 *
 * It applies only to the person's own FAILED first question (the route's owner-gated read) whose content is live and that keeps paths chosen
 * from the list, sent with its line unchanged and without start members of its own. Anything else (another's debate, one that did not fail,
 * an erased one, a dig, one that built its own paths or kept none, changed words) ignores the link: today's ask. The FAILED run read says
 * `reusable: true` exactly when a link would be honoured (as far as the read can know: the words the page sends are checked at the ask).
 */

/** What "Ask this again" re-uses of one failed first question, as its debate stored it. */
export type AskAgainSource = Readonly<{
  runId: string;
  /** The whole line as the person sent it at Start: their words and the clarifying answers written into it. */
  questionLine: string;
  /** Its place, time and purpose lines (decision 5), null when it kept none. */
  purposeLines: PurposeLines | null;
  /** Its depth and reading level, as stored. */
  depthParams: DepthParams;
  /** The paths it kept, chosen from the list (source MENU). */
  set: StoredStartPathSet;
}>;

/** What a re-used Start hands on: the ask `submit` gets (the stored parts in place of the sent ones) and the kept paths, as verified. */
export type AskAgain = Readonly<{ runId: string; ask: AskRequest; verified: VerifiedStartPaths }>;

const once = (texts: readonly string[]): readonly string[] => Object.freeze([...new Set(texts)]);

/** The paths a run kept, as Start's verifier hands them to `submit`: one to one, the line not changed, their own words each once. */
function verifiedOfKept(set: StoredStartPathSet): VerifiedStartPaths {
  return Object.freeze({ source: "MENU" as const, width: set.width, chosenBy: set.chosenBy, carryOnToReport: set.carryOnToReport,
    questionSwap: null, paths: set.paths, menu: set.menu, ownWords: once(set.paths.flatMap((path) => path.ownWords)), questionEdited: false });
}

/**
 * The re-used Start of `ask`, or null: today's ask (the link ignored). The ask must be a new question with no start members of its own and the
 * same line (trimmed) as the one stored; the source must keep paths chosen from the list. The stored line, purpose lines, depth and carry-on
 * box replace the sent ones; the link itself is never part of the ask handed on.
 */
export function askAgainOf(ask: AskRequest, source: AskAgainSource | null): AskAgain | null {
  if (source === null || source.set.source !== "MENU" || source.set.paths.length === 0) return null;
  if (ask.parent !== undefined || ask.public_parent !== undefined || ask.start_check !== undefined || ask.start_paths !== undefined) return null;
  if (ask.question_line.trim() !== source.questionLine.trim()) return null;
  const { again_of: _link, purpose_lines: _lines, carry_on_to_report: _carryOn, depth_params: _depth, ...rest } = ask;
  void _link;
  void _lines;
  void _carryOn;
  void _depth;
  const reused: AskRequest = Object.freeze({ ...rest, question_line: source.questionLine, depth_params: source.depthParams,
    ...(source.purposeLines === null ? {} : { purpose_lines: source.purposeLines }),
    ...(source.set.carryOnToReport ? { carry_on_to_report: true as const } : {}) });
  return Object.freeze({ runId: source.runId, ask: reused, verified: verifiedOfKept(source.set) });
}

/**
 * The hand-over of a re-used Start, under the binding Next would derive now (the person's plan, the active version), or null where the start
 * step does not run for them any more (today's ask: the link ignored). Kept paths that the active version no longer allows for the plan
 * are refused as a Start's would be (409 START_PATHS_NARROWED: the page asks to combine or remove first).
 */
export function askAgainHandOverOf(input: Readonly<{ again: AskAgain;
  binding: Readonly<{ planKey: DebateShapePlanKey; settingsVersion: number }> | null; view: StartStepView }>): AskStartHandOver | null {
  const { again, binding } = input;
  if (binding === null) return null;
  const widths = startWidthsOfView(input.view, binding.planKey);
  if (widths === null) return null;
  if (!startPathsFit(widths, binding.planKey, again.verified.paths.length)) {
    throw new TypedDomainError(START_PATHS_NARROWED, START_PATHS_NARROWED);
  }
  return Object.freeze({ binding: Object.freeze({ planKey: binding.planKey, settingsVersion: binding.settingsVersion }),
    verified: again.verified, lock: null });
}

/**
 * The application's read (PostgresAskApplication.readAskAgain): what a FAILED first question of the person kept, or null. Read only after the
 * route's owner-gated read said FAILED. Null when it keeps no paths chosen from the list (none, its own, a dig's picks) or its content is
 * erased (the store's read is null), when its stored ask is a dig or cannot be read, or on any failure. Never throws; logs nothing.
 */
export async function readAskAgainSource(input: Readonly<{ pool: Pool; ownerRef: string; runId: string;
  readStoredAsk: (runId: string) => Promise<StoredAsk | null>; startPaths: StartPathsStore | undefined }>): Promise<AskAgainSource | null> {
  if (input.startPaths === undefined) return null;
  try {
    const set = await input.startPaths.readStartPaths(input.runId);
    if (set === null || set.source !== "MENU" || set.paths.length === 0) return null;
    const stored = await input.readStoredAsk(input.runId);
    if (stored === null || !stored.contentEncrypted || stored.askContract.parent !== undefined || stored.askContract.public_parent !== undefined) {
      return null;
    }
    const depth = DepthParamsSchema.safeParse(stored.depthParams);
    if (!depth.success || stored.questionLine.trim().length === 0) return null;
    const purposeLines = await readPurposeLinesOf(input.pool, input.ownerRef, input.runId);
    return Object.freeze({ runId: input.runId, questionLine: stored.questionLine, purposeLines, depthParams: depth.data, set });
  } catch {
    return null;
  }
}
