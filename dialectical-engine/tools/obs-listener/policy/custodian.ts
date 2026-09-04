import {
  hash as nodeHash,
  timingSafeEqual as nodeTimingSafeEqual,
} from "node:crypto";
import { isProxy } from "node:util/types";

import {
  policyBundleSchema,
  type PolicyBundle,
} from "./loader.js";

const HASH = nodeHash;
const TIMING_SAFE_EQUAL = nodeTimingSafeEqual;
const IS_PROXY = isProxy;
const {
  defineProperty: DEFINE_PROPERTY,
  getOwnPropertyDescriptor: GET_OWN_PROPERTY_DESCRIPTOR,
  getPrototypeOf: GET_PROTOTYPE_OF,
  hasOwn: HAS_OWN,
} = Object;

export type TokenEnvironment = Readonly<Record<string, string | undefined>>;

export interface RepinRequest {
  readonly token: string;
  readonly next_bundle?: unknown;
}

export class RepinRefusedError extends Error {
  readonly code = "REPIN_REFUSED";

  constructor() {
    super("REPIN_REFUSED");
    this.name = "RepinRefusedError";
  }
}

function tokenDigest(token: string): Buffer {
  return HASH("sha256", token, "buffer");
}

function ownStringProperty(value: unknown, key: string): string | undefined {
  if (value === null || typeof value !== "object") return undefined;
  if (IS_PROXY(value)) return undefined;
  try {
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, key);
    if (descriptor === undefined || !HAS_OWN(descriptor, "value")) {
      return undefined;
    }
    const descriptorValue = descriptor.value;
    return typeof descriptorValue === "string" ? descriptorValue : undefined;
  } catch {
    return undefined;
  }
}

type OwnOptionalDataProperty =
  | { readonly kind: "MISSING" }
  | { readonly kind: "VALUE"; readonly value: unknown }
  | { readonly kind: "INVALID" };

function ownArrayLength(value: readonly unknown[]): number | null {
  const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, "length");
  if (
    descriptor === undefined ||
    !HAS_OWN(descriptor, "value") ||
    !Number.isSafeInteger(descriptor.value) ||
    descriptor.value < 0
  ) {
    return null;
  }
  return descriptor.value as number;
}

function arrayContainsIdentity(
  values: readonly object[],
  candidate: object,
): boolean {
  const length = ownArrayLength(values);
  if (length === null) return true;
  for (let index = 0; index < length; index += 1) {
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(values, String(index));
    if (
      descriptor === undefined ||
      !HAS_OWN(descriptor, "value") ||
      descriptor.value === candidate
    ) {
      return true;
    }
  }
  return false;
}

function appendIdentity(values: object[], candidate: object): boolean {
  const length = ownArrayLength(values);
  if (length === null) return false;
  DEFINE_PROPERTY(values, String(length), {
    configurable: true,
    enumerable: true,
    value: candidate,
    writable: true,
  });
  return true;
}

function ownOptionalDataProperty(
  value: unknown,
  key: string,
): OwnOptionalDataProperty {
  if (value === null || typeof value !== "object") {
    return { kind: "INVALID" };
  }
  if (IS_PROXY(value)) return { kind: "INVALID" };
  try {
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, key);
    if (descriptor !== undefined) {
      if (!HAS_OWN(descriptor, "value")) return { kind: "INVALID" };
      const descriptorValue = descriptor.value;
      return { kind: "VALUE", value: descriptorValue };
    }

    const visited: object[] = [];
    let prototype = GET_PROTOTYPE_OF(value) as object | null;
    while (prototype !== null) {
      if (IS_PROXY(prototype)) return { kind: "INVALID" };
      if (arrayContainsIdentity(visited, prototype)) {
        return { kind: "INVALID" };
      }
      if (!appendIdentity(visited, prototype)) return { kind: "INVALID" };
      if (GET_OWN_PROPERTY_DESCRIPTOR(prototype, key) !== undefined) {
        return { kind: "INVALID" };
      }
      prototype = GET_PROTOTYPE_OF(prototype) as object | null;
    }
    return { kind: "MISSING" };
  } catch {
    return { kind: "INVALID" };
  }
}

function parsePolicyOrRefuse(candidate: unknown): PolicyBundle {
  try {
    return policyBundleSchema.parse(candidate);
  } catch {
    throw new RepinRefusedError();
  }
}

export function repin(
  currentBundle: PolicyBundle,
  request: RepinRequest,
  environment: TokenEnvironment,
): PolicyBundle {
  const current = parsePolicyOrRefuse(currentBundle);
  const custodianDescriptor = GET_OWN_PROPERTY_DESCRIPTOR(
    current.custodians,
    "0",
  );
  const custodian = custodianDescriptor !== undefined &&
      HAS_OWN(custodianDescriptor, "value")
    ? custodianDescriptor.value as PolicyBundle["custodians"][number]
    : undefined;
  const expectedToken = custodian === undefined
    ? undefined
    : ownStringProperty(environment, custodian.token_env);
  const suppliedToken = ownStringProperty(request, "token");

  if (
    expectedToken === undefined ||
    expectedToken.length === 0 ||
    suppliedToken === undefined ||
    suppliedToken.length === 0 ||
    !TIMING_SAFE_EQUAL(tokenDigest(suppliedToken), tokenDigest(expectedToken))
  ) {
    throw new RepinRefusedError();
  }

  const nextBundle = ownOptionalDataProperty(request, "next_bundle");
  if (nextBundle.kind === "INVALID") throw new RepinRefusedError();
  return nextBundle.kind === "MISSING"
    ? current
    : parsePolicyOrRefuse(nextBundle.value);
}
