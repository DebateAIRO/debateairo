import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile,writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { deriveGuideRowProof } from "../GUIDE_HARNESS_BIND21/pre-request-verifier.ts";
import {
  GUIDE_ACTUAL_PLAN,GUIDE_ACTUAL_SEQUENCES,GUIDE_MATRIX,GUIDE_OWNER_ROWS,
  validateGuideActualPlan,validateGuideMatrix
} from "../GUIDE_HARNESS_BIND21/matrix.mjs";

const PRODUCT_ROOT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const REPORT_ROOT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const EVIDENCE_ROOT=`${REPORT_ROOT}/evidence`;
const REVISION="456cafb9e56a737de550570b5736ec52d79ddf48";
const SNAPSHOT_REVISION="5d6e028ae5defc24e0690219d6128949e73b750d";
const KB_VERSION="7ef4244d30507e162cebf544eeb6b9578f17ed91711f2d164f2a4d75dd72c7af";
const outputPath=process.argv[2];
if (typeof outputPath !== "string" || !outputPath.startsWith(`${EVIDENCE_ROOT}/GUIDE_ROW_PROOF_BIND21-`)
  || !outputPath.endsWith(".json") || process.argv.length !== 3) {
  throw new Error("GUIDE_ROW_PROOF_BIND21_ARGUMENT_INVALID");
}
const sha256=bytes => createHash("sha256").update(bytes).digest("hex");
const run=(file,args,options={}) => execFileSync(file,args,{ encoding:"utf8",...options }).trim();
const readJson=async path => JSON.parse(await readFile(path,"utf8"));
const load=async relative => import(`${pathToFileURL(resolve(PRODUCT_ROOT,relative)).href}?guide-bind20=1`);

assert.equal(run("/usr/bin/git",["rev-parse","HEAD"],{ cwd:PRODUCT_ROOT }),REVISION);
assert.equal(run("/usr/bin/git",["status","--porcelain=v1"],{ cwd:PRODUCT_ROOT }),"");
const inventoryPath=`${EVIDENCE_ROOT}/GATE_GUIDE_FINAL13-manifest.json`;
const inventoryBytes=await readFile(inventoryPath);
const inventory=JSON.parse(inventoryBytes.toString("utf8"));
assert.equal(inventory.revision,REVISION);
assert.equal(inventory.productFiles.length,145);
for (const file of inventory.productFiles) {
  const bytes=await readFile(resolve(PRODUCT_ROOT,file.laneRelative));
  assert.equal(bytes.length,file.bytes,file.laneRelative);
  assert.equal(sha256(bytes),file.sha256,file.laneRelative);
}
const snapshotPath=`${EVIDENCE_ROOT}/GUIDE_QUALITY_FIX2-snapshot-receipt.json`;
const snapshotBytes=await readFile(snapshotPath);
const snapshot=JSON.parse(snapshotBytes.toString("utf8"));
assert.equal(snapshot.finalCommit,SNAPSHOT_REVISION);
assert.equal(snapshot.snapshot.kbVersion,KB_VERSION);
assert.equal(snapshot.snapshot.entryCount,44);
for (const [name,file] of Object.entries(snapshot.files)) {
  const bytes=await readFile(resolve(PRODUCT_ROOT,file.laneRelative));
  if (name !== "rankingSource") {
    assert.equal(bytes.length,file.bytes,file.laneRelative);
    assert.equal(sha256(bytes),file.sha256,file.laneRelative);
  } else {
    const current=inventory.productFiles.find(candidate => candidate.laneRelative === file.laneRelative);
    assert.ok(current,file.laneRelative);
    assert.equal(bytes.length,current.bytes,file.laneRelative);
    assert.equal(sha256(bytes),current.sha256,file.laneRelative);
  }
}

