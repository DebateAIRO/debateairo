import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { computeReviewedHarnessCustody } from "../GUIDE_ROW_PROOF_BIND16/reviewed-harness-custody.mjs";

const root="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine";
const evidence=`${root}/.hermes/reports/support-conversation-20260914/evidence`;
const product=`${root}/.worktrees/support-conversation-cp1/dialectical-engine`;
const harness=`${root}/.hermes/reports/support-conversation-20260914/probes/GUIDE_HARNESS_BIND16`;
const revision="152eed4da1cd3e66b74d8301159ba76427552409";
const sha256=bytes => createHash("sha256").update(bytes).digest("hex");
const templateBytes=await readFile(`${evidence}/GUIDE_LIVE8-gate-template.json`);
assert.equal(sha256(templateBytes),"54c2a6adf12bad3df6995170cf7ffa053c0e9a24650ce0dd67bb0897cf501df7");
const template=JSON.parse(templateBytes);
assert.equal(Object.keys(template).length,16);
assert.equal(template.finalCommit,revision);
for (const [pathKey,shaKey] of [
  ["productInventoryPath","productInventorySha256"],["attestationPath","attestationSha256"],
  ["requiredSuiteReceiptPath","requiredSuiteReceiptSha256"],["controlProofPath","controlProofSha256"]
]) assert.equal(sha256(await readFile(template[pathKey])),template[shaKey]);
const proof=JSON.parse(await readFile(template.controlProofPath));
assert.equal(proof.revision,revision);
assert.equal(proof.controls,136);
assert.equal(proof.passed,136);
const custody=await computeReviewedHarnessCustody(harness);
assert.equal(custody.harnessSha256,proof.harnessSha256);
assert.equal(custody.harnessSha256,"fa91eede37beb7ac5f51366a9d4c7e89d62dc72c1033810d868bd5d2bf0c354c");
process.stdout.write(`${JSON.stringify({
  revision,templateSha256:sha256(templateBytes),templateKeys:Object.keys(template).length,
  controls:proof.controls,harnessSha256:custody.harnessSha256,productRoot:product
},null,2)}\n`);
