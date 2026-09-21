import { execFileSync, spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

const reportRoot = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const productRoot = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const revision = "0b9320eae5a0ad8c9fcc9648ed85ebef1b289c13";
const custody = JSON.parse(await readFile(`${reportRoot}/evidence/GUIDE_RUNTIME5-stack-custody-active.json`, "utf8"));
const prestart = JSON.parse(await readFile(`${reportRoot}/evidence/GUIDE_RUNTIME5-prestart.json`, "utf8"));
const pid = custody.pid;
const previewPorts = prestart.previewPorts;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const run = (file, args, options = {}) => execFileSync(file, args, { encoding: "utf8", ...options }).trim();

function listenerRows() {
  const result = spawnSync("/usr/sbin/lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-Fpcn"], { encoding: "utf8" });
  if (result.status !== 0 || result.error !== undefined) throw new Error("GUIDE_RUNTIME5_LISTENER_INVENTORY_FAILED");
  const rows = [];
  let listenerPid = null;
  let command = null;
  for (const line of result.stdout.split("\n")) {
    if (line.startsWith("p")) listenerPid = Number(line.slice(1));
    else if (line.startsWith("c")) command = line.slice(1);
    else if (line.startsWith("n") && listenerPid !== null && command !== null) {
      const match = /:(\d+)$/u.exec(line.slice(1));
      if (match !== null) rows.push({ pid: listenerPid, command, port: Number(match[1]) });
    }
  }
  return rows;
}

let currentListeners = [];
let tlsStatus = 0;
for (let attempt = 0; attempt < 240; attempt += 1) {
  try { process.kill(pid, 0); } catch { throw new Error("GUIDE_RUNTIME5_SUPERVISOR_EXITED_BEFORE_READY"); }
  currentListeners = listenerRows();
  if (previewPorts.every((port) => currentListeners.some((row) => row.port === port))) {
    const curl = spawnSync("/usr/bin/curl", [
      "--silent", "--show-error", "--output", "/dev/null", "--write-out", "%{http_code}",
      "https://localhost:3100/help",
    ], { encoding: "utf8" });
    tlsStatus = Number(curl.stdout);
    if (curl.status === 0 && tlsStatus === 200) break;
  }
  await wait(500);
}
const head = run("/usr/bin/git", ["rev-parse", "HEAD"], { cwd: productRoot });
const statusClean = run("/usr/bin/git", ["status", "--porcelain=v1"], { cwd: productRoot }) === "";
const ps = run("/bin/ps", ["-o", "pid=,ppid=,pgid=,command=", "-p", String(pid)]);
const match = /^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/u.exec(ps);
const cwd = run("/usr/sbin/lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"])
  .split("\n").find((line) => line.startsWith("n"))?.slice(1) ?? null;
const previewListeners = currentListeners.filter((row) => previewPorts.includes(row.port));
const unrelatedListenersPreserved = prestart.unrelatedListeners.filter((before) =>
  currentListeners.some((after) => after.pid === before.pid && after.command === before.command && after.port === before.port));
if (head !== revision || !statusClean || match === null || Number(match[1]) !== pid
  || Number(match[2]) !== 1 || Number(match[3]) !== pid || !match[4].includes("pnpm dev:auth:up")
  || cwd !== productRoot || !previewPorts.every((port) => previewListeners.some((row) => row.port === port))
  || unrelatedListenersPreserved.length !== prestart.unrelatedListeners.length || tlsStatus !== 200) {
  throw new Error("GUIDE_RUNTIME5_SUPPORTED_STACK_NOT_READY");
}
const receipt = {
  schemaVersion: 1,
  observedAt: new Date().toISOString(),
  revision,
  pid,
  ppid: 1,
  pgid: pid,
  cwd,
  command: "pnpm dev:auth:up",
  previewListeners,
  unrelatedListenersPreserved,
  ordinarySystemTls: { url: "https://localhost:3100/help", customCa: false, insecure: false, status: tlsStatus },
};
await writeFile(`${reportRoot}/evidence/GUIDE_RUNTIME5-readiness.json`, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600, flag: "wx" });
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
