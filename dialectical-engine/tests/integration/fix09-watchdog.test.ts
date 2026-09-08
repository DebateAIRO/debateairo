import { createHash, generateKeyPairSync, randomUUID, sign, type KeyObject } from "node:crypto";
import {
  chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, unlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { canonicalJson, emptyLegacyDigest, keyIdFromPublicKey } from "../../packages/obs-capture/src/chain/verify.js";
import type { WitnessAuthorization } from "../../packages/obs-capture/src/chain/witness.js";
import { runWatchdogOnce } from "../../tools/obs-listener/src/watchdog.js";
import { createWatchdog, readWatchdogConfig } from "../../tools/obs-listener/src/watchdog/main.js";
import type {
  WatchdogDatabase, WatchdogDatabaseSnapshot, WatchdogHealthSignal,
} from "../../tools/obs-listener/src/watchdog/database.js";

const roots: string[] = [];
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const domain = (value: string) => Buffer.concat([Buffer.from(value), Buffer.from([0])]);
const spki = (key: KeyObject) => key.export({ format: "der", type: "spki" }) as Buffer;

interface Fixture {
  readonly root: string;
  readonly environment: Record<string, string>;
  database: WatchdogDatabase;
  readonly health: WatchdogHealthSignal[];
  readonly custodianPrivateKey: KeyObject;
  readonly witnessKeyId: string;
  readonly paths: Readonly<Record<"activation" | "journal" | "keyring" | "privateKey", string>>;
  databaseDown: boolean;
  snapshot: WatchdogDatabaseSnapshot;
}

function signedKeyring(custodian: KeyObject): Buffer {
  const unsigned = { created_at: "2026-09-05T00:00:00.000Z", custodian_key_id: keyIdFromPublicKey(custodian),
    entries: [], epoch: "1", generation: "1", prior_keyring_sha256: "0".repeat(64),
    protocol: "obs-chain-public-keyring/v1", recovery_checkpoints: [], witness_keys: [] };
  const bytes = Buffer.from(canonicalJson(unsigned));
  return Buffer.from(canonicalJson({ ...unsigned,
    custodian_signature_base64: sign(null, Buffer.concat([domain("obs-chain-keyring-signature/v1"), bytes]), custodian).toString("base64") }));
}

function fixture(): Fixture {
  const uid = process.getuid!();
  const gid = process.getgid!();
  const root = realpathSync(mkdtempSync(join(tmpdir(), "fix09-watchdog-")));
  roots.push(root);
  const chain = join(root, "chain");
  const keys = join(root, "keys");
  const witnessDirectory = join(root, "witness");
  mkdirSync(chain, { mode: 0o750 });
  mkdirSync(keys, { mode: 0o711 });
  mkdirSync(witnessDirectory, { mode: 0o700 });
  chmodSync(root, 0o751);
  const custodian = generateKeyPairSync("ed25519");
  const witness = generateKeyPairSync("ed25519");
  const keyringBytes = signedKeyring(custodian.privateKey);
  const unsigned = {
    activated_at: "2026-09-05T00:00:00.000Z", activation_id: randomUUID(),
    agent_action_legacy_count: "0", agent_action_legacy_digest: emptyLegacyDigest(), agent_action_legacy_max_seq: "0",
    chain_protocol: "obs-audit-chain/v1", created_by_custodian_id: "V", custodian_key_id: keyIdFromPublicKey(custodian.publicKey),
    occurrence_legacy_count: "0", occurrence_legacy_digest: emptyLegacyDigest(), occurrence_legacy_max_seq: "0",
    protocol: "obs-chain-activation/v1", public_keyring_sha256: hash(keyringBytes),
    witness_bootstrap_key_id: keyIdFromPublicKey(witness.publicKey), witness_bootstrap_min_seq: "1",
    witness_bootstrap_spki_der_base64: spki(witness.publicKey).toString("base64"),
  };
  const unsignedBytes = Buffer.from(canonicalJson(unsigned));
  const manifestSha256 = hash(unsignedBytes);
  const activationBytes = Buffer.from(canonicalJson({ ...unsigned, manifest_sha256: manifestSha256,
    custodian_signature_base64: sign(null, Buffer.concat([domain("obs-chain-activation-signature/v1"), unsignedBytes]), custodian.privateKey).toString("base64") }));
  const paths = Object.freeze({ activation: join(chain, "activation.json"), journal: join(witnessDirectory, "watchdog-chain.jsonl"),
    keyring: join(chain, "public-keyring.json"), privateKey: join(keys, "watchdog-witness.pk8") });
  writeFileSync(join(chain, "custodian-root.spki"), spki(custodian.publicKey), { mode: 0o440 });
  writeFileSync(paths.activation, activationBytes, { mode: 0o440 });
  writeFileSync(paths.keyring, keyringBytes, { mode: 0o440 });
  writeFileSync(paths.privateKey, witness.privateKey.export({ format: "der", type: "pkcs8" }), { mode: 0o600 });
  writeFileSync(paths.journal, "", { mode: 0o600 });
  for (const path of [join(chain, "custodian-root.spki"), paths.activation, paths.keyring]) chmodSync(path, 0o440);
  chmodSync(paths.privateKey, 0o600);
  chmodSync(paths.journal, 0o600);
  const health: WatchdogHealthSignal[] = [];
  const value = {
    activation: { protocol: "obs-audit-chain/v1", activation_id: unsigned.activation_id,
      activated_at: unsigned.activated_at, occurrence_legacy_max_seq: "0", occurrence_legacy_count: "0",
      occurrence_legacy_digest: emptyLegacyDigest(), agent_action_legacy_max_seq: "0", agent_action_legacy_count: "0",
      agent_action_legacy_digest: emptyLegacyDigest(), initial_public_keyring_sha256: hash(keyringBytes),
      activation_manifest_sha256: manifestSha256, created_by_custodian_id: "V" },
    audit: { snapshotText: "10:10:", occurrenceHighWater: "0", agentActionHighWater: "0",
      occurrenceRows: Object.freeze([]), agentActionRows: Object.freeze([]) },
    daemon: { state: "PASS", detailCode: "NONE", observedAt: "2026-09-05T00:00:00.000Z",
      latestOccurrenceSeq: "0", cursorOccurrenceSeq: "0" },
  } satisfies WatchdogDatabaseSnapshot;
  const result: Fixture = {
    root, paths, health, databaseDown: false, snapshot: value,
    custodianPrivateKey: custodian.privateKey, witnessKeyId: keyIdFromPublicKey(witness.publicKey),
    environment: { OBS_WATCHDOG_DATABASE_URL: "postgresql://watchdog.invalid/test", OBS_CONTROL_DIR: root,
      OBS_WATCHDOG_INTERVAL_MS: "100", OBS_WATCHDOG_HEARTBEAT_STALE_MS: "1000", OBS_WATCHDOG_CURSOR_LAG_LIMIT: "5",
      V_PROVISIONER_UID: String(uid), OBS_CHAIN_PUBLIC_GID: String(gid), WATCHDOG_UID: String(uid), WATCHDOG_GID: String(gid) },
    database: undefined as unknown as WatchdogDatabase,
  };
  result.database = Object.freeze({
    readSnapshot: async () => { if (result.databaseDown) throw new Error("secret database failure"); return result.snapshot; },
    writeHealth: async (signal: WatchdogHealthSignal) => { expect(readFileSync(paths.journal).toString("utf8").split("\n").filter(Boolean).length).toBeGreaterThan(0); health.push(signal); },
    close: async () => undefined,
  });
  return result;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("FIX-09 watchdog process", () => {
  it("proves authorized invalid-keyring records, cold-start exit 78, last-known-good activation, health, and privacy", async () => {
    const firstFixture = fixture();
    expect(() => readWatchdogConfig({ ...firstFixture.environment, OBS_WATCHDOG_CURSOR_LAG_LIMIT: "raw" })).toThrow("FIX09_WATCHDOG_CONFIG");
    const ids = ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000003"];
    const clock = { now: () => new Date("2026-09-05T00:00:00.500Z"), cycleId: () => ids.shift()!, database: firstFixture.database };
    const watchdog = createWatchdog(readWatchdogConfig(firstFixture.environment), clock);
    const first = await watchdog.cycle();
    expect(first).toMatchObject({ chain: { result: "VERIFIED", reason: "NONE" }, heartbeat: { state: "HEALTHY", age_ms: "500" },
      cursor: { state: "CURRENT", lag: "0" }, health: { state: "PASS", detailCode: "NONE" }, health_persisted: true,
      witness: { sequence: "1", appended: true } });
    expect(firstFixture.health).toHaveLength(1);
    const firstBytes = readFileSync(firstFixture.paths.journal);

    chmodSync(firstFixture.paths.keyring, 0o600);
    writeFileSync(firstFixture.paths.keyring, "{}");
    chmodSync(firstFixture.paths.keyring, 0o440);
    const invalidKeyring = await watchdog.cycle();
    expect(invalidKeyring.chain).toEqual({ result: "KEYRING_INVALID", reason: "KEYRING_FORMAT" });
    expect(statLines(firstFixture.paths.journal)).toBe(2);
    unlinkSync(firstFixture.paths.activation);
    const replacement = await watchdog.cycle();
    expect(replacement.chain).toEqual({ result: "VERIFY_UNAVAILABLE", reason: "PUBLIC_MATERIAL_UNAVAILABLE" });
    expect(statLines(firstFixture.paths.journal)).toBe(3);
    expect(readFileSync(firstFixture.paths.journal).toString("utf8")).not.toMatch(/secret|password|action_payload|template_parameters|frames|user_id/u);
    await watchdog.stop();

    const missingKeyringFixture = fixture();
    const missingKeyring = createWatchdog(readWatchdogConfig(missingKeyringFixture.environment), {
      ...clock, database: missingKeyringFixture.database,
      cycleId: () => "00000000-0000-4000-8000-000000000004",
    });
    await missingKeyring.cycle();
    unlinkSync(missingKeyringFixture.paths.keyring);
    expect(await missingKeyring.cycle()).toMatchObject({
      chain: { result: "VERIFY_UNAVAILABLE", reason: "PUBLIC_MATERIAL_UNAVAILABLE" },
      health: { state: "TRIPPED", detailCode: "VERIFY_UNAVAILABLE" },
    });
    expect(statLines(missingKeyringFixture.paths.journal)).toBe(2);
    await missingKeyring.stop();

    const restartFixture = fixture();
    const firstRun = createWatchdog(readWatchdogConfig(restartFixture.environment), { ...clock, database: restartFixture.database,
      cycleId: () => "00000000-0000-4000-8000-000000000010" });
    await firstRun.cycle();
    await firstRun.stop();
    const sizeBeforeRestart = readFileSync(restartFixture.paths.journal).length;
    const restarted = createWatchdog(readWatchdogConfig(restartFixture.environment), { ...clock, database: restartFixture.database,
      cycleId: () => "00000000-0000-4000-8000-000000000011" });
    expect((await restarted.cycle()).witness.sequence).toBe("2");
    expect(readFileSync(restartFixture.paths.journal).length).toBeGreaterThan(sizeBeforeRestart);
    await restarted.stop();

    const rotationFixture = fixture();
    let transition: WitnessAuthorization | null = null;
    const rotating = createWatchdog(readWatchdogConfig(rotationFixture.environment), { ...clock,
      database: rotationFixture.database, transitionAuthorization: () => transition,
      cycleId: () => transition === null ? "00000000-0000-4000-8000-000000000012" : "00000000-0000-4000-8000-000000000013" });
    const beforeRotation = await rotating.cycle();
    const nextWitness = generateKeyPairSync("ed25519");
    const authorizationUnsigned = {
      custodian_key_id: keyIdFromPublicKey(rotationFixture.custodianPrivateKey), min_witness_seq: "2",
      new_witness_key_id: keyIdFromPublicKey(nextWitness.publicKey),
      new_witness_spki_der_base64: spki(nextWitness.publicKey).toString("base64"),
      prior_witness_hash: beforeRotation.witness.hash, prior_witness_key_id: rotationFixture.witnessKeyId,
      prior_witness_seq: "1", reason: "PLANNED_ROTATION" as const, recovery_checkpoint_sha256: null,
      recovery_id: null, schema: "obs-witness-key-authorization/v1" as const,
    };
    transition = Object.freeze({ ...authorizationUnsigned,
      custodian_signature_base64: sign(null, Buffer.concat([
        domain("obs-witness-key-authorization-signature/v1"), Buffer.from(canonicalJson(authorizationUnsigned)),
      ]), rotationFixture.custodianPrivateKey).toString("base64") });
    writeFileSync(rotationFixture.paths.privateKey,
      nextWitness.privateKey.export({ format: "der", type: "pkcs8" }), { mode: 0o600 });
    chmodSync(rotationFixture.paths.privateKey, 0o600);
    expect((await rotating.cycle()).witness.sequence).toBe("2");
    expect(statLines(rotationFixture.paths.journal)).toBe(2);
    await rotating.stop();

    const staleFixture = fixture();
    staleFixture.snapshot = { ...staleFixture.snapshot, daemon: { ...staleFixture.snapshot.daemon,
      observedAt: "2026-09-04T23:59:00.000Z", latestOccurrenceSeq: "10", cursorOccurrenceSeq: "0" } };
    const stale = createWatchdog(readWatchdogConfig(staleFixture.environment), { ...clock, database: staleFixture.database,
      cycleId: () => "00000000-0000-4000-8000-000000000020" });
    expect(await stale.cycle()).toMatchObject({ chain: { result: "VERIFIED" }, heartbeat: { state: "STALE" },
      cursor: { state: "LAGGING", lag: "10" }, health: { state: "TRIPPED", detailCode: "DAEMON_HEARTBEAT_STALE" } });
    staleFixture.databaseDown = true;
    const down = await stale.cycle();
    expect(down).toMatchObject({ chain: { result: "VERIFY_UNAVAILABLE", reason: "DATABASE_UNAVAILABLE" },
      cursor: { state: "UNAVAILABLE", lag: null }, health_persisted: false });
    await stale.stop();

    const invalidActivation = fixture();
    chmodSync(invalidActivation.paths.activation, 0o600);
    writeFileSync(invalidActivation.paths.activation, "{}");
    chmodSync(invalidActivation.paths.activation, 0o440);
    const beforeInvalid = readFileSync(invalidActivation.paths.journal);
    const activationFailure = await runWatchdogOnce(invalidActivation.environment, { database: invalidActivation.database });
    expect(activationFailure).toEqual({ exitCode: 78, stdout: "", stderr: "{\"code\":\"ACTIVATION_INVALID_NO_WITNESS\",\"exit_code\":\"78\",\"journal_appended\":false,\"status\":\"FAIL_CLOSED\"}\n" });
    expect(readFileSync(invalidActivation.paths.journal)).toEqual(beforeInvalid);
    expect(invalidActivation.health).toHaveLength(0);

    const torn = fixture();
    writeFileSync(torn.paths.journal, "{", { mode: 0o600 });
    chmodSync(torn.paths.journal, 0o600);
    expect(await runWatchdogOnce(torn.environment, { database: torn.database })).toEqual({ exitCode: 78, stdout: "",
      stderr: "{\"code\":\"WITNESS_JOURNAL_INVALID_NO_APPEND\",\"exit_code\":\"78\",\"journal_appended\":false,\"status\":\"FAIL_CLOSED\"}\n" });

    const wrongKey = fixture();
    writeFileSync(wrongKey.paths.privateKey, generateKeyPairSync("ed25519").privateKey.export({ format: "der", type: "pkcs8" }), { mode: 0o600 });
    chmodSync(wrongKey.paths.privateKey, 0o600);
    expect(await runWatchdogOnce(wrongKey.environment, { database: wrongKey.database })).toEqual({ exitCode: 78, stdout: "",
      stderr: "{\"code\":\"WITNESS_KEY_UNAUTHORIZED_NO_APPEND\",\"exit_code\":\"78\",\"journal_appended\":false,\"status\":\"FAIL_CLOSED\"}\n" });

    const dbDown = fixture();
    dbDown.databaseDown = true;
    expect(await runWatchdogOnce(dbDown.environment, { database: dbDown.database })).toEqual({ exitCode: 78, stdout: "",
      stderr: "{\"code\":\"ACTIVATION_INVALID_NO_WITNESS\",\"exit_code\":\"78\",\"journal_appended\":false,\"status\":\"FAIL_CLOSED\"}\n" });
    expect(firstBytes.length).toBeGreaterThan(0);

  });
});

function statLines(path: string): number {
  return readFileSync(path).toString("utf8").split("\n").filter(Boolean).length;
}
