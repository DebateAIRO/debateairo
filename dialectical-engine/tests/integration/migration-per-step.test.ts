import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
// Test-only: loadMigrationPlan returns the real plan with its forward chain cut or extended while `chain.shape` is set
// (a database left by the release before 0123, or the real chain plus a probe step). The mocked module instance is the
// one migrate() imports, because migrate comes from the same source module below.
const chain = vi.hoisted(() => ({ shape: undefined as undefined | ((steps: readonly unknown[]) => readonly unknown[]) }));
vi.mock("../../packages/db/src/migration-lineage.js", async (original) => {
  const real = await original<typeof import("../../packages/db/src/migration-lineage.js")>();
  return {
    ...real,
    loadMigrationPlan: async () => {
      const plan = await real.loadMigrationPlan();
      return chain.shape === undefined ? plan : { ...plan, forwardChain: Object.freeze([...chain.shape(plan.forwardChain)]) };
    }
  };
});
import { migrate } from "../../packages/db/src/index.js";
import { loadMigrationPlan } from "../../packages/db/src/migration-lineage.js";
import type { ChainStep } from "../../packages/db/src/migration-forward-chain.js";
import { parseN1Header, type N1Declaration } from "../../packages/db/src/migration-n1.js";
import { seedInstalledAuth106 } from "../support/auth106.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * One transaction per forward step (side-by-side spec 2026-10-21 §5, "Each step runs on its own"; plan A, task A6,
 * Review Focus 1 and 2). migrate() takes the schema-migrations advisory lock for its session, runs a prologue
 * transaction (the base recipe, 0108, 0110, the replay of every applied chain step), then each pending step in its own
 * transaction with SET LOCAL lock_timeout = '2s', five tries, a 2 s pause, then MIGRATION_LOCK_TIMEOUT. CI skips this
 * directory; run it alone.
 */
const SIDE_BY_SIDE = "0123_side_by_side_releases.sql";
const EXPAND: N1Declaration = Object.freeze({ expand: true, drained: false, keepsVerifier: true, outsideTransaction: false, concurrentIndex: null });
/** A later step with constant digests, as forward-chain-replay-verifiers.test.ts builds its probes, plus its n1 header. */
function probe(previous: ChainStep, name: string, sql: string, n1: N1Declaration = EXPAND): ChainStep {
  return Object.freeze({
    name, version: `${name}-v1`, manifestSha256: "f".repeat(64), sourceSha256: "e".repeat(64), sql,
    previousName: previous.name, previousManifestSha256: previous.manifestSha256, previousVerifierSha256: previous.verifierSha256,
    verifierPath: previous.verifierPath, verifierSha256: previous.verifierSha256, verifierSql: previous.verifierSql,
    postconditionEvidence: async () => "d".repeat(64), n1
  });
}
const extendedBy = (make: (last: ChainStep) => ChainStep) => (steps: readonly unknown[]): readonly unknown[] =>
  [...steps, make(steps.at(-1) as ChainStep)];
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

let db: TestDatabase;
const ledger = async (): Promise<string[]> =>
  (await db.pool.query<{ name: string }>("SELECT name FROM public.debateai_schema_migration ORDER BY name")).rows.map((row) => row.name);
const receipts = async (): Promise<string[]> =>
  (await db.pool.query<{ source_name: string }>("SELECT source_name FROM public.debateai_schema_migration_step ORDER BY source_name")).rows.map((row) => row.source_name);
afterEach(() => { chain.shape = undefined; vi.restoreAllMocks(); });

describe("Review Focus 1: a step that fails (or a kill) between steps", () => {
  beforeAll(async () => {
    db = await startTestDatabase();
    // An installed Auth106 database: migrate() records the 0093 compatibility resolution, and a chain step that moves
    // its evidence (0115) re-seals it, so a stale re-seal would be refused by the next run (MIGRATION_RESOLUTION_BINDING_DRIFT).
    await seedInstalledAuth106(db.pool);
  }, 300_000);
  afterAll(async () => { await db?.stop(); });

  it("a failing step leaves every earlier step committed", async () => {
    const real = (await loadMigrationPlan()).forwardChain.map((step) => step.name);
    expect(real).toHaveLength(13);
    chain.shape = extendedBy((last) => probe(last, "0199_probe_fail.sql", "SELECT 1/0"));
    await expect(migrate(db.pool)).rejects.toMatchObject({ code: "22012" });
    chain.shape = undefined;
    // All thirteen real steps were applied by that same run and stay committed; the probe left nothing.
    expect(await receipts()).toEqual(real);
    expect((await db.pool.query("SELECT count(*)::int AS n FROM public.debateai_schema_migration_step")).rows[0].n).toBe(13);
    expect(await ledger()).toEqual(expect.arrayContaining(real));
    expect(await ledger()).not.toContain("0199_probe_fail.sql");
    // The next run continues where the last one stopped: everything replays, nothing is left to apply.
    await migrate(db.pool);
    expect(await receipts()).toEqual(real);
  }, 300_000);
});

