#!/Users/vladmihaimiron/.hermes/node/bin/node
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { sha256, shaFile, snapshotLock } from "./T1-rework9-rework3-recovery-core.mjs";

const CWD = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine";
const LOG_ROOT = `${CWD}/docs/missions/2026-08-17-accounts-privacy-security/logs`;
const RUN_ID = "ae9f57fb-bff0-49da-b031-bfd4ff2fbe14";
const RECEIPT = `${LOG_ROOT}/T1-rework9-gate-${RUN_ID}`;
const LOCK = `${LOG_ROOT}/.T1-full-registration.exclusive.lock`;
const PRIVATE = `/var/folders/h7/4hdbz7s15hjbyj6scmk_nx3r0000gn/T/debateai-t1gate-${RUN_ID}`;
const PACKET = `${LOG_ROOT}/T1-rework9-execution-${RUN_ID}.json`;
const OWNER = `${RECEIPT}/owner.json`;
const AUTHORITY = `${LOG_ROOT}/T1-rework9-full-gate-recovery-authority.json`;
const EXPECTED_HEAD = "7918f4f8bff33909792afc01dc38d402972b4ccd";
const EXPECTED_RECEIPT_TREE = "e88564b645e626c6844b11530665f0c7d425b522b466d7eeec2b6738388545b9";
const EXPECTED_PRIVATE_TREE = "a220d9932e1e9b4a073722a42aa64d70ca6d640cb4096fac956d7797621ea07f";
const EXPECTED_RECEIPT_NAMES = Object.freeze([
  "controller-epoch-1.json", "controller.plist", "controller.stderr.log",
  "controller.stdout.log", "custody-hold.json", "events.jsonl", "heartbeat.json",
  "launchd-post-epoch-1.txt", "launchd-pre.txt", "launchd-streams.json",
  "launchd-worker-pre.txt", "owner.json", "postflight-epoch-1.json",
  "preflight-worker.json", "preflight.json", "process-post-epoch-1.txt",
  "process-pre.txt", "process-worker-pre.txt", "test.stderr.log", "test.stdout.log",
  "viewer.ready.json", "worker-bootstrap-requested.json", "worker-terminal.json",
  "worker.plist", "worker.stderr.log", "worker.stdout.log"
]);
const EXPECTED_SOURCE_HASHES = Object.freeze({
  "T1-rework9-gate-launcher.mjs": "38378f4e9a28146197f55e00bcc83b0aa5931c69613f3098a145c26bfee96c7a",
  "T1-rework9-gate-controller.mjs": "dfefc008b8c8c44bf076df283710e7a15344de9f26a9eb31e601cf0d4a957449",
  "T1-rework9-gate-worker.mjs": "01311020a6d294ef4adf493044de38cfc1d17234005556d262f492767adcf6e4",
  "T1-rework9-supervisor-parsers.mjs": "ea00acb85d0723f87dc3f156814e143fc0167e1520984587026c58b7134c29f5",
  "T1-rework9-full-gate-static-fixture.mjs": "8e040dff398f791f68e3ad5aff288ca71c92303639dfec1be174c037cb8c0544",
  "T1-rework9-full-gate-recovery.mjs": "30decab681b96f3a2fa8e3b0acc0ff0ed37a5fb13bbe08535260621fb34deac5",
  "T1-rework9-full-gate-recovery-authority.json": "44a9a30121c2669ac5a1be1ac4e06ec5af764f88d881577edf9fa263e44c265b",
  "T1-rework9-full-gate-failure-evidence.json": "f2600cd89776a356fa222b2a6b24c9420905ff0b959b9ae65194edd4939b6079",
  "T1-rework9-full-gate-recovery-static-fixture.mjs": "4a625b6290b8db97fce9c5ea2a57c6f73d3152ac7a2982290db203e408706a9b",
  "T1-rework9-gate-contract.md": "8caf1baa66f781125fe6151b95f71bc883fe61d560141b24e148545ed8515d8f",
  "T1-rework9-static-supervisor-check.sh": "abe6292d3e7c833c4f851ce1c1b15e5706c469c61f0961b403159bc20ae2ca0e"
});
const RECOVERY_NAMES = Object.freeze([
  "full-gate-custody-recovery-intent.json", "vitest-counts-supplement.json",
  "full-gate-custody-recovery.json", "full-gate-custody-archived-lock",
  "terminal.json", "release.json"
]);

