import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
  type KeyObject,
} from "node:crypto";

import {
  canonicalJson,
  databaseActionFromOutbox,
  nullRecord,
  parseUniqueJsonText,
} from "./action-wire.js";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const DECIMAL = /^(?:0|[1-9][0-9]*)$/u;
const POSITIVE_DECIMAL = /^[1-9][0-9]*$/u;
const HEX64 = /^[0-9a-f]{64}$/u;
const ACTION_REF = /^obsctl:v1:[0-9a-f]{64}$/u;

export const OUTBOX_ACTION_KINDS = Object.freeze([
  "KILL", "ARM", "STATUS", "CHAIN_KEYRING_INSTALL", "CHAIN_ACTIVATION_SNAPSHOT",
  "CHAIN_BOOTSTRAP", "CHAIN_ROTATE_ROW", "CHAIN_ROTATE_WITNESS",
  "CHAIN_RECOVER_ROW", "CHAIN_RECOVER_WITNESS",
] as const);
export type OutboxActionKind = typeof OUTBOX_ACTION_KINDS[number];

export interface InvocationIdentity {
  readonly action_kind: OutboxActionKind;
  readonly actor: string;
  readonly invocation_id: string;
  readonly requested_at_ms: string;
}

export interface ActionParameters {
  readonly private_key_id: string | null;
  readonly public_input_sha256: string | null;
  readonly writer_identity: string | null;
}

export interface OutboxInput extends InvocationIdentity {
  readonly action_parameters: ActionParameters;
}

export interface CompletedOutboxRecord extends OutboxInput {
  readonly action_ref: string;
  readonly outbox_hash: string;
  readonly outbox_seq: string;
  readonly prior_outbox_hash: string;
  readonly schema: "obsctl-outbox-action/v3";
  readonly signature_base64: string;
  readonly signing_key_id: string;
}

export type MarkerEffect = "PRESENT" | "ABSENT" | "UNKNOWN";
export type LifecyclePhase = "NOT_APPLICABLE" | "NONE" | "OUTPUT_EMITTED" |
  "KEYRING_PUBLISHED" | "DATABASE_ACTIVATION_COMMITTED" | "PRIVATE_KEY_PUBLISHED" |
  "COMPLETE" | "UNKNOWN";

export interface JournalInput {
  readonly action_kind: OutboxActionKind;
  readonly action_ref: string;
  readonly database_action_id: string | null;
  readonly effects: Readonly<{
    readonly capture_off: MarkerEffect;
    readonly durability: "CONFIRMED" | "UNCONFIRMED";
    readonly kill: MarkerEffect;
    readonly lifecycle: Readonly<{
      readonly activation_manifest_sha256: string | null;
      readonly phase: LifecyclePhase;
      readonly private_key_id: string | null;
      readonly public_artifact_sha256: string | null;
    }>;
  }>;
  readonly event_id: string;
  readonly event_kind: "COMMAND_INTENT" | "COMMAND_RESULT" | "RECONCILED";
  readonly invocation_id: string;
  readonly outbox_hash: string | null;
  readonly outcome: string;
  readonly reason: string;
  readonly recorded_at_ms: string;
}

export interface CompletedJournalRecord extends JournalInput {
  readonly journal_hash: string;
  readonly journal_seq: string;
  readonly prior_journal_hash: string;
  readonly schema: "obsctl-action-journal/v3";
  readonly signature_base64: string;
  readonly signing_key_id: string;
}

function fail(code: string): never {
  throw new TypeError(code);
}

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function domain(value: string): Buffer {
  return Buffer.from(`${value}\0`, "utf8");
}

function lengthPrefix(bytes: Uint8Array): Buffer {
  const value = Buffer.from(bytes);
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32BE(value.length);
  return Buffer.concat([prefix, value]);
}

function validateIdentity(input: InvocationIdentity): void {
  if (!UUID_V4.test(input.invocation_id) || !POSITIVE_DECIMAL.test(input.requested_at_ms)) {
    fail("FIX10_INVOCATION_IDENTITY");
  }
  if (!/^obsctl:[A-Za-z0-9._-]{1,128}$/u.test(input.actor)) fail("FIX10_INVOCATION_IDENTITY");
  if (!(OUTBOX_ACTION_KINDS as readonly string[]).includes(input.action_kind)) {
    fail("FIX10_ACTION_KIND");
  }
}

