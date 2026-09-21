import { createHash } from "node:crypto";
const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");
const fail=code=>{throw new Error(code);};
export function validateGuideGated58Result({resultBytes,expectedRevision,expectedKbVersion,expectedGatePath,expectedGateSha256}){
  let result;try{result=JSON.parse(resultBytes);}catch{fail("GUIDE_CONTINUATION_ROW_PROOF_RESULT_INVALID");}
  if(result?.schemaVersion!==1||result.node!=="GUIDE_CONTINUATION_BIND40"||result.verdict!=="PASS"
    ||result.resultCode!=="GUIDE_ROW_PROOF_ALL_ROWS_PASS"||result.kbVersion!==expectedKbVersion
    ||result.entryCount!==44||result.actualModelRows!==18||result.custody?.targetRevision!==expectedRevision
    ||result.custody?.gatePath!==expectedGatePath||result.custody?.gateSha256!==expectedGateSha256
    ||!Array.isArray(result.rows)||result.rows.length!==58
    ||result.rows.some((row,index)=>row.sequence!==index+1||row.result!=="PASS"||row.code!=="GUIDE_ROW_PROOF_PASS")){
    fail("GUIDE_CONTINUATION_ROW_PROOF_RESULT_INVALID");
  }
  return {result,resultSha256:sha256(resultBytes),rowCount:58};
}
export function validateGuideRowProofDependency({status,resultBytes,gateBytes,expectedRevision,expectedKbVersion,expectedGatePath,expectedResultPath,nowMs=Date.now()}){
  const gateSha256=sha256(gateBytes),measured=Date.parse(status?.completedAtUtc);
  if(status?.schemaVersion!==2||status.phase!=="ROW_PROOF"||status.revision!==expectedRevision
    ||status.status!==0||status.signal!==null||status.resultPath!==expectedResultPath
    ||status.gatePath!==expectedGatePath||status.gateSha256!==gateSha256||status.validatedRows!==58
    ||status.validation!=="PASS"||!Number.isFinite(measured)||measured>nowMs+5000||nowMs-measured>120000){
    fail("GUIDE_CONTINUATION_ROW_PROOF_STATUS_INVALID");
  }
  const validated=validateGuideGated58Result({resultBytes,expectedRevision,expectedKbVersion,expectedGatePath,expectedGateSha256:gateSha256});
  if(validated.resultSha256!==status.resultSha256)fail("GUIDE_CONTINUATION_ROW_PROOF_HASH_MISMATCH");
  return {resultPath:status.resultPath,resultSha256:validated.resultSha256,gatePath:status.gatePath,gateSha256,validatedRows:58};
}
