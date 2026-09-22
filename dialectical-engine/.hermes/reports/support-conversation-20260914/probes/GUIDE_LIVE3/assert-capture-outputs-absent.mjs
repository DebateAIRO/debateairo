import { access,writeFile } from "node:fs/promises";

const reportRoot="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const candidates=[
  `${reportRoot}/evidence/GUIDE_LIVE_GUIDE2-actual-receipt.json`,
  ...Array.from({ length:54 },(_,index) =>
    `${reportRoot}/evidence/GUIDE_LIVE_GUIDE2-row-${String(index+1).padStart(2,"0")}.png`),
  `${reportRoot}/probes/GUIDE_HARNESS_FIX4/browser-profile`
];
const present=[];
for (const path of candidates) {
  try { await access(path); present.push(path); } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}
if (present.length !== 0) throw new Error("GUIDE_LIVE3_CAPTURE_OUTPUT_COLLISION");
const receipt={ schemaVersion:1,observedAt:new Date().toISOString(),checked:candidates.length,present };
await writeFile(`${reportRoot}/evidence/GUIDE_LIVE3-output-absence.json`,`${JSON.stringify(receipt,null,2)}\n`,{ mode:0o600,flag:"wx" });
process.stdout.write(`${JSON.stringify(receipt,null,2)}\n`);
