import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access,lstat,open,readFile,writeFile } from "node:fs/promises";
import { spawn,spawnSync } from "node:child_process";
import { dirname,join } from "node:path";
import { DEVELOPMENT_API_ENVIRONMENT_KEYS } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/apps/runner/src/dev-api-environment.ts";
import { SUPPORT_PREVIEW_DEVELOPMENT_AUTH_STACK_PROFILE } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/apps/runner/src/dev-auth-stack-profile.ts";
import { createInvocationPrerequisite,validateArtifactLifecycle } from "../GUIDE_UI_WRITER_FIX45/artifact-lifecycle.mjs";

const ROOT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const E=`${ROOT}/evidence`;
const PRODUCT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const FINAL_CONTRACT=`${E}/GUIDE_PHASE_IMPORT_FIX46-command-contract.json`;
const FINAL_CONTRACT_SHA256="2257cae89fbe2592ddbb0d1ba6533931cb9c6fe1824465240ead8b9586af2e26";
const PHASES=Object.freeze(["preflight","readiness","capacity","gate","rowProof","capture","idle"]);
const OPERATOR_LOGS=Object.freeze(Object.fromEntries(PHASES.map(name=>[
  name,`${ROOT}/logs/GUIDE_PHASE_IMPORT_FIX46-operator-${name}.log`
])));
const FINAL_PREREQUISITE=`${E}/GUIDE_LIVE35-prerequisites.json`;
const FINAL_STOP=`${E}/GUIDE_LIVE35-stop.json`;
const FINAL_OWNER_TESTABILITY=`${E}/GUIDE_LIVE25-owner-testability.json`;
const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");
const PRIVATE_FILE_MODE=0o600;
const PRIVATE_DIRECTORY_MODE=0o700;
const MAX_ENVIRONMENT_BYTES=64*1024;

const guard=process.argv[2] === "--inert-guard";
const offline=process.argv[2] === "--offline-preflight-lifecycle";
const contractPath=(guard||offline) ? process.argv[3] : FINAL_CONTRACT;
const expectedContractHash=(guard||offline) ? process.argv[4] : FINAL_CONTRACT_SHA256;
let stopPath=FINAL_STOP;
const ownerTestabilityPath=FINAL_OWNER_TESTABILITY;
if ((guard||offline) && (process.argv.length!==5 || !contractPath?.startsWith("/") || !/^[0-9a-f]{64}$/u.test(expectedContractHash??""))) throw new Error("GUIDE_PHASE_IMPORT_FIX46_INERT_ARGUMENTS_INVALID");
if (!guard && !offline && process.argv.length!==2) throw new Error("GUIDE_PHASE_IMPORT_FIX46_ARGUMENTS_INVALID");
let operatorLogs=OPERATOR_LOGS;

