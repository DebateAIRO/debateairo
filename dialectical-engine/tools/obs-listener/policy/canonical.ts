import { hash as nodeHash } from "node:crypto";
import { isProxy } from "node:util/types";

const HASH = nodeHash;
const IS_PROXY = isProxy;
const ARRAY = Array;
const NUMBER = Number;
const TO_STRING = String;
const TYPE_ERROR = TypeError;
const {
  isArray: ARRAY_IS_ARRAY,
  prototype: ARRAY_PROTOTYPE,
} = ARRAY;
const {
  isFinite: NUMBER_IS_FINITE,
  isSafeInteger: NUMBER_IS_SAFE_INTEGER,
} = NUMBER;
const { stringify: JSON_STRINGIFY } = JSON;
const { deleteProperty: DELETE_PROPERTY } = Reflect;
const {
  create: CREATE_OBJECT,
  defineProperty: DEFINE_PROPERTY,
  freeze: FREEZE_OBJECT,
  getOwnPropertyDescriptor: GET_OWN_PROPERTY_DESCRIPTOR,
  getOwnPropertyDescriptors: GET_OWN_PROPERTY_DESCRIPTORS,
  getOwnPropertyNames: GET_OWN_PROPERTY_NAMES,
  getOwnPropertySymbols: GET_OWN_PROPERTY_SYMBOLS,
  getPrototypeOf: GET_PROTOTYPE_OF,
  hasOwn: HAS_OWN,
  is: OBJECT_IS,
  prototype: OBJECT_PROTOTYPE,
} = Object;

export type CanonicalJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalJsonValue[]
  | { readonly [key: string]: CanonicalJsonValue };

function ownDataPropertyDescriptor(
  value: unknown,
  configurable?: boolean,
  enumerable?: boolean,
  writable?: boolean,
): PropertyDescriptor {
  const descriptor = CREATE_OBJECT(null) as PropertyDescriptor;
  descriptor.value = value;
  if (configurable !== undefined) descriptor.configurable = configurable;
  if (enumerable !== undefined) descriptor.enumerable = enumerable;
  if (writable !== undefined) descriptor.writable = writable;
  return descriptor;
}

function nonPlainJsonData(): never {
  throw new TYPE_ERROR("CANONICAL_JSON_NON_PLAIN_DATA");
}

function dataPropertyValue(
  descriptor: PropertyDescriptor | undefined,
): unknown {
  if (
    descriptor === undefined ||
    !HAS_OWN(descriptor, "value") ||
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
  const entryDescriptor = GET_OWN_PROPERTY_DESCRIPTOR(descriptors, key);
  if (
    entryDescriptor === undefined ||
    !HAS_OWN(entryDescriptor, "value") ||
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
    !HAS_OWN(descriptor, "value")
  ) {
    return nonPlainJsonData();
  }
  const value = descriptor.value;
  if (!NUMBER_IS_SAFE_INTEGER(value) || value < 0) return nonPlainJsonData();
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
      GET_OWN_PROPERTY_DESCRIPTOR(active, TO_STRING(index)),
    ) === candidate) {
      return true;
    }
  }
  return false;
}

function activePush(active: object[], candidate: object): void {
  DEFINE_PROPERTY(
    active,
    TO_STRING(ownArrayLength(active)),
    ownDataPropertyDescriptor(candidate, true, true, true),
  );
}

