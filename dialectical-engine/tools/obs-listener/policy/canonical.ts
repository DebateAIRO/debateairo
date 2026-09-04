import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

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

function descriptorMapEntry(
  descriptors: object,
  key: string,
): PropertyDescriptor | undefined {
  const entryDescriptor = Object.getOwnPropertyDescriptor(descriptors, key);
  if (
    entryDescriptor === undefined ||
    !Object.hasOwn(entryDescriptor, "value") ||
    entryDescriptor.value === null ||
    typeof entryDescriptor.value !== "object"
  ) {
    return undefined;
  }
  return entryDescriptor.value as PropertyDescriptor;
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

const MAX_CANONICAL_DEPTH = 256;
const MAX_CANONICAL_NODES = 10_000;

interface ProjectionState {
  readonly active: object[];
  remainingNodes: number;
}

function activeContains(active: readonly object[], candidate: object): boolean {
  const length = ownArrayLength(active);
  for (let index = 0; index < length; index += 1) {
    if (dataPropertyValue(
      Object.getOwnPropertyDescriptor(active, String(index)),
    ) === candidate) {
      return true;
    }
  }
  return false;
}

function activePush(active: object[], candidate: object): void {
  Object.defineProperty(active, String(ownArrayLength(active)), {
    configurable: true,
    enumerable: true,
    value: candidate,
    writable: true,
  });
}

function activePop(active: object[], candidate: object): void {
  const length = ownArrayLength(active);
  if (length === 0) return nonPlainJsonData();
  const lastKey = String(length - 1);
  if (dataPropertyValue(
    Object.getOwnPropertyDescriptor(active, lastKey),
  ) !== candidate) {
    return nonPlainJsonData();
  }
  if (!Reflect.deleteProperty(active, lastKey)) return nonPlainJsonData();
  Object.defineProperty(active, "length", { value: length - 1 });
}

function projectCanonical(
  value: unknown,
  state: ProjectionState,
  depth: number,
): CanonicalJsonValue {
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
  if (
    (typeof value === "object" && value !== null) ||
    typeof value === "function"
  ) {
    if (isProxy(value)) return nonPlainJsonData();
  }

  if (typeof value === "object") {
    if (
      depth > MAX_CANONICAL_DEPTH ||
      state.remainingNodes <= 0 ||
      activeContains(state.active, value)
    ) {
      return nonPlainJsonData();
    }
    state.remainingNodes -= 1;
    activePush(state.active, value);
    try {
      if (Array.isArray(value)) {
        if (Object.getPrototypeOf(value) !== Array.prototype) {
          return nonPlainJsonData();
        }
        if (ownArrayLength(Object.getOwnPropertySymbols(value)) !== 0) {
          return nonPlainJsonData();
        }
        const descriptors = Object.getOwnPropertyDescriptors(value) as Record<
          string,
          PropertyDescriptor
        >;
        const length = arrayLength(
          descriptorMapEntry(descriptors, "length"),
        );
        const projection = new Array<CanonicalJsonValue>(length);
        if (
          ownArrayLength(Object.getOwnPropertyNames(descriptors)) !==
            length + 1
        ) {
          return nonPlainJsonData();
        }
        for (let index = 0; index < length; index += 1) {
          const key = String(index);
          const item = projectCanonical(
            dataPropertyValue(
              descriptorMapEntry(descriptors, key),
            ),
            state,
            depth + 1,
          );
          Object.defineProperty(projection, key, {
            configurable: true,
            enumerable: true,
            value: item,
            writable: true,
          });
        }
        return Object.freeze(projection);
      }

      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) {
        return nonPlainJsonData();
      }
      if (ownArrayLength(Object.getOwnPropertySymbols(value)) !== 0) {
        return nonPlainJsonData();
      }
      const descriptors = Object.getOwnPropertyDescriptors(value);
      const projection = Object.create(null) as Record<
        string,
        CanonicalJsonValue
      >;
      const keys = sortedOwnPropertyNames(descriptors);
      const keyCount = ownArrayLength(keys);
      for (let index = 0; index < keyCount; index += 1) {
        const key = ownStringAt(keys, index);
        Object.defineProperty(projection, key, {
          configurable: true,
          enumerable: true,
          value: projectCanonical(
            dataPropertyValue(descriptorMapEntry(descriptors, key)),
            state,
            depth + 1,
          ),
          writable: true,
        });
      }
      return Object.freeze(projection);
    } finally {
      activePop(state.active, value);
    }
  }
  throw new TypeError("CANONICAL_JSON_UNSUPPORTED_VALUE");
}

