import assert from "node:assert/strict";
import { access,readFile,writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { requireAbsoluteCommand,readFinalContract } from "./phase-contract.mjs";

const path=process.argv[2];
const contract=await readFinalContract(path);
assert.deepEqual(Object.keys(contract.phases),["preflight","readiness","capacity","gate","rowProof","capture","idle"]);
for (const phase of Object.values(contract.phases)) requireAbsoluteCommand(phase);
const forbidden=[...Object.values(contract.phases).flatMap(phase=>[phase.output,phase.log]),
  contract.actualReceipt,contract.browserProfile,
  ...contract.actualSequences.flatMap(sequence=>{
    const stem=`${contract.evidenceRoot}/GUIDE_LIVE_GUIDE18-row-${String(sequence).padStart(2,"0")}`;
    return [`${stem}-complete-expanded.png`,`${stem}-original-pane-top.png`,`${stem}-original-pane-footer.png`];
  })];
const present=[];
for (const item of forbidden) { try { await access(item); present.push(item); } catch (error) { if (error?.code !== "ENOENT") throw error; } }
assert.deepEqual(present,[]);
const bytes=await readFile(path);
const result={ schemaVersion:1,phase:"PRETRAFFIC",revision:contract.revision,contractSha256:createHash("sha256").update(bytes).digest("hex"),checkedAbsent:forbidden.length,present };
await writeFile(contract.phases.preflight.output,`${JSON.stringify(result,null,2)}\n`,{ flag:"wx",mode:0o600 });
process.stdout.write(`${JSON.stringify(result)}\n`);
