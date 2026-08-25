#!/Users/vladmihaimiron/.hermes/node/bin/node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const RUN_ID = "7821bdb5-0559-43f4-804e-6996bb9f18a4";
const CWD = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine";
const LOG_ROOT = join(CWD, "docs/missions/2026-08-17-accounts-privacy-security/logs");
const RECEIPT = join(LOG_ROOT, `T1-rework9-gate-${RUN_ID}`);
const LOCK = join(LOG_ROOT, ".T1-full-registration.exclusive.lock");
const PRIVATE = "/var/folders/h7/4hdbz7s15hjbyj6scmk_nx3r0000gn/T/debateai-t1gate-7821bdb5-0559-43f4-804e-6996bb9f18a4";
const AUTHORITY = join(LOG_ROOT, "T1-rework9-rework7-interrupted-authority.json");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const shaFile = (path) => sha(readFileSync(path));
const tuple = (path, logicalPath = path) => {
  const stats = lstatSync(path);
  if (!stats.isFile() || stats.isSymbolicLink()) throw new Error(`NOT_REGULAR:${path}`);
  return Object.freeze({ path: logicalPath, sha256: shaFile(path), size: stats.size,
    mtime_ms: stats.mtimeMs });
};
const exact = (condition, code) => { if (!condition) throw new Error(code); };
const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: CWD, encoding: "utf8" });
  exact(result.error === undefined && result.signal === null && result.status === 0,
    `COMMAND_FAILED:${command}`);
  return result.stdout;
};
const packetPath = join(LOG_ROOT, `T1-rework9-execution-${RUN_ID}.json`);
const packet = JSON.parse(readFileSync(packetPath, "utf8"));
const owner = JSON.parse(readFileSync(join(RECEIPT, "owner.json"), "utf8"));
const authority = JSON.parse(readFileSync(AUTHORITY, "utf8"));
const head = run("/usr/bin/git", ["rev-parse", "HEAD"]).trim();
const staged = run("/usr/bin/git", ["diff", "--cached", "--name-only"])
  .split("\n").filter(Boolean);
exact(head === "7918f4f8bff33909792afc01dc38d402972b4ccd", "HEAD_MISMATCH");
exact(staged.length === 0, "STAGED_INDEX_NOT_EMPTY");
exact(packet.governed.length === 12 && JSON.stringify(packet.governed) === JSON.stringify(owner.governed),
  "GOVERNED_BINDING_MISMATCH");
const governed = packet.governed.map((expected) => {
  const actual = tuple(resolve(CWD, expected.path), expected.path);
  exact(JSON.stringify(actual) === JSON.stringify(expected), `GOVERNED_MISMATCH:${expected.path}`);
  return actual;
});
const lockStat = lstatSync(LOCK);
const claimPath = join(LOCK, "claim.json");
const claimStat = lstatSync(claimPath);
exact(lockStat.isDirectory() && !lockStat.isSymbolicLink() && (lockStat.mode & 0o777) === 0o700,
  "LOCK_CUSTODY_MISMATCH");
exact(lockStat.dev === 16777233 && lockStat.ino === 46782057, "LOCK_IDENTITY_MISMATCH");
exact(claimStat.ino === 46782073
  && shaFile(claimPath) === "bac88b8943d2f8ce0ec080cf2bb916ae431221dea175599d02066d0e8efd6545",
  "CLAIM_IDENTITY_MISMATCH");
exact(shaFile(join(RECEIPT, "owner.json"))
  === "953f0998fedb9b048069604270745855b80e179df0bcaff0a907261d76c12017",
"OWNER_MISMATCH");
exact(shaFile(join(RECEIPT, "worker-terminal.json"))
  === "f23e6713d6a1395b58bdb9cd89b8d673f1cb2d7449dc1c3bc49a87ce5ea4b235",
"WORKER_TERMINAL_MISMATCH");
exact(shaFile(join(RECEIPT, "launchd-streams.json"))
  === "ceb690e87382dc8bab6d1e817c0de4e132fc6fd5161a6b71f379799f0a899a88",
"LAUNCHD_STREAMS_MISMATCH");
exact(shaFile(join(RECEIPT, "events.jsonl"))
  === "eab48117b99158efc313d08d352088069451dacd841214448e6a372a58303e15",
"EVENTS_MISMATCH");
exact(JSON.stringify(readdirSync(PRIVATE).sort())
  === JSON.stringify(authority.private_runtime.entry_names), "PRIVATE_ENTRIES_MISMATCH");