describe("Review Focus 2: a page read holding a lock on core.run while 0123's ALTER waits", () => {
  beforeAll(async () => {
    db = await startTestDatabase();
    // The database a release before 0123 leaves: the chain minus its last step.
    chain.shape = (steps) => steps.slice(0, -1);
    try { await migrate(db.pool); } finally { chain.shape = undefined; }
    expect(await ledger()).not.toContain(SIDE_BY_SIDE);
  }, 300_000);
  afterAll(async () => { await db?.stop(); });

  /** A page read: a transaction holding ACCESS SHARE on core.run, as any SELECT does until it ends. */
  async function holdCoreRun(): Promise<PoolClient> {
    const holder = await db.pool.connect();
    await holder.query("BEGIN");
    await holder.query("LOCK TABLE core.run IN ACCESS SHARE MODE");
    return holder;
  }
  /** Resolves once 0123's ALTER TABLE core.run is queued for its lock. */
  async function alterWaiting(): Promise<void> {
    for (let attempt = 0; attempt < 400; attempt += 1) {
      const waiting = (await db.pool.query<{ waiting: boolean }>(
        "SELECT EXISTS(SELECT 1 FROM pg_locks WHERE relation='core.run'::regclass AND mode='AccessExclusiveLock' AND NOT granted) AS waiting")).rows[0]!.waiting;
      if (waiting) return;
      await sleep(25);
    }
    throw new Error("ALTER_NEVER_WAITED");
  }
  const retryLines = (warn: Readonly<{ mock: Readonly<{ calls: readonly (readonly unknown[])[] }> }>): unknown[] =>
    warn.mock.calls.map((call) => call[0]).filter((line) => String(line).startsWith("[MIGRATION_LOCK_RETRY]"));

  it("a held lock: five short waits, then MIGRATION_LOCK_TIMEOUT", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const holder = await holdCoreRun();
    try {
      const started = Date.now();
      const attempt = migrate(db.pool).then(() => "NOT_REFUSED", (error: unknown) => error);
      // A third reader, started 1 s into the attempt and while the ALTER waits, queues behind it for at most one try.
      await sleep(1000);
      await alterWaiting();
      const reader = await db.pool.connect();
      try {
        await reader.query("SET statement_timeout = '3s'");
        expect((await reader.query<{ n: number }>("SELECT count(*)::int AS n FROM core.run")).rows[0]!.n).toBeGreaterThanOrEqual(0);
        await reader.query("RESET statement_timeout");
      } finally { reader.release(); }
      const refusal = await attempt;
      const elapsed = Date.now() - started;
      expect(refusal).toMatchObject({ code: "MIGRATION_LOCK_TIMEOUT", message: `MIGRATION_LOCK_TIMEOUT ${SIDE_BY_SIDE}` });
      // Five 2 s waits and four 2 s pauses.
      expect(elapsed).toBeGreaterThanOrEqual(16_000);
      expect(elapsed).toBeLessThan(40_000);
      expect(retryLines(warn)).toEqual([1, 2, 3, 4].map((n) => `[MIGRATION_LOCK_RETRY] ${SIDE_BY_SIDE} try ${n}/5`));
    } finally {
      await holder.query("ROLLBACK");
      holder.release();
    }
    // Nothing of that step remains: no ledger row, no receipt, no column.
    expect(await ledger()).not.toContain(SIDE_BY_SIDE);
    expect(await receipts()).not.toContain(SIDE_BY_SIDE);
    expect((await db.pool.query("SELECT count(*)::int AS n FROM pg_attribute WHERE attrelid='core.run'::regclass AND attname='release_key'")).rows[0].n).toBe(0);
  }, 120_000);

  it("the step goes through once the lock is released", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const holder = await holdCoreRun();
    let attempt: Promise<void> | undefined;
    try {
      attempt = migrate(db.pool);
      await alterWaiting();
      await sleep(3000);
    } finally {
      await holder.query("ROLLBACK");
      holder.release();
    }
    await attempt;
    expect(await ledger()).toContain(SIDE_BY_SIDE);
    expect(await receipts()).toContain(SIDE_BY_SIDE);
    expect(retryLines(warn)).toContain(`[MIGRATION_LOCK_RETRY] ${SIDE_BY_SIDE} try 1/5`);
  }, 120_000);

  it("an outside-transaction step builds its index concurrently", async () => {
    const name = "0199_probe_concurrent_index.sql";
    const sql = "-- probe (side-by-side §5)\n-- n1: expand\n-- n1: keeps-verifier\n-- n1: outside-transaction\n"
      + "CREATE INDEX CONCURRENTLY IF NOT EXISTS probe_run_seq_idx ON core.run (created_at_seq);\n";
    chain.shape = extendedBy((last) => probe(last, name, sql, parseN1Header(name, sql)));
    const index = async (): Promise<{ oid: string; valid: boolean } | undefined> => (await db.pool.query<{ oid: string; valid: boolean }>(
      "SELECT indexrelid::text AS oid, indisvalid AS valid FROM pg_index WHERE indexrelid=to_regclass('core.probe_run_seq_idx')")).rows[0];
    await migrate(db.pool);
    const built = await index();
    expect(built?.valid).toBe(true);
    expect(await receipts()).toContain(name);
    expect(await ledger()).toContain(name);
    // A build interrupted after its catalog row (an INVALID index left behind) and never recorded: the next run drops
    // the invalid index concurrently, builds it again and records the step.
    await db.pool.query("UPDATE pg_index SET indisvalid=false WHERE indexrelid='core.probe_run_seq_idx'::regclass");
    await db.pool.query("DELETE FROM public.debateai_schema_migration_step WHERE source_name=$1", [name]);
    await db.pool.query("DELETE FROM public.debateai_schema_migration WHERE name=$1", [name]);
    await migrate(db.pool);
    const rebuilt = await index();
    expect(rebuilt?.valid).toBe(true);
    expect(rebuilt?.oid).not.toBe(built?.oid);
    expect(await receipts()).toContain(name);
    expect(await ledger()).toContain(name);
  }, 120_000);
});
