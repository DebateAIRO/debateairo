import { createHash } from "node:crypto";
import { readFile,writeFile } from "node:fs/promises";
import { basename,dirname,isAbsolute } from "node:path";
import { GUIDE_MATRIX,validateGuideMatrix } from "../GUIDE_CONTINUATION_BIND40/matrix.mjs";
import { createGuidePreRequestVerifier } from "../GUIDE_CONTINUATION_BIND40/pre-request-verifier.ts";

const EVIDENCE_ROOT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence";
const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");
const [gatePath,revision,outputPath,...extra]=process.argv.slice(2);
if(extra.length||!isAbsolute(gatePath??"")||!/^[0-9a-f]{40}$/u.test(revision??"")
  ||!isAbsolute(outputPath??"")||dirname(outputPath)!==EVIDENCE_ROOT
  ||!(/^(?:GUIDE_ROW_PROOF-run-LIVE36|GUIDE_CAPTURE_ACTIVATION_FIX47-row-proof-control)\.json$/u.test(basename(outputPath)))) {
  throw new Error("GUIDE_CONTINUATION_ROW_PROOF_ARGUMENTS_INVALID");
}
const gateBytes=await readFile(gatePath); const gate=JSON.parse(gateBytes);
if(gate.finalCommit!==revision)throw new Error("GUIDE_CONTINUATION_ROW_PROOF_REVISION_MISMATCH");
validateGuideMatrix(GUIDE_MATRIX);
const verifier=await createGuidePreRequestVerifier(gate);
const rows=GUIDE_MATRIX.map(row=>{
  const proof=verifier.prepare(row);
  return {
    sequence:row.sequence,family:row.family,kind:row.kind,mode:row.mode,language:row.language,
    result:"PASS",code:"GUIDE_ROW_PROOF_PASS",
    expected:{ branch:row.branch,sourceIds:[...row.expectedSourceIds],
      requiredSourceIds:[...(row.requiredSourceIds??[])],allowedSourceIds:[...(row.allowedSourceIds??[])],
      recoverySourceIds:[...(row.recoverySourceIds??[])],actionPolicy:row.actionPolicy,
      requiredActionId:row.requiredActionId??row.navigation?.actionId??null,recoveryClass:row.recoveryClass },
    derived:{ branch:proof.branch,sourceIds:[...(proof.sourceIds??[])],sourcePolicy:proof.sourcePolicy??null,
      recoverySourceIds:[...(proof.recoverySourceIds??[])],requestedActionIds:[...(proof.requestedActionIds??[])],
      allowedActionIds:[...(proof.allowedActions??[])].map(({id})=>id),recoveryClass:proof.recoveryClass??null,
      fallbackSha256:proof.fallbackSha256??null }
  };
});
if(rows.length!==58||rows.some((row,index)=>row.sequence!==index+1))throw new Error("GUIDE_CONTINUATION_ROW_PROOF_INVALID");
const result={ schemaVersion:1,node:"GUIDE_CONTINUATION_BIND40",verdict:"PASS",
  resultCode:"GUIDE_ROW_PROOF_ALL_ROWS_PASS",traffic:{ browser:false,sessions:0,supportRequests:0,modelRequests:0 },
  custody:{ targetRevision:revision,gatePath,gateSha256:sha256(gateBytes),matrixCount:58,
    harnessSha256:verifier.controlProof.harnessSha256 },kbVersion:verifier.kbVersion,
  entryCount:verifier.entryCount,modelRows:verifier.modelRows,actualModelRows:verifier.actualModelRows,rows };
await writeFile(outputPath,`${JSON.stringify(result,null,2)}\n`,{flag:"wx",mode:0o600});
