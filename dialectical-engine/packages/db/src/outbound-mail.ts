import type { Pool } from "pg";

/**
 * The daily outbound mail limit's storage (0170): the shared count and the suppression list, for every API copy.
 * Each method calls one SECURITY DEFINER function; the API's login has no right on the tables themselves. Counts and
 * keyed digests only: no address ever reaches this file.
 */
export type OutboundMailClass = "standard" | "security";
export type OutboundMailAlertKind = "ALERT_SHARE" | "STANDARD_LIMIT" | "DAILY_LIMIT";

export class PostgresOutboundMailStore {
  constructor(private readonly pool: Pick<Pool, "query">) {}

  /** Counts one hand-off only while the day's total is below `ceiling`. Atomic across every API copy (0170's header). */
  async reserve(request: Readonly<{ purposeClass: OutboundMailClass; ceiling: number }>): Promise<Readonly<{ admitted: boolean; total: number; day: string }>> {
    const result = await this.pool.query<{ admitted: boolean; total_sent: number; day_text: string }>(
      "SELECT admitted,total_sent,count_day::text AS day_text FROM identity.reserve_outbound_mail($1,$2)",
      [request.purposeClass, request.ceiling]
    );
    const row = result.rows[0];
    if (row === undefined) throw new TypeError("OUTBOUND_MAIL_RESERVATION_EMPTY");
    return Object.freeze({ admitted: row.admitted, total: row.total_sent, day: row.day_text });
  }

  async today(): Promise<Readonly<{ total: number; day: string }>> {
    const result = await this.pool.query<{ total_sent: number; day_text: string }>(
      "SELECT total_sent,count_day::text AS day_text FROM identity.outbound_mail_today()"
    );
    const row = result.rows[0];
    if (row === undefined) throw new TypeError("OUTBOUND_MAIL_TODAY_EMPTY");
    return Object.freeze({ total: row.total_sent, day: row.day_text });
  }

  /** True for exactly one caller per kind per day, across every API copy and restart. */
  async claimAlert(kind: OutboundMailAlertKind, day: string): Promise<boolean> {
    const result = await this.pool.query<{ claimed: boolean }>(
      "SELECT identity.claim_outbound_mail_alert($1,$2::date) AS claimed", [kind, day]
    );
    return result.rows[0]?.claimed === true;
  }

  async isSuppressed(digest: Buffer): Promise<boolean> {
    const result = await this.pool.query<{ suppressed: boolean }>(
      "SELECT identity.outbound_mail_recipient_suppressed($1) AS suppressed", [digest]
    );
    return result.rows[0]?.suppressed === true;
  }
}
