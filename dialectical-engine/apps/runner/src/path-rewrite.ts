import { createHash } from "node:crypto";
import { DIG_LEVEL_MAX, type MakerLineage, type StoryFate } from "@debateai/contract";
import type { PathRewriteRecord, PostgresDigModelRunnerRepository, RewriteTurnRead, WebSealed } from "@debateai/db";
import { TypedDomainError, replyLanguageCheckFor } from "@debateai/kernel";
import type { ProviderCallRequest, ProviderCallResult } from "@debateai/providers";
import { PATH_REWRITE_POLICY } from "@debateai/register";
import {
  PATH_REWRITE_CHECKER_PROSE, PATH_REWRITE_PROSE, pathRewriteFailureCode, writePathRewrite, type PathRewriteDraft,
  type PathRewriteWritten, type StoryNodeEnrichment, type StoryRoleMaker, type StoryWriteInput
} from "@debateai/story";
import { engineContractHash } from "./engine-contracts.js";
import {
  buildPathRewriteMaterial, pathRewriteDigPathsOf, pathRewriteGuard, type PathRewriteDigPath, type PathRewriteExtract,
  type PathRewriteParentPath, type PathRewritePick, type PathRewriteQuestion
} from "./path-rewrite-material.js";
import { replayingGateway, type ReplayBook } from "./run-replay.js";

/**
 * THE PATH REWRITE (dig-model revision 2026-10-30, task W3-5; owner answers Q-D1 to Q-D14). When a dig's run settles (an
 * ask with a parent), it keeps its points AND its AI-written answer text; only its story is dropped (Q-D13). In the
 * story's place, after the run's lease is released (index.ts, the after-settle branch), the runner rewrites the path the
 * dig was dug from:
 *  1. it takes the path's turn (0134's identity.take_path_rewrite_turn): the rewrites of one path are written one after
 *     another, in the order their digs finished;
 *  2. it waits until its turn is at the FRONT, then reads the path's current text on the turn's base (the newest checked
 *     rewrite before it, or the story's line and fate) and builds the material (path-rewrite-material.ts);
 *  3. the writer (Claude Haiku 5.5, draft 5.1) and the checker (GLM, draft 5.2; Luna later) run at most 2 rounds (1 on
 *     Free, Q-D14), then a backup writer of another maker, as the story does (packages/story/src/path-rewrite.ts);
 *  4. it stores ONE row (identity.record_path_rewrite), its text sealed under the DIG's run key. EVERY turn ends with a
 *     row: when every writer failed, or the parent path or the dig's own material could not be read, the row is FAILED
 *     and the path keeps its text; otherwise later digs of the path would wait for ever. A turn whose store cannot be read
 *     or written at all is left to the sweep (path-rewrite-sweep.ts, W3-7), which writes it once the store answers.
 *  5. then W4-3's suggestions for the dig's own paths are asked for (the `afterRewrite` hook; none at level 10).
 *
 * W3-7: before it takes its turn, the dig's own paths are stored (0135's identity.path_rewrite_input, `recordInput`), so
 * a rewrite whose runner stopped is built again by the sweep from the store alone, byte for byte, its answered calls
 * replayed. WAITING behind an earlier dig holds this task at most `wait.maxWaitMs` (10 minutes, polling every 5 seconds);
 * past it the turn is left to the sweep, which writes it once it reaches the front.
 *
 * MONEY: every call is the dig's run's, on the story lane at `PATH_REWRITE:WRITER:{round}` / `PATH_REWRITE:CHECKER:{round}`,
 * charged as spend source PATH_REWRITE inside the dig's estimate and never walled. The gateway's scope for those call
 * sites and the PATH_REWRITE money seam belong to the W3-2 lane (packages/budget model-spend.ts and its runner hook):
 * until they land, the gateway refuses these call sites before anything is sent or spent, and the rewrite is stored FAILED.
 *
 * REPLAY: the material is built by code, so a resumed rewrite sends byte-identical prompts (the replay book's fingerprint,
 * fence and canary masked), and the dig's recorded rewrite calls are answered from the record, free (`replayBookOf`).
 *
 * It never rejects: whatever a provider, the store or a defect does is logged by code and ids only.
 */