for (const [name, expected] of Object.entries(authority.private_runtime.entries)) {
  exact(JSON.stringify(tuple(join(PRIVATE, name))) === JSON.stringify(expected),
    `PRIVATE_TUPLE_MISMATCH:${name}`);
}
for (const name of ["postflight.json", "test.status", "terminal.json", "release.json",
  "custody-hold.json", "launcher-abort.json", "interrupted-rework7-recovery-intent.json",
  "interrupted-rework7-recovery.json", "interrupted-rework7-archived-lock"]) {
  exact(!existsSync(join(RECEIPT, name)), `UNEXPECTED_ARTIFACT:${name}`);
}
for (const [name, binding] of Object.entries({
  launcher: { path: join(LOG_ROOT, "T1-rework9-gate-launcher.mjs") },
  controller: { path: join(LOG_ROOT, "T1-rework9-gate-controller.mjs") },
  worker: { path: join(LOG_ROOT, "T1-rework9-gate-worker.mjs") },
  viewer: { path: join(LOG_ROOT, "T1-rework9-gate-viewer.mjs") },
  controller_plist_template: { path: join(LOG_ROOT, "T1-rework9-gate-controller.plist.template") },
  worker_plist_template: { path: join(LOG_ROOT, "T1-rework9-gate-worker.plist.template") },
  launchd_stream_custody: { path: join(LOG_ROOT, "T1-rework9-launchd-stream-custody.mjs") },
  rework7_fixture: { path: join(LOG_ROOT, "T1-rework9-rework7-static-fixture.mjs") },
  recovery_tool: authority.recovery_tool,
  recovery_authority: { path: AUTHORITY },
  failure_evidence: authority.failure_evidence,
  contract: { path: join(LOG_ROOT, "T1-rework9-gate-contract.md") },
  aggregate_static_check: { path: join(LOG_ROOT, "T1-rework9-static-supervisor-check.sh") }
})) {
  binding.tuple = tuple(binding.path);
}
const artifacts = [
  "T1-rework9-gate-launcher.mjs", "T1-rework9-gate-controller.mjs",
  "T1-rework9-gate-worker.mjs", "T1-rework9-gate-viewer.mjs",
  "T1-rework9-gate-controller.plist.template", "T1-rework9-gate-worker.plist.template",
  "T1-rework9-launchd-stream-custody.mjs", "T1-rework9-rework7-static-fixture.mjs",
  "T1-rework9-rework7-interrupted-recovery.mjs",
  "T1-rework9-rework7-interrupted-authority.json",
  "T1-rework9-rework7-interrupted-failure-evidence.json",
  "T1-rework9-gate-contract.md", "T1-rework9-static-supervisor-check.sh"
].map((name) => tuple(join(LOG_ROOT, name)));
process.stdout.write(`${JSON.stringify({ head, staged_path_count: staged.length, governed,
  preserved_lock: { device: lockStat.dev, inode: lockStat.ino, claim_inode: claimStat.ino,
    claim_sha256: shaFile(claimPath) }, receipt: {
    owner_sha256: shaFile(join(RECEIPT, "owner.json")),
    worker_terminal_sha256: shaFile(join(RECEIPT, "worker-terminal.json")),
    launchd_streams_sha256: shaFile(join(RECEIPT, "launchd-streams.json")),
    events_sha256: shaFile(join(RECEIPT, "events.jsonl")) },
  recovery_artifacts: "absent_not_executed", artifacts }, null, 2)}\n`);
process.stdout.write("REWORK7_FINAL_CUSTODY_GREEN\n");
