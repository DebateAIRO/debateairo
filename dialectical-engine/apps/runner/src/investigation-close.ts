import { createHash, randomBytes as cryptoRandomBytes } from "node:crypto";
import {
  InvestigationReportAnswerSchema, InvestigationReportStorySchema, type InvestigationReportAnswer, type InvestigationReportSource,
  type InvestigationReportStory, type MakerLineage
} from "@debateai/contract";
import type {
  InvestigationReportOutcome, InvestigationReportRecord, InvestigationReportsRead, PostgresInvestigationReportRunnerRepository,
  UnreportedClosing, WebSealed
} from "@debateai/db";
import { TypedDomainError, replyLanguageCheckFor } from "@debateai/kernel";
import type { ProviderCallRequest, ProviderCallResult } from "@debateai/providers";
import { INVESTIGATION_REPORT_POLICY } from "@debateai/register";
import {
  REPORT_ANSWER_PROSE, REPORT_CHECKER_PROSE, REPORT_STORY_PROSE, investigationReportFailureCode, writeInvestigationReport,
  type ReportAnswerDraft, type ReportStepWritten, type ReportStoryDraft, type StoryRoleMaker
} from "@debateai/story";
import { engineContractHash } from "./engine-contracts.js";
import { buildInvestigationDossier, investigationReportGuard, type Dossier, type DossierInput } from "./investigation-dossier.js";
import type { PathRewriteRoles } from "./path-rewrite.js";
import { replayingGateway, type ReplayBook } from "./run-replay.js";

/**
 * "WRITE MY REPORT" — THE CLOSING (plan 2026-10-30 task W5-1; design W0-1 with the owner's answers F1-F14, the dig-model
 * revision's §4, the money rule of 31 Oct). The person's press (apps/api, POST /v1/runs/{id}/report) closes the
 * investigation in one transaction (0133): its next report version is numbered and every member's page texts are wiped
 * (links, sites, titles, dates and the shown quotes with reader 1's line stay, owner F9). The runner then writes the
 * version here, found by its sweep (0136's identity.read_unreported_closings, at boot and every minute) or poked at once
 * when a member of a closing investigation finishes (index.ts, the story stage):
 *  1. it WAITS while any dig is still running or still rewriting its path (owner F7 A; 0136's waiting rule: a dig paused
 *     at the month wall waits for a reset and goes to the next version). The page says so. A closing that has waited past
 *     `giveUpWaitingMs` goes on with what is settled, so no report waits for ever on one dig;
 *  2. it reads the investigation (investigation-close-sources.ts) and builds the dossier (investigation-dossier.ts): the
 *     rewritten paths and one rewrite card per dig, nested to level 10 in tree order, the person's views beside their
 *     verdicts, and, from version 2 on, the earlier report's answer (F8 A); fitted by the ladder under the 100K guard;
 *  3. the answer (Haiku) and its check (GLM, F6), then the story (Haiku) and its check (GLM), packages/story's
 *     `writeInvestigationReport`: at most 2 rounds each, Free's slim report 1 each (F1), output caps 16K / 80K (F3), one
 *     fence and canary for the whole closing (F5: a step's later rounds read its first round's system text and material
 *     from the vendor's cache; owner Q3's new fence per revision is set aside inside a closing, the owner's later answer);
 *  4. it stores ONE row (0136's identity.record_investigation_report_version), its text sealed under the ROOT run's key,
 *     with the newest rewrite it covered (so the map's "paths changed since your report" counts only later rewrites), the
 *     dossier's fingerprint and ladder step, the rounds, lineages and cost. The same call marks the closing written
 *     (0133's report_ref). No answer after every round: a FAILED row (no text); the person may write it again.
 *
 * MONEY (the money rule, point 6): the reserve always kept, 20 cents inside a paid month and 5 on top of Free's 20, pays
 * the closing; it is never walled (no day, week or month stops it). Every call names the investigation's ROOT run on the
 * story lane at an `INVESTIGATION_REPORT:` site, so the gateway charges it as spend source INVESTIGATION_REPORT on the
 * never-walled seam (packages/budget `investigationReportSeam`, a 20-cent safety net per closing). Before each call the
 * closing admits it against its OWN plan's reserve: what this closing has spent plus the call's projected maximum must fit,
 * or the call is refused before it is sent, and the step keeps its last checked draft (the story loop's rule).
 *
 * REPLAY: the dossier is built by code, so a closing run again (a runner that stopped) sends the same prompts (the replay
 * book masks fence and canary) and every call already answered is replayed from the record, free.
 *
 * It never rejects: whatever a provider, the store or a defect does is logged by code and ids only.
 */

