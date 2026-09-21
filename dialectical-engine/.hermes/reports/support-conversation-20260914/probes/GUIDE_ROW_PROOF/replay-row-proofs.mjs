import { createHash } from "node:crypto";
import { readFile,writeFile } from "node:fs/promises";
import { basename,dirname,isAbsolute } from "node:path";
import { GUIDE_MATRIX,validateGuideMatrix } from "../GUIDE_HARNESS_FIX2/matrix.mjs";
import { createGuidePreRequestVerifier } from "../GUIDE_HARNESS_FIX2/pre-request-verifier.ts";

const EXPECTED_MATRIX_SHA256="cea34112498143dcf8b1a571e40e5a24d207b5b47ee9b142048506cc773ca1ae";
const EXPECTED_VERIFIER_SHA256="a123d265d2070d9ef5929dd30bb752b826412e42b5091c68e4806b276b37a402";
const EXPECTED_HARNESS_SHA256="f8f2935965cd59b893ab02848cd9db17eeb71fa423f5620b61479e6647ae4917";
const EVIDENCE_ROOT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence";
const MATRIX_PATH=new URL("../GUIDE_HARNESS_FIX2/matrix.mjs",import.meta.url);
const VERIFIER_PATH=new URL("../GUIDE_HARNESS_FIX2/pre-request-verifier.ts",import.meta.url);
const COMMIT=/^[0-9a-f]{40}$/u;
const FIXED_CODE=/^GUIDE_[A-Z0-9_]+$/u;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function fail(code) {
  throw new Error(code);
}

function exactArgs() {
  const [gatePath,expectedRevision,outputPath,...extra]=process.argv.slice(2);
  if (extra.length !== 0 || !isAbsolute(gatePath ?? "") || !COMMIT.test(expectedRevision ?? "")
    || !isAbsolute(outputPath ?? "") || dirname(outputPath) !== EVIDENCE_ROOT
    || !/^GUIDE_ROW_PROOF-run-[A-Za-z0-9_-]+\.json$/u.test(basename(outputPath))) {
    fail("GUIDE_ROW_PROOF_ARGUMENTS_INVALID");
  }
  return Object.freeze({ gatePath,expectedRevision,outputPath });
}

function publicProof(row,proof) {
  return Object.freeze({
    sequence:row.sequence,
    family:row.family,
    kind:row.kind,
    mode:row.mode,
    language:row.language,
    result:"PASS",
    code:"GUIDE_ROW_PROOF_PASS",
    expected:Object.freeze({
      branch:row.branch,
      sourceIds:Object.freeze([...row.expectedSourceIds]),
      actionPolicy:row.actionPolicy,
      requiredActionId:row.navigation?.actionId ?? null,
      recoveryClass:row.recoveryClass
    }),
    derived:Object.freeze({
      branch:proof.branch,
      sourceIds:Object.freeze([...(proof.sourceIds ?? [])]),
      requestedActionIds:Object.freeze([...(proof.requestedActionIds ?? [])]),
      allowedActionIds:Object.freeze([...(proof.allowedActions ?? [])].map(({ id }) => id)),
      recoveryClass:proof.recoveryClass ?? null,
      fallbackSha256:proof.fallbackSha256 ?? null
    })
  });
}

const { gatePath,expectedRevision,outputPath }=exactArgs();
const [gateBytes,matrixBytes,verifierBytes]=await Promise.all([
  readFile(gatePath),readFile(MATRIX_PATH),readFile(VERIFIER_PATH)
]);
if (sha256(matrixBytes) !== EXPECTED_MATRIX_SHA256
  || sha256(verifierBytes) !== EXPECTED_VERIFIER_SHA256) {
  fail("GUIDE_ROW_PROOF_SEALED_SOURCE_MISMATCH");
}
validateGuideMatrix(GUIDE_MATRIX);
if (GUIDE_MATRIX.length !== 54) fail("GUIDE_ROW_PROOF_MATRIX_COUNT_MISMATCH");
let gate;
try { gate=JSON.parse(gateBytes.toString("utf8")); }
catch { fail("GUIDE_ROW_PROOF_GATE_JSON_INVALID"); }
if (gate.finalCommit !== expectedRevision) fail("GUIDE_ROW_PROOF_REVISION_MISMATCH");

const custody=Object.freeze({
  targetRevision:expectedRevision,
  matrixSha256:EXPECTED_MATRIX_SHA256,
  matrixCount:GUIDE_MATRIX.length,
  verifierSha256:EXPECTED_VERIFIER_SHA256,
  harnessSha256:EXPECTED_HARNESS_SHA256,
  gatePath,
  gateSha256:sha256(gateBytes),
  productRoot:gate.productRoot,
  productInventoryPath:gate.productInventoryPath,
  productInventorySha256:gate.productInventorySha256,
  attestationPath:gate.attestationPath,
  attestationSha256:gate.attestationSha256,
  requiredSuiteReceiptPath:gate.requiredSuiteReceiptPath,
  requiredSuiteReceiptSha256:gate.requiredSuiteReceiptSha256,
  controlProofPath:gate.controlProofPath,
  controlProofSha256:gate.controlProofSha256,
  runtimeCapacityPath:gate.runtimeCapacityPath,
  runtimeCapacitySha256:gate.runtimeCapacitySha256
});

let result;
let failure;
try {
  const verifier=await createGuidePreRequestVerifier(gate);
  const rows=GUIDE_MATRIX.map(row => publicProof(row,verifier.prepare(row)));
  if (rows.length !== 54 || rows.some(({ result,code }) =>
    result !== "PASS" || code !== "GUIDE_ROW_PROOF_PASS")) {
    fail("GUIDE_ROW_PROOF_RESULT_INVALID");
  }
  result={
    schemaVersion:1,
    node:"GUIDE_ROW_PROOF",
    verdict:"PASS",
    resultCode:"GUIDE_ROW_PROOF_ALL_ROWS_PASS",
    traffic:Object.freeze({ browser:false,sessions:0,supportRequests:0,modelRequests:0 }),
    custody,
    kbVersion:verifier.kbVersion,
    entryCount:verifier.entryCount,
    modelRows:verifier.modelRows,
    rows
  };
} catch (error) {
  const failureCode=FIXED_CODE.test(error?.message ?? "")
    ? error.message : "GUIDE_ROW_PROOF_UNCLASSIFIED_FAILURE";
  result={
    schemaVersion:1,
    node:"GUIDE_ROW_PROOF",
    verdict:"FAIL",
    resultCode:failureCode,
    traffic:Object.freeze({ browser:false,sessions:0,supportRequests:0,modelRequests:0 }),
    custody,
    rows:[],
    limitation:"The sealed constructor stops at its first failing proof and exposes per-row prepare(row) only after all 54 proofs derive."
  };
  failure=error;
}
await writeFile(outputPath,`${JSON.stringify(result,null,2)}\n`,{ flag:"wx",mode:0o600 });
if (failure !== undefined) throw failure;
