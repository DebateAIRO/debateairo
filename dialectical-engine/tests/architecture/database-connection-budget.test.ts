import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  API_DATABASE_POOLS,
  RUNNER_DATABASE_POOLS,
  RUNNER_CAPACITY,
  SUPPORT_CONTROL_PLANE_POOL,
  type DatabasePoolBudget
} from "../../packages/db/src/pool-budget.js";

/**
 * Pre-launch connection budget (2026-10-10). The owner asked "when will we have
 * a database connection problem?". Measured on the preview server: Postgres
 * allows 200 connections, 3 of them kept for the superuser; Hatchet's role may
 * hold 50. The API opened eleven pools, nine of them at node-postgres's default
 * of 10 with no limit on the wait — about 104 connections — and the runner one
 * pool of 10 while accepting up to 100 debates at once, each holding 2.
 *
 * Owner rulings the same day: size for ONE API process (the server runs exactly
 * one, deploy/vps/README.md "Exactly one API unit"), and let the runner run at
 * most 8 debates at once. The plan and the arithmetic in words:
 * docs/operations/2026-10-10-database-connection-budget.md.
 */

const API_MAIN = "apps/api/src/main.ts";
const RUNNER_MAIN = "apps/runner/src/main.ts";

// The server, as measured on 2026-10-10 and provisioned by deploy/postgres.
const POSTGRES_MAX_CONNECTIONS = 200;
const SUPERUSER_RESERVED = 3; // PostgreSQL's default; backups (pg_dump as postgres) use these
const HATCHET_ROLE_LIMIT = 50; // deploy/postgres/bootstrap.sql: debateai_prod_hatchet CONNECTION LIMIT 50
const MIGRATOR_ROLE_LIMIT = 3; // deploy/postgres/bootstrap.sql: debateai_prod_migrator CONNECTION LIMIT 3
const OPERATOR_COMMANDS = 10; // billing, support and owner commands, run by hand, one at a time
// Left free on top of every ceiling: a guarded query that is cancelled opens a
// short extra connection outside its pool (packages/db/src/private-stream.ts),
// and the owner needs room to log in during an incident.
const SPARE = 25;

function poolCalls(source: string): readonly string[] {
  return [...source.matchAll(/createPool\([^)]*\)/gu)].map((match) => match[0]);
}

function budgetKeys(source: string, table: "API_DATABASE_POOLS" | "RUNNER_DATABASE_POOLS"): readonly string[] {
  const calls = poolCalls(source);
  const pattern = new RegExp(`^createPool\\(environment\\.[A-Z_]+!?, ${table}\\.([A-Za-z]+)\\)`, "u");
  return calls.map((call) => {
    const key = pattern.exec(call)?.[1];
    if (key === undefined) throw new TypeError(`POOL_WITHOUT_BUDGET: ${call}`);
    return key;
  });
}

function rows(table: Readonly<Record<string, DatabasePoolBudget>>): readonly DatabasePoolBudget[] {
  return Object.values(table);
}

function sum(table: Readonly<Record<string, DatabasePoolBudget>>, except: readonly string[] = []): number {
  return Object.entries(table)
    .filter(([key]) => !except.includes(key))
    .reduce((total, [, row]) => total + row.max, 0);
}

