#!/Users/vladmihaimiron/.hermes/node/bin/node
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import {
  archiveLockPreservingInodes, sha256, shaFile, snapshotLock, writeImmutableJson
} from "./T1-rework9-rework3-recovery-core.mjs";

const RUN_ID = "7821bdb5-0559-43f4-804e-6996bb9f18a4";
const CWD = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine";
const LOG_ROOT = `${CWD}/docs/missions/2026-08-17-accounts-privacy-security/logs`;
const RECEIPT_DIR = `${LOG_ROOT}/T1-rework9-gate-${RUN_ID}`;
const LOCK_PATH = `${LOG_ROOT}/.T1-full-registration.exclusive.lock`;
const ARCHIVE_PATH = `${RECEIPT_DIR}/interrupted-rework7-archived-lock`;
const INTENT_PATH = `${RECEIPT_DIR}/interrupted-rework7-recovery-intent.json`;
const MARKER_PATH = `${RECEIPT_DIR}/interrupted-rework7-recovery.json`;
const PACKET_PATH = `${LOG_ROOT}/T1-rework9-execution-${RUN_ID}.json`;
const PACKET_SHA256 = "4163d9cd2075964f0b25d748341416dcb9ce45d18dddc1eb5578e43873c1ef9a";
const OWNER_PATH = `${RECEIPT_DIR}/owner.json`;
const OWNER_SHA256 = "953f0998fedb9b048069604270745855b80e179df0bcaff0a907261d76c12017";
const CLAIM_SHA256 = "bac88b8943d2f8ce0ec080cf2bb916ae431221dea175599d02066d0e8efd6545";
const TOKEN_SHA256 = "16509793c360281f71713697e8b52ded79136a9d9bdd7b3e09aa9b5454fc8376";
const LOCK_DEVICE = 16777233;
const LOCK_INODE = 46782057;
const CLAIM_INODE = 46782073;
const EXPECTED_HEAD = "7918f4f8bff33909792afc01dc38d402972b4ccd";
const CONTROLLER_LABEL = `com.debateai.t1gate.controller.${RUN_ID}`;
const WORKER_LABEL = `com.debateai.t1gate.worker.${RUN_ID}`;
const TOOL_PATH = `${LOG_ROOT}/T1-rework9-rework7-interrupted-recovery.mjs`;
const CORE_PATH = `${LOG_ROOT}/T1-rework9-rework3-recovery-core.mjs`;
const AUTHORITY_PATH = `${LOG_ROOT}/T1-rework9-rework7-interrupted-authority.json`;
const EVIDENCE_PATH = `${LOG_ROOT}/T1-rework9-rework7-interrupted-failure-evidence.json`;
const PRIVATE_DIR = "/var/folders/h7/4hdbz7s15hjbyj6scmk_nx3r0000gn/T/debateai-t1gate-7821bdb5-0559-43f4-804e-6996bb9f18a4";
const EXPECTED_STDERR = `${CWD}/node_modules/.bin/vitest: line 41: exec: node: not found\n`;
const PRESENT_NAMES = Object.freeze([
  "controller-epoch-1.json", "controller-epoch-2.json", "controller-epoch-3.json",
  "controller-epoch-4.json", "controller-epoch-5.json", "controller.plist",
  "controller.stderr.log", "controller.stdout.log", "events.jsonl", "heartbeat.json",
  "launchd-pre.txt", "launchd-streams.json", "launchd-worker-pre.txt", "owner.json",
  "preflight-worker.json", "preflight.json", "process-pre.txt", "process-worker-pre.txt",
  "test.stderr.log", "test.stdout.log", "viewer.ready.json",
  "worker-bootstrap-requested.json", "worker-terminal.json", "worker.plist",
  "worker.stderr.log", "worker.stdout.log"
]);
const ABSENT_NAMES = Object.freeze([
  "postflight.json", "postflight-epoch-", "process-post-epoch-", "launchd-post-epoch-",
  "test.status", "terminal.json", "release.json", "custody-hold.json", "launcher-abort.json",
  "interrupted-rework7-recovery-intent.json", "interrupted-rework7-recovery.json",
  "interrupted-rework7-archived-lock"
]);
const PRIVATE_NAMES = Object.freeze([
  "controller-custody.secret", "controller.stderr.log", "controller.stdout.log",
  "worker.stderr.log", "worker.stdout.log"
]);
const EXPECTED_EVENT_KINDS = Object.freeze([
  "CONTROLLER_EPOCH_STARTED", "VIEWER_VALIDATED", "WORKER_BOOTSTRAPPED",
  "LAUNCHD_STREAMS_SEALED", "CONTROLLER_EPOCH_STARTED", "RECOVERY_ONLY_EPOCH",
  "LAUNCHD_STREAMS_SEALED", "CONTROLLER_EPOCH_STARTED", "RECOVERY_ONLY_EPOCH",
  "LAUNCHD_STREAMS_SEALED", "CONTROLLER_EPOCH_STARTED", "RECOVERY_ONLY_EPOCH",
  "LAUNCHD_STREAMS_SEALED", "CONTROLLER_EPOCH_STARTED", "RECOVERY_ONLY_EPOCH",
  "LAUNCHD_STREAMS_SEALED"
]);
const HEAVY_PROCESS_PATTERN = /vitest|claude|mutation|T1.*full-registration|(?:^|[\/\s])(?:postgres|pg_ctl)(?=[:\s]|$)/i;
const RUN_PROCESS_PATTERN = /T1-rework9-gate-(?:launcher|controller|worker|viewer)\.mjs/i;

