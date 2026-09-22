import { execFileSync, spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";

const reportRoot = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const productRoot = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const revision = "0b9320eae5a0ad8c9fcc9648ed85ebef1b289c13";
const oldPid = 60670;
const previewPorts = [3100, 3101, 55433, 7177, 8988, 8890, 8891, 8892, 8893, 8894, 8895, 8896];
const run = (file, args, options = {}) => execFileSync(file, args, { encoding: "utf8", ...options }).trim();

function processLine(pid) {
  const result = spawnSync("/bin/ps", ["-o", "pid=,ppid=,pgid=,command=", "-p", String(pid)], { encoding: "utf8" });
  if (result.status === 1 && result.stdout.trim() === "") return null;
  if (result.status !== 0 || result.error !== undefined) throw new Error("GUIDE_RUNTIME5_PROCESS_INVENTORY_FAILED");
  return result.stdout.trim();
}

function listeners() {
  const result = spawnSync("/usr/sbin/lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-Fpcn"], { encoding: "utf8" });
  if (result.status !== 0 || result.error !== undefined) throw new Error("GUIDE_RUNTIME5_LISTENER_INVENTORY_FAILED");
  const rows = [];
  let pid = null;
  let command = null;
  for (const line of result.stdout.split("\n")) {
    if (line.startsWith("p")) pid = Number(line.slice(1));
    else if (line.startsWith("c")) command = line.slice(1);
    else if (line.startsWith("n") && pid !== null && command !== null) {
      const match = /:(\d+)$/u.exec(line.slice(1));
      if (match !== null) rows.push({ pid, command, port: Number(match[1]) });
    }
  }
  return rows;
}

const head = run("/usr/bin/git", ["rev-parse", "HEAD"], { cwd: productRoot });
const statusClean = run("/usr/bin/git", ["status", "--porcelain=v1"], { cwd: productRoot }) === "";
const oldSupervisor = processLine(oldPid);
const unrelatedListeners = listeners();
const occupiedPreviewPorts = unrelatedListeners.filter((row) => previewPorts.includes(row.port));
if (head !== revision || !statusClean) throw new Error("GUIDE_RUNTIME5_PRODUCT_CUSTODY_MISMATCH");
if (oldSupervisor !== null) throw new Error("GUIDE_RUNTIME5_OLD_SUPERVISOR_STILL_PRESENT");
if (occupiedPreviewPorts.length !== 0) throw new Error("GUIDE_RUNTIME5_PREVIEW_PORT_ALREADY_OWNED_OR_UNKNOWN");

const receipt = {
  schemaVersion: 1,
  observedAt: new Date().toISOString(),
  revision,
  productRoot,
  statusClean,
  oldSupervisor: { pid: oldPid, present: false },
  previewPorts,
  occupiedPreviewPorts,
  unrelatedListeners,
};
await writeFile(`${reportRoot}/evidence/GUIDE_RUNTIME5-prestart.json`, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600, flag: "wx" });
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
