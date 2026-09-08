import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";

import { corpusCase } from "./cases/corpus.js";
import { identityCanaryCase } from "./cases/identity-canary.js";
import { schemaManifestCase } from "./cases/schema-manifest.js";
import { CHAOS_CASES } from "./cases/chaos-common.js";
import { installerGraphCase } from "./cases/installer-graph.js";
import {
  OBS_G1_READBACK_MAX_ROWS,
  ObsReadbackFailure,
  openObsReadbackFromEnvironment,
  type ObsOccurrenceReadbackRow,
  type ObsReadback,
} from "./readback.js";

export const OBS_G1_CHILD_OUTPUT_MAX_BYTES = 65_536 as const;
export const OBS_G1_CHILD_KILL_GRACE_MS = 250 as const;

const SAFE_CASE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_CODE = /^[A-Z][A-Z0-9_]{0,63}$/;
const SAFE_METRIC = /^[a-z][a-z0-9_]{0,31}$/;
const SAFE_MISSING_INPUT = /^(?:[A-Z][A-Z0-9_]{1,63}|[a-z0-9][a-z0-9./-]{0,255})$/;
const FORBIDDEN_ZONE_ROOT = "packages/obs-capture/src/zone";
const OBS_RUNTIMES = new Set([
  "api",
  "runner",
  "scheduler",
  "evaluator-lib",
  "ui-client",
  "listener",
  "watchdog",
  "ingest",
]);
const OBS_CAPTURE_POINTS = new Set([
  "process",
  "http",
  "job",
  "provider",
  "db",
  "client",
  "detector",
  "boundary",
  "self",
]);
const OBS_READBACK_FAILURE_CODES: ReadonlySet<string> = new Set([
  "ROW_VERIFIER_UNAVAILABLE",
  "ROW_READBACK_INVALID",
  "ROW_READBACK_QUERY_FAILED",
  "ROW_READBACK_LIMIT",
  "ROW_READBACK_CLOSE_TIMEOUT",
  "ROW_READBACK_CLOSE_FAILED",
]);

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
  readonly rowExpectation?: Readonly<{
    readonly runtime: string;
    readonly capturePoint: string;
  }>;
}

export interface SpawnReceipt {
  readonly pid: number;
  readonly declaredRunRef?: string;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly scratchDirectory: string;
}

export interface ObsVerdict {
  readonly kind: "PASS" | "FAIL" | "SKIP";
  readonly code?: string;
  readonly missing?: string;
  readonly metrics: Readonly<Record<string, number>>;
}

