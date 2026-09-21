import assert from "node:assert/strict";
import { access,readFile,writeFile } from "node:fs/promises";
import { closeSync,openSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { requireAbsoluteCommand,readFinalContract } from "../GUIDE_HARNESS_BIND21/phase-contract.mjs";
import { validateGuideUiPreflightResult } from "../GUIDE_HARNESS_BIND21/preflight-ui-contract.mjs";

const path=process.argv[2];
const contract=await readFinalContract(path);
const ui=contract.phases.preflight.ui;
assert.deepEqual(Object.keys(contract.phases),["preflight","readiness","capacity","gate","rowProof","capture","idle"]);
for (const phase of Object.values(contract.phases)) requireAbsoluteCommand(phase);
const forbidden=[...Object.values(contract.phases).flatMap(phase=>[phase.output,phase.log]),ui.output,ui.log,
  contract.actualReceipt,contract.browserProfile,contract.ownerCapacity.output,
  ...contract.actualSequences.flatMap(sequence=>{
    const stem=`${contract.evidenceRoot}/GUIDE_LIVE_GUIDE21-row-${String(sequence).padStart(2,"0")}`;
    return [`${stem}-complete-expanded.png`,`${stem}-original-pane-top.png`,`${stem}-original-pane-footer.png`];
  })];
const present=[];
for (const item of forbidden) { try { await access(item); present.push(item); } catch (error) { if (error?.code !== "ENOENT") throw error; } }
assert.deepEqual(present,[]);
assert.deepEqual(Object.keys(ui),["script","sha256","bytes","argv","output","log"]);
const uiBytes=await readFile(ui.script);
assert.equal(createHash("sha256").update(uiBytes).digest("hex"),ui.sha256);
assert.equal(uiBytes.byteLength,ui.bytes);
assert.deepEqual(ui.argv,["/Users/vladmihaimiron/.local/bin/node",ui.script,contract.revision,ui.output]);
const fd=openSync(ui.log,"wx",0o600);
const child=spawnSync(ui.argv[0],ui.argv.slice(1),{ cwd:contract.cwd,stdio:["ignore",fd,fd] });
closeSync(fd);
if (child.status !== 0) throw new Error("GUIDE_CAPTURE_UI_PREFLIGHT_FAILED");
const uiResult=JSON.parse(await readFile(ui.output,"utf8"));
validateGuideUiPreflightResult(uiResult,contract.revision);
const bytes=await readFile(path);
const result={ schemaVersion:1,phase:"PRETRAFFIC",revision:contract.revision,contractSha256:createHash("sha256").update(bytes).digest("hex"),checkedAbsent:forbidden.length,present,ui:{ verdict:uiResult.verdict,transitions:uiResult.transitions.length,actualSupportRequestsForwarded:0 } };
await writeFile(contract.phases.preflight.output,`${JSON.stringify(result,null,2)}\n`,{ flag:"wx",mode:0o600 });
process.stdout.write(`${JSON.stringify(result)}\n`);
