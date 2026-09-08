import { types as utilTypes } from "node:util";

import type { ChainedAgentActionInput } from "@debateai/obs-capture/chain";

export interface JsonObject { readonly [key: string]: JsonValue }
export type JsonValue = null | boolean | number | string | readonly JsonValue[] | JsonObject;

const DIGIT = /^[0-9]$/u;

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

function utf8Compare(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function canonicalInner(value: unknown, seen: Set<object>): string {
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "string") {
    if (hasLoneSurrogate(value)) fail("FIX10_JSON_LONE_SURROGATE");
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) fail("FIX10_JSON_NUMBER");
    return JSON.stringify(value);
  }
  if (typeof value !== "object" || utilTypes.isProxy(value) || seen.has(value)) {
    return fail("FIX10_JSON_VALUE");
  }
  if (Object.getOwnPropertySymbols(value).length !== 0) fail("FIX10_JSON_VALUE");
  seen.add(value);
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Array.isArray(value)) {
      const keys = Object.keys(descriptors).filter((key) => key !== "length");
      if (keys.length !== value.length || keys.some((key, index) => key !== String(index))) {
        fail("FIX10_JSON_VALUE");
      }
      return `[${keys.map((key) => {
        const descriptor = descriptors[key];
        if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
          return fail("FIX10_JSON_VALUE");
        }
        return canonicalInner(descriptor.value, seen);
      }).join(",")}]`;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== null && prototype !== Object.prototype) fail("FIX10_JSON_VALUE");
    const keys = Object.keys(descriptors).sort(utf8Compare);
    return `{${keys.map((key) => {
      const descriptor = descriptors[key];
      if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
        return fail("FIX10_JSON_VALUE");
      }
      if (hasLoneSurrogate(key)) fail("FIX10_JSON_LONE_SURROGATE");
      return `${JSON.stringify(key)}:${canonicalInner(descriptor.value, seen)}`;
    }).join(",")}}`;
  } finally {
    seen.delete(value);
  }
}

export function canonicalJson(value: unknown): string {
  const result = canonicalInner(value, new Set());
  if (Buffer.byteLength(result, "utf8") > 1_048_576) fail("FIX10_JSON_CAP");
  return result;
}

class UniqueJsonScanner {
  private index = 0;
  constructor(private readonly source: string) {}

  scan(): void {
    this.space();
    this.value();
    this.space();
    if (this.index !== this.source.length) fail("FIX10_JSON_PARSE");
  }

  private value(): void {
    this.space();
    const char = this.source[this.index];
    if (char === "{") return this.object();
    if (char === "[") return this.array();
    if (char === '"') { this.string(); return; }
    if (char === "t") return this.literal("true");
    if (char === "f") return this.literal("false");
    if (char === "n") return this.literal("null");
    if (char === "-" || (char !== undefined && DIGIT.test(char))) return this.number();
    fail("FIX10_JSON_PARSE");
  }

  private object(): void {
    this.index += 1;
    this.space();
    if (this.take("}")) return;
    const names = new Set<string>();
    while (true) {
      this.space();
      if (this.source[this.index] !== '"') fail("FIX10_JSON_PARSE");
      const name = this.string();
      if (names.has(name)) fail("FIX10_JSON_DUPLICATE");
      names.add(name);
      this.space();
      if (!this.take(":")) fail("FIX10_JSON_PARSE");
      this.value();
      this.space();
      if (this.take("}")) return;
      if (!this.take(",")) fail("FIX10_JSON_PARSE");
    }
  }

  private array(): void {
    this.index += 1;
    this.space();
    if (this.take("]")) return;
    while (true) {
      this.value();
      this.space();
      if (this.take("]")) return;
      if (!this.take(",")) fail("FIX10_JSON_PARSE");
    }
  }

  private string(): string {
    const start = this.index;
    this.index += 1;
    while (this.index < this.source.length) {
      const char = this.source[this.index];
      if (char !== undefined && char.charCodeAt(0) < 0x20) fail("FIX10_JSON_PARSE");
      this.index += 1;
      if (char === '"') {
        let value: string;
        try { value = JSON.parse(this.source.slice(start, this.index)) as string; }
        catch { return fail("FIX10_JSON_PARSE"); }
        if (hasLoneSurrogate(value)) fail("FIX10_JSON_LONE_SURROGATE");
        return value;
      }
      if (char === "\\") {
        const escaped = this.source[this.index];
        if (escaped === "u") {
          if (!/^[0-9a-fA-F]{4}$/u.test(this.source.slice(this.index + 1, this.index + 5))) {
            fail("FIX10_JSON_PARSE");
          }
          this.index += 5;
        } else if (escaped !== undefined && '"\\/bfnrt'.includes(escaped)) this.index += 1;
        else fail("FIX10_JSON_PARSE");
      }
    }
    return fail("FIX10_JSON_PARSE");
  }

