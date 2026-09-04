import { createHash } from "node:crypto";

export type CanonicalJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalJsonValue[]
  | { readonly [key: string]: CanonicalJsonValue };

function nonPlainJsonData(): never {
  throw new TypeError("CANONICAL_JSON_NON_PLAIN_DATA");
}

function dataPropertyValue(
  descriptor: PropertyDescriptor | undefined,
): unknown {
  if (
    descriptor === undefined ||
    !("value" in descriptor) ||
    descriptor.enumerable !== true
  ) {
    return nonPlainJsonData();
  }
  return descriptor.value;
}

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
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      return nonPlainJsonData();
    }
    if (Object.getOwnPropertySymbols(value).length !== 0) {
      return nonPlainJsonData();
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const projection: CanonicalJsonValue[] = [];
    for (let index = 0; index < value.length; index += 1) {
      projection.push(
        canonicalProjection(dataPropertyValue(descriptors[String(index)])),
      );
    }
    const expectedKeys = new Set([
      "length",
      ...projection.map((_, index) => String(index)),
    ]);
    if (Object.keys(descriptors).some((key) => !expectedKeys.has(key))) {
      return nonPlainJsonData();
    }
    return projection;
  }
  if (typeof value === "object") {
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      return nonPlainJsonData();
    }
    if (Object.getOwnPropertySymbols(value).length !== 0) {
      return nonPlainJsonData();
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const projection = Object.create(null) as Record<
      string,
      CanonicalJsonValue
    >;
    for (const key of Object.keys(descriptors).sort()) {
      projection[key] = canonicalProjection(
        dataPropertyValue(descriptors[key]),
      );
    }
    return projection;
  }
  throw new TypeError("CANONICAL_JSON_UNSUPPORTED_VALUE");
}

export function isOwnPlainJsonData(
  value: unknown,
): value is CanonicalJsonValue {
  try {
    canonicalProjection(value);
    return true;
  } catch {
    return false;
  }
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalProjection(value));
}

export function bundleHash(value: unknown): string {
  return createHash("sha256")
    .update(canonicalJson(value), "utf8")
    .digest("hex");
}
