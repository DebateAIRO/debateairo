#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants,
  fsyncSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HASH = /^[0-9a-f]{64}$/u;
const DECIMAL = /^(?:0|[1-9][0-9]*)$/u;
const GATE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const RUN = /^[123]$/u;

function fail(code) {
  throw new Error(code);
}

function ownDataRecord(value, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(code);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(code);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const descriptor of Object.values(descriptors)) {
    if (!("value" in descriptor) || !descriptor.enumerable) fail(code);
  }
  return value;
}

function keys(value, expected, code) {
  const actual = Object.keys(ownDataRecord(value, code));
  if (
    actual.length !== expected.length ||
    actual.some((entry, index) => entry !== expected[index])
  ) {
    fail(code);
  }
}

function own(value, key, code) {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined || !("value" in descriptor)) fail(code);
  return descriptor.value;
}

function strings(value, nonempty, code) {
  if (!Array.isArray(value) || (nonempty && value.length === 0)) fail(code);
  const output = [];
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, String(index))) fail(code);
    const entry = value[index];
    if (typeof entry !== "string" || entry.length === 0) fail(code);
    output.push(entry);
  }
  return output;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseJsonBytes(bytes, code) {
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.length === 0 ||
    bytes[0] === 0xef ||
    bytes.includes(0x0d) ||
    bytes[bytes.length - 1] !== 0x0a
  ) {
    fail(code);
  }
  const text = bytes.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(bytes)) fail(code);
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    fail(code);
  }
  return value;
}

function parseRule(value) {
  keys(
    value,
    [
      "child_argv",
      "expected_exit",
      "files",
      "id",
      "reporter_bytes",
      "reporter_count",
      "reporter_names",
      "reporter_sha256",
    ],
    "FIX09_GATE_MANIFEST",
  );
  const childArgv = strings(own(value, "child_argv", "FIX09_GATE_MANIFEST"), true, "FIX09_GATE_MANIFEST");
  const files = strings(own(value, "files", "FIX09_GATE_MANIFEST"), true, "FIX09_GATE_MANIFEST");
  const reporterNames = strings(
    own(value, "reporter_names", "FIX09_GATE_MANIFEST"),
    true,
    "FIX09_GATE_MANIFEST",
  );
  const id = own(value, "id", "FIX09_GATE_MANIFEST");
  const expectedExit = own(value, "expected_exit", "FIX09_GATE_MANIFEST");
  const reporterBytes = own(value, "reporter_bytes", "FIX09_GATE_MANIFEST");
  const reporterCount = own(value, "reporter_count", "FIX09_GATE_MANIFEST");
  const reporterSha256 = own(value, "reporter_sha256", "FIX09_GATE_MANIFEST");
  const encodedNames = Buffer.from(JSON.stringify(reporterNames), "utf8");
  if (
    typeof id !== "string" ||
    !GATE_ID.test(id) ||
    expectedExit !== "zero" ||
    typeof reporterBytes !== "string" ||
    !DECIMAL.test(reporterBytes) ||
    typeof reporterCount !== "string" ||
    !DECIMAL.test(reporterCount) ||
    typeof reporterSha256 !== "string" ||
    !HASH.test(reporterSha256) ||
    new Set(files).size !== files.length ||
    new Set(reporterNames).size !== reporterNames.length ||
    Number(reporterCount) !== reporterNames.length ||
    Number(reporterBytes) !== encodedNames.length ||
    reporterSha256 !== sha256(encodedNames) ||
    childArgv.some((entry) => entry.includes("\0")) ||
    files.some(
      (entry) =>
        entry.startsWith("/") ||
        entry.includes("\\") ||
        entry.split("/").some((component) => component === "" || component === "." || component === ".."),
    )
  ) {
    fail("FIX09_GATE_MANIFEST");
  }
  return Object.freeze({
    child_argv: Object.freeze(childArgv),
    expected_exit: expectedExit,
    files: Object.freeze(files),
    id,
    reporter_bytes: reporterBytes,
    reporter_count: reporterCount,
    reporter_names: Object.freeze(reporterNames),
    reporter_sha256: reporterSha256,
  });
}

export function parseGateManifest(bytes) {
  const parsed = parseJsonBytes(bytes, "FIX09_GATE_MANIFEST");
  keys(parsed, ["gates", "schema"], "FIX09_GATE_MANIFEST");
  if (own(parsed, "schema", "FIX09_GATE_MANIFEST") !== "fix09-gate-manifest/v1") {
    fail("FIX09_GATE_MANIFEST");
  }
  const rawGates = own(parsed, "gates", "FIX09_GATE_MANIFEST");
  if (!Array.isArray(rawGates) || rawGates.length === 0) fail("FIX09_GATE_MANIFEST");
  const gates = rawGates.map(parseRule);
  if (new Set(gates.map(({ id }) => id)).size !== gates.length) {
    fail("FIX09_GATE_DUPLICATE_ID");
  }
  return Object.freeze({
    gates: Object.freeze(gates),
    schema: "fix09-gate-manifest/v1",
  });
}

