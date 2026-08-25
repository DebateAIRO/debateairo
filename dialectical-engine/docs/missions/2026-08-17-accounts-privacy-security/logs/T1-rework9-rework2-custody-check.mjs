#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const expectedHead = "7918f4f8bff33909792afc01dc38d402972b4ccd";
const expectedPriorCount = 122;
const expectedPriorAggregate = "4b292769c5259208ba17ec575cfd6a8f760480e69ee9f028c7885590fc1bc82a";
const expectedPacket = "5307e47f60e59d743d3a240c41107eca2339030ab97a6e7ff4f8bd1080704e88";
const logRoot = "docs/missions/2026-08-17-accounts-privacy-security/logs";
const shaBytes = (bytes) => createHash("sha256").update(bytes).digest("hex");
const shaFile = (path) => shaBytes(readFileSync(path));

const head = execFileSync("/usr/bin/git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const staged = execFileSync("/usr/bin/git", ["diff", "--cached", "--name-only"], {
  encoding: "utf8"
}).trim();
if (head !== expectedHead || staged !== "") throw new Error("GIT_CUSTODY_MISMATCH");

const governedManifest = JSON.parse(readFileSync(join(logRoot, "T1-rework9-final-manifest.json"),
  "utf8"));
if (governedManifest.governed_paths.length !== 12) throw new Error("GOVERNED_COUNT_MISMATCH");
for (const expected of governedManifest.governed_paths) {
  const stats = statSync(expected.path);
  if (shaFile(expected.path) !== expected.sha256 || stats.size !== expected.size
    || Math.floor(stats.mtimeMs / 1000) !== expected.mtime_epoch) {
    throw new Error(`GOVERNED_TUPLE_MISMATCH:${expected.path}`);
  }
}

const manifest = JSON.parse(readFileSync(join(logRoot, "T1-rework9-rework2-manifest.json"),
  "utf8"));
for (const expected of manifest.artifacts) {
  const path = join(logRoot, expected.path);
  const stats = statSync(path);
  if (shaFile(path) !== expected.sha256 || stats.size !== expected.size
    || Math.floor(stats.mtimeMs / 1000) !== expected.mtime_epoch) {
    throw new Error(`ARTIFACT_TUPLE_MISMATCH:${expected.path}`);
  }
}
if (shaFile(join(logRoot, "T1-rework9-codex-rework2-packet.md")) !== expectedPacket) {
  throw new Error("REWORK2_PACKET_HASH_MISMATCH");
}

const mutablePriorNames = new Set([
  "T1-rework9-gate-launcher.mjs",
  "T1-rework9-static-supervisor-check.sh",
  "T1-rework9-gate-contract.md",
  "T1-rework9-rework1-static-fixture.mjs"
]);
const priorPaths = readdirSync(logRoot, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.startsWith("T1-rework9-")
    && !entry.name.startsWith("T1-rework9-rework2-")
    && entry.name !== "T1-rework9-codex-rework2-packet.md"
    && !mutablePriorNames.has(entry.name))
  .map((entry) => join(logRoot, entry.name)).sort();
const priorChecksumBytes = priorPaths.map((path) => `${shaFile(path)}  ${path}\n`).join("");
if (priorPaths.length !== expectedPriorCount
  || shaBytes(priorChecksumBytes) !== expectedPriorAggregate) {
  throw new Error(`PRIOR_RECEIPT_AGGREGATE_MISMATCH:${priorPaths.length}:${shaBytes(priorChecksumBytes)}`);
}

if (existsSync(join(logRoot, ".T1-full-registration.exclusive.lock"))) {
  throw new Error("GLOBAL_LOCK_PRESENT");
}
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
process.stdout.write(`artifact_tuple_count=${manifest.artifacts.length}\n`);
process.stdout.write(`prior_frozen_file_count=${priorPaths.length}\n`);
process.stdout.write(`prior_frozen_aggregate_sha256=${expectedPriorAggregate}\n`);
process.stdout.write("global_lock=absent\n");
process.stdout.write("gate_runtime_receipt_dirs=0\n");
process.stdout.write("author_processes=0\n");
process.stdout.write("T1_REWORK9_REWORK2_CUSTODY_GREEN\n");
