import { generateKeyPairSync, sign, verify } from "node:crypto";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  abortAllPreparedSignersForTest,
  configureSignerAuthorityForTest,
  getReleasedSignerForTest,
  resetSignerStateForTest,
} from "../../packages/obs-capture/src/chain/signer.js";
import {
  prepareChainedWriterSigner,
} from "../../packages/obs-capture/src/chain/index.js";
import { CHAIN_SIGNER_PROFILES } from "../../packages/obs-capture/src/chain/signer.js";
import { canonicalJson } from "../../packages/obs-capture/src/chain/canonical.js";
import { openPinnedPrivateKey } from "../../packages/obs-capture/src/chain/private-key-helper.js";

const HEX = "11".repeat(32);
const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

function frozen<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) frozen(child);
    Object.freeze(value);
  }
  return value;
}

describe("FIX-09 chain keys", () => {
  it("proves Ed25519 identity, activation witness authority, path custody, rotation, recovery, and private-material absence", async () => {
    resetSignerStateForTest();
    const pair = generateKeyPairSync("ed25519");
    const pkcs8 = pair.privateKey.export({ format: "der", type: "pkcs8" });
    const calls: string[] = [];
    const observed = frozen({
      dev: "1", ino: "2", uid: "501", gid: "20", mode: "0600" as const, nlink: "1" as const,
      size: String(pkcs8.length), mtime_ns: "3", ctime_ns: "4",
    });
    configureSignerAuthorityForTest(frozen({
      activation_id: UUID_B,
      activation_manifest_sha256: HEX,
      api_writer_identity: "api-writer",
      barrier_id: UUID_A,
      inventory_id: UUID_B,
      inventory_sha256: "22".repeat(32),
      nonce: "33".repeat(32),
      principal_gid: "20",
      principal_uid: "501",
      profile_map_sha256: "44".repeat(32),
      public_keyring_sha256: "55".repeat(32),
      runner_writer_identity: "runner-writer",
      scheduler_writer_identity: "scheduler-writer",
      session_id: UUID_B,
    }), async (profile) => {
      expect(profile).toBe("daemon_action");
      const transfer = Buffer.from(pkcs8);
      return {
        abort: async () => { calls.push("abort"); },
        checkCommit: async () => { calls.push("commit"); return observed; },
        checkReadiness: async () => { calls.push("readiness"); return observed; },
        checkRelease: async () => { calls.push("release-check"); return observed; },
        closeRelease: async () => { calls.push("closed-ack:eof:stderr-eof:exit-0"); },
        observed,
        takePrivateKey: () => {
          calls.push("pkcs8-once");
          const result = Buffer.from(transfer);
          transfer.fill(0);
          return result;
        },
      };
    });

    expect(CHAIN_SIGNER_PROFILES).toEqual([
      "api_occurrence", "runner_occurrence", "scheduler_occurrence",
      "daemon_action", "obsctl_action",
    ]);
    await expect(prepareChainedWriterSigner("watchdog_witness" as never))
      .rejects.toThrow("FIX09_SIGNER_PROFILE");

    const session = await prepareChainedWriterSigner("daemon_action");
    expect(Object.keys(session)).toEqual(["attestation", "commitCheck", "release", "abort"]);
    expect(session.attestation).toMatchObject({
      schema: "obs-chain-signer-readiness/v2",
      slot: "daemon_action",
      writer_identity: "fixagent-daemon",
      relative_pk8_path: "chain/private/fixagent-daemon.pk8",
      derived_key_id: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    const unsignedReadiness = { ...session.attestation } as Record<string, unknown>;
    const readinessSignature = Buffer.from(String(unsignedReadiness.attestation_signature_base64), "base64");
    delete unsignedReadiness.attestation_signature_base64;
    const readinessMessage = Buffer.concat([
      Buffer.from("obs-chain-signer-readiness-signature/v2\0"),
      Buffer.from(canonicalJson(unsignedReadiness)),
    ]);
    expect(verify(null, readinessMessage, pair.publicKey, readinessSignature)).toBe(true);

    const commit = await session.commitCheck("66".repeat(32));
    expect(commit).toMatchObject({
      schema: "obs-chain-signer-commit-check/v1",
      commit_challenge: "66".repeat(32),
      pinned_key_id: session.attestation.derived_key_id,
    });
    await expect(session.commitCheck("77".repeat(32))).rejects.toThrow("FIX09_SIGNER_COMMIT_ONCE");
    const releaseRecord = frozen({
      schema: "obs-chain-signer-release/v1" as const,
      barrier_id: UUID_A,
      nonce: "33".repeat(32),
      session_id: UUID_B,
      slot: "daemon_action" as const,
      activation_manifest_sha256: HEX,
      public_keyring_sha256: "55".repeat(32),
      release_ordinal: "4",
    });
    const token = await session.release(releaseRecord);
    expect(Object.keys(token)).toEqual([]);
    const internal = getReleasedSignerForTest(
      "agent_action", "first_party", "fixagent-daemon", Buffer.from(HEX, "hex"),
    );
    const message = Buffer.from("row");
    expect(verify(null, message, pair.publicKey, internal.sign(message))).toBe(true);
    expect(() => (internal as unknown as { export(): unknown }).export()).toThrow();
    await expect(session.abort()).rejects.toThrow("FIX09_SIGNER_TERMINAL");
    expect(calls).toEqual([
      "pkcs8-once", "readiness", "commit", "release-check",
      "closed-ack:eof:stderr-eof:exit-0",
    ]);

    resetSignerStateForTest();
    configureSignerAuthorityForTest(frozen({
      activation_id: UUID_B, activation_manifest_sha256: HEX,
      api_writer_identity: "api-writer", barrier_id: UUID_A, inventory_id: UUID_B,
      inventory_sha256: "22".repeat(32), nonce: "33".repeat(32), principal_gid: "20",
      principal_uid: "501", profile_map_sha256: "44".repeat(32),
      public_keyring_sha256: "55".repeat(32), runner_writer_identity: "runner-writer",
      scheduler_writer_identity: "scheduler-writer", session_id: UUID_B,
    }), async () => ({
      abort: async () => { calls.push("abort"); },
      checkCommit: async () => observed,
      checkReadiness: async () => observed,
      checkRelease: async () => observed,
      closeRelease: async () => undefined,
      observed,
      takePrivateKey: () => Buffer.from(pkcs8),
    }));
    const aborted = await prepareChainedWriterSigner("daemon_action");
    await aborted.abort();
    await expect(aborted.release(releaseRecord)).rejects.toThrow("FIX09_SIGNER_TERMINAL");
    await abortAllPreparedSignersForTest();

    const nativeSource = await readFile(new URL(
      "../../packages/obs-capture/native/fix09-openat-read.c", import.meta.url,
    ), "utf8");
    expect(nativeSource).toContain("#define __STDC_WANT_LIB_EXT1__ 1");
    expect(nativeSource).toContain("#include \"fix09-profile-table.generated.h\"");
    expect(nativeSource).toContain("openat(");
    expect(nativeSource).toContain("fstatat(");
    expect(nativeSource.match(/memset_s\s*\(/gu)).toHaveLength(2);
    expect(nativeSource).not.toMatch(/\b(?:sign|socket|connect|listen|accept)\s*\(/u);
    expect(nativeSource).not.toContain("static unsigned char key_read_buffer");
    const nativeSession=nativeSource.slice(
      nativeSource.indexOf("int fix09_run_session("),
      nativeSource.indexOf("\nint main("),
    );
    expect(nativeSession).toContain("unsigned char key_read_buffer[KEY_CAP]");
    expect(nativeSession).toContain("unsigned char key_frame_buffer[FRAME_CAP]");
    expect(nativeSession.match(/fix09_wipe_secret_buffers\s*\(/gu)).toHaveLength(1);
    expect(nativeSession.match(/fix09_scan_secret_buffers_zero\s*\(/gu)).toHaveLength(1);
    expect(nativeSession).not.toMatch(/memcpy\s*\(response[^;]*key_read_buffer/u);
    for(const predecessor of ["success","partial_write","read_error","protocol_error","early_error"]){
      expect(nativeSession).toContain(`FIX09_CLEANUP_MARKER(${predecessor})`);
    }
    expect(sign(null, Buffer.from("proof"), pair.privateKey)).toHaveLength(64);

    const header = `#ifndef FIX09_PROFILE_TABLE_GENERATED_H
#define FIX09_PROFILE_TABLE_GENERATED_H 1
#include <stdint.h>
enum fix09_identity_rule {
  FIX09_IDENTITY_INVENTORY_API = 1,
  FIX09_IDENTITY_INVENTORY_RUNNER = 2,
  FIX09_IDENTITY_INVENTORY_SCHEDULER = 3,
  FIX09_IDENTITY_LITERAL_FIXAGENT_DAEMON = 4,
  FIX09_IDENTITY_LITERAL_OBSCTL = 5,
  FIX09_IDENTITY_JSON_NULL = 6
};
enum fix09_leaf_rule {
  FIX09_LEAF_CHAIN_PRIVATE_IDENTITY = 1,
  FIX09_LEAF_KEYS_WATCHDOG_WITNESS = 2
};
#define FIX09_PROFILE_COUNT UINT8_C(6)
#define FIX09_PROFILE_ROWS(X) \\
X(UINT8_C(1), "api_occurrence", FIX09_IDENTITY_INVENTORY_API, FIX09_LEAF_CHAIN_PRIVATE_IDENTITY) \\
X(UINT8_C(2), "runner_occurrence", FIX09_IDENTITY_INVENTORY_RUNNER, FIX09_LEAF_CHAIN_PRIVATE_IDENTITY) \\
X(UINT8_C(3), "scheduler_occurrence", FIX09_IDENTITY_INVENTORY_SCHEDULER, FIX09_LEAF_CHAIN_PRIVATE_IDENTITY) \\
X(UINT8_C(4), "daemon_action", FIX09_IDENTITY_LITERAL_FIXAGENT_DAEMON, FIX09_LEAF_CHAIN_PRIVATE_IDENTITY) \\
X(UINT8_C(5), "obsctl_action", FIX09_IDENTITY_LITERAL_OBSCTL, FIX09_LEAF_CHAIN_PRIVATE_IDENTITY) \\
X(UINT8_C(6), "watchdog_witness", FIX09_IDENTITY_JSON_NULL, FIX09_LEAF_KEYS_WATCHDOG_WITNESS)
#endif
`;
    expect(Buffer.byteLength(header)).toBe(1_163);
    expect(createHash("sha256").update(header).digest("hex"))
      .toBe("edab5a0bd5d4e55f3c032fc6ec811071cb0f92b7e21fe5819b8d80bfb9ec7768");
    const root = await mkdtemp(join(tmpdir(), "fix09-key-custody-"));
    const build = join(root, "build");
    const chain = join(root, "chain");
    const privateDirectory = join(chain, "private");
    await mkdir(build, { mode: 0o700 });
    await mkdir(chain, { mode: 0o700 });
    await mkdir(privateDirectory, { mode: 0o700 });
    await writeFile(join(build, "fix09-profile-table.generated.h"), header, { mode: 0o600 });
    const helper = join(chain, "fix09-openat-read");
    const compiled = spawnSync("/usr/bin/clang", [
      "-std=c17", "-O2", "-fno-common", "-fstack-protector-strong", "-Wall", "-Wextra",
      "-Werror", "-Wpedantic", "-Werror=implicit-function-declaration", "-I", build,
      new URL("../../packages/obs-capture/native/fix09-openat-read.c", import.meta.url).pathname,
      "-o", helper,
    ], { env: {}, encoding: "utf8" });
    expect({ status: compiled.status, stderr: compiled.stderr }).toEqual({ status: 0, stderr: "" });
    await chmod(helper, 0o550);
    await writeFile(join(privateDirectory, "fixagent-daemon.pk8"), pkcs8, { mode: 0o600 });
    const helperHash = createHash("sha256").update(await readFile(helper)).digest("hex");
    const saved = {
      OBS_CONTROL_DIR: process.env.OBS_CONTROL_DIR,
      OBS_CHAIN_HELPER_PATH: process.env.OBS_CHAIN_HELPER_PATH,
      OBS_CHAIN_HELPER_SHA256: process.env.OBS_CHAIN_HELPER_SHA256,
      OBS_CHAIN_PROVISIONER_UID: process.env.OBS_CHAIN_PROVISIONER_UID,
    };
    process.env.OBS_CONTROL_DIR = root;
    process.env.OBS_CHAIN_HELPER_PATH = helper;
    process.env.OBS_CHAIN_HELPER_SHA256 = helperHash;
    process.env.OBS_CHAIN_PROVISIONER_UID = String(process.getuid?.() ?? 501);
    try {
      const native = await openPinnedPrivateKey("daemon_action", frozen({
        activation_id: UUID_B, activation_manifest_sha256: HEX,
        api_writer_identity: "api-writer", barrier_id: UUID_A, inventory_id: UUID_B,
        inventory_sha256: "22".repeat(32), nonce: "33".repeat(32),
        principal_gid: String(process.getgid?.() ?? 20),
        principal_uid: String(process.getuid?.() ?? 501),
        profile_map_sha256: "44".repeat(32), public_keyring_sha256: "55".repeat(32),
        runner_writer_identity: "runner-writer", scheduler_writer_identity: "scheduler-writer",
        session_id: UUID_B,
      }));
      const nativeKey = native.takePrivateKey();
      expect(Buffer.from(nativeKey)).toEqual(pkcs8);
      nativeKey.fill(0);
      expect(await native.checkReadiness()).toEqual(native.observed);
      expect(await native.checkCommit("66".repeat(32))).toEqual(native.observed);
      const nativeRecord = frozen({
        schema: "obs-chain-signer-release/v1" as const, barrier_id: UUID_A,
        nonce: "33".repeat(32), session_id: UUID_B, slot: "daemon_action" as const,
        activation_manifest_sha256: HEX, public_keyring_sha256: "55".repeat(32),
        release_ordinal: "4",
      });
      expect(await native.checkRelease(nativeRecord)).toEqual(native.observed);
      await native.closeRelease(nativeRecord);
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
