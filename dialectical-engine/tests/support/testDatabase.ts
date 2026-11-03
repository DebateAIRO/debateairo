import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { GenericContainer, Wait, type StartedTestContainer } from "testcontainers";
import { createPool, type Pool } from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import { loadBootstrapRegister } from "@debateai/register";
import { armSuperuserGuardForTestFile, currentTestFile } from "./master-key-guard.js";

export interface TestDatabase {
  readonly pool: Pool;
  readonly connectionString: string;
  readonly mechanism: "testcontainers" | "embedded-postgres";
  readonly testcontainersStatus: "ACTIVE" | "DEFERRED BY DR-121";
  readonly expectedPostgresMajor: string;
  stop(): Promise<void>;
}

const beforeStopHooks = new WeakMap<object, (() => Promise<void>)[]>();

/**
 * Upload check Task 7: `hook` runs when `database.stop()` is called, before its pool ends and the cluster stops. The
 * logins of tests/support/rls-logins.ts use it to end their own pools, so a file that never ends them itself (a file
 * whose runner the preview harness builds on the runner login) does not leave connections open on a stopping cluster.
 */
export function beforeTestDatabaseStops(database: Pick<TestDatabase, "pool">, hook: () => Promise<void>): void {
  const hooks = beforeStopHooks.get(database) ?? [];
  hooks.push(hook);
  beforeStopHooks.set(database, hooks);
}

/**
 * Runs every hook in turn, the later ones too when one rejects, and never rejects itself: it returns what failed (one
 * error, or an AggregateError for several), or undefined. stop() ends the pool, stops the cluster and removes its
 * folder whatever this returns, and throws the failure only after that.
 */
async function runBeforeStopHooks(database: TestDatabase): Promise<unknown> {
  const failures: unknown[] = [];
  for (const hook of (beforeStopHooks.get(database) ?? []).splice(0)) {
    try {
      await hook();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length === 0) return undefined;
  return failures.length === 1 ? failures[0] : new AggregateError(failures, "TEST_DATABASE_STOP_HOOKS_FAILED");
}

export function createTestAskAdmissionPoolFacades(pool:Pool):Readonly<{
  server:Pool;legacy:Pool;
}> {
  const facade=():Pool => new Proxy(pool,{
    get(target,property) {
      const value=Reflect.get(target,property,target);
      return typeof value==="function" ? value.bind(target) : value;
    }
  });
  return Object.freeze({ server:facade(),legacy:facade() });
}

export function selectPrototypeDatabaseMechanism(): {
  readonly mechanism: "embedded-postgres";
  readonly testcontainersStatus: "DEFERRED BY DR-121";
} {
  return {
    mechanism: "embedded-postgres",
    testcontainersStatus: "DEFERRED BY DR-121"
  };
}

async function reservePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close(() => reject(new Error("TEST_DATABASE_PORT_RESOLUTION_FAILED")));
        return;
      }
      const port = address.port;
      server.close((error) => error === undefined ? resolve(port) : reject(error));
    });
  });
}

async function startWithTestcontainers(postgresMajor: string): Promise<TestDatabase> {
  const container: StartedTestContainer = await new GenericContainer(`postgres:${postgresMajor}`)
    .withEnvironment({
      POSTGRES_DB: "debateai_s00",
      POSTGRES_USER: "debateai",
      POSTGRES_PASSWORD: "debateai-test-only"
    })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/))
    .start();
  const connectionString = `postgresql://debateai:debateai-test-only@${container.getHost()}:${container.getMappedPort(5432)}/debateai_s00`;
  const pool = createPool(connectionString);
  await pool.query("SELECT 1");
  console.info("[S00 DB] Testcontainers ACTIVE: real PostgreSQL container started");
  const database: TestDatabase = {
    pool,
    connectionString,
    mechanism: "testcontainers",
    testcontainersStatus: "ACTIVE",
    expectedPostgresMajor: postgresMajor,
    async stop() {
      const hookFailure = await runBeforeStopHooks(database);
      try {
        await pool.end();
      } finally {
        await container.stop();
      }
      if (hookFailure !== undefined) throw hookFailure;
    }
  };
  return database;
}

/**
 * ★DEBATEAI_TEST_SCHEMA_FROM (test harness only; side-by-side spec 2026-10-21 §5, plan A task A10). The N-1 CI job
 * (.github/workflows/n1-compatibility.yml) runs the released commit's database suites with this set to the HEAD
 * checkout's `dialectical-engine` folder, so every new test database is first migrated by HEAD's own migrate-cli and the
 * old suite's `migrate(pool)` then meets a database migrated ahead (the database-ahead path, A7). The folder comes from
 * the environment at run time; no machine path is written here. Unset, nothing happens. Set to anything other than an
 * absolute folder holding `node_modules/.bin/tsx` and `apps/runner/src/migrate-cli.ts`, it refuses
 * TEST_SCHEMA_FROM_INVALID — a typo must never quietly test the old schema instead.
 */
export const TEST_SCHEMA_FROM_ENV = "DEBATEAI_TEST_SCHEMA_FROM";
const TEST_SCHEMA_FROM_TSX = "node_modules/.bin/tsx";
const TEST_SCHEMA_FROM_CLI = "apps/runner/src/migrate-cli.ts";

function testSchemaFromInvalid(detail: string): TypedDomainError {
  return new TypedDomainError("TEST_SCHEMA_FROM_INVALID", `TEST_SCHEMA_FROM_INVALID: ${detail}`);
}

