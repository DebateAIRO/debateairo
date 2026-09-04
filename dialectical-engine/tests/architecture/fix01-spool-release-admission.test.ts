import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  chmodSync,
  closeSync,
  constants,
  existsSync,
  ftruncateSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { PostRedactionEnvelope } from "../../packages/obs-capture/src/redactor.js";
import { drainDeadSpoolFiles } from "../../packages/obs-capture/src/runtime/drain.js";
import type { PostgresCaptureSink } from "../../packages/obs-capture/src/runtime/sink.js";
import {
  appendSpoolIndexBasename,
  readIndexedSpoolPage,
} from "../../packages/obs-capture/src/spool-index.js";

const TOOL_PATH = resolve(
  process.cwd(),
  "tools/obs-spool-release-admission.ts",
);
const GATE_TOOL_PATH = resolve(
  process.cwd(),
  "tools/obs-spool-launch-gate.ts",
);
const INDEX_NAME = ".obs-spool-index-v1";
const CURSOR_NAME = ".obs-spool-cursor-v1";
const BUILD_REF = "597f68b869413a33adfbc1f835184d469d9161bd";
const DEAD_PID = 2_147_483_647;
const GATE_MANIFEST_MAX_BYTES = 8 * 1024 * 1024;
const roots: string[] = [];

interface AdmissionResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

interface ManifestEntry {
  readonly basename: string;
  readonly kind: "candidate" | "reserved" | "rejected_unsafe_path";
  readonly classification:
    | "lawful_empty"
    | "lawful_envelopes"
    | "retained_invalid_bytes"
    | "reserved_metadata"
    | "rejected_unsafe_path";
  readonly indexed: boolean;
  readonly reason: string | null;
  readonly sha256: string | null;
  readonly dev: string | null;
  readonly ino: string | null;
  readonly nlink: number | null;
  readonly size: number | null;
  readonly mtime_ns: string | null;
  readonly ctime_ns: string | null;
}

interface AdmissionManifest {
  readonly version: 2;
  readonly verdict: "PASS_EMPTY" | "PASS_INDEXED";
  readonly phase: "before_first_indexed_launch";
  readonly spool_directory_realpath: string;
  readonly target_build_ref: string;
  readonly verifier_version: string;
  readonly admission_ref: string;
  readonly admission_record_count: number;
  readonly first_snapshot_sha256: string;
  readonly second_snapshot_sha256: string;
  readonly source_entry_count: number;
  readonly candidate_count: number;
  readonly lawful_count: number;
  readonly indexed_candidate_count: number;
  readonly rejected_count: number;
  readonly requires_v_review: boolean;
  readonly entries: readonly ManifestEntry[];
  readonly index: null | Readonly<{
    basename: typeof INDEX_NAME;
    dev: string;
    ino: string;
    nlink: 1;
    size: number;
    sha256: string;
    covered_lawful_count: number;
  }>;
}

interface AdmissionSeal {
  readonly version: 1;
  readonly admissionRef: string;
  readonly manifestSha256: string;
  readonly indexDev: string;
  readonly indexIno: string;
  readonly prefixBytes: number;
}

function scratch(label: string): string {
  const root = mkdtempSync(join(tmpdir(), `fix01-admission-${label}-`));
  mkdirSync(join(root, "spool"), { mode: 0o700 });
  roots.push(root);
  return root;
}

function commandArgs(
  spoolDirectory: string,
  manifestPath: string,
): readonly string[] {
  return [
    "--import",
    "tsx",
    TOOL_PATH,
    "--spool-dir",
    spoolDirectory,
    "--build-ref",
    BUILD_REF,
    "--manifest",
    manifestPath,
  ];
}

function runAdmission(
  spoolDirectory: string,
  manifestPath: string,
): AdmissionResult {
  const child = spawnSync(
    process.execPath,
    commandArgs(spoolDirectory, manifestPath),
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, NODE_NO_WARNINGS: "1" },
      timeout: 20_000,
    },
  );
  return {
    status: child.status,
    stdout: child.stdout,
    stderr: child.stderr,
  };
}

function gateArgs(
  spoolDirectory: string,
  manifestPath: string,
  manifestSha256: string,
  buildRef = BUILD_REF,
): readonly string[] {
  return [
    "--import",
    "tsx",
    GATE_TOOL_PATH,
    "--spool-dir",
    spoolDirectory,
    "--build-ref",
    buildRef,
    "--manifest",
    manifestPath,
    "--manifest-sha256",
    manifestSha256,
  ];
}

function runGate(
  spoolDirectory: string,
  manifestPath: string,
  manifestSha256: string,
  buildRef = BUILD_REF,
): AdmissionResult {
  const child = spawnSync(
    process.execPath,
    gateArgs(spoolDirectory, manifestPath, manifestSha256, buildRef),
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, NODE_NO_WARNINGS: "1" },
      timeout: 20_000,
    },
  );
  return {
    status: child.status,
    stdout: child.stdout,
    stderr: child.stderr,
  };
}

async function runAdmissionAsync(
  spoolDirectory: string,
  manifestPath: string,
): Promise<AdmissionResult> {
  const child = spawn(
    process.execPath,
    commandArgs(spoolDirectory, manifestPath),
    {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NODE_NO_WARNINGS: "1" },
    },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  const status = await new Promise<number | null>((settle, reject) => {
    child.once("error", reject);
    child.once("close", settle);
  });
  return { status, stdout, stderr };
}

function runAdmissionWithPidTransition(
  spoolDirectory: string,
  manifestPath: string,
  markerPath: string,
): AdmissionResult {
  const toolUrl = pathToFileURL(TOOL_PATH).href;
  const argv = [
    process.execPath,
    TOOL_PATH,
    "--spool-dir",
    spoolDirectory,
    "--build-ref",
    BUILD_REF,
    "--manifest",
    manifestPath,
  ];
  const program = [
    'import { appendFileSync } from "node:fs";',
    "let probes = 0;",
    "process.kill = () => {",
    "  probes += 1;",
    `  appendFileSync(${JSON.stringify(markerPath)}, "x");`,
    "  if (probes === 1) {",
    '    const error = new Error("modeled ESRCH");',
    '    error.code = "ESRCH";',
    "    throw error;",
    "  }",
    "  return true;",
    "};",
    `process.argv = ${JSON.stringify(argv)};`,
    `await import(${JSON.stringify(toolUrl)});`,
  ].join("\n");
  const child = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", program],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, NODE_NO_WARNINGS: "1" },
      timeout: 20_000,
    },
  );
  return {
    status: child.status,
    stdout: child.stdout,
    stderr: child.stderr,
  };
}

