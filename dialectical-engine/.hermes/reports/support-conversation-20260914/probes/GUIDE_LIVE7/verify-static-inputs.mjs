import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile,writeFile } from "node:fs/promises";

const root="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const productRoot="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const revision="152eed4da1cd3e66b74d8301159ba76427552409";
const indexed=JSON.parse(await readFile(`${root}/evidence/GUIDE_LIVE7-inputs.json`,"utf8"));
assert.equal(indexed.revision,revision);
const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");
const mismatches=[];
for(const input of indexed.inputs){const bytes=await readFile(input.path);if(bytes.length!==input.bytes||sha256(bytes)!==input.sha256)mismatches.push(input.path);}
const head=execFileSync("git",["-C",productRoot,"rev-parse","HEAD"],{encoding:"utf8"}).trim();
const status=execFileSync("git",["-C",productRoot,"status","--porcelain=v1"],{encoding:"utf8"});
if(head!==revision||status!==""||mismatches.length!==0)throw new Error("GUIDE_LIVE7_STATIC_CUSTODY_INVALID");
const receipt={schemaVersion:1,observedAt:new Date().toISOString(),revision,indexedInputs:indexed.inputs.length,mismatches,productClean:true};
await writeFile(`${root}/evidence/GUIDE_LIVE7-static-custody.json`,`${JSON.stringify(receipt,null,2)}\n`,{mode:0o600,flag:"wx"});
process.stdout.write(`${JSON.stringify(receipt,null,2)}\n`);
