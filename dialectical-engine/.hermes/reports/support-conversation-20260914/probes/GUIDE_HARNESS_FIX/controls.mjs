const SHA256=/^[0-9a-f]{64}$/u;
const COMMIT=/^[0-9a-f]{40}$/u;
const PRODUCT_ROOT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const EXACT_GATE_KEYS=[
  "schemaVersion","productRoot","finalCommit","productInventoryPath","productInventorySha256",
  "attestationPath","attestationSha256","expectedSnapshotVersion","expectedEntryCount",
  "requiredSuiteReceiptPath","requiredSuiteReceiptSha256","controlProofPath","controlProofSha256",
  "runtimeCapacityPath","runtimeCapacitySha256","runtimeLogPath","baseUrl","forgotConnector"
];

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
  finalCommit,kbVersion,entryCount,inventory,attestation,suite,controlProof
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
    || !Number.isSafeInteger(controlProof?.controls) || controlProof.controls < 1
    || controlProof.passed !== controlProof.controls || !Array.isArray(controlProof.names)
    || controlProof.names.length !== controlProof.controls) {
    throw new Error("GUIDE_HARNESS_BOUND_RECEIPT_INVALID");
  }
  return Object.freeze({ suiteFiles:Object.freeze([...suiteFiles]),controlCount:controlProof.controls });
}

function comparableSources(sources) {
  return sources.map(({ label }) => label);
}
function comparableActions(actions) {
  return actions.map(({ label,href }) => ({ label,href }));
}

export function assertGuideObservation({ row,proof,api,visible,diagnostic }) {
  if (api.text !== visible.text
    || JSON.stringify(comparableSources(api.sources)) !== JSON.stringify(visible.sources)
    || JSON.stringify(comparableActions(api.actions)) !== JSON.stringify(visible.actions)) {
    throw new Error("GUIDE_HARNESS_API_DOM_MISMATCH");
  }
  let responseOrigin;
  if (row.branch === "MODEL") {
    if (proof.branch !== "MODEL" || api.status !== 200 || api.outcome !== "ANSWER_GROUNDED"
      || !row.expectedSourceIds.includes(api.sources[0]?.id)
      || !proof.sourceIds.includes(api.sources[0]?.id)) {
      throw new Error("GUIDE_HARNESS_MODEL_RESULT_INVALID");
    }
    if (diagnostic.status === "ACCEPTED_DRAFT" && diagnostic.candidateCount === 0) {
      responseOrigin="MODEL_ACCEPTED_DRAFT";
    } else if (diagnostic.status === "ATTRIBUTED_RECOVERY" && diagnostic.candidateCount === 1) {
      responseOrigin="REVIEWED_FALLBACK";
    } else if (diagnostic.status === "ATTRIBUTED_REFUSAL" && diagnostic.candidateCount === 1) {
      responseOrigin="MODEL_REFUSAL";
    } else {
      throw new Error("GUIDE_HARNESS_ATTRIBUTION_AMBIGUOUS");
    }
    if (row.actionPolicy === "NONE" && api.actions.length !== 0) {
      throw new Error("GUIDE_HARNESS_UNEXPECTED_ACTION");
    }
    if (row.actionPolicy === "REQUIRE_CLOSED"
      && !api.actions.some(action => action.id === row.navigation?.actionId)) {
      throw new Error("GUIDE_HARNESS_REQUIRED_ACTION_MISSING");
    }
    if (!api.actions.every(action => proof.allowedActions.some(allowed =>
      allowed.id === action.id && allowed.label === action.label && allowed.href === action.href))) {
      throw new Error("GUIDE_HARNESS_UNBOUND_ACTION");
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

export function deriveDeclaredControlCount(results) {
  if (!Array.isArray(results) || results.some(value => typeof value !== "string" || value.length === 0)) {
    throw new Error("GUIDE_HARNESS_CONTROL_RESULT_INVALID");
  }
  return results.length;
}