function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function admissionProof(
  admissionRef: string,
  name: string,
  entry: Pick<
    ManifestEntry,
    "dev" | "ino" | "nlink" | "size" | "mtime_ns" | "ctime_ns" | "sha256"
  >,
): string {
  return createHash("sha256")
    .update([
      "FIX01-SPOOL-ADMISSION-PROOF-V1",
      admissionRef,
      name,
      entry.dev,
      entry.ino,
      String(entry.nlink),
      String(entry.size),
      entry.mtime_ns,
      entry.ctime_ns,
      entry.sha256,
    ].join("\u0000"))
    .digest("base64url");
}

function admissionRecord(
  admissionRef: string,
  entry: ManifestEntry,
): string {
  return `A1\t${entry.basename}\t${admissionProof(
    admissionRef,
    entry.basename,
    entry,
  )}`;
}

function gateSeal(output: string): AdmissionSeal | undefined {
  const encoded = /(?:^|\n)FIX01_SPOOL_LAUNCH_GATE PASS seal=([^\n]+)\n?$/u
    .exec(output)?.[1];
  if (encoded === undefined) return undefined;
  const [version, admissionRef, manifestSha256, indexDev, indexIno, prefix] =
    encoded.split(".");
  const prefixBytes = Number(prefix);
  if (
    version !== "1"
    || admissionRef === undefined
    || manifestSha256 === undefined
    || indexDev === undefined
    || indexIno === undefined
    || !Number.isSafeInteger(prefixBytes)
  ) {
    return undefined;
  }
  return {
    version: 1,
    admissionRef,
    manifestSha256,
    indexDev,
    indexIno,
    prefixBytes,
  };
}

async function drainWithAdmissionSeal(options: {
  readonly spoolDirectory: string;
  readonly databaseSink: PostgresCaptureSink;
  readonly admissionSeal: AdmissionSeal | undefined;
}): Promise<void> {
  await drainDeadSpoolFiles(options as Parameters<typeof drainDeadSpoolFiles>[0]);
}

