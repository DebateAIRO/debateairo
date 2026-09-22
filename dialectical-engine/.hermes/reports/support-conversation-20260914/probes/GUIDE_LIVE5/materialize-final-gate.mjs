import { createHash } from "node:crypto";
import { readFile,writeFile } from "node:fs/promises";
import { validateGuideGateInput } from "../GUIDE_HARNESS_FIX9/controls.mjs";

const evidence="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence";
const templatePath=`${evidence}/GUIDE_LIVE5-gate-template.json`;
const capacityPath=`${evidence}/GUIDE_LIVE5-runtime-capacity.json`;
const outputPath=`${evidence}/GUIDE_LIVE5-gate.json`;
const templateExpectedSha256="ca57120920aefad1f7e62bcd59c6b7cbb989fc287b98bc51841c6d52b804899b";
const sha256=bytes => createHash("sha256").update(bytes).digest("hex");
const templateBytes=await readFile(templatePath);
if (sha256(templateBytes) !== templateExpectedSha256) throw new Error("GUIDE_LIVE5_GATE_TEMPLATE_HASH_MISMATCH");
const template=JSON.parse(templateBytes.toString("utf8"));
if (Object.hasOwn(template,"runtimeCapacityPath") || Object.hasOwn(template,"runtimeCapacitySha256")) {
  throw new Error("GUIDE_LIVE5_GATE_TEMPLATE_ALREADY_MATERIALIZED");
}
const capacityBytes=await readFile(capacityPath);
const capacitySha256=sha256(capacityBytes);
const gate=validateGuideGateInput({
  ...template,runtimeCapacityPath:capacityPath,runtimeCapacitySha256:capacitySha256
});
if (!Object.keys(template).every(key => JSON.stringify(gate[key]) === JSON.stringify(template[key]))) {
  throw new Error("GUIDE_LIVE5_GATE_STATIC_VALUE_MISMATCH");
}
const gateBytes=Buffer.from(`${JSON.stringify(gate,null,2)}\n`);
await writeFile(outputPath,gateBytes,{ mode:0o600,flag:"wx" });
process.stdout.write(`${JSON.stringify({
  outputPath,templateSha256:sha256(templateBytes),capacityPath,capacitySha256,
  gateSha256:sha256(gateBytes),addedKeys:["runtimeCapacityPath","runtimeCapacitySha256"]
},null,2)}\n`);
