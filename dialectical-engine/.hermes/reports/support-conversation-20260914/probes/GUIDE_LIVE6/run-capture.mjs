import { spawnSync } from "node:child_process";

const productRoot="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const argv=[
  "--import","tsx",
  "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/probes/GUIDE_HARNESS_FIX9/capture-public-guide.mjs",
  "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence/GUIDE_LIVE6-gate.json"
];
const result=spawnSync(process.execPath,argv,{ cwd:productRoot,stdio:"inherit" });
if (result.error !== undefined) throw result.error;
process.exitCode=result.status ?? 1;
