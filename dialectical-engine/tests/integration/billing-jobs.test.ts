import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BillingJobQueries, BillingRepository, createPool, migrate, type OutboxJob } from "@debateai/db";
import { BillingOutboxWorker } from "../../apps/api/src/billing/outbox.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
});
afterAll(async () => { await database?.stop(); });

const NOW = new Date("2026-10-01T10:00:00.000Z");

describe("P7 billing job queries and the worker over the real outbox", () => {
  it("lets exactly one of two API processes hold a subscription lease", async () => {
    const other = createPool(database.connectionString);
    try {
      const first = new BillingJobQueries(database.pool);
      const second = new BillingJobQueries(other);
      const subscriptionId = randomUUID();
      let acquired!: () => void;
      let release!: () => void;
      const holding = new Promise<void>((resolve) => { acquired = resolve; });
      const held = new Promise<void>((resolve) => { release = resolve; });
      const running = first.withSubscriptionLease(subscriptionId, async () => { acquired(); await held; return "first"; });
      await holding;
      expect(await second.withSubscriptionLease(subscriptionId, async () => "second")).toEqual({ kind: "BUSY" });
      release();
      expect(await running).toEqual({ kind: "RAN", value: "first" });
      expect(await second.withSubscriptionLease(subscriptionId, async () => "second")).toEqual({ kind: "RAN", value: "second" });
    } finally {
      await other.end();
    }
  });

  it("hands each job to exactly one of two workers, and a failed job waits for its retry time", async () => {
    const other = createPool(database.connectionString);
    try {
      const repository = new BillingRepository(database.pool);
      const refs = Array.from({ length: 6 }, () => `M10:${randomUUID()}`);
      await repository.withTransaction(async (client) => {
        for (const ref of refs) {
          await repository.enqueue(client, { kind: "EMAIL", ref, notBefore: NOW, payload: { template: "M10" } });
        }
      });
      const handled: string[] = [];
      const workerFor = (pool: typeof database.pool, workerId: string) => {
        const worker = new BillingOutboxWorker({
          repository: new BillingRepository(pool), workerId, clock: () => NOW, audit: () => undefined, batchSize: 4
        });
        worker.register("EMAIL", async (job: OutboxJob) => { handled.push(job.ref); return { kind: "DONE" }; });
        return worker;
      };
      await Promise.all([workerFor(database.pool, "w-a").drain(5), workerFor(other, "w-b").drain(5)]);
      expect([...handled].sort()).toEqual([...refs].sort());

      const failingRef = `M10:${randomUUID()}`;
      await repository.withTransaction((client) =>
        repository.enqueue(client, { kind: "EMAIL", ref: failingRef, notBefore: NOW, payload: { template: "M10" } }));
      let clock = NOW;
      const flaky = new BillingOutboxWorker({
        repository, workerId: "w-c", clock: () => clock, audit: () => undefined, batchSize: 4
      });
      let calls = 0;
      flaky.register("EMAIL", async () => { calls += 1; throw new Error("down"); });
      await flaky.runOnce();
      expect(calls).toBe(1);
      await flaky.runOnce();
      expect(calls).toBe(1);
      clock = new Date(NOW.getTime() + 61_000);
      await flaky.runOnce();
      expect(calls).toBe(2);
      const jobs = new BillingJobQueries(database.pool);
      await repository.withTransaction(async (client) => {
        expect(await jobs.outboxJobExists(client, "EMAIL", refs[0]!)).toBe(true);
        expect(await jobs.outboxJobExists(client, "EMAIL", `M10:${randomUUID()}`)).toBe(false);
      });
    } finally {
      await other.end();
    }
  });

  it("calls xMoney's refund exactly once per job when a slow batch outlives the 300 s lease on two workers (D5 5e)", async () => {
    const other = createPool(database.connectionString);
    try {
      const repository = new BillingRepository(database.pool);
      // XMONEY_REFUND: no other test in this file queues that kind, so the claims below see these three jobs alone.
      const T0 = new Date("2026-10-02T10:00:00.000Z");
      let clock = T0;
      const refs = ["first", "second", "third"].map((name) => `${name}-${randomUUID()}`);
      await repository.withTransaction(async (client) => {
        for (const [index, ref] of refs.entries()) {
          await repository.enqueue(client, {
            kind: "XMONEY_REFUND", ref, notBefore: new Date(T0.getTime() - 3_000 + index * 1_000), payload: {}
          });
        }
      });
      /** The stand-in for `xmoney.refund`: one entry per call that would move money. */
      const refundCalls: string[] = [];
      const processB = new BillingOutboxWorker({
        repository: new BillingRepository(other), workerId: "w-b", clock: () => clock, audit: () => undefined, batchSize: 10
      });
      processB.register("XMONEY_REFUND", async (job) => { refundCalls.push(job.ref); return { kind: "DONE" }; });
      const processA = new BillingOutboxWorker({
        repository, workerId: "w-a", clock: () => clock, audit: () => undefined, batchSize: 10
      });
      processA.register("XMONEY_REFUND", async (job) => {
        refundCalls.push(job.ref);
        // A slow provider: the first refund takes 200 s and the second 101 s more. By then the third job, claimed at
        // T0 and not started, is past its 5-minute lease, and process B claims and runs it. The second job's lease was
        // renewed at +200 s, so B leaves it alone.
        if (job.ref === refs[0]) clock = new Date(T0.getTime() + 200_000);
        if (job.ref === refs[1]) {
          clock = new Date(T0.getTime() + 301_000);
          await processB.runOnce();
        }
        return { kind: "DONE" };
      });
      const report = await processA.runOnce();
      expect([...refundCalls].sort()).toEqual([...refs].sort());
      expect(report.map((row) => [row.outcome, row.code ?? null])).toEqual([
        ["DONE", null], ["DONE", null], ["RETRY", "BILLING_OUTBOX_CLAIM_LOST"]
      ]);
      const rows = (await database.pool.query<{ ref: string; claimed_by: string; attempts: number; done_at: Date | null }>(
        "SELECT ref, claimed_by, attempts, done_at FROM billing.outbox WHERE ref = ANY($1::text[])", [refs]
      )).rows;
      expect(rows.every((row) => row.done_at !== null)).toBe(true);
      expect(rows.find((row) => row.ref === refs[2])).toMatchObject({ claimed_by: "w-b", attempts: 2 });
    } finally {
      await other.end();
    }
  });

  it("bounds the owner-lock wait to 10 s inside its own transaction only (SET LOCAL lock_timeout)", async () => {
    const repository = new BillingRepository(database.pool);
    const jobs = new BillingJobQueries(database.pool);
    const setting = async (lock: boolean) => repository.withTransaction(async (client) => {
      if (lock) await jobs.lockOwner(client, randomUUID());
      return (await client.query<{ lock_timeout: string }>("SHOW lock_timeout")).rows[0]?.lock_timeout;
    });
    expect(await setting(true)).toBe("10s");
    // The next transaction on a pooled connection keeps the server default: SET LOCAL died with the COMMIT.
    for (let round = 0; round < 3; round += 1) expect(await setting(false)).toBe("0");
  });

  it("holds any keyed lease for one process at a time (the refund call's lease, P9b)", async () => {
    const other = createPool(database.connectionString);
    try {
      const key = `debateai.billing.refund-call:${randomUUID()}`;
      let acquired!: () => void;
      let release!: () => void;
      const holding = new Promise<void>((resolve) => { acquired = resolve; });
      const held = new Promise<void>((resolve) => { release = resolve; });
      const running = new BillingJobQueries(database.pool).withLease(key, async () => { acquired(); await held; return 1; });
      await holding;
      expect(await new BillingJobQueries(other).withLease(key, async () => 2)).toEqual({ kind: "BUSY" });
      release();
      expect(await running).toEqual({ kind: "RAN", value: 1 });
    } finally {
      await other.end();
    }
  });
});
