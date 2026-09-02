import type { FastifyInstance } from "fastify";

const SHUTDOWN_FAILURE_CODE = "API_SHUTDOWN_FAILED" as const;
const SHUTDOWN_DEADLINE_CODE = "API_SHUTDOWN_DEADLINE_EXCEEDED" as const;
const SHUTDOWN_ESCALATION_CODE = "API_SHUTDOWN_SIGNAL_ESCALATED" as const;

/**
 * Overall drain deadline. A drain that cannot finish (an unreachable database
 * makes `pool.end()` and the audit flush wait forever) must not turn every
 * further SIGTERM into a no-op: at the deadline the resources are force-closed
 * and the process exits 1 with one structured line (L7-F6).
 */
export const SHUTDOWN_DEADLINE_MS = 20_000;

/**
 * Signals inside this window of the first one belong to the same request and
 * coalesce into one teardown. A later signal is the operator asking again, and
 * escalates immediately.
 */
export const SHUTDOWN_ESCALATION_GRACE_MS = 1_000;

// SIGHUP included: closing the terminal window must drain, not kill silently.
type ShutdownSignal = "SIGTERM" | "SIGINT" | "SIGHUP";

export interface GracefulShutdownRegistration {
  drainRegistrationAdmissions(): Promise<void>;
  drainMailDispatches(): Promise<void>;
  drainMailCapacitySignals(): void;
  drainRateLimitAuditFlushes(): Promise<void>;
}

interface ClosableAuditContextHasher {
  close(): void;
}

interface ClosableArgon2Pool {
  close(): Promise<void>;
}

interface ClosableDatabasePool {
  end(): Promise<void>;
}

interface ShutdownProcess {
  exitCode: number | undefined;
  exit(code: number): unknown;
  on(event: ShutdownSignal, listener: (signal: ShutdownSignal) => void): unknown;
  off(event: ShutdownSignal, listener: (signal: ShutdownSignal) => void): unknown;
}

interface ShutdownLogger {
  error(message: string): unknown;
}

export class GracefulShutdownError extends Error {
  readonly code = SHUTDOWN_FAILURE_CODE;

  constructor(cause: unknown) {
    super(SHUTDOWN_FAILURE_CODE, { cause });
    this.name = "GracefulShutdownError";
  }
}

function genericShutdownFailure(error: unknown): GracefulShutdownError {
  return error instanceof GracefulShutdownError ? error : new GracefulShutdownError(error);
}

async function closeDatabasePools(databasePools: readonly ClosableDatabasePool[]): Promise<void> {
  let firstFailure: unknown;
  let failed = false;
  // Pools are independent. One failed `end` must not leak every pool after it.
  for (const pool of databasePools) {
    await pool.end().catch((error: unknown) => {
      if (!failed) {
        failed = true;
        firstFailure = error;
      }
    });
  }
  if (failed) throw firstFailure;
}

/**
 * The resource half of shutdown, exported as one indivisible order contract so
 * architecture tests exercise the same implementation that production invokes.
 */
export async function drainGracefulShutdownResources(
  registration: GracefulShutdownRegistration,
  auditContextHasher: ClosableAuditContextHasher,
  argon2Pool: ClosableArgon2Pool,
  databasePools: readonly ClosableDatabasePool[] = []
): Promise<void> {
  // This is a cached join in production because `preClose` already started it.
  // Keeping it in the indivisible order contract makes the resource primitive
  // safe to execute and verify independently as well.
  await registration.drainRegistrationAdmissions();
  // Reservations and sends are both represented in this join. T1 made the
  // admission release happen only after a reservation continuation has handed
  // its hold into this set, so nothing can appear behind the drain.
  await registration.drainMailDispatches();
  registration.drainMailCapacitySignals();
  // This call synchronously fires every active unref'd aggregation timer and
  // then awaits the shared route writer. Never wait for the timer itself.
  await registration.drainRateLimitAuditFlushes();
  let firstCloseFailure;
  let closeFailed = false;
  try {
    auditContextHasher.close();
  } catch (error) {
    closeFailed = true;
    firstCloseFailure = error;
  }
  try {
    await argon2Pool.close();
  } catch (error) {
    if (!closeFailed) firstCloseFailure = error;
    closeFailed = true;
  }

  // The guard exists for the architecture harness, which executes these exact
  // bytes with the original three T1 free identifiers. Production always passes
  // the explicit pool list.
  if (typeof databasePools !== "undefined") {
    try {
      await closeDatabasePools(databasePools);
    } catch (error) {
      if (!closeFailed) firstCloseFailure = error;
      closeFailed = true;
    }
  }
  if (closeFailed) throw firstCloseFailure;
}

