import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertSupportKeyCoverage,
  createPool,
  migrate,
  PostgresSupportShredRepository
} from "../../packages/db/src/index.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * DL2-F2 / DL5-F1. Until migrations/0065_security_delta_guards.sql §4 every
 * statement on support.session, session_key, "case", case_key or shred_audit
 * bumped one singleton row (0054:540-559) whose row lock is held to COMMIT, and
 * the deferred constraint trigger then re-validated the WHOLE support schema
 * (0054:588-680) with no predicate on the touched rows and no index on
 * support.session(identity_owner_ref). The cost of every commit therefore grew
 * with the number of sessions ever created, and every writer queued behind
 * every other one — with anonymous session creation open to the internet and
 * support rows never deleted, a self-amplifying denial of service against
 * /v1/support/*.
 *
 * These cases pin the two properties the redesign must hold apart: the guard no
 * longer serialises or scans globally, and the invariant it enforces is
 * unchanged.
 */

let database: TestDatabase;
let supportPool: Pool;

const at = new Date("2026-09-07T10:00:00.000Z");

function liveWrappedKey(fill: number): Buffer {
  return Buffer.concat([Buffer.from([1]), Buffer.alloc(60, fill)]);
}

async function insertSessionPair(
  client: PoolClient,
  sessionId: string,
  ownerRef: string | null = null
): Promise<void> {
  await client.query(`
    INSERT INTO support.session(
      session_id,session_token_sha256,identity_owner_ref,language,state,kb_version,created_at
    ) VALUES($1,$2,$3,'en','OPEN',$4,$5)
  `, [
    sessionId,
    Buffer.from(`token:${sessionId}`).toString("hex").slice(0, 64).padEnd(64, "0"),
    ownerRef,
    "a".repeat(64),
    at
  ]);
  await client.query(`
    INSERT INTO support.session_key(session_id,wrapped_key,created_at)
    VALUES($1,$2,$3)
  `, [sessionId, liveWrappedKey(1), at]);
}

