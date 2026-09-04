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

  return policyBundleSchema.parse(request.next_bundle ?? current);
}
