import { createHash } from "node:crypto";
import { readdir,readFile,stat,writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const repositoryRoot="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine";
const reportRoot=`${repositoryRoot}/.hermes/reports/support-conversation-20260914`;
const evidence=`${reportRoot}/evidence`;
const probes=`${reportRoot}/probes`;
const agentReports=`${reportRoot}/agent-reports`;
const logs=`${reportRoot}/logs`;
const manifestPath=`${evidence}/GUIDE_HARNESS_BIND17-manifest.json`;
const receiptPath=`${evidence}/GUIDE_HARNESS_BIND17-receipt.json`;
const revision="152eed4da1cd3e66b74d8301159ba76427552409";
const sha256=bytes => createHash("sha256").update(bytes).digest("hex");

const paths=[];
for (const directory of [
  `${probes}/GUIDE_HARNESS_BIND17`,`${probes}/GUIDE_ROW_PROOF_BIND17`
]) {
  for (const name of (await readdir(directory)).sort()) {
    const path=resolve(directory,name);
    if ((await stat(path)).isFile()) paths.push(path);
  }
}
paths.push(
  `${evidence}/GUIDE_HARNESS_BIND17-freeze-resume.json`,
  `${evidence}/GUIDE_HARNESS_BIND17-inputs.json`,
  `${evidence}/GUIDE_HARNESS_BIND17-retention-manifest.json`,
  `${evidence}/GUIDE_HARNESS_BIND17-control-proof.json`,
  `${evidence}/GUIDE_HARNESS_BIND17-digest.json`,
  `${evidence}/GUIDE_HARNESS_BIND17-delta.json`,
  `${evidence}/GUIDE_HARNESS_BIND17-future-outputs.json`,
  `${evidence}/GUIDE_HARNESS_BIND17.md`,
  `${agentReports}/GUIDE_HARNESS_BIND17.md`
);
for (const name of (await readdir(logs)).filter(name => name.startsWith("GUIDE_HARNESS_BIND17-")).sort()) {
  paths.push(resolve(logs,name));
}
const artifacts=[];
for (const path of paths) {
  const bytes=await readFile(path);
  artifacts.push({ path,sha256:sha256(bytes),bytes:bytes.length });
}
const manifest={
  schemaVersion:1,node:"GUIDE_HARNESS_BIND17",ticket:"t_5596f453",session:"/root/preview",
  revision,verdict:"PASS_BOUNDED_ORACLE_AND_AFFECTED_PLAN_PREPARED",
  artifactCount:artifacts.length,artifacts
};
await writeFile(manifestPath,`${JSON.stringify(manifest,null,2)}\n`,{ flag:"wx",mode:0o600 });
const manifestBytes=await readFile(manifestPath);
const receiptArtifacts=[...artifacts,{ path:manifestPath,sha256:sha256(manifestBytes),bytes:manifestBytes.length }];
const receipt={
  schemaVersion:1,node:"GUIDE_HARNESS_BIND17",ticket:"t_5596f453",session:"/root/preview",
  revision,verdict:"PASS_BOUNDED_ORACLE_AND_AFFECTED_PLAN_PREPARED",
  skillsLoaded:[
    "superpowers:using-superpowers","superpowers:receiving-code-review",
    "superpowers:systematic-debugging","superpowers:test-driven-development",
    "superpowers:verification-before-completion","mission-heartbeat-role"
  ],
  controls:{ retained:136,added:15,total:151,passed:151,currentVerifierFrame:{ total:147,passed:147 } },
  focusedOracle:{ red:"EXPECTED_RED",green:{ total:8,passed:8 } },
  adapterNegatives:{ total:3,passed:3,importerCalls:0,successfulRows:0 },
  affectedPlan:{ retainedRows:15,freshRows:39,freshSessions:3,logicalRows:54,modelCallCeiling:42 },
  orderedEightSha256:"b4880079137a603ffde919dd1f563162d3a1f93878a369ef16dbeba5912e577d",
  retentionManifestSha256:"55bd9d27e570dd8c8aa8a8c72044b9b33c132f0c9a919e2ef8abc4723c9debbc",
  packagingAttempts:{ firstFailureLog:"UNAVAILABLE_OVERWRITTEN",secondFailureLogRetained:true,finalPass:true },
  future:{ actualNamespace:"GUIDE_LIVE_GUIDE17",actualOutputsAbsent:true,freshCapacityRequired:true,independentReviewRequired:true },
  unresolved:["FORGOT_DESTINATION_ACTIONLESS","CURRENT_CAPACITY_UNMEASURED","LIVE39_NOT_EXECUTED"],
  productChanged:false,gitLeaseHeld:false,heavyLeaseReleased:true,
  traffic:{ browser:0,runtime:0,http:0,supportRequests:0,modelRequests:0,status:0,capacity:0,database:0 },
  artifacts:receiptArtifacts
};
await writeFile(receiptPath,`${JSON.stringify(receipt,null,2)}\n`,{ flag:"wx",mode:0o600 });
const receiptBytes=await readFile(receiptPath);
process.stdout.write(`${JSON.stringify({
  result:"PASS",receipt:receiptPath,receiptSha256:sha256(receiptBytes),receiptBytes:receiptBytes.length,
  manifest:manifestPath,manifestSha256:sha256(manifestBytes),manifestBytes:manifestBytes.length,
  artifactCount:receiptArtifacts.length
})}\n`);
