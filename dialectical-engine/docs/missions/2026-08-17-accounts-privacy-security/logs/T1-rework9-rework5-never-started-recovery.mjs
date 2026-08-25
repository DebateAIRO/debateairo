#!/Users/vladmihaimiron/.hermes/node/bin/node
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  archiveLockPreservingInodes, inspectNeverStartedFilesystem, sha256, shaFile,
  writeImmutableJson
} from "./T1-rework9-rework3-recovery-core.mjs";

const RUN_ID = "e3aa3d5e-85eb-46b4-8c5a-c35a9461cb16";
const CWD = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine";
const LOG_ROOT = `${CWD}/docs/missions/2026-08-17-accounts-privacy-security/logs`;
const RECEIPT_DIR = `${LOG_ROOT}/T1-rework9-gate-${RUN_ID}`;
const LOCK_PATH = `${LOG_ROOT}/.T1-full-registration.exclusive.lock`;
const ARCHIVE_PATH = `${RECEIPT_DIR}/never-started-rework5-archived-lock`;
const INTENT_PATH = `${RECEIPT_DIR}/never-started-rework5-recovery-intent.json`;
const MARKER_PATH = `${RECEIPT_DIR}/never-started-rework5-recovery.json`;
const PACKET_PATH = `${LOG_ROOT}/T1-rework9-execution-${RUN_ID}.json`;
const PACKET_SHA256 = "b282ce7861d1906090679f6f8d9f166d4ac188292ccb42dd285f7ce7087f6ddd";
const OWNER_PATH = `${RECEIPT_DIR}/owner.json`;
const OWNER_SHA256 = "7dad353a9d298d11868c5febcdbc2176cd62e65a363283099e34834cf64830d8";
const CLAIM_SHA256 = "e9be4c2450f95c2b6b10fc7d2b6d728415cdca0609fee276fd3cbb2d9e6b1e69";
const TOKEN_SHA256 = "8cafa79785f61c311316592eb86d039db012f8c5b6e29a30d59f05daa55bbe1d";
const LOCK_DEVICE = 16777233;
const LOCK_INODE = 46491737;
const CLAIM_INODE = 46491752;
const EXPECTED_HEAD = "7918f4f8bff33909792afc01dc38d402972b4ccd";
const CONTROLLER_LABEL = `com.debateai.t1gate.controller.${RUN_ID}`;
const WORKER_LABEL = `com.debateai.t1gate.worker.${RUN_ID}`;
const TOOL_PATH = `${LOG_ROOT}/T1-rework9-rework5-never-started-recovery.mjs`;
const CORE_PATH = `${LOG_ROOT}/T1-rework9-rework3-recovery-core.mjs`;
const AUTHORITY_PATH = `${LOG_ROOT}/T1-rework9-rework5-never-started-authority.json`;
const EVIDENCE_PATH = `${LOG_ROOT}/T1-rework9-rework5-never-started-failure-evidence.json`;
const GROK_APPROVAL_SHA256 = "c06e601b3dce41ab9ce8cdfaac396202947c1fd6b892e79a7fb076ebfe873b6f";
const ABSENT_NAMES = Object.freeze([
  "viewer.ready.json", "worker-bootstrap-requested.json", "heartbeat.json",
  "controller-epoch-", "worker-terminal.json", "test.status", "terminal.json",
  "release.json", "launcher-abort.json", "never-started-rework5-recovery-intent.json",
  "never-started-rework5-recovery.json"
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
  worker_plist: `${RECEIPT_DIR}/worker.plist`
});
const HEAVY_PROCESS_PATTERN = /vitest|claude|mutation|T1.*full-registration|(?:^|[\/\s])(?:postgres|pg_ctl)(?=[:\s]|$)/i;
const SUPERVISOR_PROCESS_PATTERN = /T1-rework9-gate-(?:launcher|controller|worker|viewer)\.mjs/i;

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
  const supervisor = lines.filter((line) => SUPERVISOR_PROCESS_PATTERN.test(line));
  if (unexplained.length > 0 || supervisor.length > 0) {
    fail(`HEAVY_OR_SUPERVISOR_PROCESS_PRESENT:${[...unexplained, ...supervisor].join("|")}`);
  }
  return Object.freeze({ sha256: sha256(snapshot), bytes: Buffer.byteLength(snapshot),
    line_count: lines.length, allowed_heavy_lines: heavy.map((line) => line.trim()) });
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
  same(packet.governed.length, 12, "packet.governed.length");
  sameJson(owner.governed, packet.governed, "packet_owner.governed");
  const governed = owner.governed.map((expected) => {
    const measured = { ...tuple(resolve(CWD, expected.path)), path: expected.path };
    verifyTuple(measured, expected, `governed:${expected.path}`);
    return measured;
  });
  return Object.freeze({ head, staged_paths: staged, governed });
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
same(authority.classification, "NEVER_STARTED_ONLY", "authority.classification");
same(authority.run_id, RUN_ID, "authority.run_id");
same(authority.one_time, true, "authority.one_time");
same(authority.external_unsandboxed_execution_required, true,
  "authority.external_unsandboxed_execution_required");
same(authority.no_second_run_authority, true, "authority.no_second_run_authority");
same(authority.no_test_viewer_worker_or_supervisor_execution_authority, true,
  "authority.no_test_viewer_worker_or_supervisor_execution_authority");
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
same(evidence.classification, "NEVER_STARTED_ONLY", "evidence.classification");
same(evidence.run_id, RUN_ID, "evidence.run_id");
same(evidence.execution_packet_sha256, PACKET_SHA256, "evidence.execution_packet_sha256");
same(evidence.incident.mutable_launchd_logs_are_recovery_authority, false,
  "evidence.mutable_logs_not_authority");