export type PathRewriteDig = Readonly<{
  parentRunId: string;
  /** The path the dig's picks came from (Q-D1: one path). */
  positionRef: string;
  /** 1 to 10. */
  level: number;
  /** Free runs one round (Q-D14). */
  free: boolean;
  /** The investigation's main question with its step-2 lines and the reading level. */
  question: PathRewriteQuestion;
  picks: readonly PathRewritePick[];
}>;

/** What the rewrite reads besides the settled run's own snapshot. */
export type PathRewriteSources = Readonly<{
  /** The settled run as a dig, or null when it is none (a first debate: it gets its story). */
  digOf: (runId: string) => Promise<PathRewriteDig | null>;
  /** The parent path on `baseRewriteId` (the newest checked rewrite before the dig's turn; null: the story's line). */
  parentPathOf: (input: Readonly<{ parentRunId: string; positionRef: string; baseRewriteId: string | null }>) => Promise<PathRewriteParentPath>;
  /** The second AI's reviews of the dig's points (the story's enrichment reader). */
  readEnrichment: (input: Readonly<{ runId: string; nodes: readonly Readonly<{ nodeId: string; judgeArtifactRef: string | null }>[] }>)
    => Promise<ReadonlyMap<string, Pick<StoryNodeEnrichment, "reviewOutcome">>>;
  /** The checked extracts the dig's own points cite, by point id; absent: none. */
  digExtractsOf?: (runId: string, pointIds: readonly string[]) => Promise<ReadonlyMap<string, readonly PathRewriteExtract[]>>;
  /** W3-7 (0135): stores the dig's own paths and its work item before it takes its turn; absent: nothing stored. */
  recordInput?: (runId: string, workItemId: string, digPaths: readonly PathRewriteDigPath[]) => Promise<string>;
  /** W3-7: what `recordInput` stored, for the sweep; null when nothing was. */
  storedInputOf?: (runId: string) => Promise<PathRewriteStoredInput | null>;
  /**
   * W3-7: the codes a FAILED row needs when the parent path's text cannot be read: the answer version and the fate the
   * path had, from clear columns only. Absent or failing: UNKNOWN_PARENT_CODES (a FAILED row's fate is never served).
   */
  parentCodesOf?: (input: Readonly<{ parentRunId: string; positionRef: string; baseRewriteId: string | null }>)
    => Promise<Readonly<{ answerVersion: number; fate: StoryFate }>>;
}>;

/** W3-7: the dig's own paths as its settled run gave them to the rewrite, and the work item its calls name. */
export type PathRewriteStoredInput = Readonly<{ workItemId: string; digPaths: readonly PathRewriteDigPath[] }>;

/** The members a rewrite may call: the run's own (after settle) or the runner's configured ones (the sweep). */
export type PathRewriteRoles = Pick<StoryWriteInput, "resolveProvider" | "backupCandidates" | "backupMakers">;

/** W3-7: the digs a rewrite is running for in this process, so the sweep never starts a second copy (paid twice). */
export type PathRewriteInFlight = Readonly<{ begin: (digRunId: string) => (() => void) | null; has: (digRunId: string) => boolean }>;
export function createPathRewriteInFlight(): PathRewriteInFlight {
  const running = new Set<string>();
  return Object.freeze({
    begin: (digRunId: string) => {
      const key = digRunId.toLowerCase();
      if (running.has(key)) return null;
      running.add(key);
      return () => { running.delete(key); };
    },
    has: (digRunId: string) => running.has(digRunId.toLowerCase())
  });
}

export type PathRewriteTurns = Pick<PostgresDigModelRunnerRepository, "takeRewriteTurn" | "readRewriteTurn" | "recordRewrite">;

/** The rewrite's text, as it is sealed (refs already turned back into ids; never a ref, never a score). */
export type PathRewriteContent = Readonly<{
  text: Readonly<{ line: string; summary: string; fate: StoryFate }>;
  what_changed: readonly string[];
  view_reason: string | null;
  dig_paths: readonly Readonly<{ position_ref: string; line: string; fate: StoryFate }>[];
}>;

