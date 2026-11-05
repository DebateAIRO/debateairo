import { createHash, randomBytes as cryptoRandomBytes } from "node:crypto";
import {
  INVESTIGATION_REPORT_LIMITS, InvestigationReportAnswerSchema, InvestigationReportPathSchema, InvestigationReportSourceSchema, InvestigationReportStorySchema, type InvestigationReportAnswer, type InvestigationReportPath,
  type InvestigationReportSource, type InvestigationReportStory, type MakerLineage
} from "@debateai/contract";
import type {
  InvestigationReportOutcome, InvestigationReportRecord, InvestigationReportsRead, PostgresInvestigationReportRunnerRepository,
  UnreportedClosing, WebSealed
} from "@debateai/db";
import { TypedDomainError, replyLanguageCheckFor } from "@debateai/kernel";
import type { ProviderCallRequest, ProviderCallResult, TokenCounter } from "@debateai/providers";
import { INVESTIGATION_REPORT_POLICY } from "@debateai/register";
import {
  REPORT_ANSWER_PROSE, REPORT_CHECKER_PROSE, REPORT_STORY_PROSE, investigationReportFailureCode, writeInvestigationReport,
  type ReportAnswerDraft, type ReportSite, type ReportStepWritten, type ReportStoryDraft, type StoryRoleMaker
} from "@debateai/story";
import { engineContractHash } from "./engine-contracts.js";
import { investigationReportGuard, type Dossier, type DossierInput } from "./investigation-dossier.js";
import { fitDossierToTokenLine } from "./token-line.js";
import type { PathRewriteRoles } from "./path-rewrite.js";
import { replayingGateway, type ReplayBook } from "./run-replay.js";

/**
 * "WRITE MY REPORT" — THE CLOSING (plan 2026-10-30 task W5-1; design W0-1 with the owner's answers F1-F14, the dig-model
 * revision's §4, the money rule of 31 Oct). The person's press (apps/api, POST /v1/runs/{id}/report) closes the
 * investigation in one transaction (0139's closing, which keeps the texts): its next report version is numbered. Once the
 * version is written the members' page texts and passages go (R22 decision 7, `wipePassages`; "other pages" keep their 30
 * days; links, sites, titles, dates, the shown quotes and the notes stay). The runner then writes the version here, found by its sweep (0136's identity.read_unreported_closings, at boot and every minute) or poked at once
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
 *     (0133's report_ref). No answer after every round: a FAILED row (no text); the person may write it again;
 *  5. `onReportSettled` runs: decision 7's wipe hooks here (RETENTION), never inside the closing.
 *
 * MONEY (the money rule, point 6): the reserve always kept, inside a paid month and on top of Free's credit, pays
 * the closing; it is never walled (no day, week or month stops it). Every call names the investigation's ROOT run on the
 * story lane at an `INVESTIGATION_REPORT:` site, so the gateway charges it as spend source INVESTIGATION_REPORT on the
 * never-walled seam (packages/budget `investigationReportSeam`, the plans' largest reserve as a safety net per closing). Before each call the
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
  /** Free's slim report: 1 round each, its plan's reserve (owner F1, F2). */
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
  /** The tree of paths as it stood (decision 17, the PDF): the version stays as written whatever is erased later. */
  paths: readonly InvestigationReportPath[];
  shortened: boolean;
}>;

/**
 * The most a version's content may hold as JSON: 0136 refuses a sealed value over 1 MiB, and the seal writes base64. A tree beyond it
 * keeps fewer details, each time from the deepest level up: a path's points, then what a dig changed, then the sources' notes, then
 * the paths themselves. Such a version says it was shortened.
 */
export const INVESTIGATION_REPORT_CONTENT_MAX_BYTES = 700 * 1024;

