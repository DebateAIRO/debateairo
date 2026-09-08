import {
  createHash,
  createPublicKey,
  type KeyObject,
} from "node:crypto";
import { types as utilTypes } from "node:util";

export const MAX_CANONICAL_BYTES = 1_048_576;
export const MAX_JSON_DEPTH = 32;
export const MAX_JSON_NODES = 16_384;

type TableName = "occurrence" | "agent_action";
type SqlType =
  | "bigint"
  | "boolean"
  | "bytea"
  | "integer"
  | "jsonb"
  | "smallint"
  | "text"
  | "timestamptz"
  | "uuid";

type Column = readonly [name: string, type: SqlType];

export const OCCURRENCE_COLUMNS = Object.freeze([
  ["chain_version", "smallint"], ["chain_key_id", "text"],
  ["chain_seq", "bigint"], ["prev_link", "bytea"],
  ["occurrence_id", "uuid"], ["occ_seq", "bigint"],
  ["occurred_at", "timestamptz"], ["captured_at", "timestamptz"],
  ["environment", "text"], ["build_ref", "text"], ["build_dirty", "boolean"],
  ["runtime", "text"], ["component", "jsonb"], ["capture_point", "text"],
  ["code", "text"], ["taxonomy_class", "text"], ["severity", "text"],
  ["condition_mark", "text"], ["disposition", "text"], ["fingerprint", "text"],
  ["fingerprint_version", "integer"], ["redaction_policy_version", "text"],
  ["allowlist_set_id", "text"], ["fallback_minimized", "boolean"],
  ["capture_status", "text"], ["run_ref", "text"], ["work_item_ref", "text"],
  ["node_ref", "text"], ["attempt_ref", "text"], ["ledger_ref", "text"],
  ["parent_occurrence_ref", "text"], ["cause_relation", "text"],
  ["at_seq_watermark", "text"], ["frames", "jsonb"], ["safe_template_id", "text"],
  ["template_parameters", "jsonb"], ["source", "text"], ["source_event_ref", "text"],
  ["zone_context", "boolean"], ["attempt_index", "integer"], ["writer_identity", "text"],
] as const satisfies readonly Column[]);

export const AGENT_ACTION_COLUMNS = Object.freeze([
  ["chain_version", "smallint"], ["chain_key_id", "text"],
  ["chain_seq", "bigint"], ["prev_link", "bytea"],
  ["agent_action_id", "uuid"], ["action_seq", "bigint"], ["source", "text"],
  ["writer_identity", "text"], ["actor", "text"], ["action_kind", "text"],
  ["occurrence_id", "uuid"], ["incident_id", "uuid"], ["action_ref", "text"],
  ["action_payload", "jsonb"], ["occurred_at", "timestamptz"],
] as const satisfies readonly Column[]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const DECIMAL = /^(?:0|-?[1-9][0-9]*)$/u;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const LOWER_HEX = /^(?:[0-9a-f]{2})*$/u;

function fail(code: string): never {
  throw new TypeError(code);
}

function hasLoneSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return true;
  }
  return false;
}

function assertString(value: unknown, code: string): string {
  if (typeof value !== "string" || hasLoneSurrogate(value)) fail(code);
  return value;
}

function utf8Compare(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function dataDescriptors(value: object): Readonly<Record<string, PropertyDescriptor>> {
  if (utilTypes.isProxy(value)) fail("FIX09_JSON_PROXY");
  if (Object.getOwnPropertySymbols(value).length !== 0) fail("FIX09_JSON_DATA");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const [name, descriptor] of Object.entries(descriptors)) {
    if (Array.isArray(value) && name === "length") continue;
    if (!("value" in descriptor) || !descriptor.enumerable) fail("FIX09_JSON_DATA");
  }
  return descriptors;
}

function jsonPrimitive(value: null | boolean | number | string): string {
  if (typeof value === "number" && !Number.isFinite(value)) fail("FIX09_JSON_NUMBER");
  if (typeof value === "string" && hasLoneSurrogate(value)) fail("FIX09_JSON_LONE_SURROGATE");
  const encoded = JSON.stringify(value);
  if (encoded === undefined) fail("FIX09_JSON_DATA");
  return encoded;
}

