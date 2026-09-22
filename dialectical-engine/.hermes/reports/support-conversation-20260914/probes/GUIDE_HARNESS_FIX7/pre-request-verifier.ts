import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath,pathToFileURL } from "node:url";
import { dirname,resolve } from "node:path";
import {
  GUIDE_MATRIX,GUIDE_SESSION_GROUPS,validateGuideMatrix,validateGuideSchedule
} from "./matrix.mjs";
import {
  computeGuideHarnessSha256,validateBoundReceiptMembership,validateGuideGateInput
} from "./controls.mjs";
import { validateGuideRuntimeCapacity } from "./runtime-capacity.mjs";

const SHA256=/^[0-9a-f]{64}$/u;
const MAX_CONTEXT_CODE_POINTS=24_000;
const REQUIRED_ATTESTED_FILES=Object.freeze({
  component:"packages/support-kb/recovery/components.json",
  review:"packages/support-kb/reviews/manifest.json",
  catalogSource:"packages/support-kb/src/catalog.ts",
  loaderSource:"packages/support-kb/src/index.ts",
  rankingSource:"packages/support-kb/src/context.ts",
  productionApiSource:"apps/api/src/main.ts"
});

function sha256(bytes:string|Buffer):string {
  return createHash("sha256").update(bytes).digest("hex");
}
function fail(code:string):never { throw new Error(code); }
function readBoundJson(path:string,expectedSha256:string):any {
  const bytes=readFileSync(path);
  if (sha256(bytes) !== expectedSha256) fail("GUIDE_HARNESS_BOUND_INPUT_HASH_MISMATCH");
  try { return JSON.parse(bytes.toString("utf8")); }
  catch { return fail("GUIDE_HARNESS_BOUND_INPUT_JSON_INVALID"); }
}
function structuredInstructionLength(language:"en"|"ro"):number {
  const shape='{"kind":"answer","text":"<grounded answer>","sourceIds":["<allowed source reference>"],"actionIds":[]}';
  const instruction=language === "ro"
    ? `Returnează numai un singur obiect JSON, fără alte chei și fără text înainte sau după: ${shape}. kind trebuie să fie answer. Secțiunea finală OUTPUT CONTRACT enumeră singurele sourceIds și actionIds permise; înlocuiește exemplele și copiază identificatorii exact, citând cel puțin un sourceId.`
    : `Return only one JSON object, with no other keys and no text before or after it: ${shape}. kind must be answer. The final OUTPUT CONTRACT lists the only allowed sourceIds and actionIds; replace the examples and copy identifiers exactly, citing at least one sourceId.`;
  return [...`${instruction}\n\n`].length;
}

type Row=(typeof GUIDE_MATRIX)[number];
type Dependencies=Readonly<{
  loadHelpCorpus:(path:string,options:any)=>any;
  supportActionIds:readonly string[];
  supportCapabilities:unknown;
  supportSourcePolicies:readonly any[];
  supportSourceIdsSatisfyPolicy:(sourceIds:readonly string[],policy:any)=>boolean;
  selectSupportRecoveryEntry:(entries:readonly any[],policy:any)=>any;
  buildSupportKnowledgeContext:(input:any)=>any;
  resolveSupportActions:(ids:readonly string[],context:any)=>readonly any[];
  redactSupportMessage:(text:string)=>Readonly<{ text:string }>;
  classifyPublicGuideBoundary:(text:string,language:"en"|"ro")=>Readonly<{ kind:string }>;
  classifySupportMessage:(text:string)=>Readonly<{
    outcome:string|null;securityNavigation?:string;securityOperation?:string;link:unknown
  }>;
  analyzeRecoverySemantics:(text:string,language:"en"|"ro")=>Readonly<{
    navigation:string;credentialOperation:string;language:string
  }>;
  classifySupportResponseEvidence:(response:any,snapshot:any)=>any;
}>;

