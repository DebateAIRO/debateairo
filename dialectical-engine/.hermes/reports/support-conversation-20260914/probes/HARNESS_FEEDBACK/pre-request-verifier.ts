import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadHelpCorpus,type HelpCorpusEntry,type LoadedHelpCorpus } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/packages/support-kb/src/index.ts";
import { SUPPORT_ACTION_IDS,SUPPORT_CAPABILITIES,type SupportLanguage } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/packages/support-kb/src/catalog.ts";
import { buildSupportKnowledgeContext } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/packages/support-kb/src/context.ts";
import { resolveSupportActions } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/packages/support-kb/src/navigation.ts";
import { classifySupportMessage } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/apps/api/src/support/classify.ts";
import { redactSupportMessage } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/apps/api/src/support/session.ts";
import { classifySupportResponseEvidence } from "../LIVE_P3/response-evidence.mjs";
import { FEEDBACK_MATRIX,validateFeedbackMatrix } from "./matrix.mjs";
import { validateFinalGateInput } from "./controls.mjs";

const MAX_CONTEXT_CODE_POINTS = 24_000;
const SHA256 = /^[0-9a-f]{64}$/u;
const REQUIRED_ATTESTED_FILES = Object.freeze({
  component:"packages/support-kb/recovery/components.json",
  review:"packages/support-kb/reviews/manifest.json",
  catalogSource:"packages/support-kb/src/catalog.ts",
  loaderSource:"packages/support-kb/src/index.ts",
  rankingSource:"packages/support-kb/src/context.ts",
  productionApiSource:"apps/api/src/main.ts"
});

