import { createHash } from "node:crypto";
import { readFile,writeFile } from "node:fs/promises";
import { validateGuideGateInput } from "../GUIDE_HARNESS_BIND16/controls.mjs";

const evidence="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence";
const templatePath=`${evidence}/GUIDE_LIVE8-gate-template.json`;
const capacityPath=`${evidence}/GUIDE_LIVE8-runtime-capacity.json`;
const outputPath=`${evidence}/GUIDE_LIVE8-gate.json`;
const templateExpectedSha256="54c2a6adf12bad3df6995170cf7ffa053c0e9a24650ce0dd67bb0897cf501df7";
const sha256=bytes => createHash("sha256").update(bytes).digest("hex");
const templateBytes=await readFile(templatePath);
if (sha256(templateBytes) !== templateExpectedSha256) throw new Error("GUIDE_LIVE8_GATE_TEMPLATE_HASH_MISMATCH");
const template=JSON.parse(templateBytes.toString("utf8"));
if (Object.keys(template).length !== 16
  || Object.hasOwn(template,"runtimeCapacityPath") || Object.hasOwn(template,"runtimeCapacitySha256")) {
  throw new Error("GUIDE_LIVE8_GATE_TEMPLATE_INVALID");
}
const capacityBytes=await readFile(capacityPath);
const capacitySha256=sha256(capacityBytes);
const gate=validateGuideGateInput({ ...template,runtimeCapacityPath:capacityPath,runtimeCapacitySha256:capacitySha256 });
if (Object.keys(gate).length !== 18
  || !Object.keys(template).every(key => JSON.stringify(gate[key]) === JSON.stringify(template[key]))) {
  throw new Error("GUIDE_LIVE8_GATE_STATIC_VALUE_MISMATCH");
}
const gateBytes=Buffer.from(`${JSON.stringify(gate,null,2)}\n`);
await writeFile(outputPath,gateBytes,{ mode:0o600,flag:"wx" });
process.stdout.write(`${JSON.stringify({
  outputPath,templateSha256:sha256(templateBytes),capacityPath,capacitySha256,
  gateSha256:sha256(gateBytes),staticKeys:Object.keys(template).length,
  finalKeys:Object.keys(gate).length,addedKeys:["runtimeCapacityPath","runtimeCapacitySha256"]
},null,2)}\n`);
