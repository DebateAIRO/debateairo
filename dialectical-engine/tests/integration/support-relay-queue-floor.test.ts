// NV-33 (security audit run 3, cluster K11): every queue step of the support relay used to rescan the whole,
// never-purged waiter history under the one global queue lock. The repository now keeps a per-instance ticket floor
// (every waiter below it is settled for good), refreshed by a lock-free walk before every locked step, so the
// statements run under the lock read only the waiters entered since the oldest live waiter or since that walk.
// This suite runs on its own embedded database: its fixtures (thousands of settled waiters, and in the last test a
// ticket regression) must not disturb the order-sensitive tests/integration/support-relay-reservations.test.ts.
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { migrate,PostgresSupportRelayReservationRepository } from "../../packages/db/src/index.js";
import { capturingPool,rowsRead,type CapturedStatement } from "../support/planRowsRead.js";
import { startTestDatabase,type TestDatabase } from "../support/testDatabase.js";

type SupportRelayQueueEntryResult = Awaited<ReturnType<PostgresSupportRelayReservationRepository["enter"]>>;

let database: TestDatabase;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
},120_000);

afterAll(async () => database?.stop(),120_000);

const T = Date.parse("2026-10-01T12:00:00.000Z");
const at = (offset: number): Date => new Date(T + offset);
const CHUNK = PostgresSupportRelayReservationRepository.FLOOR_CATCH_UP_CHUNK;
const RELATIONS = ["relay_waiter","relay_waiter_event"] as const;
const LOCKED_BOUND = 100;
const WALK_BOUND = 2 * CHUNK + 10;

/** As table owner: `count` waiters, each WAITING then ACQUIRED then COMPLETED, on a one-second grid from `from`. */
async function insertSettledWaiters(count: number,from: number): Promise<void> {
  const before = (await database.pool.query<{ max: string }>(
    "SELECT coalesce(pg_catalog.max(ticket),0)::text AS max FROM support.relay_waiter"
  )).rows[0]?.max;
  if (before === undefined) throw new Error("expected the largest ticket");
  await database.pool.query(`
    INSERT INTO support.relay_waiter(waiter_id,enqueued_at)
    SELECT gen_random_uuid(),$1::timestamptz + i * interval '1 second'
    FROM generate_series(1,$2::integer) AS i
  `,[new Date(from),count]);
  await database.pool.query(`
    INSERT INTO support.relay_waiter_event(waiter_id,state,at,lease_until)
    SELECT waiter_id,'WAITING',enqueued_at,enqueued_at + interval '5 seconds'
    FROM support.relay_waiter WHERE ticket > $1::bigint ORDER BY ticket
  `,[before]);
  await database.pool.query(`
    INSERT INTO support.relay_waiter_event(waiter_id,state,at,lease_until)
    SELECT waiter_id,'ACQUIRED',enqueued_at + interval '1 second',NULL
    FROM support.relay_waiter WHERE ticket > $1::bigint ORDER BY ticket
  `,[before]);
  await database.pool.query(`
    INSERT INTO support.relay_waiter_event(waiter_id,state,at,lease_until)
    SELECT waiter_id,'COMPLETED',enqueued_at + interval '2 seconds',NULL
    FROM support.relay_waiter WHERE ticket > $1::bigint ORDER BY ticket
  `,[before]);
  await database.pool.query("ANALYZE support.relay_waiter");
  await database.pool.query("ANALYZE support.relay_waiter_event");
}

type Measured = Readonly<{ statement: string; rows: number }>;

async function measure(statements: readonly CapturedStatement[]): Promise<readonly Measured[]> {
  const measured: Measured[] = [];
  for (const { text,values } of statements) {
    measured.push(Object.freeze({
      statement: text.replace(/\s+/gu," ").trim().slice(0,160),
      rows: await rowsRead(database.pool,text,values,RELATIONS)
    }));
  }
  return measured;
}

/** What each statement run on a step's own (locked) connection read of the relay tables. */
const lockedRows = (statements: readonly CapturedStatement[]): Promise<readonly Measured[]> =>
  measure(statements.filter(({ via,text }) => via === "client" && text.includes("support.relay_waiter_event")));

/** What each lock-free walk statement (run on the pool, outside any step's connection) read. */
const walkRows = (statements: readonly CapturedStatement[]): Promise<readonly Measured[]> =>
  measure(statements.filter(({ via }) => via === "pool"));