function activePop(active: object[], candidate: object): void {
  const length = ownArrayLength(active);
  if (length === 0) return nonPlainJsonData();
  const lastKey = TO_STRING(length - 1);
  if (dataPropertyValue(
    GET_OWN_PROPERTY_DESCRIPTOR(active, lastKey),
  ) !== candidate) {
    return nonPlainJsonData();
  }
  if (!DELETE_PROPERTY(active, lastKey)) return nonPlainJsonData();
  DEFINE_PROPERTY(
    active,
    "length",
    ownDataPropertyDescriptor(length - 1),
  );
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
    if (!NUMBER_IS_FINITE(value)) {
      throw new TYPE_ERROR("CANONICAL_JSON_NON_FINITE_NUMBER");
    }
    return value;
  }
  if (
    (typeof value === "object" && value !== null) ||
    typeof value === "function"
  ) {
    if (IS_PROXY(value)) return nonPlainJsonData();
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
      if (ARRAY_IS_ARRAY(value)) {
        if (GET_PROTOTYPE_OF(value) !== ARRAY_PROTOTYPE) {
          return nonPlainJsonData();
        }
        if (ownArrayLength(GET_OWN_PROPERTY_SYMBOLS(value)) !== 0) {
          return nonPlainJsonData();
        }
        const descriptors = GET_OWN_PROPERTY_DESCRIPTORS(value) as Record<
          string,
          PropertyDescriptor
        >;
        const length = arrayLength(
          descriptorMapEntry(descriptors, "length"),
        );
        const projection = new ARRAY<CanonicalJsonValue>(length);
        if (
          ownArrayLength(GET_OWN_PROPERTY_NAMES(descriptors)) !==
            length + 1
        ) {
          return nonPlainJsonData();
        }
        for (let index = 0; index < length; index += 1) {
          const key = TO_STRING(index);
          const item = projectCanonical(
            dataPropertyValue(
              descriptorMapEntry(descriptors, key),
            ),
            state,
            depth + 1,
          );
          DEFINE_PROPERTY(
            projection,
            key,
            ownDataPropertyDescriptor(item, true, true, true),
          );
        }
        return FREEZE_OBJECT(projection);
      }

      const prototype = GET_PROTOTYPE_OF(value);
      if (prototype !== OBJECT_PROTOTYPE && prototype !== null) {
        return nonPlainJsonData();
      }
      if (ownArrayLength(GET_OWN_PROPERTY_SYMBOLS(value)) !== 0) {
        return nonPlainJsonData();
      }
      const descriptors = GET_OWN_PROPERTY_DESCRIPTORS(value);
      const projection = CREATE_OBJECT(null) as Record<
        string,
        CanonicalJsonValue
      >;
      const keys = sortedOwnPropertyNames(descriptors);
      const keyCount = ownArrayLength(keys);
      for (let index = 0; index < keyCount; index += 1) {
        const key = ownStringAt(keys, index);
        DEFINE_PROPERTY(
          projection,
          key,
          ownDataPropertyDescriptor(
            projectCanonical(
              dataPropertyValue(descriptorMapEntry(descriptors, key)),
              state,
              depth + 1,
            ),
            true,
            true,
            true,
          ),
        );
      }
      return FREEZE_OBJECT(projection);
    } finally {
      activePop(state.active, value);
    }
  }
  throw new TYPE_ERROR("CANONICAL_JSON_UNSUPPORTED_VALUE");
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
    if (!NUMBER_IS_FINITE(value)) {
      throw new TYPE_ERROR("CANONICAL_JSON_NON_FINITE_NUMBER");
    }
    return OBJECT_IS(value, -0) ? "0" : TO_STRING(value);
  }
  const encoded = JSON_STRINGIFY(value);
  if (encoded === undefined) return nonPlainJsonData();
  return encoded;
}

function ownStringAt(values: readonly string[], index: number): string {
  const value = dataPropertyValue(
    GET_OWN_PROPERTY_DESCRIPTOR(values, TO_STRING(index)),
  );
  if (typeof value !== "string") return nonPlainJsonData();
  return value;
}

function defineOwnStringAt(
  values: string[],
  index: number,
  value: string,
): void {
  DEFINE_PROPERTY(
    values,
    TO_STRING(index),
    ownDataPropertyDescriptor(value, true, true, true),
  );
}

function ownArrayLength(value: readonly unknown[]): number {
  return arrayLength(GET_OWN_PROPERTY_DESCRIPTOR(value, "length"));
}

function sortedOwnPropertyNames(value: object): string[] {
  const names = GET_OWN_PROPERTY_NAMES(value);
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
    throw new TYPE_ERROR("CANONICAL_JSON_UNSUPPORTED_VALUE");
  }
  if (ownArrayLength(GET_OWN_PROPERTY_SYMBOLS(value)) !== 0) {
    return nonPlainJsonData();
  }

  if (ARRAY_IS_ARRAY(value)) {
    const length = arrayLength(
      GET_OWN_PROPERTY_DESCRIPTOR(value, "length"),
    );
    const ownNames = GET_OWN_PROPERTY_NAMES(value);
    if (ownArrayLength(ownNames) !== length + 1) return nonPlainJsonData();

    let encoded = "[";
    for (let index = 0; index < length; index += 1) {
      if (index !== 0) encoded += ",";
      encoded += serializeCanonical(dataPropertyValue(
        GET_OWN_PROPERTY_DESCRIPTOR(value, TO_STRING(index)),
      ));
    }
    return `${encoded}]`;
  }

  const ownNames = sortedOwnPropertyNames(value);
  const ownNameCount = ownArrayLength(ownNames);
  let encoded = "{";
  for (let index = 0; index < ownNameCount; index += 1) {
    const keyDescriptor = GET_OWN_PROPERTY_DESCRIPTOR(
      ownNames,
      TO_STRING(index),
    );
    const key = dataPropertyValue(keyDescriptor);
    if (typeof key !== "string") return nonPlainJsonData();
    if (index !== 0) encoded += ",";
    encoded += `${serializeJsonPrimitive(key)}:${serializeCanonical(
      dataPropertyValue(GET_OWN_PROPERTY_DESCRIPTOR(value, key)),
    )}`;
  }
  return `${encoded}}`;
}

export function canonicalJson(value: unknown): string {
  return serializeCanonical(canonicalProjection(value));
}

export function bundleHash(value: unknown): string {
  return HASH("sha256", canonicalJson(value), "hex");
}
