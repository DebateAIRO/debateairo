import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertGuideObservation,assertGuideSourceBoundUsefulness } from "./controls.mjs";
import { GUIDE_MATRIX } from "./matrix.mjs";

const directory=fileURLToPath(new URL("./",import.meta.url));
const evidence=resolve(directory,"../../evidence");
const publicEvidence=JSON.parse(await readFile(resolve(evidence,"GUIDE_LIVE8-failed-row-public-evidence.json"),"utf8"));
const rowProof=JSON.parse(await readFile(resolve(evidence,"GUIDE_ROW_PROOF-run-LIVE8.json"),"utf8"));
const row=GUIDE_MATRIX.find(candidate => candidate.sequence === 26);
const derived=rowProof.rows.find(candidate => candidate.sequence === 26).derived;
const proof={
  branch:derived.branch,sourceIds:derived.sourceIds,sourcePolicy:derived.sourcePolicy,
  recoverySourceIds:derived.recoverySourceIds,requestedActionIds:derived.requestedActionIds,
  allowedActions:[],fallbackSha256:derived.fallbackSha256,review:null
};
assert.equal(assertGuideObservation({
  row,proof,api:publicEvidence.api,visible:publicEvidence.visible,diagnostic:publicEvidence.diagnostic
}).responseOrigin,"MODEL_ACCEPTED_DRAFT");
for (const [language,text] of [
  ["en","In this open debate, How it works explains the argument tree and evidence."],
  ["ro","În dezbaterea deschisă, Cum funcționează explică arborele argumentelor și dovezile."]
]) {
  for (const primarySourceId of ["guide-how-it-works","debate-workspace-menus"]) {
    assert.equal(assertGuideSourceBoundUsefulness({
      questionClass:"LOCAL_HOW_IT_WORKS",language,text,primarySourceId
    }),true);
  }
  assert.throws(() => assertGuideSourceBoundUsefulness({
    questionClass:"LOCAL_HOW_IT_WORKS",language,text,primarySourceId:"app-navigation"
  }),/GUIDE_HARNESS_LOCAL_GUIDE_SOURCE_INVALID/u);
}
assert.throws(() => assertGuideSourceBoundUsefulness({
  questionClass:"BROAD_GUIDE",language:"en",text:"This is a public guide answer.",
  primarySourceId:"app-navigation"
}),/GUIDE_HARNESS_GUIDE_ANSWER_UNHELPFUL/u);
process.stdout.write(`${JSON.stringify({
  schemaVersion:1,result:"PASS",controls:8,passed:8,
  names:[
    "retained Romanian public answer accepted by corrected shared verifier",
    "API and DOM text equality preserved",
    "API and DOM source equality preserved",
    "API and DOM action equality preserved",
    "English named local control accepts Guide authority",
    "Romanian named local control accepts workspace authority",
    "named local control rejects app-navigation alone",
    "generic broad answer remains rejected"
  ],traffic:{ browser:false,runtime:false,http:false,supportRequests:0,modelRequests:0 }
})}\n`);
