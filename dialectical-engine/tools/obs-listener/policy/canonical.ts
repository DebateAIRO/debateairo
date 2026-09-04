import { createHash } from "node:crypto";

export type CanonicalJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalJsonValue[]
  | { readonly [key: string]: CanonicalJsonValue };

export function canonicalProjection(value: unknown): CanonicalJsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("CANONICAL_JSON_NON_FINITE_NUMBER");
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((member) => canonicalProjection(member));
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, canonicalProjection(record[key])]),
    );
  }
  throw new TypeError("CANONICAL_JSON_UNSUPPORTED_VALUE");
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalProjection(value));
}

export function bundleHash(value: unknown): string {
  return createHash("sha256")
    .update(canonicalJson(value), "utf8")
    .digest("hex");
}
