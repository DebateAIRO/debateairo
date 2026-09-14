import {
  createHash,
  createPublicKey,
  verify as verifySignature,
  type KeyObject,
} from "node:crypto";

import {
  AGENT_ACTION_COLUMNS,
  OCCURRENCE_COLUMNS,
  canonicalJson,
  canonicalRowBytes,
  chainLink,
  genesisLink,
  keyIdFromPublicKey,
  signatureMessage,
} from "./canonical.js";
import { parseUniqueJson } from "./unique-json.js";

export const verificationResults = Object.freeze([
  "VERIFIED",
  "VERIFIED_WITH_RECOVERY",
  "CHAIN_BREAK",
  "VERIFY_UNAVAILABLE",
  "KEYRING_INVALID",
  "WITNESS_INVALID",
] as const);

export const verificationReasons = Object.freeze([
  "NONE",
  "RECOVERY_CHECKPOINT",
  "LEGACY_CHANGED",
  "CHAIN_SEQUENCE",
  "GENESIS",
  "PREV_LINK",
  "ROW_SIGNATURE",
  "ROW_LINK",
  "KEY_AUTHORIZATION",
  "HEAD_REGRESSION",
  "DATABASE_UNAVAILABLE",
  "PUBLIC_MATERIAL_UNAVAILABLE",
  "KEYRING_FORMAT",
  "KEYRING_SIGNATURE",
  "KEYRING_CONTINUITY",
  "WITNESS_FORMAT",
  "WITNESS_SIGNATURE",
  "WITNESS_CONTINUITY",
  "JOURNAL_IO",
  "RECOVERY_INVALID",
  "RECOVERY_CONTINUITY",
] as const);

export type VerificationResult = typeof verificationResults[number];
export type VerificationReason = typeof verificationReasons[number];
export interface VerificationOutcome {
  readonly result: VerificationResult;
  readonly reason: VerificationReason;
}

const HASH = /^[0-9a-f]{64}$/u;
const POSITIVE = /^[1-9][0-9]*$/u;
const NONNEGATIVE = /^(?:0|[1-9][0-9]*)$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const MILLIS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const ZERO_HASH = "0".repeat(64);
const reasons = (...values: VerificationReason[]): ReadonlySet<VerificationReason> => new Set(values);

const PAIRS: Readonly<Record<VerificationResult, ReadonlySet<VerificationReason>>> = Object.freeze({
  VERIFIED: reasons("NONE"),
  VERIFIED_WITH_RECOVERY: reasons("RECOVERY_CHECKPOINT"),
  CHAIN_BREAK: reasons(
    "LEGACY_CHANGED", "CHAIN_SEQUENCE", "GENESIS", "PREV_LINK", "ROW_SIGNATURE",
    "ROW_LINK", "KEY_AUTHORIZATION", "HEAD_REGRESSION", "RECOVERY_CONTINUITY",
  ),
  VERIFY_UNAVAILABLE: reasons("DATABASE_UNAVAILABLE", "PUBLIC_MATERIAL_UNAVAILABLE", "JOURNAL_IO"),
  KEYRING_INVALID: reasons("KEYRING_FORMAT", "KEYRING_SIGNATURE", "KEYRING_CONTINUITY", "RECOVERY_INVALID"),
  WITNESS_INVALID: reasons("WITNESS_FORMAT", "WITNESS_SIGNATURE", "WITNESS_CONTINUITY"),
});

function fail(code: string): never {
  throw { FIX09_CHAIN_VERIFICATION_FAILED: new TypeError(code) }.FIX09_CHAIN_VERIFICATION_FAILED;
}

export function verificationOutcome(result: VerificationResult, reason: VerificationReason): VerificationOutcome {
  if (!PAIRS[result].has(reason)) fail("FIX09_RESULT_REASON");
  return Object.freeze({ result, reason });
}

function domain(value: string): Buffer {
  return Buffer.concat([Buffer.from(value, "utf8"), Buffer.from([0])]);
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function asRecord(value: unknown, code: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(code);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(code);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], code: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((entry, index) => entry !== wanted[index])) fail(code);
}

function text(value: unknown, pattern: RegExp, code: string): string {
  if (typeof value !== "string" || !pattern.test(value)) fail(code);
  return value;
}

function canonicalBase64(value: unknown, expectedBytes: number, code: string): Buffer {
  if (typeof value !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) fail(code);
  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== expectedBytes || decoded.toString("base64") !== value) fail(code);
  return decoded;
}

function publicKeyFromSpki(value: unknown, code: string): { readonly der: Buffer; readonly key: KeyObject; readonly id: string } {
  const der = canonicalBase64(value, 44, code);
  let key: KeyObject;
  try {
    key = createPublicKey({ key: der, format: "der", type: "spki" });
  } catch (_error) {
    return fail(code);
  }
  if (key.asymmetricKeyType !== "ed25519") fail(code);
  return Object.freeze({ der, key, id: keyIdFromPublicKey(key) });
}

function parseCanonicalDocument(bytes: Uint8Array, code: string): Record<string, unknown> {
  const body = Buffer.from(bytes);
  if (body.length === 0 || body[0] === 0xef || body.includes(0x0a) || body.includes(0x0d)) fail(code);
  const source = body.toString("utf8");
  if (!Buffer.from(source, "utf8").equals(body)) fail(code);
  let parsed: unknown;
  try {
    parsed = parseUniqueJson(source);
  } catch (_error) {
    return fail(code);
  }
  const record = asRecord(parsed, code);
  if (canonicalJson(record) !== source) fail(code);
  return record;
}

export interface VerifiedActivation {
  readonly completed: Readonly<Record<string, unknown>>;
  readonly completedBytes: Buffer;
  readonly manifestSha256: string;
  readonly activationId: string;
  readonly activatedAt: string;
  readonly occurrenceLegacyMaxSeq: string;
  readonly occurrenceLegacyCount: string;
  readonly occurrenceLegacyDigest: string;
  readonly agentActionLegacyMaxSeq: string;
  readonly agentActionLegacyCount: string;
  readonly agentActionLegacyDigest: string;
  readonly publicKeyringSha256: string;
  readonly witnessBootstrapKeyId: string;
  readonly witnessBootstrapPublicKey: KeyObject;
  readonly custodianKeyId: string;
  readonly custodianPublicKey: KeyObject;
}