/** The HEAD folder named by ★DEBATEAI_TEST_SCHEMA_FROM, `undefined` when unset; refuses TEST_SCHEMA_FROM_INVALID otherwise. */
export function resolveTestSchemaFrom(environment: NodeJS.ProcessEnv = process.env): string | undefined {
  const folder = environment[TEST_SCHEMA_FROM_ENV];
  if (folder === undefined) return undefined;
  if (folder === "" || !isAbsolute(folder)) throw testSchemaFromInvalid(`${TEST_SCHEMA_FROM_ENV} must be an absolute folder`);
  const isFile = (path: string): boolean => existsSync(path) && statSync(path).isFile();
  if (!isFile(join(folder, TEST_SCHEMA_FROM_TSX)) || !isFile(join(folder, TEST_SCHEMA_FROM_CLI))) {
    throw testSchemaFromInvalid(`${TEST_SCHEMA_FROM_ENV} holds no ${TEST_SCHEMA_FROM_TSX} and ${TEST_SCHEMA_FROM_CLI}`);
  }
  return folder;
}

/**
 * Migrate the fresh database at `connectionString` with the HEAD folder's migrate-cli and wait for exit 0 (the hook
 * runs after `createDatabase`, before the suite's own migrate). Does nothing when the variable is unset.
 */
export async function applyTestSchemaFrom(
  connectionString: string,
  environment: NodeJS.ProcessEnv = process.env
): Promise<void> {
  const folder = resolveTestSchemaFrom(environment);
  if (folder === undefined) return;
  const exit = await new Promise<number | string>((resolveExit) => {
    const child = spawn(join(folder, TEST_SCHEMA_FROM_TSX), [TEST_SCHEMA_FROM_CLI], {
      cwd: folder,
      env: { ...environment, MIGRATION_DATABASE_URL: connectionString },
      stdio: ["ignore", "inherit", "inherit"],
      shell: false
    });
    child.once("error", () => resolveExit("spawn failed"));
    child.once("close", (code, signal) => resolveExit(code ?? signal ?? "no exit code"));
  });
  if (exit !== 0) throw testSchemaFromInvalid(`HEAD migrate-cli exited ${String(exit)}`);
  console.info(`[S00 DB] ${TEST_SCHEMA_FROM_ENV}: database migrated by HEAD migrate-cli`);
}

async function startWithEmbedded(postgresMajor: string): Promise<TestDatabase> {
  const directory = await mkdtemp(join(tmpdir(), "debateai-s00-postgres-"));
  const port = await reservePort();
  const embedded = new EmbeddedPostgres({
    databaseDir: join(directory, "data"),
    user: "debateai",
    password: "debateai-test-only",
    port,
    persistent: false,
    initdbFlags: [
      "--encoding=UTF8",
      "--set=shared_memory_type=mmap",
      "--set=dynamic_shared_memory_type=mmap"
    ],
    postgresFlags: [
      "-c", "shared_memory_type=mmap",
      "-c", "dynamic_shared_memory_type=mmap",
      "-c", "lc_messages=C"
    ],
    onLog: (message) => console.info(`[S00 DB embedded] ${String(message)}`),
    onError: (message) => console.error(`[S00 DB embedded] ${String(message)}`)
  });
  const policy = selectPrototypeDatabaseMechanism();
  console.info("[S00 DB] Testcontainers DEFERRED BY DR-121; starting real embedded PostgreSQL directly");
  try {
    await embedded.initialise();
    await embedded.start();
    await embedded.createDatabase("debateai_s00");
    const connectionString = `postgresql://debateai:debateai-test-only@127.0.0.1:${port}/debateai_s00`;
    await applyTestSchemaFrom(connectionString);
    const pool = createPool(connectionString);
    await pool.query("SELECT 1");
    const database: TestDatabase = {
      pool,
      connectionString,
      mechanism: "embedded-postgres",
      testcontainersStatus: policy.testcontainersStatus,
      expectedPostgresMajor: postgresMajor,
      async stop() {
        // A rejecting hook must not leave the pool, the cluster or its folder behind: they go first, then it is thrown.
        const hookFailure = await runBeforeStopHooks(database);
        try {
          await pool.end();
        } finally {
          try {
            await embedded.stop();
          } finally {
            await rm(directory, { recursive: true, force: true });
          }
        }
        if (hookFailure !== undefined) throw hookFailure;
      }
    };
    return database;
  } catch (error) {
    await embedded.stop().catch(() => undefined);
    await rm(directory, { recursive: true, force: true });
    if (error instanceof TypedDomainError && error.code === "TEST_SCHEMA_FROM_INVALID") throw error;
    throw new Error("EMBEDDED_POSTGRES_PROVISIONING_FAILED", { cause: error });
  }
}

/**
 * Starts a fresh embedded PostgreSQL cluster for one test file. Upload check Task 8: it also arms the R21 master-key
 * guard (tests/support/master-key-guard.ts) for the test file that started it, so in login mode (the default) a query
 * on this database's superuser inside a request is refused, unless that file is on tests/support/master-key-files.txt.
 * Seeding, read-backs and the runner run outside any request and are not touched.
 */
export async function startTestDatabase(): Promise<TestDatabase> {
  // Read before the first wait, while the calling test file is still on the stack (the stack is only the fallback).
  const testFile = currentTestFile();
  // A10: a bad ★DEBATEAI_TEST_SCHEMA_FROM refuses before a cluster is spent on it.
  resolveTestSchemaFrom();
  const bootstrap = await loadBootstrapRegister();
  const database = await startWithEmbedded(bootstrap.values.postgresMajorVersion);
  armSuperuserGuardForTestFile(database.connectionString, testFile);
  return database;
}
