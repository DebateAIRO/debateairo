import pg from "pg";

export type CaptureRuntimeName =
  | "api"
  | "runner"
  | "scheduler"
  | "evaluator-lib"
  | "ui-client"
  | "listener"
  | "watchdog"
  | "ingest";

type FatalExitSink = () => void;

export interface CaptureRuntimeHandle {
  readonly runtime: CaptureRuntimeName;
}

export async function startCaptureRuntime(options: {
  readonly runtime: CaptureRuntimeName;
  readonly spoolFd: number | undefined;
  readonly installExitSink: (nextExitSink: FatalExitSink) => void;
}): Promise<CaptureRuntimeHandle> {
  void pg;
  return Object.freeze({ runtime: options.runtime });
}

export async function stopCaptureRuntime(
  _handle: CaptureRuntimeHandle,
  _options: { readonly deadlineMs: number },
): Promise<void> {}

export { readObsBounds, type ObsBounds } from "./config.js";
