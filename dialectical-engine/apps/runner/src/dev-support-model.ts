export const DEVELOPMENT_SUPPORT_MODEL_PROVIDER_REF =
  "development:hermes-glm-5.3-flash" as const;
export const DEVELOPMENT_SUPPORT_MODEL = "z-ai/glm-5.3-flash" as const;
export const DEVELOPMENT_SUPPORT_MODEL_BASE_URL = "http://127.0.0.1:8794/v1" as const;

export type DevelopmentSupportModelTarget = Readonly<{
  providerRef: typeof DEVELOPMENT_SUPPORT_MODEL_PROVIDER_REF;
  baseUrl: typeof DEVELOPMENT_SUPPORT_MODEL_BASE_URL;
  model: typeof DEVELOPMENT_SUPPORT_MODEL;
  authorizationHeader: string;
  targetJson: string;
}>;

export function parseDevelopmentSupportModelTargetJson(
  source: string
): DevelopmentSupportModelTarget {
  let decoded: unknown;
  try {
    decoded = JSON.parse(source);
  } catch {
    throw new TypeError("DEV_SUPPORT_MODEL_TARGET_INVALID");
  }
  if (decoded === null || typeof decoded !== "object" || Array.isArray(decoded)
    || Object.getPrototypeOf(decoded) !== Object.prototype
    || Object.keys(decoded).sort().join("\0")
      !== ["provider_ref","base_url","model","authorization_header"].sort().join("\0")) {
    throw new TypeError("DEV_SUPPORT_MODEL_TARGET_INVALID");
  }
  const row = decoded as Readonly<Record<string,unknown>>;
  if (row.provider_ref !== DEVELOPMENT_SUPPORT_MODEL_PROVIDER_REF
    || row.base_url !== DEVELOPMENT_SUPPORT_MODEL_BASE_URL
    || row.model !== DEVELOPMENT_SUPPORT_MODEL
    || typeof row.authorization_header !== "string"
    || !/^Bearer [^\s]+$/u.test(row.authorization_header)) {
    throw new TypeError("DEV_SUPPORT_MODEL_TARGET_INVALID");
  }
  const targetJson = JSON.stringify({
    provider_ref: DEVELOPMENT_SUPPORT_MODEL_PROVIDER_REF,
    base_url: DEVELOPMENT_SUPPORT_MODEL_BASE_URL,
    model: DEVELOPMENT_SUPPORT_MODEL,
    authorization_header: row.authorization_header
  });
  if (targetJson !== source) throw new TypeError("DEV_SUPPORT_MODEL_TARGET_INVALID");
  return Object.freeze({
    providerRef: DEVELOPMENT_SUPPORT_MODEL_PROVIDER_REF,
    baseUrl: DEVELOPMENT_SUPPORT_MODEL_BASE_URL,
    model: DEVELOPMENT_SUPPORT_MODEL,
    authorizationHeader: row.authorization_header,
    targetJson
  });
}