const ACTIVATION_KEYS = Object.freeze([
  "protocol", "chain_protocol", "activation_id", "activated_at",
  "occurrence_legacy_max_seq", "occurrence_legacy_count", "occurrence_legacy_digest",
  "agent_action_legacy_max_seq", "agent_action_legacy_count", "agent_action_legacy_digest",
  "public_keyring_sha256", "witness_bootstrap_key_id", "witness_bootstrap_spki_der_base64",
  "witness_bootstrap_min_seq", "created_by_custodian_id", "custodian_key_id",
  "manifest_sha256", "custodian_signature_base64",
] as const);

export function verifyActivationDocument(bytes: Uint8Array, custodianRootSpkiDer: Uint8Array): VerifiedActivation {
  const completed = parseCanonicalDocument(bytes, "FIX09_ACTIVATION_FORMAT");
  exactKeys(completed, ACTIVATION_KEYS, "FIX09_ACTIVATION_FORMAT");
  if (completed.protocol !== "obs-chain-activation/v1" || completed.chain_protocol !== "obs-audit-chain/v1" ||
      completed.created_by_custodian_id !== "V" || completed.witness_bootstrap_min_seq !== "1") {
    fail("FIX09_ACTIVATION_FORMAT");
  }
  const activationId = text(completed.activation_id, UUID, "FIX09_ACTIVATION_FORMAT");
  const activatedAt = text(completed.activated_at, MILLIS, "FIX09_ACTIVATION_FORMAT");
  if (new Date(activatedAt).toISOString() !== activatedAt) fail("FIX09_ACTIVATION_FORMAT");
  const occurrenceLegacyMaxSeq = text(completed.occurrence_legacy_max_seq, NONNEGATIVE, "FIX09_ACTIVATION_FORMAT");
  const occurrenceLegacyCount = text(completed.occurrence_legacy_count, NONNEGATIVE, "FIX09_ACTIVATION_FORMAT");
  const occurrenceLegacyDigest = text(completed.occurrence_legacy_digest, HASH, "FIX09_ACTIVATION_FORMAT");
  const agentActionLegacyMaxSeq = text(completed.agent_action_legacy_max_seq, NONNEGATIVE, "FIX09_ACTIVATION_FORMAT");
  const agentActionLegacyCount = text(completed.agent_action_legacy_count, NONNEGATIVE, "FIX09_ACTIVATION_FORMAT");
  const agentActionLegacyDigest = text(completed.agent_action_legacy_digest, HASH, "FIX09_ACTIVATION_FORMAT");
  const publicKeyringSha256 = text(completed.public_keyring_sha256, HASH, "FIX09_ACTIVATION_FORMAT");
  const witnessBootstrapKeyId = text(completed.witness_bootstrap_key_id, HASH, "FIX09_ACTIVATION_FORMAT");
  const witness = publicKeyFromSpki(completed.witness_bootstrap_spki_der_base64, "FIX09_ACTIVATION_FORMAT");
  if (witness.id !== witnessBootstrapKeyId) fail("FIX09_ACTIVATION_FORMAT");
  const root = Buffer.from(custodianRootSpkiDer);
  let custodianPublicKey: KeyObject;
  try {
    custodianPublicKey = createPublicKey({ key: root, format: "der", type: "spki" });
  } catch (_error) {
    return fail("FIX09_ACTIVATION_FORMAT");
  }
  if (custodianPublicKey.asymmetricKeyType !== "ed25519") fail("FIX09_ACTIVATION_FORMAT");
  const custodianKeyId = text(completed.custodian_key_id, HASH, "FIX09_ACTIVATION_FORMAT");
  if (keyIdFromPublicKey(custodianPublicKey) !== custodianKeyId) fail("FIX09_ACTIVATION_FORMAT");
  const manifestSha256 = text(completed.manifest_sha256, HASH, "FIX09_ACTIVATION_FORMAT");
  const signature = canonicalBase64(completed.custodian_signature_base64, 64, "FIX09_ACTIVATION_SIGNATURE");
  const unsigned = { ...completed };
  delete unsigned.manifest_sha256;
  delete unsigned.custodian_signature_base64;
  const unsignedBytes = Buffer.from(canonicalJson(unsigned), "utf8");
  if (sha256(unsignedBytes) !== manifestSha256 ||
      !verifySignature(null, Buffer.concat([domain("obs-chain-activation-signature/v1"), unsignedBytes]), custodianPublicKey, signature)) {
    fail("FIX09_ACTIVATION_SIGNATURE");
  }
  return Object.freeze({
    completed: Object.freeze(completed), completedBytes: Buffer.from(bytes), manifestSha256,
    activationId, activatedAt, occurrenceLegacyMaxSeq, occurrenceLegacyCount,
    occurrenceLegacyDigest, agentActionLegacyMaxSeq, agentActionLegacyCount,
    agentActionLegacyDigest, publicKeyringSha256, witnessBootstrapKeyId,
    witnessBootstrapPublicKey: witness.key, custodianKeyId, custodianPublicKey,
  });
}

export interface RowAuthorization {
  readonly table: "occurrence" | "agent_action";
  readonly source: string;
  readonly minChainSeq: bigint;
  readonly maxChainSeq: bigint | null;
}

export interface VerifiedRowKey {
  readonly keyId: string;
  readonly writerIdentity: string;
  readonly publicKey: KeyObject;
  readonly authorizations: readonly RowAuthorization[];
}

export interface VerifiedRecoveryCheckpoint {
  readonly recoveryId: string;
  readonly trigger: "ROW_KEY_COMPROMISE" | "WITNESS_KEY_LOSS" | "WITNESS_KEY_COMPROMISE";
  readonly priorEpoch: string;
  readonly newEpoch: string;
  readonly completeSha256: string;
  readonly completed: Readonly<Record<string, unknown>>;
}

export interface VerifiedKeyring {
  readonly generation: string;
  readonly epoch: string;
  readonly digest: string;
  readonly priorDigest: string;
  readonly keys: readonly VerifiedRowKey[];
  readonly recoveryCheckpoints: readonly VerifiedRecoveryCheckpoint[];
}