export interface ObsCaseContext {
  spawn(options: SpawnSubjectOptions): Promise<SpawnReceipt>;
  passRows(
    receipt: SpawnReceipt,
    metrics?: Readonly<Record<string, number>>,
  ): ObsVerdict;
  passProcess(receipt: SpawnReceipt, metrics: Readonly<Record<string, number>>): ObsVerdict;
  skipMissing(input: string, metrics?: Readonly<Record<string, number>>): ObsVerdict;
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

interface CaseAuthority {
  readonly verdicts: WeakSet<object>;
  readonly receipts: WeakSet<object>;
  readonly consumedReceipts: WeakSet<object>;
  readonly rowProofs: WeakMap<object, { readonly rows: number }>;
}

interface CaseExecution {
  readonly context: ObsCaseContext;
  consumeVerdict(verdict: ObsVerdict): boolean;
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
  authority: CaseAuthority,
  kind: "PASS" | "FAIL" | "SKIP",
  metrics: Readonly<Record<string, number>>,
  details: Readonly<{ code?: string; missing?: string }> = {},
): ObsVerdict {
  const verdict = Object.freeze({
    kind,
    ...details,
    metrics: kind === "SKIP" && Object.keys(metrics).length === 0
      ? Object.freeze({})
      : safeMetrics(metrics),
  });
  authority.verdicts.add(verdict);
  return verdict;
}

function failVerdict(
  authority: CaseAuthority,
  code: string,
  metrics: Readonly<Record<string, number>> = { failures: 1 },
): ObsVerdict {
  if (!SAFE_CODE.test(code)) throw new ObsHarnessFailure("FAIL_CODE_INVALID");
  return mintVerdict(authority, "FAIL", metrics, { code });
}

function childEnvironment(
  declaredRunRef: string | undefined,
  scratchDirectory: string,
  supplied: Readonly<Record<string, string>> | undefined,
): NodeJS.ProcessEnv {
  const output: NodeJS.ProcessEnv = {};
  for (const name of ["PATH", "LANG", "LC_ALL", "TMPDIR"] as const) {
    if (process.env[name] !== undefined) output[name] = process.env[name];
  }
  for (const [name, value] of Object.entries(supplied ?? {})) {
    if (
      (!name.startsWith("OBS_") && name !== "NODE_ENV")
      || name === "OBS_LISTENER_DATABASE_URL"
      || name === "OBS_G1_DECLARED_RUN_REF"
      || name === "OBS_G1_SCRATCH_DIR"
    ) {
      throw new ObsHarnessFailure("CHILD_ENVIRONMENT_KEY_FORBIDDEN");
    }
    output[name] = value;
  }
  if (declaredRunRef !== undefined) output.OBS_G1_DECLARED_RUN_REF = declaredRunRef;
  output.OBS_G1_SCRATCH_DIR = scratchDirectory;
  return output;
}

function validateRowExpectation(
  expectation: SpawnSubjectOptions["rowExpectation"],
): NonNullable<SpawnSubjectOptions["rowExpectation"]> | undefined {
  if (expectation === undefined) return undefined;
  if (!OBS_RUNTIMES.has(expectation.runtime) || !OBS_CAPTURE_POINTS.has(expectation.capturePoint)) {
    throw new ObsHarnessFailure("ROW_EXPECTATION_INVALID");
  }
  return expectation;
}

function readbackFailure(error: unknown, fallback: string): ObsHarnessFailure {
  return new ObsHarnessFailure(
    error instanceof ObsReadbackFailure && OBS_READBACK_FAILURE_CODES.has(error.code)
      ? error.code
      : fallback,
  );
}

function verifyReadbackRows(
  rows: readonly ObsOccurrenceReadbackRow[],
  baseline: bigint,
  runRef: string,
  runtime: string,
  capturePoint: string,
): number {
  if (rows.length === 0) throw new ObsHarnessFailure("ROW_READBACK_EMPTY");
  if (rows.length > OBS_G1_READBACK_MAX_ROWS) {
    throw new ObsHarnessFailure("ROW_READBACK_LIMIT");
  }
  const sequences = new Set<bigint>();
  for (const row of rows) {
    if (
      row.occurrenceSequence <= baseline
      || row.runRef !== runRef
      || row.runtime !== runtime
      || row.capturePoint !== capturePoint
      || sequences.has(row.occurrenceSequence)
    ) {
      throw new ObsHarnessFailure("ROW_READBACK_MISMATCH");
    }
    sequences.add(row.occurrenceSequence);
  }
  return rows.length;
}

async function spawnSubject(
  repoRoot: string,
  scratchRoot: string,
  options: SpawnSubjectOptions,
  authority: CaseAuthority,
): Promise<SpawnReceipt> {
  if (options.command.trim() === "" || !Number.isInteger(options.timeoutMs) || options.timeoutMs < 1) {
    throw new ObsHarnessFailure("CHILD_OPTIONS_INVALID");
  }
  const rowExpectation = validateRowExpectation(options.rowExpectation);
  let readback: ObsReadback | undefined;
  let baseline: bigint | undefined;
  let declaredRunRef: string | undefined;
  let scratchDirectory: string | undefined;
  try {
    if (rowExpectation !== undefined) {
      try {
        readback = await openObsReadbackFromEnvironment();
      } catch (error) {
        throw readbackFailure(error, "ROW_VERIFIER_UNAVAILABLE");
      }
      if (readback === undefined) throw new ObsHarnessFailure("ROW_VERIFIER_UNAVAILABLE");
      try {
        baseline = await readback.readBaseline();
      } catch (error) {
        throw readbackFailure(error, "ROW_READBACK_QUERY_FAILED");
      }
      declaredRunRef = randomUUID();
    }

    scratchDirectory = await mkdtemp(join(await realpath(scratchRoot), "obs-g1-"));
    const child = spawn(options.command, [...(options.arguments ?? [])], {
      cwd: repoRoot,
      env: childEnvironment(declaredRunRef, scratchDirectory, options.environment),
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const observedPid = child.pid;
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
    if (observedPid === undefined || !Number.isSafeInteger(observedPid) || observedPid < 1) {
      throw new ObsHarnessFailure("CHILD_PID_INVALID");
    }
    const receipt: SpawnReceipt = Object.freeze({
      pid: observedPid,
      ...(declaredRunRef === undefined ? {} : { declaredRunRef }),
      exitCode,
      signal,
      stdout,
      stderr,
      scratchDirectory,
    });
    authority.receipts.add(receipt);

    if (
      rowExpectation !== undefined
      && readback !== undefined
      && baseline !== undefined
      && declaredRunRef !== undefined
    ) {
      let rows: readonly ObsOccurrenceReadbackRow[];
      try {
        rows = await readback.readRows({
          baseline,
          runRef: declaredRunRef,
          runtime: rowExpectation.runtime,
          capturePoint: rowExpectation.capturePoint,
        });
      } catch (error) {
        throw readbackFailure(error, "ROW_READBACK_QUERY_FAILED");
      }
      authority.rowProofs.set(receipt, Object.freeze({
        rows: verifyReadbackRows(
          rows,
          baseline,
          declaredRunRef,
          rowExpectation.runtime,
          rowExpectation.capturePoint,
        ),
      }));
    }
    return receipt;
  } finally {
    try {
      if (scratchDirectory !== undefined) {
        await rm(scratchDirectory, { recursive: true, force: true });
      }
    } finally {
      if (readback !== undefined) {
        try {
          await readback.close();
        } catch (error) {
          throw readbackFailure(error, "ROW_READBACK_CLOSE_FAILED");
        }
      }
    }
  }
}

function createContext(repoRoot: string, scratchRoot: string): CaseExecution {
  const authority: CaseAuthority = {
    verdicts: new WeakSet<object>(),
    receipts: new WeakSet<object>(),
    consumedReceipts: new WeakSet<object>(),
    rowProofs: new WeakMap<object, { readonly rows: number }>(),
  };

  function consumeReceipt(receipt: SpawnReceipt): void {
    if (authority.consumedReceipts.has(receipt)) {
      throw new ObsHarnessFailure("SPAWN_RECEIPT_ALREADY_USED");
    }
    if (!authority.receipts.has(receipt)) throw new ObsHarnessFailure("SPAWN_RECEIPT_INVALID");
    authority.receipts.delete(receipt);
    authority.consumedReceipts.add(receipt);
  }

  const context: ObsCaseContext = Object.freeze({
    spawn: (options: SpawnSubjectOptions) => spawnSubject(repoRoot, scratchRoot, options, authority),
    passRows(
      receipt: SpawnReceipt,
      metrics: Readonly<Record<string, number>> = {},
    ): ObsVerdict {
      consumeReceipt(receipt);
      const proof = authority.rowProofs.get(receipt);
      authority.rowProofs.delete(receipt);
      if (proof === undefined) throw new ObsHarnessFailure("ROW_READBACK_REQUIRED");
      if (Array.isArray(metrics)) throw new ObsHarnessFailure("CASE_ROWS_FORBIDDEN");
      if (Object.hasOwn(metrics, "rows")) throw new ObsHarnessFailure("METRIC_RESERVED");
      return mintVerdict(authority, "PASS", { ...metrics, rows: proof.rows });
    },
    passProcess(receipt: SpawnReceipt, metrics: Readonly<Record<string, number>>): ObsVerdict {
      consumeReceipt(receipt);
      const hasRowProof = authority.rowProofs.has(receipt);
      authority.rowProofs.delete(receipt);
      if (hasRowProof) throw new ObsHarnessFailure("PROCESS_RECEIPT_CONTAINS_ROWS");
      return mintVerdict(authority, "PASS", metrics);
    },
    skipMissing(input: string, metrics: Readonly<Record<string, number>> = {}): ObsVerdict {
      if (!SAFE_MISSING_INPUT.test(input) || input.includes("..")) {
        throw new ObsHarnessFailure("MISSING_INPUT_INVALID");
      }
      const safe = Object.keys(metrics).length === 0 ? {} : safeMetrics(metrics);
      return mintVerdict(authority, "SKIP", safe, { missing: input });
    },
    fail: (
      code: string,
      metrics?: Readonly<Record<string, number>>,
    ) => failVerdict(authority, code, metrics),
  });
  return Object.freeze({
    context,
    consumeVerdict(verdict: ObsVerdict): boolean {
      if (!authority.verdicts.has(verdict)) return false;
      authority.verdicts.delete(verdict);
      return true;
    },
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
        const execution = createContext(options.repoRoot, scratchRoot);
        const verdict = await acceptanceCase.run(execution.context);
        if (!execution.consumeVerdict(verdict)) {
          line = `${name}/${acceptanceCase.name} FAIL(code=FABRICATED_VERDICT)`;
          failed = true;
        } else if (verdict.kind === "PASS") {
          line = `${name}/${acceptanceCase.name} PASS(${renderMetrics(verdict.metrics)})`;
        } else if (verdict.kind === "SKIP" && verdict.missing !== undefined) {
          const metrics = renderMetrics(verdict.metrics);
          line = `${name}/${acceptanceCase.name} SKIP(missing: ${verdict.missing}${metrics === "" ? "" : ` ${metrics}`})`;
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
  ...CHAOS_CASES,
  installerGraphCase,
]);

export function parseObsG1Arguments(arguments_: readonly string[]): { readonly only?: readonly string[] } {
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
  if (patterns.some((pattern) => {
    if (!pattern.endsWith("*")) return !SAFE_CASE_NAME.test(pattern);
    const prefix = pattern.slice(0, -1);
    return prefix === "" || !/^[a-z0-9]+(?:-[a-z0-9]+)*-?$/u.test(prefix);
  })) {
    throw new ObsHarnessFailure("ONLY_INVALID");
  }
  return { only: Object.freeze(patterns) };
}

export async function tryRunObsG1(arguments_: readonly string[]): Promise<boolean> {
  if (!arguments_.includes("--family")) return false;
  if (arguments_[arguments_.indexOf("--family") + 1] !== "obs-g1") return false;
  try {
    const parsed = parseObsG1Arguments(arguments_);
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
