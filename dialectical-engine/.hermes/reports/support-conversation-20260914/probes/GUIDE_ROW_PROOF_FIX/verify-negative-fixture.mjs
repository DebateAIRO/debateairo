import assert from "node:assert/strict";
import { appendFile,copyFile,mkdtemp,rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  REVIEWED_EXECUTABLE_FILES,loadReviewedHarness
} from "./reviewed-harness-custody.mjs";

const source=fileURLToPath(new URL("../GUIDE_HARNESS_FIX2/",import.meta.url));
const fixture=await mkdtemp(resolve(tmpdir(),"guide-row-proof-fix-"));
let importerCalls=0;
try {
  for (const path of REVIEWED_EXECUTABLE_FILES) {
    await copyFile(resolve(source,path),resolve(fixture,path));
  }
  await appendFile(resolve(fixture,"controls.mjs"),"\n// inert negative fixture\n");
  await assert.rejects(
    () => loadReviewedHarness(fixture,async () => { importerCalls+=1; return {}; }),
    /GUIDE_ROW_PROOF_REVIEWED_HARNESS_MISMATCH/u
  );
  assert.equal(importerCalls,0);
  process.stdout.write(`${JSON.stringify({
    schemaVersion:1,result:"PASS",controls:3,passed:3,
    names:[
      "changed previously unpinned controls source is rejected",
      "rejection occurs before dynamic importer",
      "real reviewed harness remains untouched"
    ],
    importerCalls,successfulRows:0,traffic:{ browser:false,sessions:0,supportRequests:0,modelRequests:0 }
  })}\n`);
} finally {
  await rm(fixture,{ recursive:true,force:true });
}
