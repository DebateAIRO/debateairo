import { createHash } from "node:crypto";
import { readFile,stat,writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const REQUIRED_PHASES=Object.freeze(["preflight","readiness","capacity","gate","rowProof","capture","idle"]);
const SHA256=/^[a-f0-9]{64}$/u;
const COMMIT=/^[a-f0-9]{40}$/u;
const absolute=value => typeof value === "string" && value.startsWith("/") && resolve(value) === value;
const exactKeys=(value,keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const sha256=bytes => createHash("sha256").update(bytes).digest("hex");

export async function validateGuideOperatorCommandContract(value) {
  if (!exactKeys(value,["schemaVersion","baseRevision","finalRevision","actualNamespace","helpers"])
    || value.schemaVersion !== 1 || value.baseRevision !== "152eed4da1cd3e66b74d8301159ba76427552409"
    || !COMMIT.test(value.finalRevision) || !/^[A-Z0-9_]+$/u.test(value.actualNamespace)
    || !Array.isArray(value.helpers) || value.helpers.length !== REQUIRED_PHASES.length) {
    throw new Error("GUIDE_CAPTURE_FIX18_COMMAND_CONTRACT_INVALID");
  }
  const seen=new Set(); const destinations=new Set();
  for (const helper of value.helpers) {
    if (!exactKeys(helper,["phase","script","cwd","argv","argumentTypes","output","log"])
      || !REQUIRED_PHASES.includes(helper.phase) || seen.has(helper.phase)
      || !exactKeys(helper.script,["path","sha256","bytes"])
      || !absolute(helper.script.path) || !SHA256.test(helper.script.sha256)
      || !Number.isSafeInteger(helper.script.bytes) || helper.script.bytes < 1
      || !absolute(helper.cwd) || !Array.isArray(helper.argv) || helper.argv.length < 2
      || helper.argv.some(argument => typeof argument !== "string")
      || helper.argv[0] !== process.execPath || !helper.argv.includes(helper.script.path)
      || !Array.isArray(helper.argumentTypes) || helper.argumentTypes.length !== helper.argv.length
      || helper.argumentTypes.some(type => type !== "string") || !absolute(helper.output) || !absolute(helper.log)
      || destinations.has(helper.output) || destinations.has(helper.log)) {
      throw new Error("GUIDE_CAPTURE_FIX18_HELPER_CONTRACT_INVALID");
    }
    const bytes=await readFile(helper.script.path);
    if (bytes.length !== helper.script.bytes || sha256(bytes) !== helper.script.sha256) {
      throw new Error("GUIDE_CAPTURE_FIX18_HELPER_CUSTODY_INVALID");
    }
    if (!(await stat(helper.cwd)).isDirectory()) throw new Error("GUIDE_CAPTURE_FIX18_HELPER_CWD_INVALID");
    seen.add(helper.phase); destinations.add(helper.output); destinations.add(helper.log);
  }
  if (REQUIRED_PHASES.some(phase => !seen.has(phase))) throw new Error("GUIDE_CAPTURE_FIX18_HELPER_PHASE_MISSING");
  return Object.freeze(structuredClone(value));
}

export async function generateGuideOperatorCommandContract(bindingPath,outputPath) {
  if (!absolute(bindingPath) || !absolute(outputPath)) throw new Error("GUIDE_CAPTURE_FIX18_COMMAND_PATH_INVALID");
  const contract=await validateGuideOperatorCommandContract(JSON.parse(await readFile(bindingPath,"utf8")));
  await writeFile(outputPath,`${JSON.stringify(contract,null,2)}\n`,{ flag:"wx",mode:0o600 });
  return contract;
}

export async function executeGuideBoundHelper(contract,phase,spawn) {
  const validated=await validateGuideOperatorCommandContract(contract);
  const helper=validated.helpers.find(candidate => candidate.phase === phase);
  if (helper === undefined) throw new Error("GUIDE_CAPTURE_FIX18_HELPER_PHASE_MISSING");
  return spawn(helper.argv[0],helper.argv.slice(1),{ cwd:helper.cwd,output:helper.output,log:helper.log });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await generateGuideOperatorCommandContract(process.argv[2],process.argv[3]);
}
