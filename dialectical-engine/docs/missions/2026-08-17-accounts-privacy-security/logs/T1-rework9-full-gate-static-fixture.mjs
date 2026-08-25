#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const mode = process.argv[2];
if (!new Set(["red", "green"]).has(mode)) {
  process.stderr.write("fixture requires red or green\n");
  process.exit(64);
}

const RUN_ID = "ae9f57fb-bff0-49da-b031-bfd4ff2fbe14";
const CONTROLLER_PID = 77991;
const EXPECTED_STDOUT_SHA256 = "0274f03d85a684ab7486b1107e0f6ceb4316f96bd1d88f0e8d4225c743c8894f";
const root = dirname(fileURLToPath(import.meta.url));
const receiptDir = join(root, `T1-rework9-gate-${RUN_ID}`);
const owner = JSON.parse(readFileSync(join(receiptDir, "owner.json"), "utf8"));
const postflight = JSON.parse(readFileSync(join(receiptDir, "postflight-epoch-1.json"), "utf8"));
const stdoutBytes = readFileSync(join(receiptDir, "test.stdout.log"));
const stdoutText = stdoutBytes.toString("utf8");
const controllerSource = readFileSync(join(root, "T1-rework9-gate-controller.mjs"), "utf8");
const workerSource = readFileSync(join(root, "T1-rework9-gate-worker.mjs"), "utf8");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const requireCondition = (condition, code) => {
  if (!condition) throw new Error(code);
};

requireCondition(sha256(stdoutBytes) === EXPECTED_STDOUT_SHA256, "STDOUT_HASH_MISMATCH");
requireCondition(postflight.run_owned_descendants.length === 2, "FALSE_POSITIVE_LINE_COUNT_MISMATCH");
const [controllerLine, observerLine] = postflight.run_owned_descendants;
requireCondition(controllerLine.startsWith(`${CONTROLLER_PID} `), "CONTROLLER_NOT_AT_COLUMN_ZERO");
requireCondition(observerLine.includes("/bin/zsh -lc sleep 50;"), "OBSERVER_LINE_MISMATCH");

const oldAllowedRunLine = (line) => line.includes(` ${CONTROLLER_PID} `)
  || line.includes(owner.static_artifacts.viewer.path)
  || (line.includes("/usr/bin/tail") && line.includes(receiptDir));
const oldRunOwned = postflight.run_owned_descendants.filter((line) =>
  (line.includes(RUN_ID) || line.includes(owner.tmpdir)) && !oldAllowedRunLine(line));
const oldFileMatch = /Test Files\s+(\d+) passed \((\d+)\)/.exec(stdoutText);
const oldTestMatch = /Tests\s+(\d+) passed(?:\s+\|\s+(\d+) skipped)? \((\d+)\)/.exec(stdoutText);

