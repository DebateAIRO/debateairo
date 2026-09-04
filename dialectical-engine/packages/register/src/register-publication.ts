import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";

export type RegisterVersionText = string & {
  readonly __registerVersionText: unique symbol;
};

export type CanonicalDecimalText = string & {
  readonly __canonicalDecimalText: unique symbol;
};

export type CanonicalRegisterJson = string & {
  readonly __canonicalRegisterJson: unique symbol;
};

export type CanonicalJsonAst =
  | null | boolean | string
  | Readonly<{ kind: "DECIMAL"; text: CanonicalDecimalText }>
  | readonly CanonicalJsonAst[]
  | Readonly<{ [key: string]: CanonicalJsonAst }>;

export const SUPPORT_CONFIGURATION_KEYS = Object.freeze([
  "support_enabled",
  "support_model_ref",
  "support_relay_concurrency",
  "support_daily_call_cap",
  "support_limit_anon_msgs_10m",
  "support_limit_anon_msgs_24h",
  "support_limit_anon_sessions_1h",
  "support_limit_session_msgs",
  "support_limit_msg_chars",
  "support_limit_account_msgs_10m",
  "support_limit_account_msgs_24h",
  "support_queue_depth",
  "support_lock_after_injections",
  "support_ip_cooldown_minutes",
  "support_retention_policy",
  "support_retention_ratified_by"
] as const);

export type SupportConfigurationKey = typeof SUPPORT_CONFIGURATION_KEYS[number];

const SUPPORT_KEY_SET = new Set<string>(SUPPORT_CONFIGURATION_KEYS);
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const VERSION_PATTERN = /^[1-9][0-9]*$/u;
const MAX_CANONICAL_JSON_BYTES = 1_048_576;
const MAX_CANONICAL_JSON_DEPTH = 100;
const MAX_CANONICAL_JSON_VALUES = 100_000;

function fail(code: string): never {
  throw new TypeError(code);
}

export function parseRegisterVersionText(value: unknown): RegisterVersionText {
  if (typeof value !== "string" || !VERSION_PATTERN.test(value)) {
    return fail("REGISTER_VERSION_TEXT_INVALID");
  }
  try {
    if (BigInt(value) > 9_223_372_036_854_775_807n) return fail("REGISTER_VERSION_TEXT_INVALID");
  } catch {
    return fail("REGISTER_VERSION_TEXT_INVALID");
  }
  return value as RegisterVersionText;
}

export function registerVersionToSafeLegacyNumber(value: RegisterVersionText): number {
  const parsed = BigInt(parseRegisterVersionText(value));
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    return fail("REGISTER_VERSION_UNSAFE_LEGACY_NUMBER");
  }
  return Number(parsed);
}

function normalizeDecimal(raw: string): string {
  const match = /^(-?)([0-9]+)(?:[.]([0-9]+))?$/u.exec(raw);
  if (match === null) return fail("CANONICAL_DECIMAL_INVALID");
  const sign = match[1] ?? "";
  const integer = (match[2] ?? "").replace(/^0+(?=[0-9])/u, "");
  const fraction = (match[3] ?? "").replace(/0+$/u, "");
  const isZero = integer === "0" && fraction === "";
  return `${isZero ? "" : sign}${integer}${fraction === "" ? "" : `.${fraction}`}`;
}

function validateNormalizedDecimal(normalized: string): CanonicalDecimalText {
  const unsigned = normalized.startsWith("-") ? normalized.slice(1) : normalized;
  const [integer = "", fraction] = unsigned.split(".");
  if (fraction === undefined) {
    const value = BigInt(normalized);
    if (value < -9_007_199_254_740_991n || value > 9_007_199_254_740_991n) {
      return fail("CANONICAL_DECIMAL_INVALID");
    }
    return normalized as CanonicalDecimalText;
  }
  if (fraction.length < 1 || fraction.length > 6) return fail("CANONICAL_DECIMAL_INVALID");
  const significant = `${integer}${fraction}`.replace(/^0+/u, "");
  if (significant.length > 15) return fail("CANONICAL_DECIMAL_INVALID");
  const proof = Number(normalized);
  if (!Number.isFinite(proof) || proof.toFixed(fraction.length) !== normalized) {
    return fail("CANONICAL_DECIMAL_INVALID");
  }
  return normalized as CanonicalDecimalText;
}

export function canonicalDecimal(raw: string): Readonly<{
  kind: "DECIMAL";
  text: CanonicalDecimalText;
}> {
  if (typeof raw !== "string") return fail("CANONICAL_DECIMAL_INVALID");
  const text = validateNormalizedDecimal(normalizeDecimal(raw));
  return Object.freeze({ kind: "DECIMAL", text });
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function canonicalString(value: string): string {
  let result = "\"";
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0 || (code >= 0xd800 && code <= 0xdfff && (
      code > 0xdbff || index + 1 >= value.length
      || value.charCodeAt(index + 1) < 0xdc00 || value.charCodeAt(index + 1) > 0xdfff
    ))) return fail("CANONICAL_REGISTER_JSON_INVALID");
    if (code >= 0xd800 && code <= 0xdbff) {
      result += value[index] ?? "";
      index += 1;
      result += value[index] ?? "";
    } else if (code === 0x22) result += "\\\"";
    else if (code === 0x5c) result += "\\\\";
    else if (code >= 1 && code <= 0x1f) result += `\\u${code.toString(16).padStart(4, "0")}`;
    else result += value[index] ?? "";
  }
  return `${result}\"`;
}

