import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";

const root = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const revision = "e0dcfe77f49655bea774bdfacf988b911be4ff06";
const manifest = JSON.parse(await readFile(`${root}/evidence/LIVE_P1-manifest.json`, "utf8"));
assert.equal(manifest.revision, revision);
for (const [path, expected] of Object.entries(manifest.immutable_sha256)) {
  const actual = createHash("sha256").update(await readFile(`${root}/${path}`)).digest("hex");
  assert.equal(actual, expected, path);
}
assert.ok(!("logs/LIVE_P1-stack-detached.log" in manifest.immutable_sha256));

const suite = JSON.parse(await readFile(`${root}/evidence/LIVE_P1-required-suites.json`, "utf8"));
assert.equal(suite.revision, revision);
assert.equal(suite.count, 23);
assert.equal(new Set(suite.files).size, 23);
assert.deepEqual(suite.argv.slice(4), suite.files);
const suiteLog = await readFile(`${root}/logs/LIVE_P1-integrated-suite.log`, "utf8");
assert.match(suiteLog, /Test Files\s+23 passed \(23\)/u);
assert.match(suiteLog, /Tests\s+935 passed \| 1 todo \(936\)/u);
assert.match(suiteLog, /Duration\s+79\.78s/u);

const receipt = JSON.parse(await readFile(`${root}/evidence/LIVE_P1-actual-relay-receipt.json`, "utf8"));
assert.equal(receipt.revision, revision);
assert.equal(receipt.completed, true);
assert.equal(receipt.support_api, "actual");
assert.equal(receipt.synthetic_support_overrides, false);
assert.equal(receipt.prompts.length, 7);
assert.equal(receipt.prompts.filter(({ grounded_success }) => grounded_success).length, 3);
assert.equal(receipt.prompts.filter(({ api }) => api.outcome === "REFUSE_SAFETY").length, 4);
assert.equal(receipt.prompts.every((item) => item.api_dom_text_equal
  && item.api_dom_source_labels_equal && item.api_dom_actions_equal), true);
const attributed = receipt.prompts.filter(({ diagnostic }) => diagnostic.status === "ATTRIBUTED");
assert.equal(attributed.length, 4);
assert.deepEqual(attributed.map(({ sequence }) => sequence), [1, 2, 4, 5]);
assert.equal(receipt.prompts.filter(({ diagnostic }) => diagnostic.status === "NO_REJECTION_EVENT").length, 3);
assert.equal(receipt.prompts.filter(({ diagnostic }) => diagnostic.status === "AMBIGUOUS").length, 0);
const producerKeys = ["attemptId", "code", "predicate", "hasSources", "hasActions", "sourceCount", "actionCount"];
const expectedRecords = [
  ["39387e4e-956d-4dfd-936a-a8ce9ea0e2b7", "SUPPORT_DRAFT_TEXT_LINK_OR_MARKUP", "PATH_OR_ROUTE", true, true, 3, 1],
  ["437f3ffc-db05-4675-bc4e-0779b21b75b3", "SUPPORT_DRAFT_TEXT_LINK_OR_MARKUP", "PATH_OR_ROUTE", true, false, 2, 0],
  ["384ac2b8-f543-43b6-b12c-132eeca4bf2c", "SUPPORT_DRAFT_TEXT_LINK_OR_MARKUP", "PATH_OR_ROUTE", true, true, 3, 1],
  ["cc34b4f6-9199-4790-b630-9e0aebdf0ce1", "SUPPORT_DRAFT_TEXT_CREDENTIAL_OR_SECURITY_ACTION", "CREDENTIAL_OPERATION", true, false, 3, 0]
];
for (const [index, item] of attributed.entries()) {
  assert.deepEqual(Object.keys(item.diagnostic.record), producerKeys);
  assert.match(item.diagnostic.record.attemptId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
  assert.deepEqual(Object.values(item.diagnostic.record), expectedRecords[index]);
  assert.equal(item.diagnostic.candidateCount, 1);
  assert.equal(item.diagnostic.validCount, 1);
  assert.equal(item.diagnostic.invalidCount, 0);
  assert.equal(item.diagnostic.duplicateCount, 0);
  assert.equal(item.diagnostic.unmatchedCount, 0);
}
for (const item of receipt.prompts.filter(({ grounded_success }) => grounded_success)) {
  for (const id of [...item.api.sources, ...item.api.actions].map(({ id }) => id)) {
    assert.equal(item.api.text.includes(id), false, `narrative contains selected id ${id}`);
  }
}
assert.deepEqual(receipt.console_error_categories, {
  HTTP_401: 11, HTTP_404: 0, JS_OR_HYDRATION: 0, OTHER: 0
});
assert.equal(receipt.navigations[0].performed, false);
assert.equal(receipt.navigations[0].reason, "NO_RENDERED_ACTION");
assert.equal(receipt.navigations[1].performed, true);
assert.equal(receipt.navigations[1].href, "/login?next=%2Fnew");
assert.equal(receipt.navigations[1].destination, "https://localhost:3100/login?next=%2Fnew");
for (const screenshot of receipt.screenshots) assert.ok((await stat(screenshot)).size > 0);

const stack = JSON.parse(await readFile(`${root}/evidence/LIVE_P1-stack-receipt.json`, "utf8"));
assert.equal(stack.revision, revision);
assert.equal(stack.final_launch.attempt, 1);
assert.equal(stack.final_launch.ready, true);
assert.equal(stack.final_launch.pid, 45639);
assert.equal(stack.final_launch.process_group, 45639);
assert.equal(stack.final_launch.parent_pid, 1);
assert.equal(stack.final_launch.loaded_revision, revision);
assert.equal(stack.final_launch.normal_tls_help_status, 200);
assert.equal(stack.final_launch.present_after_browser_exit_and_ten_second_idle, true);
assert.equal(stack.preview_left_active, true);
assert.equal(stack.tls_bypass_used, false);

const control = JSON.parse((await readFile(`${root}/logs/LIVE_P1-strict-seven-consumer-control-final.log`, "utf8")).trim());
assert.equal(control.controls, 12);
assert.equal(control.exactProducerKeys, 7);
assert.equal(Object.values(control).every((value) => value === true || value === 12 || value === 7), true);
const report = await readFile(`${root}/agent-reports/LIVE_P1.md`, "utf8");
assert.ok(report.includes("treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better."));
process.stdout.write(`verified_hashes=${Object.keys(manifest.immutable_sha256).length} suite_members=23 passed=935 todo=1 actual_requests=7 grounded=3 refused=4 attributed=4 no_event=3 ambiguous=0 producer_keys=7\n`);
