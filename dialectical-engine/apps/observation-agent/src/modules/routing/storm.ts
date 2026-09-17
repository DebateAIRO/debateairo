import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ObservationError } from "../../core/errors.js";
import type { ObservationSignal } from "../../core/signals.js";
import type { ObservationComponent } from "../../core/types.js";
import type { DeliveryExecutionResult } from "../../notify/delivery.js";

export const STORM_ROOT_ORDER = Object.freeze([
  "docker", "postgres", "hatchet", "api", "ui", "tls_front_door"
] as const satisfies readonly ObservationComponent[]);

export type StormComponent = typeof STORM_ROOT_ORDER[number];
export type DetectedStorm = Readonly<{
  rootComponent: StormComponent;
  memberSignalIds: readonly string[];
  windowStartedAt: string;
  windowEndsAt: string;
  fifthDetectedAt: string;
}>;
export type StormSummaryExecutor = (
  root: StormComponent,
  count: number,
  now: Date
) => Promise<DeliveryExecutionResult>;
export type StormOsaScriptExecutor = (
  file: string,
  args: readonly string[],
  timeoutMs: number
) => Promise<void>;

const execFileAsync = promisify(execFile);
const ROOTS = new Set<ObservationComponent>(STORM_ROOT_ORDER);

export function isStormComponent(component: ObservationComponent): component is StormComponent {
  return ROOTS.has(component);
}

export function detectStorm(
  signals: readonly ObservationSignal[],
  policy: Readonly<{ count: number; windowSeconds: number }>
): DetectedStorm | null {
  if (!Number.isInteger(policy.count) || policy.count < 2
    || !Number.isInteger(policy.windowSeconds) || policy.windowSeconds <= 0) {
    throw new ObservationError("OBSERVATION_STORM_POLICY_INVALID");
  }
  const qualifying = signals
    .filter((signal) => signal.state === "OPEN" && isStormComponent(signal.component))
    .sort((left, right) => Date.parse(left.detected_at) - Date.parse(right.detected_at)
      || left.seq - right.seq
      || left.signal_id.localeCompare(right.signal_id));
  if (qualifying.length < policy.count) return null;
  const members = qualifying.slice(-policy.count);
  const first = members[0]!;
  const fifth = members[policy.count - 1]!;
  if (Date.parse(fifth.detected_at) - Date.parse(first.detected_at) > policy.windowSeconds * 1_000) {
    return null;
  }
  const rootComponent = STORM_ROOT_ORDER.find((component) =>
    members.some((signal) => signal.component === component));
  if (rootComponent === undefined) return null;
  return Object.freeze({
    rootComponent,
    memberSignalIds: Object.freeze(members.map((signal) => signal.signal_id)),
    windowStartedAt: first.detected_at,
    windowEndsAt: new Date(Date.parse(first.detected_at) + policy.windowSeconds * 1_000).toISOString(),
    fifthDetectedAt: fifth.detected_at
  });
}

function appleScriptString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

async function executeStormOsaScript(
  file: string,
  args: readonly string[],
  timeoutMs: number
): Promise<void> {
  await execFileAsync(file, [...args], {
    timeout: timeoutMs,
    encoding: "utf8",
    maxBuffer: 16 * 1024,
    env: { PATH: "/usr/bin:/bin" }
  });
}

export function createStormSummaryExecutor(
  execute: StormOsaScriptExecutor = executeStormOsaScript,
  timeoutMs = 2_000
): StormSummaryExecutor {
  return async (root, count, now) => {
    if (!isStormComponent(root) || !Number.isInteger(count) || count < 5
      || !(now instanceof Date) || !Number.isFinite(now.getTime())
      || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new ObservationError("OBSERVATION_STORM_SUMMARY_INVALID");
    }
    const copy = `Storm root ${root}; ${count} signals.`;
    const expression = `display notification "${appleScriptString(copy)}" with title "dialectical-engine: signal storm" subtitle "${appleScriptString(root)} root"`;
    await execute("/usr/bin/osascript", ["-e", expression], timeoutMs);
    return Object.freeze({ deliveredAt: now, externalRef: null });
  };
}
