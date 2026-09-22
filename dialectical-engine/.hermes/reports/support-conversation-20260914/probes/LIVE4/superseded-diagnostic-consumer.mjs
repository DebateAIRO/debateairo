const CODES = new Set([
  "RAW_TOO_LONG","JSON_INVALID","KEY_SET_INVALID","KIND_INVALID","SCHEMA_INVALID",
  "TEXT_EMPTY","TEXT_TOO_LONG","TEXT_LINK_OR_MARKUP","TEXT_SECRET_LIKE",
  "TEXT_CREDENTIAL_OR_SECURITY_ACTION","TEXT_SIX_DIGIT_CODE","TEXT_GROUPED_SECURITY_CODE",
  "TEXT_REDACTION_ECHO","TEXT_INTERNAL_IDENTIFIER","SOURCE_MEMBERSHIP_INVALID",
  "ACTION_MEMBERSHIP_INVALID"
]);
const PREDICATES = new Set([
  "RAW_LENGTH","JSON_SYNTAX","EXACT_KEY_SET","KIND","SCHEMA","TEXT_EMPTY","TEXT_LENGTH",
  "RAW_LINK_OR_PROTOCOL","ENCODED_LINK_OR_PATH","MARKUP","PATH_OR_ROUTE",
  "LABELLED_OR_TOKEN_SECRET","CREDENTIAL_OPERATION","SIX_DIGIT_CODE","GROUPED_SECURITY_CODE",
  "REDACTION_ECHO","NARRATIVE_INTERNAL_IDENTIFIER","SOURCE_MEMBERSHIP","ACTION_MEMBERSHIP"
]);
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const KEYS = [
  "code","attemptId","predicate","jsonValid","fenced","exactKeys","kindValid",
  "textCodePoints","sourceIdCount","allowedSourceIdCount","actionIdCount","allowedActionIdCount"
];

function parseLiteral(value) {
  if (/^'[^'\\]*'$/u.test(value)) return value.slice(1,-1);
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (/^(?:0|[1-9][0-9]*)$/u.test(value)) return Number(value);
  return undefined;
}

function projectBlock(block) {
  const lines = block.split("\n").slice(1,-1);
  const values = new Map();
  for (const line of lines) {
    const match = /^  ([A-Za-z][A-Za-z0-9]*): (.*?)(?:,)?$/u.exec(line);
    if (match === null || values.has(match[1])) return null;
    const parsed = parseLiteral(match[2]);
    if (parsed === undefined) return null;
    values.set(match[1],parsed);
  }
  if (values.size !== KEYS.length || KEYS.some((key) => !values.has(key))) return null;
  const rawCode = values.get("code");
  const code = typeof rawCode === "string" && rawCode.startsWith("SUPPORT_DRAFT_")
    ? rawCode.slice("SUPPORT_DRAFT_".length) : "";
  const attemptId = values.get("attemptId");
  const predicate = values.get("predicate");
  const booleans = ["jsonValid","fenced","exactKeys","kindValid"];
  const counts = ["sourceIdCount","allowedSourceIdCount","actionIdCount","allowedActionIdCount"];
  if (!CODES.has(code)
    || typeof attemptId !== "string" || !UUID_V4.test(attemptId)
    || typeof predicate !== "string" || !PREDICATES.has(predicate)
    || booleans.some((key) => typeof values.get(key) !== "boolean")
    || counts.some((key) => !Number.isSafeInteger(values.get(key)) || values.get(key) < 0)
    || !(values.get("textCodePoints") === null
      || (Number.isSafeInteger(values.get("textCodePoints")) && values.get("textCodePoints") >= 0))) {
    return null;
  }
  return Object.freeze({
    attemptId,code:`SUPPORT_DRAFT_${code}`,predicate,
    jsonValid: values.get("jsonValid"),fenced: values.get("fenced"),
    exactKeys: values.get("exactKeys"),kindValid: values.get("kindValid"),
    textCodePoints: values.get("textCodePoints"),
    sourceIdCount: values.get("sourceIdCount"),
    allowedSourceIdCount: values.get("allowedSourceIdCount"),
    actionIdCount: values.get("actionIdCount"),
    allowedActionIdCount: values.get("allowedActionIdCount")
  });
}

export function consumeSupportDiagnosticWindow(bytes,{ cursorStart,cursorEnd,seenAttemptIds }) {
  const window = bytes.subarray(cursorStart,cursorEnd).toString("utf8");
  const blocks = window.match(/\{\n(?:[^\n]*\n)*?\}/gu) ?? [];
  const candidates = blocks.filter((block) => block.includes("SUPPORT_DRAFT_"));
  const valid = candidates.flatMap((block) => {
    const projected = projectBlock(block);
    return projected === null ? [] : [projected];
  });
  const invalidCount = candidates.length-valid.length;
  const duplicateCount = valid.filter(({ attemptId }) => seenAttemptIds.has(attemptId)).length
    + (valid.length-new Set(valid.map(({ attemptId }) => attemptId)).size);
  const fixed = { cursorStart,cursorEnd,candidateCount:candidates.length,
    validCount:valid.length,invalidCount,duplicateCount };
  if (candidates.length === 0) return Object.freeze({ status:"NO_REJECTION_EVENT",...fixed });
  if (valid.length !== 1 || invalidCount !== 0 || duplicateCount !== 0) {
    return Object.freeze({ status:"AMBIGUOUS",...fixed });
  }
  seenAttemptIds.add(valid[0].attemptId);
  return Object.freeze({ status:"ATTRIBUTED",...fixed,record:valid[0] });
}