const fail = (code) => { throw new Error(code); };
const same = (actual, expected, name) => {
  if (actual !== expected) fail(`CUSTODY_MISMATCH:${name}`);
};
const sameJson = (actual, expected, name) => same(JSON.stringify(actual), JSON.stringify(expected), name);
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const tuple = (path) => {
  const stats = lstatSync(path);
  if (!stats.isFile() || stats.isSymbolicLink()) fail(`NOT_REGULAR_FILE:${path}`);
  return Object.freeze({ path, sha256: shaFile(path), size: stats.size, mtime_ms: stats.mtimeMs });
};
const fullTuple = (path) => {
  const stats = lstatSync(path);
  if (!stats.isFile() || stats.isSymbolicLink()) fail(`NOT_REGULAR_FILE:${path}`);
  return Object.freeze({ path, sha256: shaFile(path), size: stats.size, mtime_ms: stats.mtimeMs,
    device: stats.dev, inode: stats.ino, mode: stats.mode & 0o777, uid: stats.uid, gid: stats.gid });
};
const directoryTuple = (path) => {
  const stats = lstatSync(path);
  if (!stats.isDirectory() || stats.isSymbolicLink()) fail(`NOT_DIRECTORY:${path}`);
  return Object.freeze({ path, device: stats.dev, inode: stats.ino, mode: stats.mode & 0o777,
    uid: stats.uid, gid: stats.gid, size: stats.size, mtime_ms: stats.mtimeMs });
};
const verifyTuple = (actual, expected, name) => {
  same(actual.path, expected.path, `${name}.path`);
  same(actual.sha256, expected.sha256, `${name}.sha256`);
  same(actual.size, expected.size, `${name}.size`);
  same(actual.mtime_ms, expected.mtime_ms, `${name}.mtime_ms`);
};
const runKnown = (command, args, name) => {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.error !== undefined || result.signal !== null || typeof result.status !== "number"
    || typeof result.stdout !== "string" || typeof result.stderr !== "string") {
    fail(`PREFLIGHT_LIVENESS_UNKNOWN:${name}:${result.error?.code ?? result.signal ?? "PARTIAL"}`);
  }
  const combined = `${result.stdout}${result.stderr}`;
  if (/operation not permitted|permission denied|not authorized|EPERM/i.test(combined)) {
    fail(`PREFLIGHT_LIVENESS_UNKNOWN:${name}:DENIED`);
  }
  return result;
};
const captureSuccess = (command, args, name) => {
  const result = runKnown(command, args, name);
  if (result.status !== 0 || result.stderr !== "" || result.stdout.length === 0) {
    fail(`PREFLIGHT_LIVENESS_UNKNOWN:${name}:status=${result.status}`);
  }
  return result.stdout;
};
const labelAbsentExact = (label) => {
  const result = runKnown("/bin/launchctl", ["print", `gui/${process.getuid()}/${label}`],
    `launchctl-label:${label}`);
  const output = `${result.stdout}${result.stderr}`;
  if (result.status === 0) fail(`LAUNCHD_LABEL_PRESENT:${label}`);
  if (!/could not find service|service not found|could not find specified service/i.test(output)) {
    fail(`PREFLIGHT_LIVENESS_UNKNOWN:launchctl-label:${label}:status=${result.status}`);
  }
  return Object.freeze({ label, status: result.status, stdout: result.stdout, stderr: result.stderr });
};
const inspectLaunchd = () => {
  const controller = labelAbsentExact(CONTROLLER_LABEL);
  const worker = labelAbsentExact(WORKER_LABEL);
  const domain = captureSuccess("/bin/launchctl", ["print", `gui/${process.getuid()}`],
    "launchctl-domain");
  if (domain.includes(CONTROLLER_LABEL) || domain.includes(WORKER_LABEL)) {
    fail("LAUNCHD_DOMAIN_CONTAINS_EXACT_LABEL");
  }
  return Object.freeze({ controller, worker, domain_sha256: sha256(domain),
    domain_bytes: Buffer.byteLength(domain) });
};
const inspectProcesses = (allowedBaseline) => {
  const snapshot = captureSuccess("/bin/ps", ["-axo", "pid=,ppid=,lstart=,command=", "-ww"],
    "process-scan");
  const lines = snapshot.split("\n").filter(Boolean);
  if (lines.length < 3) fail("PREFLIGHT_LIVENESS_UNKNOWN:process-scan:PARTIAL");
  const candidates = lines.filter((line) => HEAVY_PROCESS_PATTERN.test(line)
    || RUN_PROCESS_PATTERN.test(line) || line.includes(RUN_ID) || line.includes(PRIVATE_DIR));
  const unexplained = candidates.filter((line) => {
    const postgres = /(?:^|[\/\s])(?:postgres|pg_ctl)(?=[:\s]|$)/i.test(line);
    return !postgres || !allowedBaseline.includes(line.trim());
  });
  if (unexplained.length > 0) {
    fail(`HEAVY_OR_RUN_PROCESS_PRESENT:${unexplained.join("|")}`);
  }
  return Object.freeze({ sha256: sha256(snapshot), bytes: Buffer.byteLength(snapshot),
    line_count: lines.length, allowed_heavy_lines: candidates.map((line) => line.trim()) });
};
const inspectGitAndGoverned = (owner, packet) => {
  const head = captureSuccess("/usr/bin/git", ["-C", CWD, "rev-parse", "HEAD"], "git-head").trim();
  const index = runKnown("/usr/bin/git", ["-C", CWD, "diff", "--cached", "--name-only"],
    "git-index");
  if (index.status !== 0 || index.stderr !== "") fail("PREFLIGHT_LIVENESS_UNKNOWN:git-index");
  const staged = index.stdout.split("\n").filter(Boolean);
  same(head, EXPECTED_HEAD, "git.head");
  same(owner.head, EXPECTED_HEAD, "owner.head");
  same(packet.head, EXPECTED_HEAD, "packet.head");
  same(staged.length, 0, "git.staged_path_count");
  same(owner.staged_path_count, 0, "owner.staged_path_count");
  same(owner.governed.length, 12, "owner.governed.length");
  sameJson(owner.governed, packet.governed, "packet_owner.governed");
  const governed = owner.governed.map((expected) => {
    const actual = { ...tuple(resolve(CWD, expected.path)), path: expected.path };
    verifyTuple(actual, expected, `governed:${expected.path}`);
    return actual;
  });
  return Object.freeze({ head, staged_paths: staged, governed });
};
const absentArtifact = (entries, name) => name.endsWith("-")
  ? !entries.some((entry) => entry.startsWith(name)) : !entries.includes(name);