export type InvestigationCloseInput = Readonly<{
  /** The dossier's input, read from the store; null when the investigation's root cannot be read (the closing FAILS). */
  input: DossierInput;
  /** Free's slim report: 1 round each, its 5-cent reserve (owner F1, F2). */
  free: boolean;
  /** The question's line and locked language, for the replies' language check. */
  questionLine: string;
}>;

export type InvestigationCloseSources = Readonly<{
  /** Everything the dossier reads for this closing (the earlier report's answer for `reportVersion` included). */
  inputOf: (closing: UnreportedClosing, earlier: InvestigationReportsRead | null) => Promise<InvestigationCloseInput | null>;
}>;

/** The closing's own money check, before each call (the plan's reserve; the gateway's seam is the safety net). */
export type InvestigationCloseAdmission = Readonly<{
  /** What this closing has been charged so far (INVESTIGATION_REPORT on the root run since the closing began). */
  spentMicros: (rootRunId: string) => Promise<number>;
  /** The call's projected maximum at its maker's price (the engine's own counting: bytes / 2 in, the output cap out). */
  projectedMicros: (request: ProviderCallRequest) => number;
}>;

export type InvestigationReportContent = Readonly<{
  v: 1;
  answer: InvestigationReportAnswer;
  story: InvestigationReportStory | null;
  sources: readonly InvestigationReportSource[];
  shortened: boolean;
}>;

export type InvestigationCloseSettings = Readonly<{
  reports: Pick<PostgresInvestigationReportRunnerRepository, "readUnreported" | "readWaiting" | "record" | "readOfRun">;
  sources: InvestigationCloseSources;
  /** Seals the content under the ROOT run's key (carrier identity.investigation_report, primary key the report id). */
  seal: (rootRunId: string, reportId: string, content: InvestigationReportContent) => Promise<WebSealed>;
  /** The members the closing may call: the runner's configured ones. */
  roles: PathRewriteRoles;
  writerRoleRef: string;
  checkerRoleRef: string;
  admission: InvestigationCloseAdmission;
  /** The reserve per plan; absent: INVESTIGATION_REPORT_POLICY's (20 cents paid, 5 cents Free). */
  reserveMicros?: Readonly<{ paid: number; free: number }>;
  replayBookOf?: (rootRunId: string, subjectItemId: string) => Promise<ReplayBook>;
  /** How long a closing waits for running digs before it goes on with what is settled (default 6 hours). */
  giveUpWaitingMs?: number;
  /** The closing's one random source (F5); absent: 32 fresh random bytes per closing. Tests pass a fixed one. */
  closingSeed?: () => Buffer;
  contractHash?: string;
  now?: () => Date;
  log?: (event: string, detail: Record<string, unknown>) => void;
}>;

export type InvestigationCloseOutcome = "WAITING" | "RECORDED" | "ALREADY" | "NO_CLOSING" | "RUNNING_HERE" | "NOT_RECORDED";

export const INVESTIGATION_CLOSE_DEFAULTS = Object.freeze({ giveUpWaitingMs: 6 * 60 * 60_000, everyMs: 60_000, limit: 20 });
/** The money refusal the story loop reads as its envelope speaking: the step keeps its last checked draft. */
export const INVESTIGATION_REPORT_CEILING_CODE = "STORY_COST_ENVELOPE_REACHED" as const;