const fail = (code) => { throw new Error(code); };
const same = (actual, expected, name) => {
  if (actual !== expected) fail(`CUSTODY_MISMATCH:${name}:${actual}`);
};
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const runGit = (args) => {
  const result = spawnSync("/usr/bin/git", ["-C", CWD, ...args], { encoding: "utf8" });
  if (result.error !== undefined || result.signal !== null || result.status !== 0
    || result.stderr !== "") fail(`GIT_CUSTODY_UNKNOWN:${args.join(":")}`);
  return result.stdout;
};
const statRecord = (stats) => ({
  device: stats.dev, inode: stats.ino, mode: stats.mode & 0o777, uid: stats.uid,
  gid: stats.gid, size: stats.size, mtime_ms: stats.mtimeMs
});
const walk = (root, current = root, entries = []) => {
  for (const name of readdirSync(current).sort()) {
    const path = join(current, name);
    const stats = lstatSync(path);
    if (stats.isSymbolicLink() || (!stats.isFile() && !stats.isDirectory())) {
      fail(`TREE_ENTRY_INVALID:${path}`);
    }
    const entry = { relative_path: relative(root, path),
      type: stats.isDirectory() ? "directory" : "file", ...statRecord(stats) };
    if (stats.isFile()) entry.sha256 = shaFile(path);
    entries.push(entry);
    if (stats.isDirectory()) walk(root, path, entries);
  }
  return entries;
};
const treeHash = (path) => sha256(JSON.stringify(walk(path)));

same(runGit(["rev-parse", "HEAD"]).trim(), EXPECTED_HEAD, "head");
same(runGit(["diff", "--cached", "--name-only"]), "", "staged_index");
const packet = readJson(PACKET);
const owner = readJson(OWNER);
same(packet.run_id, RUN_ID, "packet.run_id");
same(owner.run_id, RUN_ID, "owner.run_id");
same(packet.head, EXPECTED_HEAD, "packet.head");
same(owner.head, EXPECTED_HEAD, "owner.head");
same(packet.governed.length, 12, "packet.governed_count");
same(JSON.stringify(owner.governed), JSON.stringify(packet.governed), "owner.governed");
for (const expected of packet.governed) {
  const path = join(CWD, expected.path);
  const stats = lstatSync(path);
  same(stats.isFile() && !stats.isSymbolicLink(), true, `${expected.path}.type`);
  same(shaFile(path), expected.sha256, `${expected.path}.sha256`);
  same(stats.size, expected.size, `${expected.path}.size`);
  same(stats.mtimeMs, expected.mtime_ms, `${expected.path}.mtime_ms`);
}

const lock = snapshotLock(LOCK);
same(lock.directory.device, 16777233, "lock.device");
same(lock.directory.inode, 47087786, "lock.inode");
same(lock.claim.inode, 47087814, "claim.inode");
same(lock.claim.sha256, "d51149eb7036f6c4ccf7557982e13d7860e3efffcbf6439d8aa129b80b939c86",
  "claim.sha256");
same(shaFile(OWNER), "679d3eba35373659e34c847b7ea652d995a0048eefbabe9c4c7e2387a575c6f0",
  "owner.sha256");
same(JSON.stringify(readdirSync(RECEIPT).sort()), JSON.stringify(EXPECTED_RECEIPT_NAMES),
  "receipt.names");
same(lstatSync(RECEIPT).ino, 47087787, "receipt.inode");
same(lstatSync(PRIVATE).ino, 47087788, "private.inode");
same(treeHash(RECEIPT), EXPECTED_RECEIPT_TREE, "receipt.tree");
same(treeHash(PRIVATE), EXPECTED_PRIVATE_TREE, "private.tree");
for (const name of RECOVERY_NAMES) same(existsSync(join(RECEIPT, name)), false, `absent.${name}`);

const authority = readJson(AUTHORITY);
same(authority.run_id, RUN_ID, "authority.run_id");
same(authority.grok_recovery_review_required_before_execution, true, "authority.grok_review");
same(authority.no_test_worker_controller_viewer_or_new_run_authority, true,
  "authority.no_execution");
same(authority.labels.controller_required_state,
  "present_not_running_or_exited_last_exit_0_no_pid", "authority.controller_state");
same((lstatSync(AUTHORITY).mode & 0o222), 0, "authority.immutable_mode");
for (const [name, expected] of Object.entries(EXPECTED_SOURCE_HASHES)) {
  same(shaFile(join(LOG_ROOT, name)), expected, `source.${name}`);
}

process.stdout.write(
  `FULL_GATE_CUSTODY_GREEN head=${EXPECTED_HEAD} staged=0 governed=12 `
  + `lock=16777233:47087786 claim_inode=47087814 receipt_tree=${EXPECTED_RECEIPT_TREE} `
  + `private_tree=${EXPECTED_PRIVATE_TREE} recovery_executed=false\n`
);
