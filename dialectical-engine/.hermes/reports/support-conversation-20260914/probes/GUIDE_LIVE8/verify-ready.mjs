import { execFileSync,spawnSync } from "node:child_process";
import { readFile,writeFile } from "node:fs/promises";

const reportRoot="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const productRoot="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const revision="152eed4da1cd3e66b74d8301159ba76427552409";
const custody=JSON.parse(await readFile(`${reportRoot}/evidence/GUIDE_RUNTIME6-stack-custody.json`,"utf8"));
const runtimeReadiness=JSON.parse(await readFile(`${reportRoot}/evidence/GUIDE_RUNTIME6-readiness.json`,"utf8"));
const run=(file,args,options={}) => execFileSync(file,args,{ encoding:"utf8",...options }).trim();
const result=spawnSync("/usr/sbin/lsof",["-nP","-iTCP","-sTCP:LISTEN","-Fpcn"],{ encoding:"utf8" });
if (result.status !== 0 || result.error !== undefined) throw new Error("GUIDE_LIVE8_LISTENER_INVENTORY_FAILED");
const rows=[];
let pid=null;
let command=null;
for (const line of result.stdout.split("\n")) {
  if (line.startsWith("p")) pid=Number(line.slice(1));
  else if (line.startsWith("c")) command=line.slice(1);
  else if (line.startsWith("n") && pid !== null && command !== null) {
    const match=/:(\d+)$/u.exec(line.slice(1));
    if (match) rows.push({ pid,command,port:Number(match[1]) });
  }
}
rows.sort((a,b) => a.port-b.port || a.pid-b.pid || a.command.localeCompare(b.command));
const ps=run("/bin/ps",["-o","pid=,ppid=,pgid=,command=","-p",String(custody.pid)]);
const match=/^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/u.exec(ps);
const cwd=run("/usr/sbin/lsof",["-a","-p",String(custody.pid),"-d","cwd","-Fn"])
  .split("\n").find(line => line.startsWith("n"))?.slice(1) ?? null;
const previewPorts=runtimeReadiness.previewListeners.map(row => row.port).sort((a,b) => a-b);
const previewListeners=rows.filter(row => previewPorts.includes(row.port));
const unrelatedListeners=rows.filter(row => !previewPorts.includes(row.port));
const curl=spawnSync("/usr/bin/curl",["--silent","--show-error","--output","/dev/null","--write-out","%{http_code}","https://localhost:3100/help"],{ encoding:"utf8" });
const tlsStatus=Number(curl.stdout);
const head=run("/usr/bin/git",["rev-parse","HEAD"],{ cwd:productRoot });
const clean=run("/usr/bin/git",["status","--porcelain=v1"],{ cwd:productRoot }) === "";
if (head !== revision || !clean || match === null || Number(match[1]) !== custody.pid
  || Number(match[2]) !== 1 || Number(match[3]) !== custody.pid || !match[4].includes("pnpm dev:auth:up")
  || cwd !== productRoot || previewListeners.length !== previewPorts.length
  || !previewPorts.every(port => previewListeners.some(row => row.port === port))
  || curl.status !== 0 || tlsStatus !== 200) throw new Error("GUIDE_LIVE8_READINESS_INVALID");
const receipt={
  schemaVersion:1,node:"GUIDE_LIVE8",phase:"PRETRAFFIC_READINESS",observedAt:new Date().toISOString(),
  revision,pid:custody.pid,ppid:1,pgid:custody.pid,cwd,command:"pnpm dev:auth:up",
  previewListeners,unrelatedListeners,
  ordinarySystemTls:{ url:"https://localhost:3100/help",customCa:false,insecure:false,status:tlsStatus },
  ongoingPrivateLogExcluded:true
};
await writeFile(`${reportRoot}/evidence/GUIDE_LIVE8-readiness.json`,`${JSON.stringify(receipt,null,2)}\n`,{ mode:0o600,flag:"wx" });
process.stdout.write(`${JSON.stringify({ revision,pid:receipt.pid,ppid:1,pgid:receipt.pgid,previewListeners:previewListeners.length,unrelatedListeners:unrelatedListeners.length,tlsStatus },null,2)}\n`);
