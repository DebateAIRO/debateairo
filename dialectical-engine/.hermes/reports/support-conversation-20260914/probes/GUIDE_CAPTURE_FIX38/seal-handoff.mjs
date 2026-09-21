import { createHash } from "node:crypto";
import { readdir,readFile,stat,writeFile } from "node:fs/promises";
import { join } from "node:path";

const root="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine";
const R=`${root}/.hermes/reports/support-conversation-20260914`,E=`${R}/evidence`,P=`${R}/probes/GUIDE_CAPTURE_FIX38`,L=`${R}/logs`,A=`${R}/agent-reports`;
const manifestPath=`${E}/GUIDE_CAPTURE_FIX38-manifest.json`,receiptPath=`${E}/GUIDE_CAPTURE_FIX38-receipt.json`;
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const paths=[
  `${root}/.hermes/planning/support-conversation-20260914/packets/GUIDE_CAPTURE_FIX38.md`,
  `${E}/GUIDE_CAPTURE_FIX38-inputs.json`,`${E}/GUIDE_CAPTURE_FIX38-freeze-resume.json`,
  `${E}/GUIDE_FOOTER_DIAG38-consumption.json`,`${E}/GUIDE_FOOTER_DIAG38-diagnosis.json`,
  `${E}/GUIDE_FOOTER_DIAG38-reproduction-contract.json`,`${E}/GUIDE_LIVE30-receipt.json`,
  `${E}/GUIDE_CAPTURE_FIX38.md`,`${A}/GUIDE_CAPTURE_FIX38.md`
];
for(const name of await readdir(P))paths.push(join(P,name));
for(const name of await readdir(E))if(name.startsWith("GUIDE_CAPTURE_FIX38-")&&!name.endsWith("-manifest.json")&&!name.endsWith("-receipt.json"))paths.push(join(E,name));
for(const name of await readdir(L))if(name.startsWith("GUIDE_CAPTURE_FIX38-"))paths.push(join(L,name));
const unique=[...new Set(paths)].sort();
const artifacts=[];
for(const absolute of unique){const metadata=await stat(absolute);if(!metadata.isFile())continue;const bytes=await readFile(absolute);artifacts.push({absolute,sha256:sha(bytes),bytes:bytes.byteLength});}
const base={schemaVersion:1,node:"GUIDE_CAPTURE_FIX38",ticket:"t_368d9d59",revision:"0d34f82f4a2188d0ce1db04655b693798ffd2169",verdict:"PASS_FOOTER_CAPTURE_BOUND_REVIEW_REQUIRED",artifacts};
await writeFile(manifestPath,`${JSON.stringify(base,null,2)}\n`,{flag:"wx",mode:0o600});
const manifestBytes=await readFile(manifestPath);
const receipt={...base,artifacts:[...artifacts,{absolute:manifestPath,sha256:sha(manifestBytes),bytes:manifestBytes.byteLength}],qualifications:{offlineFixturesOnly:true,operationalTraffic:false,runtime9PostFailureCustodyUnverified:true,forgotDestinationUnresolved:true,checkpointAcceptance:false}};
await writeFile(receiptPath,`${JSON.stringify(receipt,null,2)}\n`,{flag:"wx",mode:0o600});
const receiptBytes=await readFile(receiptPath);
console.log(JSON.stringify({verdict:receipt.verdict,artifacts:receipt.artifacts.length,manifestSha256:sha(manifestBytes),receiptSha256:sha(receiptBytes),receiptBytes:receiptBytes.byteLength}));