const LOG_ERROR_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/u;
function codeOf(error: unknown): string {
  if (error instanceof TypedDomainError) return error.code;
  const code = typeof error === "object" && error !== null ? (error as { readonly code?: unknown }).code : undefined;
  if (typeof code === "string" && /^[0-9A-Z_]{1,64}$/u.test(code)) return `DATABASE:${code}`;
  return error instanceof Error && LOG_ERROR_NAME.test(error.name) ? error.name : "UNTYPED";
}

/** The report's id, one per closing: the same on every run of the same closing, so a second write is ALREADY. */
export function investigationReportIdOf(investigationId: string, reportVersion: number): string {
  const hex = createHash("sha256").update(`debateai.investigation-report.v1:${investigationId.toLowerCase()}:${String(reportVersion)}`, "utf8")
    .digest("hex");
  const variant = ((Number.parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** The subject item every call of one closing names (its replay book's key). */
export const investigationReportSubjectOf = (reportId: string): string => `investigation-report:${reportId}`;

/**
 * F5: the closing's fence and canary, the same on every call of one closing (`buildFramedPrompt` asks 16 bytes for the
 * fence, then 12 for the canary). Derived from one seed per closing; never stored (the replay book masks both).
 */
export function closingRandomBytes(seed: Buffer): (size: number) => Buffer {
  const fence = createHash("sha256").update(seed).update("fence").digest();
  const canary = createHash("sha256").update(seed).update("canary").digest();
  return (size: number) => {
    if (size === 16) return Buffer.from(fence.subarray(0, 16));
    if (size === 12) return Buffer.from(canary.subarray(0, 12));
    return createHash("sha256").update(seed).update(String(size)).digest().subarray(0, Math.min(size, 32));
  };
}

/** The closings this process is writing, so the sweep and the poke never write one twice at once (paid twice). */
const RUNNING = new Set<string>();

type Log = (event: string, detail: Record<string, unknown>) => void;
function safeLog(settings: InvestigationCloseSettings): Log {
  return (event, detail) => {
    try {
      void Promise.resolve(settings.log?.(event, detail)).catch(() => undefined);
    } catch {
      // A failing log sink never costs the closing anything.
    }
  };
}

/**
 * One closing: waits, or writes and stores its version. Never rejects.
 */
export async function closeInvestigation(settings: InvestigationCloseSettings, closing: UnreportedClosing): Promise<InvestigationCloseOutcome> {
  const log = safeLog(settings);
  const key = `${closing.investigationId.toLowerCase()}:${String(closing.reportVersion)}`;
  if (RUNNING.has(key)) return "RUNNING_HERE";
  RUNNING.add(key);
  try {
    const now = (settings.now ?? (() => new Date()))();
    const waiting = await settings.reports.readWaiting(closing.rootRunId);
    const pending = waiting?.waiting ?? [];
    const givenUp = now.getTime() - Date.parse(closing.closedAt) >= (settings.giveUpWaitingMs ?? INVESTIGATION_CLOSE_DEFAULTS.giveUpWaitingMs);
    if (pending.length > 0 && !givenUp) {
      log("INVESTIGATION_REPORT_WAITING", { investigationId: closing.investigationId, reportVersion: closing.reportVersion, waiting: pending.length });
      return "WAITING";
    }
    if (pending.length > 0) log("INVESTIGATION_REPORT_WAIT_GIVEN_UP", { investigationId: closing.investigationId, waiting: pending.length });
    const record = await composeRecord(settings, closing, log);
    const stored = await settings.reports.record(record);
    log("INVESTIGATION_REPORT_STORED", { investigationId: closing.investigationId, reportVersion: closing.reportVersion,
      outcome: record.outcome, storyOutcome: record.storyOutcome, failureCode: record.failureCode, ladderStep: record.ladderStep,
      spentMicros: record.spentMicros, stored });
    return stored;
  } catch (error) {
    log("INVESTIGATION_REPORT_NOT_RECORDED", { investigationId: closing.investigationId, reportVersion: closing.reportVersion, code: codeOf(error) });
    return "NOT_RECORDED";
  } finally {
    RUNNING.delete(key);
  }
}

function lineageRecord(lineage: MakerLineage): Readonly<Record<string, unknown>> {
  return Object.freeze({ ...lineage });
}

type Built = Readonly<{ dossier: Dossier | null; failureCode: string | null }>;

function failedRecord(closing: UnreportedClosing, reportId: string, failureCode: string, built: Built, spentMicros: number,
  answer: ReportStepWritten<ReportAnswerDraft> | null): InvestigationReportRecord {
  const rounds = answer?.rounds ?? [];
  return Object.freeze({
    investigationId: closing.investigationId, reportVersion: closing.reportVersion, reportId,
    outcome: "FAILED" as const, storyOutcome: null, failureCode,
    coveredRewrite: built.dossier?.coveredRewrite ?? null,
    dossierFingerprint: built.dossier?.fingerprint ?? "0".repeat(64),
    ladderStep: built.dossier?.ladderStep ?? 1, leftOut: built.dossier?.leftOut ?? 0,
    answerRounds: rounds.length, storyRounds: 0, writerLineage: null, checkerLineage: null,
    artifactRefs: Object.freeze(rounds.flatMap((round) => [round.writer.artifactRef, ...(round.checker === null ? [] : [round.checker.artifactRef])])),
    spentMicros, content: null
  });
}

async function spentOf(settings: InvestigationCloseSettings, rootRunId: string, log: Log): Promise<number> {
  try {
    return Math.max(0, await settings.admission.spentMicros(rootRunId));
  } catch (error) {
    log("INVESTIGATION_REPORT_SPEND_UNREAD", { runId: rootRunId, code: codeOf(error) });
    return 0;
  }
}

async function composeRecord(settings: InvestigationCloseSettings, closing: UnreportedClosing, log: Log): Promise<InvestigationReportRecord> {
  const reportId = investigationReportIdOf(closing.investigationId, closing.reportVersion);
  const root = closing.rootRunId;
  const nothing: Built = Object.freeze({ dossier: null, failureCode: null });
  let read: InvestigationCloseInput | null = null;
  try {
    const earlier = await settings.reports.readOfRun(root);
    read = await settings.sources.inputOf(closing, earlier);
  } catch (error) {
    log("INVESTIGATION_REPORT_INPUT_UNREAD", { runId: root, code: codeOf(error) });
  }
  if (read === null) return failedRecord(closing, reportId, "INVESTIGATION_REPORT_INPUT_UNREAD", nothing, 0, null);
  const built = buildInvestigationDossier(read.input);
  if (built.kind === "TOO_LARGE") {
    log("INVESTIGATION_REPORT_DOSSIER_TOO_LARGE", { runId: root, bodyBytes: built.bodyBytes });
    return failedRecord(closing, reportId, "INVESTIGATION_REPORT_DOSSIER_TOO_LARGE", nothing, 0, null);
  }
  const dossier = built;
  const done: Built = Object.freeze({ dossier, failureCode: null });
  const writer = settings.roles.resolveProvider?.(settings.writerRoleRef) ?? null;
  const checker = settings.roles.resolveProvider?.(settings.checkerRoleRef) ?? null;
  if (writer === null || checker === null) return failedRecord(closing, reportId, "INVESTIGATION_REPORT_ROLE_UNAVAILABLE", done, 0, null);
  const subject = investigationReportSubjectOf(reportId);
  const book = settings.replayBookOf === undefined ? null : await settings.replayBookOf(root, subject).catch(() => null);
  const reserve = (settings.reserveMicros ?? INVESTIGATION_REPORT_POLICY.reserveMicros)[read.free ? "free" : "paid"];
  const send = async (maker: StoryRoleMaker, request: ProviderCallRequest): Promise<ProviderCallResult> => {
    const spent = await spentOf(settings, root, log);
    const projected = settings.admission.projectedMicros(request);
    if (spent + projected > reserve) {
      log("INVESTIGATION_REPORT_CEILING", { runId: root, callSiteKey: request.callSiteKey, spentMicros: spent, projectedMicros: projected, reserve });
      throw new TypedDomainError(INVESTIGATION_REPORT_CEILING_CODE, "The closing keeps to its plan's reserve");
    }
    const gateway = book === null ? maker.provider : replayingGateway(book, maker.provider);
    return gateway.call(request);
  };
  const language = read.input.question.language;
  const seed = settings.closingSeed?.() ?? cryptoRandomBytes(32);
  const written = await writeInvestigationReport({
    runId: root, subjectItemId: subject, contractHash: settings.contractHash ?? engineContractHash(),
    maxRounds: read.free ? INVESTIGATION_REPORT_POLICY.freeMaxRounds : INVESTIGATION_REPORT_POLICY.maxRounds,
    free: read.free, later: read.input.earlier !== null,
    writer, checker, backupCandidates: settings.roles.backupCandidates ?? [], backupMakers: settings.roles.backupMakers,
    material: dossier.material, send, guard: investigationReportGuard, randomBytes: closingRandomBytes(seed),
    answerLanguageCheck: replyLanguageCheckFor(read.questionLine, language, REPORT_ANSWER_PROSE),
    storyLanguageCheck: replyLanguageCheckFor(read.questionLine, language, REPORT_STORY_PROSE),
    checkerLanguageCheck: replyLanguageCheckFor(read.questionLine, language, REPORT_CHECKER_PROSE),
    log: (event, detail) => log(event, { runId: root, ...detail })
  });
  const spentMicros = await spentOf(settings, root, log);
  const answer = written.answer.outcome;
  if (answer.outcome === "FAILED") {
    log("INVESTIGATION_REPORT_ANSWER_FAILED", { runId: root, failureCode: answer.failureCode, cause: answer.cause });
    return failedRecord(closing, reportId, investigationReportFailureCode(answer.failureCode), done, spentMicros, written.answer);
  }
  const storyOutcome = written.story?.outcome ?? null;
  const story = storyOutcome === null || storyOutcome.outcome === "FAILED" ? null : storyOf(storyOutcome.body, dossier);
  if (storyOutcome !== null && storyOutcome.outcome === "FAILED") {
    // N14: a missing story is a defect to prevent; the backup ran already. The version keeps the answer alone.
    log("INVESTIGATION_REPORT_STORY_FAILED", { runId: root, failureCode: storyOutcome.failureCode, cause: storyOutcome.cause });
  }
  const content: InvestigationReportContent = Object.freeze({
    v: 1 as const,
    answer: InvestigationReportAnswerSchema.parse({ segments: answer.body.segments.map((segment) => segment.text) }),
    story,
    sources: dossier.sources,
    shortened: dossier.ladderStep > 1
  });
  const sealed = await settings.seal(root, reportId, content);
  const servedAnswer = written.answer.rounds.find((round) => round.round === answer.servedRound)!;
  const rounds = [...written.answer.rounds, ...(written.story?.rounds ?? [])];
  return Object.freeze({
    investigationId: closing.investigationId, reportVersion: closing.reportVersion, reportId,
    outcome: answer.outcome as InvestigationReportOutcome,
    storyOutcome: storyOutcome === null ? "FAILED" : storyOutcome.outcome,
    failureCode: null,
    coveredRewrite: dossier.coveredRewrite,
    dossierFingerprint: dossier.fingerprint, ladderStep: dossier.ladderStep, leftOut: dossier.leftOut,
    answerRounds: written.answer.rounds.length, storyRounds: written.story?.rounds.length ?? 0,
    writerLineage: lineageRecord(servedAnswer.writer.lineage),
    checkerLineage: servedAnswer.checker === null ? null : lineageRecord(servedAnswer.checker.lineage),
    artifactRefs: Object.freeze(rounds.flatMap((round) => [round.writer.artifactRef, ...(round.checker === null ? [] : [round.checker.artifactRef])]).slice(0, 64)),
    spentMicros: Math.min(spentMicros, 100_000_000),
    content: sealed
  });
}

/** The story as it is stored: card refs turned back into the digs' runs, a paragraph naming none left out. */
function storyOf(draft: ReportStoryDraft, dossier: Dossier): InvestigationReportStory | null {
  const parsed = InvestigationReportStorySchema.safeParse({
    short_answer: draft.short_answer,
    what_would_change: draft.what_would_change,
    how_it_went: draft.how_it_went.flatMap((entry) => {
      const runId = dossier.cardRuns.get(entry.card);
      return runId === undefined ? [] : [{ dig_run_id: runId, paragraph: entry.paragraph }];
    }),
    still_open: [...draft.still_open]
  });
  return parsed.success ? parsed.data : null;
}

/** One pass of the closing sweep: every unreported closing, oldest first. */
export async function sweepInvestigationClosings(settings: InvestigationCloseSettings, limit: number = INVESTIGATION_CLOSE_DEFAULTS.limit)
  : Promise<Readonly<{ listed: number; outcomes: readonly InvestigationCloseOutcome[] }>> {
  const log = safeLog(settings);
  let listed: readonly UnreportedClosing[];
  try {
    listed = await settings.reports.readUnreported(limit);
  } catch (error) {
    log("INVESTIGATION_REPORT_SWEEP_UNREAD", { code: codeOf(error) });
    return Object.freeze({ listed: 0, outcomes: [] });
  }
  const outcomes: InvestigationCloseOutcome[] = [];
  for (const closing of listed) outcomes.push(await closeInvestigation(settings, closing));
  return Object.freeze({ listed: listed.length, outcomes: Object.freeze(outcomes) });
}

/**
 * The story stage's poke (index.ts): a member of an investigation settled (its story or its path rewrite is stored), so a
 * closing waiting on it may start now rather than at the next sweep. Never rejects.
 */
export async function pokeInvestigationClosing(settings: InvestigationCloseSettings | undefined, runId: string): Promise<void> {
  if (settings === undefined) return;
  try {
    const waiting = await settings.reports.readWaiting(runId);
    if (waiting === null) return;
    const open = (await settings.reports.readUnreported(INVESTIGATION_CLOSE_DEFAULTS.limit))
      .filter((closing) => closing.investigationId.toLowerCase() === waiting.investigation_id.toLowerCase());
    for (const closing of open) await closeInvestigation(settings, closing);
  } catch (error) {
    safeLog(settings)("INVESTIGATION_REPORT_POKE_FAILED", { runId, code: codeOf(error) });
  }
}

/** The sweep at boot and every `everyMs` (default 1 minute), one pass at a time; none while `paused()`. */
export function startInvestigationCloseSweep(settings: InvestigationCloseSettings & Readonly<{ everyMs?: number; paused?: () => boolean }>)
  : Readonly<{ stop: () => void; idle: () => Promise<void> }> {
  let running: Promise<unknown> = Promise.resolve();
  let busy = false;
  const pass = (): void => {
    if (busy || settings.paused?.() === true) return;
    busy = true;
    running = sweepInvestigationClosings(settings).catch(() => undefined).finally(() => { busy = false; });
  };
  pass();
  const timer = setInterval(pass, settings.everyMs ?? INVESTIGATION_CLOSE_DEFAULTS.everyMs);
  timer.unref?.();
  return Object.freeze({ stop: () => { clearInterval(timer); }, idle: () => running.then(() => undefined) });
}

/** Whether a stored version's opened content is one this file wrote (the earlier report's answer, F8). */
export function storedReportAnswerOf(value: unknown): readonly string[] | null {
  if (typeof value !== "object" || value === null || (value as { v?: unknown }).v !== 1) return null;
  const answer = InvestigationReportAnswerSchema.safeParse((value as { answer?: unknown }).answer);
  return answer.success ? answer.data.segments : null;
}
