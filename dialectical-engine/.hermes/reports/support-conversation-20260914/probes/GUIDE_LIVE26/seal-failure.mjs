import { createHash } from "node:crypto";
import { readFile,writeFile } from "node:fs/promises";

const ROOT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const E=`${ROOT}/evidence`;
const paths=[
  `${ROOT}/probes/GUIDE_LIVE26/run-seven-phases.mjs`,
  `${ROOT}/probes/GUIDE_LIVE26/seal-failure.mjs`,
  `${ROOT}/logs/GUIDE_LIVE26-loader-prerequisite.log`,
  `${ROOT}/logs/GUIDE_LIVE25-preflight.log`,
  `${E}/GUIDE_LIVE26-inputs.json`,
  `${E}/GUIDE_LIVE26-prerequisites.json`,
  `${E}/GUIDE_LIVE26-stop.json`,
  `${E}/GUIDE_LIVE26-failure.json`,
  `${E}/GUIDE_LIVE26-self-report.json`,
  `${E}/GUIDE_LIVE26.md`,
  `${ROOT}/agent-reports/GUIDE_LIVE26.md`
];
const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");
const item=async absolute=>{ const bytes=await readFile(absolute); return { absolute,sha256:sha256(bytes),bytes:bytes.byteLength }; };
const artifacts=[];
for (const path of paths) artifacts.push(await item(path));
const manifestPath=`${E}/GUIDE_LIVE26-manifest.json`;
const manifest={ schemaVersion:1,node:"GUIDE_LIVE26",ticket:"t_0fbb505d",
  revision:"456cafb9e56a737de550570b5736ec52d79ddf48",
  verdict:"STOPPED_PHASE1_OPERATOR_LOG_COLLISION",artifactCount:artifacts.length,artifacts };
await writeFile(manifestPath,`${JSON.stringify(manifest,null,2)}\n`,{ flag:"wx",mode:0o600 });
const receiptPath=`${E}/GUIDE_LIVE26-receipt.json`;
const receipt={ schemaVersion:1,node:"GUIDE_LIVE26",ticket:"t_0fbb505d",
  revision:"456cafb9e56a737de550570b5736ec52d79ddf48",
  verdict:"STOPPED_PHASE1_OPERATOR_LOG_COLLISION",artifacts:[...artifacts,await item(manifestPath)] };
await writeFile(receiptPath,`${JSON.stringify(receipt,null,2)}\n`,{ flag:"wx",mode:0o600 });
process.stdout.write(`${JSON.stringify({ result:"PASS",manifestPath,
  manifestSha256:(await item(manifestPath)).sha256,receiptPath,
  receiptSha256:(await item(receiptPath)).sha256,artifactCount:receipt.artifacts.length })}\n`);
