import { createHash } from "node:crypto";
import { execFileSync,spawnSync } from "node:child_process";
import { readFile,writeFile } from "node:fs/promises";
import { readFinalContract } from "../GUIDE_HARNESS_BIND21/phase-contract.mjs";

const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");
const contract=await readFinalContract(process.argv[2]);
const [readyBytes,validatorBytes]=await Promise.all([
  readFile(contract.phases.readiness.output),readFile(contract.processIdentityValidator.path)
]);
if (sha256(validatorBytes) !== contract.processIdentityValidator.sha256
  || validatorBytes.byteLength !== contract.processIdentityValidator.bytes) {
  throw new Error("GUIDE_CAPTURE_PROCESS_IDENTITY_VALIDATOR_INVALID");
}
const { assertOwnedProcessRow }=await import(`data:text/javascript;base64,${validatorBytes.toString("base64")}`);
let ready;
try { ready=JSON.parse(readyBytes); }
catch { throw new Error("GUIDE_CAPTURE_IDLE_CUSTODY_INVALID"); }
if (ready === null || typeof ready !== "object" || Array.isArray(ready)
  || ready.phase !== "READINESS" || ready.revision !== contract.revision
  || !Number.isSafeInteger(ready.pid) || ready.pid < 1
  || !Number.isSafeInteger(ready.pgid) || ready.pgid !== ready.pid
  || ready.runtimeLogPath !== contract.runtimeLogPath) {
  throw new Error("GUIDE_CAPTURE_IDLE_CUSTODY_INVALID");
}
const run=(file,args,options={})=>execFileSync(file,args,{ encoding:"utf8",...options }).trim();
const ps=run("/bin/ps",["-o","pid=,ppid=,pgid=,command=","-p",String(ready.pid)]);
assertOwnedProcessRow(ps,{ pid:ready.pid,pgid:ready.pgid,commandMarker:contract.runtimeCommandMarker });
const curl=spawnSync("/usr/bin/curl",["--silent","--show-error","--output","/dev/null","--write-out","%{http_code}",`${contract.baseUrl}/help`],{ encoding:"utf8" });
const status=Number(curl.stdout);
if (curl.status !== 0 || status !== 200) throw new Error("GUIDE_CAPTURE_IDLE_CUSTODY_INVALID");
const result={ schemaVersion:1,phase:"IDLE",revision:contract.revision,pid:ready.pid,ordinarySystemTls:{ status,customCa:false,insecure:false } };
await writeFile(contract.phases.idle.output,`${JSON.stringify(result,null,2)}\n`,{ flag:"wx",mode:0o600 });
process.stdout.write(`${JSON.stringify(result)}\n`);
