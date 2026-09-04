import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";

import { corpusCase } from "./cases/corpus.js";
import { identityCanaryCase } from "./cases/identity-canary.js";
import { schemaManifestCase } from "./cases/schema-manifest.js";

export const OBS_G1_CHILD_RECEIPT_PREFIX = "OBS_G1_CHILD_RECEIPT " as const;
export const OBS_G1_CHILD_OUTPUT_MAX_BYTES = 65_536 as const;
export const OBS_G1_CHILD_KILL_GRACE_MS = 250 as const;

const SAFE_CASE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_CODE = /^[A-Z][A-Z0-9_]{0,63}$/;
const SAFE_METRIC = /^[a-z][a-z0-9_]{0,31}$/;
const FORBIDDEN_ZONE_ROOT = "packages/obs-capture/src/zone";

const verdicts = new WeakSet<object>();
const spawnReceipts = new WeakSet<object>();

class ObsHarnessFailure extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ObsHarnessFailure";
  }
}

export interface SpawnSubjectOptions {
  readonly command: string;
  readonly arguments?: readonly string[];
  readonly environment?: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
}

export interface SpawnReceipt {
  readonly pid: number;
  readonly sourceEventRef: string;
  readonly occurrenceSequences: readonly number[];
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly scratchDirectory: string;
}

export interface RowWrittenByPid {
  readonly pid: number;
  readonly sourceEventRef: string;
  readonly occurrenceSequence: number;
}

export interface ObsVerdict {
  readonly kind: "PASS" | "FAIL";
  readonly code?: string;
  readonly metrics: Readonly<Record<string, number>>;
}

export interface ObsCaseContext {
  spawn(options: SpawnSubjectOptions): Promise<SpawnReceipt>;
  passRows(
    receipt: SpawnReceipt,
    rows: readonly RowWrittenByPid[],
    metrics: Readonly<Record<string, number>>,
  ): ObsVerdict;
  passProcess(receipt: SpawnReceipt, metrics: Readonly<Record<string, number>>): ObsVerdict;
  fail(code: string, metrics?: Readonly<Record<string, number>>): ObsVerdict;
}

export interface ObsAcceptanceCase {
  readonly name: string;
  readonly subjectPaths: readonly string[];
  run(context: ObsCaseContext): Promise<ObsVerdict>;
}

export interface RunFamilyOptions {
  readonly cases: readonly ObsAcceptanceCase[];
  readonly repoRoot: string;
  readonly scratchRoot?: string;
  readonly only?: readonly string[];
  readonly writeLine?: (line: string) => void;
}

export interface FamilyResult {
  readonly exitCode: 0 | 1;
  readonly lines: readonly string[];
}

interface ChildReceiptJson {
  readonly pid: number;
  readonly source_event_ref: string;
  readonly occ_seq: readonly number[];
}

function safeMetrics(metrics: Readonly<Record<string, number>>): Readonly<Record<string, number>> {
  const entries = Object.entries(metrics);
  if (entries.length === 0) throw new ObsHarnessFailure("METRICS_REQUIRED");
  for (const [name, value] of entries) {
    if (!SAFE_METRIC.test(name)) throw new ObsHarnessFailure("METRIC_NAME_INVALID");
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new ObsHarnessFailure("METRIC_VALUE_INVALID");
    }
  }
  return Object.freeze(Object.fromEntries(entries.sort(([left], [right]) => left.localeCompare(right))));
}

function mintVerdict(
  kind: "PASS" | "FAIL",
  metrics: Readonly<Record<string, number>>,
  code?: string,
): ObsVerdict {
  const verdict = Object.freeze({
    kind,
    ...(code === undefined ? {} : { code }),
    metrics: safeMetrics(metrics),
  });
  verdicts.add(verdict);
  return verdict;
}

function failVerdict(code: string, metrics: Readonly<Record<string, number>> = { failures: 1 }): ObsVerdict {
  if (!SAFE_CODE.test(code)) throw new ObsHarnessFailure("FAIL_CODE_INVALID");
  return mintVerdict("FAIL", metrics, code);
}

