import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertGuideObservation } from "../GUIDE_HARNESS_BIND16/controls.mjs";
import { GUIDE_MATRIX } from "../GUIDE_HARNESS_BIND16/matrix.mjs";

const directory=fileURLToPath(new URL("./",import.meta.url));
const evidence=resolve(directory,"../../evidence");
const publicEvidence=JSON.parse(await readFile(resolve(evidence,"GUIDE_LIVE8-failed-row-public-evidence.json"),"utf8"));
const rowProof=JSON.parse(await readFile(resolve(evidence,"GUIDE_ROW_PROOF-run-LIVE8.json"),"utf8"));
const row=GUIDE_MATRIX.find(candidate => candidate.sequence === 26);
const derived=rowProof.rows.find(candidate => candidate.sequence === 26).derived;
const proof={
  branch:derived.branch,sourceIds:derived.sourceIds,sourcePolicy:derived.sourcePolicy,
  recoverySourceIds:derived.recoverySourceIds,requestedActionIds:derived.requestedActionIds,
  allowedActions:[],fallbackSha256:derived.fallbackSha256,review:null
};
assert.throws(() => assertGuideObservation({
  row,proof,api:publicEvidence.api,visible:publicEvidence.visible,diagnostic:publicEvidence.diagnostic
}),/GUIDE_HARNESS_EXPECTED_PRIMARY_SOURCE_MISSING/u);
process.stdout.write(`${JSON.stringify({
  schemaVersion:1,result:"EXPECTED_RED",sequence:26,
  oldOracleRejected:"app-navigation",code:"GUIDE_HARNESS_EXPECTED_PRIMARY_SOURCE_MISSING",
  traffic:{ browser:false,runtime:false,http:false,supportRequests:0,modelRequests:0 }
})}\n`);
