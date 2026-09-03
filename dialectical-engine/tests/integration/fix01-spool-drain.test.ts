import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  appendFileSync,
  closeSync,
  constants,
  copyFileSync,
  existsSync,
  fstatSync,
  linkSync,
  mkdirSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { migrate } from "../../packages/db/src/index.js";
import {
  createSharedRedactor,
  type PostRedactionEnvelope,
} from "../../packages/obs-capture/src/redactor.js";
import { drainDeadSpoolFiles } from "../../packages/obs-capture/src/runtime/drain.js";
import type { PostgresCaptureSink } from "../../packages/obs-capture/src/runtime/sink.js";
import { createPreopenedSpool } from "../../packages/obs-capture/src/spool.js";
import {
  appendSpoolIndexBasename,
  readIndexedSpoolPage,
} from "../../packages/obs-capture/src/spool-index.js";
import {
  startTestDatabase,
  type TestDatabase,
} from "../support/testDatabase.js";

vi.mock("@debateai/kernel", async () =>
  import("../../packages/kernel/src/index.js"),
);
vi.mock("@debateai/crypto", async () =>
  import("../../packages/crypto/src/index.js"),
);
vi.mock("@debateai/db", async () =>
  import("../../packages/db/src/index.js"),
);
vi.mock("@debateai/register", async () =>
  import("../../packages/register/src/index.js"),
);

const ROLE_PASSWORDS = Object.freeze({
  debateai_obs_writer: "writer-fix01-c4-only",
  debateai_obs_human: "human-fix01-c4-only",
});
const UNKNOWN_REF = "UNKNOWN:DECLARED_KIND_REQUIRED";
const NOT_APPLICABLE = "NOT_APPLICABLE";
const DEAD_PID = 2_147_483_647;
const MAX_SPOOL_RECORD_BYTES = 16_384;
const MAX_SPOOL_FILE_BYTES = 65_536;
const MAX_ELIGIBLE_FILES_PER_START = 64;
const MAX_TRANSACTIONS_PER_START = 128;
const SPOOL_INDEX_NAME = ".obs-spool-index-v1";
const SPOOL_CURSOR_NAME = ".obs-spool-cursor-v1";
const SPOOL_CURSOR_BYTES = 1_024;
const INDEXED_SPOOL_NAME = /^(api|runner|scheduler|evaluator-lib|ui-client|listener|watchdog|ingest)-[1-9][0-9]*-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.spool$/u;

type RuntimeName =
  | "api"
  | "runner"
  | "scheduler"
  | "evaluator-lib"
  | "ui-client"
  | "listener"
  | "watchdog"
  | "ingest";

interface CorrelationFields {
  readonly run_ref: string;
  readonly work_item_ref: string;
  readonly node_ref: string;
  readonly attempt_ref: string;
  readonly ledger_ref: string;
  readonly at_seq_watermark: string;
}

interface SafeEnvelope extends CorrelationFields {
  readonly occurred_at: string;
  readonly environment: string;
  readonly build_ref: string;
  readonly build_dirty: boolean;
  readonly runtime: RuntimeName;
  readonly component: Readonly<{
    readonly process: string;
    readonly package: string;
  }>;
  readonly capture_point: "self";
  readonly code: "OBS_CAPTURE_SELF";
  readonly taxonomy_class: "CAPTURE_SELF";
  readonly severity: "DEGRADED";
  readonly condition_mark: null;
  readonly disposition: "SELF";
  readonly fingerprint: string;
  readonly fingerprint_version: 1;
  readonly redaction_policy_version: string;
  readonly allowlist_set_id: string;
  readonly fallback_minimized: boolean;
  readonly parent_occurrence_ref: "NO_CAUSE";
  readonly cause_relation: null;
  readonly frames: readonly [];
  readonly safe_template_id: string;
  readonly template_parameters: Readonly<Record<string, unknown>>;
  readonly source: "first_party";
  readonly source_event_ref: string;
  readonly zone_context: boolean;
  readonly attempt_index: null;
  readonly writer_identity: string;
}

let database: TestDatabase;
const scratchDirectories: string[] = [];

function roleConnectionString(role: keyof typeof ROLE_PASSWORDS): string {
  const url = new URL(database.connectionString);
  url.username = role;
  url.password = ROLE_PASSWORDS[role];
  return url.toString();
}

function createScratchDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "fix01-c4-spool-drain-"));
  scratchDirectories.push(directory);
  return directory;
}

function createShortScratchDirectory(): string {
  const directory = mkdtempSync("/tmp/fix01-c4-");
  scratchDirectories.push(directory);
  return directory;
}

function fingerprintFor(
  runtime: RuntimeName,
  taxonomyClass: string,
  code = "OBS_CAPTURE_SELF",
  componentPackage = `@debateai/${runtime}`,
): string {
  return createHash("sha256")
    .update(
      `v1\u0000${code}\u0000${taxonomyClass}\u0000${runtime}\u0000${componentPackage}`,
    )
    .digest("hex");
}

function safeEnvelope(
  runtime: RuntimeName,
  sourceEventRef = randomUUID(),
  correlations: Partial<CorrelationFields> = {},
  zoneContext = false,
): SafeEnvelope {
  const refs: CorrelationFields = {
    run_ref: UNKNOWN_REF,
    work_item_ref: UNKNOWN_REF,
    node_ref: UNKNOWN_REF,
    attempt_ref: UNKNOWN_REF,
    ledger_ref: UNKNOWN_REF,
    at_seq_watermark: UNKNOWN_REF,
    ...correlations,
  };
  return Object.freeze({
    occurred_at: "2026-09-03T00:00:00.000Z",
    environment: "test",
    build_ref: "UNTRACKED-DEV:fix01-c4",
    build_dirty: true,
    runtime,
    component: Object.freeze({
      process: runtime,
      package: `@debateai/${runtime}`,
    }),
    capture_point: "self",
    code: "OBS_CAPTURE_SELF",
    taxonomy_class: "CAPTURE_SELF",
    severity: "DEGRADED",
    condition_mark: null,
    disposition: "SELF",
    fingerprint: fingerprintFor(runtime, "CAPTURE_SELF"),
    fingerprint_version: 1,
    redaction_policy_version: "g0",
    allowlist_set_id: "g0-empty-parameters",
    fallback_minimized: false,
    run_ref: refs.run_ref,
    work_item_ref: refs.work_item_ref,
    node_ref: refs.node_ref,
    attempt_ref: refs.attempt_ref,
    ledger_ref: refs.ledger_ref,
    parent_occurrence_ref: "NO_CAUSE",
    cause_relation: null,
    at_seq_watermark: refs.at_seq_watermark,
    frames: Object.freeze([]) as readonly [],
    safe_template_id: "tpl.OBS_CAPTURE_SELF",
    template_parameters: Object.freeze({}),
    source: "first_party",
    source_event_ref: sourceEventRef,
    zone_context: zoneContext,
    attempt_index: null,
    writer_identity: runtime,
  });
}

function serializedEnvelope(envelope: SafeEnvelope): string {
  return `${JSON.stringify(envelope)}\n`;
}

function serializedEnvelopeAtLineByteLength(
  envelope: SafeEnvelope,
  targetLineBytes: number,
): string {
  const json = JSON.stringify(envelope);
  const padding = targetLineBytes - Buffer.byteLength(json);
  if (padding < 0) {
    throw new Error(`FIX01_C4_UNREPRESENTABLE_LINE_SIZE:${targetLineBytes}`);
  }
  const line = `${json}${" ".repeat(padding)}\n`;
  if (Buffer.byteLength(line) !== targetLineBytes + 1) {
    throw new Error(`FIX01_C4_LINE_SIZE_MISMATCH:${targetLineBytes}`);
  }
  return line;
}

function serializedFileAtByteLength(
  targetBytes: number,
): readonly { readonly envelope: SafeEnvelope; readonly line: string }[] {
  const entries: Array<{ envelope: SafeEnvelope; line: string }> = [];
  let remaining = targetBytes;
  while (remaining > 0) {
    const base = safeEnvelope("scheduler");
    const baseBytes = Buffer.byteLength(serializedEnvelope(base));
    const lineBytes = Math.min(MAX_SPOOL_RECORD_BYTES - 1, remaining - 1);
    if (lineBytes < baseBytes - 1) {
      const prior = entries.pop();
      if (prior === undefined) {
        throw new Error(`FIX01_C4_UNREPRESENTABLE_FILE_SIZE:${targetBytes}`);
      }
      remaining += Buffer.byteLength(prior.line);
      const splitFirst = Math.floor(remaining / 2);
      const splitSecond = remaining - splitFirst;
      for (const split of [splitFirst, splitSecond]) {
        const envelope = safeEnvelope("scheduler");
        entries.push({
          envelope,
          line: serializedEnvelopeAtLineByteLength(envelope, split - 1),
        });
      }
      remaining = 0;
      continue;
    }
    const envelope = base;
    const line = serializedEnvelopeAtLineByteLength(envelope, lineBytes);
    entries.push({ envelope, line });
    remaining -= Buffer.byteLength(line);
  }
  return entries;
}

function recordingSink(options: {
  readonly onIngest?: (
    envelope: PostRedactionEnvelope,
    callIndex: number,
  ) => void | Promise<void>;
} = {}): {
  readonly calls: PostRedactionEnvelope[];
  readonly sink: PostgresCaptureSink;
} {
  const calls: PostRedactionEnvelope[] = [];
  const sink: PostgresCaptureSink = Object.freeze({
    async writeOccurrences(): Promise<void> {},
    async writeCaptureGap(): Promise<void> {},
    async ingestSpooledOccurrence(
      envelope: PostRedactionEnvelope,
    ): Promise<void> {
      calls.push(envelope);
      await options.onIngest?.(envelope, calls.length - 1);
    },
    async close(): Promise<void> {},
  });
  return { calls, sink };
}

async function drainWithSink(
  directory: string,
  sink: PostgresCaptureSink,
  ensureIndex = true,
): Promise<void> {
  if (ensureIndex) ensureCurrentSpoolsIndexed(directory);
  await drainDeadSpoolFiles({ spoolDirectory: directory, databaseSink: sink });
}