export function fittedReportContent(content: InvestigationReportContent, maxBytes: number = INVESTIGATION_REPORT_CONTENT_MAX_BYTES): InvestigationReportContent {
  const fits = (candidate: InvestigationReportContent): boolean => Buffer.byteLength(JSON.stringify(candidate), "utf8") <= maxBytes;
  if (fits(content)) return content;
  let kept: InvestigationReportContent = Object.freeze({ ...content, shortened: true });
  const atLevels = (change: (path: InvestigationReportPath, level: number) => InvestigationReportPath | null): InvestigationReportContent | null => {
    for (let level = INVESTIGATION_REPORT_LIMITS.pathLevelMax; level >= 0; level -= 1) {
      kept = Object.freeze({ ...kept, paths: Object.freeze(kept.paths.flatMap((path) => {
        const changed = change(path, level);
        return changed === null ? [] : [changed];
      })) });
      if (fits(kept)) return kept;
    }
    return null;
  };
  const without = (member: "points" | "dig") => (path: InvestigationReportPath, level: number): InvestigationReportPath => {
    if (path.level !== level) return path;
    const { [member]: _gone, ...rest } = path;
    return rest;
  };
  const fitted = atLevels(without("points")) ?? atLevels(without("dig"));
  if (fitted !== null) return fitted;
  kept = Object.freeze({ ...kept, sources: Object.freeze(kept.sources.map((source) => Object.freeze({ ...source, line: null }))) });
  if (fits(kept)) return kept;
  const noPaths = atLevels((path, level) => (path.level === level ? null : path));
  if (noPaths !== null) return noPaths;
  return Object.freeze({ ...kept, sources: Object.freeze([]) });
}

/**
 * Who pays for a closing, and on which plan's rules (Free's slim report, its reserve). On a private debate it is the debate's
 * owner (`ownerRef` null, `free` from the root's ask). Decision 13: on a public debate anyone with credit may write the report,
 * so PUBLIC names the writer here (0138's identity.public_report_writer) through `payerOf`.
 */
export type InvestigationReportPayer = Readonly<{ ownerRef: string | null; free: boolean }>;