type InspectedAstObject = Readonly<{
  prototype: object | null;
  keys: readonly string[];
  descriptors: Readonly<Record<string, PropertyDescriptor>>;
}>;

function inspectAstObject(value: object): InspectedAstObject {
  const prototype = Object.getPrototypeOf(value) as object | null;
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== "string")) {
    return fail("CANONICAL_REGISTER_JSON_AST_INVALID");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = ownKeys as string[];
  if (keys.some((key) => {
    const descriptor = descriptors[key];
    return descriptor === undefined || !("value" in descriptor)
      || descriptor.get !== undefined || descriptor.set !== undefined;
  })) {
    return fail("CANONICAL_REGISTER_JSON_AST_INVALID");
  }
  return { prototype, keys, descriptors };
}

function isDecimalNode(shape: InspectedAstObject): boolean {
  const keys = [...shape.keys].sort();
  return keys.length === 2 && keys[0] === "kind" && keys[1] === "text"
    && shape.descriptors.kind?.enumerable === true
    && shape.descriptors.text?.enumerable === true
    && shape.descriptors.kind?.value === "DECIMAL"
    && typeof shape.descriptors.text?.value === "string";
}

function serializeAst(value: unknown, ancestors: Set<object>): string {
  if (value === null) return "null";
  if (value === true) return "true";
  if (value === false) return "false";
  if (typeof value === "string") return canonicalString(value);
  if (typeof value !== "object") return fail("CANONICAL_REGISTER_JSON_AST_INVALID");
  if (ancestors.has(value)) return fail("CANONICAL_REGISTER_JSON_AST_INVALID");
  const shape = inspectAstObject(value);
  if (shape.prototype !== Object.prototype && shape.prototype !== null
      && shape.prototype !== Array.prototype) {
    return fail("CANONICAL_REGISTER_JSON_AST_INVALID");
  }
  if (isDecimalNode(shape)) {
    if (shape.prototype !== Object.prototype && shape.prototype !== null) {
      return fail("CANONICAL_REGISTER_JSON_AST_INVALID");
    }
    const text = shape.descriptors.text?.value as string;
    const normalized = canonicalDecimal(text).text;
    if (normalized !== text) return fail("CANONICAL_REGISTER_JSON_AST_INVALID");
    return normalized;
  }
  if (Array.isArray(value)) {
    if (shape.prototype !== Array.prototype) return fail("CANONICAL_REGISTER_JSON_AST_INVALID");
    const lengthDescriptor = shape.descriptors.length;
    const length = lengthDescriptor?.value;
    if (lengthDescriptor === undefined || lengthDescriptor.enumerable !== false
        || typeof length !== "number" || !Number.isSafeInteger(length) || length < 0) {
      return fail("CANONICAL_REGISTER_JSON_AST_INVALID");
    }
    if (shape.keys.length !== length + 1) {
      return fail("CANONICAL_REGISTER_JSON_AST_INVALID");
    }
    const members: string[] = [];
    ancestors.add(value);
    try {
      for (let index = 0; index < length; index += 1) {
        const descriptor = shape.descriptors[String(index)];
        if (descriptor === undefined || descriptor.enumerable !== true) {
          return fail("CANONICAL_REGISTER_JSON_AST_INVALID");
        }
        members.push(serializeAst(descriptor.value, ancestors));
      }
      return `[${members.join(",")}]`;
    } finally {
      ancestors.delete(value);
    }
  }
  if (shape.prototype !== Object.prototype && shape.prototype !== null) {
    return fail("CANONICAL_REGISTER_JSON_AST_INVALID");
  }
  if (shape.keys.includes("toJSON")
      || shape.keys.some((key) => shape.descriptors[key]?.enumerable !== true)) {
    return fail("CANONICAL_REGISTER_JSON_AST_INVALID");
  }
  ancestors.add(value);
  try {
    return `{${[...shape.keys].sort(compareUtf8).map((key) => (
      `${canonicalString(key)}:${serializeAst(shape.descriptors[key]?.value, ancestors)}`
    )).join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

export function canonicalRegisterJson(value: CanonicalJsonAst): CanonicalRegisterJson {
  try {
    return serializeAst(value, new Set()) as CanonicalRegisterJson;
  } catch (error) {
    if (error instanceof TypeError && error.message === "CANONICAL_REGISTER_JSON_AST_INVALID") throw error;
    return fail("CANONICAL_REGISTER_JSON_AST_INVALID");
  }
}

class RawJsonParser {
  private index = 0;
  private values = 0;

  constructor(private readonly source: string) {}

  parse(): CanonicalJsonAst {
    this.space();
    const value = this.value(0);
    this.space();
    if (this.index !== this.source.length) return fail("CANONICAL_REGISTER_JSON_INVALID");
    return value;
  }

  private value(depth: number): CanonicalJsonAst {
    this.values += 1;
    if (depth > MAX_CANONICAL_JSON_DEPTH || this.values > MAX_CANONICAL_JSON_VALUES) {
      return fail("CANONICAL_REGISTER_JSON_INVALID");
    }
    const current = this.source[this.index];
    if (current === "\"") return this.string();
    if (current === "[") return this.array(depth + 1);
    if (current === "{") return this.object(depth + 1);
    if (this.source.startsWith("true", this.index)) { this.index += 4; return true; }
    if (this.source.startsWith("false", this.index)) { this.index += 5; return false; }
    if (this.source.startsWith("null", this.index)) { this.index += 4; return null; }
    return this.decimal();
  }

  private space(): void {
    while (/[\u0009\u000a\u000d\u0020]/u.test(this.source[this.index] ?? "")) this.index += 1;
  }

  private string(): string {
    this.index += 1;
    let result = "";
    while (this.index < this.source.length) {
      const current = this.source[this.index++];
      if (current === "\"") {
        canonicalString(result);
        return result;
      }
      if (current === "\\") {
        const escape = this.source[this.index++];
        const simple: Readonly<Record<string, string>> = {
          "\"": "\"", "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t"
        };
        if (escape !== undefined && simple[escape] !== undefined) {
          result += simple[escape];
          continue;
        }
        if (escape !== "u") return fail("CANONICAL_REGISTER_JSON_INVALID");
        const hex = this.source.slice(this.index, this.index + 4);
        if (!/^[0-9a-fA-F]{4}$/u.test(hex)) return fail("CANONICAL_REGISTER_JSON_INVALID");
        this.index += 4;
        const first = Number.parseInt(hex, 16);
        if (first >= 0xd800 && first <= 0xdbff) {
          if (this.source.slice(this.index, this.index + 2) !== "\\u") return fail("CANONICAL_REGISTER_JSON_INVALID");
          const lowHex = this.source.slice(this.index + 2, this.index + 6);
          if (!/^[dD][c-fC-F][0-9a-fA-F]{2}$/u.test(lowHex)) return fail("CANONICAL_REGISTER_JSON_INVALID");
          this.index += 6;
          result += String.fromCharCode(first, Number.parseInt(lowHex, 16));
        } else if (first >= 0xdc00 && first <= 0xdfff) return fail("CANONICAL_REGISTER_JSON_INVALID");
        else result += String.fromCharCode(first);
        continue;
      }
      if (current === undefined || current.charCodeAt(0) <= 0x1f) return fail("CANONICAL_REGISTER_JSON_INVALID");
      result += current;
    }
    return fail("CANONICAL_REGISTER_JSON_INVALID");
  }

  private decimal(): Readonly<{ kind: "DECIMAL"; text: CanonicalDecimalText }> {
    const start = this.index;
    if (this.source[this.index] === "-") this.index += 1;
    if (this.source[this.index] === "0") this.index += 1;
    else {
      if (!/[1-9]/u.test(this.source[this.index] ?? "")) return fail("CANONICAL_REGISTER_JSON_INVALID");
      while (/[0-9]/u.test(this.source[this.index] ?? "")) this.index += 1;
    }
    if (this.source[this.index] === ".") {
      this.index += 1;
      const fractionStart = this.index;
      while (/[0-9]/u.test(this.source[this.index] ?? "")) this.index += 1;
      if (this.index === fractionStart) return fail("CANONICAL_REGISTER_JSON_INVALID");
    }
    if (this.source[this.index] === "e" || this.source[this.index] === "E") {
      while (/[+\-0-9eE]/u.test(this.source[this.index] ?? "")) this.index += 1;
      return fail("CANONICAL_REGISTER_JSON_INVALID");
    }
    const raw = this.source.slice(start, this.index);
    try {
      return canonicalDecimal(raw);
    } catch {
      return fail("CANONICAL_REGISTER_JSON_INVALID");
    }
  }

  private array(depth: number): readonly CanonicalJsonAst[] {
    this.index += 1;
    this.space();
    const values: CanonicalJsonAst[] = [];
    if (this.source[this.index] === "]") { this.index += 1; return values; }
    while (true) {
      values.push(this.value(depth));
      this.space();
      const separator = this.source[this.index++];
      if (separator === "]") return values;
      if (separator !== ",") return fail("CANONICAL_REGISTER_JSON_INVALID");
      this.space();
    }
  }

  private object(depth: number): Readonly<Record<string, CanonicalJsonAst>> {
    this.index += 1;
    this.space();
    const value: Record<string, CanonicalJsonAst> = Object.create(null) as Record<string, CanonicalJsonAst>;
    const keys = new Set<string>();
    if (this.source[this.index] === "}") { this.index += 1; return value; }
    while (true) {
      if (this.source[this.index] !== "\"") return fail("CANONICAL_REGISTER_JSON_INVALID");
      const key = this.string();
      if (keys.has(key)) return fail("CANONICAL_REGISTER_JSON_INVALID");
      keys.add(key);
      this.space();
      if (this.source[this.index++] !== ":") return fail("CANONICAL_REGISTER_JSON_INVALID");
      this.space();
      value[key] = this.value(depth);
      this.space();
      const separator = this.source[this.index++];
      if (separator === "}") return value;
      if (separator !== ",") return fail("CANONICAL_REGISTER_JSON_INVALID");
      this.space();
    }
  }
}

export function parseCanonicalRegisterJson(rawUtf8: Uint8Array): CanonicalRegisterJson {
  if (!(rawUtf8 instanceof Uint8Array) || rawUtf8.byteLength > MAX_CANONICAL_JSON_BYTES) {
    return fail("CANONICAL_REGISTER_JSON_INVALID");
  }
  try {
    const source = new TextDecoder("utf-8", { fatal: true }).decode(rawUtf8);
    return canonicalRegisterJson(new RawJsonParser(source).parse());
  } catch {
    return fail("CANONICAL_REGISTER_JSON_INVALID");
  }
}

export interface RegisterPublicationRow {
  readonly rowKey: string;
  readonly valueJsonText: CanonicalRegisterJson;
  readonly sourceRef: string;
}

export interface GeneralRegisterPublication {
  readonly publicationId: string;
  readonly baseRegisterVersion: RegisterVersionText;
  readonly rows: readonly RegisterPublicationRow[];
  readonly sourceRef: string;
}

export interface HistoricalRegisterImport {
  readonly registerVersion: RegisterVersionText;
  readonly rows: readonly RegisterPublicationRow[];
}

export interface SupportConfigurationPatchRow {
  readonly key: SupportConfigurationKey;
  readonly valueJsonText: CanonicalRegisterJson;
}

export interface SupportConfigurationPublication {
  readonly publicationId: string;
  readonly baseRegisterVersion: RegisterVersionText;
  readonly expectedSupportRegisterVersion: RegisterVersionText | null;
  readonly schemaVersion: 1;
  readonly patch: readonly SupportConfigurationPatchRow[];
  readonly sourceRef: string;
}

export type RegisterPublicationReceipt = Readonly<{
  registerVersion: RegisterVersionText;
  baseRegisterVersion: RegisterVersionText;
  publicationId: string;
  publicationKind: "GENERAL" | "SUPPORT_CONFIGURATION";
  requestSha256: string;
  snapshotSha256: string;
  rowCount: number;
  recordedAt: Date;
}>;

export type HistoricalRegisterImportReceipt = Readonly<{
  registerVersion: RegisterVersionText;
  rowCount: number;
  snapshotSha256: string;
  outcome: "CREATED" | "REPLAYED";
}>;

export type SupportPublicationReceipt = RegisterPublicationReceipt & Readonly<{
  publicationKind: "SUPPORT_CONFIGURATION";
  previousSupportRegisterVersion: RegisterVersionText | null;
  supportSnapshotSha256: string;
  changedKeys: readonly SupportConfigurationKey[];
}>;

export type SupportConfigurationStatus = Readonly<{
  supportRegisterVersion: RegisterVersionText;
  schemaVersion: number;
  baseRegisterVersion: RegisterVersionText;
  publicationId: string;
  requestSha256: string;
  snapshotSha256: string;
  supportSnapshotSha256: string;
  changedKeys: readonly SupportConfigurationKey[];
  sourceRef: string;
  recordedAt: Date;
  configurationText: string;
}> | null;

export interface RegisterPublicationPort {
  importHistorical(input: HistoricalRegisterImport): Promise<HistoricalRegisterImportReceipt>;
  publishGeneral(input: GeneralRegisterPublication): Promise<RegisterPublicationReceipt>;
  publishSupport(input: SupportConfigurationPublication): Promise<SupportPublicationReceipt>;
  readSupportStatus(): Promise<SupportConfigurationStatus>;
}

function lp(value: string): Buffer {
  const bytes = Buffer.from(value, "utf8");
  const length = Buffer.alloc(8);
  length.writeBigUInt64BE(BigInt(bytes.byteLength));
  return Buffer.concat([length, bytes]);
}

function sha256(parts: readonly Uint8Array[]): string {
  const hash = createHash("sha256");
  for (const part of parts) hash.update(part);
  return hash.digest("hex");
}

function requirePlainExact(value: unknown, keys: readonly string[], code: string): void {
  if (value === null || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype
      || Object.keys(value).sort().join("\0") !== [...keys].sort().join("\0")) fail(code);
}

function validBoundedText(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= maximum
    && value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value);
}

function validateCanonicalText(value: unknown, code: string): asserts value is CanonicalRegisterJson {
  if (typeof value !== "string") fail(code);
  const parsed = parseCanonicalRegisterJson(Buffer.from(value, "utf8"));
  if (parsed !== value) fail(code);
}

function validateRows(rows: readonly RegisterPublicationRow[], allowSupport: boolean): void {
  if (!Array.isArray(rows) || rows.length < 1) fail("REGISTER_PUBLICATION_INPUT_INVALID");
  const keys = new Set<string>();
  for (const row of rows) {
    requirePlainExact(row, ["rowKey", "valueJsonText", "sourceRef"], "REGISTER_PUBLICATION_INPUT_INVALID");
    if (!validBoundedText(row.rowKey, 256) || row.rowKey === "supportActivation"
        || (!allowSupport && SUPPORT_KEY_SET.has(row.rowKey)) || keys.has(row.rowKey)
        || !validBoundedText(row.sourceRef, 1024)) fail("REGISTER_PUBLICATION_INPUT_INVALID");
    validateCanonicalText(row.valueJsonText, "REGISTER_PUBLICATION_INPUT_INVALID");
    keys.add(row.rowKey);
  }
}

function parseSupportValue(key: SupportConfigurationKey, textValue: CanonicalRegisterJson): unknown {
  const canonical = parseCanonicalRegisterJson(Buffer.from(textValue));
  if (canonical !== textValue) fail("SUPPORT_CONFIG_PATCH_INVALID");
  if (key === "support_enabled") {
    if (textValue !== "true" && textValue !== "false") fail("SUPPORT_CONFIG_PATCH_INVALID");
    return textValue === "true";
  }
  if (key === "support_model_ref") {
    const match = /^"([\s\S]*)"$/u.exec(textValue);
    if (match === null) fail("SUPPORT_CONFIG_PATCH_INVALID");
    const decoded = JSON.parse(textValue) as unknown;
    if (typeof decoded !== "string" || decoded.length < 1 || decoded.length > 128
        || decoded.trim() !== decoded || /\s/u.test(decoded) || decoded.includes("://")
        || !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u.test(decoded)) fail("SUPPORT_CONFIG_PATCH_INVALID");
    return decoded;
  }
  if (key === "support_retention_policy") {
    const decoded = JSON.parse(textValue) as unknown;
    if (decoded === "keep") return decoded;
    if (typeof decoded !== "string") fail("SUPPORT_CONFIG_PATCH_INVALID");
    const match = /^shred-after-days:([1-9][0-9]*)$/u.exec(decoded);
    if (match === null || BigInt(match[1] ?? "0") > 3650n) fail("SUPPORT_CONFIG_PATCH_INVALID");
    return decoded;
  }
  if (key === "support_retention_ratified_by") {
    if (textValue === "null") return null;
    if (textValue === "\"V\"") return "V";
    return fail("SUPPORT_CONFIG_PATCH_INVALID");
  }
  const ranges: Readonly<Record<Exclude<SupportConfigurationKey,
    "support_enabled" | "support_model_ref" | "support_retention_policy" | "support_retention_ratified_by">,
    readonly [number, number]>> = {
    support_relay_concurrency: [1, 16],
    support_daily_call_cap: [1, 1_000_000],
    support_limit_anon_msgs_10m: [1, 100_000],
    support_limit_anon_msgs_24h: [1, 1_000_000],
    support_limit_anon_sessions_1h: [1, 100_000],
    support_limit_session_msgs: [1, 100_000],
    support_limit_msg_chars: [1, 100_000],
    support_limit_account_msgs_10m: [1, 100_000],
    support_limit_account_msgs_24h: [1, 1_000_000],
    support_queue_depth: [0, 1_000],
    support_lock_after_injections: [1, 100],
    support_ip_cooldown_minutes: [1, 10_080]
  };
  if (!/^(0|[1-9][0-9]*)$/u.test(textValue)) fail("SUPPORT_CONFIG_PATCH_INVALID");
  const value = BigInt(textValue);
  const [minimum, maximum] = ranges[key];
  if (value < BigInt(minimum) || value > BigInt(maximum)) fail("SUPPORT_CONFIG_PATCH_INVALID");
  return Number(value);
}

export function validateSupportConfigurationValue(key: SupportConfigurationKey, value: CanonicalRegisterJson): unknown {
  return parseSupportValue(key, value);
}

function validateSupportPublication(input: SupportConfigurationPublication): void {
  requirePlainExact(input, [
    "publicationId", "baseRegisterVersion", "expectedSupportRegisterVersion", "schemaVersion", "patch", "sourceRef"
  ], "SUPPORT_CONFIG_PATCH_INVALID");
  if (!UUID_PATTERN.test(input.publicationId) || input.schemaVersion !== 1
      || !validBoundedText(input.sourceRef, 1024) || !Array.isArray(input.patch) || input.patch.length < 1) {
    fail("SUPPORT_CONFIG_PATCH_INVALID");
  }
  parseRegisterVersionText(input.baseRegisterVersion);
  if (input.expectedSupportRegisterVersion !== null) parseRegisterVersionText(input.expectedSupportRegisterVersion);
  const keys = new Set<string>();
  for (const row of input.patch) {
    requirePlainExact(row, ["key", "valueJsonText"], "SUPPORT_CONFIG_PATCH_INVALID");
    if (!SUPPORT_KEY_SET.has(row.key) || row.key === "supportActivation" || keys.has(row.key)) {
      fail("SUPPORT_CONFIG_PATCH_INVALID");
    }
    parseSupportValue(row.key, row.valueJsonText);
    keys.add(row.key);
  }
  if (keys.has("support_retention_policy") && keys.has("support_retention_ratified_by")) {
    fail("SUPPORT_CONFIG_PATCH_INVALID");
  }
}

function sortedRows(rows: readonly RegisterPublicationRow[]): readonly RegisterPublicationRow[] {
  return [...rows].sort((left, right) => compareUtf8(left.rowKey, right.rowKey));
}

export function computeRegisterSnapshotSha256(rows: readonly RegisterPublicationRow[]): string {
  validateRows(rows, true);
  return sha256(sortedRows(rows).flatMap((row) => [lp(row.rowKey), lp(row.valueJsonText), lp(row.sourceRef)]));
}

export function computeGeneralPublicationRequestSha256(input: GeneralRegisterPublication): string {
  validateRows(input.rows, true);
  if (!UUID_PATTERN.test(input.publicationId) || !validBoundedText(input.sourceRef, 1024)) {
    fail("REGISTER_PUBLICATION_INPUT_INVALID");
  }
  parseRegisterVersionText(input.baseRegisterVersion);
  return sha256([
    lp(input.publicationId), lp("GENERAL"), lp(input.baseRegisterVersion),
    ...sortedRows(input.rows).flatMap((row) => [lp(row.rowKey), lp(row.valueJsonText), lp(row.sourceRef)]),
    lp(input.sourceRef)
  ]);
}

function patchJson(patch: readonly SupportConfigurationPatchRow[]): string {
  return canonicalRegisterJson(patch.map((row) => ({ key: row.key, value_json_text: row.valueJsonText })));
}

export function computeSupportPublicationRequestSha256(input: SupportConfigurationPublication): string {
  validateSupportPublication(input);
  return sha256([
    lp(input.publicationId), lp("SUPPORT_CONFIGURATION"), lp(input.baseRegisterVersion),
    lp(input.expectedSupportRegisterVersion ?? ""), lp(String(input.schemaVersion)),
    lp(patchJson(input.patch)), lp(input.sourceRef)
  ]);
}

function rowEnvelope(rows: readonly RegisterPublicationRow[]): string {
  return JSON.stringify(rows.map((row) => ({
    row_key: row.rowKey,
    value_json_text: row.valueJsonText,
    source_ref: row.sourceRef
  })));
}

function requireSha256(value: unknown): string {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) return fail("REGISTER_PUBLICATION_RECEIPT_INVALID");
  return value;
}

function requireDate(value: unknown): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) return fail("REGISTER_PUBLICATION_RECEIPT_INVALID");
  return new Date(value.getTime());
}

function requireRowCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    return fail("REGISTER_PUBLICATION_RECEIPT_INVALID");
  }
  return value;
}

const HISTORICAL_RESULT_COLUMNS = Object.freeze([
  "register_version", "row_count", "snapshot_sha256", "outcome"
] as const);
const GENERAL_RESULT_COLUMNS = Object.freeze([
  "register_version", "base_register_version", "publication_id", "publication_kind",
  "request_sha256", "snapshot_sha256", "row_count", "recorded_at"
] as const);
const SUPPORT_RESULT_COLUMNS = Object.freeze([
  ...GENERAL_RESULT_COLUMNS,
  "previous_support_register_version", "support_snapshot_sha256", "changed_keys"
] as const);
const SUPPORT_STATUS_RESULT_COLUMNS = Object.freeze([
  "support_register_version", "schema_version", "base_register_version", "publication_id",
  "request_sha256", "snapshot_sha256", "support_snapshot_sha256", "changed_keys",
  "source_ref", "recorded_at", "configuration_text"
] as const);

function exactDatabaseResultRow(
  rows: unknown,
  columns: readonly string[],
  code: "REGISTER_PUBLICATION_RECEIPT_INVALID" | "SUPPORT_CONFIG_SNAPSHOT_INVALID"
): Record<string, unknown> {
  if (!Array.isArray(rows) || rows.length !== 1) return fail(code);
  const row: unknown = rows[0];
  if (row === null || typeof row !== "object" || Array.isArray(row)) return fail(code);
  const prototype = Object.getPrototypeOf(row);
  const ownKeys = Reflect.ownKeys(row);
  if ((prototype !== Object.prototype && prototype !== null)
      || ownKeys.some((key) => typeof key !== "string")
      || (ownKeys as string[]).sort().join("\0") !== [...columns].sort().join("\0")) {
    return fail(code);
  }
  const descriptors = Object.getOwnPropertyDescriptors(row);
  if ((ownKeys as string[]).some((key) => {
    const descriptor = descriptors[key];
    return descriptor === undefined || !("value" in descriptor)
      || descriptor.get !== undefined || descriptor.set !== undefined || descriptor.enumerable !== true;
  })) {
    return fail(code);
  }
  return row as Record<string, unknown>;
}

async function transaction<T>(pool: Pool, operation: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let commitStarted = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    const result = await operation(client);
    commitStarted = true;
    await client.query("COMMIT");
    return result;
  } catch (error) {
    if (!commitStarted) await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function publicationReceipt(row: Record<string, unknown>, expected: Readonly<{
  publicationId: string;
  publicationKind: "GENERAL" | "SUPPORT_CONFIGURATION";
  baseRegisterVersion: RegisterVersionText;
  requestSha256: string;
  snapshotSha256?: string;
  rowCount?: number;
}>): RegisterPublicationReceipt {
  const registerVersion = parseRegisterVersionText(row.register_version);
  const baseRegisterVersion = parseRegisterVersionText(row.base_register_version);
  const publicationId = row.publication_id;
  const publicationKind = row.publication_kind;
  const requestSha256 = requireSha256(row.request_sha256);
  const snapshotSha256 = requireSha256(row.snapshot_sha256);
  const rowCount = requireRowCount(row.row_count);
  if (baseRegisterVersion !== expected.baseRegisterVersion || publicationId !== expected.publicationId
      || publicationKind !== expected.publicationKind || requestSha256 !== expected.requestSha256
      || (expected.snapshotSha256 !== undefined && snapshotSha256 !== expected.snapshotSha256)
      || (expected.rowCount !== undefined && rowCount !== expected.rowCount)) {
    fail("REGISTER_PUBLICATION_RECEIPT_INVALID");
  }
  return Object.freeze({
    registerVersion, baseRegisterVersion, publicationId, publicationKind,
    requestSha256, snapshotSha256, rowCount, recordedAt: requireDate(row.recorded_at)
  }) as RegisterPublicationReceipt;
}

function statusRow(row: Record<string, unknown>): NonNullable<SupportConfigurationStatus> {
  const publicationId = row.publication_id;
  const changedKeys = row.changed_keys;
  const schemaVersion = row.schema_version;
  const sourceRef = row.source_ref;
  const configurationText = row.configuration_text;
  if (typeof publicationId !== "string" || !UUID_PATTERN.test(publicationId)
      || !Array.isArray(changedKeys) || changedKeys.some((key) => typeof key !== "string" || !SUPPORT_KEY_SET.has(key))
      || new Set(changedKeys).size !== changedKeys.length
      || typeof schemaVersion !== "number" || !Number.isSafeInteger(schemaVersion) || schemaVersion < 1
      || !validBoundedText(sourceRef, 1024) || typeof configurationText !== "string") {
    fail("SUPPORT_CONFIG_SNAPSHOT_INVALID");
  }
  return Object.freeze({
    supportRegisterVersion: parseRegisterVersionText(row.support_register_version),
    schemaVersion,
    baseRegisterVersion: parseRegisterVersionText(row.base_register_version),
    publicationId,
    requestSha256: requireSha256(row.request_sha256),
    snapshotSha256: requireSha256(row.snapshot_sha256),
    supportSnapshotSha256: requireSha256(row.support_snapshot_sha256),
    changedKeys: Object.freeze([...changedKeys]) as readonly SupportConfigurationKey[],
    sourceRef,
    recordedAt: requireDate(row.recorded_at),
    configurationText
  });
}

export function createPostgresRegisterPublicationPort(pool: Pool): RegisterPublicationPort {
  return Object.freeze({
    async importHistorical(input: HistoricalRegisterImport) {
      requirePlainExact(input, ["registerVersion", "rows"], "REGISTER_PUBLICATION_INPUT_INVALID");
      const registerVersion = parseRegisterVersionText(input.registerVersion);
      if (BigInt(registerVersion) > 4n) fail("REGISTER_PUBLICATION_INPUT_INVALID");
      validateRows(input.rows, true);
      const snapshotSha256 = computeRegisterSnapshotSha256(input.rows);
      return transaction(pool, async (client) => {
        const result = await client.query<Record<string, unknown>>(
          `SELECT * FROM register.import_historical_register_version(
            $1::bigint,$2::jsonb,$3::char(64)
          )`,
          [registerVersion, rowEnvelope(input.rows), snapshotSha256]
        );
        const row = exactDatabaseResultRow(
          result.rows, HISTORICAL_RESULT_COLUMNS, "REGISTER_PUBLICATION_RECEIPT_INVALID"
        );
        const returnedVersion = parseRegisterVersionText(row.register_version);
        const returnedSnapshotSha256 = requireSha256(row.snapshot_sha256);
        const rowCount = requireRowCount(row.row_count);
        if (returnedVersion !== registerVersion || returnedSnapshotSha256 !== snapshotSha256
            || (row.outcome !== "CREATED" && row.outcome !== "REPLAYED")
            || rowCount !== input.rows.length) fail("REGISTER_PUBLICATION_RECEIPT_INVALID");
        return Object.freeze({
          registerVersion,
          rowCount,
          snapshotSha256,
          outcome: row.outcome
        });
      });
    },

    async publishGeneral(input: GeneralRegisterPublication) {
      requirePlainExact(input, ["publicationId", "baseRegisterVersion", "rows", "sourceRef"], "REGISTER_PUBLICATION_INPUT_INVALID");
      validateRows(input.rows, true);
      if (input.rows.some((row) => row.rowKey === "supportActivation")) fail("REGISTER_PUBLICATION_INPUT_INVALID");
      const requestSha256 = computeGeneralPublicationRequestSha256(input);
      const snapshotSha256 = computeRegisterSnapshotSha256(input.rows);
      return transaction(pool, async (client) => {
        const result = await client.query<Record<string, unknown>>(
          `SELECT * FROM register.publish_register_version(
            $1::uuid,$2::char(64),$3::bigint,$4::jsonb,$5::text
          )`,
          [input.publicationId, requestSha256, input.baseRegisterVersion, rowEnvelope(input.rows), input.sourceRef]
        );
        const row = exactDatabaseResultRow(
          result.rows, GENERAL_RESULT_COLUMNS, "REGISTER_PUBLICATION_RECEIPT_INVALID"
        );
        return publicationReceipt(row, {
          publicationId: input.publicationId,
          publicationKind: "GENERAL",
          baseRegisterVersion: input.baseRegisterVersion,
          requestSha256,
          snapshotSha256,
          rowCount: input.rows.length
        });
      });
    },

    async publishSupport(input: SupportConfigurationPublication) {
      validateSupportPublication(input);
      const requestSha256 = computeSupportPublicationRequestSha256(input);
      return transaction(pool, async (client) => {
        const result = await client.query<Record<string, unknown>>(
          `SELECT * FROM register.publish_support_configuration(
            $1::uuid,$2::char(64),$3::bigint,$4::bigint,$5::integer,$6::jsonb,$7::text
          )`,
          [
            input.publicationId, requestSha256, input.expectedSupportRegisterVersion,
            input.baseRegisterVersion, input.schemaVersion, patchJson(input.patch), input.sourceRef
          ]
        );
        const row = exactDatabaseResultRow(
          result.rows, SUPPORT_RESULT_COLUMNS, "REGISTER_PUBLICATION_RECEIPT_INVALID"
        );
        const receipt = publicationReceipt(row, {
          publicationId: input.publicationId,
          publicationKind: "SUPPORT_CONFIGURATION",
          baseRegisterVersion: input.baseRegisterVersion,
          requestSha256
        });
        const previous = row.previous_support_register_version === null
          ? null : parseRegisterVersionText(row.previous_support_register_version);
        if (previous !== input.expectedSupportRegisterVersion) fail("REGISTER_PUBLICATION_RECEIPT_INVALID");
        const changedKeys = row.changed_keys;
        if (!Array.isArray(changedKeys) || changedKeys.length < 1
            || changedKeys.some((key) => typeof key !== "string" || !SUPPORT_KEY_SET.has(key))
            || new Set(changedKeys).size !== changedKeys.length
            || [...changedKeys].sort().join("\0") !== input.patch.map((item) => item.key).sort().join("\0")) {
          fail("REGISTER_PUBLICATION_RECEIPT_INVALID");
        }
        return Object.freeze({
          ...receipt,
          publicationKind: "SUPPORT_CONFIGURATION" as const,
          previousSupportRegisterVersion: previous,
          supportSnapshotSha256: requireSha256(row.support_snapshot_sha256),
          changedKeys: Object.freeze([...changedKeys]) as readonly SupportConfigurationKey[]
        });
      });
    },

    async readSupportStatus() {
      const client = await pool.connect();
      try {
        const result = await client.query<Record<string, unknown>>(`
          SELECT support_register_version,1::integer AS schema_version,base_register_version,publication_id,
            request_sha256,snapshot_sha256,support_snapshot_sha256,changed_keys,
            source_ref,recorded_at,configuration::text AS configuration_text
          FROM register.read_support_configuration_status()
        `);
        const row = exactDatabaseResultRow(
          result.rows, SUPPORT_STATUS_RESULT_COLUMNS, "SUPPORT_CONFIG_SNAPSHOT_INVALID"
        );
        return statusRow(row);
      } finally {
        client.release();
      }
    }
  });
}
