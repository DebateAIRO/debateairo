import { createHash } from "node:crypto";
import { readFileSync,statSync,writeFileSync } from "node:fs";

const root="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine";
const relative=[
  "docs/missions/support-conversation-20260914/reviews/GUIDE_SECURITY6.md",
  ".hermes/reports/support-conversation-20260914/agent-reports/GUIDE_SECURITY6.md",
  ".hermes/reports/support-conversation-20260914/logs/GUIDE_SECURITY6-custody-pre.log",
  ".hermes/reports/support-conversation-20260914/logs/GUIDE_SECURITY6-dependency-custody.log",
  ".hermes/reports/support-conversation-20260914/logs/GUIDE_SECURITY6-context18.log",
  ".hermes/reports/support-conversation-20260914/logs/GUIDE_SECURITY6-policy18.log",
  ".hermes/reports/support-conversation-20260914/logs/GUIDE_SECURITY6-focused.log",
  ".hermes/reports/support-conversation-20260914/logs/GUIDE_SECURITY6-custody-post.log",
  ".hermes/reports/support-conversation-20260914/probes/GUIDE_SECURITY6/COMMANDS.txt",
  ".hermes/reports/support-conversation-20260914/probes/GUIDE_SECURITY6/matrix18.json",
  ".hermes/reports/support-conversation-20260914/probes/GUIDE_SECURITY6/matrix-policy.json",
  ".hermes/reports/support-conversation-20260914/probes/GUIDE_SECURITY6/run-context18.mts",
  ".hermes/reports/support-conversation-20260914/probes/GUIDE_SECURITY6/run-policy-safety.mts",
  ".hermes/reports/support-conversation-20260914/probes/GUIDE_SECURITY6/run-custody.mjs",
  ".hermes/reports/support-conversation-20260914/probes/GUIDE_SECURITY6/run-dependency-custody.mjs",
  ".hermes/reports/support-conversation-20260914/probes/GUIDE_SECURITY6/package-receipt.mjs"
];
const artifacts=relative.map((item)=>{
  const path=`${root}/${item}`;
  return {path,sha256:createHash("sha256").update(readFileSync(path)).digest("hex"),bytes:statSync(path).size};
});
const receipt={
  schema:"GUIDE_SECURITY6_RECEIPT_V1",node:"GUIDE_SECURITY6",ticket:"t_f93905d0",
  session:"/root/forgot_destination",model:"gpt-5.6-sol",
  revision:"5731eb6faac25f9712f04aea029a021f6eee9352",
  base:"f3be0af81f1691db6c23494f9e286bb6b10f13bf",verdict:"REWORK",
  scope:"finite declared source-policy/context/answer safety review; preserved18; policy/route18; four changed authored files",
  usage:"UNAVAILABLE",
  executions:[
    {id:"preserved-context18",rc:0,matrixSha256:"ae7ff3ce8754a15e0ad2d7b33c45a9e70ce738263c9d8577288551b7add0d0ad",expected:18,passed:18,failed:0,privateMarkersChecked:79},
    {id:"policy-route18",rc:1,matrixSha256:"789f058af86d3a3302c40e6c3c35dd86f559431c6d7f487fb6afcf6c3be12f9d",expected:18,expectationMatches:16,failed:2,contractFindings:1,safeOracleMismatches:1,declarationPass:true,recoveryPass:true,historyRejected:true,privateMarkersChecked:79},
    {id:"changed-authored-controls",rc:0,testFiles:4,testsPassed:201,testsFailed:0}
  ],
  finding:{id:"GS6-1",language:"ro",modelReached:true,sourcePolicy:null,actions:["public-catalog"],sources:["browse-public-debates","app-navigation","getting-started-debate"],privateDataAccessObserved:false,capabilityExecutionObserved:false},
  custody:{indexedInputsMatched:87,productFilesMatched:143,expectedDeletedAbsent:3,deltaExactPaths:9,retainedDefiningObjectsMatched:15,roleDefiningFilesUnchanged:9,detachedCleanExact:true,primaryCleanExact:true,temporaryDependencyLinksRemoved:5},
  limits:{modelCalled:false,browserUsed:false,liveApiCalled:false,databaseProbeRepeated:false,privateRecordsUsed:false,accountActionExecuted:false,arbitraryLanguageCompletenessProven:false,lostEarlierResponseExplained:false,forgotDestinationKnown:false,checkpointAccepted:false},
  artifacts
};
const output=`${root}/.hermes/reports/support-conversation-20260914/evidence/GUIDE_SECURITY6-receipt.json`;
writeFileSync(output,`${JSON.stringify(receipt,null,2)}\n`);
console.log(JSON.stringify({output,artifacts:artifacts.length}));