function parseChildReceipt(
  stdout: string,
  observedPid: number,
  expectedSourceEventRef: string,
  details: Omit<SpawnReceipt, "pid" | "sourceEventRef" | "occurrenceSequences">,
): SpawnReceipt {
  const receiptLines = stdout
    .split(/\r?\n/u)
    .filter((line) => line.startsWith(OBS_G1_CHILD_RECEIPT_PREFIX));
  if (receiptLines.length !== 1) throw new ObsHarnessFailure("CHILD_RECEIPT_INVALID");
  let parsed: unknown;
  try {
    parsed = JSON.parse(receiptLines[0]!.slice(OBS_G1_CHILD_RECEIPT_PREFIX.length));
  } catch {
    throw new ObsHarnessFailure("CHILD_RECEIPT_INVALID");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ObsHarnessFailure("CHILD_RECEIPT_INVALID");
  }
  const candidate = parsed as Partial<ChildReceiptJson>;
  if (
    candidate.pid !== observedPid
    || candidate.source_event_ref !== expectedSourceEventRef
    || !Array.isArray(candidate.occ_seq)
    || candidate.occ_seq.some((value) => !Number.isSafeInteger(value) || value <= 0)
    || new Set(candidate.occ_seq).size !== candidate.occ_seq.length
  ) {
    throw new ObsHarnessFailure("CHILD_RECEIPT_INVALID");
  }
  const receipt = Object.freeze({
    pid: observedPid,
    sourceEventRef: expectedSourceEventRef,
    occurrenceSequences: Object.freeze([...candidate.occ_seq]),
    ...details,
  });
  spawnReceipts.add(receipt);
  return receipt;
}

function childEnvironment(
  sourceEventRef: string,
  scratchDirectory: string,
  supplied: Readonly<Record<string, string>> | undefined,
): NodeJS.ProcessEnv {
  const output: NodeJS.ProcessEnv = {};
  for (const name of ["PATH", "LANG", "LC_ALL", "TMPDIR"] as const) {
    if (process.env[name] !== undefined) output[name] = process.env[name];
  }
  for (const [name, value] of Object.entries(supplied ?? {})) {
    if (!name.startsWith("OBS_") && name !== "NODE_ENV") {
      throw new ObsHarnessFailure("CHILD_ENVIRONMENT_KEY_FORBIDDEN");
    }
    output[name] = value;
  }
  output.OBS_G1_SOURCE_EVENT_REF = sourceEventRef;
  output.OBS_G1_SCRATCH_DIR = scratchDirectory;
  return output;
}

async function spawnSubject(
  repoRoot: string,
  scratchRoot: string,
  options: SpawnSubjectOptions,
): Promise<SpawnReceipt> {
  if (options.command.trim() === "" || !Number.isInteger(options.timeoutMs) || options.timeoutMs < 1) {
    throw new ObsHarnessFailure("CHILD_OPTIONS_INVALID");
  }
  const scratchDirectory = await mkdtemp(join(await realpath(scratchRoot), "obs-g1-"));
  const sourceEventRef = randomUUID();
  try {
    const child = spawn(options.command, [...(options.arguments ?? [])], {
      cwd: repoRoot,
      env: childEnvironment(sourceEventRef, scratchDirectory, options.environment),
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let outputBytes = 0;
    let failureCode: string | undefined;
    let forceKill: NodeJS.Timeout | undefined;

    const stop = (code: string): void => {
      if (failureCode !== undefined) return;
      failureCode = code;
      child.kill("SIGTERM");
      forceKill = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      }, OBS_G1_CHILD_KILL_GRACE_MS);
    };
    const collect = (target: Buffer[]) => (chunk: Buffer | string): void => {
      if (failureCode !== undefined) return;
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (bytes.byteLength > OBS_G1_CHILD_OUTPUT_MAX_BYTES - outputBytes) {
        stop("CHILD_OUTPUT_LIMIT");
        return;
      }
      outputBytes += bytes.byteLength;
      target.push(bytes);
    };
    child.stdout.on("data", collect(stdoutChunks));
    child.stderr.on("data", collect(stderrChunks));
    child.once("error", () => stop("CHILD_SPAWN_FAILED"));
    const deadline = setTimeout(() => stop("CHILD_TIMEOUT"), options.timeoutMs);
    const [exitCode, signal] = await new Promise<[number | null, NodeJS.Signals | null]>((resolveClose) => {
      child.once("close", (code, closeSignal) => resolveClose([code, closeSignal]));
    });
    clearTimeout(deadline);
    if (forceKill !== undefined) clearTimeout(forceKill);
    const stdout = Buffer.concat(stdoutChunks).toString("utf8");
    const stderr = Buffer.concat(stderrChunks).toString("utf8");
    if (failureCode !== undefined) throw new ObsHarnessFailure(failureCode);
    if (child.pid === undefined || !Number.isSafeInteger(child.pid) || child.pid < 1) {
      throw new ObsHarnessFailure("CHILD_PID_INVALID");
    }
    return parseChildReceipt(stdout, child.pid, sourceEventRef, {
      exitCode,
      signal,
      stdout,
      stderr,
      scratchDirectory,
    });
  } finally {
    await rm(scratchDirectory, { recursive: true, force: true });
  }
}

