import { execFileSync,spawnSync } from "node:child_process";
import { readFile,writeFile } from "node:fs/promises";
import { readFinalContract } from "./phase-contract.mjs";

const contract=await readFinalContract(process.argv[2]);
const ready=JSON.parse(await readFile(contract.phases.readiness.output,"utf8"));
const run=(file,args,options={})=>execFileSync(file,args,{ encoding:"utf8",...options }).trim();
const ps=run("/bin/ps",["-o","pid=,ppid=,pgid=,command=","-p",String(ready.pid)]);
const curl=spawnSync("/usr/bin/curl",["--silent","--show-error","--output","/dev/null","--write-out","%{http_code}",`${contract.baseUrl}/help`],{ encoding:"utf8" });
const status=Number(curl.stdout);
if (!ps.includes("pnpm dev:auth:up") || curl.status !== 0 || status !== 200) throw new Error("GUIDE_CAPTURE_IDLE_CUSTODY_INVALID");
const result={ schemaVersion:1,phase:"IDLE",revision:contract.revision,pid:ready.pid,ordinarySystemTls:{ status,customCa:false,insecure:false } };
await writeFile(contract.phases.idle.output,`${JSON.stringify(result,null,2)}\n`,{ flag:"wx",mode:0o600 });
process.stdout.write(`${JSON.stringify(result)}\n`);
