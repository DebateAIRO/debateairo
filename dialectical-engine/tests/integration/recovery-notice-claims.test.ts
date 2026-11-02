import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { encrypt } from "@debateai/crypto";
import { migrate } from "@debateai/db";
import { PostgresBackupEmailRepository, PostgresMfaRecoveryRepository } from "../../packages/db/src/email-mfa-recovery.js";
import { PostgresPasswordResetRepository } from "../../packages/db/src/password-reset.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * NV-38 (security audit run 3): the three recovery outboxes keep every finished notice, so a claim that scans them reads
 * the whole retained history, and the MFA and backup claims took their lease from a clock read before their scans and
 * lock waits. With the pending-only due indexes (0132-0134) a claim reads only pending rows, and 0131's pending-notice
 * claims take the lease when the claim ends and never wait on a row another claim or finish holds. CI skips this
 * directory; run it alone.
 *
 * Seeding writes rows directly as the superuser with session_replication_role = replica (no foreign keys and none of
 * 0116's mail-locale triggers, so mail_locale is given), each with its own random parent id (the UNIQUE key stays
 * enforced) and a valid envelope (core.is_content_envelope stays enforced). Every case retires its pending rows.
 */
type Outbox = Readonly<{ table: string; parent: string; due: string }>;
const PASSWORD_RESET: Outbox = { table: "identity.password_reset_notice", parent: "recovery_request_id", due: "COMPLETED" };
const BACKUP_EMAIL: Outbox = { table: "identity.backup_email_notice", parent: "challenge_id", due: "VERIFIED" };
const MFA_RECOVERY: Outbox = { table: "identity.mfa_recovery_notice", parent: "challenge_id", due: "COMPLETED" };
const ENVELOPE = JSON.stringify(encrypt(Buffer.alloc(32, 7), Buffer.from("{}"), ["identity", "seed", "x", "run:none", "x", "user-dek:x", "1"]));
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