const inspectPrivate = (authority, streamReceipt) => {
  const directory = directoryTuple(PRIVATE_DIR);
  same(directory.mode, 0o700, "private.mode");
  same(directory.uid, process.getuid(), "private.uid");
  same(directory.gid, process.getgid(), "private.gid");
  same(realpathSync(PRIVATE_DIR), join(realpathSync(resolve(PRIVATE_DIR, "..")), basename(PRIVATE_DIR)),
    "private.realpath");
  sameJson(readdirSync(PRIVATE_DIR).sort(), PRIVATE_NAMES, "private.entries");
  for (const name of PRIVATE_NAMES) {
    verifyTuple(tuple(join(PRIVATE_DIR, name)), authority.private_runtime.entries[name],
      `private:${name}`);
  }
  for (const processName of ["controller", "worker"]) {
    for (const streamName of ["stdout", "stderr"]) {
      const actual = fullTuple(join(PRIVATE_DIR, `${processName}.${streamName}.log`));
      sameJson(actual, streamReceipt.streams[processName][streamName].launchd,
        `private_stream:${processName}:${streamName}`);
    }
  }
  return Object.freeze({ directory, entries: Object.fromEntries(PRIVATE_NAMES.map((name) =>
    [name, tuple(join(PRIVATE_DIR, name))])) });
};
const inspectFilesystem = (authority, expectedEntries) => {
  const receiptDirectory = directoryTuple(RECEIPT_DIR);
  same(receiptDirectory.mode, 0o700, "receipt.mode");
  const entries = readdirSync(RECEIPT_DIR).sort();
  sameJson(entries, [...expectedEntries].sort(), "receipt.entries");
  for (const name of ABSENT_NAMES) {
    if (name === "interrupted-rework7-recovery-intent.json"
      && expectedEntries.includes(name)) continue;
    if (!absentArtifact(entries, name)) fail(`UNEXPECTED_RECOVERY_ARTIFACT:${name}`);
  }
  for (const name of PRESENT_NAMES) {
    verifyTuple(tuple(join(RECEIPT_DIR, name)), authority.receipt_evidence[name],
      `receipt:${name}`);
  }
  const owner = readJson(OWNER_PATH);
  same(shaFile(OWNER_PATH), OWNER_SHA256, "owner.sha256");
  same(owner.run_id, RUN_ID, "owner.run_id");
  same(owner.ownership_token_sha256, TOKEN_SHA256, "owner.token");
  same(owner.lock.path, LOCK_PATH, "owner.lock.path");
  same(owner.lock.device, LOCK_DEVICE, "owner.lock.device");
  same(owner.lock.inode, LOCK_INODE, "owner.lock.inode");
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
  const workerTerminal = readJson(join(RECEIPT_DIR, "worker-terminal.json"));
  same(workerTerminal.run_id, RUN_ID, "worker_terminal.run_id");
  same(workerTerminal.raw_status, 127, "worker_terminal.raw_status");
  same(workerTerminal.child_signal, null, "worker_terminal.child_signal");
  same(workerTerminal.supervisor_signal, null, "worker_terminal.supervisor_signal");
  same(workerTerminal.spawn_error, null, "worker_terminal.spawn_error");
  for (const name of ["parsed_test_files_passed", "parsed_test_files_total",
    "parsed_tests_passed", "parsed_tests_skipped", "parsed_tests_total"]) {
    same(workerTerminal[name], null, `worker_terminal.${name}`);
  }
  same(workerTerminal.stdout_bytes, 0, "worker_terminal.stdout_bytes");
  same(workerTerminal.stderr_bytes, 119, "worker_terminal.stderr_bytes");
  same(readFileSync(join(RECEIPT_DIR, "test.stdout.log")).length, 0, "test.stdout.bytes");
  same(readFileSync(join(RECEIPT_DIR, "test.stderr.log"), "utf8"), EXPECTED_STDERR,
    "test.stderr.exact");
  const streamReceipt = readJson(join(RECEIPT_DIR, "launchd-streams.json"));
  same(streamReceipt.run_id, RUN_ID, "launchd_streams.run_id");
  same(streamReceipt.complete, true, "launchd_streams.complete");
  for (const processName of ["controller", "worker"]) {
    for (const streamName of ["stdout", "stderr"]) {
      const expectedPath = owner.launchd_streams[processName][streamName];
      const binding = streamReceipt.streams[processName][streamName];
      same(binding.launchd.path, expectedPath.launchd_path,
        `stream:${processName}:${streamName}:launchd_path`);
      same(binding.receipt.path, expectedPath.receipt_path,
        `stream:${processName}:${streamName}:receipt_path`);
      sameJson(fullTuple(binding.receipt.path), binding.receipt,
        `stream:${processName}:${streamName}:receipt_tuple`);
      same(binding.launchd.sha256, binding.receipt.sha256,
        `stream:${processName}:${streamName}:sha256`);
      same(binding.launchd.size, binding.receipt.size,
        `stream:${processName}:${streamName}:size`);
    }
  }
  for (let epoch = 1; epoch <= 5; epoch += 1) {
    const value = readJson(join(RECEIPT_DIR, `controller-epoch-${epoch}.json`));
    same(value.run_id, RUN_ID, `epoch:${epoch}:run_id`);
    same(value.controller_epoch, epoch, `epoch:${epoch}:number`);
  }
  const events = readFileSync(join(RECEIPT_DIR, "events.jsonl"), "utf8")
    .split("\n").filter(Boolean).map((line) => JSON.parse(line));
  same(events.length, EXPECTED_EVENT_KINDS.length, "events.length");
  events.forEach((event, index) => {
    same(event.sequence, index + 1, `event:${index + 1}:sequence`);
    same(event.run_id, RUN_ID, `event:${index + 1}:run_id`);
    same(event.kind, EXPECTED_EVENT_KINDS[index], `event:${index + 1}:kind`);
  });
  const privateRuntime = inspectPrivate(authority, streamReceipt);
  return Object.freeze({ receipt_directory: receiptDirectory, owner: tuple(OWNER_PATH), lock,
    worker_terminal: tuple(join(RECEIPT_DIR, "worker-terminal.json")),
    launchd_streams: tuple(join(RECEIPT_DIR, "launchd-streams.json")),
    events: tuple(join(RECEIPT_DIR, "events.jsonl")), private_runtime: privateRuntime });
};

