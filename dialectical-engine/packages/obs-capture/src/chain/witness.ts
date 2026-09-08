import {
  constants,
  closeSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  writeSync,
} from "node:fs";
import { createHash, createPublicKey, sign, verify, type KeyObject } from "node:crypto";
import { isAbsolute, join, normalize } from "node:path";

import { canonicalJson, keyIdFromPublicKey, lengthPrefix } from "./canonical.js";
import { parseUniqueJson } from "./unique-json.js";
import {
  verificationOutcome,
  type LegacyWitness,
  type VerificationReason,
  type VerificationResult,
  type VerifiedActivation,
  type VerifiedRecoveryCheckpoint,
  type WitnessHead,
} from "./verify.js";

export const witnessProtocol = "obs-chain-witness/v1" as const;

const HASH = /^[0-9a-f]{64}$/u;
const POSITIVE = /^[1-9][0-9]*$/u;
const NONNEGATIVE = /^(?:0|[1-9][0-9]*)$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const MILLIS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const SNAPSHOT = /^[0-9]+:[0-9]+:(?:[0-9]+(?:,[0-9]+)*)?$/u;
const MAX_JOURNAL_BYTES = 16 * 1024 * 1024;
const O_EXLOCK_DARWIN = 0x20;

const UNSIGNED_KEYS = Object.freeze([
  "schema", "witness_seq", "cycle_id", "observed_at", "activation_manifest_sha256",
  "keyring_generation", "keyring_sha256", "snapshot", "legacy", "heads", "recovery",
  "result", "reason", "prior_witness_hash", "witness_authorization", "witness_key_id",
] as const);
const COMPLETED_KEYS = Object.freeze([...UNSIGNED_KEYS, "witness_signature_base64", "witness_hash"] as const);
const HEAD_KEYS = Object.freeze(["table", "source", "writer_identity", "chain_seq", "chain_link"] as const);
const SNAPSHOT_KEYS = Object.freeze(["snapshot_text", "occurrence_high_water", "agent_action_high_water"] as const);
const LEGACY_KEYS = Object.freeze(["occurrence", "agent_action"] as const);
const LEGACY_ROW_KEYS = Object.freeze(["status", "count", "max_seq", "digest"] as const);
const RECOVERY_KEYS = Object.freeze(["epoch", "latest_recovery_id", "suspect_range_count"] as const);
const AUTHORIZATION_KEYS = Object.freeze([
  "schema", "reason", "prior_witness_key_id", "new_witness_key_id",
  "new_witness_spki_der_base64", "min_witness_seq", "prior_witness_seq",
  "prior_witness_hash", "recovery_id", "recovery_checkpoint_sha256",
  "custodian_key_id", "custodian_signature_base64",
] as const);

export interface WitnessSnapshot {
  readonly snapshot_text: string | null;
  readonly occurrence_high_water: string | null;
  readonly agent_action_high_water: string | null;
}

export interface WitnessRecovery {
  readonly epoch: string;
  readonly latest_recovery_id: string | null;
  readonly suspect_range_count: string;
}

export interface WitnessAuthorization {
  readonly schema: "obs-witness-key-authorization/v1";
  readonly reason: "PLANNED_ROTATION" | "WITNESS_KEY_LOSS" | "WITNESS_KEY_COMPROMISE";
  readonly prior_witness_key_id: string;
  readonly new_witness_key_id: string;
  readonly new_witness_spki_der_base64: string;
  readonly min_witness_seq: string;
  readonly prior_witness_seq: string;
  readonly prior_witness_hash: string;
  readonly recovery_id: string | null;
  readonly recovery_checkpoint_sha256: string | null;
  readonly custodian_key_id: string;
  readonly custodian_signature_base64: string;
}

export interface UnsignedWitnessRecord {
  readonly schema: "obs-chain-witness/v1";
  readonly witness_seq: string;
  readonly cycle_id: string;
  readonly observed_at: string;
  readonly activation_manifest_sha256: string;
  readonly keyring_generation: string | null;
  readonly keyring_sha256: string | null;
  readonly snapshot: WitnessSnapshot;
  readonly legacy: LegacyWitness;
  readonly heads: readonly WitnessHead[];
  readonly recovery: WitnessRecovery;
  readonly result: VerificationResult;
  readonly reason: VerificationReason;
  readonly prior_witness_hash: string;
  readonly witness_authorization: WitnessAuthorization | null;
  readonly witness_key_id: string;
}