function recordingAdmissionSink(): Readonly<{
  calls: string[];
  sink: PostgresCaptureSink;
}> {
  const calls: string[] = [];
  const sink: PostgresCaptureSink = {
    async writeOccurrences(): Promise<void> {},
    async writeCaptureGap(): Promise<void> {},
    async ingestSpooledOccurrence(value: PostRedactionEnvelope): Promise<void> {
      calls.push(value.source_event_ref);
    },
    async close(): Promise<void> {},
  };
  return { calls, sink };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Readonly<Record<string, unknown>>;
    return `{${Object.keys(record).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(record[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function parseManifest(path: string): AdmissionManifest {
  return JSON.parse(readFileSync(path, "utf8")) as AdmissionManifest;
}

function spoolName(sequence: number, pid = DEAD_PID): string {
  return `scheduler-${pid}-00000000-0000-4000-8000-${sequence
    .toString(16)
    .padStart(12, "0")}.spool`;
}

function envelope(sourceEventRef: string): Readonly<Record<string, unknown>> {
  const runtime = "scheduler";
  const code = "OBS_CAPTURE_SELF";
  const taxonomy = "CAPTURE_SELF";
  const componentPackage = "@debateai/scheduler";
  return Object.freeze({
    occurred_at: "2026-09-04T00:00:00.000Z",
    environment: "test",
    build_ref: BUILD_REF,
    build_dirty: false,
    runtime,
    component: Object.freeze({ process: runtime, package: componentPackage }),
    capture_point: "self",
    code,
    taxonomy_class: taxonomy,
    severity: "DEGRADED",
    condition_mark: null,
    disposition: "SELF",
    fingerprint: sha256(
      `v1\u0000${code}\u0000${taxonomy}\u0000${runtime}\u0000${componentPackage}`,
    ),
    fingerprint_version: 1,
    redaction_policy_version: "g0",
    allowlist_set_id: "g0-empty-parameters",
    fallback_minimized: false,
    run_ref: "UNKNOWN:DECLARED_KIND_REQUIRED",
    work_item_ref: "UNKNOWN:DECLARED_KIND_REQUIRED",
    node_ref: "UNKNOWN:DECLARED_KIND_REQUIRED",
    attempt_ref: "UNKNOWN:DECLARED_KIND_REQUIRED",
    ledger_ref: "UNKNOWN:DECLARED_KIND_REQUIRED",
    parent_occurrence_ref: "NO_CAUSE",
    cause_relation: null,
    at_seq_watermark: "UNKNOWN:DECLARED_KIND_REQUIRED",
    frames: Object.freeze([]),
    safe_template_id: "tpl.OBS_CAPTURE_SELF",
    template_parameters: Object.freeze({}),
    source: "first_party",
    source_event_ref: sourceEventRef,
    zone_context: false,
    attempt_index: null,
    writer_identity: runtime,
  });
}

function manifestDigestFromOutput(output: string): string | undefined {
  return /manifest_sha256=([0-9a-f]{64})/u.exec(output)?.[1];
}

afterEach(() => {
  vi.restoreAllMocks();
  while (roots.length > 0) {
    const root = roots.pop();
    if (root !== undefined) rmSync(root, { force: true, recursive: true });
  }
});

describe("FIX-01 offline spool release admission", () => {
  it("emits canonical PASS_EMPTY evidence for a physically empty directory", () => {
    const root = scratch("empty");
    const spoolDirectory = realpathSync(join(root, "spool"));
    const manifestPath = join(root, "manifest.json");
    const result = runAdmission(spoolDirectory, manifestPath);

    expect(result.status, result.stderr).toBe(0);
    const bytes = readFileSync(manifestPath);
    const manifest = parseManifest(manifestPath);
    expect(bytes.toString("utf8")).toBe(canonicalJson(manifest));
    expect(manifestDigestFromOutput(result.stdout)).toBe(sha256(bytes));
    expect(manifest).toMatchObject({
      version: 2,
      verdict: "PASS_EMPTY",
      phase: "before_first_indexed_launch",
      spool_directory_realpath: spoolDirectory,
      target_build_ref: BUILD_REF,
      admission_ref: expect.stringMatching(/^[0-9a-f]{64}$/u),
      admission_record_count: 0,
      first_snapshot_sha256: manifest.second_snapshot_sha256,
      source_entry_count: 0,
      candidate_count: 0,
      lawful_count: 0,
      indexed_candidate_count: 0,
      rejected_count: 0,
      requires_v_review: false,
      entries: [],
      index: null,
    });
    expect(readdirSync(spoolDirectory)).toEqual([]);
  });

  it("indexes every legacy candidate, preserves every byte, and repairs a partial framed index", async () => {
    const root = scratch("coverage");
    const spoolDirectory = realpathSync(join(root, "spool"));
    const manifestPath = join(root, "manifest.json");
    const emptyName = spoolName(1);
    const lawfulName = spoolName(2);
    const invalidName = spoolName(3);
    const oversizedName = spoolName(4);
    const names = [emptyName, lawfulName, invalidName, oversizedName];

    writeFileSync(join(spoolDirectory, emptyName), "", { mode: 0o600 });
    writeFileSync(
      join(spoolDirectory, lawfulName),
      `${JSON.stringify(envelope("00000000-0000-4000-8000-000000000101"))}\n${
        JSON.stringify(envelope("00000000-0000-4000-8000-000000000102"))
      }\n`,
      { mode: 0o600 },
    );
    writeFileSync(join(spoolDirectory, invalidName), "{\"partial\":true", {
      mode: 0o600,
    });
    writeFileSync(join(spoolDirectory, oversizedName), Buffer.alloc(65_537, 0x78), {
      mode: 0o600,
    });
    const partial = `\n${emptyName.slice(0, 19)}`;
    writeFileSync(join(spoolDirectory, INDEX_NAME), partial, { mode: 0o600 });
    const original = new Map(names.map((name) => [
      name,
      readFileSync(join(spoolDirectory, name)),
    ]));

    const result = runAdmission(spoolDirectory, manifestPath);

    expect(result.status, result.stderr).toBe(0);
    const manifest = parseManifest(manifestPath);
    expect(manifest).toMatchObject({
      version: 2,
      verdict: "PASS_INDEXED",
      admission_ref: expect.stringMatching(/^[0-9a-f]{64}$/u),
      admission_record_count: 4,
      source_entry_count: 4,
      candidate_count: 4,
      lawful_count: 2,
      indexed_candidate_count: 4,
      rejected_count: 0,
    });
    expect(manifest.first_snapshot_sha256).toBe(manifest.second_snapshot_sha256);
    expect(manifest.index).not.toBeNull();
    expect(manifest.index?.covered_lawful_count).toBe(2);
    const candidateEntries = manifest.entries.filter((entry) =>
      entry.kind === "candidate"
    );
    expect(candidateEntries.map((entry) => entry.basename)).toEqual([...names].sort());
    expect(candidateEntries.map((entry) => entry.classification)).toEqual([
      "lawful_empty",
      "lawful_envelopes",
      "retained_invalid_bytes",
      "retained_invalid_bytes",
    ]);
    expect(candidateEntries.every((entry) => entry.indexed)).toBe(true);
    for (const [name, bytes] of original) {
      expect(readFileSync(join(spoolDirectory, name))).toEqual(bytes);
    }
    const indexBytes = readFileSync(join(spoolDirectory, INDEX_NAME));
    expect(indexBytes.subarray(0, Buffer.byteLength(partial)).toString("utf8")).toBe(partial);
    expect(manifest.index?.sha256).toBe(sha256(indexBytes));
    const indexLines = indexBytes.toString("utf8").split("\n");
    for (const entry of candidateEntries) {
      expect(indexLines.filter((line) => line === admissionRecord(
        manifest.admission_ref,
        entry,
      ))).toHaveLength(1);
    }
    const page = await readIndexedSpoolPage(spoolDirectory);
    expect(new Set(page)).toEqual(new Set(names));

    const ingested: string[] = [];
    const databaseSink: PostgresCaptureSink = {
      async writeOccurrences(): Promise<void> {},
      async writeCaptureGap(): Promise<void> {},
      async ingestSpooledOccurrence(value: PostRedactionEnvelope): Promise<void> {
        ingested.push(value.source_event_ref);
      },
      async close(): Promise<void> {},
    };
    await drainDeadSpoolFiles({ spoolDirectory, databaseSink });
    expect(ingested).toEqual([
      "00000000-0000-4000-8000-000000000101",
      "00000000-0000-4000-8000-000000000102",
    ]);
    for (const [name, bytes] of original) {
      expect(readFileSync(join(spoolDirectory, name))).toEqual(bytes);
    }
    expect(readFileSync(join(spoolDirectory, `${emptyName}.empty`))).toEqual(
      original.get(emptyName),
    );
    expect(readFileSync(join(spoolDirectory, `${lawfulName}.ingested`))).toEqual(
      original.get(lawfulName),
    );
    expect(existsSync(join(spoolDirectory, `${invalidName}.ingested`))).toBe(false);
    expect(existsSync(join(spoolDirectory, `${oversizedName}.ingested`))).toBe(false);
  });

  it("records unsafe source entries without following, indexing, or mutating them", async () => {
    const root = scratch("unsafe-sources");
    const spoolDirectory = realpathSync(join(root, "spool"));
    const manifestPath = join(root, "manifest.json");
    const victim = join(root, "victim");
    const symlinkVictim = join(root, "symlink-victim");
    const hardlinkName = spoolName(10);
    const symlinkName = spoolName(11);
    const directoryName = spoolName(12);
    const fifoName = spoolName(13);
    writeFileSync(victim, "DO-NOT-MUTATE-HARDLINK", { mode: 0o600 });
    writeFileSync(symlinkVictim, "DO-NOT-READ-SYMLINK", { mode: 0o600 });
    linkSync(victim, join(spoolDirectory, hardlinkName));
    symlinkSync(symlinkVictim, join(spoolDirectory, symlinkName));
    mkdirSync(join(spoolDirectory, directoryName));
    const fifo = spawnSync("mkfifo", [join(spoolDirectory, fifoName)], {
      encoding: "utf8",
    });
    expect(fifo.status, fifo.stderr).toBe(0);
    const victimBefore = readFileSync(victim);
    const symlinkVictimBefore = readFileSync(symlinkVictim);

    const result = runAdmission(spoolDirectory, manifestPath);
    expect(result.status, result.stderr).toBe(0);
    const manifest = parseManifest(manifestPath);
    expect(manifest.verdict).toBe("PASS_INDEXED");
    expect(manifest.candidate_count).toBe(0);
    expect(manifest.indexed_candidate_count).toBe(0);
    expect(manifest.rejected_count).toBe(4);
    expect(manifest.requires_v_review).toBe(true);
    const rejected = manifest.entries.filter((entry) =>
      entry.kind === "rejected_unsafe_path"
    );
    expect(rejected.map((entry) => entry.basename)).toEqual([
      hardlinkName,
      symlinkName,
      directoryName,
      fifoName,
    ].sort());
    expect(rejected.every((entry) =>
      entry.classification === "rejected_unsafe_path"
      && !entry.indexed
      && entry.sha256 === null
      && entry.reason !== null
    )).toBe(true);
    expect(readFileSync(victim)).toEqual(victimBefore);
    expect(readFileSync(symlinkVictim)).toEqual(symlinkVictimBefore);
    expect(await readIndexedSpoolPage(spoolDirectory)).toEqual([]);
  });

  it("rejects a canonical hardlink hidden in an unterminated index tail before repair can frame it", async () => {
    const root = scratch("unsafe-index-tail");
    const spoolDirectory = realpathSync(join(root, "spool"));
    const manifestPath = join(root, "manifest.json");
    const rejectedName = spoolName(14);
    const lawfulName = spoolName(15);
    const victimPath = join(root, "hardlink-victim");
    const sourcePath = join(spoolDirectory, rejectedName);
    const victimBytes = Buffer.from(
      `${JSON.stringify(envelope("00000000-0000-4000-8000-000000000114"))}\n`,
      "utf8",
    );
    writeFileSync(victimPath, victimBytes, { mode: 0o600 });
    linkSync(victimPath, sourcePath);
    writeFileSync(join(spoolDirectory, lawfulName), "", { mode: 0o600 });
    const originalIndex = Buffer.from(rejectedName, "utf8");
    writeFileSync(join(spoolDirectory, INDEX_NAME), originalIndex, { mode: 0o600 });
    const victimNlink = statSync(victimPath).nlink;

    const result = runAdmission(spoolDirectory, manifestPath);
    const sink = {
      calls: [] as PostRedactionEnvelope[],
      value: {
        async writeOccurrences(): Promise<void> {},
        async writeCaptureGap(): Promise<void> {},
        async ingestSpooledOccurrence(value: PostRedactionEnvelope): Promise<void> {
          sink.calls.push(value);
        },
        async close(): Promise<void> {},
      } satisfies PostgresCaptureSink,
    };
    await drainDeadSpoolFiles({ spoolDirectory, databaseSink: sink.value });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("FAIL_UNSAFE_INDEX_MEMBER");
    expect(result.stdout).not.toContain("PASS_");
    expect(existsSync(manifestPath)).toBe(false);
    expect(readFileSync(join(spoolDirectory, INDEX_NAME))).toEqual(originalIndex);
    expect(sink.calls).toHaveLength(0);
    expect(readFileSync(victimPath)).toEqual(victimBytes);
    expect(readFileSync(sourcePath)).toEqual(victimBytes);
    expect(statSync(victimPath).nlink).toBe(victimNlink);
    expect(existsSync(`${sourcePath}.ingested`)).toBe(false);
  });

  it("uses an opaque reference for a planted secret in a noncanonical filename", () => {
    const root = scratch("private-name");
    const spoolDirectory = realpathSync(join(root, "spool"));
    const manifestPath = join(root, "manifest.json");
    const secret = "CUSTOMER_SECRET_ALPHA_7649";
    writeFileSync(join(spoolDirectory, `notes-${secret}.txt`), "not-a-spool", {
      mode: 0o600,
    });

    const result = runAdmission(spoolDirectory, manifestPath);

    expect(result.status, result.stderr).toBe(0);
    const manifestBytes = readFileSync(manifestPath, "utf8");
    const manifest = parseManifest(manifestPath);
    const rejected = manifest.entries.find((entry) =>
      entry.kind === "rejected_unsafe_path"
    );
    expect(manifest.rejected_count).toBe(1);
    expect(manifest.requires_v_review).toBe(true);
    expect(rejected?.basename).toMatch(/^noncanonical-name-sha256:[0-9a-f]{64}$/u);
    expect(`${manifestBytes}\n${result.stdout}\n${result.stderr}`).not.toContain(secret);
  });

  it("fails closed for unsafe reserved metadata, spool paths, and manifest outputs", () => {
    const hardlinkRoot = scratch("reserved-hardlink");
    const hardlinkSpool = realpathSync(join(hardlinkRoot, "spool"));
    const hardlinkManifest = join(hardlinkRoot, "manifest.json");
    const victim = join(hardlinkRoot, "victim");
    writeFileSync(victim, "DO-NOT-MUTATE-RESERVED", { mode: 0o600 });
    const victimBefore = readFileSync(victim);
    linkSync(victim, join(hardlinkSpool, INDEX_NAME));
    const hardlinkResult = runAdmission(hardlinkSpool, hardlinkManifest);
    expect(hardlinkResult.status).not.toBe(0);
    expect(existsSync(hardlinkManifest)).toBe(false);
    expect(readFileSync(victim)).toEqual(victimBefore);

    const cursorRoot = scratch("reserved-cursor");
    const cursorSpool = realpathSync(join(cursorRoot, "spool"));
    const cursorManifest = join(cursorRoot, "manifest.json");
    const cursorVictim = join(cursorRoot, "cursor-victim");
    writeFileSync(cursorVictim, "DO-NOT-FOLLOW-CURSOR", { mode: 0o600 });
    symlinkSync(cursorVictim, join(cursorSpool, CURSOR_NAME));
    const cursorResult = runAdmission(cursorSpool, cursorManifest);
    expect(cursorResult.status).not.toBe(0);
    expect(existsSync(cursorManifest)).toBe(false);
    expect(readFileSync(cursorVictim, "utf8")).toBe("DO-NOT-FOLLOW-CURSOR");

    const outputRoot = scratch("unsafe-output");
    const outputSpool = realpathSync(join(outputRoot, "spool"));
    const insideOutput = join(outputSpool, "manifest.json");
    const insideResult = runAdmission(outputSpool, insideOutput);
    expect(insideResult.status).not.toBe(0);
    expect(existsSync(insideOutput)).toBe(false);

    const physicalRoot = scratch("symlink-directory");
    const physicalSpool = realpathSync(join(physicalRoot, "spool"));
    const spoolAlias = join(physicalRoot, "spool-alias");
    symlinkSync(physicalSpool, spoolAlias);
    const aliasManifest = join(physicalRoot, "alias-manifest.json");
    const aliasResult = runAdmission(spoolAlias, aliasManifest);
    expect(aliasResult.status).not.toBe(0);
    expect(existsSync(aliasManifest)).toBe(false);
    expect(readdirSync(physicalSpool)).toEqual([]);
  });

  it("fails when a candidate changes between the two source snapshots", async () => {
    const root = scratch("changed");
    const spoolDirectory = realpathSync(join(root, "spool"));
    const manifestPath = join(root, "manifest.json");
    const sourcePath = join(spoolDirectory, spoolName(20));
    writeFileSync(sourcePath, "before", { mode: 0o600 });
    const lastName = spoolName(44);
    for (let sequence = 21; sequence <= 44; sequence += 1) {
      writeFileSync(join(spoolDirectory, spoolName(sequence)), "", { mode: 0o600 });
    }
    let mutated = false;
    let mutator: ReturnType<typeof setInterval> | undefined;
    const run = runAdmissionAsync(spoolDirectory, manifestPath);
    mutator = setInterval(() => {
      const indexPath = join(spoolDirectory, INDEX_NAME);
      if (!existsSync(indexPath)) return;
      if (!readFileSync(indexPath, "utf8").includes(lastName)) return;
      appendFileSync(sourcePath, "x");
      mutated = true;
      if (mutator !== undefined) clearInterval(mutator);
    }, 1);
    const result = await run.finally(() => {
      if (mutator !== undefined) clearInterval(mutator);
    });

    expect(mutated).toBe(true);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("FAIL_CHANGED");
    expect(existsSync(manifestPath)).toBe(false);
  }, 20_000);

  it("fails when the repaired index changes during the second source snapshot", async () => {
    const root = scratch("changed-index");
    const spoolDirectory = realpathSync(join(root, "spool"));
    const manifestPath = join(root, "manifest.json");
    const name = spoolName(45);
    const sourcePath = join(spoolDirectory, name);
    const fd = openSync(
      sourcePath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
      0o600,
    );
    try {
      ftruncateSync(fd, 64 * 1024 * 1024);
    } finally {
      closeSync(fd);
    }
    let changedIndex = false;
    let scheduled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let watcher: ReturnType<typeof setInterval> | undefined;
    const run = runAdmissionAsync(spoolDirectory, manifestPath);
    watcher = setInterval(() => {
      const indexPath = join(spoolDirectory, INDEX_NAME);
      if (scheduled || !existsSync(indexPath)) return;
      if (!readFileSync(indexPath, "utf8").includes(name)) return;
      scheduled = true;
      timer = setTimeout(() => {
        appendFileSync(indexPath, "\nindex-race\n");
        changedIndex = true;
      }, 20);
    }, 1);
    const result = await run.finally(() => {
      if (watcher !== undefined) clearInterval(watcher);
      if (timer !== undefined) clearTimeout(timer);
    });

    expect(changedIndex).toBe(true);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("FAIL_CHANGED");
    expect(existsSync(manifestPath)).toBe(false);
  }, 20_000);

  it("refuses unreadable candidates and relative command paths without PASS evidence", () => {
    const root = scratch("invalid-input");
    const spoolDirectory = realpathSync(join(root, "spool"));
    const manifestPath = join(root, "manifest.json");
    const candidate = join(spoolDirectory, spoolName(30));
    writeFileSync(candidate, "", { mode: 0o600 });
    chmodSync(candidate, 0o000);
    const unreadable = runAdmission(spoolDirectory, manifestPath);
    expect(unreadable.status).not.toBe(0);
    expect(existsSync(manifestPath)).toBe(false);
    chmodSync(candidate, 0o600);

    const relative = runAdmission("./relative-spool", join(root, "relative.json"));
    expect(relative.status).not.toBe(0);
    expect(existsSync(join(root, "relative.json"))).toBe(false);
  });

  it("blocks a live candidate PID before index repair and admits it after that unrelated process exits", async () => {
    const root = scratch("live-owner");
    const spoolDirectory = realpathSync(join(root, "spool"));
    const firstManifestPath = join(root, "live-manifest.json");
    const finalManifestPath = join(root, "dead-manifest.json");
    const child = spawn(
      process.execPath,
      ["-e", "setInterval(() => {}, 1000)"],
      { stdio: "ignore" },
    );
    await new Promise<void>((settle, reject) => {
      child.once("spawn", settle);
      child.once("error", reject);
    });
    expect(child.pid).toBeDefined();
    const name = spoolName(31, child.pid!);
    const sourcePath = join(spoolDirectory, name);
    const source = envelope("00000000-0000-4000-8000-000000000131");
    writeFileSync(sourcePath, `${JSON.stringify(source)}\n`, { mode: 0o600 });

    try {
      const live = runAdmission(spoolDirectory, firstManifestPath);
      expect(live.status).not.toBe(0);
      expect(live.stderr).toContain("FAIL_LIVE_OWNER");
      expect(live.stdout).not.toContain("PASS_");
      expect(existsSync(firstManifestPath)).toBe(false);
      expect(existsSync(join(spoolDirectory, INDEX_NAME))).toBe(false);
      expect(readdirSync(spoolDirectory)).toEqual([name]);
    } finally {
      const closed = new Promise<void>((settle) => child.once("close", () => settle()));
      child.kill("SIGTERM");
      await closed;
    }

    const admitted = runAdmission(spoolDirectory, finalManifestPath);
    expect(admitted.status, admitted.stderr).toBe(0);
    expect(parseManifest(finalManifestPath).verdict).toBe("PASS_INDEXED");
    const ingested: string[] = [];
    const databaseSink: PostgresCaptureSink = {
      async writeOccurrences(): Promise<void> {},
      async writeCaptureGap(): Promise<void> {},
      async ingestSpooledOccurrence(value: PostRedactionEnvelope): Promise<void> {
        ingested.push(value.source_event_ref);
      },
      async close(): Promise<void> {},
    };
    await drainDeadSpoolFiles({ spoolDirectory, databaseSink });
    expect(ingested).toEqual([source.source_event_ref]);
    expect(readFileSync(`${sourcePath}.ingested`)).toEqual(readFileSync(sourcePath));
  }, 30_000);

  it("treats the first stable ESRCH snapshot as authoritative when the numeric PID appears later", () => {
    const root = scratch("pid-transition");
    const spoolDirectory = realpathSync(join(root, "spool"));
    const manifestPath = join(root, "manifest.json");
    const markerPath = join(root, "pid-probes");
    const name = spoolName(32);
    writeFileSync(join(spoolDirectory, name), "", { mode: 0o600 });

    const result = runAdmissionWithPidTransition(
      spoolDirectory,
      manifestPath,
      markerPath,
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("PASS_INDEXED");
    expect(readFileSync(markerPath, "utf8")).toBe("x");
    expect(parseManifest(manifestPath)).toMatchObject({
      version: 2,
      admission_record_count: 1,
    });
    expect(readFileSync(join(spoolDirectory, INDEX_NAME), "utf8"))
      .toContain(`\n${name}\n`);
  });

  it("gates the exact sealed A1 prefix and permits only later plain installer records", () => {
    const root = scratch("launch-gate");
    const spoolDirectory = realpathSync(join(root, "spool"));
    const manifestPath = join(root, "manifest.json");
    const name = spoolName(33);
    writeFileSync(join(spoolDirectory, name), "", { mode: 0o600 });
    const admitted = runAdmission(spoolDirectory, manifestPath);
    expect(admitted.status, admitted.stderr).toBe(0);
    const digest = manifestDigestFromOutput(admitted.stdout);
    expect(digest).toMatch(/^[0-9a-f]{64}$/u);
    expect(admitted.stdout).toBe(
      `FIX01_RELEASE_ADMISSION PASS_INDEXED manifest_sha256=${digest}\n`,
    );
    expect(admitted.stdout).not.toMatch(/(?:seal=|OBS_SPOOL_ADMISSION_SEAL_V1)/u);
    const manifest = parseManifest(manifestPath);

    const firstGate = runGate(spoolDirectory, manifestPath, digest!);
    expect(firstGate.status, firstGate.stderr).toBe(0);
    expect(gateSeal(firstGate.stdout)).toEqual({
      version: 1,
      admissionRef: manifest.admission_ref,
      manifestSha256: digest,
      indexDev: manifest.index?.dev,
      indexIno: manifest.index?.ino,
      prefixBytes: manifest.index?.size,
    });

    appendSpoolIndexBasename({
      directory: spoolDirectory,
      basename: spoolName(34),
    });
    const afterPlain = runGate(spoolDirectory, manifestPath, digest!);
    expect(afterPlain.status, afterPlain.stderr).toBe(0);
    expect(gateSeal(afterPlain.stdout)).toEqual(gateSeal(firstGate.stdout));

    const indexPath = join(spoolDirectory, INDEX_NAME);
    const allowedBytes = readFileSync(indexPath);
    for (const suffix of [
      "\nA",
      "\nA\n",
      "\nA1",
      "\nA1\t",
      `\nA1\t${name}\t${"A".repeat(43)}\n`,
    ]) {
      writeFileSync(indexPath, Buffer.concat([
        allowedBytes,
        Buffer.from(suffix, "utf8"),
      ]));
      const afterA1 = runGate(spoolDirectory, manifestPath, digest!);
      expect(afterA1.status, suffix).not.toBe(0);
      expect(afterA1.stderr, suffix).toContain("FAIL_A1_OUTSIDE_PREFIX");
      expect(afterA1.stdout, suffix).not.toContain("PASS");
    }
  });

  it("rejects wrong launch inputs and changed manifest or sealed-index identity and bytes", () => {
    function admittedCase(label: string, initialIndex?: string): Readonly<{
      root: string;
      spoolDirectory: string;
      manifestPath: string;
      digest: string;
      indexPath: string;
    }> {
      const root = scratch(label);
      const spoolDirectory = realpathSync(join(root, "spool"));
      const manifestPath = join(root, "manifest.json");
      writeFileSync(join(spoolDirectory, spoolName(35)), "", { mode: 0o600 });
      if (initialIndex !== undefined) {
        writeFileSync(join(spoolDirectory, INDEX_NAME), initialIndex, {
          mode: 0o600,
        });
      }
      const result = runAdmission(spoolDirectory, manifestPath);
      expect(result.status, result.stderr).toBe(0);
      const digest = manifestDigestFromOutput(result.stdout)!;
      return {
        root,
        spoolDirectory,
        manifestPath,
        digest,
        indexPath: join(spoolDirectory, INDEX_NAME),
      };
    }

    const inputs = admittedCase("gate-inputs");
    expect(runGate(
      inputs.spoolDirectory,
      inputs.manifestPath,
      "0".repeat(64),
    ).status).not.toBe(0);
    expect(runGate(
      inputs.spoolDirectory,
      inputs.manifestPath,
      inputs.digest,
      "f".repeat(40),
    ).status).not.toBe(0);
    const otherRoot = scratch("gate-other-path");
    expect(runGate(
      realpathSync(join(otherRoot, "spool")),
      inputs.manifestPath,
      inputs.digest,
    ).status).not.toBe(0);

    const noncanonical = admittedCase("gate-noncanonical-manifest");
    const parsed = JSON.parse(readFileSync(noncanonical.manifestPath, "utf8"));
    writeFileSync(noncanonical.manifestPath, `${JSON.stringify(parsed, null, 2)}\n`);
    const changedManifestBytes = readFileSync(noncanonical.manifestPath);
    expect(runGate(
      noncanonical.spoolDirectory,
      noncanonical.manifestPath,
      sha256(changedManifestBytes),
    ).status).not.toBe(0);

    const oversizedManifest = admittedCase("gate-oversized-manifest");
    const oversizedBytes = Buffer.alloc(GATE_MANIFEST_MAX_BYTES + 1, 0x20);
    writeFileSync(oversizedManifest.manifestPath, oversizedBytes);
    const oversizedGate = runGate(
      oversizedManifest.spoolDirectory,
      oversizedManifest.manifestPath,
      sha256(oversizedBytes),
    );
    expect(oversizedGate.status).not.toBe(0);
    expect(oversizedGate.stderr).toContain("FAIL_MANIFEST_TOO_LARGE");

    const manifestHardlink = admittedCase("gate-manifest-hardlink");
    linkSync(
      manifestHardlink.manifestPath,
      join(manifestHardlink.root, "manifest-link"),
    );
    expect(runGate(
      manifestHardlink.spoolDirectory,
      manifestHardlink.manifestPath,
      manifestHardlink.digest,
    ).status).not.toBe(0);

    const manifestSymlink = admittedCase("gate-manifest-symlink");
    const realManifest = join(manifestSymlink.root, "real-manifest.json");
    renameSync(manifestSymlink.manifestPath, realManifest);
    symlinkSync(realManifest, manifestSymlink.manifestPath);
    expect(runGate(
      manifestSymlink.spoolDirectory,
      manifestSymlink.manifestPath,
      manifestSymlink.digest,
    ).status).not.toBe(0);

    const prefixMutation = admittedCase("gate-prefix-mutation", "\nX\n");
    const prefixBytes = readFileSync(prefixMutation.indexPath);
    prefixBytes[1] = prefixBytes[1] === 0x41 ? 0x42 : 0x41;
    writeFileSync(prefixMutation.indexPath, prefixBytes);
    expect(runGate(
      prefixMutation.spoolDirectory,
      prefixMutation.manifestPath,
      prefixMutation.digest,
    ).status).not.toBe(0);

    const truncation = admittedCase("gate-truncate");
    const truncated = readFileSync(truncation.indexPath);
    writeFileSync(truncation.indexPath, truncated.subarray(0, truncated.length - 1));
    expect(runGate(
      truncation.spoolDirectory,
      truncation.manifestPath,
      truncation.digest,
    ).status).not.toBe(0);

    const replacement = admittedCase("gate-replacement");
    const replacementBytes = readFileSync(replacement.indexPath);
    renameSync(replacement.indexPath, `${replacement.indexPath}.old`);
    writeFileSync(replacement.indexPath, replacementBytes, { mode: 0o600 });
    expect(runGate(
      replacement.spoolDirectory,
      replacement.manifestPath,
      replacement.digest,
    ).status).not.toBe(0);

    const indexHardlink = admittedCase("gate-index-hardlink");
    linkSync(indexHardlink.indexPath, join(indexHardlink.root, "index-link"));
    expect(runGate(
      indexHardlink.spoolDirectory,
      indexHardlink.manifestPath,
      indexHardlink.digest,
    ).status).not.toBe(0);

    const indexSymlink = admittedCase("gate-index-symlink");
    const realIndex = join(indexSymlink.root, "real-index");
    renameSync(indexSymlink.indexPath, realIndex);
    symlinkSync(realIndex, indexSymlink.indexPath);
    expect(runGate(
      indexSymlink.spoolDirectory,
      indexSymlink.manifestPath,
      indexSymlink.digest,
    ).status).not.toBe(0);
  }, 60_000);

  it("drains a sealed admission across PID reuse while a later live writer record stays skipped", async () => {
    const root = scratch("sealed-pid-reuse");
    const spoolDirectory = realpathSync(join(root, "spool"));
    const manifestPath = join(root, "manifest.json");
    const admittedEnvelope = envelope("00000000-0000-4000-8000-000000000136");
    const admittedName = spoolName(36);
    const admittedPath = join(spoolDirectory, admittedName);
    writeFileSync(admittedPath, `${JSON.stringify(admittedEnvelope)}\n`, {
      mode: 0o600,
    });
    const admitted = runAdmission(spoolDirectory, manifestPath);
    expect(admitted.status, admitted.stderr).toBe(0);
    const digest = manifestDigestFromOutput(admitted.stdout)!;

    const liveEnvelope = envelope("00000000-0000-4000-8000-000000000137");
    const liveName = spoolName(37, process.pid);
    const livePath = join(spoolDirectory, liveName);
    writeFileSync(livePath, `${JSON.stringify(liveEnvelope)}\n`, { mode: 0o600 });
    appendSpoolIndexBasename({ directory: spoolDirectory, basename: liveName });
    const gated = runGate(spoolDirectory, manifestPath, digest);
    expect(gated.status, gated.stderr).toBe(0);
    const seal = gateSeal(gated.stdout);
    expect(seal).toBeDefined();

    const pidProbe = vi.spyOn(process, "kill")
      .mockImplementation((() => true) as typeof process.kill);
    const ingested: string[] = [];
    const databaseSink: PostgresCaptureSink = {
      async writeOccurrences(): Promise<void> {},
      async writeCaptureGap(): Promise<void> {},
      async ingestSpooledOccurrence(value: PostRedactionEnvelope): Promise<void> {
        ingested.push(value.source_event_ref);
      },
      async close(): Promise<void> {},
    };
    for (let cycle = 0; cycle < 3; cycle += 1) {
      await drainWithAdmissionSeal({
        spoolDirectory,
        databaseSink,
        admissionSeal: seal,
      });
    }

    expect(ingested).toEqual(Array.from(
      { length: 3 },
      () => admittedEnvelope.source_event_ref,
    ));
    expect(pidProbe.mock.calls.filter(([pid]) => pid === DEAD_PID)).toHaveLength(0);
    expect(pidProbe.mock.calls.filter(([pid]) => pid === process.pid)).toHaveLength(3);
    expect(readFileSync(`${admittedPath}.ingested`)).toEqual(readFileSync(admittedPath));
    expect(existsSync(admittedPath)).toBe(true);
    expect(existsSync(`${livePath}.ingested`)).toBe(false);
    expect(readFileSync(livePath, "utf8")).toBe(`${JSON.stringify(liveEnvelope)}\n`);
  }, 30_000);

  it("does not let a sealed legacy plain record bypass a changed A1 source", async () => {
    const root = scratch("sealed-plain-shadow");
    const spoolDirectory = realpathSync(join(root, "spool"));
    const manifestPath = join(root, "manifest.json");
    const original = envelope("00000000-0000-4000-8000-000000000139");
    const changed = envelope("00000000-0000-4000-8000-000000000140");
    const name = spoolName(39);
    const sourcePath = join(spoolDirectory, name);
    writeFileSync(sourcePath, `${JSON.stringify(original)}\n`, { mode: 0o600 });
    const admitted = runAdmission(spoolDirectory, manifestPath);
    expect(admitted.status, admitted.stderr).toBe(0);
    const digest = manifestDigestFromOutput(admitted.stdout)!;
    const gated = runGate(spoolDirectory, manifestPath, digest);
    expect(gated.status, gated.stderr).toBe(0);

    writeFileSync(sourcePath, `${JSON.stringify(changed)}\n`, { mode: 0o600 });
    const databaseSink = recordingAdmissionSink();
    await drainWithAdmissionSeal({
      spoolDirectory,
      databaseSink: databaseSink.sink,
      admissionSeal: gateSeal(gated.stdout),
    });

    expect(databaseSink.calls).toEqual([]);
    expect(existsSync(`${sourcePath}.ingested`)).toBe(false);
    expect(readFileSync(sourcePath, "utf8")).toBe(`${JSON.stringify(changed)}\n`);
  });

  it("keeps a preplanted unterminated A1 from another admission inert", async () => {
    const root = scratch("stale-a1");
    const spoolDirectory = realpathSync(join(root, "spool"));
    const manifestPath = join(root, "manifest.json");
    const name = spoolName(38);
    const sourcePath = join(spoolDirectory, name);
    const source = envelope("00000000-0000-4000-8000-000000000138");
    writeFileSync(sourcePath, `${JSON.stringify(source)}\n`, { mode: 0o600 });
    const sourceStat = statSync(sourcePath, { bigint: true });
    const staleEntry: ManifestEntry = {
      basename: name,
      kind: "candidate",
      classification: "lawful_envelopes",
      indexed: true,
      reason: null,
      sha256: sha256(readFileSync(sourcePath)),
      dev: sourceStat.dev.toString(),
      ino: sourceStat.ino.toString(),
      nlink: Number(sourceStat.nlink),
      size: Number(sourceStat.size),
      mtime_ns: sourceStat.mtimeNs.toString(),
      ctime_ns: sourceStat.ctimeNs.toString(),
    };
    const staleRef = "7".repeat(64);
    const staleRecord = admissionRecord(staleRef, staleEntry);
    writeFileSync(join(spoolDirectory, INDEX_NAME), staleRecord, { mode: 0o600 });

    const admitted = runAdmission(spoolDirectory, manifestPath);
    expect(admitted.status, admitted.stderr).toBe(0);
    const manifest = parseManifest(manifestPath);
    expect(manifest.admission_ref).not.toBe(staleRef);
    expect(manifest.admission_record_count).toBe(1);
    const indexLines = readFileSync(join(spoolDirectory, INDEX_NAME), "utf8")
      .split("\n");
    expect(indexLines).toContain(staleRecord);
    const current = manifest.entries.find((entry) => entry.basename === name)!;
    expect(indexLines.filter((line) =>
      line === admissionRecord(manifest.admission_ref, current)
    )).toHaveLength(1);

    const digest = manifestDigestFromOutput(admitted.stdout)!;
    const gated = runGate(spoolDirectory, manifestPath, digest);
    expect(gated.status, gated.stderr).toBe(0);
    const databaseSink = recordingAdmissionSink();
    vi.spyOn(process, "kill").mockImplementation((() => true) as typeof process.kill);
    await drainWithAdmissionSeal({
      spoolDirectory,
      databaseSink: databaseSink.sink,
      admissionSeal: gateSeal(gated.stdout),
    });
    expect(databaseSink.calls).toEqual([source.source_event_ref]);
  });

  it("is unreachable from product runtime and installer import graphs", async () => {
    const sources = [
      "packages/obs-capture/src/runtime/index.ts",
      "packages/obs-capture/src/runtime/drain.ts",
      "packages/obs-capture/src/runtime/sink.ts",
      "packages/obs-capture/install/api.ts",
      "packages/obs-capture/install/evaluator-lib.ts",
      "packages/obs-capture/install/runner.ts",
      "packages/obs-capture/install/scheduler.ts",
      "packages/obs-capture/install/ui-client.ts",
    ];
    for (const source of sources) {
      expect(await readFile(resolve(process.cwd(), source), "utf8"), source)
        .not.toContain("obs-spool-release-admission");
    }

    const toolSource = await readFile(TOOL_PATH, "utf8");
    expect(toolSource).toMatch(/\breaddir\b/u);
    expect(dirname(TOOL_PATH)).toBe(resolve(process.cwd(), "tools"));
    const gateSource = await readFile(GATE_TOOL_PATH, "utf8");
    expect(gateSource).not.toMatch(/\b(?:opendir|readdir)\b/u);
    expect(dirname(GATE_TOOL_PATH)).toBe(resolve(process.cwd(), "tools"));
  });
});
