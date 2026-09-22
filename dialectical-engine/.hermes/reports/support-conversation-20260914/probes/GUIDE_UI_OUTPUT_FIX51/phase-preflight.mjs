import assert from "node:assert/strict";
import { closeSync,openSync } from "node:fs";
import { readFile,writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFinalContract,requireAbsoluteCommand } from "../GUIDE_HARNESS_BIND21/phase-contract.mjs";
import { validateArtifactLifecycle } from "../GUIDE_UI_WRITER_FIX45/artifact-lifecycle.mjs";
import { validateGuidePreflightSchema } from "./preflight-schema.mjs";
const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");
const offlineSchemaControl=process.argv[2]==="--offline-schema-control";
const contractPath=offlineSchemaControl?process.argv[3]:process.argv[2],contractBytes=await readFile(contractPath),contractSha256=sha256(contractBytes),contract=await readFinalContract(contractPath);
assert.deepEqual(Object.keys(contract.phases),["preflight","readiness","capacity","gate","rowProof","capture","idle"]);for(const phase of Object.values(contract.phases))requireAbsoluteCommand(phase);
if(offlineSchemaControl){
  const checked=await validateGuidePreflightSchema(contract,{reachUiChild:async ui=>({intercepted:true,script:ui.script})});
  process.stdout.write(`${JSON.stringify({code:"PASS_REAL_PREFLIGHT_SCHEMA_BOUNDARY",retainedRows:checked.retainedRows,remainingRows:checked.remainingRows,uiChildBoundary:checked.boundary})}\n`);
  process.exit(0);
}
await validateArtifactLifecycle({contract,contractPath,contractSha256,stage:"PREFLIGHT_ENTRY"});
const checked=await validateGuidePreflightSchema(contract);const ui=checked.ui;
const fd=openSync(ui.log,"wx",0o600);let child;try{child=spawnSync(ui.argv[0],ui.argv.slice(1),{cwd:contract.cwd,env:{...process.env,GUIDE_UI_PARENT_CONTRACT_SHA256:contractSha256},stdio:["ignore",fd,fd]});}finally{closeSync(fd)}
if((child.status??1)!==0)throw new Error("GUIDE_CONTINUATION_UI_PREFLIGHT_FAILED");
await validateArtifactLifecycle({contract,contractPath,contractSha256,stage:"PREFLIGHT_UI_COMPLETE"});
const uiResult=JSON.parse(await readFile(ui.output,"utf8"));if(uiResult.completed!==true||uiResult.createSessionAttempts!==0||uiResult.messageAttempts!==1||uiResult.forwardedDynamicRequests!==0||uiResult.hiddenSupportSetupRequests!==0)throw new Error("GUIDE_CONTINUATION_UI_PREFLIGHT_INVALID");
await writeFile(contract.phases.preflight.output,`${JSON.stringify({schemaVersion:2,phase:"PRETRAFFIC",revision:contract.revision,contractSha256,checkedAbsent:contract.futureAbsence.length,retainedRows:checked.retainedRows,remainingRows:checked.remainingRows,ui:{completed:true,createSessionAttempts:0,messageAttempts:1,forwardedDynamicRequests:0}},null,2)}\n`,{flag:"wx",mode:0o600});
