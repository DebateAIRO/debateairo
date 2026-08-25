#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, closeSync, constants, fsyncSync, mkdirSync, openSync,
  lstatSync, readFileSync, readlinkSync, realpathSync, renameSync, statSync, writeFileSync,
  writeSync
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { tmpdir } from "node:os";

const [executionPacketArgument] = process.argv.slice(2);
if (executionPacketArgument === undefined) {
  process.stderr.write("launcher requires one fresh execution-packet path\n");
  process.exit(64);
}
const executionPacketPath = realpathSync(executionPacketArgument);
const packetBytes = readFileSync(executionPacketPath);
const packet = JSON.parse(packetBytes.toString("utf8"));
const runId = packet.run_id;
if (typeof runId !== "string"
  || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(runId)) {
  throw new Error("RUN_ID_NOT_LOWERCASE_UUID");
}
if (!basename(executionPacketPath).startsWith("T1-rework9-")) {
  throw new Error("EXECUTION_PACKET_OUTSIDE_PREFIX");
}

const cwd = realpathSync(packet.cwd);
const PINNED_TEST_RUNTIME = "/Users/vladmihaimiron/.hermes/node/bin/node";
const PINNED_VITEST_PACKAGE_LINK = resolve(cwd, "node_modules/vitest");
const PINNED_VITEST_ENTRYPOINT = join(PINNED_VITEST_PACKAGE_LINK, "vitest.mjs");
const PINNED_TEST_ARGS = Object.freeze(["run",
  "tests/integration/registration-database.test.ts"]);
const logRoot = resolve(cwd, "docs/missions/2026-08-17-accounts-privacy-security/logs");
if (dirname(executionPacketPath) !== logRoot) throw new Error("EXECUTION_PACKET_OUTSIDE_PREFIX");
const lockPath = join(logRoot, ".T1-full-registration.exclusive.lock");
const receiptDir = join(logRoot, `T1-rework9-gate-${runId}`);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const shaFile = (path) => sha256(readFileSync(path));
const run = (command, args, options = {}) => spawnSync(command, args, {
  encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...options
});
const atomicJson = (path, value, mode = 0o600) => {
  const temporary = `${path}.tmp-${process.pid}`;
  const fd = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, mode);
  try {
    writeSync(fd, `${JSON.stringify(value, null, 2)}\n`);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temporary, path);
  const directoryFd = openSync(dirname(path), constants.O_RDONLY);
  try { fsyncSync(directoryFd); } finally { closeSync(directoryFd); }
};
const capture = (command, args) => {
  const result = run(command, args);
  if (result.error !== undefined || result.signal !== null || result.status !== 0
    || typeof result.stdout !== "string" || typeof result.stderr !== "string") {
    throw new Error(`PREFLIGHT_LIVENESS_UNKNOWN:${command}:${result.error ?? result.stderr}`);
  }
  return `${result.stdout}${result.stderr}`;
};
const HEAVY_PROCESS_PATTERN = /vitest|claude|mutation|T1.*full-registration|(?:^|[\/\s])(?:postgres|pg_ctl)(?=[:\s]|$)/i;
const classifyHeavyProcesses = (snapshot) => snapshot.split("\n")
  .filter((line) => HEAVY_PROCESS_PATTERN.test(line));
const tuple = (path) => {
  const stats = statSync(path);
  return Object.freeze({ path, sha256: shaFile(path), size: stats.size, mtime_ms: stats.mtimeMs });
};
const sameTuple = (actual, expected) => actual.path === expected.path
  && actual.sha256 === expected.sha256 && actual.size === expected.size
  && actual.mtime_ms === expected.mtime_ms;
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
      target_sha256: sha256(linkTarget),
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
const samePackageLink = (actual, expected) => actual.path === expected?.path
  && actual.target === expected.target && actual.target_sha256 === expected.target_sha256
  && actual.device === expected.device && actual.inode === expected.inode
  && actual.size === expected.size && actual.mtime_ms === expected.mtime_ms
  && actual.canonical_path === expected.canonical_path;
const sameVitestEntrypoint = (actual, expected) => actual.logical_path === expected?.logical_path
  && sameTuple(actual, expected);
