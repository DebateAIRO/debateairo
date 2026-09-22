import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { closeSync,constants,openSync } from "node:fs";
import { access,lstat,open,readFile,writeFile } from "node:fs/promises";
import { spawn,spawnSync } from "node:child_process";
import { dirname,join } from "node:path";
import { DEVELOPMENT_API_ENVIRONMENT_KEYS } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/apps/runner/src/dev-api-environment.ts";
import { SUPPORT_PREVIEW_DEVELOPMENT_AUTH_STACK_PROFILE } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/apps/runner/src/dev-auth-stack-profile.ts";

const ROOT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const E=`${ROOT}/evidence`;
const contractPath=`${E}/GUIDE_HARNESS_FIX26-command-contract.json`;
const productRoot="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const prerequisitePath=`${E}/GUIDE_LIVE26-prerequisites.json`;
const stopPath=`${E}/GUIDE_LIVE26-stop.json`;
const expectedContractSha256="e64a497a30cf7ed84b5f721e3eab8b743489a33e334917ab124e5ec6a42f7d94";
const sha256=bytes => createHash("sha256").update(bytes).digest("hex");
const PRIVATE_FILE_MODE=0o600;
const PRIVATE_DIRECTORY_MODE=0o700;
const MAX_ENVIRONMENT_BYTES=64*1024;

