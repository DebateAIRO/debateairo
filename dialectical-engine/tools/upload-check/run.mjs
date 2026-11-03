// The pre-upload checker's one command: node tools/upload-check/run.mjs --rev <commit>
//
// It runs the three checks in order on one commit: check 1 the shared tools folder, check 2 the release install and the
// website build, check 3 the API and runner start checks. Before any of them it waits its turn on a busy Mac, the way
// run-clean.sh does. It makes one fresh work folder for the run and removes it when the run ends, on Ctrl-C, a stop
// (SIGTERM) and a closed terminal (SIGHUP) included. A forced kill (kill -9) cannot be caught, and leaves the folder.
//
//   node tools/upload-check/run.mjs --rev <commit>   the command: exit 0 all passed, 1 a check refused or not checked, 2 could not run
//   runUploadCheck({ rev, ... })                     the run itself: { exitCode, output, results }
//   hostIsFree({ processes, freePercent })           true when no heavy run is going and at least 40% of memory is free
//   formatReport({ rev, results })                   the plain report, as one string; ALL PASSED only for three passed checks
//   exitCodeOf(results)                              0 only for three passed checks, else 1
//   versionProblem({ nodeVersion, pnpmVersion })     the first version the checker refuses, in words, or null
//
// The three checks come in as a parameter, so the tests can inject one that throws. A refusal of the run itself carries
// a code that starts UPLOAD_CHECK_. Nothing here reads a server address, a key or a limit.

import { execFileSync } from "node:child_process";
import { accessSync, constants, existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkToolsFolder } from "./tools-folder.mjs";
import { checkWebsiteBuild, stopRunning as stopBuildGroups } from "./website-build.mjs";
import { checkStartChecks, stopRunning as stopStartCheckGroups } from "./start-checks.mjs";

/** The checkout root: the folder that holds dialectical-engine/. This file sits at dialectical-engine/tools/upload-check/. */
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
/** The versions the checker needs, as package.json's engines and packageManager say. Any other version is refused. */
const NODE_VERSION = "v26.8.2";
const PNPM_VERSION = "11.20.0";
/** A run waits this long for a quiet Mac, looking every 15 s, as run-clean.sh does. */
const WAIT_LIMIT_MS = 60 * 60_000;
const POLL_MS = 15_000;
/** run-clean.sh's bar: at least this share of memory must be free. */
const MIN_FREE_PERCENT = 40;
/** The heavy runs run-clean.sh waits for. A line that matches either list holds the host. */
const VITEST = [/vitest\.mjs/u, /vitest run/u, /vitest\/dist/u];
const POSTGRES = [/bin\/postgres( |$)/u, /embedded-postgres/u];
/** A payments session's practice PostgreSQL may run beside a check, as run-clean.sh lets it; these lines do not hold the host. */
const PRACTICE = /\/worktrees\/r[0-9]+[a-z]?-practice\//u;
const STATUS_WORDS = { passed: "passed", refused: "REFUSED", "not-checked": "not checked" };
const PROBE = { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] };

/** One process command line holds the host when it is a vitest run, or a PostgreSQL that is not a practice one. */
function isHeavy(line) {
  if (VITEST.some((pattern) => pattern.test(line))) return true;
  return POSTGRES.some((pattern) => pattern.test(line)) && !PRACTICE.test(line);
}

/** True when no heavy run is going and at least 40% of memory is free. Plain data in, so the tests need no Mac. */
export function hostIsFree({ processes, freePercent }) {
  if (processes.some(isHeavy)) return false;
  return freePercent >= MIN_FREE_PERCENT;
}

/** The Mac as it is now: the command line of every process, and the share of memory free, read as run-clean.sh reads them. */
function readHost() {
  const processes = execFileSync("ps", ["-axo", "command"], { encoding: "utf8" }).split("\n");
  let freePercent = 0;
  try {
    const match = /free percentage: (\d+)%/u.exec(execFileSync("memory_pressure", [], { encoding: "utf8" }));
    if (match !== null) freePercent = Number(match[1]);
  } catch {
    // No reading counts as 0% free, so the run waits, as run-clean.sh does.
  }
  return { processes, freePercent };
}

/** Waits until the host is free, looking every <pollMs>. False if it is still busy once <waitMs> has passed. */
async function waitForHost({ host, waitMs, pollMs, sleep, log }) {
  const deadline = Date.now() + waitMs;
  let announced = false;
  for (;;) {
    if (hostIsFree(await host())) return true;
    if (!announced) {
      log("the Mac is busy (another heavy run, or under 40% of memory free); waiting for it to be free");
      announced = true;
    }
    if (Date.now() >= deadline) return false;
    await sleep(pollMs);
  }
}