const xml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;").replaceAll("\"", "&quot;").replaceAll("'", "&apos;");
const shellQuote = (value) => `'${String(value).replaceAll("'", `'\\''`)}'`;

// The global claim is the first write and precedes every process inspection.
try {
  mkdirSync(lockPath, { mode: 0o700 });
} catch (error) {
  if (error?.code === "EEXIST") {
    process.stderr.write("EXCLUSIVE_LOCK_CONFLICT\n");
    process.exit(73);
  }
  throw error;
}

let receiptCreated = false;
try {
  mkdirSync(receiptDir, { mode: 0o700 });
  receiptCreated = true;
  const createdUtc = new Date().toISOString();
  const createdMonotonicMs = performance.now();
  const lockStat = statSync(lockPath);
  const ownershipToken = randomBytes(32).toString("hex");
  const challenge = randomBytes(32).toString("hex");
  const ownershipTokenSha256 = sha256(ownershipToken);
  const controllerLabel = `com.debateai.t1gate.controller.${runId}`;
  const workerLabel = `com.debateai.t1gate.worker.${runId}`;
  const runTmpdir = join(tmpdir(), `debateai-t1gate-${runId}`);
  try {
    mkdirSync(runTmpdir, { mode: 0o700 });
  } catch (error) {
    throw new Error(`PRIVATE_TMPDIR_CREATE_FAILED:${error?.code ?? "UNKNOWN"}`);
  }
  const runTmpdirStat = lstatSync(runTmpdir);
  const expectedRunTmpdirRealpath = join(realpathSync(tmpdir()), `debateai-t1gate-${runId}`);
  if (!runTmpdirStat.isDirectory() || runTmpdirStat.isSymbolicLink()
    || realpathSync(runTmpdir) !== expectedRunTmpdirRealpath
    || runTmpdirStat.uid !== process.getuid() || runTmpdirStat.gid !== process.getgid()
    || (runTmpdirStat.mode & 0o777) !== 0o700) {
    throw new Error("PRIVATE_TMPDIR_CUSTODY_MISMATCH");
  }
  const secretPath = join(runTmpdir, "controller-custody.secret");
  writeFileSync(secretPath, `${ownershipToken}\n${challenge}\n`, {
    mode: 0o600, flag: "wx"
  });
  const challengePath = join(runTmpdir, "viewer-challenge");
  writeFileSync(challengePath, `${challenge}\n`, { mode: 0o600, flag: "wx" });

  const gitHead = capture("/usr/bin/git", ["-C", cwd, "rev-parse", "HEAD"]).trim();
  const staged = capture("/usr/bin/git", ["-C", cwd, "diff", "--cached", "--name-only"])
    .split("\n").filter(Boolean);
  if (gitHead !== packet.head || staged.length !== 0) throw new Error("ENTRY_GIT_CUSTODY_MISMATCH");
  if (packet.expected_test_files !== 1 || packet.expected_tests !== 56) {
    throw new Error("EXPECTED_TEST_COUNT_MISMATCH");
  }
  if (!Array.isArray(packet.allowed_postgresql_baseline)
    || !packet.allowed_postgresql_baseline.every((line) => typeof line === "string")) {
    throw new Error("POSTGRESQL_BASELINE_INVALID");
  }
  if (!Array.isArray(packet.argv) || !packet.argv.every((part) => typeof part === "string")) {
    throw new Error("EXECUTION_ARGV_INVALID");
  }
  const testRuntime = tuple(PINNED_TEST_RUNTIME);
  const vitestBinding = measureVitestBinding();
  const vitestEntrypoint = vitestBinding.entrypoint;
  const exactTestArgv = Object.freeze([testRuntime.path, vitestEntrypoint.path,
    ...PINNED_TEST_ARGS]);
  if (process.execPath !== PINNED_TEST_RUNTIME
    || realpathSync(PINNED_TEST_RUNTIME) !== PINNED_TEST_RUNTIME
    || !sameTuple(testRuntime, packet.test_runtime)
    || !samePackageLink(vitestBinding.package_link, packet.vitest_package_link)
    || !sameVitestEntrypoint(vitestEntrypoint, packet.vitest_entrypoint)
    || JSON.stringify(packet.argv) !== JSON.stringify(exactTestArgv)) {
    throw new Error("PINNED_TEST_RUNTIME_OR_ENTRYPOINT_MISMATCH");
  }
  const actualGoverned = packet.governed.map((expected) => Object.freeze({
    ...tuple(resolve(cwd, expected.path)), path: expected.path
  }));
  if (actualGoverned.length !== 12
    || !actualGoverned.every((actual, index) => sameTuple(actual, packet.governed[index]))) {
    throw new Error("GOVERNED_TUPLE_MISMATCH");
  }

  const staticArtifacts = {};
  for (const [name, binding] of Object.entries(packet.static_artifacts)) {
    const actual = tuple(realpathSync(binding.path));
    if (actual.sha256 !== binding.sha256 || actual.size !== binding.size
      || actual.mtime_ms !== binding.mtime_ms) throw new Error(`STATIC_ARTIFACT_MISMATCH:${name}`);
    staticArtifacts[name] = actual;
  }
  for (const required of ["launcher", "controller", "worker", "viewer",
    "controller_plist_template", "worker_plist_template", "launchd_stream_custody",
    "supervisor_parsers"]) {
    if (staticArtifacts[required] === undefined) {
      throw new Error(`STATIC_ARTIFACT_REQUIRED:${required}`);
    }
  }
  const authorization = tuple(realpathSync(packet.authorization_receipt.path));
  const finalPacket = tuple(realpathSync(packet.final_rework9_packet.path));
  if (authorization.sha256 !== packet.authorization_receipt.sha256
    || finalPacket.sha256 !== packet.final_rework9_packet.sha256) {
    throw new Error("AUTHORIZATION_PACKET_HASH_MISMATCH");
  }

  const controllerStdout = join(receiptDir, "controller.stdout.log");
  const controllerStderr = join(receiptDir, "controller.stderr.log");
  const workerStdout = join(receiptDir, "worker.stdout.log");
  const workerStderr = join(receiptDir, "worker.stderr.log");
  const testStdout = join(receiptDir, "test.stdout.log");
  const testStderr = join(receiptDir, "test.stderr.log");
  for (const stream of [testStdout, testStderr]) {
    const fd = openSync(stream, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    closeSync(fd);
  }
  const launchdStreamPaths = Object.freeze({
    controller_stdout: join(runTmpdir, "controller.stdout.log"),
    controller_stderr: join(runTmpdir, "controller.stderr.log"),
    worker_stdout: join(runTmpdir, "worker.stdout.log"),
    worker_stderr: join(runTmpdir, "worker.stderr.log")
  });
  for (const stream of Object.values(launchdStreamPaths)) {
    const fd = openSync(stream, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    closeSync(fd);
  }
  const launchdStreams = Object.freeze({
    controller: Object.freeze({
      stdout: Object.freeze({ launchd_path: launchdStreamPaths.controller_stdout,
        receipt_path: controllerStdout }),
      stderr: Object.freeze({ launchd_path: launchdStreamPaths.controller_stderr,
        receipt_path: controllerStderr })
    }),
    worker: Object.freeze({
      stdout: Object.freeze({ launchd_path: launchdStreamPaths.worker_stdout,
        receipt_path: workerStdout }),
      stderr: Object.freeze({ launchd_path: launchdStreamPaths.worker_stderr,
        receipt_path: workerStderr })
    })
  });
  const render = (templateName, replacements) => {
    let rendered = readFileSync(staticArtifacts[templateName].path, "utf8");
    for (const [placeholder, value] of Object.entries(replacements)) {
      rendered = rendered.replaceAll(`__${placeholder}__`, xml(value));
    }
    if (/__[A-Z_]+__/.test(rendered)) throw new Error(`PLIST_PLACEHOLDER_REMAINS:${templateName}`);
    return rendered;
  };
  const common = {
    NODE: process.execPath, RECEIPT_DIR: receiptDir, EXECUTION_PACKET: executionPacketPath,
    SECRET_FILE: secretPath, CWD: cwd, TMPDIR: runTmpdir, RUN_ID: runId
  };
  const controllerPlistBytes = render("controller_plist_template", {
    ...common, CONTROLLER_LABEL: controllerLabel,
    CONTROLLER: staticArtifacts.controller.path,
    CONTROLLER_STDOUT: launchdStreamPaths.controller_stdout,
    CONTROLLER_STDERR: launchdStreamPaths.controller_stderr
  });
  const workerPlistBytes = render("worker_plist_template", {
    ...common, WORKER_LABEL: workerLabel, WORKER: staticArtifacts.worker.path,
    WORKER_STDOUT: launchdStreamPaths.worker_stdout,
    WORKER_STDERR: launchdStreamPaths.worker_stderr
  });
  const controllerPlistPath = join(receiptDir, "controller.plist");
  const workerPlistPath = join(receiptDir, "worker.plist");
  writeFileSync(controllerPlistPath, controllerPlistBytes, { mode: 0o600, flag: "wx" });
  writeFileSync(workerPlistPath, workerPlistBytes, { mode: 0o600, flag: "wx" });
  const renderedPlists = Object.freeze({
    controller: tuple(controllerPlistPath), worker: tuple(workerPlistPath)
  });
  if (renderedPlists.controller.sha256 !== packet.rendered_plist_sha256.controller
    || renderedPlists.worker.sha256 !== packet.rendered_plist_sha256.worker) {
    throw new Error("RENDERED_PLIST_HASH_MISMATCH");
  }

  const owner = Object.freeze({
    schema_version: 1,
    run_id: runId,
    ownership_token_sha256: ownershipTokenSha256,
    ticket: packet.ticket,
    argv: packet.argv,
    test_runtime: testRuntime,
    vitest_package_link: vitestBinding.package_link,
    vitest_entrypoint: vitestEntrypoint,
    cwd,
    head: gitHead,
    staged_path_count: staged.length,
    authorization_receipt: authorization,
    execution_packet: Object.freeze({ path: executionPacketPath, sha256: sha256(packetBytes),
      size: packetBytes.length, mtime_ms: statSync(executionPacketPath).mtimeMs }),
    final_rework9_packet: finalPacket,
    static_artifacts: staticArtifacts,
    rendered_plists: renderedPlists,
    launchd_streams: launchdStreams,
    governed: actualGoverned,
    launchd_labels: Object.freeze({ controller: controllerLabel, worker: workerLabel }),
    expected_test_files: 1,
    expected_tests: 56,
    tmpdir: runTmpdir,
    lock: Object.freeze({ path: lockPath, device: lockStat.dev, inode: lockStat.ino }),
    allowed_postgresql_baseline: packet.allowed_postgresql_baseline,
    created_utc: createdUtc,
    created_monotonic_ms: createdMonotonicMs
  });
  const ownerPath = join(receiptDir, "owner.json");
  atomicJson(ownerPath, owner);
  chmodSync(ownerPath, 0o400);
  const ownerSha256 = shaFile(ownerPath);
  atomicJson(join(lockPath, "claim.json"), Object.freeze({
    schema_version: 1,
    run_id: runId,
    ownership_token_sha256: ownershipTokenSha256,
    owner_sha256: ownerSha256,
    lock_device: lockStat.dev,
    lock_inode: lockStat.ino
  }));

  const viewerCommand = `exec ${shellQuote(process.execPath)} ${shellQuote(staticArtifacts.viewer.path)} `
    + `${shellQuote(receiptDir)} ${shellQuote(challengePath)}`;
  const appleScript = `tell application "Terminal" to do script ${JSON.stringify(viewerCommand)}`;
  const viewerLaunch = run("/usr/bin/osascript", ["-e", appleScript]);
  if (viewerLaunch.status !== 0 || viewerLaunch.error !== undefined) {
    throw new Error(`VIEWER_LAUNCH_FAILED:${viewerLaunch.error ?? viewerLaunch.stderr}`);
  }

  const processSnapshot = capture("/bin/ps", ["-axo", "pid=,ppid=,lstart=,command=", "-ww"]);
  const launchdSnapshot = capture("/bin/launchctl", ["print", `gui/${process.getuid()}`]);
  writeFileSync(join(receiptDir, "process-pre.txt"), processSnapshot, { mode: 0o600, flag: "wx" });
  writeFileSync(join(receiptDir, "launchd-pre.txt"), launchdSnapshot, { mode: 0o600, flag: "wx" });
  const heavy = classifyHeavyProcesses(processSnapshot);
  const allowedBaseline = new Set(packet.allowed_postgresql_baseline);
  const unexplained = heavy.filter((line) => !allowedBaseline.has(line.trim()));
  const otherWorker = /com\.debateai\.t1gate\.worker\.(?!__NEVER__)/.test(launchdSnapshot);
  const decision = unexplained.length === 0 && !otherWorker;
  const preflight = Object.freeze({
    schema_version: 1,
    run_id: runId,
    process_snapshot_sha256: shaFile(join(receiptDir, "process-pre.txt")),
    launchd_snapshot_sha256: shaFile(join(receiptDir, "launchd-pre.txt")),
    process_snapshot_complete: processSnapshot.endsWith("\n") && processSnapshot.split("\n").length > 2,
    launchd_snapshot_complete: launchdSnapshot.length > 0,
    allowed_postgresql_baseline: packet.allowed_postgresql_baseline,
    unexplained_heavy_processes: unexplained,
    other_t1_worker_service: otherWorker,
    token_verified: true,
    cwd_verified: process.cwd() === cwd,
    argv_verified: JSON.stringify(packet.argv) === JSON.stringify(owner.argv),
    pinned_test_runtime_verified: sameTuple(testRuntime, owner.test_runtime),
    vitest_package_link_verified: samePackageLink(vitestBinding.package_link,
      owner.vitest_package_link),
    vitest_entrypoint_verified: sameVitestEntrypoint(vitestEntrypoint,
      owner.vitest_entrypoint),
    head_verified: capture("/usr/bin/git", ["-C", cwd, "rev-parse", "HEAD"]).trim() === owner.head,
    empty_index_verified: capture("/usr/bin/git", ["-C", cwd, "diff", "--cached", "--name-only"]).trim() === "",
    artifact_hashes_verified: true,
    governed_tuples_verified: packet.governed.every((expected, index) =>
      sameTuple(Object.freeze({ ...tuple(resolve(cwd, expected.path)), path: expected.path }),
        actualGoverned[index])),
    bootstrap_decision: decision ? "BOOTSTRAP_CONTROLLER" : "PREFLIGHT_LIVENESS_UNKNOWN",
    utc: new Date().toISOString(),
    monotonic_ms: performance.now()
  });
  atomicJson(join(receiptDir, "preflight.json"), preflight);
  if (!preflight.process_snapshot_complete || !preflight.launchd_snapshot_complete || !decision
    || !preflight.cwd_verified || !preflight.head_verified || !preflight.empty_index_verified
    || !preflight.argv_verified || !preflight.pinned_test_runtime_verified
    || !preflight.vitest_package_link_verified || !preflight.vitest_entrypoint_verified
    || !preflight.governed_tuples_verified) throw new Error("PREFLIGHT_LIVENESS_UNKNOWN");

  const bootstrap = run("/bin/launchctl", ["bootstrap", `gui/${process.getuid()}`, controllerPlistPath]);
  if (bootstrap.status !== 0 || bootstrap.error !== undefined) {
    throw new Error(`CONTROLLER_BOOTSTRAP_FAILED:${bootstrap.error ?? bootstrap.stderr}`);
  }
  process.stdout.write(`${JSON.stringify({ run_id: runId, receipt_dir: receiptDir,
    state: "CONTROLLER_BOOTSTRAPPED" })}\n`);
} catch (error) {
  if (receiptCreated) {
    try {
      atomicJson(join(receiptDir, "launcher-abort.json"), Object.freeze({
        schema_version: 1,
        run_id: runId,
        classification: "UNKNOWN_HELD",
        error: error instanceof Error ? `${error.name}:${error.message}` : String(error),
        lock_retained: true,
        utc: new Date().toISOString(),
        monotonic_ms: performance.now()
      }));
    } catch { /* Retain the global lock even if receipt persistence also fails. */ }
  }
  process.stderr.write(`UNKNOWN_HELD ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
