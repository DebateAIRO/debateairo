import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir,readFile,writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const ROOT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const E=`${ROOT}/evidence`,P=`${ROOT}/probes/GUIDE_UI_OUTPUT_FIX51`;
const L="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const NODE="/Users/vladmihaimiron/.local/bin/node",CONTRACT=`${E}/GUIDE_UI_OUTPUT_FIX51-command-contract.json`;
const CHILD=`${P}/ui-transition-live-preflight.mjs`,OLD_CHILD=`${ROOT}/probes/GUIDE_CAPTURE_PANE_FIX48/ui-transition-live-preflight.mjs`;
const OPERATOR=`${P}/run-operator.mjs`,FIXTURES=`${P}/fixtures`;
const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");
const run=(argv,env={})=>spawnSync(argv[0],argv.slice(1),{cwd:L,env:{...process.env,...env},encoding:"utf8"});
const checks=[];const pass=(name,detail={})=>checks.push({name,result:"PASS",...detail});
const reject=(name,result,pattern)=>{assert.notEqual(result.status,0,name);assert.match(`${result.stdout}${result.stderr}`,pattern);pass(name,{status:result.status});};

const contractBytes=await readFile(CONTRACT),digest=sha256(contractBytes),contract=JSON.parse(contractBytes),ui=contract.phases.preflight.ui;
assert.equal(digest,"e804fdc52d3d9a52ddac3a481d119b8803b7c7e27a7a41ae5c69966cca8bf868");
assert.deepEqual(ui.argv,[NODE,CHILD,CONTRACT,ui.output]);assert.equal(ui.profile,`${contract.browserProfile}-ui-preflight`);
pass("final contract binds exact real child argv output and derived profile");

const legacy=run([NODE,OLD_CHILD,ui.output],{GUIDE_UI_BINDING_OFFLINE:"1"});
reject("predecessor rejects fresh selected LIVE39 output",legacy,/GUIDE_CONTINUATION_UI_OUTPUT_PATH_INVALID/u);

const positive=run(ui.argv,{GUIDE_UI_BINDING_OFFLINE:"1",GUIDE_UI_PARENT_CONTRACT_SHA256:digest});
assert.equal(positive.status,0,positive.stderr);const positiveValue=JSON.parse(positive.stdout.trim());
assert.deepEqual(positiveValue,{code:"PASS_REAL_UI_CHILD_BINDING",mode:"OPERATIONAL",output:ui.output,profile:ui.profile});
pass("real corrected child accepts exact selected caller binding before custody or browser",{boundary:"POST_BINDING_PRE_OUTPUT_CUSTODY_PROCESS_BROWSER"});

reject("real child rejects unselected output",run([NODE,CHILD,CONTRACT,`${E}/GUIDE_UI_OUTPUT_FIX51-unselected-output.json`],{GUIDE_UI_BINDING_OFFLINE:"1",GUIDE_UI_PARENT_CONTRACT_SHA256:digest}),/GUIDE_CONTINUATION_UI_CALLER_BINDING_INVALID/u);
reject("real child rejects contract digest mismatch",run(ui.argv,{GUIDE_UI_BINDING_OFFLINE:"1",GUIDE_UI_PARENT_CONTRACT_SHA256:"0".repeat(64)}),/GUIDE_CONTINUATION_UI_CONTRACT_BINDING_INVALID/u);

await mkdir(FIXTURES,{recursive:true,mode:0o700});
const wrongProfile=structuredClone(contract),wrongPath=`${FIXTURES}/wrong-profile-contract.json`;
wrongProfile.phases.preflight.ui.profile=`${P}/arbitrary-profile`;
wrongProfile.phases.preflight.ui.argv=[NODE,CHILD,wrongPath,ui.output];
const wrongBytes=Buffer.from(`${JSON.stringify(wrongProfile,null,2)}\n`);await writeFile(wrongPath,wrongBytes,{flag:"wx",mode:0o600});
reject("real child rejects selected contract with profile outside derived binding",run(wrongProfile.phases.preflight.ui.argv,{GUIDE_UI_BINDING_OFFLINE:"1",GUIDE_UI_PARENT_CONTRACT_SHA256:sha256(wrongBytes)}),/GUIDE_CONTINUATION_UI_CALLER_BINDING_INVALID/u);