function sha256(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
function fail(code: string): never { throw new Error(code); }
function readBoundJson(path: string,expectedSha256: string): any {
  const bytes = readFileSync(path);
  if (sha256(bytes) !== expectedSha256) fail("HARNESS_FEEDBACK_BOUND_INPUT_HASH_MISMATCH");
  try { return JSON.parse(bytes.toString("utf8")); }
  catch { return fail("HARNESS_FEEDBACK_BOUND_INPUT_JSON_INVALID"); }
}
function structuredInstructionLength(language: SupportLanguage): number {
  const shape = '{"kind":"answer","text":"<grounded answer>","sourceIds":["<allowed source reference>"],"actionIds":[]}';
  const instruction = language === "ro"
    ? `Returnează numai un singur obiect JSON, fără alte chei și fără text înainte sau după: ${shape}. kind trebuie să fie answer. Secțiunea finală OUTPUT CONTRACT enumeră singurele sourceIds și actionIds permise; înlocuiește exemplele și copiază identificatorii exact, citând cel puțin un sourceId.`
    : `Return only one JSON object, with no other keys and no text before or after it: ${shape}. kind must be answer. The final OUTPUT CONTRACT lists the only allowed sourceIds and actionIds; replace the examples and copy identifiers exactly, citing at least one sourceId.`;
  return [...`${instruction}\n\n`].length;
}
function knowledge(corpus: LoadedHelpCorpus,row: typeof FEEDBACK_MATRIX[number]) {
  const availableActionIds = resolveSupportActions(SUPPORT_ACTION_IDS,{
    signedIn:false,language:row.language
  }).map(({ id }) => id);
  return buildSupportKnowledgeContext({
    entries:corpus.entries,capabilities:SUPPORT_CAPABILITIES,language:row.language,
    query:redactSupportMessage(row.prompt).text,historyText:"",availableActionIds,
    referenceFor:(kind,index) => `feedback-${kind}-${index}`,
    maxCodePoints:MAX_CONTEXT_CODE_POINTS-structuredInstructionLength(row.language)
  });
}
function reviewedEntry(corpus: LoadedHelpCorpus,id: string,language: SupportLanguage): HelpCorpusEntry {
  const entry = corpus.entries.find(candidate => candidate.id === id && candidate.lang === language);
  if (entry?.modelProjection === undefined || entry.fallback === undefined
    || entry.recoveryReview === undefined) fail("HARNESS_FEEDBACK_REVIEWED_ENTRY_UNAVAILABLE");
  if (entry.recoveryReview.fallbackSha256 !== sha256(entry.fallback)) {
    fail("HARNESS_FEEDBACK_REVIEWED_ENTRY_HASH_MISMATCH");
  }
  return entry;
}

export function deriveFeedbackRowProof(corpus: LoadedHelpCorpus,row: typeof FEEDBACK_MATRIX[number],recovery: any) {
  if (row.branch === "DETERMINISTIC_RECOVERY") {
    const classification = classifySupportMessage(row.prompt);
    if (classification.outcome !== "REFUSE_ZONE"
      || classification.securityNavigation !== "FORGOT_PASSWORD"
      || classification.language !== row.language || classification.link !== null) {
      fail("HARNESS_FEEDBACK_RECOVERY_BRANCH_PROOF_MISMATCH");
    }
    const resolved = resolveSupportActions(["forgot-password"],{
      signedIn:false,language:row.language
    });
    if (recovery.status === "UNAVAILABLE" && resolved.length !== 0) {
      fail("HARNESS_FEEDBACK_RECOVERY_EXPECTATION_MISMATCH");
    }
    if (recovery.status === "VERIFIED") {
      const expected = { id:recovery.action.id,label:recovery.action.label[row.language],href:recovery.action.href };
      if (JSON.stringify(resolved) !== JSON.stringify([expected])) {
        fail("HARNESS_FEEDBACK_RECOVERY_EXPECTATION_MISMATCH");
      }
      return Object.freeze({ branch:row.branch,actionStatus:"VERIFIED",action:Object.freeze(expected) });
    }
    return Object.freeze({ branch:row.branch,actionStatus:"UNAVAILABLE",action:null });
  }
  const context = knowledge(corpus,row);
  if (row.branch === "DETERMINISTIC_NO_SOURCE") {
    const classification = classifySupportMessage(row.prompt);
    if (classification.outcome !== null || context.sourceIds.length !== 0
      || context.requestedActionIds.length !== 0) fail("HARNESS_FEEDBACK_NO_SOURCE_BRANCH_PROOF_MISMATCH");
    return Object.freeze({ branch:row.branch,sourceIds:context.sourceIds,actionIds:context.requestedActionIds });
  }
  if (context.sourceIds[0] !== row.topSourceId) fail("HARNESS_FEEDBACK_TOP_SOURCE_MISMATCH");
  const entry = reviewedEntry(corpus,row.topSourceId,row.language);
  const responseSnapshot = Object.freeze({
    requestVersion:corpus.kbVersion,pinnedVersion:corpus.kbVersion,pinnedSourceId:entry.id,
    reviewedFallback:Object.freeze({ version:corpus.kbVersion,sourceId:entry.id,text:entry.fallback! })
  });
  return Object.freeze({
    branch:"MODEL",topSourceId:entry.id,sourceIds:context.sourceIds,
    requestedActionIds:context.requestedActionIds,fallbackSha256:sha256(entry.fallback!),
    review:Object.freeze({
      reviewedBy:entry.recoveryReview!.reviewedBy,
      reviewerSession:entry.recoveryReview!.reviewerSession,
      reviewedOn:entry.recoveryReview!.reviewedOn,
      evidence:entry.recoveryReview!.evidence
    }),
    classifyResponse(response: Readonly<{ outcome:string;text:string;sourceIds:readonly string[] }>) {
      return classifySupportResponseEvidence(response,responseSnapshot);
    }
  });
}

export function createFeedbackPreRequestVerifier(rawInput: any) {
  const input = validateFinalGateInput(rawInput);
  validateFeedbackMatrix(FEEDBACK_MATRIX);
  const inventory = readBoundJson(input.inventoryPath,input.inventorySha256);
  if (inventory?.revision !== input.finalCommit || !Array.isArray(inventory.productFiles)
    || inventory.productFiles.length === 0) fail("HARNESS_FEEDBACK_INVENTORY_INVALID");
  const head = execFileSync("git",["-C",input.productRoot,"rev-parse","HEAD"],{ encoding:"utf8" }).trim();
  const status = execFileSync("git",["-C",input.productRoot,"status","--short"],{ encoding:"utf8" });
  if (head !== input.finalCommit || status !== "") fail("HARNESS_FEEDBACK_PRODUCT_CUSTODY_MISMATCH");
  const inventoryHashes = new Map<string,string>();
  for (const file of inventory.productFiles) {
    if (typeof file?.laneRelative !== "string" || !SHA256.test(file.sha256)
      || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || inventoryHashes.has(file.laneRelative)) {
      fail("HARNESS_FEEDBACK_INVENTORY_INVALID");
    }
    const absolute = resolve(input.productRoot,file.laneRelative);
    const bytes = readFileSync(absolute);
    if (!absolute.startsWith(`${resolve(input.productRoot)}/`) || bytes.byteLength !== file.bytes
      || sha256(bytes) !== file.sha256) fail("HARNESS_FEEDBACK_INVENTORY_FILE_MISMATCH");
    inventoryHashes.set(file.laneRelative,file.sha256);
  }
  if (!inventoryHashes.has("apps/api/src/support/security-guidance.ts")) {
    fail("HARNESS_FEEDBACK_SECURITY_GUIDANCE_NOT_BOUND");
  }
  const attestation = readBoundJson(input.attestationPath,input.attestationSha256);
  if (attestation?.finalCommit !== input.finalCommit
    || attestation?.snapshot?.kbVersion !== input.expectedSnapshotVersion
    || attestation?.snapshot?.entryCount !== input.expectedEntryCount
    || !Array.isArray(attestation.logicalRecords)
    || attestation.logicalRecords.length !== input.expectedEntryCount) {
    fail("HARNESS_FEEDBACK_ATTESTATION_INVALID");
  }
  for (const [name,expectedPath] of Object.entries(REQUIRED_ATTESTED_FILES)) {
    const file = attestation.files?.[name];
    if (file?.laneRelative !== expectedPath || !SHA256.test(file.sha256)
      || inventoryHashes.get(file.laneRelative) !== file.sha256
      || sha256(readFileSync(resolve(input.productRoot,file.laneRelative))) !== file.sha256) {
      fail("HARNESS_FEEDBACK_ATTESTED_FILE_MISMATCH");
    }
  }
  const corpus = loadHelpCorpus(resolve(input.productRoot,"packages/support-kb/content"),{
    reviewManifest:JSON.parse(readFileSync(resolve(input.productRoot,attestation.files.review.laneRelative),"utf8")),
    recoveryComponents:readFileSync(resolve(input.productRoot,attestation.files.component.laneRelative)),
    requireReviewedRecovery:true
  });
  if (corpus.kbVersion !== input.expectedSnapshotVersion
    || corpus.entries.length !== input.expectedEntryCount) fail("HARNESS_FEEDBACK_SNAPSHOT_MISMATCH");
  const controlProof = readBoundJson(input.controlProofPath,input.controlProofSha256);
  if (!Number.isSafeInteger(controlProof?.controls) || controlProof.controls < 1
    || controlProof.passed !== controlProof.controls || !Array.isArray(controlProof.names)
    || controlProof.names.length !== controlProof.controls) fail("HARNESS_FEEDBACK_CONTROL_PROOF_INVALID");
  const proofs = new Map(FEEDBACK_MATRIX.map(row => [
    row.sequence,deriveFeedbackRowProof(corpus,row,input.recovery)
  ]));
  return Object.freeze({
    finalCommit:input.finalCommit,kbVersion:corpus.kbVersion,entryCount:corpus.entries.length,
    declaredControls:controlProof.controls,recovery:input.recovery,
    prepare(row: typeof FEEDBACK_MATRIX[number]) {
      const proof = proofs.get(row.sequence);
      if (proof === undefined) fail("HARNESS_FEEDBACK_ROW_PROOF_UNAVAILABLE");
      return proof;
    }
  });
}
