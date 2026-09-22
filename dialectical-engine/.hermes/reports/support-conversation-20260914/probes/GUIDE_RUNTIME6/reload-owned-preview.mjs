import { execFileSync, spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

const reportRoot = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const productRoot = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const oldRevision = "0b9320eae5a0ad8c9fcc9648ed85ebef1b289c13";
const finalRevision = "152eed4da1cd3e66b74d8301159ba76427552409";
const oldPid = 20420;
const previewPorts = [3100, 3101, 55433, 7177, 8988, 8890, 8891, 8892, 8893, 8894, 8895, 8896];
const dataPlanePorts = [55433, 7177, 8988];
const transientPorts = previewPorts.filter((port) => !dataPlanePorts.includes(port));
const run = (file, args, options = {}) => execFileSync(file, args, { encoding: "utf8", ...options }).trim();
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function processLine(pid) {
  const result = spawnSync("/bin/ps", ["-o", "pid=,ppid=,pgid=,stat=,etime=,command=", "-p", String(pid)], { encoding: "utf8" });
  if (result.status === 1 && result.stdout.trim() === "") return null;
  if (result.status !== 0 || result.error !== undefined) throw new Error("GUIDE_RUNTIME6_PROCESS_INVENTORY_FAILED");
  return result.stdout.trim();
}

function processGroupMembers(pgid) {
  const output = run("/bin/ps", ["-axo", "pid=,ppid=,pgid=,command="]);
  return output.split("\n").map((line) => {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/u.exec(line);
    return match === null ? null : { pid: Number(match[1]), ppid: Number(match[2]), pgid: Number(match[3]), command: match[4] };
  }).filter((row) => row !== null && row.pgid === pgid);
}

function listeners() {
  const result = spawnSync("/usr/sbin/lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-Fpcn"], { encoding: "utf8" });
  if (result.status !== 0 || result.error !== undefined) throw new Error("GUIDE_RUNTIME6_LISTENER_INVENTORY_FAILED");
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

const custody = JSON.parse(await readFile(`${reportRoot}/evidence/GUIDE_RUNTIME5-stack-custody-active.json`, "utf8"));
const oldReady = JSON.parse(await readFile(`${reportRoot}/evidence/GUIDE_RUNTIME5-readiness.json`, "utf8"));
const head = run("/usr/bin/git", ["rev-parse", "HEAD"], { cwd: productRoot });
const statusClean = run("/usr/bin/git", ["status", "--porcelain=v1"], { cwd: productRoot }) === "";
const ps = processLine(oldPid);
const fields = /^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(.+)$/u.exec(ps ?? "");
const cwd = run("/usr/sbin/lsof", ["-a", "-p", String(oldPid), "-d", "cwd", "-Fn"])
  .split("\n").find((line) => line.startsWith("n"))?.slice(1) ?? null;
const groupMembers = processGroupMembers(oldPid);
const currentListeners = listeners();
const previewListeners = currentListeners.filter((row) => previewPorts.includes(row.port));
const unrelatedListeners = currentListeners.filter((row) => !previewPorts.includes(row.port));
const groupPids = new Set(groupMembers.map((row) => row.pid));
const oldListenerByPort = new Map(oldReady.previewListeners.map((row) => [row.port, row]));
const listenerOwnershipValid = previewPorts.every((port) => {
  const rows = previewListeners.filter((row) => row.port === port);
  const old = oldListenerByPort.get(port);
  return rows.length === 1 && old !== undefined && rows[0].pid === old.pid && rows[0].command === old.command
    && (dataPlanePorts.includes(port) ? rowMatchesDocker(rows[0]) : groupPids.has(rows[0].pid));
});
function rowMatchesDocker(row) {
  return row.command === "com.docker.backend";
}

if (head !== finalRevision || !statusClean || fields === null || Number(fields[1]) !== oldPid
  || Number(fields[2]) !== 1 || Number(fields[3]) !== oldPid || !fields[6].includes("pnpm dev:auth:up")
  || cwd !== productRoot || custody.revision !== oldRevision || custody.pid !== oldPid
  || custody.processGroup !== oldPid || custody.cwd !== productRoot || custody.profile !== "support-preview"
  || custody.log !== `${reportRoot}/logs/GUIDE_LIVE5-stack.log` || groupMembers.length < 2
  || !listenerOwnershipValid || previewListeners.length !== previewPorts.length) {
  throw new Error("GUIDE_RUNTIME6_OLD_PREVIEW_OWNERSHIP_MISMATCH");
}

const before = {
  schemaVersion: 1,
  observedAt: new Date().toISOString(),
  oldRevision,
  finalRevision,
  head,
  statusClean,
  supervisor: { pid: oldPid, ppid: 1, pgid: oldPid, state: fields[4], elapsed: fields[5], command: "pnpm dev:auth:up", cwd },
  groupMembers,
  previewListeners,
  unrelatedListeners,
  oldPrivateLogRetainedWithoutRead: custody.log,
};
await writeFile(`${reportRoot}/evidence/GUIDE_RUNTIME6-pre-reload.json`, `${JSON.stringify(before, null, 2)}\n`, { mode: 0o600, flag: "wx" });

process.kill(-oldPid, "SIGTERM");
let supervisorExited = false;
let transientRemaining = [];
for (let attempt = 0; attempt < 160; attempt += 1) {
  const current = processLine(oldPid);
  supervisorExited = current === null || /^\d+\s+\d+\s+\d+\s+Z/u.test(current);
  transientRemaining = listeners().filter((row) => transientPorts.includes(row.port));
  if (supervisorExited && transientRemaining.length === 0) break;
  await wait(250);
}
const afterStop = listeners();
const unrelatedMissing = unrelatedListeners.filter((beforeRow) => !afterStop.some((afterRow) =>
  afterRow.pid === beforeRow.pid && afterRow.command === beforeRow.command && afterRow.port === beforeRow.port));
const reusableDataPlane = afterStop.filter((row) => dataPlanePorts.includes(row.port));
if (!supervisorExited || transientRemaining.length !== 0 || unrelatedMissing.length !== 0
  || reusableDataPlane.length !== dataPlanePorts.length) {
  throw new Error("GUIDE_RUNTIME6_OWNED_PREVIEW_STOP_FAILED");
}
const stop = {
  schemaVersion: 1,
  stoppedAt: new Date().toISOString(),
  pid: oldPid,
  processGroup: oldPid,
  signal: "SIGTERM",
  scope: "VERIFIED_OWNED_PROCESS_GROUP",
  supervisorExited,
  transientRemaining,
  reusableDataPlane,
  unrelatedListenersPreserved: unrelatedListeners,
};
await writeFile(`${reportRoot}/evidence/GUIDE_RUNTIME6-stop.json`, `${JSON.stringify(stop, null, 2)}\n`, { mode: 0o600, flag: "wx" });
process.stdout.write(`${JSON.stringify({ before, stop }, null, 2)}\n`);
