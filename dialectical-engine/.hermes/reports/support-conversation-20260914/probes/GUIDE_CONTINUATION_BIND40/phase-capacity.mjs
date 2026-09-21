import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import pg from "pg";
import { readFinalContract } from "./phase-contract.mjs";
import { readGuideRuntimeCapacity } from "./runtime-capacity.mjs";

const { Client }=pg;
const contract=await readFinalContract(process.argv[2]);
const connectionString=process.env.GUIDE_COUNTS_ONLY_DATABASE_URL;
if (typeof connectionString !== "string" || !connectionString.startsWith("postgresql://")) {
  throw new Error("GUIDE_CAPTURE_COUNTS_ONLY_CUSTODY_MISSING");
}
const capacity=await readGuideRuntimeCapacity({
  finalCommit:contract.revision,
  readSupportedStatus:async()=>JSON.parse(execFileSync("/usr/bin/curl",["--silent","--show-error","--fail",`${contract.baseUrl}/api/v1/support/status`],{ encoding:"utf8",maxBuffer:1_000_000 })),
  readCountsOnly:async(sql,parameters)=>{
    const client=new Client({ connectionString,application_name:"guide_live32_counts_only",connectionTimeoutMillis:5000,statement_timeout:5000,query_timeout:5000 });
    await client.connect();
    try { const result=await client.query(sql,parameters); if (result.rows.length !== 1) throw new Error("GUIDE_CAPTURE_COUNTS_ONLY_ROW_INVALID"); return result.rows[0]; }
    finally { await client.end(); }
  }
});
if (capacity.kbVersion !== contract.kbVersion) throw new Error("GUIDE_CAPTURE_RUNTIME_KB_VERSION_MISMATCH");
await writeFile(contract.phases.capacity.output,`${JSON.stringify(capacity,null,2)}\n`,{ flag:"wx",mode:0o600 });
process.stdout.write(`${JSON.stringify({ measuredAtUtc:capacity.measuredAtUtc,finalCommit:capacity.finalCommit,kbVersion:capacity.kbVersion,limits:capacity.limits,observed:capacity.observed })}\n`);
