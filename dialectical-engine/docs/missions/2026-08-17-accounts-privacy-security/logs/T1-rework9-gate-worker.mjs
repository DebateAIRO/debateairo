#!/usr/bin/env node
import { spawn } from "node:child_process";
import {
  closeSync, constants, createWriteStream, fsyncSync, openSync, readFileSync,
  lstatSync, readlinkSync, realpathSync, renameSync, statSync, writeSync
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createHash, timingSafeEqual } from "node:crypto";
import { performance } from "node:perf_hooks";
import { parseVitestCounts } from "./T1-rework9-supervisor-parsers.mjs";

const [receiptDir, executionPacketPath, secretPath] = process.argv.slice(2);
if (receiptDir === undefined || executionPacketPath === undefined || secretPath === undefined) {
  process.stderr.write("worker requires RECEIPT_DIR EXECUTION_PACKET SECRET_FILE\n");
  process.exit(64);
}
const hashText = (text) => createHash("sha256").update(text).digest("hex");
const shaFile = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const tuple = (path) => {
  const stats = statSync(path);
  return Object.freeze({ path, sha256: shaFile(path), size: stats.size, mtime_ms: stats.mtimeMs });
};
const sameTuple = (actual, expected) => actual.path === expected?.path
  && actual.sha256 === expected.sha256 && actual.size === expected.size
  && actual.mtime_ms === expected.mtime_ms;
const samePackageLink = (actual, expected) => actual.path === expected?.path
  && actual.target === expected.target && actual.target_sha256 === expected.target_sha256
  && actual.device === expected.device && actual.inode === expected.inode
  && actual.size === expected.size && actual.mtime_ms === expected.mtime_ms
  && actual.canonical_path === expected.canonical_path;
const sameVitestEntrypoint = (actual, expected) => actual.logical_path === expected?.logical_path
  && sameTuple(actual, expected);
const owner = JSON.parse(readFileSync(join(receiptDir, "owner.json"), "utf8"));
const packet = JSON.parse(readFileSync(executionPacketPath, "utf8"));
const [ownershipToken] = readFileSync(secretPath, "utf8").trim().split("\n");
if (!/^[a-f0-9]{64}$/.test(ownershipToken ?? "")) throw new Error("CUSTODY_SECRET_INVALID");
const actualTokenHash = Buffer.from(hashText(ownershipToken), "hex");
const expectedTokenHash = Buffer.from(owner.ownership_token_sha256, "hex");
if (actualTokenHash.length !== expectedTokenHash.length
  || !timingSafeEqual(actualTokenHash, expectedTokenHash)) {
  throw new Error("WORKER_OWNERSHIP_TOKEN_MISMATCH");
}
if (process.env.T1_GATE_RUN_ID !== owner.run_id || packet.run_id !== owner.run_id) {
  throw new Error("WORKER_RUN_ID_MISMATCH");
}
if (process.cwd() !== owner.cwd || process.env.TMPDIR !== owner.tmpdir) {
  throw new Error("WORKER_ENVIRONMENT_MISMATCH");
}
const PINNED_TEST_RUNTIME = "/Users/vladmihaimiron/.hermes/node/bin/node";
const PINNED_VITEST_PACKAGE_LINK = resolve(owner.cwd, "node_modules/vitest");
const PINNED_VITEST_ENTRYPOINT = join(PINNED_VITEST_PACKAGE_LINK, "vitest.mjs");
const PINNED_TEST_ARGS = Object.freeze(["run",
  "tests/integration/registration-database.test.ts"]);
