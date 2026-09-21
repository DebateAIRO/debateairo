import { closeSync,openSync } from "node:fs";
import { readFile,writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const contract=JSON.parse(await readFile("/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence/GUIDE_LIVE9-command-contract.json","utf8"));
const fd=openSync(contract.capture.log,"wx",0o600);
const child=spawn(contract.capture.argv[0],contract.capture.argv.slice(1),{ cwd:contract.cwd,stdio:["ignore",fd,fd] });
const progress=setInterval(async () => {
  try {
    const receipt=JSON.parse(await readFile(contract.capture.output,"utf8"));
    process.stdout.write(`${JSON.stringify({ progress:true,observedAt:new Date().toISOString(),attemptedRowCount:receipt.attemptedRowCount,completedRowCount:receipt.completedRowCount,failure:receipt.failure ?? null })}\n`);
  } catch (error) {
    if (error?.code !== "ENOENT") process.stdout.write(`${JSON.stringify({ progress:true,observedAt:new Date().toISOString(),state:"RECEIPT_UNREADABLE" })}\n`);
  }
},60_000);
const status=await new Promise((resolve,reject) => { child.once("error",reject); child.once("exit",code => resolve(code ?? 1)); });
clearInterval(progress); closeSync(fd);
const output={ schemaVersion:1,node:"GUIDE_LIVE9",phase:"CAPTURE",observedAt:new Date().toISOString(),status,output:contract.capture.output,log:contract.capture.log };
await writeFile("/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence/GUIDE_LIVE9-capture-status.json",`${JSON.stringify(output,null,2)}\n`,{ flag:"wx",mode:0o600 });
process.stdout.write(`${JSON.stringify(output)}\n`);
process.exitCode=status;
