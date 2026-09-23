import {
  DEFAULT_DEVELOPMENT_AUTH_STACK_PROFILE,
  type DevelopmentAuthStackProfile
} from "./dev-auth-stack-profile.js";

export const DEVELOPMENT_SUPPORT_MODEL_PROVIDER_REF =
  "development:hermes-glm-5.3-flash" as const;
export const DEVELOPMENT_SUPPORT_MODEL = "z-ai/glm-5.3-flash" as const;
export const DEVELOPMENT_SUPPORT_MODEL_BASE_URL = "http://127.0.0.1:8794/v1" as const;

export type DevelopmentSupportModelTarget = Readonly<{
  providerRef: typeof DEVELOPMENT_SUPPORT_MODEL_PROVIDER_REF;
  baseUrl: string;
  model: typeof DEVELOPMENT_SUPPORT_MODEL;
  authorizationHeader: string;
  targetJson: string;
}>;

export function parseDevelopmentSupportModelTargetJson(
  source: string,
  profile: DevelopmentAuthStackProfile = DEFAULT_DEVELOPMENT_AUTH_STACK_PROFILE
): DevelopmentSupportModelTarget {
  let decoded: unknown;
  try {
    decoded = JSON.parse(source);
  } catch {
    throw new TypeError("DEV_SUPPORT_MODEL_TARGET_INVALID");
  }
  if (decoded === null || typeof decoded !== "object" || Array.isArray(decoded)
    || Object.getPrototypeOf(decoded) !== Object.prototype) {
    throw new TypeError("DEV_SUPPORT_MODEL_TARGET_INVALID");
  }
  const row = decoded as Readonly<Record<string,unknown>>;
  const supportPreview = profile.name === "support-preview";
  const expectedKeys = [
    "provider_ref","base_url","model","authorization_header",
    ...(supportPreview ? ["development_stack_profile"] : [])
  ];
  const expectedBaseUrl = `http://127.0.0.1:${profile.supportModelPort}/v1`;
  if (Object.keys(row).sort().join("\0") !== expectedKeys.sort().join("\0")
    || row.provider_ref !== DEVELOPMENT_SUPPORT_MODEL_PROVIDER_REF
    || row.base_url !== expectedBaseUrl
    || row.model !== DEVELOPMENT_SUPPORT_MODEL
    || (supportPreview && row.development_stack_profile !== "support-preview")
    || typeof row.authorization_header !== "string"
    || !/^Bearer [^\s]+$/u.test(row.authorization_header)) {
    throw new TypeError("DEV_SUPPORT_MODEL_TARGET_INVALID");
  }
  const targetJson = JSON.stringify({
    provider_ref: DEVELOPMENT_SUPPORT_MODEL_PROVIDER_REF,
    base_url: expectedBaseUrl,
    model: DEVELOPMENT_SUPPORT_MODEL,
    authorization_header: row.authorization_header,
    ...(supportPreview ? { development_stack_profile: "support-preview" } : {})
  });
  if (targetJson !== source) throw new TypeError("DEV_SUPPORT_MODEL_TARGET_INVALID");
  return Object.freeze({
    providerRef: DEVELOPMENT_SUPPORT_MODEL_PROVIDER_REF,
    baseUrl: expectedBaseUrl,
    model: DEVELOPMENT_SUPPORT_MODEL,
    authorizationHeader: row.authorization_header,
    targetJson
  });
}
