import { randomUUID } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, openSync, realpathSync, writeSync } from "node:fs";

const RUNTIME = "scheduler" as const;
const UNKNOWN_REF = "UNKNOWN:DECLARED_KIND_REQUIRED" as const;
const SPOOL_ENVELOPE_MAX_BYTES_SEED = 16_384;
const ENVIRONMENT_SEED = "unknown";
const BUILD_REF_SEED = "UNTRACKED-DEV:UNKNOWN";
const BUILD_DIRTY_SEED = true;
const REDACTION_POLICY_VERSION_SEED = "g0";
const ALLOWLIST_SET_ID_SEED = "g0-empty-parameters";
const WRITER_IDENTITY_SEED = RUNTIME;
const SPOOL_OPEN_FLAGS = constants.O_APPEND
  | constants.O_CREAT
  | constants.O_EXCL
  | constants.O_NOFOLLOW
  | constants.O_WRONLY;
const FINGERPRINTS = Object.freeze({
  api: "e56d0fcc502088aae79b1c0a9987a0f543c9b4003f64fa4070700065c187f7fc",
  runner: "83fc60d1edb0eddcd888d581e3a457372029e8fb4ce4c8ebc07b2825c38e8af4",
  scheduler: "fc4560722549b32e77bed3f85f0c754e85a6cf70670cd7236eaeab684227f4da",
});

type FatalExitSink = () => void;

interface RuntimeCaptureModule {
  readonly startCaptureRuntime: (options: {
    readonly runtime: typeof RUNTIME;
    readonly spoolFd: number | undefined;
    readonly installExitSink: (nextExitSink: FatalExitSink) => void;
  }) => void | Promise<void>;
}

interface SpoolFileIdentity {
  readonly device: bigint;
  readonly inode: bigint;
}

function configValue(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value.length === 0 ? fallback : value;
}

function configBooleanValue(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  // Exact parsing policy: only the literal "true" is true; every other non-empty value is false.
  return value === undefined || value.length === 0 ? fallback : value === "true";
}

function normalizedSpoolDirectory(value: string | undefined): string | undefined {
  if (value === undefined || !value.startsWith("/") || value.includes("\\")) return undefined;
  const segments = value.split("/").slice(1);
  if (segments.some((segment) => segment === "..")) return undefined;
  const normalizedSegments = segments.filter((segment) => segment.length > 0 && segment !== ".");
  if (normalizedSegments.length === 0) return undefined;
  const finalComponentPath = "/" + normalizedSegments.join("/");
  try {
    if (lstatSync(finalComponentPath).isSymbolicLink()) return undefined;
    return realpathSync(value);
  } catch {
    return undefined;
  }
}

const configuredEnvelopeMaxBytes = Number(process.env.OBS_ENVELOPE_MAX_BYTES);
const envelopeMaxBytes = Number.isSafeInteger(configuredEnvelopeMaxBytes)
    && configuredEnvelopeMaxBytes > 0
  ? configuredEnvelopeMaxBytes
  : SPOOL_ENVELOPE_MAX_BYTES_SEED;
const bootId = randomUUID();
let spoolFd: number | undefined;
let spoolFileIdentity: SpoolFileIdentity | undefined;
const spoolDirectory = normalizedSpoolDirectory(process.env.OBS_SPOOL_DIR);
if (spoolDirectory !== undefined) {
  let openedFd: number | undefined;
  try {
    openedFd = openSync(
      spoolDirectory + "/" + RUNTIME + "-" + process.pid + "-" + bootId + ".spool",
      SPOOL_OPEN_FLAGS,
      0o600,
    );
    const openedFile = fstatSync(openedFd, { bigint: true });
    spoolFd = openedFd;
    spoolFileIdentity = { device: openedFile.dev, inode: openedFile.ino };
  } catch {
    if (openedFd !== undefined) {
      try {
        closeSync(openedFd);
      } catch {
        // Fatal capture is total: cleanup failure cannot affect boot.
      }
    }
    // Fatal capture is total: an unavailable exit sink must not affect boot.
  }
}

interface SpoolWriteAttempt {
  readonly bytes: Uint8Array;
  offset: number;
}

function writeComplete(fd: number, attempt: SpoolWriteAttempt): void {
  while (attempt.offset < attempt.bytes.byteLength) {
    const remaining = attempt.bytes.byteLength - attempt.offset;
    const written = writeSync(fd, attempt.bytes, attempt.offset, remaining);
    if (!Number.isSafeInteger(written) || written <= 0 || written > remaining) {
      throw new Error("SPOOL_WRITE_INCOMPLETE");
    }
    attempt.offset += written;
  }
}

