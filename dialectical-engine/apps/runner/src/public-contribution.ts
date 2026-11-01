import { createHash } from "node:crypto";
import {
  PATH_UPDATE_CARRIER, PUBLIC_DIG_INPUT_CARRIER, PUBLIC_REPORT_CARRIER, PostgresPublicDebateRunnerRepository, PostgresPublicTreeRunnerRepository, decryptContentForRun,
  encryptAttestedContentForRun, withRunContentLease, type InvestigationReportRecord, type PathLineEntry, type Pool, type PublicContributionRead, type PublicReportUnwritten, type UnreportedClosing, type WebSealed
} from "@debateai/db";
import {
  PublicContributionCheckReplySchema, classifyStructuredArtifact, framedPublicContributionCheck, parseStructuredArtifact, type PublicContributionCheckReply
} from "@debateai/judgement";
import { TypedDomainError } from "@debateai/kernel";
import {
  buildFramedRepairPrompt, rememberingAcceptedReply, schemaFailureLocator, type ContentClassification, type ModelReplyFacts, type ProviderCallRequest, type ProviderCallResult,
  type ProviderGateway, type RejectedProviderContent, type TokenCounter
} from "@debateai/providers";
import { PATH_REWRITE_POLICY } from "@debateai/register";
import { publicReportCallSiteKey, type StoryRoleMaker, type StoryWriteInput } from "@debateai/story";
import type { ProviderTargetPrice } from "@debateai/budget";
import { engineContractHash } from "./engine-contracts.js";
import { closeInvestigation, type InvestigationCloseSettings, type InvestigationReportContent } from "./investigation-close.js";
import { investigationReportProjectedMicros } from "./investigation-close-sources.js";
import { climbFrom, pathUpdateIdOf, writePublicDigLevel, type TreeUpdateSettings } from "./path-climb.js";
import { digPathsOf, holdDigPassages, type PathRewriteDig, type PathRewriteRoles, type PathRewriteRunnerSettings, type StepLease } from "./path-rewrite.js";
import { PATH_REWRITE_CHECKER_MODEL, PATH_REWRITE_WRITER_MODEL } from "./path-rewrite-composition.js";
import { digPathsForStore } from "./path-rewrite-sources.js";
import { releaseRunPassages } from "./passage-record.js";
import { dossierFromMaterial, openPublicMaterial, publicPathOf, publicTreePortsOf } from "./public-tree-sources.js";
import { replayingGateway } from "./run-replay.js";

/**
 * A DIG ON A PUBLIC DEBATE, FROM ITS END TO THE PAGE (plan 2026-10-31-r22-owner-changes decisions 13 and 22; migration 0147). Whoever digs, the first author too:
 *  1. The dig's own debate ran on the digger's own credit (the ask route, on their session; their run, their charge scope).
 *  2. Its rewrite of the path it dug: step 0 of the path's line, kind PUBLIC_DIG, sealed under the dig's key, written from the PUBLIC COPY only (public-tree-sources.ts). It holds the path
 *     until the check settles, and is no one's text until it is ALLOWED.
 *  3. THE AI CHECK (`public.contribution-check.v1`), charged to the digger as CONTRIBUTION_CHECK, never walled. REFUSE: 0137's settle REFUSED: the dig stays private to the digger and the
 *     page is left alone. The check cannot run (both makers failed): UNAVAILABLE, the same for the page. PASS: 0147's mark, and the API's sweep runs the publication check (HS-S02) on the
 *     very strings that would go public, settles ALLOWED or REFUSED, and copies the text under the publication's key. The runner holds no publication key, so that is the API's.
 *  4. ALLOWED and really changed: the climb and the main answer (`climbFrom`), charged to the digger, never walled, on the public ports; the sweep copies each to the page.
 * Every step is worked out from stored rows, each id from the dig and the step, so `advance` run again after a crash walks what is there, free. A contribution that stops anywhere is the
 * sweep's. It never rejects; logs codes and ids only.
 */

