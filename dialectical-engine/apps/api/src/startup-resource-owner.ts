import { installGracefulShutdown } from "./graceful-shutdown.js";

const STARTUP_CLEANUP_FAILURE_CODE = "API_STARTUP_CLEANUP_FAILED" as const;

export class StartupResourceCleanupError extends Error {
  readonly code = STARTUP_CLEANUP_FAILURE_CODE;

  constructor(
    primaryFailure: unknown,
    readonly cleanupFailure: unknown
  ) {
    super(STARTUP_CLEANUP_FAILURE_CODE, { cause: primaryFailure });
    this.name = "StartupResourceCleanupError";
  }
}

/**
 * Transfers the complete pre-listen graph to the established graceful-shutdown
 * lifecycle before any startup assertion can reject. The wrapper only binds
 * startup failures to that lifecycle; it does not implement a second cleanup
 * order.
 */
export function installStartupResourceOwner(
  options: Parameters<typeof installGracefulShutdown>[0]
): Readonly<{
  close(reason?: string): Promise<void>;
  run<T>(stage: string, operation: () => Promise<T>): Promise<T>;
}> {
  const shutdown = installGracefulShutdown(options);
  return Object.freeze({
    close(reason = "api.close"): Promise<void> {
      return shutdown.close(reason);
    },
    async run<T>(stage: string, operation: () => Promise<T>): Promise<T> {
      try {
        return await operation();
      } catch (primaryFailure) {
        try {
          await shutdown.close(`startup-failure:${stage}`);
        } catch (cleanupFailure) {
          throw new StartupResourceCleanupError(primaryFailure, cleanupFailure);
        }
        throw primaryFailure;
      }
    }
  });
}