const [authorityArgument, ...extraArguments] = process.argv.slice(2);
if (authorityArgument === undefined || extraArguments.length !== 0) {
  fail("RECOVERY_REQUIRES_EXACTLY_ONE_AUTHORITY_PATH");
}
same(realpathSync(authorityArgument), AUTHORITY_PATH, "authority.path");
same(realpathSync(process.argv[1]), TOOL_PATH, "tool.path");
if (existsSync(INTENT_PATH) || existsSync(MARKER_PATH) || existsSync(ARCHIVE_PATH)) {
  fail("RECOVERY_ALREADY_ATTEMPTED_OR_COMPLETED");
}
const authority = readJson(AUTHORITY_PATH);
same(authority.schema_version, 1, "authority.schema_version");
same(authority.classification, "SUPERVISOR_INTERRUPTED_NO_TEST_MODULE_LOADED",
  "authority.classification");
same(authority.run_id, RUN_ID, "authority.run_id");
same(authority.one_time, true, "authority.one_time");
same(authority.external_unsandboxed_execution_required, true, "authority.unsandboxed");
same(authority.grok_rework7_approval_required_before_execution, true, "authority.grok_required");
same(authority.no_new_run_test_viewer_worker_or_supervisor_authority, true,
  "authority.no_execution");
same(authority.paths.receipt, RECEIPT_DIR, "authority.receipt");
same(authority.paths.lock, LOCK_PATH, "authority.lock");
same(authority.paths.archive, ARCHIVE_PATH, "authority.archive");
same(authority.paths.intent, INTENT_PATH, "authority.intent");
same(authority.paths.marker, MARKER_PATH, "authority.marker");
same(authority.labels.controller, CONTROLLER_LABEL, "authority.controller_label");
same(authority.labels.worker, WORKER_LABEL, "authority.worker_label");
sameJson(authority.present_receipt_entries, PRESENT_NAMES, "authority.present_entries");
sameJson(authority.absent_receipt_entries, ABSENT_NAMES, "authority.absent_entries");
sameJson(authority.private_runtime.entry_names, PRIVATE_NAMES, "authority.private_entries");
same(authority.owner.sha256, OWNER_SHA256, "authority.owner.sha256");
same(authority.claim.sha256, CLAIM_SHA256, "authority.claim.sha256");
same(authority.claim.ownership_token_sha256, TOKEN_SHA256, "authority.claim.token");
same(authority.claim.device, LOCK_DEVICE, "authority.claim.device");
same(authority.claim.lock_inode, LOCK_INODE, "authority.claim.lock_inode");
same(authority.claim.inode, CLAIM_INODE, "authority.claim.inode");
verifyTuple(tuple(TOOL_PATH), authority.recovery_tool, "authority.recovery_tool");
verifyTuple(tuple(CORE_PATH), authority.recovery_core, "authority.recovery_core");
verifyTuple(tuple(EVIDENCE_PATH), authority.failure_evidence, "authority.failure_evidence");
verifyTuple(tuple(PACKET_PATH), authority.execution_packet, "authority.execution_packet");
verifyTuple(tuple(OWNER_PATH), authority.owner, "authority.owner");
verifyTuple(tuple(`${LOCK_PATH}/claim.json`), authority.claim, "authority.claim");
for (const [name, path] of [["authority", AUTHORITY_PATH], ["failure_evidence", EVIDENCE_PATH]]) {
  if ((lstatSync(path).mode & 0o222) !== 0) fail(`IMMUTABILITY_MODE_MISMATCH:${name}`);
}
const evidence = readJson(EVIDENCE_PATH);
same(evidence.classification, "SUPERVISOR_INTERRUPTED_NO_TEST_MODULE_LOADED",
  "evidence.classification");
