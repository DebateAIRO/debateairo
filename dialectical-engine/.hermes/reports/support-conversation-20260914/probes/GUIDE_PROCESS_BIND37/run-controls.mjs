import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { access,mkdir,mkdtemp,readFile,rm,writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

const root="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine";
const R=`${root}/.hermes/reports/support-conversation-20260914`,E=`${R}/evidence`,P=`${R}/probes`;
const node="/Users/vladmihaimiron/.local/bin/node",revision="0d34f82f4a2188d0ce1db04655b693798ffd2169";
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const json=async path=>JSON.parse(await readFile(path,"utf8"));
const absent=async path=>{ try { await access(path);return false; } catch { return true; } };
const commandPath=`${E}/GUIDE_PROCESS_BIND37-command-contract.json`;
const operatorPath=`${E}/GUIDE_PROCESS_BIND37-operator-contract.json`;
const readinessPath=`${P}/GUIDE_PROCESS_BIND37/phase-readiness.mjs`;
const idlePath=`${P}/GUIDE_PROCESS_BIND37/phase-idle.mjs`;
const helperPath=`${P}/GUIDE_PROCESS_BIND37/process-row.mjs`;
const oldReadinessPath=`${P}/GUIDE_RUNTIME_BIND36/phase-readiness.mjs`;
const stubPath=`${P}/GUIDE_PROCESS_BIND37/controlled-io.mjs`;
const phaseContractPath=`${P}/GUIDE_HARNESS_BIND21/phase-contract.mjs`;
const [command,operator,realCustody,realCustodyContract]=await Promise.all([
  json(commandPath),json(operatorPath),json(`${E}/GUIDE_PREVIEW_RECOVER34-runtime-custody.json`),json(`${E}/GUIDE_PREVIEW_RECOVER34-runtime-custody-contract.json`)
]);
const [readinessSource,idleSource,oldReadinessSource,helperBytes]=await Promise.all([
  readFile(readinessPath,"utf8"),readFile(idlePath,"utf8"),readFile(oldReadinessPath,"utf8"),readFile(helperPath)
]);
const stubUrl=pathToFileURL(stubPath).href,phaseContractUrl=pathToFileURL(phaseContractPath).href;
const transform=source=>source
  .replace(/import \{ execFileSync,spawnSync \} from "node:child_process";/u,`import { execFileSync,spawnSync } from "${stubUrl}";`)
  .replace(/import \{ readFile,writeFile \} from "node:fs\/promises";/u,`import { readFile,writeFile } from "${stubUrl}";`)
  .replace(/from "(?:\.\/|\.\.\/GUIDE_HARNESS_BIND21\/)phase-contract\.mjs";/u,`from "${phaseContractUrl}";`);
const dir=await mkdtemp(join(tmpdir(),"guide-process-bind37-"));
const readinessFixture=join(dir,"readiness.mjs"),idleFixture=join(dir,"idle.mjs"),oldReadinessFixture=join(dir,"old-readiness.mjs");
await Promise.all([
  writeFile(readinessFixture,transform(readinessSource),{ mode:0o600 }),
  writeFile(idleFixture,transform(idleSource),{ mode:0o600 }),
  writeFile(oldReadinessFixture,transform(oldReadinessSource),{ mode:0o600 })
]);
const names=[];
const check=(name,fn)=>{ fn();names.push(name); };
const positiveRow=`${realCustody.pid} 1 ${realCustody.pgid} ${realCustody.commandMarker}\n`;
const rows={
  wrongPid:`${realCustody.pid+1} 1 ${realCustody.pgid} ${realCustody.commandMarker}\n`,
  wrongPgid:`${realCustody.pid} 1 ${realCustody.pgid+1} ${realCustody.commandMarker}\n`,
  wrongPpid:`${realCustody.pid} 2 ${realCustody.pgid} ${realCustody.commandMarker}\n`,
  empty:"",
  malformed:"not-a-process-row\n",
  multiple:`${positiveRow}${realCustody.pid} 1 ${realCustody.pgid} ${realCustody.commandMarker}\n`
};

async function makeCase(name,{ custody=realCustody,custodyContract=realCustodyContract,mutate=x=>x }={}) {
  const caseRoot=join(dir,name);await mkdir(caseRoot,{ recursive:true });
  const custodyPath=join(caseRoot,"custody.json"),schemaPath=join(caseRoot,"custody-contract.json"),validatorPath=join(caseRoot,"process-row.mjs"),contractPath=join(caseRoot,"command.json");
  const readinessOutput=join(caseRoot,"readiness.json"),idleOutput=join(caseRoot,"idle.json");
  await Promise.all([
    writeFile(custodyPath,`${JSON.stringify(custody,null,2)}\n`,{ mode:0o600 }),
    writeFile(schemaPath,`${JSON.stringify(custodyContract,null,2)}\n`,{ mode:0o600 }),
    writeFile(validatorPath,helperBytes,{ mode:0o600 })
  ]);
  const schemaBytes=await readFile(schemaPath),validatorBytes=await readFile(validatorPath);
  let contract={ schemaVersion:1,revision,cwd:"/controlled/product",baseUrl:"https://localhost:3100",runtimeCustodyPath:custodyPath,runtimeCustodyContractPath:schemaPath,runtimeCustodyContractSha256:sha(schemaBytes),runtimeLogPath:realCustody.runtimeLogPath,runtimeCommandMarker:realCustody.commandMarker,processIdentityValidator:{ path:validatorPath,sha256:sha(validatorBytes),bytes:validatorBytes.byteLength },phases:{ readiness:{ output:readinessOutput },idle:{ output:idleOutput } } };
  contract=mutate(contract);
  await writeFile(contractPath,`${JSON.stringify(contract,null,2)}\n`,{ mode:0o600 });
  return { caseRoot,contractPath,readinessOutput,idleOutput };
}
async function runScript(script,fixture,psRow,label) {
  const counter=join(fixture.caseRoot,`${label}-counter.json`);
  const result=spawnSync(node,[script,fixture.contractPath],{ cwd:root,encoding:"utf8",env:{ PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,GUIDE_BIND37_FIXTURE_ROOT:fixture.caseRoot,GUIDE_BIND37_COUNTER_PATH:counter,GUIDE_BIND37_REVISION:revision,GUIDE_BIND37_PS_ROW:psRow } });
  return { result,counts:await json(counter) };
}
async function runReadiness(name,psRow,options={}) {
  const fixture=await makeCase(name,options);
  return { fixture,...await runScript(readinessFixture,fixture,psRow,"readiness") };
}
async function makeIdleCase(name) {
  const fixture=await makeCase(name);
  const ready={ schemaVersion:1,phase:"READINESS",revision,pid:realCustody.pid,pgid:realCustody.pgid,runtimeLogPath:realCustody.runtimeLogPath,ordinarySystemTls:{ url:"https://localhost:3100/help",customCa:false,insecure:false,status:200 } };
  await writeFile(fixture.readinessOutput,`${JSON.stringify(ready,null,2)}\n`,{ mode:0o600 });
  return fixture;
}
async function runIdle(name,psRow,options={}) {
  const fixture=await makeIdleCase(name);
  if (options.mutate) {
    const contract=await json(fixture.contractPath);options.mutate(contract);
    await writeFile(fixture.contractPath,`${JSON.stringify(contract,null,2)}\n`,{ mode:0o600,flag:"w" });
  }
  return { fixture,...await runScript(idleFixture,fixture,psRow,"idle") };
}

try {
  const oldFixture=await makeCase("old-red");
  const old=await runScript(oldReadinessFixture,oldFixture,"123 1 123 pnpm dev:auth:up\n","old");
  check("old readiness reproduces mismatched-process false acceptance",()=>{ assert.equal(old.result.status,0);assert.deepEqual(old.counts,{ read:2,write:1,exec:3,spawn:1 }); });

  const goodReadiness=await runReadiness("good-readiness",positiveRow);
  const ready=await json(goodReadiness.fixture.readinessOutput);
  check("corrected readiness accepts exact authenticated Runtime9 process row",()=>{ assert.equal(goodReadiness.result.status,0);assert.equal(ready.pid,realCustody.pid);assert.equal(ready.pgid,realCustody.pgid);assert.deepEqual(goodReadiness.counts,{ read:3,write:1,exec:3,spawn:1 }); });
  const goodIdle=await runIdle("good-idle",positiveRow);
  const idle=await json(goodIdle.fixture.idleOutput);
  check("corrected idle accepts exact readiness-bound Runtime9 process row",()=>{ assert.equal(goodIdle.result.status,0);assert.equal(idle.pid,realCustody.pid);assert.deepEqual(goodIdle.counts,{ read:2,write:1,exec:1,spawn:1 }); });

  for (const [kind,row] of Object.entries(rows)) {
    const run=await runReadiness(`readiness-${kind}`,row);
    check(`readiness rejects ${kind} process row before TLS or success write`,()=>{ assert.notEqual(run.result.status,0);assert.equal(run.counts.exec,3);assert.equal(run.counts.spawn,0);assert.equal(run.counts.write,0);assert.equal(run.result.stderr.includes("GUIDE_CAPTURE_PROCESS_IDENTITY_INVALID"),true); });
  }
  for (const [kind,row] of Object.entries(rows)) {
    const run=await runIdle(`idle-${kind}`,row);
    check(`idle rejects ${kind} process row before TLS or success write`,()=>{ assert.notEqual(run.result.status,0);assert.equal(run.counts.exec,1);assert.equal(run.counts.spawn,0);assert.equal(run.counts.write,0);assert.equal(run.result.stderr.includes("GUIDE_CAPTURE_PROCESS_IDENTITY_INVALID"),true); });
  }

  const badHelper=await runReadiness("bad-helper-hash",positiveRow,{ mutate:contract=>{ contract.processIdentityValidator.sha256="0".repeat(64);return contract; } });
  check("readiness rejects altered process validator before operational I/O",()=>{ assert.notEqual(badHelper.result.status,0);assert.deepEqual(badHelper.counts,{ read:3,write:0,exec:0,spawn:0 }); });
  const badIdle=await runIdle("bad-idle-helper",positiveRow,{ mutate:contract=>{ contract.processIdentityValidator.bytes+=1; } });
  check("idle rejects altered process validator before operational I/O",()=>{ assert.notEqual(badIdle.result.status,0);assert.deepEqual(badIdle.counts,{ read:2,write:0,exec:0,spawn:0 }); });
  const predecessor={ ...realCustody,node:"GUIDE_RUNTIME7" };
  const pred=await runReadiness("predecessor",positiveRow,{ custody:predecessor });
  check("retained authenticated custody schema rejects predecessor before operational I/O",()=>{ assert.notEqual(pred.result.status,0);assert.deepEqual(pred.counts,{ read:3,write:0,exec:0,spawn:0 }); });

  check("process validator metadata binds actual helper bytes",()=>{ assert.deepEqual(command.processIdentityValidator,{ path:helperPath,sha256:sha(helperBytes),bytes:helperBytes.byteLength }); });
  check("final readiness and idle select exact corrected sources",()=>{ assert.equal(command.phases.readiness.argv[1],readinessPath);assert.equal(command.phases.idle.argv[1],idlePath); });
  check("all seven phase argv self-bind final command",()=>{ for (const phase of Object.values(command.phases)) assert.equal(phase.argv[2],commandPath); });
  check("fresh LIVE30 and actual GUIDE22 namespaces remain bound",()=>{ assert.equal(command.phases.capture.output,`${E}/GUIDE_LIVE30-capture.json`);assert.equal(command.actualReceipt,`${E}/GUIDE_LIVE_GUIDE22-actual-receipt.json`);assert.equal(command.phases.rowProof.result,`${E}/GUIDE_ROW_PROOF-run-LIVE30.json`); });
  check("fixed31 and owner capacity contract remain unchanged",()=>{ assert.equal(command.actualSequences.length,31);assert.equal(new Set(command.actualSequences).size,31);assert.equal(command.ownerCapacity.contractSha256,"365834e0fd9761e9e1293415f42a296a1399a923bc37c10fdd0b57f75d39cecc"); });
  const screenshotHash=sha(await readFile(`${P}/GUIDE_PREVIEW_RECOVER34/screenshot-evidence-successor.mjs`));
  check("FIX30 screenshot helper remains byte-identical",()=>assert.equal(screenshotHash,"824e780a1817c198a6ca6ebc6215948241ecccbb5611617a033e650799ac4b29"));
  check("all 123 future paths remain unique and absent",async()=>{});
  assert.equal(operator.futureAbsence.paths.length,123);assert.equal(new Set(operator.futureAbsence.paths).size,123);assert.equal((await Promise.all(operator.futureAbsence.paths.map(absent))).every(Boolean),true);

  const phasePaths={ preflight:`${P}/GUIDE_HARNESS_FIX22/phase-preflight.mjs`,readiness:readinessPath,capacity:`${P}/GUIDE_HARNESS_BIND21/phase-capacity.mjs`,gate:`${P}/GUIDE_HARNESS_BIND21/phase-gate.mjs`,rowProof:`${P}/GUIDE_HARNESS_FIX26/phase-row-proof.mjs`,capture:`${P}/GUIDE_HARNESS_FIX26/phase-capture.mjs`,idle:idlePath };
  const transitive=[phaseContractPath,`${P}/GUIDE_HARNESS_BIND21/preflight-ui-contract.mjs`,`${P}/GUIDE_HARNESS_BIND21/runtime-capacity.mjs`,`${P}/GUIDE_HARNESS_BIND21/controls.mjs`,`${P}/GUIDE_HARNESS_FIX26/proof-dependency.mjs`,helperPath];
  const inventory=[];
  for (const [phase,path] of Object.entries(phasePaths)) { const bytes=await readFile(path);inventory.push({ phase,path,sha256:sha(bytes),bytes:bytes.byteLength,predecessorSource:path.includes("GUIDE_RUNTIME_BIND36")||path.includes("GUIDE_HARNESS_BIND21/phase-idle") }); }
  for (const path of transitive) { const bytes=await readFile(path);inventory.push({ phase:"TRANSITIVE_VALIDATOR",path,sha256:sha(bytes),bytes:bytes.byteLength,predecessorSource:false }); }
  check("exact seven-phase inventory excludes predecessor readiness and idle",()=>assert.equal(inventory.some(entry=>entry.predecessorSource),false));

  const operatorSource=await readFile(operator.script.path,"utf8"),finalHash=sha(await readFile(commandPath)),oldHash="30da55750cd96c3323234f988a07cf2961025db7ebe486176bd79858897e46e4",boundary="\nif (inert) {",index=operatorSource.lastIndexOf(boundary),insertion="\nthrow new Error(\"GUIDE_PROCESS_BIND37_FIRST_PHASE_INTERCEPT\");\n";
  assert.ok(index>0);
  const goodOperator=join(dir,"operator-good.mjs"),staleOperator=join(dir,"operator-stale.mjs");
  await writeFile(goodOperator,operatorSource.slice(0,index)+insertion+operatorSource.slice(index),{ mode:0o600 });
  const staleSource=operatorSource.replace(finalHash,oldHash),staleIndex=staleSource.lastIndexOf(boundary);
  await writeFile(staleOperator,staleSource.slice(0,staleIndex)+insertion+staleSource.slice(staleIndex),{ mode:0o600 });
  const runOperator=path=>spawnSync(node,["--import","tsx",path],{ cwd:command.cwd,encoding:"utf8",env:{ PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR } });
  const staleOperatorRun=runOperator(staleOperator),goodOperatorRun=runOperator(goodOperator);
  check("stale embedded command hash rejects before first-phase boundary",()=>{ assert.notEqual(staleOperatorRun.status,0);assert.equal(staleOperatorRun.stderr.includes("GUIDE_PROCESS_BIND37_FIRST_PHASE_INTERCEPT"),false); });
  check("actual embedded command hash reaches controlled first-phase boundary",()=>{ assert.notEqual(goodOperatorRun.status,0);assert.equal(goodOperatorRun.stderr.includes("GUIDE_PROCESS_BIND37_FIRST_PHASE_INTERCEPT"),true); });

  const inventoryPath=`${E}/GUIDE_PROCESS_BIND37-runtime-dependency-inventory.json`;
  await writeFile(inventoryPath,`${JSON.stringify({ schemaVersion:1,node:"GUIDE_PROCESS_BIND37",revision,phaseCount:7,entries:inventory,verdict:"EXACT_CURRENT_RUNTIME_PROCESS_GUARDS_BOUND" },null,2)}\n`,{ flag:"wx",mode:0o600 });
  const proof={ schemaVersion:1,node:"GUIDE_PROCESS_BIND37",ticket:"t_ebade6b9",revision,verdict:"PASS_PROCESS_IDENTITY_BOUND_REVIEW_REQUIRED",controls:names.length,passed:names.length,names,processIdentity:{ actualFixture:{ pid:realCustody.pid,ppid:1,pgid:realCustody.pgid,commandMarker:realCustody.commandMarker },oldFalseAcceptanceStatus:old.result.status,readinessStatus:goodReadiness.result.status,idleStatus:goodIdle.result.status,readinessNegativeCases:Object.keys(rows).length,idleNegativeCases:Object.keys(rows).length },operatorGuard:{ staleStatus:staleOperatorRun.status,matchingStatus:goodOperatorRun.status,matchingReachedBoundary:true },hashes:{ commandContract:finalHash,operatorScript:sha(operatorSource),processValidator:sha(helperBytes),readiness:sha(await readFile(readinessPath)),idle:sha(await readFile(idlePath)),screenshotHelper:"824e780a1817c198a6ca6ebc6215948241ecccbb5611617a033e650799ac4b29" },traffic:{ runtime:0,browser:0,http:0,status:0,capacity:0,database:0,support:0,model:0 },futurePaths:{ count:123,allAbsent:true } };
  await writeFile(`${E}/GUIDE_PROCESS_BIND37-control-proof.json`,`${JSON.stringify(proof,null,2)}\n`,{ flag:"wx",mode:0o600 });
  console.log(JSON.stringify({ passed:proof.passed,controls:proof.controls,oldFalseAcceptance:proof.processIdentity.oldFalseAcceptanceStatus,readiness:proof.processIdentity.readinessStatus,idle:proof.processIdentity.idleStatus,futureAbsent:123 }));
} finally { await rm(dir,{ recursive:true,force:true }); }
