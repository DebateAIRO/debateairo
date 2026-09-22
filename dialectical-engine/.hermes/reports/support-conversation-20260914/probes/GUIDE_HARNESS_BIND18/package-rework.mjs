import { createHash } from "node:crypto";
import { readFile,writeFile } from "node:fs/promises";

const root="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const paths=[
  `${root}/probes/GUIDE_HARNESS_BIND18/matrix.mjs`,
  `${root}/probes/GUIDE_HARNESS_BIND18/pre-request-verifier.ts`,
  `${root}/probes/GUIDE_ROW_PROOF_BIND18/replay-offline58.mjs`,
  `${root}/probes/GUIDE_HARNESS_BIND18/package-rework.mjs`,
  `${root}/logs/GUIDE_HARNESS_BIND18-offline58-attempt1.log`,
  `${root}/logs/GUIDE_HARNESS_BIND18-offline58-attempt2.log`,
  `${root}/evidence/GUIDE_HARNESS_BIND18-failure.json`,
  `${root}/evidence/GUIDE_HARNESS_BIND18.md`,
  `${root}/agent-reports/GUIDE_HARNESS_BIND18.md`,
  `${root}/evidence/GUIDE_QUALITY_REVIEW2-receipt.json`,
  `${root}/evidence/GUIDE_QUALITY_REVIEW2-consumption.json`
];
const artifact=async path => { const bytes=await readFile(path); return {
  path,sha256:createHash("sha256").update(bytes).digest("hex"),bytes:bytes.length
}; };
const artifacts=[];
for (const path of paths) artifacts.push(await artifact(path));
const manifest={
  schemaVersion:1,node:"GUIDE_HARNESS_BIND18",ticket:"t_62cbe3cc",
  revision:"5d6e028ae5defc24e0690219d6128949e73b750d",
  verdict:"REWORK_PRODUCT_SIGNIN_CLASSIFIER",preparedOnly:true,
  full58Pass:false,controlPass:false,artifacts
};
const manifestPath=`${root}/evidence/GUIDE_HARNESS_BIND18-manifest.json`;
await writeFile(manifestPath,`${JSON.stringify(manifest,null,2)}\n`,{ flag:"wx",mode:0o600 });
const receipt={
  schemaVersion:1,node:"GUIDE_HARNESS_BIND18",ticket:"t_62cbe3cc",
  session:"/root/preview",nativeSession:"01a09f02-346a-7fb0-aa70-0424f1fdd21e",
  revision:"5d6e028ae5defc24e0690219d6128949e73b750d",
  verdict:"REWORK_PRODUCT_SIGNIN_CLASSIFIER",
  counts:{ canonicalRows:54,ownerRows:4,actualPlanRows:31,offlineAttempts:2,full58Passed:0,controlsPassed:0 },
  failedRow:57,failedCode:"GUIDE_HARNESS_PUBLIC_NAVIGATION_REFUSED",
  heavyLeaseReleased:true,
  traffic:{ runtime:0,browser:0,http:0,status:0,capacity:0,database:0,support:0,model:0 },
  artifacts:[...artifacts,await artifact(manifestPath)]
};
const receiptPath=`${root}/evidence/GUIDE_HARNESS_BIND18-receipt.json`;
await writeFile(receiptPath,`${JSON.stringify(receipt,null,2)}\n`,{ flag:"wx",mode:0o600 });
process.stdout.write(`${JSON.stringify({ receipt:await artifact(receiptPath),manifest:await artifact(manifestPath),artifacts:receipt.artifacts.length })}\n`);
