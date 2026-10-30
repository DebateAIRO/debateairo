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
 *     row: when every writer failed, the row is FAILED and the path keeps its text; otherwise later digs of the path would
 *     wait for ever. The only turn left open is one whose store cannot be read or written at all.
 *  5. then W4-3's suggestions for the dig's own paths are asked for (the `afterRewrite` hook; none at level 10).
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
}>;

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
  /** How a turn behind another waits for the front. */
  wait?: Readonly<{ pollMs: number; maxWaitMs: number; sleep?: (ms: number) => Promise<void> }>;
  /** engineContractHash(): absent, the code's own. */
  contractHash?: string;
  log?: (event: string, detail: Record<string, unknown>) => void;
  /**
   * W4-3's hook (not built here): asked once the dig's row is stored and the dig is above level 10, so the suggestions
   * for the dig's own paths start. None at level 10 (DIG_LEVEL_MAX): a dig there cannot be dug further.
   */
  afterRewrite?: (settled: PathRewriteSettled) => Promise<void> | void;
}>;

const DEFAULT_WAIT = Object.freeze({ pollMs: 2_000, maxWaitMs: 30 * 60_000 });
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
 * story's place (stored, failed, or waiting behind an earlier dig); false when it is none, or when the runner has no
 * rewrite settings, or when whether it is a dig could not be read: the story is written as today. Never rejects.
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
  try {
    await rewriteThePath(settings, dig, input, log);
  } catch (error) {
    log("PATH_REWRITE_NOT_RECORDED", { runId: input.runId, code: codeOf(error) });
  }
  return true;
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
      log("PATH_REWRITE_TURN_WAIT_TIMED_OUT", { runId: digRunId, pathSeq: turn.path_seq, waitingFor: turn.waiting_for });
      return null;
    }
    await sleep(wait.pollMs);
  }
}

async function rewriteThePath(settings: PathRewriteRunnerSettings, dig: PathRewriteDig, input: StoryWriteInput, log: Log): Promise<void> {
  const digRunId = input.runId;
  const taken = await settings.turns.takeRewriteTurn(digRunId, dig.parentRunId, dig.positionRef);
  if (taken.outcome !== "TAKEN" && taken.outcome !== "ALREADY") {
    log("PATH_REWRITE_TURN_REFUSED", { runId: digRunId, outcome: taken.outcome });
    return;
  }
  const lease = input.stepLease ?? BARE_STEP;
  // The dig's own paths, read once: they are the settled run's, and do not move with the parent's base.
  const enrichment = await lease(() => settings.sources.readEnrichment({ runId: digRunId,
    nodes: input.nodes.map((node) => ({ nodeId: node.nodeId, judgeArtifactRef: input.judgeArtifactRefs.get(node.nodeId) ?? null })) }));
  const pathsWithoutSources = pathRewriteDigPathsOf(input, enrichment);
  const extracts = settings.sources.digExtractsOf === undefined ? new Map<string, readonly PathRewriteExtract[]>()
    : await lease(() => settings.sources.digExtractsOf!(digRunId, pathsWithoutSources.flatMap((path) => path.points.map((point) => point.id))));
  const digPaths = pathRewriteDigPathsOf(input, enrichment, extracts);
  const book = settings.replayBookOf === undefined ? null : await lease(() => settings.replayBookOf!(digRunId, input.workItemId));
  const rewriteId = pathRewriteIdOf(digRunId);
  // A record that BASE_MOVED (an earlier rewrite landed on the path since the read) is written again on the new base.
  for (let tries = 0; tries < 3; tries += 1) {
    const turn = await frontTurn(settings, digRunId, log);
    if (turn === null) return;
    if (turn.state === "DONE") {
      log("PATH_REWRITE_ALREADY_STORED", { runId: digRunId });
      return;
    }
    const parent = await lease(() => settings.sources.parentPathOf({ parentRunId: dig.parentRunId, positionRef: dig.positionRef,
      baseRewriteId: turn.base_rewrite_id }));
    let record: PathRewriteRecord;
    try {
      record = await composeRecord(settings, { dig, input, parent, digPaths, rewriteId, baseRewriteId: turn.base_rewrite_id, book, log });
    } catch (error) {
      log("PATH_REWRITE_COMPOSE_FAILED", { runId: digRunId, code: codeOf(error) });
      record = failedRecord({ rewriteId, digRunId, parent, baseRewriteId: turn.base_rewrite_id, failureCode: "PATH_REWRITE_UNEXPECTED_ERROR",
        written: null });
    }
    const stored = await settings.turns.recordRewrite(record);
    log("PATH_REWRITE_STORED", { runId: digRunId, outcome: record.outcome, failureCode: record.failureCode, stored });
    if (stored === "BASE_MOVED" || stored === "WAIT_TURN") continue;
    if (stored === "RECORDED" || stored === "ALREADY") await afterRewrite(settings, dig, digRunId, record, digPaths, log);
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
  dig: PathRewriteDig; input: StoryWriteInput; parent: PathRewriteParentPath; digPaths: readonly PathRewriteDigPath[];
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
  const { dig, input, parent, rewriteId, baseRewriteId, log } = compose;
  const digRunId = input.runId;
  const failed = (failureCode: string, written: PathRewriteWritten | null = null) =>
    failedRecord({ rewriteId, digRunId, parent, baseRewriteId, failureCode, written });
  const built = buildPathRewriteMaterial({ question: dig.question, parent, picks: dig.picks, digPaths: compose.digPaths });
  if (built.kind === "TOO_LARGE") {
    log("PATH_REWRITE_MATERIAL_TOO_LARGE", { runId: digRunId, bodyBytes: built.bodyBytes });
    return failed("PATH_REWRITE_MATERIAL_TOO_LARGE");
  }
  const writer = input.resolveProvider?.(settings.writerRoleRef) ?? null;
  const checker = input.resolveProvider?.(settings.checkerRoleRef) ?? null;
  if (writer === null || checker === null) return failed("PATH_REWRITE_ROLE_UNAVAILABLE");
  const lease = input.stepLease ?? BARE_STEP;
  const book = compose.book;
  const send = (maker: StoryRoleMaker, request: ProviderCallRequest): Promise<ProviderCallResult> => {
    const gateway = book === null ? maker.provider : replayingGateway(book, maker.provider);
    return lease(() => gateway.call(request));
  };
  const questionLine = dig.question.line;
  const written = await writePathRewrite({
    runId: digRunId,
    subjectItemId: input.workItemId,
    contractHash: settings.contractHash ?? engineContractHash(),
    maxRounds: dig.free ? PATH_REWRITE_POLICY.freeMaxRounds : PATH_REWRITE_POLICY.maxRounds,
    writer,
    checker,
    backupCandidates: input.backupCandidates ?? [],
    backupMakers: input.backupMakers,
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
