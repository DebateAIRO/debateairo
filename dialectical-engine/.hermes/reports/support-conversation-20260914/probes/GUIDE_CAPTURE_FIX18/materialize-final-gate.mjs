import { createHash } from "node:crypto";
import { readFile,writeFile } from "node:fs/promises";
import { validateGuideGateInput } from "../GUIDE_HARNESS_BIND17/controls.mjs";

const [templatePath,capacityPath,outputPath,expectedTemplateSha256]=process.argv.slice(2);
if (![templatePath,capacityPath,outputPath].every(path => typeof path === "string" && path.startsWith("/"))
  || !/^[a-f0-9]{64}$/u.test(expectedTemplateSha256 ?? "")) throw new Error("GUIDE_CAPTURE_FIX18_GATE_ARGUMENT_INVALID");
const sha256=bytes => createHash("sha256").update(bytes).digest("hex");
const templateBytes=await readFile(templatePath);
if (sha256(templateBytes) !== expectedTemplateSha256) throw new Error("GUIDE_CAPTURE_FIX18_GATE_TEMPLATE_HASH_MISMATCH");
const template=JSON.parse(templateBytes);
if (Object.keys(template).length !== 16 || Object.hasOwn(template,"runtimeCapacityPath") || Object.hasOwn(template,"runtimeCapacitySha256")) throw new Error("GUIDE_CAPTURE_FIX18_GATE_TEMPLATE_INVALID");
const capacityBytes=await readFile(capacityPath);
const gate=validateGuideGateInput({ ...template,runtimeCapacityPath:capacityPath,runtimeCapacitySha256:sha256(capacityBytes) });
if (Object.keys(gate).length !== 18 || !Object.keys(template).every(key => JSON.stringify(gate[key]) === JSON.stringify(template[key]))) throw new Error("GUIDE_CAPTURE_FIX18_GATE_STATIC_VALUE_MISMATCH");
await writeFile(outputPath,`${JSON.stringify(gate,null,2)}\n`,{ flag:"wx",mode:0o600 });
