/**
 * The runner's one readiness message, content-free: the worker name, the register version
 * and how many jobs its start-up handed over again.
 *
 * Two listeners, one message. A development supervisor runs the runner as a child and hears it
 * over IPC (`process.send`, unchanged). The preview launcher
 * (deploy/preview-auth-dev/v1/launch-runner.mjs --start) imports this module in its OWN process,
 * where there is no IPC channel, so it listens for this in-process event instead and only then
 * prints its own content-free PREVIEW_RUNNER_STARTED line.
 */
export const RUNNER_READY_PROCESS_EVENT = "debateai:runner-ready" as const;

export type RunnerReadyMessage = Readonly<{
  kind: "DEBATEAI_RUNNER_READY";
  worker: string;
  registerVersion: string;
  startupDispatched: number;
}>;

export function announceRunnerReady(message: RunnerReadyMessage): void {
  const ready = Object.freeze({ ...message });
  (process as NodeJS.EventEmitter).emit(RUNNER_READY_PROCESS_EVENT, ready);
  if (process.send !== undefined) process.send(ready);
}
