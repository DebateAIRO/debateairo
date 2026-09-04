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

export function repin(
  currentBundle: PolicyBundle,
  request: RepinRequest,
  environment: TokenEnvironment,
): PolicyBundle {
  const current = policyBundleSchema.parse(currentBundle);
  const custodian = current.custodians[0];
  const expectedToken = custodian === undefined
    ? undefined
    : environment[custodian.token_env];

  if (
    expectedToken === undefined ||
    expectedToken.length === 0 ||
    !timingSafeEqual(tokenDigest(request.token), tokenDigest(expectedToken))
  ) {
    throw new RepinRefusedError();
  }

  return policyBundleSchema.parse(request.next_bundle ?? current);
}
