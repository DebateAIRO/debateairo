#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  archiveLockPreservingInodes, snapshotLock
} from "./T1-rework9-rework3-recovery-core.mjs";

const root = new URL(".", import.meta.url);
const read = (name) => readFileSync(new URL(name, root), "utf8");
const recovery = read("T1-rework9-full-gate-recovery.mjs");
const authority = JSON.parse(read("T1-rework9-full-gate-recovery-authority.json"));
const evidence = JSON.parse(read("T1-rework9-full-gate-failure-evidence.json"));
const fail = (code) => { throw new Error(code); };
const requireCondition = (value, code) => { if (!value) fail(code); };
const mode = process.argv[2] ?? "green";
const exactNotRunningPrint = `gui/501/com.debateai.t1gate.controller.ae9f57fb-bff0-49da-b031-bfd4ff2fbe14 = {
\tstate = not running
\tlast exit code = 0
}\n`;
const exitedPrint = exactNotRunningPrint.replace("state = not running", "state = exited");
const oldStoppedMatcher = (stdout) => /state = exited/.test(stdout)
  && /last exit code = 0/.test(stdout) && !/\bpid = \d+/.test(stdout);
const correctedStoppedMatcher = (stdout) =>
  /^[\t ]*state = (?:not running|exited)[\t ]*$/m.test(stdout)
  && /^[\t ]*last exit code = 0[\t ]*$/m.test(stdout)
  && !/^[\t ]*pid = \d+[\t ]*$/m.test(stdout);

if (mode === "correction1-red") {
  requireCondition(authority.labels.controller_required_state
    === "present_exited_last_exit_0_no_pid", "OLD_AUTHORITY_VOCABULARY_MISSING");
  requireCondition(recovery.includes("!/state = exited/.test(result.stdout)"),
    "OLD_STOPPED_MATCHER_MISSING");
  requireCondition(!oldStoppedMatcher(exactNotRunningPrint),
    "OLD_MATCHER_DID_NOT_REJECT_NOT_RUNNING");
  process.stdout.write("EXPECTED_RED exact_state=not_running old_match=false "
    + "exit_code=0 pid_absent=true recovery_not_executed=true\n");
  process.exit(1);
}

if (mode === "correction1-green") {
  requireCondition(authority.labels.controller_required_state
    === "present_not_running_or_exited_last_exit_0_no_pid",
  "CORRECTED_AUTHORITY_VOCABULARY_MISSING");
  requireCondition(recovery.includes("const stoppedControllerState = (stdout) =>")
    && recovery.includes("state = (not running|exited)"),
    "CORRECTED_STOPPED_MATCHER_MISSING");
  requireCondition(correctedStoppedMatcher(exactNotRunningPrint), "NOT_RUNNING_REJECTED");
  requireCondition(correctedStoppedMatcher(exitedPrint), "EXITED_REJECTED");
  requireCondition(!correctedStoppedMatcher(exactNotRunningPrint
    .replace("state = not running", "state = running")), "STATE_MUTATION_NOT_KILLED");
  requireCondition(!correctedStoppedMatcher(exactNotRunningPrint
    .replace("last exit code = 0", "last exit code = 1")), "EXIT_MUTATION_NOT_KILLED");
  requireCondition(!correctedStoppedMatcher(exactNotRunningPrint
    .replace("last exit code = 0", "pid = 77991\n\tlast exit code = 0")),
  "PID_MUTATION_NOT_KILLED");
  process.stdout.write("FULL_GATE_RECOVERY_CORRECTION1_GREEN "
    + "accepted_states=not_running,exited exit_code=0 pid_absent=true "
    + "state_exit_pid_mutations_killed=true recovery_not_executed=true\n");
  process.exit(0);
}

requireCondition(mode === "green", "FIXTURE_MODE_UNKNOWN");

requireCondition(authority.run_id === "ae9f57fb-bff0-49da-b031-bfd4ff2fbe14",
  "AUTHORITY_RUN_ID");
