// Check 2 of the pre-upload checker: install a release as staging does, then build the website as the release tool does.
//
// The install repeats the release guide's step A3 (deploy/preview-release/v1/README.md) on this Mac, from a fresh store
// instead of the server's old one: one online fill in a fill folder, an offline install in the release folder whose log
// must say "downloaded 0", then generate:contract. Every child gets A3's emptied environment.
//
// The build runs `pnpm --filter dialectical-engine-v2ui build` with the environment the release tool itself gives its
// build: the release root's own uiBuildEnvironment. On 2 Nov the server's build refused, because its environment lacked
// the owner's early-use package exemption; the same environment here meets the same fault on the Mac.
//
//   installRelease({ repo, rev, workdir, node, pnpmDir })      the A3 install under <workdir>; { root } or a refusal
//   buildWebsiteIn({ root, node, pnpmDir })                    the build and the release-folder tools: a CheckResult
//   checkWebsiteBuild({ repo, rev, workdir, node, pnpmDir })   the check: { result, root }, root null when not installed
//   runChild(command, args, { cwd, env, log, limitMs? })       one child in its own process group; a timeout, stopRunning()
//                                                              or this process exiting stops the whole group, pnpm's children included
//   stopRunning()                                              stops every group runChild started that is still running
//
// <pnpmDir> is the folder that holds pnpm on this Mac. Each also takes extraEnv, merged into every child's environment
// last; it is there for tests (an unreachable registry, say). A target too old for an export the check uses is
// not-checked, with the export's name. Nothing here reads a server address, a key or a limit.

