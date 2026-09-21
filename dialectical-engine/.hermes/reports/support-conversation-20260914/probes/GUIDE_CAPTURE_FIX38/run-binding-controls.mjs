import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { access,mkdtemp,readFile,rm,writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const R="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const E=`${R}/evidence`,P=`${R}/probes`;
const node="/Users/vladmihaimiron/.local/bin/node";
const commandPath=`${E}/GUIDE_CAPTURE_FIX38-command-contract.json`;
const operatorPath=`${E}/GUIDE_CAPTURE_FIX38-operator-contract.json`;
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const json=async path=>JSON.parse(await readFile(path,"utf8"));
const absent=async path=>{try{await access(path);return false;}catch(error){assert.equal(error.code,"ENOENT");return true;}};
const command=await json(commandPath),operator=await json(operatorPath);
const names=[];const check=async(name,fn)=>{await fn();names.push(name);};
await check("all seven literal argv self-bind the final contract",async()=>{
  assert.deepEqual(Object.keys(command.phases),["preflight","readiness","capacity","gate","rowProof","capture","idle"]);
  for(const phase of Object.values(command.phases))assert.equal(phase.argv[2],commandPath);
});
await check("fresh LIVE31 phase and GUIDE23 actual namespaces are exact",async()=>{
  for(const phase of Object.values(command.phases)){assert.ok(phase.output.includes("GUIDE_LIVE31-"));assert.ok(phase.log.includes("GUIDE_LIVE31-"));}
  assert.equal(command.actualReceipt,`${E}/GUIDE_LIVE_GUIDE23-actual-receipt.json`);
  assert.equal(command.phases.rowProof.result,`${E}/GUIDE_ROW_PROOF-run-LIVE31.json`);
});
await check("capture uses corrected helper through the local successor",async()=>{
  assert.equal(command.phases.capture.childArgv[3],`${P}/GUIDE_CAPTURE_FIX38/capture-public-guide.mjs`);
  assert.equal(command.phases.capture.childArgv[4],command.phases.gate.output);
  assert.equal(command.captureImplementation.sha256,sha(await readFile(command.captureImplementation.path)));
  assert.equal(command.screenshotHelper.sha256,sha(await readFile(command.screenshotHelper.path)));
});
await check("readiness idle and process identity remain byte-bound to PROCESS_BIND37",async()=>{
  assert.equal(command.phases.readiness.argv[1],`${P}/GUIDE_PROCESS_BIND37/phase-readiness.mjs`);
  assert.equal(command.phases.idle.argv[1],`${P}/GUIDE_PROCESS_BIND37/phase-idle.mjs`);
  assert.equal(command.processIdentityValidator.sha256,sha(await readFile(command.processIdentityValidator.path)));
});
await check("fixed31 plan remains exact and unique",async()=>{assert.equal(command.actualSequences.length,31);assert.equal(new Set(command.actualSequences).size,31);});
await check("preflight binds all potential GUIDE23 screenshots and failure artifacts",async()=>{
  const src=await readFile(command.phases.preflight.argv[1],"utf8");
  assert.ok(src.includes("GUIDE_LIVE_GUIDE23-row-"));assert.ok(src.includes("-screenshot-failure.json"));
});
await check("operator metadata binds the actual finalized files",async()=>{
  assert.equal(operator.commandContract.sha256,sha(await readFile(commandPath)));
  assert.equal(operator.script.sha256,sha(await readFile(operator.script.path)));
  assert.deepEqual(operator.argv,[node,"--import","tsx",operator.script.path]);
});
await check("all future outputs are unique and absent",async()=>{assert.equal(operator.futureAbsence.count,154);assert.equal(operator.futureAbsence.uniqueCount,154);});
assert.equal((await Promise.all(operator.futureAbsence.paths.map(absent))).every(Boolean),true);

const operatorSource=await readFile(operator.script.path,"utf8"),finalHash=sha(await readFile(commandPath));
const boundary="\nif (inert) {",index=operatorSource.lastIndexOf(boundary);
assert.ok(index>0);const dir=await mkdtemp(join(tmpdir(),"guide-capture-fix38-"));
try{
  const insertion="\nthrow new Error(\"GUIDE_CAPTURE_FIX38_FIRST_PHASE_INTERCEPT\");\n";
  const good=join(dir,"good.mjs"),stale=join(dir,"stale.mjs");
  await writeFile(good,operatorSource.slice(0,index)+insertion+operatorSource.slice(index),{mode:0o600});
  const staleSource=operatorSource.replace(finalHash,"0".repeat(64)),staleIndex=staleSource.lastIndexOf(boundary);
  await writeFile(stale,staleSource.slice(0,staleIndex)+insertion+staleSource.slice(staleIndex),{mode:0o600});
  const run=path=>spawnSync(node,["--import","tsx",path],{cwd:command.cwd,encoding:"utf8",env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR}});
  const staleRun=run(stale),goodRun=run(good);
  await check("stale embedded command hash rejects before controlled first-phase boundary",async()=>{assert.notEqual(staleRun.status,0);assert.equal(staleRun.stderr.includes("GUIDE_CAPTURE_FIX38_FIRST_PHASE_INTERCEPT"),false);});
  await check("actual embedded command hash reaches controlled first-phase boundary",async()=>{assert.notEqual(goodRun.status,0);assert.equal(goodRun.stderr.includes("GUIDE_CAPTURE_FIX38_FIRST_PHASE_INTERCEPT"),true);});
  const proof={schemaVersion:1,node:"GUIDE_CAPTURE_FIX38",ticket:"t_368d9d59",revision:command.revision,
    verdict:"PASS_FINAL_CAPTURE_BINDING_CONTROLS",controls:names.length,passed:names.length,names,
    operatorGuard:{staleStatus:staleRun.status,matchingStatus:goodRun.status,matchingReachedBoundary:true},
    hashes:{commandContract:finalHash,operatorScript:sha(operatorSource),operatorContract:sha(await readFile(operatorPath)),
      screenshotHelper:command.screenshotHelper.sha256,captureImplementation:command.captureImplementation.sha256},
    futurePaths:{count:154,allAbsent:true},traffic:{runtime:0,browserApp:0,http:0,status:0,capacity:0,database:0,support:0,model:0}};
  await writeFile(`${E}/GUIDE_CAPTURE_FIX38-binding-control-proof.json`,`${JSON.stringify(proof,null,2)}\n`,{flag:"wx",mode:0o600});
  console.log(JSON.stringify({passed:proof.passed,controls:proof.controls,futureAbsent:154,staleStatus:staleRun.status,currentBoundary:goodRun.status}));
}finally{await rm(dir,{recursive:true,force:true});}