same(evidence.bindings.owner_sha256, OWNER_SHA256, "evidence.bindings.owner_sha256");
same(evidence.bindings.claim_sha256, CLAIM_SHA256, "evidence.bindings.claim_sha256");
same(evidence.bindings.lock_device, LOCK_DEVICE, "evidence.bindings.lock_device");
same(evidence.bindings.lock_inode, LOCK_INODE, "evidence.bindings.lock_inode");
same(evidence.bindings.claim_inode, CLAIM_INODE, "evidence.bindings.claim_inode");
same(evidence.bindings.grok_rework4_approval_sha256, GROK_APPROVAL_SHA256,
  "evidence.bindings.grok_rework4_approval_sha256");

const packet = readJson(PACKET_PATH);
const owner = readJson(OWNER_PATH);
same(packet.run_id, RUN_ID, "packet.run_id");
same(shaFile(PACKET_PATH), PACKET_SHA256, "packet.sha256");
same(packet.global_lock_path, LOCK_PATH, "packet.global_lock_path");
same(packet.review_bindings.grok_never_started_recovery_rework4, "APPROVED",
  "packet.grok_rework4_approval");
same(shaFile(OWNER_PATH), OWNER_SHA256, "owner.sha256");
same(owner.run_id, RUN_ID, "owner.run_id");
same(owner.execution_packet.path, PACKET_PATH, "owner.execution_packet.path");
same(owner.execution_packet.sha256, PACKET_SHA256, "owner.execution_packet.sha256");
same(owner.ownership_token_sha256, TOKEN_SHA256, "owner.ownership_token_sha256");
sameJson(owner.allowed_postgresql_baseline, packet.allowed_postgresql_baseline,
  "owner_packet.allowed_postgresql_baseline");

const inspectFilesystem = (absentNames) => inspectNeverStartedFilesystem({
  receiptDir: RECEIPT_DIR, lockPath: LOCK_PATH, archivePath: ARCHIVE_PATH, runId: RUN_ID,
  expectedOwnerSha256: OWNER_SHA256, expectedClaimSha256: CLAIM_SHA256,
  expectedTokenSha256: TOKEN_SHA256, expectedLockDevice: LOCK_DEVICE,
  expectedLockInode: LOCK_INODE, expectedClaimInode: CLAIM_INODE,
  absentNames, zeroStreamNames: ZERO_STREAM_NAMES
});
const preFilesystem = inspectFilesystem(ABSENT_NAMES);
same(preFilesystem.receipt_directory.mode, 0o700, "receipt.mode");
same(preFilesystem.receipt_directory.uid, process.getuid(), "receipt.uid");
same(preFilesystem.receipt_directory.gid, process.getgid(), "receipt.gid");
same(preFilesystem.lock.directory.mode, 0o700, "lock.mode");
same(preFilesystem.lock.claim.mode, 0o600, "claim.mode");
same(preFilesystem.lock.directory.uid, process.getuid(), "lock.uid");
same(preFilesystem.lock.claim.uid, process.getuid(), "claim.uid");
same(preFilesystem.lock.directory.gid, process.getgid(), "lock.gid");
same(preFilesystem.lock.claim.gid, process.getgid(), "claim.gid");
const gitPre = inspectGitAndGoverned(owner, packet);
const processPre = inspectProcesses(owner.allowed_postgresql_baseline);
const launchdPre = inspectLaunchd();
const authorityTuple = tuple(AUTHORITY_PATH);

// immutable recovery intent precedes the only rename
const intentWrite = writeImmutableJson(INTENT_PATH, {
  schema_version: 1, classification: "NEVER_STARTED_ONLY", run_id: RUN_ID,
  operation: "atomic_rename_preserving_lock_and_claim_inodes",
  authority: authorityTuple, recovery_tool: tuple(TOOL_PATH), recovery_core: tuple(CORE_PATH),
  failure_evidence: tuple(EVIDENCE_PATH), execution_packet: tuple(PACKET_PATH),
  pre_filesystem: preFilesystem, git_and_governed: gitPre,
  process_scan: processPre, launchd_scan: launchdPre, created_utc: new Date().toISOString()
});
const processPostIntent = inspectProcesses(owner.allowed_postgresql_baseline);
const launchdPostIntent = inspectLaunchd();
const postIntentFilesystem = inspectFilesystem(
  ABSENT_NAMES.filter((name) => name !== "never-started-rework5-recovery-intent.json"));
same(postIntentFilesystem.lock.tree_sha256, preFilesystem.lock.tree_sha256,
  "post_intent.lock.tree_sha256");
const gitPostIntent = inspectGitAndGoverned(owner, packet);
const archived = archiveLockPreservingInodes({
  lockPath: LOCK_PATH, archivePath: ARCHIVE_PATH, expected: preFilesystem.lock
});
const markerWrite = writeImmutableJson(MARKER_PATH, {
  schema_version: 1, classification: "NEVER_STARTED_RECOVERED_LOCK_ARCHIVED",
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
  second_run_authority: "none"
});
process.stdout.write(`NEVER_STARTED_RECOVERED_LOCK_ARCHIVED run_id=${RUN_ID} receipt_sha256=${markerWrite.sha256}\n`);
