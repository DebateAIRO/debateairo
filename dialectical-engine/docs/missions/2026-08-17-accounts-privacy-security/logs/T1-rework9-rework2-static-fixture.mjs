#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const logRoot = "docs/missions/2026-08-17-accounts-privacy-security/logs";
const launcherPath = `${logRoot}/T1-rework9-gate-launcher.mjs`;
const launcher = readFileSync(launcherPath, "utf8");
const controllerTemplate = readFileSync(`${logRoot}/T1-rework9-gate-controller.plist.template`,
  "utf8");
const workerTemplate = readFileSync(`${logRoot}/T1-rework9-gate-worker.plist.template`, "utf8");
const cwd = process.cwd();
const absoluteLogRoot = join(cwd, logRoot);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const xml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;").replaceAll("\"", "&quot;").replaceAll("'", "&apos;");
const render = (template, replacements) => {
  let rendered = template;
  for (const [placeholder, value] of Object.entries(replacements)) {
    rendered = rendered.replaceAll(`__${placeholder}__`, xml(value));
  }
  if (/__[A-Z_]+__/.test(rendered)) throw new Error("FIXTURE_PLACEHOLDER_REMAINS");
  return rendered;
};
const hashesFor = (runId, runTmpdir) => {
  const receiptDir = join(absoluteLogRoot, `T1-rework9-gate-${runId}`);
  const executionPacket = join(absoluteLogRoot, `T1-rework9-execution-${runId}.json`);
  const common = {
    NODE: process.execPath,
    RECEIPT_DIR: receiptDir,
    EXECUTION_PACKET: executionPacket,
    SECRET_FILE: join(runTmpdir, "controller-custody.secret"),
    CWD: cwd,
    TMPDIR: runTmpdir,
    RUN_ID: runId
  };
  return Object.freeze({
    controller: sha256(render(controllerTemplate, {
      ...common,
      CONTROLLER_LABEL: `com.debateai.t1gate.controller.${runId}`,
      CONTROLLER: join(absoluteLogRoot, "T1-rework9-gate-controller.mjs"),
      CONTROLLER_STDOUT: join(runTmpdir, "controller.stdout.log"),
      CONTROLLER_STDERR: join(runTmpdir, "controller.stderr.log")
    })),
    worker: sha256(render(workerTemplate, {
      ...common,
      WORKER_LABEL: `com.debateai.t1gate.worker.${runId}`,
      WORKER: join(absoluteLogRoot, "T1-rework9-gate-worker.mjs"),
      WORKER_STDOUT: join(runTmpdir, "worker.stdout.log"),
      WORKER_STDERR: join(runTmpdir, "worker.stderr.log")
    }))
  });
};

const runA = "11111111-1111-4111-8111-111111111111";
const runB = "22222222-2222-4222-8222-222222222222";
const unpredictableA = join(tmpdir(), `debateai-t1gate-${runA}-AAAAAA`);
const unpredictableB = join(tmpdir(), `debateai-t1gate-${runA}-BBBBBB`);
const suffixA = hashesFor(runA, unpredictableA);
const suffixB = hashesFor(runA, unpredictableB);
const currentIsUnpredictable = launcher.includes(
  "mkdtempSync(join(tmpdir(), `debateai-t1gate-${runId}-`))");
if (currentIsUnpredictable) {
  process.stderr.write(`TMPDIR_PLIST_PRECOMPUTE_RED suffix_a_controller=${suffixA.controller} suffix_b_controller=${suffixB.controller} suffix_a_worker=${suffixA.worker} suffix_b_worker=${suffixB.worker} packet_a_binds_launcher_b=${suffixA.controller === suffixB.controller && suffixA.worker === suffixB.worker}\n`);
  process.exit(1);
}

const requiredTokens = [
  "const runTmpdir = join(tmpdir(), `debateai-t1gate-${runId}`)",
  "mkdirSync(runTmpdir, { mode: 0o700 })",
  "lstatSync(runTmpdir)",
  "runTmpdirStat.isSymbolicLink()",
  "realpathSync(runTmpdir)",
  "runTmpdirStat.uid !== process.getuid()",
  "runTmpdirStat.gid !== process.getgid()",
  "(runTmpdirStat.mode & 0o777) !== 0o700",
  "NODE: process.execPath, RECEIPT_DIR: receiptDir, EXECUTION_PACKET: executionPacketPath",
  "SECRET_FILE: secretPath, CWD: cwd, TMPDIR: runTmpdir, RUN_ID: runId",
  "for (const stream of Object.values(launchdStreamPaths))",
  "launchd_streams: launchdStreams",
  "renderedPlists.controller.sha256 !== packet.rendered_plist_sha256.controller",
  "renderedPlists.worker.sha256 !== packet.rendered_plist_sha256.worker",
  "lock_retained: true",
  "RENDERED_PLIST_HASH_MISMATCH"
];
const missing = requiredTokens.filter((token) => !launcher.includes(token));
const lockIndex = launcher.indexOf("mkdirSync(lockPath, { mode: 0o700 })");
const privateIndex = launcher.indexOf("mkdirSync(runTmpdir, { mode: 0o700 })");
const deterministicA = join(tmpdir(), `debateai-t1gate-${runA}`);
const deterministicB = join(tmpdir(), `debateai-t1gate-${runB}`);
const routerA = hashesFor(runA, deterministicA);
const launcherA = hashesFor(runA, deterministicA);
const routerB = hashesFor(runB, deterministicB);
const precomputable = routerA.controller === launcherA.controller
  && routerA.worker === launcherA.worker;
const distinctRuns = deterministicA !== deterministicB
  && routerA.controller !== routerB.controller && routerA.worker !== routerB.worker;

const fixtureRoot = mkdtempSync(join(tmpdir(), "t1-rework9-rework2-fixture-"));
let preexistingFailedClosed = false;
try {
  const probe = join(fixtureRoot, `debateai-t1gate-${runA}`);
  mkdirSync(probe, { mode: 0o700 });
  const stats = lstatSync(probe);
  if (!stats.isDirectory() || stats.isSymbolicLink() || (stats.mode & 0o777) !== 0o700
    || stats.uid !== process.getuid() || stats.gid !== process.getgid()
    || realpathSync(probe) !== join(realpathSync(fixtureRoot), `debateai-t1gate-${runA}`)) {
    throw new Error("FIXTURE_PRIVATE_DIRECTORY_INVALID");
  }
  try {
    mkdirSync(probe, { mode: 0o700 });
  } catch (error) {
    preexistingFailedClosed = error?.code === "EEXIST";
  }
} finally {
  rmSync(fixtureRoot, { recursive: true });
}

if (missing.length > 0 || lockIndex < 0 || privateIndex <= lockIndex || !precomputable
  || !distinctRuns || !preexistingFailedClosed) {
  process.stderr.write(`TMPDIR_PLIST_PRECOMPUTE_INVALID missing=${missing.join(",")} lock_before_private=${privateIndex > lockIndex} precomputable=${precomputable} distinct_runs=${distinctRuns} preexisting_failed_closed=${preexistingFailedClosed}\n`);
  process.exit(1);
}
process.stdout.write(`TMPDIR_PLIST_PRECOMPUTE_GREEN run_a_path=${deterministicA} run_a_controller=${routerA.controller} run_a_worker=${routerA.worker} run_b_path=${deterministicB} run_b_controller=${routerB.controller} run_b_worker=${routerB.worker} preexisting_failed_closed=true\n`);