const KEYRING_KEYS = Object.freeze([
  "protocol", "generation", "epoch", "prior_keyring_sha256", "created_at", "entries",
  "witness_keys", "recovery_checkpoints", "custodian_key_id", "custodian_signature_base64",
] as const);
const ENTRY_KEYS = Object.freeze(["key_id", "algorithm", "spki_der_base64", "writer_identity", "authorizations"] as const);
const AUTHORIZATION_KEYS = Object.freeze(["table", "source", "min_chain_seq", "max_chain_seq"] as const);
const RECOVERY_KEYS = Object.freeze([
  "schema", "recovery_id", "trigger", "created_at", "prior_epoch", "new_epoch",
  "prior_keyring_generation", "new_keyring_generation", "last_trusted_witness_seq",
  "last_trusted_witness_hash", "last_trusted_heads", "row_ranges", "witness_range",
  "custodian_key_id", "custodian_signature_base64",
] as const);
const RECOVERY_HEAD_KEYS = Object.freeze(["table", "source", "writer_identity", "chain_seq", "chain_link"] as const);
const ROW_RANGE_KEYS = Object.freeze([
  "table", "source", "writer_identity", "compromised_key_id", "last_trusted_chain_seq",
  "last_trusted_chain_link", "suspect_first_chain_seq", "suspect_last_chain_seq",
  "suspect_terminal_chain_link", "suspect_links_sha256", "next_key_id", "next_min_chain_seq",
] as const);
const WITNESS_RANGE_KEYS = Object.freeze([
  "prior_key_id", "suspect_first_witness_seq", "suspect_last_witness_seq",
  "suspect_terminal_witness_hash", "suspect_hashes_sha256", "next_key_id", "next_min_witness_seq",
] as const);

