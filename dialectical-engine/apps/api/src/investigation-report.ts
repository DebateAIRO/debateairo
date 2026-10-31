import {
  INVESTIGATION_REPORT_LIMITS,
  InvestigationReportAnswerSchema,
  InvestigationReportSourceSchema,
  InvestigationReportsSchema,
  InvestigationReportStorySchema,
  type InvestigationReports,
  type InvestigationReportVersion
} from "@debateai/contract";
import {
  decryptLeasedContentForRun,
  INVESTIGATION_REPORT_CARRIER,
  prepareLeasedContentEncryptionForRuns,
  withRunContentLease,
  type InvestigationReportsOwnerRead,
  type Pool
} from "@debateai/db";
import type { CryptoEnvelope } from "@debateai/crypto";
import { exhaustive, TypedDomainError } from "@debateai/kernel";
import { z } from "zod";

/**
 * THE FINAL REPORT OVER AN INVESTIGATION, the API's half (plan 2026-10-30 task W5-1; design W0-1, owner answers F1-F14;
 * migrations 0133 and 0136). Three owner-only routes over these functions (apps/api/src/index.ts):
 *  - GET /v1/runs/{id}/investigation: the investigation the debate is in and its report versions, oldest first. Each of
 *    0133's closings is one version; 0136's report row says what became of it. A closing with no report yet (and not
 *    reopened) is still being written, and says how many digs it waits for; a FAILED row is FAILED; a written one is the
 *    content the runner sealed under the ROOT's run key, opened here. A content that does not open into the shape below
 *    is served as FAILED (the person may write it again), never as a failed read.
 *  - POST /v1/runs/{id}/report ("Write my report"): closes the investigation (0133 also wipes its page texts) and so
 *    numbers the next version. A second press while that version is written changes nothing; a press after a FAILED
 *    version reopens and closes again (a new version); a press after a finished one is refused (INVESTIGATION_CLOSED: the
 *    page offers "Keep digging", which reopens).
 *  - POST /v1/runs/{id}/reopen ("Keep digging"): refused while the newest version is still being written.
 * Another account's debate is the closed 404 everywhere (each definer checks ownership itself; `owns` says it for a debate
 * that is in no investigation, which the reports read cannot tell apart from one that is not this account's).
 */

/** What the runner seals (the lead's runner writer, apps/runner): the report's texts, its sources and the F13 flag. */
export const InvestigationReportContentSchema = z.object({
  v: z.literal(1),
  answer: InvestigationReportAnswerSchema,
  story: InvestigationReportStorySchema.nullable(),
  sources: z.array(InvestigationReportSourceSchema).max(INVESTIGATION_REPORT_LIMITS.sourcesMax),
  shortened: z.boolean()
}).strict();
export type InvestigationReportContent = z.infer<typeof InvestigationReportContentSchema>;

export type ReportContentItem = Readonly<{ carrier: typeof INVESTIGATION_REPORT_CARRIER; primaryKey: string; envelope: unknown }>;

export interface InvestigationReportPorts {
  /** 0136's read_investigation_reports (`PostgresInvestigationReportRepository.read`). */
  readonly reports: Readonly<{ read(ownerRef: string, runId: string): Promise<InvestigationReportsOwnerRead | null> }>;
  /** 0133's open, close and reopen (`PostgresInvestigationRepository`). */
  readonly investigations: Readonly<{
    open(ownerRef: string, runId: string): Promise<string | null>;
    close(ownerRef: string, investigationId: string): Promise<Readonly<{
      outcome: "CLOSED" | "ALREADY_CLOSED" | "NOT_OWNED"; reportVersion: number | null }>>;
    reopen(ownerRef: string, investigationId: string): Promise<"REOPENED" | "ALREADY_OPEN" | "NOT_OWNED">;
  }>;
  /** Whether the debate is this account's (0131's ownership rule): a debate in no investigation reads OPEN, or 404. */
  owns(ownerRef: string, runId: string): Promise<boolean>;
  /** The envelopes opened under the ROOT's run key, in order; null when its private content was erased meanwhile. */
  openRootContent(rootRunId: string, items: readonly ReportContentItem[]): Promise<readonly unknown[] | null>;
}

type Target = Readonly<{ ownerRef: string; runId: string }>;

/** Postgres renders a timestamp with its offset; the contract carries the ISO form (Z). */
function iso(value: string): string {
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) throw new TypeError("INVESTIGATION_REPORT_ROW_INVALID");
  return at.toISOString();
}