function integerField(report, field) {
  const value = own(report, field, "FIX09_GATE_SUMMARY");
  if (!Number.isSafeInteger(value) || value < 0) fail("FIX09_GATE_SUMMARY");
  return value;
}

function normalizeReportedPath(reported, expectedFiles) {
  if (typeof reported !== "string" || reported.length === 0) fail("FIX09_GATE_FILES");
  const normalized = reported.replaceAll("\\", "/");
  const matches = expectedFiles.filter(
    (candidate) =>
      normalized === candidate || normalized.endsWith(`/${candidate}`),
  );
  if (matches.length !== 1) fail("FIX09_GATE_FILES");
  return matches[0];
}

export function validateVitestReport(rule, report, childStatus) {
  if (!Number.isSafeInteger(childStatus) || childStatus !== 0) fail("FIX09_GATE_RC");
  if (
    rule.reporter_count === "105" ||
    rule.reporter_count === "109"
  ) {
    fail("FIX09_GATE_LEGACY_TOTAL_105_109");
  }
  const expectedNames = strings(rule.reporter_names, true, "FIX09_GATE_MANIFEST");
  const expectedFiles = strings(rule.files, true, "FIX09_GATE_MANIFEST");
  const expectedBytes = Buffer.from(JSON.stringify(expectedNames), "utf8");
  if (
    rule.reporter_count !== String(expectedNames.length) ||
    rule.reporter_bytes !== String(expectedBytes.length) ||
    rule.reporter_sha256 !== sha256(expectedBytes)
  ) {
    fail(expectedNames.length > 1 ? "FIX09_GATE_IT_EACH_UNDERCOUNT" : "FIX09_GATE_MANIFEST");
  }

  ownDataRecord(report, "FIX09_GATE_REPORT");
  const testResults = own(report, "testResults", "FIX09_GATE_REPORT");
  if (!Array.isArray(testResults) || testResults.length === 0) {
    fail(expectedNames.length > 1 ? "FIX09_GATE_IT_EACH_UNDERCOUNT" : "FIX09_GATE_ZERO_SELECTION");
  }
  const byPath = new Map();
  for (const rawResult of testResults) {
    const result = ownDataRecord(rawResult, "FIX09_GATE_REPORT");
    const file = normalizeReportedPath(own(result, "name", "FIX09_GATE_REPORT"), expectedFiles);
    if (byPath.has(file)) fail("FIX09_GATE_FILES");
    const assertions = own(result, "assertionResults", "FIX09_GATE_REPORT");
    if (!Array.isArray(assertions)) fail("FIX09_GATE_REPORT");
    const names = assertions.map((rawAssertion) => {
      const assertion = ownDataRecord(rawAssertion, "FIX09_GATE_REPORT");
      const ancestors = strings(
        own(assertion, "ancestorTitles", "FIX09_GATE_REPORT"),
        true,
        "FIX09_GATE_REPORT",
      );
      const title = own(assertion, "title", "FIX09_GATE_REPORT");
      const status = own(assertion, "status", "FIX09_GATE_REPORT");
      if (typeof title !== "string" || title.length === 0) fail("FIX09_GATE_REPORT");
      if (status !== "passed") fail("FIX09_GATE_STATUS");
      return `${ancestors.join(" > ")} > ${title}`;
    });
    byPath.set(file, names);
  }
  if (
    byPath.size !== expectedFiles.length ||
    expectedFiles.some((file) => !byPath.has(file))
  ) {
    fail("FIX09_GATE_FILES");
  }
  const observedNames = expectedFiles.flatMap((file) => byPath.get(file));
  if (observedNames.length === 0) {
    fail(expectedNames.length > 1 ? "FIX09_GATE_IT_EACH_UNDERCOUNT" : "FIX09_GATE_ZERO_SELECTION");
  }
  if (
    observedNames.length !== expectedNames.length ||
    observedNames.some((name, index) => name !== expectedNames[index])
  ) {
    fail(expectedNames.length > 1 ? "FIX09_GATE_IT_EACH_UNDERCOUNT" : "FIX09_GATE_NAMES");
  }

  const total = integerField(report, "numTotalTests");
  const passed = integerField(report, "numPassedTests");
  const failed = integerField(report, "numFailedTests");
  const skipped = integerField(report, "numPendingTests");
  const todo = integerField(report, "numTodoTests");
  if (skipped !== 0) fail("FIX09_GATE_SKIPPED");
  if (todo !== 0) fail("FIX09_GATE_TODO");
  if (failed !== 0 || own(report, "success", "FIX09_GATE_SUMMARY") !== true) {
    fail("FIX09_GATE_STATUS");
  }
  if (total !== expectedNames.length || passed !== expectedNames.length) {
    fail("FIX09_GATE_SUMMARY");
  }
  return Object.freeze({ failed, files: expectedFiles.length, skipped, tests: total, todo });
}

