import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const path = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence/PLAN_P2-inventory.json";
const inventory = JSON.parse(readFileSync(path, "utf8"));
const blueprint = readFileSync(
  "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/support-conversation-20260914/reviews/PLAN_P2-BLUEPRINT.md",
  "utf8",
);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

assert.equal(inventory.productRevision, "e0dcfe77f49655bea774bdfacf988b911be4ff06");
assert.equal(inventory.corpusMembers.length, 36);
assert.equal(new Set(inventory.corpusMembers.map(({ logicalKey }) => logicalKey)).size, 36);
assert.equal(new Set(inventory.corpusMembers.map(({ id }) => id)).size, 18);
assert.equal(inventory.corpusMembers.filter(({ language }) => language === "en").length, 18);
assert.equal(inventory.corpusMembers.filter(({ language }) => language === "ro").length, 18);
for (const entry of inventory.corpusMembers) {
  assert.equal(sha256(readFileSync(entry.sourceOriginAbsolute)), entry.articleSha256);
}

const fix = inventory.writeOwnership.FIX_P2.productPaths.map(({ laneRelative }) => laneRelative);
const attest = inventory.writeOwnership.ATTEST_P2.productPaths.map(({ laneRelative }) => laneRelative);
assert.equal(fix.length, 21);
assert.equal(attest.length, 2);
assert.equal(new Set(fix).size, fix.length);
assert.equal(new Set(attest).size, attest.length);
assert.deepEqual(fix.filter((item) => attest.includes(item)), []);

const retained = inventory.tests.retainedFromLIVE_P1.map(({ laneRelative }) => laneRelative);
const added = inventory.tests.new.map(({ laneRelative }) => laneRelative);
const union = inventory.tests.finalIntegratedUnion.map(({ laneRelative }) => laneRelative);
assert.equal(retained.length, 23);
assert.equal(added.length, 2);
assert.equal(union.length, 25);
assert.equal(new Set(union).size, 25);
assert.deepEqual(union, [...retained, ...added]);
assert.match(blueprint, /including invalid JSON, exact-key-set, kind, schema, text, source, and action failures/u);
assert.match(blueprint, /LIVE_P2 owns the one final current-byte execution/u);
assert.match(blueprint, /ATTEST_P2 then runs the final affected interface\/focused checks and one attributed typecheck/u);

process.stdout.write(`${JSON.stringify({
  status: "PASS",
  productRevision: inventory.productRevision,
  corpusEntries: 36,
  logicalIds: 18,
  english: 18,
  romanian: 18,
  articleDigestsVerified: 36,
  fixP2ProductPaths: 21,
  attestP2ProductPaths: 2,
  retainedTests: 23,
  newTests: 2,
  finalIntegratedTests: 25,
  ownershipOverlap: 0,
}, null, 2)}\n`);
