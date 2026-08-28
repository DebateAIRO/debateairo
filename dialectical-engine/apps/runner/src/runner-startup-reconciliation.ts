import type { DispatchableWorkItem } from "@debateai/battery";

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
}>;

export async function reconcileRunnerStartupWork(
  input: RunnerStartupReconciliationInput
): Promise<Readonly<{ dispatched: number }>> {
  const dispatchable = await input.work.listDispatchable(STARTUP_DISPATCH_LIMIT + 1);
  if (dispatchable.length > STARTUP_DISPATCH_LIMIT) {
    throw new RunnerStartupReconciliationError("RUNNER_STARTUP_BACKLOG_SATURATED");
  }
  try {
    for (const item of dispatchable) await input.dispatcher.dispatch(item);
  } catch (error) {
    throw new RunnerStartupReconciliationError("RUNNER_STARTUP_REDISPATCH_FAILED", error);
  }
  return Object.freeze({ dispatched: dispatchable.length });
}
