import { execFileSync,spawnSync } from "node:child_process";
import { readFile,writeFile } from "node:fs/promises";
import { readFinalContract } from "./phase-contract.mjs";

const contract=await readFinalContract(process.argv[2]);
const custody=JSON.parse(await readFile(contract.runtimeCustodyPath,"utf8"));
const run=(file,args,options={})=>execFileSync(file,args,{ encoding:"utf8",...options }).trim();
const head=run("/usr/bin/git",["rev-parse","HEAD"],{ cwd:contract.cwd });
const clean=run("/usr/bin/git",["status","--porcelain=v1"],{ cwd:contract.cwd }) === "";
const ps=run("/bin/ps",["-o","pid=,ppid=,pgid=,command=","-p",String(custody.pid)]);
const curl=spawnSync("/usr/bin/curl",["--silent","--show-error","--output","/dev/null","--write-out","%{http_code}",`${contract.baseUrl}/help`],{ encoding:"utf8" });
const tlsStatus=Number(curl.stdout);
if (head !== contract.revision || !clean || !ps.includes("pnpm dev:auth:up") || curl.status !== 0 || tlsStatus !== 200) {
  throw new Error("GUIDE_CAPTURE_READINESS_INVALID");
}
const result={ schemaVersion:1,phase:"READINESS",revision:contract.revision,pid:custody.pid,ordinarySystemTls:{ url:`${contract.baseUrl}/help`,customCa:false,insecure:false,status:tlsStatus } };
await writeFile(contract.phases.readiness.output,`${JSON.stringify(result,null,2)}\n`,{ flag:"wx",mode:0o600 });
process.stdout.write(`${JSON.stringify(result)}\n`);