/** What W4-3's hook is handed once the row is stored. */
export type PathRewriteSettled = Readonly<{
  digRunId: string; parentRunId: string; positionRef: string; level: number; outcome: PathRewriteRecord["outcome"];
  /** The dig's own paths (the suggestions are for them). */
  digPathRefs: readonly string[];
}>;

export type PathRewriteRunnerSettings = Readonly<{
  sources: PathRewriteSources;
  turns: PathRewriteTurns;
  /** Seals the content under the DIG's run key (carrier PATH_REWRITE_CARRIER, primary key the rewrite id). */
  seal: (digRunId: string, rewriteId: string, content: PathRewriteContent) => Promise<WebSealed>;
  /** The writer's and the checker's provider refs (Haiku, GLM), resolved among the run's claim-eligible members. */
  writerRoleRef: string;
  checkerRoleRef: string;
  /** The dig's recorded rewrite calls, for a rewrite run again after its runner stopped; absent: nothing replayed. */
  replayBookOf?: (runId: string, workItemId: string) => Promise<ReplayBook>;
  /** How a turn behind another waits for the front (W3-7: 5 seconds, at most 10 minutes; then the sweep's). */
  wait?: Readonly<{ pollMs: number; maxWaitMs: number; sleep?: (ms: number) => Promise<void> }>;
  /** W3-7: shared with the sweep; absent: none kept (a test, or a runner without the sweep). */
  inFlight?: PathRewriteInFlight;
  /** engineContractHash(): absent, the code's own. */
  contractHash?: string;
  log?: (event: string, detail: Record<string, unknown>) => void;
  /**
   * W4-3's hook (not built here): asked once the dig's row is stored and the dig is above level 10, so the suggestions
   * for the dig's own paths start. None at level 10 (DIG_LEVEL_MAX): a dig there cannot be dug further.
   */
  afterRewrite?: (settled: PathRewriteSettled) => Promise<void> | void;
}>;

const DEFAULT_WAIT = Object.freeze({ pollMs: 5_000, maxWaitMs: 10 * 60_000 });
/**
 * W3-7: a FAILED row's codes when neither the parent's text nor its clear codes could be read. The table needs a version
 * and a fate before; a FAILED rewrite changes nothing and its fate is never served (the contract's FAILED entry has none).
 */
export const UNKNOWN_PARENT_CODES = Object.freeze({ answerVersion: 1, fate: "SET_ASIDE" as StoryFate });
const LOG_ERROR_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/u;
const BARE_STEP = <T>(use: () => Promise<T>): Promise<T> => use();

function codeOf(error: unknown): string {
  if (error instanceof TypedDomainError) return error.code;
  const code = typeof error === "object" && error !== null ? (error as { readonly code?: unknown }).code : undefined;
  if (typeof code === "string" && /^[0-9A-Z_]{1,64}$/u.test(code)) return `DATABASE:${code}`;
  return error instanceof Error && LOG_ERROR_NAME.test(error.name) ? error.name : "UNTYPED";
}

