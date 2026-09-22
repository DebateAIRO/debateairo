import { createHash } from "node:crypto";
import { readFile,writeFile } from "node:fs/promises";

const R="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const E=`${R}/evidence`,P=`${R}/probes`;
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const readJson=async path=>JSON.parse(await readFile(path,"utf8"));
const writeJson=async(path,value)=>writeFile(path,`${JSON.stringify(value,null,2)}\n`,{ flag:"wx",mode:0o600 });

const command=await readJson(`${E}/GUIDE_RUNTIME_BIND36-command-contract.json`);
const commandPath=`${E}/GUIDE_PROCESS_BIND37-command-contract.json`;
const validatorPath=`${P}/GUIDE_PROCESS_BIND37/process-row.mjs`;
const validatorBytes=await readFile(validatorPath);
const custody=await readJson(command.runtimeCustodyPath);
command.node="GUIDE_PROCESS_BIND37";
command.processIdentityValidator={ path:validatorPath,sha256:sha(validatorBytes),bytes:validatorBytes.byteLength };
command.runtimeCommandMarker=custody.commandMarker;
for (const phase of Object.values(command.phases)) phase.argv[2]=commandPath;
command.phases.readiness.argv[1]=`${P}/GUIDE_PROCESS_BIND37/phase-readiness.mjs`;
command.phases.idle.argv[1]=`${P}/GUIDE_PROCESS_BIND37/phase-idle.mjs`;
await writeJson(commandPath,command);
const commandBytes=await readFile(commandPath),commandHash=sha(commandBytes);

const oldScript=await readFile(`${P}/GUIDE_RUNTIME_BIND36/run-operator.mjs`,"utf8");
let script=oldScript.replaceAll("GUIDE_RUNTIME_BIND36","GUIDE_PROCESS_BIND37");
script=script.replace("30da55750cd96c3323234f988a07cf2961025db7ebe486176bd79858897e46e4",commandHash);
const scriptPath=`${P}/GUIDE_PROCESS_BIND37/run-operator.mjs`;
await writeFile(scriptPath,script,{ flag:"wx",mode:0o600 });
const scriptBytes=await readFile(scriptPath);

const operator=await readJson(`${E}/GUIDE_RUNTIME_BIND36-operator-contract.json`);
operator.node="GUIDE_PROCESS_BIND37";
operator.ticket="t_ebade6b9";
operator.argv[3]=scriptPath;
operator.script={ path:scriptPath,sha256:sha(scriptBytes),bytes:scriptBytes.byteLength };
operator.commandContract={ path:commandPath,sha256:commandHash,bytes:commandBytes.byteLength };
for (const name of Object.keys(operator.operatorOwned.logs)) {
  operator.operatorOwned.logs[name]=operator.operatorOwned.logs[name].replaceAll("GUIDE_RUNTIME_BIND36","GUIDE_PROCESS_BIND37");
}
operator.futureAbsence.paths=operator.futureAbsence.paths.map(path=>path.replaceAll("GUIDE_RUNTIME_BIND36-operator","GUIDE_PROCESS_BIND37-operator"));
operator.delta={ kind:"PROCESS_IDENTITY_EXACT_ROW_BINDING",retainedRuntime9:true,retainedLive30:true,retainedActualGuide22:true,retainedOwnerContract:true };
const operatorPath=`${E}/GUIDE_PROCESS_BIND37-operator-contract.json`;
await writeJson(operatorPath,operator);
console.log(JSON.stringify({ commandHash,validatorHash:command.processIdentityValidator.sha256,scriptHash:operator.script.sha256,operatorHash:sha(await readFile(operatorPath)),futurePaths:operator.futureAbsence.paths.length }));