function validateParameters(kind: OutboxActionKind, value: ActionParameters): void {
  const digestOrNull = (input: string | null): boolean => input === null || HEX64.test(input);
  if (!digestOrNull(value.public_input_sha256) || !digestOrNull(value.private_key_id)) {
    fail("FIX10_ACTION_PARAMETERS");
  }
  const rowKind = kind === "CHAIN_ROTATE_ROW" || kind === "CHAIN_RECOVER_ROW";
  if ((value.writer_identity !== null) !== rowKind) fail("FIX10_ACTION_PARAMETERS");
  if (value.writer_identity !== null && !/^[a-z0-9][a-z0-9._-]{0,127}$/u.test(value.writer_identity)) {
    fail("FIX10_ACTION_PARAMETERS");
  }
  const publicKind = new Set<OutboxActionKind>([
    "CHAIN_KEYRING_INSTALL", "CHAIN_BOOTSTRAP", "CHAIN_ROTATE_ROW",
    "CHAIN_ROTATE_WITNESS", "CHAIN_RECOVER_ROW", "CHAIN_RECOVER_WITNESS",
  ]).has(kind);
  const privateKind = new Set<OutboxActionKind>([
    "CHAIN_ROTATE_ROW", "CHAIN_ROTATE_WITNESS", "CHAIN_RECOVER_ROW", "CHAIN_RECOVER_WITNESS",
  ]).has(kind);
  if ((value.public_input_sha256 !== null) !== publicKind || (value.private_key_id !== null) !== privateKind) {
    fail("FIX10_ACTION_PARAMETERS");
  }
}

export function deriveEd25519SigningKeyId(pkcs8: Uint8Array): Readonly<{
  key: KeyObject;
  keyId: string;
  spkiDer: Buffer;
}> {
  let key: KeyObject;
  try { key = createPrivateKey({ format: "der", key: Buffer.from(pkcs8), type: "pkcs8" }); }
  catch { return fail("FIX10_SIGNING_KEY"); }
  if (key.type !== "private" || key.asymmetricKeyType !== "ed25519") fail("FIX10_SIGNING_KEY");
  const spkiDer = createPublicKey(key).export({ format: "der", type: "spki" });
  return Object.freeze({ key, keyId: digest(spkiDer), spkiDer });
}

export function deriveActionRef(input: InvocationIdentity): string {
  validateIdentity(input);
  const identity = nullRecord([
    ["schema", "obsctl-action-identity/v1"],
    ["invocation_id", input.invocation_id],
    ["requested_at_ms", input.requested_at_ms],
    ["actor", input.actor],
    ["action_kind", input.action_kind],
  ]);
  const body = Buffer.from(canonicalJson(identity), "utf8");
  return `obsctl:v1:${digest(Buffer.concat([domain("obsctl-action-ref/v1"), lengthPrefix(body)]))}`;
}

function signRecord(
  entries: readonly (readonly [string, unknown])[],
  signatureField: string,
  signatureDomain: string,
  linkField: string,
  linkDomain: string,
  key: KeyObject,
): Readonly<Record<string, unknown>> {
  const unsigned = nullRecord(entries);
  const bytes = Buffer.from(canonicalJson(unsigned), "utf8");
  const signature = sign(null, Buffer.concat([domain(signatureDomain), bytes]), key);
  const link = digest(Buffer.concat([domain(linkDomain), lengthPrefix(bytes), signature]));
  return nullRecord([...entries, [signatureField, signature.toString("base64")], [linkField, link]]);
}

export function createOutboxRecord(
  prior: CompletedOutboxRecord | undefined,
  input: OutboxInput,
  privateKey: KeyObject,
): CompletedOutboxRecord {
  validateIdentity(input);
  validateParameters(input.action_kind, input.action_parameters);
  if (privateKey.type !== "private" || privateKey.asymmetricKeyType !== "ed25519") {
    fail("FIX10_SIGNING_KEY");
  }
  const signingKeyId = digest(createPublicKey(privateKey).export({ format: "der", type: "spki" }));
  const sequence = prior === undefined ? "1" : (BigInt(prior.outbox_seq) + 1n).toString();
  const actionRef = deriveActionRef(input);
  const parameters = nullRecord([
    ["writer_identity", input.action_parameters.writer_identity],
    ["public_input_sha256", input.action_parameters.public_input_sha256],
    ["private_key_id", input.action_parameters.private_key_id],
  ]);
  return signRecord([
    ["schema", "obsctl-outbox-action/v3"], ["outbox_seq", sequence],
    ["invocation_id", input.invocation_id], ["requested_at_ms", input.requested_at_ms],
    ["actor", input.actor], ["action_kind", input.action_kind],
    ["action_parameters", parameters], ["action_ref", actionRef],
    ["prior_outbox_hash", prior?.outbox_hash ?? signingKeyId],
    ["signing_key_id", signingKeyId],
  ], "signature_base64", "obsctl-outbox-signature/v1", "outbox_hash",
  "obsctl-outbox-link/v1", privateKey) as unknown as CompletedOutboxRecord;
}

