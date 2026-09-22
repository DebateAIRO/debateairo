import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SHA256=/^[0-9a-f]{64}$/u;
const COMMIT=/^[0-9a-f]{40}$/u;
const PRODUCT_ROOT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const EXACT_GATE_KEYS=[
  "schemaVersion","productRoot","finalCommit","productInventoryPath","productInventorySha256",
  "attestationPath","attestationSha256","expectedSnapshotVersion","expectedEntryCount",
  "requiredSuiteReceiptPath","requiredSuiteReceiptSha256","controlProofPath","controlProofSha256",
  "runtimeCapacityPath","runtimeCapacitySha256","runtimeLogPath","baseUrl","forgotConnector"
];
const EXACT_CONTROL_PROOF_KEYS=[
  "schemaVersion","result","revision","kbVersion","harnessSha256","controls","passed","names"
];
export const GUIDE_HARNESS_EXECUTABLE_FILES=Object.freeze([
  "capture-public-guide.mjs","controls.mjs","matrix.mjs","pre-request-verifier.ts",
  "runtime-capacity.mjs","session-lifecycle.mjs","verify-final-branches.ts","verify-guide-harness.mjs"
]);

function exactKeys(value,keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value,key));
}

export function validateGuideGateInput(value) {
  const paths=[
    value?.productInventoryPath,value?.attestationPath,value?.requiredSuiteReceiptPath,
    value?.controlProofPath,value?.runtimeCapacityPath,value?.runtimeLogPath
  ];
  const hashes=[
    value?.productInventorySha256,value?.attestationSha256,
    value?.requiredSuiteReceiptSha256,value?.controlProofSha256,
    value?.runtimeCapacitySha256,value?.expectedSnapshotVersion
  ];
  if (!exactKeys(value,EXACT_GATE_KEYS) || value.schemaVersion !== 1
    || value.productRoot !== PRODUCT_ROOT || !COMMIT.test(value.finalCommit)
    || !paths.every(path => typeof path === "string" && path.startsWith("/"))
    || !hashes.every(hash => SHA256.test(hash))
    || !Number.isSafeInteger(value.expectedEntryCount) || value.expectedEntryCount < 1
    || value.baseUrl !== "https://localhost:3100"
    || !exactKeys(value.forgotConnector,["status"])
    || value.forgotConnector.status !== "UNRESOLVED_ACTIONLESS") {
    throw new Error("GUIDE_HARNESS_FINAL_GATE_INVALID");
  }
  return Object.freeze(value);
}

export function computeGuideHarnessSha256(directory) {
  if (typeof directory !== "string" || !directory.startsWith("/")) {
    throw new Error("GUIDE_HARNESS_MANIFEST_PATH_INVALID");
  }
  const manifest=GUIDE_HARNESS_EXECUTABLE_FILES.map(path => {
    const bytes=readFileSync(resolve(directory,path));
    return Object.freeze({ path,bytes:bytes.byteLength,sha256:createHash("sha256").update(bytes).digest("hex") });
  });
  return createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
}

export async function activateGuideNavigation({
  baseUrl,beforeUrl,expectedHref,kind,
  activatePointer,activateKeyboard,waitForExpectedDestination,readCurrentUrl
}) {
  let expectedDestination;
  let normalizedBefore;
  try {
    expectedDestination=new URL(expectedHref,baseUrl).href;
    normalizedBefore=new URL(beforeUrl).href;
  } catch {
    throw new Error("GUIDE_HARNESS_NAVIGATION_DESTINATION_INVALID");
  }
  if ((kind !== "pointer" && kind !== "keyboard")
    || typeof waitForExpectedDestination !== "function" || typeof readCurrentUrl !== "function") {
    throw new Error("GUIDE_HARNESS_NAVIGATION_ACTIVATION_INVALID");
  }
  const activate=kind === "pointer" ? activatePointer : activateKeyboard;
  if (typeof activate !== "function") {
    throw new Error("GUIDE_HARNESS_NAVIGATION_ACTIVATION_INVALID");
  }
  await activate();
  const transitionWaited=normalizedBefore !== expectedDestination;
  if (transitionWaited) await waitForExpectedDestination(expectedDestination);
  let destination;
  try { destination=new URL(await readCurrentUrl()).href; }
  catch { throw new Error("GUIDE_HARNESS_NAVIGATION_DESTINATION_MISMATCH"); }
  if (destination !== expectedDestination) {
    throw new Error("GUIDE_HARNESS_NAVIGATION_DESTINATION_MISMATCH");
  }
  return Object.freeze({ kind,expectedDestination,destination,performed:true,transitionWaited });
}

