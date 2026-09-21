import { execFileSync,spawnSync } from "node:child_process";
import { readFile,writeFile } from "node:fs/promises";

const root="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const productRoot="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const revision="152eed4da1cd3e66b74d8301159ba76427552409";
const runtime=JSON.parse(await readFile(`${root}/evidence/GUIDE_RUNTIME6-stack-custody.json`,"utf8"));
const ready=JSON.parse(await readFile(`${root}/evidence/GUIDE_LIVE7-readiness.json`,"utf8"));
const run=(file,args,options={}) => execFileSync(file,args,{ encoding:"utf8",...options }).trim();
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function listeners() {
  const result=spawnSync("/usr/sbin/lsof",["-nP","-iTCP","-sTCP:LISTEN","-Fpcn"],{ encoding:"utf8" });
  if (result.status !== 0 || result.error !== undefined) throw new Error("GUIDE_LIVE7_IDLE_LISTENER_INVENTORY_FAILED");
  const rows=[]; let pid=null; let command=null;
  for (const line of result.stdout.split("\n")) {
    if (line.startsWith("p")) pid=Number(line.slice(1));
    else if (line.startsWith("c")) command=line.slice(1);
    else if (line.startsWith("n") && pid !== null && command !== null) {
      const match=/:(\d+)$/u.exec(line.slice(1)); if (match) rows.push({pid,command,port:Number(match[1])});
    }
  }
  return rows;
}
await wait(3000);
const ps=run("/bin/ps",["-o","pid=,ppid=,pgid=,command=","-p",String(runtime.pid)]);
const match=/^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/u.exec(ps);
const cwd=run("/usr/sbin/lsof",["-a","-p",String(runtime.pid),"-d","cwd","-Fn"]).split("\n").find(x=>x.startsWith("n"))?.slice(1) ?? null;
const current=listeners();
const previewPreserved=ready.previewListeners.every(before=>current.some(after=>after.pid===before.pid&&after.command===before.command&&after.port===before.port));
const unrelatedPreserved=ready.unrelatedListenerBaseline.every(before=>current.some(after=>after.pid===before.pid&&after.command===before.command&&after.port===before.port));
const curl=spawnSync("/usr/bin/curl",["--silent","--show-error","--output","/dev/null","--write-out","%{http_code}","https://localhost:3100/help"],{encoding:"utf8"});
const tlsStatus=Number(curl.stdout);
const head=run("/usr/bin/git",["rev-parse","HEAD"],{cwd:productRoot});
const clean=run("/usr/bin/git",["status","--porcelain=v1"],{cwd:productRoot}) === "";
if(head!==revision||!clean||match===null||Number(match[1])!==runtime.pid||Number(match[2])!==1||Number(match[3])!==runtime.pid
  ||!match[4].includes("pnpm dev:auth:up")||cwd!==productRoot||!previewPreserved||!unrelatedPreserved||curl.status!==0||tlsStatus!==200){
  throw new Error("GUIDE_LIVE7_IDLE_CUSTODY_INVALID");
}
const receipt={schemaVersion:1,observedAt:new Date().toISOString(),revision,pid:runtime.pid,ppid:1,pgid:runtime.pid,cwd,
  command:"pnpm dev:auth:up",previewListenersPreserved:ready.previewListeners.length,
  unrelatedListenersPreserved:ready.unrelatedListenerBaseline.length,
  ordinarySystemTls:{url:"https://localhost:3100/help",customCa:false,insecure:false,status:tlsStatus},
  ongoingPrivateLog:runtime.log};
await writeFile(`${root}/evidence/GUIDE_LIVE7-idle-custody.json`,`${JSON.stringify(receipt,null,2)}\n`,{mode:0o600,flag:"wx"});
process.stdout.write(`${JSON.stringify(receipt,null,2)}\n`);
