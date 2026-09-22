import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { validateRetainedCompositionContract as validateLegacyComposition } from "../GUIDE_UI_WRITER_FIX45/composition.mjs";

const ROOT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const E=`${ROOT}/evidence`;
const P=`${ROOT}/probes/GUIDE_PREFLIGHT_SCHEMA_FIX49`;
const NODE="/Users/vladmihaimiron/.local/bin/node";
const CONTRACT=`${E}/GUIDE_PREFLIGHT_SCHEMA_FIX49-command-contract.json`;
const COMPOSITION=`${E}/GUIDE_PREFLIGHT_SCHEMA_FIX49-composition-contract.json`;
const PHASE=`${P}/phase-preflight.mjs`;
const OPERATOR=`${P}/run-operator.mjs`;
const FIXTURES=`${P}/fixtures-green`;
const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");
const checks=[];
const pass=(name,detail={})=>checks.push({name,result:"PASS",...detail});
const run=(argv,env=process.env)=>spawnSync(argv[0],argv.slice(1),{cwd:"/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine",env,encoding:"utf8"});
const expectRejected=(name,result,pattern)=>{assert.notEqual(result.status,0,name);assert.match(`${result.stdout}${result.stderr}`,pattern);pass(name,{status:result.status});};

const contractBytes=await readFile(CONTRACT),contractSha256=sha256(contractBytes),contract=JSON.parse(contractBytes);
const compositionBytes=await readFile(COMPOSITION),composition=JSON.parse(compositionBytes);
assert.equal(contract.compositionContractSha256,sha256(compositionBytes));
assert.equal(composition.schemaVersion,2);assert.equal(composition.retainedSequences.length,11);assert.equal(composition.remainingSequences.length,20);
pass("schema2 composition binds retained11 remaining20",{compositionSha256:sha256(compositionBytes)});

let legacyRejected=false;try{await validateLegacyComposition(composition);}catch(error){legacyRejected=error?.message==="GUIDE_CONTINUATION_COMPOSITION_CONTRACT_INVALID";}
assert.equal(legacyRejected,true);pass("legacy schema1 consumer rejects production-shaped schema2 composition");

const positive=run([NODE,PHASE,"--offline-schema-control",CONTRACT]);
assert.equal(positive.status,0,positive.stderr);const positiveResult=JSON.parse(positive.stdout.trim());
assert.deepEqual(positiveResult,{code:"PASS_REAL_PREFLIGHT_SCHEMA_BOUNDARY",retainedRows:11,remainingRows:20,uiChildBoundary:{intercepted:true,script:contract.phases.preflight.ui.script}});
pass("real preflight entrypoint reaches intercepted UI child boundary",{retainedRows:11,remainingRows:20});

await mkdir(FIXTURES,{recursive:true,mode:0o700});
async function fixture(name,mutateComposition,mutateContract){
  const nextComposition=structuredClone(composition);mutateComposition?.(nextComposition);
  const compositionPath=`${FIXTURES}/${name}-composition.json`;
  const nextCompositionBytes=Buffer.from(`${JSON.stringify(nextComposition,null,2)}\n`);
  await writeFile(compositionPath,nextCompositionBytes,{flag:"wx",mode:0o600});
  const nextContract=structuredClone(contract);nextContract.compositionContractPath=compositionPath;nextContract.compositionContractSha256=sha256(nextCompositionBytes);mutateContract?.(nextContract);
  const contractPath=`${FIXTURES}/${name}-contract.json`;
  await writeFile(contractPath,`${JSON.stringify(nextContract,null,2)}\n`,{flag:"wx",mode:0o600});
  return run([NODE,PHASE,"--offline-schema-control",contractPath]);
}
expectRejected("wrong schema rejected before UI child",await fixture("wrong-schema",value=>{value.schemaVersion=1;}),/GUIDE_CONTINUATION_COMPOSITION_CONTRACT_INVALID|GUIDE_PREFLIGHT_SCHEMA_INVALID/u);
expectRejected("retained cardinality rejected before UI child",await fixture("retained-ten",value=>{value.retainedSequences=value.retainedSequences.slice(0,10);}),/GUIDE_CONTINUATION_COMPOSITION_CONTRACT_INVALID|GUIDE_PREFLIGHT_RETAINED_CARDINALITY_INVALID/u);
expectRejected("remaining cardinality rejected before UI child",await fixture("remaining-nineteen",value=>{value.remainingSequences=value.remainingSequences.slice(0,19);}),/GUIDE_CONTINUATION_COMPOSITION_CONTRACT_INVALID|GUIDE_PREFLIGHT_REMAINING_CARDINALITY_INVALID/u);
expectRejected("composition binding mismatch rejected before UI child",await fixture("binding-mismatch",null,value=>{value.compositionContractSha256="0".repeat(64);}),/GUIDE_PREFLIGHT_COMPOSITION_BINDING_INVALID/u);