const testRuntime = tuple(PINNED_TEST_RUNTIME);
const measureVitestBinding = () => {
  const linkStat = lstatSync(PINNED_VITEST_PACKAGE_LINK);
  if (!linkStat.isSymbolicLink()) throw new Error("VITEST_PACKAGE_LINK_NOT_SYMLINK");
  const linkTarget = readlinkSync(PINNED_VITEST_PACKAGE_LINK);
  const canonicalPackagePath = realpathSync(PINNED_VITEST_PACKAGE_LINK);
  const canonicalEntrypointPath = realpathSync(PINNED_VITEST_ENTRYPOINT);
  const entryStat = lstatSync(canonicalEntrypointPath);
  if (!entryStat.isFile() || entryStat.isSymbolicLink()
    || dirname(canonicalEntrypointPath) !== canonicalPackagePath) {
    throw new Error("VITEST_CANONICAL_ENTRYPOINT_INVALID");
  }
  return Object.freeze({
    package_link: Object.freeze({
      path: PINNED_VITEST_PACKAGE_LINK,
      target: linkTarget,
      target_sha256: hashText(linkTarget),
      device: linkStat.dev,
      inode: linkStat.ino,
      size: linkStat.size,
      mtime_ms: linkStat.mtimeMs,
      canonical_path: canonicalPackagePath
    }),
    entrypoint: Object.freeze({
      logical_path: PINNED_VITEST_ENTRYPOINT,
      ...tuple(canonicalEntrypointPath)
    })
  });
};
const vitestBinding = measureVitestBinding();
const vitestEntrypoint = vitestBinding.entrypoint;
const argv = Object.freeze([testRuntime.path, vitestEntrypoint.path, ...PINNED_TEST_ARGS]);
if (realpathSync(PINNED_TEST_RUNTIME) !== PINNED_TEST_RUNTIME
  || !sameTuple(testRuntime, owner.test_runtime)
  || !sameTuple(testRuntime, packet.test_runtime)
  || !samePackageLink(vitestBinding.package_link, owner.vitest_package_link)
  || !samePackageLink(vitestBinding.package_link, packet.vitest_package_link)
  || !sameVitestEntrypoint(vitestEntrypoint, owner.vitest_entrypoint)
  || !sameVitestEntrypoint(vitestEntrypoint, packet.vitest_entrypoint)
  || JSON.stringify(owner.argv) !== JSON.stringify(argv)
  || JSON.stringify(packet.argv) !== JSON.stringify(argv)) {
  throw new Error("WORKER_PINNED_TEST_RUNTIME_OR_ENTRYPOINT_MISMATCH");
}

const atomicJson = (path, value) => {
  const temporary = `${path}.tmp-${process.pid}`;
  const fd = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  try {
    writeSync(fd, `${JSON.stringify(value, null, 2)}\n`);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temporary, path);
};
const testStdoutPath = join(receiptDir, "test.stdout.log");
const testStderrPath = join(receiptDir, "test.stderr.log");
const stdout = createWriteStream(testStdoutPath, { flags: "a", mode: 0o600 });
const stderr = createWriteStream(testStderrPath, { flags: "a", mode: 0o600 });
const outputChunks = [];
const startedUtc = new Date().toISOString();
const startedMonotonicMs = performance.now();
// Exact argv, exact cwd, and no detached child or child-created process group.
const child = spawn(testRuntime.path, [vitestEntrypoint.path, ...PINNED_TEST_ARGS], {
  cwd: packet.cwd,
  env: { ...process.env, TMPDIR: owner.tmpdir, T1_GATE_RUN_ID: owner.run_id },
  detached: false,
  stdio: ["ignore", "pipe", "pipe"]
});
let childClosed = false;
let terminationSignal = null;
child.stdout.on("data", (chunk) => {
  outputChunks.push(Buffer.from(chunk));
  stdout.write(chunk);
  process.stdout.write(chunk);
});
child.stderr.on("data", (chunk) => {
  outputChunks.push(Buffer.from(chunk));
  stderr.write(chunk);
  process.stderr.write(chunk);
});
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    terminationSignal = signal;
    // Authority comes from the still-owned, unreaped ChildProcess handle.
    if (!childClosed) child.kill(signal);
  });
}
const closeResult = await new Promise((resolve) => {
  child.once("error", (error) => resolve({ code: null, signal: null, spawn_error: String(error) }));
  child.once("close", (code, signal) => {
    childClosed = true;
    resolve({ code, signal, spawn_error: null });
  });
});
await Promise.all([
  new Promise((resolve) => stdout.end(resolve)),
  new Promise((resolve) => stderr.end(resolve))
]);
for (const path of [testStdoutPath, testStderrPath]) {
  const fd = openSync(path, constants.O_RDONLY);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}
const output = Buffer.concat(outputChunks).toString("utf8");
const parsedCounts = parseVitestCounts(output);
const terminal = Object.freeze({
  schema_version: 1,
  run_id: owner.run_id,
  started_utc: startedUtc,
  ended_utc: new Date().toISOString(),
  started_monotonic_ms: startedMonotonicMs,
  ended_monotonic_ms: performance.now(),
  raw_status: closeResult.code,
  child_signal: closeResult.signal,
  supervisor_signal: terminationSignal,
  spawn_error: closeResult.spawn_error,
  argv,
  cwd: packet.cwd,
  parsed_test_files_passed: parsedCounts.test_files_passed,
  parsed_test_files_total: parsedCounts.test_files_total,
  parsed_tests_passed: parsedCounts.tests_passed,
  parsed_tests_skipped: parsedCounts.tests_skipped,
  parsed_tests_total: parsedCounts.tests_total,
  stdout_bytes: statSync(testStdoutPath).size,
  stderr_bytes: statSync(testStderrPath).size
});
atomicJson(join(receiptDir, "worker-terminal.json"), terminal);

// launchd sees a clean worker after the raw test result is durably recorded;
// ordinary test failure is controller data, not a worker crash/restart signal.
process.exitCode = 0;
