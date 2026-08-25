#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const expectedHead = "7918f4f8bff33909792afc01dc38d402972b4ccd";
const logRoot = "docs/missions/2026-08-17-accounts-privacy-security/logs";
const shaFile = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const head = execFileSync("/usr/bin/git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const staged = execFileSync("/usr/bin/git", ["diff", "--cached", "--name-only"], {
  encoding: "utf8"
}).trim();
if (head !== expectedHead || staged !== "") throw new Error("GIT_CUSTODY_MISMATCH");

const governedManifestPath = join(logRoot, "T1-rework9-final-manifest.json");
const governedManifest = JSON.parse(readFileSync(governedManifestPath, "utf8"));
if (governedManifest.governed_paths.length !== 12) throw new Error("GOVERNED_COUNT_MISMATCH");
for (const expected of governedManifest.governed_paths) {
  const stats = statSync(expected.path);
  if (shaFile(expected.path) !== expected.sha256 || stats.size !== expected.size
    || Math.floor(stats.mtimeMs / 1000) !== expected.mtime_epoch) {
    throw new Error(`GOVERNED_TUPLE_MISMATCH:${expected.path}`);
  }
}

const reworkManifest = JSON.parse(readFileSync(join(logRoot,
  "T1-rework9-rework1-manifest.json"), "utf8"));
for (const expected of reworkManifest.artifacts) {
  const path = join(logRoot, expected.path);
  const stats = statSync(path);
  if (shaFile(path) !== expected.sha256 || stats.size !== expected.size
    || Math.floor(stats.mtimeMs / 1000) !== expected.mtime_epoch) {
    throw new Error(`REWORK_ARTIFACT_TUPLE_MISMATCH:${expected.path}`);
  }
}
for (const expected of reworkManifest.review_receipts) {
  const path = join(logRoot, expected.path);
  if (shaFile(path) !== expected.sha256) throw new Error(`REVIEW_RECEIPT_MISMATCH:${expected.path}`);
}

const authority = [
  ["T1-rework9-codex-rework1-packet.md", reworkManifest.authority.rework_packet_sha256],
  ["T1-claude-rework9-draft-packet.md", reworkManifest.authority.rework9_packet_sha256],
  ["T1-rework9-authorization-receipt.json", reworkManifest.authority.authorization_sha256],
  ["T1-rework9-author-review-roster-amendment.json",
    reworkManifest.authority.roster_amendment_sha256],
  ["T1-rework9-final-manifest.json", reworkManifest.governed.manifest_sha256]
];
for (const [name, expectedHash] of authority) {
  if (shaFile(join(logRoot, name)) !== expectedHash) throw new Error(`AUTHORITY_HASH_MISMATCH:${name}`);
}

const lockPath = join(logRoot, ".T1-full-registration.exclusive.lock");
if (existsSync(lockPath)) throw new Error("GLOBAL_LOCK_PRESENT");
const runtimeReceiptDirs = readdirSync(logRoot).filter((name) =>
  /^T1-rework9-gate-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(name));
if (runtimeReceiptDirs.length !== 0) throw new Error("GATE_RUNTIME_RECEIPT_PRESENT");
const processSnapshot = execFileSync("/bin/ps", ["-Ao", "pid=,ppid=,command="], {
  encoding: "utf8"
});
const authorProcesses = processSnapshot.split("\n").filter((line) =>
  /vitest|T1-rework9-gate-(?:launcher|controller|worker|viewer)\.mjs/i.test(line));
if (authorProcesses.length !== 0) throw new Error(`AUTHOR_PROCESS_PRESENT:${authorProcesses.join("|")}`);

process.stdout.write(`head=${head}\n`);
process.stdout.write("staged_path_count=0\n");
process.stdout.write("governed_tuple_count=12\n");
process.stdout.write(`artifact_tuple_count=${reworkManifest.artifacts.length}\n`);
process.stdout.write(`review_receipt_hash_count=${reworkManifest.review_receipts.length}\n`);
process.stdout.write("global_lock=absent\n");
process.stdout.write("gate_runtime_receipt_dirs=0\n");
process.stdout.write("author_processes=0\n");
process.stdout.write("T1_REWORK9_REWORK1_CUSTODY_GREEN\n");
