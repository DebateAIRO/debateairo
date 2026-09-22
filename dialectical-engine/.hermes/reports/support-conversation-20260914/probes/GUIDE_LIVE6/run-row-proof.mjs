import { spawnSync } from "node:child_process";

const productRoot="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const argv=[
  "--import","tsx",
  "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/probes/GUIDE_ROW_PROOF_FIX9/replay-row-proofs.mjs",
  "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence/GUIDE_LIVE6-gate.json",
  "0b9320eae5a0ad8c9fcc9648ed85ebef1b289c13",
  "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence/GUIDE_ROW_PROOF-run-LIVE6.json"
];
const result=spawnSync(process.execPath,argv,{ cwd:productRoot,stdio:"inherit" });
if (result.error !== undefined) throw result.error;
process.exitCode=result.status ?? 1;
