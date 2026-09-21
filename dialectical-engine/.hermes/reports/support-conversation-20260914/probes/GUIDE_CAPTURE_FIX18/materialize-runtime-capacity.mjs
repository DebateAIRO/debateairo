import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import pg from "pg";
import { readGuideRuntimeCapacity } from "../GUIDE_HARNESS_BIND17/runtime-capacity.mjs";

const { Client }=pg;
const finalCommit=process.argv[2];
const outputPath=process.argv[3];
if (!/^[a-f0-9]{40}$/u.test(finalCommit ?? "") || typeof outputPath !== "string" || !outputPath.startsWith("/")) {
  throw new Error("GUIDE_CAPTURE_FIX18_CAPACITY_ARGUMENT_INVALID");
}
const capacity=await readGuideRuntimeCapacity({
  finalCommit,
  readSupportedStatus:async () => JSON.parse(execFileSync("/usr/bin/curl",["--silent","--show-error","--fail","https://localhost:3100/api/v1/support/status"],{ encoding:"utf8",maxBuffer:1_000_000 })),
  readCountsOnly:async (sql,parameters) => {
    const client=new Client({ connectionString:"postgresql://debateai:debateai-dev-only@127.0.0.1:55433/debateai",
      application_name:"guide_capture_fix18_counts_only",connectionTimeoutMillis:5000,statement_timeout:5000,query_timeout:5000 });
    await client.connect();
    try {
      const result=await client.query(sql,parameters);
      if (result.rows.length !== 1) throw new Error("GUIDE_CAPTURE_FIX18_COUNTS_ONLY_ROW_INVALID");
      return result.rows[0];
    } finally { await client.end(); }
  }
});
await writeFile(outputPath,`${JSON.stringify(capacity,null,2)}\n`,{ flag:"wx",mode:0o600 });
process.stdout.write(`${JSON.stringify({ outputPath,measuredAtUtc:capacity.measuredAtUtc,finalCommit:capacity.finalCommit })}\n`);
