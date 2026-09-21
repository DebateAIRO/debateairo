import { execFileSync,spawnSync } from "node:child_process";
import { readFile,writeFile } from "node:fs/promises";

const pid=65268;
const productRoot="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const reportRoot="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const historicalRevision="f3be0af81f1691db6c23494f9e286bb6b10f13bf";
const finalRevision="0b9320eae5a0ad8c9fcc9648ed85ebef1b289c13";
const historicalCustody=JSON.parse(await readFile(`${reportRoot}/evidence/GUIDE_LIVE2-stack-custody.json`,"utf8"));
const transientPorts=[3100,3101,8890,8891,8892,8893,8894,8895,8896];
const dataPlanePorts=[55433,7177,8988];
const originalPorts=[3000,3001,55432,7077,8888,8790,8791,8792,8793,8794,8795,8796];
const run=(file,args,options={}) => execFileSync(file,args,{ encoding:"utf8",...options }).trim();
function listening(port) {
  const result=spawnSync("/usr/sbin/lsof",["-nP",`-iTCP:${port}`,"-sTCP:LISTEN","-Fp"],{ encoding:"utf8" });
  if (![0,1].includes(result.status ?? -1) || result.error !== undefined) {
    throw new Error("GUIDE_LIVE4_LISTENER_INVENTORY_FAILED");
  }
  return result.status === 0 && /^p[0-9]+$/mu.test(result.stdout);
}
function processState() {
  const result=spawnSync("/bin/ps",["-o","pid=,ppid=,pgid=,stat=,etime=,command=","-p",String(pid)],{ encoding:"utf8" });
  if (result.status === 1 && result.stdout.trim() === "") return null;
  if (result.status !== 0) throw new Error("GUIDE_LIVE4_PROCESS_INVENTORY_FAILED");
  return result.stdout.trim();
}
const ps=processState();
const fields=/^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(.+)$/u.exec(ps ?? "");
const cwd=run("/usr/sbin/lsof",["-a","-p",String(pid),"-d","cwd","-Fn"])
  .split("\n").find(line => line.startsWith("n"))?.slice(1) ?? null;
const head=run("/usr/bin/git",["rev-parse","HEAD"],{ cwd:productRoot });
const statusClean=run("/usr/bin/git",["status","--porcelain=v1"],{ cwd:productRoot }) === "";
const originalListeners=originalPorts.filter(listening);
const previewListeners=[...transientPorts,...dataPlanePorts].filter(listening);
const tls=spawnSync("/usr/bin/curl",[
  "--silent","--show-error","--output","/dev/null","--write-out","%{http_code}",
  "https://localhost:3100/help"
],{ encoding:"utf8" });
const tlsStatus=Number(tls.stdout);
if (fields === null || Number(fields[1]) !== pid || Number(fields[2]) !== 1
  || Number(fields[3]) !== pid || !fields[6].includes("pnpm dev:auth:up")
  || cwd !== productRoot || head !== finalRevision || !statusClean
  || historicalCustody.revision !== historicalRevision || historicalCustody.pid !== pid
  || historicalCustody.processGroup !== pid || historicalCustody.cwd !== productRoot
  || historicalCustody.log !== `${reportRoot}/logs/GUIDE_LIVE2-stack.log`
  || ![...transientPorts,...dataPlanePorts].every(port => previewListeners.includes(port))
  || tls.status !== 0 || tlsStatus !== 200) {
  throw new Error("GUIDE_LIVE4_OLD_PREVIEW_NOT_OWNED");
}
const before={
  schemaVersion:1,observedAt:new Date().toISOString(),historicalRevision,finalRevision,head,statusClean,
  supervisor:{ pid,ppid:1,pgid:pid,state:fields[4],elapsed:fields[5],command:"pnpm dev:auth:up",cwd },
  transientListeners:transientPorts,dataPlaneListeners:dataPlanePorts,
  originalListeners,ordinarySystemTls:{ url:"https://localhost:3100/help",customCa:false,insecure:false,status:tlsStatus }
};
await writeFile(`${reportRoot}/evidence/GUIDE_LIVE4-pre-reload.json`,`${JSON.stringify(before,null,2)}\n`,{ mode:0o600,flag:"wx" });
process.kill(-pid,"SIGTERM");
const wait=ms => new Promise(resolve => setTimeout(resolve,ms));
let supervisorExited=false;
let transientRemaining=[];
for (let attempt=0;attempt<160;attempt+=1) {
  const current=processState();
  supervisorExited=current === null || /^\d+\s+\d+\s+\d+\s+Z/u.test(current);
  transientRemaining=transientPorts.filter(listening);
  if (supervisorExited && transientRemaining.length === 0) break;
  await wait(250);
}
const originalMissing=originalListeners.filter(port => !listening(port));
const reusableDataPlane=dataPlanePorts.filter(listening);
if (!supervisorExited || transientRemaining.length !== 0 || originalMissing.length !== 0) {
  throw new Error("GUIDE_LIVE4_OWNED_PREVIEW_STOP_FAILED");
}
const receipt={
  schemaVersion:1,stoppedAt:new Date().toISOString(),pid,processGroup:pid,
  signal:"SIGTERM",scope:"VERIFIED_OWNED_PROCESS_GROUP",supervisorExited,
  transientRemaining,reusableDataPlane,originalListenersPreserved:originalListeners
};
await writeFile(`${reportRoot}/evidence/GUIDE_LIVE4-stop-receipt.json`,`${JSON.stringify(receipt,null,2)}\n`,{ mode:0o600,flag:"wx" });
process.stdout.write(`${JSON.stringify({ before,receipt },null,2)}\n`);
