#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync, lstatSync, readFileSync, readdirSync, readlinkSync, realpathSync
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const CWD = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine";
const LOG_ROOT = `${CWD}/docs/missions/2026-08-17-accounts-privacy-security/logs`;
const RUN_ID = "302197e8-e713-47f7-9518-9f078eede931";
const RECEIPT_DIR = `${LOG_ROOT}/T1-rework9-gate-${RUN_ID}`;
const LOCK_PATH = `${LOG_ROOT}/.T1-full-registration.exclusive.lock`;
const PRIVATE_DIR = "/var/folders/h7/4hdbz7s15hjbyj6scmk_nx3r0000gn/T/debateai-t1gate-302197e8-e713-47f7-9518-9f078eede931";
const AUTHORITY_PATH = `${LOG_ROOT}/T1-rework9-rework8-abort-authority.json`;
const EVIDENCE_PATH = `${LOG_ROOT}/T1-rework9-rework8-abort-failure-evidence.json`;
const EXPECTED_HEAD = "7918f4f8bff33909792afc01dc38d402972b4ccd";
const [outputMode, ...extraArguments] = process.argv.slice(2);
if (extraArguments.length !== 0 || ![undefined, "summary"].includes(outputMode)) {
  throw new Error("CUSTODY_CHECK_ACCEPTS_ONLY_OPTIONAL_SUMMARY");
}
const EXPECTED_ARTIFACTS = Object.freeze({
  "T1-rework9-gate-launcher.mjs": "34fd87e15553526f2c03656d78196b4a211b5aa0efcfebaeef5d9ddaa3907750",
  "T1-rework9-gate-controller.mjs": "a8c5fbe5aeff7402ac65689ee1580608c5e300c5a11c1bc76107f5f7f407802c",
  "T1-rework9-gate-worker.mjs": "8ebc2ed2d10e54ca28424df186c975e8395692efb8587f7b8a563c932a1f8595",
  "T1-rework9-gate-viewer.mjs": "1b7c7998e63953b2172fb68738bb1b2bde5b62e8d9bc0d33da2a34ea2f5b8b25",
  "T1-rework9-gate-controller.plist.template": "3c6be89ac7d3e528570011b23483c1024455b3221331806257a3efab671cc67d",
  "T1-rework9-gate-worker.plist.template": "da2f5f7d06c395d1e699be6326d9b90b75d74ed643513b97c2a62ca23a561c0d",
  "T1-rework9-launchd-stream-custody.mjs": "e9440e38ce225a8b5326fcdb72a637aff6be7af6dfbf8ef9d788cfa7c94919f3",
  "T1-rework9-rework8-static-fixture.mjs": "8588f61c982e3a97bc7d01af1b42bd2955afff646534d97fa6e4d41c8145f93e",
  "T1-rework9-rework8-abort-recovery.mjs": "e5928a33e2456e9275a063f55b40da794599b330b56658b6ea997fcf0f853791",
  "T1-rework9-rework8-abort-authority.json": "b7bae38883cc5bfe41e137dcb274381c535befc52b6b95b10ea77b7986762d48",
  "T1-rework9-rework8-abort-failure-evidence.json": "5b634c61f53ded33241a02228f5ea53d8389680315a3a26a1d3d6845d81e4456",
  "T1-rework9-gate-contract.md": "006eea8773559a0fdad0811dc4df8491b1e018c194cc765e115b9cf7a49f73f3",
  "T1-rework9-static-supervisor-check.sh": "e2ca38e0b7d6d07bc5bae720fe5910d77b1dceef669ed30dcedb3e4cf3376612"
});

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fail = (code) => { throw new Error(code); };
const same = (actual, expected, name) => {
  if (actual !== expected) fail(`CUSTODY_MISMATCH:${name}`);
};
const sameJson = (actual, expected, name) => same(JSON.stringify(actual),
  JSON.stringify(expected), name);
