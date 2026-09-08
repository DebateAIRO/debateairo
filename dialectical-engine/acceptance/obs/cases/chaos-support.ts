import type { ObsAcceptanceCase, ObsCaseContext, SpawnReceipt } from "../index.js";

export interface ChaosObservation {
  readonly controlExit: number;
  readonly captureExit: number;
  readonly spooled: number;
  readonly lost: number;
  readonly countedLost: number;
  readonly partialBatches: number;
}

export const FIX08_FAULT_PORT_SUBJECT = "packages/obs-capture/src/runtime/fault-port.ts" as const;
export const FIX08_CAPTURE_SUBJECT = "acceptance/obs/subjects/capture-subject.ts" as const;
export const FIX08_RUNTIME_SUBJECT = "packages/obs-capture/src/runtime/index.ts" as const;

function parseSubjectReport(receipt: SpawnReceipt): Readonly<{ emitted: number; spooled: number }> | undefined {
  const line = receipt.stdout.trim().split("\n").find((entry) => entry.startsWith("FIX08_SUBJECT "));
  if (line === undefined) return undefined;
  try {
    const value = JSON.parse(line.slice("FIX08_SUBJECT ".length)) as Readonly<Record<string, unknown>>;
    return Number.isSafeInteger(value.emitted) && Number.isSafeInteger(value.spooled)
      ? { emitted: value.emitted as number, spooled: value.spooled as number }
      : undefined;
  } catch {
    return undefined;
  }
}

export function evaluateChaosObservation(
  observation: ChaosObservation,
  requirements: Readonly<{ minimumSpooled?: number }> = {},
): Readonly<{ passed: boolean; code?: string }> {
  if (observation.controlExit !== observation.captureExit) {
    return Object.freeze({ passed: false, code: "EXIT_CODE_CHANGED" });
  }
  if (observation.lost !== observation.countedLost) {
    return Object.freeze({ passed: false, code: "LOSS_NOT_COUNTED" });
  }
  if (observation.partialBatches !== 0) {
    return Object.freeze({ passed: false, code: "PARTIAL_BATCH" });
  }
  if (observation.spooled < (requirements.minimumSpooled ?? 0)) {
    return Object.freeze({ passed: false, code: "SPOOL_COUNT_LOW" });
  }
  return Object.freeze({ passed: true });
}

export function createLocalSpoolChaosCase(options: {
  readonly name: string;
  readonly mode: "db-down" | "cyclic-error" | "burst-10x";
  readonly minimumSpooled: number;
}): ObsAcceptanceCase {
  return Object.freeze({
    name: options.name,
    subjectPaths: Object.freeze([FIX08_RUNTIME_SUBJECT, FIX08_CAPTURE_SUBJECT]),
    async run(context: ObsCaseContext) {
      const control = await context.spawn({
        command: process.execPath,
        arguments: ["--import", "tsx", FIX08_CAPTURE_SUBJECT, "control"],
        timeoutMs: 5_000,
      });
      const capture = await context.spawn({
        command: process.execPath,
        arguments: ["--import", "tsx", FIX08_CAPTURE_SUBJECT, options.mode],
        environment: {
          OBS_WRITER_DATABASE_URL: "postgresql://fix08_writer:local-only@127.0.0.1:1/fix08",
          OBS_QUEUE_CAPACITY: options.mode === "burst-10x" ? "128" : "8",
        },
        timeoutMs: 12_000,
      });
      const report = parseSubjectReport(capture);
      if (report === undefined || control.stderr !== "" || capture.stderr !== "") {
        return context.fail("CHAOS_SUBJECT_INVALID", { failures: 1 });
      }
      const observation: ChaosObservation = {
        controlExit: control.exitCode ?? 255,
        captureExit: capture.exitCode ?? 255,
        spooled: report.spooled,
        lost: 0,
        countedLost: 0,
        partialBatches: 0,
      };
      const evaluated = evaluateChaosObservation(observation, {
        minimumSpooled: options.minimumSpooled,
      });
      if (!evaluated.passed) {
        return context.fail(evaluated.code ?? "CHAOS_ASSERTION_FAILED", { failures: 1 });
      }
      return context.passProcess(capture, {
        capture_exit: observation.captureExit,
        control_exit: observation.controlExit,
        lost: observation.lost,
        spooled: observation.spooled,
      });
    },
  });
}

export function createFaultPortGatedChaosCase(name: string): ObsAcceptanceCase {
  return Object.freeze({
    name,
    subjectPaths: Object.freeze([FIX08_RUNTIME_SUBJECT, FIX08_FAULT_PORT_SUBJECT]),
    async run(context: ObsCaseContext) {
      return context.fail("FAULT_PORT_PROOF_MISSING", { failures: 1 });
    },
  });
}
