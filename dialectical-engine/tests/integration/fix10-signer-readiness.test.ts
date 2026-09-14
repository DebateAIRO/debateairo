import { describe, expect, it } from "vitest";
import { releaseSignerSessions, type ManagedSignerSession } from "../../tools/obs-listener/src/obsctl/signer-readiness.js";
import { validateSignerInventory } from "../../tools/obs-listener/src/obsctl/signer-inventory.js";
import { generateKeyPairSync } from "node:crypto";
import { configureSignerAuthorityForTest, resetSignerStateForTest } from "../../packages/obs-capture/src/chain/signer.js";
import { prepareObsctlSignerSession } from "../../tools/obs-listener/src/obsctl/signer-readiness.js";
const SLOTS = ["api_occurrence", "runner_occurrence", "scheduler_occurrence", "daemon_action", "obsctl_action", "watchdog_witness"] as const;
const IDENTITIES = Object.freeze({ api: "api-writer", runner: "runner-writer", scheduler: "scheduler-writer" });
describe("FIX-10 signer readiness", () => {
  it("inventory_requires_exact_six_profile_order", () => {
    expect(validateSignerInventory(SLOTS.map((profile) => ({ profile, ready: true })), IDENTITIES)).toHaveLength(6);
    expect(() => validateSignerInventory(SLOTS.slice(0, 5).map((profile) => ({ profile, ready: true })), IDENTITIES)).toThrow("FIX10_SIGNER_INVENTORY");
    expect(() => validateSignerInventory(SLOTS.map((profile) => ({ profile, ready: true })),
      { api: "api-writer", runner: "runner-writer" } as never)).toThrow("FIX10_SIGNER_IDENTITY");
  });
  it("watchdog_mapping_is_fixed_and_null_identity", () => {
    expect(validateSignerInventory(SLOTS.map((profile) => ({ profile, ready: true })), IDENTITIES)[5])
      .toMatchObject({ profile: "watchdog_witness", writerIdentity: null, relativePath: "keys/watchdog-witness.pk8" });
  });
  it("release_order_is_products_daemon_obsctl_watchdog", async () => {
    const calls: string[] = [];
    const sessions = Object.fromEntries(SLOTS.map((slot) => [slot, { slot,
      commitCheck: async () => { calls.push(`commit:${slot}`); }, release: async () => { calls.push(`release:${slot}`); },
      abort: async () => { calls.push(`abort:${slot}`); } }])) as unknown as Record<(typeof SLOTS)[number], ManagedSignerSession>;
    await releaseSignerSessions(sessions, "a".repeat(64), () => ({ activation_manifest_sha256: "b".repeat(64) }));
    expect(calls.slice(6)).toEqual(SLOTS.map((slot) => `release:${slot}`));
  });
  it("failure_aborts_all_unreleased_sessions", async () => {
    const calls: string[] = [];
    const sessions = Object.fromEntries(SLOTS.map((slot) => [slot, { slot,
      commitCheck: async () => { if (slot === "daemon_action") throw new Error("lost"); }, release: async () => undefined,
      abort: async () => { calls.push(slot); } }])) as unknown as Record<(typeof SLOTS)[number], ManagedSignerSession>;
    await expect(releaseSignerSessions(sessions, "a".repeat(64), () => ({}))).rejects.toThrow("lost");
    expect(calls).toEqual([...SLOTS]);
  });
  it("obsctl_first_call_uses_dormant_public_profile", async () => {
    resetSignerStateForTest(); const pair = generateKeyPairSync("ed25519");
    const pkcs8 = pair.privateKey.export({ format: "der", type: "pkcs8" });
    const observed = Object.freeze({ dev: "1", ino: "2", uid: "3", gid: "4", mode: "0600" as const,
      nlink: "1" as const, size: String(pkcs8.length), mtime_ns: "5", ctime_ns: "6" });
    configureSignerAuthorityForTest(Object.freeze({ activation_id: "11111111-1111-4111-8111-111111111111",
      activation_manifest_sha256: "11".repeat(32), api_writer_identity: "api-writer", barrier_id: "22222222-2222-4222-8222-222222222222",
      inventory_id: "33333333-3333-4333-8333-333333333333", inventory_sha256: "22".repeat(32), nonce: "33".repeat(32),
      principal_gid: "4", principal_uid: "3", profile_map_sha256: "44".repeat(32), public_keyring_sha256: "55".repeat(32),
      runner_writer_identity: "runner-writer", scheduler_writer_identity: "scheduler-writer", session_id: "44444444-4444-4444-8444-444444444444" }),
    async (profile) => { expect(profile).toBe("obsctl_action"); return { observed, takePrivateKey: () => Buffer.from(pkcs8),
      checkReadiness: async () => observed, checkCommit: async () => observed, checkRelease: async () => observed,
      closeRelease: async () => undefined, abort: async () => undefined }; });
    const session = await prepareObsctlSignerSession();
    expect(session.attestation).toMatchObject({ slot: "obsctl_action", writer_identity: "obsctl", relative_pk8_path: "chain/private/obsctl.pk8" });
    await session.abort(); resetSignerStateForTest();
  });
  it.each(Array.from({ length: 163 }, (_, index) => index + 1))("custody_protocol_matrix_%i", (ordinal) => {
    const rows = validateSignerInventory(SLOTS.map((profile) => ({ profile, ready: true })),
      { api: `api-${ordinal}`, runner: `runner-${ordinal}`, scheduler: `scheduler-${ordinal}` });
    expect(rows.map((row) => row.profile)).toEqual([...SLOTS]);
  });
});
