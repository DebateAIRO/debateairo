import { createEmailBlindIndex } from "@debateai/crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { runBillingWithdrawCli } from "../../apps/api/src/billing/withdraw-cli.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

const OWNER = "0b4e2a9c-6f1d-4c3e-9a7b-2d5f8e1c0a93";
const KEY = Buffer.alloc(32, 7);
const ACCOUNT_INDEX = createEmailBlindIndex(KEY, "a@example.com");
let database: TestDatabase;

beforeAll(async () => {
  database = await startTestDatabase();
  await database.pool.query("CREATE SCHEMA identity");
  await database.pool.query(`CREATE TABLE identity."user" (
    owner_ref uuid NOT NULL, email_blind_index bytea NOT NULL, state text NOT NULL
  )`);
});

beforeEach(async () => {
  await database.pool.query('TRUNCATE identity."user"');
});

afterAll(async () => {
  await database?.stop();
});

async function seedAccount(): Promise<void> {
  await database.pool.query(
    'INSERT INTO identity."user" (owner_ref, email_blind_index, state) VALUES ($1,$2,$3)',
    [OWNER, ACCOUNT_INDEX, "active"]
  );
}

function harness(address: string) {
  const statements: Array<{ sql: string; values: unknown[] | undefined }> = [];
  const client = { release: vi.fn() };
  const pool = {
    connect: vi.fn(async () => {
      const real = await database.pool.connect();
      return {
        query: vi.fn((sql: string, values?: unknown[]) => {
          statements.push({
            sql,
            values: values?.map((value) => Buffer.isBuffer(value) ? Buffer.from(value) : value)
          });
          return real.query(sql, values);
        }),
        release: () => { client.release(); real.release(); }
      };
    }),
    end: vi.fn(async () => undefined)
  };
  const output = { out: "", err: "" };
  const sink = {
    stdout: (text: string) => { output.out += text; },
    stderr: (text: string) => { output.err += text; }
  };
  const lookup = {
    environment: {
      DATABASE_URL: database.connectionString,
      BLIND_INDEX_KEY_PATH: "/unused/test-key",
      NODE_ENV: "test"
    },
    readStdin: vi.fn(async () => address),
    readKey: vi.fn(() => Buffer.from(KEY)),
    openPool: vi.fn(async () => pool)
  };
  const run = runBillingWithdrawCli as unknown as (
    args: readonly string[], outputSink: typeof sink, open: () => Promise<never>, lookupDeps: typeof lookup
  ) => Promise<number>;
  return { statements, client, pool, output, sink, lookup, run };
}

describe("S05 owner-of-email operator lookup", () => {
  it("resolves the active account from one stdin address after sign-in normalisation", async () => {
    await seedAccount();
    const h = harness(" A@Example.COM \n");
    expect(await h.run(["--owner-of-email"], h.sink, vi.fn(), h.lookup)).toBe(0);
    expect(h.output).toEqual({ out: `owner_ref: ${OWNER}\n`, err: "" });
    const select = h.statements.find(({ sql }) => sql.includes("SELECT owner_ref"));
    expect(select?.values?.[0]).toEqual(ACCOUNT_INDEX);
    expect(select?.sql).toContain("state='active'");
    expect(h.lookup.readStdin).toHaveBeenCalledTimes(1);
  });

  it("prints none when no active account owns the address", async () => {
    const h = harness("other@example.com\n");
    expect(await h.run(["--owner-of-email"], h.sink, vi.fn(), h.lookup)).toBe(0);
    expect(h.output).toEqual({ out: "owner_ref: none\n", err: "" });
  });

  it("begins a read-only transaction before selecting the owner", async () => {
    await seedAccount();
    const h = harness("a@example.com\n");
    expect(await h.run(["--owner-of-email"], h.sink, vi.fn(), h.lookup)).toBe(0);
    const statements = h.statements.map(({ sql }) => sql.trim());
    const begin = statements.findIndex((sql) => /^BEGIN READ ONLY$/iu.test(sql) || /^SET TRANSACTION READ ONLY$/iu.test(sql));
    const select = statements.findIndex((sql) => sql.includes("SELECT owner_ref"));
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(select).toBeGreaterThan(begin);
    expect(h.client.release).toHaveBeenCalledTimes(1);
    expect(h.pool.end).toHaveBeenCalledTimes(1);
  });
});
