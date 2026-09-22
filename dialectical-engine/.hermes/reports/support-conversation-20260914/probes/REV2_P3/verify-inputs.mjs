import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const adminRoot = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine";
const productRoot = `${adminRoot}/.worktrees/support-cp1-p3-security/dialectical-engine`;
const evidenceRoot = `${adminRoot}/.hermes/reports/support-conversation-20260914`;
const expectedRevision = "5cbfc6d483aae0f56eabfdee00a6829e09e76c3d";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJson = (path) => JSON.parse(readFileSync(path,"utf8"));

function verifyRows(rows,pathFor) {
  const mismatches = [];
  let bytesRead = 0;
  for (const row of rows) {
    const path = pathFor(row);
    try {
      const bytes = readFileSync(path);
      bytesRead += bytes.length;
      const actual = sha256(bytes);
      if (actual !== row.sha256 || (row.bytes !== undefined && bytes.length !== row.bytes)) {
        mismatches.push({ path,expectedSha256:row.sha256,actualSha256:actual,
          expectedBytes:row.bytes ?? null,actualBytes:bytes.length });
      }
    } catch (error) {
      mismatches.push({ path,error:error instanceof Error ? error.message : String(error) });
    }
  }
  return Object.freeze({ count:rows.length,bytesRead,mismatches });
}

const indexPath = `${evidenceRoot}/review-packages/CP1-p3/REV2-inputs.json`;
const gatePath = `${evidenceRoot}/evidence/GATE_P3-manifest.json`;
const productManifestPath = `${evidenceRoot}/evidence/GATE_P3-final-product-manifest.json`;
const index = readJson(indexPath);
const gate = readJson(gatePath);
const product = readJson(productManifestPath);

const indexResult = verifyRows(index.inputs,(row) => row.path);
const gateResult = verifyRows(gate.immutableInputs,(row) => row.path);
const productResult = verifyRows(product.productFiles,(row) => `${productRoot}/${row.laneRelative}`);
const patchResult = verifyRows(product.patches,(row) => row.path);
const summary = Object.freeze({
  revision:expectedRevision,
  indexRevision:index.revision,
  gateRevision:gate.revision,
  productManifestRevision:product.revision,
  indexInputs:indexResult,
  gateImmutableInputs:gateResult,
  productFiles:productResult,
  patches:patchResult,
  expectedProductPathCount:108,
  allMatch:index.revision === expectedRevision && gate.revision === expectedRevision
    && product.revision === expectedRevision && product.productPathCount === 108
    && [indexResult,gateResult,productResult,patchResult].every((result) => result.mismatches.length === 0)
});
process.stdout.write(`${JSON.stringify(summary,null,2)}\n`);
if (!summary.allMatch) process.exitCode = 1;
