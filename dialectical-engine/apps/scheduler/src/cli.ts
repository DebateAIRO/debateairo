import { cancelScheduledCaptureRuntimeStart } from "@debateai/obs-capture/install/scheduler";
import { createPool } from "@debateai/db";
import {
  loadLivenessEnvironment,
  loadReplaySelfTestEnvironment,
  loadSettlementEnvironment,
} from "@debateai/register";
import {
  runJobWithLifecycle,
  runLivenessSweep,
  runReplaySelfTest,
  runSettlementWatch,
  type SchedulerJobName,
} from "./index.js";

interface SchedulerRuntimeModule {
  readonly waitForCaptureEmitterInstalled: (options: {
    readonly deadlineMs: number;
  }) => Promise<"installed" | "start_failed" | "stopped" | "timed_out">;
  readonly stopCaptureRuntime: (options: {
    readonly deadlineMs: number;
  }) => Promise<void>;
}

function remaining(deadline: number): number {
  return Math.max(0, deadline - performance.now());
}

async function loadRuntimeBefore(
  runtimePromise: Promise<SchedulerRuntimeModule | undefined>,
  deadline: number,
): Promise<SchedulerRuntimeModule | undefined> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      runtimePromise,
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), remaining(deadline));
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function schedulerCommand(value: string | undefined): SchedulerJobName {
  if (
    value !== "replay-self-test"
    && value !== "liveness-sweep"
    && value !== "settlement-watch"
  ) {
    throw new Error(`Unknown scheduler command: ${String(value)}`);
  }
  return value;
}

let pool: ReturnType<typeof createPool> | undefined;
let runtimeModule: SchedulerRuntimeModule | undefined;
let deadline: number | undefined;

try {
  const command = schedulerCommand(process.argv[2]);
  const databaseUrl = command === "replay-self-test"
    ? loadReplaySelfTestEnvironment().REPLAY_SELF_TEST_DATABASE_URL
    : command === "liveness-sweep"
      ? loadLivenessEnvironment().LIVENESS_DATABASE_URL
      : loadSettlementEnvironment().SETTLEMENT_DATABASE_URL;
  deadline = performance.now() + 5_000;
  const runtimePromise = (import("@debateai/obs-capture/runtime") as Promise<SchedulerRuntimeModule>)
    .catch(() => undefined);
  pool = createPool(databaseUrl);
  runtimeModule = await loadRuntimeBefore(runtimePromise, deadline);
  let lifecycleReady = false;
  if (runtimeModule !== undefined) {
    try {
      lifecycleReady = await runtimeModule.waitForCaptureEmitterInstalled({
        deadlineMs: remaining(deadline),
      }) === "installed";
    } catch {
      lifecycleReady = false;
    }
  }

  const report = command === "replay-self-test"
    ? await (lifecycleReady
      ? runJobWithLifecycle(command, () => runReplaySelfTest(pool!))
      : runReplaySelfTest(pool))
    : command === "liveness-sweep"
      ? await (lifecycleReady
        ? runJobWithLifecycle(command, () => runLivenessSweep(pool!))
        : runLivenessSweep(pool))
      : await (lifecycleReady
        ? runJobWithLifecycle(command, () => runSettlementWatch(pool!))
        : runSettlementWatch(pool));
  console.log(JSON.stringify(report, null, 2));
} finally {
  cancelScheduledCaptureRuntimeStart();
  if (runtimeModule !== undefined && deadline !== undefined) {
    await runtimeModule.stopCaptureRuntime({
      deadlineMs: remaining(deadline),
    }).catch(() => undefined);
  }
  if (pool !== undefined) await pool.end();
}
