import { execFileSync,spawnSync } from "node:child_process";
import { readFile,writeFile } from "node:fs/promises";

const pid=6142;
const productRoot="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const reportRoot="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const previewPorts=[3100,3101,55433,7177,8988,8890,8891,8892,8893,8894,8895,8896];
const pre=JSON.parse(await readFile(`${reportRoot}/evidence/GUIDE_LIVE-pre-reload.json`,"utf8"));
const run=(file,args) => execFileSync(file,args,{ encoding:"utf8" }).trim();
const ps=run("/bin/ps",["-o","pid=,ppid=,pgid=,command=","-p",String(pid)]);
const fields=/^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/u.exec(ps);
const cwd=run("/usr/sbin/lsof",["-a","-p",String(pid),"-d","cwd","-Fn"])
  .split("\n").find(line => line.startsWith("n"))?.slice(1) ?? null;
if (fields === null || Number(fields[1]) !== pid || Number(fields[2]) !== 1
  || Number(fields[3]) !== pid || !fields[4].includes("pnpm dev:auth:up") || cwd !== productRoot) {
  throw new Error("GUIDE_LIVE_STOP_OWNERSHIP_INVALID");
}
process.kill(pid,"SIGTERM");
const wait=ms => new Promise(resolve => setTimeout(resolve,ms));
let exited=false;
for (let attempt=0;attempt<120;attempt+=1) {
  try { process.kill(pid,0); } catch { exited=true; break; }
  await wait(250);
}
function listening(port) {
  const result=spawnSync("/usr/sbin/lsof",["-nP",`-iTCP:${port}`,"-sTCP:LISTEN","-Fp"],{ encoding:"utf8" });
  return result.status === 0 && /^p[0-9]+$/mu.test(result.stdout);
}
const previewRemaining=previewPorts.filter(listening);
const originalMissing=pre.originalListeners.filter(port => !listening(port));
if (!exited || previewRemaining.length !== 0 || originalMissing.length !== 0) {
  throw new Error("GUIDE_LIVE_OWNED_PREVIEW_STOP_FAILED");
}
const receipt={
  schemaVersion:1,stoppedAt:new Date().toISOString(),pid,signal:"SIGTERM",exited,
  previewRemaining,originalListenersPreserved:pre.originalListeners
};
await writeFile(`${reportRoot}/evidence/GUIDE_LIVE-stop-receipt.json`,`${JSON.stringify(receipt,null,2)}\n`,{ mode:0o600,flag:"wx" });
process.stdout.write(`${JSON.stringify(receipt,null,2)}\n`);
