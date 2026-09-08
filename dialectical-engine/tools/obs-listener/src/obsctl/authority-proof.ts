import { createHash, createPublicKey, sign, timingSafeEqual, verify, type KeyObject } from "node:crypto";
import { canonicalJson, nullRecord, parseUniqueJsonText } from "./action-wire.js";

const HEX64 = /^[0-9a-f]{64}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const POSITIVE = /^[1-9][0-9]*$/u;

function fail(code: string): never { throw new TypeError(code); }
function domain(): Buffer { return Buffer.from("obs-authority-proof-signature/v1\0", "utf8"); }
function digest(value: Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }

function asObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail("FIX10_PROOF_SCHEMA");
  return value as Record<string, unknown>;
}

function validateBody(body: Record<string, unknown>): void {
  if (body.schema !== "obs-authority-proof/v2" || typeof body.proof_id !== "string" || !UUID.test(body.proof_id) ||
      typeof body.issued_at_ms !== "string" || !POSITIVE.test(body.issued_at_ms) ||
      typeof body.expires_at_ms !== "string" || !POSITIVE.test(body.expires_at_ms)) fail("FIX10_PROOF_SCHEMA");
  for (const field of ["armed_sha256", "activation_manifest_sha256", "policy_bundle_sha256"]) {
    if (typeof body[field] !== "string" || !HEX64.test(body[field])) fail("FIX10_PROOF_SCHEMA");
  }
  const runtime = body.runtime_evidence;
  if (!Array.isArray(runtime) || runtime.length !== 3) fail("FIX10_PROOF_RUNTIME");
  const expected = ["capture:api", "capture:runner", "capture:scheduler"];
  const occurrences = new Set<string>();
  const sourceRefs = new Set<string>();
  for (let index = 0; index < expected.length; index += 1) {
    const row = asObject(runtime[index]);
    const canary = asObject(row.canary);
    if (row.component !== expected[index] || row.state !== "ARMED" || canary.source !== "first_party") fail("FIX10_PROOF_RUNTIME");
    if (typeof canary.occurrence_id !== "string" || typeof canary.source_event_ref !== "string" ||
        occurrences.has(canary.occurrence_id) || sourceRefs.has(canary.source_event_ref)) fail("FIX10_PROOF_RUNTIME");
    occurrences.add(canary.occurrence_id); sourceRefs.add(canary.source_event_ref);
  }
  const gap = asObject(body.gap_window);
  if (gap.overlapping_first_party_rows !== "0" || gap.lost_count !== "0") fail("FIX10_PROOF_GAP");
  const spool = asObject(body.spool);
  if (spool.writable !== true || typeof spool.root_sha256 !== "string" || !HEX64.test(spool.root_sha256)) fail("FIX10_PROOF_SPOOL");
  const watchdog = asObject(body.watchdog);
  if (watchdog.result !== "VERIFIED" && watchdog.result !== "VERIFIED_WITH_RECOVERY") fail("FIX10_PROOF_WATCHDOG");
}

export function createAuthorityProof(bodyInput: Readonly<Record<string, unknown>>, privateKey: KeyObject): Readonly<Record<string, unknown>> {
  if (privateKey.type !== "private" || privateKey.asymmetricKeyType !== "ed25519") fail("FIX10_PROOF_KEY");
  const daemonProofKeyId = digest(createPublicKey(privateKey).export({ format: "der", type: "spki" }));
  const body = nullRecord([...Object.entries(bodyInput), ["daemon_proof_key_id", daemonProofKeyId]]);
  validateBody(body as Record<string, unknown>);
  const signature = sign(null, Buffer.concat([domain(), Buffer.from(canonicalJson(body), "utf8")]), privateKey).toString("base64");
  return nullRecord([...Object.entries(body), ["daemon_signature_base64", signature]]);
}

export interface ProofBindings {
  readonly nowMs: number; readonly stalenessMs: number; readonly armedSha256: string;
  readonly activationManifestSha256: string; readonly policyBundleSha256: string;
}

export function verifyAuthorityProof(bytes: string, publicKey: KeyObject, bindings: ProofBindings): Readonly<Record<string, unknown>> {
  if (!bytes.endsWith("\n") || bytes.includes("\r") || canonicalJson(parseUniqueJsonText(bytes.slice(0, -1))) !== bytes.slice(0, -1)) {
    fail("FIX10_PROOF_BYTES");
  }
  const completed = asObject(parseUniqueJsonText(bytes.slice(0, -1)));
  const signatureText = completed.daemon_signature_base64;
  if (typeof signatureText !== "string") fail("FIX10_PROOF_SIGNATURE");
  const signature = Buffer.from(signatureText, "base64");
  if (signature.length !== 64 || signature.toString("base64") !== signatureText) fail("FIX10_PROOF_SIGNATURE");
  const body = nullRecord(Object.entries(completed).filter(([key]) => key !== "daemon_signature_base64"));
  validateBody(body as Record<string, unknown>);
  const expectedKeyId = digest(publicKey.export({ format: "der", type: "spki" }));
  const actualKeyId = body.daemon_proof_key_id;
  if (typeof actualKeyId !== "string" || !timingSafeEqual(Buffer.from(expectedKeyId), Buffer.from(actualKeyId))) fail("FIX10_PROOF_KEY");
  if (!verify(null, Buffer.concat([domain(), Buffer.from(canonicalJson(body), "utf8")]), publicKey, signature)) fail("FIX10_PROOF_SIGNATURE");
  if (body.armed_sha256 !== bindings.armedSha256 || body.activation_manifest_sha256 !== bindings.activationManifestSha256 ||
      body.policy_bundle_sha256 !== bindings.policyBundleSha256) fail("FIX10_PROOF_BINDING");
  const issued = Number(body.issued_at_ms); const expires = Number(body.expires_at_ms);
  if (!Number.isSafeInteger(bindings.nowMs) || !Number.isSafeInteger(bindings.stalenessMs) ||
      expires - issued !== bindings.stalenessMs) fail("FIX10_PROOF_DURATION");
  if (issued > bindings.nowMs) fail("FIX10_PROOF_FUTURE");
  if (bindings.nowMs >= expires) fail("FIX10_PROOF_STALE");
  return body;
}
