import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";

const ROOT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const E=`${ROOT}/evidence`;
const P=`${ROOT}/probes/GUIDE_PREFLIGHT_SCHEMA_FIX49`;
const BASE=`${E}/GUIDE_CAPTURE_PANE_FIX48-command-contract.json`;
const BASE_COMPOSITION=`${E}/GUIDE_CAPTURE_PANE_FIX48-composition-contract.json`;
const CONTRACT=`${E}/GUIDE_PREFLIGHT_SCHEMA_FIX49-command-contract.json`;
const COMPOSITION=`${E}/GUIDE_PREFLIGHT_SCHEMA_FIX49-composition-contract.json`;
const GATE=`${E}/GUIDE_PREFLIGHT_SCHEMA_FIX49-gate-template.json`;
const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");
const binding=async path=>{const bytes=await readFile(path);return {path,sha256:sha256(bytes),bytes:bytes.byteLength};};
const replaceDeep=value=>Array.isArray(value)?value.map(replaceDeep):value&&typeof value==="object"
  ?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,replaceDeep(item)]))
  :typeof value==="string"?value.replaceAll("LIVE37","LIVE38").replaceAll("GUIDE_CAPTURE_PANE_FIX48-operator-","GUIDE_PREFLIGHT_SCHEMA_FIX49-operator-"):value;

const composition={...JSON.parse(await readFile(BASE_COMPOSITION,"utf8")),node:"GUIDE_PREFLIGHT_SCHEMA_FIX49"};
const compositionBytes=Buffer.from(`${JSON.stringify(composition,null,2)}\n`);
await writeFile(COMPOSITION,compositionBytes,{flag:"wx",mode:0o600});

const contract=replaceDeep(JSON.parse(await readFile(BASE,"utf8")));
contract.node="GUIDE_PREFLIGHT_SCHEMA_FIX49";
contract.compositionContractPath=COMPOSITION;
contract.compositionContractSha256=sha256(compositionBytes);
contract.composedManifest=`${E}/GUIDE_LIVE38-composed31-manifest.json`;
contract.browserProfile=`${P}/browser-profile-LIVE38`;
contract.lifecycle.invocationNonce="GUIDE_LIVE38_INVOCATION_V1";
contract.lifecycle.prerequisite=`${E}/GUIDE_LIVE38-prerequisites.json`;
contract.lifecycle.stop=`${E}/GUIDE_LIVE38-stop.json`;
for(const name of Object.keys(contract.lifecycle.operatorLogs))contract.lifecycle.operatorLogs[name]=`${ROOT}/logs/GUIDE_PREFLIGHT_SCHEMA_FIX49-operator-${name}.log`;

const oldGate=JSON.parse(await readFile(contract.gateTemplatePath,"utf8"));
const gate={...oldGate,node:"GUIDE_PREFLIGHT_SCHEMA_FIX49"};
const gateBytes=Buffer.from(`${JSON.stringify(gate,null,2)}\n`);
await writeFile(GATE,gateBytes,{flag:"wx",mode:0o600});
contract.gateTemplatePath=GATE;contract.gateTemplateSha256=sha256(gateBytes);

contract.phases.preflight.argv[1]=`${P}/phase-preflight.mjs`;
contract.phases.preflight.ui.argv[2]=`${E}/GUIDE_CONTINUATION_UI_PROOF-run-LIVE38.json`;
contract.phases.preflight.ui.output=contract.phases.preflight.ui.argv[2];
contract.phases.preflight.ui.log=`${ROOT}/logs/GUIDE_CONTINUATION_UI_PROOF-LIVE38.log`;
contract.phases.rowProof.childArgv[3]=`${P}/replay-row-proofs.mjs`;
contract.phases.rowProof.childArgv[4]=contract.phases.gate.output;
contract.phases.rowProof.childArgv[6]=`${E}/GUIDE_ROW_PROOF-run-LIVE38.json`;
contract.phases.rowProof.result=contract.phases.rowProof.childArgv[6];
contract.phases.capture.childArgv[3]=`${P}/capture-public-guide.mjs`;
contract.phases.capture.childArgv[4]=contract.phases.gate.output;
for(const phase of Object.values(contract.phases))phase.argv[2]=CONTRACT;

contract.preflightImplementation=await binding(`${P}/phase-preflight.mjs`);
contract.compositionImplementation=await binding(`${P}/composition.mjs`);
contract.captureImplementation=await binding(`${P}/capture-public-guide.mjs`);

const roots=[
  {role:"phase.preflight",path:contract.phases.preflight.argv[1]},{role:"phase.readiness",path:contract.phases.readiness.argv[1]},
  {role:"phase.capacity",path:contract.phases.capacity.argv[1]},{role:"phase.gate",path:contract.phases.gate.argv[1]},
  {role:"phase.rowProof",path:contract.phases.rowProof.argv[1]},{role:"phase.capture",path:contract.phases.capture.argv[1]},
  {role:"phase.idle",path:contract.phases.idle.argv[1]},{role:"child.ui",path:contract.phases.preflight.ui.script},
  {role:"child.rowProof",path:contract.phases.rowProof.childArgv[3]},{role:"child.capture",path:contract.phases.capture.childArgv[3]},
  {role:"composition",path:`${P}/composition.mjs`}
];
const patterns=[/\b(?:import|export)\s+(?:[^;"']*?\sfrom\s*)?["']([^"']+)["']/gu,/\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu];
const found=new Set();
async function collect(path){if(found.has(path))return;const info=await stat(path);if(!info.isFile())throw new Error("GUIDE_PREFLIGHT_SCHEMA_FIX49_DEPENDENCY_TYPE_INVALID");found.add(path);const source=await readFile(path,"utf8");for(const pattern of patterns)for(const match of source.matchAll(pattern)){const spec=match[1];if(!spec.startsWith(".")&&!isAbsolute(spec))continue;await collect(isAbsolute(spec)?spec:resolve(dirname(path),spec));}}
for(const root of roots)await collect(root.path);
const closure=[];for(const path of [...found].sort())closure.push(await binding(path));
contract.moduleClosureRoots=roots;contract.moduleClosure=closure;contract.moduleClosureSha256=sha256(Buffer.from(JSON.stringify(closure)));
contract.futureAbsence=[...new Set(contract.futureAbsence.map(path=>path.replaceAll("LIVE37","LIVE38").replaceAll("GUIDE_CAPTURE_PANE_FIX48-operator-","GUIDE_PREFLIGHT_SCHEMA_FIX49-operator-")))];
for(const path of [contract.actualReceipt,contract.browserProfile,contract.composedManifest,contract.lifecycle.prerequisite,contract.lifecycle.stop,contract.phases.preflight.ui.output,contract.phases.rowProof.result])if(!contract.futureAbsence.includes(path))contract.futureAbsence.push(path);
const bytes=Buffer.from(`${JSON.stringify(contract,null,2)}\n`);
await writeFile(CONTRACT,bytes,{flag:"wx",mode:0o600});
process.stdout.write(`${JSON.stringify({contractSha256:sha256(bytes),compositionContractSha256:contract.compositionContractSha256,moduleClosureSha256:contract.moduleClosureSha256,moduleCount:closure.length,futureCount:contract.futureAbsence.length})}\n`);