function appendIndexRecord(directory: string, record: string): void {
  appendFileSync(join(directory, SPOOL_INDEX_NAME), `${record}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

function ensureCurrentSpoolsIndexed(directory: string): void {
  const indexPath = join(directory, SPOOL_INDEX_NAME);
  const indexed = existsSync(indexPath)
    ? new Set(readFileSync(indexPath, "utf8").split("\n"))
    : new Set<string>();
  for (const name of readdirSync(directory)) {
    if (INDEXED_SPOOL_NAME.test(name) && !indexed.has(name)) {
      appendIndexRecord(directory, name);
      indexed.add(name);
    }
  }
}

function spoolName(
  runtime: RuntimeName,
  pid: number,
  bootId = randomUUID(),
): string {
  return `${runtime}-${pid}-${bootId}.spool`;
}

function orderedSpoolName(index: number): string {
  const suffix = index.toString(16).padStart(12, "0");
  return spoolName(
    "scheduler",
    DEAD_PID,
    `00000000-0000-4000-8000-${suffix}`,
  );
}

function writeEnvelope(path: string, envelope: SafeEnvelope): void {
  writeFileSync(path, `${JSON.stringify(envelope)}\n`, { mode: 0o600 });
}

function producerEnvelope(options: {
  readonly runtime?: RuntimeName;
  readonly environment?: string;
  readonly buildRef?: string;
  readonly policyVersion?: string;
  readonly allowlistId?: string;
  readonly writerIdentity?: string;
  readonly sourceEventRef?: () => string;
} = {}): PostRedactionEnvelope {
  const runtime = options.runtime ?? "scheduler";
  return createSharedRedactor({
    environment: options.environment ?? "test",
    build_ref: options.buildRef ?? "UNTRACKED-DEV:fix01-c4",
    build_dirty: true,
    runtime,
    component: Object.freeze({
      process: runtime,
      package: `@debateai/${runtime}`,
    }),
    writer_identity: options.writerIdentity ?? runtime,
    redaction_policy_version: options.policyVersion ?? "g0",
    allowlist_set_id: options.allowlistId ?? "g0-empty-parameters",
    now: () => new Date("2026-09-03T00:00:00.000Z"),
    ...(options.sourceEventRef === undefined
      ? {}
      : { sourceEventRef: options.sourceEventRef }),
  }).redact({
    kind: "envelope",
    payload_ref: Object.freeze({
      code: "OBS_CAPTURE_SELF",
      taxonomy_class: "CAPTURE_SELF",
      capture_point: "self",
      disposition: "SELF",
      source: "first_party",
    }),
    ambient_context_ref: undefined,
  });
}

function runPreArmInstaller(
  runtime: "api" | "runner" | "scheduler",
  spoolDirectory: string,
  metadata: Readonly<{
    environment: string;
    buildRef: string;
    policyVersion: string;
    allowlistId: string;
    writerIdentity: string;
  }>,
): { readonly path: string; readonly envelope: SafeEnvelope } {
  const child = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      `await import("@debateai/obs-capture/install/${runtime}"); process.exit(7);`,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_NO_WARNINGS: "1",
        OBS_SPOOL_DIR: realpathSync(spoolDirectory),
        OBS_ENVIRONMENT: metadata.environment,
        OBS_BUILD_REF: metadata.buildRef,
        OBS_REDACTION_POLICY_VERSION: metadata.policyVersion,
        OBS_ALLOWLIST_SET_ID: metadata.allowlistId,
        OBS_WRITER_IDENTITY: metadata.writerIdentity,
        OBS_ENVELOPE_MAX_BYTES: String(MAX_SPOOL_RECORD_BYTES * 4),
      },
      timeout: 10_000,
    },
  );
  expect(
    child.status,
    ["stdout=", child.stdout, "\nstderr=", child.stderr].join(""),
  ).toBe(7);
  const names = readdirSync(spoolDirectory).filter((name) =>
    name.endsWith(".spool")
  );
  expect(names).toHaveLength(1);
  const path = join(spoolDirectory, names[0] as string);
  const envelope = JSON.parse(readFileSync(path, "utf8")) as SafeEnvelope;
  return { path, envelope };
}

function runCaptureRuntime(spoolDirectory: string): {
  readonly armed: boolean;
  readonly scheduled: number;
  readonly cleared: number;
} {
  ensureCurrentSpoolsIndexed(spoolDirectory);
  const program = [
    'import { startCaptureRuntime, stopCaptureRuntime } from "@debateai/obs-capture/runtime";',
    "let scheduled = 0;",
    "let cleared = 0;",
    "globalThis.setInterval = () => { scheduled += 1; return { unref() {} }; };",
    "globalThis.clearInterval = () => { cleared += 1; };",
    "await startCaptureRuntime({ runtime: 'scheduler', spoolFd: undefined, installExitSink() {} });",
    "const armed = scheduled === 1;",
    "await stopCaptureRuntime({ deadlineMs: 5000 });",
    "process.stdout.write(JSON.stringify({ armed, scheduled, cleared }));",
  ].join("\n");
  const child = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", program],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_NO_WARNINGS: "1",
        OBS_FLUSH_DEADLINE_MS: "60000",
        OBS_SPOOL_DIR: spoolDirectory,
        OBS_WRITER_DATABASE_URL: roleConnectionString(
          "debateai_obs_writer",
        ),
      },
      timeout: 30_000,
    },
  );

  expect(
    child.status,
    ["stdout=", child.stdout, "\nstderr=", child.stderr].join(""),
  ).toBe(0);
  return JSON.parse(child.stdout.trim()) as {
    readonly armed: boolean;
    readonly scheduled: number;
    readonly cleared: number;
  };
}

function runCaptureRuntimeWithoutWaitingForDrain(
  spoolDirectory: string,
): ReturnType<typeof spawnSync> {
  const program = [
    'import { startCaptureRuntime } from "@debateai/obs-capture/runtime";',
    "let scheduled = 0;",
    "globalThis.setInterval = () => { scheduled += 1; return { unref() {} }; };",
    "await startCaptureRuntime({ runtime: 'scheduler', spoolFd: undefined, installExitSink() {} });",
    "process.stdout.write(JSON.stringify({ armed: scheduled === 1, scheduled }));",
    "process.exit(0);",
  ].join("\n");
  return spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", program],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_NO_WARNINGS: "1",
        OBS_FLUSH_DEADLINE_MS: "60000",
        OBS_SPOOL_DIR: spoolDirectory,
        OBS_WRITER_DATABASE_URL: roleConnectionString(
          "debateai_obs_writer",
        ),
      },
      timeout: 2_000,
    },
  );
}

beforeAll(async () => {
  expect(() => process.kill(DEAD_PID, 0)).toThrowError(
    expect.objectContaining({ code: "ESRCH" }),
  );
  database = await startTestDatabase();
  await database.pool.query(
    "SELECT set_config('debateai.obs_writer_password', $1, false)",
    [ROLE_PASSWORDS.debateai_obs_writer],
  );
  await database.pool.query(
    "SELECT set_config('debateai.obs_human_password', $1, false)",
    [ROLE_PASSWORDS.debateai_obs_human],
  );
  await migrate(database.pool);
}, 120_000);

afterEach(() => {
  while (scratchDirectories.length > 0) {
    const directory = scratchDirectories.pop();
    if (directory !== undefined) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

afterAll(async () => {
  await database?.stop();
});

describe.sequential("FIX-01 C4 public runtime spool drain", () => {
  it("drains lawful sentinel, declared-kind, and absent refs while preserving live, malformed, unsafe, and completed files", async () => {
    const directory = createScratchDirectory();
    const scheduler = safeEnvelope("scheduler");
    const uiClient = safeEnvelope("ui-client");
    const evaluator = safeEnvelope("evaluator-lib");
    const live = safeEnvelope("scheduler");
    const malformedName = safeEnvelope("scheduler");
    const mixedFirst = safeEnvelope("scheduler");
    const invalidShape = safeEnvelope("scheduler");
    const symlinkEnvelope = safeEnvelope("scheduler");
    const declaredRefs: CorrelationFields = Object.freeze({
      run_ref: randomUUID(),
      work_item_ref: randomUUID(),
      node_ref: randomUUID(),
      attempt_ref: randomUUID(),
      ledger_ref: randomUUID(),
      at_seq_watermark: "42",
    });
    const declared = safeEnvelope("runner", randomUUID(), declaredRefs);
    const absentRefs: CorrelationFields = Object.freeze({
      run_ref: NOT_APPLICABLE,
      work_item_ref: NOT_APPLICABLE,
      node_ref: NOT_APPLICABLE,
      attempt_ref: NOT_APPLICABLE,
      ledger_ref: NOT_APPLICABLE,
      at_seq_watermark: NOT_APPLICABLE,
    });
    const absent = safeEnvelope("runner", randomUUID(), absentRefs);
    const zone = safeEnvelope("runner", randomUUID(), {}, true);
    const plantedCorrelation = "password=PLANTED-C4-CORRELATION-SECRET";
    const invalidCorrelation = safeEnvelope("runner", randomUUID(), {
      run_ref: plantedCorrelation,
    });
    const invalidZone = safeEnvelope("runner", randomUUID(), {
      run_ref: randomUUID(),
    }, true);
    const invalidParameters: SafeEnvelope = Object.freeze({
      ...safeEnvelope("runner"),
      template_parameters: Object.freeze({ count: 1 }),
    });
    const mismatchedTemplate: SafeEnvelope = Object.freeze({
      ...safeEnvelope("runner"),
      safe_template_id: "tpl.OBS_COMPONENT_HEALTH",
    });

    const schedulerPath = join(
      directory,
      spoolName("scheduler", DEAD_PID),
    );
    const schedulerDuplicatePath = join(
      directory,
      spoolName("scheduler", DEAD_PID),
    );
    const uiClientPath = join(directory, spoolName("ui-client", DEAD_PID));
    const evaluatorPath = join(
      directory,
      spoolName("evaluator-lib", DEAD_PID),
    );
    const livePath = join(
      directory,
      spoolName("scheduler", process.pid),
    );
    const liveEmptyPath = join(
      directory,
      spoolName("scheduler", process.pid),
    );
    const deadEmptyPath = join(
      directory,
      spoolName("scheduler", DEAD_PID),
    );
    const malformedNamePath = join(
      directory,
      `scheduler-${DEAD_PID}-${randomUUID()}.not-spool`,
    );
    const mixedTruncatedPath = join(
      directory,
      spoolName("scheduler", DEAD_PID),
    );
    const invalidShapePath = join(
      directory,
      spoolName("scheduler", DEAD_PID),
    );
    const symlinkTargetPath = join(directory, "outside-owned-target");
    const symlinkPath = join(directory, spoolName("scheduler", DEAD_PID));
    const alreadyIngestedPath = join(
      directory,
      `${spoolName("scheduler", DEAD_PID)}.ingested`,
    );
    const alreadyEmptyPath = join(
      directory,
      `${spoolName("scheduler", DEAD_PID)}.empty`,
    );
    const declaredPath = join(directory, spoolName("runner", DEAD_PID));
    const absentPath = join(directory, spoolName("runner", DEAD_PID));
    const zonePath = join(directory, spoolName("runner", DEAD_PID));
    const invalidCorrelationPath = join(
      directory,
      spoolName("runner", DEAD_PID),
    );
    const invalidZonePath = join(directory, spoolName("runner", DEAD_PID));
    const invalidParametersPath = join(
      directory,
      spoolName("runner", DEAD_PID),
    );
    const mismatchedTemplatePath = join(
      directory,
      spoolName("runner", DEAD_PID),
    );

    writeEnvelope(schedulerPath, scheduler);
    copyFileSync(schedulerPath, schedulerDuplicatePath);
    writeEnvelope(uiClientPath, uiClient);
    writeEnvelope(evaluatorPath, evaluator);
    writeEnvelope(livePath, live);
    writeFileSync(liveEmptyPath, "", { mode: 0o600 });
    writeFileSync(deadEmptyPath, "", { mode: 0o600 });
    writeEnvelope(malformedNamePath, malformedName);
    const mixedOriginal = `${JSON.stringify(mixedFirst)}\n{\"truncated\":`;
    writeFileSync(mixedTruncatedPath, mixedOriginal, { mode: 0o600 });
    const invalidShapeOriginal = `${JSON.stringify({
      ...invalidShape,
      message: "PLANTED-C4-SECRET",
    })}\n`;
    writeFileSync(invalidShapePath, invalidShapeOriginal, { mode: 0o600 });
    const symlinkTargetOriginal = `${JSON.stringify(symlinkEnvelope)}\n`;
    writeFileSync(symlinkTargetPath, symlinkTargetOriginal, { mode: 0o600 });
    symlinkSync(symlinkTargetPath, symlinkPath);
    writeFileSync(alreadyIngestedPath, "already-ingested\n", { mode: 0o600 });
    writeFileSync(alreadyEmptyPath, "already-empty\n", { mode: 0o600 });
    writeEnvelope(declaredPath, declared);
    writeEnvelope(absentPath, absent);
    writeEnvelope(zonePath, zone);
    writeEnvelope(invalidCorrelationPath, invalidCorrelation);
    writeEnvelope(invalidZonePath, invalidZone);
    writeEnvelope(invalidParametersPath, invalidParameters);
    writeEnvelope(mismatchedTemplatePath, mismatchedTemplate);
    const invalidCorrelationOriginal = readFileSync(
      invalidCorrelationPath,
      "utf8",
    );
    const invalidZoneOriginal = readFileSync(invalidZonePath, "utf8");
    const invalidParametersOriginal = readFileSync(
      invalidParametersPath,
      "utf8",
    );
    const mismatchedTemplateOriginal = readFileSync(
      mismatchedTemplatePath,
      "utf8",
    );

    const proof = runCaptureRuntime(directory);

    expect(proof).toEqual({ armed: true, scheduled: 1, cleared: 1 });
    const sourceEventRefs = [
      scheduler.source_event_ref,
      uiClient.source_event_ref,
      evaluator.source_event_ref,
      live.source_event_ref,
      malformedName.source_event_ref,
      mixedFirst.source_event_ref,
      invalidShape.source_event_ref,
      symlinkEnvelope.source_event_ref,
      declared.source_event_ref,
      absent.source_event_ref,
      zone.source_event_ref,
      invalidCorrelation.source_event_ref,
      invalidZone.source_event_ref,
      invalidParameters.source_event_ref,
      mismatchedTemplate.source_event_ref,
    ];
    const occurrences = await database.pool.query<{
      source_event_ref: string;
      capture_status: string;
    }>(
      `SELECT source_event_ref, capture_status
         FROM obs.occurrence
        WHERE source_event_ref = ANY($1::text[])
        ORDER BY source_event_ref`,
      [sourceEventRefs],
    );
    expect(occurrences.rows).toEqual(
      [
        scheduler.source_event_ref,
        uiClient.source_event_ref,
        evaluator.source_event_ref,
        declared.source_event_ref,
        absent.source_event_ref,
        zone.source_event_ref,
      ].sort().map((sourceEventRef) => ({
        source_event_ref: sourceEventRef,
        capture_status: "SPOOLED",
      })),
    );
    const receipts = await database.pool.query<{
      spool_ref: string;
      source_event_ref: string;
    }>(
      `SELECT receipt.spool_ref, occurrence.source_event_ref
         FROM obs.spool_receipt AS receipt
         INNER JOIN obs.occurrence AS occurrence
           ON occurrence.occurrence_id = receipt.occurrence_id
        WHERE occurrence.source_event_ref = ANY($1::text[])
        ORDER BY occurrence.source_event_ref`,
      [sourceEventRefs],
    );
    expect(receipts.rows).toEqual(
      [
        scheduler.source_event_ref,
        uiClient.source_event_ref,
        evaluator.source_event_ref,
        declared.source_event_ref,
        absent.source_event_ref,
        zone.source_event_ref,
      ].sort().map((sourceEventRef) => ({
        spool_ref: sourceEventRef,
        source_event_ref: sourceEventRef,
      })),
    );

    for (const path of [
      schedulerPath,
      schedulerDuplicatePath,
      uiClientPath,
      evaluatorPath,
      declaredPath,
      absentPath,
      zonePath,
    ]) {
      expect(existsSync(path)).toBe(true);
      expect(existsSync(`${path}.ingested`)).toBe(true);
      expect(readFileSync(`${path}.ingested`)).toEqual(readFileSync(path));
    }
    expect(existsSync(deadEmptyPath)).toBe(true);
    expect(existsSync(`${deadEmptyPath}.empty`)).toBe(true);
    expect(existsSync(livePath)).toBe(true);
    expect(existsSync(`${livePath}.ingested`)).toBe(false);
    expect(existsSync(liveEmptyPath)).toBe(true);
    expect(existsSync(`${liveEmptyPath}.empty`)).toBe(false);
    expect(readFileSync(malformedNamePath, "utf8"))
      .toBe(`${JSON.stringify(malformedName)}\n`);
    expect(readFileSync(mixedTruncatedPath, "utf8")).toBe(mixedOriginal);
    expect(readFileSync(invalidShapePath, "utf8")).toBe(invalidShapeOriginal);
    expect(lstatSync(symlinkPath).isSymbolicLink()).toBe(true);
    expect(readFileSync(symlinkTargetPath, "utf8")).toBe(
      symlinkTargetOriginal,
    );
    expect(readFileSync(alreadyIngestedPath, "utf8"))
      .toBe("already-ingested\n");
    expect(readFileSync(alreadyEmptyPath, "utf8")).toBe("already-empty\n");
    const correlationRows = await database.pool.query<CorrelationFields & {
      source_event_ref: string;
    }>(
      `SELECT source_event_ref, run_ref, work_item_ref, node_ref,
              attempt_ref, ledger_ref, at_seq_watermark
         FROM obs.occurrence
        WHERE source_event_ref = ANY($1::text[])`,
      [[
        declared.source_event_ref,
        absent.source_event_ref,
        zone.source_event_ref,
      ]],
    );
    expect(correlationRows.rows).toHaveLength(3);
    expect(correlationRows.rows).toEqual(expect.arrayContaining([
      { source_event_ref: declared.source_event_ref, ...declaredRefs },
      { source_event_ref: absent.source_event_ref, ...absentRefs },
      {
        source_event_ref: zone.source_event_ref,
        run_ref: UNKNOWN_REF,
        work_item_ref: UNKNOWN_REF,
        node_ref: UNKNOWN_REF,
        attempt_ref: UNKNOWN_REF,
        ledger_ref: UNKNOWN_REF,
        at_seq_watermark: UNKNOWN_REF,
      },
    ]));
    expect(readFileSync(invalidCorrelationPath, "utf8"))
      .toBe(invalidCorrelationOriginal);
    expect(readFileSync(invalidZonePath, "utf8")).toBe(invalidZoneOriginal);
    expect(readFileSync(invalidParametersPath, "utf8"))
      .toBe(invalidParametersOriginal);
    expect(readFileSync(mismatchedTemplatePath, "utf8"))
      .toBe(mismatchedTemplateOriginal);
    const planted = await database.pool.query<{ count: number }>(
      `SELECT count(*)::int AS count
         FROM obs.occurrence AS occurrence
        WHERE occurrence::text LIKE '%' || $1 || '%'`,
      [plantedCorrelation],
    );
    expect(planted.rows[0]?.count).toBe(0);
  });

  it("rolls back receipt failure, leaves bytes retryable, and arms before a successful retry", async () => {
    const directory = createScratchDirectory();
    const envelope = safeEnvelope("scheduler");
    const path = join(directory, spoolName("scheduler", DEAD_PID));
    const original = `${JSON.stringify(envelope)}\n`;
    writeFileSync(path, original, { mode: 0o600 });

    await database.pool.query(`
      CREATE FUNCTION public.fix01_c4_reject_receipt()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog
      AS $$
      BEGIN
        IF NEW.spool_ref = '${envelope.source_event_ref}' THEN
          RAISE EXCEPTION 'TEST_RECEIPT_WRITE_FAILURE';
        END IF;
        RETURN NEW;
      END
      $$
    `);
    await database.pool.query(`
      CREATE TRIGGER fix01_c4_reject_receipt
      BEFORE INSERT ON obs.spool_receipt
      FOR EACH ROW EXECUTE FUNCTION public.fix01_c4_reject_receipt()
    `);

    try {
      expect(runCaptureRuntime(directory))
        .toEqual({ armed: true, scheduled: 1, cleared: 1 });
      const failedOccurrence = await database.pool.query<{ count: number }>(
        `SELECT count(*)::int AS count
           FROM obs.occurrence
          WHERE source_event_ref = $1`,
        [envelope.source_event_ref],
      );
      const failedReceipt = await database.pool.query<{ count: number }>(
        `SELECT count(*)::int AS count
           FROM obs.spool_receipt
          WHERE spool_ref = $1`,
        [envelope.source_event_ref],
      );
      expect(failedOccurrence.rows[0]?.count).toBe(0);
      expect(failedReceipt.rows[0]?.count).toBe(0);
      expect(readFileSync(path, "utf8")).toBe(original);
      expect(existsSync(`${path}.ingested`)).toBe(false);
    } finally {
      await database.pool.query(
        "DROP TRIGGER fix01_c4_reject_receipt ON obs.spool_receipt",
      );
      await database.pool.query(
        "DROP FUNCTION public.fix01_c4_reject_receipt()",
      );
    }

    expect(runCaptureRuntime(directory))
      .toEqual({ armed: true, scheduled: 1, cleared: 1 });
    const successful = await database.pool.query<{
      capture_status: string;
      spool_ref: string;
      linked_occurrence: string;
    }>(
      `SELECT occurrence.capture_status,
              receipt.spool_ref,
              receipt.occurrence_id::text AS linked_occurrence
         FROM obs.occurrence AS occurrence
         INNER JOIN obs.spool_receipt AS receipt
           ON receipt.occurrence_id = occurrence.occurrence_id
        WHERE occurrence.source_event_ref = $1`,
      [envelope.source_event_ref],
    );
    expect(successful.rows).toEqual([
      expect.objectContaining({
        capture_status: "SPOOLED",
        spool_ref: envelope.source_event_ref,
        linked_occurrence: expect.any(String),
      }),
    ]);
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(`${path}.ingested`, "utf8")).toBe(original);
  });

  it("arms the normal timer without waiting for a stalled drain transaction", async () => {
    const directory = createScratchDirectory();
    const envelope = safeEnvelope("scheduler");
    const path = join(directory, spoolName("scheduler", DEAD_PID));
    writeEnvelope(path, envelope);
    await database.pool.query(`
      CREATE FUNCTION public.fix01_c4_stall_occurrence()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog
      AS $$
      BEGIN
        IF NEW.source_event_ref = '${envelope.source_event_ref}' THEN
          PERFORM pg_sleep(10);
        END IF;
        RETURN NEW;
      END
      $$
    `);
    await database.pool.query(`
      CREATE TRIGGER fix01_c4_stall_occurrence
      BEFORE INSERT ON obs.occurrence
      FOR EACH ROW EXECUTE FUNCTION public.fix01_c4_stall_occurrence()
    `);

    try {
      const child = runCaptureRuntimeWithoutWaitingForDrain(directory);
      expect(
        child.status,
        ["stdout=", child.stdout, "\nstderr=", child.stderr].join(""),
      ).toBe(0);
      expect(JSON.parse(String(child.stdout).trim())).toEqual({
        armed: true,
        scheduled: 1,
      });
    } finally {
      await database.pool.query(
        "DROP TRIGGER fix01_c4_stall_occurrence ON obs.occurrence",
      );
      await database.pool.query(
        "DROP FUNCTION public.fix01_c4_stall_occurrence()",
      );
    }

    expect(readFileSync(path, "utf8")).toBe(serializedEnvelope(envelope));
    expect(existsSync(`${path}.ingested`)).toBe(false);
  }, 15_000);
});

