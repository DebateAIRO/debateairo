import { createHash } from "node:crypto";
import { access,readFile,writeFile } from "node:fs/promises";

const ROOT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const E=`${ROOT}/evidence`;
const P=`${ROOT}/probes`;
const sourcePath=`${E}/GUIDE_HARNESS_FIX25-command-contract.json`;
const outputPath=`${E}/GUIDE_HARNESS_FIX26-command-contract.json`;
try { await access(outputPath); throw new Error("GUIDE_FIX26_CONTRACT_COLLISION"); }
catch (error) { if (error?.code !== "ENOENT") throw error; }
const contract=JSON.parse(await readFile(sourcePath,"utf8"));
contract.node="GUIDE_HARNESS_FIX26";
for (const phase of Object.values(contract.phases)) phase.argv[2]=outputPath;
contract.phases.rowProof.argv[1]=`${P}/GUIDE_HARNESS_FIX26/phase-row-proof.mjs`;
contract.phases.capture.argv[1]=`${P}/GUIDE_HARNESS_FIX26/phase-capture.mjs`;
const bytes=Buffer.from(`${JSON.stringify(contract,null,2)}\n`);
await writeFile(outputPath,bytes,{ flag:"wx",mode:0o600 });
process.stdout.write(`${JSON.stringify({
  result:"PASS",outputPath,sha256:createHash("sha256").update(bytes).digest("hex"),
  gateTemplatePath:contract.gateTemplatePath,phaseCount:Object.keys(contract.phases).length
})}\n`);
