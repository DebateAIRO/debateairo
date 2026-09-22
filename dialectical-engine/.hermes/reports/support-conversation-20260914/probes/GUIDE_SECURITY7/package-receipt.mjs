import { createHash } from "node:crypto";
import { readFileSync,statSync,writeFileSync } from "node:fs";

const root="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine";
const relative=[
  "docs/missions/support-conversation-20260914/reviews/GUIDE_SECURITY7.md",
  ".hermes/reports/support-conversation-20260914/agent-reports/GUIDE_SECURITY7.md",
  ".hermes/reports/support-conversation-20260914/logs/GUIDE_SECURITY7-custody-pre.log",
  ".hermes/reports/support-conversation-20260914/logs/GUIDE_SECURITY7-dependency-custody.log",
  ".hermes/reports/support-conversation-20260914/logs/GUIDE_SECURITY7-context18.log",
  ".hermes/reports/support-conversation-20260914/logs/GUIDE_SECURITY7-policy18.log",
  ".hermes/reports/support-conversation-20260914/logs/GUIDE_SECURITY7-focused.log",
  ".hermes/reports/support-conversation-20260914/logs/GUIDE_SECURITY7-custody-post.log",
  ".hermes/reports/support-conversation-20260914/probes/GUIDE_SECURITY7/COMMANDS.txt",
  ".hermes/reports/support-conversation-20260914/probes/GUIDE_SECURITY7/matrix18.json",
  ".hermes/reports/support-conversation-20260914/probes/GUIDE_SECURITY7/matrix-policy.json",
  ".hermes/reports/support-conversation-20260914/probes/GUIDE_SECURITY7/run-context18.mts",
  ".hermes/reports/support-conversation-20260914/probes/GUIDE_SECURITY7/run-policy-safety.mts",
  ".hermes/reports/support-conversation-20260914/probes/GUIDE_SECURITY7/run-custody.mjs",
  ".hermes/reports/support-conversation-20260914/probes/GUIDE_SECURITY7/run-dependency-custody.mjs",
  ".hermes/reports/support-conversation-20260914/probes/GUIDE_SECURITY7/package-receipt.mjs"
];
const artifacts=relative.map((item)=>{
  const path=`${root}/${item}`,bytes=readFileSync(path);
  return {path,sha256:createHash("sha256").update(bytes).digest("hex"),bytes:statSync(path).size};
});
const receipt={
  schema:"GUIDE_SECURITY7_RECEIPT_V1",node:"GUIDE_SECURITY7",ticket:"t_0665908d",
  session:"/root/forgot_destination",model:"gpt-5.6-sol",
  revision:"0b9320eae5a0ad8c9fcc9648ed85ebef1b289c13",
  base:"5731eb6faac25f9712f04aea029a021f6eee9352",verdict:"PASS",
  scope:"finite GS6-1 matcher correction, preserved18, corrected-copy policy/route18, and three changed authored files",
  usage:"UNAVAILABLE",
  executions:[
    {id:"preserved-context18",rc:0,matrixSha256:"ae7ff3ce8754a15e0ad2d7b33c45a9e70ce738263c9d8577288551b7add0d0ad",expected:18,passed:18,failed:0,privateMarkersChecked:79},
    {id:"corrected-copy-policy-route18",rc:0,matrixSha256:"6b5d71d4d871be16530272fa8d6b668502df6d7e3f0ab7964391c9f574b56479",expected:18,passed:18,failed:0,oracleChangesFromSecurity6:1,productBehaviorChangedForOracle:false,declarationPass:true,recoveryPass:true,historyRejected:true,privateMarkersChecked:79},
    {id:"changed-authored-controls",rc:0,testFiles:3,testsPassed:247,testsFailed:0}
  ],
  dispositions:{GS6_1:"RESOLVED",exactCounterexamplePolicy:"your-and-public-debates",exactCounterexampleActions:["public-catalog","your-debates"],exactCounterexampleSources:["browse-public-debates","app-navigation"],credentialModelContextBuilt:false,injectionModelContextBuilt:false,privateRecordModelContextBuilt:false,newFindings:0},
  custody:{indexedInputsMatched:84,productFilesMatched:143,expectedDeletedAbsent:3,deltaExactPaths:4,retainedDefiningObjectsMatched:19,roleDefiningFilesUnchanged:9,detachedCleanExact:true,primaryCleanExact:true,temporaryDependencyLinksRemoved:5},
  limits:{modelCalled:false,browserUsed:false,liveApiCalled:false,databaseProbeRepeated:false,privateRecordsUsed:false,accountActionExecuted:false,arbitraryLanguageCompletenessProven:false,lostEarlierResponseExplained:false,forgotDestinationKnown:false,checkpointAccepted:false},
  artifacts
};
const output=`${root}/.hermes/reports/support-conversation-20260914/evidence/GUIDE_SECURITY7-receipt.json`;
writeFileSync(output,`${JSON.stringify(receipt,null,2)}\n`);
console.log(JSON.stringify({output,artifacts:artifacts.length}));
