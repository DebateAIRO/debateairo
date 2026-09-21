import { constants } from "node:fs";
import { access,open,readFile } from "node:fs/promises";
const fail=code=>{throw new Error(code)};
const exists=async path=>{try{await access(path);return true}catch(e){if(e?.code==="ENOENT")return false;throw e}};
async function validateOwnedFile(path){let h;try{h=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0))}catch{fail("GUIDE_LIFECYCLE_OWNED_FILE_INVALID")}try{const m=await h.stat();if(!m.isFile()||m.uid!==process.getuid()||m.nlink!==1||(m.mode&0o777)!==0o600)fail("GUIDE_LIFECYCLE_OWNED_FILE_INVALID");return await h.readFile();}finally{await h.close()}}
export async function validateArtifactLifecycle({contract,contractPath,contractSha256,stage}){
 const prerequisite=contract.operatorOwned?.outputs?.prerequisite??contract.lifecycle?.prerequisite;
 const expected=stage==="INITIAL"?new Set():stage==="PREFLIGHT_ENTRY"?new Set([prerequisite]):stage==="PREFLIGHT_UI_COMPLETE"?new Set([prerequisite,contract.phases.preflight.ui.output,contract.phases.preflight.ui.log]):null;
 if(!expected)fail("GUIDE_LIFECYCLE_STAGE_INVALID");
 for(const path of contract.futureAbsence){const present=await exists(path);if(present!==expected.has(path))fail(present?"GUIDE_LIFECYCLE_UNEXPECTED_PRESENT":"GUIDE_LIFECYCLE_EXPECTED_MISSING")}
 if(stage!=="INITIAL"){
  const bytes=await validateOwnedFile(prerequisite);let value;try{value=JSON.parse(bytes)}catch{fail("GUIDE_LIFECYCLE_PREREQUISITE_INVALID")}
  if(value?.schemaVersion!==1||value.node!==contract.node||value.revision!==contract.revision||value.contractPath!==contractPath||value.contractSha256!==contractSha256||value.invocationNonce!==contract.lifecycle.invocationNonce||value.futureOutputsCheckedAbsent!==contract.futureAbsence.length)fail("GUIDE_LIFECYCLE_PREREQUISITE_INVALID");
 }
 if(stage==="PREFLIGHT_UI_COMPLETE"){
  await validateOwnedFile(contract.phases.preflight.ui.log);await validateOwnedFile(contract.phases.preflight.ui.output);
 }
 return {stage,expectedPresent:[...expected]};
}
export async function createInvocationPrerequisite({contract,contractPath,contractSha256,payload={}}){
 await validateArtifactLifecycle({contract,contractPath,contractSha256,stage:"INITIAL"});
 const prerequisite=contract.lifecycle.prerequisite;
 const { writeFile }=await import("node:fs/promises");
 const value={schemaVersion:1,node:contract.node,revision:contract.revision,contractPath,contractSha256,invocationNonce:contract.lifecycle.invocationNonce,futureOutputsCheckedAbsent:contract.futureAbsence.length,...payload};
 await writeFile(prerequisite,`${JSON.stringify(value,null,2)}\n`,{flag:"wx",mode:0o600});
 await validateArtifactLifecycle({contract,contractPath,contractSha256,stage:"PREFLIGHT_ENTRY"});
 return value;
}
