import { closeSync,openSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const workdir = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const logPath = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/logs/LIVE_P3-stack-detached.log";
const custodyPath = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence/LIVE_P3-stack-custody.json";
const log = openSync(logPath,"wx",0o600);
const child = spawn("pnpm",["dev:auth:up"],{
  cwd: workdir,
  detached: true,
  env: { ...process.env,DEBATEAI_DEV_AUTH_STACK_PROFILE: "support-preview" },
  stdio: ["ignore",log,log]
});
child.unref();
closeSync(log);
await writeFile(custodyPath,JSON.stringify({
  schema_version: 1,
  revision: "475c5a7e7eb8f48a3f5a81379f37b49fdd014ce9",
  pid: child.pid,
  process_group: child.pid,
  command: ["pnpm","dev:auth:up"],
  cwd: workdir,
  profile: "support-preview",
  log: logPath,
  detached: true,
  started_at: new Date().toISOString()
},null,2) + "\n",{ mode: 0o600 });
process.stdout.write(`detached_pid=${child.pid} custody=${custodyPath}\n`);