function utf8Compare(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function verifyRecoveryCheckpoint(value: unknown, activation: VerifiedActivation): VerifiedRecoveryCheckpoint {
  const completed = asRecord(value, "FIX09_RECOVERY_FORMAT");
  exactKeys(completed, RECOVERY_KEYS, "FIX09_RECOVERY_FORMAT");
  if (completed.schema !== "obs-chain-recovery/v1" || completed.custodian_key_id !== activation.custodianKeyId) fail("FIX09_RECOVERY_FORMAT");
  const recoveryId = text(completed.recovery_id, UUID, "FIX09_RECOVERY_FORMAT");
  const trigger = completed.trigger;
  if (trigger !== "ROW_KEY_COMPROMISE" && trigger !== "WITNESS_KEY_LOSS" && trigger !== "WITNESS_KEY_COMPROMISE") fail("FIX09_RECOVERY_FORMAT");
  const createdAt = text(completed.created_at, MILLIS, "FIX09_RECOVERY_FORMAT");
  if (new Date(createdAt).toISOString() !== createdAt) fail("FIX09_RECOVERY_FORMAT");
  const priorEpoch = text(completed.prior_epoch, POSITIVE, "FIX09_RECOVERY_FORMAT");
  const newEpoch = text(completed.new_epoch, POSITIVE, "FIX09_RECOVERY_FORMAT");
  if (BigInt(newEpoch) !== BigInt(priorEpoch) + 1n) fail("FIX09_RECOVERY_CONTINUITY");
  for (const field of ["prior_keyring_generation", "new_keyring_generation", "last_trusted_witness_seq"] as const) {
    text(completed[field], field === "last_trusted_witness_seq" ? NONNEGATIVE : POSITIVE, "FIX09_RECOVERY_FORMAT");
  }
  if (BigInt(completed.new_keyring_generation as string) !== BigInt(completed.prior_keyring_generation as string) + 1n) fail("FIX09_RECOVERY_CONTINUITY");
  const lastTrustedWitnessSeq = text(completed.last_trusted_witness_seq, NONNEGATIVE, "FIX09_RECOVERY_FORMAT");
  const lastTrustedWitnessHash = text(completed.last_trusted_witness_hash, HASH, "FIX09_RECOVERY_FORMAT");
  if (lastTrustedWitnessSeq === "0" && lastTrustedWitnessHash !== activation.manifestSha256) fail("FIX09_RECOVERY_CONTINUITY");
  if (!Array.isArray(completed.last_trusted_heads) || !Array.isArray(completed.row_ranges)) fail("FIX09_RECOVERY_FORMAT");
  let priorHead = "";
  const trustedHeads = new Map<string, { readonly seq: string; readonly link: string }>();
  for (const rawHead of completed.last_trusted_heads) {
    const head = asRecord(rawHead, "FIX09_RECOVERY_FORMAT");
    exactKeys(head, RECOVERY_HEAD_KEYS, "FIX09_RECOVERY_FORMAT");
    if (head.table !== "occurrence" && head.table !== "agent_action") fail("FIX09_RECOVERY_FORMAT");
    const source = text(head.source, /^(?:first_party|hatchet|ui_client|ops)$/u, "FIX09_RECOVERY_FORMAT");
    const writer = text(head.writer_identity, /^[a-z0-9][a-z0-9._-]{0,127}$/u, "FIX09_RECOVERY_FORMAT");
    const seq = text(head.chain_seq, NONNEGATIVE, "FIX09_RECOVERY_FORMAT");
    const link = text(head.chain_link, HASH, "FIX09_RECOVERY_FORMAT");
    const partition = `${head.table}\0${source}\0${writer}`;
    if (utf8Compare(priorHead, partition) >= 0) fail("FIX09_RECOVERY_FORMAT");
    priorHead = partition;
    trustedHeads.set(partition, Object.freeze({ seq, link }));
  }
  let priorRange = "";
  for (const rawRange of completed.row_ranges) {
    const range = asRecord(rawRange, "FIX09_RECOVERY_FORMAT");
    exactKeys(range, ROW_RANGE_KEYS, "FIX09_RECOVERY_FORMAT");
    if (range.table !== "occurrence" && range.table !== "agent_action") fail("FIX09_RECOVERY_FORMAT");
    const source = text(range.source, /^(?:first_party|hatchet|ui_client|ops)$/u, "FIX09_RECOVERY_FORMAT");
    const writer = text(range.writer_identity, /^[a-z0-9][a-z0-9._-]{0,127}$/u, "FIX09_RECOVERY_FORMAT");
    const partition = `${range.table}\0${source}\0${writer}`;
    if (utf8Compare(priorRange, partition) >= 0) fail("FIX09_RECOVERY_FORMAT");
    priorRange = partition;
    const trusted = trustedHeads.get(partition);
    const trustedSeq = text(range.last_trusted_chain_seq, NONNEGATIVE, "FIX09_RECOVERY_FORMAT");
    const trustedLink = text(range.last_trusted_chain_link, HASH, "FIX09_RECOVERY_FORMAT");
    if (trusted === undefined || trusted.seq !== trustedSeq || trusted.link !== trustedLink) fail("FIX09_RECOVERY_CONTINUITY");
    text(range.compromised_key_id, HASH, "FIX09_RECOVERY_FORMAT");
    text(range.suspect_terminal_chain_link, HASH, "FIX09_RECOVERY_FORMAT");
    text(range.suspect_links_sha256, HASH, "FIX09_RECOVERY_FORMAT");
    text(range.next_key_id, HASH, "FIX09_RECOVERY_FORMAT");
    const next = text(range.next_min_chain_seq, POSITIVE, "FIX09_RECOVERY_FORMAT");
    const empty = range.suspect_first_chain_seq === null && range.suspect_last_chain_seq === null;
    const populated = typeof range.suspect_first_chain_seq === "string" && POSITIVE.test(range.suspect_first_chain_seq) &&
      typeof range.suspect_last_chain_seq === "string" && POSITIVE.test(range.suspect_last_chain_seq);
    if (!empty && !populated) fail("FIX09_RECOVERY_FORMAT");
    if (empty) {
      if (range.suspect_terminal_chain_link !== trustedLink || range.suspect_links_sha256 !== sha256(Buffer.from("[]")) || BigInt(next) !== BigInt(trustedSeq) + 1n) fail("FIX09_RECOVERY_CONTINUITY");
    } else if (BigInt(range.suspect_first_chain_seq as string) !== BigInt(trustedSeq) + 1n ||
        BigInt(range.suspect_last_chain_seq as string) < BigInt(range.suspect_first_chain_seq as string) ||
        BigInt(next) !== BigInt(range.suspect_last_chain_seq as string) + 1n) fail("FIX09_RECOVERY_CONTINUITY");
  }
  const witnessRange = asRecord(completed.witness_range, "FIX09_RECOVERY_FORMAT");
  exactKeys(witnessRange, WITNESS_RANGE_KEYS, "FIX09_RECOVERY_FORMAT");
  for (const field of ["prior_key_id", "suspect_terminal_witness_hash", "suspect_hashes_sha256", "next_key_id"] as const) text(witnessRange[field], HASH, "FIX09_RECOVERY_FORMAT");
  const nextWitnessSeq = text(witnessRange.next_min_witness_seq, POSITIVE, "FIX09_RECOVERY_FORMAT");
  const emptyWitness = witnessRange.suspect_first_witness_seq === null && witnessRange.suspect_last_witness_seq === null;
  const populatedWitness = typeof witnessRange.suspect_first_witness_seq === "string" && POSITIVE.test(witnessRange.suspect_first_witness_seq) &&
    typeof witnessRange.suspect_last_witness_seq === "string" && POSITIVE.test(witnessRange.suspect_last_witness_seq);
  if (!emptyWitness && !populatedWitness) fail("FIX09_RECOVERY_FORMAT");
  if (emptyWitness) {
    if (witnessRange.suspect_terminal_witness_hash !== lastTrustedWitnessHash || witnessRange.suspect_hashes_sha256 !== sha256(Buffer.from("[]")) || BigInt(nextWitnessSeq) !== BigInt(lastTrustedWitnessSeq) + 1n) fail("FIX09_RECOVERY_CONTINUITY");
  } else if (BigInt(witnessRange.suspect_first_witness_seq as string) !== BigInt(lastTrustedWitnessSeq) + 1n ||
      BigInt(witnessRange.suspect_last_witness_seq as string) < BigInt(witnessRange.suspect_first_witness_seq as string) ||
      BigInt(nextWitnessSeq) !== BigInt(witnessRange.suspect_last_witness_seq as string) + 1n) fail("FIX09_RECOVERY_CONTINUITY");
  if ((trigger === "ROW_KEY_COMPROMISE") !== (completed.row_ranges.length > 0) ||
      (trigger === "WITNESS_KEY_LOSS" && !emptyWitness) || (trigger === "WITNESS_KEY_COMPROMISE" && !populatedWitness)) fail("FIX09_RECOVERY_CONTINUITY");
  const signature = canonicalBase64(completed.custodian_signature_base64, 64, "FIX09_RECOVERY_SIGNATURE");
  const unsigned = { ...completed };
  delete unsigned.custodian_signature_base64;
  const unsignedBytes = Buffer.from(canonicalJson(unsigned), "utf8");
  if (!verifySignature(null, Buffer.concat([domain("obs-chain-recovery-signature/v1"), unsignedBytes]), activation.custodianPublicKey, signature)) {
    fail("FIX09_RECOVERY_SIGNATURE");
  }
  return Object.freeze({ recoveryId, trigger, priorEpoch, newEpoch,
    completeSha256: sha256(Buffer.from(canonicalJson(completed), "utf8")), completed: Object.freeze(completed) });
}

export function verifyPublicKeyring(
  bytes: Uint8Array,
  activation: VerifiedActivation,
  prior?: Readonly<{ generation: string; digest: string }>,
): VerifiedKeyring {
  let completed: Record<string, unknown>;
  try {
    completed = parseCanonicalDocument(bytes, "FIX09_KEYRING_FORMAT");
    exactKeys(completed, KEYRING_KEYS, "FIX09_KEYRING_FORMAT");
    if (completed.protocol !== "obs-chain-public-keyring/v1" || completed.custodian_key_id !== activation.custodianKeyId ||
        !Array.isArray(completed.entries) || !Array.isArray(completed.witness_keys) || completed.witness_keys.length !== 0 ||
        !Array.isArray(completed.recovery_checkpoints)) fail("FIX09_KEYRING_FORMAT");
    const generation = text(completed.generation, POSITIVE, "FIX09_KEYRING_FORMAT");
    const epoch = text(completed.epoch, POSITIVE, "FIX09_KEYRING_FORMAT");
    const priorDigest = text(completed.prior_keyring_sha256, HASH, "FIX09_KEYRING_FORMAT");
    const createdAt = text(completed.created_at, MILLIS, "FIX09_KEYRING_FORMAT");
    if (new Date(createdAt).toISOString() !== createdAt) fail("FIX09_KEYRING_FORMAT");
    const digest = sha256(Buffer.from(bytes));
    if (prior === undefined) {
      if (generation !== "1" || epoch !== "1" || priorDigest !== ZERO_HASH || digest !== activation.publicKeyringSha256) fail("FIX09_KEYRING_CONTINUITY");
    } else if (generation === prior.generation && digest === prior.digest) {
      // The current cumulative file is already witnessed; its internal prior
      // digest remains the one signed when this generation was published.
    } else if (BigInt(generation) !== BigInt(prior.generation) + 1n || priorDigest !== prior.digest) {
      fail("FIX09_KEYRING_CONTINUITY");
    }
    const signature = canonicalBase64(completed.custodian_signature_base64, 64, "FIX09_KEYRING_SIGNATURE");
    const unsigned = { ...completed };
    delete unsigned.custodian_signature_base64;
    const unsignedBytes = Buffer.from(canonicalJson(unsigned), "utf8");
    if (!verifySignature(null, Buffer.concat([domain("obs-chain-keyring-signature/v1"), unsignedBytes]), activation.custodianPublicKey, signature)) fail("FIX09_KEYRING_SIGNATURE");
    const keys: VerifiedRowKey[] = [];
    const usedKeyIds = new Set<string>();
    const partitionIntervals = new Map<string, Array<Readonly<{ min: bigint; max: bigint | null }>>>();
    let priorEntryKey: string | undefined;
    for (const rawEntry of completed.entries) {
      const entry = asRecord(rawEntry, "FIX09_KEYRING_FORMAT");
      exactKeys(entry, ENTRY_KEYS, "FIX09_KEYRING_FORMAT");
      if (entry.algorithm !== "ed25519" || !Array.isArray(entry.authorizations)) fail("FIX09_KEYRING_FORMAT");
      const keyId = text(entry.key_id, HASH, "FIX09_KEYRING_FORMAT");
      const writerIdentity = text(entry.writer_identity, /^[a-z0-9][a-z0-9._-]{0,127}$/u, "FIX09_KEYRING_FORMAT");
      const publicKey = publicKeyFromSpki(entry.spki_der_base64, "FIX09_KEYRING_FORMAT");
      if (publicKey.id !== keyId || usedKeyIds.has(keyId)) fail("FIX09_KEYRING_FORMAT");
      usedKeyIds.add(keyId);
      const entrySort = `${writerIdentity}\0${keyId}`;
      if (priorEntryKey !== undefined && utf8Compare(priorEntryKey, entrySort) >= 0) fail("FIX09_KEYRING_FORMAT");
      priorEntryKey = entrySort;
      const authorizations: RowAuthorization[] = [];
      let priorAuthorization: string | undefined;
      for (const rawAuthorization of entry.authorizations) {
        const authorization = asRecord(rawAuthorization, "FIX09_KEYRING_FORMAT");
        exactKeys(authorization, AUTHORIZATION_KEYS, "FIX09_KEYRING_FORMAT");
        const table = authorization.table;
        const source = authorization.source;
        if ((table !== "occurrence" && table !== "agent_action") ||
            !new Set(["first_party", "hatchet", "ui_client", "ops"]).has(source as string)) fail("FIX09_KEYRING_FORMAT");
        const min = text(authorization.min_chain_seq, POSITIVE, "FIX09_KEYRING_FORMAT");
        const max = authorization.max_chain_seq === null ? null : text(authorization.max_chain_seq, POSITIVE, "FIX09_KEYRING_FORMAT");
        if (max !== null && BigInt(max) < BigInt(min)) fail("FIX09_KEYRING_FORMAT");
        const sort = `${table}\0${source}\0${min.padStart(40, "0")}`;
        if (priorAuthorization !== undefined && utf8Compare(priorAuthorization, sort) >= 0) fail("FIX09_KEYRING_FORMAT");
        priorAuthorization = sort;
        const previous = authorizations.find((candidate) => candidate.table === table && candidate.source === source);
        if (previous !== undefined && (previous.maxChainSeq === null || previous.maxChainSeq >= BigInt(min))) fail("FIX09_KEYRING_FORMAT");
        const minSequence = BigInt(min);
        const maxSequence = max === null ? null : BigInt(max);
        authorizations.push(Object.freeze({ table, source: source as string, minChainSeq: minSequence, maxChainSeq: maxSequence }));
        const partition = `${table as string}\0${source as string}\0${writerIdentity}`;
        const intervals = partitionIntervals.get(partition) ?? [];
        intervals.push(Object.freeze({ min: minSequence, max: maxSequence }));
        partitionIntervals.set(partition, intervals);
      }
      if (authorizations.length === 0) fail("FIX09_KEYRING_FORMAT");
      keys.push(Object.freeze({ keyId, writerIdentity, publicKey: publicKey.key, authorizations: Object.freeze(authorizations) }));
    }
    for (const intervals of partitionIntervals.values()) {
      intervals.sort((left, right) => left.min < right.min ? -1 : left.min > right.min ? 1 : 0);
      for (let index = 1; index < intervals.length; index += 1) {
        const previous = intervals[index - 1]!;
        if (previous.max === null || previous.max >= intervals[index]!.min) fail("FIX09_KEYRING_FORMAT");
      }
    }
    const recoveryCheckpoints = completed.recovery_checkpoints.map((checkpoint) => verifyRecoveryCheckpoint(checkpoint, activation));
    let expectedEpoch = 1n;
    let expectedGeneration = 1n;
    for (const checkpoint of recoveryCheckpoints) {
      if (BigInt(checkpoint.priorEpoch) !== expectedEpoch || BigInt(checkpoint.newEpoch) !== expectedEpoch + 1n) fail("FIX09_RECOVERY_CONTINUITY");
      const body = checkpoint.completed;
      if (BigInt(body.prior_keyring_generation as string) < expectedGeneration ||
          BigInt(body.new_keyring_generation as string) !== BigInt(body.prior_keyring_generation as string) + 1n) fail("FIX09_RECOVERY_CONTINUITY");
      expectedEpoch = BigInt(checkpoint.newEpoch);
      expectedGeneration = BigInt(body.new_keyring_generation as string);
    }
    if (BigInt(epoch) !== expectedEpoch || BigInt(generation) < expectedGeneration) fail("FIX09_RECOVERY_CONTINUITY");
    return Object.freeze({ generation, epoch, digest, priorDigest, keys: Object.freeze(keys), recoveryCheckpoints: Object.freeze(recoveryCheckpoints) });
  } catch (error) {
    if (error instanceof TypeError && error.message.startsWith("FIX09_KEYRING_")) throw error;
    if (error instanceof TypeError && error.message.startsWith("FIX09_RECOVERY_")) {
      fail("FIX09_RECOVERY_INVALID");
    }
    return fail("FIX09_KEYRING_FORMAT");
  }
}

export interface WitnessHead {
  readonly table: "occurrence" | "agent_action";
  readonly source: string;
  readonly writer_identity: string;
  readonly chain_seq: string;
  readonly chain_link: string;
}

export interface LegacyWitness {
  readonly occurrence: Readonly<{ status: "LEGACY_WITNESSED_UNVERIFIED"; count: string; max_seq: string; digest: string }>;
  readonly agent_action: Readonly<{ status: "LEGACY_WITNESSED_UNVERIFIED"; count: string; max_seq: string; digest: string }>;
}

export interface AuditSnapshot {
  readonly snapshotText: string;
  readonly occurrenceHighWater: string;
  readonly agentActionHighWater: string;
  readonly occurrenceRows: readonly Readonly<Record<string, unknown>>[];
  readonly agentActionRows: readonly Readonly<Record<string, unknown>>[];
}

export interface PriorWitnessState {
  readonly occurrenceHighWater: string;
  readonly agentActionHighWater: string;
  readonly heads: readonly WitnessHead[];
}

export interface AuditVerification extends VerificationOutcome {
  readonly heads: readonly WitnessHead[];
  readonly legacy: LegacyWitness;
  readonly snapshot: Readonly<{ snapshot_text: string | null; occurrence_high_water: string | null; agent_action_high_water: string | null }>;
  readonly recovery: Readonly<{ epoch: string; latest_recovery_id: string | null; suspect_range_count: string }>;
}

function rowProjection(table: "occurrence" | "agent_action", row: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const output = Object.create(null) as Record<string, unknown>;
  const columns = table === "occurrence" ? OCCURRENCE_COLUMNS : AGENT_ACTION_COLUMNS;
  for (const [name] of columns) {
    if (!Object.hasOwn(row, name)) fail("FIX09_ROW_FORMAT");
    Object.defineProperty(output, name, {
      configurable: true,
      enumerable: true,
      value: row[name],
      writable: true,
    });
  }
  return Object.freeze(output);
}

function bytes(value: unknown, length: number, code: VerificationReason): Buffer {
  const output = Buffer.isBuffer(value) ? Buffer.from(value) : typeof value === "string" && /^[0-9a-f]+$/u.test(value) ? Buffer.from(value, "hex") : fail(code);
  if (output.length !== length) fail(code);
  return output;
}

function decimal(value: unknown, positive: boolean, code: VerificationReason): string {
  const output = typeof value === "bigint" ? value.toString() : typeof value === "number" && Number.isSafeInteger(value) ? String(value) : value;
  return text(output, positive ? POSITIVE : NONNEGATIVE, code);
}

function legacyFor(
  table: "occurrence" | "agent_action",
  rows: readonly Readonly<Record<string, unknown>>[],
): { readonly count: string; readonly max: string; readonly digest: string } {
  const global = table === "occurrence" ? "occ_seq" : "action_seq";
  const sorted = [...rows].sort((left, right) => BigInt(decimal(left[global], true, "LEGACY_CHANGED")) < BigInt(decimal(right[global], true, "LEGACY_CHANGED")) ? -1 : 1);
  const pairs = sorted.map((row) => Object.freeze([decimal(row[global], true, "LEGACY_CHANGED"), sha256(canonicalRowBytes(table, rowProjection(table, row)))]));
  return Object.freeze({ count: String(sorted.length), max: sorted.length === 0 ? "0" : decimal(sorted.at(-1)?.[global], true, "LEGACY_CHANGED"), digest: sha256(Buffer.from(canonicalJson(Object.freeze(pairs)), "utf8")) });
}

function authorizedKey(keyring: VerifiedKeyring, table: "occurrence" | "agent_action", row: Readonly<Record<string, unknown>>, seq: bigint): KeyObject | undefined {
  const keyId = row.chain_key_id;
  const writer = row.writer_identity;
  const source = row.source;
  if (typeof keyId !== "string" || typeof writer !== "string" || typeof source !== "string") return undefined;
  const key = keyring.keys.find((candidate) => candidate.keyId === keyId && candidate.writerIdentity === writer);
  if (key === undefined) return undefined;
  const allowed = key.authorizations.some((entry) => entry.table === table && entry.source === source && seq >= entry.minChainSeq && (entry.maxChainSeq === null || seq <= entry.maxChainSeq));
  return allowed ? key.publicKey : undefined;
}

function sortedHeads(heads: WitnessHead[]): readonly WitnessHead[] {
  return Object.freeze(heads.sort((left, right) => {
    for (const field of ["table", "source", "writer_identity"] as const) {
      const comparison = utf8Compare(left[field], right[field]);
      if (comparison !== 0) return comparison;
    }
    return 0;
  }));
}

interface SuspectRowRange {
  readonly first: bigint;
  readonly last: bigint;
  readonly compromisedKeyId: string;
}

function recoveryRanges(
  partitions: ReadonlyMap<string, { table: "occurrence" | "agent_action"; rows: Readonly<Record<string, unknown>>[] }>,
  keyring: VerifiedKeyring,
): ReadonlyMap<string, readonly SuspectRowRange[]> {
  const result = new Map<string, SuspectRowRange[]>();
  for (const checkpoint of keyring.recoveryCheckpoints) {
    for (const raw of checkpoint.completed.row_ranges as readonly unknown[]) {
      const range = raw as Record<string, unknown>;
      const partition = `${range.table as string}\0${range.source as string}\0${range.writer_identity as string}`;
      const bucket = partitions.get(partition);
      if (bucket === undefined) fail("RECOVERY_CONTINUITY");
      const rows = [...bucket.rows].sort((left, right) => BigInt(decimal(left.chain_seq, true, "RECOVERY_CONTINUITY")) < BigInt(decimal(right.chain_seq, true, "RECOVERY_CONTINUITY")) ? -1 : 1);
      const trustedSeq = BigInt(range.last_trusted_chain_seq as string);
      const trustedLink = range.last_trusted_chain_link as string;
      if (trustedSeq > 0n) {
        const trusted = rows.find((row) => BigInt(decimal(row.chain_seq, true, "RECOVERY_CONTINUITY")) === trustedSeq);
        if (trusted === undefined || bytes(trusted.chain_link, 32, "RECOVERY_CONTINUITY").toString("hex") !== trustedLink) fail("RECOVERY_CONTINUITY");
      }
      const nextSequence = BigInt(range.next_min_chain_seq as string);
      const next = rows.find((row) => BigInt(decimal(row.chain_seq, true, "RECOVERY_CONTINUITY")) === nextSequence);
      if (next === undefined || next.chain_key_id !== range.next_key_id ||
          bytes(next.prev_link, 32, "RECOVERY_CONTINUITY").toString("hex") !== range.suspect_terminal_chain_link) fail("RECOVERY_CONTINUITY");
      if (range.suspect_first_chain_seq === null) continue;
      const first = BigInt(range.suspect_first_chain_seq as string);
      const last = BigInt(range.suspect_last_chain_seq as string);
      const suspect = rows.filter((row) => {
        const sequence = BigInt(decimal(row.chain_seq, true, "RECOVERY_CONTINUITY"));
        return sequence >= first && sequence <= last;
      });
      if (suspect.length !== Number(last - first + 1n)) fail("RECOVERY_CONTINUITY");
      const pairs = suspect.map((row) => Object.freeze([
        decimal(row.chain_seq, true, "RECOVERY_CONTINUITY"), bytes(row.chain_link, 32, "RECOVERY_CONTINUITY").toString("hex"),
      ]));
      if (sha256(Buffer.from(canonicalJson(Object.freeze(pairs)), "utf8")) !== range.suspect_links_sha256 ||
          pairs.at(-1)?.[1] !== range.suspect_terminal_chain_link) fail("RECOVERY_CONTINUITY");
      const ranges = result.get(partition) ?? [];
      ranges.push(Object.freeze({ first, last, compromisedKeyId: range.compromised_key_id as string }));
      result.set(partition, ranges);
    }
  }
  return result;
}

function emptyLegacy(activation: VerifiedActivation): LegacyWitness {
  const value = (count: string, max_seq: string, digest: string) => Object.freeze({ status: "LEGACY_WITNESSED_UNVERIFIED" as const, count, max_seq, digest });
  return Object.freeze({
    occurrence: value(activation.occurrenceLegacyCount, activation.occurrenceLegacyMaxSeq, activation.occurrenceLegacyDigest),
    agent_action: value(activation.agentActionLegacyCount, activation.agentActionLegacyMaxSeq, activation.agentActionLegacyDigest),
  });
}

export function verifyAuditSnapshot(
  snapshot: AuditSnapshot,
  activation: VerifiedActivation,
  keyring: VerifiedKeyring,
  prior?: PriorWitnessState,
): AuditVerification {
  const occurrenceHighWater = decimal(snapshot.occurrenceHighWater, false, "HEAD_REGRESSION");
  const agentActionHighWater = decimal(snapshot.agentActionHighWater, false, "HEAD_REGRESSION");
  const base = {
    heads: Object.freeze([]) as readonly WitnessHead[],
    legacy: emptyLegacy(activation),
    snapshot: Object.freeze({ snapshot_text: snapshot.snapshotText, occurrence_high_water: occurrenceHighWater, agent_action_high_water: agentActionHighWater }),
    recovery: Object.freeze({ epoch: keyring.epoch, latest_recovery_id: keyring.recoveryCheckpoints.at(-1)?.recoveryId ?? null, suspect_range_count: String(keyring.recoveryCheckpoints.reduce((count, checkpoint) => count + (checkpoint.completed.row_ranges as unknown[]).length, 0)) }),
  };
  const closed = (reason: VerificationReason): AuditVerification => {
    const result: VerificationResult = reason === "NONE" ? "VERIFIED" : reason === "RECOVERY_CHECKPOINT" ? "VERIFIED_WITH_RECOVERY" : "CHAIN_BREAK";
    return Object.freeze({ ...base, ...verificationOutcome(result, reason) });
  };
  try {
    if (prior !== undefined && (BigInt(occurrenceHighWater) < BigInt(prior.occurrenceHighWater) || BigInt(agentActionHighWater) < BigInt(prior.agentActionHighWater))) return closed("HEAD_REGRESSION");
    const occurrenceLegacy: Readonly<Record<string, unknown>>[] = [];
    const actionLegacy: Readonly<Record<string, unknown>>[] = [];
    const modern = new Map<string, { table: "occurrence" | "agent_action"; rows: Readonly<Record<string, unknown>>[] }>();
    for (const [table, rows, highWater, boundary, legacy] of [
      ["occurrence", snapshot.occurrenceRows, occurrenceHighWater, activation.occurrenceLegacyMaxSeq, occurrenceLegacy],
      ["agent_action", snapshot.agentActionRows, agentActionHighWater, activation.agentActionLegacyMaxSeq, actionLegacy],
    ] as const) {
      const global = table === "occurrence" ? "occ_seq" : "action_seq";
      for (const row of rows) {
        const globalSeq = BigInt(decimal(row[global], true, "CHAIN_SEQUENCE"));
        if (globalSeq > BigInt(highWater)) return closed("CHAIN_SEQUENCE");
        if (row.chain_version === null) {
          if ([row.chain_key_id, row.chain_seq, row.prev_link, row.chain_signature, row.chain_link].some((value) => value !== null) || globalSeq > BigInt(boundary)) return closed("LEGACY_CHANGED");
          legacy.push(row);
          continue;
        }
        if (row.chain_version !== 1 || globalSeq <= BigInt(boundary) || typeof row.source !== "string" || typeof row.writer_identity !== "string") return closed("CHAIN_SEQUENCE");
        const partition = `${table}\0${row.source}\0${row.writer_identity}`;
        const bucket = modern.get(partition) ?? { table, rows: [] };
        bucket.rows.push(row);
        modern.set(partition, bucket);
      }
    }
    const occurrenceLegacyValue = legacyFor("occurrence", occurrenceLegacy);
    const actionLegacyValue = legacyFor("agent_action", actionLegacy);
    if (occurrenceLegacyValue.count !== activation.occurrenceLegacyCount || occurrenceLegacyValue.max !== activation.occurrenceLegacyMaxSeq || occurrenceLegacyValue.digest !== activation.occurrenceLegacyDigest ||
        actionLegacyValue.count !== activation.agentActionLegacyCount || actionLegacyValue.max !== activation.agentActionLegacyMaxSeq || actionLegacyValue.digest !== activation.agentActionLegacyDigest) return closed("LEGACY_CHANGED");
    const heads: WitnessHead[] = [];
    let suspectRanges: ReadonlyMap<string, readonly SuspectRowRange[]>;
    try { suspectRanges = recoveryRanges(modern, keyring); }
    catch (_error) { return closed("RECOVERY_CONTINUITY"); }
    for (const bucket of modern.values()) {
      bucket.rows.sort((left, right) => BigInt(decimal(left.chain_seq, true, "CHAIN_SEQUENCE")) < BigInt(decimal(right.chain_seq, true, "CHAIN_SEQUENCE")) ? -1 : 1);
      let priorLink: Buffer | undefined;
      let expected = 1n;
      for (const row of bucket.rows) {
        const sequence = BigInt(decimal(row.chain_seq, true, "CHAIN_SEQUENCE"));
        if (sequence !== expected) return closed("CHAIN_SEQUENCE");
        const previous = bytes(row.prev_link, 32, expected === 1n ? "GENESIS" : "PREV_LINK");
        const expectedPrevious = expected === 1n
          ? genesisLink(bucket.table, row.source as string, row.writer_identity as string, Buffer.from(activation.manifestSha256, "hex"))
          : priorLink!;
        if (!previous.equals(expectedPrevious)) return closed(expected === 1n ? "GENESIS" : "PREV_LINK");
        const partition = `${bucket.table}\0${row.source as string}\0${row.writer_identity as string}`;
        const suspect = suspectRanges.get(partition)?.find((range) => sequence >= range.first && sequence <= range.last);
        const key = suspect === undefined ? authorizedKey(keyring, bucket.table, row, sequence) : undefined;
        if (suspect === undefined && key === undefined) return closed("KEY_AUTHORIZATION");
        if (suspect !== undefined && row.chain_key_id !== suspect.compromisedKeyId) return closed("RECOVERY_CONTINUITY");
        let canonical: Buffer;
        try { canonical = canonicalRowBytes(bucket.table, rowProjection(bucket.table, row)); }
        catch (_error) { return closed("ROW_SIGNATURE"); }
        const signature = bytes(row.chain_signature, 64, "ROW_SIGNATURE");
        if (key !== undefined && !verifySignature(null, signatureMessage(canonical), key, signature)) return closed("ROW_SIGNATURE");
        const derived = chainLink(canonical, signature);
        if (!derived.equals(bytes(row.chain_link, 32, "ROW_LINK"))) return closed("ROW_LINK");
        priorLink = derived;
        expected += 1n;
      }
      const tail = bucket.rows.at(-1)!;
      heads.push(Object.freeze({ table: bucket.table, source: tail.source as string, writer_identity: tail.writer_identity as string,
        chain_seq: decimal(tail.chain_seq, true, "CHAIN_SEQUENCE"), chain_link: bytes(tail.chain_link, 32, "ROW_LINK").toString("hex") }));
    }
    const orderedHeads = sortedHeads(heads);
    if (prior !== undefined) {
      for (const oldHead of prior.heads) {
        const next = orderedHeads.find((candidate) => candidate.table === oldHead.table && candidate.source === oldHead.source && candidate.writer_identity === oldHead.writer_identity);
        if (next === undefined || BigInt(next.chain_seq) < BigInt(oldHead.chain_seq) || (next.chain_seq === oldHead.chain_seq && next.chain_link !== oldHead.chain_link)) return closed("HEAD_REGRESSION");
      }
    }
    const legacy: LegacyWitness = Object.freeze({
      occurrence: Object.freeze({ status: "LEGACY_WITNESSED_UNVERIFIED", count: occurrenceLegacyValue.count, max_seq: occurrenceLegacyValue.max, digest: occurrenceLegacyValue.digest }),
      agent_action: Object.freeze({ status: "LEGACY_WITNESSED_UNVERIFIED", count: actionLegacyValue.count, max_seq: actionLegacyValue.max, digest: actionLegacyValue.digest }),
    });
    const successReason = keyring.recoveryCheckpoints.length === 0 ? "NONE" : "RECOVERY_CHECKPOINT";
    return Object.freeze({ ...base, heads: orderedHeads, legacy, ...verificationOutcome(successReason === "NONE" ? "VERIFIED" : "VERIFIED_WITH_RECOVERY", successReason) });
  } catch (error) {
    const reason = error instanceof Error && verificationReasons.includes(error.message as VerificationReason)
      ? error.message as VerificationReason : "CHAIN_SEQUENCE";
    return closed(reason);
  }
}

export function emptyLegacyDigest(): string {
  return sha256(Buffer.from("[]", "utf8"));
}

export { canonicalJson, keyIdFromPublicKey } from "./canonical.js";
