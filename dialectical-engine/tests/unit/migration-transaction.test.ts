import { afterEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import {
  MIGRATION_LOCK_PAUSE_MS, MIGRATION_LOCK_TIMEOUT_MS, MIGRATION_LOCK_TRIES, withMigrationLockRetry, withMigrationStepTransaction
} from "../../packages/db/src/migration-transaction.js";

/**
 * One transaction per migration step (side-by-side spec 2026-10-21 §5, "Each step runs on its own"; plan A, task A6).
 * Each try: BEGIN, the read-committed check, SET LOCAL lock_timeout = '2s', the body, COMMIT; any error rolls back.
 * Only a lock wait that ran out (SQLSTATE 55P03) is tried again, after a 2 s pause, five tries in all; then
 * MIGRATION_LOCK_TIMEOUT names the step. No database here: a fake client records what migrate() would send.
 */
function fakeClient(isolation = "read committed"): Readonly<{ client: PoolClient; queries: string[] }> {
  const queries: string[] = [];
  const client = {
    query: async (sql: string) => {
      queries.push(sql);
      return { rows: sql === "SHOW transaction_isolation" ? [{ transaction_isolation: isolation }] : [] };
    }
  } as unknown as PoolClient;
  return { client, queries };
}
const lockTimeout = (): Error => Object.assign(new Error("canceling statement due to lock timeout"), { code: "55P03" });
const TRY_START = ["BEGIN", "SHOW transaction_isolation", "SET LOCAL lock_timeout = '2s'"];
const retryLines = (warn: Readonly<{ mock: Readonly<{ calls: readonly (readonly unknown[])[] }> }>): unknown[] => warn.mock.calls.map((call) => call[0]);

afterEach(() => { vi.restoreAllMocks(); });

describe("side-by-side §5: withMigrationStepTransaction", () => {
  it("states the reviewed timing: a 2 s lock wait, five tries, a 2 s pause", () => {
    expect([MIGRATION_LOCK_TIMEOUT_MS, MIGRATION_LOCK_TRIES, MIGRATION_LOCK_PAUSE_MS]).toEqual([2000, 5, 2000]);
  });

  it("tries again after a lock wait ran out, rolling each failed try back", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { client, queries } = fakeClient();
    const sleep = vi.fn(async (_ms: number) => undefined);
    let calls = 0;
    const result = await withMigrationStepTransaction(client, "0123_x.sql", async () => {
      calls += 1;
      if (calls <= 2) throw lockTimeout();
      return "applied";
    }, { sleep });
    expect(result).toBe("applied");
    expect(queries).toEqual([...TRY_START, "ROLLBACK", ...TRY_START, "ROLLBACK", ...TRY_START, "COMMIT"]);
    expect(sleep.mock.calls).toEqual([[2000], [2000]]);
    expect(retryLines(warn)).toEqual(["[MIGRATION_LOCK_RETRY] 0123_x.sql try 1/5", "[MIGRATION_LOCK_RETRY] 0123_x.sql try 2/5"]);
    // SET LOCAL lock_timeout is the third statement of every try.
    for (const start of [0, 4, 8]) expect(queries[start + 2]).toBe("SET LOCAL lock_timeout = '2s'");
  });

  it("refuses MIGRATION_LOCK_TIMEOUT, naming the step, after the fifth lock wait ran out", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { client, queries } = fakeClient();
    const sleep = vi.fn(async (_ms: number) => undefined);
    const body = vi.fn(async () => { throw lockTimeout(); });
    const refusal = await withMigrationStepTransaction(client, "0123_x.sql", body, { sleep }).then(() => "NOT_REFUSED", (error: unknown) => error);
    expect(refusal).toMatchObject({ code: "MIGRATION_LOCK_TIMEOUT", message: "MIGRATION_LOCK_TIMEOUT 0123_x.sql" });
    expect(body).toHaveBeenCalledTimes(5);
    expect(sleep).toHaveBeenCalledTimes(4);
    expect(retryLines(warn)).toEqual([1, 2, 3, 4].map((n) => `[MIGRATION_LOCK_RETRY] 0123_x.sql try ${n}/5`));
    expect(queries.filter((sql) => sql === "ROLLBACK")).toHaveLength(5);
    expect(queries).not.toContain("COMMIT");
  });

  it("any other failure is refused at once: no retry, no pause", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { client, queries } = fakeClient();
    const sleep = vi.fn(async (_ms: number) => undefined);
    const violation = Object.assign(new Error("check violation"), { code: "23514" });
    await expect(withMigrationStepTransaction(client, "0123_x.sql", async () => { throw violation; }, { sleep })).rejects.toBe(violation);
    expect(queries).toEqual([...TRY_START, "ROLLBACK"]);
    expect(sleep).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("refuses a transaction that is not read committed before the body runs", async () => {
    const { client, queries } = fakeClient("serializable");
    const body = vi.fn(async () => "applied");
    await expect(withMigrationStepTransaction(client, "PROLOGUE", body)).rejects.toMatchObject({ code: "MIGRATION_ISOLATION_REQUIRES_READ_COMMITTED" });
    expect(body).not.toHaveBeenCalled();
    expect(queries).toEqual(["BEGIN", "SHOW transaction_isolation", "ROLLBACK"]);
  });
});

describe("side-by-side §5: withMigrationLockRetry (outside-transaction steps)", () => {
  it("retries only 55P03, with the same lines and pause, and opens no transaction of its own", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const sleep = vi.fn(async (_ms: number) => undefined);
    let calls = 0;
    await expect(withMigrationLockRetry("0199_probe.sql", async () => { calls += 1; if (calls === 1) throw lockTimeout(); return calls; }, { sleep })).resolves.toBe(2);
    expect(sleep.mock.calls).toEqual([[2000]]);
    expect(retryLines(warn)).toEqual(["[MIGRATION_LOCK_RETRY] 0199_probe.sql try 1/5"]);
    await expect(withMigrationLockRetry("0199_probe.sql", async () => { throw lockTimeout(); }, { sleep, tries: 2, pauseMs: 5 }))
      .rejects.toMatchObject({ code: "MIGRATION_LOCK_TIMEOUT", message: "MIGRATION_LOCK_TIMEOUT 0199_probe.sql" });
    expect(sleep.mock.calls.at(-1)).toEqual([5]);
    expect(retryLines(warn).at(-1)).toBe("[MIGRATION_LOCK_RETRY] 0199_probe.sql try 1/2");
  });
});
