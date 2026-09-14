import { createHash, createPublicKey, generateKeyPairSync, randomUUID, sign, type KeyObject } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migrate } from "../../packages/db/src/index.js";
import { appendChainedAgentAction } from "../../packages/obs-capture/src/chain/agent-action-gateway.js";
import { canonicalJson, keyIdFromPublicKey } from "../../packages/obs-capture/src/chain/canonical.js";
import { createFixagentDeliveryGeneration } from "../../packages/obs-capture/src/chain/fixagent-delivery.js";
import {
  appendChainedOccurrences, configureOccurrenceGatewayForTest, materializeDirectOccurrence,
} from "../../packages/obs-capture/src/chain/occurrence-gateway.js";
import { installReleasedSignerForTest } from "../../packages/obs-capture/src/chain/signer.js";
import {
  emptyLegacyDigest, verificationResults, verifyActivationDocument, verifyAuditSnapshot,
  verifyPublicKeyring, type VerifiedActivation,
} from "../../packages/obs-capture/src/chain/verify.js";
import { createSharedRedactor } from "../../packages/obs-capture/src/redactor.js";
import { createWatchdogDatabase } from "../../tools/obs-listener/src/watchdog/database.js";
import { createDaemonHeartbeat } from "../../tools/obs-listener/src/daemon/heartbeat.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
let watchdogUrl: string;
let listenerUrl: string;
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const domain = (value: string) => Buffer.concat([Buffer.from(value), Buffer.from([0])]);
const spki = (key: KeyObject) => (key.type === "public" ? key : createPublicKey(key)).export({ format: "der", type: "spki" }) as Buffer;

function keyring(custodian: KeyObject, occurrence: KeyObject, action: KeyObject, generation = "1", prior = "0".repeat(64),
  options: Readonly<{ epoch?: string; checkpoints?: readonly Record<string, unknown>[]; rotatedOccurrence?: KeyObject }> = {}) {
  const entries = [
    { algorithm: "ed25519", authorizations: [{ max_chain_seq: options.rotatedOccurrence === undefined ? null : "24", min_chain_seq: "1", source: "first_party", table: "occurrence" }],
      key_id: keyIdFromPublicKey(occurrence), spki_der_base64: spki(occurrence).toString("base64"), writer_identity: "api-watchdog-writer" },
    { algorithm: "ed25519", authorizations: [{ max_chain_seq: null, min_chain_seq: "1", source: "first_party", table: "agent_action" }],
      key_id: keyIdFromPublicKey(action), spki_der_base64: spki(action).toString("base64"), writer_identity: "fixagent-daemon" },
  ];
  if (options.rotatedOccurrence !== undefined) entries.push({ algorithm: "ed25519",
    authorizations: [{ max_chain_seq: null, min_chain_seq: "25", source: "first_party", table: "occurrence" }],
    key_id: keyIdFromPublicKey(options.rotatedOccurrence), spki_der_base64: spki(options.rotatedOccurrence).toString("base64"), writer_identity: "api-watchdog-writer" });
  entries.sort((left, right) => Buffer.compare(Buffer.from(`${left.writer_identity}\0${left.key_id}`), Buffer.from(`${right.writer_identity}\0${right.key_id}`)));
  const unsigned = { created_at: "2026-09-05T00:00:00.000Z", custodian_key_id: keyIdFromPublicKey(custodian),
    entries, epoch: options.epoch ?? "1", generation, prior_keyring_sha256: prior, protocol: "obs-chain-public-keyring/v1",
    recovery_checkpoints: options.checkpoints ?? [], witness_keys: [] };
  const unsignedBytes = Buffer.from(canonicalJson(unsigned));
  return Buffer.from(canonicalJson({ ...unsigned,
    custodian_signature_base64: sign(null, Buffer.concat([domain("obs-chain-keyring-signature/v1"), unsignedBytes]), custodian).toString("base64") }));
}