  private literal(value: "true" | "false" | "null"): void {
    if (this.source.slice(this.index, this.index + value.length) !== value) fail("FIX10_JSON_PARSE");
    this.index += value.length;
  }

  private number(): void {
    let cursor = this.index;
    if (this.source[cursor] === "-") cursor += 1;
    if (this.source[cursor] === "0") cursor += 1;
    else {
      const first = this.source[cursor];
      if (first === undefined || first < "1" || first > "9") fail("FIX10_JSON_PARSE");
      cursor += 1;
      while (DIGIT.test(this.source[cursor] ?? "")) cursor += 1;
    }
    if (this.source[cursor] === ".") {
      cursor += 1;
      if (!DIGIT.test(this.source[cursor] ?? "")) fail("FIX10_JSON_PARSE");
      while (DIGIT.test(this.source[cursor] ?? "")) cursor += 1;
    }
    if (this.source[cursor] === "e" || this.source[cursor] === "E") {
      cursor += 1;
      if (this.source[cursor] === "+" || this.source[cursor] === "-") cursor += 1;
      if (!DIGIT.test(this.source[cursor] ?? "")) fail("FIX10_JSON_PARSE");
      while (DIGIT.test(this.source[cursor] ?? "")) cursor += 1;
    }
    this.index = cursor;
  }

  private space(): void {
    while (/^[\u0009\u000a\u000d\u0020]$/u.test(this.source[this.index] ?? "")) this.index += 1;
  }

  private take(char: string): boolean {
    if (this.source[this.index] !== char) return false;
    this.index += 1;
    return true;
  }
}

export function parseUniqueJsonText(source: string): unknown {
  if (Buffer.byteLength(source, "utf8") > 1_048_576) fail("FIX10_JSON_CAP");
  new UniqueJsonScanner(source).scan();
  return JSON.parse(source) as unknown;
}

export function nullRecord(
  entries: readonly (readonly [string, unknown])[],
): Readonly<Record<string, unknown>> {
  const result = Object.create(null) as Record<string, unknown>;
  for (const [key, value] of entries) {
    Object.defineProperty(result, key, { enumerable: true, value });
  }
  return Object.freeze(result);
}

export interface ActionWireRecord {
  readonly action_kind: string;
  readonly action_parameters: Readonly<{
    readonly private_key_id: string | null;
    readonly public_input_sha256: string | null;
    readonly writer_identity: string | null;
  }>;
  readonly action_ref: string;
  readonly actor: string;
  readonly invocation_id: string;
  readonly outbox_hash: string;
  readonly outbox_seq: string;
  readonly requested_at_ms: string;
}

export interface MaterializedActionPayload extends Readonly<Record<string, unknown>> {
  readonly action_parameters: Readonly<Record<string, unknown>>;
  readonly local_outcome: null;
}

export function materializeDatabaseActionPayload(record: ActionWireRecord): MaterializedActionPayload {
  const actionParameters = nullRecord([
    ["writer_identity", record.action_parameters.writer_identity],
    ["public_input_sha256", record.action_parameters.public_input_sha256],
    ["private_key_id", record.action_parameters.private_key_id],
  ]);
  return nullRecord([
    ["schema", "obsctl-agent-action/v3"],
    ["invocation_id", record.invocation_id],
    ["requested_at_ms", record.requested_at_ms],
    ["outbox_seq", record.outbox_seq],
    ["outbox_hash", record.outbox_hash],
    ["action_parameters", actionParameters],
    ["local_outcome", null],
  ]) as MaterializedActionPayload;
}

export function databaseActionFromOutbox(record: ActionWireRecord): ChainedAgentActionInput & {
  readonly action_payload: MaterializedActionPayload;
} {
  const actionPayload = materializeDatabaseActionPayload(record);
  return nullRecord([
    ["source", "ops"],
    ["writer_identity", "obsctl"],
    ["actor", record.actor],
    ["action_kind", record.action_kind],
    ["occurrence_id", null],
    ["incident_id", null],
    ["action_ref", record.action_ref],
    ["action_payload", actionPayload],
  ]) as unknown as ChainedAgentActionInput & { readonly action_payload: MaterializedActionPayload };
}

export function canonicalDatabaseActionEvidence(record: ActionWireRecord): Uint8Array {
  return Buffer.from(canonicalJson(databaseActionFromOutbox(record)), "utf8");
}
