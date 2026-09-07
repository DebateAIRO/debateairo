// Bounded diagnostic text for a discarded authentication risk-signal failure.
//
// Lifted out of `main.ts` so it can be unit-tested: `main.ts` is the composition
// root and calls `loadApiEnvironment()` at import, so nothing that lives there is
// reachable from a test process.
//
// The previous form built a NEW object from a named allow-list of three fields —
// which bounded WHICH fields could reach the log, but not what those fields
// CONTAINED. `name`, `code` and `message` were forwarded verbatim, so a driver
// rejection could carry a bound parameter or row text into stderr beside the
// fixed tag (F-RISK-IDENTITY-LOG; codex sessions-argon2 r1 F2).
//
// What is bounded now is the OUTPUT ALPHABET. Every string this module can return
// is a literal declared in this file. Nothing is derived from the caught value —
// no substring, no regex capture, no case transform of it. The caught value is
// only ever used as a LOOKUP KEY, and a key that misses becomes the fallback. A
// "forward the message when it looks like a constant" rule was considered and
// rejected: an uppercase-shaped message is still attacker- or driver-influenced
// text, and it leaves `name` and `code` unsanitised.

/** The one string emitted for anything not in the maps below. */
const UNRECOGNIZED = "unrecognized-error";

/**
 * Application reason constants that can reach a risk-signal observer, keyed by the
 * `message` the throwing site sets. Values are this module's own literals, so the
 * string that reaches the log is never the caught object's string even on a hit.
 *
 * Provenance (grepped at authoring time, 2026-09-07, recorded in 02-sweep.log):
 * the two service constants from `apps/api/src/sessions.ts` and
 * `apps/api/src/recovery.ts`; the repository constants from
 * `packages/db/src/auth-risk.ts`; the crypto codes from `CryptoInputError`,
 * `CryptoAuthenticationError` and `KekUnresolvedError` in `packages/crypto`,
 * whose `message` equals their `code`; the pool codes from `Argon2FailureCode`.
 * The whole `CryptoInputError` union is listed rather than the subset reachable
 * today, because the union is that type's closed contract — enumerating a subset
 * would silently degrade a re-routed crypto rejection to the fallback.
 */
const REASONS: ReadonlyMap<string, string> = new Map([
  ["LOGIN_RISK_SIGNAL_SCOPE_UNRESOLVED", "LOGIN_RISK_SIGNAL_SCOPE_UNRESOLVED"],
  ["RECOVERY_RISK_SIGNAL_SCOPE_UNRESOLVED", "RECOVERY_RISK_SIGNAL_SCOPE_UNRESOLVED"],
  ["AUTH_RISK_SIGNAL_SCOPE_UNRESOLVED", "AUTH_RISK_SIGNAL_SCOPE_UNRESOLVED"],
  ["AUTH_RISK_SIGNAL_SCOPE_AMBIGUOUS", "AUTH_RISK_SIGNAL_SCOPE_AMBIGUOUS"],
  ["AUTH_RISK_SIGNAL_SCAN_SATURATED", "AUTH_RISK_SIGNAL_SCAN_SATURATED"],
  ["AUTH_RISK_SIGNAL_CROSS_ACCOUNT", "AUTH_RISK_SIGNAL_CROSS_ACCOUNT"],
  ["AUTH_RISK_SIGNAL_POISONED", "AUTH_RISK_SIGNAL_POISONED"],
  ["AUDIT_CONTEXT_DIGEST_INVALID", "AUDIT_CONTEXT_DIGEST_INVALID"],
  ["CRYPTO_AAD_INVALID", "CRYPTO_AAD_INVALID"],
  ["CRYPTO_AUDIT_CHAIN_INVALID", "CRYPTO_AUDIT_CHAIN_INVALID"],
  ["CRYPTO_CANONICAL_VALUE_INVALID", "CRYPTO_CANONICAL_VALUE_INVALID"],
  ["CRYPTO_EMAIL_INVALID", "CRYPTO_EMAIL_INVALID"],
  ["CRYPTO_KEY_INVALID", "CRYPTO_KEY_INVALID"],
  ["CRYPTO_AUTHENTICATION_FAILED", "CRYPTO_AUTHENTICATION_FAILED"],
  ["KEK_UNRESOLVED", "KEK_UNRESOLVED"],
  ["ARGON2_POOL_CAPACITY_EXHAUSTED", "ARGON2_POOL_CAPACITY_EXHAUSTED"],
  ["ARGON2_POOL_UNAVAILABLE", "ARGON2_POOL_UNAVAILABLE"],
  ["ARGON2_WORKER_FAILED", "ARGON2_WORKER_FAILED"],
  ["ARGON2_JOB_TIMEOUT", "ARGON2_JOB_TIMEOUT"]
]);

/**
 * Recognized system codes, keyed by `error.code`. Consulted BEFORE the class map
 * because a Node system rejection is a plain `Error` whose class says nothing.
 * A PostgreSQL SQLSTATE is deliberately absent: five characters of a two-hundred
 * member vocabulary would be a derived value, and the class map already answers
 * "the database rejected this" for `pg`'s `DatabaseError`.
 */
const CODE_CATEGORIES: ReadonlyMap<string, string> = new Map([
  ["ENOENT", "filesystem"],
  ["EACCES", "filesystem"],
  ["EPERM", "filesystem"],
  ["EISDIR", "filesystem"],
  ["ECONNREFUSED", "network"],
  ["ECONNRESET", "network"],
  ["ETIMEDOUT", "network"],
  ["ENOTFOUND", "network"],
  ["EPIPE", "network"],
  ["EHOSTUNREACH", "network"]
]);

/**
 * Recognized error classes, keyed by `error.name`. `pg`'s `DatabaseError` sets
 * `name` to the wire message type, so an ordinary query rejection arrives as
 * `"error"` (`pg-protocol/dist/messages.js`).
 */
const CLASS_CATEGORIES: ReadonlyMap<string, string> = new Map([
  ["TypeError", "application-invariant"],
  ["RangeError", "application-invariant"],
  ["SyntaxError", "malformed-payload"],
  ["CryptoError", "crypto"],
  ["CryptoInputError", "crypto"],
  ["CryptoAuthenticationError", "crypto"],
  ["KekUnresolvedError", "crypto"],
  ["Argon2InfrastructureError", "hashing-unavailable"],
  ["AggregateError", "aggregate-failure"],
  ["error", "database"],
  ["Error", "generic-error"]
]);

function reasonOf(error: Error): string {
  return REASONS.get(error.message) ?? UNRECOGNIZED;
}

function categoryOf(error: Error): string {
  const code = (error as { readonly code?: unknown }).code;
  if (typeof code === "string") {
    const byCode = CODE_CATEGORIES.get(code);
    if (byCode !== undefined) return byCode;
  }
  return CLASS_CATEGORIES.get(error.name) ?? UNRECOGNIZED;
}

/**
 * The complete text a discarded risk-signal failure may contribute to a log line,
 * beside `main.ts`'s fixed tag. Always exactly `reason=<r> category=<c>`, both
 * values literals of this module.
 */
export function riskSignalFailureIdentity(error: unknown): string {
  if (!(error instanceof Error)) return `reason=${UNRECOGNIZED} category=not-an-error`;
  return `reason=${reasonOf(error)} category=${categoryOf(error)}`;
}