export interface CompletedWitnessRecord extends UnsignedWitnessRecord {
  readonly witness_signature_base64: string;
  readonly witness_hash: string;
}

export interface WitnessJournalState {
  readonly count: string;
  readonly nextSequence: string;
  readonly priorWitnessHash: string;
  readonly witnessKeyId: string;
  readonly witnessPublicKey: KeyObject;
  readonly tail: CompletedWitnessRecord | null;
  readonly occurrenceHighWater: string;
  readonly agentActionHighWater: string;
  readonly heads: readonly WitnessHead[];
  readonly keyringGeneration: string | null;
  readonly keyringSha256: string | null;
  readonly recovery: WitnessRecovery;
}

function fail(code: string): never {
  throw new TypeError(code);
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function domain(value: string): Buffer {
  return Buffer.concat([Buffer.from(value, "utf8"), Buffer.from([0])]);
}

function record(value: unknown, code = "FIX09_WITNESS_FORMAT"): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(code);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(code);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], code = "FIX09_WITNESS_FORMAT"): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((entry, index) => entry !== wanted[index])) fail(code);
}

function string(value: unknown, pattern: RegExp, code = "FIX09_WITNESS_FORMAT"): string {
  if (typeof value !== "string" || !pattern.test(value)) fail(code);
  return value;
}

function base64(value: unknown, bytes: number, code = "FIX09_WITNESS_FORMAT"): Buffer {
  if (typeof value !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) fail(code);
  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== bytes || decoded.toString("base64") !== value) fail(code);
  return decoded;
}

