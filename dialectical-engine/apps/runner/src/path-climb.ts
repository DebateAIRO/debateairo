import { createHash, randomBytes as cryptoRandomBytes } from "node:crypto";
import type { StoryFate } from "@debateai/contract";
import type {
  MainAnswerTriggerKind, MainAnswerUpdateRead, PathLineEntry, PathRewriteEntry, PathUpdateCauseKind, PathUpdateRecord, PathUpdateTurnRead,
  PostgresTreeUpdateRunnerRepository, WebSealed
} from "@debateai/db";
import { TypedDomainError, replyLanguageCheckFor } from "@debateai/kernel";
import type { ProviderCallRequest, ProviderCallResult, TokenCounter } from "@debateai/providers";
import { INVESTIGATION_REPORT_POLICY, PATH_REWRITE_POLICY } from "@debateai/register";
import {
  PATH_REWRITE_CHECKER_PROSE, PATH_REWRITE_PROSE, REPORT_ANSWER_PROSE, REPORT_CHECKER_PROSE, answerUpdateCallSiteKey, investigationReportFailureCode,
  pathRewriteFailureCode, writeOverallAnswer, writePathRewrite, type PathRewriteWritten, type StoryRoleMaker
} from "@debateai/story";
import { engineContractHash } from "./engine-contracts.js";
import { closingRandomBytes, type InvestigationCloseInput } from "./investigation-close.js";
import { investigationReportGuard } from "./investigation-dossier.js";
import { fitDossierToTokenLine, fitRewriteToTokenLine } from "./token-line.js";
import {
  pathRewriteGuard, type PathRewriteDigPath, type PathRewriteParentPath, type PathRewritePick
} from "./path-rewrite-material.js";
import {
  contentOf, lineageRecord, pathLineFrontOf, type PathLineBase, type PathRewriteContent, type PathRewriteDig, type PathRewriteInFlight,
  type PathRewriteRoles, type StepLease
} from "./path-rewrite.js";
import { replayingGateway, type ReplayBook } from "./run-replay.js";

/**
 * THE TREE KEEPS THE LATEST VIEW (plan 2026-10-31-r22-owner-changes decisions 2 and 3; the owner: "the tree contains at all times the
 * latest view on that debate"). Once a dig's own rewrite is stored:
 *  1. CODE decides whether it really changed the path (`pathReallyChanged`). If not, nothing above moves.
 *  2. The path above is rewritten too (0138's `take_path_update_turn`, kind CLIMB, its cause the rewrite below), with the same writer and
 *     checker on the same sealed prompts: the path above's text, then the debate below as its follow-up, its paths at their current text.
 *     Each level takes a turn in its path's one line, waits for the front, writes on the line's newest text, and ends in a row (FAILED when
 *     every writer failed: the path keeps its text and the climb stops there). A level that comes out unchanged stops the climb.
 *  3. At the first debate a change means the main answer is next (`updateMainAnswer`): the report's own answer step and check, on the
 *     report's own prompts (packages/story `writeOverallAnswer`), the whole tree as material, the version before it as the earlier
 *     answer; one version per trigger, sealed under the ROOT's key (0138's `record_main_answer_update`). A FAILED version changes nothing.
 *  4. V4 start step, Task 55e (spec §4.4): a dig under the main question of a path debate (a path left out before Start, "+ N more") is
 *     a new first-level path once each of its paths has its answer so far (`addedPathOf`). It writes no rewrite, so it updates the main
 *     answer itself, its trigger the dig (0164's PATH_ADDED), once its story is written (`advanceTree` with no rewrite of its own); and a
 *     change of one of its paths is a first-level change: a climb that reaches it updates the main answer instead of stopping there.
 *     A first debate, an R22 dig under the question and a runner without the read do as before.
 *
 * MONEY: every call names the run of the dig that started the climb, whoever dug it: `digRunId` is the only thing that says who pays
 * (PATH_CLIMB and ANSWER_UPDATE, charged on the story lane, never walled: a dig that started always gets its rewrites).
 *
 * RESUMING: everything is worked out from the stored rows, each id from the dig and the step, so `advanceTree` run again after a crash walks
 * the rows already there, free, and continues at the first one missing. An interrupted level sends the same prompts (the material is built
 * by code from the same rows) and each call already answered is replayed from the record, free (`replayBookOf`); a call never answered is
 * bought once. `sweepTreeUpdates` is what runs it again. It never rejects; logs codes and ids only.
 */

export type PathClimbText = Readonly<{ line: string; summary: string | null; fate: StoryFate }>;

/** How much of a text's words must differ for a rewrite to count as a real change (a rewording of a word or two does not). */
const PATH_TEXT_CHANGE_SHARE = 0.2;

const WORD_SEGMENTER = new Intl.Segmenter("und", { granularity: "word" });
function wordsOf(text: string): readonly string[] {
  const words: string[] = [];
  for (const segment of WORD_SEGMENTER.segment(text.normalize("NFKC").toLocaleLowerCase("und"))) {
    if (segment.isWordLike === true) words.push(segment.segment);
  }
  return words;
}
/** The share of words that differ, 0 (the same words, whatever the order) to 1 (none in common). */
function differingShare(left: readonly string[], right: readonly string[]): number {
  if (left.length === 0 && right.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const word of left) counts.set(word, (counts.get(word) ?? 0) + 1);
  let common = 0;
  for (const word of right) {
    const held = counts.get(word) ?? 0;
    if (held > 0) { counts.set(word, held - 1); common += 1; }
  }
  return 1 - (2 * common) / (left.length + right.length);
}
const figuresOf = (words: readonly string[]): ReadonlySet<string> => new Set(words.filter((word) => /\p{Nd}/u.test(word)));
function textMoved(before: string, after: string): boolean {
  const [was, now] = [wordsOf(before), wordsOf(after)];
  const [figuresWere, figuresNow] = [figuresOf(was), figuresOf(now)];
  if (figuresWere.size !== figuresNow.size || [...figuresWere].some((figure) => !figuresNow.has(figure))) return true;
  return differingShare(was, now) >= PATH_TEXT_CHANGE_SHARE;
}