function activation(custodian: KeyObject, witness: KeyObject, keyringDigest: string): { bytes: Buffer; value: VerifiedActivation } {
  const unsigned = {
    activated_at: "2026-09-05T00:00:00.000Z", activation_id: randomUUID(),
    agent_action_legacy_count: "0", agent_action_legacy_digest: emptyLegacyDigest(), agent_action_legacy_max_seq: "0",
    chain_protocol: "obs-audit-chain/v1", created_by_custodian_id: "V", custodian_key_id: keyIdFromPublicKey(custodian),
    occurrence_legacy_count: "0", occurrence_legacy_digest: emptyLegacyDigest(), occurrence_legacy_max_seq: "0",
    protocol: "obs-chain-activation/v1", public_keyring_sha256: keyringDigest,
    witness_bootstrap_key_id: keyIdFromPublicKey(witness), witness_bootstrap_min_seq: "1",
    witness_bootstrap_spki_der_base64: spki(witness).toString("base64"),
  };
  const unsignedBytes = Buffer.from(canonicalJson(unsigned));
  const bytes = Buffer.from(canonicalJson({ ...unsigned, manifest_sha256: hash(unsignedBytes),
    custodian_signature_base64: sign(null, Buffer.concat([domain("obs-chain-activation-signature/v1"), unsignedBytes]), custodian).toString("base64") }));
  return { bytes, value: verifyActivationDocument(bytes, spki(custodian)) };
}

function occurrence(sourceEventRef: string) {
  return materializeDirectOccurrence(createSharedRedactor({
    allowlist_set_id: "g0-empty-parameters", build_dirty: false, build_ref: "build:watchdog",
    component: Object.freeze({ package: "@debateai/api", process: "api" }), environment: "test",
    now: () => new Date("2026-09-08T01:02:03.004Z"), redaction_policy_version: "g0", runtime: "api",
    sourceEventRef: () => sourceEventRef, writer_identity: "api-watchdog-writer",
  }).redact(Object.freeze({ ambient_context_ref: undefined, kind: "envelope" as const,
    payload_ref: Object.freeze({ capture_point: "self", code: "OBS_CAPTURE_SELF", disposition: "SELF",
      source: "first_party", taxonomy_class: "CAPTURE_SELF" }) })));
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  await database.pool.query("ALTER ROLE debateai_obs_watchdog LOGIN PASSWORD 'watchdog-test-only'");
  await database.pool.query("ALTER ROLE debateai_obs_listener LOGIN PASSWORD 'listener-test-only'");
  const url = new URL(database.connectionString);
  url.username = "debateai_obs_watchdog";
  url.password = "watchdog-test-only";
  watchdogUrl = url.toString();
  url.username = "debateai_obs_listener";
  url.password = "listener-test-only";
  listenerUrl = url.toString();
}, 120_000);

afterAll(async () => database?.stop());

