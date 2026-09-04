import { readFileSync } from "node:fs";
import { isProxy } from "node:util/types";
import { runInNewContext } from "node:vm";
import { z } from "zod";

import { canonicalProjection } from "./canonical.js";
import { parseJsonWithUniqueKeys } from "./unique-json.js";

const BASE_ARRAY_SOME = Object.getOwnPropertyDescriptor(
  Array.prototype,
  "some",
);
const BASE_ARRAY_SORT = Object.getOwnPropertyDescriptor(
  Array.prototype,
  "sort",
);
const BASE_ARRAY_ITERATOR = Object.getOwnPropertyDescriptor(
  Array.prototype,
  Symbol.iterator,
);
const BASE_ARRAY_PUSH = Object.getOwnPropertyDescriptor(
  Array.prototype,
  "push",
);
const isNativeArrayPush = runInNewContext(`
  (candidate) => {
    const nativePush = Object.getOwnPropertyDescriptor(
      Array.prototype,
      "push",
    ).value;
    return typeof candidate === "function" &&
      Function.prototype.toString.call(candidate) ===
        Function.prototype.toString.call(nativePush);
  }
`) as (candidate: unknown) => boolean;
const BASE_ARRAY_PUSH_IS_TRUSTED =
  BASE_ARRAY_PUSH !== undefined &&
  Object.hasOwn(BASE_ARRAY_PUSH, "value") &&
  BASE_ARRAY_PUSH.configurable === true &&
  BASE_ARRAY_PUSH.enumerable === false &&
  BASE_ARRAY_PUSH.writable === true &&
  !isProxy(BASE_ARRAY_PUSH.value) &&
  isNativeArrayPush(BASE_ARRAY_PUSH.value);
const BASE_OBJECT_SOME = Object.getOwnPropertyDescriptor(
  Object.prototype,
  "some",
);
const BASE_OBJECT_SORT = Object.getOwnPropertyDescriptor(
  Object.prototype,
  "sort",
);
const BASE_OBJECT_ITERATOR = Object.getOwnPropertyDescriptor(
  Object.prototype,
  Symbol.iterator,
);

const severitySchema = z.enum(["INFO", "DEGRADED", "SEVERE", "FATAL"]);
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const relativeGlobSchema = z
  .string()
  .min(1)
  .refine(relativeGlob);
const pinnedSetSchema = z
  .object({ count: z.number().int().nonnegative(), sha256: sha256Schema })
  .strict();

const taxonomyPinSchema = z
  .object({
    classes: z.tuple([
      z.literal("PROCESS_DEATH"),
      z.literal("HTTP_FAILURE"),
      z.literal("JOB_FAILURE"),
      z.literal("PROVIDER_EXHAUSTED"),
      z.literal("DB_FAILURE"),
      z.literal("PARSE_SCHEMA_FAILURE"),
      z.literal("STALL_DETECTED"),
      z.literal("SILENT_NOOP"),
      z.literal("SUSPICIOUS_SUCCESS"),
      z.literal("CLIENT_FAILURE"),
      z.literal("CAPTURE_SELF"),
      z.literal("ORIGIN_UNKNOWN"),
    ]),
    suspicious_success_subclasses: z.tuple([
      z.literal("empty_output"),
      z.literal("missing_required_fields"),
      z.literal("missing_artifact_chain"),
    ]),
  })
  .strict();

const tierRulesSchema = z
  .object({
    QUICK: z
      .object({
        authority: z.literal("LABEL_ONLY"),
        route: z.literal("APPROVAL_FIRST"),
        max_production_files: z.literal(1),
        max_test_files: z.literal(1),
        production_line_cap: z.literal(20),
        total_line_cap: z.literal(50),
        requires_red_green: z.literal(true),
      })
      .strict(),
    PR_FIX: z
      .object({
        authority: z.literal("LABEL_ONLY"),
        route: z.literal("APPROVAL_FIRST"),
      })
      .strict(),
    ESCALATE: z
      .object({
        authority: z.literal("LABEL_ONLY"),
        route: z.literal("REPORT_ONLY"),
      })
      .strict(),
  })
  .strict();