async function loadProductionDependencies(productRoot:string):Promise<Dependencies> {
  const load=async (relative:string) => import(`${pathToFileURL(resolve(productRoot,relative)).href}?guide-harness=1`);
  const [loader,catalog,context,navigation,session,boundary,classifier,recovery,responseEvidence]=await Promise.all([
    load("packages/support-kb/src/index.ts"),
    load("packages/support-kb/src/catalog.ts"),
    load("packages/support-kb/src/context.ts"),
    load("packages/support-kb/src/navigation.ts"),
    load("apps/api/src/support/session.ts"),
    load("apps/api/src/support/public-guide-boundary.ts"),
    load("apps/api/src/support/classify.ts"),
    load("apps/api/src/support/recovery-intent.ts"),
    import("../LIVE_P3/response-evidence.mjs")
  ]);
  return Object.freeze({
    loadHelpCorpus:loader.loadHelpCorpus,
    supportActionIds:catalog.SUPPORT_ACTION_IDS,
    supportCapabilities:catalog.SUPPORT_CAPABILITIES,
    supportSourcePolicies:catalog.SUPPORT_SOURCE_POLICIES,
    supportSourceIdsSatisfyPolicy:loader.supportSourceIdsSatisfyPolicy,
    selectSupportRecoveryEntry:loader.selectSupportRecoveryEntry,
    buildSupportKnowledgeContext:context.buildSupportKnowledgeContext,
    resolveSupportActions:navigation.resolveSupportActions,
    redactSupportMessage:session.redactSupportMessage,
    classifyPublicGuideBoundary:boundary.classifyPublicGuideBoundary,
    classifySupportMessage:classifier.classifySupportMessage,
    analyzeRecoverySemantics:recovery.analyzeRecoverySemantics,
    classifySupportResponseEvidence:responseEvidence.classifySupportResponseEvidence
  });
}

function expectedRecoverySemantics(row:Row):Readonly<{ navigation:string;credentialOperation:string }> {
  const table:any={
    POSITIVE_NAVIGATION:{ navigation:"AFFIRMATIVE",credentialOperation:"ABSENT" },
    OPERATION_ONLY:{ navigation:"ABSENT",credentialOperation:"AFFIRMATIVE" },
    OPERATION_AND_NAVIGATION:{ navigation:"AFFIRMATIVE",credentialOperation:"AFFIRMATIVE" },
    NEGATED_OPERATION_AND_NAVIGATION:{ navigation:"AFFIRMATIVE",credentialOperation:"NEGATED" }
  };
  const expected=table[row.recoveryClass ?? ""];
  if (expected === undefined) fail("GUIDE_HARNESS_RECOVERY_CLASS_INVALID");
  return expected;
}

function reviewedEntry(corpus:any,id:string,language:"en"|"ro"):any {
  const entry=corpus.entries.find((candidate:any) => candidate.id === id && candidate.lang === language);
  if (entry?.modelProjection === undefined || entry.fallback === undefined
    || entry.recoveryReview === undefined) fail("GUIDE_HARNESS_REVIEWED_ENTRY_UNAVAILABLE");
  if (entry.recoveryReview.fallbackSha256 !== sha256(entry.fallback)) {
    fail("GUIDE_HARNESS_REVIEWED_ENTRY_HASH_MISMATCH");
  }
  return entry;
}

function sameIds(left:readonly string[]|undefined,right:readonly string[]|undefined):boolean {
  return Array.isArray(left) && Array.isArray(right)
    && left.length === right.length && left.every((id,index) => id === right[index]);
}