/**
 * "REALLY CHANGED", decided by code, the same on every run: the fate moved; or a figure in the line or the summary appeared or went; or at
 * least PATH_TEXT_CHANGE_SHARE of the line's words or the summary's differ. A path with no summary yet (a story's line, a dig's own line)
 * is compared on its line and fate. Any language: words are the host's own word breaks, a text with no spaces included.
 */
export function pathReallyChanged(before: PathClimbText, after: Readonly<{ line: string; summary: string; fate: StoryFate }>): boolean {
  if (before.fate !== after.fate) return true;
  if (textMoved(before.line, after.line)) return true;
  return before.summary !== null && textMoved(before.summary, after.summary);
}

/** A level's id: the same on every run of the same climb, so a second copy takes the same turn. */
export function pathUpdateIdOf(digRunId: string, climbStep: number): string {
  return uuidOf(`debateai.path-update.v1:${digRunId.toLowerCase()}:${String(climbStep)}`);
}
/** One version per trigger: the same on every run. */
export function mainAnswerUpdateIdOf(rootRunId: string, triggerKind: MainAnswerTriggerKind, triggerId: string): string {
  return uuidOf(`debateai.main-answer-update.v1:${rootRunId.toLowerCase()}:${triggerKind}:${triggerId.toLowerCase()}`);
}
function uuidOf(seed: string): string {
  const hex = createHash("sha256").update(seed, "utf8").digest("hex");
  const variant = ((Number.parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** What a level is written from: the debate below, as the follow-up of the path above. */
export type ClimbChild = Readonly<{ picks: readonly PathRewritePick[]; digPaths: readonly PathRewriteDigPath[] }>;

/** What a main-answer version seals, under the root's key. */
export type MainAnswerContent = Readonly<{ v: 1; segments: readonly string[]; position_ref: string; trigger: "PATH_REWRITE" | "CHILD_PATH" | "PATH_ADDED" }>;

/**
 * V4 start step, Task 55e: a dig under the main question of a path debate, as the first debate's new first-level path. `positionRef`
 * names the path as the investigation does (the item its pick named, "more-kp07"; else `<b n>@<dig run>`); `free` is the dig's plan.
 */
export type AddedPath = Readonly<{ rootRunId: string; positionRef: string; free: boolean }>;

export type TreeUpdatePorts = Readonly<{
  tree: Pick<PostgresTreeUpdateRunnerRepository, "takeTurn" | "readTurn" | "record" | "readLine" | "readClimbNext" | "recordMainAnswer" | "readMainAnswers" | "markDigSettled">;
  /** The dig as its rewrite reads it: the main question with its purpose lines, Free, the level. Null: no dig, nothing to climb. */
  digOf: (runId: string) => Promise<PathRewriteDig | null>;
  /** A dig's own first rewrite (0134), with its text when it is a finished one. */
  ownRewriteOf: (digRunId: string) => Promise<Readonly<{ entry: PathRewriteEntry; text: Readonly<{ line: string; summary: string; fate: StoryFate }> | null }> | null>;
  parentPathOf: (input: Readonly<{ parentRunId: string; positionRef: string; baseRewriteId: string | null; baseUpdateId?: string | null }>) => Promise<PathRewriteParentPath>;
  /** The debate below: its picks and its own paths, each at its current text. Null: it has none stored. */
  childOf: (runId: string) => Promise<ClimbChild | null>;
  sealUpdate: (digRunId: string, updateId: string, content: PathRewriteContent) => Promise<WebSealed>;
  sealMainAnswer: (rootRunId: string, updateId: string, content: MainAnswerContent) => Promise<WebSealed>;
  /** A stored version's answer, opened under the root's key; null when it does not open. */
  openMainAnswer: (rootRunId: string, row: MainAnswerUpdateRead) => Promise<readonly string[] | null>;
  /** The tree as the report reads it, with the version before as the earlier answer. Null: the root cannot be read. */
  answerInputOf: (rootRunId: string, earlier: Readonly<{ version: number; segments: readonly string[] }> | null) => Promise<InvestigationCloseInput | null>;
  /** Whose name the version keeps as having paid, or null. */
  payerOf: (digRunId: string) => Promise<string | null>;
  /** What this dig has been charged for answer updates (spend source ANSWER_UPDATE). */
  answerSpentMicros: (digRunId: string) => Promise<number>;
  replayBookOf?: (runId: string, subjectItemId: string) => Promise<ReplayBook>;
  /**
   * V4 start step, Task 55e: `runId` as a first-level path of its first debate (a private dig under that debate's main question, both
   * path debates, each of the dig's paths with its answer so far), `pathRef` the dig's own path that changed (null: the dig's first).
   * Null for anything else. Absent (the public tree's ports): none, as before.
   */
  addedPathOf?: (runId: string, pathRef: string | null) => Promise<AddedPath | null>;
}>;

export type TreeUpdateSettings = Readonly<{
  ports: TreeUpdatePorts;
  roles: PathRewriteRoles;
  writerRoleRef: string;
  checkerRoleRef: string;
  contractHash?: string;
  /** Decision 28: Anthropic's free token count for the writer's calls; absent: the byte guard alone. */
  tokenCount?: TokenCounter;
  wait?: Readonly<{ pollMs: number; maxWaitMs: number; sleep?: (ms: number) => Promise<void> }>;
  /** Shared with the rewrite and both sweeps, so nothing runs a second copy beside a live one (paid twice). */
  inFlight?: PathRewriteInFlight;
  /**
   * V4 start step, Task 57p (0169; the owner's answer of 8 Nov, "On each piece's record"): the settings version a run's calls are charged
   * under now, read from the runner's one run → version map (`runSettingsVersions.versionOf`, main.ts); each row written notes it for
   * the DIG whose run its calls were charged to (a level's and a main-answer version's alike; never the root). Absent, or no version held for that run (local mode, tests): the row notes none (NULL).
   */
  settingsVersionOf?: (runId: string) => number | undefined;
  log?: (event: string, detail: Record<string, unknown>) => void;
  /**
   * THE ONE PLACE after a climb's rewrite is recorded, whatever it came out as: the path `positionRef` of `parentRunId` has a new row.
   * Awaited before the climb goes on; must not reject. `written`: what this copy wrote there, when it recorded the row and the path really
   * changed (owner Q-D8: composePathRewrite works this path's suggestions out again from it); null otherwise, so a level run again pays nothing.
   */
  afterLevel?: (level: Readonly<{ digRunId: string; parentRunId: string; positionRef: string; updateId: string; outcome: "CHANGED" | "STOPPED" | "LEFT" }>,
    written: ClimbLevelWritten | null) => Promise<void> | void;
}>;

/** A level's rewrite as `afterLevel` reads it: the path's new text and its points, the climb's own subject, writer and calls. */
export type ClimbLevelWritten = Readonly<{
  step: number; workItemId: string; free: boolean; question: PathRewriteDig["question"]; line: string; points: PathRewriteParentPath["points"];
  whatChanged: readonly string[]; writer: StoryRoleMaker; send: (maker: StoryRoleMaker, request: ProviderCallRequest) => Promise<ProviderCallResult>;
  log: Log;
}>;

/**
 * How far it went. STOPPED: nothing more to do for this dig, for good. LEFT: a level waited past the bound or the store failed; the sweep
 * goes on from there. NOTHING: the run has no finished rewrite of its own.
 */
export type TreeAdvance = "STOPPED" | "ANSWER_UPDATED" | "LEFT" | "NOTHING";

const DEFAULT_WAIT = Object.freeze({ pollMs: 5_000, maxWaitMs: 10 * 60_000 });
const BARE_STEP: StepLease = (use) => use();
const LOG_ERROR_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/u;
function codeOf(error: unknown): string {
  if (error instanceof TypedDomainError) return error.code;
  const code = typeof error === "object" && error !== null ? (error as { readonly code?: unknown }).code : undefined;
  if (typeof code === "string" && /^[0-9A-Z_]{1,64}$/u.test(code)) return `DATABASE:${code}`;
  return error instanceof Error && LOG_ERROR_NAME.test(error.name) ? error.name : "UNTYPED";
}
type Log = (event: string, detail: Record<string, unknown>) => void;
function safeLog(settings: TreeUpdateSettings): Log {
  return (event, detail) => {
    try {
      void Promise.resolve(settings.log?.(event, detail)).catch(() => undefined);
    } catch {
      // A failing log sink never costs the climb anything.
    }
  };
}
const finishedState = (state: string): boolean => state === "READY" || state === "READY_WITH_RESERVATION";

/** Where a climb goes from: the path that just changed, and what changed it. The PUBLIC lane starts one at a public dig's own row. */
export type ClimbStart = Readonly<{
  /** The dig that pays. */
  digRunId: string;
  /** The debate whose path changed, and that path. */
  debateRunId: string;
  positionRef: string;
  cause: Readonly<{ kind: "PATH_REWRITE" | "PATH_UPDATE"; id: string }>;
  /** The next level's step (1 above a dig's own rewrite). */
  step: number;
}>;

/**
 * A dig's own rewrite is stored: climb, and update the main answer, as far as the change goes. V4 start step, Task 55e: a run with no
 * rewrite of its own that is a first-level path its dig added (`addedPathOf`) updates the main answer itself (`addedPathUpdate`). Never
 * rejects.
 */
export async function advanceTree(settings: TreeUpdateSettings, digRunId: string, lease: StepLease = BARE_STEP): Promise<TreeAdvance> {
  const log = safeLog(settings);
  try {
    const own = await settings.ports.ownRewriteOf(digRunId);
    if (own === null) return await addedPathUpdate(settings, digRunId, lease);
    if (!finishedState(own.entry.state)) {
      // A failed rewrite leaves the path as it was and starts no climb: the dig has ended too.
      if (own.entry.state === "FAILED") await settings.ports.tree.markDigSettled(digRunId);
      return "NOTHING";
    }
    const rewriteId = own.entry.rewrite_id ?? null;
    const outcome = own.text === null || rewriteId === null ? "NOTHING" : await advanceFrom(settings, digRunId, own.entry, own.text, rewriteId, lease);
    // 0153: nothing more will be bought for this dig, so the test site's estimate stops holding it. An unwritten mark only keeps the hour's hold.
    if (outcome !== "LEFT") await settings.ports.tree.markDigSettled(digRunId);
    return outcome;
  } catch (error) {
    log("PATH_CLIMB_NOT_RECORDED", { runId: digRunId, code: codeOf(error) });
    return "LEFT";
  }
}

/**
 * V4 start step, Task 55e: THE HOOK once a run's story is written (index.ts's after-settle branch, through the path rewrite's settings). A
 * run that gets a story writes no rewrite (a first debate, or a dig under the main question), so only the added path is asked: a dig under
 * the main question of a path debate updates the main answer; anything else does nothing. Held in the shared in-flight set, so the sweep
 * never writes the same update beside it (paid twice). Never rejects; logs codes and ids only.
 */
export async function advanceAfterStory(settings: TreeUpdateSettings, runId: string, lease: StepLease = BARE_STEP): Promise<TreeAdvance> {
  const release = settings.inFlight === undefined ? () => undefined : settings.inFlight.begin(runId);
  if (release === null) return "LEFT";
  try {
    return await addedPathUpdate(settings, runId, lease);
  } catch (error) {
    safeLog(settings)("MAIN_ANSWER_ADDED_PATH_NOT_RECORDED", { runId, code: codeOf(error) });
    return "LEFT";
  } finally {
    release();
  }
}

/**
 * V4 start step, Task 55e (spec §4.4): a dig under the main question of a path debate added a first-level path, and the main answer
 * updates as for any first-level change, written by the same Overall-view writer and paid by the dig. Its trigger is the dig itself
 * (PATH_ADDED, the dig's run id), so a resume, the sweep or a second copy finds the one version and buys nothing. NOTHING for anything
 * else (a first debate, an R22 dig under the question, a dig whose paths are still argued): the sweep may ask again.
 */
async function addedPathUpdate(settings: TreeUpdateSettings, digRunId: string, lease: StepLease): Promise<TreeAdvance> {
  const added = settings.ports.addedPathOf === undefined ? null : await settings.ports.addedPathOf(digRunId, null);
  if (added === null) return "NOTHING";
  const outcome = await updateMainAnswer(settings, { digRunId, rootRunId: added.rootRunId, positionRef: added.positionRef, free: added.free,
    cause: Object.freeze({ kind: "PATH_ADDED" as const, id: digRunId }), lease });
  // 0153: nothing more will be bought for this dig's answer update.
  if (outcome !== "LEFT") await settings.ports.tree.markDigSettled(digRunId);
  return outcome;
}

async function advanceFrom(settings: TreeUpdateSettings, digRunId: string, entry: PathRewriteEntry, text: Readonly<{ line: string; summary: string; fate: StoryFate }>,
  rewriteId: string, lease: StepLease): Promise<TreeAdvance> {
  const start: ClimbStart = Object.freeze({ digRunId, debateRunId: entry.parent_run_id, positionRef: entry.position_ref,
    cause: Object.freeze({ kind: "PATH_REWRITE" as const, id: rewriteId }), step: 1 });
  const changed = await rewriteChanged(settings, entry, text, lease);
  if (changed === null) return "LEFT";
  if (!changed) {
    safeLog(settings)("PATH_CLIMB_NOT_CHANGED", { runId: digRunId, level: 0 });
    return "STOPPED";
  }
  return climbFrom(settings, start, lease);
}

/** Whether the dig's own rewrite really changed its path: its text against the line's newest text before its turn. Null: unread. */
async function rewriteChanged(settings: TreeUpdateSettings, entry: PathRewriteEntry, after: Readonly<{ line: string; summary: string; fate: StoryFate }>,
  lease: StepLease): Promise<boolean | null> {
  const ports = settings.ports;
  const line = await ports.tree.readLine(entry.parent_run_id);
  if (line === null) return null;
  const front = pathLineFrontOf(line, entry.position_ref, (candidate) => candidate.source === "PATH_REWRITE"
    && candidate.run_id.toLowerCase() === entry.run_id.toLowerCase());
  if (front === null) return null;
  const before = await ports.parentPathOf({ parentRunId: entry.parent_run_id, positionRef: entry.position_ref,
    baseRewriteId: front.base?.kind === "PATH_REWRITE" ? front.base.id : null, baseUpdateId: front.base?.kind === "PATH_UPDATE" ? front.base.id : null });
  return pathReallyChanged(before, after);
}

/**
 * From a path that really changed: each level above, then the main answer. `start.digRunId` pays, whoever that is; nothing here looks at who
 * asked the first debate. Throws only when the store itself fails; `advanceTree` and the PUBLIC lane's caller catch it.
 */
export async function climbFrom(settings: TreeUpdateSettings, start: ClimbStart, lease: StepLease = BARE_STEP): Promise<TreeAdvance> {
  const log = safeLog(settings);
  const ports = settings.ports;
  const dig = await ports.digOf(start.digRunId);
  if (dig === null) {
    log("PATH_CLIMB_DIG_UNREAD", { runId: start.digRunId });
    return "LEFT";
  }
  let debate = start.debateRunId;
  let positionRef = start.positionRef;
  let cause: ClimbStart["cause"] = start.cause;
  for (let step = start.step; step <= 10; step += 1) {
    const next = await ports.tree.readClimbNext(debate);
    if (next === null) {
      return updateMainAnswer(settings, { digRunId: start.digRunId, rootRunId: debate, positionRef, free: dig.free, cause, lease });
    }
    if (next.position_ref === null) {
      // V4 start step, Task 55e: a path a dig under the main question added is a first-level path, so its change updates the main answer.
      const added = ports.addedPathOf === undefined ? null : await ports.addedPathOf(debate, positionRef);
      if (added !== null) {
        return updateMainAnswer(settings, { digRunId: start.digRunId, rootRunId: added.rootRunId, positionRef: added.positionRef, free: dig.free,
          cause, lease });
      }
      // The debate hangs under the main question: no path above it to rewrite.
      log("PATH_CLIMB_UNDER_THE_QUESTION", { runId: start.digRunId, step });
      return "STOPPED";
    }
    const level = await writeLevel(settings, { digRunId: start.digRunId, dig, step, below: debate, parentRunId: next.parent_run_id,
      positionRef: next.position_ref, cause, lease }, log);
    if (level === "LEFT") return "LEFT";
    if (level === "STOPPED") return "STOPPED";
    cause = Object.freeze({ kind: "PATH_UPDATE" as const, id: pathUpdateIdOf(start.digRunId, step) });
    debate = next.parent_run_id;
    positionRef = next.position_ref;
  }
  log("PATH_CLIMB_TOO_DEEP", { runId: start.digRunId });
  return "STOPPED";
}

type Level = Readonly<{
  digRunId: string; dig: PathRewriteDig; step: number; below: string; parentRunId: string; positionRef: string;
  cause: ClimbStart["cause"] | null; lease: StepLease;
}>;

/**
 * Decision 13: a dig on a public debate writes its own rewrite here, as step 0 of its line (kind PUBLIC_DIG, 0138): the same writer and checker as a level above, the dig itself
 * as "the debate below", sealed under the dig's key. It holds the path until 0137's check settles. The caller reads what its row came out as.
 */
export async function writePublicDigLevel(settings: TreeUpdateSettings, input: Readonly<{ digRunId: string; dig: PathRewriteDig; lease?: StepLease }>):
  Promise<"CHANGED" | "STOPPED" | "LEFT"> {
  return writeLevel(settings, { digRunId: input.digRunId, dig: input.dig, step: 0, below: input.digRunId, parentRunId: input.dig.parentRunId,
    positionRef: input.dig.positionRef, cause: null, lease: input.lease ?? BARE_STEP }, safeLog(settings));
}

/** One level: its turn, the wait for the front, its row. CHANGED: go on; STOPPED: it came out unchanged or failed; LEFT: the sweep's. */
async function writeLevel(settings: TreeUpdateSettings, level: Level, log: Log): Promise<"CHANGED" | "STOPPED" | "LEFT"> {
  const ports = settings.ports;
  const updateId = pathUpdateIdOf(level.digRunId, level.step);
  const taken = await ports.tree.takeTurn({ updateId, runId: level.digRunId, parentRunId: level.parentRunId, positionRef: level.positionRef,
    kind: level.cause === null ? "PUBLIC_DIG" : "CLIMB", climbStep: level.step, causeKind: level.cause === null ? "DIG_SETTLED" : level.cause.kind satisfies PathUpdateCauseKind,
    causeId: level.cause?.id ?? null });
  if (taken !== "TAKEN" && taken !== "ALREADY") {
    log("PATH_CLIMB_TURN_REFUSED", { runId: level.digRunId, step: level.step, outcome: taken });
    return "STOPPED";
  }
  for (let tries = 0; tries < 3; tries += 1) {
    const turn = await frontOf(settings, updateId, level.digRunId, log);
    if (turn === null) return "LEFT";
    if (turn.state === "DONE") return levelOutcome(ports, level, updateId, log);
    const base: PathLineBase | null = turn.base_kind === null || turn.base_id === null ? null : Object.freeze({ kind: turn.base_kind, id: turn.base_id });
    const wrote: { level: ClimbLevelWritten | null } = { level: null };
    const record = await composeLevel(settings, level, updateId, base, log, (written) => { wrote.level = written; });
    // Task 57p: the level notes the version the dig's calls were charged under.
    const stored = await ports.tree.record({ ...record, settingsVersion: settings.settingsVersionOf?.(level.digRunId) ?? null });
    log("PATH_CLIMB_STORED", { runId: level.digRunId, step: level.step, outcome: record.outcome, changed: record.changed,
      failureCode: record.failureCode, stored });
    if (stored === "BASE_MOVED" || stored === "WAIT_TURN") continue;
    if (stored === "RECORDED" || stored === "ALREADY") {
      const outcome = stored === "RECORDED" ? (record.changed === true ? "CHANGED" as const : "STOPPED" as const) : await levelOutcome(ports, level, updateId, log);
      await settings.afterLevel?.(Object.freeze({ digRunId: level.digRunId, parentRunId: level.parentRunId, positionRef: level.positionRef, updateId, outcome }),
        stored === "RECORDED" && outcome === "CHANGED" ? wrote.level : null);
      return outcome;
    }
    return "STOPPED";
  }
  log("PATH_CLIMB_BASE_KEPT_MOVING", { runId: level.digRunId, step: level.step });
  return "LEFT";
}

/** A level already written (a resume, a second copy): what its row says. */
async function levelOutcome(ports: TreeUpdatePorts, level: Level, updateId: string, log: Log): Promise<"CHANGED" | "STOPPED" | "LEFT"> {
  const entry = (await ports.tree.readLine(level.parentRunId))?.find((candidate: PathLineEntry) => candidate.source === "PATH_UPDATE"
    && candidate.entry_id?.toLowerCase() === updateId.toLowerCase());
  if (entry === undefined) {
    log("PATH_CLIMB_ROW_UNREAD", { runId: level.digRunId, step: level.step });
    return "LEFT";
  }
  return entry.changed === true ? "CHANGED" : "STOPPED";
}

async function frontOf(settings: TreeUpdateSettings, updateId: string, digRunId: string, log: Log): Promise<PathUpdateTurnRead | null> {
  const wait = settings.wait ?? DEFAULT_WAIT;
  const sleep = settings.wait?.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const started = Date.now();
  for (let waited = 0; ; waited += wait.pollMs) {
    const turn = await settings.ports.tree.readTurn(updateId);
    if (turn === null) {
      log("PATH_CLIMB_NO_TURN", { runId: digRunId, updateId });
      return null;
    }
    if (turn.state !== "WAITING") return turn;
    if (waited >= wait.maxWaitMs || Date.now() - started >= wait.maxWaitMs) {
      log("PATH_CLIMB_LEFT_TO_SWEEP", { runId: digRunId, updateId, waitingFor: turn.waiting_for });
      return null;
    }
    await sleep(wait.pollMs);
  }
}

function failedLevel(updateId: string, base: PathLineBase | null, fateBefore: StoryFate, failureCode: string, written: PathRewriteWritten | null): PathUpdateRecord {
  const rounds = written?.rounds ?? [];
  const last = rounds.at(-1);
  return Object.freeze({
    updateId, basedOn: base, outcome: "FAILED" as const, failureCode, changed: null, fateBefore, fateAfter: null,
    writerLineage: last === undefined ? null : lineageRecord(last.writer.lineage),
    checkerLineage: last === undefined || last.checker === null ? null : lineageRecord(last.checker.lineage),
    rounds: rounds.length,
    artifactRefs: Object.freeze(rounds.flatMap((round) => [round.writer.artifactRef, ...(round.checker === null ? [] : [round.checker.artifactRef])])),
    content: null
  });
}

export const pathClimbSubjectOf = (updateId: string): string => `path-climb:${updateId}`;

/** The level's row: always one, FAILED when its material cannot be read or every writer failed. */
async function composeLevel(settings: TreeUpdateSettings, level: Level, updateId: string, base: PathLineBase | null, log: Log,
  onWritten: (written: ClimbLevelWritten) => void): Promise<PathUpdateRecord> {
  const ports = settings.ports;
  const runId = level.digRunId;
  let parent: PathRewriteParentPath;
  try {
    parent = await ports.parentPathOf({ parentRunId: level.parentRunId, positionRef: level.positionRef,
      baseRewriteId: base?.kind === "PATH_REWRITE" ? base.id : null, baseUpdateId: base?.kind === "PATH_UPDATE" ? base.id : null });
  } catch (error) {
    log("PATH_CLIMB_PARENT_UNREAD", { runId, step: level.step, code: codeOf(error) });
    return failedLevel(updateId, base, "SET_ASIDE", "PATH_REWRITE_PARENT_UNREAD", null);
  }
  const failed = (code: string, written: PathRewriteWritten | null = null) => failedLevel(updateId, base, parent.fate, code, written);
  try {
    const child = await ports.childOf(level.below);
    if (child === null || child.digPaths.length === 0) return failed("PATH_REWRITE_INPUT_UNREAD");
    const built = await fitRewriteToTokenLine({ question: level.dig.question, parent, picks: child.picks, digPaths: child.digPaths }, settings.tokenCount, log);
    if (built.kind === "TOO_LARGE") {
      log("PATH_CLIMB_MATERIAL_TOO_LARGE", { runId, step: level.step, bodyBytes: built.bodyBytes });
      return failed("PATH_REWRITE_MATERIAL_TOO_LARGE");
    }
    const writer = settings.roles.resolveProvider?.(settings.writerRoleRef) ?? null;
    const checker = settings.roles.resolveProvider?.(settings.checkerRoleRef) ?? null;
    if (writer === null || checker === null) return failed("PATH_REWRITE_ROLE_UNAVAILABLE");
    const subject = pathClimbSubjectOf(updateId);
    const book = ports.replayBookOf === undefined ? null : await level.lease(() => ports.replayBookOf!(runId, subject));
    const send = (maker: StoryRoleMaker, request: ProviderCallRequest): Promise<ProviderCallResult> => {
      const gateway = book === null ? maker.provider : replayingGateway(book, maker.provider);
      return level.lease(() => gateway.call(request));
    };
    const question = level.dig.question;
    const written = await writePathRewrite({
      runId, subjectItemId: subject, contractHash: settings.contractHash ?? engineContractHash(), family: "PATH_CLIMB",
      maxRounds: level.dig.free ? PATH_REWRITE_POLICY.freeMaxRounds : PATH_REWRITE_POLICY.maxRounds,
      writer, checker, backupCandidates: settings.roles.backupCandidates ?? [], backupMakers: settings.roles.backupMakers,
      material: built.material, send, guard: pathRewriteGuard,
      writerLanguageCheck: replyLanguageCheckFor(question.line, question.language, PATH_REWRITE_PROSE),
      checkerLanguageCheck: replyLanguageCheckFor(question.line, question.language, PATH_REWRITE_CHECKER_PROSE),
      log: (event, detail) => log(event, { runId, step: level.step, ...detail })
    });
    const outcome = written.outcome;
    if (outcome.outcome === "FAILED") {
      log("PATH_CLIMB_LOOP_FAILED", { runId, step: level.step, failureCode: outcome.failureCode, cause: outcome.cause });
      return failed(pathRewriteFailureCode(outcome.failureCode), written);
    }
    const served = written.rounds.find((round) => round.round === outcome.servedRound)!;
    const body = outcome.body;
    // Decision 13: a public dig's own rewrite also seals its paths' points: what goes on the page beside it, for a later dig to read.
    const content: PathRewriteContent = level.cause !== null ? contentOf(body, built.pointIds, built.digPathRefs)
      : Object.freeze({ ...contentOf(body, built.pointIds, built.digPathRefs),
        public_points: Object.freeze(child.digPaths.map((path) => Object.freeze({ position_ref: path.positionRef, points: Object.freeze(path.points) }))) });
    const sealed = await ports.sealUpdate(runId, updateId, content);
    onWritten(Object.freeze({ step: level.step, workItemId: subject, free: level.dig.free, question, line: body.line, points: parent.points,
      whatChanged: content.what_changed, writer, send, log: (event: string, detail: Record<string, unknown>) => log(event, { runId, step: level.step, ...detail }) }));
    return Object.freeze({
      updateId, basedOn: base, outcome: outcome.outcome, failureCode: null,
      changed: pathReallyChanged(parent, { line: body.line, summary: body.summary, fate: body.fate }),
      fateBefore: parent.fate, fateAfter: body.fate,
      writerLineage: lineageRecord(served.writer.lineage),
      checkerLineage: served.checker === null ? null : lineageRecord(served.checker.lineage),
      rounds: written.rounds.length,
      artifactRefs: Object.freeze(written.rounds.flatMap((round) => [round.writer.artifactRef, ...(round.checker === null ? [] : [round.checker.artifactRef])])),
      content: sealed
    });
  } catch (error) {
    log("PATH_CLIMB_COMPOSE_FAILED", { runId, step: level.step, code: codeOf(error) });
    return failed("PATH_REWRITE_UNEXPECTED_ERROR");
  }
}

/* ----------------------------------------------------------------- the main answer */

export const mainAnswerSubjectOf = (updateId: string): string => `main-answer-update:${updateId}`;
const mainFailureCode = (storyCode: string): string =>
  investigationReportFailureCode(storyCode).replace(/^INVESTIGATION_REPORT_/u, "MAIN_ANSWER_");

/** One root's updates, one after another in this process: a second written on an answer that just moved would be paid for nothing. */
const ROOT_LINES = new Map<string, Promise<unknown>>();
function inRootLine<T>(rootRunId: string, work: () => Promise<T>): Promise<T> {
  const key = rootRunId.toLowerCase();
  const running = (ROOT_LINES.get(key) ?? Promise.resolve()).then(work, work);
  const settled = running.catch(() => undefined).finally(() => { if (ROOT_LINES.get(key) === settled) ROOT_LINES.delete(key); });
  ROOT_LINES.set(key, settled);
  return running;
}

type AnswerUpdate = Readonly<{
  digRunId: string; rootRunId: string; positionRef: string; free: boolean; cause: Readonly<{ kind: MainAnswerTriggerKind; id: string }>; lease: StepLease;
}>;
/** The page's name for what made a version: 0138's PATH_UPDATE (a climb's level) is CHILD_PATH; the other two keep theirs. */
const contentTriggerOf = (kind: MainAnswerTriggerKind): MainAnswerContent["trigger"] => kind === "PATH_UPDATE" ? "CHILD_PATH" : kind;

async function updateMainAnswer(settings: TreeUpdateSettings, update: AnswerUpdate): Promise<TreeAdvance> {
  return inRootLine(update.rootRunId, async () => {
    const log = safeLog(settings);
    const ports = settings.ports;
    const trigger = update.cause.kind satisfies MainAnswerTriggerKind;
    const updateId = mainAnswerUpdateIdOf(update.rootRunId, trigger, update.cause.id);
    // A rebuild on a newer version is written once more; a third version arriving meanwhile is left to the sweep.
    for (let tries = 0; tries < 3; tries += 1) {
      const versions = await ports.tree.readMainAnswers(update.rootRunId);
      if (versions === null) {
        log("MAIN_ANSWER_NOT_LIVE", { runId: update.digRunId });
        return "STOPPED";
      }
      if (versions.some((row) => row.trigger_kind === trigger && row.trigger_id.toLowerCase() === update.cause.id.toLowerCase())) return "ANSWER_UPDATED";
      const newest = versions.filter((row) => finishedState(row.outcome)).at(-1) ?? null;
      const record = await composeAnswer(settings, update, updateId, newest, log);
      // Task 57p: the version notes the settings its calls were charged under: the dig's, never the root's.
      const stored = await ports.tree.recordMainAnswer({ ...record, settingsVersion: settings.settingsVersionOf?.(update.digRunId) ?? null });
      log("MAIN_ANSWER_STORED", { runId: update.digRunId, outcome: record.outcome, failureCode: record.failureCode, stored: stored.outcome, version: stored.answerSeq });
      if (stored.outcome === "BASE_MOVED") continue;
      return "ANSWER_UPDATED";
    }
    return "LEFT";
  });
}

async function composeAnswer(settings: TreeUpdateSettings, update: AnswerUpdate, updateId: string, newest: MainAnswerUpdateRead | null, log: Log) {
  const ports = settings.ports;
  const runId = update.digRunId;
  const root = update.rootRunId;
  const payer = await ports.payerOf(runId).catch(() => null);
  const base = { updateId, rootRunId: root, basedOnUpdateId: newest?.update_id ?? null, triggerKind: update.cause.kind satisfies MainAnswerTriggerKind,
    triggerId: update.cause.id, triggerRunId: runId, paidByOwnerRef: payer };
  const failed = async (failureCode: string, rounds: number, artifactRefs: readonly string[]) => Object.freeze({ ...base, outcome: "FAILED" as const, failureCode,
    writerLineage: null, checkerLineage: null, rounds, artifactRefs, spentMicros: await spentOf(ports, runId), content: null });
  try {
    const earlierSegments = newest === null ? null : await ports.openMainAnswer(root, newest);
    const earlier = newest === null || earlierSegments === null ? null : Object.freeze({ version: newest.answer_seq, segments: earlierSegments });
    const read = await ports.answerInputOf(root, earlier);
    if (read === null) return await failed("MAIN_ANSWER_INPUT_UNREAD", 0, []);
    const dossier = await fitDossierToTokenLine(read.input, settings.tokenCount, log);
    if (dossier.kind === "TOO_LARGE") {
      log("MAIN_ANSWER_DOSSIER_TOO_LARGE", { runId, bodyBytes: dossier.bodyBytes });
      return await failed("MAIN_ANSWER_DOSSIER_TOO_LARGE", 0, []);
    }
    const writer = settings.roles.resolveProvider?.(settings.writerRoleRef) ?? null;
    const checker = settings.roles.resolveProvider?.(settings.checkerRoleRef) ?? null;
    if (writer === null || checker === null) return await failed("MAIN_ANSWER_ROLE_UNAVAILABLE", 0, []);
    const subject = mainAnswerSubjectOf(updateId);
    const book = ports.replayBookOf === undefined ? null : await update.lease(() => ports.replayBookOf!(runId, subject));
    const send = (maker: StoryRoleMaker, request: ProviderCallRequest): Promise<ProviderCallResult> => {
      const gateway = book === null ? maker.provider : replayingGateway(book, maker.provider);
      return update.lease(() => gateway.call(request));
    };
    const language = read.input.question.language;
    const written = await writeOverallAnswer({
      runId, subjectItemId: subject, contractHash: settings.contractHash ?? engineContractHash(), callSiteOf: answerUpdateCallSiteKey,
      maxRounds: update.free ? INVESTIGATION_REPORT_POLICY.freeMaxRounds : INVESTIGATION_REPORT_POLICY.maxRounds,
      later: read.input.earlier !== null,
      // V4 start step, Task 50c: the root's stated goal (its purpose lines, read with the material); a later version asks its own draft.
      goalStated: read.goalStated === true,
      writer, checker, backupCandidates: settings.roles.backupCandidates ?? [], backupMakers: settings.roles.backupMakers,
      material: dossier.material, send, guard: investigationReportGuard, randomBytes: closingRandomBytes(cryptoRandomBytes(32)),
      answerLanguageCheck: replyLanguageCheckFor(read.questionLine, language, REPORT_ANSWER_PROSE),
      checkerLanguageCheck: replyLanguageCheckFor(read.questionLine, language, REPORT_CHECKER_PROSE),
      log: (event, detail) => log(event, { runId, ...detail })
    });
    const refs = Object.freeze(written.rounds.flatMap((round) => [round.writer.artifactRef, ...(round.checker === null ? [] : [round.checker.artifactRef])]));
    const outcome = written.outcome;
    if (outcome.outcome === "FAILED") {
      log("MAIN_ANSWER_LOOP_FAILED", { runId, failureCode: outcome.failureCode, cause: outcome.cause });
      return await failed(mainFailureCode(outcome.failureCode), written.rounds.length, refs);
    }
    const served = written.rounds.find((round) => round.round === outcome.servedRound)!;
    const sealed = await ports.sealMainAnswer(root, updateId, Object.freeze({ v: 1 as const,
      segments: Object.freeze(outcome.body.segments.map((segment) => segment.text)), position_ref: update.positionRef,
      trigger: contentTriggerOf(update.cause.kind) }));
    return Object.freeze({ ...base, outcome: outcome.outcome, failureCode: null,
      writerLineage: lineageRecord(served.writer.lineage),
      checkerLineage: served.checker === null ? null : lineageRecord(served.checker.lineage),
      rounds: written.rounds.length, artifactRefs: refs, spentMicros: await spentOf(ports, runId), content: sealed });
  } catch (error) {
    log("MAIN_ANSWER_COMPOSE_FAILED", { runId, code: codeOf(error) });
    return failed("MAIN_ANSWER_UNEXPECTED_ERROR", 0, []);
  }
}

async function spentOf(ports: TreeUpdatePorts, runId: string): Promise<number> {
  const spent = await ports.answerSpentMicros(runId).catch(() => 0);
  return Math.min(Math.max(0, Math.trunc(spent)), 100_000_000);
}

/* ----------------------------------------------------------------- the sweep */

/**
 * THE TREE'S SWEEP. A runner that stops between a dig's row and the top of its climb leaves nothing saying a level is owed, so every few
 * minutes, and once at boot, it goes over the digs whose rewrite or climb called an AI lately and has stood still since (`list`), and runs
 * `advanceTree` for each: the rows already there are walked, free, and it goes on at the first one missing. A dig it finished in this process
 * is not asked again. `paused`: a retiring release starts nothing new. V4 start step, Task 55e: the list also holds each dig under the main
 * question of a path debate whose paths' answers so far stood still with no main-answer version of its own yet, so an update a runner left
 * undone (it stopped after the dig's story, or its update was left) is written here.
 */
export type TreeSweepSettings = Readonly<{
  tree: TreeUpdateSettings;
  /** Each dig whose rewrite or climb called an AI between the two times (and, Task 55e, each added path still owed its version). */
  list: (since: Date, before: Date, limit: number) => Promise<readonly string[]>;
  staleMs?: number;
  /** How far back it looks (longer than any stop of the runner a person would not notice). */
  windowMs?: number;
  limit?: number;
  /**
   * V4 start step, Task 57l: before a dig's climb or main-answer update, the dig (whose run every call names) is mapped to the settings
   * version it owns now (run-settings.ts `runVersionMapper`; Task 57o: today's if its own is refused, 57o-fix: the owners' switched-on one): this process may never have claimed it.
   * A dig whose version could not be mapped (a database failure) is skipped and logged, nothing sent, and asked again on a later pass.
   * Absent: as before.
   */
  mapRun?: (runId: string) => Promise<void>;
  now?: () => Date;
}>;

export const TREE_SWEEP_DEFAULTS = Object.freeze({ staleMs: 20 * 60_000, windowMs: 3 * 24 * 60 * 60_000, limit: 200, everyMs: 5 * 60_000 });

export type TreeSweepPass = Readonly<{ listed: number; advanced: number; skipped: number }>;

export async function sweepTreeUpdates(settings: TreeSweepSettings, finished: Set<string> = new Set()): Promise<TreeSweepPass> {
  const log = safeLog(settings.tree);
  const now = (settings.now ?? (() => new Date()))().getTime();
  let listed: readonly string[];
  try {
    listed = await settings.list(new Date(now - (settings.windowMs ?? TREE_SWEEP_DEFAULTS.windowMs)),
      new Date(now - (settings.staleMs ?? TREE_SWEEP_DEFAULTS.staleMs)), settings.limit ?? TREE_SWEEP_DEFAULTS.limit);
  } catch (error) {
    log("TREE_SWEEP_UNREAD", { code: codeOf(error) });
    return Object.freeze({ listed: 0, advanced: 0, skipped: 0 });
  }
  let advanced = 0;
  let skipped = 0;
  for (const digRunId of listed) {
    const key = digRunId.toLowerCase();
    if (finished.has(key)) continue;
    const release = settings.tree.inFlight === undefined ? () => undefined : settings.tree.inFlight.begin(digRunId);
    if (release === null) { skipped += 1; continue; }
    try {
      try {
        await settings.mapRun?.(digRunId);
      } catch (error) {
        log("TREE_SWEEP_UNMAPPED", { runId: digRunId, code: codeOf(error) });
        skipped += 1;
        continue;
      }
      const outcome = await advanceTree(settings.tree, digRunId);
      if (outcome === "LEFT") { skipped += 1; continue; }
      // No finished rewrite yet: its own sweep writes it, and this one looks again.
      if (outcome !== "NOTHING") finished.add(key);
      advanced += 1;
    } finally {
      release();
    }
  }
  return Object.freeze({ listed: listed.length, advanced, skipped });
}

export function startTreeSweep(settings: TreeSweepSettings & Readonly<{ everyMs?: number; paused?: () => boolean }>)
  : Readonly<{ stop: () => void; idle: () => Promise<void> }> {
  let running: Promise<unknown> = Promise.resolve();
  let busy = false;
  const finished = new Set<string>();
  const pass = (): void => {
    if (busy || settings.paused?.() === true) return;
    busy = true;
    running = sweepTreeUpdates(settings, finished).catch(() => undefined).finally(() => { busy = false; });
  };
  pass();
  const timer = setInterval(pass, settings.everyMs ?? TREE_SWEEP_DEFAULTS.everyMs);
  timer.unref?.();
  return Object.freeze({ stop: () => { clearInterval(timer); }, idle: () => running.then(() => undefined) });
}
