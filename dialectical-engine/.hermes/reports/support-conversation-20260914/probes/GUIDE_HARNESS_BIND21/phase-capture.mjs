import { closeSync,openSync } from "node:fs";
import { spawn } from "node:child_process";
import { readFile,writeFile } from "node:fs/promises";
import { requireAbsoluteCommand,readFinalContract } from "./phase-contract.mjs";

const contract=await readFinalContract(process.argv[2]);
const phase=requireAbsoluteCommand(contract.phases.capture);
if (!Array.isArray(phase.childArgv) || phase.childArgv.length !== 5
  || !phase.childArgv.every(value=>typeof value === "string")
  || !phase.childArgv[0].startsWith("/") || phase.childArgv[1] !== "--import"
  || phase.childArgv[2] !== "tsx" || !phase.childArgv[3].startsWith("/")) {
  throw new Error("GUIDE_CAPTURE_CHILD_ARGV_INVALID");
}
const fd=openSync(phase.log,"wx",0o600);
const child=spawn(phase.childArgv[0],phase.childArgv.slice(1),{ cwd:contract.cwd,stdio:["ignore",fd,fd] });
const progress=setInterval(async()=>{ try { const receipt=JSON.parse(await readFile(contract.actualReceipt,"utf8")); process.stdout.write(`${JSON.stringify({ attemptedRowCount:receipt.attemptedRowCount,completedRowCount:receipt.completedRowCount,failure:receipt.failure ?? null })}\n`); } catch {} },60_000);
const status=await new Promise((resolve,reject)=>{ child.once("error",reject); child.once("exit",code=>resolve(code ?? 1)); });
clearInterval(progress); closeSync(fd);
await writeFile(phase.output,`${JSON.stringify({ schemaVersion:1,phase:"CAPTURE",revision:contract.revision,status },null,2)}\n`,{ flag:"wx",mode:0o600 });
process.exitCode=status;