same(evidence.run_id, RUN_ID, "evidence.run_id");
same(evidence.execution_packet.sha256, PACKET_SHA256, "evidence.packet");
same(evidence.bindings.owner_sha256, OWNER_SHA256, "evidence.owner");
same(evidence.bindings.claim_sha256, CLAIM_SHA256, "evidence.claim");
same(evidence.bindings.lock_device, LOCK_DEVICE, "evidence.lock_device");
same(evidence.bindings.lock_inode, LOCK_INODE, "evidence.lock_inode");
same(evidence.bindings.claim_inode, CLAIM_INODE, "evidence.claim_inode");
same(evidence.worker_terminal.raw_status, 127, "evidence.worker_status");
same(evidence.test_output.vitest_module_or_test_loaded, false, "evidence.no_tests_loaded");
same(evidence.router_live_state.mutable_process_or_launchd_state_is_not_recovery_authority,
  true, "evidence.mutable_state_not_authority");

const packet = readJson(PACKET_PATH);
const owner = readJson(OWNER_PATH);
same(packet.run_id, RUN_ID, "packet.run_id");
same(shaFile(PACKET_PATH), PACKET_SHA256, "packet.sha256");
same(packet.global_lock_path, LOCK_PATH, "packet.lock_path");
same(packet.argv[0], `${CWD}/node_modules/.bin/vitest`, "packet.old_shim");
same(owner.execution_packet.path, PACKET_PATH, "owner.packet.path");
same(owner.execution_packet.sha256, PACKET_SHA256, "owner.packet.sha256");
sameJson(owner.allowed_postgresql_baseline, [], "owner.postgresql_baseline");
const preFilesystem = inspectFilesystem(authority, PRESENT_NAMES);
const gitPre = inspectGitAndGoverned(owner, packet);
const processPre = inspectProcesses(owner.allowed_postgresql_baseline);
const launchdPre = inspectLaunchd();
const authorityTuple = tuple(AUTHORITY_PATH);

