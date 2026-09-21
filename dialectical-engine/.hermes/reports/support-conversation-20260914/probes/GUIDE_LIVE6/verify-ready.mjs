import { execFileSync,spawnSync } from "node:child_process";
import { readFile,writeFile } from "node:fs/promises";

const root="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const productRoot="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const revision="0b9320eae5a0ad8c9fcc9648ed85ebef1b289c13";
const runtime=JSON.parse(await readFile(`${root}/evidence/GUIDE_RUNTIME5-stack-custody-active.json`,"utf8"));
const baseline=JSON.parse(await readFile(`${root}/evidence/GUIDE_RUNTIME5-prestart.json`,"utf8"));
const pid=runtime.pid;
const run=(file,args,options={}) => execFileSync(file,args,{ encoding:"utf8",...options }).trim();
function listeners() {
  const result=spawnSync("/usr/sbin/lsof",["-nP","-iTCP","-sTCP:LISTEN","-Fpcn"],{ encoding:"utf8" });
  if (result.status !== 0 || result.error !== undefined) throw new Error("GUIDE_LIVE6_LISTENER_INVENTORY_FAILED");
  const rows=[]; let currentPid=null; let command=null;
  for (const line of result.stdout.split("\n")) {
    if (line.startsWith("p")) currentPid=Number(line.slice(1));
    else if (line.startsWith("c")) command=line.slice(1);
    else if (line.startsWith("n") && currentPid !== null && command !== null) {
      const match=/:(\d+)$/u.exec(line.slice(1));
      if (match !== null) rows.push({ pid:currentPid,command,port:Number(match[1]) });
    }
  }
  return rows;
}
const head=run("/usr/bin/git",["rev-parse","HEAD"],{ cwd:productRoot });
const statusClean=run("/usr/bin/git",["status","--porcelain=v1"],{ cwd:productRoot }) === "";
const ps=run("/bin/ps",["-o","pid=,ppid=,pgid=,command=","-p",String(pid)]);
const match=/^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/u.exec(ps);
const cwd=run("/usr/sbin/lsof",["-a","-p",String(pid),"-d","cwd","-Fn"])
  .split("\n").find(line => line.startsWith("n"))?.slice(1) ?? null;
const current=listeners();
const preview=baseline.previewPorts.filter(port => current.some(row => row.port === port));
const unrelatedPreserved=baseline.unrelatedListeners.filter(before =>
  current.some(after => after.pid === before.pid && after.command === before.command && after.port === before.port));
const curl=spawnSync("/usr/bin/curl",[
  "--silent","--show-error","--output","/dev/null","--write-out","%{http_code}",
  "https://localhost:3100/help"
],{ encoding:"utf8" });
const tlsStatus=Number(curl.stdout);
if (head !== revision || !statusClean || runtime.revision !== revision || runtime.log !== `${root}/logs/GUIDE_LIVE5-stack.log`
  || match === null || Number(match[1]) !== pid || Number(match[2]) !== 1 || Number(match[3]) !== pid
  || !match[4].includes("pnpm dev:auth:up") || cwd !== productRoot || preview.length !== baseline.previewPorts.length
  || unrelatedPreserved.length !== baseline.unrelatedListeners.length || curl.status !== 0 || tlsStatus !== 200) {
  throw new Error("GUIDE_LIVE6_RUNTIME_CUSTODY_INVALID");
}
const receipt={
  schemaVersion:1,observedAt:new Date().toISOString(),revision,pid,ppid:1,pgid:pid,cwd,
  command:"pnpm dev:auth:up",previewListeners:preview,
  unrelatedListenersPreserved:unrelatedPreserved,
  ordinarySystemTls:{ url:"https://localhost:3100/help",customCa:false,insecure:false,status:tlsStatus },
  ongoingPrivateLog:runtime.log
};
await writeFile(`${root}/evidence/GUIDE_LIVE6-readiness.json`,`${JSON.stringify(receipt,null,2)}\n`,{ mode:0o600,flag:"wx" });
process.stdout.write(`${JSON.stringify(receipt,null,2)}\n`);
