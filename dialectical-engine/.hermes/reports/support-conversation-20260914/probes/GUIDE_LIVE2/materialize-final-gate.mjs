import { createHash } from "node:crypto";
import { readFile,writeFile } from "node:fs/promises";
import { validateGuideGateInput } from "../GUIDE_HARNESS_FIX2/controls.mjs";

const evidenceRoot="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence";
const templatePath=`${evidenceRoot}/GUIDE_LIVE2-gate-template.json`;
const capacityPath=`${evidenceRoot}/GUIDE_LIVE2-runtime-capacity.json`;
const outputPath=`${evidenceRoot}/GUIDE_LIVE2-gate.json`;
const templateExpectedSha256="a0805ce6375c331c54eba98635134d61e682556b1d46572edc9e66f273e7e231";
const sha256=bytes => createHash("sha256").update(bytes).digest("hex");
const templateBytes=await readFile(templatePath);
if (sha256(templateBytes) !== templateExpectedSha256) throw new Error("GUIDE_LIVE2_GATE_TEMPLATE_HASH_MISMATCH");
const template=JSON.parse(templateBytes.toString("utf8"));
if (Object.hasOwn(template,"runtimeCapacityPath") || Object.hasOwn(template,"runtimeCapacitySha256")) {
  throw new Error("GUIDE_LIVE2_GATE_TEMPLATE_ALREADY_MATERIALIZED");
}
const capacityBytes=await readFile(capacityPath);
const capacitySha256=sha256(capacityBytes);
const gate=validateGuideGateInput({
  ...template,runtimeCapacityPath:capacityPath,runtimeCapacitySha256:capacitySha256
});
const staticKeys=Object.keys(template);
if (!staticKeys.every(key => JSON.stringify(gate[key]) === JSON.stringify(template[key]))) {
  throw new Error("GUIDE_LIVE2_GATE_STATIC_VALUE_MISMATCH");
}
const gateBytes=Buffer.from(`${JSON.stringify(gate,null,2)}\n`);
await writeFile(outputPath,gateBytes,{ mode:0o600,flag:"wx" });
process.stdout.write(`${JSON.stringify({
  outputPath,templateSha256:sha256(templateBytes),capacityPath,capacitySha256,
  gateSha256:sha256(gateBytes),addedKeys:["runtimeCapacityPath","runtimeCapacitySha256"]
},null,2)}\n`);
