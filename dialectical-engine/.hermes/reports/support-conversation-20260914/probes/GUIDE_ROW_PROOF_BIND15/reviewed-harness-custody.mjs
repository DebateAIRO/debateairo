import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const REVIEWED_HARNESS_SHA256="b6162d665b60a1a35d882e41fa5b0da3259e9cb86bae32ca5d5056d320ad99d4";
export const REVIEWED_EXECUTABLE_FILES=Object.freeze([
  "capture-public-guide.mjs",
  "controls.mjs",
  "matrix.mjs",
  "pre-request-verifier.ts",
  "runtime-capacity.mjs",
  "session-lifecycle.mjs",
  "verify-final-branches.ts",
  "verify-guide-harness.mjs"
]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function computeReviewedHarnessCustody(directory) {
  const files=[];
  for (const path of REVIEWED_EXECUTABLE_FILES) {
    const bytes=await readFile(resolve(directory,path));
    files.push(Object.freeze({ path,bytes:bytes.byteLength,sha256:sha256(bytes) }));
  }
  const harnessSha256=sha256(JSON.stringify(files));
  return Object.freeze({ harnessSha256,files:Object.freeze(files) });
}

export async function loadReviewedHarness(directory,importer) {
  if (typeof importer !== "function") throw new Error("GUIDE_ROW_PROOF_IMPORTER_INVALID");
  const custody=await computeReviewedHarnessCustody(directory);
  if (custody.harnessSha256 !== REVIEWED_HARNESS_SHA256) {
    throw new Error("GUIDE_ROW_PROOF_REVIEWED_HARNESS_MISMATCH");
  }
  const loaded=await importer();
  return Object.freeze({ ...custody,loaded });
}
