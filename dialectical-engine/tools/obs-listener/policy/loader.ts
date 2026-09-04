import { readFileSync } from "node:fs";
import { z } from "zod";

import {
  canonicalProjection,
  isOwnPlainJsonData,
} from "./canonical.js";
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
  .strict()
  .superRefine((seed, context) => {
    if ((seed.status === "UNSET") !== (seed.value === null)) {
      context.addIssue({
        code: "custom",
        message: "REGISTER_SEED_STATUS_VALUE_MISMATCH",
      });
    }
  });

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
    register_seeds: z
      .array(registerSeedSchema)
      .min(1)
      .superRefine((seeds, context) => {
        if (new Set(seeds.map((seed) => seed.key)).size !== seeds.length) {
          context.addIssue({ code: "custom", message: "DUPLICATE_REGISTER_SEED" });
        }
      }),
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
  .strict()
  .superRefine((bundle, context) => {
    for (const [field, values] of [
      ["production_source_globs", bundle.production_source_globs],
      ["floor_deny_globs", bundle.floor_deny_globs],
      ["allowlist", bundle.allowlist],
    ] as const) {
      if (new Set(values).size !== values.length) {
        context.addIssue({
          code: "custom",
          message: `DUPLICATE_${field.toUpperCase()}`,
        });
      }
    }
  });

export const policyBundleSchema = z
  .unknown()
  .refine(isOwnPlainJsonData, "POLICY_BUNDLE_NON_PLAIN_DATA")
  .transform((value) => canonicalProjection(value))
  .pipe(policyBundleContentsSchema);

export type PolicyBundle = z.infer<typeof policyBundleSchema>;

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

  const segments: string[] = [];
  for (const segment of repoRelativePath.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") return null;
    segments.push(segment);
  }
  return segments.length === 0 ? null : segments.join("/");
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
