import { execFileSync, spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
const R="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const W="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const revision="0d34f82f4a2188d0ce1db04655b693798ffd2169";
const transient=[3100,3101,8890,8891,8892,8893,8894,8895,8896],data=[55433,7177,8988];
const run=(f,a,o={})=>execFileSync(f,a,{encoding:"utf8",...o}).trim();
function listeners(){const x=spawnSync("/usr/sbin/lsof",["-nP","-iTCP","-sTCP:LISTEN","-Fpcn"],{encoding:"utf8"});if(x.status!==0)throw new Error("GUIDE_PREVIEW_RECOVER34_LISTENER_INVENTORY_FAILED");const rows=[];let pid=null,command=null;for(const line of x.stdout.split("\n")){if(line.startsWith("p"))pid=Number(line.slice(1));else if(line.startsWith("c"))command=line.slice(1);else if(line.startsWith("n")&&pid!==null&&command!==null){const m=/:(\d+)$/u.exec(line.slice(1));if(m)rows.push({pid,command,port:Number(m[1])})}}return rows}
const all=listeners(),head=run("/usr/bin/git",["rev-parse","HEAD"],{cwd:W}),clean=run("/usr/bin/git",["status","--porcelain=v1"],{cwd:W})==="";
if(head!==revision||!clean||transient.some(p=>all.some(r=>r.port===p))||data.some(p=>all.filter(r=>r.port===p).length!==1))throw new Error("GUIDE_PREVIEW_RECOVER34_PRESTART_INVALID");
const unrelatedListeners=all.filter(r=>!data.includes(r.port));
const out={schemaVersion:1,node:"GUIDE_PREVIEW_RECOVER34",observedAtUtc:new Date().toISOString(),revision,head,statusClean:clean,transientPortsFree:true,dataPlaneListeners:all.filter(r=>data.includes(r.port)),unrelatedListeners};
await writeFile(`${R}/evidence/GUIDE_PREVIEW_RECOVER34-pre-start.json`,`${JSON.stringify(out,null,2)}\n`,{flag:"wx",mode:0o600});
console.log(JSON.stringify({transientPortsFree:true,dataPlanePorts:data.length,unrelatedListeners:unrelatedListeners.length}));