function canonicalInner(value: unknown, seen: Set<object>, depth: number, counter: { nodes: number }): string {
  counter.nodes += 1;
  if (counter.nodes > MAX_JSON_NODES || depth > MAX_JSON_DEPTH) fail("FIX09_JSON_CAP");
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return jsonPrimitive(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("FIX09_JSON_NUMBER");
    return jsonPrimitive(value);
  }
  if (typeof value !== "object") fail("FIX09_JSON_DATA");
  if (seen.has(value)) fail("FIX09_JSON_CYCLE");
  seen.add(value);
  try {
    const descriptors = dataDescriptors(value);
    if (Array.isArray(value)) {
      const length = value.length;
      const names = Object.keys(descriptors).filter((name) => name !== "length");
      if (names.length !== length || names.some((name, index) => name !== String(index))) {
        fail("FIX09_JSON_DATA");
      }
      return `[${Array.from({ length }, (_, index) => canonicalInner(descriptors[String(index)]?.value, seen, depth + 1, counter)).join(",")}]`;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) fail("FIX09_JSON_DATA");
    const names = Object.keys(descriptors).sort(utf8Compare);
    return `{${names.map((name) => `${jsonPrimitive(assertString(name, "FIX09_JSON_LONE_SURROGATE"))}:${canonicalInner(descriptors[name]?.value, seen, depth + 1, counter)}`).join(",")}}`;
  } finally {
    seen.delete(value);
  }
}

export function canonicalJson(value: unknown): string {
  const result = canonicalInner(value, new Set(), 0, { nodes: 0 });
  if (Buffer.byteLength(result, "utf8") > MAX_CANONICAL_BYTES) fail("FIX09_JSON_CAP");
  return result;
}

function tagInner(value: unknown, seen: Set<object>, depth: number, counter: { nodes: number }): unknown {
  counter.nodes += 1;
  if (counter.nodes > MAX_JSON_NODES || depth > MAX_JSON_DEPTH) fail("FIX09_JSON_CAP");
  if (value === null) return Object.freeze(["n"]);
  if (typeof value === "boolean") return Object.freeze(["b", value]);
  if (typeof value === "string") return Object.freeze(["s", assertString(value, "FIX09_JSON_LONE_SURROGATE")]);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) fail("FIX09_JSON_NUMBER");
    return Object.freeze(["i", String(value)]);
  }
  if (typeof value !== "object") fail("FIX09_JSON_DATA");
  if (seen.has(value)) fail("FIX09_JSON_CYCLE");
  seen.add(value);
  try {
    const descriptors = dataDescriptors(value);
    if (Array.isArray(value)) {
      const names = Object.keys(descriptors).filter((name) => name !== "length");
      if (names.length !== value.length || names.some((name, index) => name !== String(index))) {
        fail("FIX09_JSON_DATA");
      }
      return Object.freeze([
        "a",
        ...Array.from({ length: value.length }, (_, index) =>
          tagInner(descriptors[String(index)]?.value, seen, depth + 1, counter)),
      ]);
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) fail("FIX09_JSON_DATA");
    const pairs = Object.keys(descriptors).sort(utf8Compare).map((name) =>
      Object.freeze([
        assertString(name, "FIX09_JSON_LONE_SURROGATE"),
        tagInner(descriptors[name]?.value, seen, depth + 1, counter),
      ]));
    return Object.freeze(["o", Object.freeze(pairs)]);
  } finally {
    seen.delete(value);
  }
}

export function tagJsonb(value: unknown): unknown {
  const tagged = tagInner(value, new Set(), 0, { nodes: 0 });
  if (Buffer.byteLength(canonicalJson(tagged), "utf8") > MAX_CANONICAL_BYTES) {
    fail("FIX09_JSON_CAP");
  }
  return tagged;
}

function integer(value: unknown, code: string): string {
  const text = typeof value === "bigint"
    ? value.toString()
    : typeof value === "number" && Number.isSafeInteger(value)
      ? String(value)
      : typeof value === "string"
        ? value
        : fail(code);
  if (!DECIMAL.test(text) || text === "-0") fail(code);
  return text;
}

