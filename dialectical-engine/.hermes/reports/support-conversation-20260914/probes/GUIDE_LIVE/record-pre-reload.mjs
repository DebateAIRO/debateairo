import { execFileSync,spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";

const pid=6142;
const productRoot="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const outputPath="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence/GUIDE_LIVE-pre-reload.json";
const previewPorts=[3100,3101,55433,7177,8988,8890,8891,8892,8893,8894,8895,8896];
const originalPorts=[3000,3001,55432,7077,8888,8790,8791,8792,8793,8794,8795,8796];
const run=(file,args,options={}) => execFileSync(file,args,{ encoding:"utf8",...options }).trim();
const ps=run("/bin/ps",["-o","pid=,ppid=,pgid=,etime=,command=","-p",String(pid)]);
const fields=/^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/u.exec(ps);
const cwd=run("/usr/sbin/lsof",["-a","-p",String(pid),"-d","cwd","-Fn"])
  .split("\n").find(line => line.startsWith("n"))?.slice(1) ?? null;
const listeners=[];
for (const port of [...previewPorts,...originalPorts]) {
  const found=spawnSync("/usr/sbin/lsof",["-nP",`-iTCP:${port}`,"-sTCP:LISTEN","-Fp"],{ encoding:"utf8" });
  if (found.status === 0 && /^p[0-9]+$/mu.test(found.stdout)) listeners.push(port);
}
const tlsStatus=Number(run("/usr/bin/curl",[
  "--silent","--show-error","--output","/dev/null","--write-out","%{http_code}",
  "https://localhost:3100/help"
]));
if (fields === null || Number(fields[1]) !== pid || Number(fields[2]) !== 1
  || Number(fields[3]) !== pid || !fields[5].includes("pnpm dev:auth:up")
  || cwd !== productRoot || !previewPorts.every(port => listeners.includes(port)) || tlsStatus !== 200) {
  throw new Error("GUIDE_LIVE_OLD_PREVIEW_NOT_OWNED");
}
const receipt={
  schemaVersion:1,observedAt:new Date().toISOString(),head:run("/usr/bin/git",["rev-parse","HEAD"],{ cwd:productRoot }),
  statusClean:run("/usr/bin/git",["status","--porcelain=v1"],{ cwd:productRoot }) === "",
  supervisor:{ pid,ppid:1,pgid:pid,elapsed:fields[4],command:"pnpm dev:auth:up",cwd },
  previewListeners:previewPorts,originalListeners:originalPorts.filter(port => listeners.includes(port)),
  ordinarySystemTls:{ url:"https://localhost:3100/help",customCa:false,insecure:false,status:tlsStatus }
};
await writeFile(outputPath,`${JSON.stringify(receipt,null,2)}\n`,{ mode:0o600,flag:"wx" });
process.stdout.write(`${JSON.stringify(receipt,null,2)}\n`);