async function timeCommits(
  count: number,
  work: (client: PoolClient) => Promise<void>
): Promise<number> {
  const started = process.hrtime.bigint();
  for (let index = 0; index < count; index += 1) {
    const client = await supportPool.connect();
    try {
      await client.query("BEGIN");
      await work(client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
  return Number(process.hrtime.bigint() - started) / 1e6 / count;
}

/** One commit per session, exactly as PostgresSupportSessionRepository.create does. */
async function createSessions(count: number): Promise<number> {
  return timeCommits(count, (client) => insertSessionPair(client, randomUUID()));
}

/**
 * The same shape of transaction — two indexed inserts and a commit — against a
 * relation with no guard on it. This is the machine-speed control: several
 * agents share this host, so absolute milliseconds drift by 3x between runs and
 * only the guard's overhead ABOVE this baseline is the finding.
 */
async function createControlRows(count: number): Promise<number> {
  return timeCommits(count, async (client) => {
    for (const _ of [0, 1]) {
      const id = randomUUID();
      await client.query(
        "INSERT INTO public.db1_timing_control(id,token,created_at) VALUES($1,$2,$3)",
        [id, id.replaceAll("-", "").padEnd(64, "0"), at]
      );
    }
  });
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  await database.pool.query(`
    CREATE TABLE IF NOT EXISTS public.db1_timing_control (
      id uuid PRIMARY KEY,
      token char(64) NOT NULL UNIQUE,
      created_at timestamptz NOT NULL
    );
    GRANT INSERT ON public.db1_timing_control TO debateai_support;
  `);
  supportPool = createPool(database.connectionString);
  supportPool.on("connect", (client) => {
    void client.query("SET ROLE debateai_support");
  });
  expect((await supportPool.query<{ current_user: string }>("SELECT current_user"))
    .rows[0]?.current_user).toBe("debateai_support");
}, 180_000);

afterAll(async () => {
  await supportPool?.end().catch(() => undefined);
  await database?.stop();
}, 120_000);

describe("0065 §4 the shred guard is no longer a global serialisation point (DL2-F2, DL5-F1)", () => {
  it("keeps the cost of a session commit flat as the session table grows", async () => {
    // 0054's guard re-scanned every session and case at every commit. The audit
    // measured ~0.48 microseconds per existing session per commit, so the third
    // batch of this loop cost several times the first. The scoped guard touches
    // only the session being created.
    const batch = 600;
    const firstControl = await createControlRows(batch);
    const first = await createSessions(batch);
    await createSessions(batch);
    const thirdControl = await createControlRows(batch);
    const third = await createSessions(batch);
    // Each control run is taken immediately before the batch it normalises, so
    // host load cancels out and what is left is the guard's own cost.
    const firstOverhead = Math.max(first - firstControl, 0.001);
    const thirdOverhead = Math.max(third - thirdControl, 0.001);
    const report = `guard overhead went ${firstOverhead.toFixed(3)} -> ${thirdOverhead.toFixed(3)} ms/commit`
      + ` as N went ${batch} -> ${batch * 2}`
      + ` (raw ${first.toFixed(3)} -> ${third.toFixed(3)}, control ${firstControl.toFixed(3)} -> ${thirdControl.toFixed(3)})`;
    console.info(`[DL5-F1] ${report}`);
    expect(thirdOverhead, report).toBeLessThanOrEqual(firstOverhead * 2);
    expect((await database.pool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM support.session"
    )).rows[0]?.count).toBeGreaterThanOrEqual(batch * 3);
  }, 180_000);

  it("lets a second session commit while the first transaction is still open", async () => {
    // The singleton row lock is held to COMMIT, so the second INSERT waited for
    // the first transaction to end (the audit measured 735 ms on a live table).
    const holder = await supportPool.connect();
    const contender = await supportPool.connect();
    try {
      await holder.query("BEGIN");
      await insertSessionPair(holder, randomUUID());

      await contender.query("BEGIN");
      const inserted = insertSessionPair(contender, randomUUID());
      const outcome = await Promise.race([
        inserted.then(() => "committed" as const),
        new Promise<"blocked">((resolve) => setTimeout(() => resolve("blocked"), 400))
      ]);
      const waits = await database.pool.query<{ waits: number }>(`
        SELECT count(*)::int AS waits FROM pg_catalog.pg_stat_activity
        WHERE datname=current_database() AND wait_event_type='Lock'
          AND wait_event IN ('transactionid','tuple')
      `);
      // Release the first transaction before asserting, so a blocked contender
      // cannot hang the suite.
      await holder.query("COMMIT");
      await inserted;
      await contender.query("COMMIT");
      expect(outcome, "the second session insert blocked on the first transaction")
        .toBe("committed");
      expect(waits.rows[0]?.waits, "a backend was waiting on a row lock").toBe(0);
    } finally {
      await holder.query("ROLLBACK").catch(() => undefined);
      await contender.query("ROLLBACK").catch(() => undefined);
      holder.release();
      contender.release();
    }
  }, 120_000);

  it("checks only the touched scope, and says so through the validation counter", async () => {
    const client = await supportPool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT set_config('debateai.support_shred_validation_count','0',true)"
      );
      await insertSessionPair(client, randomUUID());
      await insertSessionPair(client, randomUUID());
      await client.query("SET CONSTRAINTS ALL IMMEDIATE");
      // Two sessions x (session row + key row) = four scope checks, each one
      // session wide. 0054 ran one whole-schema scan per dirty generation.
      expect((await client.query<{ count: string }>(
        "SELECT current_setting('debateai.support_shred_validation_count') AS count"
      )).rows[0]?.count).toBe("4");
      await client.query("COMMIT");
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  });
});

