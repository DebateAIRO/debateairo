import { createHash } from "node:crypto";
import { readFile,writeFile } from "node:fs/promises";
import { basename,dirname,isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import {
  REVIEWED_HARNESS_SHA256,loadReviewedHarness
} from "../GUIDE_ROW_PROOF_BIND21/reviewed-harness-custody.mjs";
import { validateExactGuide58Identity } from "./exact58-contract.mjs";

const EXPECTED_MATRIX_SHA256="9238764acd4067a2c922ff3026187e29d424001994f8dda307ba6bf5847cfa2c";
const EXPECTED_VERIFIER_SHA256="ec3b11f7103402c1bf31bf4c09cc34f75216c8cfa5d2b117c81bce2345de85d6";
const EVIDENCE_ROOT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence";
const HARNESS_DIRECTORY=fileURLToPath(new URL("../GUIDE_HARNESS_BIND21/",import.meta.url));
const MATRIX_URL=new URL("../GUIDE_HARNESS_BIND21/matrix.mjs",import.meta.url);
const VERIFIER_URL=new URL("../GUIDE_HARNESS_BIND21/pre-request-verifier.ts",import.meta.url);
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
      requiredSourceIds:Object.freeze([...(row.requiredSourceIds ?? [])]),
      allowedSourceIds:Object.freeze([...(row.allowedSourceIds ?? [])]),
      recoverySourceIds:Object.freeze([...(row.recoverySourceIds ?? [])]),
      actionPolicy:row.actionPolicy,
      requiredActionId:row.requiredActionId ?? row.navigation?.actionId ?? null,
      recoveryClass:row.recoveryClass
    }),
    derived:Object.freeze({
      branch:proof.branch,
      sourceIds:Object.freeze([...(proof.sourceIds ?? [])]),
      sourcePolicy:proof.sourcePolicy ?? null,
      recoverySourceIds:Object.freeze([...(proof.recoverySourceIds ?? [])]),
      requestedActionIds:Object.freeze([...(proof.requestedActionIds ?? [])]),
      allowedActionIds:Object.freeze([...(proof.allowedActions ?? [])].map(({ id }) => id)),
      recoveryClass:proof.recoveryClass ?? null,
      fallbackSha256:proof.fallbackSha256 ?? null
    })
  });
}

const { gatePath,expectedRevision,outputPath }=exactArgs();
const gateBytes=await readFile(gatePath);
let gate;
try { gate=JSON.parse(gateBytes.toString("utf8")); }
catch { fail("GUIDE_ROW_PROOF_GATE_JSON_INVALID"); }
if (gate.finalCommit !== expectedRevision) fail("GUIDE_ROW_PROOF_REVISION_MISMATCH");

// No FIX9 module is imported until all eight reviewed executable files have
// produced the independently reviewed digest.
const reviewed=await loadReviewedHarness(HARNESS_DIRECTORY,async () => {
  const [matrix,verifier]=await Promise.all([import(MATRIX_URL.href),import(VERIFIER_URL.href)]);
  return Object.freeze({ matrix,verifier });
});
const { GUIDE_CANONICAL_MATRIX,GUIDE_MATRIX,GUIDE_OWNER_ROWS,validateGuideMatrix }=reviewed.loaded.matrix;
const { createGuidePreRequestVerifier }=reviewed.loaded.verifier;
const matrixFile=reviewed.files.find(({ path }) => path === "matrix.mjs");
const verifierFile=reviewed.files.find(({ path }) => path === "pre-request-verifier.ts");
if (reviewed.harnessSha256 !== REVIEWED_HARNESS_SHA256
  || matrixFile?.sha256 !== EXPECTED_MATRIX_SHA256
  || verifierFile?.sha256 !== EXPECTED_VERIFIER_SHA256) {
  fail("GUIDE_ROW_PROOF_SEALED_SOURCE_MISMATCH");
}
validateGuideMatrix(GUIDE_MATRIX);
validateExactGuide58Identity(GUIDE_MATRIX,GUIDE_CANONICAL_MATRIX,GUIDE_OWNER_ROWS);

const custody=Object.freeze({
  targetRevision:expectedRevision,
  matrixSha256:matrixFile.sha256,
  matrixCount:GUIDE_MATRIX.length,
  verifierSha256:verifierFile.sha256,
  harnessSha256:reviewed.harnessSha256,
  harnessFiles:reviewed.files,
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
  if (verifier.controlProof?.harnessSha256 !== reviewed.harnessSha256
    || verifier.controlProof.harnessSha256 !== REVIEWED_HARNESS_SHA256) {
    fail("GUIDE_ROW_PROOF_CONSTRUCTOR_HARNESS_MISMATCH");
  }
  const rows=GUIDE_MATRIX.map(row => publicProof(row,verifier.prepare(row)));
  if (rows.length !== 58 || rows.some(({ result,code }) =>
    result !== "PASS" || code !== "GUIDE_ROW_PROOF_PASS")) {
    fail("GUIDE_ROW_PROOF_RESULT_INVALID");
  }
  result={
    schemaVersion:1,
    node:"GUIDE_HARNESS_FIX25",
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
    node:"GUIDE_HARNESS_FIX25",
    verdict:"FAIL",
    resultCode:failureCode,
    traffic:Object.freeze({ browser:false,sessions:0,supportRequests:0,modelRequests:0 }),
    custody,
    rows:[],
    limitation:"The sealed constructor stops at its first failing proof and exposes per-row prepare(row) only after all 58 proofs derive."
  };
  failure=error;
}
await writeFile(outputPath,`${JSON.stringify(result,null,2)}\n`,{ flag:"wx",mode:0o600 });
if (failure !== undefined) throw failure;
