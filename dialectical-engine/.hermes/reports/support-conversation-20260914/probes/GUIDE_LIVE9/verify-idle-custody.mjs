import { execFileSync,spawnSync } from "node:child_process";
import { readFile,writeFile } from "node:fs/promises";

const report="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const product="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const revision="152eed4da1cd3e66b74d8301159ba76427552409";
const before=JSON.parse(await readFile(`${report}/evidence/GUIDE_LIVE9-readiness.json`,"utf8"));
const run=(file,args,options={}) => execFileSync(file,args,{ encoding:"utf8",...options }).trim();
const inventory=spawnSync("/usr/sbin/lsof",["-nP","-iTCP","-sTCP:LISTEN","-Fpcn"],{ encoding:"utf8" });
if (inventory.status !== 0 || inventory.error !== undefined) throw new Error("GUIDE_LIVE9_IDLE_LISTENER_INVENTORY_FAILED");
const rows=[]; let pid=null; let command=null;
for (const line of inventory.stdout.split("\n")) {
  if (line.startsWith("p")) pid=Number(line.slice(1)); else if (line.startsWith("c")) command=line.slice(1);
  else if (line.startsWith("n") && pid !== null && command !== null) { const match=/:(\d+)$/u.exec(line.slice(1)); if (match) rows.push({ pid,command,port:Number(match[1]) }); }
}
const ps=run("/bin/ps",["-o","pid=,ppid=,pgid=,command=","-p",String(before.pid)]);
const match=/^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/u.exec(ps);
const cwd=run("/usr/sbin/lsof",["-a","-p",String(before.pid),"-d","cwd","-Fn"]).split("\n").find(line => line.startsWith("n"))?.slice(1) ?? null;
const ports=before.previewListeners.map(row => row.port).sort((a,b) => a-b);
const preview=rows.filter(row => ports.includes(row.port));
const unrelated=rows.filter(row => !ports.includes(row.port));
const curl=spawnSync("/usr/bin/curl",["--silent","--show-error","--output","/dev/null","--write-out","%{http_code}","https://localhost:3100/help"],{ encoding:"utf8" });
const tlsStatus=Number(curl.stdout);
const clean=run("/usr/bin/git",["status","--porcelain=v1"],{ cwd:product }) === "";
if (!clean || match === null || Number(match[1]) !== before.pid || Number(match[2]) !== 1 || Number(match[3]) !== before.pid
  || !match[4].includes("pnpm dev:auth:up") || cwd !== product || preview.length !== ports.length
  || curl.status !== 0 || tlsStatus !== 200) throw new Error("GUIDE_LIVE9_IDLE_CUSTODY_INVALID");
const output={ schemaVersion:1,node:"GUIDE_LIVE9",phase:"POSTCAPTURE_IDLE",observedAt:new Date().toISOString(),revision,
  pid:before.pid,ppid:1,pgid:before.pid,cwd,command:"pnpm dev:auth:up",previewListeners:preview,
  unrelatedListenerCount:unrelated.length,ordinarySystemTls:{ url:"https://localhost:3100/help",customCa:false,insecure:false,status:tlsStatus },ongoingPrivateLogExcluded:true };
await writeFile(`${report}/evidence/GUIDE_LIVE9-idle-custody.json`,`${JSON.stringify(output,null,2)}\n`,{ flag:"wx",mode:0o600 });
process.stdout.write(`${JSON.stringify({ revision,pid:output.pid,previewListeners:preview.length,unrelatedListenerCount:unrelated.length,tlsStatus })}\n`);