const over = (measured: readonly Measured[],bound: number): readonly Measured[] =>
  measured.filter(({ rows }) => rows > bound);

describe("NV-33: the relay queue's locked statements are bounded by live waiters, not by settled history", () => {
  it("keeps every locked queue statement independent of settled history",async () => {
    await insertSettledWaiters(3_000,T - 2 * 86_400_000);
    const captured = capturingPool(database.pool);
    const A = new PostgresSupportRelayReservationRepository(captured.pool);
    const limits = { concurrency: 1,dailyCap: 50,queueDepth: 3 };
    let active: SupportRelayQueueEntryResult | undefined;
    let head: SupportRelayQueueEntryResult | undefined;
    let follower: SupportRelayQueueEntryResult | undefined;
    try {
      active = await A.enter({ at: at(0),...limits });
      expect(active.kind).toBe("ACQUIRED");
      head = await A.enter({ at: at(1),...limits });
      expect(head).toMatchObject({ kind: "WAITING",position: 1 });
      if (head.kind !== "WAITING") throw new Error("expected a waiting head");
      // The warm-up's first walk crosses the 3,000 settled waiters, one chunk per statement.
      expect(over(await walkRows(captured.statements.splice(0)),WALK_BOUND)).toEqual([]);

      follower = await A.enter({ at: at(2),...limits });
      expect(follower).toMatchObject({ kind: "WAITING",position: 2 });
      if (follower.kind !== "WAITING") throw new Error("expected a waiting follower");
      await expect(A.reconcile({
        waiterIds: [head.waiterId,follower.waiterId],at: at(3),queueDepth: 3
      })).resolves.toEqual({
        liveWaiterIds: [head.waiterId,follower.waiterId],capacityRejectedWaiterIds: []
      });
      await expect(A.tryAcquire({
        at: at(4),concurrency: 1,dailyCap: 50,waiterId: head.waiterId
      })).resolves.toEqual({ kind: "BUSY" });
      await A.cancel({ waiterId: follower.waiterId,at: at(5) });

      const measured = captured.statements.splice(0);
      const locked = await lockedRows(measured);
      expect(locked.length).toBeGreaterThan(0);
      expect(over(locked,LOCKED_BOUND)).toEqual([]);
      expect(over(await walkRows(measured),WALK_BOUND)).toEqual([]);
    } finally {
      for (const waiter of [head,follower]) {
        if (waiter?.kind === "WAITING") await A.cancel({ waiterId: waiter.waiterId,at: at(6) });
      }
      if (active?.kind === "ACQUIRED") await active.release();
    }
  });

  it("lets a fresh instance's walk stop at a live waiter hidden in settled history",async () => {
    const A = new PostgresSupportRelayReservationRepository(database.pool);
    const limits2 = { concurrency: 1,dailyCap: 50,queueDepth: 3 };
    let active2: SupportRelayQueueEntryResult | undefined;
    let head2: SupportRelayQueueEntryResult | undefined;
    let c1: SupportRelayQueueEntryResult | undefined;
    let promoted: Awaited<ReturnType<PostgresSupportRelayReservationRepository["tryAcquire"]>> | undefined;
    const C = new PostgresSupportRelayReservationRepository(database.pool);
    try {
      active2 = await A.enter({ at: at(10_000),...limits2 });
      expect(active2.kind).toBe("ACQUIRED");
      head2 = await A.enter({ at: at(10_001),...limits2 });
      expect(head2).toMatchObject({ kind: "WAITING",position: 1 });
      if (head2.kind !== "WAITING") throw new Error("expected a waiting head");
      // Above head2's ticket, with events only for the new waiters.
      await insertSettledWaiters(2_500,T + 10_000);

      c1 = await C.enter({ at: at(10_002),...limits2 });
      expect(c1).toMatchObject({ kind: "WAITING",position: 2 });
      if (c1.kind !== "WAITING") throw new Error("expected a waiting follower");
      await expect(A.reconcile({
        waiterIds: [head2.waiterId],at: at(10_003),queueDepth: 3
      })).resolves.toEqual({ liveWaiterIds: [head2.waiterId],capacityRejectedWaiterIds: [] });
      if (active2.kind === "ACQUIRED") await active2.release();
      await expect(C.tryAcquire({
        at: at(10_004),concurrency: 1,dailyCap: 50,waiterId: c1.waiterId
      })).resolves.toEqual({ kind: "BUSY" });
      promoted = await A.tryAcquire({
        at: at(10_005),concurrency: 1,dailyCap: 50,waiterId: head2.waiterId
      });
      expect(promoted.kind).toBe("ACQUIRED");
    } finally {
      if (promoted?.kind === "ACQUIRED") await promoted.release();
      if (active2?.kind === "ACQUIRED") await active2.release();
      if (c1?.kind === "WAITING") await C.cancel({ waiterId: c1.waiterId,at: at(10_006) });
      if (head2?.kind === "WAITING") await A.cancel({ waiterId: head2.waiterId,at: at(10_006) });
    }
  });

  it("keeps the ticket identity in queue-lock order",async () => {
    expect((await database.pool.query<{ cache_size: string; increment_by: string }>(`
      SELECT cache_size::text,increment_by::text FROM pg_catalog.pg_sequences
      WHERE schemaname='support' AND sequencename='relay_waiter_ticket_seq'
    `)).rows).toEqual([{ cache_size: "1",increment_by: "1" }]);
  });

  it("keeps a second instance's locked statements bounded after another process wrote while it idled",async () => {
    const capturedB = capturingPool(database.pool);
    const B = new PostgresSupportRelayReservationRepository(capturedB.pool);
    const first = await B.enter({ at: at(20_000),concurrency: 1,dailyCap: 50,queueDepth: 3 });
    try { expect(first.kind).toBe("ACQUIRED"); }
    finally { if (first.kind === "ACQUIRED") await first.release(); }

    // Another process enters and settles 3,000 waiters while B is idle.
    await insertSettledWaiters(3_000,T + 20_001);
    capturedB.statements.splice(0);
    const second = await B.enter({ at: at(30_000),concurrency: 1,dailyCap: 50,queueDepth: 3 });
    try {
      expect(second.kind).toBe("ACQUIRED");
      const statements = capturedB.statements.splice(0);
      const locked = await lockedRows(statements);
      expect(locked.length).toBeGreaterThan(0);
      expect(over(locked,LOCKED_BOUND)).toEqual([]);
      const walk = await walkRows(statements);
      expect(walk.length).toBeGreaterThan(0);
      expect(over(walk,WALK_BOUND)).toEqual([]);
    } finally {
      if (second.kind === "ACQUIRED") await second.release();
    }
  });

  // Stays LAST: it breaks "tickets follow lock order" for this database for good.
  it("names a ticket regression instead of failing opaquely",async () => {
    const m = Number((await database.pool.query<{ max: string }>(
      "SELECT coalesce(pg_catalog.max(ticket),0)::text AS max FROM support.relay_waiter"
    )).rows[0]?.max);
    expect(Number.isSafeInteger(m)).toBe(true);
    // Off every fixture's one-second grid (test 2 wrote a waiter at exactly T + 40_000).
    await database.pool.query(`
      INSERT INTO support.relay_waiter(ticket,waiter_id,enqueued_at) OVERRIDING SYSTEM VALUE
      VALUES($1::bigint,gen_random_uuid(),$2::timestamptz)
    `,[m + 1000,at(40_007)]);
    for (const [state,offset,lease] of [
      ["WAITING","0 seconds","5 seconds"],["ACQUIRED","1 second",null],["COMPLETED","2 seconds",null]
    ] as const) {
      await database.pool.query(`
        INSERT INTO support.relay_waiter_event(waiter_id,state,at,lease_until)
        SELECT waiter_id,$2::text,enqueued_at + $3::interval,
          CASE WHEN $4::interval IS NULL THEN NULL ELSE enqueued_at + $4::interval END
        FROM support.relay_waiter WHERE ticket = $1::bigint
      `,[m + 1000,state,offset,lease]);
    }

    const D = new PostgresSupportRelayReservationRepository(database.pool);
    await D.warmFloor();
    await expect(D.enter({ at: at(40_007),concurrency: 1,dailyCap: 50,queueDepth: 3 }))
      .rejects.toThrow("SUPPORT_RELAY_FLOOR_REGRESSED");
    // Nothing else runs between reading m and this check: the only tickets above m are the hand-inserted one and
    // the rejected enter's, and a consumed, rolled-back sequence value leaves no row.
    expect((await database.pool.query<{ count: string }>(`
      SELECT count(*)::text AS count FROM support.relay_waiter WHERE ticket > $1::bigint AND ticket <> $2::bigint
    `,[m,m + 1000])).rows).toEqual([{ count: "0" }]);
  });
});
