/**
 * Preview practice: the throwaway database.
 *
 * Plain words: a practice debate needs a database, and it must never be the live one. This starts a brand-new
 * PostgreSQL on this computer (the repository's own embedded-postgres, the same program the integration tests use),
 * in a fresh folder under the system temp folder, listening on 127.0.0.1 only, with a random password nobody sees.
 * When the practice ends the server is stopped and the folder deleted, whatever happened.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import EmbeddedPostgres from "embedded-postgres";
import { createPool, type Pool } from "@debateai/db";

/**
 * Every throwaway pool's bound on the wait for a connection (the wait for a free one and the opening of a new one): past
 * it the caller gets the pool's busy failure instead of waiting for ever. Side-by-side spec §13 (S9 review, FINAL-FIX 10):
 * the API's activation-pointer reader the practice's ask builds on the main pool (practice-ask-composition.ts) releases a
 * read only when the driver settles it, so without a bound one connection that never comes would wedge it for good; with
 * it a read settles within this bound plus the reader's query timeout. The live pools wait 5 s
 * (packages/db/src/pool-budget.ts); the practice's pools are smaller (pg's default of 10) and shared by its runner and its
 * ask, so a burst of a debate's parallel writes is given more room before it counts as wedged.
 */
export const PRACTICE_DATABASE_POOL = Object.freeze({ connectionTimeoutMillis: 30 * 1000 });

export type PracticeDatabase = Readonly<{
  pool: Pool;
  /** The database's own name (debateai_practice_ and 8 random hex digits). */
  databaseName: string;
  /** Pools the ask path needs to be distinct objects (the same database, the same throwaway superuser). */
  extraPool: () => Pool;
  stop(): Promise<void>;
}>;

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") { server.close(() => reject(new Error("PRACTICE_DATABASE_PORT_UNRESOLVED"))); return; }
      server.close(() => resolve(address.port));
    });
  });
}

export async function startPracticeDatabase(log: (line: string) => void = () => undefined): Promise<PracticeDatabase> {
  const directory = await mkdtemp(join(tmpdir(), "debateai-practice-pg-"));
  const port = await freePort();
  const password = randomBytes(24).toString("base64url");
  const databaseName = `debateai_practice_${randomBytes(4).toString("hex")}`;
  const embedded = new EmbeddedPostgres({
    databaseDir: join(directory, "data"),
    user: "practice",
    password,
    port,
    persistent: false,
    initdbFlags: ["--encoding=UTF8", "--set=shared_memory_type=mmap", "--set=dynamic_shared_memory_type=mmap"],
    postgresFlags: ["-c", "shared_memory_type=mmap", "-c", "dynamic_shared_memory_type=mmap", "-c", "lc_messages=C",
      "-c", "listen_addresses=127.0.0.1"],
    onLog: () => undefined,
    onError: (message) => log(`practice database: ${String(message).slice(0, 200)}`)
  });
  const pools: Pool[] = [];
  try {
    await embedded.initialise();
    await embedded.start();
    await embedded.createDatabase(databaseName);
    const url = `postgresql://practice:${encodeURIComponent(password)}@127.0.0.1:${String(port)}/${databaseName}`;
    const open = (): Pool => {
      const pool = createPool(url, { connectionTimeoutMillis: PRACTICE_DATABASE_POOL.connectionTimeoutMillis });
      pools.push(pool);
      return pool;
    };
    const pool = open();
    await pool.query("SELECT 1");
    return Object.freeze({
      pool,
      databaseName,
      extraPool: open,
      async stop() {
        await Promise.all(pools.map((each) => each.end().catch(() => undefined)));
        await embedded.stop().catch(() => undefined);
        await rm(directory, { recursive: true, force: true });
      }
    });
  } catch (error) {
    await Promise.all(pools.map((each) => each.end().catch(() => undefined)));
    await embedded.stop().catch(() => undefined);
    await rm(directory, { recursive: true, force: true });
    throw new Error("PRACTICE_DATABASE_START_FAILED", { cause: error });
  }
}
