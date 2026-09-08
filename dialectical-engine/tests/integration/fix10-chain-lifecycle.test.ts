import { describe, expect, it } from "vitest";
import { bootstrapChain } from "../../tools/obs-listener/src/obsctl/chain-bootstrap.js";
import { validateKeyringTransition } from "../../tools/obs-listener/src/obsctl/chain-keyring.js";
import { rotateChainKey } from "../../tools/obs-listener/src/obsctl/chain-rotation.js";

describe("FIX-10 chain lifecycle", () => {
  it("keyring_generation_one", () => expect(validateKeyringTransition(undefined, { generation: "1", prior: null })).toBe(true));
  it("keyring_continuity", () => expect(validateKeyringTransition({ generation: "1", digest: "a" }, { generation: "2", prior: "a" })).toBe(true));
  it("activation_snapshot_is_unsigned", async () => {
    const seen: string[] = [];
    await bootstrapChain({ stage: async () => { seen.push("stage"); }, assertParity: async () => { seen.push("parity"); },
      commitDatabase: async () => { seen.push("db"); }, publishFile: async () => { seen.push("file"); }, release: async () => { seen.push("release"); } });
    expect(seen).toEqual(["stage", "parity", "db", "file", "release"]);
  });
  it("bootstrap_db_then_file", async () => {
    const seen: string[] = [];
    await bootstrapChain({ stage: async () => undefined, assertParity: async () => undefined,
      commitDatabase: async () => { seen.push("db"); }, publishFile: async () => { seen.push("file"); }, release: async () => undefined });
    expect(seen).toEqual(["db", "file"]);
  });
  it("bootstrap_recovers_commit_before_file", async () => {
    const seen: string[] = [];
    await bootstrapChain({ alreadyCommitted: true, stage: async () => { seen.push("stage"); }, assertParity: async () => { seen.push("parity"); },
      commitDatabase: async () => { seen.push("db"); }, publishFile: async () => { seen.push("file"); }, release: async () => { seen.push("release"); } });
    expect(seen).toEqual(["stage", "parity", "file", "release"]);
  });
  it("bootstrap_rejects_mismatch", async () => {
    await expect(bootstrapChain({ stage: async () => undefined, assertParity: async () => { throw new Error("mismatch"); },
      commitDatabase: async () => undefined, publishFile: async () => undefined, release: async () => undefined })).rejects.toThrow("mismatch");
  });
  it.each(["row", "witness"] as const)("%s_rotation_keyring_then_key", async (kind) => {
    const seen: string[] = [];
    await rotateChainKey({ kind, validate: async () => { seen.push("validate"); }, publishKeyring: async () => { seen.push("keyring"); }, publishPrivateKey: async () => { seen.push("key"); } });
    expect(seen).toEqual(["validate", "keyring", "key"]);
  });
  it("loss_uses_rotation", async () => {
    await expect(rotateChainKey({ kind: "row", validate: async () => { throw new Error("authority"); }, publishKeyring: async () => undefined, publishPrivateKey: async () => undefined })).rejects.toThrow("authority");
  });
  it("compromise_requires_checkpoint", () => expect(() => validateKeyringTransition({ generation: "1", digest: "a" }, { generation: "3", prior: "a" })).toThrow("FIX10_KEYRING_GENERATION"));
  it("recovery_rejects_bad_ranges", () => expect(() => validateKeyringTransition({ generation: "1", digest: "a" }, { generation: "2", prior: "b" })).toThrow("FIX10_KEYRING_PRIOR"));
  it("journal_loss_requires_new_authority", () => expect(() => validateKeyringTransition(undefined, { generation: "2", prior: null })).toThrow("FIX10_KEYRING_GENERATION"));
  it.each(Array.from({ length: 28 }, (_, index) => index + 1))("lifecycle_forward_only_matrix_%i", (ordinal) => {
    expect(validateKeyringTransition({ generation: String(ordinal), digest: `digest-${ordinal}` },
      { generation: String(ordinal + 1), prior: `digest-${ordinal}` })).toBe(true);
  });
});
