import type { Pool, PoolClient } from "pg";
import type { InvestigationRead } from "./investigations.js";
import type { WebSealed } from "./web-evidence.js";

/**
 * The final report over an investigation (migration 0136; plan task W5-1; owner answer F7 A), through 0136's definers
 * only. `PostgresInvestigationReportRunnerRepository` runs on the runner's or the scheduler's pool (debateai_runtime):
 * it lists the closings still waiting for their report, reads what a report still waits for (the digs still running and
 * the path rewrites still being written; a dig paused at the month wall does not count and goes to the next version),
 * stores the report once (which also records it on 0133's closing, in the same transaction), reads the reports of an
 * investigation and when its newest closing without a report was made (the money seam sums that closing's
 * INVESTIGATION_REPORT charges, which name the ROOT's run, from then on). `PostgresInvestigationReportRepository` runs on
 * the API's own pool (debateai_billing_runtime): the person's reports, with the investigation and how many debates the
 * report still waits for.
 *
 * Carrier (packages/crypto CONTENT_CARRIERS): `identity.investigation_report`, sealed by the caller under the
 * investigation's ROOT run key and bound to the report id (lower-case, as Postgres renders a uuid), checked on insert by
 * 0136's content trigger. A FAILED report carries no content.
 */
type Executor = Pick<Pool, "query"> | PoolClient;

export const INVESTIGATION_REPORT_CARRIER = "identity.investigation_report" as const;
export const READ_DATA_EXPORT_INVESTIGATION_REPORTS = "identity.read_data_export_investigation_reports(uuid,uuid)" as const;

export type InvestigationReportOutcome = "READY" | "READY_WITH_RESERVATION" | "FAILED";
export type UnreportedClosing = Readonly<{ investigationId: string; reportVersion: number; rootRunId: string; closedAt: string }>;
export type InvestigationWaitingRead = Readonly<{ investigation_id: string; root_run_id: string; waiting: readonly string[] }>;
export type InvestigationReportRecord = Readonly<{
  investigationId: string; reportVersion: number; reportId: string;
  outcome: InvestigationReportOutcome; storyOutcome: InvestigationReportOutcome | null; failureCode: string | null;
  /** The newest path rewrite the version covered (0134), or none. */
  coveredRewrite: Readonly<{ rewriteId: string; recordedAt: string }> | null;
  dossierFingerprint: string; ladderStep: number; leftOut: number; answerRounds: number; storyRounds: number;
  writerLineage: Readonly<Record<string, unknown>> | null; checkerLineage: Readonly<Record<string, unknown>> | null;
  artifactRefs: readonly string[]; spentMicros: number;
  /** Sealed under the ROOT's run key with INVESTIGATION_REPORT_CARRIER and the report id; null for FAILED. */
  content: WebSealed | null;
}>;
export type InvestigationReportEntry = Readonly<{
  report_version: number; report_id: string; outcome: InvestigationReportOutcome; story_outcome: InvestigationReportOutcome | null;
  failure_code: string | null; covered_rewrite_id: string | null; covered_rewrite_recorded_at: string | null;
  ladder_step: number; left_out: number; spent_micros: number; recorded_at: string;
  /** The stored envelope (null for FAILED): open it under the ROOT's run key. */
  content: unknown;
}>;
export type InvestigationReportsRead = Readonly<{ investigation_id: string; root_run_id: string; reports: readonly InvestigationReportEntry[] }>;
export type InvestigationReportsOwnerRead = Readonly<{ investigation: InvestigationRead; waiting: number; reports: readonly InvestigationReportEntry[] }>;
export type InvestigationReportWriteOutcome = "RECORDED" | "ALREADY" | "NO_CLOSING";

/** Runner / scheduler pool (debateai_runtime). */
export class PostgresInvestigationReportRunnerRepository {
  constructor(private readonly pool: Executor) {}

  /** The closings still waiting for their report (none recorded, not reopened), oldest first, at most `limit` (1..100). */
  async readUnreported(limit = 20): Promise<readonly UnreportedClosing[]> {
    const rows = (await this.pool.query<{ closings: Array<{ investigation_id: string; report_version: number; root_run_id: string;
      closed_at: string }> }>("SELECT identity.read_unreported_closings($1) AS closings", [limit])).rows[0]!.closings;
    return Object.freeze(rows.map((row) => Object.freeze({ investigationId: row.investigation_id, reportVersion: row.report_version,
      rootRunId: row.root_run_id, closedAt: row.closed_at })));
  }

  /** What the report of the debate's investigation still waits for; null when it is not live or in no investigation. */
  async readWaiting(runId: string): Promise<InvestigationWaitingRead | null> {
    return (await this.pool.query<{ waiting: InvestigationWaitingRead | null }>(
      "SELECT identity.read_investigation_waiting_of_run($1) AS waiting", [runId])).rows[0]?.waiting ?? null;
  }

  /** The report of one closing, set once; it is also recorded on the closing (0133's report_ref) in the same transaction. */
  async record(record: InvestigationReportRecord): Promise<InvestigationReportWriteOutcome> {
    return (await this.pool.query<{ outcome: InvestigationReportWriteOutcome }>(
      `SELECT identity.record_investigation_report_version($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb,
        $16::jsonb,$17,$18::jsonb,$19) AS outcome`,
      [record.investigationId, record.reportVersion, record.reportId, record.outcome, record.storyOutcome, record.failureCode,
        record.coveredRewrite?.rewriteId ?? null, record.coveredRewrite?.recordedAt ?? null, record.dossierFingerprint,
        record.ladderStep, record.leftOut, record.answerRounds, record.storyRounds,
        record.writerLineage === null ? null : JSON.stringify(record.writerLineage),
        record.checkerLineage === null ? null : JSON.stringify(record.checkerLineage),
        JSON.stringify(record.artifactRefs), record.spentMicros,
        record.content === null ? null : JSON.stringify(record.content.envelope), record.content?.attestation ?? null])).rows[0]!.outcome;
  }

  /** The reports of the debate's investigation, oldest version first; null when it is not live or in no investigation. */
  async readOfRun(runId: string): Promise<InvestigationReportsRead | null> {
    return (await this.pool.query<{ reports: InvestigationReportsRead | null }>(
      "SELECT identity.read_investigation_reports_of_run($1) AS reports", [runId])).rows[0]?.reports ?? null;
  }

  /** When the newest closing without a report of the investigation whose ROOT is `rootRunId` was made; null when none. */
  async readClosingSince(rootRunId: string): Promise<Date | null> {
    return (await this.pool.query<{ since: Date | null }>(
      "SELECT identity.read_closing_since_of_root($1) AS since", [rootRunId])).rows[0]?.since ?? null;
  }
}

/** The API's pool (debateai_billing_runtime). */
export class PostgresInvestigationReportRepository {
  constructor(private readonly pool: Executor) {}

  /** The person's reports of the debate's investigation; null when the debate is not theirs or in no investigation. */
  async read(ownerRef: string, runId: string): Promise<InvestigationReportsOwnerRead | null> {
    return (await this.pool.query<{ reports: InvestigationReportsOwnerRead | null }>(
      "SELECT identity.read_investigation_reports($1,$2) AS reports", [ownerRef, runId])).rows[0]?.reports ?? null;
  }
}
