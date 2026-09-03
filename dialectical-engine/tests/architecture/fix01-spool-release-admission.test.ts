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
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { PostRedactionEnvelope } from "../../packages/obs-capture/src/redactor.js";
import { drainDeadSpoolFiles } from "../../packages/obs-capture/src/runtime/drain.js";
import type { PostgresCaptureSink } from "../../packages/obs-capture/src/runtime/sink.js";
import { readIndexedSpoolPage } from "../../packages/obs-capture/src/spool-index.js";

const TOOL_PATH = resolve(
  process.cwd(),
  "tools/obs-spool-release-admission.ts",
);
const INDEX_NAME = ".obs-spool-index-v1";
const CURSOR_NAME = ".obs-spool-cursor-v1";
const BUILD_REF = "597f68b869413a33adfbc1f835184d469d9161bd";
const DEAD_PID = 2_147_483_647;
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
}

interface AdmissionManifest {
  readonly version: 1;
  readonly verdict: "PASS_EMPTY" | "PASS_INDEXED";
  readonly phase: "before_first_indexed_launch";
  readonly spool_directory_realpath: string;
  readonly target_build_ref: string;
  readonly verifier_version: string;
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
    nlink: 1;
    size: number;
    sha256: string;
    covered_lawful_count: number;
  }>;
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

function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
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
      version: 1,
      verdict: "PASS_EMPTY",
      phase: "before_first_indexed_launch",
      spool_directory_realpath: spoolDirectory,
      target_build_ref: BUILD_REF,
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
      verdict: "PASS_INDEXED",
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
  });
});
