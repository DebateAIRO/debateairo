import { execFileSync,spawnSync } from "node:child_process";

const pid = 6142;
const productRoot = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const expectedPorts = [3100,3101,8890,8891,8892,8893,8894,8895,8896];
const originalPorts = [3000,3001,8790,8793,8794,8795,8796];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve,ms));
let finalPorts = [];
let status = 0;
for (let attempt = 0;attempt < 120;attempt += 1) {
  try { process.kill(pid,0); } catch { throw new Error("LIVE_P3_SUPERVISOR_EXITED_BEFORE_READY"); }
  const result = spawnSync("lsof",[
    "-nP",...expectedPorts.flatMap((port) => [`-iTCP:${port}`]),
    ...originalPorts.flatMap((port) => [`-iTCP:${port}`]),"-sTCP:LISTEN"
  ],{ encoding:"utf8" });
  if (![0,1].includes(result.status ?? -1) || result.error !== undefined) {
    throw new Error("LIVE_P3_READY_LISTENER_INVENTORY_FAILED");
  }
  finalPorts = [...result.stdout.matchAll(/TCP 127\.0\.0\.1:(\d+) \(LISTEN\)/gu)]
    .map((match) => Number(match[1]));
  if (expectedPorts.every((port) => finalPorts.includes(port))) {
    const curl = spawnSync("curl",[
      "--silent","--show-error","--output","/dev/null","--write-out","%{http_code}",
      "https://localhost:3100/help"
    ],{ encoding:"utf8" });
    status = Number(curl.stdout);
    if (curl.status === 0 && status === 200) break;
  }
  await wait(500);
}
if (!expectedPorts.every((port) => finalPorts.includes(port)) || status !== 200) {
  throw new Error("LIVE_P3_SUPPORTED_STACK_NOT_READY");
}
const ps = execFileSync("ps",["-o","pid=,ppid=,pgid=,command=","-p",String(pid)],{ encoding:"utf8" }).trim();
const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/u.exec(ps);
const cwd = execFileSync("lsof",["-a","-p",String(pid),"-d","cwd","-Fn"],{ encoding:"utf8" })
  .split("\n").find((line) => line.startsWith("n"))?.slice(1) ?? null;
if (match === null || Number(match[1]) !== pid || Number(match[2]) !== 1 || Number(match[3]) !== pid
  || !match[4].includes("pnpm dev:auth:up") || cwd !== productRoot
  || originalPorts.some((port) => !finalPorts.includes(port))) {
  throw new Error("LIVE_P3_READY_CUSTODY_INVALID");
}
process.stdout.write(JSON.stringify({
  observedAt:new Date().toISOString(),revision:"475c5a7e7eb8f48a3f5a81379f37b49fdd014ce9",
  pid,ppid:1,pgid:pid,cwd,command:"pnpm dev:auth:up",
  previewListeners:expectedPorts,originalListenersPreserved:originalPorts,normalTlsHelpStatus:status
},null,2) + "\n");
