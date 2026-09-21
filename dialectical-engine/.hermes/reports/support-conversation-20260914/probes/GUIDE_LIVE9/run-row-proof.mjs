import { closeSync,openSync } from "node:fs";
import { readFile,writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const contract=JSON.parse(await readFile("/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence/GUIDE_LIVE9-command-contract.json","utf8"));
const fd=openSync(contract.rowProof.log,"wx",0o600);
let result;
try { result=spawnSync(contract.rowProof.argv[0],contract.rowProof.argv.slice(1),{ cwd:contract.cwd,stdio:["ignore",fd,fd] }); }
finally { closeSync(fd); }
const status=result.status ?? 1;
const output={ schemaVersion:1,node:"GUIDE_LIVE9",phase:"ROW_PROOF",observedAt:new Date().toISOString(),status,signal:result.signal ?? null,output:contract.rowProof.output,log:contract.rowProof.log };
await writeFile("/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence/GUIDE_LIVE9-row-proof-status.json",`${JSON.stringify(output,null,2)}\n`,{ flag:"wx",mode:0o600 });
process.stdout.write(`${JSON.stringify(output)}\n`);
process.exitCode=status;