const REQUIRED_NEW_SUITE_MEMBERS=Object.freeze([
  "tests/render/sup-03-consent.test.tsx",
  "tests/render/sup-04-widget.test.tsx",
  "tests/render/support-topbar.test.tsx",
  "tests/unit/support-public-guide-boundary.test.ts",
  "tests/unit/support-recovery-intent.test.ts",
  "tests/unit/s7-authorization.test.ts",
  "tests/architecture/sup-01-boundary.test.ts",
  "tests/architecture/sup-03-projection.test.ts"
]);

export function validateBoundReceiptMembership({
  finalCommit,kbVersion,entryCount,harnessSha256,inventory,attestation,suite,controlProof
}) {
  const productFiles=inventory?.productFiles;
  const suiteFiles=suite?.files;
  const argv=suite?.argv;
  if (inventory?.revision !== finalCommit || !Array.isArray(productFiles) || productFiles.length === 0
    || attestation?.finalCommit !== finalCommit || attestation?.snapshot?.kbVersion !== kbVersion
    || attestation?.snapshot?.entryCount !== entryCount
    || !Array.isArray(attestation?.logicalRecords) || attestation.logicalRecords.length !== entryCount
    || suite?.revision !== finalCommit || suite?.kbVersion !== kbVersion || suite?.exitCode !== 0
    || !Array.isArray(suiteFiles) || suiteFiles.length !== 33
    || new Set(suiteFiles).size !== suiteFiles.length
    || !REQUIRED_NEW_SUITE_MEMBERS.every(path => suiteFiles.includes(path))
    || !Array.isArray(argv) || argv.length < suiteFiles.length
    || !suiteFiles.every(path => argv.includes(path)) || argv.includes("--minWorkers")
    || !argv.includes("--maxWorkers=1")
    || !SHA256.test(harnessSha256) || !exactKeys(controlProof,EXACT_CONTROL_PROOF_KEYS)
    || controlProof.schemaVersion !== 2 || controlProof.result !== "PASS"
    || controlProof.revision !== finalCommit || controlProof.kbVersion !== kbVersion
    || controlProof.harnessSha256 !== harnessSha256
    || !Number.isSafeInteger(controlProof.controls) || controlProof.controls < 1
    || controlProof.passed !== controlProof.controls || !Array.isArray(controlProof.names)
    || controlProof.names.length !== controlProof.controls) {
    throw new Error("GUIDE_HARNESS_BOUND_RECEIPT_INVALID");
  }
  return Object.freeze({
    suiteFiles:Object.freeze([...suiteFiles]),controlCount:controlProof.controls,
    controlProof:Object.freeze({ ...controlProof,names:Object.freeze([...controlProof.names]) })
  });
}

function comparableSources(sources) {
  return sources.map(({ label }) => label);
}
function comparableActions(actions) {
  return actions.map(({ label,href }) => ({ label,href }));
}

const FAILURE_CODE=/^GUIDE_HARNESS_[A-Z0-9_]+$/u;
const ROW_KINDS=new Set(["GUIDE_FAMILY","PRIVATE_RECORD","PROMPT_INJECTION","RECOVERY"]);
const ROW_MODES=new Set(["full","compact"]);
const ROW_LANGUAGES=new Set(["en","ro"]);
const ROW_BRANCHES=new Set([
  "MODEL","DETERMINISTIC_PRIVATE_REFUSAL","DETERMINISTIC_INJECTION_REFUSAL","DETERMINISTIC_RECOVERY"
]);
const ACTION_POLICIES=new Set(["NONE","ALLOW_CLOSED","REQUIRE_CLOSED"]);
const RECOVERY_CLASSES=new Set([
  null,"POSITIVE_NAVIGATION","OPERATION_ONLY","OPERATION_AND_NAVIGATION",
  "NEGATED_OPERATION_AND_NAVIGATION","NEGATED_OR_UNRELATED"
]);
const PUBLIC_OUTCOMES=new Set(["ANSWER_GROUNDED","REFUSE_ZONE","REFUSE_INJECTION"]);
const DIAGNOSTIC_STATUSES=new Set([
  "ACCEPTED_DRAFT","ATTRIBUTED_RECOVERY","ATTRIBUTED_REFUSAL","AMBIGUOUS","NOT_APPLICABLE"
]);
const DIAGNOSTIC_CATEGORIES=new Set([
  "RAW_LENGTH","JSON_SYNTAX","EXACT_KEY_SET","KIND","SCHEMA","TEXT_EMPTY","TEXT_LENGTH",
  "RAW_LINK_OR_PROTOCOL","ENCODED_LINK_OR_PATH","MARKUP","PATH_OR_ROUTE",
  "LABELLED_OR_TOKEN_SECRET","CREDENTIAL_OPERATION","SIX_DIGIT_CODE","GROUPED_SECURITY_CODE",
  "REDACTION_ECHO","NARRATIVE_INTERNAL_IDENTIFIER","SOURCE_MEMBERSHIP","ACTION_MEMBERSHIP"
]);

function finiteCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function publicSources(value) {
  if (!Array.isArray(value) || value.some(source => source === null || typeof source !== "object"
    || typeof source.id !== "string" || typeof source.label !== "string")) {
    throw new Error("GUIDE_HARNESS_FAILURE_OBSERVATION_INVALID");
  }
  return Object.freeze(value.map(({ id,label }) => Object.freeze({ id,label })));
}

function publicActions(value) {
  if (!Array.isArray(value) || value.some(action => action === null || typeof action !== "object"
    || typeof action.id !== "string" || typeof action.label !== "string"
    || typeof action.href !== "string")) {
    throw new Error("GUIDE_HARNESS_FAILURE_OBSERVATION_INVALID");
  }
  return Object.freeze(value.map(({ id,label,href }) => Object.freeze({ id,label,href })));
}

function visibleActions(value) {
  if (!Array.isArray(value) || value.some(action => action === null || typeof action !== "object"
    || typeof action.label !== "string" || typeof action.href !== "string")) {
    throw new Error("GUIDE_HARNESS_FAILURE_OBSERVATION_INVALID");
  }
  return Object.freeze(value.map(({ label,href }) => Object.freeze({ label,href })));
}

function canonicalAttempt(row,proof) {
  if (row === null || typeof row !== "object" || proof === null || typeof proof !== "object"
    || !Number.isSafeInteger(row.sequence) || row.sequence < 1 || typeof row.prompt !== "string"
    || row.prompt.length === 0 || (row.family !== null && row.family !== undefined
      && typeof row.family !== "string")
    || !ROW_KINDS.has(row.kind) || !ROW_MODES.has(row.mode)
    || !ROW_LANGUAGES.has(row.language) || !ROW_BRANCHES.has(row.branch)
    || !ACTION_POLICIES.has(row.actionPolicy) || !RECOVERY_CLASSES.has(row.recoveryClass ?? null)
    || !ROW_BRANCHES.has(proof.branch)) {
    throw new Error("GUIDE_HARNESS_ATTEMPT_METADATA_INVALID");
  }
  return Object.freeze({
    canonicalRow:Object.freeze({
      sequence:row.sequence,prompt:row.prompt,kind:row.kind,family:row.family ?? null,
      mode:row.mode,language:row.language,branch:row.branch,
      actionPolicy:row.actionPolicy,recoveryClass:row.recoveryClass ?? null
    }),
    proof:Object.freeze({ branch:proof.branch })
  });
}

export function projectGuideApiResponse(body,status) {
  if (body === null || typeof body !== "object" || Array.isArray(body)
    || !Number.isSafeInteger(status) || status < 100 || status > 599
    || !PUBLIC_OUTCOMES.has(body.outcome) || typeof body.text !== "string") {
    throw new Error("GUIDE_HARNESS_API_PROJECTION_INVALID");
  }
  try {
    return Object.freeze({
      status,outcome:body.outcome,text:body.text,
      sources:publicSources(body.sources),actions:publicActions(body.actions)
    });
  } catch {
    throw new Error("GUIDE_HARNESS_API_PROJECTION_INVALID");
  }
}

function projectGuideVisibleResponse(visible) {
  if (visible === null || typeof visible !== "object" || Array.isArray(visible)
    || typeof visible.text !== "string" || !Array.isArray(visible.sources)
    || visible.sources.some(label => typeof label !== "string")) {
    throw new Error("GUIDE_HARNESS_DOM_PROJECTION_INVALID");
  }
  try {
    return Object.freeze({
      text:visible.text,sources:Object.freeze([...visible.sources]),
      actions:visibleActions(visible.actions)
    });
  } catch {
    throw new Error("GUIDE_HARNESS_DOM_PROJECTION_INVALID");
  }
}

