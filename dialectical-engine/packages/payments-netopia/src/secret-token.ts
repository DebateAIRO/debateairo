// packages/payments-netopia/src/secret-token.ts
import { createHash } from "node:crypto";
import { inspect } from "node:util";
import { TypedDomainError } from "@debateai/kernel";
import type { SecretToken } from "@debateai/billing-core";

/*
 * Spec 2026-10-05 §2.2 rule 5: the plaintext lives in a #private field (no enumeration, spread, clone or inspect reaches it);
 * every printing path says [token]; reveal() is the one way to it (the request writer, and the records seal).
 */
const REDACTED = "[token]";
const TOKEN_TEXT = /^[\x21-\x7e]{5,1024}$/u;

class RedactedToken implements SecretToken {
  readonly #plaintext: string;
  readonly fingerprint: string;
  constructor(plaintext: string) {
    this.#plaintext = plaintext;
    this.fingerprint = createHash("sha256").update(plaintext, "utf8").digest("hex");
    Object.freeze(this);
  }
  reveal(): string { return this.#plaintext; }
  toString(): string { return REDACTED; }
  toJSON(): string { return REDACTED; }
  [Symbol.toPrimitive](): string { return REDACTED; }
  [inspect.custom](): string { return REDACTED; }
}

/** True exactly when createSecretToken accepts the value: printable ASCII without spaces, 5 to 1024 characters. */
export function isSecretTokenText(value: unknown): value is string {
  return typeof value === "string" && TOKEN_TEXT.test(value);
}

export function createSecretToken(plaintext: string): SecretToken {
  if (!isSecretTokenText(plaintext)) {
    throw new TypedDomainError("SECRET_TOKEN_INVALID", "the card token is not a valid token text");
  }
  return new RedactedToken(plaintext);
}
