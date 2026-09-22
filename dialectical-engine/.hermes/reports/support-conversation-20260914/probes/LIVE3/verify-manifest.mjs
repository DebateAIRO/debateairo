import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const reportRoot = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const manifest = JSON.parse(await readFile(`${reportRoot}/evidence/LIVE3-manifest.json`,"utf8"));
assert.equal(manifest.revision,"43cf9386ea3c9e7c79523ec38debe63271d19292");
for (const [path,expected] of Object.entries(manifest.immutable_sha256)) {
  const actual = createHash("sha256").update(await readFile(`${reportRoot}/${path}`)).digest("hex");
  assert.equal(actual,expected,path);
}
const suite = JSON.parse(await readFile(`${reportRoot}/evidence/LIVE3-required-suites.json`,"utf8"));
assert.equal(suite.revision,manifest.revision);
assert.equal(suite.count,20);
assert.equal(new Set(suite.files).size,20);
assert.deepEqual(suite.argv.slice(4),suite.files);
const actual = JSON.parse(await readFile(`${reportRoot}/evidence/LIVE3-actual-relay-receipt.json`,"utf8"));
assert.equal(actual.revision,manifest.revision);
assert.equal(actual.completed,true);
assert.equal(actual.prompts.length,7);
assert.equal(actual.prompts.filter((item) => item.grounded_success).length,4);
assert.equal(actual.prompts.filter((item) => item.api.outcome === "REFUSE_SAFETY").length,3);
assert.equal(actual.prompts.every((item) => item.api_dom_text_equal && item.api_dom_source_labels_equal && item.api_dom_actions_equal),true);
assert.match(actual.prompts[6].api.text,/\bstart-debate\b/u);
const report = await readFile(`${reportRoot}/agent-reports/LIVE3.md`,"utf8");
assert.ok(report.includes("treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better."));
process.stdout.write(`verified_hashes=${Object.keys(manifest.immutable_sha256).length} suite_members=20 actual_requests=7 grounded=4 refused=3 internal_identifier_observed=true\n`);
