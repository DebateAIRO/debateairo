import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const manifestPath = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence/GATE_FEEDBACK-manifest.json";
const productRoot = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-security/dialectical-engine";
const manifest = JSON.parse(readFileSync(manifestPath,"utf8"));
function inspect(path,expected) {
  const bytes = readFileSync(path);
  const actual = { sha256:createHash("sha256").update(bytes).digest("hex"),bytes:bytes.length };
  return { path,expected:{ sha256:expected.sha256,bytes:expected.bytes },actual,
    match:actual.sha256 === expected.sha256 && actual.bytes === expected.bytes };
}
const immutable = manifest.immutableInputs.map((entry) => inspect(entry.path,entry));
const product = manifest.productFiles.map((entry) => inspect(`${productRoot}/${entry.laneRelative}`,entry));
const output = { revision:manifest.revision,
  immutable:{ count:immutable.length,mismatches:immutable.filter(({ match }) => !match) },
  product:{ count:product.length,mismatches:product.filter(({ match }) => !match) } };
process.stdout.write(`${JSON.stringify(output,null,2)}\n`);
if (output.immutable.mismatches.length || output.product.mismatches.length) process.exitCode = 1;
