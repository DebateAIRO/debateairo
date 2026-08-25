#!/Users/vladmihaimiron/.hermes/node/bin/node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync, closeSync, constants, existsSync, fsyncSync, lstatSync, openSync,
  readFileSync, readdirSync, readlinkSync, realpathSync, renameSync, writeFileSync
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const RUN_ID = "302197e8-e713-47f7-9518-9f078eede931";
const CWD = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine";
const LOG_ROOT = `${CWD}/docs/missions/2026-08-17-accounts-privacy-security/logs`;
const RECEIPT_DIR = `${LOG_ROOT}/T1-rework9-gate-${RUN_ID}`;
const LOCK_PATH = `${LOG_ROOT}/.T1-full-registration.exclusive.lock`;
const ARCHIVE_PATH = `${RECEIPT_DIR}/launcher-abort-rework8-archived-lock`;
const INTENT_PATH = `${RECEIPT_DIR}/launcher-abort-rework8-recovery-intent.json`;
const MARKER_PATH = `${RECEIPT_DIR}/launcher-abort-rework8-recovery.json`;
const PACKET_PATH = `${LOG_ROOT}/T1-rework9-execution-${RUN_ID}.json`;
const ABORT_PATH = `${RECEIPT_DIR}/launcher-abort.json`;
const TOOL_PATH = `${LOG_ROOT}/T1-rework9-rework8-abort-recovery.mjs`;
const AUTHORITY_PATH = `${LOG_ROOT}/T1-rework9-rework8-abort-authority.json`;
const EVIDENCE_PATH = `${LOG_ROOT}/T1-rework9-rework8-abort-failure-evidence.json`;
const PRIVATE_DIR = "/var/folders/h7/4hdbz7s15hjbyj6scmk_nx3r0000gn/T/debateai-t1gate-302197e8-e713-47f7-9518-9f078eede931";
const SECRET_PATH = `${PRIVATE_DIR}/controller-custody.secret`;
const CHALLENGE_PATH = `${PRIVATE_DIR}/viewer-challenge`;
const CONTROLLER_LABEL = `com.debateai.t1gate.controller.${RUN_ID}`;
const WORKER_LABEL = `com.debateai.t1gate.worker.${RUN_ID}`;
const EXPECTED_HEAD = "7918f4f8bff33909792afc01dc38d402972b4ccd";
const EXPECTED_PACKET_SHA256 = "119a9f5d6aebf3c678c755b10f91e582931d3b9ecb7cb52f265dbcc4b241ace2";
const EXPECTED_ABORT_SHA256 = "e10a9c0474289948ecfb445a6368ef50840e7233b650476a7773a7acb73a3e82";
const EXPECTED_LOCK = Object.freeze({
  device: 16777233, inode: 46921156, mode: 0o700, uid: 501, gid: 20,
  size: 64, mtime_ms: 1787429414372.8252,
  tree_sha256: "8cf71342492445ea3a465ab09ac9b44ba0d30846ca4e0e9c98833b01510d6977"
});
const HEAVY_PROCESS_PATTERN = /vitest|claude|mutation|T1.*full-registration|(?:^|[\/\s])(?:postgres|pg_ctl)(?=[:\s]|$)/i;
const SUPERVISOR_PROCESS_PATTERN = /T1-rework9-gate-(?:launcher|controller|worker|viewer)\.mjs/i;
const ABSENT_RECEIPT_NAMES = Object.freeze([
  "owner.json", "preflight.json", "process-pre.txt", "launchd-pre.txt",
  "controller.plist", "worker.plist", "controller.stdout.log", "controller.stderr.log",
  "worker.stdout.log", "worker.stderr.log", "test.stdout.log", "test.stderr.log",
  "viewer.ready.json", "controller-epoch-", "heartbeat.json",
  "worker-bootstrap-requested.json", "worker-terminal.json", "test.status", "postflight-",
  "postflight.json", "launchd-streams.json", "terminal.json", "release.json", "events.jsonl",
  "custody-hold.json"
]);

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const shaFile = (path) => sha256(readFileSync(path));
const fail = (code) => { throw new Error(code); };
const same = (actual, expected, name) => {
  if (actual !== expected) fail(`CUSTODY_MISMATCH:${name}`);
};
const sameJson = (actual, expected, name) => same(JSON.stringify(actual),
  JSON.stringify(expected), name);
