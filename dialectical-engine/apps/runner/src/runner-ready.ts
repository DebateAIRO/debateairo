/**
 * The runner's one readiness message, content-free: the worker name, the register version, the
 * release it runs as and how many jobs its start-up handed over again.
 *
 * Side-by-side uploads spec 2026-10-21 §1: every ready line announces its release key
 * (RELEASE_KEY, `r<register>-<12 hex>`). Every listener checks it: the development supervisor
 * against its API's key, the preview launcher against the plan's register pin and source revision,
 * and the public server's release switch against the release it starts.
 *
 * Three listeners, one message. A development supervisor runs the runner as a child and hears it
 * over IPC (`process.send`, unchanged). The preview launcher
 * (deploy/preview-auth-dev/v1/launch-runner.mjs --start) imports this module in its OWN process,
 * where there is no IPC channel, so it listens for this in-process event instead and only then
 * prints its own content-free PREVIEW_RUNNER_STARTED line (unchanged: the preview's start line).
 * The public server (deploy/vps, side-by-side spec §10) starts the runner directly, with neither:
 * root's release tool reads its start from the unit's journal, so every start also prints the
 * message on stdout as one `DEBATEAI_RUNNER_READY {json}` line (VPS_LAYOUT.startedLines.runner in
 * deploy/preview-lifecycle/v1/common.mjs), as the API prints DEBATEAI_API_READY.
 */
export const RUNNER_READY_PROCESS_EVENT = "debateai:runner-ready" as const;

export type RunnerReadyMessage = Readonly<{
  kind: "DEBATEAI_RUNNER_READY";
  worker: string;
  registerVersion: string;
  releaseKey: string;
  startupDispatched: number;
}>;

export function announceRunnerReady(
  message: RunnerReadyMessage,
  write: (line: string) => void = (line) => { process.stdout.write(line); }
): void {
  const ready = Object.freeze({ ...message });
  write(`DEBATEAI_RUNNER_READY ${JSON.stringify(ready)}\n`);
  (process as NodeJS.EventEmitter).emit(RUNNER_READY_PROCESS_EVENT, ready);
  if (process.send !== undefined) process.send(ready);
}