describe("0065 §4 the shred invariant is unchanged (DL2-F2, DL5-F1)", () => {
  it("still refuses a session without its key, at commit, inside the touched scope", async () => {
    const client = await supportPool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`
        INSERT INTO support.session(
          session_id,session_token_sha256,identity_owner_ref,language,state,kb_version,created_at
        ) VALUES($1,$2,NULL,'en','OPEN',$3,$4)
      `, [randomUUID(), "c".repeat(64), "a".repeat(64), at]);
      await expect(client.query("COMMIT")).rejects.toThrow("SUPPORT_SHRED_INTEGRITY_INVALID");
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  });

  it("still refuses a destroyed key whose session carries no tombstone", async () => {
    const sessionId = randomUUID();
    const client = await supportPool.connect();
    try {
      await client.query("BEGIN");
      await insertSessionPair(client, sessionId);
      await client.query("COMMIT");
      await client.query("BEGIN");
      await client.query(`
        UPDATE support.session_key
        SET wrapped_key=decode(repeat('00',61),'hex'),destroyed_at=$2
        WHERE session_id=$1
      `, [sessionId, at]);
      await expect(client.query("COMMIT")).rejects.toThrow("SUPPORT_SHRED_INTEGRITY_INVALID");
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  });

  it("still refuses an audit row whose owner keeps an unshredded session", async () => {
    const ownerRef = randomUUID();
    const client = await supportPool.connect();
    try {
      await client.query("BEGIN");
      await insertSessionPair(client, randomUUID(), ownerRef);
      await insertSessionPair(client, randomUUID(), ownerRef);
      await client.query("COMMIT");
      await client.query("BEGIN");
      await client.query(`
        INSERT INTO support.shred_audit(at,os_user,target_kind,target_ref,keys_destroyed)
        VALUES($1,'vitest','owner',$2,2)
      `, [at, ownerRef]);
      await expect(client.query("COMMIT")).rejects.toThrow("SUPPORT_SHRED_INTEGRITY_INVALID");
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  });

  it("still refuses a deleted audit row that a shredded session depends on", async () => {
    const ownerRef = randomUUID();
    const sessionId = randomUUID();
    const client = await supportPool.connect();
    try {
      await client.query("BEGIN");
      await insertSessionPair(client, sessionId, ownerRef);
      await client.query("COMMIT");
    } finally {
      client.release();
    }
    await new PostgresSupportShredRepository(supportPool).shredOwner(ownerRef, "vitest", at);
    // DELETE on shred_audit is closed by §1's reject_mutation for every role, so
    // the owner has to disable it to reach the guard at all — which is exactly
    // the tamper DL5-F2 describes and this guard is the second line against.
    await database.pool.query("ALTER TABLE support.shred_audit DISABLE TRIGGER reject_mutation");
    const client2 = await database.pool.connect();
    try {
      await client2.query("BEGIN");
      await client2.query(
        "DELETE FROM support.shred_audit WHERE target_kind='owner' AND target_ref=$1", [ownerRef]
      );
      await expect(client2.query("COMMIT")).rejects.toThrow("SUPPORT_SHRED_INTEGRITY_INVALID");
    } finally {
      await client2.query("ROLLBACK").catch(() => undefined);
      client2.release();
      await database.pool.query("ALTER TABLE support.shred_audit ENABLE TRIGGER reject_mutation");
    }
    await expect(assertSupportKeyCoverage(database.pool)).resolves.toBeUndefined();
  });

  it("serialises an owner shred against a new session for that owner", async () => {
    // The property the singleton row lock used to provide, now scoped to the
    // owner: exactly one of the two transactions may commit.
    for (const shredFirst of [true, false]) {
      const ownerRef = randomUUID();
      const existing = randomUUID();
      const seed = await supportPool.connect();
      try {
        await seed.query("BEGIN");
        await insertSessionPair(seed, existing, ownerRef);
        await seed.query("COMMIT");
      } finally {
        seed.release();
      }

      const shred = await supportPool.connect();
      const insert = await supportPool.connect();
      const settle = async (client: PoolClient, work: () => Promise<void>): Promise<boolean> => {
        try {
          await work();
          await client.query("COMMIT");
          return true;
        } catch {
          await client.query("ROLLBACK").catch(() => undefined);
          return false;
        }
      };
      try {
        await shred.query("BEGIN");
        await insert.query("BEGIN");
        const shredWork = () => settle(shred, async () => {
          await shred.query(`UPDATE support.session_key AS key
            SET wrapped_key=decode(repeat('00',61),'hex'),destroyed_at=$2
            FROM support.session AS parent
            WHERE parent.session_id=key.session_id AND parent.identity_owner_ref=$1`,
          [ownerRef, at]);
          await shred.query(
            "UPDATE support.session SET shredded_at=$2 WHERE identity_owner_ref=$1",
            [ownerRef, at]
          );
          await shred.query(`INSERT INTO support.shred_audit(
            at,os_user,target_kind,target_ref,keys_destroyed
          ) VALUES($1,'vitest','owner',$2,1)`, [at, ownerRef]);
        });
        const insertWork = () => settle(insert, async () => {
          await insertSessionPair(insert, randomUUID(), ownerRef);
        });
        const first = shredFirst ? shredWork() : insertWork();
        await new Promise((resolve) => setTimeout(resolve, 20));
        const second = shredFirst ? insertWork() : shredWork();
        expect(await Promise.all([first, second]), `shredFirst=${shredFirst}`)
          .toEqual([true, false]);
      } finally {
        await shred.query("ROLLBACK").catch(() => undefined);
        await insert.query("ROLLBACK").catch(() => undefined);
        shred.release();
        insert.release();
      }
    }
  }, 120_000);
});