export function canonicalProjection(value: unknown): CanonicalJsonValue {
  return projectCanonical(
    value,
    {
      active: [],
      remainingNodes: MAX_CANONICAL_NODES,
    },
    0,
  );
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

function serializeJsonPrimitive(
  value: null | boolean | number | string,
): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("CANONICAL_JSON_NON_FINITE_NUMBER");
    }
    return Object.is(value, -0) ? "0" : String(value);
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) return nonPlainJsonData();
  return encoded;
}

function ownStringAt(values: readonly string[], index: number): string {
  const value = dataPropertyValue(
    Object.getOwnPropertyDescriptor(values, String(index)),
  );
  if (typeof value !== "string") return nonPlainJsonData();
  return value;
}

function defineOwnStringAt(
  values: string[],
  index: number,
  value: string,
): void {
  Object.defineProperty(values, String(index), {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

function ownArrayLength(value: readonly unknown[]): number {
  return arrayLength(Object.getOwnPropertyDescriptor(value, "length"));
}

function sortedOwnPropertyNames(value: object): string[] {
  const names = Object.getOwnPropertyNames(value);
  const length = ownArrayLength(names);
  for (let start = 0; start < length; start += 1) {
    let leastIndex = start;
    let least = ownStringAt(names, start);
    for (
      let candidateIndex = start + 1;
      candidateIndex < length;
      candidateIndex += 1
    ) {
      const candidate = ownStringAt(names, candidateIndex);
      if (candidate < least) {
        least = candidate;
        leastIndex = candidateIndex;
      }
    }
    if (leastIndex !== start) {
      defineOwnStringAt(names, leastIndex, ownStringAt(names, start));
      defineOwnStringAt(names, start, least);
    }
  }
  return names;
}

function serializeCanonical(value: unknown): string {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return serializeJsonPrimitive(value);
  }
  if (typeof value !== "object") {
    throw new TypeError("CANONICAL_JSON_UNSUPPORTED_VALUE");
  }
  if (ownArrayLength(Object.getOwnPropertySymbols(value)) !== 0) {
    return nonPlainJsonData();
  }

  if (Array.isArray(value)) {
    const length = arrayLength(
      Object.getOwnPropertyDescriptor(value, "length"),
    );
    const ownNames = Object.getOwnPropertyNames(value);
    if (ownArrayLength(ownNames) !== length + 1) return nonPlainJsonData();

    let encoded = "[";
    for (let index = 0; index < length; index += 1) {
      if (index !== 0) encoded += ",";
      encoded += serializeCanonical(dataPropertyValue(
        Object.getOwnPropertyDescriptor(value, String(index)),
      ));
    }
    return `${encoded}]`;
  }

  const ownNames = sortedOwnPropertyNames(value);
  const ownNameCount = ownArrayLength(ownNames);
  let encoded = "{";
  for (let index = 0; index < ownNameCount; index += 1) {
    const keyDescriptor = Object.getOwnPropertyDescriptor(
      ownNames,
      String(index),
    );
    const key = dataPropertyValue(keyDescriptor);
    if (typeof key !== "string") return nonPlainJsonData();
    if (index !== 0) encoded += ",";
    encoded += `${serializeJsonPrimitive(key)}:${serializeCanonical(
      dataPropertyValue(Object.getOwnPropertyDescriptor(value, key)),
    )}`;
  }
  return `${encoded}}`;
}

export function canonicalJson(value: unknown): string {
  return serializeCanonical(canonicalProjection(value));
}

export function bundleHash(value: unknown): string {
  return createHash("sha256")
    .update(canonicalJson(value), "utf8")
    .digest("hex");
}