describe.sequential("FIX-01 C4 hostile spool boundaries", () => {
  it("uses one producer/reader contract and minimizes unsafe producer metadata", async () => {
    const directory = createScratchDirectory();
    const lawful = producerEnvelope({
      environment: "ci",
      buildRef: "release/2026.09",
      policyVersion: "policy-v1",
      allowlistId: "allowlist-v1",
      writerIdentity: "scheduler-worker",
      sourceEventRef: () => {
        throw new Error("source ref unavailable");
      },
    });
    const planted = "password=PLANTED-C4-PRODUCER-SECRET";
    const minimized = producerEnvelope({
      environment: planted,
      buildRef: planted,
      policyVersion: planted,
      allowlistId: planted,
      writerIdentity: planted,
      sourceEventRef: () => planted,
    });
    expect(lawful.source_event_ref)
      .toBe("UNKNOWN:SOURCE_EVENT_REF_UNAVAILABLE");
    expect(lawful.fallback_minimized).toBe(true);
    expect(JSON.stringify(lawful)).not.toContain("password=");
    expect(JSON.stringify(minimized)).not.toContain(planted);
    expect(minimized).toEqual(expect.objectContaining({
      environment: "unknown",
      build_ref: "UNTRACKED-DEV:UNKNOWN",
      redaction_policy_version: "g0",
      allowlist_set_id: "g0-empty-parameters",
      writer_identity: "scheduler",
      source_event_ref: "UNKNOWN:SOURCE_EVENT_REF_UNAVAILABLE",
      fallback_minimized: true,
    }));
    const lawfulPath = join(directory, spoolName("scheduler", DEAD_PID));
    const minimizedPath = join(directory, spoolName("scheduler", DEAD_PID));
    writeFileSync(lawfulPath, serializedEnvelope(lawful as unknown as SafeEnvelope), {
      mode: 0o600,
    });
    writeFileSync(
      minimizedPath,
      serializedEnvelope(minimized as unknown as SafeEnvelope),
      { mode: 0o600 },
    );
    const result = recordingSink();

    await drainWithSink(directory, result.sink);

    expect(result.calls.map((envelope) => envelope.source_event_ref)).toEqual([
      lawful.source_event_ref,
      minimized.source_event_ref,
    ]);
    expect(existsSync(lawfulPath)).toBe(true);
    expect(existsSync(`${lawfulPath}.ingested`)).toBe(true);
    expect(existsSync(minimizedPath)).toBe(true);
    expect(existsSync(`${minimizedPath}.ingested`)).toBe(true);

    await drainWithSink(directory, result.sink);
    expect(result.calls.map((envelope) => envelope.source_event_ref)).toEqual([
      lawful.source_event_ref,
      minimized.source_event_ref,
      lawful.source_event_ref,
      minimized.source_event_ref,
    ]);
  });

  it.each(["api", "runner", "scheduler"] as const)(
    "%s Tier-0 normalizes unsafe pre-arm metadata and preserves lawful metadata",
    async (runtime) => {
      const ordinaryDirectory = createScratchDirectory();
      const ordinary = runPreArmInstaller(runtime, ordinaryDirectory, {
        environment: "ci",
        buildRef: "release/2026.09",
        policyVersion: "policy-v1",
        allowlistId: "allowlist-v1",
        writerIdentity: `${runtime}-worker`,
      });
      expect(ordinary.envelope).toEqual(expect.objectContaining({
        environment: "ci",
        build_ref: "release/2026.09",
        redaction_policy_version: "policy-v1",
        allowlist_set_id: "allowlist-v1",
        writer_identity: `${runtime}-worker`,
      }));
      const ordinarySink = recordingSink();
      await drainWithSink(ordinaryDirectory, ordinarySink.sink);
      expect(ordinarySink.calls).toHaveLength(1);
      expect(existsSync(ordinary.path)).toBe(true);
      expect(existsSync(`${ordinary.path}.ingested`)).toBe(true);

      const unsafeDirectory = createScratchDirectory();
      const planted = "password=PLANTED-C4-TIER-ZERO-SECRET";
      const unsafe = runPreArmInstaller(runtime, unsafeDirectory, {
        environment: planted,
        buildRef: planted,
        policyVersion: planted,
        allowlistId: planted,
        writerIdentity: planted,
      });
      expect(JSON.stringify(unsafe.envelope)).not.toContain(planted);
      expect(unsafe.envelope).toEqual(expect.objectContaining({
        environment: "unknown",
        build_ref: "UNTRACKED-DEV:UNKNOWN",
        redaction_policy_version: "g0",
        allowlist_set_id: "g0-empty-parameters",
        writer_identity: runtime,
        fallback_minimized: true,
      }));
      const unsafeSink = recordingSink();
      await drainWithSink(unsafeDirectory, unsafeSink.sink);
      expect(unsafeSink.calls).toHaveLength(1);
      expect(existsSync(unsafe.path)).toBe(true);
      expect(existsSync(`${unsafe.path}.ingested`)).toBe(true);
    },
    30_000,
  );

  it("reserves one maximum record and rejects normal append past the shared file cap", () => {
    const directory = createScratchDirectory();
    const path = join(directory, "bounded-writer.spool");
    const fd = openSync(
      path,
      constants.O_CREAT | constants.O_EXCL | constants.O_RDWR,
      0o600,
    );
    try {
      const envelope = producerEnvelope();
      const writer = createPreopenedSpool({
        fd,
        envelopeMaxBytes: MAX_SPOOL_RECORD_BYTES * 4,
      });
      const exitRecord = writer.prepare(envelope);
      let rejected = false;
      for (let index = 0; index < 100; index += 1) {
        try {
          writer.append(envelope);
        } catch (error) {
          expect(error).toEqual(expect.objectContaining({
            message: "SPOOL_FILE_CAPACITY_EXCEEDED",
          }));
          rejected = true;
          break;
        }
      }
      expect(rejected).toBe(true);
      expect(fstatSync(fd).size)
        .toBeLessThanOrEqual(MAX_SPOOL_FILE_BYTES - MAX_SPOOL_RECORD_BYTES);
      writer.appendOnExit(exitRecord);
      expect(fstatSync(fd).size).toBeLessThanOrEqual(MAX_SPOOL_FILE_BYTES);
    } finally {
      closeSync(fd);
    }
  });

  it("retains a legacy oversized append-only file without SQL or a false marker", async () => {
    const directory = createScratchDirectory();
    const path = join(directory, spoolName("scheduler", DEAD_PID));
    const original = Array.from(
      { length: 100 },
      () => serializedEnvelope(safeEnvelope("scheduler")),
    ).join("");
    expect(Buffer.byteLength(original)).toBeGreaterThan(MAX_SPOOL_FILE_BYTES);
    writeFileSync(path, original, { mode: 0o600 });
    const result = recordingSink();

    await drainWithSink(directory, result.sink);

    expect(result.calls).toHaveLength(0);
    expect(readFileSync(path, "utf8")).toBe(original);
    expect(existsSync(`${path}.ingested`)).toBe(false);
  });

  it("makes fair bounded progress across a large retained completion backlog", async () => {
    const directory = createScratchDirectory();
    const paths = Array.from(
      { length: 400 },
      (_, index) => join(directory, orderedSpoolName(index + 1000)),
    );
    for (const path of paths) writeFileSync(path, "", { mode: 0o600 });
    const result = recordingSink();

    for (let start = 0; start < 12; start += 1) {
      await drainWithSink(directory, result.sink);
    }

    expect(result.calls).toHaveLength(0);
    expect(paths.every((path) => existsSync(path))).toBe(true);
    expect(paths.every((path) => existsSync(`${path}.empty`))).toBe(true);
    expect(paths.every((path) => statSync(path).size === 0)).toBe(true);
  }, 30_000);

  it("rejects every independently tampered durable field without a sink call or byte change", async () => {
    const directory = createScratchDirectory();
    const planted = "password=PLANTED-C4-DURABLE-SECRET";
    const mutations: ReadonlyArray<readonly [
      string,
      (envelope: SafeEnvelope) => SafeEnvelope,
    ]> = [
      ["occurred_at", (envelope) => ({ ...envelope, occurred_at: "infinity" })],
      ["environment", (envelope) => ({ ...envelope, environment: planted })],
      ["build_ref", (envelope) => ({ ...envelope, build_ref: planted })],
      ["build_dirty", (envelope) => ({ ...envelope, build_dirty: "true" as never })],
      ["runtime", (envelope) => ({ ...envelope, runtime: "runner" })],
      ["component.process", (envelope) => ({
        ...envelope,
        component: { ...envelope.component, process: planted },
      })],
      ["component.package", (envelope) => ({
        ...envelope,
        component: { ...envelope.component, package: planted },
      })],
      ["capture_point", (envelope) => ({
        ...envelope,
        capture_point: planted as never,
      })],
      ["code", (envelope) => ({ ...envelope, code: planted as never })],
      ["taxonomy_class", (envelope) => ({
        ...envelope,
        taxonomy_class: planted as never,
        fingerprint: fingerprintFor(envelope.runtime, planted),
      })],
      ["severity", (envelope) => ({
        ...envelope,
        severity: "FATAL" as never,
      })],
      ["condition_mark", (envelope) => ({
        ...envelope,
        condition_mark: planted as never,
      })],
      ["disposition", (envelope) => ({
        ...envelope,
        disposition: planted as never,
      })],
      ["fingerprint", (envelope) => ({ ...envelope, fingerprint: planted })],
      ["fingerprint_version", (envelope) => ({
        ...envelope,
        fingerprint_version: 2 as never,
      })],
      ["redaction_policy_version", (envelope) => ({
        ...envelope,
        redaction_policy_version: planted,
      })],
      ["allowlist_set_id", (envelope) => ({
        ...envelope,
        allowlist_set_id: planted,
      })],
      ["fallback_minimized", (envelope) => ({
        ...envelope,
        fallback_minimized: planted as never,
      })],
      ["run_ref", (envelope) => ({ ...envelope, run_ref: planted })],
      ["work_item_ref", (envelope) => ({
        ...envelope,
        work_item_ref: planted,
      })],
      ["node_ref", (envelope) => ({ ...envelope, node_ref: planted })],
      ["attempt_ref", (envelope) => ({ ...envelope, attempt_ref: planted })],
      ["ledger_ref", (envelope) => ({ ...envelope, ledger_ref: planted })],
      ["parent_occurrence_ref", (envelope) => ({
        ...envelope,
        parent_occurrence_ref: planted as never,
      })],
      ["cause_relation", (envelope) => ({
        ...envelope,
        cause_relation: planted as never,
      })],
      ["at_seq_watermark", (envelope) => ({
        ...envelope,
        at_seq_watermark: planted,
      })],
      ["frames", (envelope) => ({ ...envelope, frames: [planted] as never })],
      ["safe_template_id", (envelope) => ({
        ...envelope,
        safe_template_id: planted,
      })],
      ["template_parameters", (envelope) => ({
        ...envelope,
        template_parameters: { planted },
      })],
      ["source", (envelope) => ({ ...envelope, source: planted as never })],
      ["source_event_ref", (envelope) => ({
        ...envelope,
        source_event_ref: planted,
      })],
      ["zone_context", (envelope) => ({
        ...envelope,
        zone_context: planted as never,
      })],
      ["attempt_index", (envelope) => ({
        ...envelope,
        attempt_index: -1 as never,
      })],
      ["writer_identity", (envelope) => ({
        ...envelope,
        writer_identity: planted,
      })],
    ];
    const originals = new Map<string, string>();
    for (const [label, mutate] of mutations) {
      const path = join(directory, spoolName("scheduler", DEAD_PID));
      const text = serializedEnvelope(mutate(safeEnvelope("scheduler")));
      writeFileSync(path, text, { mode: 0o600 });
      originals.set(path, `${label}\u0000${text}`);
    }
    const { calls, sink } = recordingSink();

    await drainWithSink(directory, sink);

    expect(calls, calls.map((entry) => entry.source_event_ref).join(","))
      .toHaveLength(0);
    for (const [path, labelledText] of originals) {
      const separator = labelledText.indexOf("\u0000");
      expect(readFileSync(path, "utf8"), labelledText.slice(0, separator))
        .toBe(labelledText.slice(separator + 1));
      expect(existsSync(`${path}.ingested`)).toBe(false);
    }
  });

  it("enforces line, file, eligible-file, and transaction boundaries", async () => {
    const lineDirectory = createScratchDirectory();
    const boundaryLine = safeEnvelope("scheduler");
    const oversizedLine = safeEnvelope("scheduler");
    const boundaryLineText = serializedEnvelopeAtLineByteLength(
      boundaryLine,
      MAX_SPOOL_RECORD_BYTES - 1,
    );
    const oversizedLineText = serializedEnvelopeAtLineByteLength(
      oversizedLine,
      MAX_SPOOL_RECORD_BYTES,
    );
    const boundaryLinePath = join(
      lineDirectory,
      spoolName("scheduler", DEAD_PID),
    );
    const oversizedLinePath = join(
      lineDirectory,
      spoolName("scheduler", DEAD_PID),
    );
    writeFileSync(boundaryLinePath, boundaryLineText, { mode: 0o600 });
    writeFileSync(oversizedLinePath, oversizedLineText, { mode: 0o600 });
    const lineSink = recordingSink();
    await drainWithSink(lineDirectory, lineSink.sink);
    expect(lineSink.calls.map((entry) => entry.source_event_ref)).toEqual([
      boundaryLine.source_event_ref,
    ]);
    expect(existsSync(`${boundaryLinePath}.ingested`)).toBe(true);
    expect(readFileSync(boundaryLinePath, "utf8")).toBe(boundaryLineText);
    expect(readFileSync(oversizedLinePath, "utf8"))
      .toBe(oversizedLineText);

    const fileDirectory = createScratchDirectory();
    const boundaryFile = serializedFileAtByteLength(MAX_SPOOL_FILE_BYTES);
    const oversizedFile = serializedFileAtByteLength(MAX_SPOOL_FILE_BYTES + 1);
    const boundaryFilePath = join(
      fileDirectory,
      spoolName("scheduler", DEAD_PID),
    );
    const oversizedFilePath = join(
      fileDirectory,
      spoolName("scheduler", DEAD_PID),
    );
    writeFileSync(
      boundaryFilePath,
      boundaryFile.map((entry) => entry.line).join(""),
      { mode: 0o600 },
    );
    writeFileSync(
      oversizedFilePath,
      oversizedFile.map((entry) => entry.line).join(""),
      { mode: 0o600 },
    );
    const fileSink = recordingSink();
    await drainWithSink(fileDirectory, fileSink.sink);
    expect(fileSink.calls).toHaveLength(boundaryFile.length);
    expect(existsSync(`${boundaryFilePath}.ingested`)).toBe(true);
    expect(readFileSync(boundaryFilePath)).toEqual(
      readFileSync(`${boundaryFilePath}.ingested`),
    );
    expect(readFileSync(oversizedFilePath, "utf8"))
      .toBe(oversizedFile.map((entry) => entry.line).join(""));

    const eligibleDirectory = createScratchDirectory();
    const eligiblePaths = Array.from(
      { length: MAX_ELIGIBLE_FILES_PER_START + 1 },
      () => join(eligibleDirectory, spoolName("scheduler", DEAD_PID)),
    );
    for (const path of eligiblePaths) writeFileSync(path, "", { mode: 0o600 });
    await drainWithSink(eligibleDirectory, recordingSink().sink);
    expect(eligiblePaths.filter((path) => existsSync(`${path}.empty`)))
      .toHaveLength(MAX_ELIGIBLE_FILES_PER_START);
    expect(eligiblePaths.every((path) => existsSync(path))).toBe(true);

    const exactTransactionDirectory = createScratchDirectory();
    const exactTransactionPaths = Array.from(
      { length: MAX_ELIGIBLE_FILES_PER_START },
      () => join(
        exactTransactionDirectory,
        spoolName("scheduler", DEAD_PID),
      ),
    );
    for (const path of exactTransactionPaths) {
      writeFileSync(
        path,
        [safeEnvelope("scheduler"), safeEnvelope("scheduler")]
          .map(serializedEnvelope)
          .join(""),
        { mode: 0o600 },
      );
    }
    const exactTransactionSink = recordingSink();
    await drainWithSink(exactTransactionDirectory, exactTransactionSink.sink);
    expect(exactTransactionSink.calls).toHaveLength(MAX_TRANSACTIONS_PER_START);
    expect(exactTransactionPaths.every((path) =>
      existsSync(`${path}.ingested`)
    )).toBe(true);
    expect(exactTransactionPaths.every((path) => existsSync(path))).toBe(true);

    const excessTransactionDirectory = createScratchDirectory();
    const excessTransactionPaths = Array.from(
      { length: MAX_ELIGIBLE_FILES_PER_START },
      (_, index) => join(
        excessTransactionDirectory,
        orderedSpoolName(index),
      ),
    );
    for (const [index, path] of excessTransactionPaths.entries()) {
      const lineCount = index === excessTransactionPaths.length - 1 ? 3 : 2;
      writeFileSync(
        path,
        Array.from({ length: lineCount }, () => safeEnvelope("scheduler"))
          .map(serializedEnvelope)
          .join(""),
        { mode: 0o600 },
      );
    }
    const excessTransactionSink = recordingSink();
    await drainWithSink(excessTransactionDirectory, excessTransactionSink.sink);
    expect(excessTransactionSink.calls.length)
      .toBeLessThanOrEqual(MAX_TRANSACTIONS_PER_START);
    expect(excessTransactionSink.calls.length)
      .toBeGreaterThanOrEqual(MAX_TRANSACTIONS_PER_START - 2);
    expect(excessTransactionPaths.every((path) => existsSync(path))).toBe(true);
    expect(excessTransactionPaths.filter((path) =>
      existsSync(`${path}.ingested`)
    )).toHaveLength(MAX_ELIGIBLE_FILES_PER_START - 1);
  }, 30_000);

  it("rejects FIFO, socket, directory, and device paths without blocking", async () => {
    const directory = createShortScratchDirectory();
    const fifoPath = join(directory, spoolName("scheduler", DEAD_PID));
    const socketPath = join(directory, spoolName("scheduler", DEAD_PID));
    const directoryPath = join(directory, spoolName("scheduler", DEAD_PID));
    const devicePath = join(directory, spoolName("scheduler", DEAD_PID));
    expect(spawnSync("mkfifo", [fifoPath]).status).toBe(0);
    mkdirSync(directoryPath);
    symlinkSync("/dev/null", devicePath);
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, resolve);
    });
    const specialSink = recordingSink();
    const drain = drainWithSink(directory, specialSink.sink);
    const completed = await Promise.race([
      drain.then(() => true),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), 250)),
    ]);
    if (!completed) {
      const writer = openSync(fifoPath, constants.O_WRONLY | constants.O_NONBLOCK);
      closeSync(writer);
    }
    await drain;
    const socketStayed = existsSync(socketPath);
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error === undefined ? resolve() : reject(error));
    });

    expect(completed).toBe(true);
    expect(specialSink.calls).toHaveLength(0);
    expect(socketStayed).toBe(true);
    for (const path of [fifoPath, directoryPath, devicePath]) {
      expect(existsSync(path)).toBe(true);
      expect(existsSync(`${path}.empty`)).toBe(false);
      expect(existsSync(`${path}.ingested`)).toBe(false);
    }
  });

  it("keeps append, truncate, same-size rewrite, and path replacement races retryable", async () => {
    const directory = createScratchDirectory();
    const appendEnvelope = safeEnvelope("scheduler");
    const appendedEnvelope = safeEnvelope("scheduler");
    const truncateEnvelope = safeEnvelope("scheduler");
    const rewriteEnvelope = safeEnvelope("scheduler");
    const rewrittenEnvelope = safeEnvelope("scheduler");
    const replacedEnvelope = safeEnvelope("scheduler");
    const replacementEnvelope = safeEnvelope("scheduler");
    const appendPath = join(directory, spoolName("scheduler", DEAD_PID));
    const truncatePath = join(directory, spoolName("scheduler", DEAD_PID));
    const rewritePath = join(directory, spoolName("scheduler", DEAD_PID));
    const replacedPath = join(directory, spoolName("scheduler", DEAD_PID));
    const displacedPath = `${replacedPath}.displaced`;
    writeEnvelope(appendPath, appendEnvelope);
    writeEnvelope(truncatePath, truncateEnvelope);
    writeEnvelope(rewritePath, rewriteEnvelope);
    writeEnvelope(replacedPath, replacedEnvelope);
    const sink = recordingSink({
      onIngest(envelope): void {
        if (envelope.source_event_ref === appendEnvelope.source_event_ref) {
          appendFileSync(appendPath, serializedEnvelope(appendedEnvelope));
        } else if (
          envelope.source_event_ref === truncateEnvelope.source_event_ref
        ) {
          truncateSync(
            truncatePath,
            Math.floor(Buffer.byteLength(serializedEnvelope(truncateEnvelope)) / 2),
          );
        } else if (
          envelope.source_event_ref === rewriteEnvelope.source_event_ref
        ) {
          writeEnvelope(rewritePath, rewrittenEnvelope);
        } else if (
          envelope.source_event_ref === replacedEnvelope.source_event_ref
        ) {
          renameSync(replacedPath, displacedPath);
          writeEnvelope(replacedPath, replacementEnvelope);
        }
      },
    });

    await drainWithSink(directory, sink.sink);

    expect(sink.calls).toHaveLength(4);
    expect(readFileSync(appendPath, "utf8")).toBe(
      serializedEnvelope(appendEnvelope) + serializedEnvelope(appendedEnvelope),
    );
    expect(readFileSync(truncatePath).length).toBeLessThan(
      Buffer.byteLength(serializedEnvelope(truncateEnvelope)),
    );
    expect(readFileSync(rewritePath, "utf8"))
      .toBe(serializedEnvelope(rewrittenEnvelope));
    expect(readFileSync(replacedPath, "utf8"))
      .toBe(serializedEnvelope(replacementEnvelope));
    expect(readFileSync(displacedPath, "utf8"))
      .toBe(serializedEnvelope(replacedEnvelope));
    for (const path of [appendPath, truncatePath, rewritePath, replacedPath]) {
      expect(existsSync(`${path}.ingested`)).toBe(false);
    }
  });

  it("never replaces existing or concurrently-created completion artifacts", async () => {
    const directory = createScratchDirectory();
    const emptyPath = join(directory, spoolName("scheduler", DEAD_PID));
    const ingestedPath = join(directory, spoolName("scheduler", DEAD_PID));
    const concurrentPath = join(directory, spoolName("scheduler", DEAD_PID));
    const ingestedEnvelope = safeEnvelope("scheduler");
    const concurrentEnvelope = safeEnvelope("scheduler");
    const emptyEvidence = "PREEXISTING-EMPTY-DURABLE-EVIDENCE\n";
    const ingestedEvidence = "PREEXISTING-INGESTED-DURABLE-EVIDENCE\n";
    const concurrentEvidence = "CONCURRENT-DURABLE-EVIDENCE\n";
    writeFileSync(emptyPath, "", { mode: 0o600 });
    writeFileSync(`${emptyPath}.empty`, emptyEvidence, { mode: 0o600 });
    writeEnvelope(ingestedPath, ingestedEnvelope);
    writeFileSync(`${ingestedPath}.ingested`, ingestedEvidence, { mode: 0o600 });
    writeEnvelope(concurrentPath, concurrentEnvelope);
    const sink = recordingSink({
      onIngest(envelope): void {
        if (envelope.source_event_ref === concurrentEnvelope.source_event_ref) {
          writeFileSync(`${concurrentPath}.ingested`, concurrentEvidence, {
            mode: 0o600,
          });
        }
      },
    });

    await drainWithSink(directory, sink.sink);

    expect(sink.calls).toHaveLength(2);
    expect(readFileSync(emptyPath)).toHaveLength(0);
    expect(readFileSync(`${emptyPath}.empty`, "utf8")).toBe(emptyEvidence);
    expect(readFileSync(ingestedPath, "utf8"))
      .toBe(serializedEnvelope(ingestedEnvelope));
    expect(readFileSync(`${ingestedPath}.ingested`, "utf8"))
      .toBe(ingestedEvidence);
    expect(readFileSync(concurrentPath, "utf8"))
      .toBe(serializedEnvelope(concurrentEnvelope));
    expect(readFileSync(`${concurrentPath}.ingested`, "utf8"))
      .toBe(concurrentEvidence);
  });
});

