import { readFileSync } from "node:fs";
import { z } from "zod";

import { canonicalProjection } from "./canonical.js";
import { parseJsonWithUniqueKeys } from "./unique-json.js";

const severitySchema = z.enum(["INFO", "DEGRADED", "SEVERE", "FATAL"]);
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const relativeGlobSchema = z
  .string()
  .min(1)
  .refine((value) => !value.startsWith("/") && !value.includes("\\"))
  .refine((value) => !value.split("/").includes(".."));
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

function exactSnapshotRecord(
  value: unknown,
  keys: readonly string[],
): value is SnapshotRecord {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== null
  ) {
    return false;
  }
  const ownKeys = Object.keys(value);
  if (ownKeys.length !== keys.length) return false;
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) return false;
  }
  return true;
}

function snapshotArrayOf(
  value: unknown,
  item: (candidate: unknown) => boolean,
  minimum = 0,
): value is unknown[] {
  if (!Array.isArray(value) || value.length < minimum) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, String(index)) || !item(value[index])) {
      return false;
    }
  }
  return true;
}

function literalTuple(
  value: unknown,
  expected: readonly unknown[],
): boolean {
  return snapshotArrayOf(value, () => true) &&
    value.length === expected.length &&
    expected.every((item, index) => value[index] === item);
}

function relativeGlob(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    !value.startsWith("/") &&
    !value.includes("\\") &&
    !value.split("/").includes("..");
}

function sha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
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
    Array.isArray(value.overrides) ||
    Object.getPrototypeOf(value.overrides) !== null
  ) {
    return false;
  }
  const overrides = value.overrides as SnapshotRecord;
  for (const key of Object.keys(overrides)) {
    if (!["INFO", "DEGRADED", "SEVERE", "FATAL"].includes(
      overrides[key] as string,
    )) {
      return false;
    }
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
  if (!snapshotArrayOf(value, () => true) || value.length !== expected.length) {
    return false;
  }
  for (let index = 0; index < expected.length; index += 1) {
    const route = value[index];
    if (
      !exactSnapshotRecord(route, ["incident_class", "owner"]) ||
      route.incident_class !== expected[index] ||
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
    /^[a-f0-9]{40}$/u.test(value.base_commit) &&
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
      typeof seed.key === "string" &&
      /^obs\.[A-Za-z][A-Za-z0-9]*$/u.test(seed.key) &&
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
  return snapshotArrayOf(value, () => true) &&
    value.length === 1 &&
    exactSnapshotRecord(value[0], ["id", "token_env"]) &&
    value[0].id === "V" &&
    value[0].token_env === "OBS_POLICY_CUSTODIAN_TOKEN";
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
  for (let index = 0; index < snapshot.register_seeds.length; index += 1) {
    const seed = snapshot.register_seeds[index];
    if (
      seed !== undefined &&
      ((seed.status === "UNSET") !== (seed.value === null))
    ) {
      return "REGISTER_SEED_STATUS_VALUE_MISMATCH";
    }
  }

  const seedKeys = new Set<string>();
  for (let index = 0; index < snapshot.register_seeds.length; index += 1) {
    const key = snapshot.register_seeds[index]?.key;
    if (key !== undefined) seedKeys.add(key);
  }
  if (seedKeys.size !== snapshot.register_seeds.length) {
    return "DUPLICATE_REGISTER_SEED";
  }

  for (const [field, values] of [
    ["production_source_globs", snapshot.production_source_globs],
    ["floor_deny_globs", snapshot.floor_deny_globs],
    ["allowlist", snapshot.allowlist],
  ] as const) {
    if (new Set(values).size !== values.length) {
      return `DUPLICATE_${field.toUpperCase()}`;
    }
  }
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

function numericArrayPrototypePollution(): boolean {
  let prototype: object | null = Array.prototype;
  while (prototype !== null) {
    if (Object.getOwnPropertyDescriptor(prototype, "0") !== undefined) {
      return true;
    }
    prototype = Object.getPrototypeOf(prototype) as object | null;
  }
  return false;
}

function safeParsePolicyBundle(value: unknown): PolicyBundleParseResult {
  try {
    const snapshot = canonicalProjection(value);
    if (!policyBundleStructure(snapshot)) {
      return schemaFailure("POLICY_BUNDLE_CONTENT_INVALID");
    }

    const crossFieldIssue = snapshotCrossFieldIssue(snapshot);
    if (crossFieldIssue !== undefined) return schemaFailure(crossFieldIssue);

    if (!numericArrayPrototypePollution()) {
      const validated = policyBundleContentsSchema.safeParse(snapshot);
      if (!validated.success) return schemaFailure(validated.error);
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

function globPattern(glob: string): RegExp {
  let pattern = "^";
  for (let index = 0; index < glob.length; index += 1) {
    const character = glob[index];
    if (character === "*") {
      if (glob[index + 1] === "*") {
        if (glob[index + 2] === "/") {
          pattern += "(?:.*/)?";
          index += 2;
        } else {
          pattern += ".*";
          index += 1;
        }
      } else {
        pattern += "[^/]*";
      }
      continue;
    }
    if (character === "?") {
      pattern += "[^/]";
      continue;
    }
    pattern += character?.replace(/[|\\{}()[\]^$+?.]/gu, "\\$&") ?? "";
  }
  return new RegExp(`${pattern}$`, "u");
}

function normalizeRepoRelativePath(repoRelativePath: string): string | null {
  if (
    repoRelativePath.length === 0 ||
    repoRelativePath.includes("\\") ||
    repoRelativePath.includes("\0") ||
    repoRelativePath.startsWith("/") ||
    /^[A-Za-z]:\//u.test(repoRelativePath)
  ) {
    return null;
  }

  let normalized = "";
  for (const segment of repoRelativePath.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") return null;
    normalized = normalized.length === 0 ? segment : `${normalized}/${segment}`;
  }
  return normalized.length === 0 ? null : normalized;
}

export function isFloorDenied(
  bundle: PolicyBundle,
  repoRelativePath: string,
): boolean {
  const normalized = normalizeRepoRelativePath(repoRelativePath);
  if (normalized === null) return true;
  return bundle.floor_deny_globs.some((glob) =>
    globPattern(glob).test(normalized),
  );
}
