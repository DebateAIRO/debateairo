import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

const productRoot="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const receiptPath="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence/GUIDE_LIVE_GUIDE16-actual-receipt.json";
const argv=["--import","tsx",
  "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/probes/GUIDE_HARNESS_BIND16/capture-public-guide.mjs",
  "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence/GUIDE_LIVE8-gate.json"];
const child=spawn(process.execPath,argv,{ cwd:productRoot,stdio:["ignore","inherit","inherit"] });
const interval=setInterval(async () => {
  try {
    const receipt=JSON.parse(await readFile(receiptPath,"utf8"));
    process.stdout.write(`${JSON.stringify({
      progress:true,observedAt:new Date().toISOString(),attemptedRowCount:receipt.attemptedRowCount,
      completedRowCount:receipt.completedRowCount,failure:receipt.failure ?? null
    })}\n`);
  } catch (error) {
    if (error?.code !== "ENOENT") process.stdout.write(`${JSON.stringify({ progress:true,observedAt:new Date().toISOString(),state:"RECEIPT_UNREADABLE" })}\n`);
  }
},60_000);
const status=await new Promise((resolve,reject) => {
  child.once("error",reject);
  child.once("exit",code => resolve(code ?? 1));
});
clearInterval(interval);
process.exitCode=status;
