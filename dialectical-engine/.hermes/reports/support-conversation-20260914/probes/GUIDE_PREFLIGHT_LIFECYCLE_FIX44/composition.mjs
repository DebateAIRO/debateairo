import { createHash } from "node:crypto";
import { readFile,writeFile } from "node:fs/promises";
import { GUIDE_ACTUAL_SEQUENCES,GUIDE_RETAINED_SEQUENCES } from "../GUIDE_CONTINUATION_BIND40/matrix.mjs";
import { validateRemainingSessionCreationTimes } from "./session-times.mjs";
const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");
export async function validateRetainedCompositionContract(contract){
  if(contract?.schemaVersion!==1||contract.productRevision!=="0d34f82f4a2188d0ce1db04655b693798ffd2169"
    ||contract.kbVersion!=="7ef4244d30507e162cebf544eeb6b9578f17ed91711f2d164f2a4d75dd72c7af"
    ||JSON.stringify(contract.retainedSequences)!==JSON.stringify(GUIDE_RETAINED_SEQUENCES)
    ||JSON.stringify(contract.remainingSequences)!==JSON.stringify(GUIDE_ACTUAL_SEQUENCES)
    ||new Set([...contract.retainedSequences,...contract.remainingSequences]).size!==31
    ||contract.live31Verdict!=="FAILED_CAPTURE_ROW47_NO_RETRY"
    ||contract.row47Disposition!=="PASS_COMPLETE_SHORT_FOOTERLESS_SCREENSHOT_NO_RECAPTURE"){
    throw new Error("GUIDE_CONTINUATION_COMPOSITION_CONTRACT_INVALID");
  }
  for(const artifact of contract.retainedArtifacts){
    const bytes=await readFile(artifact.path);
    if(bytes.byteLength!==artifact.bytes||sha256(bytes)!==artifact.sha256)throw new Error("GUIDE_CONTINUATION_RETAINED_ARTIFACT_MISMATCH");
  }
  return contract;
}
export async function createComposedManifest({contract,remainingReceiptPath,outputPath}){
  await validateRetainedCompositionContract(contract);
  const remainingBytes=await readFile(remainingReceiptPath),remaining=JSON.parse(remainingBytes);
  if(remaining.completed!==true||remaining.finalCommit!==contract.productRevision
    ||remaining.kbVersion!==contract.kbVersion
    ||JSON.stringify(remaining.freshRows?.map(row=>row.sequence))!==JSON.stringify(GUIDE_ACTUAL_SEQUENCES)
    ||!Array.isArray(remaining.sessionCreationTimesUtc)){
    throw new Error("GUIDE_CONTINUATION_REMAINING_SEGMENT_INVALID");
  }
  const remainingSessionTimes=validateRemainingSessionCreationTimes(remaining.sessionCreationTimesUtc);
  const allSessions=[...contract.retainedSessionTimes,...remainingSessionTimes].map(({ordinal:_,...value},index)=>({ordinal:index+1,...value}));
  if(allSessions.length!==5)throw new Error("GUIDE_CONTINUATION_SESSION_TIMES_INVALID");
  const manifest={schemaVersion:1,node:"GUIDE_LIVE33",verdict:"COMPOSED31_EVIDENCE_READY_FOR_REVIEW",
    productRevision:contract.productRevision,kbVersion:contract.kbVersion,
    provenance:{retained:{node:"GUIDE_LIVE31",verdict:contract.live31Verdict,sequences:contract.retainedSequences,
      actualReceiptPath:contract.retainedActualReceiptPath,actualReceiptSha256:contract.retainedActualReceiptSha256,
      row47Disposition:contract.row47Disposition},remaining:{node:"GUIDE_LIVE33",sequences:contract.remainingSequences,
      actualReceiptPath:remainingReceiptPath,actualReceiptSha256:sha256(remainingBytes)}},
    caseCount:31,sequences:[...contract.retainedSequences,...contract.remainingSequences],uniqueCaseCount:31,
    sessionTimesUtc:allSessions,continuousSingleRun:false,requiresIndependentReview:true};
  await writeFile(outputPath,`${JSON.stringify(manifest,null,2)}\n`,{flag:"wx",mode:0o600});
  return manifest;
}