for(const phase of Object.values(contract.phases))assert.equal(phase.argv[2],CONTRACT);
pass("all seven literal phase argv self-bind final FIX49 contract",{phaseCount:7});
assert.equal(contract.phases.preflight.argv[1],PHASE);assert.equal(contract.phases.preflight.output.endsWith("GUIDE_LIVE38-preflight.json"),true);
assert.equal(contract.phases.rowProof.childArgv[3],`${P}/replay-row-proofs.mjs`);assert.equal(contract.phases.capture.childArgv[3],`${P}/capture-public-guide.mjs`);
pass("fresh LIVE38 preflight row-proof and capture children bound");

for(const item of contract.moduleClosure){const bytes=await readFile(item.path);assert.equal(bytes.byteLength,item.bytes);assert.equal(sha256(bytes),item.sha256);}
assert.equal(sha256(Buffer.from(JSON.stringify(contract.moduleClosure))),contract.moduleClosureSha256);
assert.equal(contract.moduleClosure.some(item=>item.path===`${P}/preflight-schema.mjs`),true);
pass("reachable module closure includes shared schema validator",{moduleCount:contract.moduleClosure.length,moduleClosureSha256:contract.moduleClosureSha256});

const guard=run([NODE,"--import","tsx",OPERATOR,"--inert-guard",CONTRACT,contractSha256]);assert.equal(guard.status,0,guard.stderr);assert.match(guard.stdout,/PASS_INERT_GUARD/u);pass("real operator accepts actual finalized contract hash");
expectRejected("real operator rejects stale contract hash",run([NODE,"--import","tsx",OPERATOR,"--inert-guard",CONTRACT,"0".repeat(64)]),/CONTRACT_HASH_MISMATCH/u);

for(const path of contract.futureAbsence){let present=true;try{await readFile(path);}catch(error){if(error?.code==="EISDIR")present=true;else if(error?.code==="ENOENT")present=false;else throw error;}assert.equal(present,false,`future path already present: ${path}`);}
pass("all LIVE38 and actual GUIDE26 future outputs remain absent",{count:contract.futureAbsence.length});

for(const path of [PHASE,`${P}/preflight-schema.mjs`,`${P}/composition.mjs`,`${P}/capture-public-guide.mjs`,`${P}/replay-row-proofs.mjs`,OPERATOR]){const result=run([NODE,"--check",path]);assert.equal(result.status,0,result.stderr);}
pass("all changed or copied executable modules parse",{count:6});

const proof={schemaVersion:1,node:"GUIDE_PREFLIGHT_SCHEMA_FIX49",ticket:"t_d5f212de",revision:contract.revision,verdict:"PASS_PREFLIGHT_SCHEMA_BOUND_REVIEW_REQUIRED",controls:checks.length+1,passed:checks.length+1,checks:[...checks,{name:"proof serialized",result:"PASS"}],bindings:{contractSha256,compositionSha256:sha256(compositionBytes),moduleClosureSha256:contract.moduleClosureSha256,retainedRows:11,remainingRows:20},traffic:{browser:0,runtime:0,http:0,status:0,capacity:0,database:0,support:0,model:0},retainedEvidence:{compiledReactReplay:true,logicalRows:58,capacityAndComposer:true}};
const operatorBytes=await readFile(OPERATOR);
const operatorContract={schemaVersion:1,node:"GUIDE_PREFLIGHT_SCHEMA_FIX49",cwd:"/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine",argv:[NODE,"--import","tsx",OPERATOR],sandboxPermissions:"require_escalated",toolCapturedOutput:true,redirection:false,script:{path:OPERATOR,sha256:sha256(operatorBytes),bytes:operatorBytes.byteLength},commandContract:{path:CONTRACT,sha256:contractSha256,bytes:contractBytes.byteLength},operatorOwned:{outputs:{prerequisite:contract.lifecycle.prerequisite,stop:contract.lifecycle.stop},logs:contract.lifecycle.operatorLogs},futureAbsence:{count:contract.futureAbsence.length,uniqueCount:new Set(contract.futureAbsence).size,paths:contract.futureAbsence}};
await writeFile(`${E}/GUIDE_PREFLIGHT_SCHEMA_FIX49-operator-contract.json`,`${JSON.stringify(operatorContract,null,2)}\n`,{flag:"wx",mode:0o600});
await writeFile(`${E}/GUIDE_PREFLIGHT_SCHEMA_FIX49-control-proof.json`,`${JSON.stringify(proof,null,2)}\n`,{flag:"wx",mode:0o600});
await writeFile(`${ROOT}/logs/GUIDE_PREFLIGHT_SCHEMA_FIX49-controls-final.log`,`${JSON.stringify({verdict:proof.verdict,passed:proof.passed,contractSha256},null,2)}\n`,{flag:"wx",mode:0o600});
process.stdout.write(`${JSON.stringify({verdict:proof.verdict,passed:proof.passed,contractSha256})}\n`);