if (mode === "red") {
  requireCondition(controllerSource.includes("line.includes(owner.run_id)"),
    "OLD_UUID_SUBSTRING_PREDICATE_NOT_PRESENT");
  requireCondition(workerSource.includes("const fileMatch = /Test Files\\s+"),
    "OLD_RAW_VITEST_REGEX_NOT_PRESENT");
  requireCondition(oldRunOwned.length === 2, "OLD_OWNERSHIP_BUG_NOT_REPRODUCED");
  requireCondition(oldFileMatch === null && oldTestMatch === null,
    "OLD_ANSI_PARSE_BUG_NOT_REPRODUCED");
  process.stdout.write(`EXPECTED_RED ownership_false_positives=${oldRunOwned.length} `
    + `controller_column_zero=true observer_uuid_path_only=true raw_counts=null `
    + `stdout_sha256=${EXPECTED_STDOUT_SHA256}\n`);
  process.exitCode = 1;
} else {
  const helperPath = join(root, "T1-rework9-supervisor-parsers.mjs");
  const { classifyPostflightProcesses, parseVitestCounts, stripAnsi } =
    await import(pathToFileURL(helperPath).href);
  requireCondition(!controllerSource.includes("line.includes(owner.run_id)"),
    "GLOBAL_UUID_SUBSTRING_PREDICATE_REMAINS");
  requireCondition(controllerSource.includes("classifyPostflightProcesses"),
    "CONTROLLER_SHARED_CLASSIFIER_MISSING");
  requireCondition(workerSource.includes("parseVitestCounts(output)"),
    "WORKER_ANSI_SAFE_PARSE_MISSING");

  const controllerArgv = [owner.test_runtime.path, owner.static_artifacts.controller.path,
    receiptDir, owner.execution_packet.path, join(owner.tmpdir, "controller-custody.secret")];
  const viewerArgv = [owner.test_runtime.path, owner.static_artifacts.viewer.path,
    receiptDir, join(owner.tmpdir, "viewer-challenge")];
  const workerArgv = [owner.test_runtime.path, owner.static_artifacts.worker.path,
    receiptDir, owner.execution_packet.path, join(owner.tmpdir, "controller-custody.secret")];
  const launcherArgv = [owner.test_runtime.path, owner.static_artifacts.launcher.path,
    owner.execution_packet.path];
  const exactEvidence = `${controllerLine}\n${observerLine}\n`;
  const exactClassification = classifyPostflightProcesses({
    snapshot: exactEvidence,
    controller: { pid: CONTROLLER_PID, argv: controllerArgv },
    ownedIdentityArgv: [launcherArgv, workerArgv, owner.argv],
    viewerIdentityArgv: [viewerArgv],
    receiptDir
  });
  requireCondition(exactClassification.run_owned_descendant_lines.length === 0,
    "EXACT_FALSE_POSITIVES_REMAIN");
  requireCondition(exactClassification.controller_line === controllerLine,
    "COLUMN_ZERO_CONTROLLER_NOT_IDENTIFIED");

  const viewerLine = `88001 1 Sun Aug 23 00:30:00 2026     ${viewerArgv.join(" ")}`;
  const tailLine = `88002 88001 Sun Aug 23 00:30:01 2026     /usr/bin/tail -n +1 -F ${receiptDir}/test.stdout.log`;
  const workerLine = `88003 ${CONTROLLER_PID} Sun Aug 23 00:30:02 2026     ${workerArgv.join(" ")}`;
  const testLine = `88004 88003 Sun Aug 23 00:30:03 2026     ${owner.argv.join(" ")}`;
  const postgresLine = "88005 88004 Sun Aug 23 00:30:04 2026     /usr/local/bin/postgres: checkpointer";
  const positiveControl = classifyPostflightProcesses({
    snapshot: [controllerLine, observerLine, viewerLine, tailLine, workerLine, testLine,
      postgresLine].join("\n") + "\n",
    controller: { pid: CONTROLLER_PID, argv: controllerArgv },
    ownedIdentityArgv: [launcherArgv, workerArgv, owner.argv],
    viewerIdentityArgv: [viewerArgv],
    receiptDir
  });
  requireCondition(JSON.stringify(positiveControl.run_owned_descendant_lines)
    === JSON.stringify([workerLine, testLine, postgresLine]),
  "IDENTITY_ANCESTRY_POSITIVE_CONTROL_FAILED");
  requireCondition(positiveControl.display_only_lines.includes(viewerLine)
    && positiveControl.display_only_lines.includes(tailLine), "VIEWER_TAIL_EXEMPTIONS_LOST");

  let wrongControllerKilled = false;
  try {
    classifyPostflightProcesses({
      snapshot: exactEvidence,
      controller: { pid: CONTROLLER_PID + 1, argv: controllerArgv },
      ownedIdentityArgv: [launcherArgv, workerArgv, owner.argv],
      viewerIdentityArgv: [viewerArgv],
      receiptDir
    });
  } catch (error) {
    wrongControllerKilled = String(error).includes("CONTROLLER_PROCESS_IDENTITY_MISMATCH");
  }
  requireCondition(wrongControllerKilled, "CONTROLLER_PID_MUTATION_NOT_KILLED");

  const parsed = parseVitestCounts(stdoutText);
  requireCondition(JSON.stringify(parsed) === JSON.stringify({
    test_files_passed: 1, test_files_total: 1, tests_passed: 56,
    tests_skipped: 0, tests_total: 56
  }), "ANSI_STRIPPED_COUNTS_MISMATCH");
  requireCondition(!stripAnsi(stdoutText).includes("\u001b["), "ANSI_REMAINS_AFTER_STRIP");
  const countMutation = parseVitestCounts(stripAnsi(stdoutText)
    .replace("Tests  56 passed (56)", "Tests  55 passed (56)"));
  requireCondition(countMutation.tests_passed === 55 && countMutation.tests_total === 56,
    "COUNT_MUTATION_NOT_OBSERVED");
  process.stdout.write(`FULL_GATE_GREEN ownership_false_positives=0 `
    + `identity_ancestry_positive_controls=3 viewer_tail_exempt=true `
    + `ansi_counts=1/1,56/56 stdout_sha256=${EXPECTED_STDOUT_SHA256}\n`);
}
