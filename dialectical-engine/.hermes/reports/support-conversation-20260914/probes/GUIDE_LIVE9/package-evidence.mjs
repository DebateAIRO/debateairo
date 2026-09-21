import { createHash } from "node:crypto";
import { readdir,readFile,stat,writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const evidence=`${root}/evidence`;
const probes=`${root}/probes/GUIDE_LIVE9`;
const logs=`${root}/logs`;
const agent=`${root}/agent-reports/GUIDE_LIVE9.md`;
const manifestPath=`${evidence}/GUIDE_LIVE9-manifest.json`;
const receiptPath=`${evidence}/GUIDE_LIVE9-receipt.json`;
const sha256=bytes => createHash("sha256").update(bytes).digest("hex");
const paths=[];
for (const name of (await readdir(probes)).sort()) {
  const path=resolve(probes,name);
  if ((await stat(path)).isFile()) paths.push(path);
}
paths.push(
  `${evidence}/GUIDE_LIVE9-pretraffic.json`,`${evidence}/GUIDE_LIVE9-readiness.json`,
  `${evidence}/GUIDE_LIVE9-failure.json`,`${evidence}/GUIDE_LIVE9-idle-custody.json`,
  `${evidence}/GUIDE_LIVE9.md`,agent,`${logs}/GUIDE_LIVE9-capacity-invocation.log`
);
const artifacts=[];
for (const path of paths) {
  const bytes=await readFile(path);
  artifacts.push({ path,sha256:sha256(bytes),bytes:bytes.length });
}
const manifest={ schemaVersion:1,node:"GUIDE_LIVE9",ticket:"t_979538fe",session:"/root/preview",
  revision:"152eed4da1cd3e66b74d8301159ba76427552409",verdict:"STOPPED_ZERO_TRAFFIC_CAPACITY_WRAPPER_NOT_FOUND",
  artifactCount:artifacts.length,artifacts };
await writeFile(manifestPath,`${JSON.stringify(manifest,null,2)}\n`,{ flag:"wx",mode:0o600 });
const manifestBytes=await readFile(manifestPath);
const receiptArtifacts=[...artifacts,{ path:manifestPath,sha256:sha256(manifestBytes),bytes:manifestBytes.length }];
const receipt={
  schemaVersion:1,node:"GUIDE_LIVE9",ticket:"t_979538fe",session:"/root/preview",
  revision:"152eed4da1cd3e66b74d8301159ba76427552409",verdict:"STOPPED_ZERO_TRAFFIC_CAPACITY_WRAPPER_NOT_FOUND",
  retainedRows:15,freshRowsPlanned:39,freshRowsAttempted:0,freshRowsCompleted:0,sessionsCreated:0,
  pretraffic:{ inputs:188,outputsAbsent:51,ownedPid:77769,previewListeners:12,unrelatedListeners:9,ordinaryTlsStatus:200 },
  failure:{ stage:"CAPACITY_WRAPPER_INVOCATION",numericStatus:1,errorCode:"ERR_MODULE_NOT_FOUND",capacityReaderLoaded:false,retryPerformed:false },
  traffic:{ supportedStatusReads:0,databaseReads:0,supportRequests:0,modelRequests:0,browser:0 },
  capacityReceiptCreated:false,gateCreated:false,rowProofCreated:false,captureReceiptCreated:false,
  runtimeLeftHealthy:true,productChanged:false,gitLeaseHeld:false,heavyLeaseReleased:true,
  limitations:["NO_FRESH_COVERAGE","NO_OWNER_MANUAL_CAPACITY_CLAIM","FORGOT_UNRESOLVED_ACTIONLESS","NO_READINESS_OR_ACCEPTANCE_CLAIM"],
  artifacts:receiptArtifacts
};
await writeFile(receiptPath,`${JSON.stringify(receipt,null,2)}\n`,{ flag:"wx",mode:0o600 });
const receiptBytes=await readFile(receiptPath);
process.stdout.write(`${JSON.stringify({ result:"SEALED_FAILURE",receipt:receiptPath,receiptSha256:sha256(receiptBytes),receiptBytes:receiptBytes.length,manifest:manifestPath,manifestSha256:sha256(manifestBytes),manifestBytes:manifestBytes.length,artifactCount:receiptArtifacts.length })}\n`);
