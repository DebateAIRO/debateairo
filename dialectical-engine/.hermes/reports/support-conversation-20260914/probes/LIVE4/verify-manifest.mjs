import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const root = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const revision = "6e5ab5fc41acebbff4264efc7d481df3db8dce44";
const manifest = JSON.parse(await readFile(`${root}/evidence/LIVE4-manifest.json`,"utf8"));
assert.equal(manifest.revision,revision);
for (const [path,expected] of Object.entries(manifest.immutable_sha256)) {
  const actual = createHash("sha256").update(await readFile(`${root}/${path}`)).digest("hex");
  assert.equal(actual,expected,path);
}
const suite = JSON.parse(await readFile(`${root}/evidence/LIVE4-required-suites.json`,"utf8"));
assert.equal(suite.revision,revision);
assert.equal(suite.count,21);
assert.equal(new Set(suite.files).size,21);
assert.deepEqual(suite.argv.slice(4),suite.files);
const receipt = JSON.parse(await readFile(`${root}/evidence/LIVE4-actual-relay-receipt.json`,"utf8"));
assert.equal(receipt.revision,revision);
assert.equal(receipt.completed,true);
assert.equal(receipt.prompts.length,7);
assert.equal(receipt.prompts.filter(({ grounded_success }) => grounded_success).length,6);
assert.equal(receipt.prompts.filter(({ api }) => api.outcome === "REFUSE_SAFETY").length,1);
assert.equal(receipt.prompts.every((item) => item.api_dom_text_equal
  && item.api_dom_source_labels_equal && item.api_dom_actions_equal),true);
const attributed = receipt.prompts.filter(({ diagnostic }) => diagnostic.status === "ATTRIBUTED");
assert.equal(attributed.length,1);
assert.equal(attributed[0].sequence,1);
assert.equal(attributed[0].diagnostic.record.code,"SUPPORT_DRAFT_TEXT_INTERNAL_IDENTIFIER");
assert.equal(attributed[0].diagnostic.record.predicate,"NARRATIVE_INTERNAL_IDENTIFIER");
assert.match(attributed[0].diagnostic.record.attemptId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
assert.equal(receipt.prompts.filter(({ diagnostic }) => diagnostic.status === "NO_REJECTION_EVENT").length,6);
assert.equal(receipt.prompts.filter(({ diagnostic }) => diagnostic.status === "AMBIGUOUS").length,0);
assert.equal(receipt.diagnostic_projection.kind,"RETROSPECTIVE_STRICT_SEVEN");
assert.equal(receipt.diagnostic_projection.new_support_requests,0);
assert.equal(receipt.diagnostic_projection.attribution_strengthened,false);
assert.deepEqual(Object.keys(attributed[0].diagnostic.record),[
  "attemptId","code","predicate","hasSources","hasActions","sourceCount","actionCount"
]);
assert.deepEqual(attributed[0].diagnostic.record,{
  attemptId:"9c5d6775-e091-440f-a41f-5bfa58cf6bee",
  code:"SUPPORT_DRAFT_TEXT_INTERNAL_IDENTIFIER",predicate:"NARRATIVE_INTERNAL_IDENTIFIER",
  hasSources:true,hasActions:true,sourceCount:3,actionCount:1
});
for (const forbiddenKey of ["jsonValid","fenced","exactKeys","kindValid","textCodePoints",
  "sourceIdCount","allowedSourceIdCount","actionIdCount","allowedActionIdCount"]) {
  assert.equal(JSON.stringify(attributed[0].diagnostic.record).includes(forbiddenKey),false);
}
const diagnosticReceipt = JSON.parse(await readFile(`${root}/evidence/LIVE4-diagnostic-projection-receipt.json`,"utf8"));
assert.equal(diagnosticReceipt.kind,"RETROSPECTIVE_STRICT_SEVEN");
assert.equal(diagnosticReceipt.new_support_requests,0);
assert.equal(diagnosticReceipt.attribution_strengthened,false);
assert.deepEqual(diagnosticReceipt.producer_keys,[
  "attemptId","code","predicate","hasSources","hasActions","sourceCount","actionCount"
]);
const superseded = JSON.parse(await readFile(`${root}/evidence/LIVE4-superseded-map.json`,"utf8"));
assert.equal(superseded.conforming,false);
for (const [path,expected] of Object.entries(superseded.preserved)) {
  const actual = createHash("sha256").update(await readFile(`${root}/${path}`)).digest("hex");
  assert.equal(actual,expected,`superseded ${path}`);
}
for (const item of receipt.prompts.filter(({ grounded_success }) => grounded_success)) {
  for (const id of [...item.api.sources,...item.api.actions].map(({ id }) => id)) {
    assert.equal(item.api.text.includes(id),false,`narrative contains selected id ${id}`);
  }
}
const report = await readFile(`${root}/agent-reports/LIVE4.md`,"utf8");
assert.ok(report.includes("treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better."));
process.stdout.write(`verified_hashes=${Object.keys(manifest.immutable_sha256).length} strict_producer_keys=7 superseded_hashes=${Object.keys(superseded.preserved).length} suite_members=21 actual_requests=7 grounded=6 refused=1 attributed=1 no_event=6 ambiguous=0 new_support_requests=0\n`);