let db: TestDatabase;
/** `count` rows of `event` created `age` ago, sent when `sent`; returns their ids. */
async function seed(outbox: Outbox, count: number, event: string, age: string, sent: boolean): Promise<string[]> {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL session_replication_role = replica");
    const rows = (await client.query<{ notice_id: string }>(`INSERT INTO ${outbox.table}
      (${outbox.parent},user_id,channel_id,event_kind,payload_ciphertext,created_at,available_at,sent_at,mail_locale)
      SELECT gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),$1,$2::jsonb,clock_timestamp()-$3::interval,clock_timestamp()-$3::interval,
       CASE WHEN $4 THEN clock_timestamp() END,'en'
      FROM generate_series(1,$5) RETURNING notice_id`, [event, ENVELOPE, age, sent, count])).rows;
    await client.query("COMMIT");
    return rows.map((row) => row.notice_id);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
const retire = async (outbox: Outbox): Promise<void> => {
  await db.pool.query(`UPDATE ${outbox.table} SET dead_at=clock_timestamp() WHERE sent_at IS NULL AND dead_at IS NULL`);
};

beforeAll(async () => {
  db = await startTestDatabase();
  await migrate(db.pool);
}, 300_000);
afterAll(async () => { await db?.stop(); });

describe("recovery notice claims (NV-38)", () => {
  it("a claim reads only pending rows however much history is kept", async () => {
    const flows = [
      { outbox: PASSWORD_RESET, repository: (pool: never) => new PostgresPasswordResetRepository(pool, {} as never, 1) },
      { outbox: BACKUP_EMAIL, repository: (pool: never) => new PostgresBackupEmailRepository(pool, {} as never, 1) },
      { outbox: MFA_RECOVERY, repository: (pool: never) => new PostgresMfaRecoveryRepository(pool, {} as never, 1) }
    ];
    // Per outbox: the tuples its claim read, or why the claim did not return the due row (all three are reported).
    const read: Record<string, unknown> = {};
    for (const { outbox, repository } of flows) {
      await retire(outbox);
      await seed(outbox, 20_000, "PROOF", "2 hours", true);
      const [due] = await seed(outbox, 1, outbox.due, "1 minute", false);
      await db.pool.query(`ANALYZE ${outbox.table}`);
      const client = await db.pool.connect();
      try {
        await client.query("BEGIN");
        const pool = { query: (text: string, values?: unknown[]) => client.query(text, values) } as never;
        const notice = await repository(pool).claimNotice(5600);
        read[outbox.table] = notice?.noticeId !== due ? `CLAIMED ${notice?.noticeId ?? "NOTHING"}` : (await client.query<{ n: number }>(
          "SELECT (seq_tup_read+coalesce(idx_tup_fetch,0))::int AS n FROM pg_stat_xact_user_tables WHERE relid=$1::regclass", [outbox.table])).rows[0]!.n;
      } catch (error) {
        read[outbox.table] = (error as { code?: string; message?: string }).code ?? (error as Error).message;
      } finally {
        await client.query("ROLLBACK");
        client.release();
      }
      await retire(outbox);
    }
    expect(Object.entries(read).filter(([, n]) => !(typeof n === "number" && n < 500))).toEqual([]);
  }, 120_000);

  it("the three outboxes carry valid pending-only due indexes", async () => {
    for (const [index, table] of [["password_reset_notice_due", "password_reset_notice"], ["backup_email_notice_due", "backup_email_notice"],
      ["mfa_recovery_notice_due", "mfa_recovery_notice"]] as const) {
      const row = (await db.pool.query<{ indexdef: string; valid: boolean }>(
        "SELECT x.indexdef,i.indisvalid AS valid FROM pg_indexes x JOIN pg_index i ON i.indexrelid=to_regclass(x.schemaname||'.'||x.indexname) WHERE x.schemaname='identity' AND x.indexname=$1",
        [index])).rows;
      expect(row, index).toEqual([{
        indexdef: `CREATE INDEX ${index} ON identity.${table} USING btree (available_at, created_at, notice_id) WHERE ((sent_at IS NULL) AND (dead_at IS NULL))`,
        valid: true
      }]);
    }
  });

  /** A stale PROOF (its challenge does not exist) that session B holds FOR UPDATE for 1.5 s, and one due notice. */
  async function claimAfterLockWait(outbox: Outbox, claim: (lease: number) => Promise<{ noticeId: string; mailLocale?: string } | null>) {
    await retire(outbox);
    const [stale] = await seed(outbox, 1, "PROOF", "2 minutes", false);
    const [due] = await seed(outbox, 1, outbox.due, "1 minute", false);
    const b = await db.pool.connect();
    let settled: Promise<unknown> = Promise.resolve();
    try {
      await b.query("BEGIN");
      await b.query(`SELECT 1 FROM ${outbox.table} WHERE notice_id=$1 FOR UPDATE`, [stale]);
      // Every outcome becomes a value, so nothing can reject unhandled during the wait.
      settled = (async () => {
        try {
          const notice = await claim(1000);
          if (notice === null) return { ok: false, error: "NULL_CLAIM" };
          const live = (await db.pool.query(`SELECT lease_until-clock_timestamp()>interval '500 milliseconds' AS live FROM ${outbox.table} WHERE notice_id=$1`,
            [notice.noticeId])).rows[0].live;
          return { ok: true, notice, live };
        } catch (error) {
          return { ok: false, error };
        }
      })();
      await sleep(1500);
    } finally {
      await b.query("ROLLBACK").catch(() => undefined);
      b.release();
    }
    const outcome = await settled;
    await retire(outbox);
    return { outcome, due: due! };
  }

  it("an MFA claim that waited on a row lock still hands out a live lease", async () => {
    const repository = new PostgresMfaRecoveryRepository(db.pool, {} as never, 1);
    const { outcome, due } = await claimAfterLockWait(MFA_RECOVERY, (lease) => repository.claimNotice(lease));
    expect(outcome).toMatchObject({ ok: true, notice: { noticeId: due, mailLocale: "en" }, live: true });
  }, 30_000);

  it("a backup-email claim that waited on a row lock still hands out a live lease", async () => {
    const repository = new PostgresBackupEmailRepository(db.pool, {} as never, 1);
    const { outcome, due } = await claimAfterLockWait(BACKUP_EMAIL, (lease) => repository.claimNotice(lease));
    expect(outcome).toMatchObject({ ok: true, notice: { noticeId: due, mailLocale: "en" }, live: true });
  }, 30_000);
});