function currentUid() {
  assert.equal(typeof process.getuid,"function","GUIDE_PHASE_IMPORT_FIX46_OWNER_UNVERIFIED");
  return process.getuid();
}
async function assertPrivateDirectory(path) {
  const metadata=await lstat(path).catch(()=>null);
  assert.ok(metadata!==null,"GUIDE_PHASE_IMPORT_FIX46_PRIVATE_DIRECTORY_MISSING");
  assert.equal(metadata.isSymbolicLink(),false,"GUIDE_PHASE_IMPORT_FIX46_PRIVATE_DIRECTORY_SYMLINK");
  assert.equal(metadata.isDirectory(),true,"GUIDE_PHASE_IMPORT_FIX46_PRIVATE_DIRECTORY_TYPE");
  assert.equal(metadata.uid,currentUid(),"GUIDE_PHASE_IMPORT_FIX46_PRIVATE_DIRECTORY_OWNER");
  assert.equal(metadata.mode&0o777,PRIVATE_DIRECTORY_MODE,"GUIDE_PHASE_IMPORT_FIX46_PRIVATE_DIRECTORY_MODE");
}
async function readPrivateEnvironment(path) {
  let handle;
  try { handle=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)); }
  catch { throw new Error("GUIDE_PHASE_IMPORT_FIX46_PRIVATE_FILE_CUSTODY_INVALID"); }
  try {
    const metadata=await handle.stat();
    assert.equal(metadata.isFile(),true,"GUIDE_PHASE_IMPORT_FIX46_PRIVATE_FILE_TYPE");
    assert.equal(metadata.uid,currentUid(),"GUIDE_PHASE_IMPORT_FIX46_PRIVATE_FILE_OWNER");
    assert.equal(metadata.nlink,1,"GUIDE_PHASE_IMPORT_FIX46_PRIVATE_FILE_LINKS");
    assert.equal(metadata.mode&0o777,PRIVATE_FILE_MODE,"GUIDE_PHASE_IMPORT_FIX46_PRIVATE_FILE_MODE");
    assert.ok(metadata.size>=1&&metadata.size<=MAX_ENVIRONMENT_BYTES,"GUIDE_PHASE_IMPORT_FIX46_PRIVATE_FILE_SIZE");
    return await handle.readFile("utf8");
  } finally { await handle.close(); }
}
function parseExactEnvironment(source) {
  assert.equal(source.endsWith("\n"),true,"GUIDE_PHASE_IMPORT_FIX46_ENVIRONMENT_FINAL_NEWLINE");
  assert.equal(source.includes("\r"),false,"GUIDE_PHASE_IMPORT_FIX46_ENVIRONMENT_CR");
  assert.equal(source.includes("\0"),false,"GUIDE_PHASE_IMPORT_FIX46_ENVIRONMENT_NUL");
  const lines=source.slice(0,-1).split("\n");
  assert.equal(lines.length,DEVELOPMENT_API_ENVIRONMENT_KEYS.length,"GUIDE_PHASE_IMPORT_FIX46_ENVIRONMENT_KEY_COUNT");
  let supportDatabaseUrl;
  for (const [index,key] of DEVELOPMENT_API_ENVIRONMENT_KEYS.entries()) {
    const line=lines[index];
    assert.equal(line.startsWith(`${key}=`),true,"GUIDE_PHASE_IMPORT_FIX46_ENVIRONMENT_KEY_ORDER");
    const value=line.slice(key.length+1);
    assert.notEqual(value.length,0,"GUIDE_PHASE_IMPORT_FIX46_ENVIRONMENT_EMPTY_VALUE");
    if (key==="SUPPORT_DATABASE_URL") supportDatabaseUrl=value;
  }
  assert.equal(typeof supportDatabaseUrl,"string","GUIDE_PHASE_IMPORT_FIX46_SUPPORT_DATABASE_URL_MISSING");
  return supportDatabaseUrl;
}
async function readNarrowDatabaseUrl() {
  const custodyRoot=join(PRODUCT,".local","dev-auth");
  await assertPrivateDirectory(dirname(custodyRoot));
  await assertPrivateDirectory(custodyRoot);
  const value=parseExactEnvironment(await readPrivateEnvironment(join(custodyRoot,"api.env")));
  const url=new URL(value);
  assert.equal(url.protocol,"postgresql:");
  assert.equal(url.hostname,"127.0.0.1");
  assert.equal(url.port,String(SUPPORT_PREVIEW_DEVELOPMENT_AUTH_STACK_PROFILE.postgresPort));
  assert.equal(url.pathname,"/debateai");
  assert.equal(url.username,"debateai_dev_support");
  assert.ok(url.password.length>0);
  assert.equal(url.search.length,0);
  assert.equal(url.hash.length,0);
  return value;
}
async function assertAbsent(path) {
  try { await access(path); throw new Error(`GUIDE_PHASE_IMPORT_FIX46_OUTPUT_PRESENT:${path}`); }
  catch (error) { if (error?.code!=="ENOENT") throw error; }
}
async function runPhase(name,environment=process.env) {
  const phase=contract.phases[name];
  const child=spawn(phase.argv[0],phase.argv.slice(1),{
    cwd:contract.cwd,env:environment,stdio:["ignore","pipe","pipe"]
  });
  const chunks=[];
  for (const stream of [child.stdout,child.stderr]) stream.on("data",chunk=>{
    chunks.push(Buffer.from(chunk));
    if (name==="capture") process.stdout.write(chunk);
  });
  const status=await new Promise((resolve,reject)=>{
    child.once("error",reject); child.once("exit",code=>resolve(code??1));
  });
  // Persist operator-owned output only after the wrapper has completed its own
  // absence checks and writes. No contract-owned path is opened by this runner.
  await writeFile(operatorLogs[name],Buffer.concat(chunks),{ flag:"wx",mode:0o600 });
  if (status!==0) {
    await writeFile(stopPath,`${JSON.stringify({
      schemaVersion:1,node:"GUIDE_PHASE_IMPORT_FIX46",phase:name,status
    },null,2)}\n`,{ flag:"wx",mode:0o600 });
    throw new Error(`GUIDE_PHASE_IMPORT_FIX46_PHASE_FAILED:${name}:${status}`);
  }
  process.stdout.write(`${JSON.stringify({ phase:name,status,completedAtUtc:new Date().toISOString() })}\n`);
}

