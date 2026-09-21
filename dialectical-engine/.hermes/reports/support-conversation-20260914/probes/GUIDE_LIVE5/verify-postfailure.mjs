import { execFileSync,spawnSync } from "node:child_process";
import { readFile,writeFile } from "node:fs/promises";

const root="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const productRoot="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const revision="0b9320eae5a0ad8c9fcc9648ed85ebef1b289c13";
const ready=JSON.parse(await readFile(`${root}/evidence/GUIDE_LIVE5-readiness.json`,"utf8"));
const run=(file,args,options={}) => execFileSync(file,args,{ encoding:"utf8",...options }).trim();
const ps=run("/bin/ps",["-o","pid=,ppid=,pgid=,command=","-p",String(ready.pid)]);
const match=/^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/u.exec(ps);
const listeners=[];
for (const port of ready.previewListeners) {
  const result=spawnSync("/usr/sbin/lsof",["-nP",`-iTCP:${port}`,"-sTCP:LISTEN","-Fp"],{ encoding:"utf8" });
  if (result.status === 0 && /^p[0-9]+$/mu.test(result.stdout)) listeners.push(port);
  else if (![0,1].includes(result.status ?? -1) || result.error !== undefined) throw new Error("GUIDE_LIVE5_LISTENER_INVENTORY_FAILED");
}
const curl=spawnSync("/usr/bin/curl",[
  "--silent","--show-error","--output","/dev/null","--write-out","%{http_code}",
  "https://localhost:3100/help"
],{ encoding:"utf8" });
const tlsStatus=Number(curl.stdout);
const head=run("/usr/bin/git",["rev-parse","HEAD"],{ cwd:productRoot });
const statusClean=run("/usr/bin/git",["status","--porcelain=v1"],{ cwd:productRoot }) === "";
if (head !== revision || !statusClean || match === null || Number(match[1]) !== ready.pid
  || Number(match[2]) !== 1 || Number(match[3]) !== ready.pid || !match[4].includes("pnpm dev:auth:up")
  || listeners.length !== ready.previewListeners.length || curl.status !== 0 || tlsStatus !== 200) {
  throw new Error("GUIDE_LIVE5_POSTFAILURE_CUSTODY_INVALID");
}
const receipt={
  schemaVersion:1,observedAt:new Date().toISOString(),revision,pid:ready.pid,ppid:1,pgid:ready.pid,
  previewListeners:listeners,
  ordinarySystemTls:{ url:"https://localhost:3100/help",customCa:false,insecure:false,status:tlsStatus },
  captureStarted:false,supportRequests:0,modelRequests:0,
  ongoingPrivateLog:`${root}/logs/GUIDE_LIVE5-stack.log`
};
await writeFile(`${root}/evidence/GUIDE_LIVE5-postfailure-custody.json`,`${JSON.stringify(receipt,null,2)}\n`,{ mode:0o600,flag:"wx" });
process.stdout.write(`${JSON.stringify(receipt,null,2)}\n`);
