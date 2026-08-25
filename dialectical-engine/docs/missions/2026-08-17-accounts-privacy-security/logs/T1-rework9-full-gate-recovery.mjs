#!/Users/vladmihaimiron/.hermes/node/bin/node
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import {
  archiveLockPreservingInodes, sha256, shaFile, snapshotLock, writeImmutableJson
} from "./T1-rework9-rework3-recovery-core.mjs";
import {
  parseProcessSnapshot, parseVitestCounts, stripAnsi
} from "./T1-rework9-supervisor-parsers.mjs";

const RUN_ID = "ae9f57fb-bff0-49da-b031-bfd4ff2fbe14";
const CWD = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine";
const LOG_ROOT = `${CWD}/docs/missions/2026-08-17-accounts-privacy-security/logs`;
const RECEIPT_DIR = `${LOG_ROOT}/T1-rework9-gate-${RUN_ID}`;
const LOCK_PATH = `${LOG_ROOT}/.T1-full-registration.exclusive.lock`;
const ARCHIVE_PATH = `${RECEIPT_DIR}/full-gate-custody-archived-lock`;
const INTENT_PATH = `${RECEIPT_DIR}/full-gate-custody-recovery-intent.json`;
const SUPPLEMENT_PATH = `${RECEIPT_DIR}/vitest-counts-supplement.json`;
const MARKER_PATH = `${RECEIPT_DIR}/full-gate-custody-recovery.json`;
const PACKET_PATH = `${LOG_ROOT}/T1-rework9-execution-${RUN_ID}.json`;
const OWNER_PATH = `${RECEIPT_DIR}/owner.json`;
const AUTHORITY_PATH = `${LOG_ROOT}/T1-rework9-full-gate-recovery-authority.json`;
const EVIDENCE_PATH = `${LOG_ROOT}/T1-rework9-full-gate-failure-evidence.json`;
const TOOL_PATH = `${LOG_ROOT}/T1-rework9-full-gate-recovery.mjs`;
const CORE_PATH = `${LOG_ROOT}/T1-rework9-rework3-recovery-core.mjs`;
const PARSER_PATH = `${LOG_ROOT}/T1-rework9-supervisor-parsers.mjs`;
const REVIEW_PATH = `${LOG_ROOT}/T1-rework9-grok-full-gate-review-visible.log`;
const REVIEW_STATUS_PATH = `${LOG_ROOT}/T1-rework9-grok-full-gate-review-visible.status`;
const PRIVATE_DIR = "/var/folders/h7/4hdbz7s15hjbyj6scmk_nx3r0000gn/T/debateai-t1gate-ae9f57fb-bff0-49da-b031-bfd4ff2fbe14";
const EXPECTED_HEAD = "7918f4f8bff33909792afc01dc38d402972b4ccd";
const PACKET_SHA256 = "0e34e9d7cb01a3b02f987bd0476e3608504fc8aa7a1d2d0021be92692c07f14c";
const OWNER_SHA256 = "679d3eba35373659e34c847b7ea652d995a0048eefbabe9c4c7e2387a575c6f0";
const CLAIM_SHA256 = "d51149eb7036f6c4ccf7557982e13d7860e3efffcbf6439d8aa129b80b939c86";
const TOKEN_SHA256 = "d88e47451687c860ce804009fa0cf4be8caaa8f2a01d841573e236b57da511cd";
const LOCK_DEVICE = 16777233;
const LOCK_INODE = 47087786;
const CLAIM_INODE = 47087814;
const RECEIPT_INODE = 47087787;
const PRIVATE_INODE = 47087788;
const RECEIPT_TREE_SHA256 = "e88564b645e626c6844b11530665f0c7d425b522b466d7eeec2b6738388545b9";
const PRIVATE_TREE_SHA256 = "a220d9932e1e9b4a073722a42aa64d70ca6d640cb4096fac956d7797621ea07f";
const STDOUT_SHA256 = "0274f03d85a684ab7486b1107e0f6ceb4316f96bd1d88f0e8d4225c743c8894f";
const STDERR_SHA256 = "b67a2917d675855cb39d1fde5edaceb89c18393b30fba540224a8d811704d39c";
const ANSI_STRIPPED_SHA256 = "58568909455abb34607b3ae82051457412db78a88b3f64493c76024c4ca3f5b7";
const WORKER_TERMINAL_SHA256 = "138bb1472fc05c75a2779febb49e104a4619d2d1ee10f82b68291c4ea3e99738";
const STREAMS_SHA256 = "f6c881172df9a3a6b1e665dc40acf139edc5ff8bd64598793ddd0f76a0bdbfc5";
const POSTFLIGHT_SHA256 = "d4e5c7d46f947ebe8caf8cf83c4025637f1f12fde29c6e74d6863a7f4c62cd8c";
const CONTROLLER_LABEL = `com.debateai.t1gate.controller.${RUN_ID}`;
const WORKER_LABEL = `com.debateai.t1gate.worker.${RUN_ID}`;
const REVIEW_MARKER = "GROK REWORK9 FULL GATE ACCEPTED WITH CUSTODY RECOVERY REQUIRED";
const FALSE_POSITIVE_LINES = Object.freeze([
  "77991     1 Sat Aug 22 23:55:28 2026     /Users/vladmihaimiron/.hermes/node/bin/node /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/2026-08-17-accounts-privacy-security/logs/T1-rework9-gate-controller.mjs /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/2026-08-17-accounts-privacy-security/logs/T1-rework9-gate-ae9f57fb-bff0-49da-b031-bfd4ff2fbe14 /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/2026-08-17-accounts-privacy-security/logs/T1-rework9-execution-ae9f57fb-bff0-49da-b031-bfd4ff2fbe14.json /var/folders/h7/4hdbz7s15hjbyj6scmk_nx3r0000gn/T/debateai-t1gate-ae9f57fb-bff0-49da-b031-bfd4ff2fbe14/controller-custody.secret",
  "82915 30314 Sun Aug 23 00:25:35 2026     /bin/zsh -lc sleep 50; sed -n '1,22p' docs/missions/2026-08-17-accounts-privacy-security/logs/T1-rework9-gate-ae9f57fb-bff0-49da-b031-bfd4ff2fbe14/heartbeat.json; tail -n 30 docs/missions/2026-08-17-accounts-privacy-security/logs/T1-rework9-gate-ae9f57fb-bff0-49da-b031-bfd4ff2fbe14/test.stdout.log"
]);
const PRESENT_NAMES = Object.freeze([
  "controller-epoch-1.json", "controller.plist", "controller.stderr.log",
  "controller.stdout.log", "custody-hold.json", "events.jsonl", "heartbeat.json",
  "launchd-post-epoch-1.txt", "launchd-pre.txt", "launchd-streams.json",
  "launchd-worker-pre.txt", "owner.json", "postflight-epoch-1.json",
  "preflight-worker.json", "preflight.json", "process-post-epoch-1.txt",
  "process-pre.txt", "process-worker-pre.txt", "test.stderr.log", "test.stdout.log",
  "viewer.ready.json", "worker-bootstrap-requested.json", "worker-terminal.json",
  "worker.plist", "worker.stderr.log", "worker.stdout.log"
]);
const HEAVY_PROCESS_PATTERN = /vitest|claude|mutation|T1.*full-registration|(?:^|[\/\s])(?:postgres|pg_ctl)(?=[:\s]|$)/i;

