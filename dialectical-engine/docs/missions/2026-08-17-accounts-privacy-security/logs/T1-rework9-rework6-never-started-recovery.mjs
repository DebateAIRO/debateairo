#!/Users/vladmihaimiron/.hermes/node/bin/node
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  archiveLockPreservingInodes, inspectNeverStartedFilesystem, sha256, shaFile,
  writeImmutableJson
} from "./T1-rework9-rework3-recovery-core.mjs";

const RUN_ID = "15c9c6c5-3ca3-4e68-9fb9-587d8e19309f";
const CWD = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine";
const LOG_ROOT = `${CWD}/docs/missions/2026-08-17-accounts-privacy-security/logs`;
const RECEIPT_DIR = `${LOG_ROOT}/T1-rework9-gate-${RUN_ID}`;
const LOCK_PATH = `${LOG_ROOT}/.T1-full-registration.exclusive.lock`;
const ARCHIVE_PATH = `${RECEIPT_DIR}/never-started-rework6-archived-lock`;
const INTENT_PATH = `${RECEIPT_DIR}/never-started-rework6-recovery-intent.json`;
const MARKER_PATH = `${RECEIPT_DIR}/never-started-rework6-recovery.json`;
const PACKET_PATH = `${LOG_ROOT}/T1-rework9-execution-${RUN_ID}.json`;
const PACKET_SHA256 = "f2971e23a06afc1209a0c0e7ab8709b5906dca33c2128bee9049c995998909e7";
const OWNER_PATH = `${RECEIPT_DIR}/owner.json`;
const OWNER_SHA256 = "0e253cca9d8c8c3278fce38406c8dc7a993284959b5234a10d1f8434a3f8dd65";
const CLAIM_SHA256 = "8c598375472af4d603a803470d54dd9619b116e9c9cd06e986bf7b9d19df7f4d";
const TOKEN_SHA256 = "d083e36a71a22d9113faab964f8bdafe3b57b692bd567c7877d96be404939502";
const LOCK_DEVICE = 16777233;
const LOCK_INODE = 46622472;
const CLAIM_INODE = 46622486;
const EXPECTED_HEAD = "7918f4f8bff33909792afc01dc38d402972b4ccd";
const CONTROLLER_LABEL = `com.debateai.t1gate.controller.${RUN_ID}`;
const WORKER_LABEL = `com.debateai.t1gate.worker.${RUN_ID}`;
const TOOL_PATH = `${LOG_ROOT}/T1-rework9-rework6-never-started-recovery.mjs`;
const CORE_PATH = `${LOG_ROOT}/T1-rework9-rework3-recovery-core.mjs`;
const AUTHORITY_PATH = `${LOG_ROOT}/T1-rework9-rework6-never-started-authority.json`;
const EVIDENCE_PATH = `${LOG_ROOT}/T1-rework9-rework6-never-started-failure-evidence.json`;
const VIEWER_READY_PATH = `${RECEIPT_DIR}/viewer.ready.json`;
const PRIVATE_DIR = "/var/folders/h7/4hdbz7s15hjbyj6scmk_nx3r0000gn/T/debateai-t1gate-15c9c6c5-3ca3-4e68-9fb9-587d8e19309f";
const SECRET_PATH = `${PRIVATE_DIR}/controller-custody.secret`;
const ABSENT_NAMES = Object.freeze([
  "worker-bootstrap-requested.json", "heartbeat.json", "controller-epoch-",
  "worker-terminal.json", "test.status", "terminal.json", "release.json",
  "launcher-abort.json", "custody-hold.json", "events.jsonl",
  "never-started-rework6-recovery-intent.json", "never-started-rework6-recovery.json"
]);
const ZERO_STREAM_NAMES = Object.freeze([
  "controller.stdout.log", "controller.stderr.log", "worker.stdout.log",
  "worker.stderr.log", "test.stdout.log", "test.stderr.log"
]);
const RECEIPT_EVIDENCE_PATHS = Object.freeze({
  owner: OWNER_PATH,
  preflight: `${RECEIPT_DIR}/preflight.json`,
  process_pre: `${RECEIPT_DIR}/process-pre.txt`,
  launchd_pre: `${RECEIPT_DIR}/launchd-pre.txt`,
  controller_plist: `${RECEIPT_DIR}/controller.plist`,
  worker_plist: `${RECEIPT_DIR}/worker.plist`,
  viewer_ready: VIEWER_READY_PATH
});
const HEAVY_PROCESS_PATTERN = /vitest|claude|mutation|T1.*full-registration|(?:^|[\/\s])(?:postgres|pg_ctl)(?=[:\s]|$)/i;
const AUTHORITY_PROCESS_PATTERN = /T1-rework9-gate-(?:launcher|controller|worker)\.mjs/i;
const VIEWER_PROCESS_PATTERN = /T1-rework9-gate-viewer\.mjs/i;

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
  if (/operation not permitted|permission denied|not authorized|EPERM/i.test(output)) {
    fail(`PREFLIGHT_LIVENESS_UNKNOWN:launchctl-label:${label}:DENIED`);
  }
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
  const heavy = lines.filter((line) => HEAVY_PROCESS_PATTERN.test(line));
  const unexplained = heavy.filter((line) => {
    const postgres = /(?:^|[\/\s])(?:postgres|pg_ctl)(?=[:\s]|$)/i.test(line);
    return !postgres || !allowedBaseline.includes(line.trim());
  });
  const authorityProcesses = lines.filter((line) => AUTHORITY_PROCESS_PATTERN.test(line));
  if (unexplained.length > 0 || authorityProcesses.length > 0) {
    fail(`HEAVY_OR_SUPERVISOR_PROCESS_PRESENT:${[...unexplained, ...authorityProcesses].join("|")}`);
  }
  const viewers = lines.filter((line) => VIEWER_PROCESS_PATTERN.test(line)
    && line.includes(RUN_ID) && line.includes(RECEIPT_DIR));
  return Object.freeze({ sha256: sha256(snapshot), bytes: Buffer.byteLength(snapshot),
    line_count: lines.length, allowed_heavy_lines: heavy.map((line) => line.trim()),
    display_only_viewer_lines: viewers.map((line) => line.trim()) });
};
const inspectGitAndGoverned = (owner, packet) => {
  const head = captureSuccess("/usr/bin/git", ["-C", CWD, "rev-parse", "HEAD"], "git-head").trim();
  const index = runKnown("/usr/bin/git", ["-C", CWD, "diff", "--cached", "--name-only"],
    "git-index");
  if (index.status !== 0 || index.stderr !== "") {
    fail(`PREFLIGHT_LIVENESS_UNKNOWN:git-index:status=${index.status}`);
  }
  const staged = index.stdout.split("\n").filter(Boolean);
  same(head, EXPECTED_HEAD, "git.head");
  same(owner.head, EXPECTED_HEAD, "owner.head");
  same(packet.head, EXPECTED_HEAD, "packet.head");
  same(staged.length, 0, "git.staged_path_count");
  same(owner.staged_path_count, 0, "owner.staged_path_count");
  same(owner.governed.length, 12, "owner.governed.length");
  sameJson(owner.governed, packet.governed, "packet_owner.governed");
  const governed = owner.governed.map((expected) => {
    const measured = { ...tuple(resolve(CWD, expected.path)), path: expected.path };
    verifyTuple(measured, expected, `governed:${expected.path}`);
    return measured;
  });
  return Object.freeze({ head, staged_paths: staged, governed });
};
const inspectPrivateRuntime = (authority) => {
  const directory = lstatSync(PRIVATE_DIR);
  if (!directory.isDirectory() || directory.isSymbolicLink()
    || realpathSync(PRIVATE_DIR) !== join(realpathSync(resolve(PRIVATE_DIR, "..")), RUN_ID.replace(/^/, "debateai-t1gate-"))) {
    fail("PRIVATE_RUNTIME_DIRECTORY_MISMATCH");
  }
  same(directory.mode & 0o777, 0o700, "private_runtime.mode");
  same(directory.uid, process.getuid(), "private_runtime.uid");
  same(directory.gid, process.getgid(), "private_runtime.gid");
  sameJson(readdirSync(PRIVATE_DIR).sort(), ["controller-custody.secret"], "private_runtime.entries");
  const secret = tuple(SECRET_PATH);
  verifyTuple(secret, authority.private_runtime.secret, "private_runtime.secret");
  const secretStats = lstatSync(SECRET_PATH);
  same(secretStats.mode & 0o777, 0o600, "private_runtime.secret.mode");
  same(secretStats.uid, process.getuid(), "private_runtime.secret.uid");
  same(secretStats.gid, process.getgid(), "private_runtime.secret.gid");
  return Object.freeze({ directory: { path: PRIVATE_DIR, device: directory.dev, inode: directory.ino,
    mode: directory.mode & 0o777, uid: directory.uid, gid: directory.gid }, secret });
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
same(authority.classification, "SUPERVISOR_ONLY_NEVER_STARTED", "authority.classification");
same(authority.run_id, RUN_ID, "authority.run_id");
same(authority.one_time, true, "authority.one_time");
same(authority.external_unsandboxed_execution_required, true,
  "authority.external_unsandboxed_execution_required");
same(authority.grok_rework6_approval_required_before_execution, true,
  "authority.grok_rework6_approval_required_before_execution");
same(authority.no_new_run_test_viewer_worker_or_supervisor_authority, true,
  "authority.no_new_run_test_viewer_worker_or_supervisor_authority");
same(authority.paths.receipt, RECEIPT_DIR, "authority.paths.receipt");
same(authority.paths.lock, LOCK_PATH, "authority.paths.lock");
same(authority.paths.archive, ARCHIVE_PATH, "authority.paths.archive");
same(authority.paths.intent, INTENT_PATH, "authority.paths.intent");
same(authority.paths.marker, MARKER_PATH, "authority.paths.marker");
same(authority.labels.controller, CONTROLLER_LABEL, "authority.labels.controller");
same(authority.labels.worker, WORKER_LABEL, "authority.labels.worker");
sameJson(authority.absent_receipt_entries, ABSENT_NAMES, "authority.absent_receipt_entries");
sameJson(authority.zero_streams, ZERO_STREAM_NAMES, "authority.zero_streams");
same(authority.owner.sha256, OWNER_SHA256, "authority.owner.sha256");
same(authority.claim.sha256, CLAIM_SHA256, "authority.claim.sha256");
same(authority.claim.ownership_token_sha256, TOKEN_SHA256, "authority.claim.token");
same(authority.claim.device, LOCK_DEVICE, "authority.claim.device");
same(authority.claim.lock_inode, LOCK_INODE, "authority.claim.lock_inode");
same(authority.claim.inode, CLAIM_INODE, "authority.claim.inode");
verifyTuple(tuple(OWNER_PATH), authority.owner, "authority.owner");
verifyTuple(tuple(`${LOCK_PATH}/claim.json`), authority.claim, "authority.claim");
verifyTuple(tuple(TOOL_PATH), authority.recovery_tool, "authority.recovery_tool");
verifyTuple(tuple(CORE_PATH), authority.recovery_core, "authority.recovery_core");
verifyTuple(tuple(EVIDENCE_PATH), authority.failure_evidence, "authority.failure_evidence");
verifyTuple(tuple(PACKET_PATH), authority.execution_packet, "authority.execution_packet");
same(authority.execution_packet.sha256, PACKET_SHA256, "execution_packet.sha256");
for (const [name, path] of Object.entries(RECEIPT_EVIDENCE_PATHS)) {
  verifyTuple(tuple(path), authority.receipt_evidence[name], `authority.receipt_evidence.${name}`);
}
for (const [name, path] of [["authority", AUTHORITY_PATH], ["failure_evidence", EVIDENCE_PATH]]) {
  if ((lstatSync(path).mode & 0o222) !== 0) fail(`IMMUTABILITY_MODE_MISMATCH:${name}`);
}
const evidence = readJson(EVIDENCE_PATH);
same(evidence.classification, "SUPERVISOR_ONLY_NEVER_STARTED", "evidence.classification");
same(evidence.run_id, RUN_ID, "evidence.run_id");
same(evidence.execution_packet_sha256, PACKET_SHA256, "evidence.execution_packet_sha256");
same(evidence.router_read_only_unified_log_diagnostic.mutable_unified_log_is_recovery_authority,
  false, "evidence.mutable_logs_not_authority");
same(evidence.bindings.owner_sha256, OWNER_SHA256, "evidence.owner_sha256");
same(evidence.bindings.claim_sha256, CLAIM_SHA256, "evidence.claim_sha256");
same(evidence.bindings.lock_device, LOCK_DEVICE, "evidence.lock_device");
same(evidence.bindings.lock_inode, LOCK_INODE, "evidence.lock_inode");
same(evidence.bindings.claim_inode, CLAIM_INODE, "evidence.claim_inode");

const packet = readJson(PACKET_PATH);
const owner = readJson(OWNER_PATH);
same(packet.run_id, RUN_ID, "packet.run_id");
same(shaFile(PACKET_PATH), PACKET_SHA256, "packet.sha256");
same(packet.global_lock_path, LOCK_PATH, "packet.global_lock_path");
same(packet.review_bindings.grok_rework5, "APPROVED", "packet.grok_rework5");
same(shaFile(OWNER_PATH), OWNER_SHA256, "owner.sha256");
same(owner.run_id, RUN_ID, "owner.run_id");
same(owner.execution_packet.path, PACKET_PATH, "owner.execution_packet.path");
same(owner.execution_packet.sha256, PACKET_SHA256, "owner.execution_packet.sha256");
same(owner.ownership_token_sha256, TOKEN_SHA256, "owner.ownership_token_sha256");
sameJson(owner.allowed_postgresql_baseline, [], "owner.allowed_postgresql_baseline");

const inspectFilesystem = (absentNames) => inspectNeverStartedFilesystem({
  receiptDir: RECEIPT_DIR, lockPath: LOCK_PATH, archivePath: ARCHIVE_PATH, runId: RUN_ID,
  expectedOwnerSha256: OWNER_SHA256, expectedClaimSha256: CLAIM_SHA256,
  expectedTokenSha256: TOKEN_SHA256, expectedLockDevice: LOCK_DEVICE,
  expectedLockInode: LOCK_INODE, expectedClaimInode: CLAIM_INODE,
  absentNames, zeroStreamNames: ZERO_STREAM_NAMES
});
const preFilesystem = inspectFilesystem(ABSENT_NAMES);
same(preFilesystem.receipt_directory.mode, 0o700, "receipt.mode");
same(preFilesystem.lock.directory.mode, 0o700, "lock.mode");
same(preFilesystem.lock.claim.mode, 0o600, "claim.mode");
same(preFilesystem.receipt_directory.uid, process.getuid(), "receipt.uid");
same(preFilesystem.receipt_directory.gid, process.getgid(), "receipt.gid");
same(preFilesystem.lock.directory.uid, process.getuid(), "lock.uid");
same(preFilesystem.lock.directory.gid, process.getgid(), "lock.gid");
same(preFilesystem.lock.claim.uid, process.getuid(), "claim.uid");
same(preFilesystem.lock.claim.gid, process.getgid(), "claim.gid");
const privatePre = inspectPrivateRuntime(authority);
const gitPre = inspectGitAndGoverned(owner, packet);
const processPre = inspectProcesses(owner.allowed_postgresql_baseline);
const launchdPre = inspectLaunchd();
const authorityTuple = tuple(AUTHORITY_PATH);

// Immutable intent precedes the sole atomic archive. The current run used the
// old Documents stream contract, so its six already-durable zero-byte streams
// are preserved as incident evidence; no temp stream existed to copy.
const intentWrite = writeImmutableJson(INTENT_PATH, {
  schema_version: 1, classification: "SUPERVISOR_ONLY_NEVER_STARTED", run_id: RUN_ID,
  operation: "atomic_rename_preserving_lock_and_claim_inodes",
  authority: authorityTuple, recovery_tool: tuple(TOOL_PATH), recovery_core: tuple(CORE_PATH),
  failure_evidence: tuple(EVIDENCE_PATH), execution_packet: tuple(PACKET_PATH),
  pre_filesystem: preFilesystem, private_runtime: privatePre,
  git_and_governed: gitPre, process_scan: processPre, launchd_scan: launchdPre,
  launchd_stream_contract: "old_documents_streams_preserved_zero_bytes",
  created_utc: new Date().toISOString()
});
const processPostIntent = inspectProcesses(owner.allowed_postgresql_baseline);
const launchdPostIntent = inspectLaunchd();
const postIntentFilesystem = inspectFilesystem(
  ABSENT_NAMES.filter((name) => name !== "never-started-rework6-recovery-intent.json"));
const privatePostIntent = inspectPrivateRuntime(authority);
same(postIntentFilesystem.lock.tree_sha256, preFilesystem.lock.tree_sha256,
  "post_intent.lock.tree_sha256");
sameJson(privatePostIntent, privatePre, "post_intent.private_runtime");
const gitPostIntent = inspectGitAndGoverned(owner, packet);
const archived = archiveLockPreservingInodes({
  lockPath: LOCK_PATH, archivePath: ARCHIVE_PATH, expected: preFilesystem.lock
});
const markerWrite = writeImmutableJson(MARKER_PATH, {
  schema_version: 1, classification: "SUPERVISOR_ONLY_NEVER_STARTED_LOCK_ARCHIVED",
  run_id: RUN_ID, live_lock_path: LOCK_PATH, archived_lock_path: ARCHIVE_PATH,
  intent: { ...intentWrite, sha256: shaFile(INTENT_PATH) }, authority: authorityTuple,
  pre_filesystem: preFilesystem, post_intent_filesystem: postIntentFilesystem,
  private_runtime_pre: privatePre, private_runtime_post_intent: privatePostIntent,
  archived_lock: archived,
  directory_inode_preserved: archived.directory.device === preFilesystem.lock.directory.device
    && archived.directory.inode === preFilesystem.lock.directory.inode,
  claim_inode_preserved: archived.claim.device === preFilesystem.lock.claim.device
    && archived.claim.inode === preFilesystem.lock.claim.inode,
  process_scan_after_intent: processPostIntent, launchd_scan_after_intent: launchdPostIntent,
  git_and_governed_after_intent: gitPostIntent, completed_utc: new Date().toISOString(),
  new_run_authority: "none"
});
process.stdout.write(`SUPERVISOR_ONLY_NEVER_STARTED_LOCK_ARCHIVED run_id=${RUN_ID} receipt_sha256=${markerWrite.sha256}\n`);
