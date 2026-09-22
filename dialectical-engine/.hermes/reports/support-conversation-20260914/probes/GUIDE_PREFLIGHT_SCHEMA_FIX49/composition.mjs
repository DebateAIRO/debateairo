import { createHash } from "node:crypto";
import { readFile,writeFile } from "node:fs/promises";
import { GUIDE_ACTUAL_SEQUENCES,GUIDE_RETAINED_SEQUENCES } from "../GUIDE_CAPTURE_PANE_FIX48/matrix.mjs";
const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");
export async function validateRetainedCompositionContract(contract){
  if(contract?.schemaVersion!==2||contract.productRevision!=="0d34f82f4a2188d0ce1db04655b693798ffd2169"
    ||contract.kbVersion!=="7ef4244d30507e162cebf544eeb6b9578f17ed91711f2d164f2a4d75dd72c7af"
    ||JSON.stringify(contract.retainedSequences)!==JSON.stringify(GUIDE_RETAINED_SEQUENCES)
    ||JSON.stringify(contract.remainingSequences)!==JSON.stringify(GUIDE_ACTUAL_SEQUENCES)
    ||new Set([...contract.retainedSequences,...contract.remainingSequences]).size!==31
    ||contract.live31Verdict!=="FAILED_CAPTURE_ROW47_NO_RETRY"
    ||contract.live36Verdict!=="FAILED_CAPTURE_ROW10_NO_RETRY"
    ||contract.row10Disposition!=="ACTUAL_RESPONSE_RETAINED_PARTIAL_START_IMAGE_REPLAY_IMAGES_NON_ACTUAL"
    ||contract.replayProofKind!=="SYNTHETIC_RESPONSE_REPLAY_THROUGH_REAL_COMPILED_UI"
    ||contract.live36ActualImages.length!==1||!contract.live36ActualImages[0].path.endsWith("GUIDE_LIVE_GUIDE25-row-10-original-pane-start.png")
    ||contract.replayArtifacts.length!==6||contract.replayArtifacts.some(artifact=>artifact.proofKind!==contract.replayProofKind))throw new Error("GUIDE_CONTINUATION_COMPOSITION_CONTRACT_INVALID");
  for(const artifact of contract.retainedArtifacts){const bytes=await readFile(artifact.path);if(bytes.byteLength!==artifact.bytes||sha256(bytes)!==artifact.sha256)throw new Error("GUIDE_CONTINUATION_RETAINED_ARTIFACT_MISMATCH");}
  return contract;
}
export async function createComposedManifest({contract,remainingReceiptPath,outputPath}){
  await validateRetainedCompositionContract(contract);const bytes=await readFile(remainingReceiptPath),remaining=JSON.parse(bytes);
  if(remaining.completed!==true||remaining.finalCommit!==contract.productRevision||remaining.kbVersion!==contract.kbVersion
    ||JSON.stringify(remaining.freshRows?.map(row=>row.sequence))!==JSON.stringify(GUIDE_ACTUAL_SEQUENCES)
    ||!Array.isArray(remaining.sessionCreationTimesUtc)||remaining.sessionCreationTimesUtc.length!==3)throw new Error("GUIDE_CONTINUATION_REMAINING_SEGMENT_INVALID");
  const all=[...contract.retainedSessionTimes,...remaining.sessionCreationTimesUtc].map(({ordinal:_,...value},index)=>({ordinal:index+1,...value}));
  if(all.length!==6||new Set(all.map(x=>x.observedAtUtc)).size!==6)throw new Error("GUIDE_CONTINUATION_SESSION_TIMES_INVALID");
  const manifest={schemaVersion:2,node:"GUIDE_LIVE38",verdict:"COMPOSED31_EVIDENCE_READY_FOR_REVIEW",productRevision:contract.productRevision,kbVersion:contract.kbVersion,
    provenance:{live31:{verdict:contract.live31Verdict,sequences:contract.live31Sequences,actualReceiptPath:contract.live31ActualReceiptPath},live36:{verdict:contract.live36Verdict,sequences:[10],actualReceiptPath:contract.live36ActualReceiptPath,partialImageQualification:true,replayImagesActual:false},remaining:{node:"GUIDE_LIVE38",sequences:contract.remainingSequences,actualReceiptPath:remainingReceiptPath,actualReceiptSha256:sha256(bytes)}},
    caseCount:31,sequences:[...contract.retainedSequences,...contract.remainingSequences],uniqueCaseCount:31,sessionTimesUtc:all,actualSegments:3,continuousSingleRun:false,requiresIndependentReview:true};
  await writeFile(outputPath,`${JSON.stringify(manifest,null,2)}\n`,{flag:"wx",mode:0o600});return manifest;
}
