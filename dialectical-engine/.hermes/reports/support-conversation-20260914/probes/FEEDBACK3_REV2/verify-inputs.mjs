import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const manifestPath = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence/GATE_FEEDBACK3-manifest.json";
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
const reviewedPaths = [
  "packages/support-kb/content",
  "packages/support-kb/recovery",
  "packages/support-kb/reviews/manifest.json",
  "packages/support-kb/src/catalog.ts",
  "packages/support-kb/src/index.ts"
];
const reviewedDiff = spawnSync("git",[
  "diff","--exit-code",
  "9e87fe5859b44fbd62dd485e03045e5bcde96bed..479763da1f586a217f36204cc81138aaa81c6f81",
  "--",...reviewedPaths
],{ cwd:productRoot,encoding:"utf8" });
const output = { revision:manifest.revision,
  immutable:{ count:immutable.length,mismatches:immutable.filter(({ match }) => !match) },
  product:{ count:product.length,mismatches:product.filter(({ match }) => !match) },
  reviewedBytesUnchanged:{ status:reviewedDiff.status,paths:reviewedPaths,
    output:`${reviewedDiff.stdout}${reviewedDiff.stderr}` } };
process.stdout.write(`${JSON.stringify(output,null,2)}\n`);
if (output.immutable.mismatches.length || output.product.mismatches.length
  || output.reviewedBytesUnchanged.status !== 0) process.exitCode = 1;