requireCondition(authority.one_time === true
  && authority.grok_recovery_review_required_before_execution === true
  && authority.no_test_worker_controller_viewer_or_new_run_authority === true,
"AUTHORITY_SCOPE");
requireCondition(authority.lock.inode === 47087786 && authority.lock.claim_inode === 47087814
  && authority.lock.claim_sha256 === "d51149eb7036f6c4ccf7557982e13d7860e3efffcbf6439d8aa129b80b939c86",
"AUTHORITY_LOCK_CUSTODY");
requireCondition(authority.receipt_tree_sha256
  === "e88564b645e626c6844b11530665f0c7d425b522b466d7eeec2b6738388545b9"
  && authority.private_tree_sha256
    === "a220d9932e1e9b4a073722a42aa64d70ca6d640cb4096fac956d7797621ea07f",
"AUTHORITY_TREE_CUSTODY");
requireCondition(evidence.ansi_stripped_test_result.source_stdout_sha256
  === "0274f03d85a684ab7486b1107e0f6ceb4316f96bd1d88f0e8d4225c743c8894f"
  && evidence.ansi_stripped_test_result.test_files_passed === 1
  && evidence.ansi_stripped_test_result.tests_passed === 56,
"EVIDENCE_COUNTS");
requireCondition(evidence.custody_hold.false_positive_lines.length === 2,
  "EVIDENCE_FALSE_POSITIVES");

const intentIndex = recovery.indexOf("writeImmutableJson(INTENT_PATH");
const supplementIndex = recovery.indexOf("writeImmutableJson(SUPPLEMENT_PATH");
const archiveIndex = recovery.indexOf("archiveLockPreservingInodes({");
const markerIndex = recovery.indexOf("writeImmutableJson(MARKER_PATH");
requireCondition(intentIndex >= 0 && intentIndex < supplementIndex && supplementIndex < archiveIndex
  && archiveIndex < markerIndex, "RECOVERY_ORDER");
requireCondition(!/\b(?:unlinkSync|rmdirSync|rmSync)\b/.test(recovery), "RECOVERY_DELETION_AUTHORITY");
requireCondition(!/launchctl[^\n]*(?:bootstrap|bootout)/.test(recovery), "RECOVERY_LAUNCHD_MUTATION");
requireCondition(!/writeImmutableJson\([^\n]*(?:terminal|release)\.json/.test(recovery),
  "RECOVERY_NORMAL_TERMINAL_WRITE");
requireCondition(recovery.includes("parseVitestCounts(rawOutput)")
  && recovery.includes("sameJson(postflight.run_owned_descendants, FALSE_POSITIVE_LINES")
  && recovery.includes("workerLabelAbsent()")
  && recovery.includes("HEAVY_PROCESS_PRESENT"), "RECOVERY_REQUIRED_GUARDS");

const isolatedRoot = mkdtempSync(join(tmpdir(), "t1-full-gate-recovery-fixture-"));
try {
  const lock = join(isolatedRoot, "lock");
  const receipt = join(isolatedRoot, "receipt");
  const archive = join(receipt, "archive");
  mkdirSync(lock, { mode: 0o700 });
  mkdirSync(receipt, { mode: 0o700 });
  const claim = join(lock, "claim.json");
  const claimValue = {
    schema_version: 1, run_id: authority.run_id,
    ownership_token_sha256: authority.lock.ownership_token_sha256,
    owner_sha256: authority.lock.owner_sha256,
    lock_device: lstatSync(lock).dev, lock_inode: lstatSync(lock).ino
  };
  writeFileSync(claim, `${JSON.stringify(claimValue, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  chmodSync(claim, 0o600);
  const before = snapshotLock(lock);
  const archived = archiveLockPreservingInodes({ lockPath: lock, archivePath: archive,
    expected: before });
  requireCondition(archived.directory.inode === before.directory.inode
    && archived.claim.inode === before.claim.inode
    && archived.claim.sha256 === before.claim.sha256, "ISOLATED_ARCHIVE_IDENTITY");
  let secondRunKilled = false;
  try {
    archiveLockPreservingInodes({ lockPath: lock, archivePath: archive, expected: before });
  } catch (error) {
    secondRunKilled = /LIVE_LOCK_ABSENT|ARCHIVED_LOCK_ALREADY_EXISTS/.test(String(error));
  }
  requireCondition(secondRunKilled, "ISOLATED_SECOND_RUN_NOT_KILLED");
  const sourceHash = createHash("sha256").update(recovery).digest("hex");
  process.stdout.write(`FULL_GATE_RECOVERY_STATIC_GREEN recovery_sha256=${sourceHash} `
    + `intent_supplement_archive_marker_order=true inode_preserved=true `
    + `second_run_fail_closed=true real_recovery_executed=false\n`);
} finally {
  rmSync(isolatedRoot, { recursive: true, force: true });
}
