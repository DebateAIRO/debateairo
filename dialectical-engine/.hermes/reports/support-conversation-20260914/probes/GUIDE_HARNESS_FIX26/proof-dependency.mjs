import { createHash } from "node:crypto";

const SHA256=/^[0-9a-f]{64}$/u;
const COMMIT=/^[0-9a-f]{40}$/u;
const EXPECTED_MATRIX_SHA256="9238764acd4067a2c922ff3026187e29d424001994f8dda307ba6bf5847cfa2c";
const EXPECTED_VERIFIER_SHA256="ec3b11f7103402c1bf31bf4c09cc34f75216c8cfa5d2b117c81bce2345de85d6";
const EXPECTED_HARNESS_SHA256="4c1d66dcacd4f80517ca098f2d9113e08c9ce1b5f3449956e39c9d1a7a46bdcf";
const MAX_PROOF_AGE_MS=120_000;

const sha256=bytes => createHash("sha256").update(bytes).digest("hex");
const exactKeys=(value,keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value,key));
const fail=code => { throw new Error(code); };

export function validateGuideGated58Result({
  resultBytes,expectedRevision,expectedKbVersion,expectedGatePath,expectedGateSha256
}) {
  let result;
  try { result=JSON.parse(resultBytes.toString("utf8")); }
  catch { fail("GUIDE_CAPTURE_ROW_PROOF_RESULT_INVALID"); }
  if (!COMMIT.test(expectedRevision ?? "") || !SHA256.test(expectedKbVersion ?? "")
    || !SHA256.test(expectedGateSha256 ?? "")
    || result?.schemaVersion !== 1 || result?.node !== "GUIDE_HARNESS_FIX25"
    || result?.verdict !== "PASS" || result?.resultCode !== "GUIDE_ROW_PROOF_ALL_ROWS_PASS"
    || result?.kbVersion !== expectedKbVersion || result?.entryCount !== 44
    || !exactKeys(result?.traffic,["browser","sessions","supportRequests","modelRequests"])
    || result.traffic.browser !== false || result.traffic.sessions !== 0
    || result.traffic.supportRequests !== 0 || result.traffic.modelRequests !== 0
    || result?.custody?.targetRevision !== expectedRevision
    || result?.custody?.gatePath !== expectedGatePath
    || result?.custody?.gateSha256 !== expectedGateSha256
    || result?.custody?.matrixCount !== 58
    || result?.custody?.matrixSha256 !== EXPECTED_MATRIX_SHA256
    || result?.custody?.verifierSha256 !== EXPECTED_VERIFIER_SHA256
    || result?.custody?.harnessSha256 !== EXPECTED_HARNESS_SHA256
    || !Array.isArray(result?.rows) || result.rows.length !== 58
    || result.rows.some((row,index) => row?.sequence !== index+1
      || row?.result !== "PASS" || row?.code !== "GUIDE_ROW_PROOF_PASS")) {
    fail("GUIDE_CAPTURE_ROW_PROOF_RESULT_INVALID");
  }
  const owners=result.rows.slice(54).map(row => ({
    sequence:row.sequence,sources:row.expected?.sourceIds,
    requiredActionId:row.expected?.requiredActionId,allowedActionIds:row.derived?.allowedActionIds
  }));
  const expectedOwners=[
    { sequence:55,sources:["product-identity"],requiredActionId:null,allowedActionIds:[] },
    { sequence:56,sources:["product-identity"],requiredActionId:null,allowedActionIds:[] },
    { sequence:57,sources:["account-access"],requiredActionId:"sign-in",allowedActionIds:["sign-in"] },
    { sequence:58,sources:["account-access"],requiredActionId:"sign-up",allowedActionIds:["sign-up"] }
  ];
  if (JSON.stringify(owners) !== JSON.stringify(expectedOwners)) {
    fail("GUIDE_CAPTURE_ROW_PROOF_RESULT_INVALID");
  }
  return Object.freeze({ result,resultSha256:sha256(resultBytes),rowCount:58 });
}

export function validateGuideRowProofDependency({
  status,resultBytes,gateBytes,expectedRevision,expectedKbVersion,
  expectedGatePath,expectedResultPath,nowMs=Date.now()
}) {
  const statusKeys=["schemaVersion","phase","revision","status","signal","completedAtUtc",
    "resultPath","resultSha256","gatePath","gateSha256","validatedRows","validation"];
  const gateSha256=sha256(gateBytes);
  const measured=Date.parse(status?.completedAtUtc);
  if (!exactKeys(status,statusKeys) || status.schemaVersion !== 2 || status.phase !== "ROW_PROOF"
    || status.revision !== expectedRevision || status.status !== 0 || status.signal !== null
    || status.resultPath !== expectedResultPath || !SHA256.test(status.resultSha256 ?? "")
    || status.gatePath !== expectedGatePath || status.gateSha256 !== gateSha256
    || status.validatedRows !== 58 || status.validation !== "PASS"
    || !Number.isFinite(measured) || !Number.isFinite(nowMs)
    || measured > nowMs+5_000 || nowMs-measured > MAX_PROOF_AGE_MS) {
    fail("GUIDE_CAPTURE_ROW_PROOF_STATUS_INVALID");
  }
  const validated=validateGuideGated58Result({
    resultBytes,expectedRevision,expectedKbVersion,expectedGatePath,expectedGateSha256:gateSha256
  });
  if (validated.resultSha256 !== status.resultSha256) {
    fail("GUIDE_CAPTURE_ROW_PROOF_HASH_MISMATCH");
  }
  return Object.freeze({
    completedAtUtc:status.completedAtUtc,resultPath:status.resultPath,
    resultSha256:validated.resultSha256,gatePath:status.gatePath,
    gateSha256,validatedRows:validated.rowCount
  });
}