export function deriveGuideRowProof(corpus:any,row:Row,deps:Dependencies):any {
  const boundary=deps.classifyPublicGuideBoundary(row.prompt,row.language);
  const classification=deps.classifySupportMessage(row.prompt);
  if (row.branch === "DETERMINISTIC_PRIVATE_REFUSAL") {
    if (boundary.kind !== "PRIVATE_RECORD_REQUEST"
      || classification.outcome === "REFUSE_INJECTION"
      || classification.outcome === "REFUSE_SAFETY") {
      fail("GUIDE_HARNESS_PRIVATE_BRANCH_PROOF_MISMATCH");
    }
    return Object.freeze({ branch:row.branch });
  }
  if (row.branch === "DETERMINISTIC_RECOVERY") {
    const expected=expectedRecoverySemantics(row);
    const semantics=deps.analyzeRecoverySemantics(row.prompt,row.language);
    if (boundary.kind !== "PUBLIC_GUIDE"
      || semantics.language !== row.language || semantics.navigation !== expected.navigation
      || semantics.credentialOperation !== expected.credentialOperation
      || classification.outcome !== "REFUSE_ZONE" || classification.link !== null) {
      fail("GUIDE_HARNESS_RECOVERY_BRANCH_PROOF_MISMATCH");
    }
    return Object.freeze({ branch:row.branch,recoveryClass:row.recoveryClass });
  }
  if (row.branch === "DETERMINISTIC_INJECTION_REFUSAL") {
    if (boundary.kind !== "PUBLIC_GUIDE" || classification.outcome !== "REFUSE_INJECTION"
      || classification.securityNavigation !== undefined
      || classification.securityOperation !== undefined) {
      fail("GUIDE_HARNESS_INJECTION_BRANCH_PROOF_MISMATCH");
    }
    return Object.freeze({ branch:row.branch });
  }
  if (row.branch !== "MODEL" || boundary.kind !== "PUBLIC_GUIDE"
    || classification.outcome !== null || classification.securityNavigation !== undefined
    || classification.securityOperation !== undefined) {
    fail("GUIDE_HARNESS_PUBLIC_NAVIGATION_REFUSED");
  }
  if (row.recoveryClass === "NEGATED_OR_UNRELATED") {
    const semantics=deps.analyzeRecoverySemantics(row.prompt,row.language);
    if (semantics.language !== row.language || semantics.navigation !== "ABSENT"
      || semantics.credentialOperation !== "NEGATED") {
      fail("GUIDE_HARNESS_RECOVERY_BRANCH_PROOF_MISMATCH");
    }
  }
  const availableActionIds=deps.resolveSupportActions(deps.supportActionIds,{
    signedIn:false,language:row.language
  }).map(({ id }:any) => id);
  const context=deps.buildSupportKnowledgeContext({
    entries:corpus.entries,capabilities:deps.supportCapabilities,language:row.language,
    query:deps.redactSupportMessage(row.prompt).text,historyText:"",availableActionIds,
    referenceFor:(kind:string,index:number) => `guide-${kind}-${index}`,
    maxCodePoints:MAX_CONTEXT_CODE_POINTS-structuredInstructionLength(row.language)
  });
  const hasRowPolicy=Array.isArray((row as any).requiredSourceIds);
  const rowPolicy=hasRowPolicy ? Object.freeze({
    requiredSourceIds:(row as any).requiredSourceIds,
    allowedSourceIds:(row as any).allowedSourceIds,
    recoverySourceIds:(row as any).recoverySourceIds
  }) : null;
  if (hasRowPolicy) {
    if (!Array.isArray(deps.supportSourcePolicies)
      || typeof deps.supportSourceIdsSatisfyPolicy !== "function") {
      fail("GUIDE_HARNESS_SOURCE_POLICY_DECLARATION_MISMATCH");
    }
    const matchingPolicies=deps.supportSourcePolicies.filter((policy:any) =>
      sameIds(policy.requiredSourceIds,rowPolicy!.requiredSourceIds)
      && sameIds(policy.allowedSourceIds,rowPolicy!.allowedSourceIds)
      && sameIds(policy.recoverySourceIds,rowPolicy!.recoverySourceIds));
    if (matchingPolicies.length !== 1 || context.sourcePolicy === null
      || context.sourcePolicy.id !== matchingPolicies[0].id
      || !sameIds(context.sourcePolicy.requiredSourceIds,rowPolicy!.requiredSourceIds)
      || !sameIds(context.sourcePolicy.allowedSourceIds,rowPolicy!.allowedSourceIds)
      || !sameIds(context.sourcePolicy.recoverySourceIds,rowPolicy!.recoverySourceIds)
      || !deps.supportSourceIdsSatisfyPolicy(context.sourceIds,context.sourcePolicy)) {
      fail("GUIDE_HARNESS_SOURCE_POLICY_DECLARATION_MISMATCH");
    }
  } else if (context.sourcePolicy !== null) {
    fail("GUIDE_HARNESS_SOURCE_POLICY_DECLARATION_MISMATCH");
  }
  if (!hasRowPolicy && !row.expectedSourceIds.some(id => context.sourceIds.includes(id))) {
    fail("GUIDE_HARNESS_EXPECTED_SOURCE_MISSING");
  }
  const allowedActions=deps.resolveSupportActions(context.requestedActionIds,{
    signedIn:false,language:row.language
  });
  if (row.actionPolicy === "NONE" && allowedActions.length !== 0) {
    fail("GUIDE_HARNESS_PROSE_ONLY_ACTION_PROOF_MISMATCH");
  }
  if (row.actionPolicy === "REQUIRE_CLOSED"
    && !allowedActions.some(({ id }:any) => id === row.navigation?.actionId)) {
    fail("GUIDE_HARNESS_REQUIRED_ACTION_PROOF_MISMATCH");
  }
  const contextEntries=context.sourceIds.map((id:string) => reviewedEntry(corpus,id,row.language));
  if (typeof deps.selectSupportRecoveryEntry !== "function") {
    fail("GUIDE_HARNESS_RECOVERY_SOURCE_BINDING_INVALID");
  }
  const entry=deps.selectSupportRecoveryEntry(contextEntries,context.sourcePolicy);
  if (entry === undefined) fail("GUIDE_HARNESS_RECOVERY_SOURCE_BINDING_INVALID");
  if (hasRowPolicy && !sameIds([entry.id],rowPolicy!.recoverySourceIds)) {
    fail("GUIDE_HARNESS_RECOVERY_SOURCE_BINDING_INVALID");
  }
  const responseSnapshot=Object.freeze({
    requestVersion:corpus.kbVersion,pinnedVersion:corpus.kbVersion,pinnedSourceId:entry.id,
    reviewedFallback:Object.freeze({ version:corpus.kbVersion,sourceId:entry.id,text:entry.fallback })
  });
  return Object.freeze({
    branch:"MODEL",sourceIds:Object.freeze([...context.sourceIds]),
    sourcePolicy:context.sourcePolicy,
    recoverySourceIds:Object.freeze([entry.id]),
    requestedActionIds:Object.freeze([...context.requestedActionIds]),
    allowedActions:Object.freeze(allowedActions.map((action:any) => Object.freeze({ ...action }))),
    fallbackSha256:sha256(entry.fallback),review:Object.freeze({
      reviewedBy:entry.recoveryReview.reviewedBy,
      reviewerSession:entry.recoveryReview.reviewerSession,
      reviewedOn:entry.recoveryReview.reviewedOn,evidence:entry.recoveryReview.evidence
    }),
    classifyResponse(response:any) {
      return deps.classifySupportResponseEvidence(response,responseSnapshot);
    },
    sourceIdsSatisfyPolicy(sourceIds:readonly string[]) {
      return deps.supportSourceIdsSatisfyPolicy(sourceIds,context.sourcePolicy);
    }
  });
}