const codeRegistrySeedSchema = z
  .object({
    base_commit: z.string().regex(/^[a-f0-9]{40}$/u),
    recipe: z.literal("obs-code-seed.sh@v1"),
    canonicalization: z.literal(
      "UTF-8; LF; LC_ALL=C sort -u; trailing LF; SHA-256",
    ),
    scope_file_list: pinnedSetSchema,
    code_seed_direct: pinnedSetSchema,
    forwarder_manifest: pinnedSetSchema,
    code_seed_forwarded: pinnedSetSchema,
    code_seed: pinnedSetSchema,
    known_gap: pinnedSetSchema,
    safe_template_rule: z.literal("tpl.<code>"),
    seed_parameters: z.tuple([]),
    parameter_types: z.tuple([
      z.literal("id"),
      z.literal("registry_code"),
      z.literal("closed_enum"),
      z.literal("bounded_int"),
    ]),
  })
  .strict();

const registerSeedSchema = z
  .object({
    key: z.string().regex(/^obs\.[A-Za-z][A-Za-z0-9]*$/u),
    value: z.union([z.string(), z.number().finite(), z.null()]),
    status: z.enum(["SEED", "UNSET"]),
    source_ref: z.string().min(1),
  })
  .strict();

const policyBundleContentsSchema = z
  .object({
    schema_version: z.literal(1),
    policy_ref: z.literal("fixagent-policy-v1"),
    production_source_globs: z.array(relativeGlobSchema).min(1),
    tier_rules: tierRulesSchema,
    floor_deny_globs: z.array(relativeGlobSchema).min(1),
    allowlist: z.array(relativeGlobSchema),
    taxonomy_pin: taxonomyPinSchema,
    severity_map: z
      .object({
        ladder: z.tuple([
          z.literal("INFO"),
          z.literal("DEGRADED"),
          z.literal("SEVERE"),
          z.literal("FATAL"),
        ]),
        default: z.literal("DEGRADED"),
        overrides: z.record(z.string(), severitySchema),
        severe_threshold: z.literal("SEVERE"),
      })
      .strict(),
    routing_table: z.tuple([
      z.object({ incident_class: z.literal("SECURITY_PRIVACY"), owner: z.literal("V") }).strict(),
      z.object({ incident_class: z.literal("PERSISTENCE_MIGRATIONS"), owner: z.literal("V") }).strict(),
      z.object({ incident_class: z.literal("SPEND"), owner: z.literal("V") }).strict(),
      z.object({ incident_class: z.literal("SCORING_LIVE_DATA"), owner: z.literal("V") }).strict(),
      z.object({ incident_class: z.literal("DEFAULT"), owner: z.literal("V") }).strict(),
    ]),
    code_registry_seed: codeRegistrySeedSchema,
    register_seeds: z.array(registerSeedSchema).min(1),
    slots: z
      .object({
        zone_manifest_hash: z
          .object({
            value: z.union([z.null(), sha256Schema]),
            gate: z.literal("RP-1"),
          })
          .strict(),
        hatchet_ingest: z
          .object({
            value: z.union([
              z.null(),
              z.literal("ENABLED"),
              z.literal("DEFERRED_TO_MISSION"),
            ]),
            gate: z.literal("RP-2"),
          })
          .strict(),
        injection_corpus_hash: z
          .object({
            value: z.union([z.null(), sha256Schema]),
            gate: z.literal("RP-3"),
          })
          .strict(),
      })
      .strict(),
    quick_arm: z.enum(["OFF", "ON"]),
    custodians: z
      .array(
        z
          .object({
            id: z.literal("V"),
            token_env: z.literal("OBS_POLICY_CUSTODIAN_TOKEN"),
          })
          .strict(),
      )
      .length(1),
  })
  .strict();

type PolicyBundleContents = z.infer<typeof policyBundleContentsSchema>;

type SnapshotRecord = Record<string, unknown>;
const INVALID_ARRAY_ITEM = Symbol("INVALID_ARRAY_ITEM");

function ownArrayLength(value: readonly unknown[]): number | null {
  const descriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (
    descriptor === undefined ||
    !Object.hasOwn(descriptor, "value") ||
    !Number.isSafeInteger(descriptor.value) ||
    descriptor.value < 0
  ) {
    return null;
  }
  return descriptor.value as number;
}

