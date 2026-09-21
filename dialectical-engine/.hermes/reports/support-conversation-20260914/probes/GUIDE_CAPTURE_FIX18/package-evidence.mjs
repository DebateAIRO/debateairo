import { createHash } from "node:crypto";
import { readdir,readFile,stat,writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const evidence=`${root}/evidence`;
const probes=`${root}/probes/GUIDE_CAPTURE_FIX18`;
const agent=`${root}/agent-reports/GUIDE_CAPTURE_FIX18.md`;
const manifestPath=`${evidence}/GUIDE_CAPTURE_FIX18-manifest.json`;
const receiptPath=`${evidence}/GUIDE_CAPTURE_FIX18-receipt.json`;
const sha256=bytes => createHash("sha256").update(bytes).digest("hex");
const paths=[];
for (const name of (await readdir(probes)).sort()) {
  const path=resolve(probes,name);
  if ((await stat(path)).isFile()) paths.push(path);
}
paths.push(`${evidence}/GUIDE_CAPTURE_FIX18-next-binding-inputs.json`,`${evidence}/GUIDE_CAPTURE_FIX18-syntax.json`,`${evidence}/GUIDE_CAPTURE_FIX18.md`,agent);
const artifacts=[];
for (const path of paths) {
  const bytes=await readFile(path);
  artifacts.push({ path,sha256:sha256(bytes),bytes:bytes.length });
}
const manifest={ schemaVersion:1,node:"GUIDE_CAPTURE_FIX18",ticket:"t_47e9f18b",session:"/root/preview",
  baseRevision:"152eed4da1cd3e66b74d8301159ba76427552409",revision:null,
  verdict:"PREPARED_NOT_EXECUTED_AWAITING_FINAL_PRODUCT_BINDING",artifactCount:artifacts.length,artifacts };
await writeFile(manifestPath,`${JSON.stringify(manifest,null,2)}\n`,{ flag:"wx",mode:0o600 });
const manifestBytes=await readFile(manifestPath);
const receiptArtifacts=[...artifacts,{ path:manifestPath,sha256:sha256(manifestBytes),bytes:manifestBytes.length }];
const receipt={
  schemaVersion:1,node:"GUIDE_CAPTURE_FIX18",ticket:"t_47e9f18b",session:"/root/preview",
  nativeSession:"01a09f02-346a-7fb0-aa70-0424f1fdd21e",
  baseRevision:"152eed4da1cd3e66b74d8301159ba76427552409",revision:null,
  verdict:"PREPARED_NOT_EXECUTED_AWAITING_FINAL_PRODUCT_BINDING",
  prepared:{ screenshotEvidenceCorrection:true,sevenPhaseCommandContract:true,absoluteCapacityInvocation:true,
    finalBindingTemplate:true,staleViewportFixture:true,targetVisibleFixture:true,controlsPrepared:4 },
  checks:{ mjsSyntaxPassed:8,jsonParsePassed:4,behavioralControlsExecuted:0 },
  lifecycle:{ finalKbReloadRequired:true,supportedCommand:"pnpm dev:auth:up",supportConfigurationPublicationRequired:false },
  product:{ changed:false,currentCleanlinessAttested:false,finalRevisionBound:false,concurrentAuthorOwnsGit:true },
  traffic:{ browser:0,runtime:0,http:0,status:0,database:0,capacity:0,supportRequests:0,modelRequests:0 },
  heavyLeaseHeld:false,gitLeaseHeld:false,
  limitations:["FINAL_PRODUCT_BINDING_PENDING","FINAL_KB_DIGEST_PENDING","AFFECTED_PLAN_PENDING_REVIEW","BEHAVIORAL_CONTROLS_NOT_EXECUTED","NO_READINESS_OR_ACCEPTANCE_CLAIM"],
  artifacts:receiptArtifacts
};
await writeFile(receiptPath,`${JSON.stringify(receipt,null,2)}\n`,{ flag:"wx",mode:0o600 });
const receiptBytes=await readFile(receiptPath);
process.stdout.write(`${JSON.stringify({ result:"PREPARED",receipt:receiptPath,receiptSha256:sha256(receiptBytes),receiptBytes:receiptBytes.length,manifest:manifestPath,manifestSha256:sha256(manifestBytes),manifestBytes:manifestBytes.length,artifactCount:receiptArtifacts.length })}\n`);
