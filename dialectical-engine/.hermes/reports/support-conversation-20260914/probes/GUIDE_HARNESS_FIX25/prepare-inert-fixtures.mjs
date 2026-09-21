import { createHash } from "node:crypto";
import { access,readFile,writeFile } from "node:fs/promises";

const REPORT_ROOT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const EVIDENCE_ROOT=`${REPORT_ROOT}/evidence`;
const LOG_ROOT=`${REPORT_ROOT}/logs`;
const PRODUCT_ROOT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const REVISION="456cafb9e56a737de550570b5736ec52d79ddf48";
const NODE="/Users/vladmihaimiron/.local/bin/node";
const PHASE=`${REPORT_ROOT}/probes/GUIDE_HARNESS_BIND21/phase-row-proof.mjs`;
const OLD_IMPORTER=`${REPORT_ROOT}/probes/GUIDE_ROW_PROOF_BIND21/replay-row-proofs.mjs`;
const NEW_IMPORTER=`${REPORT_ROOT}/probes/GUIDE_HARNESS_FIX25/replay-row-proofs.mjs`;
const sha256=bytes => createHash("sha256").update(bytes).digest("hex");

const capacityPath=`${EVIDENCE_ROOT}/GUIDE_HARNESS_FIX25-inert-capacity-fixture.json`;
const gatePath=`${EVIDENCE_ROOT}/GUIDE_HARNESS_FIX25-inert-gate-fixture.json`;
const declarationPath=`${EVIDENCE_ROOT}/GUIDE_HARNESS_FIX25-inert-fixture-declaration.json`;
const generated=[capacityPath,gatePath,declarationPath];
const contracts=[];
for (const kind of ["red","green"]) {
  generated.push(`${EVIDENCE_ROOT}/GUIDE_HARNESS_FIX25-inert-${kind}-contract.json`);
  generated.push(`${EVIDENCE_ROOT}/GUIDE_HARNESS_FIX25-inert-${kind}-status.json`);
  generated.push(`${EVIDENCE_ROOT}/GUIDE_ROW_PROOF-run-FIX25-${kind.toUpperCase()}.json`);
  generated.push(`${LOG_ROOT}/GUIDE_HARNESS_FIX25-gated-${kind}.log`);
}
for (const path of generated) {
  try { await access(path); throw new Error("GUIDE_FIX25_INERT_OUTPUT_COLLISION"); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
}

const priorCapacity=JSON.parse(await readFile(`${EVIDENCE_ROOT}/GUIDE_LIVE21-capacity.json`,"utf8"));
const capacity={ ...priorCapacity,measuredAtUtc:new Date().toISOString() };
const capacityBytes=Buffer.from(`${JSON.stringify(capacity,null,2)}\n`);
await writeFile(capacityPath,capacityBytes,{ flag:"wx",mode:0o600 });
const template=JSON.parse(await readFile(`${EVIDENCE_ROOT}/GUIDE_HARNESS_FIX22-gate-template.json`,"utf8"));
const gate={ ...template,runtimeCapacityPath:capacityPath,runtimeCapacitySha256:sha256(capacityBytes) };
const gateBytes=Buffer.from(`${JSON.stringify(gate,null,2)}\n`);
await writeFile(gatePath,gateBytes,{ flag:"wx",mode:0o600 });
await writeFile(declarationPath,`${JSON.stringify({
  schemaVersion:1,node:"GUIDE_HARNESS_FIX25",fixtureOnly:true,
  operationalUseForbidden:true,runtimeAvailabilityClaimed:false,
  copiedCapacitySource:`${EVIDENCE_ROOT}/GUIDE_LIVE21-capacity.json`,
  substitutions:["measuredAtUtc"],capacityPath,capacitySha256:sha256(capacityBytes),
  gatePath,gateSha256:sha256(gateBytes)
},null,2)}\n`,{ flag:"wx",mode:0o600 });

for (const [kind,importer] of [["red",OLD_IMPORTER],["green",NEW_IMPORTER]]) {
  const contractPath=`${EVIDENCE_ROOT}/GUIDE_HARNESS_FIX25-inert-${kind}-contract.json`;
  const resultPath=`${EVIDENCE_ROOT}/GUIDE_ROW_PROOF-run-FIX25-${kind.toUpperCase()}.json`;
  const contract={
    schemaVersion:1,node:`GUIDE_HARNESS_FIX25_INERT_${kind.toUpperCase()}`,
    revision:REVISION,cwd:PRODUCT_ROOT,
    phases:{ rowProof:{
      argv:[NODE,PHASE,contractPath],
      output:`${EVIDENCE_ROOT}/GUIDE_HARNESS_FIX25-inert-${kind}-status.json`,
      log:`${LOG_ROOT}/GUIDE_HARNESS_FIX25-gated-${kind}.log`,
      childArgv:[NODE,"--import","tsx",importer,gatePath,REVISION,resultPath],
      result:resultPath
    }}
  };
  await writeFile(contractPath,`${JSON.stringify(contract,null,2)}\n`,{ flag:"wx",mode:0o600 });
  contracts.push({ kind,contractPath,argv:contract.phases.rowProof.argv });
}
process.stdout.write(`${JSON.stringify({ result:"PASS",fixtureOnly:true,contracts })}\n`);
