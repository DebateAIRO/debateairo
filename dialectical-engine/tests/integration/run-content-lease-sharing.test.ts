import { randomUUID } from "node:crypto";
import pg, { type Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { acquireRunContentLease } from "@debateai/db";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

// The run content lease exists so account erasure cannot shred a run's keys while anything
// still uses that run's content. It does NOT exist to make users of content exclude one
// another: when it did (an exclusive try-lock for every user), the runner held a run's lease
// for the whole debate and every reader of that run — the debate page, its event stream,
// the home list — spun on a 10 ms retry for as long as the debate ran. A slow Premium debate
// froze the app for half an hour (2026-09-13). Users now share the lease; erasure alone
// takes it exclusively (packages/db/src/account-erasure.ts, withErasureContentLeases).
const CONTENT_LEASE_NAMESPACE = "debateai:run-content-lease:v1:";

let database: TestDatabase;
let runnerPool: Pool;
let readerPool: Pool;
let erasureClient: pg.Client;

function settlesWithin<T>(promise: Promise<T>, ms: number): Promise<"SETTLED" | "PENDING"> {
  return Promise.race([
    promise.then(() => "SETTLED" as const),
    new Promise<"PENDING">((resolve) => setTimeout(() => resolve("PENDING"), ms))
  ]);
}

beforeAll(async () => {
  database = await startTestDatabase();
  runnerPool = new pg.Pool({ connectionString: database.connectionString, max: 2 });
  readerPool = new pg.Pool({ connectionString: database.connectionString, max: 2 });
  erasureClient = new pg.Client({ connectionString: database.connectionString });
  await erasureClient.connect();
}, 120_000);

afterAll(async () => {
  await erasureClient?.end().catch(() => undefined);
  await Promise.all([runnerPool?.end(), readerPool?.end()].map((p) => p?.catch(() => undefined)));
  await database?.stop();
});

describe("run content lease: shared by users, exclusive for erasure", () => {
  it("lets a reader take a run's content lease while the runner already holds it", async () => {
    const runId = randomUUID();
    const runner = await acquireRunContentLease(runnerPool, [runId]);
    try {
      const reader = acquireRunContentLease(readerPool, [runId]);
      expect(await settlesWithin(reader, 2_000)).toBe("SETTLED");
      await (await reader).release();
    } finally {
      await runner.release();
    }
  });

  it("keeps erasure out while any user holds the lease, and every user out while erasure holds it", async () => {
    const runId = randomUUID();
    const key = `${CONTENT_LEASE_NAMESPACE}${runId}`;
    const runner = await acquireRunContentLease(runnerPool, [runId]);
    const reader = await acquireRunContentLease(readerPool, [runId]);

    const tryErase = await erasureClient.query<{ ok: boolean }>(
      "SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS ok", [key]
    );
    expect(tryErase.rows[0]!.ok).toBe(false);

    const erasure = erasureClient.query("SELECT pg_advisory_lock(hashtextextended($1,0))", [key]);
    await reader.release();
    expect(await settlesWithin(erasure, 300)).toBe("PENDING");
    await runner.release();
    expect(await settlesWithin(erasure, 2_000)).toBe("SETTLED");

    const lateReader = acquireRunContentLease(readerPool, [runId]);
    expect(await settlesWithin(lateReader, 300)).toBe("PENDING");
    await erasureClient.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [key]);
    expect(await settlesWithin(lateReader, 2_000)).toBe("SETTLED");
    await (await lateReader).release();
  });

  it("does not let new users jump an erasure that is already waiting", async () => {
    const runId = randomUUID();
    const key = `${CONTENT_LEASE_NAMESPACE}${runId}`;
    const runner = await acquireRunContentLease(runnerPool, [runId]);
    const erasure = erasureClient.query("SELECT pg_advisory_lock(hashtextextended($1,0))", [key]);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const newcomer = acquireRunContentLease(readerPool, [runId]);
    expect(await settlesWithin(newcomer, 300)).toBe("PENDING");

    await runner.release();
    expect(await settlesWithin(erasure, 2_000)).toBe("SETTLED");
    await erasureClient.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [key]);
    expect(await settlesWithin(newcomer, 2_000)).toBe("SETTLED");
    await (await newcomer).release();
  });

  it("releases a shared hold without leaving the key locked", async () => {
    const runId = randomUUID();
    const key = `${CONTENT_LEASE_NAMESPACE}${runId}`;
    const lease = await acquireRunContentLease(runnerPool, [runId]);
    await expect(lease.release()).resolves.toBeUndefined();
    const free = await erasureClient.query<{ ok: boolean }>(
      "SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS ok", [key]
    );
    expect(free.rows[0]!.ok).toBe(true);
    await erasureClient.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [key]);
  });
});
