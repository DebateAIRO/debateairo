import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { PostgresThreatReportRepository, migrate } from "@debateai/db";
import * as closure from "../../apps/api/src/staff/threat-report-closure.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * 2026-11-19: the staff threat reports were removed, with the email hold that ran before an erased account's key was
 * destroyed (it only kept the asker's address readable for the removed staff screen). What is left until the migration
 * that drops 0128's schema: a report a database may still hold is unlinked when its account is erased (0128's
 * account_user_id is ON DELETE SET NULL) and keeps no address, and the hourly sweep erases it when due.
 */
describe("S04 threat report erasure database gates", () => {
  let database: TestDatabase;
  let repository: PostgresThreatReportRepository;
  let sweep: PostgresThreatReportRepository;
  async function asRole<T extends Record<string, unknown> = Record<string, unknown>>(
    statement: string, values: unknown[] = [], role = "debateai_runtime"
  ): Promise<T[]> {
    const client = await database.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SET LOCAL ROLE ${role}`);
      const rows = (await client.query<T>(statement, values)).rows;
      await client.query("COMMIT");
      return rows;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  beforeAll(async () => {
    database = await startTestDatabase();
    await migrate(database.pool);
    repository = new PostgresThreatReportRepository({ query: async (sql: string, values?: unknown[]) =>
      ({ rows: await asRole(sql, values) }) } as never);
    // The erasure sweep runs on the API's gated hourly timer, outside any request, so on its system login: the API's capability role and the
    // cross-account marker (apps/runner/src/dev-database-principals.ts), which holds the sweep since 0171.
    await database.pool.query("CREATE ROLE threat_erasure_api_system NOLOGIN IN ROLE debateai_billing_runtime, debateai_rls_all_accounts");
    sweep = new PostgresThreatReportRepository({ query: async (sql: string, values?: unknown[]) =>
      ({ rows: await asRole(sql, values, "threat_erasure_api_system") }) } as never);
  }, 600_000);
  afterAll(async () => database?.stop());

  it("unlinks an erased account's existing report and holds no address for it", async () => {
    // Property: without the hold, erasing the account leaves the report with no account and no email; nothing re-reads it.
    const target = randomUUID();
    await database.pool.query(`INSERT INTO identity."user"
      (user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at)
      VALUES ($1,$2,'{}','{}','fixture-password',$3,'active',now())`,
      [target, Buffer.alloc(32, 9), `erasure-${target}`]);
    // No product code keeps a report since 0171; the test's own connection keeps one as a report kept before it would be.
    const ref = (await database.pool.query<{ ref: string }>("SELECT staff.keep_threat_report($1::text,$2::uuid) ref",
      ["Question kept before 0171", target])).rows[0]!.ref;
    await database.pool.query('DELETE FROM identity."user" WHERE user_id=$1', [target]);
    expect((await database.pool.query("SELECT account_user_id,held_email FROM staff.threat_report WHERE report_ref=$1", [ref])).rows)
      .toEqual([{ account_user_id: null, held_email: null }]);
  }, 600_000);

  it("one worker tick erases due reports and keeps the future reports by the database clock", async () => {
    // Property: worker calls the database-clock eraser; it does not supply a caller clock.
    // Mutant: skip the interval or pass a future date.
    const refs = Array.from({ length: 4 }, () => randomUUID());
    for (const [index, ref] of refs.entries()) {
      await database.pool.query(`INSERT INTO staff.threat_report(report_ref,question,kept_at)
        VALUES($1,$2,clock_timestamp() - interval '30 days' + ($3::integer * interval '1 second'))`,
        [ref, `Retention ${index}`, index % 2 === 0 ? -1 : 1]);
    }
    let complete!: () => void;
    const completed = new Promise<void>(resolve => { complete = resolve; });
    const calls: unknown[][] = [];
    // A request login's runtime role is refused the sweep (0171); the system login runs it.
    await expect(repository.eraseDue()).rejects.toMatchObject({ code: "42501" });
    const workerRepository = { eraseDue: async (...args: unknown[]) => {
      calls.push(args);
      try { return await sweep.eraseDue(); }
      finally { complete(); }
    } };
    vi.useFakeTimers();
    let timer: NodeJS.Timeout | undefined;
    try {
      timer = closure.startThreatReportErasure({ repository: workerRepository, everyMs: 1_000 }, { ownIsCurrent: () => true });
      await vi.advanceTimersByTimeAsync(1_000);
      await completed;
      expect(calls).toEqual([[]]);
      const remaining = (await database.pool.query<{ report_ref: string }>(
        "SELECT report_ref FROM staff.threat_report WHERE report_ref=ANY($1::uuid[]) ORDER BY report_ref", [refs]
      )).rows.map(row => row.report_ref);
      expect(remaining).toEqual([refs[1]!, refs[3]!].sort());
    } finally { if (timer) clearInterval(timer); vi.useRealTimers(); }
  }, 600_000);
});
