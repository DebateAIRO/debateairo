import { createHash } from "node:crypto";
import { readFile,writeFile } from "node:fs/promises";

const ROOT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const E=`${ROOT}/evidence`;
const paths=[
  `${ROOT}/probes/GUIDE_LIVE25/run-seven-phases.mjs`,
  `${ROOT}/probes/GUIDE_LIVE25/seal-failure.mjs`,
  `${ROOT}/logs/GUIDE_LIVE25-orchestration-invocation.log`,
  `${E}/GUIDE_LIVE25-inputs.json`,
  `${E}/GUIDE_LIVE25-stop.json`,
  `${E}/GUIDE_LIVE25-failure.json`,
  `${E}/GUIDE_LIVE25-self-report.json`,
  `${E}/GUIDE_LIVE25.md`,
  `${ROOT}/agent-reports/GUIDE_LIVE25.md`
];
const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");
const item=async absolute=>{ const bytes=await readFile(absolute); return { absolute,sha256:sha256(bytes),bytes:bytes.byteLength }; };
const artifacts=[];
for (const path of paths) artifacts.push(await item(path));
const manifestPath=`${E}/GUIDE_LIVE25-manifest.json`;
const manifest={ schemaVersion:1,node:"GUIDE_LIVE25",ticket:"t_419471a7",
  revision:"456cafb9e56a737de550570b5736ec52d79ddf48",
  verdict:"STOPPED_ZERO_PHASE_ORCHESTRATION_LOADER",artifactCount:artifacts.length,artifacts };
await writeFile(manifestPath,`${JSON.stringify(manifest,null,2)}\n`,{ flag:"wx",mode:0o600 });
const receiptPath=`${E}/GUIDE_LIVE25-receipt.json`;
const receipt={ schemaVersion:1,node:"GUIDE_LIVE25",ticket:"t_419471a7",
  revision:"456cafb9e56a737de550570b5736ec52d79ddf48",
  verdict:"STOPPED_ZERO_PHASE_ORCHESTRATION_LOADER",artifacts:[...artifacts,await item(manifestPath)] };
await writeFile(receiptPath,`${JSON.stringify(receipt,null,2)}\n`,{ flag:"wx",mode:0o600 });
process.stdout.write(`${JSON.stringify({ result:"PASS",manifestPath,
  manifestSha256:(await item(manifestPath)).sha256,receiptPath,
  receiptSha256:(await item(receiptPath)).sha256,artifactCount:receipt.artifacts.length })}\n`);