export function createJournalRecord(
  prior: CompletedJournalRecord | undefined,
  input: JournalInput,
  privateKey: KeyObject,
): CompletedJournalRecord {
  if (privateKey.type !== "private" || privateKey.asymmetricKeyType !== "ed25519") fail("FIX10_SIGNING_KEY");
  if (!UUID_V4.test(input.event_id) || !UUID_V4.test(input.invocation_id) ||
      !POSITIVE_DECIMAL.test(input.recorded_at_ms) || !ACTION_REF.test(input.action_ref)) {
    fail("FIX10_JOURNAL_INPUT");
  }
  if (input.outbox_hash !== null && !HEX64.test(input.outbox_hash)) fail("FIX10_JOURNAL_INPUT");
  if (input.database_action_id !== null && !UUID_V4.test(input.database_action_id)) {
    fail("FIX10_JOURNAL_INPUT");
  }
  if (!(["PRESENT", "ABSENT", "UNKNOWN"] as const).includes(input.effects.capture_off) ||
      !(["PRESENT", "ABSENT", "UNKNOWN"] as const).includes(input.effects.kill) ||
      (input.effects.durability !== "CONFIRMED" && input.effects.durability !== "UNCONFIRMED")) fail("FIX10_JOURNAL_INPUT");
  const signingKeyId = digest(createPublicKey(privateKey).export({ format: "der", type: "spki" }));
  const sequence = prior === undefined ? "1" : (BigInt(prior.journal_seq) + 1n).toString();
  const lifecycle = nullRecord([
    ["phase", input.effects.lifecycle.phase],
    ["public_artifact_sha256", input.effects.lifecycle.public_artifact_sha256],
    ["private_key_id", input.effects.lifecycle.private_key_id],
    ["activation_manifest_sha256", input.effects.lifecycle.activation_manifest_sha256],
  ]);
  const effects = nullRecord([
    ["capture_off", input.effects.capture_off], ["kill", input.effects.kill],
    ["durability", input.effects.durability], ["lifecycle", lifecycle],
  ]);
  return signRecord([
    ["schema", "obsctl-action-journal/v3"], ["journal_seq", sequence],
    ["event_id", input.event_id], ["recorded_at_ms", input.recorded_at_ms],
    ["event_kind", input.event_kind], ["invocation_id", input.invocation_id],
    ["action_ref", input.action_ref], ["action_kind", input.action_kind],
    ["outcome", input.outcome], ["reason", input.reason], ["effects", effects],
    ["outbox_hash", input.outbox_hash], ["database_action_id", input.database_action_id],
    ["prior_journal_hash", prior?.journal_hash ?? signingKeyId],
    ["signing_key_id", signingKeyId],
  ], "signature_base64", "obsctl-journal-signature/v1", "journal_hash",
  "obsctl-journal-link/v1", privateKey) as unknown as CompletedJournalRecord;
}

function assertObject(value: unknown, code: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value as Record<string, unknown>;
}

function exactKeys(record: Record<string, unknown>, expected: readonly string[], code: string): void {
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) fail(code);
}

