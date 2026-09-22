import { createHash } from "node:crypto";
import { readFile,stat,writeFile } from "node:fs/promises";
import { dirname,isAbsolute,resolve } from "node:path";

const ROOT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const E=`${ROOT}/evidence`;const P=`${ROOT}/probes/GUIDE_CAPTURE_ACTIVATION_FIX47`;
const BASE=`${E}/GUIDE_PHASE_IMPORT_FIX46-command-contract.json`;
const CONTRACT=`${E}/GUIDE_CAPTURE_ACTIVATION_FIX47-command-contract.json`;
const GATE=`${E}/GUIDE_CAPTURE_ACTIVATION_FIX47-gate-template.json`;
const COMPOSITION=`${E}/GUIDE_CAPTURE_ACTIVATION_FIX47-composition-contract.json`;
const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");
const binding=async path=>{const bytes=await readFile(path);return{path,sha256:sha256(bytes),bytes:bytes.byteLength};};
const transform=value=>Array.isArray(value)?value.map(transform):value&&typeof value==="object"
  ?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,transform(item)]))
  :typeof value==="string"?value.replaceAll("GUIDE_PHASE_IMPORT_FIX46","GUIDE_CAPTURE_ACTIVATION_FIX47").replaceAll("LIVE35","LIVE36").replaceAll("GUIDE24","GUIDE25"):value;

const base=JSON.parse(await readFile(BASE,"utf8"));
const contract=transform(base);
const gateBytes=await readFile(`${E}/GUIDE_PHASE_IMPORT_FIX46-gate-template.json`);
await writeFile(GATE,gateBytes,{flag:"wx",mode:0o600});
const composition=transform(JSON.parse(await readFile(`${E}/GUIDE_PHASE_IMPORT_FIX46-composition-contract.json`,"utf8")));
composition.node="GUIDE_CAPTURE_ACTIVATION_FIX47";composition.futureComposedManifestPath=`${E}/GUIDE_LIVE36-composed31-manifest.json`;
const compositionBytes=Buffer.from(`${JSON.stringify(composition,null,2)}\n`);await writeFile(COMPOSITION,compositionBytes,{flag:"wx",mode:0o600});
contract.node="GUIDE_CAPTURE_ACTIVATION_FIX47";contract.gateTemplatePath=GATE;contract.gateTemplateSha256=sha256(gateBytes);
contract.compositionContractPath=COMPOSITION;contract.compositionContractSha256=sha256(compositionBytes);
contract.actualReceipt=`${E}/GUIDE_LIVE_GUIDE25-actual-receipt.json`;contract.browserProfile=`${P}/browser-profile-LIVE36`;
contract.composedManifest=`${E}/GUIDE_LIVE36-composed31-manifest.json`;
contract.lifecycle.invocationNonce="GUIDE_LIVE36_INVOCATION_V1";contract.lifecycle.prerequisite=`${E}/GUIDE_LIVE36-prerequisites.json`;contract.lifecycle.stop=`${E}/GUIDE_LIVE36-stop.json`;
for(const name of Object.keys(contract.lifecycle.operatorLogs))contract.lifecycle.operatorLogs[name]=`${ROOT}/logs/GUIDE_CAPTURE_ACTIVATION_FIX47-operator-${name}.log`;
contract.phases.preflight.ui.script=`${P}/ui-transition-live-preflight.mjs`;Object.assign(contract.phases.preflight.ui,await binding(contract.phases.preflight.ui.script));
contract.phases.preflight.ui.argv=["/Users/vladmihaimiron/.local/bin/node",contract.phases.preflight.ui.script,`${E}/GUIDE_CONTINUATION_UI_PROOF-run-LIVE36.json`];
contract.phases.preflight.ui.output=`${E}/GUIDE_CONTINUATION_UI_PROOF-run-LIVE36.json`;contract.phases.preflight.ui.log=`${ROOT}/logs/GUIDE_CONTINUATION_UI_PROOF-LIVE36.log`;
contract.phases.capacity.argv[1]=`${P}/phase-capacity.mjs`;contract.phases.gate.argv[1]=`${P}/phase-gate.mjs`;
contract.phases.rowProof.childArgv[3]=`${P}/replay-row-proofs.mjs`;contract.phases.rowProof.childArgv[4]=contract.phases.gate.output;contract.phases.rowProof.childArgv[6]=`${E}/GUIDE_ROW_PROOF-run-LIVE36.json`;contract.phases.rowProof.result=contract.phases.rowProof.childArgv[6];
contract.phases.capture.childArgv[3]=`${P}/capture-public-guide.mjs`;contract.phases.capture.childArgv[4]=contract.phases.gate.output;
contract.captureImplementation=await binding(`${P}/capture-public-guide.mjs`);
for(const phase of Object.values(contract.phases))phase.argv[2]=CONTRACT;
const roots=[
  {role:"phase.preflight",path:contract.phases.preflight.argv[1]},{role:"phase.readiness",path:contract.phases.readiness.argv[1]},
  {role:"phase.capacity",path:contract.phases.capacity.argv[1]},{role:"phase.gate",path:contract.phases.gate.argv[1]},
  {role:"phase.rowProof",path:contract.phases.rowProof.argv[1]},{role:"phase.capture",path:contract.phases.capture.argv[1]},
  {role:"phase.idle",path:contract.phases.idle.argv[1]},{role:"child.ui",path:contract.phases.preflight.ui.script},
  {role:"child.rowProof",path:contract.phases.rowProof.childArgv[3]},{role:"child.capture",path:contract.phases.capture.childArgv[3]}
];
const patterns=[/\b(?:import|export)\s+(?:[^;"']*?\sfrom\s*)?["']([^"']+)["']/gu,/\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu];
const found=new Set();async function collect(path){if(found.has(path))return;const info=await stat(path);if(!info.isFile())throw new Error("GUIDE_CAPTURE_ACTIVATION_FIX47_DEPENDENCY_TYPE_INVALID");found.add(path);const source=await readFile(path,"utf8");for(const pattern of patterns)for(const match of source.matchAll(pattern)){const spec=match[1];if(!spec.startsWith(".")&&!isAbsolute(spec))continue;await collect(isAbsolute(spec)?spec:resolve(dirname(path),spec));}}
for(const root of roots)await collect(root.path);const closure=[];for(const path of [...found].sort())closure.push(await binding(path));
contract.moduleClosureRoots=roots;contract.moduleClosure=closure;contract.moduleClosureSha256=sha256(Buffer.from(JSON.stringify(closure)));
contract.futureAbsence=[...new Set(contract.futureAbsence.map(path=>path.replaceAll("LIVE35","LIVE36").replaceAll("GUIDE24","GUIDE25").replaceAll("GUIDE_PHASE_IMPORT_FIX46","GUIDE_CAPTURE_ACTIVATION_FIX47")))];
for(const path of [contract.actualReceipt,contract.browserProfile,contract.composedManifest,contract.lifecycle.prerequisite,contract.lifecycle.stop,contract.phases.preflight.ui.output,contract.phases.rowProof.result])if(!contract.futureAbsence.includes(path))contract.futureAbsence.push(path);
const bytes=Buffer.from(`${JSON.stringify(contract,null,2)}\n`);await writeFile(CONTRACT,bytes,{flag:"wx",mode:0o600});
process.stdout.write(`${JSON.stringify({contractSha256:sha256(bytes),moduleClosureSha256:contract.moduleClosureSha256,moduleCount:closure.length,futureCount:contract.futureAbsence.length})}\n`);
