import { randomUUID } from "node:crypto";
import {
  SUPPORT_CONFIGURATION_KEYS,
  canonicalDecimal,
  canonicalRegisterJson,
  type CanonicalRegisterJson,
  type RegisterPublicationPort,
  type RegisterVersionText,
  type SupportConfigurationKey,
  type SupportConfigurationStatus
} from "@debateai/register";
import { DEVELOPMENT_SUPPORT_MODEL_PROVIDER_REF } from "./dev-support-model.js";

export const DEVELOPMENT_SUPPORT_CONFIGURATION = Object.freeze({
  support_enabled: true,
  support_model_ref: DEVELOPMENT_SUPPORT_MODEL_PROVIDER_REF,
  support_relay_concurrency: 2,
  support_daily_call_cap: 500,
  support_limit_anon_msgs_10m: 20,
  support_limit_anon_msgs_24h: 100,
  support_limit_anon_sessions_1h: 5,
  support_limit_session_msgs: 40,
  support_limit_msg_chars: 2000,
  support_limit_account_msgs_10m: 60,
  support_limit_account_msgs_24h: 300,
  support_queue_depth: 10,
  support_lock_after_injections: 3,
  support_ip_cooldown_minutes: 60,
  support_retention_policy: "keep",
  support_retention_ratified_by: null
} satisfies Readonly<Record<SupportConfigurationKey,unknown>>);

const DEVELOPMENT_SUPPORT_SOURCE_REF =
  "DEV-SUPPORT-HERMES-GLM-5.3-FLASH#support-only-binding" as const;

function currentBinding(status: NonNullable<SupportConfigurationStatus>): Readonly<{
  enabled: boolean;
  modelRef: string;
}> {
  let decoded: unknown;
  try {
    decoded = JSON.parse(status.configurationText);
  } catch {
    throw new TypeError("DEV_SUPPORT_CONFIGURATION_STATUS_INVALID");
  }
  if (!Array.isArray(decoded)) throw new TypeError("DEV_SUPPORT_CONFIGURATION_STATUS_INVALID");
  const rows = new Map<string,string>();
  for (const item of decoded) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      throw new TypeError("DEV_SUPPORT_CONFIGURATION_STATUS_INVALID");
    }
    const row = item as Readonly<Record<string,unknown>>;
    if (typeof row.row_key !== "string" || typeof row.value_json_text !== "string"
      || rows.has(row.row_key)) {
      throw new TypeError("DEV_SUPPORT_CONFIGURATION_STATUS_INVALID");
    }
    rows.set(row.row_key,row.value_json_text);
  }
  let enabled: unknown;
  let modelRef: unknown;
  try {
    enabled = JSON.parse(rows.get("support_enabled") ?? "");
    modelRef = JSON.parse(rows.get("support_model_ref") ?? "");
  } catch {
    throw new TypeError("DEV_SUPPORT_CONFIGURATION_STATUS_INVALID");
  }
  if (typeof enabled !== "boolean" || typeof modelRef !== "string") {
    throw new TypeError("DEV_SUPPORT_CONFIGURATION_STATUS_INVALID");
  }
  return Object.freeze({ enabled,modelRef });
}

function encoded(key: SupportConfigurationKey): CanonicalRegisterJson {
  const value = DEVELOPMENT_SUPPORT_CONFIGURATION[key];
  return canonicalRegisterJson(typeof value === "number" ? canonicalDecimal(String(value)) : value);
}

export async function initializeDevelopmentSupportConfiguration(input: Readonly<{
  publication: Pick<RegisterPublicationPort,"readSupportStatus"|"publishSupport">;
  baseRegisterVersion: RegisterVersionText;
  publicationId?: () => string;
}>): Promise<"PUBLISHED"|"UNCHANGED"> {
  const status = await input.publication.readSupportStatus();
  const patch = status === null
    ? SUPPORT_CONFIGURATION_KEYS.map((key) => Object.freeze({ key,valueJsonText: encoded(key) }))
    : (() => {
        const binding = currentBinding(status);
        return [
          ...(binding.enabled ? [] : [Object.freeze({
            key: "support_enabled" as const,valueJsonText: encoded("support_enabled")
          })]),
          ...(binding.modelRef === DEVELOPMENT_SUPPORT_MODEL_PROVIDER_REF ? [] : [Object.freeze({
            key: "support_model_ref" as const,valueJsonText: encoded("support_model_ref")
          })])
        ];
      })();
  if (patch.length === 0) return "UNCHANGED";
  await input.publication.publishSupport({
    publicationId: (input.publicationId ?? randomUUID)(),
    baseRegisterVersion: status?.supportRegisterVersion ?? input.baseRegisterVersion,
    expectedSupportRegisterVersion: status?.supportRegisterVersion ?? null,
    schemaVersion: 1,
    patch,
    sourceRef: DEVELOPMENT_SUPPORT_SOURCE_REF
  });
  return "PUBLISHED";
}
