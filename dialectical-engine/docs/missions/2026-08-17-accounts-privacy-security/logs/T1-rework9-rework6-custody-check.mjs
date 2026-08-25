#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const cwd = process.cwd();
const logRoot = join(cwd, "docs/missions/2026-08-17-accounts-privacy-security/logs");
const runId = "15c9c6c5-3ca3-4e68-9fb9-587d8e19309f";
const receiptDir = join(logRoot, `T1-rework9-gate-${runId}`);
const lockPath = join(logRoot, ".T1-full-registration.exclusive.lock");
const privateDir = "/var/folders/h7/4hdbz7s15hjbyj6scmk_nx3r0000gn/T/debateai-t1gate-15c9c6c5-3ca3-4e68-9fb9-587d8e19309f";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const shaFile = (path) => sha256(readFileSync(path));
const fail = (message) => { throw new Error(message); };
const same = (actual, expected, name) => {
  if (actual !== expected) fail(`CUSTODY_MISMATCH:${name}`);
};
const tuple = (path) => {
  const stats = lstatSync(path);
  if (!stats.isFile() || stats.isSymbolicLink()) fail(`NOT_REGULAR_FILE:${path}`);
  return { path, sha256: shaFile(path), size: stats.size, mtime_ms: stats.mtimeMs };
};
const git = (args) => {
  const result = spawnSync("/usr/bin/git", ["-C", cwd, ...args], { encoding: "utf8" });
  if (result.error !== undefined || result.signal !== null || result.status !== 0
    || result.stderr !== "") fail("GIT_CUSTODY_UNKNOWN");
  return result.stdout;
};
const head = git(["rev-parse", "HEAD"]).trim();
const staged = git(["diff", "--cached", "--name-only"]).split("\n").filter(Boolean);
same(head, "7918f4f8bff33909792afc01dc38d402972b4ccd", "head");
same(staged.length, 0, "staged_path_count");
const packet = JSON.parse(readFileSync(join(logRoot, `T1-rework9-execution-${runId}.json`), "utf8"));
same(packet.governed.length, 12, "governed.length");
const governed = packet.governed.map((expected) => {
  const actual = { ...tuple(resolve(cwd, expected.path)), path: expected.path };
  same(actual.sha256, expected.sha256, `${expected.path}.sha256`);
  same(actual.size, expected.size, `${expected.path}.size`);
  same(actual.mtime_ms, expected.mtime_ms, `${expected.path}.mtime_ms`);
  return actual;
});
const lock = lstatSync(lockPath);
same(lock.isDirectory() && !lock.isSymbolicLink(), true, "lock.type");
same(lock.dev, 16777233, "lock.device");
same(lock.ino, 46622472, "lock.inode");
same(lock.mode & 0o777, 0o700, "lock.mode");
const claimPath = join(lockPath, "claim.json");
const claim = lstatSync(claimPath);
same(claim.ino, 46622486, "claim.inode");
same(claim.mode & 0o777, 0o600, "claim.mode");
same(shaFile(claimPath), "8c598375472af4d603a803470d54dd9619b116e9c9cd06e986bf7b9d19df7f4d",
  "claim.sha256");
same(shaFile(join(receiptDir, "owner.json")),
  "0e253cca9d8c8c3278fce38406c8dc7a993284959b5234a10d1f8434a3f8dd65", "owner.sha256");
same(shaFile(join(receiptDir, "viewer.ready.json")),
  "5f2f47c1c2996177984f7dcc8119f1ef1241db93fb8d6857e7ef1c3754dc359f",
  "viewer_ready.sha256");
const absent = ["worker-bootstrap-requested.json", "heartbeat.json", "worker-terminal.json",
  "test.status", "terminal.json", "release.json", "launcher-abort.json", "custody-hold.json",
  "events.jsonl", "never-started-rework6-recovery-intent.json",
  "never-started-rework6-recovery.json", "never-started-rework6-archived-lock"];
for (const name of absent) if (existsSync(join(receiptDir, name))) fail(`UNEXPECTED_ARTIFACT:${name}`);
if (readdirSync(receiptDir).some((name) => name.startsWith("controller-epoch-"))) {
  fail("UNEXPECTED_ARTIFACT:controller-epoch-");
}
const streams = ["controller.stdout.log", "controller.stderr.log", "worker.stdout.log",
  "worker.stderr.log", "test.stdout.log", "test.stderr.log"];
for (const name of streams) same(lstatSync(join(receiptDir, name)).size, 0, `${name}.size`);
same(JSON.stringify(readdirSync(privateDir).sort()), JSON.stringify(["controller-custody.secret"]),
  "private.entries");
same(shaFile(join(privateDir, "controller-custody.secret")),
  "94fcb14e4c0a557fde99b56931c3023d7da5d629f3be2c6e89c0c546a86e926a",
  "private.secret.sha256");
const authorityPath = join(logRoot, "T1-rework9-rework6-never-started-authority.json");
const authority = JSON.parse(readFileSync(authorityPath, "utf8"));
for (const binding of [authority.recovery_tool, authority.recovery_core,
  authority.failure_evidence, authority.execution_packet, authority.owner, authority.claim,
  authority.private_runtime.secret, ...Object.values(authority.receipt_evidence)]) {
  const actual = tuple(binding.path);
  same(actual.sha256, binding.sha256, `${binding.path}.sha256`);
  same(actual.size, binding.size, `${binding.path}.size`);
  same(actual.mtime_ms, binding.mtime_ms, `${binding.path}.mtime_ms`);
}
const artifactNames = [
  "T1-rework9-gate-launcher.mjs", "T1-rework9-gate-controller.mjs",
  "T1-rework9-gate-worker.mjs", "T1-rework9-gate-viewer.mjs",
  "T1-rework9-gate-controller.plist.template", "T1-rework9-gate-worker.plist.template",
  "T1-rework9-launchd-stream-custody.mjs", "T1-rework9-rework2-static-fixture.mjs",
  "T1-rework9-rework6-static-fixture.mjs", "T1-rework9-rework6-never-started-recovery.mjs",
  "T1-rework9-rework6-never-started-authority.json",
  "T1-rework9-rework6-never-started-failure-evidence.json",
  "T1-rework9-gate-contract.md", "T1-rework9-static-supervisor-check.sh"
];
process.stdout.write(`${JSON.stringify({
  head, staged_path_count: staged.length, governed,
  preserved_lock: { device: lock.dev, inode: lock.ino, claim_inode: claim.ino,
    claim_sha256: shaFile(claimPath) },
  viewer_ready_sha256: shaFile(join(receiptDir, "viewer.ready.json")),
  zero_streams: streams, never_started_artifacts_absent: [...absent, "controller-epoch-*"],
  private_entries: readdirSync(privateDir).sort(), authority_sha256: shaFile(authorityPath),
  artifacts: artifactNames.map((name) => tuple(join(logRoot, name)))
}, null, 2)}\n`);
process.stdout.write("REWORK6_FINAL_CUSTODY_GREEN\n");