const statRecord = (stats) => Object.freeze({
  device: stats.dev, inode: stats.ino, mode: stats.mode & 0o777,
  uid: stats.uid, gid: stats.gid, size: stats.size, mtime_ms: stats.mtimeMs
});
const directoryRecord = (path) => {
  const stats = lstatSync(path);
  if (!stats.isDirectory() || stats.isSymbolicLink()) fail(`NOT_DIRECTORY:${path}`);
  return Object.freeze({ path, ...statRecord(stats) });
};
const tuple = (path) => {
  const stats = lstatSync(path);
  if (!stats.isFile() || stats.isSymbolicLink()) fail(`NOT_REGULAR_FILE:${path}`);
  return Object.freeze({ path, sha256: shaFile(path), size: stats.size,
    mtime_ms: stats.mtimeMs, device: stats.dev, inode: stats.ino,
    mode: stats.mode & 0o777, uid: stats.uid, gid: stats.gid });
};
const verifyTuple = (actual, expected, name) => {
  for (const key of ["path", "sha256", "size", "mtime_ms"]) {
    same(actual[key], expected[key], `${name}.${key}`);
  }
  for (const key of ["device", "inode", "mode", "uid", "gid"]) {
    if (expected[key] !== undefined) same(actual[key], expected[key], `${name}.${key}`);
  }
};
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const writeImmutableJson = (path, value) => {
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  const fd = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o400);
  try {
    writeFileSync(fd, bytes);
    fsyncSync(fd);
    chmodSync(path, 0o400);
  } finally {
    closeSync(fd);
  }
  const directoryFd = openSync(dirname(path), constants.O_RDONLY);
  try { fsyncSync(directoryFd); } finally { closeSync(directoryFd); }
  return Object.freeze({ path, sha256: sha256(bytes), size: Buffer.byteLength(bytes) });
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
const snapshotEmptyLock = (path) => {
  const directory = directoryRecord(path);
  const entries = readdirSync(path).sort();
  sameJson(entries, [], "lock.entries");
  const hashRecord = { device: directory.device, inode: directory.inode,
    mode: directory.mode, uid: directory.uid, gid: directory.gid,
    size: directory.size, mtime_ms: directory.mtime_ms };
  return Object.freeze({ directory, entries,
    tree_sha256: sha256(JSON.stringify({ directory: hashRecord, entries })) });
};
const verifyExpectedLock = (snapshot, name) => {
  for (const key of ["device", "inode", "mode", "uid", "gid", "size", "mtime_ms"]) {
    same(snapshot.directory[key], EXPECTED_LOCK[key], `${name}.${key}`);
  }
  same(snapshot.tree_sha256, EXPECTED_LOCK.tree_sha256, `${name}.tree_sha256`);
};
const verifyPrivateRuntimePreserved = () => {
  const authority = readJson(AUTHORITY_PATH);
  const expected = authority.private_runtime;
  const directory = directoryRecord(PRIVATE_DIR);
  const canonicalExpected = join(realpathSync(dirname(PRIVATE_DIR)), basename(PRIVATE_DIR));
  same(realpathSync(PRIVATE_DIR), canonicalExpected, "private_runtime.canonical_path");
  for (const key of ["path", "device", "inode", "mode", "uid", "gid", "size", "mtime_ms"]) {
    same(directory[key], expected.directory[key], `private_runtime.directory.${key}`);
  }
  const names = readdirSync(PRIVATE_DIR).sort();
  sameJson(names, ["controller-custody.secret", "viewer-challenge"],
    "private_runtime.entries");
  const secret = tuple(SECRET_PATH);
  const challenge = tuple(CHALLENGE_PATH);
  verifyTuple(secret, expected.entries[0], "private_runtime.secret");
  verifyTuple(challenge, expected.entries[1], "private_runtime.challenge");
  same(secret.mode, 0o600, "private_runtime.secret.mode");
  same(challenge.mode, 0o600, "private_runtime.challenge.mode");
  const secretLines = readFileSync(SECRET_PATH, "utf8").split("\n");
  const challengeBytes = readFileSync(CHALLENGE_PATH);
  if (secretLines.length !== 3 || secretLines[2] !== ""
    || !/^[0-9a-f]{64}$/.test(secretLines[0])
    || !/^[0-9a-f]{64}$/.test(secretLines[1])) fail("PRIVATE_SECRET_FORMAT_MISMATCH");
  same(sha256(secretLines[0]), expected.ownership_token_sha256,
    "private_runtime.ownership_token_sha256");
  same(sha256(secretLines[1]), expected.challenge_sha256,
    "private_runtime.challenge_sha256");
  same(challengeBytes.equals(Buffer.from(`${secretLines[1]}\n`)), true,
    "private_runtime.challenge_relationship");
  for (const name of ["controller.stdout.log", "controller.stderr.log",
    "worker.stdout.log", "worker.stderr.log"]) {
    if (existsSync(join(PRIVATE_DIR, name))) fail(`PRIVATE_LAUNCHD_STREAM_PRESENT:${name}`);
  }
  return Object.freeze({ directory, entries: [secret, challenge],
    ownership_token_sha256: expected.ownership_token_sha256,
    challenge_sha256: expected.challenge_sha256,
    viewer_challenge_equals_secret_second_line: true,
    launchd_stream_files_absent: true });
};
const inspectReceipt = (expectedEntries) => {
  const directory = directoryRecord(RECEIPT_DIR);
  const authority = readJson(AUTHORITY_PATH);
  for (const key of ["path", "device", "inode", "mode", "uid", "gid"]) {
    same(directory[key], authority.receipt_directory[key], `receipt.directory.${key}`);
  }
  const entries = readdirSync(RECEIPT_DIR).sort();
  sameJson(entries, [...expectedEntries].sort(), "receipt.entries");
  verifyTuple(tuple(ABORT_PATH), authority.launcher_abort, "launcher_abort");
  sameJson(readJson(ABORT_PATH), readJson(EVIDENCE_PATH).launcher_abort.value,
    "launcher_abort.value");
  for (const name of ABSENT_RECEIPT_NAMES) {
    const present = name.endsWith("-")
      ? entries.some((entry) => entry.startsWith(name))
      : existsSync(join(RECEIPT_DIR, name));
    if (present) fail(`ABORT_ONLY_ARTIFACT_PRESENT:${name}`);
  }
  return Object.freeze({ directory, entries, launcher_abort: tuple(ABORT_PATH) });
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
  return Object.freeze({ label, status: result.status, stdout: result.stdout,
    stderr: result.stderr });
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
const inspectProcesses = () => {
  const snapshot = captureSuccess("/bin/ps", ["-axo", "pid=,ppid=,lstart=,command=", "-ww"],
    "process-scan");
  const lines = snapshot.split("\n").filter(Boolean);
  if (lines.length < 3) fail("PREFLIGHT_LIVENESS_UNKNOWN:process-scan:PARTIAL");
  const prohibited = lines.filter((line) => HEAVY_PROCESS_PATTERN.test(line)
    || SUPERVISOR_PROCESS_PATTERN.test(line)
    || line.includes(RUN_ID) || line.includes(PRIVATE_DIR));
  if (prohibited.length !== 0) fail(`PROHIBITED_PROCESS_PRESENT:${prohibited.join("|")}`);
  return Object.freeze({ sha256: sha256(snapshot), bytes: Buffer.byteLength(snapshot),
    line_count: lines.length, allowed_heavy_lines: [] });
};
const inspectGitAndGoverned = (authority) => {
  const head = captureSuccess("/usr/bin/git", ["-C", CWD, "rev-parse", "HEAD"],
    "git-head").trim();
  const index = runKnown("/usr/bin/git", ["-C", CWD, "diff", "--cached", "--name-only"],
    "git-index");
  if (index.status !== 0 || index.stderr !== "") {
    fail(`PREFLIGHT_LIVENESS_UNKNOWN:git-index:status=${index.status}`);
  }
  const staged = index.stdout.split("\n").filter(Boolean);
  same(head, EXPECTED_HEAD, "git.head");
  same(staged.length, 0, "git.staged_path_count");
  same(authority.governed.length, 12, "governed.length");
  const governed = authority.governed.map((expected) => {
    const measured = tuple(resolve(CWD, expected.path));
    const logical = { ...measured, path: expected.path };
    verifyTuple(logical, expected, `governed:${expected.path}`);
    return logical;
  });
  return Object.freeze({ head, staged_paths: staged, governed });
};
const verifyRuntimeAndRootCause = (authority) => {
  verifyTuple(tuple(authority.runtime.path), authority.runtime, "runtime");
  same(realpathSync(authority.runtime.path), authority.runtime.path, "runtime.canonical");
  const packet = readJson(PACKET_PATH);
  same(packet.run_id, RUN_ID, "packet.run_id");
  same(shaFile(PACKET_PATH), EXPECTED_PACKET_SHA256, "packet.sha256");
  const linkPath = authority.vitest_binding.package_link.path;
  const linkStat = lstatSync(linkPath);
  if (!linkStat.isSymbolicLink()) fail("VITEST_PACKAGE_LINK_NOT_SYMLINK");
  same(readlinkSync(linkPath), authority.vitest_binding.package_link.target,
    "vitest_package_link.target");
  same(sha256(readlinkSync(linkPath)), authority.vitest_binding.package_link.target_sha256,
    "vitest_package_link.target_sha256");
  same(realpathSync(linkPath), authority.vitest_binding.package_link.canonical_path,
    "vitest_package_link.canonical_path");
  for (const key of ["device", "inode", "size", "mtime_ms"]) {
    same(linkStat[key === "device" ? "dev" : key === "inode" ? "ino"
      : key === "mtime_ms" ? "mtimeMs" : key],
      authority.vitest_binding.package_link[key], `vitest_package_link.${key}`);
  }
  const canonicalEntrypoint = realpathSync(authority.vitest_binding.entrypoint.logical_path);
  same(canonicalEntrypoint, authority.vitest_binding.entrypoint.path,
    "vitest_entrypoint.canonical_path");
  same(dirname(canonicalEntrypoint), authority.vitest_binding.package_link.canonical_path,
    "vitest_entrypoint.package_relationship");
  verifyTuple(tuple(canonicalEntrypoint), authority.vitest_binding.entrypoint,
    "vitest_entrypoint");
  same(packet.vitest_entrypoint.path, authority.vitest_binding.entrypoint.logical_path,
    "incident_packet.logical_entrypoint");
  same(packet.vitest_entrypoint.sha256, authority.vitest_binding.entrypoint.sha256,
    "incident_packet.entrypoint_sha256");
  same(packet.test_runtime.sha256, authority.runtime.sha256, "packet.runtime_sha256");
  same(JSON.stringify(packet.argv), JSON.stringify([
    authority.runtime.path, authority.vitest_binding.entrypoint.logical_path,
    "run", "tests/integration/registration-database.test.ts"
  ]), "incident_packet.argv");
  return Object.freeze({ packet_sha256: EXPECTED_PACKET_SHA256,
    runtime: tuple(authority.runtime.path), vitest_binding: authority.vitest_binding,
    old_logical_realpath_equality: false });
};
const archiveLockPreservingInode = () => {
  if (!existsSync(LOCK_PATH)) fail("LIVE_LOCK_ABSENT");
  if (existsSync(ARCHIVE_PATH)) fail("ARCHIVED_LOCK_ALREADY_EXISTS");
  const before = snapshotEmptyLock(LOCK_PATH);
  verifyExpectedLock(before, "pre_archive_lock");
  renameSync(LOCK_PATH, ARCHIVE_PATH);
  for (const directory of [LOG_ROOT, RECEIPT_DIR]) {
    const fd = openSync(directory, constants.O_RDONLY);
    try { fsyncSync(fd); } finally { closeSync(fd); }
  }
  if (existsSync(LOCK_PATH)) fail("LIVE_LOCK_REMAINS_AFTER_ARCHIVE");
  const after = snapshotEmptyLock(ARCHIVE_PATH);
  verifyExpectedLock(after, "archived_lock");
  same(after.directory.device, before.directory.device, "archive.device_preserved");
  same(after.directory.inode, before.directory.inode, "archive.inode_preserved");
  same(after.tree_sha256, before.tree_sha256, "archive.tree_preserved");
  return after;
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
same(authority.classification, "LAUNCHER_ABORT_BEFORE_OWNER", "authority.classification");
same(authority.run_id, RUN_ID, "authority.run_id");
same(authority.one_time, true, "authority.one_time");
same(authority.external_unsandboxed_execution_required, true,
  "authority.external_unsandboxed_execution_required");
same(authority.grok_rework8_approval_required_before_execution, true,
  "authority.grok_rework8_approval_required_before_execution");
same(authority.private_runtime_preservation_required, true,
  "authority.private_runtime_preservation_required");
same(authority.no_new_run_test_viewer_worker_or_supervisor_authority, true,
  "authority.no_new_run_test_viewer_worker_or_supervisor_authority");
same(authority.paths.receipt, RECEIPT_DIR, "authority.paths.receipt");
same(authority.paths.lock, LOCK_PATH, "authority.paths.lock");
same(authority.paths.archive, ARCHIVE_PATH, "authority.paths.archive");
same(authority.paths.intent, INTENT_PATH, "authority.paths.intent");
same(authority.paths.marker, MARKER_PATH, "authority.paths.marker");
same(authority.paths.private_runtime, PRIVATE_DIR, "authority.paths.private_runtime");
same(authority.labels.controller, CONTROLLER_LABEL, "authority.labels.controller");
same(authority.labels.worker, WORKER_LABEL, "authority.labels.worker");
verifyTuple(tuple(TOOL_PATH), authority.recovery_tool, "authority.recovery_tool");
verifyTuple(tuple(EVIDENCE_PATH), authority.failure_evidence, "authority.failure_evidence");
verifyTuple(tuple(PACKET_PATH), authority.execution_packet, "authority.execution_packet");
verifyTuple(tuple(ABORT_PATH), authority.launcher_abort, "authority.launcher_abort");
same(authority.execution_packet.sha256, EXPECTED_PACKET_SHA256, "execution_packet.sha256");
same(authority.launcher_abort.sha256, EXPECTED_ABORT_SHA256, "launcher_abort.sha256");
for (const [name, path] of [["authority", AUTHORITY_PATH], ["failure_evidence", EVIDENCE_PATH]]) {
  if ((lstatSync(path).mode & 0o222) !== 0) fail(`IMMUTABILITY_MODE_MISMATCH:${name}`);
}
const evidence = readJson(EVIDENCE_PATH);
same(evidence.classification, "LAUNCHER_ABORT_BEFORE_OWNER", "evidence.classification");
same(evidence.run_id, RUN_ID, "evidence.run_id");
same(evidence.execution_packet.sha256, EXPECTED_PACKET_SHA256, "evidence.packet.sha256");
same(evidence.launcher_abort.sha256, EXPECTED_ABORT_SHA256, "evidence.abort.sha256");
same(evidence.private_runtime.preservation_required, true,
  "evidence.private_runtime.preservation_required");
same(evidence.root_cause.launcher_creation_order[2],
  "create deterministic private runtime directory", "evidence.creation_order.private_runtime");

const pre = Object.freeze({
  receipt: inspectReceipt(["launcher-abort.json"]),
  lock: snapshotEmptyLock(LOCK_PATH),
  private_runtime: verifyPrivateRuntimePreserved(),
  runtime_and_root_cause: verifyRuntimeAndRootCause(authority),
  git_and_governed: inspectGitAndGoverned(authority),
  process_scan: inspectProcesses(),
  launchd_scan: inspectLaunchd()
});
verifyExpectedLock(pre.lock, "pre_lock");
const intentWrite = writeImmutableJson(INTENT_PATH, Object.freeze({
  schema_version: 1,
  classification: "LAUNCHER_ABORT_BEFORE_OWNER_RECOVERY_INTENT",
  run_id: RUN_ID,
  authority: authority.recovery_tool,
  failure_evidence: authority.failure_evidence,
  execution_packet: authority.execution_packet,
  launcher_abort: authority.launcher_abort,
  pre_custody: pre,
  authorized_action: "atomic_rename_empty_lock_into_receipt_only",
  private_runtime_action: "preserve_in_place_immutable_failed_run_evidence",
  no_new_run_authority: true,
  utc: new Date().toISOString()
}));

// Immutable intent precedes the sole atomic archive. Everything mutable is
// rescanned after intent and before rename; the private failed-run evidence is
// never renamed, deleted, or rewritten.
const postIntent = Object.freeze({
  receipt: inspectReceipt(["launcher-abort.json",
    "launcher-abort-rework8-recovery-intent.json"]),
  lock: snapshotEmptyLock(LOCK_PATH),
  private_runtime: verifyPrivateRuntimePreserved(),
  runtime_and_root_cause: verifyRuntimeAndRootCause(authority),
  git_and_governed: inspectGitAndGoverned(authority),
  process_scan: inspectProcesses(),
  launchd_scan: inspectLaunchd()
});
verifyExpectedLock(postIntent.lock, "post_intent_lock");
const archivedLock = archiveLockPreservingInode();
const privateAfterArchive = verifyPrivateRuntimePreserved();
sameJson(privateAfterArchive, pre.private_runtime, "private_runtime.preserved_after_archive");
const markerWrite = writeImmutableJson(MARKER_PATH, Object.freeze({
  schema_version: 1,
  classification: "LAUNCHER_ABORT_BEFORE_OWNER_LOCK_ARCHIVED",
  run_id: RUN_ID,
  live_lock_path: LOCK_PATH,
  archived_lock_path: ARCHIVE_PATH,
  intent: intentWrite,
  pre_custody: pre,
  post_intent_custody: postIntent,
  archived_lock: archivedLock,
  lock_inode_preserved: archivedLock.directory.inode === EXPECTED_LOCK.inode,
  private_runtime_preserved_in_place: privateAfterArchive,
  private_runtime_renamed_or_deleted: false,
  completed_utc: new Date().toISOString(),
  new_run_authority: "none"
}));
process.stdout.write(`LAUNCHER_ABORT_BEFORE_OWNER_LOCK_ARCHIVED run_id=${RUN_ID} `
  + `receipt_sha256=${markerWrite.sha256}\n`);