function createContext(repoRoot: string, scratchRoot: string): ObsCaseContext {
  function requireReceipt(receipt: SpawnReceipt): void {
    if (!spawnReceipts.has(receipt)) throw new ObsHarnessFailure("SPAWN_RECEIPT_INVALID");
  }
  return Object.freeze({
    spawn: (options: SpawnSubjectOptions) => spawnSubject(repoRoot, scratchRoot, options),
    passRows(
      receipt: SpawnReceipt,
      rows: readonly RowWrittenByPid[],
      metrics: Readonly<Record<string, number>>,
    ): ObsVerdict {
      requireReceipt(receipt);
      if (receipt.occurrenceSequences.length === 0 || rows.length === 0) {
        throw new ObsHarnessFailure("ROW_RECEIPT_REQUIRED");
      }
      for (const row of rows) {
        if (row.pid !== receipt.pid) {
          throw new ObsHarnessFailure("ROW_RECEIPT_PID_MISMATCH");
        }
        if (row.sourceEventRef !== receipt.sourceEventRef) {
          throw new ObsHarnessFailure("ROW_RECEIPT_SOURCE_REF_MISMATCH");
        }
      }
      const childSequences = [...receipt.occurrenceSequences].sort((left, right) => left - right);
      const readBackSequences = rows.map((row) => row.occurrenceSequence).sort((left, right) => left - right);
      if (
        readBackSequences.some((value) => !Number.isSafeInteger(value) || value <= 0)
        || new Set(readBackSequences).size !== readBackSequences.length
        || childSequences.length !== readBackSequences.length
        || childSequences.some((value, index) => value !== readBackSequences[index])
      ) {
        throw new ObsHarnessFailure("ROW_RECEIPT_SEQUENCE_MISMATCH");
      }
      const checked = safeMetrics(metrics);
      if (checked.rows !== rows.length) {
        throw new ObsHarnessFailure("ROW_RECEIPT_COUNT_MISMATCH");
      }
      return mintVerdict("PASS", checked);
    },
    passProcess(receipt: SpawnReceipt, metrics: Readonly<Record<string, number>>): ObsVerdict {
      requireReceipt(receipt);
      if (receipt.occurrenceSequences.length !== 0) {
        throw new ObsHarnessFailure("PROCESS_RECEIPT_CONTAINS_ROWS");
      }
      return mintVerdict("PASS", metrics);
    },
    fail: failVerdict,
  });
}

function validateSubjectPath(subjectPath: string): string {
  if (
    subjectPath.trim() === ""
    || isAbsolute(subjectPath)
    || subjectPath.includes("\\")
    || subjectPath.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new ObsHarnessFailure("SUBJECT_PATH_INVALID");
  }
  if (subjectPath === FORBIDDEN_ZONE_ROOT || subjectPath.startsWith(`${FORBIDDEN_ZONE_ROOT}/`)) {
    throw new ObsHarnessFailure("FORBIDDEN_SUBJECT_PATH");
  }
  return subjectPath;
}

async function missingSubject(repoRoot: string, subjectPaths: readonly string[]): Promise<string | undefined> {
  const realRepoRoot = await realpath(repoRoot);
  for (const rawPath of subjectPaths) {
    const subjectPath = validateSubjectPath(rawPath);
    const absolutePath = resolve(realRepoRoot, subjectPath);
    const fromRoot = relative(realRepoRoot, absolutePath);
    if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) {
      throw new ObsHarnessFailure("SUBJECT_PATH_ESCAPE");
    }
    try {
      await access(absolutePath, constants.R_OK);
    } catch (error) {
      if (
        typeof error === "object"
        && error !== null
        && "code" in error
        && (error.code === "ENOENT" || error.code === "ENOTDIR")
      ) return subjectPath;
      throw new ObsHarnessFailure("SUBJECT_CHECK_FAILED");
    }
  }
  return undefined;
}

function renderMetrics(metrics: Readonly<Record<string, number>>): string {
  return Object.entries(metrics).map(([name, value]) => `${name}=${value}`).join(" ");
}

function selectCases(cases: readonly ObsAcceptanceCase[], only: readonly string[] | undefined): readonly ObsAcceptanceCase[] {
  if (only === undefined) return cases;
  const selected = cases.filter((acceptanceCase) => only.some((pattern) =>
    pattern.endsWith("*")
      ? acceptanceCase.name.startsWith(pattern.slice(0, -1))
      : acceptanceCase.name === pattern
  ));
  if (selected.length === 0) throw new ObsHarnessFailure("UNKNOWN_CASE");
  return selected;
}

