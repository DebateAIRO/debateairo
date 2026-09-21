import { closeSync,openSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const workdir="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const logPath="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/logs/GUIDE_LIVE-stack.log";
const custodyPath="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence/GUIDE_LIVE-stack-custody.json";
const log=openSync(logPath,"wx",0o600);
const child=spawn("pnpm",["dev:auth:up"],{
  cwd:workdir,detached:true,
  env:{ ...process.env,DEBATEAI_DEV_AUTH_STACK_PROFILE:"support-preview" },
  stdio:["ignore",log,log]
});
child.unref();
closeSync(log);
const receipt={
  schemaVersion:1,revision:"91d17ae2a2748f3d48e14d9e56fdb8a2d8ee7c69",
  pid:child.pid,processGroup:child.pid,command:["pnpm","dev:auth:up"],cwd:workdir,
  profile:"support-preview",log:logPath,detached:true,startedAt:new Date().toISOString()
};
await writeFile(custodyPath,`${JSON.stringify(receipt,null,2)}\n`,{ mode:0o600,flag:"wx" });
process.stdout.write(`${JSON.stringify({ pid:child.pid,custodyPath },null,2)}\n`);
