const SHA256 = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const PRODUCT_ROOT = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const EXACT_GATE_KEYS = [
  "schemaVersion","productRoot","finalCommit","inventoryPath","inventorySha256",
  "attestationPath","attestationSha256","expectedSnapshotVersion","expectedEntryCount",
  "recovery","controlProofPath","controlProofSha256","runtimeLogPath","baseUrl"
];

function exactKeys(value,keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value,key));
}

function safeFirstPartyHref(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")
    || value.includes("\\") || /[\p{Cc}\p{Cf}]/u.test(value)) return false;
  try {
    const parsed = new URL(value,"https://support.invalid");
    return parsed.origin === "https://support.invalid" && parsed.username === ""
      && parsed.password === "" && !/(?:^|[?&])(?:token|code|secret|key|case)=/iu.test(value);
  } catch { return false; }
}

export function validateFinalGateInput(value) {
  const recoveryValid = exactKeys(value?.recovery,["status"])
    ? value.recovery.status === "UNAVAILABLE"
    : exactKeys(value?.recovery,["status","action"])
      && value.recovery.status === "VERIFIED"
      && exactKeys(value.recovery.action,["id","label","href"])
      && value.recovery.action.id === "forgot-password"
      && exactKeys(value.recovery.action.label,["en","ro"])
      && value.recovery.action.label.en === "Forgot password"
      && value.recovery.action.label.ro === "Am uitat parola"
      && safeFirstPartyHref(value.recovery.action.href);
  if (!exactKeys(value,EXACT_GATE_KEYS) || value.schemaVersion !== 1
    || value.productRoot !== PRODUCT_ROOT || !COMMIT.test(value.finalCommit)
    || ![value.inventoryPath,value.attestationPath,value.controlProofPath,value.runtimeLogPath]
      .every(path => typeof path === "string" && path.startsWith("/"))
    || ![value.inventorySha256,value.attestationSha256,value.expectedSnapshotVersion,value.controlProofSha256]
      .every(hash => SHA256.test(hash))
    || !Number.isSafeInteger(value.expectedEntryCount) || value.expectedEntryCount < 38
    || value.baseUrl !== "https://localhost:3100" || !recoveryValid) {
    throw new Error("HARNESS_FEEDBACK_FINAL_GATE_INVALID");
  }
  return Object.freeze(value);
}

function comparableSources(sources) {
  return sources.map(({ label }) => label);
}
function comparableActions(actions) {
  return actions.map(({ label,href }) => ({ label,href }));
}

export function assertFeedbackObservation({ row,proof,api,visible,diagnostic }) {
  const sourceEqual = JSON.stringify(comparableSources(api.sources)) === JSON.stringify(visible.sources);
  const actionEqual = JSON.stringify(comparableActions(api.actions)) === JSON.stringify(visible.actions);
  if (api.text !== visible.text || !sourceEqual || !actionEqual) {
    throw new Error("HARNESS_FEEDBACK_API_DOM_MISMATCH");
  }
  let responseOrigin;
  if (row.branch === "MODEL") {
    if (proof.branch !== "MODEL" || proof.topSourceId !== row.topSourceId
      || api.status !== 200 || api.outcome !== "ANSWER_GROUNDED"
      || api.sources[0]?.id !== row.topSourceId) {
      throw new Error("HARNESS_FEEDBACK_MODEL_RESULT_INVALID");
    }
    if (diagnostic.status === "ACCEPTED_DRAFT" && diagnostic.candidateCount === 0) {
      responseOrigin = "MODEL_ACCEPTED_DRAFT";
    } else if (diagnostic.status === "ATTRIBUTED_RECOVERY" && diagnostic.candidateCount === 1) {
      responseOrigin = "REVIEWED_FALLBACK";
    } else if (diagnostic.status === "ATTRIBUTED_REFUSAL" && diagnostic.candidateCount === 1) {
      responseOrigin = "MODEL_REFUSAL";
    } else {
      throw new Error("HARNESS_FEEDBACK_ATTRIBUTION_AMBIGUOUS");
    }
  } else {
    if (diagnostic.candidateCount !== 0) {
      throw new Error("HARNESS_FEEDBACK_UNEXPECTED_MODEL_DIAGNOSTIC");
    }
    if (row.branch === "DETERMINISTIC_RECOVERY") {
      if (proof.branch !== row.branch || api.status !== 200 || api.outcome !== "REFUSE_ZONE"
        || api.sources.length !== 0) throw new Error("HARNESS_FEEDBACK_RECOVERY_RESULT_INVALID");
      const expected = proof.actionStatus === "VERIFIED" ? [proof.action] : [];
      if (JSON.stringify(api.actions) !== JSON.stringify(expected)) {
        throw new Error("HARNESS_FEEDBACK_RECOVERY_ACTION_MISMATCH");
      }
      responseOrigin = "DETERMINISTIC_RECOVERY";
    } else if (row.branch === "DETERMINISTIC_NO_SOURCE") {
      if (proof.branch !== row.branch || proof.sourceIds.length !== 0 || proof.actionIds.length !== 0
        || api.status !== 200 || api.outcome !== "NO_SOURCE"
        || api.sources.length !== 0 || api.actions.length !== 0) {
        throw new Error("HARNESS_FEEDBACK_NO_SOURCE_RESULT_INVALID");
      }
      responseOrigin = "DETERMINISTIC_NO_SOURCE";
    } else throw new Error("HARNESS_FEEDBACK_BRANCH_INVALID");
  }
  return Object.freeze({
    responseOrigin,apiDomTextEqual:true,apiDomSourcesEqual:true,apiDomActionsEqual:true
  });
}

export function deriveDeclaredControlCount(results) {
  if (!Array.isArray(results) || results.some(value => typeof value !== "string" || value.length === 0)) {
    throw new Error("HARNESS_FEEDBACK_CONTROL_RESULT_INVALID");
  }
  return results.length;
}
