import { closeSync,openSync } from "node:fs";
import { spawn } from "node:child_process";
import { readFile,writeFile } from "node:fs/promises";
import { requireAbsoluteCommand,readFinalContract } from "../GUIDE_HARNESS_BIND21/phase-contract.mjs";
import { validateGuideRowProofDependency } from "./proof-dependency.mjs";

const contract=await readFinalContract(process.argv[2]);
const phase=requireAbsoluteCommand(contract.phases.capture);
if (!Array.isArray(phase.childArgv) || phase.childArgv.length !== 5
  || !phase.childArgv.every(value=>typeof value === "string")
  || !phase.childArgv[0].startsWith("/") || phase.childArgv[1] !== "--import"
  || phase.childArgv[2] !== "tsx" || !phase.childArgv[3].startsWith("/")
  || phase.childArgv[4] !== contract.phases.gate.output) {
  throw new Error("GUIDE_CAPTURE_CHILD_ARGV_INVALID");
}

// This dependency is intentionally validated before opening the capture log,
// creating a browser profile, or spawning the unchanged capture child.
let statusBytes,resultBytes,gateBytes;
try {
  [statusBytes,resultBytes,gateBytes]=await Promise.all([
    readFile(contract.phases.rowProof.output),readFile(contract.phases.rowProof.result),
    readFile(contract.phases.gate.output)
  ]);
} catch {
  throw new Error("GUIDE_CAPTURE_ROW_PROOF_EVIDENCE_MISSING");
}
let rowProofStatus;
try { rowProofStatus=JSON.parse(statusBytes.toString("utf8")); }
catch { throw new Error("GUIDE_CAPTURE_ROW_PROOF_STATUS_INVALID"); }
const consumed=validateGuideRowProofDependency({
  status:rowProofStatus,resultBytes,gateBytes,expectedRevision:contract.revision,
  expectedKbVersion:contract.kbVersion,expectedGatePath:contract.phases.gate.output,
  expectedResultPath:contract.phases.rowProof.result
});

const fd=openSync(phase.log,"wx",0o600);
const child=spawn(phase.childArgv[0],phase.childArgv.slice(1),{ cwd:contract.cwd,stdio:["ignore",fd,fd] });
const progress=setInterval(async()=>{ try {
  const receipt=JSON.parse(await readFile(contract.actualReceipt,"utf8"));
  process.stdout.write(`${JSON.stringify({ attemptedRowCount:receipt.attemptedRowCount,
    completedRowCount:receipt.completedRowCount,failure:receipt.failure ?? null })}\n`);
} catch {} },60_000);
const status=await new Promise((resolve,reject)=>{
  child.once("error",reject); child.once("exit",code=>resolve(code ?? 1));
});
clearInterval(progress); closeSync(fd);
await writeFile(phase.output,`${JSON.stringify({
  schemaVersion:2,phase:"CAPTURE",revision:contract.revision,status,
  consumedRowProofPath:consumed.resultPath,consumedRowProofSha256:consumed.resultSha256,
  consumedGatePath:consumed.gatePath,consumedGateSha256:consumed.gateSha256,
  consumedRowCount:consumed.validatedRows
},null,2)}\n`,{ flag:"wx",mode:0o600 });
process.exitCode=status;