describe("every always-on pool has a size and a bounded wait", () => {
  it("opens every API pool from the budget table, each row exactly once", async () => {
    const keys = budgetKeys(await readFile(API_MAIN, "utf8"), "API_DATABASE_POOLS");
    // Sanity: the sweep found the pools, or this row could never fail.
    expect(keys.length).toBeGreaterThanOrEqual(11);
    expect([...keys].sort()).toEqual(Object.keys(API_DATABASE_POOLS).sort());
  });

  it("opens the runner's pool from the budget table", async () => {
    const keys = budgetKeys(await readFile(RUNNER_MAIN, "utf8"), "RUNNER_DATABASE_POOLS");
    expect([...keys].sort()).toEqual(Object.keys(RUNNER_DATABASE_POOLS).sort());
  });

  it("builds the support settings pool from its budget row", async () => {
    const database = await readFile("packages/db/src/index.ts", "utf8");
    const start = database.indexOf("export function createSupportControlPlanePool(");
    const body = database.slice(start, database.indexOf("\n}\n", start));
    expect(start).toBeGreaterThan(-1);
    expect(body).toContain("max: SUPPORT_CONTROL_PLANE_POOL.max");
    expect(body).toContain("connectionTimeoutMillis: SUPPORT_CONTROL_PLANE_POOL.connectionTimeoutMillis");
    expect(body).toContain("application_name: SUPPORT_CONTROL_PLANE_POOL.name");
  });

  it("gives every row a whole-number size, a wait of a few seconds and a unique name", () => {
    const all = [...rows(API_DATABASE_POOLS), ...rows(RUNNER_DATABASE_POOLS)];
    for (const row of all) {
      expect(Number.isSafeInteger(row.max) && row.max >= 1 && row.max <= 100, row.name).toBe(true);
      expect(Number.isSafeInteger(row.connectionTimeoutMillis), row.name).toBe(true);
      expect(row.connectionTimeoutMillis, row.name).toBeGreaterThanOrEqual(1_000);
      expect(row.connectionTimeoutMillis, row.name).toBeLessThanOrEqual(15_000);
      expect(row.name).toMatch(/^(?:api|runner):[a-z-]+$/u);
    }
    const names = [...all.map((row) => row.name), SUPPORT_CONTROL_PLANE_POOL.name];
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("no pool is smaller than what one of its flows holds at once", () => {
  it("keeps every API pool at or above its measured floor", async () => {
    const supportSource = await readFile("packages/db/src/support.ts", "utf8");
    const relaySlots = Number(/static readonly MAX_CONCURRENCY_SLOTS = (\d+);/u.exec(supportSource)?.[1]);
    expect(relaySlots).toBe(16);
    // Each floor is "flows that may overlap × connections one flow holds at
    // once + 1 free", from the 2026-10-10 audit (the plan document, table 2).
    const floors: Readonly<Record<keyof typeof API_DATABASE_POOLS, number>> = {
      // A content lease holds one connection while its body takes a second
      // (packages/db/src/index.ts withRunContentLease): 8 overlapping reads.
      runtime: 8 * 2 + 1,
      // Every signed-in request and a check every 250 ms per open debate page
      // (apps/api/src/staff/access.ts), plus recovery mail holding one across
      // a send of up to 5 s (packages/db/src/consumer-security-mail.ts).
      authorization: 8,
      // The 30 s timer runs both cleanups at once, each a lease plus a query.
      publicationCleanup: 2 * 2,
      contentProvision: 1,
      serverAskAdmission: 2,
      legacyAskAdmission: 2,
      // One decision holds the day lock; the others wait on this pool, never on
      // the pool that decision needs (packages/budget/src/spend-lock.ts).
      roomDecision: 4,
      // The erasure timer holds the notice lease plus one more; one delete waits.
      erasure: 2 + 1,
      evaluatorDevMenu: 1,
      // Opening a case holds one connection and reads the messages on another.
      support: 2 * 2,
      // Every relay slot the register may allow, plus the queue's bookkeeping.
      supportRelayLease: relaySlots + 2,
      // One export build at a time (single-flight timer): its snapshot read and its lease renewal overlap.
      dataExport: 2
    };
    for (const [key, floor] of Object.entries(floors)) {
      expect(API_DATABASE_POOLS[key as keyof typeof API_DATABASE_POOLS].max, key).toBeGreaterThanOrEqual(floor);
    }
  });

  it("caps the runner's debates so each one has its two connections", async () => {
    // A running debate holds its content lease for the whole debate and takes
    // a second connection for its spend and memory reads
    // (apps/runner/src/index.ts withDisclosureContentLease); 4 more serve the
    // claim, the start-up reconciliation and the story writer.
    expect(RUNNER_CAPACITY.concurrentRuns).toBe(8);
    expect(RUNNER_DATABASE_POOLS.runtime.max).toBeGreaterThanOrEqual(RUNNER_CAPACITY.concurrentRuns * 2 + 4);
    const runner = await readFile(RUNNER_MAIN, "utf8");
    // Without slots the job system hands one runner up to 100 debates at once
    // (@hatchet-dev/typescript-sdk DEFAULT_DEFAULT_SLOTS).
    expect(runner).toContain(
      "hatchet.worker(environment.HATCHET_WORKER_NAME, { slots: RUNNER_CAPACITY.concurrentRuns })"
    );
  });

  it("lets a debate wait for a free place longer than the job system's 5 minutes", async () => {
    const runner = await readFile("apps/runner/src/index.ts", "utf8");
    const start = runner.indexOf("export function declareHatchetWalkingSkeletonTask(");
    const declaration = runner.slice(start, runner.indexOf("fn: async (", start));
    expect(start).toBeGreaterThan(-1);
    expect(declaration).toContain("scheduleTimeout: RUNNER_QUEUE_WAIT_LIMIT,");
    expect(runner).toContain('export const RUNNER_QUEUE_WAIT_LIMIT = "30m" as const;');
  });
});

describe("the whole server stays under Postgres's limit", () => {
  it("never lets the evaluator dev menu's pool exist outside development", async () => {
    const environment = await readFile("packages/register/src/runtime-environment.ts", "utf8");
    expect(environment).toContain(
      'if (environment.EVALUATOR_DEV_MENU_ENABLED === "true" && environment.NODE_ENV !== "development") {'
    );
  });

  it("fits one API, the runner, Hatchet, the migrator and the operator with room to spare", () => {
    const api = sum(API_DATABASE_POOLS, ["evaluatorDevMenu"]) + SUPPORT_CONTROL_PLANE_POOL.max;
    const runner = sum(RUNNER_DATABASE_POOLS);
    expect(api).toBeLessThanOrEqual(80);
    expect(runner).toBeLessThanOrEqual(20);
    const ceiling = api + runner + HATCHET_ROLE_LIMIT + MIGRATOR_ROLE_LIMIT + OPERATOR_COMMANDS;
    expect(ceiling + SPARE).toBeLessThanOrEqual(POSTGRES_MAX_CONNECTIONS - SUPERUSER_RESERVED);
  });
});