// Immutable intent precedes the sole atomic archive. This tool has no new-run,
// viewer, worker, controller, test, bootstrap, bootout, unlink, or rmdir authority.
const intentWrite = writeImmutableJson(INTENT_PATH, {
  schema_version: 1, classification: "SUPERVISOR_INTERRUPTED_NO_TEST_MODULE_LOADED",
  run_id: RUN_ID, operation: "atomic_rename_preserving_lock_and_claim_inodes",
  authority: authorityTuple, recovery_tool: tuple(TOOL_PATH), recovery_core: tuple(CORE_PATH),
  failure_evidence: tuple(EVIDENCE_PATH), execution_packet: tuple(PACKET_PATH),
  pre_filesystem: preFilesystem, git_and_governed: gitPre,
  process_scan: processPre, launchd_scan: launchdPre,
  test_execution_authority: "none", created_utc: new Date().toISOString()
});
const processPostIntent = inspectProcesses(owner.allowed_postgresql_baseline);
const launchdPostIntent = inspectLaunchd();
const postIntentFilesystem = inspectFilesystem(authority,
  [...PRESENT_NAMES, basename(INTENT_PATH)]);
same(postIntentFilesystem.lock.tree_sha256, preFilesystem.lock.tree_sha256,
  "post_intent.lock.tree_sha256");