export async function createGuidePreRequestVerifier(rawInput:any,injected?:Dependencies) {
  const input=validateGuideGateInput(rawInput);
  validateGuideMatrix(GUIDE_MATRIX);
  validateGuideSchedule(GUIDE_MATRIX,GUIDE_SESSION_GROUPS);
  const inventory=readBoundJson(input.productInventoryPath,input.productInventorySha256);
  const attestation=readBoundJson(input.attestationPath,input.attestationSha256);
  const suite=readBoundJson(input.requiredSuiteReceiptPath,input.requiredSuiteReceiptSha256);
  const controlProof=readBoundJson(input.controlProofPath,input.controlProofSha256);
  const runtimeCapacity=readBoundJson(input.runtimeCapacityPath,input.runtimeCapacitySha256);
  const harnessSha256=computeGuideHarnessSha256(dirname(fileURLToPath(import.meta.url)));
  const bound=validateBoundReceiptMembership({
    finalCommit:input.finalCommit,kbVersion:input.expectedSnapshotVersion,
    entryCount:input.expectedEntryCount,harnessSha256,inventory,attestation,suite,controlProof
  });
  const head=execFileSync("git",["-C",input.productRoot,"rev-parse","HEAD"],{ encoding:"utf8" }).trim();
  const status=execFileSync("git",["-C",input.productRoot,"status","--short"],{ encoding:"utf8" });
  if (head !== input.finalCommit || status !== "") fail("GUIDE_HARNESS_PRODUCT_CUSTODY_MISMATCH");
  const inventoryHashes=new Map<string,string>();
  for (const file of inventory.productFiles) {
    if (typeof file?.laneRelative !== "string" || !SHA256.test(file.sha256)
      || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || inventoryHashes.has(file.laneRelative)) {
      fail("GUIDE_HARNESS_INVENTORY_INVALID");
    }
    const absolute=resolve(input.productRoot,file.laneRelative);
    const bytes=readFileSync(absolute);
    if (!absolute.startsWith(`${resolve(input.productRoot)}/`) || bytes.byteLength !== file.bytes
      || sha256(bytes) !== file.sha256) fail("GUIDE_HARNESS_INVENTORY_FILE_MISMATCH");
    inventoryHashes.set(file.laneRelative,file.sha256);
  }
  for (const [name,expectedPath] of Object.entries(REQUIRED_ATTESTED_FILES)) {
    const file=attestation.files?.[name];
    if (file?.laneRelative !== expectedPath || !SHA256.test(file.sha256)
      || inventoryHashes.get(file.laneRelative) !== file.sha256
      || sha256(readFileSync(resolve(input.productRoot,file.laneRelative))) !== file.sha256) {
      fail("GUIDE_HARNESS_ATTESTED_FILE_MISMATCH");
    }
  }
  const deps=injected ?? await loadProductionDependencies(input.productRoot);
  const corpus=deps.loadHelpCorpus(resolve(input.productRoot,"packages/support-kb/content"),{
    reviewManifest:JSON.parse(readFileSync(resolve(input.productRoot,attestation.files.review.laneRelative),"utf8")),
    recoveryComponents:readFileSync(resolve(input.productRoot,attestation.files.component.laneRelative)),
    requireReviewedRecovery:true
  });
  if (corpus.kbVersion !== input.expectedSnapshotVersion
    || corpus.entries.length !== input.expectedEntryCount) fail("GUIDE_HARNESS_SNAPSHOT_MISMATCH");
  const proofs=new Map(GUIDE_MATRIX.map(row => [row.sequence,deriveGuideRowProof(corpus,row,deps)]));
  const modelRows=[...proofs.values()].filter(({ branch }) => branch === "MODEL").length;
  validateGuideRuntimeCapacity(runtimeCapacity,{
    finalCommit:input.finalCommit,kbVersion:corpus.kbVersion,modelRows
  });
  return Object.freeze({
    finalCommit:input.finalCommit,kbVersion:corpus.kbVersion,entryCount:corpus.entries.length,
    declaredControls:controlProof.controls,controlProof:bound.controlProof,
    suiteFiles:Object.freeze([...suite.files]),
    runtimeCapacity,modelRows,
    prepare(row:Row) {
      const proof=proofs.get(row.sequence);
      if (proof === undefined) fail("GUIDE_HARNESS_ROW_PROOF_UNAVAILABLE");
      return proof;
    }
  });
}