const fail = (code) => { throw new Error(code); };
const same = (actual, expected, name) => {
  if (actual !== expected) fail(`CUSTODY_MISMATCH:${name}`);
};
const sameJson = (actual, expected, name) => same(JSON.stringify(actual), JSON.stringify(expected), name);
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const statRecord = (stats) => Object.freeze({
  device: stats.dev, inode: stats.ino, mode: stats.mode & 0o777,
  uid: stats.uid, gid: stats.gid, size: stats.size, mtime_ms: stats.mtimeMs
});
const fileTuple = (path) => {
  const stats = lstatSync(path);
  if (!stats.isFile() || stats.isSymbolicLink()) fail(`NOT_REGULAR_FILE:${path}`);
  return Object.freeze({ path, sha256: shaFile(path), ...statRecord(stats) });
};
const directoryTuple = (path) => {
  const stats = lstatSync(path);
  if (!stats.isDirectory() || stats.isSymbolicLink()) fail(`NOT_DIRECTORY:${path}`);
  return Object.freeze({ path, ...statRecord(stats) });
};
const verifyFileTuple = (actual, expected, name) => {
  for (const key of ["path", "sha256", "size", "mtime_ms"]) {
    same(actual[key], expected[key], `${name}.${key}`);
  }
};
const walkTree = (root, at = root, entries = []) => {
  for (const name of readdirSync(at).sort()) {
    const path = join(at, name);
    const stats = lstatSync(path);
    if (stats.isSymbolicLink() || (!stats.isFile() && !stats.isDirectory())) {
      fail(`TREE_ENTRY_TYPE_INVALID:${path}`);
    }
    const entry = {
      relative_path: relative(root, path), type: stats.isDirectory() ? "directory" : "file",
      ...statRecord(stats)
    };
    if (stats.isFile()) entry.sha256 = shaFile(path);
    entries.push(Object.freeze(entry));
    if (stats.isDirectory()) walkTree(root, path, entries);
  }
  return entries;
};
const snapshotTree = (root) => {
  const directory = directoryTuple(root);
  const entries = Object.freeze(walkTree(root));
  return Object.freeze({ directory, entries, tree_sha256: sha256(JSON.stringify(entries)) });
};
const runKnown = (command, args, name) => {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.error !== undefined || result.signal !== null || typeof result.status !== "number"
    || typeof result.stdout !== "string" || typeof result.stderr !== "string") {
    fail(`PREFLIGHT_LIVENESS_UNKNOWN:${name}:${result.error?.code ?? result.signal ?? "PARTIAL"}`);
  }
  if (/operation not permitted|permission denied|not authorized|EPERM/i
    .test(`${result.stdout}${result.stderr}`)) fail(`PREFLIGHT_LIVENESS_UNKNOWN:${name}:DENIED`);
  return result;
};
const capture = (command, args, name) => {
  const result = runKnown(command, args, name);
  if (result.status !== 0 || result.stderr !== "" || result.stdout.length === 0) {
    fail(`PREFLIGHT_LIVENESS_UNKNOWN:${name}:status=${result.status}`);
  }
  return result.stdout;
};
const verifyReview = (authority) => {
  verifyFileTuple(fileTuple(REVIEW_PATH), authority.grok_full_gate_review.visible_log,
    "review.visible_log");
  verifyFileTuple(fileTuple(REVIEW_STATUS_PATH), authority.grok_full_gate_review.visible_status,
    "review.visible_status");
  same(readFileSync(REVIEW_STATUS_PATH, "utf8"), "0\n", "review.raw_status");
  if (!readFileSync(REVIEW_PATH, "utf8").includes(REVIEW_MARKER)) fail("REVIEW_MARKER_MISSING");
};
const inspectGitAndGoverned = (owner, packet) => {
  const head = capture("/usr/bin/git", ["-C", CWD, "rev-parse", "HEAD"], "git-head").trim();
  const index = runKnown("/usr/bin/git", ["-C", CWD, "diff", "--cached", "--name-only"],
    "git-index");
  if (index.status !== 0 || index.stderr !== "") fail("PREFLIGHT_LIVENESS_UNKNOWN:git-index");
  const staged = index.stdout.split("\n").filter(Boolean);
  same(head, EXPECTED_HEAD, "git.head");
  same(staged.length, 0, "git.staged_path_count");
  same(owner.head, EXPECTED_HEAD, "owner.head");
  same(packet.head, EXPECTED_HEAD, "packet.head");
  same(owner.governed.length, 12, "owner.governed.length");
  sameJson(owner.governed, packet.governed, "packet_owner.governed");
  const governed = owner.governed.map((expected) => {
    const actual = fileTuple(resolve(CWD, expected.path));
    verifyFileTuple({ ...actual, path: expected.path }, expected, `governed:${expected.path}`);
    return Object.freeze({ ...actual, path: expected.path });
  });
  return Object.freeze({ head, staged_paths: staged, governed });
};
const inspectProcesses = (owner) => {
  const snapshot = capture("/bin/ps", ["-axo", "pid=,ppid=,lstart=,command=", "-ww"],
    "process-scan");
  const records = parseProcessSnapshot(snapshot);
  if (records.length < 3) fail("PREFLIGHT_LIVENESS_UNKNOWN:process-scan:PARTIAL");
  const heavy = records.filter((record) => HEAVY_PROCESS_PATTERN.test(record.line));
  if (heavy.length !== 0) fail(`HEAVY_PROCESS_PRESENT:${heavy.map((one) => one.line).join("|")}`);
  const exactForbiddenCommands = new Set([
    [owner.test_runtime.path, owner.static_artifacts.launcher.path, owner.execution_packet.path],
    [owner.test_runtime.path, owner.static_artifacts.controller.path, RECEIPT_DIR,
      owner.execution_packet.path, join(owner.tmpdir, "controller-custody.secret")],
    [owner.test_runtime.path, owner.static_artifacts.worker.path, RECEIPT_DIR,
      owner.execution_packet.path, join(owner.tmpdir, "controller-custody.secret")],
    owner.argv
  ].map((argv) => argv.join(" ")));
  const forbidden = records.filter((record) => exactForbiddenCommands.has(record.command));
  if (forbidden.length !== 0) fail(`EXACT_RUN_PROCESS_PRESENT:${forbidden.map((one) => one.line).join("|")}`);
  const viewerCommand = [owner.test_runtime.path, owner.static_artifacts.viewer.path, RECEIPT_DIR,
    join(owner.tmpdir, "viewer-challenge")].join(" ");
  const displayOnly = records.filter((record) => record.command === viewerCommand
    || (record.command.includes("/usr/bin/tail") && record.command.includes(RECEIPT_DIR)));
  return Object.freeze({ sha256: sha256(snapshot), bytes: Buffer.byteLength(snapshot),
    line_count: records.length, heavy_lines: [], exact_run_processes: [],
    display_only_lines: displayOnly.map((one) => one.line) });
};
const workerLabelAbsent = () => {
  const result = runKnown("/bin/launchctl", ["print", `gui/${process.getuid()}/${WORKER_LABEL}`],
    "launchctl-worker");
  const output = `${result.stdout}${result.stderr}`;
  if (result.status === 0) fail("WORKER_LABEL_PRESENT");
  if (!/could not find service|service not found|could not find specified service/i.test(output)) {
    fail(`PREFLIGHT_LIVENESS_UNKNOWN:launchctl-worker:status=${result.status}`);
  }
  return Object.freeze({ label: WORKER_LABEL, state: "absent", status: result.status,
    stdout: result.stdout, stderr: result.stderr });
};
const stoppedControllerState = (stdout) => {
  const state = /^[\t ]*state = (not running|exited)[\t ]*$/m.exec(stdout)?.[1];
  if (state === undefined || !/^[\t ]*last exit code = 0[\t ]*$/m.test(stdout)
    || /^[\t ]*pid = \d+[\t ]*$/m.test(stdout)) {
    fail("CONTROLLER_LABEL_NOT_EXACT_STOPPED_EXIT_ZERO");
  }
  return state;
};
const controllerLabelStopped = () => {
  const result = runKnown("/bin/launchctl", ["print", `gui/${process.getuid()}/${CONTROLLER_LABEL}`],
    "launchctl-controller");
  if (result.status !== 0) fail("CONTROLLER_LABEL_NOT_EXACT_STOPPED_EXIT_ZERO");
  const state = stoppedControllerState(result.stdout);
  return Object.freeze({ label: CONTROLLER_LABEL, state, last_exit_code: 0,
    snapshot_sha256: sha256(result.stdout), snapshot_bytes: Buffer.byteLength(result.stdout) });
};
const inspectLaunchd = () => Object.freeze({
  worker: workerLabelAbsent(), controller: controllerLabelStopped()
});
const verifyStream = (stream, ownerBinding, name) => {
  same(stream.launchd.path, ownerBinding.launchd_path, `${name}.launchd.path`);
  same(stream.receipt.path, ownerBinding.receipt_path, `${name}.receipt.path`);
  const liveLaunchd = fileTuple(stream.launchd.path);
  const durable = fileTuple(stream.receipt.path);
  for (const key of ["sha256", "size", "mtime_ms", "device", "inode", "mode", "uid", "gid"]) {
    same(liveLaunchd[key], stream.launchd[key], `${name}.launchd.${key}`);
    same(durable[key], stream.receipt[key], `${name}.receipt.${key}`);
  }
  same(liveLaunchd.sha256, durable.sha256, `${name}.sha256_equal`);
  same(liveLaunchd.size, durable.size, `${name}.size_equal`);
};
const inspectIncident = (authority, additions = []) => {
  const receiptTree = snapshotTree(RECEIPT_DIR);
  same(receiptTree.directory.device, LOCK_DEVICE, "receipt.device");
  same(receiptTree.directory.inode, RECEIPT_INODE, "receipt.inode");
  same(receiptTree.directory.mode, 0o700, "receipt.mode");
  const added = new Set(additions);
  const originalEntries = receiptTree.entries.filter((entry) =>
    !added.has(entry.relative_path) && ![...added].some((name) => entry.relative_path.startsWith(`${name}/`)));
  sameJson(originalEntries.map((entry) => entry.relative_path), PRESENT_NAMES,
    "receipt.original_entry_names");
  same(sha256(JSON.stringify(originalEntries)), RECEIPT_TREE_SHA256, "receipt.tree_sha256");

  const privateTree = snapshotTree(PRIVATE_DIR);
  same(privateTree.directory.device, LOCK_DEVICE, "private.device");
  same(privateTree.directory.inode, PRIVATE_INODE, "private.inode");
  same(privateTree.directory.mode, 0o700, "private.mode");
  same(privateTree.tree_sha256, PRIVATE_TREE_SHA256, "private.tree_sha256");
  same(realpathSync(PRIVATE_DIR), join(realpathSync(dirname(PRIVATE_DIR)), basename(PRIVATE_DIR)),
    "private.realpath");

  const packet = readJson(PACKET_PATH);
  const owner = readJson(OWNER_PATH);
  same(shaFile(PACKET_PATH), PACKET_SHA256, "packet.sha256");
  same(packet.run_id, RUN_ID, "packet.run_id");
  same(shaFile(OWNER_PATH), OWNER_SHA256, "owner.sha256");
  same(owner.run_id, RUN_ID, "owner.run_id");
  same(owner.execution_packet.path, PACKET_PATH, "owner.packet.path");
  same(owner.execution_packet.sha256, PACKET_SHA256, "owner.packet.sha256");
  same(owner.ownership_token_sha256, TOKEN_SHA256, "owner.token");
  same(owner.lock.path, LOCK_PATH, "owner.lock.path");
  same(owner.lock.device, LOCK_DEVICE, "owner.lock.device");
  same(owner.lock.inode, LOCK_INODE, "owner.lock.inode");
  sameJson(owner.allowed_postgresql_baseline, [], "owner.postgresql_baseline");

  const lock = snapshotLock(LOCK_PATH);
  same(lock.directory.device, LOCK_DEVICE, "lock.device");
  same(lock.directory.inode, LOCK_INODE, "lock.inode");
  same(lock.claim.inode, CLAIM_INODE, "claim.inode");
  same(lock.claim.sha256, CLAIM_SHA256, "claim.sha256");
  same(lock.claim_value.run_id, RUN_ID, "claim.run_id");
  same(lock.claim_value.ownership_token_sha256, TOKEN_SHA256, "claim.token");
  same(lock.claim_value.owner_sha256, OWNER_SHA256, "claim.owner");
  same(lock.claim_value.lock_device, LOCK_DEVICE, "claim.device");
  same(lock.claim_value.lock_inode, LOCK_INODE, "claim.lock_inode");
  const secretFirstLine = readFileSync(join(PRIVATE_DIR, "controller-custody.secret"), "utf8")
    .trim().split("\n")[0];
  same(sha256(secretFirstLine), TOKEN_SHA256, "private.secret_token");

  const workerTerminalPath = join(RECEIPT_DIR, "worker-terminal.json");
  const workerTerminal = readJson(workerTerminalPath);
  same(shaFile(workerTerminalPath), WORKER_TERMINAL_SHA256, "worker_terminal.sha256");
  same(workerTerminal.run_id, RUN_ID, "worker_terminal.run_id");
  same(workerTerminal.raw_status, 0, "worker_terminal.raw_status");
  same(workerTerminal.child_signal, null, "worker_terminal.child_signal");
  same(workerTerminal.supervisor_signal, null, "worker_terminal.supervisor_signal");
  same(workerTerminal.spawn_error, null, "worker_terminal.spawn_error");
  for (const name of ["parsed_test_files_passed", "parsed_test_files_total",
    "parsed_tests_passed", "parsed_tests_skipped", "parsed_tests_total"]) {
    same(workerTerminal[name], null, `worker_terminal.${name}`);
  }
  same(workerTerminal.stdout_bytes, 84850, "worker_terminal.stdout_bytes");
  same(workerTerminal.stderr_bytes, 2308, "worker_terminal.stderr_bytes");
  sameJson(workerTerminal.argv, owner.argv, "worker_terminal.argv");

  const testStdout = fileTuple(join(RECEIPT_DIR, "test.stdout.log"));
  const workerStdout = fileTuple(join(RECEIPT_DIR, "worker.stdout.log"));
  const testStderr = fileTuple(join(RECEIPT_DIR, "test.stderr.log"));
  const workerStderr = fileTuple(join(RECEIPT_DIR, "worker.stderr.log"));
  same(testStdout.sha256, STDOUT_SHA256, "test_stdout.sha256");
  same(workerStdout.sha256, STDOUT_SHA256, "worker_stdout.sha256");
  same(testStderr.sha256, STDERR_SHA256, "test_stderr.sha256");
  same(workerStderr.sha256, STDERR_SHA256, "worker_stderr.sha256");
  same(testStdout.size, 84850, "test_stdout.size");
  same(workerStdout.size, 84850, "worker_stdout.size");
  same(testStderr.size, 2308, "test_stderr.size");
  same(workerStderr.size, 2308, "worker_stderr.size");
  sameJson(readFileSync(testStdout.path), readFileSync(workerStdout.path), "stdout.byte_identity");
  sameJson(readFileSync(testStderr.path), readFileSync(workerStderr.path), "stderr.byte_identity");
  const rawOutput = readFileSync(testStdout.path, "utf8");
  const stripped = stripAnsi(rawOutput);
  const counts = parseVitestCounts(rawOutput);
  same(sha256(stripped), ANSI_STRIPPED_SHA256, "ansi_stripped.sha256");
  same(Buffer.byteLength(stripped), 76636, "ansi_stripped.bytes");
  sameJson(counts, { test_files_passed: 1, test_files_total: 1, tests_passed: 56,
    tests_skipped: 0, tests_total: 56 }, "ansi_stripped.counts");
  const checkmarkLines = stripped.split("\n").filter((line) => line.includes("✓")).length;
  const runBannerCount = (stripped.match(/\bRUN\s+v/g) ?? []).length;
  same(checkmarkLines, 56, "ansi_stripped.checkmark_lines");
  same(runBannerCount, 1, "ansi_stripped.run_banner_count");

  const streamsPath = join(RECEIPT_DIR, "launchd-streams.json");
  const streams = readJson(streamsPath);
  same(shaFile(streamsPath), STREAMS_SHA256, "streams.sha256");
  same(streams.run_id, RUN_ID, "streams.run_id");
  same(streams.complete, true, "streams.complete");
  for (const processName of ["controller", "worker"]) {
    for (const streamName of ["stdout", "stderr"]) {
      verifyStream(streams.streams[processName][streamName],
        owner.launchd_streams[processName][streamName], `streams.${processName}.${streamName}`);
    }
  }

  const postflightPath = join(RECEIPT_DIR, "postflight-epoch-1.json");
  const postflight = readJson(postflightPath);
  same(shaFile(postflightPath), POSTFLIGHT_SHA256, "postflight.sha256");
  same(postflight.run_id, RUN_ID, "postflight.run_id");
  same(postflight.controller_epoch, 1, "postflight.epoch");
  same(postflight.worker_bootout_proven, true, "postflight.worker_bootout");
  sameJson(postflight.run_owned_descendants, FALSE_POSITIVE_LINES, "postflight.false_positives");
  sameJson(postflight.unexplained_heavy_processes, [], "postflight.heavy");
  same(postflight.custody_green, false, "postflight.custody_green");
  same(postflight.process_snapshot_sha256,
    shaFile(join(RECEIPT_DIR, postflight.process_snapshot_file)), "postflight.process_hash");
  same(postflight.launchd_snapshot_sha256,
    shaFile(join(RECEIPT_DIR, postflight.launchd_snapshot_file)), "postflight.launchd_hash");
  const historicalProcess = readFileSync(join(RECEIPT_DIR, postflight.process_snapshot_file), "utf8");
  for (const line of FALSE_POSITIVE_LINES) {
    if (!historicalProcess.split("\n").includes(line)) fail("FALSE_POSITIVE_LINE_NOT_IN_SNAPSHOT");
  }
  const custodyHold = readJson(join(RECEIPT_DIR, "custody-hold.json"));
  same(custodyHold.run_id, RUN_ID, "custody_hold.run_id");
  same(custodyHold.classification, "UNKNOWN_HELD", "custody_hold.classification");
  same(custodyHold.reason, "Error:CLEANUP_UNKNOWN", "custody_hold.reason");
  same(custodyHold.lock_retained, true, "custody_hold.lock_retained");
  for (const forbidden of ["terminal.json", "release.json", "test.status"]) {
    if (existsSync(join(RECEIPT_DIR, forbidden))) fail(`FORBIDDEN_TERMINAL_ARTIFACT:${forbidden}`);
  }
  return Object.freeze({ receipt_tree: receiptTree, private_tree: privateTree, packet, owner, lock,
    worker_terminal: fileTuple(workerTerminalPath), test_stdout: testStdout,
    worker_stdout: workerStdout, test_stderr: testStderr, worker_stderr: workerStderr,
    launchd_streams: fileTuple(streamsPath), postflight: fileTuple(postflightPath),
    ansi_stripped: Object.freeze({ sha256: ANSI_STRIPPED_SHA256, bytes: 76636,
      counts, checkmark_lines: checkmarkLines, run_banner_count: runBannerCount }) });
};