/** The first version the checker refuses, in words, or null when both match. */
export function versionProblem({ nodeVersion, pnpmVersion }) {
  if (nodeVersion !== NODE_VERSION) return `Node is ${nodeVersion}; the checker needs ${NODE_VERSION}`;
  if (pnpmVersion !== PNPM_VERSION) return `pnpm is ${pnpmVersion}; the checker needs ${PNPM_VERSION}`;
  return null;
}

/** The first line of an error, from its stderr when it has one. */
function firstLine(error) {
  const text = String(error?.stderr ?? "").trim() || String(error?.message ?? error).trim();
  return text.split("\n")[0] || "no message";
}

/**
 * Reads the Node and pnpm versions. pnpm is asked from the engine folder, where its packageManager field selects 11.20.0.
 * Outside the repository pnpm falls back to the global install, which on this Mac prints 10.28.2, so that folder is not used.
 * Returns a problem in words, or null when both versions are right.
 */
function runtimeProblem({ node, pnpm, engine }) {
  let nodeVersion;
  let pnpmVersion;
  try {
    nodeVersion = execFileSync(node, ["--version"], PROBE).trim();
    pnpmVersion = execFileSync(pnpm, ["--version"], { ...PROBE, cwd: engine }).trim();
  } catch (error) {
    return `could not read the Node or pnpm version: ${firstLine(error)}`;
  }
  return versionProblem({ nodeVersion, pnpmVersion });
}

/** The pnpm on this Mac's PATH: the full path of the first executable named pnpm, or null. */
function findPnpm() {
  for (const dir of (process.env.PATH ?? "").split(":")) {
    if (dir === "") continue;
    const candidate = join(dir, "pnpm");
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Not in this folder; try the next.
    }
  }
  return null;
}

/** The full SHA of <rev> in <repo>, or null when git knows no such commit. */
function commitOf(repo, rev) {
  try {
    return execFileSync("git", ["-C", repo, "rev-parse", "--verify", "--quiet", `${rev}^{commit}`], PROBE).trim();
  } catch {
    return null;
  }
}

/** A run that could not start: exit 2, the refusal in words, and no results. */
function stopped(code, words) {
  return { exitCode: 2, output: `${code}: ${words}`, results: [] };
}

/** How many checks a whole run has. A list with any other count is never all passed: an empty list included. */
const CHECK_COUNT = 3;

/** True only for exactly three results, every one passed. A check that was not checked never counts as passed. */
function allPassed(results) {
  return results.length === CHECK_COUNT && results.every((result) => result.status === "passed");
}

/** Exit 0 only when all three checks passed; 1 otherwise. */
export function exitCodeOf(results) {
  return allPassed(results) ? 0 : 1;
}

/**
 * The plain report: a head line with the first 12 characters of the commit, one line per check with its own lines
 * indented beneath, and ALL PASSED or NOT PASSED as the last line.
 */
export function formatReport({ rev, results }) {
  const lines = [`Upload check of ${rev.slice(0, 12)}`];
  for (const result of results) {
    lines.push(`${result.name}: ${STATUS_WORDS[result.status] ?? "not checked"} (${result.seconds} s)`);
    for (const line of result.lines) lines.push(`  ${line}`);
  }
  lines.push(allPassed(results) ? "ALL PASSED" : "NOT PASSED");
  return lines.join("\n");
}

/** The three checks as the run calls them. A test passes its own in their place. */
const realChecks = Object.freeze({ toolsFolder: checkToolsFolder, websiteBuild: checkWebsiteBuild, startChecks: checkStartChecks });
const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
const progressLine = (line) => process.stderr.write(`${line}\n`);

/**
 * One run on <rev>: refusals first (rev, versions, the host), then one fresh work folder under <tmp>, then checks 1 to 3
 * in order. The folder is removed in every case, and so are the signal handlers. Resolves to { exitCode, output, results }.
 */
