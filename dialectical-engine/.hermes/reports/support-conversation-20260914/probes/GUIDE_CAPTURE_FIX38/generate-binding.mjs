import { createHash } from "node:crypto";
import { readFile,writeFile } from "node:fs/promises";

const R="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const E=`${R}/evidence`,P=`${R}/probes`;
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const json=async path=>JSON.parse(await readFile(path,"utf8"));
const writeJson=(path,value)=>writeFile(path,`${JSON.stringify(value,null,2)}\n`,{flag:"wx",mode:0o600});
const commandPath=`${E}/GUIDE_CAPTURE_FIX38-command-contract.json`;
const operatorPath=`${E}/GUIDE_CAPTURE_FIX38-operator-contract.json`;
const gateTemplatePath=`${E}/GUIDE_CAPTURE_FIX38-gate-template.json`;

const command=await json(`${E}/GUIDE_PROCESS_BIND37-command-contract.json`);
command.node="GUIDE_CAPTURE_FIX38";
command.actualReceipt=`${E}/GUIDE_LIVE_GUIDE23-actual-receipt.json`;
command.browserProfile=`${P}/GUIDE_CAPTURE_FIX38/browser-profile`;
command.gateTemplatePath=gateTemplatePath;
const oldGate=await readFile(`${E}/GUIDE_RUNTIME_BIND36-gate-template.json`);
await writeFile(gateTemplatePath,oldGate,{flag:"wx",mode:0o600});
command.gateTemplateSha256=sha(oldGate);
for (const phase of Object.values(command.phases)) phase.argv[2]=commandPath;
for (const phase of Object.values(command.phases)) {
  phase.output=phase.output.replaceAll("GUIDE_LIVE30","GUIDE_LIVE31");
  phase.log=phase.log.replaceAll("GUIDE_LIVE30","GUIDE_LIVE31");
}
command.phases.preflight.argv[1]=`${P}/GUIDE_CAPTURE_FIX38/phase-preflight.mjs`;
command.phases.preflight.ui.output=command.phases.preflight.ui.output.replaceAll("LIVE30","LIVE31");
command.phases.preflight.ui.log=command.phases.preflight.ui.log.replaceAll("LIVE30","LIVE31");
command.phases.preflight.ui.argv[3]=command.phases.preflight.ui.output;
command.phases.rowProof.childArgv[4]=command.phases.gate.output;
command.phases.rowProof.childArgv[6]=command.phases.rowProof.childArgv[6].replaceAll("LIVE30","LIVE31");
command.phases.rowProof.result=command.phases.rowProof.childArgv[6];
command.phases.capture.childArgv[3]=`${P}/GUIDE_CAPTURE_FIX38/capture-public-guide.mjs`;
command.phases.capture.childArgv[4]=command.phases.gate.output;
const helperPath=`${P}/GUIDE_CAPTURE_FIX38/screenshot-evidence-successor.mjs`;
const capturePath=`${P}/GUIDE_CAPTURE_FIX38/capture-public-guide.mjs`;
for (const [key,path] of [["screenshotHelper",helperPath],["captureImplementation",capturePath]]) {
  const bytes=await readFile(path); command[key]={path,sha256:sha(bytes),bytes:bytes.byteLength};
}
await writeJson(commandPath,command);
const commandBytes=await readFile(commandPath),commandHash=sha(commandBytes);

let script=await readFile(`${P}/GUIDE_PROCESS_BIND37/run-operator.mjs`,"utf8");
script=script.replaceAll("GUIDE_PROCESS_BIND37","GUIDE_CAPTURE_FIX38")
  .replaceAll("GUIDE_LIVE30","GUIDE_LIVE31")
  .replaceAll("GUIDE_LIVE_GUIDE22","GUIDE_LIVE_GUIDE23")
  .replaceAll("probes/GUIDE_RUNTIME_BIND36/browser-profile","probes/GUIDE_CAPTURE_FIX38/browser-profile")
  .replace("a569348814688b64eab8368ef383bc77b7ec80605c08290489024fe8ca926f1f",commandHash)
  .replace("future.push(`${stem}-complete-expanded.png`,`${stem}-original-pane-top.png`,`${stem}-original-pane-footer.png`);",
    "future.push(`${stem}-complete-expanded.png`,`${stem}-original-pane-top.png`,`${stem}-original-pane-footer.png`,`${stem}-screenshot-failure.json`);")
  .replace("assert.equal(future.length,inert ? 23 : 123", "assert.equal(future.length,inert ? 23 : 154");
const scriptPath=`${P}/GUIDE_CAPTURE_FIX38/run-operator.mjs`;
await writeFile(scriptPath,script,{flag:"wx",mode:0o600});
const scriptBytes=await readFile(scriptPath);

const operator=await json(`${E}/GUIDE_PROCESS_BIND37-operator-contract.json`);
operator.node="GUIDE_CAPTURE_FIX38"; operator.ticket="t_368d9d59";
operator.argv[3]=scriptPath;
operator.script={path:scriptPath,sha256:sha(scriptBytes),bytes:scriptBytes.byteLength};
operator.commandContract={path:commandPath,sha256:commandHash,bytes:commandBytes.byteLength};
operator.operatorOwned.outputs.prerequisite=operator.operatorOwned.outputs.prerequisite.replaceAll("GUIDE_LIVE30","GUIDE_LIVE31");
operator.operatorOwned.outputs.stop=operator.operatorOwned.outputs.stop.replaceAll("GUIDE_LIVE30","GUIDE_LIVE31");
for (const name of Object.keys(operator.operatorOwned.logs)) {
  operator.operatorOwned.logs[name]=operator.operatorOwned.logs[name].replaceAll("GUIDE_PROCESS_BIND37","GUIDE_CAPTURE_FIX38");
}
const future=[operator.operatorOwned.outputs.stop,...Object.values(command.phases).flatMap(p=>[p.output,p.log]),
  command.phases.preflight.ui.output,command.phases.preflight.ui.log,command.phases.rowProof.result,
  command.actualReceipt,command.browserProfile,command.ownerCapacity.output,
  `${E}/GUIDE_LIVE25-owner-testability.json`,...Object.values(operator.operatorOwned.logs),
  operator.operatorOwned.outputs.prerequisite,
  ...command.actualSequences.flatMap(sequence=>{const stem=`${E}/GUIDE_LIVE_GUIDE23-row-${String(sequence).padStart(2,"0")}`;
    return [`${stem}-complete-expanded.png`,`${stem}-original-pane-top.png`,`${stem}-original-pane-footer.png`,`${stem}-screenshot-failure.json`];})];
operator.futureAbsence={count:future.length,uniqueCount:new Set(future).size,paths:future};
operator.delta={kind:"FOOTER_CAPTURE_CONTAINMENT_AND_DIAGNOSTIC_BINDING",retainedRuntime9:true,
  retainedActualGuide22Partial:true,freshLive31:true,freshActualGuide23:true};
await writeJson(operatorPath,operator);
console.log(JSON.stringify({commandHash,operatorHash:sha(await readFile(operatorPath)),scriptHash:sha(scriptBytes),future:future.length,unique:new Set(future).size}));
