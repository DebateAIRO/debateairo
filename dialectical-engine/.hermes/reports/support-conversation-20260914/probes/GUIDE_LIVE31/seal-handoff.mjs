import { createHash } from "node:crypto";
import { readdir,readFile,stat,writeFile } from "node:fs/promises";
import { join } from "node:path";

const root="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine";
const R=`${root}/.hermes/reports/support-conversation-20260914`,E=`${R}/evidence`,L=`${R}/logs`,A=`${R}/agent-reports`;
const manifestPath=`${E}/GUIDE_LIVE31-manifest.json`,receiptPath=`${E}/GUIDE_LIVE31-receipt.json`;
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const paths=[
  `${root}/.hermes/planning/support-conversation-20260914/packets/GUIDE_LIVE31.md`,
  `${E}/GUIDE_LIVE31-inputs.json`,`${E}/GUIDE_LIVE31-freeze-resume.json`,
  `${E}/GUIDE_CAPTURE_FIX38-receipt.json`,`${E}/GUIDE_CAPTURE_REVIEW38-consumption.json`,
  `${E}/GUIDE_CAPTURE_FIX38-command-contract.json`,`${E}/GUIDE_CAPTURE_FIX38-operator-contract.json`,
  `${E}/GUIDE_LIVE31.md`,`${A}/GUIDE_LIVE31.md`,
  `${R}/probes/GUIDE_LIVE31/seal-handoff.mjs`
];
for(const name of await readdir(E))if((name.startsWith("GUIDE_LIVE31-")||name.startsWith("GUIDE_LIVE_GUIDE23-")||name==="GUIDE_ROW_PROOF-run-LIVE31.json"||name==="GUIDE_UI_TRANSITION_PROBE-run-LIVE31.json")&&!name.endsWith("-manifest.json")&&!name.endsWith("-receipt.json"))paths.push(join(E,name));
for(const name of await readdir(L))if(name.startsWith("GUIDE_LIVE31-")||name.startsWith("GUIDE_UI_TRANSITION_PROBE-LIVE31")||name.startsWith("GUIDE_CAPTURE_FIX38-operator-"))paths.push(join(L,name));
const unique=[...new Set(paths)].sort();const artifacts=[];
for(const absolute of unique){const metadata=await stat(absolute);if(!metadata.isFile())continue;const bytes=await readFile(absolute);artifacts.push({absolute,sha256:sha(bytes),bytes:bytes.byteLength});}
const base={schemaVersion:1,node:"GUIDE_LIVE31",ticket:"t_4f9303e3",revision:"0d34f82f4a2188d0ce1db04655b693798ffd2169",verdict:"FAILED_CAPTURE_ROW47_NO_RETRY",artifacts};
await writeFile(manifestPath,`${JSON.stringify(base,null,2)}\n`,{flag:"wx",mode:0o600});
const mb=await readFile(manifestPath);const receipt={...base,artifacts:[...artifacts,{absolute:manifestPath,sha256:sha(mb),bytes:mb.byteLength}],disposition:{phaseStatuses:{preflight:0,readiness:0,capacity:0,gate:0,rowProof:0,capture:1,idle:"NOT_RUN"},completedApiReplies:10,fullyCapturedRows:9,createdSessions:2,providerCallsExact:"UNAVAILABLE",retry:false,runtimePostfailureCustody:"UNVERIFIED",checkpointAcceptance:false}};
await writeFile(receiptPath,`${JSON.stringify(receipt,null,2)}\n`,{flag:"wx",mode:0o600});const rb=await readFile(receiptPath);
console.log(JSON.stringify({verdict:receipt.verdict,artifacts:receipt.artifacts.length,manifestSha256:sha(mb),receiptSha256:sha(rb),receiptBytes:rb.byteLength}));