import { execFileSync, spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { RELEASE_FOLDER_TOOLS, loadEachTool } from "./tools-folder.mjs";

const ENGINE = "dialectical-engine";
const RELEASE_TOOL = `${ENGINE}/deploy/preview-release/v1/release-artifacts.mjs`;
const HOTFIX = `${ENGINE}/tools/source-map-hotfix.mjs`;
/** The file every Next build leaves, and the server's release tool reads (ui-build.mjs). Its absence means nothing was built. */
const BUILD_ID = `${ENGINE}/apps/ui/.next/BUILD_ID`;
/** A made-up release key. It only has to match RELEASE_KEY_PATTERN; the website bakes it in and nothing serves it. */
const RELEASE_KEY = "r99-000000000000";
/** One install or build gets this long. Past it, the child is stopped and counted as failed. */
const STEP_LIMIT_MS = 45 * 60_000;
/** How many of a failed step's last log lines go into the result. */
const LOG_TAIL = 8;

function refusal(code, words, detail = []) {
  const error = new Error(`${code}: ${words}`);
  error.code = code;
  error.words = words;
  error.detail = detail;
  return error;
}

/** The last few lines of a log, so a refusal says what pnpm said. Empty if there is no log. */
function tailOf(log) {
  if (!existsSync(log)) return [];
  return readFileSync(log, "utf8").split("\n").map((line) => line.trimEnd()).filter((line) => line !== "").slice(-LOG_TAIL).map((line) => `  ${line.slice(0, 300)}`);
}

/** A3's environment, and nothing else from this Mac: env -i CI=true NEXT_TELEMETRY_DISABLED=1 TZ=UTC PNPM_CONFIG_STORE_DIR=... */
function installEnvironment({ node, pnpmDir, store, offline, extraEnv }) {
  return {
    PATH: `${dirname(node)}:${pnpmDir}:/usr/bin:/bin`, CI: "true", NEXT_TELEMETRY_DISABLED: "1", TZ: "UTC", PNPM_CONFIG_STORE_DIR: store,
    ...(offline ? { PNPM_CONFIG_OFFLINE: "true" } : {}), ...extraEnv
  };
}

/** Stops a process group with SIGKILL, so what a timed-out step started (pnpm's children, Next's workers) stops too. A group already gone is fine. */
function killGroup(pid) {
  if (pid === undefined) return;
  try { process.kill(-pid, "SIGKILL"); } catch { /* already gone */ }
}

/** The process groups runChild started that have not ended yet. */
const running = new Set();

/**
 * Stops every process group runChild started that is still running (pnpm, Next and their children). run.mjs calls it
 * first on a stop signal, before it removes the work folder, so nothing is still writing there while the folder goes.
 */
export function stopRunning() {
  for (const pid of running) killGroup(pid);
}

/**
 * One child process in its own process group, with exactly <env>, its output in <log>. Resolves to the exit code, or null if
 * it did not run or ran too long. A timeout stops the whole group. So does stopRunning(), and so does this process exiting
 * while the child runs (the exit hook below), so pnpm does not outlive the run.
 */
export function runChild(command, args, { cwd, env, log, limitMs = STEP_LIMIT_MS }) {
  return new Promise((resolveCode) => {
    const fd = openSync(log, "w");
    let settled = false;
    const child = spawn(command, args, { cwd, env, stdio: ["ignore", fd, fd], shell: false, detached: true });
    if (child.pid !== undefined) running.add(child.pid);
    const onExit = () => killGroup(child.pid);
    const settle = (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      running.delete(child.pid);
      process.removeListener("exit", onExit);
      closeSync(fd);
      // Whatever the child left in its group goes with it, as on a timeout.
      killGroup(child.pid);
      resolveCode(code);
    };
    process.on("exit", onExit);
    const timer = setTimeout(() => { killGroup(child.pid); settle(null); }, limitMs);
    child.on("error", () => settle(null));
    child.on("close", (code) => settle(code));
  });
}

/** The figure in the last "downloaded N, added N, done" line of a pnpm log, or null if there is none. */
function downloadedIn(log) {
  const found = [...readFileSync(log, "utf8").matchAll(/downloaded (\d+), added \d+, done/g)];
  return found.length === 0 ? null : Number(found.at(-1)[1]);
}

/**
 * Guide step A3 on this Mac. Under <workdir>: store/ (fresh), store-fill/ and release/, each made from one git archive
 * of <rev>'s dialectical-engine folder. Refuses with an UPLOAD_CHECK_ code when a step fails; the logs stay in <workdir>.
 */
export async function installRelease({ repo, rev, workdir, node, pnpmDir, extraEnv = {} }) {
  const store = join(workdir, "store"), fill = join(workdir, "store-fill"), root = join(workdir, "release");
  const archive = join(workdir, "source.tar");
  for (const folder of [store, fill, root, archive]) {
    if (existsSync(folder)) throw refusal("UPLOAD_CHECK_INSTALL_FOLDER_EXISTS", `${folder} already exists; the install starts from empty folders`);
  }
  mkdirSync(workdir, { recursive: true });
  const env = (offline) => installEnvironment({ node, pnpmDir, store, offline, extraEnv });
  try {
    execFileSync("git", ["-C", repo, "archive", "--format=tar", "-o", archive, rev, ENGINE], { stdio: ["ignore", "pipe", "pipe"] });
    for (const folder of [store, fill]) mkdirSync(folder);
    execFileSync("tar", ["-x", "-C", fill, "-f", archive], { stdio: ["ignore", "pipe", "pipe"] });
    // The one online install: it fills the fresh store, and pnpm checks every download against the lockfile's sha512.
    const fillLog = join(workdir, "store-fill-install.log");
    if (await runChild(node, ["tools/source-map-hotfix.mjs", "install"], { cwd: join(fill, ENGINE), env: env(false), log: fillLog }) !== 0) {
      throw refusal("UPLOAD_CHECK_ONLINE_FILL_FAILED", "the online package fill failed", tailOf(fillLog));
    }
    // The fill folder has done its work; only the store is kept. It is large, so it goes now.
    rmSync(fill, { recursive: true, force: true });
    mkdirSync(root);
    execFileSync("tar", ["-x", "-C", root, "-f", archive], { stdio: ["ignore", "pipe", "pipe"] });
    const installLog = join(workdir, "release-install.log");
    if (await runChild(node, ["tools/source-map-hotfix.mjs", "install"], { cwd: join(root, ENGINE), env: env(true), log: installLog }) !== 0) {
      throw refusal("UPLOAD_CHECK_OFFLINE_INSTALL_FAILED", "the offline install in the release folder failed", tailOf(installLog));
    }
    const downloaded = downloadedIn(installLog);
    if (downloaded !== 0) {
      throw refusal("UPLOAD_CHECK_OFFLINE_INSTALL_DOWNLOADED", `the offline install did not end with downloaded 0 (it says ${downloaded === null ? "nothing" : `downloaded ${downloaded}`})`, tailOf(installLog));
    }
    const generateLog = join(workdir, "release-generate.log");
    if (await runChild(node, ["tools/source-map-hotfix.mjs", "generate"], { cwd: join(root, ENGINE), env: env(false), log: generateLog }) !== 0) {
      throw refusal("UPLOAD_CHECK_GENERATE_FAILED", "generate:contract failed in the release folder", tailOf(generateLog));
    }
  } finally {
    rmSync(archive, { force: true });
  }
  return { root };
}

/** The line that says which of the owner's early allowances apply today, from the release root's own package helper. */
async function allowanceLine(root) {
  let helper;
  try {
    helper = await import(pathToFileURL(join(root, HOTFIX)).href);
  } catch {
    return "early allowances in force: unknown (the package helper could not be loaded)";
  }
  if (typeof helper.earlyUseInForce !== "function") return "early allowances in force: unknown (this commit has no earlyUseInForce export)";
  const allowances = helper.earlyUseInForce(Date.now());
  if (allowances.length === 0) return "early allowances in force: none (this check cannot see the package-rule fault today)";
  return `early allowances in force: ${allowances.length} (${allowances.map(({ pin, until }) => `${pin} until ${until}`).join(", ")})`;
}

/** The first line of an error, for a result line. */
function firstLine(error) {
  return (String(error?.message ?? error).trim().split("\n")[0] || "no message");
}

/** Builds the website in an installed release root, then loads the release-folder tools there. A CheckResult. */
export async function buildWebsiteIn({ root, node, pnpmDir, extraEnv = {} }) {
  const started = Date.now();
  const done = (status, lines) => ({ name: "website-build", status, lines, seconds: (Date.now() - started) / 1000 });
  let releaseTool;
  try {
    releaseTool = await import(pathToFileURL(join(root, RELEASE_TOOL)).href);
  } catch (error) {
    return done("not-checked", [`website build: the release tool could not be loaded: ${firstLine(error)}`]);
  }
  if (typeof releaseTool.uiBuildEnvironment !== "function") return done("not-checked", ["website build: this commit has no uiBuildEnvironment export"]);
  let environment;
  try {
    environment = await releaseTool.uiBuildEnvironment(root, RELEASE_KEY, node);
  } catch (error) {
    return done("refused", [`website build: the release tool refused the build environment (${error?.code ?? firstLine(error)})`, "UPLOAD_CHECK_BUILD_ENVIRONMENT_REFUSED"]);
  }
  const allowances = await allowanceLine(root);
  // Only PATH differs from the release tool's environment: pnpm may live outside /usr/local/bin on this Mac.
  // The running Node's folder stays first, so pnpm and next run on the Node the check was given.
  const env = { ...environment, PATH: `${dirname(node)}:${pnpmDir}:${environment.PATH}`, ...extraEnv };
  const buildLog = join(root, "website-build.log");
  if (await runChild(join(pnpmDir, "pnpm"), ["--filter", "dialectical-engine-v2ui", "build"], { cwd: join(root, ENGINE), env, log: buildLog }) !== 0) {
    return done("refused", ["website build: the build failed", "UPLOAD_CHECK_WEBSITE_BUILD_FAILED", ...tailOf(buildLog), allowances]);
  }
  // pnpm exits 0 when --filter matches no package (a renamed website package, say), so exit 0 alone proves no build. A
  // real build leaves Next's build id file, which the server's release tool reads; without it, nothing was built.
  if (!existsSync(join(root, BUILD_ID))) {
    return done("refused", [`website build: the build exited 0 but left no ${BUILD_ID}`, "UPLOAD_CHECK_WEBSITE_BUILD_NO_OUTPUT", ...tailOf(buildLog), allowances]);
  }
  // The tools that run from a release folder load there, with its packages, each on its own.
  const results = await loadEachTool({ folder: root, node, only: RELEASE_FOLDER_TOOLS });
  const failed = results.filter((result) => !result.ok);
  const absent = RELEASE_FOLDER_TOOLS.filter((tool) => !results.some((result) => result.tool === tool));
  const lines = [
    "website build: built with the release tool's own environment",
    `release-folder tools: ${results.length - failed.length} of ${results.length} loaded`,
    ...failed.map((result) => `${result.tool}: ${result.code ?? "failed with no error code"}`),
    ...absent.map((tool) => `${tool}: not in this commit, so not loaded`),
    allowances
  ];
  return done(failed.length === 0 ? "passed" : "refused", lines);
}

/**
 * Check 2: installRelease, then buildWebsiteIn. root is the installed release root for check 3, or null when the
 * install did not finish. A refusal is refused; any other error means the check could not finish: not-checked.
 */
export async function checkWebsiteBuild({ repo, rev, workdir, node, pnpmDir, extraEnv = {} }) {
  const started = Date.now();
  const seconds = () => (Date.now() - started) / 1000;
  let root;
  try {
    ({ root } = await installRelease({ repo, rev, workdir, node, pnpmDir, extraEnv }));
  } catch (error) {
    const refused = typeof error?.code === "string" && error.code.startsWith("UPLOAD_CHECK_");
    const lines = refused ? [error.words, error.code, ...error.detail] : [`the check could not finish: ${firstLine(error?.stderr?.length ? error.stderr : error)}`];
    return { result: { name: "website-build", status: refused ? "refused" : "not-checked", lines, seconds: seconds() }, root: null };
  }
  let result;
  try {
    result = await buildWebsiteIn({ root, node, pnpmDir, extraEnv });
  } catch (error) {
    result = { name: "website-build", status: "not-checked", lines: [`the check could not finish: ${firstLine(error)}`] };
  }
  return { result: { ...result, seconds: seconds() }, root };
}