sameJson(postIntentFilesystem.private_runtime, preFilesystem.private_runtime,
  "post_intent.private_runtime");
const gitPostIntent = inspectGitAndGoverned(owner, packet);
const archived = archiveLockPreservingInodes({
  lockPath: LOCK_PATH, archivePath: ARCHIVE_PATH, expected: preFilesystem.lock
});
const markerWrite = writeImmutableJson(MARKER_PATH, {
  schema_version: 1,
  classification: "SUPERVISOR_INTERRUPTED_NO_TEST_MODULE_LOADED_LOCK_ARCHIVED",
  run_id: RUN_ID, live_lock_path: LOCK_PATH, archived_lock_path: ARCHIVE_PATH,
  intent: { ...intentWrite, sha256: shaFile(INTENT_PATH) }, authority: authorityTuple,
  pre_filesystem: preFilesystem, post_intent_filesystem: postIntentFilesystem,
  archived_lock: archived,
  directory_inode_preserved: archived.directory.device === preFilesystem.lock.directory.device
    && archived.directory.inode === preFilesystem.lock.directory.inode,
  claim_inode_preserved: archived.claim.device === preFilesystem.lock.claim.device
    && archived.claim.inode === preFilesystem.lock.claim.inode,
  process_scan_after_intent: processPostIntent, launchd_scan_after_intent: launchdPostIntent,
  git_and_governed_after_intent: gitPostIntent, completed_utc: new Date().toISOString(),
  new_run_authority: "none"
});
process.stdout.write(`SUPERVISOR_INTERRUPTED_LOCK_ARCHIVED run_id=${RUN_ID} receipt_sha256=${markerWrite.sha256}\n`);