const [authorityArgument, ...extraArguments] = process.argv.slice(2);
if (authorityArgument === undefined || extraArguments.length !== 0) {
  fail("RECOVERY_REQUIRES_EXACTLY_ONE_AUTHORITY_PATH");
}
same(realpathSync(authorityArgument), AUTHORITY_PATH, "authority.path");
same(realpathSync(process.argv[1]), TOOL_PATH, "tool.path");
for (const path of [INTENT_PATH, SUPPLEMENT_PATH, MARKER_PATH, ARCHIVE_PATH]) {
  if (existsSync(path)) fail("RECOVERY_ALREADY_ATTEMPTED_OR_COMPLETED");
}
const authority = readJson(AUTHORITY_PATH);
same(authority.schema_version, 1, "authority.schema_version");
same(authority.classification, "TERMINAL_PRODUCT_PASS_CUSTODY_HELD_FALSE_POSITIVE",
  "authority.classification");
same(authority.run_id, RUN_ID, "authority.run_id");
same(authority.one_time, true, "authority.one_time");
same(authority.external_unsandboxed_execution_required, true, "authority.unsandboxed");
same(authority.grok_recovery_review_required_before_execution, true, "authority.grok_required");
same(authority.no_test_worker_controller_viewer_or_new_run_authority, true,
  "authority.no_execution");
