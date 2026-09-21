import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";

import { canonicalJson } from "../../tools/obs-listener/src/obsctl/action-wire.js";
import { createAuthorityProof, verifyAuthorityProof } from "../../tools/obs-listener/src/obsctl/authority-proof.js";

const H = "a".repeat(64);
const UUID = "11111111-1111-4111-8111-111111111111";

function body() {
  return {
    schema: "obs-authority-proof/v2" as const, proof_id: UUID, issued_at_ms: "1000", expires_at_ms: "2000",
    armed_sha256: H, activation_manifest_sha256: H, policy_bundle_sha256: H,
    spool: { root_sha256: H, writable: true as const },
    gap_window: { start_ms: "0", end_ms: "1000", overlapping_first_party_rows: "0", lost_count: "0" },
    runtime_evidence: (["api", "runner", "scheduler"] as const).map((runtime, index) => ({
      component: `capture:${runtime}` as const, state: "ARMED" as const, health_observed_at_ms: "1000",
      canary: { runtime, source: "first_party" as const, capture_point: `cp-${runtime}`, fingerprint: H,
        occurrence_id: `11111111-1111-4111-8111-11111111111${index + 1}`, occ_seq: String(index + 1),
        chain_seq: String(index + 1), source_event_ref: `event-${runtime}`, writer_identity: `${runtime}-writer`,
        captured_at_ms: "1000", chain_link: H },
    })),
    watchdog: { witness_seq: "1", observed_at_ms: "1000", witness_hash: H, result: "VERIFIED" as const },
  };
}

describe("FIX-10 authority proof", () => {
  it("signs_and_verifies_exact_v2", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const proof = createAuthorityProof(body(), privateKey);
    const bytes = `${canonicalJson(proof)}\n`;
    expect(verifyAuthorityProof(bytes, publicKey, { nowMs: 1500, stalenessMs: 1000, armedSha256: H,
      activationManifestSha256: H, policyBundleSha256: H }).proof_id).toBe(UUID);
  });
  it("rejects_stale", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const proof = createAuthorityProof(body(), privateKey);
    expect(() => verifyAuthorityProof(`${canonicalJson(proof)}\n`, publicKey, { nowMs: 2000, stalenessMs: 1000,
      armedSha256: H, activationManifestSha256: H, policyBundleSha256: H })).toThrow("FIX10_PROOF_STALE");
  });
  it("rejects_armed_binding_mismatch", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const proof = createAuthorityProof(body(), privateKey);
    expect(() => verifyAuthorityProof(`${canonicalJson(proof)}\n`, publicKey, { nowMs: 1500, stalenessMs: 1000,
      armedSha256: "b".repeat(64), activationManifestSha256: H, policyBundleSha256: H })).toThrow("FIX10_PROOF_BINDING");
  });
  it("rejects_runtime_order_mutation", () => {
    const { privateKey } = generateKeyPairSync("ed25519");
    const value = body();
    value.runtime_evidence.reverse();
    expect(() => createAuthorityProof(value, privateKey)).toThrow("FIX10_PROOF_RUNTIME");
  });
});