/** A closing's report has settled: the place later steps hook on (decision 7's wipe, a public debate reopening). */
export type InvestigationReportSettled = Readonly<{
  investigationId: string;
  reportVersion: number;
  rootRunId: string;
  reportId: string;
  outcome: InvestigationReportOutcome | "FAILED";
  payer: InvestigationReportPayer | null;
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
  /** The reserve per plan, from the plans in force (`closingReservesOf`). No plans row: zero, which refuses every call. */
  reserveMicros: Readonly<{ paid: number; free: number }>;
  replayBookOf?: (rootRunId: string, subjectItemId: string) => Promise<ReplayBook>;
  /** R22 decision 2: the tree's climbs still being written; a report waits for them too, within the same bound. Absent: none. */
  climbsOpen?: (rootRunId: string) => Promise<number>;
  /** How long a closing waits for running digs before it goes on with what is settled (default 6 hours). */
  giveUpWaitingMs?: number;
  /** Who pays and on which plan's rules; absent: the debate's owner, on the root's plan. */
  payerOf?: (closing: UnreportedClosing, read: InvestigationCloseInput) => Promise<InvestigationReportPayer>;
  /**
   * Called once a closing's row stands (RECORDED, or ALREADY on a run again), whatever its outcome: a FAILED one too, so the
   * hook decides. It is decision 7's place: RETENTION's wipe goes here, never inside the closing. A failure is logged and
   * changes nothing about the report.
   */
  onReportSettled?: (settled: InvestigationReportSettled) => Promise<void> | void;
  /** Decision 28: Anthropic's free token count for the writer's calls; absent (no Anthropic target): the byte guard alone. */
  tokenCount?: TokenCounter;
  /** Decision 13: a report on a public debate: its report id is the row's own (the investigation id names it) and its calls are charged on their own sites. */
  publicReport?: Readonly<{ callSiteOf: (site: ReportSite, round: number) => string }>;
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
    const climbs = settings.climbsOpen === undefined ? 0 : await settings.climbsOpen(closing.rootRunId);
    const pending = [...(waiting?.waiting ?? []), ...Array.from({ length: climbs }, () => "climb")];
    const givenUp = now.getTime() - Date.parse(closing.closedAt) >= (settings.giveUpWaitingMs ?? INVESTIGATION_CLOSE_DEFAULTS.giveUpWaitingMs);
    if (pending.length > 0 && !givenUp) {
      log("INVESTIGATION_REPORT_WAITING", { investigationId: closing.investigationId, reportVersion: closing.reportVersion, waiting: pending.length });
      return "WAITING";
    }
    if (pending.length > 0) log("INVESTIGATION_REPORT_WAIT_GIVEN_UP", { investigationId: closing.investigationId, waiting: pending.length });
    const composed = await composeRecord(settings, closing, log);
    const { record, payer } = composed;
    const stored = await settings.reports.record(record);
    log("INVESTIGATION_REPORT_STORED", { investigationId: closing.investigationId, reportVersion: closing.reportVersion,
      outcome: record.outcome, storyOutcome: record.storyOutcome, failureCode: record.failureCode, ladderStep: record.ladderStep,
      spentMicros: record.spentMicros, stored });
    if (stored === "RECORDED" || stored === "ALREADY") {
      try {
        await settings.onReportSettled?.(Object.freeze({ investigationId: closing.investigationId, reportVersion: closing.reportVersion,
          rootRunId: closing.rootRunId, reportId: record.reportId, outcome: record.outcome, payer }));
      } catch (error) {
        log("INVESTIGATION_REPORT_SETTLE_HOOK_FAILED", { investigationId: closing.investigationId, reportVersion: closing.reportVersion, code: codeOf(error) });
      }
    }
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

type Composed = Readonly<{ record: InvestigationReportRecord; payer: InvestigationReportPayer | null }>;

async function composeRecord(settings: InvestigationCloseSettings, closing: UnreportedClosing, log: Log): Promise<Composed> {
  const reportId = settings.publicReport !== undefined ? closing.investigationId : investigationReportIdOf(closing.investigationId, closing.reportVersion);
  const root = closing.rootRunId;
  const nothing: Built = Object.freeze({ dossier: null, failureCode: null });
  let read: InvestigationCloseInput | null = null;
  try {
    const earlier = await settings.reports.readOfRun(root);
    read = await settings.sources.inputOf(closing, earlier);
  } catch (error) {
    log("INVESTIGATION_REPORT_INPUT_UNREAD", { runId: root, code: codeOf(error) });
  }
  if (read === null) return { record: failedRecord(closing, reportId, "INVESTIGATION_REPORT_INPUT_UNREAD", nothing, 0, null), payer: null };
  const payer: InvestigationReportPayer = settings.payerOf === undefined ? Object.freeze({ ownerRef: null, free: read.free })
    : await settings.payerOf(closing, read);
  const built = await fitDossierToTokenLine(read.input, settings.tokenCount, log);
  if (built.kind === "TOO_LARGE") {
    log("INVESTIGATION_REPORT_DOSSIER_TOO_LARGE", { runId: root, bodyBytes: built.bodyBytes });
    return { record: failedRecord(closing, reportId, "INVESTIGATION_REPORT_DOSSIER_TOO_LARGE", nothing, 0, null), payer };
  }
  const dossier = built;
  const done: Built = Object.freeze({ dossier, failureCode: null });
  const writer = settings.roles.resolveProvider?.(settings.writerRoleRef) ?? null;
  const checker = settings.roles.resolveProvider?.(settings.checkerRoleRef) ?? null;
  if (writer === null || checker === null) return { record: failedRecord(closing, reportId, "INVESTIGATION_REPORT_ROLE_UNAVAILABLE", done, 0, null), payer };
  const subject = investigationReportSubjectOf(reportId);
  const book = settings.replayBookOf === undefined ? null : await settings.replayBookOf(root, subject).catch(() => null);
  const reserve = settings.reserveMicros[payer.free ? "free" : "paid"];
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
    ...(settings.publicReport === undefined ? {} : { callSiteOf: settings.publicReport.callSiteOf }),
    runId: root, subjectItemId: subject, contractHash: settings.contractHash ?? engineContractHash(),
    maxRounds: payer.free ? INVESTIGATION_REPORT_POLICY.freeMaxRounds : INVESTIGATION_REPORT_POLICY.maxRounds,
    free: payer.free, later: read.input.earlier !== null,
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
    return { record: failedRecord(closing, reportId, investigationReportFailureCode(answer.failureCode), done, spentMicros, written.answer), payer };
  }
  const storyOutcome = written.story?.outcome ?? null;
  const story = storyOutcome === null || storyOutcome.outcome === "FAILED" ? null : storyOf(storyOutcome.body, dossier);
  if (storyOutcome !== null && storyOutcome.outcome === "FAILED") {
    // N14: a missing story is a defect to prevent; the backup ran already. The version keeps the answer alone.
    log("INVESTIGATION_REPORT_STORY_FAILED", { runId: root, failureCode: storyOutcome.failureCode, cause: storyOutcome.cause });
  }
  // A source the contract refuses leaves the list, so a point's numbers follow the places that remain.
  const places = new Map<number, number>();
  const sources = dossier.sources.flatMap((source, at) => {
    // A page's address the contract cannot serve costs the address, not the source.
    const parsed = InvestigationReportSourceSchema.safeParse(source);
    const plain = parsed.success ? parsed : InvestigationReportSourceSchema.safeParse({ ...source, link: null });
    if (!plain.success) return [];
    places.set(at, places.size);
    return [plain.data];
  });
  const content: InvestigationReportContent = fittedReportContent(Object.freeze({
    v: 1 as const,
    answer: InvestigationReportAnswerSchema.parse({ segments: answer.body.segments.map((segment) => segment.text) }),
    story,
    sources,
    paths: dossier.paths.flatMap((path) => {
      const placed = path.points === undefined ? path : { ...path, points: path.points.map((point) => ({ ...point,
        sources: point.sources.flatMap((at) => { const place = places.get(at); return place === undefined ? [] : [place]; }) })) };
      const parsed = InvestigationReportPathSchema.safeParse(placed);
      if (parsed.success) return [parsed.data];
      // A detail the contract refuses (a runaway text) costs the details, not the path. V4 start step, Task 55b: a path debate's path
      // id, trust word and own words stay, each when it parses.
      const base = { line: path.line, summary: path.summary, fate: path.fate, level: path.level };
      const kept = (["path_id", "trust", "own"] as const).reduce<Record<string, unknown>>((bare, member) => {
        if (path[member] === undefined) return bare;
        return InvestigationReportPathSchema.safeParse({ ...bare, [member]: path[member] }).success ? { ...bare, [member]: path[member] } : bare;
      }, base);
      const bare = InvestigationReportPathSchema.safeParse(kept);
      return bare.success ? [bare.data] : [];
    }),
    shortened: dossier.ladderStep > 1
  }));
  const sealed = await settings.seal(root, reportId, content);
  const servedAnswer = written.answer.rounds.find((round) => round.round === answer.servedRound)!;
  const rounds = [...written.answer.rounds, ...(written.story?.rounds ?? [])];
  const askRefs = written.answer.askArtifactRef === null ? [] : [written.answer.askArtifactRef];
  return { payer, record: Object.freeze({
    investigationId: closing.investigationId, reportVersion: closing.reportVersion, reportId,
    outcome: answer.outcome as InvestigationReportOutcome,
    storyOutcome: storyOutcome === null ? "FAILED" : storyOutcome.outcome,
    failureCode: null,
    coveredRewrite: dossier.coveredRewrite,
    dossierFingerprint: dossier.fingerprint, ladderStep: dossier.ladderStep, leftOut: dossier.leftOut,
    answerRounds: written.answer.rounds.length, storyRounds: written.story?.rounds.length ?? 0,
    writerLineage: lineageRecord(servedAnswer.writer.lineage),
    checkerLineage: servedAnswer.checker === null ? null : lineageRecord(servedAnswer.checker.lineage),
    artifactRefs: Object.freeze([...askRefs, ...rounds.flatMap((round) => [round.writer.artifactRef, ...(round.checker === null ? [] : [round.checker.artifactRef])])].slice(0, 64)),
    spentMicros: Math.min(spentMicros, 100_000_000),
    content: sealed
  }) };
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