function currentUid() {
  assert.equal(typeof process.getuid,"function","GUIDE_LIVE26_OWNER_UNVERIFIED");
  return process.getuid();
}
async function assertPrivateDirectory(path) {
  const metadata=await lstat(path).catch(()=>null);
  assert.ok(metadata !== null,"GUIDE_LIVE26_PRIVATE_DIRECTORY_MISSING");
  assert.equal(metadata.isSymbolicLink(),false,"GUIDE_LIVE26_PRIVATE_DIRECTORY_SYMLINK");
  assert.equal(metadata.isDirectory(),true,"GUIDE_LIVE26_PRIVATE_DIRECTORY_TYPE");
  assert.equal(metadata.uid,currentUid(),"GUIDE_LIVE26_PRIVATE_DIRECTORY_OWNER");
  assert.equal(metadata.mode&0o777,PRIVATE_DIRECTORY_MODE,"GUIDE_LIVE26_PRIVATE_DIRECTORY_MODE");
}
async function readPrivateEnvironment(path) {
  let handle;
  try { handle=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)); }
  catch { throw new Error("GUIDE_LIVE26_PRIVATE_FILE_CUSTODY_INVALID"); }
  try {
    const metadata=await handle.stat();
    assert.equal(metadata.isFile(),true,"GUIDE_LIVE26_PRIVATE_FILE_TYPE");
    assert.equal(metadata.uid,currentUid(),"GUIDE_LIVE26_PRIVATE_FILE_OWNER");
    assert.equal(metadata.nlink,1,"GUIDE_LIVE26_PRIVATE_FILE_LINKS");
    assert.equal(metadata.mode&0o777,PRIVATE_FILE_MODE,"GUIDE_LIVE26_PRIVATE_FILE_MODE");
    assert.ok(metadata.size>=1&&metadata.size<=MAX_ENVIRONMENT_BYTES,"GUIDE_LIVE26_PRIVATE_FILE_SIZE");
    return await handle.readFile("utf8");
  } finally { await handle.close(); }
}
function parseExactEnvironment(source) {
  assert.equal(source.endsWith("\n"),true,"GUIDE_LIVE26_ENVIRONMENT_FINAL_NEWLINE");
  assert.equal(source.includes("\r"),false,"GUIDE_LIVE26_ENVIRONMENT_CR");
  assert.equal(source.includes("\0"),false,"GUIDE_LIVE26_ENVIRONMENT_NUL");
  const lines=source.slice(0,-1).split("\n");
  assert.equal(lines.length,DEVELOPMENT_API_ENVIRONMENT_KEYS.length,"GUIDE_LIVE26_ENVIRONMENT_KEY_COUNT");
  let supportDatabaseUrl;
  for (const [index,key] of DEVELOPMENT_API_ENVIRONMENT_KEYS.entries()) {
    const line=lines[index];
    assert.equal(line.startsWith(`${key}=`),true,"GUIDE_LIVE26_ENVIRONMENT_KEY_ORDER");
    const value=line.slice(key.length+1);
    assert.notEqual(value.length,0,"GUIDE_LIVE26_ENVIRONMENT_EMPTY_VALUE");
    if (key === "SUPPORT_DATABASE_URL") supportDatabaseUrl=value;
  }
  assert.equal(typeof supportDatabaseUrl,"string","GUIDE_LIVE26_SUPPORT_DATABASE_URL_MISSING");
  return supportDatabaseUrl;
}
async function readNarrowDatabaseUrl() {
  const custodyRoot=join(productRoot,".local","dev-auth");
  await assertPrivateDirectory(dirname(custodyRoot));
  await assertPrivateDirectory(custodyRoot);
  const value=parseExactEnvironment(await readPrivateEnvironment(join(custodyRoot,"api.env")));
  const url=new URL(value);
  assert.equal(url.protocol,"postgresql:","GUIDE_LIVE26_DATABASE_PROTOCOL");
  assert.equal(url.hostname,"127.0.0.1","GUIDE_LIVE26_DATABASE_HOST");
  assert.equal(url.port,String(SUPPORT_PREVIEW_DEVELOPMENT_AUTH_STACK_PROFILE.postgresPort),"GUIDE_LIVE26_DATABASE_PORT");
  assert.equal(url.pathname,"/debateai","GUIDE_LIVE26_DATABASE_NAME");
  assert.equal(url.username,"debateai_dev_support","GUIDE_LIVE26_DATABASE_USER");
  assert.ok(url.password.length>0,"GUIDE_LIVE26_DATABASE_PASSWORD_MISSING");
  assert.equal(url.search.length,0,"GUIDE_LIVE26_DATABASE_QUERY");
  assert.equal(url.hash.length,0,"GUIDE_LIVE26_DATABASE_FRAGMENT");
  return value;
}
async function assertAbsent(path) {
  try { await access(path); throw new Error(`GUIDE_LIVE26_OUTPUT_PRESENT:${path}`); }
  catch (error) { if (error?.code!=="ENOENT") throw error; }
}
async function runPhase(name,{ environment=process.env,directLog=false }={}) {
  const phase=contract.phases[name];
  let fd;
  const stdio=directLog ? ["ignore",(fd=openSync(phase.log,"wx",0o600)),fd] : "inherit";
  let status;
  try {
    const child=spawn(phase.argv[0],phase.argv.slice(1),{ cwd:contract.cwd,env:environment,stdio });
    status=await new Promise((resolve,reject)=>{
      child.once("error",reject); child.once("exit",code=>resolve(code??1));
    });
  } finally { if (fd!==undefined) closeSync(fd); }
  if (status!==0) {
    await writeFile(stopPath,`${JSON.stringify({ schemaVersion:1,node:"GUIDE_LIVE26",phase,status },null,2)}\n`,{ flag:"wx",mode:0o600 });
    throw new Error(`GUIDE_LIVE26_PHASE_FAILED:${name}:${status}`);
  }
  process.stdout.write(`${JSON.stringify({ phase,result:"PASS",completedAtUtc:new Date().toISOString() })}\n`);
}

