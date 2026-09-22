import { createHash } from "node:crypto";
import { readFile,writeFile } from "node:fs/promises";

const root="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const evidence=`${root}/evidence`;
const receiptPath=`${evidence}/GUIDE_CAPTURE_FIX18-long-reply-supplement-receipt.json`;
const paths=[
  `${evidence}/GUIDE_CAPTURE_FIX18-receipt.json`,
  `${evidence}/GUIDE_CAPTURE_FIX18-manifest.json`,
  `${root}/probes/GUIDE_CAPTURE_FIX18/long-reply-browser-fixture.mjs`,
  `${evidence}/GUIDE_CAPTURE_FIX18-long-reply-browser-requirement.json`,
  `${evidence}/GUIDE_CAPTURE_FIX18-long-reply-supplement.md`,
  `${root}/probes/GUIDE_CAPTURE_FIX18/package-long-reply-supplement.mjs`
];
const sha256=bytes => createHash("sha256").update(bytes).digest("hex");
const artifacts=[];
for (const path of paths) {
  const bytes=await readFile(path);
  artifacts.push({ path,sha256:sha256(bytes),bytes:bytes.length });
}
const receipt={ schemaVersion:1,node:"GUIDE_CAPTURE_FIX18_LONG_REPLY_SUPPLEMENT",ticket:"t_47e9f18b",session:"/root/preview",
  baseRevision:"152eed4da1cd3e66b74d8301159ba76427552409",revision:null,
  verdict:"PREPARED_NOT_EXECUTED_LONG_REPLY_BROWSER_GATE_REQUIRED",
  originalReceipt:{ path:artifacts[0].path,sha256:artifacts[0].sha256,bytes:artifacts[0].bytes },
  laterControl:{ heavyLeaseRequired:true,executed:false,supportApiAbortGuard:true,expectedSupportAttempts:0,
    mustPassBeforePaidOrLiveCapture:true },
  traffic:{ browser:0,runtime:0,http:0,status:0,database:0,capacity:0,supportRequests:0,modelRequests:0 },
  artifacts };
await writeFile(receiptPath,`${JSON.stringify(receipt,null,2)}\n`,{ flag:"wx",mode:0o600 });
const bytes=await readFile(receiptPath);
process.stdout.write(`${JSON.stringify({ result:"PREPARED_SUPPLEMENT",receipt:receiptPath,sha256:sha256(bytes),bytes:bytes.length,artifacts:artifacts.length })}\n`);