/**
 * Installs the one process-owned shutdown lifecycle.
 *
 * Fastify marks its router closed before `preClose`, so no new request can enter
 * by the time admission is closed here. `preClose` then joins every registration
 * that may still create deferred work. Fastify next waits for all other active
 * HTTP handlers before `onClose` force-finalizes and durably drains that work.
 * Only after those evidence/mail joins succeed may secret-bearing hashing state,
 * workers, and database handles be destroyed.
 */
export function installGracefulShutdown(options: Readonly<{
  api: FastifyInstance;
  registration: GracefulShutdownRegistration;
  auditContextHasher: ClosableAuditContextHasher;
  argon2Pool: ClosableArgon2Pool;
  databasePools: readonly ClosableDatabasePool[];
  process?: ShutdownProcess;
  logger?: ShutdownLogger;
  deadlineMs?: number;
  escalationGraceMs?: number;
}>): Readonly<{ close(reason?: string): Promise<void> }> {
  const shutdownProcess = options.process ?? process;
  const logger = options.logger ?? console;
  const deadlineMs = options.deadlineMs ?? SHUTDOWN_DEADLINE_MS;
  const escalationGraceMs = options.escalationGraceMs ?? SHUTDOWN_ESCALATION_GRACE_MS;
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  let firstSignalAt: number | undefined;
  let shutdownFailed = false;
  let admissionDrain: Promise<void> | undefined;
  let resourceDrain: Promise<void> | undefined;
  let apiClose: Promise<void> | undefined;
  let fastifyCloseFailed = false;
  let resourcesClosed = false;
  let resourceFailureCount = 0;
  let failureReported = false;
  let signalHandlersInstalled = true;
  let terminationRequested = false;

  const drainAdmissions = (): Promise<void> => {
    admissionDrain ??= options.registration.drainRegistrationAdmissions();
    return admissionDrain;
  };
  const lifecycleRegistration: GracefulShutdownRegistration = {
    drainRegistrationAdmissions: drainAdmissions,
    drainMailDispatches: () => options.registration.drainMailDispatches(),
    drainMailCapacitySignals: () => options.registration.drainMailCapacitySignals(),
    drainRateLimitAuditFlushes: () => options.registration.drainRateLimitAuditFlushes()
  };

  const reportFailure = (): void => {
    shutdownProcess.exitCode = 1;
    shutdownFailed = true;
    if (failureReported) return;
    failureReported = true;
    try {
      logger.error(`[API_SHUTDOWN_FAILED] code=${SHUTDOWN_FAILURE_CODE}`);
    } catch {
      // Failure reporting must never replace the generic shutdown failure.
    }
  };

  const clearDeadline = (): void => {
    if (deadlineTimer === undefined) return;
    clearTimeout(deadlineTimer);
    deadlineTimer = undefined;
  };

  const removeSignalHandlers = (): void => {
    clearDeadline();
    if (!signalHandlersInstalled) return;
    signalHandlersInstalled = false;
    shutdownProcess.off("SIGTERM", signalHandler);
    shutdownProcess.off("SIGINT", signalHandler);
    shutdownProcess.off("SIGHUP", signalHandler);
  };

  // Best effort, synchronous starts only: the process is about to exit, so this
  // is the last chance for a worker or a pool to release its handles.
  const forceCloseResources = (): void => {
    if (resourcesClosed) return;
    try {
      options.auditContextHasher.close();
    } catch {
      // A forced close never replaces the deadline report.
    }
    try {
      void options.argon2Pool.close().catch(() => undefined);
    } catch {
      // As above.
    }
    for (const pool of options.databasePools) {
      try {
        void pool.end().catch(() => undefined);
      } catch {
        // As above.
      }
    }
  };

  const escalate = (code: string): void => {
    if (terminationRequested) return;
    terminationRequested = true;
    clearDeadline();
    shutdownProcess.exitCode = 1;
    try {
      logger.error(`[${SHUTDOWN_FAILURE_CODE}] code=${code}`);
    } catch {
      // Failure reporting must never replace the exit.
    }
    failureReported = true;
    forceCloseResources();
    try {
      shutdownProcess.exit(1);
    } catch {
      // Real process.exit does not return; test shims may throw.
    }
  };

  const armDeadline = (): void => {
    if (deadlineTimer !== undefined || resourcesClosed || terminationRequested) return;
    deadlineTimer = setTimeout(() => {
      deadlineTimer = undefined;
      if (resourcesClosed) return;
      escalate(SHUTDOWN_DEADLINE_CODE);
    }, deadlineMs);
    deadlineTimer.unref?.();
  };

  const drainResources = (): Promise<void> => {
    if (resourcesClosed) return Promise.resolve();
    if (resourceDrain !== undefined) return resourceDrain;

    const attempt = drainGracefulShutdownResources(
      lifecycleRegistration,
      options.auditContextHasher,
      options.argon2Pool,
      options.databasePools
    ).then(() => {
      resourcesClosed = true;
      removeSignalHandlers();
    }, (error: unknown) => {
      resourceFailureCount += 1;
      reportFailure();
      throw genericShutdownFailure(error);
    }).finally(() => {
      // A failed audit flush retains its aggregate. Do not make that failure
      // sticky: a later signal/controller close must be able to write it.
      if (!resourcesClosed && resourceDrain === attempt) resourceDrain = undefined;
    });
    resourceDrain = attempt;
    // Signal callbacks cannot await; always attach an observer at creation.
    attempt.catch(() => undefined);
    return attempt;
  };

  const terminateAfterRepeatedSignalFailure = (): void => {
    if (resourceFailureCount < 2 || terminationRequested) return;
    terminationRequested = true;
    try {
      shutdownProcess.exit(1);
    } catch {
      // Real process.exit does not return. Test/process shims may throw; the
      // signal callback must still not create an unhandled rejection.
    }
  };

  const signalHandler = (_signal: ShutdownSignal): void => {
    const now = Date.now();
    if (firstSignalAt === undefined) {
      firstSignalAt = now;
    } else if (!resourcesClosed && !shutdownFailed && now - firstSignalAt >= escalationGraceMs) {
      // A drain that already failed keeps its own retry contract: a repeated
      // signal there must re-attempt the durable write, not discard it.
      escalate(SHUTDOWN_ESCALATION_CODE);
      return;
    }
    armDeadline();
    void closeApi().catch(() => {
      terminateAfterRepeatedSignalFailure();
    });
  };

  options.api.addHook("preClose", async () => {
    armDeadline();
    await drainAdmissions().catch((error: unknown) => {
      throw genericShutdownFailure(error);
    });
  });

  options.api.addHook("onClose", async () => {
    try {
      await drainResources();
    } catch (error) {
      fastifyCloseFailed = true;
      // Keep signal handlers and all not-yet-closed dependencies alive. A failed
      // durable audit write must never be converted into a successful exit that
      // silently discards the retained aggregate.
      throw genericShutdownFailure(error);
    }
  });

  shutdownProcess.on("SIGTERM", signalHandler);
  shutdownProcess.on("SIGINT", signalHandler);
  shutdownProcess.on("SIGHUP", signalHandler);

  function closeApi(): Promise<void> {
    if (resourcesClosed) return Promise.resolve();
    // Fastify caches a rejected close. Once its hook graph has failed, retry the
    // resource half directly rather than joining that permanently rejected join.
    if (fastifyCloseFailed) return drainResources();
    if (apiClose === undefined) {
      apiClose = options.api.close().catch((error: unknown) => {
        fastifyCloseFailed = true;
        reportFailure();
        throw genericShutdownFailure(error);
      });
      // A signal callback cannot await. The returned promise still rejects for
      // explicit callers, while this observer prevents an unhandled rejection.
      apiClose.catch(() => undefined);
    }
    return apiClose;
  }

  return Object.freeze({
    close(_reason = "api.close"): Promise<void> {
      armDeadline();
      return closeApi();
    }
  });
}
