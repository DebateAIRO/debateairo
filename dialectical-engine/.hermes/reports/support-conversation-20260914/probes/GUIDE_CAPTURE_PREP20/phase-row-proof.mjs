import { closeSync,openSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { requireAbsoluteCommand,readFinalContract } from "./phase-contract.mjs";

const contract=await readFinalContract(process.argv[2]);
const phase=requireAbsoluteCommand(contract.phases.rowProof);
if (!Array.isArray(phase.childArgv) || phase.childArgv.length !== 7
  || !phase.childArgv.every(value=>typeof value === "string")
  || !phase.childArgv[0].startsWith("/") || phase.childArgv[1] !== "--import"
  || phase.childArgv[2] !== "tsx" || !phase.childArgv[3].startsWith("/")) {
  throw new Error("GUIDE_CAPTURE_ROW_PROOF_CHILD_ARGV_INVALID");
}
const fd=openSync(phase.log,"wx",0o600); let child;
try { child=spawnSync(phase.childArgv[0],phase.childArgv.slice(1),{ cwd:contract.cwd,stdio:["ignore",fd,fd] }); } finally { closeSync(fd); }
const status=child.status ?? 1;
await writeFile(phase.output,`${JSON.stringify({ schemaVersion:1,phase:"ROW_PROOF",revision:contract.revision,status,signal:child.signal ?? null },null,2)}\n`,{ flag:"wx",mode:0o600 });
process.exitCode=status;
