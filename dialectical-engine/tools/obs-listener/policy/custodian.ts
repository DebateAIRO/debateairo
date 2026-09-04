import { createHash, timingSafeEqual } from "node:crypto";

import {
  policyBundleSchema,
  type PolicyBundle,
} from "./loader.js";

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
  return createHash("sha256").update(token, "utf8").digest();
}

function ownStringProperty(value: unknown, key: string): string | undefined {
  if (value === null || typeof value !== "object") return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined &&
      "value" in descriptor &&
      typeof descriptor.value === "string"
      ? descriptor.value
      : undefined;
  } catch {
    return undefined;
  }
}

type OwnOptionalDataProperty =
  | { readonly kind: "MISSING" }
  | { readonly kind: "VALUE"; readonly value: unknown }
  | { readonly kind: "INVALID" };

function ownOptionalDataProperty(
  value: unknown,
  key: string,
): OwnOptionalDataProperty {
  if (value === null || typeof value !== "object") {
    return { kind: "INVALID" };
  }
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined) {
      return "value" in descriptor
        ? { kind: "VALUE", value: descriptor.value }
        : { kind: "INVALID" };
    }

    const visited = new Set<object>();
    let prototype = Object.getPrototypeOf(value) as object | null;
    while (prototype !== null) {
      if (visited.has(prototype)) return { kind: "INVALID" };
      visited.add(prototype);
      if (Object.getOwnPropertyDescriptor(prototype, key) !== undefined) {
        return { kind: "INVALID" };
      }
      prototype = Object.getPrototypeOf(prototype) as object | null;
    }
    return { kind: "MISSING" };
  } catch {
    return { kind: "INVALID" };
  }
}

export function repin(
  currentBundle: PolicyBundle,
  request: RepinRequest,
  environment: TokenEnvironment,
): PolicyBundle {
  const current = policyBundleSchema.parse(currentBundle);
  const custodian = current.custodians[0];
  const expectedToken = custodian === undefined
    ? undefined
    : ownStringProperty(environment, custodian.token_env);
  const suppliedToken = ownStringProperty(request, "token");

  if (
    expectedToken === undefined ||
    expectedToken.length === 0 ||
    suppliedToken === undefined ||
    suppliedToken.length === 0 ||
    !timingSafeEqual(tokenDigest(suppliedToken), tokenDigest(expectedToken))
  ) {
    throw new RepinRefusedError();
  }

  const nextBundle = ownOptionalDataProperty(request, "next_bundle");
  if (nextBundle.kind === "INVALID") throw new RepinRefusedError();
  return nextBundle.kind === "MISSING"
    ? current
    : policyBundleSchema.parse(nextBundle.value);
}
