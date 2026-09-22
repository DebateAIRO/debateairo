import { createHash } from "node:crypto";
import { execFileSync,spawnSync } from "node:child_process";
import { readFile,writeFile } from "node:fs/promises";
import { readFinalContract } from "../GUIDE_HARNESS_BIND21/phase-contract.mjs";

const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");
const contract=await readFinalContract(process.argv[2]);
const [custodyBytes,custodyContractBytes,validatorBytes]=await Promise.all([
  readFile(contract.runtimeCustodyPath),readFile(contract.runtimeCustodyContractPath),
  readFile(contract.processIdentityValidator.path)
]);
if (sha256(custodyContractBytes) !== contract.runtimeCustodyContractSha256
  || sha256(validatorBytes) !== contract.processIdentityValidator.sha256
  || validatorBytes.byteLength !== contract.processIdentityValidator.bytes) {
  throw new Error("GUIDE_CAPTURE_RUNTIME_CUSTODY_CONTRACT_HASH_INVALID");
}
const { assertOwnedProcessRow }=await import(`data:text/javascript;base64,${validatorBytes.toString("base64")}`);
let custody,custodyContract;
try { custody=JSON.parse(custodyBytes); custodyContract=JSON.parse(custodyContractBytes); }
catch { throw new Error("GUIDE_CAPTURE_RUNTIME_CUSTODY_INVALID"); }
const exactKeys=custodyContract?.exactKeys;
const required=custodyContract?.required;
if (custody === null || typeof custody !== "object" || Array.isArray(custody)
  || !Array.isArray(exactKeys) || exactKeys.length !== 11 || new Set(exactKeys).size !== exactKeys.length
  || custodyContract?.schemaVersion !== 1 || required === null || typeof required !== "object" || Array.isArray(required)
  || Object.keys(custody).length !== exactKeys.length || !exactKeys.every(key=>Object.hasOwn(custody,key))
  || Object.entries(required).some(([key,value])=>JSON.stringify(custody[key]) !== JSON.stringify(value))
  || custody.revision !== contract.revision
  || !Number.isSafeInteger(custody.pid) || custody.pid < 1
  || !Number.isSafeInteger(custody.pgid) || custody.pgid !== custody.pid
  || custody.runtimeLogPath !== contract.runtimeLogPath
  || !Number.isFinite(Date.parse(custody.startedAtUtc))) {
  throw new Error("GUIDE_CAPTURE_RUNTIME_CUSTODY_INVALID");
}
const run=(file,args,options={})=>execFileSync(file,args,{ encoding:"utf8",...options }).trim();
const head=run("/usr/bin/git",["rev-parse","HEAD"],{ cwd:contract.cwd });
const clean=run("/usr/bin/git",["status","--porcelain=v1"],{ cwd:contract.cwd }) === "";
const ps=run("/bin/ps",["-o","pid=,ppid=,pgid=,command=","-p",String(custody.pid)]);
assertOwnedProcessRow(ps,{ pid:custody.pid,pgid:custody.pgid,commandMarker:custody.commandMarker });
const curl=spawnSync("/usr/bin/curl",["--silent","--show-error","--output","/dev/null","--write-out","%{http_code}",`${contract.baseUrl}/help`],{ encoding:"utf8" });
const tlsStatus=Number(curl.stdout);
if (head !== contract.revision || !clean || curl.status !== 0 || tlsStatus !== 200) {
  throw new Error("GUIDE_CAPTURE_READINESS_INVALID");
}
const result={ schemaVersion:1,phase:"READINESS",revision:contract.revision,pid:custody.pid,pgid:custody.pgid,runtimeLogPath:custody.runtimeLogPath,ordinarySystemTls:{ url:`${contract.baseUrl}/help`,customCa:false,insecure:false,status:tlsStatus } };
await writeFile(contract.phases.readiness.output,`${JSON.stringify(result,null,2)}\n`,{ flag:"wx",mode:0o600 });
process.stdout.write(`${JSON.stringify(result)}\n`);
