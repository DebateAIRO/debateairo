import { createHash } from "node:crypto";
import { readFile,writeFile } from "node:fs/promises";
import { readFinalContract } from "./phase-contract.mjs";
import { validateGuideGateInput } from "./controls.mjs";

const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");
const contract=await readFinalContract(process.argv[2]);
const templateBytes=await readFile(contract.gateTemplatePath);
if (sha256(templateBytes) !== contract.gateTemplateSha256) throw new Error("GUIDE_CAPTURE_GATE_TEMPLATE_HASH_MISMATCH");
const template=JSON.parse(templateBytes);
if (Object.keys(template).length !== 16 || Object.hasOwn(template,"runtimeCapacityPath") || Object.hasOwn(template,"runtimeCapacitySha256")) throw new Error("GUIDE_CAPTURE_GATE_TEMPLATE_INVALID");
const capacityBytes=await readFile(contract.phases.capacity.output);
const gate=validateGuideGateInput({ ...template,runtimeCapacityPath:contract.phases.capacity.output,runtimeCapacitySha256:sha256(capacityBytes) });
const bytes=Buffer.from(`${JSON.stringify(gate,null,2)}\n`);
await writeFile(contract.phases.gate.output,bytes,{ flag:"wx",mode:0o600 });
process.stdout.write(`${JSON.stringify({ output:contract.phases.gate.output,gateSha256:sha256(bytes),staticKeys:16,finalKeys:18 })}\n`);
