const RUNTIME = "scheduler" as const;
const UNCAUGHT_CONTEXT = Object.freeze({ runtime: RUNTIME, boundary: "uncaught_exception" as const });
const UNHANDLED_CONTEXT = Object.freeze({ runtime: RUNTIME, boundary: "unhandled_rejection" as const });

function captureBoundary(error: unknown, context: typeof UNCAUGHT_CONTEXT | typeof UNHANDLED_CONTEXT): void {
  void import("@debateai/obs-capture")
    .then(({ captureHandled }) => captureHandled(error, context))
    .catch(() => undefined);
}

process.on("uncaughtExceptionMonitor", (error) => captureBoundary(error, UNCAUGHT_CONTEXT));
process.on("unhandledRejection", (reason) => captureBoundary(reason, UNHANDLED_CONTEXT));

export const INSTALLER_RUNTIME = RUNTIME;
export const PROCESS_HANDLERS_INSTALLED = true as const;
