import assert from "node:assert/strict";
import { constants } from "node:fs";
import { lstat,open,readFile,writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const PRODUCT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const REPORT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const CLOSED=`${REPORT}/logs/GUIDE_RUNTIME8-stack.log`;
const START=`${REPORT}/evidence/GUIDE_PREVIEW_BIND32-runtime-start.json`;
const OUTPUT=`${REPORT}/evidence/GUIDE_PREVIEW_RECOVER33-diagnosis.json`;
const SOURCES=[
  "apps/runner/src/dev-auth-stack-cli.ts","apps/runner/src/dev-auth-stack.ts",
  "apps/runner/src/dev-auth-stack-profile.ts","apps/runner/src/dev-auth-data-plane.ts",
  "apps/runner/src/dev-hatchet-token.ts","apps/runner/src/dev-api-environment.ts",
  "apps/runner/src/dev-api-process.ts","apps/runner/src/dev-ui-process.ts",
  "apps/runner/src/dev-runner-process.ts","apps/runner/src/dev-cli-provider-panel.ts",
  "apps/runner/src/dev-support-model.ts"
];
const TOKEN=/^DEV_[A-Z0-9_]+$/u;
const CHAIN=/^DEV_[A-Z0-9_]+(?::DEV_[A-Z0-9_]+)*$/u;
const sourceTexts=await Promise.all(SOURCES.map(path=>readFile(`${PRODUCT}/${path}`,"utf8")));
const allowlist=new Set();
for (const source of sourceTexts) for (const match of source.matchAll(/DEV_[A-Z0-9_]+/gu)) allowlist.add(match[0]);
for (const component of ["API","UI","RUNNER"]) allowlist.add(`DEV_AUTH_STACK_${component}_EXITED`);
const start=JSON.parse(await readFile(START,"utf8"));
const ps=spawnSync("/bin/ps",["-p",String(start.pid),"-o","pid="],{encoding:"utf8"});
assert.equal(ps.status===1&&ps.stdout.trim()==="",true,"GUIDE_PREVIEW_RECOVER33_FAILED_PROCESS_PRESENT");
const metadata=await lstat(CLOSED);
assert.equal(metadata.isSymbolicLink(),false,"GUIDE_PREVIEW_RECOVER33_LOG_SYMLINK");
assert.equal(metadata.isFile(),true,"GUIDE_PREVIEW_RECOVER33_LOG_NOT_REGULAR");
assert.equal(metadata.uid,process.getuid(),"GUIDE_PREVIEW_RECOVER33_LOG_OWNER");
assert.equal(metadata.mode&0o777,0o600,"GUIDE_PREVIEW_RECOVER33_LOG_MODE");
assert.equal(metadata.nlink,1,"GUIDE_PREVIEW_RECOVER33_LOG_LINKS");
assert.ok(metadata.size>=1&&metadata.size<=1024*1024,"GUIDE_PREVIEW_RECOVER33_LOG_SIZE");
const writers=spawnSync("/usr/sbin/lsof",["-Fpa",CLOSED],{encoding:"utf8"});
assert.equal(writers.status===1&&writers.stdout.trim()==="",true,"GUIDE_PREVIEW_RECOVER33_LOG_OPEN");
let handle;
try { handle=await open(CLOSED,constants.O_RDONLY|(constants.O_NOFOLLOW??0)); }
catch { throw new Error("GUIDE_PREVIEW_RECOVER33_LOG_OPEN_FAILED"); }
let text;
try { text=await handle.readFile("utf8"); } finally { await handle.close(); }
const chains=[];
for (const line of text.split(/\r?\n/u)) {
  const candidate=line.trim();
  if (!CHAIN.test(candidate)) continue;
  const tokens=candidate.split(":");
  if (tokens.every(token=>TOKEN.test(token)&&allowlist.has(token))) chains.push(candidate);
}
text="";
const unique=[...new Set(chains)];
const result={schemaVersion:1,node:"GUIDE_PREVIEW_RECOVER33",ticket:"t_21dbe7b0",revision:"0d34f82f4a2188d0ce1db04655b693798ffd2169",validation:{exactClosedPath:true,failedProcessGone:true,regularFile:true,ownUid:true,mode0600:true,nlink1:true,boundedSize:true,noOpenWriter:true,rawPrinted:false,rawHashed:false,rawCopied:false},allowlist:{sourceDerived:true,sourcePaths:SOURCES,tokenCount:allowlist.size,generatedFiniteCodes:["DEV_AUTH_STACK_API_EXITED","DEV_AUTH_STACK_UI_EXITED","DEV_AUTH_STACK_RUNNER_EXITED"]},matchedChains:unique,matchedChainCount:unique.length,rawRetention:"DISCARDED_IN_MEMORY",verdict:unique.length>0?"FIXED_CODE_AVAILABLE":"NO_FIXED_CODE_AVAILABLE"};
await writeFile(OUTPUT,`${JSON.stringify(result,null,2)}\n`,{flag:"wx",mode:0o600});
process.stdout.write(`${JSON.stringify({verdict:result.verdict,matchedChains:result.matchedChains,validation:result.validation})}\n`);