same(authority.paths.receipt, RECEIPT_DIR, "authority.receipt");
same(authority.paths.lock, LOCK_PATH, "authority.lock");
same(authority.paths.archive, ARCHIVE_PATH, "authority.archive");
same(authority.paths.intent, INTENT_PATH, "authority.intent");
same(authority.paths.supplement, SUPPLEMENT_PATH, "authority.supplement");
same(authority.paths.marker, MARKER_PATH, "authority.marker");
same(authority.labels.controller, CONTROLLER_LABEL, "authority.controller_label");
same(authority.labels.controller_required_state,
  "present_not_running_or_exited_last_exit_0_no_pid", "authority.controller_state");
same(authority.labels.worker, WORKER_LABEL, "authority.worker_label");
same(authority.labels.worker_required_state, "absent", "authority.worker_state");
sameJson(authority.present_receipt_entries, PRESENT_NAMES, "authority.present_names");
same(authority.receipt_tree_sha256, RECEIPT_TREE_SHA256, "authority.receipt_tree");
same(authority.private_tree_sha256, PRIVATE_TREE_SHA256, "authority.private_tree");
verifyFileTuple(fileTuple(TOOL_PATH), authority.recovery_tool, "authority.recovery_tool");
verifyFileTuple(fileTuple(CORE_PATH), authority.recovery_core, "authority.recovery_core");
verifyFileTuple(fileTuple(PARSER_PATH), authority.supervisor_parsers, "authority.parsers");
verifyFileTuple(fileTuple(EVIDENCE_PATH), authority.failure_evidence, "authority.evidence");
verifyFileTuple(fileTuple(PACKET_PATH), authority.execution_packet, "authority.packet");
verifyFileTuple(fileTuple(OWNER_PATH), authority.owner, "authority.owner");
verifyFileTuple(fileTuple(join(LOCK_PATH, "claim.json")), authority.claim, "authority.claim");
for (const path of [AUTHORITY_PATH, EVIDENCE_PATH]) {
  if ((lstatSync(path).mode & 0o222) !== 0) fail(`IMMUTABILITY_MODE_MISMATCH:${path}`);
}
verifyReview(authority);
const evidence = readJson(EVIDENCE_PATH);
same(evidence.classification, authority.classification, "evidence.classification");
same(evidence.run_id, RUN_ID, "evidence.run_id");
same(evidence.ansi_stripped_test_result.source_stdout_sha256, STDOUT_SHA256, "evidence.stdout");
same(evidence.ansi_stripped_test_result.tests_passed, 56, "evidence.tests_passed");
same(evidence.bindings.lock_inode, LOCK_INODE, "evidence.lock_inode");
sameJson(evidence.custody_hold.false_positive_lines, FALSE_POSITIVE_LINES,
  "evidence.false_positive_lines");

