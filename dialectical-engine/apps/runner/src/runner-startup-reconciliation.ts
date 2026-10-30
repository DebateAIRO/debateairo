import type { DispatchableWorkItem } from "@debateai/battery";

/**
 * NV-25 (security audit run 3) — A START NEVER REFUSES ON BACKLOG SIZE. The start-up re-send hands this release's open
 * work (READY, or CLAIMED with the claim lapsed) to Hatchet again, at most the oldest `STARTUP_DISPATCH_LIMIT` items;
 * when more are listed it says so in one content-free line and starts anyway. It used to refuse the start, and a
 * refused start under the unit's start limit left the release's runner failed with nothing draining the backlog.
 * Whatever is left over is handed over by the two periodic re-sends in `runner-lapsed-resend.ts`: the lapsed re-send
 * (lapsed claims) and the stale-READY re-send (READY items, each admitted by the run's own daily guard first). A
 * dispatch that fails still refuses the start (RUNNER_STARTUP_REDISPATCH_FAILED).
 */
const STARTUP_DISPATCH_LIMIT = 100;

export class RunnerStartupReconciliationError extends Error {
  constructor(code: string, cause?: unknown) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = "RunnerStartupReconciliationError";
  }
}

export type RunnerStartupReconciliationInput = Readonly<{
  work: Readonly<{
    listDispatchable(limit: number): Promise<readonly DispatchableWorkItem[]>;
  }>;
  dispatcher: Readonly<{
    dispatch(input: DispatchableWorkItem): Promise<void>;
  }>;
  /** NV-25: one content-free line when more open work is listed than one start hands over. */
  log(line: Readonly<Record<string, string | number>>): void;
}>;

export async function reconcileRunnerStartupWork(
  input: RunnerStartupReconciliationInput
): Promise<Readonly<{ dispatched: number }>> {
  const listed = await input.work.listDispatchable(STARTUP_DISPATCH_LIMIT + 1);
  const batch = listed.slice(0, STARTUP_DISPATCH_LIMIT);
  if (listed.length > STARTUP_DISPATCH_LIMIT) {
    input.log(Object.freeze({
      kind: "DEBATEAI_RUNNER_STARTUP",
      event: "RUNNER_STARTUP_BACKLOG_SATURATED",
      listed: listed.length,
      dispatched: batch.length
    }));
  }
  try {
    for (const item of batch) await input.dispatcher.dispatch(item);
  } catch (error) {
    throw new RunnerStartupReconciliationError("RUNNER_STARTUP_REDISPATCH_FAILED", error);
  }
  return Object.freeze({ dispatched: batch.length });
}