function verifySignedRecord(
  record: Record<string, unknown>,
  signatureField: string,
  signatureDomain: string,
  linkField: string,
  linkDomain: string,
  publicKey: KeyObject,
): void {
  const signatureText = record[signatureField];
  const linkText = record[linkField];
  if (typeof signatureText !== "string" || typeof linkText !== "string" || !HEX64.test(linkText)) {
    fail("FIX10_HISTORY_RECORD");
  }
  const signature = Buffer.from(signatureText, "base64");
  if (signature.length !== 64 || signature.toString("base64") !== signatureText) fail("FIX10_HISTORY_RECORD");
  const unsignedEntries = Object.keys(record)
    .filter((key) => key !== signatureField && key !== linkField)
    .map((key) => [key, record[key]] as const);
  const unsigned = nullRecord(unsignedEntries);
  const bytes = Buffer.from(canonicalJson(unsigned), "utf8");
  if (!verify(null, Buffer.concat([domain(signatureDomain), bytes]), publicKey, signature)) {
    fail("FIX10_HISTORY_SIGNATURE");
  }
  const expected = digest(Buffer.concat([domain(linkDomain), lengthPrefix(bytes), signature]));
  if (expected !== linkText) fail("FIX10_HISTORY_LINK");
}

function parseJsonLines(bytes: string): readonly Record<string, unknown>[] {
  if (bytes.length === 0) return Object.freeze([]);
  if (!bytes.endsWith("\n")) fail("FIX10_HISTORY_PARTIAL_TAIL");
  if (bytes.includes("\r")) fail("FIX10_HISTORY_BYTES");
  const lines = bytes.slice(0, -1).split("\n");
  if (lines.some((line) => line.length === 0)) fail("FIX10_HISTORY_BYTES");
  return lines.map((line) => {
    const parsed = assertObject(parseUniqueJsonText(line), "FIX10_HISTORY_RECORD");
    if (canonicalJson(parsed) !== line) fail("FIX10_HISTORY_CANONICAL");
    return parsed;
  });
}

export function encodeOutboxLine(record: CompletedOutboxRecord): string {
  return `${canonicalJson(record)}\n`;
}

export function encodeJournalLine(record: CompletedJournalRecord): string {
  return `${canonicalJson(record)}\n`;
}

export function verifyOutbox(bytes: string, publicKey: KeyObject): readonly CompletedOutboxRecord[] {
  const parsed = parseJsonLines(bytes);
  let prior: string | undefined;
  const signingKeyId = digest(publicKey.export({ format: "der", type: "spki" }));
  return parsed.map((record, index) => {
    exactKeys(record, ["schema", "outbox_seq", "invocation_id", "requested_at_ms", "actor", "action_kind",
      "action_parameters", "action_ref", "prior_outbox_hash", "signing_key_id", "signature_base64", "outbox_hash"], "FIX10_OUTBOX_SCHEMA");
    verifySignedRecord(record, "signature_base64", "obsctl-outbox-signature/v1",
      "outbox_hash", "obsctl-outbox-link/v1", publicKey);
    if (record.schema !== "obsctl-outbox-action/v3" || record.outbox_seq !== String(index + 1) ||
        typeof record.signing_key_id !== "string" || !HEX64.test(record.signing_key_id) ||
        record.signing_key_id !== signingKeyId || record.prior_outbox_hash !== (prior ?? record.signing_key_id)) fail("FIX10_OUTBOX_CHAIN");
    const parameters = assertObject(record.action_parameters, "FIX10_OUTBOX_SCHEMA");
    exactKeys(parameters, ["writer_identity", "public_input_sha256", "private_key_id"], "FIX10_OUTBOX_SCHEMA");
    const identity = { action_kind: record.action_kind as OutboxActionKind, actor: record.actor as string,
      invocation_id: record.invocation_id as string, requested_at_ms: record.requested_at_ms as string };
    validateIdentity(identity);
    validateParameters(identity.action_kind, parameters as unknown as ActionParameters);
    if (record.action_ref !== deriveActionRef(identity)) fail("FIX10_ACTION_REF");
    prior = String(record.outbox_hash);
    return record as unknown as CompletedOutboxRecord;
  });
}