const pre = inspectIncident(authority);
const gitPre = inspectGitAndGoverned(pre.owner, pre.packet);
const processPre = inspectProcesses(pre.owner);
const launchdPre = inspectLaunchd();
const createdUtc = new Date().toISOString();
const supplementValue = Object.freeze({
  schema_version: 1, classification: "ANSI_STRIPPED_VITEST_COUNTS_SUPPLEMENT",
  run_id: RUN_ID, source_stdout: pre.test_stdout, mirrored_worker_stdout: pre.worker_stdout,
  worker_terminal: pre.worker_terminal, parser: fileTuple(PARSER_PATH), raw_status: 0,
  historical_worker_terminal_parsed_counts: null,
  ansi_stripped_sha256: ANSI_STRIPPED_SHA256, ansi_stripped_bytes: 76636,
  test_files_passed: 1, test_files_total: 1, tests_passed: 56, tests_skipped: 0,
  tests_total: 56, checkmark_lines: 56, run_banner_count: 1,
  worker_terminal_rewritten: false, same_byte_test_rerun: false, created_utc: createdUtc
});
const supplementBytes = `${JSON.stringify(supplementValue, null, 2)}\n`;
const authorityTuple = fileTuple(AUTHORITY_PATH);
const intentWrite = writeImmutableJson(INTENT_PATH, {
  schema_version: 1, classification: authority.classification, run_id: RUN_ID,
  operation: "write_count_supplement_then_atomic_rename_preserving_lock_and_claim_inodes",
  authority: authorityTuple, recovery_tool: fileTuple(TOOL_PATH), recovery_core: fileTuple(CORE_PATH),
  supervisor_parsers: fileTuple(PARSER_PATH), failure_evidence: fileTuple(EVIDENCE_PATH),
  execution_packet: fileTuple(PACKET_PATH), pre_incident: pre, git_and_governed: gitPre,
  process_scan: processPre, launchd_scan: launchdPre,
  planned_supplement: { path: SUPPLEMENT_PATH, sha256: sha256(supplementBytes),
    size: Buffer.byteLength(supplementBytes) }, terminal_or_release_authority: "none",
  created_utc: createdUtc
});
const afterIntent = inspectIncident(authority, [basename(INTENT_PATH)]);
same(afterIntent.lock.tree_sha256, pre.lock.tree_sha256, "after_intent.lock");
same(afterIntent.private_tree.tree_sha256, pre.private_tree.tree_sha256, "after_intent.private");
const processAfterIntent = inspectProcesses(pre.owner);
const launchdAfterIntent = inspectLaunchd();
const supplementWrite = writeImmutableJson(SUPPLEMENT_PATH, supplementValue);
same(supplementWrite.sha256, sha256(supplementBytes), "supplement.sha256");
const beforeArchive = inspectIncident(authority,
  [basename(INTENT_PATH), basename(SUPPLEMENT_PATH)]);