function scalar(type: SqlType, value: unknown): unknown {
  if (value === null) return null;
  if (type === "text") return assertString(value, "FIX09_TEXT");
  if (type === "uuid") {
    const text = assertString(value, "FIX09_UUID");
    if (!UUID.test(text)) fail("FIX09_UUID");
    return text;
  }
  if (type === "bigint" || type === "integer" || type === "smallint") {
    return integer(value, "FIX09_INTEGER");
  }
  if (type === "boolean") {
    if (typeof value !== "boolean") fail("FIX09_BOOLEAN");
    return value;
  }
  if (type === "timestamptz") {
    const text = assertString(value, "FIX09_TIMESTAMP");
    if (!TIMESTAMP.test(text) || new Date(text).toISOString() !== text) fail("FIX09_TIMESTAMP");
    return text;
  }
  if (type === "bytea") {
    if (Buffer.isBuffer(value)) return value.toString("hex");
    const text = assertString(value, "FIX09_BYTEA");
    if (!LOWER_HEX.test(text)) fail("FIX09_BYTEA");
    return text;
  }
  if (type === "jsonb") return tagJsonb(value);
  return fail("FIX09_SQL_TYPE");
}

function columns(table: TableName): readonly Column[] {
  return table === "occurrence" ? OCCURRENCE_COLUMNS : AGENT_ACTION_COLUMNS;
}

export function canonicalRowBytes(table: TableName, row: Readonly<Record<string, unknown>>): Buffer {
  if (row === null || typeof row !== "object" || Array.isArray(row) || utilTypes.isProxy(row)) {
    fail("FIX09_ROW_FIELDS");
  }
  const descriptors = dataDescriptors(row);
  const schema = columns(table);
  const names = Object.keys(descriptors);
  if (
    names.length !== schema.length ||
    schema.some(([name]) => !Object.hasOwn(descriptors, name))
  ) {
    fail("FIX09_ROW_FIELDS");
  }
  const tuples = schema.map(([name, type]) =>
    Object.freeze([name, type, scalar(type, descriptors[name]?.value)]));
  const bytes = Buffer.from(canonicalJson(Object.freeze(["obs-audit-row/v1", table, Object.freeze(tuples)])), "utf8");
  if (bytes.length > MAX_CANONICAL_BYTES) fail("FIX09_JSON_CAP");
  return bytes;
}

function domain(name: string): Buffer {
  return Buffer.concat([Buffer.from(name, "utf8"), Buffer.from([0])]);
}

export function lengthPrefix(bytes: Uint8Array): Buffer {
  const input = Buffer.from(bytes);
  if (input.length > 0xffff_ffff) fail("FIX09_LENGTH_PREFIX");
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32BE(input.length);
  return Buffer.concat([prefix, input]);
}

export function signatureMessage(canonicalRow: Uint8Array): Buffer {
  return Buffer.concat([domain("obs-audit-signature/v1"), Buffer.from(canonicalRow)]);
}

export function chainLink(canonicalRow: Uint8Array, signature: Uint8Array): Buffer {
  const signatureBytes = Buffer.from(signature);
  if (signatureBytes.length !== 64) fail("FIX09_SIGNATURE_LENGTH");
  return createHash("sha256")
    .update(domain("obs-audit-link/v1"))
    .update(lengthPrefix(canonicalRow))
    .update(signatureBytes)
    .digest();
}

export function genesisLink(
  table: TableName,
  source: string,
  writerIdentity: string,
  activationDigest: Uint8Array,
): Buffer {
  const digest = Buffer.from(activationDigest);
  if (digest.length !== 32) fail("FIX09_ACTIVATION_DIGEST");
  return createHash("sha256")
    .update(domain("obs-audit-genesis/v1"))
    .update(lengthPrefix(Buffer.from(table, "utf8")))
    .update(lengthPrefix(Buffer.from(assertString(source, "FIX09_SOURCE"), "utf8")))
    .update(lengthPrefix(Buffer.from(assertString(writerIdentity, "FIX09_WRITER_IDENTITY"), "utf8")))
    .update(digest)
    .digest();
}

export function keyIdFromPublicKey(publicKey: KeyObject): string {
  const normalized = publicKey.type === "public" ? publicKey : createPublicKey(publicKey);
  if (normalized.asymmetricKeyType !== "ed25519") fail("FIX09_KEY_ALGORITHM");
  const der = normalized.export({ format: "der", type: "spki" });
  return createHash("sha256").update(der).digest("hex");
}
