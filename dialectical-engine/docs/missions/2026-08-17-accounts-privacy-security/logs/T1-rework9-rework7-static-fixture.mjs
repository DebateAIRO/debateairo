#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync, constants, fsyncSync, mkdirSync, mkdtempSync, openSync, readFileSync,
  realpathSync, rmSync, statSync, writeFileSync, writeSync
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const self = fileURLToPath(import.meta.url);
const launcherPath = join(here, "T1-rework9-gate-launcher.mjs");
const controllerPath = join(here, "T1-rework9-gate-controller.mjs");
const workerPath = join(here, "T1-rework9-gate-worker.mjs");
const helperPath = join(here, "T1-rework9-launchd-stream-custody.mjs");
const recoveryPath = join(here, "T1-rework9-rework7-interrupted-recovery.mjs");
const authorityPath = join(here, "T1-rework9-rework7-interrupted-authority.json");
const evidencePath = join(here, "T1-rework9-rework7-interrupted-failure-evidence.json");
const incidentPacketPath = join(here,
  "T1-rework9-execution-7821bdb5-0559-43f4-804e-6996bb9f18a4.json");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const shaFile = (path) => sha256(readFileSync(path));

const writeDurable = (path, bytes) => {
  writeFileSync(path, bytes, { mode: 0o600, flag: "wx" });
  const fd = openSync(path, constants.O_RDONLY);
  try { fsyncSync(fd); } finally { closeSync(fd); }
};

