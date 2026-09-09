import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ObservationError } from "../core/errors.js";
import {
  renderImpact,
  signalSchema,
  type ObservationSignal
} from "../core/signals.js";
import type { DeliveryExecutionResult } from "./delivery.js";

export type OsaScriptExecutor = (
  file: string,
  args: readonly string[],
  timeoutMs: number
) => Promise<void>;

export type OsaScriptDeliveryExecutor = (
  signal: ObservationSignal,
  now: Date,
  timeoutMs: number
) => Promise<DeliveryExecutionResult>;

const execFileAsync = promisify(execFile);

function appleScriptString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

async function executeOsaScript(
  file: string,
  args: readonly string[],
  timeoutMs: number
): Promise<void> {
  await execFileAsync(file, args, {
    timeout: timeoutMs,
    encoding: "utf8",
    maxBuffer: 16 * 1024
  });
}

export function createOsaScriptDeliveryExecutor(
  execute: OsaScriptExecutor = executeOsaScript
): OsaScriptDeliveryExecutor {
  return async (input, now, timeoutMs) => {
    const signal = signalSchema.safeParse(input);
    if (!signal.success
      || !(now instanceof Date)
      || !Number.isFinite(now.getTime())
      || !Number.isFinite(timeoutMs)
      || timeoutMs <= 0) {
      throw new ObservationError("OBSERVATION_DELIVERY_ACTION_INVALID");
    }
    const impact = renderImpact(signal.data);
    const titleSeverity = signal.data.state === "CLEARED" ? "CLEARED" : signal.data.severity;
    const expression = `display notification "${appleScriptString(impact)}" with title "${appleScriptString(`dialectical-engine: ${signal.data.component} ${titleSeverity}`)}" subtitle "${appleScriptString(signal.data.class)}"`;
    await execute("/usr/bin/osascript", ["-e", expression], timeoutMs);
    return Object.freeze({ deliveredAt: now, externalRef: null });
  };
}