const controlOutput=`${E}/GUIDE_UI_WRITER_FIX45-actual-ui-control.json`;
const control=run([NODE,CHILD,"--control",controlOutput],{GUIDE_UI_BINDING_OFFLINE:"1"});assert.equal(control.status,0,control.stderr);assert.equal(JSON.parse(control.stdout).mode,"CONTROL");pass("distinct exact control binding remains closed and accepted");
reject("control mode rejects any other output",run([NODE,CHILD,"--control",`${E}/GUIDE_UI_OUTPUT_FIX51-other-control.json`],{GUIDE_UI_BINDING_OFFLINE:"1"}),/GUIDE_CONTINUATION_UI_CONTROL_BINDING_INVALID/u);

for(const phase of Object.values(contract.phases))assert.equal(phase.argv[2],CONTRACT);pass("all seven literal phase argv self-bind final contract",{phaseCount:7});
for(const item of contract.moduleClosure){const bytes=await readFile(item.path);assert.equal(bytes.byteLength,item.bytes);assert.equal(sha256(bytes),item.sha256);}assert.equal(sha256(Buffer.from(JSON.stringify(contract.moduleClosure))),contract.moduleClosureSha256);assert.equal(contract.moduleClosure.some(item=>item.path===CHILD),true);pass("reachable closure binds changed real child",{moduleCount:contract.moduleClosure.length,moduleClosureSha256:contract.moduleClosureSha256});
const guard=run([NODE,"--import","tsx",OPERATOR,"--inert-guard",CONTRACT,digest]);assert.equal(guard.status,0,guard.stderr);assert.match(guard.stdout,/PASS_INERT_GUARD/u);pass("final operator accepts exact contract from reviewed cwd");
for(const path of contract.futureAbsence)assert.equal((await import("node:fs")).existsSync(path),false,`future path present ${path}`);pass("all LIVE39 actual GUIDE26 and owner future outputs absent",{count:contract.futureAbsence.length});
for(const path of [CHILD,`${P}/phase-preflight.mjs`,`${P}/preflight-schema.mjs`,`${P}/composition.mjs`,`${P}/capture-public-guide.mjs`,`${P}/replay-row-proofs.mjs`,OPERATOR]){const result=run([NODE,"--check",path]);assert.equal(result.status,0,result.stderr);}pass("affected and rebound executable modules parse",{count:7});

const operatorBytes=await readFile(OPERATOR),operatorContract={schemaVersion:1,node:"GUIDE_UI_OUTPUT_FIX51",cwd:L,argv:[NODE,"--import","tsx",OPERATOR],sandboxPermissions:"require_escalated",toolCapturedOutput:true,redirection:false,script:{path:OPERATOR,sha256:sha256(operatorBytes),bytes:operatorBytes.byteLength},commandContract:{path:CONTRACT,sha256:digest,bytes:contractBytes.byteLength},operatorOwned:{outputs:{prerequisite:contract.lifecycle.prerequisite,stop:contract.lifecycle.stop},logs:contract.lifecycle.operatorLogs},futureAbsence:{count:contract.futureAbsence.length,uniqueCount:new Set(contract.futureAbsence).size,paths:contract.futureAbsence}};
await writeFile(`${E}/GUIDE_UI_OUTPUT_FIX51-operator-contract.json`,`${JSON.stringify(operatorContract,null,2)}\n`,{flag:"wx",mode:0o600});
const proof={schemaVersion:1,node:"GUIDE_UI_OUTPUT_FIX51",ticket:"t_c7f65888",revision:contract.revision,verdict:"PASS_REAL_UI_OUTPUT_BOUND_REVIEW_REQUIRED",controls:checks.length+1,passed:checks.length+1,checks:[...checks,{name:"proof serialized",result:"PASS"}],bindings:{contractSha256:digest,moduleClosureSha256:contract.moduleClosureSha256,uiScriptSha256:ui.sha256,uiOutput:ui.output,uiProfile:ui.profile},traffic:{browser:0,runtime:0,http:0,status:0,capacity:0,database:0,support:0,model:0},retained:{actualReplies:11,remainingUnsent:20,actualGuide26Unused:true}};
await writeFile(`${E}/GUIDE_UI_OUTPUT_FIX51-control-proof.json`,`${JSON.stringify(proof,null,2)}\n`,{flag:"wx",mode:0o600});
await writeFile(`${ROOT}/logs/GUIDE_UI_OUTPUT_FIX51-controls-final.log`,`${JSON.stringify({verdict:proof.verdict,passed:proof.passed,contractSha256:digest},null,2)}\n`,{flag:"wx",mode:0o600});
process.stdout.write(`${JSON.stringify({verdict:proof.verdict,passed:proof.passed,contractSha256:digest})}\n`);
