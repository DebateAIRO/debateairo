#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash, timingSafeEqual } from "node:crypto";
import {
  appendFileSync, chmodSync, closeSync, constants, existsSync, fsyncSync, openSync,
  lstatSync, readFileSync, readdirSync, readlinkSync, realpathSync, renameSync, rmdirSync,
  statSync, unlinkSync, writeFileSync, writeSync
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import {
  expectedLaunchdStreamPlan, sealLaunchdStreams, verifySealedLaunchdStreams
} from "./T1-rework9-launchd-stream-custody.mjs";
import { classifyPostflightProcesses } from "./T1-rework9-supervisor-parsers.mjs";

const [receiptDir, executionPacketPath, secretPath] = process.argv.slice(2);
if (receiptDir === undefined || executionPacketPath === undefined || secretPath === undefined) {
  process.stderr.write("controller requires RECEIPT_DIR EXECUTION_PACKET SECRET_FILE\n");
  process.exit(64);
}
const ownerPath = join(receiptDir, "owner.json");
const owner = JSON.parse(readFileSync(ownerPath, "utf8"));
const packetBytes = readFileSync(executionPacketPath);
const packet = JSON.parse(packetBytes.toString("utf8"));
const [ownershipToken, viewerChallenge] = readFileSync(secretPath, "utf8").trim().split("\n");
if (!/^[a-f0-9]{64}$/.test(ownershipToken ?? "")
  || !/^[a-f0-9]{64}$/.test(viewerChallenge ?? "")) throw new Error("CUSTODY_SECRET_INVALID");
const claim = JSON.parse(readFileSync(join(owner.lock.path, "claim.json"), "utf8"));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const shaFile = (path) => sha256(readFileSync(path));
const tuple = (path, logicalPath = path) => {
  const stats = statSync(path);
  return Object.freeze({ path: logicalPath, sha256: shaFile(path), size: stats.size,
    mtime_ms: stats.mtimeMs });
};
const sameTuple = (actual, expected) => actual.path === expected.path
  && actual.sha256 === expected.sha256 && actual.size === expected.size
  && actual.mtime_ms === expected.mtime_ms;
const samePackageLink = (actual, expected) => actual.path === expected?.path
  && actual.target === expected.target && actual.target_sha256 === expected.target_sha256
  && actual.device === expected.device && actual.inode === expected.inode
  && actual.size === expected.size && actual.mtime_ms === expected.mtime_ms
  && actual.canonical_path === expected.canonical_path;
const sameVitestEntrypoint = (actual, expected) => actual.logical_path === expected?.logical_path
  && sameTuple(actual, expected);
const measureVitestBinding = () => {
  const packageLinkPath = resolve(owner.cwd, "node_modules/vitest");
  const logicalEntrypointPath = join(packageLinkPath, "vitest.mjs");
  const linkStat = lstatSync(packageLinkPath);
  if (!linkStat.isSymbolicLink()) throw new Error("VITEST_PACKAGE_LINK_NOT_SYMLINK");
  const linkTarget = readlinkSync(packageLinkPath);
  const canonicalPackagePath = realpathSync(packageLinkPath);
  const canonicalEntrypointPath = realpathSync(logicalEntrypointPath);
  const entryStat = lstatSync(canonicalEntrypointPath);
  if (!entryStat.isFile() || entryStat.isSymbolicLink()
    || dirname(canonicalEntrypointPath) !== canonicalPackagePath) {
    throw new Error("VITEST_CANONICAL_ENTRYPOINT_INVALID");
  }
  return Object.freeze({
    package_link: Object.freeze({
      path: packageLinkPath,
      target: linkTarget,
      target_sha256: sha256(linkTarget),
      device: linkStat.dev,
      inode: linkStat.ino,
      size: linkStat.size,
      mtime_ms: linkStat.mtimeMs,
      canonical_path: canonicalPackagePath
    }),
    entrypoint: Object.freeze({
      logical_path: logicalEntrypointPath,
      ...tuple(canonicalEntrypointPath)
    })
  });
};
const run = (command, args) => spawnSync(command, args, {
  encoding: "utf8", maxBuffer: 64 * 1024 * 1024
});
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
const POSTGRES_PROCESS_PATTERN = /(?:^|[\/\s])(?:postgres|pg_ctl)(?=[:\s]|$)/i;
const atomicJson = (path, value) => {
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  const fd = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
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
const immutableJson = (path, value) => {
  if (existsSync(path)) throw new Error(`WRITE_ONCE_EXISTS:${path}`);
  atomicJson(path, value);
  chmodSync(path, 0o400);
};
const exclusiveJson = (path, value) => {
  const fd = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  try {
    writeSync(fd, `${JSON.stringify(value, null, 2)}\n`);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
};
let eventSequence = existsSync(join(receiptDir, "events.jsonl"))
  ? readFileSync(join(receiptDir, "events.jsonl"), "utf8").split("\n").filter(Boolean).length
  : 0;
const event = (kind, details = {}) => {
  eventSequence += 1;
  const path = join(receiptDir, "events.jsonl");
  appendFileSync(path, `${JSON.stringify({ sequence: eventSequence, run_id: owner.run_id,
    kind, utc: new Date().toISOString(), monotonic_ms: performance.now(), ...details })}\n`, {
    mode: 0o600
  });
  const fd = openSync(path, constants.O_RDONLY);
  try { fsyncSync(fd); } finally { closeSync(fd); }
};
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
const launchdTarget = `gui/${process.getuid()}`;
const labelState = (label) => {
  const result = run("/bin/launchctl", ["print", `${launchdTarget}/${label}`]);
  if (result.error !== undefined || result.signal !== null) {
    return Object.freeze({ state: "unknown", detail: String(result.error ?? result.signal) });
  }
  if (result.status === 0) return Object.freeze({ state: "present", detail: result.stdout });
  if (/Could not find service|service not found/i.test(`${result.stdout}${result.stderr}`)) {
    return Object.freeze({ state: "absent", detail: result.stderr });
  }
  return Object.freeze({ state: "unknown", detail: `${result.status}:${result.stderr}` });
};
const verifyOwnership = () => {
  const actualToken = Buffer.from(sha256(ownershipToken), "hex");
  const expectedToken = Buffer.from(owner.ownership_token_sha256, "hex");
  if (actualToken.length !== expectedToken.length || !timingSafeEqual(actualToken, expectedToken)) {
    throw new Error("OWNERSHIP_TOKEN_MISMATCH");
  }
  if (claim.run_id !== owner.run_id || claim.ownership_token_sha256 !== owner.ownership_token_sha256
    || claim.owner_sha256 !== shaFile(ownerPath)) throw new Error("CLAIM_BINDING_MISMATCH");
  const lockStat = statSync(owner.lock.path);
  if (lockStat.dev !== owner.lock.device || lockStat.ino !== owner.lock.inode
    || lockStat.dev !== claim.lock_device || lockStat.ino !== claim.lock_inode) {
    throw new Error("LOCK_INODE_MISMATCH");
  }
  if (readdirSync(owner.lock.path).sort().join(",") !== "claim.json") {
    throw new Error("LOCK_CONTENT_MISMATCH");
  }
};
const reverifyBindings = () => {
  verifyOwnership();
  if (packet.run_id !== owner.run_id || process.env.T1_GATE_RUN_ID !== owner.run_id
    || process.env.TMPDIR !== owner.tmpdir || process.cwd() !== owner.cwd
    || sha256(packetBytes) !== owner.execution_packet.sha256
    || JSON.stringify(packet.argv) !== JSON.stringify(owner.argv)
    || JSON.stringify(packet.test_runtime) !== JSON.stringify(owner.test_runtime)
    || JSON.stringify(packet.vitest_package_link) !== JSON.stringify(owner.vitest_package_link)
    || JSON.stringify(packet.vitest_entrypoint) !== JSON.stringify(owner.vitest_entrypoint)) {
    throw new Error("CONTROLLER_BINDING_MISMATCH");
  }
  const head = capture("/usr/bin/git", ["-C", owner.cwd, "rev-parse", "HEAD"]).trim();
  const staged = capture("/usr/bin/git", ["-C", owner.cwd, "diff", "--cached", "--name-only"])
    .trim();
  if (head !== owner.head || staged !== "") throw new Error("CONTROLLER_GIT_CUSTODY_MISMATCH");
  if (shaFile(owner.authorization_receipt.path) !== owner.authorization_receipt.sha256
    || shaFile(owner.final_rework9_packet.path) !== owner.final_rework9_packet.sha256) {
    throw new Error("CONTROLLER_PACKET_HASH_MISMATCH");
  }
  for (const binding of Object.values(owner.static_artifacts)) {
    if (!sameTuple(tuple(binding.path), binding)) throw new Error(`ARTIFACT_TUPLE_MISMATCH:${binding.path}`);
  }
  for (const binding of Object.values(owner.rendered_plists)) {
    if (!sameTuple(tuple(binding.path), binding)) throw new Error(`PLIST_TUPLE_MISMATCH:${binding.path}`);
  }
  for (const binding of [owner.test_runtime]) {
    if (!sameTuple(tuple(binding.path), binding)) {
      throw new Error(`TEST_RUNTIME_TUPLE_MISMATCH:${binding.path}`);
    }
  }
  const vitestBinding = measureVitestBinding();
  if (!samePackageLink(vitestBinding.package_link, owner.vitest_package_link)
    || !sameVitestEntrypoint(vitestBinding.entrypoint, owner.vitest_entrypoint)) {
    throw new Error("VITEST_SYMLINK_OR_CANONICAL_TARGET_MISMATCH");
  }
  for (const binding of owner.governed) {
    if (!sameTuple(tuple(resolve(owner.cwd, binding.path), binding.path), binding)) {
      throw new Error(`GOVERNED_TUPLE_MISMATCH:${binding.path}`);
    }
  }
  if (JSON.stringify(owner.launchd_streams)
    !== JSON.stringify(expectedLaunchdStreamPlan(receiptDir, owner.tmpdir))) {
    throw new Error("LAUNCHD_STREAM_PLAN_MISMATCH");
  }
};

const controllerEpoch = readdirSync(receiptDir)
  .filter((name) => /^controller-epoch-\d+\.json$/.test(name)).length + 1;
const postflightSnapshotPaths = (epoch) => Object.freeze({
  processFile: `process-post-epoch-${epoch}.txt`,
  launchdFile: `launchd-post-epoch-${epoch}.txt`,
  processPath: join(receiptDir, `process-post-epoch-${epoch}.txt`),
  launchdPath: join(receiptDir, `launchd-post-epoch-${epoch}.txt`)
});
const canonicalPostflightPath = join(receiptDir, "postflight.json");
const launchdStreamsPath = join(receiptDir, "launchd-streams.json");
const validateCanonicalPostflight = () => {
  const existing = JSON.parse(readFileSync(canonicalPostflightPath, "utf8"));
  const processMatch = /^process-post-epoch-(\d+)\.txt$/.exec(existing.process_snapshot_file ?? "");
  const launchdMatch = /^launchd-post-epoch-(\d+)\.txt$/.exec(existing.launchd_snapshot_file ?? "");
  if (existing.run_id !== owner.run_id || !Number.isInteger(existing.controller_epoch)
    || existing.controller_epoch <= 0 || processMatch === null || launchdMatch === null
    || Number(processMatch[1]) !== existing.controller_epoch
    || Number(launchdMatch[1]) !== existing.controller_epoch
    || existing.worker_bootout_proven !== true
    || !Array.isArray(existing.run_owned_descendants) || existing.run_owned_descendants.length !== 0
    || !Array.isArray(existing.unexplained_heavy_processes)
    || existing.unexplained_heavy_processes.length !== 0
    || existing.process_snapshot_complete !== true || existing.launchd_snapshot_complete !== true
    || existing.launchd_streams_complete !== true
    || typeof existing.launchd_streams_sha256 !== "string"
    || existing.head !== owner.head || existing.staged_path_count !== 0
    || !Array.isArray(existing.governed) || existing.governed.length !== owner.governed.length
    || !existing.governed.every((actual, index) => sameTuple(actual, owner.governed[index]))
    || existing.custody_green !== true) throw new Error("CANONICAL_POSTFLIGHT_INVALID");
  const processPath = join(receiptDir, existing.process_snapshot_file);
  const launchdPath = join(receiptDir, existing.launchd_snapshot_file);
  if (shaFile(processPath) !== existing.process_snapshot_sha256
    || shaFile(launchdPath) !== existing.launchd_snapshot_sha256
    || shaFile(launchdStreamsPath) !== existing.launchd_streams_sha256) {
    throw new Error("CANONICAL_POSTFLIGHT_SNAPSHOT_MISMATCH");
  }
  return existing;
};
immutableJson(join(receiptDir, `controller-epoch-${controllerEpoch}.json`), Object.freeze({
  schema_version: 1, run_id: owner.run_id, controller_epoch: controllerEpoch,
  diagnostic_pid: process.pid, utc: new Date().toISOString(), monotonic_ms: performance.now()
}));
let phase = "CONTROLLER_START";
const heartbeatPath = join(receiptDir, "heartbeat.json");
const heartbeat = () => {
  const stdoutPath = join(receiptDir, "test.stdout.log");
  const stderrPath = join(receiptDir, "test.stderr.log");
  const stats = [stdoutPath, stderrPath].map((path) => statSync(path));
  atomicJson(heartbeatPath, Object.freeze({
    schema_version: 1,
    run_id: owner.run_id,
    utc: new Date().toISOString(),
    monotonic_ms: performance.now(),
    phase,
    controller_epoch: controllerEpoch,
    worker_label: owner.launchd_labels.worker,
    diagnostic_pid: process.pid,
    log_bytes: stats.reduce((sum, one) => sum + one.size, 0),
    last_output_utc: new Date(Math.max(...stats.map((one) => one.mtimeMs))).toISOString()
  }));
};
heartbeat();
const heartbeatTimer = setInterval(() => {
  try { heartbeat(); } catch (error) { event("HEARTBEAT_WRITE_FAILED", { error: String(error) }); }
}, 15_000);

const holdUnknown = (error) => {
  phase = "UNKNOWN_HELD";
  event("UNKNOWN_HELD", { error: error instanceof Error ? `${error.name}:${error.message}` : String(error) });
  atomicJson(join(receiptDir, "custody-hold.json"), Object.freeze({
    schema_version: 1, run_id: owner.run_id, classification: "UNKNOWN_HELD",
    reason: error instanceof Error ? `${error.name}:${error.message}` : String(error),
    lock_retained: true, utc: new Date().toISOString(), monotonic_ms: performance.now()
  }));
  clearInterval(heartbeatTimer);
  heartbeat();
  process.exitCode = 0;
};

try {
  reverifyBindings();
  event("CONTROLLER_EPOCH_STARTED", { controller_epoch: controllerEpoch });
  const sentinelPath = join(receiptDir, "worker-bootstrap-requested.json");
  if (!existsSync(sentinelPath)) {
    phase = "WAITING_FOR_VIEWER";
    const viewerDeadline = performance.now() + 120_000;
    const readyPath = join(receiptDir, "viewer.ready.json");
    while (!existsSync(readyPath) && performance.now() < viewerDeadline) await sleep(250);
    if (!existsSync(readyPath)) throw new Error("VIEWER_READY_TIMEOUT");
    const ready = JSON.parse(readFileSync(readyPath, "utf8"));
    if (ready.run_id !== owner.run_id || ready.challenge !== viewerChallenge
      || !Number.isInteger(ready.viewer_pid) || ready.viewer_pid <= 1
      || typeof ready.viewer_tty !== "string" || !ready.viewer_tty.startsWith("/dev/")
      || Number.isNaN(Date.parse(ready.utc))) throw new Error("VIEWER_READY_INVALID");
    event("VIEWER_VALIDATED", { viewer_pid: ready.viewer_pid, viewer_tty: ready.viewer_tty });

    phase = "WORKER_PREFLIGHT";
    reverifyBindings();
    const processSnapshot = capture("/bin/ps", ["-axo", "pid=,ppid=,lstart=,command=", "-ww"]);
    const launchdSnapshot = capture("/bin/launchctl", ["print", launchdTarget]);
    const processPath = join(receiptDir, "process-worker-pre.txt");
    const launchdPath = join(receiptDir, "launchd-worker-pre.txt");
    writeFileSync(processPath, processSnapshot, { mode: 0o600, flag: "wx" });
    writeFileSync(launchdPath, launchdSnapshot, { mode: 0o600, flag: "wx" });
    const heavy = classifyHeavyProcesses(processSnapshot);
    const allowedBaseline = new Set(owner.allowed_postgresql_baseline);
    const unexplained = heavy.filter((line) => !allowedBaseline.has(line.trim()));
    const workerLabels = [...launchdSnapshot.matchAll(/com\.debateai\.t1gate\.worker\.[0-9a-f-]+/g)]
      .map((match) => match[0]).filter((label) => label !== owner.launchd_labels.worker);
    const preflight = Object.freeze({
      schema_version: 1, run_id: owner.run_id,
      process_snapshot_sha256: shaFile(processPath), launchd_snapshot_sha256: shaFile(launchdPath),
      process_snapshot_complete: processSnapshot.endsWith("\n") && processSnapshot.split("\n").length > 2,
      launchd_snapshot_complete: launchdSnapshot.length > 0,
      allowed_postgresql_baseline: owner.allowed_postgresql_baseline,
      unexplained_heavy_processes: unexplained,
      other_t1_worker_services: workerLabels,
      all_bindings_reverified: true,
      bootstrap_decision: unexplained.length === 0 && workerLabels.length === 0
        ? "BOOTSTRAP_WORKER" : "PREFLIGHT_LIVENESS_UNKNOWN",
      utc: new Date().toISOString(), monotonic_ms: performance.now()
    });
    atomicJson(join(receiptDir, "preflight-worker.json"), preflight);
    if (!preflight.process_snapshot_complete || !preflight.launchd_snapshot_complete
      || preflight.bootstrap_decision !== "BOOTSTRAP_WORKER") {
      throw new Error("PREFLIGHT_LIVENESS_UNKNOWN");
    }

    // O_EXCL is the one-way boundary. No epoch may bootstrap after this exists.
    exclusiveJson(sentinelPath, Object.freeze({
      schema_version: 1, run_id: owner.run_id, controller_epoch: controllerEpoch,
      worker_label: owner.launchd_labels.worker,
      utc: new Date().toISOString(), monotonic_ms: performance.now()
    }));
    phase = "WORKER_BOOTSTRAP";
    const bootstrap = run("/bin/launchctl", ["bootstrap", launchdTarget,
      owner.rendered_plists.worker.path]);
    if (bootstrap.status !== 0 || bootstrap.error !== undefined || bootstrap.signal !== null) {
      throw new Error(`WORKER_BOOTSTRAP_UNKNOWN:${bootstrap.error ?? bootstrap.stderr}`);
    }
    event("WORKER_BOOTSTRAPPED", { worker_label: owner.launchd_labels.worker });
  } else {
    event("RECOVERY_ONLY_EPOCH", { controller_epoch: controllerEpoch });
  }

  phase = "WATCHING_WORKER";
  const workerTerminalPath = join(receiptDir, "worker-terminal.json");
  let absentSamples = 0;
  while (!existsSync(workerTerminalPath)) {
    const state = labelState(owner.launchd_labels.worker);
    if (state.state === "unknown") throw new Error(`WORKER_LABEL_LOOKUP_UNKNOWN:${state.detail}`);
    if (state.state === "absent") absentSamples += 1;
    else absentSamples = 0;
    if (absentSamples >= 5) break;
    await sleep(1_000);
  }
  const workerTerminal = existsSync(workerTerminalPath)
    ? JSON.parse(readFileSync(workerTerminalPath, "utf8")) : null;
  if (workerTerminal !== null && workerTerminal.run_id !== owner.run_id) {
    throw new Error("WORKER_TERMINAL_RUN_ID_MISMATCH");
  }

  phase = "CLEANUP";
  let workerState = labelState(owner.launchd_labels.worker);
  if (workerState.state === "unknown") throw new Error(`WORKER_LABEL_LOOKUP_UNKNOWN:${workerState.detail}`);
  if (workerState.state === "present") {
    const bootout = run("/bin/launchctl", ["bootout", `${launchdTarget}/${owner.launchd_labels.worker}`]);
    if (bootout.status !== 0 || bootout.error !== undefined || bootout.signal !== null) {
      throw new Error(`WORKER_BOOTOUT_UNKNOWN:${bootout.error ?? bootout.stderr}`);
    }
  }
  workerState = labelState(owner.launchd_labels.worker);
  if (workerState.state !== "absent") throw new Error("WORKER_BOOTOUT_NOT_PROVEN");

  // The worker label is absent, so its launchd descriptors are closed. Flush,
  // but do not raw-close, this controller's redirected Node stdio handles.
  // Raw close followed by a synchronous custody spawn can abort in libuv. No
  // path below writes fd 1 or fd 2, and the still-open source tuples are
  // reverified before terminal and release authority.
  phase = "SEALING_LAUNCHD_STREAMS";
  for (const fd of [1, 2]) fsyncSync(fd);
  const sealedLaunchdStreams = Object.freeze({
    schema_version: 1, run_id: owner.run_id, complete: true,
    streams: sealLaunchdStreams({ plan: owner.launchd_streams, receiptDir,
      runTmpdir: owner.tmpdir })
  });
  if (existsSync(launchdStreamsPath)) {
    const existingLaunchdStreams = JSON.parse(readFileSync(launchdStreamsPath, "utf8"));
    if (JSON.stringify(existingLaunchdStreams) !== JSON.stringify(sealedLaunchdStreams)) {
      throw new Error("EXISTING_LAUNCHD_STREAM_RECEIPT_MISMATCH");
    }
  } else {
    immutableJson(launchdStreamsPath, sealedLaunchdStreams);
  }
  const launchdStreamsSha256 = shaFile(launchdStreamsPath);
  verifySealedLaunchdStreams({ receipt: sealedLaunchdStreams, plan: owner.launchd_streams,
    receiptDir, runTmpdir: owner.tmpdir });
  event("LAUNCHD_STREAMS_SEALED", { launchd_streams_sha256: launchdStreamsSha256 });

  // Recompute custody regardless of raw test status.
  reverifyBindings();
  const processPost = capture("/bin/ps", ["-axo", "pid=,ppid=,lstart=,command=", "-ww"]);
  const launchdPost = capture("/bin/launchctl", ["print", launchdTarget]);
  const { processFile: processPostFile, launchdFile: launchdPostFile,
    processPath: processPostPath, launchdPath: launchdPostPath }
    = postflightSnapshotPaths(controllerEpoch);
  writeFileSync(processPostPath, processPost, { mode: 0o600, flag: "wx" });
  writeFileSync(launchdPostPath, launchdPost, { mode: 0o600, flag: "wx" });
  const processClassification = classifyPostflightProcesses({
    snapshot: processPost,
    controller: { pid: process.pid, argv: [process.execPath,
      owner.static_artifacts.controller.path, receiptDir, executionPacketPath, secretPath] },
    ownedIdentityArgv: [
      [process.execPath, owner.static_artifacts.launcher.path, executionPacketPath],
      [process.execPath, owner.static_artifacts.worker.path, receiptDir, executionPacketPath,
        secretPath],
      owner.argv
    ],
    viewerIdentityArgv: [[process.execPath, owner.static_artifacts.viewer.path, receiptDir,
      join(owner.tmpdir, "viewer-challenge")]],
    receiptDir
  });
  const runOwnedDescendants = processClassification.run_owned_descendant_lines;
  const exemptProcessLines = new Set(processClassification.exempt_lines);
  const allowedRunLine = (line) => exemptProcessLines.has(line);
  const heavyPost = classifyHeavyProcesses(processPost);
  const allowedBaseline = new Set(owner.allowed_postgresql_baseline);
  const unexplainedHeavyPost = heavyPost.filter((line) => !allowedBaseline.has(line.trim())
    && (POSTGRES_PROCESS_PATTERN.test(line) || !allowedRunLine(line)));
  const finalGoverned = owner.governed.map((binding) =>
    tuple(resolve(owner.cwd, binding.path), binding.path));
  const postflightGreen = runOwnedDescendants.length === 0 && unexplainedHeavyPost.length === 0
    && finalGoverned.every((actual, index) => sameTuple(actual, owner.governed[index]));
  const currentPostflight = Object.freeze({
    schema_version: 1, run_id: owner.run_id,
    controller_epoch: controllerEpoch,
    worker_bootout_proven: workerState.state === "absent",
    run_owned_descendants: runOwnedDescendants,
    unexplained_heavy_processes: unexplainedHeavyPost,
    process_snapshot_file: processPostFile,
    launchd_snapshot_file: launchdPostFile,
    process_snapshot_sha256: shaFile(processPostPath),
    launchd_snapshot_sha256: shaFile(launchdPostPath),
    process_snapshot_complete: processPost.endsWith("\n") && processPost.split("\n").length > 2,
    launchd_snapshot_complete: launchdPost.length > 0,
    launchd_streams_complete: true,
    launchd_streams_sha256: launchdStreamsSha256,
    head: capture("/usr/bin/git", ["-C", owner.cwd, "rev-parse", "HEAD"]).trim(),
    staged_path_count: capture("/usr/bin/git", ["-C", owner.cwd, "diff", "--cached", "--name-only"])
      .split("\n").filter(Boolean).length,
    governed: finalGoverned,
    custody_green: postflightGreen,
    utc: new Date().toISOString(), monotonic_ms: performance.now()
  });
  const currentPostflightPath = join(receiptDir, `postflight-epoch-${controllerEpoch}.json`);
  immutableJson(currentPostflightPath, currentPostflight);
  const currentPostflightSha256 = shaFile(currentPostflightPath);
  if (!currentPostflight.process_snapshot_complete || !currentPostflight.launchd_snapshot_complete
    || !currentPostflight.custody_green) throw new Error("CLEANUP_UNKNOWN");
  let canonicalPostflight;
  if (existsSync(canonicalPostflightPath)) {
    canonicalPostflight = validateCanonicalPostflight();
  } else {
    immutableJson(canonicalPostflightPath, currentPostflight);
    canonicalPostflight = validateCanonicalPostflight();
  }
  const canonicalPostflightSha256 = shaFile(canonicalPostflightPath);

  let classification;
  if (workerTerminal === null) {
    classification = "INTERRUPTED";
  } else if (workerTerminal.raw_status === 0
    && workerTerminal.parsed_test_files_passed === owner.expected_test_files
    && workerTerminal.parsed_test_files_total === owner.expected_test_files
    && workerTerminal.parsed_tests_passed === owner.expected_tests
    && workerTerminal.parsed_tests_skipped === 0
    && workerTerminal.parsed_tests_total === owner.expected_tests) {
    classification = "TERMINAL_PASS";
  } else if (Number.isInteger(workerTerminal.raw_status) && workerTerminal.raw_status !== 0) {
    classification = "TERMINAL_FAIL";
  } else {
    throw new Error("WORKER_TERMINAL_INCOMPLETE");
  }
  phase = classification;
  const terminalPath = join(receiptDir, "terminal.json");
  verifySealedLaunchdStreams({ receipt: sealedLaunchdStreams, plan: owner.launchd_streams,
    receiptDir, runTmpdir: owner.tmpdir });
  const terminalReceipt = Object.freeze({
    schema_version: 1, run_id: owner.run_id, classification,
    worker_terminal_sha256: workerTerminal === null ? null : shaFile(workerTerminalPath),
    postflight_sha256: canonicalPostflightSha256,
    launchd_streams_sha256: launchdStreamsSha256,
    expected_test_files: owner.expected_test_files, expected_tests: owner.expected_tests,
    raw_status: workerTerminal?.raw_status ?? null,
    utc: new Date().toISOString(), monotonic_ms: performance.now()
  });
  if (existsSync(terminalPath)) {
    const existingTerminal = JSON.parse(readFileSync(terminalPath, "utf8"));
    if (existingTerminal.run_id !== terminalReceipt.run_id
      || existingTerminal.classification !== terminalReceipt.classification
      || existingTerminal.worker_terminal_sha256 !== terminalReceipt.worker_terminal_sha256
      || existingTerminal.postflight_sha256 !== terminalReceipt.postflight_sha256
      || existingTerminal.launchd_streams_sha256 !== terminalReceipt.launchd_streams_sha256
      || existingTerminal.expected_test_files !== terminalReceipt.expected_test_files
      || existingTerminal.expected_tests !== terminalReceipt.expected_tests
      || existingTerminal.raw_status !== terminalReceipt.raw_status) {
      throw new Error("EXISTING_TERMINAL_BINDING_MISMATCH");
    }
  } else {
    immutableJson(terminalPath, terminalReceipt);
  }

  // Exact non-recursive release: verify token/inode, unlink only claim.json,
  // rmdir the now-empty global lock, then persist the separate release receipt.
  if (!currentPostflight.custody_green) throw new Error("RECOVERY_POSTFLIGHT_NOT_GREEN");
  verifySealedLaunchdStreams({ receipt: sealedLaunchdStreams, plan: owner.launchd_streams,
    receiptDir, runTmpdir: owner.tmpdir });
  validateCanonicalPostflight();
  if (canonicalPostflight.run_id !== owner.run_id
    || shaFile(canonicalPostflightPath) !== canonicalPostflightSha256
    || shaFile(currentPostflightPath) !== currentPostflightSha256
    || shaFile(launchdStreamsPath) !== launchdStreamsSha256) {
    throw new Error("POSTFLIGHT_RELEASE_BINDING_MISMATCH");
  }
  verifyOwnership();
  const releaseReceipt = Object.freeze({
    schema_version: 1, run_id: owner.run_id, classification,
    ownership_token_sha256: owner.ownership_token_sha256,
    released_lock_device: owner.lock.device, released_lock_inode: owner.lock.inode,
    canonical_postflight_sha256: canonicalPostflightSha256,
    release_epoch_postflight_sha256: currentPostflightSha256,
    launchd_streams_sha256: launchdStreamsSha256,
    final_launchd_streams_verified: true,
    release_method: "unlink-known-claim-then-rmdir",
    utc: new Date().toISOString(), monotonic_ms: performance.now()
  });
  unlinkSync(join(owner.lock.path, "claim.json"));
  rmdirSync(owner.lock.path);
  if (existsSync(secretPath)) unlinkSync(secretPath);
  immutableJson(join(receiptDir, "release.json"), releaseReceipt);
  event("LOCK_RELEASED", { classification });
  clearInterval(heartbeatTimer);
  heartbeat();
  process.exitCode = 0;
} catch (error) {
  holdUnknown(error);
}