const CHECK_SITE = (round: number): string => `CONTRIBUTION_CHECK:CHECKER:${String(round)}`;
const uuidOf = (seed: string): string => {
  const hex = createHash("sha256").update(seed, "utf8").digest("hex");
  const variant = ((Number.parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};
/** The check's id, one per dig, the same on every run, so a second copy names it the same way. */
export const contributionCheckIdOf = (digRunId: string): string => uuidOf(`debateai.contribution-check.v1:${digRunId.toLowerCase()}`);
export const contributionCheckSubjectOf = (digRunId: string): string => `contribution-check:${digRunId.toLowerCase()}`;

const LOG_ERROR_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/u;
function codeOf(error: unknown): string {
  if (error instanceof TypedDomainError) return error.code;
  const code = typeof error === "object" && error !== null ? (error as { readonly code?: unknown }).code : undefined;
  if (typeof code === "string" && /^[0-9A-Z_]{1,64}$/u.test(code)) return `DATABASE:${code}`;
  return error instanceof Error && LOG_ERROR_NAME.test(error.name) ? error.name : "UNTYPED";
}
const BARE_STEP: StepLease = (use) => use();

export type PublicTreeRunnerSettings = Readonly<{
  pool: Pool;
  roles: PathRewriteRoles;
  writerRoleRef: string;
  checkerRoleRef: string;
  /** Shared with the rewrite and the sweeps, so nothing runs a second copy beside a live one (paid twice). */
  inFlight?: TreeUpdateSettings["inFlight"];
  tokenCount?: TokenCounter;
  wait?: TreeUpdateSettings["wait"];
  contractHash?: string;
  log: (event: string, detail: Record<string, unknown>) => void;
}>;

function treeSettingsOf(settings: PublicTreeRunnerSettings, digRunId: string): TreeUpdateSettings {
  return Object.freeze({ ports: publicTreePortsOf(settings.pool, digRunId), roles: settings.roles, writerRoleRef: settings.writerRoleRef, checkerRoleRef: settings.checkerRoleRef,
    log: settings.log, ...(settings.inFlight === undefined ? {} : { inFlight: settings.inFlight }), ...(settings.tokenCount === undefined ? {} : { tokenCount: settings.tokenCount }),
    ...(settings.wait === undefined ? {} : { wait: settings.wait }), ...(settings.contractHash === undefined ? {} : { contractHash: settings.contractHash }) });
}

type CheckOutcome = Readonly<{ kind: "ALLOW" | "REFUSE" | "UNAVAILABLE" }>;

/** The check's one call, then one of another maker when it fails. The makers the rewrite's checker and its backups are. */
async function runCheck(settings: PublicTreeRunnerSettings, dig: PathRewriteDig, digRunId: string, input: Parameters<typeof framedPublicContributionCheck>[0], lease: StepLease): Promise<CheckOutcome> {
  const framed = framedPublicContributionCheck(input);
  const primary = settings.roles.resolveProvider?.(settings.checkerRoleRef) ?? null;
  const backups = (settings.roles.backupCandidates ?? []).filter((candidate) => candidate.providerRef !== settings.checkerRoleRef);
  const backup = backups[0] ?? null;
  const makers: readonly StoryRoleMaker[] = [...(primary === null ? [] : [primary]), ...(backup === null ? [] : [{ provider: backup.provider, providerRef: backup.providerRef }])];
  if (makers.length === 0) return Object.freeze({ kind: "UNAVAILABLE" });
  const subject = contributionCheckSubjectOf(digRunId);
  const ports = publicTreePortsOf(settings.pool, digRunId);
  const book = ports.replayBookOf === undefined ? null : await lease(() => ports.replayBookOf!(digRunId, subject)).catch(() => null);
  for (const [at, maker] of makers.entries()) {
    try {
      const classify = (content: string, reply: ModelReplyFacts | undefined): ContentClassification => classifyStructuredArtifact(content, PublicContributionCheckReplySchema, reply);
      const reading = rememberingAcceptedReply(classify);
      const bound = PATH_REWRITE_POLICY.checkerBound;
      const gateway: ProviderGateway = book === null ? maker.provider : replayingGateway(book, maker.provider);
      const request: ProviderCallRequest = Object.freeze({
        runId: digRunId, subjectItemId: subject, callSiteKey: CHECK_SITE(at + 1), role: "EVALUATOR" as const, lane: "story" as const, preferredResponseFormat: "json_object" as const,
        bound: { maxAttempts: bound.maxAttempts, tokenCeiling: bound.tokenCeiling, deadlineMs: bound.deadlineMs },
        contractHash: settings.contractHash ?? engineContractHash(), providerRef: maker.providerRef, packet: framed.packet, classifyContent: reading.classifyContent,
        buildRepairPacket: (rejected: RejectedProviderContent) => buildFramedRepairPrompt(framed, schemaFailureLocator(rejected))
      });
      const result: ProviderCallResult = await lease(() => gateway.call(request));
      const parsed = parseStructuredArtifact(result.content, PublicContributionCheckReplySchema, reading.acceptedAs(result.content).reply);
      if (parsed.kind !== "PARSED") continue;
      const reply: PublicContributionCheckReply = parsed.value;
      settings.log("PUBLIC_CONTRIBUTION_CHECKED", { runId: digRunId, verdict: reply.verdict, reason: reply.reason, level: dig.level });
      return Object.freeze({ kind: reply.verdict === "ALLOW" ? "ALLOW" : "REFUSE" });
    } catch (error) {
      settings.log("PUBLIC_CONTRIBUTION_CHECK_CALL_FAILED", { runId: digRunId, round: at + 1, code: codeOf(error) });
    }
  }
  return Object.freeze({ kind: "UNAVAILABLE" });
}

type OwnRow = Readonly<{ entry: PathLineEntry | null; content: unknown }>;
async function ownRowOf(settings: PublicTreeRunnerSettings, contribution: PublicContributionRead, digRunId: string): Promise<OwnRow> {
  const tree = new PostgresPublicTreeRunnerRepository(settings.pool);
  const updateId = pathUpdateIdOf(digRunId, 0);
  const entry = ((await tree.readLine(contribution.parent_run_id)) ?? []).find((candidate) => candidate.source === "PATH_UPDATE" && candidate.entry_id?.toLowerCase() === updateId.toLowerCase()) ?? null;
  if (entry === null || entry.content === null) return Object.freeze({ entry, content: null });
  const content = await withRunContentLease(settings.pool, [digRunId], () => decryptContentForRun<unknown>(settings.pool, digRunId, PATH_UPDATE_CARRIER, updateId, entry.content, null));
  return Object.freeze({ entry, content });
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null && !Array.isArray(value);
function checkTextOf(content: unknown): Readonly<{ line: string; summary: string; whatChanged: readonly string[]; digPaths: readonly Readonly<{ line: string; points: readonly string[] }>[] }> | null {
  if (!isRecord(content) || !isRecord(content.text) || typeof content.text.line !== "string" || typeof content.text.summary !== "string" || !Array.isArray(content.what_changed)) return null;
  const pointsOf = (ref: unknown): readonly string[] => {
    const found = Array.isArray(content.public_points) ? content.public_points.find((entry: unknown) => isRecord(entry) && entry.position_ref === ref) as unknown : undefined;
    return isRecord(found) && Array.isArray(found.points) ? found.points.flatMap((point: unknown) => isRecord(point) && typeof point.text === "string" ? [point.text] : []) : [];
  };
  const digPaths = Array.isArray(content.dig_paths) ? content.dig_paths.flatMap((path: unknown) => isRecord(path) && typeof path.line === "string" ? [{ line: path.line, points: pointsOf(path.position_ref) }] : []) : [];
  return Object.freeze({ line: content.text.line, summary: content.text.summary, whatChanged: content.what_changed.filter((sentence: unknown): sentence is string => typeof sentence === "string"), digPaths });
}

/** Its rewrite and its check, from wherever it stands. Throws only when the store itself fails: the sweep's. */
async function rewriteAndCheck(settings: PublicTreeRunnerSettings, digRunId: string, contribution: PublicContributionRead, lease: StepLease): Promise<void> {
  const contributions = new PostgresPublicDebateRunnerRepository(settings.pool);
  const tree = treeSettingsOf(settings, digRunId);
  // The API stopped between the join and the copy: with nothing public to read, it never reaches the page, and holds nothing.
  const dig = await openPublicMaterial(settings.pool, digRunId) === null ? null : await tree.ports.digOf(digRunId);
  if (dig === null) {
    // No path: a dig with nowhere to land never reaches the page, and holds nothing.
    await contributions.settleCheck(digRunId, "UNAVAILABLE", null);
    return;
  }
  const written = await writePublicDigLevel(tree, { digRunId, dig, lease });
  if (written === "LEFT") return;
  const own = await ownRowOf(settings, contribution, digRunId);
  if (own.entry === null) return;
  if (own.entry.state === "FAILED") {
    await contributions.settleCheck(digRunId, "UNAVAILABLE", null);
    return;
  }
  const text = checkTextOf(own.content);
  if (text === null) {
    await contributions.settleCheck(digRunId, "UNAVAILABLE", null);
    return;
  }
  const page = await openPublicMaterial(settings.pool, digRunId);
  const before = page === null ? null : publicPathOf(page, contribution.position_ref ?? "");
  const outcome = await runCheck(settings, dig, digRunId, { question: dig.question.line, pathBefore: before?.line ?? "", personWrote: dig.picks.filter((pick) => pick.by !== "AI_SUGGESTION").map((pick) => pick.text),
    line: text.line, summary: text.summary, whatChanged: text.whatChanged, digPaths: text.digPaths }, lease);
  const checkRef = contributionCheckIdOf(digRunId);
  if (outcome.kind === "ALLOW") {
    await new PostgresPublicTreeRunnerRepository(settings.pool).recordCheckPassed(digRunId, checkRef);
  } else {
    await contributions.settleCheck(digRunId, outcome.kind === "REFUSE" ? "REFUSED" : "UNAVAILABLE", checkRef);
  }
}

/** The climb of an allowed contribution, and its end's mark. */
async function climbAllowed(settings: PublicTreeRunnerSettings, digRunId: string, contribution: PublicContributionRead, lease: StepLease): Promise<void> {
  const publicTree = new PostgresPublicTreeRunnerRepository(settings.pool);
  const updateId = pathUpdateIdOf(digRunId, 0);
  const own = ((await publicTree.readLine(contribution.parent_run_id)) ?? []).find((entry) => entry.source === "PATH_UPDATE" && entry.entry_id?.toLowerCase() === updateId.toLowerCase());
  if (own === undefined || own.changed !== true || contribution.position_ref === null) {
    await publicTree.markClimbDone(digRunId);
    return;
  }
  const outcome = await climbFrom(treeSettingsOf(settings, digRunId), { digRunId, debateRunId: contribution.parent_run_id, positionRef: contribution.position_ref,
    cause: Object.freeze({ kind: "PATH_UPDATE" as const, id: updateId }), step: 1 }, lease);
  if (outcome !== "LEFT") await publicTree.markClimbDone(digRunId);
}

/** One contribution from wherever it stands, once in this process. Never rejects. */
export async function advancePublicDig(settings: PublicTreeRunnerSettings, digRunId: string, lease: StepLease = BARE_STEP): Promise<void> {
  const release = settings.inFlight === undefined ? () => undefined : settings.inFlight.begin(digRunId);
  if (release === null) return;
  try {
    const contribution = await new PostgresPublicDebateRunnerRepository(settings.pool).readContribution(digRunId);
    if (contribution === null) return;
    if (contribution.outcome === null) await rewriteAndCheck(settings, digRunId, contribution, lease);
    else if (contribution.outcome === "ALLOWED") await climbAllowed(settings, digRunId, contribution, lease);
  } catch (error) {
    settings.log("PUBLIC_DIG_NOT_ADVANCED", { runId: digRunId, code: codeOf(error) });
  } finally {
    release();
  }
}

/**
 * The after-settle branch (`PathRewriteRunnerSettings.publicDig`): true when the settled run is a contribution, whose pipeline then ran in the story's place. The dig's own paths are
 * stored first, so a runner that stops is built again from the store alone. Never rejects: a contribution it could not start is the sweep's.
 */
export function publicDigOnSettle(settings: PublicTreeRunnerSettings, rewrite: () => PathRewriteRunnerSettings): (input: StoryWriteInput, lease: StepLease) => Promise<boolean> {
  return async (input, lease) => {
    try {
      const contribution = await new PostgresPublicDebateRunnerRepository(settings.pool).readContribution(input.runId);
      if (contribution === null) return false;
      const sources = rewrite();
      const digPaths = await digPathsOf(sources, input, lease);
      await lease(() => withRunContentLease(settings.pool, [input.runId], async () => {
        const sealed = await encryptAttestedContentForRun(settings.pool, input.runId, PUBLIC_DIG_INPUT_CARRIER, input.runId.toLowerCase(), digPathsForStore(digPaths));
        if (sealed !== null) await new PostgresPublicTreeRunnerRepository(settings.pool).recordDigInput(input.runId, input.workItemId, sealed);
      }));
      holdDigPassages(input.runId, digPaths);
      try {
        await advancePublicDig(settings, input.runId, lease);
      } finally {
        releaseRunPassages(input.runId);
      }
      return true;
    } catch (error) {
      settings.log("PUBLIC_DIG_NOT_STARTED", { runId: input.runId, code: codeOf(error) });
      return true;
    }
  };
}

/* ----------------------------------------------------------------- a report on a public debate */

/** The report composed: the closing's own steps and prompts, on the copy sealed under its carrier, on its own call sites, the writer naming who pays. */
export function composePublicReport(input: Readonly<{
  pool: Pool;
  targets: readonly Readonly<{ providerRef: string; model: string }>[];
  members: readonly Readonly<{ provider: ProviderGateway; providerRef: string; maker: string }>[];
  priceOf: (providerRef: string) => ProviderTargetPrice | null;
  /** The plans' reserves (`closingReservesOf`), read at the runner's boot. */
  reserveMicros: Readonly<{ paid: number; free: number }>;
  tokenCount?: TokenCounter;
  log: (event: string, detail: Record<string, unknown>) => void;
}>): Readonly<{ settings: InvestigationCloseSettings; list: () => Promise<readonly PublicReportUnwritten[]> }> | undefined {
  const writerRoleRef = input.targets.find((target) => target.model === PATH_REWRITE_WRITER_MODEL)?.providerRef;
  const checkerRoleRef = input.targets.find((target) => target.model === PATH_REWRITE_CHECKER_MODEL)?.providerRef;
  if (writerRoleRef === undefined || checkerRoleRef === undefined) return undefined;
  const pool = input.pool;
  const publicTree = new PostgresPublicTreeRunnerRepository(pool);
  const contributions = new PostgresPublicDebateRunnerRepository(pool);
  const members = Object.freeze([...input.members]);
  const rows = new Map<string, PublicReportUnwritten>();
  const spent = async (carrierRunId: string): Promise<number> => Number((await pool.query<{ spent: string }>(
    `SELECT coalesce(sum(charge_micros),0)::text AS spent FROM ledger.model_spend AS spend
      WHERE spend.run_id = $1 AND spend.spend_source = 'PUBLIC_REPORT'
        AND spend.recorded_at > coalesce(identity.read_public_report_charged_until($1), '-infinity'::timestamptz)`, [carrierRunId])).rows[0]?.spent ?? 0);
  const settings: InvestigationCloseSettings = Object.freeze({
    publicReport: Object.freeze({ callSiteOf: publicReportCallSiteKey }),
    reports: Object.freeze({
      readUnreported: async () => [],
      readWaiting: async () => null,
      readOfRun: async () => null,
      record: async (record: InvestigationReportRecord) => {
        const row = rows.get(record.reportId.toLowerCase());
        // Who pays first: the charge names the writer once (its id is the report's), and the report row then says it is over.
        if (row?.writer_ref !== null && row?.writer_ref !== undefined) {
          await contributions.recordReportCharge({ spendId: uuidOf(`debateai.public-report-charge.v1:${record.reportId.toLowerCase()}`), ownerRef: row.writer_ref, investigationId: record.reportId,
            reportVersion: record.reportVersion, chargeMicros: record.spentMicros });
        }
        const stored = await publicTree.recordReport({ reportId: record.reportId, outcome: record.outcome, storyOutcome: record.storyOutcome, failureCode: record.failureCode,
          fingerprint: record.dossierFingerprint, ladderStep: record.ladderStep, leftOut: record.leftOut, answerRounds: record.answerRounds, storyRounds: record.storyRounds,
          writerLineage: record.writerLineage, checkerLineage: record.checkerLineage, artifactRefs: record.artifactRefs, spentMicros: record.spentMicros, content: record.content });
        return stored === "NOT_FOUND" ? "NO_CLOSING" as const : stored;
      }
    }),
    sources: Object.freeze({
      inputOf: async (closing: UnreportedClosing) => {
        const material = await openPublicMaterial(pool, closing.investigationId);
        if (material === null) return null;
        const row = rows.get(closing.investigationId.toLowerCase());
        return Object.freeze({ input: dossierFromMaterial(material, { earlier: material.earlier_report }), free: row?.free ?? true, questionLine: material.question });
      }
    }),
    seal: (carrierRunId: string, reportId: string, content: InvestigationReportContent): Promise<WebSealed> => withRunContentLease(pool, [carrierRunId], async () => {
      const sealed = await encryptAttestedContentForRun(pool, carrierRunId, PUBLIC_REPORT_CARRIER, reportId, content);
      if (sealed === null) throw new TypedDomainError("INVESTIGATION_REPORT_ENCRYPTION_REQUIRED", "A report is kept only under its carrier's run key");
      return sealed;
    }),
    roles: Object.freeze({
      resolveProvider: (roleRef: string) => {
        const member = members.find((candidate) => candidate.providerRef === roleRef);
        return member === undefined ? null : { provider: member.provider, providerRef: member.providerRef };
      },
      backupCandidates: members,
      backupMakers: Object.freeze(members.map((member) => Object.freeze({ providerRef: member.providerRef, maker: member.maker })))
    }),
    writerRoleRef,
    checkerRoleRef,
    admission: Object.freeze({
      spentMicros: spent,
      projectedMicros: (request: ProviderCallRequest) => investigationReportProjectedMicros(request, input.priceOf(request.providerRef))
    }),
    reserveMicros: input.reserveMicros,
    payerOf: async (closing: UnreportedClosing) => {
      const row = rows.get(closing.investigationId.toLowerCase());
      return Object.freeze({ ownerRef: row?.writer_ref ?? null, free: row?.free ?? true });
    },
    ...(input.tokenCount === undefined ? {} : { tokenCount: input.tokenCount }),
    log: input.log
  });
  return Object.freeze({
    settings,
    list: async () => {
      const listed = await publicTree.readReportsUnwritten();
      for (const row of listed) rows.set(row.report_id.toLowerCase(), row);
      return listed;
    }
  });
}

/* ----------------------------------------------------------------- the sweep */

export const PUBLIC_TREE_SWEEP_DEFAULTS = Object.freeze({ staleMs: 20 * 60_000, everyMs: 60_000, limit: 50 });

/**
 * THE PUBLIC TREE'S SWEEP. Whatever stopped goes on: a dig whose debate failed settles UNAVAILABLE (the page is left alone, and nothing else waits on it); a finished dig with no settled
 * check (a runner that stopped) is rewritten and checked from the store; an allowed contribution climbs; a report waiting for its writer is written. Its passages, if any are still held, are
 * read by name as in the after-settle branch.
 */
export async function sweepPublicTree(settings: PublicTreeRunnerSettings & Readonly<{ reports?: ReturnType<typeof composePublicReport>; staleMs?: number; limit?: number; now?: () => Date }>):
  Promise<Readonly<{ settled: number; advanced: number; climbed: number; reports: number }>> {
  const publicTree = new PostgresPublicTreeRunnerRepository(settings.pool);
  const contributions = new PostgresPublicDebateRunnerRepository(settings.pool);
  const now = (settings.now ?? (() => new Date()))();
  const limit = settings.limit ?? PUBLIC_TREE_SWEEP_DEFAULTS.limit;
  let settled = 0;
  let advanced = 0;
  let climbed = 0;
  let reports = 0;
  try {
    for (const open of await publicTree.readDigsUnsettled(new Date(now.getTime() - (settings.staleMs ?? PUBLIC_TREE_SWEEP_DEFAULTS.staleMs)), limit)) {
      if (!open.finished) {
        await contributions.settleCheck(open.dig_run_id, "UNAVAILABLE", null);
        settled += 1;
      } else {
        await advancePublicDig(settings, open.dig_run_id);
        advanced += 1;
      }
    }
    for (const digRunId of await publicTree.readClimbsOwed(limit)) {
      await advancePublicDig(settings, digRunId);
      climbed += 1;
    }
    if (settings.reports !== undefined && settings.reports !== null) {
      for (const row of await settings.reports.list()) {
        await closeInvestigation(settings.reports.settings, { investigationId: row.report_id, reportVersion: row.report_version, rootRunId: row.carrier_run_id, closedAt: row.requested_at });
        reports += 1;
      }
    }
  } catch (error) {
    settings.log("PUBLIC_TREE_SWEEP_UNREAD", { code: codeOf(error) });
  }
  return Object.freeze({ settled, advanced, climbed, reports });
}

export function startPublicTreeSweep(settings: Parameters<typeof sweepPublicTree>[0] & Readonly<{ everyMs?: number; paused?: () => boolean }>): Readonly<{ stop: () => void; idle: () => Promise<void> }> {
  let running: Promise<unknown> = Promise.resolve();
  let busy = false;
  const pass = (): void => {
    if (busy || settings.paused?.() === true) return;
    busy = true;
    running = sweepPublicTree(settings).catch(() => undefined).finally(() => { busy = false; });
  };
  pass();
  const timer = setInterval(pass, settings.everyMs ?? PUBLIC_TREE_SWEEP_DEFAULTS.everyMs);
  timer.unref?.();
  return Object.freeze({ stop: () => { clearInterval(timer); }, idle: () => running.then(() => undefined) });
}