const [loader,catalog,context,navigation,session,boundary,classifier,recovery,responseEvidence]=await Promise.all([
  load("packages/support-kb/src/index.ts"),load("packages/support-kb/src/catalog.ts"),
  load("packages/support-kb/src/context.ts"),load("packages/support-kb/src/navigation.ts"),
  load("apps/api/src/support/session.ts"),load("apps/api/src/support/public-guide-boundary.ts"),
  load("apps/api/src/support/classify.ts"),load("apps/api/src/support/recovery-intent.ts"),
  import("../LIVE_P3/response-evidence.mjs")
]);
const deps=Object.freeze({
  loadHelpCorpus:loader.loadHelpCorpus,supportActionIds:catalog.SUPPORT_ACTION_IDS,
  supportCapabilities:catalog.SUPPORT_CAPABILITIES,supportSourcePolicies:catalog.SUPPORT_SOURCE_POLICIES,
  supportSourceIdsSatisfyPolicy:loader.supportSourceIdsSatisfyPolicy,
  selectSupportRecoveryEntry:loader.selectSupportRecoveryEntry,
  buildSupportKnowledgeContext:context.buildSupportKnowledgeContext,
  resolveSupportActions:navigation.resolveSupportActions,redactSupportMessage:session.redactSupportMessage,
  classifyPublicGuideBoundary:boundary.classifyPublicGuideBoundary,
  classifySupportMessage:classifier.classifySupportMessage,
  analyzeRecoverySemantics:recovery.analyzeRecoverySemantics,
  classifySupportResponseEvidence:responseEvidence.classifySupportResponseEvidence
});
const corpus=deps.loadHelpCorpus(resolve(PRODUCT_ROOT,"packages/support-kb/content"),{
  reviewManifest:JSON.parse(await readFile(resolve(PRODUCT_ROOT,snapshot.files.review.laneRelative),"utf8")),
  recoveryComponents:await readFile(resolve(PRODUCT_ROOT,snapshot.files.component.laneRelative)),
  requireReviewedRecovery:true
});
assert.equal(corpus.kbVersion,KB_VERSION);
assert.equal(corpus.entries.length,44);
validateGuideMatrix();
validateGuideActualPlan();

const proofs=[];
for (const row of GUIDE_MATRIX) {
  let proof;
  try { proof=deriveGuideRowProof(corpus,row,deps); }
  catch (error) {
    const code=typeof error?.message === "string" && /^GUIDE_[A-Z0-9_]+$/u.test(error.message)
      ? error.message : "GUIDE_ROW_PROOF_UNCLASSIFIED_FAILURE";
    throw new Error(`GUIDE_ROW_PROOF_BIND21_ROW_${row.sequence}_${code}`);
  }
  if (row.requiredActionId !== undefined && row.requiredActionId !== null
    && !proof.allowedActions?.some(action => action.id === row.requiredActionId)) {
    throw new Error("GUIDE_ROW_PROOF_BIND21_OWNER_ACTION_MISSING");
  }
  proofs.push(Object.freeze({
    sequence:row.sequence,kind:row.kind,family:row.family,mode:row.mode,language:row.language,
    branch:proof.branch,sourceIds:Object.freeze([...(proof.sourceIds ?? [])]),
    recoverySourceIds:Object.freeze([...(proof.recoverySourceIds ?? [])]),
    requestedActionIds:Object.freeze([...(proof.requestedActionIds ?? [])]),
    allowedActionIds:Object.freeze([...(proof.allowedActions ?? [])].map(action => action.id)),
    requiredActionId:row.requiredActionId ?? row.navigation?.actionId ?? null,
    recoveryClass:proof.recoveryClass ?? null,fallbackSha256:proof.fallbackSha256 ?? null,
    result:"PASS"
  }));
}
assert.equal(proofs.length,58);
assert.equal(proofs.every(proof => proof.result === "PASS"),true);
const actualProofs=GUIDE_ACTUAL_SEQUENCES.map(sequence => proofs.find(proof => proof.sequence === sequence));
assert.equal(actualProofs.length,31);
assert.equal(actualProofs.filter(proof => proof.branch === "MODEL").length,27);
assert.deepEqual(GUIDE_OWNER_ROWS.map(row => ({ sequence:row.sequence,source:row.expectedSourceIds[0],action:row.requiredActionId })),[
  { sequence:55,source:"product-identity",action:null },
  { sequence:56,source:"product-identity",action:null },
  { sequence:57,source:"account-access",action:"sign-in" },
  { sequence:58,source:"account-access",action:"sign-up" }
]);
const output={
  schemaVersion:1,node:"GUIDE_ROW_PROOF_BIND21",revision:REVISION,kbVersion:KB_VERSION,
  verdict:"PASS_OFFLINE58",traffic:{ browser:0,runtime:0,http:0,status:0,capacity:0,database:0,support:0,model:0 },
  custody:{
    productRoot:PRODUCT_ROOT,inventoryPath,inventorySha256:sha256(inventoryBytes),inventoryFiles:inventory.productFiles.length,
    snapshotPath,snapshotRevision:SNAPSHOT_REVISION,snapshotSha256:sha256(snapshotBytes),entryCount:corpus.entries.length
  },
  counts:{ canonicalRows:54,ownerRows:4,totalRows:58,actualRows:31,actualModelRows:27 },
  actualPlan:GUIDE_ACTUAL_PLAN,rows:proofs
};
await writeFile(outputPath,`${JSON.stringify(output,null,2)}\n`,{ flag:"wx",mode:0o600 });
process.stdout.write(`${JSON.stringify({ result:"PASS",rows:58,actualRows:31,actualModelRows:27,kbVersion:KB_VERSION })}\n`);
