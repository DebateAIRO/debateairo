import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { GenericContainer, Wait, type StartedTestContainer } from "testcontainers";
import { createPool, type Pool } from "@debateai/db";
import { loadBootstrapRegister } from "@debateai/register";

export interface TestDatabase {
  readonly pool: Pool;
  readonly mechanism: "testcontainers" | "embedded-postgres";
  readonly testcontainersStatus: "ACTIVE" | "DEFERRED BY DR-121";
  readonly expectedPostgresMajor: string;
  stop(): Promise<void>;
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
  return {
    pool,
    mechanism: "testcontainers",
    testcontainersStatus: "ACTIVE",
    expectedPostgresMajor: postgresMajor,
    async stop() {
      await pool.end();
      await container.stop();
    }
  };
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
    postgresFlags: ["-c", "shared_memory_type=mmap", "-c", "dynamic_shared_memory_type=mmap"],
    onLog: (message) => console.info(`[S00 DB embedded] ${String(message)}`),
    onError: (message) => console.error(`[S00 DB embedded] ${String(message)}`)
  });
  const policy = selectPrototypeDatabaseMechanism();
  console.info("[S00 DB] Testcontainers DEFERRED BY DR-121; starting real embedded PostgreSQL directly");
  try {
    await embedded.initialise();
    await embedded.start();
    await embedded.createDatabase("debateai_s00");
    const pool = createPool(`postgresql://debateai:debateai-test-only@127.0.0.1:${port}/debateai_s00`);
    await pool.query("SELECT 1");
    return {
      pool,
      mechanism: "embedded-postgres",
      testcontainersStatus: policy.testcontainersStatus,
      expectedPostgresMajor: postgresMajor,
      async stop() {
        await pool.end();
        await embedded.stop();
        await rm(directory, { recursive: true, force: true });
      }
    };
  } catch (error) {
    await embedded.stop().catch(() => undefined);
    await rm(directory, { recursive: true, force: true });
    throw new Error("EMBEDDED_POSTGRES_PROVISIONING_FAILED", { cause: error });
  }
}

export async function startTestDatabase(): Promise<TestDatabase> {
  const bootstrap = await loadBootstrapRegister();
  return startWithEmbedded(bootstrap.values.postgresMajorVersion);
}
