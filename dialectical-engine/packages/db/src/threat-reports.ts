import type { Pool } from "pg";
import { TypedDomainError } from "@debateai/kernel";

const KNOWN = new Set([
  "STAFF_AUTHORITY_INVALID", "THREAT_REPORT_NOT_FOUND", "THREAT_REPORT_OWN",
  "THREAT_REPORT_ALREADY_DECIDED", "THREAT_REPORT_DECISION_INVALID",
  "THREAT_REPORT_HOLD_NOT_ERASING"
]);

function rethrow(error: unknown): never {
  const detail = error as { code?: string; message?: string };
  if (detail?.code && ["P0001", "P0002", "42501", "22023", "23505"].includes(detail.code)) {
    const code = detail.code === "23505" ? "THREAT_REPORT_ALREADY_DECIDED" : detail.message;
    if (code && KNOWN.has(code)) throw new TypedDomainError(code, code);
  }
  throw error;
}

export type ThreatReportDecision = "REPORTED" | "NOT_REPORTED";
export type ThreatReportListRow = Readonly<{
  report_ref: string; kept_at: Date; decision: string; decided_at: Date | null;
}>;
export type ThreatReportReadRow = ThreatReportListRow & Readonly<{
  question: string; account_user_id: string | null; held_email: string | null;
}>;
export type ThreatReportAccount = Readonly<{ account_user_id: string | null; has_held_email: boolean }>;
export type ThreatReportAlertClaim = Readonly<{
  alert_id: string; recipient_staff_id: string; claim_token: string;
}>;

/** Every operation delegates to one 0127 function; no application clock enters these calls. */
export class PostgresThreatReportRepository {
  constructor(private readonly pool: Pick<Pool, "query">) {}

  async keep(question: string, account: string | null): Promise<string> {
    try {
      const result = await this.pool.query<{ report_ref: string }>(
        "SELECT staff.keep_threat_report($1::text,$2::uuid) report_ref", [question, account]);
      return result.rows[0]!.report_ref;
    } catch (error) { return rethrow(error); }
  }

  async keepWithHeldEmail(question: string, account: string, email: string): Promise<string> {
    try {
      const result = await this.pool.query<{ report_ref: string }>(
        "SELECT staff.keep_threat_report_with_email($1::text,$2::uuid,$3::text) report_ref",
        [question, account, email]);
      return result.rows[0]!.report_ref;
    } catch (error) { return rethrow(error); }
  }

  async list(context: unknown, token: string): Promise<ThreatReportListRow[]> {
    try {
      const result = await this.pool.query<ThreatReportListRow>(
        "SELECT * FROM staff.list_threat_reports($1::jsonb,$2::text)", [context, token]);
      return result.rows;
    } catch (error) { return rethrow(error); }
  }

  async countUnread(context: unknown, token: string): Promise<number> {
    try {
      const result = await this.pool.query<{ count: number }>(
        "SELECT staff.count_unread_threat_reports($1::jsonb,$2::text) count", [context, token]);
      return result.rows[0]!.count;
    } catch (error) { return rethrow(error); }
  }

  async read(context: unknown, token: string, ref: string): Promise<ThreatReportReadRow> {
    try {
      const result = await this.pool.query<ThreatReportReadRow>(
        "SELECT * FROM staff.read_threat_report($1::jsonb,$2::text,$3::uuid)", [context, token, ref]);
      return result.rows[0]!;
    } catch (error) { return rethrow(error); }
  }

  async peekAccount(context: unknown, token: string, ref: string): Promise<ThreatReportAccount> {
    try {
      const result = await this.pool.query<ThreatReportAccount>(
        "SELECT * FROM staff.peek_threat_report_account($1::jsonb,$2::text,$3::uuid)", [context, token, ref]);
      return result.rows[0]!;
    } catch (error) { return rethrow(error); }
  }

  async decide(context: unknown, token: string, ref: string, decision: ThreatReportDecision, proof: unknown): Promise<string> {
    try {
      const result = await this.pool.query<{ decision: string }>(
        "SELECT staff.decide_threat_report($1::jsonb,$2::text,$3::uuid,$4::text,$5::jsonb) decision",
        [context, token, ref, decision, proof]);
      return result.rows[0]!.decision;
    } catch (error) { return rethrow(error); }
  }

  async eraseDue(): Promise<number> {
    try {
      const result = await this.pool.query<{ erased: number }>("SELECT staff.erase_due_threat_reports() erased");
      return result.rows[0]!.erased;
    } catch (error) { return rethrow(error); }
  }

  async holdEmails(erasureId: string, email: string): Promise<number> {
    try {
      const result = await this.pool.query<{ held: number }>(
        "SELECT staff.hold_threat_report_email($1::uuid,$2::text) held", [erasureId, email]);
      return result.rows[0]!.held;
    } catch (error) { return rethrow(error); }
  }

  async claimAlerts(limit: number): Promise<ThreatReportAlertClaim[]> {
    try {
      const result = await this.pool.query<ThreatReportAlertClaim>(
        "SELECT * FROM staff.claim_threat_report_alerts($1::integer)", [limit]);
      return result.rows;
    } catch (error) { return rethrow(error); }
  }

  async completeAlert(alert: string, claim: string, delivered: boolean): Promise<void> {
    try {
      await this.pool.query("SELECT staff.complete_threat_report_alert($1::uuid,$2::uuid,$3::boolean)",
        [alert, claim, delivered]);
    } catch (error) { rethrow(error); }
  }
}
