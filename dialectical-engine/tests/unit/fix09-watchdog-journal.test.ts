import { createHash, createPublicKey, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import {
  appendFileSync, chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync,
  realpathSync, statSync, symlinkSync, unlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { canonicalJson } from "../../packages/obs-capture/src/chain/canonical.js";
import {
  emptyLegacyDigest, verifyActivationDocument, type VerifiedActivation,
  type VerifiedRecoveryCheckpoint,
} from "../../packages/obs-capture/src/chain/verify.js";
import {
  appendWitnessRecord, completeWitnessRecord, verifyWitnessJournal, witnessProtocol,
  type UnsignedWitnessRecord,
} from "../../packages/obs-capture/src/chain/witness.js";

const roots: string[] = [];
const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const domain = (value: string) => Buffer.concat([Buffer.from(value), Buffer.from([0])]);
const spki = (key: KeyObject) => (key.type === "public" ? key : createPublicKey(key)).export({ format: "der", type: "spki" }) as Buffer;

function activation(custodian: KeyObject, witness: KeyObject): VerifiedActivation {
  const witnessDer = spki(witness);
  const custodianDer = spki(custodian);
  const unsigned = {
    activated_at: "2026-09-05T00:00:00.000Z", activation_id: "00000000-0000-4000-8000-000000000001",
    agent_action_legacy_count: "0", agent_action_legacy_digest: emptyLegacyDigest(), agent_action_legacy_max_seq: "0",
    chain_protocol: "obs-audit-chain/v1", created_by_custodian_id: "V", custodian_key_id: hash(custodianDer),
    occurrence_legacy_count: "0", occurrence_legacy_digest: emptyLegacyDigest(), occurrence_legacy_max_seq: "0",
    protocol: "obs-chain-activation/v1", public_keyring_sha256: "2".repeat(64),
    witness_bootstrap_key_id: hash(witnessDer), witness_bootstrap_min_seq: "1",
    witness_bootstrap_spki_der_base64: witnessDer.toString("base64"),
  };
  const unsignedBytes = Buffer.from(canonicalJson(unsigned));
  const completed = {
    ...unsigned, manifest_sha256: hash(unsignedBytes),
    custodian_signature_base64: sign(null, Buffer.concat([domain("obs-chain-activation-signature/v1"), unsignedBytes]), custodian).toString("base64"),
  };
  return verifyActivationDocument(Buffer.from(canonicalJson(completed)), custodianDer);
}

function witnessInput(authority: VerifiedActivation, keyId: string, sequence: string, prior: string): UnsignedWitnessRecord {
  const empty = Object.freeze({ count: "0", digest: emptyLegacyDigest(), max_seq: "0", status: "LEGACY_WITNESSED_UNVERIFIED" as const });
  return Object.freeze({
    activation_manifest_sha256: authority.manifestSha256,
    cycle_id: `00000000-0000-4000-8000-${sequence.padStart(12, "0")}`,
    heads: Object.freeze([]), keyring_generation: "1", keyring_sha256: "2".repeat(64),
    legacy: Object.freeze({ occurrence: empty, agent_action: empty }), observed_at: "2026-09-05T00:00:00.000Z",
    prior_witness_hash: prior, reason: "NONE",
    recovery: Object.freeze({ epoch: "1", latest_recovery_id: null, suspect_range_count: "0" }),
    result: "VERIFIED", schema: witnessProtocol,
    snapshot: Object.freeze({ agent_action_high_water: "0", occurrence_high_water: "0", snapshot_text: "10:10:" }),
    witness_authorization: null, witness_key_id: keyId, witness_seq: sequence,
  });
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("FIX-09 watchdog journal", () => {
  it("proves the exact gapless activation-anchored wire, V transition certificates, and atomic append", () => {
    const custodianPair = generateKeyPairSync("ed25519");
    const witnessPair = generateKeyPairSync("ed25519");
    const authority = activation(custodianPair.privateKey, witnessPair.publicKey);

    const publicVector = "{\"activation_manifest_sha256\":\"1111111111111111111111111111111111111111111111111111111111111111\",\"cycle_id\":\"00000000-0000-4000-8000-000000000001\",\"heads\":[],\"keyring_generation\":\"1\",\"keyring_sha256\":\"2222222222222222222222222222222222222222222222222222222222222222\",\"legacy\":{\"agent_action\":{\"count\":\"0\",\"digest\":\"4444444444444444444444444444444444444444444444444444444444444444\",\"max_seq\":\"0\",\"status\":\"LEGACY_WITNESSED_UNVERIFIED\"},\"occurrence\":{\"count\":\"0\",\"digest\":\"3333333333333333333333333333333333333333333333333333333333333333\",\"max_seq\":\"0\",\"status\":\"LEGACY_WITNESSED_UNVERIFIED\"}},\"observed_at\":\"2026-09-05T00:00:00.000Z\",\"prior_witness_hash\":\"1111111111111111111111111111111111111111111111111111111111111111\",\"reason\":\"NONE\",\"recovery\":{\"epoch\":\"1\",\"latest_recovery_id\":null,\"suspect_range_count\":\"0\"},\"result\":\"VERIFIED\",\"schema\":\"obs-chain-witness/v1\",\"snapshot\":{\"agent_action_high_water\":\"0\",\"occurrence_high_water\":\"0\",\"snapshot_text\":\"10:10:\"},\"witness_authorization\":null,\"witness_key_id\":\"5555555555555555555555555555555555555555555555555555555555555555\",\"witness_seq\":\"1\"}";
    expect(Buffer.byteLength(publicVector)).toBe(1_093);
    expect(hash(publicVector)).toBe("78b595a8998c4ac3acbbaa59b7f635835ef55b593f9377639d1c56d4349f342e");

    const first = completeWitnessRecord(witnessInput(authority, authority.witnessBootstrapKeyId, "1", authority.manifestSha256), witnessPair.privateKey);
    const firstLine = Buffer.from(`${canonicalJson(first)}\n`);
    expect(verifyWitnessJournal(firstLine, authority)).toMatchObject({ count: "1", nextSequence: "2", priorWitnessHash: first.witness_hash });

    const rotatedPair = generateKeyPairSync("ed25519");
    const rotatedDer = spki(rotatedPair.publicKey);
    const authorizationUnsigned = {
      custodian_key_id: authority.custodianKeyId, min_witness_seq: "2", new_witness_key_id: hash(rotatedDer),
      new_witness_spki_der_base64: rotatedDer.toString("base64"), prior_witness_hash: first.witness_hash,
      prior_witness_key_id: authority.witnessBootstrapKeyId, prior_witness_seq: "1", reason: "PLANNED_ROTATION",
      recovery_checkpoint_sha256: null, recovery_id: null, schema: "obs-witness-key-authorization/v1",
    } as const;
    const authorizationBytes = Buffer.from(canonicalJson(authorizationUnsigned));
    const authorization = Object.freeze({
      ...authorizationUnsigned,
      custodian_signature_base64: sign(null, Buffer.concat([domain("obs-witness-key-authorization-signature/v1"), authorizationBytes]), custodianPair.privateKey).toString("base64"),
    });
    const second = completeWitnessRecord({ ...witnessInput(authority, hash(rotatedDer), "2", first.witness_hash), witness_authorization: authorization }, rotatedPair.privateKey);
    const both = Buffer.concat([firstLine, Buffer.from(`${canonicalJson(second)}\n`)]);
    expect(verifyWitnessJournal(both, authority)).toMatchObject({ count: "2", nextSequence: "3", witnessKeyId: hash(rotatedDer) });

    const rewrittenGeneration = completeWitnessRecord({
      ...witnessInput(authority, hash(rotatedDer), "3", second.witness_hash),
      keyring_sha256: "3".repeat(64),
    }, rotatedPair.privateKey);
    expect(() => verifyWitnessJournal(Buffer.concat([both, Buffer.from(`${canonicalJson(rewrittenGeneration)}\n`)]), authority))
      .toThrow("FIX09_WITNESS_CONTINUITY");
    const inventedRecovery = completeWitnessRecord({
      ...witnessInput(authority, hash(rotatedDer), "3", second.witness_hash),
      recovery: Object.freeze({ epoch: "1", latest_recovery_id: "00000000-0000-4000-8000-000000000088", suspect_range_count: "1" }),
    }, rotatedPair.privateKey);
    expect(() => verifyWitnessJournal(Buffer.concat([both, Buffer.from(`${canonicalJson(inventedRecovery)}\n`)]), authority))
      .toThrow("FIX09_WITNESS_CONTINUITY");

    const recoveredPair = generateKeyPairSync("ed25519");
    const recoveredDer = spki(recoveredPair.publicKey);
    const recoveryId = "00000000-0000-4000-8000-000000000099";
    const checkpointUnsigned = {
      created_at: "2026-09-05T00:00:01.000Z", custodian_key_id: authority.custodianKeyId,
      last_trusted_heads: [], last_trusted_witness_hash: first.witness_hash, last_trusted_witness_seq: "1",
      new_epoch: "2", new_keyring_generation: "2", prior_epoch: "1", prior_keyring_generation: "1",
      recovery_id: recoveryId, row_ranges: [], schema: "obs-chain-recovery/v1", trigger: "WITNESS_KEY_LOSS",
      witness_range: { next_key_id: hash(recoveredDer), next_min_witness_seq: "2",
        prior_key_id: authority.witnessBootstrapKeyId, suspect_first_witness_seq: null,
        suspect_hashes_sha256: emptyLegacyDigest(), suspect_last_witness_seq: null,
        suspect_terminal_witness_hash: first.witness_hash },
    } as const;
    const checkpointBytes = Buffer.from(canonicalJson(checkpointUnsigned));
    const checkpointCompleted = Object.freeze({ ...checkpointUnsigned,
      custodian_signature_base64: sign(null, Buffer.concat([domain("obs-chain-recovery-signature/v1"), checkpointBytes]), custodianPair.privateKey).toString("base64") });
    const checkpoint: VerifiedRecoveryCheckpoint = Object.freeze({ recoveryId, trigger: "WITNESS_KEY_LOSS", priorEpoch: "1", newEpoch: "2",
      completeSha256: hash(Buffer.from(canonicalJson(checkpointCompleted))), completed: checkpointCompleted });
    const lossAuthorizationUnsigned = { ...authorizationUnsigned, min_witness_seq: "2", new_witness_key_id: hash(recoveredDer),
      new_witness_spki_der_base64: recoveredDer.toString("base64"), reason: "WITNESS_KEY_LOSS",
      recovery_id: recoveryId, recovery_checkpoint_sha256: checkpoint.completeSha256 } as const;
    const lossAuthorizationBytes = Buffer.from(canonicalJson(lossAuthorizationUnsigned));
    const lossAuthorization = Object.freeze({ ...lossAuthorizationUnsigned,
      custodian_signature_base64: sign(null, Buffer.concat([domain("obs-witness-key-authorization-signature/v1"), lossAuthorizationBytes]), custodianPair.privateKey).toString("base64") });
    const recoveredInput = { ...witnessInput(authority, hash(recoveredDer), "2", first.witness_hash),
      keyring_generation: "2", keyring_sha256: "3".repeat(64), result: "VERIFIED_WITH_RECOVERY" as const,
      reason: "RECOVERY_CHECKPOINT" as const, recovery: Object.freeze({ epoch: "2", latest_recovery_id: recoveryId, suspect_range_count: "0" }),
      witness_authorization: lossAuthorization };
    const recovered = completeWitnessRecord(recoveredInput, recoveredPair.privateKey);
    const recoveredJournal = Buffer.concat([firstLine, Buffer.from(`${canonicalJson(recovered)}\n`)]);
    expect(verifyWitnessJournal(recoveredJournal, authority, [checkpoint])).toMatchObject({ count: "2", witnessKeyId: hash(recoveredDer) });
    expect(() => verifyWitnessJournal(recoveredJournal, authority, [])).toThrow("FIX09_WITNESS_CONTINUITY");

    const forgedAuthorization = { ...second, witness_authorization: {
      ...second.witness_authorization!, prior_witness_hash: "0".repeat(64),
    } };
    expect(() => verifyWitnessJournal(Buffer.concat([firstLine, Buffer.from(`${canonicalJson(forgedAuthorization)}\n`)]), authority)).toThrow("FIX09_WITNESS_CONTINUITY");
    expect(() => verifyWitnessJournal(both.subarray(0, both.length - 1), authority)).toThrow("FIX09_WITNESS_FORMAT");
    expect(() => verifyWitnessJournal(Buffer.concat([firstLine, firstLine]), authority)).toThrow("FIX09_WITNESS_CONTINUITY");

    const root = realpathSync(mkdtempSync(join(tmpdir(), "fix09-witness-")));
    roots.push(root);
    const witnessDirectory = join(root, "witness");
    const journal = join(witnessDirectory, "watchdog-chain.jsonl");
    mkdirSync(witnessDirectory, { mode: 0o700 });
    writeFileSync(journal, "", { mode: 0o600 });
    chmodSync(witnessDirectory, 0o700);
    chmodSync(journal, 0o600);
    const identity = { controlRoot: root, ownerUid: process.getuid!(), ownerGid: process.getgid!() };
    const size0 = statSync(journal).size;
    const appendedFirst = appendWitnessRecord(journal, first, authority, identity, { count: "0", priorWitnessHash: authority.manifestSha256 });
    const size1 = statSync(journal).size;
    const appendedSecond = appendWitnessRecord(journal, second, authority, identity, { count: appendedFirst.count, priorWitnessHash: appendedFirst.priorWitnessHash });
    const size2 = statSync(journal).size;
    expect([size0 < size1, size1 < size2, readFileSync(journal).equals(both)]).toEqual([true, true, true]);
    expect(verifyWitnessJournal(readFileSync(journal), authority)).toMatchObject({ count: appendedSecond.count, priorWitnessHash: appendedSecond.priorWitnessHash });

    writeFileSync(journal, firstLine);
    expect(() => appendWitnessRecord(journal, second, authority, identity, { count: "2", priorWitnessHash: second.witness_hash })).toThrow("FIX09_JOURNAL_ROLLBACK");
    appendFileSync(journal, "{");
    expect(() => appendWitnessRecord(journal, second, authority, identity)).toThrow("FIX09_WITNESS_FORMAT");
    unlinkSync(journal);
    symlinkSync(join(root, "elsewhere"), journal);
    expect(() => appendWitnessRecord(journal, second, authority, identity)).toThrow();
  });
});
