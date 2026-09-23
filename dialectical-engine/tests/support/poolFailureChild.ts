import { setTimeout as delay } from "node:timers/promises";
import { createPool, type Pool } from "@debateai/db";

interface ErrorReceipt {
  readonly name: string;
  readonly code: unknown;
  readonly message: string;
}

function errorReceipt(error: unknown): ErrorReceipt {
  return {
    name: error instanceof Error ? error.name : typeof error,
    code: typeof error === "object" && error !== null && "code" in error ? error.code : undefined,
    message: error instanceof Error ? error.message : String(error)
  };
}

async function expectFailure(operation: Promise<unknown>): Promise<ErrorReceipt> {
  try {
    await operation;
    throw new Error("POL03_EXPECTED_DATABASE_FAILURE");
  } catch (error) {
    return errorReceipt(error);
  }
}

async function terminateBackend(pool: Pool, backendPid: number): Promise<void> {
  const result = await pool.query<{ terminated: boolean }>(
    "SELECT pg_terminate_backend($1) AS terminated",
    [backendPid]
  );
  if (result.rows[0]?.terminated !== true) {
    throw new Error("POL03_BACKEND_TERMINATION_FAILED");
  }
}

async function reproduceRealBackendFailure(connectionString: string): Promise<{
  readonly survived: true;
  readonly inFlightError: ErrorReceipt;
  readonly subsequentError: ErrorReceipt;
}> {
  const pool = createPool(connectionString);
  const killer = createPool(connectionString);
  try {
    const activeClient = await pool.connect();
    const activePid = await activeClient.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
    // The rejection handler is attached in the SAME synchronous turn that creates
    // the query promise. Holding the raw promise across the two awaits below left
    // it unhandled for exactly the window in which pg_terminate_backend makes it
    // reject: whenever the victim connection's FATAL was processed in an earlier
    // tick than the killer query's reply, Node reported an unhandled rejection and
    // killed this child before it could write its receipt.
    const inFlight = expectFailure(activeClient.query("SELECT pg_sleep(30)"));
    await delay(50);
    await terminateBackend(killer, activePid.rows[0]!.pid);
    const inFlightError = await inFlight;
    activeClient.release(true);

    const idleClient = await pool.connect();
    const idlePid = await idleClient.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
    idleClient.release();
    await terminateBackend(killer, idlePid.rows[0]!.pid);
    await delay(250);

    const subsequentError = await expectFailure(pool.query("SELECT 1"));
    return { survived: true, inFlightError, subsequentError };
  } finally {
    await Promise.allSettled([pool.end(), killer.end()]);
  }
}

async function reproduceEmittedIdleFailure(): Promise<{
  readonly survived: true;
  readonly subsequentError: ErrorReceipt;
}> {
  const pool = createPool("postgresql://127.0.0.1:1/debateai_pol03");
  pool.emit("error", new Error("POL03_SIMULATED_IDLE_BACKEND_RESET"));
  const subsequentError = await expectFailure(pool.query("SELECT 1"));
  await pool.end();
  return { survived: true, subsequentError };
}

const mode = process.env.POL03_MODE;
const result = mode === "backend"
  ? await reproduceRealBackendFailure(process.env.POL03_DATABASE_URL ?? "")
  : await reproduceEmittedIdleFailure();

process.stdout.write(`POL03_RESULT ${JSON.stringify(result)}\n`);