export async function runFamily(name: "obs-g1", options: RunFamilyOptions): Promise<FamilyResult> {
  const lines: string[] = [];
  const writeLine = options.writeLine ?? ((line: string) => console.info(line));
  const scratchRoot = options.scratchRoot ?? tmpdir();
  const seen = new Set<string>();
  let failed = false;
  let cases: readonly ObsAcceptanceCase[];
  try {
    for (const acceptanceCase of options.cases) {
      if (!SAFE_CASE_NAME.test(acceptanceCase.name) || seen.has(acceptanceCase.name)) {
        throw new ObsHarnessFailure("CASE_NAME_INVALID");
      }
      seen.add(acceptanceCase.name);
    }
    cases = selectCases(options.cases, options.only);
  } catch (error) {
    const code = error instanceof ObsHarnessFailure ? error.code : "HARNESS_FAILURE";
    const line = `${name}/harness FAIL(code=${code})`;
    writeLine(line);
    return Object.freeze({ exitCode: 1, lines: Object.freeze([line]) });
  }

  for (const acceptanceCase of cases) {
    let line: string;
    try {
      const missing = await missingSubject(options.repoRoot, acceptanceCase.subjectPaths);
      if (missing !== undefined) {
        line = `${name}/${acceptanceCase.name} SKIP(missing: ${missing})`;
      } else {
        const verdict = await acceptanceCase.run(createContext(options.repoRoot, scratchRoot));
        if (!verdicts.has(verdict)) {
          line = `${name}/${acceptanceCase.name} FAIL(code=FABRICATED_VERDICT)`;
          failed = true;
        } else if (verdict.kind === "PASS") {
          line = `${name}/${acceptanceCase.name} PASS(${renderMetrics(verdict.metrics)})`;
        } else {
          line = `${name}/${acceptanceCase.name} FAIL(code=${verdict.code} ${renderMetrics(verdict.metrics)})`;
          failed = true;
        }
      }
    } catch (error) {
      const code = error instanceof ObsHarnessFailure ? error.code : "CASE_THREW";
      line = `${name}/${acceptanceCase.name} FAIL(code=${code})`;
      failed = true;
    }
    lines.push(line);
    writeLine(line);
  }
  return Object.freeze({
    exitCode: failed ? 1 : 0,
    lines: Object.freeze([...lines]),
  });
}

const DEFAULT_OBS_G1_CASES: readonly ObsAcceptanceCase[] = Object.freeze([
  corpusCase,
  identityCanaryCase,
  schemaManifestCase,
]);

function parseFamilyArguments(arguments_: readonly string[]): { readonly only?: readonly string[] } {
  const values = new Map<string, string>();
  for (let index = 0; index < arguments_.length; index += 2) {
    const name = arguments_[index];
    const value = arguments_[index + 1];
    if ((name !== "--family" && name !== "--only") || value === undefined || values.has(name)) {
      throw new ObsHarnessFailure("ARGUMENT_INVALID");
    }
    values.set(name, value);
  }
  if (values.get("--family") !== "obs-g1") throw new ObsHarnessFailure("FAMILY_INVALID");
  const only = values.get("--only");
  if (only === undefined) return {};
  const patterns = only.split(",");
  if (patterns.some((pattern) => !SAFE_CASE_NAME.test(pattern.replace(/\*$/u, "")) || pattern.includes("*") && !pattern.endsWith("*"))) {
    throw new ObsHarnessFailure("ONLY_INVALID");
  }
  return { only: Object.freeze(patterns) };
}

export async function tryRunObsG1(arguments_: readonly string[]): Promise<boolean> {
  if (!arguments_.includes("--family")) return false;
  if (arguments_[arguments_.indexOf("--family") + 1] !== "obs-g1") return false;
  try {
    const parsed = parseFamilyArguments(arguments_);
    const result = await runFamily("obs-g1", {
      cases: DEFAULT_OBS_G1_CASES,
      repoRoot: process.cwd(),
      ...(parsed.only === undefined ? {} : { only: parsed.only }),
    });
    process.exitCode = result.exitCode;
  } catch (error) {
    const code = error instanceof ObsHarnessFailure ? error.code : "HARNESS_FAILURE";
    console.info(`obs-g1/harness FAIL(code=${code})`);
    process.exitCode = 1;
  }
  return true;
}
