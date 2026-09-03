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

export type FatalExitSink = () => void;

export interface CaptureRuntimeStartOptions {
  readonly runtime: CaptureRuntimeName;
  readonly spoolFd: number | undefined;
  readonly installExitSink: (nextExitSink: FatalExitSink) => void;
}

export interface RuntimeCaptureModule {
  readonly startCaptureRuntime: (
    options: CaptureRuntimeStartOptions,
  ) => void | Promise<void>;
}

export async function startCaptureRuntime(
  options: CaptureRuntimeStartOptions,
): Promise<void> {
  void pg;
  void options;
}

export async function stopCaptureRuntime(
  options: { readonly deadlineMs: number },
): Promise<void> {
  void options;
}

export { readObsBounds, type ObsBounds } from "./config.js";
