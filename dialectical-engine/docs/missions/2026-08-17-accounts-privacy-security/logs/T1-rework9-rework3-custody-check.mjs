#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const cwd = process.cwd();
const logRoot = join(cwd, "docs/missions/2026-08-17-accounts-privacy-security/logs");
const runId = "586303c8-f8de-4118-b888-9730abf902be";
const receiptDir = join(logRoot, `T1-rework9-gate-${runId}`);
const lockPath = join(logRoot, ".T1-full-registration.exclusive.lock");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const shaFile = (path) => sha256(readFileSync(path));
const fail = (message) => { throw new Error(message); };
const same = (actual, expected, name) => {
  if (actual !== expected) fail(`CUSTODY_MISMATCH:${name}`);
};
const tuple = (path) => {
  const stats = statSync(path);
  return { path, sha256: shaFile(path), size: stats.size, mtime_ms: stats.mtimeMs };
};
const runGit = (args) => {
  const result = spawnSync("/usr/bin/git", ["-C", cwd, ...args], { encoding: "utf8" });
  if (result.error !== undefined || result.signal !== null || result.status !== 0
    || result.stderr !== "") fail("GIT_CUSTODY_UNKNOWN");
  return result.stdout;
};

const head = runGit(["rev-parse", "HEAD"]).trim();
const staged = runGit(["diff", "--cached", "--name-only"]).split("\n").filter(Boolean);
same(head, "7918f4f8bff33909792afc01dc38d402972b4ccd", "head");
same(staged.length, 0, "staged_path_count");

const ownerPath = join(receiptDir, "owner.json");
const owner = JSON.parse(readFileSync(ownerPath, "utf8"));
same(shaFile(ownerPath), "8c745c31cda15bd57ef461679ca8835fdfc3a57ca13f6075428d6bae255ee87b",
  "owner.sha256");
same(owner.governed.length, 12, "governed.length");
const governed = owner.governed.map((expected) => {
  const actual = { ...tuple(resolve(cwd, expected.path)), path: expected.path };
  same(actual.sha256, expected.sha256, `${expected.path}.sha256`);
  same(actual.size, expected.size, `${expected.path}.size`);
  same(actual.mtime_ms, expected.mtime_ms, `${expected.path}.mtime_ms`);
  return actual;
});

const lockStats = lstatSync(lockPath);
if (!lockStats.isDirectory() || lockStats.isSymbolicLink()) fail("LOCK_NOT_EXACT_DIRECTORY");
same(lockStats.dev, 16777233, "lock.device");
same(lockStats.ino, 46312766, "lock.inode");
same(lockStats.mode & 0o777, 0o700, "lock.mode");
const claimPath = join(lockPath, "claim.json");
const claimStats = lstatSync(claimPath);
same(claimStats.dev, 16777233, "claim.device");
same(claimStats.ino, 46312780, "claim.inode");
same(shaFile(claimPath), "fba7e6e38c05e5e88548fa85faeae4eaf571f46221cdf249674d98cba7a32b88",
  "claim.sha256");
const claim = JSON.parse(readFileSync(claimPath, "utf8"));
same(claim.run_id, runId, "claim.run_id");
same(claim.ownership_token_sha256,
  "e1a658bfcbde804eef8862efa244805b6dccb3212d021585b3d77a2fd233b38e",
  "claim.token");

const absent = ["worker-bootstrap-requested.json", "heartbeat.json", "worker-terminal.json",
  "test.status", "terminal.json", "release.json", "never-started-recovery-intent.json",
  "never-started-recovery.json", "never-started-archived-lock"];
for (const name of absent) if (existsSync(join(receiptDir, name))) fail(`UNEXPECTED_ARTIFACT:${name}`);
if (readdirSync(receiptDir).some((name) => name.startsWith("controller-epoch-"))) {
  fail("UNEXPECTED_ARTIFACT:controller-epoch-");
}
const streams = ["controller.stdout.log", "controller.stderr.log", "worker.stdout.log",
  "worker.stderr.log", "test.stdout.log", "test.stderr.log"];
for (const name of streams) same(statSync(join(receiptDir, name)).size, 0, `${name}.size`);
const runtimeProbeDirectory =
  "/var/folders/h7/4hdbz7s15hjbyj6scmk_nx3r0000gn/T/debateai-t1gate-runtime-probe-586303c8-f8de-4118-b888-9730abf902be";
if (existsSync(runtimeProbeDirectory)) fail("RUNTIME_PROBE_WAS_EXECUTED");

const authorityPath = join(logRoot, "T1-rework9-rework3-never-started-authority.json");
const authority = JSON.parse(readFileSync(authorityPath, "utf8"));
for (const binding of [authority.recovery_tool, authority.recovery_core,
  authority.failure_evidence, authority.execution_packet]) {
  const actual = tuple(binding.path);
  same(actual.sha256, binding.sha256, `${binding.path}.sha256`);
  same(actual.size, binding.size, `${binding.path}.size`);
  same(actual.mtime_ms, binding.mtime_ms, `${binding.path}.mtime_ms`);
}
const artifacts = [
  "T1-rework9-rework3-custody-check.mjs",
  "T1-rework9-rework3-static-fixture.mjs",
  "T1-rework9-rework3-recovery-core.mjs",
  "T1-rework9-rework3-never-started-recovery.mjs",
  "T1-rework9-rework3-never-started-authority.json",
  "T1-rework9-rework3-never-started-failure-evidence.json",
  "T1-rework9-rework3-runtime-probe.mjs",
  "T1-rework9-rework3-runtime-probe.plist.template",
  "T1-rework9-gate-contract.md",
  "T1-rework9-static-supervisor-check.sh"
].map((name) => tuple(join(logRoot, name)));
process.stdout.write(`${JSON.stringify({
  head,
  staged_path_count: staged.length,
  governed,
  preserved_lock: {
    path: lockPath, device: lockStats.dev, inode: lockStats.ino,
    claim_inode: claimStats.ino, claim_sha256: shaFile(claimPath)
  },
  zero_streams: streams,
  never_started_artifacts_absent: [...absent, "controller-epoch-*"],
  runtime_probe_directory: "absent",
  authority_sha256: shaFile(authorityPath),
  artifacts
}, null, 2)}\n`);
process.stdout.write("REWORK3_FINAL_CUSTODY_GREEN\n");
