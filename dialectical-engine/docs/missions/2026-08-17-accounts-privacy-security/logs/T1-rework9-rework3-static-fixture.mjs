#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync,
  statSync, symlinkSync, writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const logRoot = "docs/missions/2026-08-17-accounts-privacy-security/logs";
const names = Object.freeze({
  core: "T1-rework9-rework3-recovery-core.mjs",
  tool: "T1-rework9-rework3-never-started-recovery.mjs",
  authority: "T1-rework9-rework3-never-started-authority.json",
  evidence: "T1-rework9-rework3-never-started-failure-evidence.json",
  probe: "T1-rework9-rework3-runtime-probe.mjs",
  probePlist: "T1-rework9-rework3-runtime-probe.plist.template"
});
const missingArtifacts = Object.values(names).filter((name) => !existsSync(join(logRoot, name)));
if (missingArtifacts.length > 0) {
  process.stderr.write(`NEVER_STARTED_RECOVERY_RED missing=${missingArtifacts.join(",")} recovery_guards=absent archive_inode_proof=absent idempotent_fail_closed=absent\n`);
  process.exit(1);
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const shaFile = (path) => sha256(readFileSync(path));
const toolSource = readFileSync(join(logRoot, names.tool), "utf8");
const probeSource = readFileSync(join(logRoot, names.probe), "utf8");
const forbiddenAuthority = [
  /launchctl", \["bootstrap"/,
  /launchctl", \["bootout"/,
  /spawnSync\([^\n]*(?:vitest|worker|controller)/,
  /execFileSync\([^\n]*(?:vitest|worker|controller)/,
  /unlinkSync|rmdirSync|rmSync/
];
const requiredToolTokens = [
  "NEVER_STARTED_ONLY",
  "worker-bootstrap-requested.json",
  "controller-epoch-",
  "worker-terminal.json",
  "test.status",
  "terminal.json",
  "release.json",
  "labelAbsentExact",
  "PREFLIGHT_LIVENESS_UNKNOWN",
  "immutable recovery intent precedes the only rename",
  "archiveLockPreservingInodes",
  "NEVER_STARTED_RECOVERED_LOCK_ARCHIVED"
];
const staticFailures = requiredToolTokens.filter((token) => !toolSource.includes(token));
for (const pattern of forbiddenAuthority) {
  if (pattern.test(toolSource)) staticFailures.push(`forbidden:${pattern.source}`);
}
if (/realpathSync\(probeDirectory\) !== probeDirectory/.test(probeSource)
  || !probeSource.includes("join(realpathSync(dirname(probeDirectory)), basename(probeDirectory))")
  || !probeSource.includes("realpathSync(probeDirectory) !== expectedProbeRealpath")) {
  staticFailures.push("probe_noncanonical_parent_realpath_guard");
}

const core = await import(pathToFileURL(join(process.cwd(), logRoot, names.core)).href);
const expectFailure = (name, operation) => {
  try {
    operation();
  } catch {
    return name;
  }
  throw new Error(`EXPECTED_FAIL_CLOSED_GUARD_DID_NOT_FAIL:${name}`);
};
const fakeRoot = mkdtempSync(join(tmpdir(), "t1-rework9-rework3-fixture-"));
try {
  const canonicalVar = join(fakeRoot, "private", "var");
  mkdirSync(join(canonicalVar, "folders"), { recursive: true, mode: 0o700 });
  symlinkSync(canonicalVar, join(fakeRoot, "var"), "dir");
  const noncanonicalProbePath = join(fakeRoot, "var", "folders",
    "debateai-t1gate-runtime-probe-fixture");
  mkdirSync(noncanonicalProbePath, { mode: 0o700 });
  const oldLiteralComparison = realpathSync(noncanonicalProbePath) === noncanonicalProbePath;
  const expectedProbeRealpath = join(realpathSync(dirname(noncanonicalProbePath)),
    basename(noncanonicalProbePath));
  const canonicalParentComparison = realpathSync(noncanonicalProbePath) === expectedProbeRealpath;
  if (oldLiteralComparison || !canonicalParentComparison) {
    throw new Error("NONCANONICAL_PATH_FIXTURE_INVALID");
  }
  const runId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const receiptDir = join(fakeRoot, `T1-rework9-gate-${runId}`);
  const lockPath = join(fakeRoot, ".T1-full-registration.exclusive.lock");
  const archivePath = join(receiptDir, "never-started-archived-lock");
  mkdirSync(receiptDir, { mode: 0o700 });
  mkdirSync(lockPath, { mode: 0o700 });
  const lockStat = statSync(lockPath);
  const tokenHash = sha256("fixture-token");
  const ownerPath = join(receiptDir, "owner.json");
  const owner = {
    schema_version: 1,
    run_id: runId,
    ownership_token_sha256: tokenHash,
    lock: { path: lockPath, device: lockStat.dev, inode: lockStat.ino }
  };
  writeFileSync(ownerPath, `${JSON.stringify(owner)}\n`, { mode: 0o400, flag: "wx" });
  chmodSync(ownerPath, 0o400);
  const claimPath = join(lockPath, "claim.json");
  const claim = {
    schema_version: 1,
    run_id: runId,
    ownership_token_sha256: tokenHash,
    owner_sha256: shaFile(ownerPath),
    lock_device: lockStat.dev,
    lock_inode: lockStat.ino
  };
  writeFileSync(claimPath, `${JSON.stringify(claim)}\n`, { mode: 0o600, flag: "wx" });
  const streams = ["controller.stdout.log", "controller.stderr.log", "worker.stdout.log",
    "worker.stderr.log", "test.stdout.log", "test.stderr.log"];
  for (const name of streams) writeFileSync(join(receiptDir, name), "", { mode: 0o600, flag: "wx" });
  const absent = ["worker-bootstrap-requested.json", "heartbeat.json", "controller-epoch-1.json",
    "worker-terminal.json", "test.status", "terminal.json", "release.json",
    "never-started-recovery-intent.json", "never-started-recovery.json"];
  const inspect = () => core.inspectNeverStartedFilesystem({
    receiptDir, lockPath, archivePath, runId,
    expectedOwnerSha256: shaFile(ownerPath), expectedClaimSha256: shaFile(claimPath),
    expectedTokenSha256: tokenHash, expectedLockDevice: lockStat.dev,
    expectedLockInode: lockStat.ino, absentNames: absent, zeroStreamNames: streams
  });
  const guardProofs = [];
  writeFileSync(join(receiptDir, "terminal.json"), "{}\n", { mode: 0o600, flag: "wx" });
  guardProofs.push(expectFailure("terminal_present", inspect));
  rmSync(join(receiptDir, "terminal.json"));
  writeFileSync(join(receiptDir, "controller.stdout.log"), "unexpected\n");
  guardProofs.push(expectFailure("nonzero_stream", inspect));
  writeFileSync(join(receiptDir, "controller.stdout.log"), "");
  const claimBytes = readFileSync(claimPath);
  writeFileSync(claimPath, `${JSON.stringify({ ...claim,
    ownership_token_sha256: sha256("wrong-token") })}\n`);
  guardProofs.push(expectFailure("claim_token_mismatch", inspect));
  writeFileSync(claimPath, claimBytes);
  const pre = core.inspectNeverStartedFilesystem({
    receiptDir, lockPath, archivePath, runId,
    expectedOwnerSha256: shaFile(ownerPath), expectedClaimSha256: shaFile(claimPath),
    expectedTokenSha256: tokenHash, expectedLockDevice: lockStat.dev,
    expectedLockInode: lockStat.ino, absentNames: absent, zeroStreamNames: streams
  });
  const intentPath = join(receiptDir, "never-started-recovery-intent.json");
  core.writeImmutableJson(intentPath, { schema_version: 1, run_id: runId,
    classification: "NEVER_STARTED_ONLY", pre });
  guardProofs.push(expectFailure("immutable_intent_collision", () =>
    core.writeImmutableJson(intentPath, { replaced: true })));
  const archived = core.archiveLockPreservingInodes({ lockPath, archivePath, expected: pre.lock });
  const markerPath = join(receiptDir, "never-started-recovery.json");
  core.writeImmutableJson(markerPath, { schema_version: 1, run_id: runId,
    classification: "NEVER_STARTED_RECOVERED_LOCK_ARCHIVED", archived });
  let secondRunFailedClosed = false;
  try {
    core.archiveLockPreservingInodes({ lockPath, archivePath, expected: pre.lock });
  } catch {
    secondRunFailedClosed = true;
  }
  const inodePreserved = archived.directory.device === pre.lock.directory.device
    && archived.directory.inode === pre.lock.directory.inode
    && archived.claim.device === pre.lock.claim.device
    && archived.claim.inode === pre.lock.claim.inode;
  if (staticFailures.length > 0 || guardProofs.length !== 4 || !inodePreserved || !secondRunFailedClosed
    || existsSync(lockPath) || !existsSync(archivePath)) {
    throw new Error(`FIXTURE_ASSERTION_FAILED static=${staticFailures.join("|")} old_literal_comparison=${oldLiteralComparison} canonical_parent_comparison=${canonicalParentComparison} inode=${inodePreserved} second=${secondRunFailedClosed}`);
  }
  process.stdout.write(`NEVER_STARTED_RECOVERY_GREEN guards=${guardProofs.join(",")} noncanonical_old_literal_comparison=${oldLiteralComparison} canonical_parent_comparison=${canonicalParentComparison} lock_rename=atomic directory_inode=${archived.directory.inode} claim_inode=${archived.claim.inode} idempotent_fail_closed=true execution_authority=absent\n`);
} finally {
  rmSync(fakeRoot, { recursive: true });
}