export function verifyJournal(bytes: string, publicKey: KeyObject): readonly CompletedJournalRecord[] {
  const parsed = parseJsonLines(bytes);
  let prior: string | undefined;
  const signingKeyId = digest(publicKey.export({ format: "der", type: "spki" }));
  const outcomes = new Set(["KILL_APPLIED", "KILL_CAPTURE_ONLY", "KILL_DAEMON_ONLY", "KILL_NOT_APPLIED",
    "KILL_DURABILITY_UNKNOWN", "KILL_AUDIT_DEGRADED", "ARM_AUTH_REJECTED", "ARM_APPLIED_PENDING_PROOF",
    "ARM_FAILED_ROLLED_BACK", "ARM_ROLLBACK_INCOMPLETE", "STATUS_LOCAL_INVALID", "STATUS_DB_UNREACHABLE",
    "STATUS_DB_REJECTED", "STATUS_RECONCILED", "RECONCILED", "COMPLETE", "FAILED"]);
  const reasons = new Set(["NONE", "AUTHENTICATION", "ROOT_INVALID", "LOCAL_CHAIN_INVALID", "OUTBOX_APPEND",
    "CAPTURE_OFF_CREATE", "CAPTURE_OFF_FSYNC", "KILL_CREATE", "KILL_FSYNC", "ROOT_RECHECK", "ARMED_PUBLISH",
    "MARKER_REMOVE", "ROLLBACK", "DB_CONFIG_ABSENT", "DB_CONNECT", "DB_CONNECTION_LOST", "DB_IDENTITY",
    "DB_PERMISSION", "DB_GATEWAY", "DB_SEMANTIC_COLLISION", "DB_QUERY", "DB_COMMIT_UNKNOWN", "RECEIPT_APPEND",
    "DESCRIPTOR"]);
  return parsed.map((record, index) => {
    exactKeys(record, ["schema", "journal_seq", "event_id", "recorded_at_ms", "event_kind", "invocation_id",
      "action_ref", "action_kind", "outcome", "reason", "effects", "outbox_hash", "database_action_id",
      "prior_journal_hash", "signing_key_id", "signature_base64", "journal_hash"], "FIX10_JOURNAL_SCHEMA");
    verifySignedRecord(record, "signature_base64", "obsctl-journal-signature/v1",
      "journal_hash", "obsctl-journal-link/v1", publicKey);
    if (record.schema !== "obsctl-action-journal/v3" || record.journal_seq !== String(index + 1) ||
        typeof record.signing_key_id !== "string" || !HEX64.test(record.signing_key_id) ||
        record.signing_key_id !== signingKeyId || record.prior_journal_hash !== (prior ?? record.signing_key_id) ||
        typeof record.outcome !== "string" || !outcomes.has(record.outcome) || typeof record.reason !== "string" ||
        !reasons.has(record.reason)) fail("FIX10_JOURNAL_CHAIN");
    if (record.event_kind !== "COMMAND_INTENT" && record.event_kind !== "COMMAND_RESULT" && record.event_kind !== "RECONCILED") fail("FIX10_JOURNAL_SCHEMA");
    if (typeof record.event_id !== "string" || !UUID_V4.test(record.event_id) || typeof record.invocation_id !== "string" ||
        !UUID_V4.test(record.invocation_id) || typeof record.action_ref !== "string" || !ACTION_REF.test(record.action_ref) ||
        typeof record.recorded_at_ms !== "string" || !POSITIVE_DECIMAL.test(record.recorded_at_ms)) fail("FIX10_JOURNAL_SCHEMA");
    const effects = assertObject(record.effects, "FIX10_JOURNAL_SCHEMA");
    exactKeys(effects, ["capture_off", "kill", "durability", "lifecycle"], "FIX10_JOURNAL_SCHEMA");
    if (!["PRESENT", "ABSENT", "UNKNOWN"].includes(String(effects.capture_off)) ||
        !["PRESENT", "ABSENT", "UNKNOWN"].includes(String(effects.kill)) ||
        (effects.durability !== "CONFIRMED" && effects.durability !== "UNCONFIRMED")) fail("FIX10_JOURNAL_SCHEMA");
    const lifecycle = assertObject(effects.lifecycle, "FIX10_JOURNAL_SCHEMA");
    exactKeys(lifecycle, ["activation_manifest_sha256", "phase", "private_key_id", "public_artifact_sha256"], "FIX10_JOURNAL_SCHEMA");
    prior = String(record.journal_hash);
    return record as unknown as CompletedJournalRecord;
  });
}

export function pendingIntents(
  outbox: readonly CompletedOutboxRecord[],
  journal: readonly CompletedJournalRecord[],
): readonly CompletedOutboxRecord[] {
  return Object.freeze(outbox.filter((intent) => !journal.some((event) =>
    event.invocation_id === intent.invocation_id && event.action_ref === intent.action_ref &&
    event.outbox_hash === intent.outbox_hash && event.database_action_id !== null)));
}

export { databaseActionFromOutbox };
