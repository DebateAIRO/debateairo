import { createHash } from "node:crypto";
import { readFile,stat,writeFile } from "node:fs/promises";
import { dirname,isAbsolute,resolve } from "node:path";

const ROOT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const E=`${ROOT}/evidence`;
const P=`${ROOT}/probes/GUIDE_PHASE_IMPORT_FIX46`;
const BASE=`${E}/GUIDE_UI_WRITER_FIX45-command-contract.json`;
const CONTRACT=`${E}/GUIDE_PHASE_IMPORT_FIX46-command-contract.json`;
const GATE=`${E}/GUIDE_PHASE_IMPORT_FIX46-gate-template.json`;
const COMPOSITION=`${E}/GUIDE_PHASE_IMPORT_FIX46-composition-contract.json`;
const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");
const fileBinding=async path=>{
  const bytes=await readFile(path);
  return { path,sha256:sha256(bytes),bytes:bytes.byteLength };
};

const gateBytes=await readFile(`${E}/GUIDE_UI_WRITER_FIX45-gate-template.json`);
await writeFile(GATE,gateBytes,{ flag:"wx",mode:0o600 });
const composition=JSON.parse(await readFile(`${E}/GUIDE_UI_WRITER_FIX45-composition-contract.json`,"utf8"));
composition.node="GUIDE_PHASE_IMPORT_FIX46";
composition.futureComposedManifestPath=`${E}/GUIDE_LIVE35-composed31-manifest.json`;
const compositionBytes=Buffer.from(`${JSON.stringify(composition,null,2)}\n`);
await writeFile(COMPOSITION,compositionBytes,{ flag:"wx",mode:0o600 });

const roots=Object.freeze([
  { role:"phase.preflight",path:`${ROOT}/probes/GUIDE_UI_WRITER_FIX45/phase-preflight.mjs` },
  { role:"phase.readiness",path:`${ROOT}/probes/GUIDE_PROCESS_BIND37/phase-readiness.mjs` },
  { role:"phase.capacity",path:`${P}/phase-capacity.mjs` },
  { role:"phase.gate",path:`${P}/phase-gate.mjs` },
  { role:"phase.rowProof",path:`${ROOT}/probes/GUIDE_CONTINUATION_BIND40/phase-row-proof.mjs` },
  { role:"phase.capture",path:`${ROOT}/probes/GUIDE_CONTINUATION_BIND40/phase-capture.mjs` },
  { role:"phase.idle",path:`${ROOT}/probes/GUIDE_PROCESS_BIND37/phase-idle.mjs` },
  { role:"child.ui",path:`${P}/ui-transition-live-preflight.mjs` },
  { role:"child.rowProof",path:`${P}/replay-row-proofs.mjs` },
  { role:"child.capture",path:`${P}/capture-public-guide.mjs` }
]);
const importPatterns=[
  /\b(?:import|export)\s+(?:[^;"']*?\sfrom\s*)?["']([^"']+)["']/gu,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu
];
const closure=new Set();
async function collect(path) {
  if (closure.has(path)) return;
  const metadata=await stat(path);
  if (!metadata.isFile()) throw new Error("GUIDE_PHASE_IMPORT_FIX46_DEPENDENCY_TYPE_INVALID");
  closure.add(path);
  const source=await readFile(path,"utf8");
  for (const pattern of importPatterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier=match[1];
      if (!specifier.startsWith(".") && !isAbsolute(specifier)) continue;
      const dependency=isAbsolute(specifier)?specifier:resolve(dirname(path),specifier);
      await collect(dependency);
    }
  }
}
for (const root of roots) await collect(root.path);
const moduleClosure=[];
for (const path of [...closure].sort()) moduleClosure.push(await fileBinding(path));

