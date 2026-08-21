import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { readPoolFailureReceipt, runPoolFailureChild } from "../support/poolFailureHarness.js";

let database: TestDatabase;

beforeAll(async () => { database = await startTestDatabase(); });
afterAll(async () => { await database.stop(); });

describe("POL-03 real PostgreSQL backend reset", () => {
  it("pins PostgreSQL diagnostics to the stable C locale", async () => {
    const result = await database.pool.query<{ lc_messages: string }>("SHOW lc_messages");
    expect(result.rows[0]?.lc_messages).toBe("C");
  });

  it("does not mislabel an ordinary SQL failure as a pool failure", async () => {
    await expect(database.pool.query("SELECT pol03_missing_column"))
      .rejects.toMatchObject({ name: "error", code: "42703" });
  });

  it("survives an idle backend termination and reports in-flight and subsequent failures typed", async () => {
    const child = await runPoolFailureChild({
      POL03_MODE: "backend",
      POL03_DATABASE_URL: database.connectionString
    });

    expect(child.exitCode, child.stderr).toBe(0);
    expect(child.stderr).toContain("[DATABASE_POOL_FAILED] PostgreSQL pool operation failed: terminating connection due to administrator command");
    expect(readPoolFailureReceipt(child.stdout)).toMatchObject({
      survived: true,
      inFlightError: {
        name: "TypedDomainError",
        code: "DATABASE_POOL_FAILED"
      },
      subsequentError: {
        name: "TypedDomainError",
        code: "DATABASE_POOL_FAILED"
      }
    });
  });
});