function runFreshIndexedDrain(directory: string): readonly string[] {
  const drainUrl = pathToFileURL(resolve(
    process.cwd(),
    "packages/obs-capture/src/runtime/drain.ts",
  )).href;
  const program = [
    `const { drainDeadSpoolFiles } = await import(${JSON.stringify(drainUrl)});`,
    "const calls = [];",
    "const sink = Object.freeze({",
    "  async writeOccurrences() {},",
    "  async writeCaptureGap() {},",
    "  async ingestSpooledOccurrence(envelope) { calls.push(envelope.source_event_ref); },",
    "  async close() {},",
    "});",
    `await drainDeadSpoolFiles({ spoolDirectory: ${JSON.stringify(directory)}, databaseSink: sink });`,
    "process.stdout.write(JSON.stringify(calls));",
  ].join("\n");
  const child = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", program],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 10_000,
    },
  );
  expect(
    child.status,
    ["stdout=", child.stdout, "\nstderr=", child.stderr].join(""),
  ).toBe(0);
  expect(child.stderr).toBe("");
  return JSON.parse(child.stdout) as readonly string[];
}

function runConcurrentInstaller(
  runtime: "api" | "runner" | "scheduler",
  directory: string,
): Promise<Readonly<{ status: number | null; stderr: string }>> {
  return new Promise((resolveChild) => {
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        `await import("@debateai/obs-capture/install/${runtime}"); process.exit(7);`,
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NODE_NO_WARNINGS: "1",
          OBS_SPOOL_DIR: realpathSync(directory),
        },
        stdio: ["ignore", "ignore", "pipe"],
      },
    );
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("close", (status) => resolveChild({ status, stderr }));
  });
}