function projectGuideDiagnostic(diagnostic) {
  if (diagnostic === null || typeof diagnostic !== "object" || Array.isArray(diagnostic)
    || !DIAGNOSTIC_STATUSES.has(diagnostic.status)
    || !Number.isSafeInteger(diagnostic.candidateCount) || diagnostic.candidateCount < 0) {
    throw new Error("GUIDE_HARNESS_DIAGNOSTIC_INVALID");
  }
  return Object.freeze({
    status:diagnostic.status,
    category:DIAGNOSTIC_CATEGORIES.has(diagnostic.record?.predicate)
      ? diagnostic.record.predicate : null,
    candidateCount:diagnostic.candidateCount,
    validCount:finiteCount(diagnostic.validCount),
    invalidCount:finiteCount(diagnostic.invalidCount),
    duplicateCount:finiteCount(diagnostic.duplicateCount),
    unmatchedCount:finiteCount(diagnostic.unmatchedCount)
  });
}

function stagedObservation(attempt,{ phase,api=null,visible=null,diagnostic=null,failureCode=null }) {
  const equality=api === null || visible === null ? null : Object.freeze({
    text:api.text === visible.text,
    sources:JSON.stringify(comparableSources(api.sources)) === JSON.stringify(visible.sources),
    actions:JSON.stringify(comparableActions(api.actions)) === JSON.stringify(visible.actions)
  });
  return Object.freeze({
    phase,canonicalRow:attempt.canonicalRow,proof:attempt.proof,
    api,visible,equality,diagnostic,failureCode
  });
}

export function projectGuideFailureObservation({ row,proof,api,visible,diagnostic }) {
  let projectedApi;
  let projectedVisible;
  let projectedDiagnostic;
  try {
    projectedApi=projectGuideApiResponse(api,api?.status);
    projectedVisible=projectGuideVisibleResponse(visible);
    projectedDiagnostic=projectGuideDiagnostic(diagnostic);
  } catch {
    throw new Error("GUIDE_HARNESS_FAILURE_OBSERVATION_INVALID");
  }
  return stagedObservation(canonicalAttempt(row,proof),{
    phase:"DIAGNOSTIC_PROJECTED",api:projectedApi,visible:projectedVisible,
    diagnostic:projectedDiagnostic
  });
}

function withFailureCode(observation,failureCode) {
  if (!FAILURE_CODE.test(failureCode)) failureCode="GUIDE_HARNESS_OBSERVATION_UNCLASSIFIED";
  return Object.freeze({ ...observation,failureCode });
}

