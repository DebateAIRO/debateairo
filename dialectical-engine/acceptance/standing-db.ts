import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import { createPool, migrate, type Pool } from "@debateai/db";

const DEFAULT_DATA_DIRECTORY = fileURLToPath(new URL("./.pgdata", import.meta.url));
const DATABASE_USER = "debateai";
const DATABASE_PASSWORD = "debateai-acceptance-local";
const DATABASE_NAME = "debateai_acceptance";

export interface StandingDatabaseOptions {
  readonly port: number;
  readonly dataDirectory?: string;
}

export interface StandingDatabase {
  readonly pool: Pool;
  readonly connectionString: string;
  readonly reused: boolean;
  stop(): Promise<void>;
}

async function isInitialised(dataDirectory: string): Promise<boolean> {
  try {
    await access(`${dataDirectory}/PG_VERSION`);
    return true;
  } catch {
    return false;
  }
}

export async function startStandingDatabase(options: StandingDatabaseOptions): Promise<StandingDatabase> {
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65_535) {
    throw new TypeError("ACCEPTANCE_DATABASE_PORT_INVALID");
  }
  const dataDirectory = options.dataDirectory ?? DEFAULT_DATA_DIRECTORY;
  const connectionString = `postgresql://${DATABASE_USER}:${DATABASE_PASSWORD}@127.0.0.1:${options.port}/${DATABASE_NAME}`;
  const existingPool = createPool(connectionString);
  let alreadyRunning = false;
  try {
    await existingPool.query("SELECT 1");
    alreadyRunning = true;
  } catch {
    await existingPool.end().catch(() => undefined);
  }
  if (alreadyRunning) {
    // A reachable standing server is authoritative. Migration failures remain loud;
    // they must not be obscured by attempting a second server on the occupied port.
    await migrate(existingPool);
    return {
      pool: existingPool,
      connectionString,
      reused: true,
      async stop() { await existingPool.end(); }
    };
  }

  const embedded = new EmbeddedPostgres({
    databaseDir: dataDirectory,
    user: DATABASE_USER,
    password: DATABASE_PASSWORD,
    port: options.port,
    persistent: true,
    initdbFlags: [
      "--encoding=UTF8",
      "--set=shared_memory_type=mmap",
      "--set=dynamic_shared_memory_type=mmap"
    ],
    postgresFlags: ["-c", "shared_memory_type=mmap", "-c", "dynamic_shared_memory_type=mmap"],
    onLog: (message) => console.info(`[ACC-01 DB] ${String(message)}`),
    onError: (message) => console.error(`[ACC-01 DB] ${String(message)}`)
  });
  let pool: Pool | null = null;
  try {
    if (!await isInitialised(dataDirectory)) await embedded.initialise();
    await embedded.start();
    const catalog = embedded.getPgClient("postgres", "127.0.0.1");
    await catalog.connect();
    const present = await catalog.query("SELECT 1 FROM pg_database WHERE datname=$1", [DATABASE_NAME]);
    await catalog.end();
    if (present.rowCount === 0) await embedded.createDatabase(DATABASE_NAME);
    pool = createPool(connectionString);
    await pool.query("SELECT 1");
    await migrate(pool);
    const livePool = pool;
    return {
      pool: livePool,
      connectionString,
      reused: false,
      async stop() {
        await livePool.end();
        await embedded.stop();
      }
    };
  } catch (error) {
    await pool?.end().catch(() => undefined);
    await embedded.stop().catch(() => undefined);
    throw new Error("ACCEPTANCE_POSTGRES_PROVISIONING_FAILED", { cause: error });
  }
}
