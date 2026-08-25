#!/usr/bin/env node
import {
  closeSync, constants, existsSync, fsyncSync, openSync, readFileSync,
  renameSync, unlinkSync, writeSync
} from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";

const [receiptDir, challengePath] = process.argv.slice(2);
if (receiptDir === undefined || challengePath === undefined) {
  process.stderr.write("viewer requires RECEIPT_DIR CHALLENGE_PATH\n");
  process.exit(64);
}
const owner = JSON.parse(readFileSync(join(receiptDir, "owner.json"), "utf8"));
const challenge = readFileSync(challengePath, "utf8").trim();
if (!/^[a-f0-9]{64}$/.test(challenge)) throw new Error("VIEWER_CHALLENGE_INVALID");
const logPath = join(receiptDir, "test.stdout.log");
const logFd = openSync(logPath, constants.O_RDONLY);
closeSync(logFd);
const ttyResult = spawnSync("/usr/bin/tty", [], {
  encoding: "utf8",
  stdio: ["inherit", "pipe", "inherit"]
});
const tty = ttyResult.status === 0 ? ttyResult.stdout.trim() : "";
if (!tty.startsWith("/dev/")) throw new Error("VIEWER_TTY_UNAVAILABLE");
const ready = Object.freeze({
  schema_version: 1,
  run_id: owner.run_id,
  challenge,
  viewer_pid: process.pid,
  viewer_tty: tty,
  utc: new Date().toISOString()
});
const readyPath = join(receiptDir, "viewer.ready.json");
const temporaryPath = `${readyPath}.tmp-${process.pid}`;
const readyFd = openSync(temporaryPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
try {
  writeSync(readyFd, `${JSON.stringify(ready)}\n`);
  fsyncSync(readyFd);
} finally {
  closeSync(readyFd);
}
renameSync(temporaryPath, readyPath);
unlinkSync(challengePath);

// This process is display-only. It never reads PIDs as authority, signals a
// service, removes a lock, bootstraps launchd, or owns the controller/worker.
let lastState = "";
const monitor = () => {
  const terminalPath = join(receiptDir, "terminal.json");
  const releasePath = join(receiptDir, "release.json");
  const holdPath = join(receiptDir, "custody-hold.json");
  const heartbeatPath = join(receiptDir, "heartbeat.json");
  let state;
  if (existsSync(terminalPath) && existsSync(releasePath)) {
    const terminal = JSON.parse(readFileSync(terminalPath, "utf8"));
    const release = JSON.parse(readFileSync(releasePath, "utf8"));
    state = terminal.run_id === owner.run_id && release.run_id === owner.run_id
      && terminal.classification === release.classification
      ? terminal.classification
      : "UNKNOWN_HELD";
  } else if (existsSync(terminalPath) || existsSync(releasePath) || existsSync(holdPath)) {
    state = "UNKNOWN_HELD";
  } else if (existsSync(heartbeatPath)) {
    const heartbeat = JSON.parse(readFileSync(heartbeatPath, "utf8"));
    const ageMs = Date.now() - Date.parse(heartbeat.utc);
    state = heartbeat.run_id === owner.run_id && Number.isFinite(ageMs) && ageMs <= 45_000
      ? "RUNNING" : "STALLED/UNKNOWN";
  } else {
    state = "STALLED/UNKNOWN";
  }
  if (state !== lastState) {
    process.stdout.write(`[T1 GATE VIEW] run_id=${owner.run_id} state=${state}\n`);
    lastState = state;
  }
};
monitor();
setInterval(monitor, 5_000);
const tail = spawn("/usr/bin/tail", ["-n", "+1", "-F", logPath], {
  detached: false,
  stdio: "inherit"
});
tail.once("exit", (code, signal) => process.exitCode = signal === null ? (code ?? 1) : 128);
