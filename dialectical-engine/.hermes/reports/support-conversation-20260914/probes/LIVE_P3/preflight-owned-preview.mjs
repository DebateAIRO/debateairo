import { execFileSync,spawnSync } from "node:child_process";

const productRoot = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const expectedRevision = "475c5a7e7eb8f48a3f5a81379f37b49fdd014ce9";
const historicalPid = 86341;
const run = (command,args) => execFileSync(command,args,{ encoding:"utf8" });
const head = run("git",["-C",productRoot,"rev-parse","HEAD"]).trim();
const status = run("git",["-C",productRoot,"status","--short"]);
if (head !== expectedRevision || status !== "") throw new Error("LIVE_P3_PRODUCT_CUSTODY_MISMATCH");
const ps = run("ps",["-o","pid=,ppid=,pgid=,etime=,command=","-p",String(historicalPid)]).trim();
const cwd = run("lsof",["-a","-p",String(historicalPid),"-d","cwd","-Fn"])
  .split("\n").find((line) => line.startsWith("n"))?.slice(1) ?? null;
const fields = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/u.exec(ps);
if (fields === null || Number(fields[1]) !== historicalPid || Number(fields[2]) !== 1
  || Number(fields[3]) !== historicalPid || !fields[5].includes("pnpm dev:auth:up")
  || cwd !== productRoot) {
  throw new Error("LIVE_P3_HISTORICAL_SUPERVISOR_NOT_OWNED");
}
const lsofResult = spawnSync("lsof",[
  "-nP","-iTCP:3000","-iTCP:3001","-iTCP:3100","-iTCP:3101",
  "-iTCP:8790","-iTCP:8791","-iTCP:8792","-iTCP:8793","-iTCP:8794","-iTCP:8795","-iTCP:8796",
  "-iTCP:8890","-iTCP:8891","-iTCP:8892","-iTCP:8893","-iTCP:8894","-iTCP:8895","-iTCP:8896","-sTCP:LISTEN"
],{ encoding:"utf8" });
if (![0,1].includes(lsofResult.status ?? -1) || lsofResult.error !== undefined) {
  throw new Error("LIVE_P3_LISTENER_INVENTORY_FAILED");
}
const lsof = lsofResult.stdout;
const ports = [...lsof.matchAll(/TCP 127\.0\.0\.1:(\d+) \(LISTEN\)/gu)].map((match) => Number(match[1]));
const preview = [3100,3101,8890,8891,8892,8893,8894,8895,8896];
if (preview.some((port) => !ports.includes(port))) throw new Error("LIVE_P3_PREVIEW_LISTENER_MISSING");
const httpStatus = Number(run("curl",[
  "--silent","--show-error","--output","/dev/null","--write-out","%{http_code}",
  "https://localhost:3100/login"
]));
if (httpStatus !== 200) throw new Error("LIVE_P3_PREVIEW_TLS_UNREADY");
process.stdout.write(JSON.stringify({
  observedAt:new Date().toISOString(),head,statusEntries:0,
  historicalSupervisor:{ pid:historicalPid,ppid:1,pgid:historicalPid,cwd,command:"pnpm dev:auth:up",elapsed:fields[4] },
  previewListeners:preview,
  originalListeners:[3000,3001,8790,8791,8792,8793,8794,8795,8796].filter((port) => ports.includes(port)),
  normalTlsLoginStatus:httpStatus
},null,2) + "\n");