let tierZeroWriteAttempt: SpoolWriteAttempt | undefined;

function writeTierZeroFatalBoundaryRecord(): void {
  if (spoolFd === undefined || spoolFileIdentity === undefined) return;
  const currentFile = fstatSync(spoolFd, { bigint: true });
  if (currentFile.dev !== spoolFileIdentity.device || currentFile.ino !== spoolFileIdentity.inode) {
    throw new Error("SPOOL_FD_IDENTITY_CHANGED");
  }
  const bytes = tierZeroWriteAttempt?.bytes ?? Buffer.from(JSON.stringify({
    occurred_at: new Date().toISOString(),
    environment: configValue("OBS_ENVIRONMENT", ENVIRONMENT_SEED),
    build_ref: configValue("OBS_BUILD_REF", BUILD_REF_SEED),
    build_dirty: configBooleanValue("OBS_BUILD_DIRTY", BUILD_DIRTY_SEED),
    runtime: RUNTIME,
    component: { process: RUNTIME, package: "@debateai/" + RUNTIME },
    capture_point: "self",
    code: "OBS_CAPTURE_SELF",
    taxonomy_class: "CAPTURE_SELF",
    severity: "DEGRADED",
    condition_mark: null,
    disposition: "SELF",
    fingerprint: FINGERPRINTS[RUNTIME],
    fingerprint_version: 1,
    redaction_policy_version: configValue("OBS_REDACTION_POLICY_VERSION", REDACTION_POLICY_VERSION_SEED),
    allowlist_set_id: configValue("OBS_ALLOWLIST_SET_ID", ALLOWLIST_SET_ID_SEED),
    fallback_minimized: true,
    run_ref: UNKNOWN_REF,
    work_item_ref: UNKNOWN_REF,
    node_ref: UNKNOWN_REF,
    attempt_ref: UNKNOWN_REF,
    ledger_ref: UNKNOWN_REF,
    parent_occurrence_ref: "NO_CAUSE",
    cause_relation: null,
    at_seq_watermark: UNKNOWN_REF,
    frames: [],
    safe_template_id: "tpl.OBS_CAPTURE_SELF",
    template_parameters: {},
    source: "first_party",
    source_event_ref: randomUUID(),
    zone_context: false,
    attempt_index: null,
    writer_identity: configValue("OBS_WRITER_IDENTITY", WRITER_IDENTITY_SEED),
  }) + "\n", "utf8");
  if (bytes.byteLength > envelopeMaxBytes) {
    throw new Error("SPOOL_WRITE_INCOMPLETE");
  }
  tierZeroWriteAttempt ??= { bytes, offset: 0 };
  writeComplete(spoolFd, tierZeroWriteAttempt);
}

let exitSink: FatalExitSink = writeTierZeroFatalBoundaryRecord;
let fatalBoundaryRecordAttempted = false;

function installExitSink(nextExitSink: unknown): void {
  if (typeof nextExitSink === "function") exitSink = nextExitSink as FatalExitSink;
}

function writeFatalBoundaryRecord(): void {
  if (fatalBoundaryRecordAttempted) return;
  try {
    exitSink();
    fatalBoundaryRecordAttempted = true;
  } catch {
    if (exitSink !== writeTierZeroFatalBoundaryRecord) {
      try {
        writeTierZeroFatalBoundaryRecord();
        fatalBoundaryRecordAttempted = true;
      } catch {
        // Product failure semantics always win over observability.
      }
    }
  }
}

process.on("uncaughtExceptionMonitor", () => writeFatalBoundaryRecord());
process.on("exit", (code) => {
  if (code !== 0) writeFatalBoundaryRecord();
});

const RUNTIME_CAPTURE_MODULE = "@debateai/obs-capture/runtime";
const runtimeArm = setTimeout(() => {
  void (import(RUNTIME_CAPTURE_MODULE) as Promise<RuntimeCaptureModule>)
    .then((module) => module.startCaptureRuntime({ runtime: RUNTIME, spoolFd, installExitSink }))
    .catch(() => undefined);
}, 0);
runtimeArm.unref?.();

export const INSTALLER_RUNTIME = RUNTIME;
export const PROCESS_HANDLERS_INSTALLED = true as const;
