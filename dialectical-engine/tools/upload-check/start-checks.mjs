// Check 3 of the pre-upload checker: the API's and the runner's start checks, run as the production logins.
//
// On 2 Nov the runner refused at its first start on the server: its start check expected one database role, but row
// security (migration 0130) gives the runner login two. No test ran the start checks as the real logins. This check does,
// with the target commit's own code: it copies start-checks-driver.ts into the installed release root and runs it there
// with that root's own tsx, so every import the driver makes resolves to the root's packages, not this checkout's.
//
//   checkStartChecks({ root, workdir, node, extraEnv, limitMs })   the check: a CheckResult
//   stopRunning()                                                  stops a driver still running, its PostgreSQL with it
//
// <root> is the release root from check 2 (the folder that holds dialectical-engine/), or null when check 2 installed
// nothing. <workdir> is the run's work folder: the driver's cluster lives in <workdir>/start-checks, which is gone
// afterwards, and its log stays at <workdir>/start-checks-driver.log. extraEnv is merged into the driver's environment
// last, and limitMs replaces the driver's 10-minute limit; both are there for tests. Two test hooks in extraEnv act on
// the throwaway cluster only and never reach anything else: UPLOAD_CHECK_TEST_EXTRA_GRANT names one role the driver
// grants the runner login, so a test can watch the runner check refuse, and UPLOAD_CHECK_TEST_SYSTEM_REVOKE names one
// role the driver takes from the api-system login, so a test can watch a check on the system route refuse. They go to
// the driver as arguments, because the source audit refuses a tools/ .ts file that reads the process environment.
//
// The driver prints exactly one line, {"ok":boolean,"lines":string[]}. Its lines read "<part>: passed",
// "<part>: refused" or "<part>: not checked: …". Nothing here reads a server address, a key or a limit.

import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { connect, createServer } from "node:net";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ENGINE = "dialectical-engine";
/** Where the driver sits in a release root, as a path inside dialectical-engine/. */
const DRIVER = "tools/upload-check/start-checks-driver.ts";
const DRIVER_SOURCE = join(dirname(fileURLToPath(import.meta.url)), "start-checks-driver.ts");
/** The port the start checks pin (verify-native.ts). The throwaway cluster must listen on it, so it must be free. */
const PORT = 5434;
/** The driver gets this long. Past it, the driver and everything it started are stopped. */
const DRIVER_LIMIT_MS = 10 * 60_000;
/** How many of the driver's last log lines go into a result that could not finish. */
const LOG_TAIL = 8;

/** The last few lines of a log, so a result says what the driver said. Empty if there is no log. */
function tailOf(log) {
  if (!existsSync(log)) return [];
  return readFileSync(log, "utf8").split("\n").map((line) => line.trimEnd()).filter((line) => line !== "").slice(-LOG_TAIL).map((line) => `  ${line.slice(0, 300)}`);
}

/** True if something answers on <host>:<port> within a second. */
function answers(host, port) {
  return new Promise((resolveAnswer) => {
    const socket = connect({ host, port });
    const settle = (answer) => { socket.destroy(); resolveAnswer(answer); };
    socket.setTimeout(1000, () => settle(false));
    socket.once("connect", () => settle(true));
    socket.once("error", () => settle(false));
  });
}

/** True if this process may listen on 127.0.0.1:<port> now; the listener is closed straight away. */
function canListen(port) {
  return new Promise((resolveFree) => {
    const server = createServer();
    server.once("error", () => resolveFree(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolveFree(true)));
  });
}

/** Why <port> is taken, or null when it is free: a listener that will not let go, or anything answering on loopback. */
async function portTaken(port) {
  if (!await canListen(port)) return `something already listens on 127.0.0.1:${port}`;
  for (const host of ["127.0.0.1", "::1"]) {
    if (await answers(host, port)) return `something already answers on ${host === "::1" ? "[::1]" : host}:${port}`;
  }
  return null;
}

/**
 * Puts the checker's driver at <engine>/DRIVER. Nothing is copied when the same bytes are already there (the repository
 * itself). Returns how to undo exactly what was done: a copy over another file puts that file back, a new copy is
 * removed with the folders made for it, and no copy leaves everything alone.
 */
function placeDriver(engine) {
  const target = join(engine, DRIVER);
  const ours = readFileSync(DRIVER_SOURCE);
  if (existsSync(target)) {
    const theirs = readFileSync(target);
    if (theirs.equals(ours)) return () => {};
    writeFileSync(target, ours);
    return () => writeFileSync(target, theirs);
  }
  // The folders an older commit lacks, from the outermost in, so they can be removed innermost first.
  const made = [];
  for (let folder = dirname(target); !existsSync(folder) && folder !== engine; folder = dirname(folder)) made.unshift(folder);
  for (const folder of made) mkdirSync(folder);
  writeFileSync(target, ours);
  return () => {
    rmSync(target, { force: true });
    for (const folder of made.reverse()) {
      try { rmdirSync(folder); } catch { /* not empty: something else is in it now, so it stays */ }
    }
  };
}

/** Stops a process group with SIGKILL. A group that is already gone is fine. */
function killGroup(pid) {
  try { process.kill(-pid, "SIGKILL"); } catch { /* already gone */ }
}

/** The driver groups runDriver started that have not ended yet. */
const running = new Set();

/**
 * Stops every driver group that is still running, the driver's PostgreSQL with it. run.mjs calls it first on a stop
 * signal, before it removes the work folder, so the cluster is not still writing there while the folder goes.
 */