function expectedStagingPath(sourcePath: string): string {
  const digest = createHash("sha256")
    .update(readFileSync(sourcePath))
    .digest("hex");
  return join(
    resolve(sourcePath, ".."),
    `.${basename(sourcePath)}.completion-${digest}.stage`,
  );
}

describe.sequential("FIX-01 C4 indexed recovery protocol", () => {
  it("resynchronizes every bounded partial append prefix before later successful producers", async () => {
    const failedName = orderedSpoolName(7_200);
    const failedRecord = Buffer.from(`\n${failedName}\n`, "utf8");

    for (let prefixLength = 0; prefixLength < failedRecord.length; prefixLength += 1) {
      const directory = createShortScratchDirectory();
      appendFileSync(
        join(directory, SPOOL_INDEX_NAME),
        failedRecord.subarray(0, prefixLength),
        { mode: 0o600 },
      );
      const installed = await runConcurrentInstaller("scheduler", directory);
      expect(installed).toEqual({ status: 7, stderr: "" });
      const spoolName = readdirSync(directory).find((name) =>
        INDEXED_SPOOL_NAME.test(name)
      );
      expect(spoolName).toBeDefined();
      expect(readFileSync(join(directory, spoolName!)).length).toBeGreaterThan(0);

      const result = recordingSink();
      await drainWithSink(directory, result.sink, false);
      expect(result.calls).toHaveLength(1);
    }
  }, 60_000);

  it.each([
    { label: "empty", victimBytes: Buffer.alloc(0) },
    {
      label: "short",
      victimBytes: Buffer.from("DO-NOT-MUTATE-INDEX\n", "utf8"),
    },
    {
      label: "cursor-sized",
      victimBytes: Buffer.alloc(SPOOL_CURSOR_BYTES, 0x49),
    },
  ])("never appends through a hardlinked reserved index: $label", ({ victimBytes }) => {
    const directory = createScratchDirectory();
    const victimPath = join(directory, "index-victim");
    const indexPath = join(directory, SPOOL_INDEX_NAME);
    writeFileSync(victimPath, victimBytes, { mode: 0o600 });
    linkSync(victimPath, indexPath);

    expect(() => appendSpoolIndexBasename({
      directory,
      basename: orderedSpoolName(7_300),
    })).toThrow("SPOOL_INDEX_NOT_UNIQUE");

    expect(readFileSync(victimPath)).toEqual(victimBytes);
    expect(readFileSync(indexPath)).toEqual(victimBytes);
    expect(statSync(victimPath).nlink).toBe(2);
  });

  it.each([
    { label: "empty", victimBytes: Buffer.alloc(0) },
    {
      label: "short",
      victimBytes: Buffer.from("DO-NOT-MUTATE-CURSOR\n", "utf8"),
    },
    {
      label: "exact-size",
      victimBytes: Buffer.alloc(SPOOL_CURSOR_BYTES, 0x43),
    },
    {
      label: "oversized",
      victimBytes: Buffer.alloc(SPOOL_CURSOR_BYTES + 1, 0x44),
    },
  ])("never resizes or writes through a hardlinked reserved cursor: $label", async ({ victimBytes }) => {
    const directory = createScratchDirectory();
    const name = orderedSpoolName(7_400);
    appendSpoolIndexBasename({ directory, basename: name });
    const victimPath = join(directory, "cursor-victim");
    const cursorPath = join(directory, SPOOL_CURSOR_NAME);
    writeFileSync(victimPath, victimBytes, { mode: 0o600 });
    linkSync(victimPath, cursorPath);

    expect(await readIndexedSpoolPage(directory)).toEqual([]);
    expect(readFileSync(victimPath)).toEqual(victimBytes);
    expect(readFileSync(cursorPath)).toEqual(victimBytes);
    expect(statSync(victimPath).nlink).toBe(2);
  });

  it("creates a fresh cursor with an exclusive no-follow open before mutation", () => {
    const directory = createScratchDirectory();
    const name = orderedSpoolName(7_450);
    appendSpoolIndexBasename({ directory, basename: name });
    const flagsPath = join(directory, "cursor-open-flags");
    const promisesModule = [
      'import { appendFileSync } from "node:fs";',
      'import * as fs from "node:fs/promises";',
      "export const lstat = fs.lstat;",
      "export async function open(path, flags, mode) {",
      `  if (String(path).endsWith(${JSON.stringify(SPOOL_CURSOR_NAME)})) appendFileSync(${JSON.stringify(flagsPath)}, String(flags) + "\\n");`,
      "  return fs.open(path, flags, mode);",
      "}",
    ].join("\n");
    const promisesUrl = `data:text/javascript,${encodeURIComponent(promisesModule)}`;
    const loaderUrl = `data:text/javascript,${encodeURIComponent([
      "export function resolve(specifier, context, nextResolve) {",
      '  if (specifier === "node:fs/promises" && context.parentURL?.includes("/packages/obs-capture/src/spool-index.ts")) {',
      `    return { url: ${JSON.stringify(promisesUrl)}, shortCircuit: true };`,
      "  }",
      "  return nextResolve(specifier, context);",
      "}",
    ].join("\n"))}`;
    const indexUrl = pathToFileURL(resolve(
      process.cwd(),
      "packages/obs-capture/src/spool-index.ts",
    )).href;
    const child = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--experimental-loader",
        loaderUrl,
        "--input-type=module",
        "-e",
        `const { readIndexedSpoolPage } = await import(${JSON.stringify(indexUrl)}); await readIndexedSpoolPage(${JSON.stringify(directory)});`,
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, NODE_NO_WARNINGS: "1" },
        timeout: 10_000,
      },
    );
    expect(child.status, `stdout=${child.stdout}\nstderr=${child.stderr}`).toBe(0);
    expect(child.stderr).toBe("");
    const firstFlags = Number(readFileSync(flagsPath, "utf8").trim().split("\n")[0]);
    expect(firstFlags & constants.O_CREAT).toBe(constants.O_CREAT);
    expect(firstFlags & constants.O_EXCL).toBe(constants.O_EXCL);
    expect(firstFlags & constants.O_NOFOLLOW).toBe(constants.O_NOFOLLOW);
  });

  it("rejects an index that gains another link during its append", () => {
    const directory = createScratchDirectory();
    const indexPath = join(directory, SPOOL_INDEX_NAME);
    const extraLink = join(directory, "index-race-link");
    const fsModule = [
      'import * as fs from "node:fs";',
      "export const closeSync = fs.closeSync;",
      "export const constants = fs.constants;",
      "export const fstatSync = fs.fstatSync;",
      "export const fsyncSync = fs.fsyncSync;",
      "export const lstatSync = fs.lstatSync;",
      "export const openSync = fs.openSync;",
      "export function writeSync(fd, buffer, offset, length) {",
      "  const written = fs.writeSync(fd, buffer, offset, length);",
      `  fs.linkSync(${JSON.stringify(indexPath)}, ${JSON.stringify(extraLink)});`,
      "  return written;",
      "}",
    ].join("\n");
    const fsUrl = `data:text/javascript,${encodeURIComponent(fsModule)}`;
    const loaderUrl = `data:text/javascript,${encodeURIComponent([
      "export function resolve(specifier, context, nextResolve) {",
      '  if (specifier === "node:fs" && context.parentURL?.includes("/packages/obs-capture/src/spool-index.ts")) {',
      `    return { url: ${JSON.stringify(fsUrl)}, shortCircuit: true };`,
      "  }",
      "  return nextResolve(specifier, context);",
      "}",
    ].join("\n"))}`;
    const indexUrl = pathToFileURL(resolve(
      process.cwd(),
      "packages/obs-capture/src/spool-index.ts",
    )).href;
    const child = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--experimental-loader",
        loaderUrl,
        "--input-type=module",
        "-e",
        `const { appendSpoolIndexBasename } = await import(${JSON.stringify(indexUrl)}); try { appendSpoolIndexBasename({ directory: ${JSON.stringify(directory)}, basename: ${JSON.stringify(orderedSpoolName(7_460))} }); process.stdout.write("NO_ERROR"); } catch (error) { process.stdout.write(String(error.message)); }`,
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, NODE_NO_WARNINGS: "1" },
        timeout: 10_000,
      },
    );
    expect(child.status, `stdout=${child.stdout}\nstderr=${child.stderr}`).toBe(0);
    expect(child.stderr).toBe("");
    expect(child.stdout).toBe("SPOOL_INDEX_IDENTITY_CHANGED");
    expect(readFileSync(extraLink)).toEqual(readFileSync(indexPath));
    expect(statSync(indexPath).nlink).toBe(2);
  });

  it("rejects a cursor that gains another link during its positional write", () => {
    const directory = createScratchDirectory();
    const name = orderedSpoolName(7_465);
    appendSpoolIndexBasename({ directory, basename: name });
    const cursorPath = join(directory, SPOOL_CURSOR_NAME);
    const extraLink = join(directory, "cursor-race-link");
    const promisesModule = [
      'import { linkSync } from "node:fs";',
      'import * as fs from "node:fs/promises";',
      "export const lstat = fs.lstat;",
      "export async function open(path, flags, mode) {",
      "  const handle = await fs.open(path, flags, mode);",
      `  if (!String(path).endsWith(${JSON.stringify(SPOOL_CURSOR_NAME)})) return handle;`,
      "  return new Proxy(handle, {",
      "    get(target, property) {",
      "      if (property === \"write\") return async (...args) => {",
      "        const result = await target.write(...args);",
      `        linkSync(${JSON.stringify(cursorPath)}, ${JSON.stringify(extraLink)});`,
      "        return result;",
      "      };",
      "      const value = Reflect.get(target, property, target);",
      "      return typeof value === \"function\" ? value.bind(target) : value;",
      "    },",
      "  });",
      "}",
    ].join("\n");
    const promisesUrl = `data:text/javascript,${encodeURIComponent(promisesModule)}`;
    const loaderUrl = `data:text/javascript,${encodeURIComponent([
      "export function resolve(specifier, context, nextResolve) {",
      '  if (specifier === "node:fs/promises" && context.parentURL?.includes("/packages/obs-capture/src/spool-index.ts")) {',
      `    return { url: ${JSON.stringify(promisesUrl)}, shortCircuit: true };`,
      "  }",
      "  return nextResolve(specifier, context);",
      "}",
    ].join("\n"))}`;
    const indexUrl = pathToFileURL(resolve(
      process.cwd(),
      "packages/obs-capture/src/spool-index.ts",
    )).href;
    const child = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--experimental-loader",
        loaderUrl,
        "--input-type=module",
        "-e",
        `const { readIndexedSpoolPage } = await import(${JSON.stringify(indexUrl)}); process.stdout.write(JSON.stringify(await readIndexedSpoolPage(${JSON.stringify(directory)})));`,
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, NODE_NO_WARNINGS: "1" },
        timeout: 10_000,
      },
    );
    expect(child.status, `stdout=${child.stdout}\nstderr=${child.stderr}`).toBe(0);
    expect(child.stderr).toBe("");
    expect(JSON.parse(child.stdout)).toEqual([]);
    expect(readFileSync(extraLink)).toEqual(readFileSync(cursorPath));
    expect(statSync(cursorPath).nlink).toBe(2);
  });

  it("fills bounded cursor buffers across legal short regular-file reads", () => {
    const directory = createScratchDirectory();
    const name = orderedSpoolName(7_475);
    appendSpoolIndexBasename({ directory, basename: name });
    const promisesModule = [
      'import * as fs from "node:fs/promises";',
      "export const lstat = fs.lstat;",
      "export async function open(path, flags, mode) {",
      "  const handle = await fs.open(path, flags, mode);",
      `  if (!String(path).endsWith(${JSON.stringify(SPOOL_CURSOR_NAME)})) return handle;`,
      "  return new Proxy(handle, {",
      "    get(target, property) {",
      "      if (property === \"read\") return (buffer, offset, length, position) => target.read(buffer, offset, Math.min(length, 17), position);",
      "      const value = Reflect.get(target, property, target);",
      "      return typeof value === \"function\" ? value.bind(target) : value;",
      "    },",
      "  });",
      "}",
    ].join("\n");
    const promisesUrl = `data:text/javascript,${encodeURIComponent(promisesModule)}`;
    const loaderUrl = `data:text/javascript,${encodeURIComponent([
      "export function resolve(specifier, context, nextResolve) {",
      '  if (specifier === "node:fs/promises" && context.parentURL?.includes("/packages/obs-capture/src/spool-index.ts")) {',
      `    return { url: ${JSON.stringify(promisesUrl)}, shortCircuit: true };`,
      "  }",
      "  return nextResolve(specifier, context);",
      "}",
    ].join("\n"))}`;
    const indexUrl = pathToFileURL(resolve(
      process.cwd(),
      "packages/obs-capture/src/spool-index.ts",
    )).href;
    const child = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--experimental-loader",
        loaderUrl,
        "--input-type=module",
        "-e",
        `const { readIndexedSpoolPage } = await import(${JSON.stringify(indexUrl)}); process.stdout.write(JSON.stringify(await readIndexedSpoolPage(${JSON.stringify(directory)})));`,
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, NODE_NO_WARNINGS: "1" },
        timeout: 10_000,
      },
    );
    expect(child.status, `stdout=${child.stdout}\nstderr=${child.stderr}`).toBe(0);
    expect(child.stderr).toBe("");
    expect(JSON.parse(child.stdout)).toEqual([name]);
  });

  it("does fresh-process DB and receipt work despite an identical marker", async () => {
    const directory = createScratchDirectory();
    const envelope = safeEnvelope("scheduler");
    const path = join(directory, spoolName("scheduler", DEAD_PID));
    writeEnvelope(path, envelope);
    copyFileSync(path, `${path}.ingested`);
    expect(runCaptureRuntime(directory))
      .toEqual({ armed: true, scheduled: 1, cleared: 1 });
    const persisted = await database.pool.query<{
      occurrence_count: number;
      receipt_count: number;
    }>(
      `SELECT
         (SELECT count(*)::int
            FROM obs.occurrence
           WHERE source_event_ref = $1) AS occurrence_count,
         (SELECT count(*)::int
            FROM obs.spool_receipt
           WHERE spool_ref = $1) AS receipt_count`,
      [envelope.source_event_ref],
    );
    expect(persisted.rows).toEqual([{
      occurrence_count: 1,
      receipt_count: 1,
    }]);
    expect(readFileSync(path)).toEqual(readFileSync(`${path}.ingested`));
  });

  it("publishes a canonical completion only from a synced deterministic stage", async () => {
    const directory = createScratchDirectory();
    const envelope = safeEnvelope("scheduler");
    const path = join(directory, spoolName("scheduler", DEAD_PID));
    writeEnvelope(path, envelope);
    const stagePath = expectedStagingPath(path);

    await drainWithSink(directory, recordingSink().sink);

    expect(readFileSync(stagePath)).toEqual(readFileSync(path));
    expect(readFileSync(`${path}.ingested`)).toEqual(readFileSync(path));
    expect(statSync(stagePath).ino).toBe(statSync(`${path}.ingested`).ino);
    expect(existsSync(path)).toBe(true);
  });

  it("resumes a completion left staged by a crash before publication", async () => {
    const directory = createScratchDirectory();
    const envelope = safeEnvelope("scheduler");
    const path = join(directory, spoolName("scheduler", DEAD_PID));
    writeEnvelope(path, envelope);
    const stagePath = expectedStagingPath(path);
    writeFileSync(stagePath, readFileSync(path), { mode: 0o600 });
    const result = recordingSink();

    await drainWithSink(directory, result.sink);

    expect(result.calls.map((entry) => entry.source_event_ref)).toEqual([
      envelope.source_event_ref,
    ]);
    expect(readFileSync(`${path}.ingested`)).toEqual(readFileSync(path));
    expect(statSync(stagePath).ino).toBe(statSync(`${path}.ingested`).ino);
  });

  it("advances fresh processes across 400 conflicting completion paths", () => {
    const directory = createScratchDirectory();
    const entries = Array.from({ length: 400 }, (_, index) => {
      const envelope = safeEnvelope("scheduler");
      const path = join(directory, orderedSpoolName(index + 4_000));
      writeEnvelope(path, envelope);
      writeFileSync(`${path}.ingested`, "PARTIAL-CONFLICT\n", { mode: 0o600 });
      return { envelope, path };
    });
    ensureCurrentSpoolsIndexed(directory);
    const calls: string[] = [];

    for (let start = 0; start < 12; start += 1) {
      calls.push(...runFreshIndexedDrain(directory));
    }

    expect(new Set(calls).size).toBe(400);
    for (const { path } of entries) {
      expect(readFileSync(`${path}.ingested`, "utf8"))
        .toBe("PARTIAL-CONFLICT\n");
      expect(existsSync(path)).toBe(true);
    }
  }, 30_000);

  it("uses a bounded durable cursor across fresh processes and recovers corruption", () => {
    const directory = createScratchDirectory();
    for (let index = 0; index < 130; index += 1) {
      appendIndexRecord(directory, `junk-${index}`);
    }
    for (let index = 0; index < 130; index += 1) {
      appendIndexRecord(directory, orderedSpoolName(index + 5_000));
    }
    const entries = Array.from({ length: 80 }, (_, index) => {
      const envelope = safeEnvelope("scheduler");
      const name = orderedSpoolName(index + 6_000);
      writeEnvelope(join(directory, name), envelope);
      appendIndexRecord(directory, name);
      return envelope;
    });
    const perStart: string[][] = [];
    for (let start = 0; start < 8; start += 1) {
      perStart.push([...runFreshIndexedDrain(directory)]);
    }
    expect(perStart.slice(0, 4).every((calls) => calls.length === 0)).toBe(true);
    expect(perStart.every((calls) => calls.length <= MAX_ELIGIBLE_FILES_PER_START))
      .toBe(true);
    const cursorPath = join(directory, SPOOL_CURSOR_NAME);
    expect(statSync(cursorPath).size).toBe(SPOOL_CURSOR_BYTES);

    writeFileSync(cursorPath, "CORRUPT-FORGED-CURSOR", { mode: 0o600 });
    for (let start = 0; start < 12; start += 1) {
      perStart.push([...runFreshIndexedDrain(directory)]);
    }

    const allCalls = perStart.flat();
    expect(new Set(allCalls)).toEqual(
      new Set(entries.map((entry) => entry.source_event_ref)),
    );
    expect(allCalls.length).toBeGreaterThan(entries.length);
    expect(statSync(cursorPath).size).toBe(SPOOL_CURSOR_BYTES);
  }, 60_000);

  it("does not skip a lawful index record split across the bounded read page", () => {
    const directory = createScratchDirectory();
    const envelope = safeEnvelope("scheduler");
    const name = orderedSpoolName(7_000);
    writeEnvelope(join(directory, name), envelope);
    appendFileSync(
      join(directory, SPOOL_INDEX_NAME),
      `${"x".repeat(8_150)}\n${name}\n`,
      { encoding: "utf8", mode: 0o600 },
    );

    const calls = Array.from({ length: 4 }, () => runFreshIndexedDrain(directory))
      .flat();

    expect(calls).toContain(envelope.source_event_ref);
  });

  it("discards a valid-looking suffix inside an overlong index record", () => {
    const directory = createScratchDirectory();
    const hidden = safeEnvelope("scheduler");
    const later = safeEnvelope("scheduler");
    const hiddenName = orderedSpoolName(7_050);
    const laterName = orderedSpoolName(7_051);
    writeEnvelope(join(directory, hiddenName), hidden);
    writeEnvelope(join(directory, laterName), later);
    appendFileSync(
      join(directory, SPOOL_INDEX_NAME),
      `${"x".repeat(8_192)}${hiddenName}\n${laterName}\n`,
      { encoding: "utf8", mode: 0o600 },
    );

    const calls = Array.from({ length: 4 }, () => runFreshIndexedDrain(directory))
      .flat();

    expect(calls).toContain(later.source_event_ref);
    expect(calls).not.toContain(hidden.source_event_ref);
  });

  it("recovers a checksummed maximum-sequence scheduling cursor", () => {
    const directory = createScratchDirectory();
    const envelope = safeEnvelope("scheduler");
    const name = orderedSpoolName(7_100);
    writeEnvelope(join(directory, name), envelope);
    appendIndexRecord(directory, name);
    const indexStat = statSync(join(directory, SPOOL_INDEX_NAME), { bigint: true });
    const fields = {
      version: 1,
      sequence: Number.MAX_SAFE_INTEGER,
      index_dev: indexStat.dev.toString(),
      index_ino: indexStat.ino.toString(),
      offset: 0,
    } as const;
    const record = {
      ...fields,
      checksum: createHash("sha256")
        .update([
          String(fields.version),
          String(fields.sequence),
          fields.index_dev,
          fields.index_ino,
          String(fields.offset),
        ].join("\n"))
        .digest("hex"),
    };
    const cursor = Buffer.alloc(SPOOL_CURSOR_BYTES);
    Buffer.from(JSON.stringify(record), "utf8").copy(cursor);
    writeFileSync(join(directory, SPOOL_CURSOR_NAME), cursor, { mode: 0o600 });

    expect(runFreshIndexedDrain(directory)).toEqual([
      envelope.source_event_ref,
    ]);
  });

  it("leaves unindexed legacy files untouched and never enumerates the directory", async () => {
    const directory = createScratchDirectory();
    const envelope = safeEnvelope("scheduler");
    const path = join(directory, spoolName("scheduler", DEAD_PID));
    writeEnvelope(path, envelope);
    const result = recordingSink();

    await drainWithSink(directory, result.sink, false);

    expect(result.calls).toHaveLength(0);
    expect(existsSync(`${path}.ingested`)).toBe(false);
    expect(readFileSync(path, "utf8")).toBe(serializedEnvelope(envelope));
    const drainSource = readFileSync(
      resolve(process.cwd(), "packages/obs-capture/src/runtime/drain.ts"),
      "utf8",
    );
    expect(drainSource).not.toMatch(/\b(?:opendir|readdir)\b/u);
  });

  it("records concurrent installer basenames atomically and creates no unindexed spool", async () => {
    const directory = createScratchDirectory();
    const children = await Promise.all(Array.from(
      { length: 18 },
      (_, index) => runConcurrentInstaller(
        (["api", "runner", "scheduler"] as const)[index % 3] as
          "api" | "runner" | "scheduler",
        directory,
      ),
    ));
    expect(children.every((child) => child.status === 7 && child.stderr === ""))
      .toBe(true);
    const spoolNames = readdirSync(directory)
      .filter((name) => INDEXED_SPOOL_NAME.test(name))
      .sort();
    const indexLines = readFileSync(join(directory, SPOOL_INDEX_NAME), "utf8")
      .split("\n")
      .filter((line) => line.length > 0)
      .sort();
    expect(spoolNames).toHaveLength(18);
    expect(indexLines).toEqual(spoolNames);

    const blockedDirectory = createScratchDirectory();
    mkdirSync(join(blockedDirectory, SPOOL_INDEX_NAME));
    const blocked = await runConcurrentInstaller("scheduler", blockedDirectory);
    expect(blocked).toEqual({ status: 7, stderr: "" });
    const unindexed = readdirSync(blockedDirectory).filter((name) =>
      INDEXED_SPOOL_NAME.test(name)
    );
    expect(unindexed).toHaveLength(1);
    expect(readFileSync(join(blockedDirectory, unindexed[0]!))).toHaveLength(0);
  }, 60_000);

  it("refuses to arm a spool whose indexed pathname was replaced", () => {
    const directory = createScratchDirectory();
    const runtimeMarker = join(directory, "runtime-spool-fd.json");
    const replacementModule = [
      'import { appendFileSync, renameSync, writeFileSync } from "node:fs";',
      'export function appendSpoolIndexBasename({ directory, basename }) {',
      `  const path = directory + "/" + basename;`,
      `  appendFileSync(directory + "/${SPOOL_INDEX_NAME}", basename + "\\n", { mode: 0o600 });`,
      '  renameSync(path, path + ".displaced");',
      '  writeFileSync(path, "ATTACKER-REPLACEMENT\\n", { mode: 0o600 });',
      '}',
    ].join("\n");
    const replacementUrl = `data:text/javascript,${encodeURIComponent(replacementModule)}`;
    const runtimeModule = [
      'import { writeFileSync } from "node:fs";',
      'export function startCaptureRuntime({ spoolFd, installExitSink }) {',
      `  writeFileSync(${JSON.stringify(runtimeMarker)}, JSON.stringify({ hasSpoolFd: spoolFd !== undefined }));`,
      "  installExitSink(() => undefined);",
      "}",
    ].join("\n");
    const runtimeUrl = `data:text/javascript,${encodeURIComponent(runtimeModule)}`;
    const loaderUrl = `data:text/javascript,${encodeURIComponent([
      "export function resolve(specifier, context, nextResolve) {",
      '  if (specifier.includes("spool-index") && context.parentURL?.includes("/packages/obs-capture/install/scheduler.ts")) {',
      `    return { url: ${JSON.stringify(replacementUrl)}, shortCircuit: true };`,
      "  }",
      '  if (specifier === "@debateai/obs-capture/runtime") {',
      `    return { url: ${JSON.stringify(runtimeUrl)}, shortCircuit: true };`,
      "  }",
      "  return nextResolve(specifier, context);",
      "}",
    ].join("\n"))}`;
    const child = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--experimental-loader",
        loaderUrl,
        "--input-type=module",
        "-e",
        'await import("@debateai/obs-capture/install/scheduler"); await new Promise((resolve) => setTimeout(resolve, 50)); process.exit(7);',
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          NODE_NO_WARNINGS: "1",
          OBS_SPOOL_DIR: realpathSync(directory),
        },
      },
    );

    expect(child.status, `stdout=${child.stdout}\nstderr=${child.stderr}`).toBe(7);
    expect(child.stderr).toBe("");
    expect(JSON.parse(readFileSync(runtimeMarker, "utf8"))).toEqual({
      hasSpoolFd: false,
    });
    const indexedName = readFileSync(join(directory, SPOOL_INDEX_NAME), "utf8")
      .trimEnd();
    expect(readFileSync(join(directory, indexedName), "utf8"))
      .toBe("ATTACKER-REPLACEMENT\n");
    expect(readFileSync(join(directory, `${indexedName}.displaced`)))
      .toHaveLength(0);
  });
});