const transform=value=>{
  if (Array.isArray(value)) return value.map(transform);
  if (value!==null&&typeof value==="object") return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,transform(item)]));
  if (typeof value!=="string") return value;
  return value
    .replaceAll("LIVE34","LIVE35")
    .replaceAll("GUIDE_UI_WRITER_FIX45-command-contract.json","GUIDE_PHASE_IMPORT_FIX46-command-contract.json")
    .replaceAll("GUIDE_UI_WRITER_FIX45-gate-template.json","GUIDE_PHASE_IMPORT_FIX46-gate-template.json")
    .replaceAll("GUIDE_UI_WRITER_FIX45-composition-contract.json","GUIDE_PHASE_IMPORT_FIX46-composition-contract.json")
    .replaceAll("GUIDE_UI_WRITER_FIX45-operator-","GUIDE_PHASE_IMPORT_FIX46-operator-");
};
const contract=transform(JSON.parse(await readFile(BASE,"utf8")));
contract.node="GUIDE_PHASE_IMPORT_FIX46";
contract.gateTemplatePath=GATE;
contract.gateTemplateSha256=sha256(gateBytes);
contract.compositionContractPath=COMPOSITION;
contract.compositionContractSha256=sha256(compositionBytes);
contract.browserProfile=`${P}/browser-profile-LIVE35`;
contract.composedManifest=`${E}/GUIDE_LIVE35-composed31-manifest.json`;
contract.lifecycle.invocationNonce="GUIDE_LIVE35_INVOCATION_V1";
contract.lifecycle.prerequisite=`${E}/GUIDE_LIVE35-prerequisites.json`;
contract.lifecycle.stop=`${E}/GUIDE_LIVE35-stop.json`;
for (const name of Object.keys(contract.lifecycle.operatorLogs)) {
  contract.lifecycle.operatorLogs[name]=`${ROOT}/logs/GUIDE_PHASE_IMPORT_FIX46-operator-${name}.log`;
}
contract.phases.preflight.ui.script=`${P}/ui-transition-live-preflight.mjs`;
Object.assign(contract.phases.preflight.ui,await fileBinding(contract.phases.preflight.ui.script));
contract.phases.preflight.ui.argv=["/Users/vladmihaimiron/.local/bin/node",contract.phases.preflight.ui.script,`${E}/GUIDE_CONTINUATION_UI_PROOF-run-LIVE35.json`];
contract.phases.preflight.ui.output=`${E}/GUIDE_CONTINUATION_UI_PROOF-run-LIVE35.json`;
contract.phases.preflight.ui.log=`${ROOT}/logs/GUIDE_CONTINUATION_UI_PROOF-LIVE35.log`;
contract.phases.capacity.argv[1]=`${P}/phase-capacity.mjs`;
contract.phases.gate.argv[1]=`${P}/phase-gate.mjs`;
contract.phases.rowProof.childArgv[3]=`${P}/replay-row-proofs.mjs`;
contract.phases.rowProof.childArgv[4]=contract.phases.gate.output;
contract.phases.rowProof.childArgv[6]=`${E}/GUIDE_ROW_PROOF-run-LIVE35.json`;
contract.phases.rowProof.result=contract.phases.rowProof.childArgv[6];
contract.phases.capture.childArgv[3]=`${P}/capture-public-guide.mjs`;
contract.phases.capture.childArgv[4]=contract.phases.gate.output;
contract.captureImplementation=await fileBinding(`${P}/capture-public-guide.mjs`);
contract.futureAbsence=contract.futureAbsence.map(path=>path.includes("browser-profile-LIVE35")?contract.browserProfile:path);
for (const phase of Object.values(contract.phases)) phase.argv[2]=CONTRACT;
contract.moduleClosureRoots=roots;
contract.moduleClosure=moduleClosure;
contract.moduleClosureSha256=sha256(Buffer.from(JSON.stringify(moduleClosure)));
if (new Set(contract.futureAbsence).size!==contract.futureAbsence.length) throw new Error("GUIDE_PHASE_IMPORT_FIX46_FUTURE_PATH_COLLISION");
if (!contract.futureAbsence.includes(contract.browserProfile)) throw new Error("GUIDE_PHASE_IMPORT_FIX46_PROFILE_ABSENCE_MISSING");
const contractBytes=Buffer.from(`${JSON.stringify(contract,null,2)}\n`);
await writeFile(CONTRACT,contractBytes,{ flag:"wx",mode:0o600 });
process.stdout.write(`${JSON.stringify({contractSha256:sha256(contractBytes),moduleClosureSha256:contract.moduleClosureSha256,moduleCount:moduleClosure.length,futureCount:contract.futureAbsence.length})}\n`);
