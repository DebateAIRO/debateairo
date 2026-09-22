import { execFileSync, spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

const reportRoot = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const productRoot = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const revision = "152eed4da1cd3e66b74d8301159ba76427552409";
const custody = JSON.parse(await readFile(`${reportRoot}/evidence/GUIDE_RUNTIME6-stack-custody.json`, "utf8"));
const readiness = JSON.parse(await readFile(`${reportRoot}/evidence/GUIDE_RUNTIME6-readiness.json`, "utf8"));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const run = (file, args, options = {}) => execFileSync(file, args, { encoding: "utf8", ...options }).trim();
await wait(3000);
const ps = run("/bin/ps", ["-o", "pid=,ppid=,pgid=,command=", "-p", String(custody.pid)]);
const match = /^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/u.exec(ps);
const cwd = run("/usr/sbin/lsof", ["-a", "-p", String(custody.pid), "-d", "cwd", "-Fn"])
  .split("\n").find((line) => line.startsWith("n"))?.slice(1) ?? null;
const livePorts = [];
for (const port of readiness.previewListeners.map((row) => row.port)) {
  const result = spawnSync("/usr/sbin/lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-Fp"], { encoding: "utf8" });
  if (result.status === 0 && /^p[0-9]+$/mu.test(result.stdout)) livePorts.push(port);
  else if (![0, 1].includes(result.status ?? -1) || result.error !== undefined) throw new Error("GUIDE_RUNTIME6_LISTENER_INVENTORY_FAILED");
}
const curl = spawnSync("/usr/bin/curl", ["--silent", "--show-error", "--output", "/dev/null", "--write-out", "%{http_code}", "https://localhost:3100/help"], { encoding: "utf8" });
const tlsStatus = Number(curl.stdout);
const head = run("/usr/bin/git", ["rev-parse", "HEAD"], { cwd: productRoot });
const statusClean = run("/usr/bin/git", ["status", "--porcelain=v1"], { cwd: productRoot }) === "";
if (head !== revision || !statusClean || match === null || Number(match[1]) !== custody.pid
  || Number(match[2]) !== 1 || Number(match[3]) !== custody.pid || !match[4].includes("pnpm dev:auth:up")
  || cwd !== productRoot || livePorts.length !== readiness.previewListeners.length || curl.status !== 0 || tlsStatus !== 200) {
  throw new Error("GUIDE_RUNTIME6_IDLE_CUSTODY_FAILED");
}
const receipt = {
  schemaVersion: 1,
  observedAt: new Date().toISOString(),
  revision,
  pid: custody.pid,
  ppid: 1,
  pgid: custody.pid,
  cwd,
  command: "pnpm dev:auth:up",
  previewListeners: livePorts,
  ordinarySystemTls: { url: "https://localhost:3100/help", customCa: false, insecure: false, status: tlsStatus },
  ongoingPrivateLog: custody.log,
};
await writeFile(`${reportRoot}/evidence/GUIDE_RUNTIME6-idle-custody.json`, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600, flag: "wx" });
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
