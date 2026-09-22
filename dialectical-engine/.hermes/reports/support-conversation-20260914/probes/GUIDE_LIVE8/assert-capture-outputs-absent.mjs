import { access,writeFile } from "node:fs/promises";

const root="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const candidates=[
  `${root}/evidence/GUIDE_LIVE_GUIDE16-actual-receipt.json`,
  `${root}/evidence/GUIDE_ROW_PROOF-run-LIVE8.json`,
  `${root}/evidence/GUIDE_LIVE8-runtime-capacity.json`,
  `${root}/evidence/GUIDE_LIVE8-gate.json`,
  ...Array.from({ length:54 },(_,index) =>
    `${root}/evidence/GUIDE_LIVE_GUIDE16-row-${String(index+1).padStart(2,"0")}.png`),
  `${root}/probes/GUIDE_HARNESS_BIND16/browser-profile`
];
const present=[];
for (const path of candidates) {
  try { await access(path); present.push(path); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
}
if (present.length !== 0) throw new Error("GUIDE_LIVE8_CAPTURE_OUTPUT_COLLISION");
const receipt={ schemaVersion:1,observedAt:new Date().toISOString(),checked:candidates.length,present };
await writeFile(`${root}/evidence/GUIDE_LIVE8-output-absence.json`,`${JSON.stringify(receipt,null,2)}\n`,{ mode:0o600,flag:"wx" });
process.stdout.write(`${JSON.stringify(receipt,null,2)}\n`);