const contractBytes=await readFile(contractPath);
assert.equal(sha256(contractBytes),expectedContractSha256);
const contract=JSON.parse(contractBytes);
assert.equal(contract.cwd,productRoot);
assert.deepEqual(Object.keys(contract.phases),["preflight","readiness","capacity","gate","rowProof","capture","idle"]);
for (const phase of Object.values(contract.phases)) assert.equal(phase.argv[2],contractPath);
const future=[prerequisitePath,stopPath,
  ...Object.values(contract.phases).flatMap(phase=>[phase.output,phase.log]),
  contract.phases.preflight.ui.output,contract.phases.preflight.ui.log,
  contract.actualReceipt,contract.browserProfile,contract.ownerCapacity.output];
for (const sequence of contract.actualSequences) {
  const stem=`${contract.evidenceRoot}/GUIDE_LIVE_GUIDE21-row-${String(sequence).padStart(2,"0")}`;
  future.push(`${stem}-complete-expanded.png`,`${stem}-original-pane-top.png`,`${stem}-original-pane-footer.png`);
}
for (const path of future) await assertAbsent(path);
const custody=JSON.parse(await readFile(contract.runtimeCustodyPath,"utf8"));
assert.equal(custody.revision,contract.revision);
assert.equal(custody.runtimeLogPath,contract.runtimeLogPath);
assert.equal(custody.detached,true);
const ps=spawnSync("/bin/ps",["-o","pid=,ppid=,pgid=,command=","-p",String(custody.pid)],{ encoding:"utf8" });
assert.equal(ps.status,0,"GUIDE_LIVE26_RUNTIME_PROCESS_MISSING");
assert.match(ps.stdout,/pnpm dev:auth:up/u);
const sourceChecks=[
  ["apps/api/src/main.ts","createPool(environment.SUPPORT_DATABASE_URL)"],
  ["apps/runner/src/dev-database-principals.ts",'environmentKey: "SUPPORT_DATABASE_URL"'],
  ["apps/runner/src/dev-database-principals.ts",'roleName: "debateai_dev_support"'],
  ["apps/runner/src/support-status-cli-credentials.ts",'const SUPPORT_KEY = "SUPPORT_DATABASE_URL"']
];
for (const [relative,anchor] of sourceChecks) {
  assert.equal((await readFile(join(productRoot,relative),"utf8")).includes(anchor),true,
    "GUIDE_LIVE26_SUPPORT_SOURCE_ANCHOR_MISSING");
}
const connectionString=await readNarrowDatabaseUrl();
const capacityEnvironment={ ...process.env,GUIDE_COUNTS_ONLY_DATABASE_URL:connectionString };
assert.equal(capacityEnvironment.GUIDE_COUNTS_ONLY_DATABASE_URL.startsWith("postgresql://"),true);
await writeFile(prerequisitePath,`${JSON.stringify({
  schemaVersion:1,node:"GUIDE_LIVE26",revision:contract.revision,
  contractSha256:expectedContractSha256,runtime:{ pid:custody.pid,pgid:custody.pgid,
    commandMarker:custody.commandMarker,runtimeLogPath:custody.runtimeLogPath,detached:custody.detached },
  connection:{ source:`${productRoot}/.local/dev-auth/api.env`,
    loader:`${productRoot}/apps/runner/src/dev-api-process.ts#readPrivateEnvironment+parseExactEnvironment`,
    keySource:`${productRoot}/apps/runner/src/dev-api-environment.ts#DEVELOPMENT_API_ENVIRONMENT_KEYS`,
    selectedSourceKey:"SUPPORT_DATABASE_URL",childEnvironmentKey:"GUIDE_COUNTS_ONLY_DATABASE_URL",
    principalRole:"debateai_dev_support",present:true,acceptedShape:true,valueRecorded:false },
  futureOutputsCheckedAbsent:future.length
},null,2)}\n`,{ flag:"wx",mode:0o600 });

await runPhase("preflight",{ directLog:true });
await runPhase("readiness",{ directLog:true });
await runPhase("capacity",{ environment:capacityEnvironment,directLog:true });
await runPhase("gate",{ directLog:true });
await runPhase("rowProof");
await runPhase("capture");
await runPhase("idle",{ directLog:true });