function ownArrayItem(
  value: readonly unknown[],
  index: number,
): unknown | typeof INVALID_ARRAY_ITEM {
  const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
  if (
    descriptor === undefined ||
    !Object.hasOwn(descriptor, "value") ||
    descriptor.enumerable !== true
  ) {
    return INVALID_ARRAY_ITEM;
  }
  return descriptor.value;
}

function ownStringArrayItem(
  value: readonly string[],
  index: number,
): string | null {
  const item = ownArrayItem(value, index);
  return typeof item === "string" ? item : null;
}

function stringContains(value: string, sought: string): boolean {
  if (sought.length === 0) return true;
  if (sought.length > value.length) return false;
  for (let start = 0; start <= value.length - sought.length; start += 1) {
    let matched = true;
    for (let offset = 0; offset < sought.length; offset += 1) {
      if (value[start + offset] !== sought[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
}

function containsParentSegment(value: string): boolean {
  let segment = "";
  for (let index = 0; index <= value.length; index += 1) {
    const character = index === value.length ? "/" : value[index];
    if (character === "/") {
      if (segment === "..") return true;
      segment = "";
    } else {
      segment += character;
    }
  }
  return false;
}

function fixedLowerHex(value: unknown, length: number): value is string {
  if (typeof value !== "string" || value.length !== length) return false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (
      character === undefined ||
      !(
        (character >= "0" && character <= "9") ||
        (character >= "a" && character <= "f")
      )
    ) {
      return false;
    }
  }
  return true;
}

function exactSnapshotRecord(
  value: unknown,
  keys: readonly string[],
): value is SnapshotRecord {
  if (
    value === null ||
    typeof value !== "object" ||
    isProxy(value) ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== null
  ) {
    return false;
  }
  const ownKeys = Object.keys(value);
  const ownKeyCount = ownArrayLength(ownKeys);
  const keyCount = ownArrayLength(keys);
  if (
    ownKeyCount === null ||
    keyCount === null ||
    ownKeyCount !== keyCount
  ) {
    return false;
  }
  for (let index = 0; index < keyCount; index += 1) {
    const key = ownStringArrayItem(keys, index);
    if (key === null) return false;
    if (!Object.hasOwn(value, key)) return false;
  }
  return true;
}

function snapshotArrayOf(
  value: unknown,
  item: (candidate: unknown) => boolean,
  minimum = 0,
): value is unknown[] {
  if (
    value === null ||
    typeof value !== "object" ||
    isProxy(value) ||
    !Array.isArray(value)
  ) {
    return false;
  }
  const length = ownArrayLength(value);
  if (length === null || length < minimum) return false;
  for (let index = 0; index < length; index += 1) {
    const candidate = ownArrayItem(value, index);
    if (candidate === INVALID_ARRAY_ITEM || !item(candidate)) {
      return false;
    }
  }
  return true;
}

function literalTuple(
  value: unknown,
  expected: readonly unknown[],
): boolean {
  if (!snapshotArrayOf(value, () => true)) return false;
  const length = ownArrayLength(value);
  const expectedLength = ownArrayLength(expected);
  if (
    length === null ||
    expectedLength === null ||
    length !== expectedLength
  ) {
    return false;
  }
  for (let index = 0; index < length; index += 1) {
    const actual = ownArrayItem(value, index);
    const wanted = ownArrayItem(expected, index);
    if (
      actual === INVALID_ARRAY_ITEM ||
      wanted === INVALID_ARRAY_ITEM ||
      actual !== wanted
    ) {
      return false;
    }
  }
  return true;
}

function relativeGlob(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    value[0] !== "/" &&
    !stringContains(value, "\\") &&
    !containsParentSegment(value);
}

function sha256(value: unknown): value is string {
  return fixedLowerHex(value, 64);
}

function severity(value: unknown): boolean {
  return value === "INFO" ||
    value === "DEGRADED" ||
    value === "SEVERE" ||
    value === "FATAL";
}

function registerKey(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length < 5 ||
    value[0] !== "o" ||
    value[1] !== "b" ||
    value[2] !== "s" ||
    value[3] !== "."
  ) {
    return false;
  }
  const first = value[4];
  if (
    first === undefined ||
    !(
      (first >= "A" && first <= "Z") ||
      (first >= "a" && first <= "z")
    )
  ) {
    return false;
  }
  for (let index = 5; index < value.length; index += 1) {
    const character = value[index];
    if (
      character === undefined ||
      !(
        (character >= "A" && character <= "Z") ||
        (character >= "a" && character <= "z") ||
        (character >= "0" && character <= "9")
      )
    ) {
      return false;
    }
  }
  return true;
}

function pinnedSet(value: unknown): boolean {
  return exactSnapshotRecord(value, ["count", "sha256"]) &&
    typeof value.count === "number" &&
    Number.isInteger(value.count) &&
    value.count >= 0 &&
    sha256(value.sha256);
}

function tierRules(value: unknown): boolean {
  if (!exactSnapshotRecord(value, ["QUICK", "PR_FIX", "ESCALATE"])) {
    return false;
  }
  const quick = value.QUICK;
  const prFix = value.PR_FIX;
  const escalate = value.ESCALATE;
  return exactSnapshotRecord(quick, [
    "authority",
    "route",
    "max_production_files",
    "max_test_files",
    "production_line_cap",
    "total_line_cap",
    "requires_red_green",
  ]) &&
    quick.authority === "LABEL_ONLY" &&
    quick.route === "APPROVAL_FIRST" &&
    quick.max_production_files === 1 &&
    quick.max_test_files === 1 &&
    quick.production_line_cap === 20 &&
    quick.total_line_cap === 50 &&
    quick.requires_red_green === true &&
    exactSnapshotRecord(prFix, ["authority", "route"]) &&
    prFix.authority === "LABEL_ONLY" &&
    prFix.route === "APPROVAL_FIRST" &&
    exactSnapshotRecord(escalate, ["authority", "route"]) &&
    escalate.authority === "LABEL_ONLY" &&
    escalate.route === "REPORT_ONLY";
}

function taxonomyPin(value: unknown): boolean {
  return exactSnapshotRecord(value, [
    "classes",
    "suspicious_success_subclasses",
  ]) &&
    literalTuple(value.classes, [
      "PROCESS_DEATH",
      "HTTP_FAILURE",
      "JOB_FAILURE",
      "PROVIDER_EXHAUSTED",
      "DB_FAILURE",
      "PARSE_SCHEMA_FAILURE",
      "STALL_DETECTED",
      "SILENT_NOOP",
      "SUSPICIOUS_SUCCESS",
      "CLIENT_FAILURE",
      "CAPTURE_SELF",
      "ORIGIN_UNKNOWN",
    ]) &&
    literalTuple(value.suspicious_success_subclasses, [
      "empty_output",
      "missing_required_fields",
      "missing_artifact_chain",
    ]);
}

function severityMap(value: unknown): boolean {
  if (!exactSnapshotRecord(value, [
    "ladder",
    "default",
    "overrides",
    "severe_threshold",
  ])) {
    return false;
  }
  if (
    !literalTuple(value.ladder, ["INFO", "DEGRADED", "SEVERE", "FATAL"]) ||
    value.default !== "DEGRADED" ||
    value.severe_threshold !== "SEVERE" ||
    value.overrides === null ||
    typeof value.overrides !== "object" ||
    isProxy(value.overrides) ||
    Array.isArray(value.overrides) ||
    Object.getPrototypeOf(value.overrides) !== null
  ) {
    return false;
  }
  const overrides = value.overrides as SnapshotRecord;
  const overrideKeys = Object.keys(overrides);
  const overrideCount = ownArrayLength(overrideKeys);
  if (overrideCount === null) return false;
  for (let index = 0; index < overrideCount; index += 1) {
    const key = ownStringArrayItem(overrideKeys, index);
    if (key === null || !severity(overrides[key])) return false;
  }
  return true;
}

function routingTable(value: unknown): boolean {
  const expected = [
    "SECURITY_PRIVACY",
    "PERSISTENCE_MIGRATIONS",
    "SPEND",
    "SCORING_LIVE_DATA",
    "DEFAULT",
  ] as const;
  if (!snapshotArrayOf(value, () => true)) {
    return false;
  }
  const length = ownArrayLength(value);
  const expectedLength = ownArrayLength(expected);
  if (
    length === null ||
    expectedLength === null ||
    length !== expectedLength
  ) {
    return false;
  }
  for (let index = 0; index < expectedLength; index += 1) {
    const route = ownArrayItem(value, index);
    const incidentClass = ownArrayItem(expected, index);
    if (
      route === INVALID_ARRAY_ITEM ||
      incidentClass === INVALID_ARRAY_ITEM ||
      !exactSnapshotRecord(route, ["incident_class", "owner"]) ||
      route.incident_class !== incidentClass ||
      route.owner !== "V"
    ) {
      return false;
    }
  }
  return true;
}

function codeRegistrySeed(value: unknown): boolean {
  if (!exactSnapshotRecord(value, [
    "base_commit",
    "recipe",
    "canonicalization",
    "scope_file_list",
    "code_seed_direct",
    "forwarder_manifest",
    "code_seed_forwarded",
    "code_seed",
    "known_gap",
    "safe_template_rule",
    "seed_parameters",
    "parameter_types",
  ])) {
    return false;
  }
  return typeof value.base_commit === "string" &&
    fixedLowerHex(value.base_commit, 40) &&
    value.recipe === "obs-code-seed.sh@v1" &&
    value.canonicalization ===
      "UTF-8; LF; LC_ALL=C sort -u; trailing LF; SHA-256" &&
    pinnedSet(value.scope_file_list) &&
    pinnedSet(value.code_seed_direct) &&
    pinnedSet(value.forwarder_manifest) &&
    pinnedSet(value.code_seed_forwarded) &&
    pinnedSet(value.code_seed) &&
    pinnedSet(value.known_gap) &&
    value.safe_template_rule === "tpl.<code>" &&
    literalTuple(value.seed_parameters, []) &&
    literalTuple(value.parameter_types, [
      "id",
      "registry_code",
      "closed_enum",
      "bounded_int",
    ]);
}

function registerSeeds(value: unknown): boolean {
  return snapshotArrayOf(
    value,
    (seed) =>
      exactSnapshotRecord(seed, ["key", "value", "status", "source_ref"]) &&
      registerKey(seed.key) &&
      (seed.value === null ||
        typeof seed.value === "string" ||
        (typeof seed.value === "number" && Number.isFinite(seed.value))) &&
      (seed.status === "SEED" || seed.status === "UNSET") &&
      typeof seed.source_ref === "string" &&
      seed.source_ref.length > 0,
    1,
  );
}

function slots(value: unknown): boolean {
  if (!exactSnapshotRecord(value, [
    "zone_manifest_hash",
    "hatchet_ingest",
    "injection_corpus_hash",
  ])) {
    return false;
  }
  const zone = value.zone_manifest_hash;
  const hatchet = value.hatchet_ingest;
  const injection = value.injection_corpus_hash;
  return exactSnapshotRecord(zone, ["value", "gate"]) &&
    (zone.value === null || sha256(zone.value)) &&
    zone.gate === "RP-1" &&
    exactSnapshotRecord(hatchet, ["value", "gate"]) &&
    (hatchet.value === null ||
      hatchet.value === "ENABLED" ||
      hatchet.value === "DEFERRED_TO_MISSION") &&
    hatchet.gate === "RP-2" &&
    exactSnapshotRecord(injection, ["value", "gate"]) &&
    (injection.value === null || sha256(injection.value)) &&
    injection.gate === "RP-3";
}

function custodians(value: unknown): boolean {
  if (!snapshotArrayOf(value, () => true) || ownArrayLength(value) !== 1) {
    return false;
  }
  const custodian = ownArrayItem(value, 0);
  return custodian !== INVALID_ARRAY_ITEM &&
    exactSnapshotRecord(custodian, ["id", "token_env"]) &&
    custodian.id === "V" &&
    custodian.token_env === "OBS_POLICY_CUSTODIAN_TOKEN";
}

function policyBundleStructure(
  value: unknown,
): value is PolicyBundleContents {
  if (!exactSnapshotRecord(value, [
    "schema_version",
    "policy_ref",
    "production_source_globs",
    "tier_rules",
    "floor_deny_globs",
    "allowlist",
    "taxonomy_pin",
    "severity_map",
    "routing_table",
    "code_registry_seed",
    "register_seeds",
    "slots",
    "quick_arm",
    "custodians",
  ])) {
    return false;
  }
  return value.schema_version === 1 &&
    value.policy_ref === "fixagent-policy-v1" &&
    snapshotArrayOf(value.production_source_globs, relativeGlob, 1) &&
    tierRules(value.tier_rules) &&
    snapshotArrayOf(value.floor_deny_globs, relativeGlob, 1) &&
    snapshotArrayOf(value.allowlist, relativeGlob) &&
    taxonomyPin(value.taxonomy_pin) &&
    severityMap(value.severity_map) &&
    routingTable(value.routing_table) &&
    codeRegistrySeed(value.code_registry_seed) &&
    registerSeeds(value.register_seeds) &&
    slots(value.slots) &&
    (value.quick_arm === "OFF" || value.quick_arm === "ON") &&
    custodians(value.custodians);
}

function snapshotCrossFieldIssue(
  snapshot: PolicyBundleContents,
): string | undefined {
  const seedCount = ownArrayLength(snapshot.register_seeds);
  if (seedCount === null) return "REGISTER_SEEDS_NOT_DENSE";
  for (let index = 0; index < seedCount; index += 1) {
    const seed = ownArrayItem(snapshot.register_seeds, index);
    if (
      seed !== INVALID_ARRAY_ITEM &&
      typeof seed === "object" &&
      seed !== null &&
      seed !== undefined &&
      (((seed as { readonly status?: unknown }).status === "UNSET") !==
        ((seed as { readonly value?: unknown }).value === null))
    ) {
      return "REGISTER_SEED_STATUS_VALUE_MISMATCH";
    }
  }

  const seedKeys = Object.create(null) as Record<string, true>;
  for (let index = 0; index < seedCount; index += 1) {
    const seed = ownArrayItem(snapshot.register_seeds, index);
    if (seed === INVALID_ARRAY_ITEM || seed === null || typeof seed !== "object") {
      return "REGISTER_SEEDS_NOT_DENSE";
    }
    const keyDescriptor = Object.getOwnPropertyDescriptor(seed, "key");
    if (
      keyDescriptor === undefined ||
      !Object.hasOwn(keyDescriptor, "value") ||
      typeof keyDescriptor.value !== "string"
    ) {
      return "REGISTER_SEEDS_NOT_DENSE";
    }
    const key = keyDescriptor.value;
    if (Object.hasOwn(seedKeys, key)) return "DUPLICATE_REGISTER_SEED";
    Object.defineProperty(seedKeys, key, {
      configurable: true,
      enumerable: true,
      value: true,
      writable: true,
    });
  }

  const duplicateString = (values: readonly string[]): boolean => {
    const length = ownArrayLength(values);
    if (length === null) return true;
    const seen = Object.create(null) as Record<string, true>;
    for (let index = 0; index < length; index += 1) {
      const value = ownStringArrayItem(values, index);
      if (value === null || Object.hasOwn(seen, value)) return true;
      Object.defineProperty(seen, value, {
        configurable: true,
        enumerable: true,
        value: true,
        writable: true,
      });
    }
    return false;
  };
  if (duplicateString(snapshot.production_source_globs)) {
    return "DUPLICATE_PRODUCTION_SOURCE_GLOBS";
  }
  if (duplicateString(snapshot.floor_deny_globs)) {
    return "DUPLICATE_FLOOR_DENY_GLOBS";
  }
  if (duplicateString(snapshot.allowlist)) return "DUPLICATE_ALLOWLIST";
  return undefined;
}

class PolicyBundleSchemaError extends Error {
  readonly code = "POLICY_BUNDLE_INVALID";

  constructor(cause: unknown) {
    super("POLICY_BUNDLE_INVALID", { cause });
    this.name = "PolicyBundleSchemaError";
  }
}

type PolicyBundleParseResult =
  | { readonly success: true; readonly data: PolicyBundleContents }
  | { readonly success: false; readonly error: PolicyBundleSchemaError };

function schemaFailure(cause: unknown): PolicyBundleParseResult {
  return { success: false, error: new PolicyBundleSchemaError(cause) };
}

function isCanonicalArrayIndex(key: string): boolean {
  const index = Number(key);
  return Number.isInteger(index) &&
    index >= 0 &&
    index < 0xffff_ffff &&
    String(index) === key;
}

function hasNumericArrayPrototypePollution(): boolean {
  const prototypeHasNumericKey = (prototype: object): boolean => {
    const keys = Object.getOwnPropertyNames(prototype);
    const length = ownArrayLength(keys);
    if (length === null) return true;
    for (let index = 0; index < length; index += 1) {
      const key = ownStringArrayItem(keys, index);
      if (key === null || isCanonicalArrayIndex(key)) return true;
    }
    return false;
  };
  return prototypeHasNumericKey(Array.prototype) ||
    prototypeHasNumericKey(Object.prototype);
}

function sameDescriptorField(
  left: PropertyDescriptor,
  right: PropertyDescriptor,
  field: keyof PropertyDescriptor,
): boolean {
  const leftField = Object.getOwnPropertyDescriptor(left, field);
  const rightField = Object.getOwnPropertyDescriptor(right, field);
  if (leftField === undefined || rightField === undefined) {
    return leftField === rightField;
  }
  return Object.hasOwn(leftField, "value") &&
    Object.hasOwn(rightField, "value") &&
    leftField.value === rightField.value;
}

function sameDescriptor(
  current: PropertyDescriptor | undefined,
  baseline: PropertyDescriptor | undefined,
): boolean {
  if (current === undefined || baseline === undefined) {
    return current === baseline;
  }
  return sameDescriptorField(current, baseline, "configurable") &&
    sameDescriptorField(current, baseline, "enumerable") &&
    sameDescriptorField(current, baseline, "writable") &&
    sameDescriptorField(current, baseline, "value") &&
    sameDescriptorField(current, baseline, "get") &&
    sameDescriptorField(current, baseline, "set");
}

function hasArrayAuthorityPrototypeMutation(): boolean {
  return !BASE_ARRAY_PUSH_IS_TRUSTED ||
    !sameDescriptor(
      Object.getOwnPropertyDescriptor(Array.prototype, "push"),
      BASE_ARRAY_PUSH,
    ) ||
    !sameDescriptor(
      Object.getOwnPropertyDescriptor(Array.prototype, "some"),
      BASE_ARRAY_SOME,
    ) ||
    !sameDescriptor(
      Object.getOwnPropertyDescriptor(Array.prototype, "sort"),
      BASE_ARRAY_SORT,
    ) ||
    !sameDescriptor(
      Object.getOwnPropertyDescriptor(Array.prototype, Symbol.iterator),
      BASE_ARRAY_ITERATOR,
    ) ||
    !sameDescriptor(
      Object.getOwnPropertyDescriptor(Object.prototype, "some"),
      BASE_OBJECT_SOME,
    ) ||
    !sameDescriptor(
      Object.getOwnPropertyDescriptor(Object.prototype, "sort"),
      BASE_OBJECT_SORT,
    ) ||
    !sameDescriptor(
      Object.getOwnPropertyDescriptor(Object.prototype, Symbol.iterator),
      BASE_OBJECT_ITERATOR,
    );
}

function hasPolicyPrototypeMutation(): boolean {
  return hasNumericArrayPrototypePollution() ||
    hasArrayAuthorityPrototypeMutation();
}

function safeParsePolicyBundle(value: unknown): PolicyBundleParseResult {
  try {
    if (hasPolicyPrototypeMutation()) {
      return schemaFailure("POLICY_BUNDLE_PROTOTYPE_MUTATION");
    }

    const snapshot = canonicalProjection(value);
    if (!policyBundleStructure(snapshot)) {
      return schemaFailure("POLICY_BUNDLE_CONTENT_INVALID");
    }

    const crossFieldIssue = snapshotCrossFieldIssue(snapshot);
    if (crossFieldIssue !== undefined) return schemaFailure(crossFieldIssue);

    if (hasPolicyPrototypeMutation()) {
      return schemaFailure("POLICY_BUNDLE_PROTOTYPE_MUTATION");
    }

    const validated = policyBundleContentsSchema.safeParse(snapshot);
    if (!validated.success) return schemaFailure(validated.error);

    if (hasPolicyPrototypeMutation()) {
      return schemaFailure("POLICY_BUNDLE_PROTOTYPE_MUTATION");
    }

    return { success: true, data: snapshot };
  } catch (error) {
    return schemaFailure(error);
  }
}

function parsePolicyBundle(value: unknown): PolicyBundleContents {
  const result = safeParsePolicyBundle(value);
  if (!result.success) throw result.error;
  return result.data;
}

export const policyBundleSchema = Object.freeze({
  parse: parsePolicyBundle,
  safeParse: safeParsePolicyBundle,
});

export type PolicyBundle = PolicyBundleContents;

export class PolicyBundleLoadError extends Error {
  readonly code = "POLICY_BUNDLE_INVALID";

  constructor(cause: unknown) {
    super("POLICY_BUNDLE_INVALID", { cause });
    this.name = "PolicyBundleLoadError";
  }
}

export function loadBundle(path: string): PolicyBundle {
  try {
    return policyBundleSchema.parse(
      parseJsonWithUniqueKeys(readFileSync(path, "utf8")),
    );
  } catch (error) {
    throw new PolicyBundleLoadError(error);
  }
}

function globMatches(glob: string, path: string): boolean {
  const memo = Object.create(null) as Record<string, boolean>;
  const matchesAt = (globIndex: number, pathIndex: number): boolean => {
    const memoKey = `${globIndex}:${pathIndex}`;
    if (Object.hasOwn(memo, memoKey)) return memo[memoKey] === true;

    let matches = false;
    if (globIndex === glob.length) {
      matches = pathIndex === path.length;
    } else if (glob[globIndex] === "*") {
      if (glob[globIndex + 1] === "*") {
        if (glob[globIndex + 2] === "/") {
          matches = matchesAt(globIndex + 3, pathIndex);
          for (
            let end = pathIndex;
            !matches && end < path.length;
            end += 1
          ) {
            if (path[end] === "/") {
              matches = matchesAt(globIndex + 3, end + 1);
            }
          }
        } else {
          matches = matchesAt(globIndex + 2, pathIndex) ||
            (pathIndex < path.length &&
              matchesAt(globIndex, pathIndex + 1));
        }
      } else {
        matches = matchesAt(globIndex + 1, pathIndex) ||
          (pathIndex < path.length &&
            path[pathIndex] !== "/" &&
            matchesAt(globIndex, pathIndex + 1));
      }
    } else if (glob[globIndex] === "?") {
      matches = pathIndex < path.length &&
        path[pathIndex] !== "/" &&
        matchesAt(globIndex + 1, pathIndex + 1);
    } else {
      matches = pathIndex < path.length &&
        glob[globIndex] === path[pathIndex] &&
        matchesAt(globIndex + 1, pathIndex + 1);
    }

    Object.defineProperty(memo, memoKey, {
      configurable: true,
      enumerable: true,
      value: matches,
      writable: true,
    });
    return matches;
  };
  return matchesAt(0, 0);
}

function normalizeRepoRelativePath(repoRelativePath: string): string | null {
  const first = repoRelativePath[0];
  const drive = repoRelativePath[0];
  if (
    repoRelativePath.length === 0 ||
    stringContains(repoRelativePath, "\\") ||
    stringContains(repoRelativePath, "\0") ||
    first === "/" ||
    (
      drive !== undefined &&
      ((drive >= "A" && drive <= "Z") ||
        (drive >= "a" && drive <= "z")) &&
      repoRelativePath[1] === ":" &&
      repoRelativePath[2] === "/"
    )
  ) {
    return null;
  }

  let normalized = "";
  let segment = "";
  for (let index = 0; index <= repoRelativePath.length; index += 1) {
    const character = index === repoRelativePath.length
      ? "/"
      : repoRelativePath[index];
    if (character !== "/") {
      segment += character;
      continue;
    }
    if (segment === "..") return null;
    if (segment !== "" && segment !== ".") {
      normalized = normalized.length === 0
        ? segment
        : `${normalized}/${segment}`;
    }
    segment = "";
  }
  return normalized.length === 0 ? null : normalized;
}

export function isFloorDenied(
  bundle: PolicyBundle,
  repoRelativePath: string,
): boolean {
  const normalized = normalizeRepoRelativePath(repoRelativePath);
  if (normalized === null) return true;
  const globs = bundle.floor_deny_globs;
  const length = ownArrayLength(globs);
  if (length === null) return true;
  for (let index = 0; index < length; index += 1) {
    const glob = ownStringArrayItem(globs, index);
    if (glob === null || globMatches(glob, normalized)) return true;
  }
  return false;
}