const finished = (version: InvestigationReportVersion): boolean =>
  version.state === "READY" || version.state === "READY_WITH_RESERVATION";

/** The read as the contract serves it: every closing a version, the written ones opened. */
async function shapeReports(read: InvestigationReportsOwnerRead, ports: InvestigationReportPorts): Promise<InvestigationReports> {
  const { investigation } = read;
  const rootRunId = investigation.root_run_id;
  const closings = [...investigation.closings].sort((a, b) => a.report_version - b.report_version);
  const reportOf = new Map(read.reports.map((report) => [report.report_version, report]));
  const written = closings.flatMap((closing) => {
    const report = reportOf.get(closing.report_version);
    return report !== undefined && report.outcome !== "FAILED" && report.content !== null && report.content !== undefined
      ? [report] : [];
  });
  const opened = written.length === 0 ? [] : await ports.openRootContent(rootRunId, written.map((report) => Object.freeze({
    carrier: INVESTIGATION_REPORT_CARRIER, primaryKey: report.report_id.toLowerCase(), envelope: report.content })));
  const contentOf = new Map<number, InvestigationReportContent>();
  written.forEach((report, at) => {
    const parsed = InvestigationReportContentSchema.safeParse(opened?.[at]);
    if (parsed.success) contentOf.set(report.report_version, parsed.data);
  });
  const waiting = Math.min(Math.max(0, Math.trunc(read.waiting)), INVESTIGATION_REPORT_LIMITS.digsMax);
  const versions = closings.map((closing, at): InvestigationReportVersion => {
    const base = { report_version: closing.report_version, closed_at: iso(closing.closed_at) };
    const report = reportOf.get(closing.report_version);
    if (report === undefined) {
      // Not written yet: only the newest closing, still closed, is being written. One reopened before its report (a dig
      // started meanwhile) is never written: it reads as FAILED from when it was reopened.
      if (closing.reopened_at === null && at === closings.length - 1) return { ...base, state: "WRITING", waiting_for_digs: waiting };
      return { ...base, state: "FAILED", written_at: iso(closing.reopened_at ?? closing.closed_at) };
    }
    const content = contentOf.get(closing.report_version);
    if (report.outcome === "FAILED" || content === undefined) return { ...base, state: "FAILED", written_at: iso(report.recorded_at) };
    return { ...base, state: report.outcome, written_at: iso(report.recorded_at), answer: content.answer, story: content.story,
      sources: content.sources, shortened: content.shortened };
  });
  const digs = investigation.members.filter((member) => member.run_id.toLowerCase() !== rootRunId.toLowerCase()).length;
  return InvestigationReportsSchema.parse({
    investigation_id: investigation.investigation_id,
    root_run_id: rootRunId,
    state: investigation.state === "closed" ? "CLOSED" : "OPEN",
    digs: Math.min(digs, INVESTIGATION_REPORT_LIMITS.digsMax),
    versions,
    current: versions.filter(finished).at(-1)?.report_version ?? null
  });
}

/** GET /v1/runs/{id}/investigation; null: not this account's debate (the closed 404). */
export async function readInvestigationReports(target: Target, ports: InvestigationReportPorts): Promise<InvestigationReports | null> {
  const read = await ports.reports.read(target.ownerRef, target.runId);
  if (read !== null) return shapeReports(read, ports);
  if (!(await ports.owns(target.ownerRef, target.runId))) return null;
  // In no investigation yet: open, with nothing written (the debate is its own root until a dig or a report opens one).
  return InvestigationReportsSchema.parse({ investigation_id: null, root_run_id: target.runId, state: "OPEN", digs: 0, versions: [],
    current: null });
}

export type WriteReportOutcome =
  | Readonly<{ kind: "WRITING"; reportVersion: number; waitingForDigs: number }>
  | Readonly<{ kind: "CLOSED" }>
  | Readonly<{ kind: "NOT_FOUND" }>;

const NOT_FOUND = Object.freeze({ kind: "NOT_FOUND" as const });

/**
 * POST /v1/runs/{id}/report ("Write my report"). The debate's investigation is opened first (one with this debate as its
 * root when it is in none; a dig answers its own investigation), then closed, which numbers the version the runner writes.
 */
