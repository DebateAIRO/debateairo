import { createHash } from "node:crypto";
import { access,readFile,writeFile } from "node:fs/promises";

const ROOT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const E=`${ROOT}/evidence`;
const L=`${ROOT}/logs`;
const PRODUCT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const REVISION="456cafb9e56a737de550570b5736ec52d79ddf48";
const NODE="/Users/vladmihaimiron/.local/bin/node";
const sha256=bytes => createHash("sha256").update(bytes).digest("hex");
const capacityPath=`${E}/GUIDE_HARNESS_FIX25-inert-capacity-fixture-attempt2.json`;
const gatePath=`${E}/GUIDE_HARNESS_FIX25-inert-gate-fixture-attempt2.json`;
const declarationPath=`${E}/GUIDE_HARNESS_FIX25-inert-fixture-declaration-attempt2.json`;
const contractPath=`${E}/GUIDE_HARNESS_FIX25-inert-green-contract-attempt2.json`;
const statusPath=`${E}/GUIDE_HARNESS_FIX25-inert-green-status-attempt2.json`;
const resultPath=`${E}/GUIDE_ROW_PROOF-run-FIX25-GREEN-attempt2.json`;
const logPath=`${L}/GUIDE_HARNESS_FIX25-gated-green-attempt2.log`;
for (const path of [capacityPath,gatePath,declarationPath,contractPath,statusPath,resultPath,logPath]) {
  try { await access(path); throw new Error("GUIDE_FIX25_INERT_OUTPUT_COLLISION"); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
}
const capacity=JSON.parse(await readFile(`${E}/GUIDE_LIVE21-capacity.json`,"utf8"));
capacity.measuredAtUtc=new Date().toISOString();
const capacityBytes=Buffer.from(`${JSON.stringify(capacity,null,2)}\n`);
await writeFile(capacityPath,capacityBytes,{ flag:"wx",mode:0o600 });
const template=JSON.parse(await readFile(`${E}/GUIDE_HARNESS_FIX22-gate-template.json`,"utf8"));
const proofPath=`${E}/GUIDE_HARNESS_BIND21-control-proof.json`;
const proofBytes=await readFile(proofPath);
template.controlProofPath=proofPath;
template.controlProofSha256=sha256(proofBytes);
const gate={ ...template,runtimeCapacityPath:capacityPath,runtimeCapacitySha256:sha256(capacityBytes) };
const gateBytes=Buffer.from(`${JSON.stringify(gate,null,2)}\n`);
await writeFile(gatePath,gateBytes,{ flag:"wx",mode:0o600 });
await writeFile(declarationPath,`${JSON.stringify({
  schemaVersion:1,node:"GUIDE_HARNESS_FIX25",fixtureOnly:true,
  operationalUseForbidden:true,runtimeAvailabilityClaimed:false,
  supersedesFailedFixtureForGreenOnly:`${E}/GUIDE_HARNESS_FIX25-inert-gate-fixture.json`,
  reason:"prior fixture exposed the FIX22 control proof's extra node key; use the exact eight-key reviewed BIND21 proof",
  substitutions:["measuredAtUtc","controlProofPath","controlProofSha256"],
  capacityPath,capacitySha256:sha256(capacityBytes),gatePath,gateSha256:sha256(gateBytes)
},null,2)}\n`,{ flag:"wx",mode:0o600 });
const phase=`${ROOT}/probes/GUIDE_HARNESS_BIND21/phase-row-proof.mjs`;
const importer=`${ROOT}/probes/GUIDE_HARNESS_FIX25/replay-row-proofs.mjs`;
const contract={ schemaVersion:1,node:"GUIDE_HARNESS_FIX25_INERT_GREEN_ATTEMPT2",
  revision:REVISION,cwd:PRODUCT,phases:{ rowProof:{
    argv:[NODE,phase,contractPath],output:statusPath,log:logPath,
    childArgv:[NODE,"--import","tsx",importer,gatePath,REVISION,resultPath],result:resultPath
  }}};
await writeFile(contractPath,`${JSON.stringify(contract,null,2)}\n`,{ flag:"wx",mode:0o600 });
process.stdout.write(`${JSON.stringify({ result:"PASS",contractPath,argv:contract.phases.rowProof.argv })}\n`);