same(beforeArchive.lock.tree_sha256, pre.lock.tree_sha256, "before_archive.lock");
same(beforeArchive.private_tree.tree_sha256, pre.private_tree.tree_sha256, "before_archive.private");
const processBeforeArchive = inspectProcesses(pre.owner);
const launchdBeforeArchive = inspectLaunchd();
const gitBeforeArchive = inspectGitAndGoverned(pre.owner, pre.packet);
const archived = archiveLockPreservingInodes({
  lockPath: LOCK_PATH, archivePath: ARCHIVE_PATH, expected: pre.lock
});
const privateAfterArchive = snapshotTree(PRIVATE_DIR);
same(privateAfterArchive.tree_sha256, PRIVATE_TREE_SHA256, "after_archive.private_tree");
const markerWrite = writeImmutableJson(MARKER_PATH, {
  schema_version: 1,
  classification: "TERMINAL_PRODUCT_PASS_CUSTODY_FALSE_POSITIVE_LOCK_ARCHIVED",
  run_id: RUN_ID, live_lock_path: LOCK_PATH, archived_lock_path: ARCHIVE_PATH,
  intent: { ...intentWrite, sha256: shaFile(INTENT_PATH) },
  supplement: { ...supplementWrite, sha256: shaFile(SUPPLEMENT_PATH) }, authority: authorityTuple,
  pre_incident: pre, after_intent_incident: afterIntent, before_archive_incident: beforeArchive,
  archived_lock: archived,
  directory_inode_preserved: archived.directory.device === LOCK_DEVICE
    && archived.directory.inode === LOCK_INODE,
  claim_inode_preserved: archived.claim.device === LOCK_DEVICE
    && archived.claim.inode === CLAIM_INODE && archived.claim.sha256 === CLAIM_SHA256,
  private_runtime_preserved: privateAfterArchive,
  process_scan_after_intent: processAfterIntent, launchd_scan_after_intent: launchdAfterIntent,
  process_scan_before_archive: processBeforeArchive, launchd_scan_before_archive: launchdBeforeArchive,
  git_and_governed_before_archive: gitBeforeArchive,
  terminal_json_written: false, release_json_written: false,
  completed_utc: new Date().toISOString(), new_run_authority: "none"
});
process.stdout.write(`FULL_GATE_CUSTODY_LOCK_ARCHIVED run_id=${RUN_ID} marker_sha256=${markerWrite.sha256}\n`);