const childMain = async (mode, root) => {
  const privateDir = realpathSync(join(root, "private"));
  const receiptDir = realpathSync(join(root, "receipt"));
  const workerStdout = join(privateDir, "worker.stdout.log");
  const workerStderr = join(privateDir, "worker.stderr.log");
  writeDurable(workerStdout, Buffer.from("worker-out\n"));
  writeDurable(workerStderr, Buffer.from("worker-err\n"));
  writeSync(1, Buffer.from("controller-out\n"));
  writeSync(2, Buffer.from("controller-err\n"));
  fsyncSync(1);
  fsyncSync(2);
  if (mode === "old-close") {
    closeSync(1);
    closeSync(2);
    // The controller next performs synchronous custody subprocesses. Node's
    // redirected stdio handles remain live while their raw fds are closed;
    // the following spawn reproduces the observed libuv assertion/SIGABRT.
    spawnSync("/usr/bin/git", ["--version"], { encoding: "utf8" });
    writeDurable(join(root, "old-close-returned"), Buffer.from("returned\n"));
    process.exitCode = 0;
    return;
  }
  if (mode !== "stable-open") throw new Error("UNKNOWN_CHILD_MODE");
  const helper = await import(`${new URL(`file://${helperPath}`).href}?fixture=${process.pid}`);
  if (typeof helper.verifySealedLaunchdStreams !== "function") {
    throw new Error("VERIFY_SEALED_STREAMS_EXPORT_MISSING");
  }
  const plan = helper.expectedLaunchdStreamPlan(receiptDir, privateDir);
  const streams = helper.sealLaunchdStreams({ plan, receiptDir, runTmpdir: privateDir });
  const launchdStreams = Object.freeze({ schema_version: 1, run_id: "fixture", complete: true,
    streams });
  const launchdStreamsPath = join(receiptDir, "launchd-streams.json");
  writeDurable(launchdStreamsPath, Buffer.from(`${JSON.stringify(launchdStreams, null, 2)}\n`));
  helper.verifySealedLaunchdStreams({ receipt: launchdStreams, plan, receiptDir,
    runTmpdir: privateDir });
  const launchdStreamsSha256 = shaFile(launchdStreamsPath);
  const terminalPath = join(receiptDir, "terminal.json");
  writeDurable(terminalPath, Buffer.from(`${JSON.stringify({ schema_version: 1,
    sequence: 2, launchd_streams_sha256: launchdStreamsSha256 })}\n`));
  helper.verifySealedLaunchdStreams({ receipt: launchdStreams, plan, receiptDir,
    runTmpdir: privateDir });
  writeDurable(join(receiptDir, "release.json"), Buffer.from(`${JSON.stringify({ schema_version: 1,
    sequence: 3, launchd_streams_sha256: launchdStreamsSha256,
    terminal_sha256: shaFile(terminalPath) })}\n`));
  helper.verifySealedLaunchdStreams({ receipt: launchdStreams, plan, receiptDir,
    runTmpdir: privateDir });
  process.exitCode = 0;
};

if (process.argv[2] === "__child") {
  await childMain(process.argv[3], process.argv[4]);
} else {
  const mode = process.argv[2] ?? "green";
  const root = mkdtempSync(join(tmpdir(), "t1-rework9-rework7-fixture-"));
  try {
    const runChild = (childMode, suffix) => {
      const childRoot = join(root, suffix);
      const privateDir = join(childRoot, "private");
      const receiptDir = join(childRoot, "receipt");
      mkdirSync(childRoot, { mode: 0o700 });
      mkdirSync(privateDir, { mode: 0o700 });
      mkdirSync(receiptDir, { mode: 0o700 });
      const stdoutPath = join(privateDir, "controller.stdout.log");
      const stderrPath = join(privateDir, "controller.stderr.log");
      const stdoutFd = openSync(stdoutPath,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
      const stderrFd = openSync(stderrPath,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
      let result;
      try {
        result = spawnSync(process.execPath, [self, "__child", childMode, childRoot], {
          cwd: here, env: { ...process.env }, detached: false,
          stdio: ["ignore", stdoutFd, stderrFd]
        });
      } finally {
        closeSync(stdoutFd);
        closeSync(stderrFd);
      }
      return { childRoot, privateDir, receiptDir, result };
    };

    const old = runChild("old-close", "old");
    const oldCrashed = old.result.signal === "SIGABRT"
      || (Number.isInteger(old.result.status) && old.result.status !== 0);
    if (!oldCrashed) throw new Error(`OLD_CLOSE_DID_NOT_CRASH:${JSON.stringify(old.result)}`);

    const launcher = readFileSync(launcherPath, "utf8");
    const controller = readFileSync(controllerPath, "utf8");
    const worker = readFileSync(workerPath, "utf8");
    const incidentPacket = JSON.parse(readFileSync(incidentPacketPath, "utf8"));
    const oldDefects = [
      incidentPacket.argv[0]?.endsWith("/node_modules/.bin/vitest")
        ? "incident_shell_shim_argv" : null,
      !launcher.includes("PINNED_TEST_RUNTIME") ? "launcher_missing_pinned_runtime" : null,
      worker.includes("spawn(argv[0], argv.slice(1)") ? "worker_spawns_unbound_argv0" : null,
      /for \(const fd of \[1, 2\]\)[\s\S]{0,120}closeSync\(fd\)/.test(controller)
        ? "controller_closes_redirected_stdio" : null
    ].filter(Boolean);
    if (mode === "red") {
      if (oldDefects.length !== 4) {
        throw new Error(`RED_DEFECT_SET_MISMATCH:${oldDefects.join(",")}`);
      }
      process.stdout.write(`REWORK7_RED old_close_signal=${old.result.signal ?? "none"} `
        + `old_close_status=${old.result.status ?? "null"} defects=${oldDefects.join(",")}\n`);
      process.exitCode = 1;
    } else {
      if (oldDefects.length !== 1 || oldDefects[0] !== "incident_shell_shim_argv") {
        throw new Error(`GREEN_DEFECT_SET_MISMATCH:${oldDefects.join(",")}`);
      }
      const stable = runChild("stable-open", "stable");
      if (stable.result.status !== 0 || stable.result.signal !== null || stable.result.error) {
        throw new Error(`STABLE_CHILD_FAILED:${stable.result.error ?? stable.result.signal
          ?? stable.result.status}`);
      }
      const launchdStreams = JSON.parse(readFileSync(join(stable.receiptDir,
        "launchd-streams.json"), "utf8"));
      for (const processName of ["controller", "worker"]) {
        for (const streamName of ["stdout", "stderr"]) {
          const binding = launchdStreams.streams[processName][streamName];
          if (shaFile(binding.launchd.path) !== binding.launchd.sha256
            || shaFile(binding.receipt.path) !== binding.receipt.sha256
            || binding.launchd.sha256 !== binding.receipt.sha256
            || statSync(binding.launchd.path).size !== binding.launchd.size
            || statSync(binding.receipt.path).size !== binding.receipt.size) {
            throw new Error(`POST_EXIT_STREAM_MISMATCH:${processName}:${streamName}`);
          }
        }
      }
      const terminal = JSON.parse(readFileSync(join(stable.receiptDir, "terminal.json"), "utf8"));
      const release = JSON.parse(readFileSync(join(stable.receiptDir, "release.json"), "utf8"));
      if (terminal.sequence !== 2 || release.sequence !== 3
        || terminal.launchd_streams_sha256 !== shaFile(join(stable.receiptDir,
          "launchd-streams.json"))
        || release.launchd_streams_sha256 !== terminal.launchd_streams_sha256
        || release.terminal_sha256 !== shaFile(join(stable.receiptDir, "terminal.json"))) {
        throw new Error("FINALIZATION_ORDER_OR_BINDING_MISMATCH");
      }
      const helperSource = readFileSync(helperPath, "utf8");
      const recovery = readFileSync(recoveryPath, "utf8");
      const authority = JSON.parse(readFileSync(authorityPath, "utf8"));
      const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
      if (!launcher.includes("const PINNED_TEST_RUNTIME = \"/Users/vladmihaimiron/.hermes/node/bin/node\"")
        || !launcher.includes("PINNED_VITEST_ENTRYPOINT")
        || !launcher.includes("packet.test_runtime")
        || !launcher.includes("packet.vitest_entrypoint")
        || !worker.includes("spawn(testRuntime.path, [vitestEntrypoint.path, ...PINNED_TEST_ARGS]")
        || worker.includes("spawn(argv[0], argv.slice(1)")
        || !controller.includes("verifySealedLaunchdStreams")
        || /for \(const fd of \[1, 2\]\)[\s\S]{0,120}closeSync\(fd\)/.test(controller)
        || !helperSource.includes("export const verifySealedLaunchdStreams")) {
        throw new Error("PINNED_RUNTIME_OR_CRASH_FREE_SOURCE_GUARD_MISSING");
      }
      if (authority.classification !== "SUPERVISOR_INTERRUPTED_NO_TEST_MODULE_LOADED"
        || authority.run_id !== "7821bdb5-0559-43f4-804e-6996bb9f18a4"
        || authority.one_time !== true
        || authority.grok_rework7_approval_required_before_execution !== true
        || authority.no_new_run_test_viewer_worker_or_supervisor_authority !== true
        || evidence.worker_terminal.raw_status !== 127
        || evidence.test_output.vitest_module_or_test_loaded !== false
        || !recovery.includes("archiveLockPreservingInodes")
        || !recovery.includes("Immutable intent precedes the sole atomic archive")
        || /launchctl\", \[\"bootstrap\"|launchctl\", \[\"bootout\"|unlinkSync|rmdirSync|rmSync/.test(recovery)) {
        throw new Error("INTERRUPTED_RECOVERY_AUTHORITY_GUARD_MISSING");
      }
      process.stdout.write(`REWORK7_GREEN old_close_signal=${old.result.signal ?? "none"} `
        + `stable_status=${stable.result.status} pinned_runtime=true vitest_js_entrypoint=true `
        + `all_four_streams_post_exit_stable=true order=seal-terminal-release `
        + `launchd_private_streams_preserved=true recovery_run_bound=true `
        + `recovery_not_executed=true\n`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
