import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import pg from "pg";
import { readGuideRuntimeCapacity } from "../GUIDE_HARNESS_FIX9/runtime-capacity.mjs";

const { Client }=pg;
const finalCommit="0b9320eae5a0ad8c9fcc9648ed85ebef1b289c13";
const outputPath="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence/GUIDE_LIVE5-runtime-capacity.json";
const capacity=await readGuideRuntimeCapacity({
  finalCommit,
  readSupportedStatus:async () => JSON.parse(execFileSync("/usr/bin/curl",[
    "--silent","--show-error","--fail","https://localhost:3100/api/v1/support/status"
  ],{ encoding:"utf8",maxBuffer:1_000_000 })),
  readCountsOnly:async (sql,parameters) => {
    const client=new Client({
      connectionString:"postgresql://debateai:debateai-dev-only@127.0.0.1:55433/debateai",
      application_name:"guide_live5_counts_only",connectionTimeoutMillis:5000,
      statement_timeout:5000,query_timeout:5000
    });
    await client.connect();
    try {
      const result=await client.query(sql,parameters);
      if (result.rows.length !== 1) throw new Error("GUIDE_LIVE5_COUNTS_ONLY_ROW_INVALID");
      return result.rows[0];
    } finally { await client.end(); }
  }
});
await writeFile(outputPath,`${JSON.stringify(capacity,null,2)}\n`,{ mode:0o600,flag:"wx" });
process.stdout.write(`${JSON.stringify({
  outputPath,measuredAtUtc:capacity.measuredAtUtc,finalCommit:capacity.finalCommit,
  kbVersion:capacity.kbVersion,supportEnabled:capacity.supportEnabled,
  supportModelRef:capacity.supportModelRef,limits:capacity.limits,observed:capacity.observed
},null,2)}\n`);
