import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const REVIEWED_HARNESS_SHA256="fa91eede37beb7ac5f51366a9d4c7e89d62dc72c1033810d868bd5d2bf0c354c";
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
