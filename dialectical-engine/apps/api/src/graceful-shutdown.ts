import type { FastifyInstance } from "fastify";

const SHUTDOWN_FAILURE_CODE = "API_SHUTDOWN_FAILED" as const;
type ShutdownSignal = "SIGTERM" | "SIGINT";

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
  auditContextHasher.close();
  await argon2Pool.close();

  // The guard exists for the architecture harness, which executes these exact
  // bytes with the original three T1 free identifiers. Production always passes
  // the explicit pool list.
  if (typeof databasePools !== "undefined") await closeDatabasePools(databasePools);
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
}>): Readonly<{ close(reason?: string): Promise<void> }> {
  const shutdownProcess = options.process ?? process;
  const logger = options.logger ?? console;
  let admissionDrain: Promise<void> | undefined;
  let resourceDrain: Promise<void> | undefined;
  let apiClose: Promise<void> | undefined;
  let failureReported = false;
  let signalHandlersInstalled = true;

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
    if (failureReported) return;
    failureReported = true;
    try {
      logger.error(`[API_SHUTDOWN_FAILED] code=${SHUTDOWN_FAILURE_CODE}`);
    } catch {
      // Failure reporting must never replace the generic shutdown failure.
    }
  };

  const signalHandler = (_signal: ShutdownSignal): void => {
    void closeApi().catch(() => undefined);
  };

  const removeSignalHandlers = (): void => {
    if (!signalHandlersInstalled) return;
    signalHandlersInstalled = false;
    shutdownProcess.off("SIGTERM", signalHandler);
    shutdownProcess.off("SIGINT", signalHandler);
  };

  options.api.addHook("preClose", async () => {
    await drainAdmissions().catch((error: unknown) => {
      throw genericShutdownFailure(error);
    });
  });

  options.api.addHook("onClose", async () => {
    resourceDrain ??= drainGracefulShutdownResources(
      lifecycleRegistration,
      options.auditContextHasher,
      options.argon2Pool,
      options.databasePools
    );
    try {
      await resourceDrain;
      removeSignalHandlers();
    } catch (error) {
      reportFailure();
      // Keep signal handlers and all not-yet-closed dependencies alive. A failed
      // durable audit write must never be converted into a successful exit that
      // silently discards the retained aggregate.
      throw genericShutdownFailure(error);
    }
  });

  shutdownProcess.on("SIGTERM", signalHandler);
  shutdownProcess.on("SIGINT", signalHandler);

  function closeApi(): Promise<void> {
    if (apiClose === undefined) {
      apiClose = options.api.close().catch((error: unknown) => {
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
      return closeApi();
    }
  });
}