const tuple = (path) => {
  const stats = lstatSync(path);
  if (!stats.isFile() || stats.isSymbolicLink()) fail(`NOT_REGULAR_FILE:${path}`);
  return Object.freeze({ path, sha256: sha256(readFileSync(path)), size: stats.size,
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
const run = (command, args) => {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.error !== undefined || result.signal !== null || result.status !== 0
    || typeof result.stdout !== "string" || typeof result.stderr !== "string"
    || result.stderr !== "") fail(`READ_ONLY_COMMAND_FAILED:${command}`);
  return result.stdout;
};
const authority = JSON.parse(readFileSync(AUTHORITY_PATH, "utf8"));
const evidence = JSON.parse(readFileSync(EVIDENCE_PATH, "utf8"));
same(authority.classification, "LAUNCHER_ABORT_BEFORE_OWNER", "authority.classification");
same(evidence.classification, "LAUNCHER_ABORT_BEFORE_OWNER", "evidence.classification");
same(authority.run_id, RUN_ID, "authority.run_id");
same(authority.private_runtime_preservation_required, true,
  "authority.private_runtime_preservation_required");
same(authority.no_new_run_test_viewer_worker_or_supervisor_authority, true,
  "authority.no_execution_authority");
for (const path of [AUTHORITY_PATH, EVIDENCE_PATH]) {
  if ((lstatSync(path).mode & 0o222) !== 0) fail(`IMMUTABILITY_MODE_MISMATCH:${path}`);
}

const head = run("/usr/bin/git", ["-C", CWD, "rev-parse", "HEAD"]).trim();
const staged = run("/usr/bin/git", ["-C", CWD, "diff", "--cached", "--name-only"])
  .split("\n").filter(Boolean);
same(head, EXPECTED_HEAD, "git.head");
same(staged.length, 0, "git.staged_path_count");
same(authority.governed.length, 12, "governed.length");
const governed = authority.governed.map((expected) => {
  const actual = { ...tuple(resolve(CWD, expected.path)), path: expected.path };
  verifyTuple(actual, expected, `governed:${expected.path}`);
  return actual;
});

const lockStat = lstatSync(LOCK_PATH);
if (!lockStat.isDirectory() || lockStat.isSymbolicLink()) fail("LIVE_LOCK_NOT_DIRECTORY");
same(lockStat.dev, authority.lock.device, "lock.device");
same(lockStat.ino, authority.lock.inode, "lock.inode");
same(lockStat.mode & 0o777, authority.lock.mode, "lock.mode");
same(lockStat.uid, authority.lock.uid, "lock.uid");
same(lockStat.gid, authority.lock.gid, "lock.gid");
sameJson(readdirSync(LOCK_PATH).sort(), [], "lock.entries");
same(existsSync(join(LOCK_PATH, "claim.json")), false, "lock.claim_absent");

const receiptStat = lstatSync(RECEIPT_DIR);
same(receiptStat.dev, authority.receipt_directory.device, "receipt.device");
same(receiptStat.ino, authority.receipt_directory.inode, "receipt.inode");
same(receiptStat.mode & 0o777, authority.receipt_directory.mode, "receipt.mode");
sameJson(readdirSync(RECEIPT_DIR).sort(), ["launcher-abort.json"], "receipt.entries");
verifyTuple(tuple(join(RECEIPT_DIR, "launcher-abort.json")), authority.launcher_abort,
  "launcher_abort");
for (const name of ["launcher-abort-rework8-recovery-intent.json",
  "launcher-abort-rework8-recovery.json", "launcher-abort-rework8-archived-lock"]) {
  same(existsSync(join(RECEIPT_DIR, name)), false, `recovery_absent:${name}`);
}

const privateStat = lstatSync(PRIVATE_DIR);
if (!privateStat.isDirectory() || privateStat.isSymbolicLink()) {
  fail("PRIVATE_RUNTIME_NOT_DIRECTORY");
}
same(realpathSync(PRIVATE_DIR), join(realpathSync(dirname(PRIVATE_DIR)), basename(PRIVATE_DIR)),
  "private_runtime.canonical_path");
for (const key of ["device", "inode", "mode", "uid", "gid", "size", "mtime_ms"]) {
  const actual = key === "device" ? privateStat.dev : key === "inode" ? privateStat.ino
    : key === "mode" ? privateStat.mode & 0o777 : key === "mtime_ms" ? privateStat.mtimeMs
      : privateStat[key];
  same(actual, authority.private_runtime.directory[key], `private_runtime.directory.${key}`);
}
sameJson(readdirSync(PRIVATE_DIR).sort(), ["controller-custody.secret", "viewer-challenge"],
  "private_runtime.entries");
const secret = tuple(join(PRIVATE_DIR, "controller-custody.secret"));
const challenge = tuple(join(PRIVATE_DIR, "viewer-challenge"));
verifyTuple(secret, authority.private_runtime.entries[0], "private_runtime.secret");
verifyTuple(challenge, authority.private_runtime.entries[1], "private_runtime.challenge");
const secretLines = readFileSync(secret.path, "utf8").split("\n");
same(secretLines.length, 3, "private_runtime.secret_line_count");
same(/^[0-9a-f]{64}$/.test(secretLines[0]), true, "private_runtime.token_format");
same(/^[0-9a-f]{64}$/.test(secretLines[1]), true, "private_runtime.challenge_format");
same(sha256(secretLines[0]), authority.private_runtime.ownership_token_sha256,
  "private_runtime.token_sha256");
same(sha256(secretLines[1]), authority.private_runtime.challenge_sha256,
  "private_runtime.challenge_sha256");
same(readFileSync(challenge.path).equals(Buffer.from(`${secretLines[1]}\n`)), true,
  "private_runtime.challenge_relationship");

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
  const actual = key === "device" ? linkStat.dev : key === "inode" ? linkStat.ino
    : key === "mtime_ms" ? linkStat.mtimeMs : linkStat[key];
  same(actual, authority.vitest_binding.package_link[key], `vitest_package_link.${key}`);
}
const canonicalEntrypoint = realpathSync(authority.vitest_binding.entrypoint.logical_path);
same(canonicalEntrypoint, authority.vitest_binding.entrypoint.path,
  "vitest_entrypoint.canonical_path");
same(dirname(canonicalEntrypoint), authority.vitest_binding.package_link.canonical_path,
  "vitest_entrypoint.package_relationship");
verifyTuple(tuple(canonicalEntrypoint), authority.vitest_binding.entrypoint,
  "vitest_entrypoint");
verifyTuple(tuple(authority.runtime.path), authority.runtime, "runtime");
same(realpathSync(authority.runtime.path), authority.runtime.path, "runtime.canonical_path");

const artifacts = [];
for (const [name, expected] of Object.entries(EXPECTED_ARTIFACTS)) {
  const path = join(LOG_ROOT, name);
  const actual = tuple(path);
  same(actual.sha256, expected, `artifact:${name}`);
  artifacts.push({ path, sha256: actual.sha256, size: actual.size, mtime_ms: actual.mtime_ms });
}

const custody = {
  head,
  staged_path_count: staged.length,
  governed,
  live_lock: { device: lockStat.dev, inode: lockStat.ino, entries: [] },
  receipt: { device: receiptStat.dev, inode: receiptStat.ino,
    launcher_abort_sha256: authority.launcher_abort.sha256 },
  private_runtime: { device: privateStat.dev, inode: privateStat.ino,
    entries: [secret, challenge], preserved: true },
  canonical_vitest: authority.vitest_binding,
  recovery: "absent_not_executed",
  artifacts
};
if (outputMode === "summary") {
  process.stdout.write(`REWORK8_FINAL_CUSTODY_GREEN head=${head} staged=0 governed=12 `
    + `lock=${lockStat.dev}/${lockStat.ino} receipt=${receiptStat.dev}/${receiptStat.ino} `
    + `private=${privateStat.dev}/${privateStat.ino} canonical_vitest=true `
    + `recovery=absent_not_executed\n`);
} else {
  process.stdout.write(`${JSON.stringify(custody, null, 2)}\nREWORK8_FINAL_CUSTODY_GREEN\n`);
}