export async function runUploadCheck({
  rev, repo = REPO, node = process.execPath, tmp = tmpdir(), checks = realChecks,
  host = readHost, waitMs = WAIT_LIMIT_MS, pollMs = POLL_MS, sleep = delay, log = progressLine
}) {
  const sha = commitOf(repo, rev);
  if (sha === null) return stopped("UPLOAD_CHECK_REV_UNKNOWN", `there is no commit called ${rev} in this checkout`);
  const engine = join(repo, "dialectical-engine");
  const pnpm = findPnpm();
  const problem = pnpm === null ? "pnpm is not on this Mac's PATH" : runtimeProblem({ node, pnpm, engine });
  if (problem !== null) return stopped("UPLOAD_CHECK_RUNTIME_REFUSED", problem);
  if (!await waitForHost({ host, waitMs, pollMs, sleep, log })) {
    return stopped("UPLOAD_CHECK_HOST_BUSY", `the Mac stayed busy for ${waitMs / 60_000} minutes, so the run did not start`);
  }
  const workFolder = join(tmp, `upload-check-${sha.slice(0, 12)}-${Date.now()}`);
  if (existsSync(workFolder)) {
    return stopped("UPLOAD_CHECK_WORK_FOLDER_EXISTS", `${workFolder} already exists; each run starts from a new folder`);
  }
  mkdirSync(workFolder);
  // A few tries, a tenth of a second apart: a process that was just stopped may still be letting go of a file.
  const cleanUp = () => rmSync(workFolder, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  // Ctrl-C, a stop and a closed terminal first stop every process group the checks started (pnpm, Next, the start-checks
  // driver and its PostgreSQL), so nothing is still writing into the folder; then the folder goes; then the run exits with
  // the signal's usual code. A folder that still could not be removed is named on stderr, so the owner can delete it.
  const onSignal = (exitCode) => () => {
    try {
      stopBuildGroups();
      stopStartCheckGroups();
      try { cleanUp(); } catch { /* named just below */ }
      if (existsSync(workFolder)) process.stderr.write(`UPLOAD_CHECK_WORK_FOLDER_LEFT: could not remove ${workFolder}; delete it by hand\n`);
    } finally {
      process.exit(exitCode);
    }
  };
  const handlers = [["SIGINT", onSignal(130)], ["SIGTERM", onSignal(143)], ["SIGHUP", onSignal(129)]];
  for (const [signal, handler] of handlers) process.on(signal, handler);
  const pnpmDir = dirname(pnpm);
  let outcome;
  let cleanUpFailure = null;
  try {
    const results = [];
    log("check 1 of 3: tools-folder");
    results.push(await checks.toolsFolder({ repo, rev: sha, workdir: workFolder, node }));
    log("check 2 of 3: website-build");
    const built = await checks.websiteBuild({ repo, rev: sha, workdir: workFolder, node, pnpmDir });
    results.push(built.result);
    log("check 3 of 3: start-checks");
    // Without an installed release there is nothing to start. The run says so itself, and check 3 is not called.
    if (typeof built.root === "string") {
      results.push(await checks.startChecks({ root: built.root, workdir: workFolder, node }));
    } else {
      results.push({ name: "start-checks", status: "not-checked", lines: ["no installed release"], seconds: 0 });
    }
    outcome = { exitCode: exitCodeOf(results), output: formatReport({ rev: sha, results }), results };
  } catch (error) {
    outcome = { exitCode: 2, output: `UPLOAD_CHECK_RUN_FAILED: a check threw, so the run could not finish: ${firstLine(error)}`, results: [] };
  } finally {
    // The handlers stay until the folder is gone: a Ctrl-C during this long delete must not kill the run half-way.
    try {
      cleanUp();
    } catch (error) {
      cleanUpFailure = error;
    }
    for (const [signal, handler] of handlers) process.removeListener(signal, handler);
  }
  if (cleanUpFailure !== null) {
    return stopped("UPLOAD_CHECK_CLEANUP_FAILED", `could not remove ${workFolder}: ${firstLine(cleanUpFailure)}`);
  }
  return outcome;
}

/** The command line: exactly --rev <commit>. The report goes to stdout, a refusal to stderr, and the exit code is set. */
async function main(argv) {
  const rev = argv.length === 2 && argv[0] === "--rev" ? argv[1] : null;
  if (rev === null) {
    process.stderr.write("UPLOAD_CHECK_USAGE: node tools/upload-check/run.mjs --rev <commit>\n");
    process.exitCode = 2;
    return;
  }
  let outcome;
  try {
    outcome = await runUploadCheck({ rev, log: progressLine });
  } catch (error) {
    // A failure before the checks start (the process list, a folder that cannot be made) is still "could not run": exit 2.
    outcome = { exitCode: 2, output: `UPLOAD_CHECK_RUN_FAILED: the run could not start: ${firstLine(error)}` };
  }
  (outcome.exitCode === 2 ? process.stderr : process.stdout).write(`${outcome.output}\n`);
  process.exitCode = outcome.exitCode;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