describe("FIX-09 watchdog verification on real PostgreSQL", () => {
  it("proves read-only legacy, chain, keyring, witness-authorization, recovery, and mutation verdicts", async () => {
    expect(verificationResults).toContain("CHAIN_BREAK");
    const custodian = generateKeyPairSync("ed25519");
    const witness = generateKeyPairSync("ed25519");
    const occurrenceKey = generateKeyPairSync("ed25519");
    const rotatedOccurrenceKey = generateKeyPairSync("ed25519");
    const actionKey = generateKeyPairSync("ed25519");
    const keyringBytes = keyring(custodian.privateKey, occurrenceKey.publicKey, actionKey.publicKey, "1", "0".repeat(64),
      { rotatedOccurrence: rotatedOccurrenceKey.publicKey });
    const authority = activation(custodian.privateKey, witness.publicKey, hash(keyringBytes));
    const verifiedKeyring = verifyPublicKeyring(keyringBytes, authority.value);
    const overlapping = JSON.parse(keyringBytes.toString("utf8")) as Record<string, unknown> & {
      entries: Array<{ authorizations: Array<{ min_chain_seq: string }> }>;
    };
    overlapping.entries.find((entry) => entry.authorizations[0]?.min_chain_seq === "25")!
      .authorizations[0]!.min_chain_seq = "24";
    delete overlapping.custodian_signature_base64;
    const overlappingUnsigned = Buffer.from(canonicalJson(overlapping));
    const overlappingBytes = Buffer.from(canonicalJson({ ...overlapping,
      custodian_signature_base64: sign(null, Buffer.concat([domain("obs-chain-keyring-signature/v1"), overlappingUnsigned]), custodian.privateKey).toString("base64") }));
    const overlappingAuthority = activation(custodian.privateKey, witness.publicKey, hash(overlappingBytes));
    expect(() => verifyPublicKeyring(overlappingBytes, overlappingAuthority.value)).toThrow("FIX09_KEYRING_FORMAT");
    await database.pool.query(`INSERT INTO obs.audit_chain_activation (
      singleton,protocol,activation_id,activated_at,occurrence_legacy_max_seq,occurrence_legacy_count,
      occurrence_legacy_digest,agent_action_legacy_max_seq,agent_action_legacy_count,
      agent_action_legacy_digest,initial_public_keyring_sha256,activation_manifest_sha256,
      created_by_custodian_id) VALUES (true,'obs-audit-chain/v1',$1,$2,0,0,$3,0,0,$3,$4,$5,'V')`,
    [authority.value.activationId, authority.value.activatedAt, Buffer.from(emptyLegacyDigest(), "hex"), Buffer.from(hash(keyringBytes), "hex"), Buffer.from(authority.value.manifestSha256, "hex")]);
    configureOccurrenceGatewayForTest(database.pool);
    installReleasedSignerForTest("occurrence", "first_party", "api-watchdog-writer", occurrenceKey.privateKey, authority.value.manifestSha256);
    installReleasedSignerForTest("agent_action", "first_party", "fixagent-daemon", actionKey.privateKey, authority.value.manifestSha256);
    for (let index = 0; index < 24; index += 1) await appendChainedOccurrences([occurrence(randomUUID())]);
    installReleasedSignerForTest("occurrence", "first_party", "api-watchdog-writer", rotatedOccurrenceKey.privateKey, authority.value.manifestSha256);
    await appendChainedOccurrences([occurrence(randomUUID())]);
    const delivery = createFixagentDeliveryGeneration(database.connectionString);
    await delivery.connect();
    for (let index = 0; index < 25; index += 1) {
      await delivery.withDelivery(randomUUID(), (transaction) => appendChainedAgentAction(transaction, {
        source: "first_party", writer_identity: "fixagent-daemon", actor: "fixagent-daemon",
        action_kind: "POLICY_SKIPPED", occurrence_id: null, incident_id: null,
        action_ref: `watchdog-action-${index}-${randomUUID()}`, action_payload: Object.freeze({ decision: "SKIP" }),
      }));
    }
    await delivery.close();
    await database.pool.query(`INSERT INTO obs.component_health(component,state,observed_at,detail_code)
      VALUES ('fixagent-daemon','PASS','2026-09-08T01:02:03.004Z','NONE')`);
    await database.pool.query(`INSERT INTO obs.consumer_cursor(consumer,last_occ_seq) VALUES ('fixagent-daemon',25)`);

    const wrongWatchdogIdentity = createWatchdogDatabase(database.connectionString);
    await expect(wrongWatchdogIdentity.readSnapshot()).rejects.toThrow("FIX09_WATCHDOG_DATABASE_IDENTITY");
    await wrongWatchdogIdentity.close();
    const wrongDaemonIdentity = createDaemonHeartbeat(database.connectionString);
    await expect(wrongDaemonIdentity.refresh()).rejects.toThrow("FIX09_DAEMON_ROLE");
    await wrongDaemonIdentity.close();

    const watchdog = createWatchdogDatabase(watchdogUrl);
    const snapshot = await watchdog.readSnapshot();
    expect(snapshot.audit.occurrenceRows.length + snapshot.audit.agentActionRows.length).toBe(50);
    const verified = verifyAuditSnapshot(snapshot.audit, authority.value, verifiedKeyring);
    expect(verified).toMatchObject({ result: "VERIFIED", reason: "NONE" });
    expect(verified.heads.map((head) => head.chain_seq)).toEqual(["25", "25"]);

    const forgedRows = snapshot.audit.occurrenceRows.map((row, index) => index === 1 ? Object.freeze({ ...row, prev_link: Buffer.alloc(32, 0xa5) }) : row);
    const forged = verifyAuditSnapshot({ ...snapshot.audit, occurrenceRows: forgedRows }, authority.value, verifiedKeyring);
    expect(forged).toMatchObject({ result: "CHAIN_BREAK", reason: "PREV_LINK" });
    expect(forged.result).toBe("CHAIN_BREAK");
    const deleted = verifyAuditSnapshot({ ...snapshot.audit, occurrenceRows: snapshot.audit.occurrenceRows.slice(1) }, authority.value, verifiedKeyring);
    expect(deleted).toMatchObject({ result: "CHAIN_BREAK", reason: "CHAIN_SEQUENCE" });
    const linked = snapshot.audit.agentActionRows.map((row, index) => index === 24 ? Object.freeze({ ...row, chain_link: Buffer.alloc(32, 0x5a) }) : row);
    expect(verifyAuditSnapshot({ ...snapshot.audit, agentActionRows: linked }, authority.value, verifiedKeyring)).toMatchObject({ result: "CHAIN_BREAK", reason: "ROW_LINK" });
    expect(verifyAuditSnapshot(snapshot.audit, authority.value, verifiedKeyring, {
      occurrenceHighWater: "26", agentActionHighWater: "25", heads: verified.heads,
    })).toMatchObject({ result: "CHAIN_BREAK", reason: "HEAD_REGRESSION" });

    const rotatedBytes = keyring(custodian.privateKey, occurrenceKey.publicKey, actionKey.publicKey, "2", verifiedKeyring.digest,
      { rotatedOccurrence: rotatedOccurrenceKey.publicKey });
    expect(verifyPublicKeyring(rotatedBytes, authority.value, verifiedKeyring)).toMatchObject({ generation: "2", priorDigest: verifiedKeyring.digest });
    const wrongPrior = keyring(custodian.privateKey, occurrenceKey.publicKey, actionKey.publicKey, "2", "0".repeat(64),
      { rotatedOccurrence: rotatedOccurrenceKey.publicKey });
    expect(() => verifyPublicKeyring(wrongPrior, authority.value, verifiedKeyring)).toThrow("FIX09_KEYRING_CONTINUITY");
    const recoveredWitness = generateKeyPairSync("ed25519");
    const recoveryId = randomUUID();
    const recoveryUnsigned = {
      created_at: "2026-09-05T00:01:00.000Z", custodian_key_id: authority.value.custodianKeyId,
      last_trusted_heads: verified.heads, last_trusted_witness_hash: authority.value.manifestSha256,
      last_trusted_witness_seq: "0", new_epoch: "2", new_keyring_generation: "2",
      prior_epoch: "1", prior_keyring_generation: "1", recovery_id: recoveryId, row_ranges: [],
      schema: "obs-chain-recovery/v1", trigger: "WITNESS_KEY_LOSS",
      witness_range: { next_key_id: keyIdFromPublicKey(recoveredWitness.publicKey), next_min_witness_seq: "1",
        prior_key_id: authority.value.witnessBootstrapKeyId, suspect_first_witness_seq: null,
        suspect_hashes_sha256: emptyLegacyDigest(), suspect_last_witness_seq: null,
        suspect_terminal_witness_hash: authority.value.manifestSha256 },
    };
    const recoveryBytes = Buffer.from(canonicalJson(recoveryUnsigned));
    const checkpoint = { ...recoveryUnsigned,
      custodian_signature_base64: sign(null, Buffer.concat([domain("obs-chain-recovery-signature/v1"), recoveryBytes]), custodian.privateKey).toString("base64") };
    const recoveryKeyringBytes = keyring(custodian.privateKey, occurrenceKey.publicKey, actionKey.publicKey, "2", verifiedKeyring.digest,
      { epoch: "2", checkpoints: [checkpoint], rotatedOccurrence: rotatedOccurrenceKey.publicKey });
    const recoveryKeyring = verifyPublicKeyring(recoveryKeyringBytes, authority.value, verifiedKeyring);
    expect(recoveryKeyring).toMatchObject({ generation: "2", epoch: "2",
      recoveryCheckpoints: [{ recoveryId, trigger: "WITNESS_KEY_LOSS" }] });
    for (const malformedCheckpoint of [
      Object.assign(structuredClone(checkpoint), { created_at: "not-an-instant" }),
      Object.assign(structuredClone(checkpoint), {
        last_trusted_witness_hash: "0".repeat(64),
        witness_range: { ...checkpoint.witness_range, suspect_terminal_witness_hash: "0".repeat(64) },
      }),
    ]) {
      const { custodian_signature_base64: _discarded, ...malformedUnsigned } = malformedCheckpoint;
      const malformedBytes = Buffer.from(canonicalJson(malformedUnsigned));
      const malformedCompleted = { ...malformedUnsigned,
        custodian_signature_base64: sign(null, Buffer.concat([
          domain("obs-chain-recovery-signature/v1"), malformedBytes,
        ]), custodian.privateKey).toString("base64") };
      const malformedKeyring = keyring(custodian.privateKey, occurrenceKey.publicKey, actionKey.publicKey,
        "2", verifiedKeyring.digest, { epoch: "2", checkpoints: [malformedCompleted],
          rotatedOccurrence: rotatedOccurrenceKey.publicKey });
      expect(() => verifyPublicKeyring(malformedKeyring, authority.value, verifiedKeyring))
        .toThrow("FIX09_RECOVERY_INVALID");
    }
    const skippedGenerationCheckpoint = structuredClone(checkpoint);
    skippedGenerationCheckpoint.prior_keyring_generation = "2";
    skippedGenerationCheckpoint.new_keyring_generation = "3";
    const { custodian_signature_base64: _discardedSignature, ...skippedGenerationUnsigned } = skippedGenerationCheckpoint;
    const skippedCheckpointUnsigned = Buffer.from(canonicalJson(skippedGenerationUnsigned));
    const skippedCheckpoint = { ...skippedGenerationUnsigned,
      custodian_signature_base64: sign(null, Buffer.concat([domain("obs-chain-recovery-signature/v1"), skippedCheckpointUnsigned]), custodian.privateKey).toString("base64") };
    const skippedGenerationBytes = keyring(custodian.privateKey, occurrenceKey.publicKey, actionKey.publicKey, "2", verifiedKeyring.digest,
      { epoch: "2", checkpoints: [skippedCheckpoint], rotatedOccurrence: rotatedOccurrenceKey.publicKey });
    expect(() => verifyPublicKeyring(skippedGenerationBytes, authority.value, verifiedKeyring)).toThrow("FIX09_RECOVERY_INVALID");
    expect(verifyAuditSnapshot(snapshot.audit, authority.value, recoveryKeyring)).toMatchObject({
      result: "VERIFIED_WITH_RECOVERY", reason: "RECOVERY_CHECKPOINT", recovery: { epoch: "2", latest_recovery_id: recoveryId },
    });
    const forgedCheckpoint = structuredClone(checkpoint);
    forgedCheckpoint.custodian_signature_base64 = Buffer.alloc(64).toString("base64");
    const forgedRecoveryKeyring = keyring(custodian.privateKey, occurrenceKey.publicKey, actionKey.publicKey, "2", verifiedKeyring.digest,
      { epoch: "2", checkpoints: [forgedCheckpoint], rotatedOccurrence: rotatedOccurrenceKey.publicKey });
    expect(() => verifyPublicKeyring(forgedRecoveryKeyring, authority.value, verifiedKeyring)).toThrow("FIX09_RECOVERY_INVALID");

    const row23 = snapshot.audit.occurrenceRows.find((row) => row.chain_seq === "23")!;
    const row24 = snapshot.audit.occurrenceRows.find((row) => row.chain_seq === "24")!;
    const row25 = snapshot.audit.occurrenceRows.find((row) => row.chain_seq === "25")!;
    const link23 = (row23.chain_link as Buffer).toString("hex");
    const link24 = (row24.chain_link as Buffer).toString("hex");
    const rowRecoveryId = randomUUID();
    const trustedHeads = verified.heads.map((head) => head.table === "occurrence"
      ? { ...head, chain_seq: "23", chain_link: link23 } : head);
    const rowRecoveryUnsigned = {
      created_at: "2026-09-05T00:02:00.000Z", custodian_key_id: authority.value.custodianKeyId,
      last_trusted_heads: trustedHeads, last_trusted_witness_hash: authority.value.manifestSha256,
      last_trusted_witness_seq: "0", new_epoch: "2", new_keyring_generation: "2", prior_epoch: "1",
      prior_keyring_generation: "1", recovery_id: rowRecoveryId, schema: "obs-chain-recovery/v1",
      trigger: "ROW_KEY_COMPROMISE",
      row_ranges: [{ table: "occurrence", source: "first_party", writer_identity: "api-watchdog-writer",
        compromised_key_id: keyIdFromPublicKey(occurrenceKey.publicKey), last_trusted_chain_seq: "23",
        last_trusted_chain_link: link23, suspect_first_chain_seq: "24", suspect_last_chain_seq: "24",
        suspect_terminal_chain_link: link24,
        suspect_links_sha256: hash(Buffer.from(canonicalJson([["24", link24]]))),
        next_key_id: keyIdFromPublicKey(rotatedOccurrenceKey.publicKey), next_min_chain_seq: "25" }],
      witness_range: { next_key_id: authority.value.witnessBootstrapKeyId, next_min_witness_seq: "1",
        prior_key_id: authority.value.witnessBootstrapKeyId, suspect_first_witness_seq: null,
        suspect_hashes_sha256: emptyLegacyDigest(), suspect_last_witness_seq: null,
        suspect_terminal_witness_hash: authority.value.manifestSha256 },
    };
    expect((row25.prev_link as Buffer).toString("hex")).toBe(link24);
    const rowRecoveryBody = Buffer.from(canonicalJson(rowRecoveryUnsigned));
    const rowCheckpoint = { ...rowRecoveryUnsigned,
      custodian_signature_base64: sign(null, Buffer.concat([domain("obs-chain-recovery-signature/v1"), rowRecoveryBody]), custodian.privateKey).toString("base64") };
    const rowRecoveryBytes = keyring(custodian.privateKey, occurrenceKey.publicKey, actionKey.publicKey, "2", verifiedKeyring.digest,
      { epoch: "2", checkpoints: [rowCheckpoint], rotatedOccurrence: rotatedOccurrenceKey.publicKey });
    const rowRecoveryKeyring = verifyPublicKeyring(rowRecoveryBytes, authority.value, verifiedKeyring);
    expect(verifyAuditSnapshot(snapshot.audit, authority.value, rowRecoveryKeyring)).toMatchObject({
      result: "VERIFIED_WITH_RECOVERY", reason: "RECOVERY_CHECKPOINT",
    });
    const absentSuccessor = generateKeyPairSync("ed25519");
    const absentSuccessorId = keyIdFromPublicKey(absentSuccessor.publicKey);
    const emptyRangeUnsigned = {
      ...rowRecoveryUnsigned, recovery_id: randomUUID(), last_trusted_heads: verified.heads,
      row_ranges: [{ ...rowRecoveryUnsigned.row_ranges[0],
        compromised_key_id: keyIdFromPublicKey(rotatedOccurrenceKey.publicKey),
        last_trusted_chain_seq: "25", last_trusted_chain_link: (row25.chain_link as Buffer).toString("hex"),
        suspect_first_chain_seq: null, suspect_last_chain_seq: null,
        suspect_terminal_chain_link: (row25.chain_link as Buffer).toString("hex"),
        suspect_links_sha256: emptyLegacyDigest(), next_key_id: absentSuccessorId, next_min_chain_seq: "26" }],
    };
    const emptyRangeBody = Buffer.from(canonicalJson(emptyRangeUnsigned));
    const emptyRangeCheckpoint = { ...emptyRangeUnsigned,
      custodian_signature_base64: sign(null, Buffer.concat([
        domain("obs-chain-recovery-signature/v1"), emptyRangeBody,
      ]), custodian.privateKey).toString("base64") };
    const emptyRangeDocument = JSON.parse(keyring(custodian.privateKey, occurrenceKey.publicKey,
      actionKey.publicKey, "2", verifiedKeyring.digest, { epoch: "2", checkpoints: [emptyRangeCheckpoint],
        rotatedOccurrence: rotatedOccurrenceKey.publicKey }).toString("utf8")) as {
          custodian_signature_base64?: string;
          entries: Array<{ writer_identity: string; key_id: string; authorizations: Array<{ max_chain_seq: string | null; min_chain_seq: string }> }>;
        } & Record<string, unknown>;
    delete emptyRangeDocument.custodian_signature_base64;
    emptyRangeDocument.entries.find((entry) => entry.key_id === keyIdFromPublicKey(rotatedOccurrenceKey.publicKey))!
      .authorizations[0]!.max_chain_seq = "25";
    emptyRangeDocument.entries.push({ algorithm: "ed25519", authorizations: [{ table: "occurrence", source: "first_party",
      max_chain_seq: null, min_chain_seq: "26" }], key_id: absentSuccessorId,
      spki_der_base64: spki(absentSuccessor.publicKey).toString("base64"), writer_identity: "api-watchdog-writer" } as never);
    emptyRangeDocument.entries.sort((left, right) => Buffer.compare(
      Buffer.from(`${left.writer_identity}\0${left.key_id}`), Buffer.from(`${right.writer_identity}\0${right.key_id}`)));
    const emptyRangeKeyringUnsigned = Buffer.from(canonicalJson(emptyRangeDocument));
    const emptyRangeKeyringBytes = Buffer.from(canonicalJson({ ...emptyRangeDocument,
      custodian_signature_base64: sign(null, Buffer.concat([
        domain("obs-chain-keyring-signature/v1"), emptyRangeKeyringUnsigned,
      ]), custodian.privateKey).toString("base64") }));
    const emptyRangeKeyring = verifyPublicKeyring(emptyRangeKeyringBytes, authority.value, verifiedKeyring);
    expect(verifyAuditSnapshot(snapshot.audit, authority.value, emptyRangeKeyring)).toMatchObject({
      result: "CHAIN_BREAK", reason: "RECOVERY_CONTINUITY",
    });
    const recoveryForgery = snapshot.audit.occurrenceRows.map((row) => row.chain_seq === "24"
      ? Object.freeze({ ...row, chain_link: Buffer.alloc(32, 0x7a) }) : row);
    expect(verifyAuditSnapshot({ ...snapshot.audit, occurrenceRows: recoveryForgery }, authority.value, rowRecoveryKeyring)).toMatchObject({
      result: "CHAIN_BREAK", reason: "RECOVERY_CONTINUITY",
    });
    const changed = Buffer.from(keyringBytes);
    changed[changed.length - 10] = changed[changed.length - 10]! ^ 1;
    expect(() => verifyPublicKeyring(changed, authority.value)).toThrow();

    await watchdog.writeHealth({ state: "PASS", detailCode: "NONE", observedAt: "2026-09-08T01:02:03.004Z" });
    const health = await database.pool.query("SELECT state,detail_code FROM obs.component_health WHERE component='fixagent-watchdog'");
    expect(health.rows[0]).toEqual({ state: "PASS", detail_code: "NONE" });
    const daemonHeartbeat = createDaemonHeartbeat(listenerUrl);
    await daemonHeartbeat.refresh();
    await daemonHeartbeat.close?.();
    expect((await database.pool.query("SELECT state,detail_code FROM obs.component_health WHERE component='fixagent-daemon'")).rows[0])
      .toEqual({ state: "PASS", detail_code: "NONE" });
    const grants = await database.pool.query<{ action_insert: boolean; occurrence_select: boolean; health_update: boolean; product_write: boolean }>(`
      SELECT has_table_privilege('debateai_obs_watchdog','obs.agent_action','INSERT') AS action_insert,
        has_table_privilege('debateai_obs_watchdog','obs.occurrence','SELECT') AS occurrence_select,
        has_column_privilege('debateai_obs_watchdog','obs.component_health','state','UPDATE') AS health_update,
        EXISTS (SELECT 1 FROM (VALUES ('obs.occurrence'),('obs.delivery'),('obs.trace'),('obs.policy_decision'),
          ('obs.budget_usage'),('obs.spool_receipt'),('obs.capture_gap'),('obs.zone_daily'),('obs.source_link'),
          ('obs.incident'),('obs.consumer_cursor')) AS product(table_name)
          WHERE has_table_privilege('debateai_obs_watchdog',product.table_name,'INSERT')
             OR has_table_privilege('debateai_obs_watchdog',product.table_name,'UPDATE')
             OR has_table_privilege('debateai_obs_watchdog',product.table_name,'DELETE')
             OR has_table_privilege('debateai_obs_watchdog',product.table_name,'TRUNCATE')) AS product_write`);
    expect(grants.rows[0]).toEqual({ action_insert: false, occurrence_select: true, health_update: true, product_write: false });
    const hostileClient = new pg.Client({ connectionString: watchdogUrl });
    await hostileClient.connect();
    await expect(hostileClient.query("INSERT INTO obs.agent_action(actor,action_kind,action_ref,action_payload,occurred_at) VALUES ('watchdog','X','forged','{}',statement_timestamp())")).rejects.toThrow(/permission denied/u);
    await hostileClient.end();
    await watchdog.close();
  }, 120_000);
});