function writeExclusive(path, bytes) {
  const descriptor = openSync(
    path,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  chmodSync(path, 0o400);
}

function parseCli(argv) {
  if (
    argv.length < 8 ||
    argv[0] !== "--manifest" ||
    argv[2] !== "--gate" ||
    argv[4] !== "--run" ||
    argv[6] !== "--" ||
    !RUN.test(argv[5])
  ) {
    fail("FIX09_GATE_ARGV");
  }
  return { childArgv: argv.slice(7), gateId: argv[3], manifestPath: argv[1], run: argv[5] };
}

function readRegularNoFollow(path, code) {
  const before = lstatSync(path, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n) fail(code);
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const bytes = readFileSync(descriptor);
    const after = lstatSync(path, { bigint: true });
    if (
      !after.isFile() ||
      after.isSymbolicLink() ||
      after.nlink !== 1n ||
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs
    ) {
      fail(code);
    }
    return bytes;
  } finally {
    closeSync(descriptor);
  }
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function runCaptureGate(argv, adapter = { spawnSync }) {
  const parsed = parseCli(argv);
  const manifestBytes = readRegularNoFollow(parsed.manifestPath, "FIX09_GATE_MANIFEST");
  const manifest = parseGateManifest(manifestBytes);
  const rule = manifest.gates.find(({ id }) => id === parsed.gateId);
  if (rule === undefined) fail("FIX09_GATE_ID");
  assertChildArgv(rule, parsed.childArgv);

  const evidenceDirectory = mkdtempSync(join(tmpdir(), `fix09-capture-${rule.id}-${parsed.run}-`));
  chmodSync(evidenceDirectory, 0o700);
  const startedAt = new Date().toISOString();
  const child = adapter.spawnSync(parsed.childArgv[0], parsed.childArgv.slice(1), {
    cwd: process.cwd(),
    encoding: null,
    env: process.env,
    maxBuffer: 128 * 1024 * 1024,
    shell: false,
  });
  const endedAt = new Date().toISOString();
  const status = child.status;
  const stdout = Buffer.isBuffer(child.stdout) ? child.stdout : Buffer.from([]);
  const stderr = Buffer.isBuffer(child.stderr) ? child.stderr : Buffer.from([]);
  writeExclusive(join(evidenceDirectory, "stdout"), stdout);
  writeExclusive(join(evidenceDirectory, "stderr"), stderr);
  writeExclusive(join(evidenceDirectory, "rc"), Buffer.from(`${status ?? "signal"}\n`));
  writeExclusive(join(evidenceDirectory, "argv"), Buffer.from(`${canonical(parsed.childArgv)}\n`));
  writeExclusive(
    join(evidenceDirectory, "tool-version"),
    Buffer.from(`${process.version}\n`),
  );
  writeExclusive(join(evidenceDirectory, "start"), Buffer.from(`${startedAt}\n`));
  writeExclusive(join(evidenceDirectory, "end"), Buffer.from(`${endedAt}\n`));
  const evidence = {
    argv_sha256: sha256(Buffer.from(`${canonical(parsed.childArgv)}\n`)),
    ended_at: endedAt,
    rc: status === null ? null : String(status),
    run: parsed.run,
    schema: "fix09-gate-evidence/v1",
    started_at: startedAt,
    stderr_sha256: sha256(stderr),
    stdout_sha256: sha256(stdout),
  };
  const evidenceBytes = Buffer.from(`${canonical(evidence)}\n`);
  writeExclusive(join(evidenceDirectory, "manifest.json"), evidenceBytes);
  chmodSync(evidenceDirectory, 0o500);

  if (child.error !== undefined || child.signal !== null || status === null) fail("FIX09_GATE_CHILD");
  const report = parseJsonBytes(stdout, "FIX09_GATE_REPORT");
  const summary = validateVitestReport(rule, report, status);
  return { ...summary, gate: rule.id, run: parsed.run };
}

export function assertChildArgv(rule, childArgv) {
  if (
    childArgv.length !== rule.child_argv.length ||
    childArgv.some((value, index) => value !== rule.child_argv[index])
  ) {
    fail("FIX09_GATE_ARGV_DRIFT");
  }
}

function main() {
  let gate = "invalid";
  let run = "0";
  try {
    const parsed = parseCli(process.argv.slice(2));
    gate = parsed.gateId;
    run = parsed.run;
    const summary = runCaptureGate(process.argv.slice(2));
    process.stdout.write(
      `FIX09_GATE_PASS gate=${summary.gate} run=${summary.run} files=${summary.files} tests=${summary.tests} failed=0 skipped=0 todo=0\n`,
    );
  } catch (error) {
    const code =
      error instanceof Error && /^FIX09_GATE_[A-Z0-9_]+$/u.test(error.message)
        ? error.message
        : "FIX09_GATE_UNEXPECTED";
    process.stderr.write(`FIX09_GATE_FAIL code=${code} gate=${gate} run=${run}\n`);
    process.exitCode = 1;
  }
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  main();
}
