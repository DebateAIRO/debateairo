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
    !Object.hasOwn(descriptor, "value") ||
    descriptor.enumerable !== true
  ) {
    return nonPlainJsonData();
  }
  const value = descriptor.value;
  return value;
}

function arrayLength(descriptor: PropertyDescriptor | undefined): number {
  if (
    descriptor === undefined ||
    !Object.hasOwn(descriptor, "value")
  ) {
    return nonPlainJsonData();
  }
  const value = descriptor.value;
  if (!Number.isSafeInteger(value) || value < 0) return nonPlainJsonData();
  return value;
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
    const descriptors = Object.getOwnPropertyDescriptors(value) as Record<
      string,
      PropertyDescriptor
    >;
    const length = arrayLength(
      Object.hasOwn(descriptors, "length") ? descriptors["length"] : undefined,
    );
    const projection = new Array<CanonicalJsonValue>(length);
    const expectedKeys = new Set(["length"]);
    for (let index = 0; index < length; index += 1) {
      const key = String(index);
      const item = canonicalProjection(
        dataPropertyValue(
          Object.hasOwn(descriptors, key) ? descriptors[key] : undefined,
        ),
      );
      Object.defineProperty(projection, key, {
        configurable: true,
        enumerable: true,
        value: item,
        writable: true,
      });
      expectedKeys.add(key);
    }
    if (Object.keys(descriptors).some((key) => !expectedKeys.has(key))) {
      return nonPlainJsonData();
    }
    return Object.freeze(projection);
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
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
    return Object.freeze(projection);
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