export function stopRunning() {
  for (const pid of running) killGroup(pid);
}

/**
 * Runs the driver in its own process group, so a timeout, a failure, stopRunning() or this process's own exit can stop
 * the driver and the PostgreSQL it started together. Resolves to { code, stdout, timedOut }.
 */
function runDriver(tsx, args, { cwd, env, log, limitMs }) {
  return new Promise((resolveRun) => {
    const fd = openSync(log, "w");
    const chunks = [];
    let settled = false, timedOut = false;
    const child = spawn(tsx, args, { cwd, env, stdio: ["ignore", "pipe", fd], shell: false, detached: true });
    if (child.pid !== undefined) running.add(child.pid);
    const onExit = () => killGroup(child.pid);
    const settle = (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      running.delete(child.pid);
      process.removeListener("exit", onExit);
      closeSync(fd);
      // Whatever the driver left in its group (a PostgreSQL its finally could not stop) goes with it.
      if (child.pid !== undefined) killGroup(child.pid);
      resolveRun({ code, stdout: Buffer.concat(chunks).toString("utf8"), timedOut });
    };
    // If this process exits while the driver runs (a caller's Ctrl-C handler, say), the driver's group goes first.
    if (child.pid !== undefined) process.on("exit", onExit);
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    const timer = setTimeout(() => { timedOut = true; if (child.pid !== undefined) killGroup(child.pid); }, limitMs);
    child.on("error", () => settle(null));
    child.on("close", (code) => settle(code));
  });
}

/** The driver's one JSON line, or null when its output is not that. */
function driverAnswer(stdout) {
  const last = stdout.split("\n").map((line) => line.trim()).filter((line) => line !== "").at(-1);
  if (last === undefined) return null;
  try {
    const answer = JSON.parse(last);
    if (typeof answer?.ok === "boolean" && Array.isArray(answer.lines) && answer.lines.every((line) => typeof line === "string")) return answer;
  } catch { /* not JSON */ }
  return null;
}

/** A driver answer as a status: passed only when it says ok; a refusal anywhere beats a part that was not checked. */
function statusOf(answer) {
  if (answer.ok) return "passed";
  if (answer.lines.some((line) => /: refused\b/.test(line) || line.startsWith("UPLOAD_CHECK_"))) return "refused";
  if (answer.lines.some((line) => /: not checked: /.test(line))) return "not-checked";
  return "refused";
}

/** Check 3. Refuses UPLOAD_CHECK_PORT_BUSY before anything starts when port 5434 is taken on this Mac. */
export async function checkStartChecks({ root, workdir, node, extraEnv = {}, limitMs = DRIVER_LIMIT_MS }) {
  const started = Date.now();
  const done = (status, lines) => ({ name: "start-checks", status, lines, seconds: (Date.now() - started) / 1000 });
  if (root === null || root === undefined) return done("not-checked", ["no installed release"]);
  const taken = await portTaken(PORT);
  if (taken !== null) return done("refused", [`start checks: refused (${taken}; the start checks pin port ${PORT})`, "UPLOAD_CHECK_PORT_BUSY"]);
  const engine = join(root, ENGINE);
  const tsx = join(engine, "node_modules/.bin/tsx");
  if (!existsSync(engine)) return done("not-checked", [`start checks: not checked: ${engine} does not exist`]);
  const cluster = join(workdir, "start-checks");
  if (existsSync(cluster)) return done("not-checked", [`start checks: not checked: ${cluster} already exists; the check starts from an empty folder`]);
  const log = join(workdir, "start-checks-driver.log");
  mkdirSync(workdir, { recursive: true });
  const undo = placeDriver(engine);
  let run;
  try {
    if (!existsSync(tsx)) return done("not-checked", [`start checks: not checked: the release root has no ${relative(root, tsx)}`]);
    // The two test hooks, as named arguments (see the top of this file).
    const hooks = [["--test-extra-grant", extraEnv.UPLOAD_CHECK_TEST_EXTRA_GRANT], ["--test-system-revoke", extraEnv.UPLOAD_CHECK_TEST_SYSTEM_REVOKE]]
      .filter(([, role]) => typeof role === "string" && role !== "").map(([flag, role]) => `${flag}=${role}`);
    const args = [DRIVER, cluster, String(process.pid), ...hooks];
    // The driver's environment: this Mac's PATH is not handed on, only the given Node's folder and the system tools.
    const env = { PATH: `${dirname(node)}:/usr/bin:/bin`, HOME: process.env.HOME ?? "", TMPDIR: process.env.TMPDIR ?? "/tmp", TZ: "UTC", ...extraEnv };
    run = await runDriver(tsx, args, { cwd: engine, env, log, limitMs });
  } finally {
    undo();
    rmSync(cluster, { recursive: true, force: true });
  }
  if (run.timedOut) return done("not-checked", [`start checks: not checked: the driver ran past ${limitMs / 1000} s and was stopped, with everything it started`, ...tailOf(log)]);
  const answer = driverAnswer(run.stdout);
  if (answer === null) return done("not-checked", [`start checks: not checked: the driver gave no result (exit ${run.code ?? "none"})`, ...tailOf(log)]);
  const status = statusOf(answer);
  const lines = status === "refused" && !answer.lines.some((line) => line.startsWith("UPLOAD_CHECK_"))
    ? [...answer.lines, "UPLOAD_CHECK_START_CHECK_REFUSED"] : answer.lines;
  return done(status, status === "not-checked" ? [...lines, ...tailOf(log)] : lines);
}
