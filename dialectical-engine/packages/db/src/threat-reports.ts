import type { Pool } from "pg";

/**
 * The retention sweep over 0128's staff.threat_report, and nothing else. The staff screens, the alert mail and the email
 * hold were removed (2026-11-19), and no product code has kept a report since 0171 took 0128's keepers back from the
 * runtime role; but a database may still hold reports kept before that, so the sweep keeps erasing them on 0128's
 * schedule (an unread report 30 days after it was kept, a reported one 6 months after the decision) until the migration
 * that drops the schema. `eraseDue` is the cross-account marker's since 0171: the API calls it only from its gated
 * hourly timer, outside any request, on its system login. No application clock enters the call.
 */
export class PostgresThreatReportRepository {
  constructor(private readonly pool: Pick<Pool, "query">) {}

  async eraseDue(): Promise<number> {
    const result = await this.pool.query<{ erased: number }>("SELECT staff.erase_due_threat_reports() erased");
    return result.rows[0]!.erased;
  }
}
