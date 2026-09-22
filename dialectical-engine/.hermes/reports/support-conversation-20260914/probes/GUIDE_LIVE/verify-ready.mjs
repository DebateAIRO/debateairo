import { execFileSync,spawnSync } from "node:child_process";
import { readFile,writeFile } from "node:fs/promises";

const reportRoot="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const productRoot="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const revision="91d17ae2a2748f3d48e14d9e56fdb8a2d8ee7c69";
const custody=JSON.parse(await readFile(`${reportRoot}/evidence/GUIDE_LIVE-stack-custody.json`,"utf8"));
const pid=custody.pid;
const previewPorts=[3100,3101,55433,7177,8988,8890,8891,8892,8893,8894,8895,8896];
const originalPorts=[3000,3001,55432,7077,8888,8790,8791,8792,8793,8794,8795,8796];
const wait=ms => new Promise(resolve => setTimeout(resolve,ms));
const run=(file,args,options={}) => execFileSync(file,args,{ encoding:"utf8",...options }).trim();
function listenerPorts() {
  const found=[];
  for (const port of [...previewPorts,...originalPorts]) {
    const result=spawnSync("/usr/sbin/lsof",["-nP",`-iTCP:${port}`,"-sTCP:LISTEN","-Fp"],{ encoding:"utf8" });
    if (result.status === 0 && /^p[0-9]+$/mu.test(result.stdout)) found.push(port);
    else if (![0,1].includes(result.status ?? -1) || result.error !== undefined) {
      throw new Error("GUIDE_LIVE_LISTENER_INVENTORY_FAILED");
    }
  }
  return found;
}
let listeners=[];
let tlsStatus=0;
for (let attempt=0;attempt<180;attempt+=1) {
  try { process.kill(pid,0); } catch { throw new Error("GUIDE_LIVE_SUPERVISOR_EXITED_BEFORE_READY"); }
  listeners=listenerPorts();
  if (previewPorts.every(port => listeners.includes(port))) {
    const curl=spawnSync("/usr/bin/curl",[
      "--silent","--show-error","--output","/dev/null","--write-out","%{http_code}",
      "https://localhost:3100/help"
    ],{ encoding:"utf8" });
    tlsStatus=Number(curl.stdout);
    if (curl.status === 0 && tlsStatus === 200) break;
  }
  await wait(500);
}
const head=run("/usr/bin/git",["rev-parse","HEAD"],{ cwd:productRoot });
const status=run("/usr/bin/git",["status","--porcelain=v1"],{ cwd:productRoot });
const ps=run("/bin/ps",["-o","pid=,ppid=,pgid=,command=","-p",String(pid)]);
const match=/^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/u.exec(ps);
const cwd=run("/usr/sbin/lsof",["-a","-p",String(pid),"-d","cwd","-Fn"])
  .split("\n").find(line => line.startsWith("n"))?.slice(1) ?? null;
if (head !== revision || status !== "" || match === null || Number(match[1]) !== pid
  || Number(match[2]) !== 1 || Number(match[3]) !== pid
  || !match[4].includes("pnpm dev:auth:up") || cwd !== productRoot
  || !previewPorts.every(port => listeners.includes(port)) || tlsStatus !== 200) {
  throw new Error("GUIDE_LIVE_SUPPORTED_STACK_NOT_READY");
}
const receipt={
  schemaVersion:1,observedAt:new Date().toISOString(),revision,pid,ppid:1,pgid:pid,cwd,
  command:"pnpm dev:auth:up",previewListeners:previewPorts,
  originalListenersPreserved:originalPorts.filter(port => listeners.includes(port)),
  ordinarySystemTls:{ url:"https://localhost:3100/help",customCa:false,insecure:false,status:tlsStatus }
};
await writeFile(`${reportRoot}/evidence/GUIDE_LIVE-readiness.json`,`${JSON.stringify(receipt,null,2)}\n`,{ mode:0o600,flag:"wx" });
process.stdout.write(`${JSON.stringify(receipt,null,2)}\n`);
