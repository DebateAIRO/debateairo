import { spawnSync } from "node:child_process";

const productRoot="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const argv=[
  "--import","tsx",
  "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/probes/GUIDE_ROW_PROOF_BIND12/replay-row-proofs.mjs",
  "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence/GUIDE_LIVE7-gate.json",
  "152eed4da1cd3e66b74d8301159ba76427552409",
  "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence/GUIDE_ROW_PROOF-run-LIVE7.json"
];
const result=spawnSync(process.execPath,argv,{ cwd:productRoot,stdio:"inherit" });
if (result.error !== undefined) throw result.error;
process.exitCode=result.status ?? 1;
