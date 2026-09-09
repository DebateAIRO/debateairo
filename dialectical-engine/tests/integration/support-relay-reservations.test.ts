import { afterAll,beforeAll,describe,expect,it } from "vitest";
import {
  createPool,migrate,PostgresSupportRelayReservationRepository
} from "../../packages/db/src/index.js";
import { SUPPORT_LIMIT_DEFAULTS } from "../../apps/api/src/support/limits.js";
import { SupportRelayQueue } from "../../apps/api/src/support/queue.js";
import { startTestDatabase,type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
},120_000);

afterAll(async () => database?.stop(),120_000);

describe("SUP-06 durable relay controls", () => {
  it("does not record a final call when its caller is already aborted", async () => {
    const repository = new PostgresSupportRelayReservationRepository(database.pool);
    const controller = new AbortController();
    controller.abort();
    const at = new Date("2026-09-29T12:00:00.000Z");

    await expect(repository.reserveModelCall({
      at,dailyCap: 20,signal: controller.signal
    })).rejects.toMatchObject({ code: "SUPPORT_MODEL_UNAVAILABLE" });
    expect((await database.pool.query<{ count: string }>(`
      SELECT count(*)::text AS count FROM support.relay_call WHERE utc_day=$1::date
    `,["2026-09-29"])).rows).toEqual([{ count: "0" }]);
  });

  it("shares concurrency between instances and preserves the final-call UTC cap across restart", async () => {
    const firstInstance = new PostgresSupportRelayReservationRepository(database.pool);
    const secondInstance = new PostgresSupportRelayReservationRepository(database.pool);
    const at = new Date("2026-09-08T12:00:00.000Z");
    const first = await firstInstance.tryAcquire({ at,concurrency: 1,dailyCap: 1 });
    expect(first.kind).toBe("ACQUIRED");
    await expect(secondInstance.tryAcquire({ at,concurrency: 1,dailyCap: 1 }))
      .resolves.toEqual({ kind: "BUSY" });
    if (first.kind !== "ACQUIRED") throw new Error("expected reservation");
    await first.release();
    expect(Number((await database.pool.query<{ count: string }>(`
      SELECT count(*)::text AS count FROM support.relay_call WHERE utc_day=$1::date
    `,["2026-09-08"])).rows[0]?.count)).toBe(0);

    const restartedInstance = new PostgresSupportRelayReservationRepository(database.pool);
    await expect(firstInstance.reserveModelCall({ at,dailyCap: 1 }))
      .resolves.toEqual({ kind: "RECORDED" });
    await expect(restartedInstance.reserveModelCall({
      at: new Date("2026-09-08T12:01:00.000Z"),dailyCap: 1
    })).resolves.toEqual({ kind: "DAILY_CAP" });
    const availableSlot = await restartedInstance.tryAcquire({
      at: new Date("2026-09-08T12:01:01.000Z"),concurrency: 1,dailyCap: 1
    });
    expect(availableSlot.kind).toBe("ACQUIRED");
    if (availableSlot.kind === "ACQUIRED") await availableSlot.release();
    await expect(restartedInstance.reserveModelCall({
      at: new Date("2026-09-09T00:00:00.000Z"),dailyCap: 1
    })).resolves.toEqual({ kind: "RECORDED" });
  });

  it("serializes concurrent final-call reservations at the exact durable daily boundary", async () => {
    const repositories = [1,2,3].map(() =>
      new PostgresSupportRelayReservationRepository(database.pool));
    const at = new Date("2026-09-28T12:00:00.000Z");
    const results = await Promise.all(repositories.map((repository,index) =>
      repository.reserveModelCall({ at: new Date(at.getTime()+index),dailyCap: 2 })));

    expect(results.filter(({ kind }) => kind === "RECORDED")).toHaveLength(2);
    expect(results.filter(({ kind }) => kind === "DAILY_CAP")).toHaveLength(1);
    expect(Number((await database.pool.query<{ count: string }>(`
      SELECT count(*)::text AS count FROM support.relay_call WHERE utc_day=$1::date
    `,["2026-09-28"])).rows[0]?.count)).toBe(2);
  });

  it("records through the ordinary pool while all sixteen dedicated lease slots are held", async () => {
    const leasePool = createPool(database.connectionString,{ max: 18 });
    const leases = new PostgresSupportRelayReservationRepository(leasePool);
    const records = new PostgresSupportRelayReservationRepository(database.pool);
    const at = new Date("2026-09-30T12:00:00.000Z");
    const held: Array<Extract<Awaited<ReturnType<typeof leases.tryAcquire>>,{ kind: "ACQUIRED" }>> = [];
    let overflow: Promise<Awaited<ReturnType<typeof leases.enter>>> | undefined;
    try {
      for (let index = 0;index < 16;index += 1) {
        const acquired = await leases.tryAcquire({ at,concurrency: 16,dailyCap: 100 });
        if (acquired.kind !== "ACQUIRED") throw new Error(`expected lease ${index}`);
        held.push(acquired);
      }
      const started = performance.now();
      await expect(records.reserveModelCall({ at,dailyCap: 100 }))
        .resolves.toEqual({ kind: "RECORDED" });
      expect(performance.now()-started).toBeLessThan(500);

      overflow = leases.enter({ at,concurrency: 16,dailyCap: 100,queueDepth: 0 });
      const overflowResult = await Promise.race([
        overflow,
        new Promise<"TEST_DEADLINE">((resolve) => setTimeout(() => resolve("TEST_DEADLINE"),500))
      ]);
      expect(overflowResult).toEqual({ kind: "FULL" });
    } finally {
      await Promise.all(held.map(({ release }) => release()));
      await Promise.allSettled(overflow === undefined ? [] : [overflow]);
      await leasePool.end();
    }
  },30_000);

  it("coordinates global FIFO and exact waiting depth across repository instances", async () => {
    const firstInstance = new PostgresSupportRelayReservationRepository(database.pool);
    const secondInstance = new PostgresSupportRelayReservationRepository(database.pool);
    const at = new Date("2026-09-10T12:00:00.000Z");
    const limits = { concurrency: 1,dailyCap: 20,queueDepth: 2 };
    const active = await firstInstance.enter({ at,...limits });
    expect(active.kind).toBe("ACQUIRED");
    const firstWaiting = await secondInstance.enter({
      at: new Date(at.getTime() + 1),...limits
    });
    const secondWaiting = await firstInstance.enter({
      at: new Date(at.getTime() + 2),...limits
    });
    expect(firstWaiting).toMatchObject({ kind: "WAITING",position: 1 });
    expect(secondWaiting).toMatchObject({ kind: "WAITING",position: 2 });
    await expect(secondInstance.enter({
      at: new Date(at.getTime() + 3),...limits
    })).resolves.toEqual({ kind: "FULL" });
    if (active.kind !== "ACQUIRED"
      || firstWaiting.kind !== "WAITING" || secondWaiting.kind !== "WAITING") {
      throw new Error("expected acquired/waiting relay states");
    }
    await active.release();
    await expect(firstInstance.tryAcquire({
      at: new Date(at.getTime() + 4),concurrency: 1,dailyCap: 20,
      waiterId: secondWaiting.waiterId
    })).resolves.toEqual({ kind: "BUSY" });
    const firstPromoted = await secondInstance.tryAcquire({
      at: new Date(at.getTime() + 5),concurrency: 1,dailyCap: 20,
      waiterId: firstWaiting.waiterId
    });
    expect(firstPromoted.kind).toBe("ACQUIRED");
    if (firstPromoted.kind !== "ACQUIRED") throw new Error("expected first promotion");
    await firstPromoted.release();
    const secondPromoted = await firstInstance.tryAcquire({
      at: new Date(at.getTime() + 6),concurrency: 1,dailyCap: 20,
      waiterId: secondWaiting.waiterId
    });
    expect(secondPromoted.kind).toBe("ACQUIRED");
    if (secondPromoted.kind === "ACQUIRED") await secondPromoted.release();
  });

  it("admits the exact global waiting-depth boundary", async () => {
    const repository = new PostgresSupportRelayReservationRepository(database.pool);
    const at = new Date("2026-09-12T12:00:00.000Z");
    const limits = { concurrency: 1,dailyCap: 20,queueDepth: 1 };
    const active = await repository.enter({ at,...limits });
    let boundary: Awaited<ReturnType<typeof repository.enter>> | undefined;
    try {
      expect(active.kind).toBe("ACQUIRED");
      boundary = await repository.enter({ at: new Date(at.getTime() + 1),...limits });
      expect(boundary).toMatchObject({ kind: "WAITING",position: 1 });
      await expect(repository.enter({
        at: new Date(at.getTime() + 2),...limits
      })).resolves.toEqual({ kind: "FULL" });
    } finally {
      if (boundary?.kind === "WAITING") {
        await repository.cancel({
          waiterId: boundary.waiterId,at: new Date(at.getTime() + 3)
        });
      }
      if (active.kind === "ACQUIRED") await active.release();
    }
  });

  it("refuses out-of-order promotion under scheduler pressure", async () => {
    const repository = new PostgresSupportRelayReservationRepository(database.pool);
    const at = new Date("2026-09-13T12:00:00.000Z");
    const limits = { concurrency: 1,dailyCap: 20,queueDepth: 2 };
    const active = await repository.enter({ at,...limits });
    const head = await repository.enter({ at: new Date(at.getTime() + 1),...limits });
    const follower = await repository.enter({ at: new Date(at.getTime() + 2),...limits });
    if (active.kind !== "ACQUIRED" || head.kind !== "WAITING" || follower.kind !== "WAITING") {
      throw new Error("expected FIFO pressure states");
    }
    await active.release();
    const outOfOrder = await repository.tryAcquire({
      at: new Date(at.getTime() + 3),concurrency: 1,dailyCap: 20,
      waiterId: follower.waiterId
    });
    try {
      expect(outOfOrder).toEqual({ kind: "BUSY" });
    } finally {
      if (outOfOrder.kind === "ACQUIRED") await outOfOrder.release();
      await repository.cancel({ waiterId: head.waiterId,at: new Date(at.getTime() + 4) });
      await repository.cancel({ waiterId: follower.waiterId,at: new Date(at.getTime() + 5) });
    }
  });

  it("durably terminalizes a cancelled waiter before returning", async () => {
    const repository = new PostgresSupportRelayReservationRepository(database.pool);
    const at = new Date("2026-09-14T12:00:00.000Z");
    const limits = { concurrency: 1,dailyCap: 20,queueDepth: 1 };
    const active = await repository.enter({ at,...limits });
    const waiting = await repository.enter({ at: new Date(at.getTime() + 1),...limits });
    if (active.kind !== "ACQUIRED" || waiting.kind !== "WAITING") {
      throw new Error("expected cancellation states");
    }
    try {
      await repository.cancel({ waiterId: waiting.waiterId,at: new Date(at.getTime() + 2) });
      expect((await database.pool.query(`
        SELECT state FROM support.relay_waiter_event
        WHERE waiter_id=$1 ORDER BY event_sequence DESC LIMIT 1
      `,[waiting.waiterId])).rows).toEqual([{ state: "CANCELLED" }]);
    } finally {
      await active.release();
    }
  });

  // Bug: tryAcquire wrote a fresh WAITING event before checking lease expiry,
  // silently reviving abandoned waiters after a process restart.
  it("terminalizes a cancelled head and refuses to revive stale waiters after restart", async () => {
    const firstInstance = new PostgresSupportRelayReservationRepository(database.pool);
    const secondInstance = new PostgresSupportRelayReservationRepository(database.pool);
    const at = new Date("2026-09-11T12:00:00.000Z");
    const limits = { concurrency: 1,dailyCap: 20,queueDepth: 3 };
    const active = await firstInstance.enter({ at,...limits });
    const cancelled = await firstInstance.enter({
      at: new Date(at.getTime() + 1),...limits
    });
    const stale = await secondInstance.enter({
      at: new Date(at.getTime() + 2),...limits
    });
    const survivor = await firstInstance.enter({
      at: new Date(at.getTime() + 3),...limits
    });
    if (active.kind !== "ACQUIRED" || cancelled.kind !== "WAITING"
      || stale.kind !== "WAITING" || survivor.kind !== "WAITING") {
      throw new Error("expected relay recovery states");
    }
    await firstInstance.cancel({
      waiterId: cancelled.waiterId,at: new Date(at.getTime() + 4)
    });
    expect((await database.pool.query(`
      SELECT state FROM support.relay_waiter_event
      WHERE waiter_id=$1 ORDER BY event_sequence DESC LIMIT 1
    `,[cancelled.waiterId])).rows).toEqual([{ state: "CANCELLED" }]);
    await active.release();
    const restarted = new PostgresSupportRelayReservationRepository(database.pool);
    const staleAttempt = await restarted.tryAcquire({
      at: new Date(at.getTime() + 6_003),concurrency: 1,dailyCap: 20,
      waiterId: survivor.waiterId
    });
    expect(staleAttempt).toEqual({ kind: "BUSY" });
    const newcomer = await restarted.enter({
      at: new Date(at.getTime() + 6_004),...limits
    });
    expect(newcomer.kind).toBe("ACQUIRED");
    if (newcomer.kind === "ACQUIRED") await newcomer.release();
    expect((await database.pool.query(`
      SELECT state,count(*)::int AS count FROM (
        SELECT DISTINCT ON (waiter_id) waiter_id,state
        FROM support.relay_waiter_event ORDER BY waiter_id,event_sequence DESC
      ) AS latest GROUP BY state ORDER BY state
    `)).rows).toEqual(expect.arrayContaining([
      { state: "CANCELLED",count: expect.any(Number) },
      { state: "COMPLETED",count: expect.any(Number) }
    ]));
  });

  // Bug: only the head was refreshed by tryAcquire, so a live follower expired
  // after five seconds and an over-depth newcomer was admitted.
  it("renews every live follower near expiry without 100ms event amplification", async () => {
    const repository = new PostgresSupportRelayReservationRepository(database.pool);
    const at = new Date("2026-09-16T12:00:00.000Z");
    const limits = { concurrency: 1,dailyCap: 20,queueDepth: 2 };
    const active = await repository.enter({ at,...limits });
    const head = await repository.enter({ at: new Date(at.getTime()+1),...limits });
    const follower = await repository.enter({ at: new Date(at.getTime()+2),...limits });
    if (active.kind !== "ACQUIRED" || head.kind !== "WAITING" || follower.kind !== "WAITING") {
      throw new Error("expected follower renewal states");
    }
    const ids = [head.waiterId,follower.waiterId];
    try {
      for (const offset of [100,200,300,400]) {
        await expect(repository.renew({ waiterIds: ids,at: new Date(at.getTime()+offset) }))
          .resolves.toEqual(ids);
      }
      await expect(repository.renew({ waiterIds: ids,at: new Date(at.getTime()+4_000) }))
        .resolves.toEqual(ids);
      await expect(repository.enter({
        at: new Date(at.getTime()+5_500),...limits
      })).resolves.toEqual({ kind: "FULL" });
      const events = await database.pool.query<{ waiter_id: string;count: number }>(`
        SELECT waiter_id::text,count(*)::int AS count
        FROM support.relay_waiter_event WHERE waiter_id=ANY($1::uuid[])
        GROUP BY waiter_id ORDER BY waiter_id
      `,[ids]);
      expect(events.rows.map(({ count }) => count)).toEqual([2,2]);
    } finally {
      await repository.cancel({ waiterId: head.waiterId,at: new Date(at.getTime()+5_501) });
      await repository.cancel({ waiterId: follower.waiterId,at: new Date(at.getTime()+5_502) });
      await active.release();
    }
  });

  // Bug: ACQUIRED could commit while the local waiter was being aborted; the
  // queue then lost the durable lease instead of releasing it exactly once.
  it("releases a real-PG acquisition that commits before local cancellation wins", async () => {
    const repository = new PostgresSupportRelayReservationRepository(database.pool);
    let releaseCommitted!: () => void;
    const committed = new Promise<void>((resolve) => { releaseCommitted = resolve; });
    let resumeReturn!: () => void;
    const resume = new Promise<void>((resolve) => { resumeReturn = resolve; });
    let lateReleased!: () => void;
    const released = new Promise<void>((resolve) => { lateReleased = resolve; });
    const reservations = {
      enter: repository.enter.bind(repository),
      cancel: repository.cancel.bind(repository),
      renew: repository.renew.bind(repository),
      tryAcquire: async (input: Parameters<typeof repository.tryAcquire>[0]) => {
        const result = await repository.tryAcquire(input);
        if (input.waiterId !== undefined && result.kind === "ACQUIRED") {
          releaseCommitted();
          await resume;
          return Object.freeze({
            kind: "ACQUIRED" as const,
            release: async () => {
              try { await result.release(); } finally { lateReleased(); }
            }
          });
        }
        return result;
      }
    };
    const limits = async () => Object.freeze({
      ...SUPPORT_LIMIT_DEFAULTS,support_relay_concurrency: 1,
      support_queue_depth: 1,support_daily_call_cap: 50
    });
    const queue = new SupportRelayQueue({ readLimits: limits,reservations });
    const active = await queue.acquireRelaySlot({ language: "en" });
    const controller = new AbortController();
    const waiting = queue.acquireRelaySlot({ language: "en",signal: controller.signal });
    await new Promise((resolve) => setTimeout(resolve,150));
    await active.release();
    await committed;
    controller.abort();
    await expect(waiting).rejects.toMatchObject({ code: "SUPPORT_QUEUE_ABORTED" });
    resumeReturn();
    await released;
    expect(queue.activeCount()).toBe(0);
    const next = await queue.acquireRelaySlot({ language: "en" });
    await next.release();
  });

  it("keeps two live followers globally full beyond one lease and frees exactly one depth place", async () => {
    const base = Date.parse("2026-09-20T12:00:00.000Z");
    const wall = Date.now();
    const clock = () => new Date(base + (Date.now()-wall));
    const limits = async () => Object.freeze({
      ...SUPPORT_LIMIT_DEFAULTS,support_relay_concurrency: 1,
      support_queue_depth: 2,support_daily_call_cap: 50
    });
    const first = new SupportRelayQueue({
      readLimits: limits,clock,
      reservations: new PostgresSupportRelayReservationRepository(database.pool)
    });
    const second = new SupportRelayQueue({
      readLimits: limits,clock,
      reservations: new PostgresSupportRelayReservationRepository(database.pool)
    });
    const newcomer = second;
    const active = await first.acquireRelaySlot({ language: "en" });
    const headController = new AbortController();
    const followerController = new AbortController();
    const head = first.acquireRelaySlot({ language: "en",signal: headController.signal });
    const follower = first.acquireRelaySlot({ language: "en",signal: followerController.signal });
    void head.catch(() => undefined);
    void follower.catch(() => undefined);
    try {
      await new Promise((resolve) => setTimeout(resolve,250));
      const followerStatus = await Promise.race([
        follower.then(() => "ACQUIRED" as const,(error: unknown) => error),
        new Promise<"PENDING">((resolve) => setTimeout(() => resolve("PENDING"),50))
      ]);
      expect(followerStatus).toBe("PENDING");
      expect(first.queuedCount()).toBe(2);
      await new Promise((resolve) => setTimeout(resolve,5_500));
      const liveWaiters = await database.pool.query<{ waiter_id: string;events: number }>(`
        WITH latest AS (
          SELECT DISTINCT ON (waiter_id) waiter_id,state
          FROM support.relay_waiter_event ORDER BY waiter_id,event_sequence DESC
        ),selected AS (
          SELECT waiter.waiter_id FROM support.relay_waiter AS waiter
          JOIN latest USING(waiter_id)
          WHERE waiter.enqueued_at >= $1::timestamptz AND latest.state='WAITING'
        )
        SELECT event.waiter_id::text,count(*)::int AS events
        FROM support.relay_waiter_event AS event JOIN selected USING(waiter_id)
        WHERE event.state='WAITING'
        GROUP BY event.waiter_id ORDER BY event.waiter_id
      `,[new Date(base)]);
      expect(liveWaiters.rows).toHaveLength(2);
      expect(liveWaiters.rows.every(({ events }) => events <= 2)).toBe(true);

      const overflowController = new AbortController();
      const overflow = newcomer.acquireRelaySlot({
        language: "en",signal: overflowController.signal
      });
      void overflow.catch(() => undefined);
      const overflowResult = await Promise.race([
        overflow.then(() => "ACQUIRED" as const,(error: unknown) => error),
        new Promise<"TEST_DEADLINE">((resolve) => setTimeout(() => resolve("TEST_DEADLINE"),500))
      ]);
      if (overflowResult === "TEST_DEADLINE") overflowController.abort();
      expect(overflowResult).toMatchObject({ code: "SUPPORT_QUEUE_FULL" });

      followerController.abort();
      await expect(follower).rejects.toMatchObject({ code: "SUPPORT_QUEUE_ABORTED" });
      const replacementController = new AbortController();
      const replacement = newcomer.acquireRelaySlot({
        language: "en",signal: replacementController.signal
      });
      void replacement.catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve,200));
      expect(newcomer.queuedCount()).toBe(1);
      replacementController.abort();
      await expect(replacement).rejects.toMatchObject({ code: "SUPPORT_QUEUE_ABORTED" });
      await active.release();
      const promoted = await head;
      await promoted.release();
    } finally {
      followerController.abort();
      headController.abort();
      await active.release();
      await Promise.allSettled([head,follower]);
    }
  },30_000);

  it("enforces shared depth and cancellation head-of-line through two queue instances", async () => {
    let nowMs = Date.parse("2026-09-15T12:00:00.000Z");
    const clock = () => new Date(++nowMs);
    const limits = async () => Object.freeze({
      ...SUPPORT_LIMIT_DEFAULTS,support_relay_concurrency: 1,
      support_queue_depth: 1,support_daily_call_cap: 50
    });
    const firstQueue = new SupportRelayQueue({
      readLimits: limits,clock,
      reservations: new PostgresSupportRelayReservationRepository(database.pool)
    });
    const secondQueue = new SupportRelayQueue({
      readLimits: limits,clock,
      reservations: new PostgresSupportRelayReservationRepository(database.pool)
    });
    const active = await firstQueue.acquireRelaySlot({ language: "en" });
    const headController = new AbortController();
    const head = secondQueue.acquireRelaySlot({
      language: "en",signal: headController.signal
    });
    await new Promise((resolve) => setTimeout(resolve,150));
    const overflowController = new AbortController();
    const overflow = firstQueue.acquireRelaySlot({
      language: "en",signal: overflowController.signal
    });
    const overflowResult = await Promise.race([
      overflow.then(() => "ACQUIRED",(error: unknown) => error),
      new Promise<"TEST_DEADLINE">((resolve) => setTimeout(() => resolve("TEST_DEADLINE"),300))
    ]);
    if (overflowResult === "TEST_DEADLINE") overflowController.abort();
    expect(overflowResult).toMatchObject({ code: "SUPPORT_QUEUE_FULL" });
    await active.release();
    const promoted = await head;
    await promoted.release();

    const activeAgain = await firstQueue.acquireRelaySlot({ language: "en" });
    const cancelledController = new AbortController();
    const cancelled = secondQueue.acquireRelaySlot({
      language: "en",signal: cancelledController.signal
    });
    await new Promise((resolve) => setTimeout(resolve,150));
    cancelledController.abort();
    await expect(cancelled).rejects.toMatchObject({ code: "SUPPORT_QUEUE_ABORTED" });
    await activeAgain.release();
    const afterCancellation = await firstQueue.acquireRelaySlot({ language: "en" });
    await afterCancellation.release();
  });

  it("forcibly closes a real PostgreSQL lease when aborted cleanup never settles", async () => {
    const repository = new PostgresSupportRelayReservationRepository(database.pool);
    const at = new Date("2026-09-25T12:00:00.000Z");
    const queue = new SupportRelayQueue({
      readLimits: async () => Object.freeze({
        ...SUPPORT_LIMIT_DEFAULTS,support_relay_concurrency: 1,
        support_queue_depth: 0,support_daily_call_cap: 20
      }),
      reservations: {
        tryAcquire: async (input) => {
          const acquired = await repository.tryAcquire(input);
          if (acquired.kind !== "ACQUIRED") return acquired;
          return Object.freeze({
            kind: "ACQUIRED" as const,
            release: () => new Promise<void>(() => undefined),
            forceRelease: acquired.forceRelease
          });
        }
      },
      clock: () => at
    });
    const controller = new AbortController();
    const running = queue.execute({
      modelBacked: true,language: "en",signal: controller.signal
    },async (signal) => await new Promise<never>((_resolve,reject) => {
      signal?.addEventListener("abort",() => reject(new Error("provider aborted")),{ once: true });
    }));
    void running.catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve,50));
    controller.abort();
    await expect(running).rejects.toMatchObject({ code: "SUPPORT_QUEUE_ABORTED" });
    expect(queue.activeCount()).toBe(0);

    let next: Awaited<ReturnType<typeof repository.tryAcquire>> = { kind: "BUSY" };
    for (let attempt = 0;attempt < 10 && next.kind === "BUSY";attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve,25));
      next = await repository.tryAcquire({
        at: new Date(at.getTime()+1),concurrency: 1,dailyCap: 20
      });
    }
    expect(next.kind).toBe("ACQUIRED");
    if (next.kind === "ACQUIRED") await next.release();
  });

  it("blocks a new low slot while a legacy high slot survives a live 2 to 1 reduction", async () => {
    const first = new PostgresSupportRelayReservationRepository(database.pool);
    const second = new PostgresSupportRelayReservationRepository(database.pool);
    const third = new PostgresSupportRelayReservationRepository(database.pool);
    const at = new Date("2026-09-26T12:00:00.000Z");
    const low = await first.tryAcquire({ at,concurrency: 2,dailyCap: 50 });
    const high = await second.tryAcquire({ at,concurrency: 2,dailyCap: 50 });
    if (low.kind !== "ACQUIRED" || high.kind !== "ACQUIRED") {
      throw new Error("expected two legacy slots");
    }
    await low.release();
    const blocked = await third.tryAcquire({
      at: new Date(at.getTime()+1),concurrency: 1,dailyCap: 50
    });
    try {
      expect(blocked).toEqual({ kind: "BUSY" });
    } finally {
      if (blocked.kind === "ACQUIRED") await blocked.release();
      await high.release();
    }
    const resumed = await third.tryAcquire({
      at: new Date(at.getTime()+2),concurrency: 1,dailyCap: 50
    });
    expect(resumed.kind).toBe("ACQUIRED");
    if (resumed.kind === "ACQUIRED") await resumed.release();

    const one = await first.tryAcquire({
      at: new Date(at.getTime()+3),concurrency: 1,dailyCap: 50
    });
    const raised = await second.tryAcquire({
      at: new Date(at.getTime()+4),concurrency: 2,dailyCap: 50
    });
    expect(one.kind).toBe("ACQUIRED");
    expect(raised.kind).toBe("ACQUIRED");
    if (one.kind === "ACQUIRED") await one.release();
    if (raised.kind === "ACQUIRED") await raised.release();
  });

  it("keeps only the oldest waiter when live depth shrinks from 3 to 1", async () => {
    const repository = new PostgresSupportRelayReservationRepository(database.pool);
    const at = new Date("2026-09-27T12:00:00.000Z");
    const limits = { concurrency: 1,dailyCap: 50,queueDepth: 3 };
    const active = await repository.enter({ at,...limits });
    const waiters = await Promise.all([1,2,3].map((offset) => repository.enter({
      at: new Date(at.getTime()+offset),...limits
    })));
    if (active.kind !== "ACQUIRED" || waiters.some(({ kind }) => kind !== "WAITING")) {
      throw new Error("expected active plus three waiters");
    }
    const ids = waiters.map((entry) => {
      if (entry.kind !== "WAITING") throw new Error("expected waiter");
      return entry.waiterId;
    });
    const result = await repository.reconcile({
      waiterIds: ids,at: new Date(at.getTime()+4),queueDepth: 1
    });
    expect(result).toEqual({
      liveWaiterIds: [ids[0]],capacityRejectedWaiterIds: [ids[1],ids[2]]
    });
    const latest = await database.pool.query<{ waiter_id: string;state: string }>(`
      SELECT DISTINCT ON (event.waiter_id) event.waiter_id::text AS waiter_id,event.state
      FROM support.relay_waiter_event AS event
      WHERE event.waiter_id=ANY($1::uuid[])
      ORDER BY event.waiter_id,event.event_sequence DESC
    `,[ids]);
    expect(latest.rows).toEqual(expect.arrayContaining([
      { waiter_id: ids[0],state: "WAITING" },
      { waiter_id: ids[1],state: "CANCELLED" },
      { waiter_id: ids[2],state: "CANCELLED" }
    ]));
    await repository.cancel({ waiterId: ids[0]!,at: new Date(at.getTime()+5) });
    await active.release();
  });

  it("rejects local excess waiters as FULL when durable depth reconciliation shrinks", async () => {
    let depth = 3;
    let enterCount = 0;
    const queue = new SupportRelayQueue({
      readLimits: async () => Object.freeze({
        ...SUPPORT_LIMIT_DEFAULTS,support_relay_concurrency: 1,
        support_queue_depth: depth,support_daily_call_cap: 50
      }),
      reservations: {
        enter: async () => {
          enterCount += 1;
          if (enterCount === 1) return Object.freeze({
            kind: "ACQUIRED" as const,release: async () => undefined
          });
          return Object.freeze({
            kind: "WAITING" as const,waiterId: `waiter-${enterCount-1}`,
            ticket: enterCount-1,position: enterCount-1
          });
        },
        cancel: async () => undefined,
        reconcile: async ({ waiterIds,queueDepth }) => Object.freeze({
          liveWaiterIds: Object.freeze(waiterIds.slice(0,queueDepth)),
          capacityRejectedWaiterIds: Object.freeze(waiterIds.slice(queueDepth))
        }),
        tryAcquire: async () => Object.freeze({ kind: "BUSY" as const })
      }
    });
    const active = await queue.acquireRelaySlot({ language: "en" });
    const controllers = [new AbortController(),new AbortController(),new AbortController()];
    const pending = controllers.map((controller) => queue.acquireRelaySlot({
      language: "en",signal: controller.signal
    }));
    pending.forEach((promise) => void promise.catch(() => undefined));
    await new Promise((resolve) => setTimeout(resolve,25));
    depth = 1;
    await new Promise((resolve) => setTimeout(resolve,150));

    await expect(pending[1]).rejects.toMatchObject({ code: "SUPPORT_QUEUE_FULL" });
    await expect(pending[2]).rejects.toMatchObject({ code: "SUPPORT_QUEUE_FULL" });
    expect(queue.queuedCount()).toBe(1);
    controllers[0]!.abort();
    await expect(pending[0]).rejects.toMatchObject({ code: "SUPPORT_QUEUE_ABORTED" });
    await active.release();
  });
});
