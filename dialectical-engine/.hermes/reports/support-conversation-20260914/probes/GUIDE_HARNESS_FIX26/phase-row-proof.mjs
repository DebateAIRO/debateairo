import { closeSync,openSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile,writeFile } from "node:fs/promises";
import { requireAbsoluteCommand,readFinalContract } from "../GUIDE_HARNESS_BIND21/phase-contract.mjs";
import { validateGuideGated58Result } from "./proof-dependency.mjs";

const sha256=bytes => createHash("sha256").update(bytes).digest("hex");
const contract=await readFinalContract(process.argv[2]);
const phase=requireAbsoluteCommand(contract.phases.rowProof);
if (!Array.isArray(phase.childArgv) || phase.childArgv.length !== 7
  || !phase.childArgv.every(value=>typeof value === "string")
  || !phase.childArgv[0].startsWith("/") || phase.childArgv[1] !== "--import"
  || phase.childArgv[2] !== "tsx" || !phase.childArgv[3].startsWith("/")
  || phase.childArgv[4] !== contract.phases.gate.output
  || phase.childArgv[5] !== contract.revision || phase.childArgv[6] !== phase.result) {
  throw new Error("GUIDE_CAPTURE_ROW_PROOF_CHILD_ARGV_INVALID");
}
const fd=openSync(phase.log,"wx",0o600); let child;
try { child=spawnSync(phase.childArgv[0],phase.childArgv.slice(1),{ cwd:contract.cwd,stdio:["ignore",fd,fd] }); }
finally { closeSync(fd); }
let status=child.status ?? 1;
let validation="NOT_RUN";
let resultSha256=null;
let gateSha256=null;
let validatedRows=0;
if (status === 0) {
  try {
    const [resultBytes,gateBytes]=await Promise.all([readFile(phase.result),readFile(contract.phases.gate.output)]);
    gateSha256=sha256(gateBytes);
    const validated=validateGuideGated58Result({
      resultBytes,expectedRevision:contract.revision,expectedKbVersion:contract.kbVersion,
      expectedGatePath:contract.phases.gate.output,expectedGateSha256:gateSha256
    });
    resultSha256=validated.resultSha256;
    validatedRows=validated.rowCount;
    validation="PASS";
  } catch (error) {
    status=1;
    validation=error instanceof Error && /^GUIDE_[A-Z0-9_]+$/u.test(error.message)
      ? error.message : "GUIDE_CAPTURE_ROW_PROOF_RESULT_INVALID";
  }
}
const result={ schemaVersion:2,phase:"ROW_PROOF",revision:contract.revision,status,
  signal:child.signal ?? null,completedAtUtc:new Date().toISOString(),resultPath:phase.result,
  resultSha256,gatePath:contract.phases.gate.output,gateSha256,validatedRows,validation };
await writeFile(phase.output,`${JSON.stringify(result,null,2)}\n`,{ flag:"wx",mode:0o600 });
process.exitCode=status;