export function assertGuideObservation({ row,proof,api,visible,diagnostic }) {
  if (api.text !== visible.text
    || JSON.stringify(comparableSources(api.sources)) !== JSON.stringify(visible.sources)
    || JSON.stringify(comparableActions(api.actions)) !== JSON.stringify(visible.actions)) {
    throw new Error("GUIDE_HARNESS_API_DOM_MISMATCH");
  }
  let responseOrigin;
  if (row.branch === "MODEL") {
    if (proof.branch !== "MODEL") throw new Error("GUIDE_HARNESS_BRANCH_PROOF_MISMATCH");
    if (api.status !== 200) throw new Error("GUIDE_HARNESS_HTTP_STATUS_INVALID");
    if (api.outcome !== "ANSWER_GROUNDED") throw new Error("GUIDE_HARNESS_OUTCOME_INVALID");
    const apiSourceIds=api.sources.map(({ id }) => id);
    const hasSourcePolicy=proof.sourcePolicy !== null && proof.sourcePolicy !== undefined;
    if (hasSourcePolicy) {
      if (typeof proof.sourceIdsSatisfyPolicy !== "function"
        || !proof.sourceIdsSatisfyPolicy(apiSourceIds)) {
        throw new Error("GUIDE_HARNESS_SOURCE_POLICY_INVALID");
      }
      if (!Array.isArray(proof.sourceIds)
        || apiSourceIds.some(id => !proof.sourceIds.includes(id))) {
        throw new Error("GUIDE_HARNESS_PROOF_SOURCE_MEMBERSHIP_INVALID");
      }
    } else {
      if (!Array.isArray(row.expectedSourceIds) || !row.expectedSourceIds.includes(api.sources[0]?.id)) {
        throw new Error("GUIDE_HARNESS_EXPECTED_PRIMARY_SOURCE_MISSING");
      }
      if (!Array.isArray(proof.sourceIds) || !proof.sourceIds.includes(api.sources[0]?.id)) {
        throw new Error("GUIDE_HARNESS_PROOF_PRIMARY_SOURCE_MISSING");
      }
    }
    if (diagnostic.status === "ACCEPTED_DRAFT" && diagnostic.candidateCount === 0) {
      responseOrigin="MODEL_ACCEPTED_DRAFT";
    } else if (diagnostic.status === "ATTRIBUTED_RECOVERY" && diagnostic.candidateCount === 1) {
      responseOrigin="REVIEWED_FALLBACK";
    } else if (diagnostic.status === "ATTRIBUTED_REFUSAL" && diagnostic.candidateCount === 1) {
      responseOrigin="MODEL_REFUSAL";
    } else {
      throw new Error("GUIDE_HARNESS_DIAGNOSTIC_ATTRIBUTION_INVALID");
    }
    if (hasSourcePolicy && responseOrigin !== "MODEL_ACCEPTED_DRAFT"
      && (!Array.isArray(proof.recoverySourceIds)
        || JSON.stringify(apiSourceIds) !== JSON.stringify(proof.recoverySourceIds))) {
      throw new Error("GUIDE_HARNESS_RECOVERY_SOURCE_POLICY_INVALID");
    }
    if (row.actionPolicy === "NONE" && api.actions.length !== 0) {
      throw new Error("GUIDE_HARNESS_ACTION_POLICY_INVALID");
    }
    if (row.actionPolicy === "REQUIRE_CLOSED"
      && !api.actions.some(action => action.id === row.navigation?.actionId)) {
      throw new Error("GUIDE_HARNESS_ACTION_POLICY_INVALID");
    }
    if (!Array.isArray(proof.allowedActions) || !api.actions.every(action => proof.allowedActions.some(allowed =>
      allowed.id === action.id && allowed.label === action.label && allowed.href === action.href))) {
      throw new Error("GUIDE_HARNESS_ACTION_BINDING_INVALID");
    }
  } else {
    if (diagnostic.candidateCount !== 0) {
      throw new Error("GUIDE_HARNESS_UNEXPECTED_MODEL_DIAGNOSTIC");
    }
    if (row.branch === "DETERMINISTIC_PRIVATE_REFUSAL") {
      if (proof.branch !== row.branch || api.status !== 200 || api.outcome !== "REFUSE_ZONE"
        || api.sources.length !== 0 || api.actions.length !== 0) {
        throw new Error("GUIDE_HARNESS_PRIVATE_REFUSAL_INVALID");
      }
      responseOrigin="DETERMINISTIC_PRIVATE_REFUSAL";
    } else if (row.branch === "DETERMINISTIC_RECOVERY") {
      if (proof.branch !== row.branch || proof.recoveryClass !== row.recoveryClass
        || api.status !== 200 || api.outcome !== "REFUSE_ZONE"
        || api.sources.length !== 0 || api.actions.length !== 0) {
        throw new Error("GUIDE_HARNESS_RECOVERY_RESULT_INVALID");
      }
      responseOrigin="DETERMINISTIC_RECOVERY";
    } else if (row.branch === "DETERMINISTIC_INJECTION_REFUSAL") {
      if (proof.branch !== row.branch || api.status !== 200 || api.outcome !== "REFUSE_INJECTION"
        || api.sources.length !== 0 || api.actions.length !== 0) {
        throw new Error("GUIDE_HARNESS_INJECTION_REFUSAL_INVALID");
      }
      responseOrigin="DETERMINISTIC_INJECTION_REFUSAL";
    } else {
      throw new Error("GUIDE_HARNESS_BRANCH_INVALID");
    }
  }
  return Object.freeze({
    responseOrigin,apiDomTextEqual:true,apiDomSourcesEqual:true,apiDomActionsEqual:true
  });
}