function utf8Compare(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function validateLegacy(value: unknown): void {
  const legacy = record(value);
  exactKeys(legacy, LEGACY_KEYS);
  for (const table of LEGACY_KEYS) {
    const row = record(legacy[table]);
    exactKeys(row, LEGACY_ROW_KEYS);
    if (row.status !== "LEGACY_WITNESSED_UNVERIFIED") fail("FIX09_WITNESS_FORMAT");
    string(row.count, NONNEGATIVE);
    string(row.max_seq, NONNEGATIVE);
    string(row.digest, HASH);
  }
}

function validateHeads(value: unknown): readonly WitnessHead[] {
  if (!Array.isArray(value)) fail("FIX09_WITNESS_FORMAT");
  let previous: string | undefined;
  const result: WitnessHead[] = [];
  for (const item of value) {
    const head = record(item);
    exactKeys(head, HEAD_KEYS);
    if (head.table !== "occurrence" && head.table !== "agent_action") fail("FIX09_WITNESS_FORMAT");
    const source = string(head.source, /^(?:first_party|hatchet|ui_client|ops)$/u);
    const writerIdentity = string(head.writer_identity, /^[a-z0-9][a-z0-9._-]{0,127}$/u);
    const chainSeq = string(head.chain_seq, POSITIVE);
    const chainLink = string(head.chain_link, HASH);
    const sort = `${head.table}\0${source}\0${writerIdentity}`;
    if (previous !== undefined && utf8Compare(previous, sort) >= 0) fail("FIX09_WITNESS_FORMAT");
    previous = sort;
    result.push(Object.freeze({ table: head.table, source, writer_identity: writerIdentity, chain_seq: chainSeq, chain_link: chainLink }));
  }
  return Object.freeze(result);
}

function validateUnsigned(value: unknown): UnsignedWitnessRecord {
  const item = record(value);
  exactKeys(item, UNSIGNED_KEYS);
  if (item.schema !== witnessProtocol) fail("FIX09_WITNESS_FORMAT");
  string(item.witness_seq, POSITIVE);
  string(item.cycle_id, UUID);
  const observedAt = string(item.observed_at, MILLIS);
  if (new Date(observedAt).toISOString() !== observedAt) fail("FIX09_WITNESS_FORMAT");
  string(item.activation_manifest_sha256, HASH);
  if ((item.keyring_generation === null) !== (item.keyring_sha256 === null)) fail("FIX09_WITNESS_FORMAT");
  if (item.keyring_generation !== null) string(item.keyring_generation, POSITIVE);
  if (item.keyring_sha256 !== null) string(item.keyring_sha256, HASH);
  const snapshot = record(item.snapshot);
  exactKeys(snapshot, SNAPSHOT_KEYS);
  const nullSnapshot = snapshot.snapshot_text === null && snapshot.occurrence_high_water === null && snapshot.agent_action_high_water === null;
  const completeSnapshot = typeof snapshot.snapshot_text === "string" && SNAPSHOT.test(snapshot.snapshot_text) &&
    typeof snapshot.occurrence_high_water === "string" && NONNEGATIVE.test(snapshot.occurrence_high_water) &&
    typeof snapshot.agent_action_high_water === "string" && NONNEGATIVE.test(snapshot.agent_action_high_water);
  if (!nullSnapshot && !completeSnapshot) fail("FIX09_WITNESS_FORMAT");
  validateLegacy(item.legacy);
  const heads = validateHeads(item.heads);
  const recovery = record(item.recovery);
  exactKeys(recovery, RECOVERY_KEYS);
  string(recovery.epoch, POSITIVE);
  if (recovery.latest_recovery_id !== null) string(recovery.latest_recovery_id, UUID);
  string(recovery.suspect_range_count, NONNEGATIVE);
  if (!new Set(["VERIFIED", "VERIFIED_WITH_RECOVERY", "CHAIN_BREAK", "VERIFY_UNAVAILABLE", "KEYRING_INVALID", "WITNESS_INVALID"]).has(item.result as string) ||
      typeof item.reason !== "string") fail("FIX09_WITNESS_FORMAT");
  verificationOutcome(item.result as VerificationResult, item.reason as VerificationReason);
  string(item.prior_witness_hash, HASH);
  if (item.witness_authorization !== null) record(item.witness_authorization);
  string(item.witness_key_id, HASH);
  if ((item.result === "VERIFIED" || item.result === "VERIFIED_WITH_RECOVERY" || item.result === "CHAIN_BREAK") && !completeSnapshot) fail("FIX09_WITNESS_FORMAT");
  if (nullSnapshot && heads.length !== 0) fail("FIX09_WITNESS_FORMAT");
  if ((item.result === "KEYRING_INVALID" || (item.result === "VERIFY_UNAVAILABLE" && item.reason === "PUBLIC_MATERIAL_UNAVAILABLE")) && (item.keyring_generation !== null || item.keyring_sha256 !== null)) fail("FIX09_WITNESS_FORMAT");
  return item as unknown as UnsignedWitnessRecord;
}

function completedBytes(unsigned: UnsignedWitnessRecord, signature: Buffer): { readonly hash: string; readonly unsignedBytes: Buffer } {
  const unsignedBytes = Buffer.from(canonicalJson(unsigned), "utf8");
  const hash = createHash("sha256")
    .update(domain("obs-witness-link/v1"))
    .update(lengthPrefix(unsignedBytes))
    .update(signature)
    .digest("hex");
  return Object.freeze({ hash, unsignedBytes });
}

export function completeWitnessRecord(unsignedInput: UnsignedWitnessRecord, privateKey: KeyObject): CompletedWitnessRecord {
  const unsigned = validateUnsigned(unsignedInput);
  const key = createPublicKey(privateKey);
  if (privateKey.type !== "private" || privateKey.asymmetricKeyType !== "ed25519" || keyIdFromPublicKey(key) !== unsigned.witness_key_id) fail("FIX09_WITNESS_KEY");
  const unsignedBytes = Buffer.from(canonicalJson(unsigned), "utf8");
  const signature = sign(null, Buffer.concat([domain("obs-witness-signature/v1"), unsignedBytes]), privateKey);
  const linked = completedBytes(unsigned, signature);
  return Object.freeze({ ...unsigned, witness_signature_base64: signature.toString("base64"), witness_hash: linked.hash });
}

function validateAuthorization(
  value: unknown,
  activation: VerifiedActivation,
  priorKeyId: string,
  priorSequence: string,
  priorHash: string,
  checkpoints: readonly VerifiedRecoveryCheckpoint[] | undefined,
  history: readonly CompletedWitnessRecord[],
): { readonly keyId: string; readonly publicKey: KeyObject } {
  const completed = record(value);
  exactKeys(completed, AUTHORIZATION_KEYS);
  if (completed.schema !== "obs-witness-key-authorization/v1" || completed.custodian_key_id !== activation.custodianKeyId) fail("FIX09_WITNESS_CONTINUITY");
  if (completed.reason !== "PLANNED_ROTATION" && completed.reason !== "WITNESS_KEY_LOSS" && completed.reason !== "WITNESS_KEY_COMPROMISE") fail("FIX09_WITNESS_CONTINUITY");
  if (completed.prior_witness_key_id !== priorKeyId || completed.prior_witness_seq !== priorSequence || completed.prior_witness_hash !== priorHash) fail("FIX09_WITNESS_CONTINUITY");
  const newKeyId = string(completed.new_witness_key_id, HASH, "FIX09_WITNESS_CONTINUITY");
  const min = string(completed.min_witness_seq, POSITIVE, "FIX09_WITNESS_CONTINUITY");
  if (BigInt(min) !== BigInt(priorSequence) + 1n) fail("FIX09_WITNESS_CONTINUITY");
  const der = base64(completed.new_witness_spki_der_base64, 44, "FIX09_WITNESS_CONTINUITY");
  let publicKey: KeyObject;
  try { publicKey = createPublicKey({ key: der, type: "spki", format: "der" }); }
  catch { return fail("FIX09_WITNESS_CONTINUITY"); }
  if (publicKey.asymmetricKeyType !== "ed25519" || keyIdFromPublicKey(publicKey) !== newKeyId) fail("FIX09_WITNESS_CONTINUITY");
  if (completed.reason === "PLANNED_ROTATION") {
    if (completed.recovery_id !== null || completed.recovery_checkpoint_sha256 !== null) fail("FIX09_WITNESS_CONTINUITY");
  } else {
    const recoveryId = string(completed.recovery_id, UUID, "FIX09_WITNESS_CONTINUITY");
    const checkpointSha = string(completed.recovery_checkpoint_sha256, HASH, "FIX09_WITNESS_CONTINUITY");
    const checkpoint = checkpoints?.find((candidate) => candidate.recoveryId === recoveryId);
    if (checkpoints !== undefined && (checkpoint === undefined || checkpoint.completeSha256 !== checkpointSha ||
        (completed.reason === "WITNESS_KEY_LOSS" && checkpoint.trigger !== "WITNESS_KEY_LOSS") ||
        (completed.reason === "WITNESS_KEY_COMPROMISE" && checkpoint.trigger !== "WITNESS_KEY_COMPROMISE"))) fail("FIX09_WITNESS_CONTINUITY");
    if (checkpoint !== undefined) {
    const witnessRange = record(checkpoint.completed.witness_range, "FIX09_WITNESS_CONTINUITY");
    const lastTrustedSequence = string(checkpoint.completed.last_trusted_witness_seq, NONNEGATIVE, "FIX09_WITNESS_CONTINUITY");
    const lastTrustedHash = string(checkpoint.completed.last_trusted_witness_hash, HASH, "FIX09_WITNESS_CONTINUITY");
    if (witnessRange.prior_key_id !== priorKeyId || witnessRange.next_key_id !== newKeyId || witnessRange.next_min_witness_seq !== min) fail("FIX09_WITNESS_CONTINUITY");
    if (witnessRange.suspect_first_witness_seq === null) {
      if (priorSequence !== lastTrustedSequence || priorHash !== lastTrustedHash || witnessRange.suspect_last_witness_seq !== null ||
          witnessRange.suspect_terminal_witness_hash !== lastTrustedHash || witnessRange.suspect_hashes_sha256 !== sha256(Buffer.from("[]"))) fail("FIX09_WITNESS_CONTINUITY");
    } else {
      const first = string(witnessRange.suspect_first_witness_seq, POSITIVE, "FIX09_WITNESS_CONTINUITY");
      const last = string(witnessRange.suspect_last_witness_seq, POSITIVE, "FIX09_WITNESS_CONTINUITY");
      if (first !== (BigInt(lastTrustedSequence) + 1n).toString() || last !== priorSequence || witnessRange.suspect_terminal_witness_hash !== priorHash) fail("FIX09_WITNESS_CONTINUITY");
      const pairs = history.filter((entry) => BigInt(entry.witness_seq) >= BigInt(first) && BigInt(entry.witness_seq) <= BigInt(last))
        .map((entry) => Object.freeze([entry.witness_seq, entry.witness_hash]));
      if (pairs.length !== Number(BigInt(last) - BigInt(first) + 1n) || witnessRange.suspect_hashes_sha256 !== sha256(Buffer.from(canonicalJson(Object.freeze(pairs))))) fail("FIX09_WITNESS_CONTINUITY");
    }
    }
  }
  const signature = base64(completed.custodian_signature_base64, 64, "FIX09_WITNESS_SIGNATURE");
  const unsigned = { ...completed };
  delete unsigned.custodian_signature_base64;
  const bytes = Buffer.from(canonicalJson(unsigned), "utf8");
  if (!verify(null, Buffer.concat([domain("obs-witness-key-authorization-signature/v1"), bytes]), activation.custodianPublicKey, signature)) fail("FIX09_WITNESS_SIGNATURE");
  return Object.freeze({ keyId: newKeyId, publicKey });
}

function headContinuity(previous: readonly WitnessHead[], current: readonly WitnessHead[]): void {
  for (const prior of previous) {
    const next = current.find((candidate) => candidate.table === prior.table && candidate.source === prior.source && candidate.writer_identity === prior.writer_identity);
    if (next === undefined || BigInt(next.chain_seq) < BigInt(prior.chain_seq) ||
        (next.chain_seq === prior.chain_seq && next.chain_link !== prior.chain_link)) fail("FIX09_WITNESS_CONTINUITY");
  }
}

export function verifyWitnessJournal(
  bytes: Uint8Array,
  activation: VerifiedActivation,
  checkpoints?: readonly VerifiedRecoveryCheckpoint[],
): WitnessJournalState {
  const body = Buffer.from(bytes);
  if (body.length > MAX_JOURNAL_BYTES) fail("FIX09_WITNESS_FORMAT");
  if (body.length !== 0 && body.at(-1) !== 0x0a) fail("FIX09_WITNESS_FORMAT");
  let priorHash = activation.manifestSha256;
  let priorSequence = "0";
  let witnessKeyId = activation.witnessBootstrapKeyId;
  let witnessPublicKey = activation.witnessBootstrapPublicKey;
  let occurrenceHighWater = "0";
  let agentActionHighWater = "0";
  let heads: readonly WitnessHead[] = Object.freeze([]);
  let keyringGeneration: string | null = null;
  let keyringSha256: string | null = null;
  let recoveryEpoch = 1n;
  let recovery: WitnessRecovery = Object.freeze({ epoch: "1", latest_recovery_id: null, suspect_range_count: "0" });
  let tail: CompletedWitnessRecord | null = null;
  const history: CompletedWitnessRecord[] = [];
  const usedKeys = new Set([witnessKeyId]);
  const source = body.toString("utf8");
  if (!Buffer.from(source, "utf8").equals(body)) fail("FIX09_WITNESS_FORMAT");
  const lines = body.length === 0 ? [] : source.slice(0, -1).split("\n");
  if (lines.some((line) => line.length === 0 || line.includes("\r"))) fail("FIX09_WITNESS_FORMAT");
  for (const line of lines) {
    let parsed: unknown;
    try { parsed = parseUniqueJson(line); }
    catch { return fail("FIX09_WITNESS_FORMAT"); }
    const completed = record(parsed);
    exactKeys(completed, COMPLETED_KEYS);
    if (canonicalJson(completed) !== line) fail("FIX09_WITNESS_FORMAT");
    const unsignedObject = { ...completed };
    delete unsignedObject.witness_signature_base64;
    delete unsignedObject.witness_hash;
    const unsigned = validateUnsigned(unsignedObject);
    const expectedSequence = (BigInt(priorSequence) + 1n).toString();
    if (unsigned.witness_seq !== expectedSequence || unsigned.prior_witness_hash !== priorHash || unsigned.activation_manifest_sha256 !== activation.manifestSha256) fail("FIX09_WITNESS_CONTINUITY");
    if (unsigned.witness_authorization !== null) {
      const next = validateAuthorization(unsigned.witness_authorization, activation, witnessKeyId, priorSequence, priorHash, checkpoints, history);
      if (usedKeys.has(next.keyId)) fail("FIX09_WITNESS_CONTINUITY");
      witnessKeyId = next.keyId;
      witnessPublicKey = next.publicKey;
      usedKeys.add(next.keyId);
    }
    if (unsigned.witness_key_id !== witnessKeyId) fail("FIX09_WITNESS_CONTINUITY");
    const signature = base64(completed.witness_signature_base64, 64, "FIX09_WITNESS_SIGNATURE");
    const linked = completedBytes(unsigned, signature);
    if (!verify(null, Buffer.concat([domain("obs-witness-signature/v1"), linked.unsignedBytes]), witnessPublicKey, signature)) fail("FIX09_WITNESS_SIGNATURE");
    const witnessHash = string(completed.witness_hash, HASH);
    if (witnessHash !== linked.hash) fail("FIX09_WITNESS_CONTINUITY");
    const snapshot = unsigned.snapshot;
    const trusted = unsigned.result === "VERIFIED" || unsigned.result === "VERIFIED_WITH_RECOVERY";
    const nextOccurrence = snapshot.occurrence_high_water ?? occurrenceHighWater;
    const nextAction = snapshot.agent_action_high_water ?? agentActionHighWater;
    if (trusted && (BigInt(nextOccurrence) < BigInt(occurrenceHighWater) || BigInt(nextAction) < BigInt(agentActionHighWater))) fail("FIX09_WITNESS_CONTINUITY");
    const nextHeads = validateHeads(unsigned.heads);
    if (trusted) headContinuity(heads, nextHeads);
    if (unsigned.keyring_generation !== null) {
      if (keyringGeneration !== null) {
        const generationDelta = BigInt(unsigned.keyring_generation) - BigInt(keyringGeneration);
        if (generationDelta < 0n || generationDelta > 1n ||
            (generationDelta === 0n && unsigned.keyring_sha256 !== keyringSha256)) fail("FIX09_WITNESS_CONTINUITY");
      }
      keyringGeneration = unsigned.keyring_generation;
      keyringSha256 = unsigned.keyring_sha256;
    }
    const nextRecoveryEpoch = BigInt(unsigned.recovery.epoch);
    if (nextRecoveryEpoch < recoveryEpoch || nextRecoveryEpoch > recoveryEpoch + 1n) fail("FIX09_WITNESS_CONTINUITY");
    if (nextRecoveryEpoch === recoveryEpoch) {
      if (unsigned.recovery.latest_recovery_id !== recovery.latest_recovery_id ||
          unsigned.recovery.suspect_range_count !== recovery.suspect_range_count) fail("FIX09_WITNESS_CONTINUITY");
    } else if (unsigned.result !== "VERIFIED_WITH_RECOVERY" || unsigned.reason !== "RECOVERY_CHECKPOINT" ||
        unsigned.recovery.latest_recovery_id === null ||
        BigInt(unsigned.recovery.suspect_range_count) < BigInt(recovery.suspect_range_count)) {
      fail("FIX09_WITNESS_CONTINUITY");
    }
    recoveryEpoch = nextRecoveryEpoch;
    recovery = unsigned.recovery;
    if (trusted) {
      occurrenceHighWater = nextOccurrence;
      agentActionHighWater = nextAction;
      heads = nextHeads;
    }
    priorSequence = unsigned.witness_seq;
    priorHash = witnessHash;
    tail = completed as unknown as CompletedWitnessRecord;
    history.push(tail);
  }
  return Object.freeze({ count: String(lines.length), nextSequence: (BigInt(priorSequence) + 1n).toString(),
    priorWitnessHash: priorHash, witnessKeyId, witnessPublicKey, tail, occurrenceHighWater,
    agentActionHighWater, heads, keyringGeneration, keyringSha256, recovery });
}

export interface JournalAuthority {
  readonly controlRoot: string;
  readonly ownerUid: number;
  readonly ownerGid: number;
}

function exactMode(value: bigint, expected: number): boolean {
  return Number(value & 0o777n) === expected;
}

function validateAncestors(path: string): void {
  if (realpathSync(path) !== path) fail("FIX09_JOURNAL_METADATA");
  let current = "/";
  for (const component of path.slice(1).split("/")) {
    current = join(current, component);
    const value = lstatSync(current, { bigint: true });
    if (!value.isDirectory() || value.isSymbolicLink() || (value.mode & 0o022n) !== 0n) fail("FIX09_JOURNAL_METADATA");
  }
}

export function appendWitnessRecord(
  path: string,
  completed: CompletedWitnessRecord,
  activation: VerifiedActivation,
  authority: JournalAuthority,
  expectedTail?: Readonly<{ count: string; priorWitnessHash: string }>,
  checkpoints?: readonly VerifiedRecoveryCheckpoint[],
): WitnessJournalState {
  const expectedPath = join(authority.controlRoot, "witness", "watchdog-chain.jsonl");
  if (!isAbsolute(authority.controlRoot) || normalize(authority.controlRoot) !== authority.controlRoot || path !== expectedPath) fail("FIX09_JOURNAL_PATH");
  validateAncestors(authority.controlRoot);
  const directory = lstatSync(join(authority.controlRoot, "witness"), { bigint: true });
  const before = lstatSync(path, { bigint: true });
  if (!directory.isDirectory() || directory.isSymbolicLink() || !exactMode(directory.mode, 0o700) || directory.uid !== BigInt(authority.ownerUid) || directory.gid !== BigInt(authority.ownerGid) ||
      !before.isFile() || before.isSymbolicLink() || before.nlink !== 1n || !exactMode(before.mode, 0o600) || before.uid !== BigInt(authority.ownerUid) || before.gid !== BigInt(authority.ownerGid) || before.dev !== directory.dev) fail("FIX09_JOURNAL_METADATA");
  if (before.size > BigInt(MAX_JOURNAL_BYTES)) fail("FIX09_JOURNAL_METADATA");
  const flags = constants.O_RDWR | constants.O_APPEND | constants.O_NOFOLLOW | (process.platform === "darwin" ? O_EXLOCK_DARWIN : 0);
  const descriptor = openSync(path, flags);
  try {
    const opened = fstatSync(descriptor, { bigint: true });
    if (opened.ino !== before.ino || opened.dev !== before.dev || !opened.isFile() || opened.nlink !== 1n || !exactMode(opened.mode, 0o600)) fail("FIX09_JOURNAL_METADATA");
    const existing = readFileSync(descriptor);
    const prior = verifyWitnessJournal(existing, activation, checkpoints);
    if (expectedTail !== undefined && (prior.count !== expectedTail.count || prior.priorWitnessHash !== expectedTail.priorWitnessHash)) fail("FIX09_JOURNAL_ROLLBACK");
    const line = Buffer.from(`${canonicalJson(completed)}\n`, "utf8");
    const combined = Buffer.concat([existing, line]);
    const next = verifyWitnessJournal(combined, activation, checkpoints);
    if (BigInt(next.count) !== BigInt(prior.count) + 1n) fail("FIX09_WITNESS_CONTINUITY");
    let offset = 0;
    while (offset < line.length) {
      const written = writeSync(descriptor, line, offset, line.length - offset);
      if (written <= 0) fail("FIX09_JOURNAL_IO");
      offset += written;
    }
    fsyncSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (after.ino !== opened.ino || after.dev !== opened.dev || after.size !== opened.size + BigInt(line.length)) fail("FIX09_JOURNAL_IO");
    return next;
  } finally {
    closeSync(descriptor);
  }
}