/** The rewrite's id, one per dig: the same on every run of the same dig, so a second write is ALREADY. */
export function pathRewriteIdOf(digRunId: string): string {
  const hex = createHash("sha256").update(`debateai.path-rewrite.v1:${digRunId.toLowerCase()}`, "utf8").digest("hex");
  const variant = ((Number.parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/**
 * The after-settle branch's one call (index.ts): true when the settled run is a dig, whose path rewrite then ran in the
 * story's place (stored, failed, or left waiting behind an earlier dig for the sweep); false when it is none, or when the
 * runner has no rewrite settings, or when whether it is a dig could not be read: the story is written as today. Never
 * rejects.
 */
export async function runDigPathRewrite(settings: PathRewriteRunnerSettings | undefined, input: StoryWriteInput): Promise<boolean> {
  if (settings === undefined) return false;
  const log = safeLog(settings);
  const lease = input.stepLease ?? BARE_STEP;
  let dig: PathRewriteDig | null;
  try {
    dig = await lease(() => settings.sources.digOf(input.runId));
  } catch (error) {
    log("PATH_REWRITE_DIG_UNREAD", { runId: input.runId, code: codeOf(error) });
    return false;
  }
  if (dig === null) return false;
  const release = settings.inFlight === undefined ? () => undefined : settings.inFlight.begin(input.runId);
  if (release === null) {
    log("PATH_REWRITE_ALREADY_RUNNING", { runId: input.runId });
    return true;
  }
  try {
    // The dig's own paths, read once: they are the settled run's, and do not move with the parent's base. A read that
    // fails still takes the turn and ends it FAILED, so the path's later digs never wait on it.
    let digPaths: readonly PathRewriteDigPath[] | null = null;
    try {
      digPaths = await digPathsOf(settings, input, lease);
    } catch (error) {
      log("PATH_REWRITE_DIG_PATHS_UNREAD", { runId: input.runId, code: codeOf(error) });
    }
    if (digPaths !== null && settings.sources.recordInput !== undefined) {
      try {
        const stored = await lease(() => settings.sources.recordInput!(input.runId, input.workItemId, digPaths!));
        log("PATH_REWRITE_INPUT_STORED", { runId: input.runId, stored });
      } catch (error) {
        // The rewrite goes on; only a runner that stops before its row is then not built again.
        log("PATH_REWRITE_INPUT_NOT_STORED", { runId: input.runId, code: codeOf(error) });
      }
    }
    await rewriteThePath(settings, Object.freeze({
      digRunId: input.runId, parentRunId: dig.parentRunId, positionRef: dig.positionRef, dig, workItemId: input.workItemId, digPaths,
      roles: input, lease, failureCode: digPaths === null ? "PATH_REWRITE_DIG_PATHS_UNREAD" : null
    }), log);
  } catch (error) {
    log("PATH_REWRITE_NOT_RECORDED", { runId: input.runId, code: codeOf(error) });
  } finally {
    release();
  }
  return true;
}

async function digPathsOf(settings: PathRewriteRunnerSettings, input: StoryWriteInput, lease: StepLease): Promise<readonly PathRewriteDigPath[]> {
  const digRunId = input.runId;
  const enrichment = await lease(() => settings.sources.readEnrichment({ runId: digRunId,
    nodes: input.nodes.map((node) => ({ nodeId: node.nodeId, judgeArtifactRef: input.judgeArtifactRefs.get(node.nodeId) ?? null })) }));
  const pathsWithoutSources = pathRewriteDigPathsOf(input, enrichment);
  const extracts = settings.sources.digExtractsOf === undefined ? new Map<string, readonly PathRewriteExtract[]>()
    : await lease(() => settings.sources.digExtractsOf!(digRunId, pathsWithoutSources.flatMap((path) => path.points.map((point) => point.id))));
  return pathRewriteDigPathsOf(input, enrichment, extracts);
}

function safeLog(settings: PathRewriteRunnerSettings): (event: string, detail: Record<string, unknown>) => void {
  return (event, detail) => {
    try {
      const returned: unknown = settings.log?.(event, detail);
      void Promise.resolve(returned).catch(() => undefined);
    } catch {
      // A failing log sink never costs the rewrite anything.
    }
  };
}

type Log = (event: string, detail: Record<string, unknown>) => void;
type StepLease = <T>(use: () => Promise<T>) => Promise<T>;

/**
 * One rewrite to write: the dig's turn on its parent's path, with what its material is built from. `dig` and `digPaths`
 * null: they could not be read, and the turn ends FAILED with `failureCode`.
 */
export type PathRewriteJob = Readonly<{
  digRunId: string; parentRunId: string; positionRef: string;
  dig: PathRewriteDig | null;
  workItemId: string;
  digPaths: readonly PathRewriteDigPath[] | null;
  roles: PathRewriteRoles;
  lease: StepLease;
  failureCode: string | null;
}>;

/** Waits until the dig's turn is at the front (or done); null when it took none or waited past the bound. */
async function frontTurn(settings: PathRewriteRunnerSettings, digRunId: string, log: Log): Promise<RewriteTurnRead | null> {
  const wait = settings.wait ?? DEFAULT_WAIT;
  const sleep = settings.wait?.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const started = Date.now();
  for (let waited = 0; ; waited += wait.pollMs) {
    const turn = await settings.turns.readRewriteTurn(digRunId);
    if (turn === null) {
      log("PATH_REWRITE_NO_TURN", { runId: digRunId });
      return null;
    }
    if (turn.state !== "WAITING") return turn;
    if (waited >= wait.maxWaitMs || Date.now() - started >= wait.maxWaitMs) {
      // W3-7: the turn stays taken; the sweep writes it once it reaches the front (path-rewrite-sweep.ts).
      log("PATH_REWRITE_LEFT_TO_SWEEP", { runId: digRunId, pathSeq: turn.path_seq, waitingFor: turn.waiting_for });
      return null;
    }
    await sleep(wait.pollMs);
  }
}

/**
 * The codes a FAILED row needs: the parent path's own when it reads (`tryText`: the dig's material was what failed), else
 * the clear columns' (`parentCodesOf`), else UNKNOWN_PARENT_CODES.
 */
async function parentCodesFor(settings: PathRewriteRunnerSettings, job: PathRewriteJob, baseRewriteId: string | null, log: Log,
  tryText: boolean): Promise<PathRewriteParentPath> {
  let codes: Readonly<{ answerVersion: number; fate: StoryFate }> = UNKNOWN_PARENT_CODES;
  if (tryText) {
    try {
      const parent = await job.lease(() => settings.sources.parentPathOf({ parentRunId: job.parentRunId, positionRef: job.positionRef, baseRewriteId }));
      return Object.freeze({ ...parent, line: "", summary: null, points: [], extracts: [] });
    } catch (error) {
      log("PATH_REWRITE_PARENT_UNREAD", { runId: job.digRunId, code: codeOf(error) });
    }
  }
  if (settings.sources.parentCodesOf !== undefined) {
    try {
      codes = await job.lease(() => settings.sources.parentCodesOf!({ parentRunId: job.parentRunId, positionRef: job.positionRef, baseRewriteId }));
    } catch (error) {
      log("PATH_REWRITE_PARENT_CODES_UNREAD", { runId: job.digRunId, code: codeOf(error) });
    }
  }
  return Object.freeze({ positionRef: job.positionRef, answerVersion: codes.answerVersion, line: "", summary: null, fate: codes.fate,
    points: [], extracts: [] });
}

/**
 * The dig's turn, from taking it to its row (W3-7: the after-settle branch and the sweep both end here). Throws only when
 * the store itself cannot be read or written; the turn is then the sweep's.
 */
export async function rewriteThePath(settings: PathRewriteRunnerSettings, job: PathRewriteJob, log: Log): Promise<void> {
  const digRunId = job.digRunId;
  const taken = await settings.turns.takeRewriteTurn(digRunId, job.parentRunId, job.positionRef);
  if (taken.outcome !== "TAKEN" && taken.outcome !== "ALREADY") {
    log("PATH_REWRITE_TURN_REFUSED", { runId: digRunId, outcome: taken.outcome });
    return;
  }
  const book = settings.replayBookOf === undefined || job.dig === null ? null
    : await job.lease(() => settings.replayBookOf!(digRunId, job.workItemId));
  const rewriteId = pathRewriteIdOf(digRunId);
  // A record that BASE_MOVED (an earlier rewrite landed on the path since the read) is written again on the new base.
  for (let tries = 0; tries < 3; tries += 1) {
    const turn = await frontTurn(settings, digRunId, log);
    if (turn === null) return;
    if (turn.state === "DONE") {
      log("PATH_REWRITE_ALREADY_STORED", { runId: digRunId });
      return;
    }
    const baseRewriteId = turn.base_rewrite_id;
    let record: PathRewriteRecord;
    if (job.dig === null || job.digPaths === null) {
      record = failedRecord({ rewriteId, digRunId, parent: await parentCodesFor(settings, job, baseRewriteId, log, true), baseRewriteId,
        failureCode: job.failureCode ?? "PATH_REWRITE_DIG_UNREAD", written: null });
    } else {
      const dig = job.dig;
      let parent: PathRewriteParentPath | null = null;
      try {
        parent = await job.lease(() => settings.sources.parentPathOf({ parentRunId: dig.parentRunId, positionRef: dig.positionRef, baseRewriteId }));
      } catch (error) {
        // W3-7: the path keeps its text, and the turn still ends with its row.
        log("PATH_REWRITE_PARENT_UNREAD", { runId: digRunId, code: codeOf(error) });
      }
      if (parent === null) {
        record = failedRecord({ rewriteId, digRunId, parent: await parentCodesFor(settings, job, baseRewriteId, log, false), baseRewriteId,
          failureCode: "PATH_REWRITE_PARENT_UNREAD", written: null });
      } else {
        try {
          record = await composeRecord(settings, { dig, job, parent, digPaths: job.digPaths, rewriteId, baseRewriteId, book, log });
        } catch (error) {
          log("PATH_REWRITE_COMPOSE_FAILED", { runId: digRunId, code: codeOf(error) });
          record = failedRecord({ rewriteId, digRunId, parent, baseRewriteId, failureCode: "PATH_REWRITE_UNEXPECTED_ERROR", written: null });
        }
      }
    }
    const stored = await settings.turns.recordRewrite(record);
    log("PATH_REWRITE_STORED", { runId: digRunId, outcome: record.outcome, failureCode: record.failureCode, stored });
    if (stored === "BASE_MOVED" || stored === "WAIT_TURN") continue;
    if ((stored === "RECORDED" || stored === "ALREADY") && job.dig !== null && job.digPaths !== null) {
      await afterRewrite(settings, job.dig, digRunId, record, job.digPaths, log);
    }
    return;
  }
  log("PATH_REWRITE_BASE_KEPT_MOVING", { runId: digRunId });
}

/** W4-3: the suggestions for the dig's own paths start here, once its row is stored; none at level 10. */
async function afterRewrite(settings: PathRewriteRunnerSettings, dig: PathRewriteDig, digRunId: string, record: PathRewriteRecord,
  digPaths: readonly PathRewriteDigPath[], log: Log): Promise<void> {
  if (settings.afterRewrite === undefined || dig.level >= DIG_LEVEL_MAX) return;
  try {
    await settings.afterRewrite(Object.freeze({ digRunId, parentRunId: dig.parentRunId, positionRef: dig.positionRef, level: dig.level,
      outcome: record.outcome, digPathRefs: Object.freeze(digPaths.map((path) => path.positionRef)) }));
  } catch (error) {
    log("PATH_REWRITE_AFTER_HOOK_FAILED", { runId: digRunId, code: codeOf(error) });
  }
}

type Compose = Readonly<{
  dig: PathRewriteDig; job: PathRewriteJob; parent: PathRewriteParentPath; digPaths: readonly PathRewriteDigPath[];
  rewriteId: string; baseRewriteId: string | null; book: ReplayBook | null; log: Log;
}>;

function failedRecord(input: Readonly<{ rewriteId: string; digRunId: string; parent: PathRewriteParentPath; baseRewriteId: string | null;
  failureCode: string; written: PathRewriteWritten | null }>): PathRewriteRecord {
  const rounds = input.written?.rounds ?? [];
  const last = rounds.at(-1);
  return Object.freeze({
    rewriteId: input.rewriteId,
    digRunId: input.digRunId,
    parentAnswerVersion: input.parent.answerVersion,
    basedOnRewriteId: input.baseRewriteId,
    outcome: "FAILED" as const,
    failureCode: input.failureCode,
    fateBefore: input.parent.fate,
    fateAfter: null,
    verdict: null,
    writerLineage: last === undefined ? null : lineageRecord(last.writer.lineage),
    checkerLineage: last?.checker === null || last === undefined ? null : lineageRecord(last.checker.lineage),
    rounds: rounds.length,
    artifactRefs: Object.freeze(rounds.flatMap((round) => [round.writer.artifactRef, ...(round.checker === null ? [] : [round.checker.artifactRef])])),
    content: null
  });
}

function lineageRecord(lineage: MakerLineage): Readonly<Record<string, unknown>> {
  return Object.freeze({ ...lineage });
}

async function composeRecord(settings: PathRewriteRunnerSettings, compose: Compose): Promise<PathRewriteRecord> {
  const { dig, job, parent, rewriteId, baseRewriteId, log } = compose;
  const digRunId = job.digRunId;
  const failed = (failureCode: string, written: PathRewriteWritten | null = null) =>
    failedRecord({ rewriteId, digRunId, parent, baseRewriteId, failureCode, written });
  const built = buildPathRewriteMaterial({ question: dig.question, parent, picks: dig.picks, digPaths: compose.digPaths });
  if (built.kind === "TOO_LARGE") {
    log("PATH_REWRITE_MATERIAL_TOO_LARGE", { runId: digRunId, bodyBytes: built.bodyBytes });
    return failed("PATH_REWRITE_MATERIAL_TOO_LARGE");
  }
  const writer = job.roles.resolveProvider?.(settings.writerRoleRef) ?? null;
  const checker = job.roles.resolveProvider?.(settings.checkerRoleRef) ?? null;
  if (writer === null || checker === null) return failed("PATH_REWRITE_ROLE_UNAVAILABLE");
  const lease = job.lease;
  const book = compose.book;
  const send = (maker: StoryRoleMaker, request: ProviderCallRequest): Promise<ProviderCallResult> => {
    const gateway = book === null ? maker.provider : replayingGateway(book, maker.provider);
    return lease(() => gateway.call(request));
  };
  const questionLine = dig.question.line;
  const written = await writePathRewrite({
    runId: digRunId,
    subjectItemId: job.workItemId,
    contractHash: settings.contractHash ?? engineContractHash(),
    maxRounds: dig.free ? PATH_REWRITE_POLICY.freeMaxRounds : PATH_REWRITE_POLICY.maxRounds,
    writer,
    checker,
    backupCandidates: job.roles.backupCandidates ?? [],
    backupMakers: job.roles.backupMakers,
    material: built.material,
    send,
    guard: pathRewriteGuard,
    writerLanguageCheck: replyLanguageCheckFor(questionLine, dig.question.language, PATH_REWRITE_PROSE),
    checkerLanguageCheck: replyLanguageCheckFor(questionLine, dig.question.language, PATH_REWRITE_CHECKER_PROSE),
    log: (event, detail) => log(event, { runId: digRunId, ...detail })
  });
  const outcome = written.outcome;
  if (outcome.outcome === "FAILED") {
    log("PATH_REWRITE_LOOP_FAILED", { runId: digRunId, failureCode: outcome.failureCode, cause: outcome.cause, rounds: written.rounds.length });
    return failed(pathRewriteFailureCode(outcome.failureCode), written);
  }
  const served = written.rounds.find((round) => round.round === outcome.servedRound)!;
  const content = contentOf(outcome.body, built.digPathRefs);
  const sealed = await settings.seal(digRunId, rewriteId, content);
  return Object.freeze({
    rewriteId,
    digRunId,
    parentAnswerVersion: parent.answerVersion,
    basedOnRewriteId: baseRewriteId,
    outcome: outcome.outcome,
    failureCode: null,
    fateBefore: parent.fate,
    fateAfter: outcome.body.fate,
    verdict: outcome.body.view === null ? null : Object.freeze({ outcome: outcome.body.view.outcome, scope: outcome.body.view.scope }),
    writerLineage: lineageRecord(served.writer.lineage),
    checkerLineage: served.checker === null ? null : lineageRecord(served.checker.lineage),
    rounds: written.rounds.length,
    artifactRefs: Object.freeze(written.rounds.flatMap((round) => [round.writer.artifactRef,
      ...(round.checker === null ? [] : [round.checker.artifactRef])])),
    content: sealed
  });
}

/** The draft as it is stored: refs gone (the dig's paths named by their real refs), the reason apart from its codes. */
function contentOf(draft: PathRewriteDraft, digPathRefs: ReadonlyMap<string, string>): PathRewriteContent {
  return Object.freeze({
    text: Object.freeze({ line: draft.line, summary: draft.summary, fate: draft.fate }),
    what_changed: Object.freeze(draft.what_changed.map((sentence) => sentence.text)),
    view_reason: draft.view?.reason ?? null,
    dig_paths: Object.freeze(draft.dig_paths.map((path) => Object.freeze({
      position_ref: digPathRefs.get(path.position_ref) ?? path.position_ref, line: path.line, fate: path.fate
    })))
  });
}
