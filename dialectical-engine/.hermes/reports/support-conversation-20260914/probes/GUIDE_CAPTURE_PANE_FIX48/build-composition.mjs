import { createHash } from "node:crypto";
import { readdir,readFile,writeFile } from "node:fs/promises";
import { GUIDE_ACTUAL_SEQUENCES,GUIDE_RETAINED_SEQUENCES } from "./matrix.mjs";
const ROOT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914",E=`${ROOT}/evidence`;
const OUT=`${E}/GUIDE_CAPTURE_PANE_FIX48-composition-contract.json`,DECISION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/support-conversation-20260914/decisions/GUIDE-CP1-ROW10-CONTINUATION-20260921.md";
const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");
const ref=async path=>{const bytes=await readFile(path);return{path,sha256:sha256(bytes),bytes:bytes.byteLength};};
const old=JSON.parse(await readFile(`${E}/GUIDE_CAPTURE_ACTIVATION_FIX47-composition-contract.json`,"utf8"));
const actualRow10=await ref(`${E}/GUIDE_LIVE_GUIDE25-row-10-original-pane-start.png`);
const replayNames=(await readdir(E)).filter(name=>/^GUIDE_CAPTURE_PANE_FIX48-(?:row10|long)-corrected-selector-compiled-synthetic-replay-(?:start|end|complete)\.png$/u.test(name)).sort();
if(replayNames.length!==6)throw new Error("GUIDE_CAPTURE_PANE_FIX48_REPLAY_ARTIFACT_COUNT_INVALID");
const replayArtifacts=[];for(const name of replayNames)replayArtifacts.push({...await ref(`${E}/${name}`),proofKind:"SYNTHETIC_RESPONSE_REPLAY_THROUGH_REAL_COMPILED_UI"});
const additionalPaths=[`${E}/GUIDE_LIVE36-receipt.json`,`${E}/GUIDE_LIVE_GUIDE25-actual-receipt.json`,`${E}/GUIDE_LIVE_GUIDE25-row-10-screenshot-failure.json`,`${E}/GUIDE_CAPTURE_PANE_FIX48-browser-control-final.json`,DECISION];
const additional=[];for(const path of additionalPaths)additional.push(await ref(path));
const contract={schemaVersion:2,node:"GUIDE_CAPTURE_PANE_FIX48",productRevision:"0d34f82f4a2188d0ce1db04655b693798ffd2169",kbVersion:"7ef4244d30507e162cebf544eeb6b9578f17ed91711f2d164f2a4d75dd72c7af",
  live31Verdict:"FAILED_CAPTURE_ROW47_NO_RETRY",live36Verdict:"FAILED_CAPTURE_ROW10_NO_RETRY",row10Disposition:"ACTUAL_RESPONSE_RETAINED_PARTIAL_START_IMAGE_REPLAY_IMAGES_NON_ACTUAL",
  replayProofKind:"SYNTHETIC_RESPONSE_REPLAY_THROUGH_REAL_COMPILED_UI",live31Sequences:[1,2,15,19,23,27,31,35,39,47],retainedSequences:[...GUIDE_RETAINED_SEQUENCES],remainingSequences:[...GUIDE_ACTUAL_SEQUENCES],
  live31ActualReceiptPath:`${E}/GUIDE_LIVE_GUIDE23-actual-receipt.json`,live36ActualReceiptPath:`${E}/GUIDE_LIVE_GUIDE25-actual-receipt.json`,
  retainedSessionTimes:[{ordinal:1,observedAtUtc:"2026-09-21T09:52:36.856Z"},{ordinal:2,observedAtUtc:"2026-09-21T09:53:08.483Z"},{ordinal:3,observedAtUtc:"2026-09-21T12:41:51.789Z"}],
  live36ActualImages:[actualRow10],replayArtifacts,retainedArtifacts:[...old.retainedArtifacts,actualRow10,...replayArtifacts,...additional],
  futureRemainingReceiptPath:`${E}/GUIDE_LIVE_GUIDE26-actual-receipt.json`,futureComposedManifestPath:`${E}/GUIDE_LIVE37-composed31-manifest.json`,adoptedDecisionPath:DECISION,adoptedDecisionSha256:(await ref(DECISION)).sha256,continuousSingleRun:false};
const bytes=Buffer.from(`${JSON.stringify(contract,null,2)}\n`);await writeFile(OUT,bytes,{flag:"wx",mode:0o600});process.stdout.write(`${JSON.stringify({sha256:sha256(bytes),retainedArtifacts:contract.retainedArtifacts.length,replayArtifacts:6})}\n`);