const contractBytes=await readFile(contractPath);
assert.equal(sha256(contractBytes),expectedContractHash,"GUIDE_PHASE_IMPORT_FIX46_CONTRACT_HASH_MISMATCH");
const contract=JSON.parse(contractBytes);
assert.equal(contract.cwd,PRODUCT);
assert.deepEqual(Object.keys(contract.phases),PHASES);
for (const phase of Object.values(contract.phases)) assert.equal(phase.argv[2],contractPath);
if (guard) {
  process.stdout.write(`${JSON.stringify({ result:"PASS_INERT_GUARD",contractPath,contractSha256:expectedContractHash,firstPhase:contract.phases.preflight.argv })}\n`);
  process.exit(0);
}
if (offline) {
  stopPath=contract.lifecycle.stop;operatorLogs=contract.lifecycle.operatorLogs;
  await createInvocationPrerequisite({contract,contractPath,contractSha256:expectedContractHash,payload:{controlFixture:true}});
  if(process.env.GUIDE_OFFLINE_LIFECYCLE_INJECT_PATH)await writeFile(process.env.GUIDE_OFFLINE_LIFECYCLE_INJECT_PATH,"unexpected\n",{flag:"wx",mode:0o600});
  await runPhase("preflight");
  process.stdout.write(`${JSON.stringify({result:"PASS_OFFLINE_PREFLIGHT_LIFECYCLE",contractPath})}\n`);process.exit(0);
}
const future=contract.futureAbsence;
assert.ok(Array.isArray(future)&&future.includes(FINAL_PREREQUISITE)&&future.includes(stopPath)
  &&future.includes(ownerTestabilityPath),"GUIDE_PHASE_IMPORT_FIX46_FUTURE_PATH_SET_INVALID");
assert.equal(new Set(future).size,future.length,"GUIDE_PHASE_IMPORT_FIX46_PATH_COLLISION");
await validateArtifactLifecycle({contract,contractPath,contractSha256:expectedContractHash,stage:"INITIAL"});

{
  const custody=JSON.parse(await readFile(contract.runtimeCustodyPath,"utf8"));
  assert.equal(custody.revision,contract.revision);
  assert.equal(custody.runtimeLogPath,contract.runtimeLogPath);
  assert.equal(custody.detached,true);
  const ps=spawnSync("/bin/ps",["-o","pid=,ppid=,pgid=,command=","-p",String(custody.pid)],{ encoding:"utf8" });
  assert.equal(ps.status,0,"GUIDE_PHASE_IMPORT_FIX46_RUNTIME_PROCESS_MISSING");
  assert.match(ps.stdout,/pnpm dev:auth:up/u);
  const sourceChecks=[
    ["apps/api/src/main.ts","createPool(environment.SUPPORT_DATABASE_URL)"],
    ["apps/runner/src/dev-database-principals.ts",'environmentKey: "SUPPORT_DATABASE_URL"'],
    ["apps/runner/src/dev-database-principals.ts",'roleName: "debateai_dev_support"'],
    ["apps/runner/src/support-status-cli-credentials.ts",'const SUPPORT_KEY = "SUPPORT_DATABASE_URL"']
  ];
  for (const [relative,anchor] of sourceChecks) {
    assert.equal((await readFile(join(PRODUCT,relative),"utf8")).includes(anchor),true,
      "GUIDE_PHASE_IMPORT_FIX46_SUPPORT_SOURCE_ANCHOR_MISSING");
  }
  const connectionString=await readNarrowDatabaseUrl();
  const capacityEnvironment={ ...process.env,GUIDE_COUNTS_ONLY_DATABASE_URL:connectionString };
  await createInvocationPrerequisite({contract,contractPath,contractSha256:sha256(contractBytes),payload:{
    runtime:{pid:custody.pid,pgid:custody.pgid,commandMarker:custody.commandMarker,runtimeLogPath:custody.runtimeLogPath,detached:custody.detached},
    connection:{selectedSourceKey:"SUPPORT_DATABASE_URL",childEnvironmentKey:"GUIDE_COUNTS_ONLY_DATABASE_URL",principalRole:"debateai_dev_support",present:true,acceptedShape:true,valueRecorded:false}
  }});
  await runPhase("preflight");
  await runPhase("readiness");
  await runPhase("capacity",capacityEnvironment);
  await runPhase("gate");
  await runPhase("rowProof");
  await runPhase("capture");
  await runPhase("idle");
}
