// Check 1 of the pre-upload checker: every server tool must load from the server's shared tools folder.
//
// The shared folder is a git archive of three deploy folders alone: preview-lifecycle, preview-auth-dev and
// preview-release. A tool that reaches outside them (a file under tools/, say) loads on this Mac and then stops on the
// server. On 2 Nov one such tool stopped a release. This check copies the three folders from one commit into an empty
// folder, then loads each tool there, with nothing else beside it.
//
// Seven tools run from a release folder, with packages, so they are not loaded from the shared folder. They are listed
// in RELEASE_FOLDER_TOOLS. That list is fixed in one place, and a test pins its exact contents, so a change shows in review.
//
//   buildToolsFolder({ repo, rev, dest })          copies the three folders as they are at <rev> into <dest>
//   loadEachTool({ folder, node, only?, skip?, limitMs? })   loads each tool alone; one result per tool, sorted by name
//   checkToolsFolder({ repo, rev, workdir, node }) the check: a CheckResult, refused if any tool fails
//
// A refusal carries a code that starts UPLOAD_CHECK_. A check that cannot finish is not-checked, never passed.
// Nothing here reads a server address, a key or a limit.

import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, sep } from "node:path";

const DEPLOY = "dialectical-engine/deploy";
const FOLDERS = ["preview-lifecycle", "preview-auth-dev", "preview-release"];
const GIT_OUTPUT_LIMIT = 256 * 1024 * 1024;
/** One tool gets this long to load on its own. Past it, the tool is stopped and counted as TIMEOUT. */
const LOAD_LIMIT_MS = 30_000;

/** The tools that run from a release folder, with packages. Paths are from dialectical-engine/deploy/. Frozen. */
export const RELEASE_FOLDER_TOOLS = Object.freeze([
  "preview-auth-dev/v1/launch-api.mjs",
  "preview-auth-dev/v1/launch-runner.mjs",
  "preview-auth-dev/v1/mail-handoff.mjs",
  "preview-auth-dev/v1/native-operator.mjs",
  "preview-auth-dev/v1/native-peer.mjs",
  "preview-auth-dev/v1/run-stage.mjs",
  "preview-auth-dev/v1/stage-runtime.mjs"
]);

function refusal(code, words) {
  const error = new Error(`${code}: ${words}`);
  error.code = code;
  return error;
}

function git(repo, args) {
  return execFileSync("git", ["-C", repo, ...args], { maxBuffer: GIT_OUTPUT_LIMIT, stdio: ["ignore", "pipe", "pipe"] });
}

/** Copies the three deploy folders as they are at <rev> into <dest>. Refuses, before writing, if <rev> lacks any of them. */
export async function buildToolsFolder({ repo, rev, dest }) {
  const paths = FOLDERS.map((folder) => `${DEPLOY}/${folder}`);
  const listed = git(repo, ["ls-tree", "-r", "--name-only", rev, "--", ...paths]).toString("utf8").split("\n");
  if (!paths.every((path) => listed.some((file) => file.startsWith(`${path}/`)))) {
    throw refusal("UPLOAD_CHECK_TOOLS_FOLDER_EMPTY", `${rev} has no copy of all three deploy folders, so there is no tools folder to check.`);
  }
  const archive = git(repo, ["archive", "--format=tar", rev, ...paths]);
  mkdirSync(dest, { recursive: true });
  execFileSync("tar", ["-x", "-C", dest], { input: archive, stdio: ["pipe", "pipe", "pipe"] });
}

/** Every .mjs file under the three folders, as a path from dialectical-engine/deploy/, sorted. */
function toolsIn(folder) {
  const found = [];
  for (const dir of FOLDERS) {
    for (const file of readdirSync(join(folder, DEPLOY, dir), { recursive: true })) {
      if (file.endsWith(".mjs")) found.push(`${dir}/${file.split(sep).join("/")}`);
    }
  }
  return found.sort();
}

/** One child process: the tool is imported with an emptied environment and no stdin. ok means it exited 0 in time. */
function loadOne(folder, node, tool, limitMs) {
  return new Promise((resolveResult) => {
    const child = spawn("env", ["-i", "PATH=/usr/bin:/bin", node, "--input-type=module", "-e", `await import('./${DEPLOY}/${tool}')`], { cwd: folder, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    let timedOut = false;
    let settled = false;
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    // The timer settles the result itself: a process the tool started may hold its error output open after the kill, and
    // then 'close' never comes. The error output is let go, so it cannot hold this process open either.
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); settle(false); child.stderr.destroy(); }, limitMs);
    const settle = (exitedCleanly) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const code = timedOut ? "TIMEOUT" : /ERR_[A-Z_]+/u.exec(stderr)?.[0];
      if (exitedCleanly && !timedOut) resolveResult({ tool, ok: true });
      else resolveResult(code === undefined ? { tool, ok: false } : { tool, ok: false, code });
    };
    child.on("error", () => settle(false));
    child.on("close", (status) => settle(status === 0));
  });
}

/**
 * Loads each server tool under <folder> on its own, one after another, and reports whether it loaded. limitMs replaces the
 * 30-second limit per tool; it is there for tests.
 */
export async function loadEachTool({ folder, node, only, skip = [], limitMs = LOAD_LIMIT_MS }) {
  const chosen = toolsIn(folder).filter((tool) => (only === undefined || only.includes(tool)) && !skip.includes(tool));
  const results = [];
  for (const tool of chosen) results.push(await loadOne(folder, node, tool, limitMs));
  return results;
}

/** The status and lines of check 1 for <rev>. An error that is not a refusal means the check could not finish: not-checked. */
async function verdictOf({ repo, rev, dest, node }) {
  try {
    await buildToolsFolder({ repo, rev, dest });
    const results = await loadEachTool({ folder: dest, node, skip: RELEASE_FOLDER_TOOLS });
    if (results.length === 0) return { status: "not-checked", lines: ["no server tools were found in the tools folder"] };
    const failed = results.filter((result) => !result.ok);
    return { status: failed.length === 0 ? "passed" : "refused", lines: failed.map((result) => `${result.tool}: ${result.code ?? "failed with no error code"}`) };
  } catch (error) {
    const text = String(error?.stderr ?? "").trim() || String(error?.message ?? error);
    const detail = text.trim().split("\n")[0];
    const refused = typeof error?.code === "string" && error.code.startsWith("UPLOAD_CHECK_");
    return refused ? { status: "refused", lines: [detail] } : { status: "not-checked", lines: [`the check could not finish: ${detail}`] };
  }
}

/** Check 1 as a CheckResult. The copy is made under <workdir> and removed afterwards, however the check ends. */
export async function checkToolsFolder({ repo, rev, workdir, node }) {
  const started = Date.now();
  const dest = join(workdir, "tools-folder");
  try {
    const { status, lines } = await verdictOf({ repo, rev, dest, node });
    return { name: "tools-folder", status, lines, seconds: (Date.now() - started) / 1000 };
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
}