export async function writeInvestigationReport(target: Target, ports: InvestigationReportPorts): Promise<WriteReportOutcome> {
  const investigationId = await ports.investigations.open(target.ownerRef, target.runId);
  if (investigationId === null) return NOT_FOUND;
  // Two rounds at most: a press that loses the race to close (ALREADY_CLOSED) reads what the other press numbered.
  for (let round = 0; round < 2; round += 1) {
    const read = await ports.reports.read(target.ownerRef, target.runId);
    if (read === null) return NOT_FOUND;
    if (read.investigation.state === "closed") {
      const newest = (await shapeReports(read, ports)).versions.at(-1);
      if (newest?.state === "WRITING") return writing(newest.report_version, newest.waiting_for_digs);
      if (newest !== undefined && newest.state !== "FAILED") return Object.freeze({ kind: "CLOSED" as const });
      // The newest version failed: writing it again is a new version (reopen, then close).
      const reopened = await ports.investigations.reopen(target.ownerRef, read.investigation.investigation_id);
      if (reopened === "NOT_OWNED") return NOT_FOUND;
    }
    const closed = await ports.investigations.close(target.ownerRef, read.investigation.investigation_id);
    switch (closed.outcome) {
      case "CLOSED": {
        if (closed.reportVersion === null) throw new TypeError("INVESTIGATION_CLOSE_ROW_INVALID");
        // What the new version waits for (digs still running, rewrites still being written), read after the close.
        const after = await ports.reports.read(target.ownerRef, target.runId);
        return writing(closed.reportVersion, after?.waiting ?? 0);
      }
      case "ALREADY_CLOSED": continue;
      case "NOT_OWNED": return NOT_FOUND;
      default: return exhaustive(closed.outcome);
    }
  }
  throw new TypedDomainError("INVESTIGATION_CLOSE_RACE", "The investigation changed twice while it was being closed");
}

function writing(reportVersion: number, waiting: number): WriteReportOutcome {
  return Object.freeze({ kind: "WRITING" as const, reportVersion,
    waitingForDigs: Math.min(Math.max(0, Math.trunc(waiting)), INVESTIGATION_REPORT_LIMITS.digsMax) });
}

export type ReopenOutcome =
  | Readonly<{ kind: "OPEN" }>
  | Readonly<{ kind: "WRITING"; reportVersion: number }>
  | Readonly<{ kind: "NOT_FOUND" }>;

/**
 * POST /v1/runs/{id}/reopen ("Keep digging"): refused while the newest version is still being written (nothing changes);
 * an investigation already open answers OPEN too. A debate in no investigation has nothing to reopen (the closed 404).
 */
export async function reopenInvestigation(target: Target, ports: InvestigationReportPorts): Promise<ReopenOutcome> {
  const read = await ports.reports.read(target.ownerRef, target.runId);
  if (read === null) return NOT_FOUND;
  const closings = read.investigation.closings;
  const newest = closings.reduce<(typeof closings)[number] | undefined>(
    (latest, closing) => latest === undefined || closing.report_version > latest.report_version ? closing : latest, undefined);
  if (read.investigation.state === "closed" && newest !== undefined && newest.reopened_at === null
    && !read.reports.some((report) => report.report_version === newest.report_version)) {
    return Object.freeze({ kind: "WRITING" as const, reportVersion: newest.report_version });
  }
  const outcome = await ports.investigations.reopen(target.ownerRef, read.investigation.investigation_id);
  switch (outcome) {
    case "REOPENED":
    case "ALREADY_OPEN": return Object.freeze({ kind: "OPEN" as const });
    case "NOT_OWNED": return NOT_FOUND;
    default: return exhaustive(outcome);
  }
}

/**
 * The opener over the API's own pool (main.ts `pool`, which carries the content cipher): every envelope under the ROOT's
 * run key inside one private-content lease, as #readPathRewrites opens the path rewrites. A root whose private content
 * was erased meanwhile answers null (its versions read as FAILED); any other failure fails the read.
 */
export function investigationReportContentOpener(pool: Pool): InvestigationReportPorts["openRootContent"] {
  return async (rootRunId, items) => {
    const scope = [rootRunId.toLowerCase()];
    try {
      return await withRunContentLease(pool, scope, async () => {
        const ciphers = await prepareLeasedContentEncryptionForRuns(pool, scope);
        const cipher = ciphers.get(scope[0]!)!;
        try {
          const values = items.map((item) =>
            decryptLeasedContentForRun<unknown>(cipher, item.carrier, item.primaryKey, item.envelope as CryptoEnvelope, null));
          await cipher.assertLive();
          return values;
        } finally {
          await cipher.close();
        }
      });
    } catch (error) {
      if (error instanceof TypedDomainError && error.code === "PRIVATE_CONTENT_ERASED") return null;
      throw error;
    }
  };
}
