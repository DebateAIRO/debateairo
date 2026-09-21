import assert from "node:assert/strict";
import { closeSync,openSync } from "node:fs";
import { readFile,writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFinalContract,requireAbsoluteCommand } from "../GUIDE_HARNESS_BIND21/phase-contract.mjs";
import { validateRetainedCompositionContract } from "./composition.mjs";
import { validateArtifactLifecycle } from "./artifact-lifecycle.mjs";
const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");
const contractPath=process.argv[2],contractBytes=await readFile(contractPath),contractSha256=sha256(contractBytes),contract=await readFinalContract(contractPath);
assert.deepEqual(Object.keys(contract.phases),["preflight","readiness","capacity","gate","rowProof","capture","idle"]);for(const phase of Object.values(contract.phases))requireAbsoluteCommand(phase);
await validateArtifactLifecycle({contract,contractPath,contractSha256,stage:"PREFLIGHT_ENTRY"});
const compositionBytes=await readFile(contract.compositionContractPath);assert.equal(sha256(compositionBytes),contract.compositionContractSha256);await validateRetainedCompositionContract(JSON.parse(compositionBytes));
const ui=contract.phases.preflight.ui,uiBytes=await readFile(ui.script);assert.equal(sha256(uiBytes),ui.sha256);assert.equal(uiBytes.byteLength,ui.bytes);
const fd=openSync(ui.log,"wx",0o600);let child;try{child=spawnSync(ui.argv[0],ui.argv.slice(1),{cwd:contract.cwd,stdio:["ignore",fd,fd]});}finally{closeSync(fd)}
if((child.status??1)!==0)throw new Error("GUIDE_CONTINUATION_UI_PREFLIGHT_FAILED");
await validateArtifactLifecycle({contract,contractPath,contractSha256,stage:"PREFLIGHT_UI_COMPLETE"});
const uiResult=JSON.parse(await readFile(ui.output,"utf8"));if(uiResult.completed!==true||uiResult.createSessionAttempts!==0||uiResult.messageAttempts!==1||uiResult.forwardedDynamicRequests!==0||uiResult.hiddenSupportSetupRequests!==0)throw new Error("GUIDE_CONTINUATION_UI_PREFLIGHT_INVALID");
await writeFile(contract.phases.preflight.output,`${JSON.stringify({schemaVersion:1,phase:"PRETRAFFIC",revision:contract.revision,contractSha256,checkedAbsent:contract.futureAbsence.length,retainedRows:10,remainingRows:21,ui:{completed:true,createSessionAttempts:0,messageAttempts:1,forwardedDynamicRequests:0}},null,2)}\n`,{flag:"wx",mode:0o600});