export async function checkpointGuideObservation(input,checkpoint) {
  if (typeof checkpoint !== "function") {
    throw new Error("GUIDE_HARNESS_FAILURE_CHECKPOINT_INVALID");
  }
  let observation=projectGuideFailureObservation(input);
  await checkpoint(observation);
  try {
    const attribution=assertGuideObservation(input);
    return Object.freeze({ observation,attribution });
  } catch (error) {
    const code=error instanceof Error ? error.message : "GUIDE_HARNESS_OBSERVATION_UNCLASSIFIED";
    observation=withFailureCode(observation,code);
    await checkpoint(observation);
    throw error;
  }
}

export async function consumeGuideObservationStages({
  row,proof,body,status,waitForSessionVersion,waitForAssistant,readVisible,readDiagnostic,checkpoint
}) {
  if (typeof waitForSessionVersion !== "function" || typeof waitForAssistant !== "function"
    || typeof readVisible !== "function"
    || typeof readDiagnostic !== "function" || typeof checkpoint !== "function") {
    throw new Error("GUIDE_HARNESS_STAGED_CONSUMER_INVALID");
  }
  const attempt=canonicalAttempt(row,proof);
  let observation;
  let api;
  try {
    api=projectGuideApiResponse(body,status);
  } catch {
    observation=stagedObservation(attempt,{
      phase:"ATTEMPTED",failureCode:"GUIDE_HARNESS_API_PROJECTION_INVALID"
    });
    await checkpoint(observation);
    throw new Error("GUIDE_HARNESS_API_PROJECTION_INVALID");
  }
  observation=stagedObservation(attempt,{ phase:"API_PROJECTED",api });
  await checkpoint(observation);
  try { await waitForSessionVersion(); }
  catch {
    observation=withFailureCode(observation,"GUIDE_HARNESS_SESSION_VERSION_INVALID");
    await checkpoint(observation);
    throw new Error("GUIDE_HARNESS_SESSION_VERSION_INVALID");
  }
  try { await waitForAssistant(); }
  catch {
    observation=withFailureCode(observation,"GUIDE_HARNESS_ASSISTANT_DOM_MISSING");
    await checkpoint(observation);
    throw new Error("GUIDE_HARNESS_ASSISTANT_DOM_MISSING");
  }
  let visibleRaw;
  try { visibleRaw=await readVisible(); }
  catch {
    observation=withFailureCode(observation,"GUIDE_HARNESS_DOM_READ_FAILED");
    await checkpoint(observation);
    throw new Error("GUIDE_HARNESS_DOM_READ_FAILED");
  }
  let visible;
  try { visible=projectGuideVisibleResponse(visibleRaw); }
  catch {
    observation=withFailureCode(observation,"GUIDE_HARNESS_DOM_PROJECTION_INVALID");
    await checkpoint(observation);
    throw new Error("GUIDE_HARNESS_DOM_PROJECTION_INVALID");
  }
  observation=stagedObservation(attempt,{ phase:"DOM_PROJECTED",api,visible });
  await checkpoint(observation);
  let diagnosticRaw;
  try { diagnosticRaw=await readDiagnostic({ api,visible }); }
  catch {
    observation=withFailureCode(observation,"GUIDE_HARNESS_DIAGNOSTIC_CAPTURE_FAILED");
    await checkpoint(observation);
    throw new Error("GUIDE_HARNESS_DIAGNOSTIC_CAPTURE_FAILED");
  }
  let diagnostic;
  try { diagnostic=projectGuideDiagnostic(diagnosticRaw); }
  catch {
    observation=withFailureCode(observation,"GUIDE_HARNESS_DIAGNOSTIC_INVALID");
    await checkpoint(observation);
    throw new Error("GUIDE_HARNESS_DIAGNOSTIC_INVALID");
  }
  observation=stagedObservation(attempt,{
    phase:"DIAGNOSTIC_PROJECTED",api,visible,diagnostic
  });
  await checkpoint(observation);
  try {
    const attribution=assertGuideObservation({ row,proof,api,visible,diagnostic });
    return Object.freeze({ observation,api,visible,diagnostic,attribution });
  } catch (error) {
    const code=error instanceof Error ? error.message : "GUIDE_HARNESS_OBSERVATION_UNCLASSIFIED";
    observation=withFailureCode(observation,code);
    await checkpoint(observation);
    throw error;
  }
}

export function deriveDeclaredControlCount(results) {
  if (!Array.isArray(results) || results.some(value => typeof value !== "string" || value.length === 0)) {
    throw new Error("GUIDE_HARNESS_CONTROL_RESULT_INVALID");
  }
  return results.length;
}
