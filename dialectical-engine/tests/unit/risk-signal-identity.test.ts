import { describe, expect, it } from "vitest";
import { riskSignalFailureIdentity } from "../../apps/api/src/risk-signal-identity.js";

/**
 * F-RISK-IDENTITY-LOG. The formatter turns a DISCARDED risk-signal failure into the text
 * `main.ts` logs beside a fixed tag. The property under test is not "the sensitive string I
 * happened to plant is absent" — it is that the WHOLE output is drawn from a closed alphabet
 * of literals owned by the formatter's module, so no field of the caught value can reach the
 * log whatever it contains.
 *
 * The alphabet below is written out here on purpose rather than imported from the module:
 * importing the module's own set and asserting membership in it would pass for any widening
 * of that set. Widening the alphabet must break this file.
 */

/** Every reason literal the formatter may emit. Provenance is the grep in the round's 02-sweep.log. */
const ALLOWED_REASONS = [
  // Thrown by the two services that own the observer.
  "LOGIN_RISK_SIGNAL_SCOPE_UNRESOLVED",       // apps/api/src/sessions.ts
  "RECOVERY_RISK_SIGNAL_SCOPE_UNRESOLVED",    // apps/api/src/recovery.ts
  // Thrown by the repository the observer wraps.
  "AUTH_RISK_SIGNAL_SCOPE_UNRESOLVED",        // packages/db/src/auth-risk.ts
  "AUTH_RISK_SIGNAL_SCOPE_AMBIGUOUS",         // packages/db/src/auth-risk.ts
  "AUTH_RISK_SIGNAL_SCAN_SATURATED",          // packages/db/src/auth-risk.ts
  "AUTH_RISK_SIGNAL_CROSS_ACCOUNT",           // packages/db/src/auth-risk.ts
  "AUTH_RISK_SIGNAL_POISONED",                // packages/db/src/auth-risk.ts
  "AUDIT_CONTEXT_DIGEST_INVALID",             // packages/db/src/auth-risk.ts
  // Fixed codes of the crypto errors the recording path can raise.
  "CRYPTO_AAD_INVALID",
  "CRYPTO_AUDIT_CHAIN_INVALID",
  "CRYPTO_CANONICAL_VALUE_INVALID",
  "CRYPTO_EMAIL_INVALID",
  "CRYPTO_KEY_INVALID",
  "CRYPTO_AUTHENTICATION_FAILED",
  "KEK_UNRESOLVED",
  // Fixed codes of the audit-context hashing pool.
  "ARGON2_POOL_CAPACITY_EXHAUSTED",
  "ARGON2_POOL_UNAVAILABLE",
  "ARGON2_WORKER_FAILED",
  "ARGON2_JOB_TIMEOUT",
  // The one fallback.
  "unrecognized-error"
] as const;

/** Every category literal the formatter may emit. */
const ALLOWED_CATEGORIES = [
  "application-invariant",
  "malformed-payload",
  "crypto",
  "hashing-unavailable",
  "database",
  "filesystem",
  "network",
  "aggregate-failure",
  "generic-error",
  "not-an-error",
  "unrecognized-error"
] as const;

// Synthetic only. Nothing here is, or resembles, a live secret: the token is a literal
// placeholder, the digest and ciphertext are constant fills, and the address is in the
// reserved .test TLD.
const FAKE_TOKEN = "dbai_sess_PLACEHOLDERTOKENVALUE0000000000000000";
const FAKE_HASH = `argon2id-audit:v1:${"a".repeat(64)}`;
const FAKE_CIPHERTEXT = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const FAKE_SQL = `INSERT INTO identity."user" (email) VALUES ('subject@example.test')`;
// Short and SCREAMING_SNAKE on purpose: a "forward the message when it is shaped like a
// constant" rule would pass this straight through, and the long probes below are too long
// for the 64-character bound such a rule usually carries. Without this one the corpus does
// not distinguish an explicit map from a shape test — measured, this round: the regex
// mechanism codex rejected survived the corpus until this literal was added.
const FAKE_UPPER_SECRET = "SESSION_TOKEN_A1B2C3D4E5F6";
const SENSITIVE = [FAKE_TOKEN, FAKE_HASH, FAKE_CIPHERTEXT, FAKE_SQL, FAKE_UPPER_SECRET] as const;

function fieldsOf(line: string): Readonly<{ reason: string; category: string }> {
  const match = /^reason=([^ ]+) category=([^ ]+)$/u.exec(line);
  expect(match, `output is not the fixed two-field shape: ${JSON.stringify(line)}`).not.toBeNull();
  return Object.freeze({ reason: match![1]!, category: match![2]! });
}

/** Inputs an attacker-influenced or driver-produced failure could plausibly present. */
const CORPUS: readonly (readonly [string, unknown])[] = [
  ["every selected field carries planted content", Object.assign(
    new Error(`${FAKE_SQL} ${FAKE_TOKEN}`), { name: FAKE_HASH, code: FAKE_CIPHERTEXT }
  )],
  ["a driver rejection shaped like pg's DatabaseError", Object.assign(
    new Error(`duplicate key value violates unique constraint — ${FAKE_SQL}`),
    { name: "error", code: "23505", detail: FAKE_TOKEN, table: "user" }
  )],
  // Messages a "forward it when it looks like a constant" rule would forward whole.
  ["an unknown all-caps message", new TypeError(`UNKNOWN_REASON_CARRYING_${FAKE_CIPHERTEXT}`)],
  ["a short message shaped exactly like a reason constant", new TypeError(FAKE_UPPER_SECRET)],
  ["a short constant-shaped code", Object.assign(new Error("boom"), { code: FAKE_UPPER_SECRET })],
  ["an unknown all-caps code", Object.assign(new Error("boom"), { code: `UNKNOWN_${FAKE_CIPHERTEXT}` })],
  ["a known reason placed in the wrong field", Object.assign(
    new Error(FAKE_TOKEN), { name: "LOGIN_RISK_SIGNAL_SCOPE_UNRESOLVED" }
  )],
  ["a filesystem rejection naming a key path", Object.assign(
    new Error(`ENOENT: no such file or directory, open '/srv/keys/${FAKE_HASH}'`),
    { name: "Error", code: "ENOENT", path: `/srv/keys/${FAKE_HASH}` }
  )],
  ["a socket rejection", Object.assign(new Error("connect ECONNREFUSED 192.0.2.1:5432"), { code: "ECONNREFUSED" })],
  ["a crypto authentication failure", Object.assign(
    new Error("CRYPTO_AUTHENTICATION_FAILED"), { name: "CryptoAuthenticationError", code: "CRYPTO_AUTHENTICATION_FAILED" }
  )],
  ["an argon2 pool failure", Object.assign(
    new Error("ARGON2_POOL_UNAVAILABLE"), { name: "Argon2InfrastructureError", code: "ARGON2_POOL_UNAVAILABLE" }
  )],
  ["a numeric code", Object.assign(new Error(FAKE_SQL), { code: 1062 })],
  ["a SyntaxError from a parser", new SyntaxError(`Unexpected token in JSON at position 0 — ${FAKE_CIPHERTEXT}`)],
  ["an AggregateError", new AggregateError([new Error(FAKE_TOKEN)], FAKE_SQL)],
  ["a thrown string", `${FAKE_TOKEN} ${FAKE_SQL}`],
  ["a thrown null", null],
  ["a thrown undefined", undefined],
  ["a thrown number", 42],
  ["a thrown plain object wearing error field names", { name: FAKE_HASH, code: FAKE_CIPHERTEXT, message: FAKE_SQL }],
  ["a thrown object whose toString leaks", { toString: () => FAKE_TOKEN }]
];

describe("F-RISK-IDENTITY-LOG risk-signal failure diagnostics", () => {
  it("emits only literals from the closed alphabet, for every shape a failure can take", () => {
    for (const [label, thrown] of CORPUS) {
      const line = riskSignalFailureIdentity(thrown);
      const { reason, category } = fieldsOf(line);
      expect(ALLOWED_REASONS, `${label}: reason outside the alphabet`).toContain(reason);
      expect(ALLOWED_CATEGORIES, `${label}: category outside the alphabet`).toContain(category);
    }
  });

  it("omits planted token, digest, ciphertext and SQL content from every field", () => {
    for (const [label, thrown] of CORPUS) {
      const line = riskSignalFailureIdentity(thrown);
      for (const secret of SENSITIVE) {
        expect(line, `${label}: forwarded planted content`).not.toContain(secret);
      }
      // Nothing beyond the two bounded fields, whatever the caught value carried.
      expect(line, `${label}: extra text beside the two fields`)
        .toMatch(/^reason=[^ ]+ category=[^ ]+$/u);
    }
  });

  it("keeps the two scope-unresolved identities visible by name", () => {
    expect(riskSignalFailureIdentity(new TypeError("LOGIN_RISK_SIGNAL_SCOPE_UNRESOLVED")))
      .toBe("reason=LOGIN_RISK_SIGNAL_SCOPE_UNRESOLVED category=application-invariant");
    expect(riskSignalFailureIdentity(new TypeError("RECOVERY_RISK_SIGNAL_SCOPE_UNRESOLVED")))
      .toBe("reason=RECOVERY_RISK_SIGNAL_SCOPE_UNRESOLVED category=application-invariant");
  });

  it("names the recording path's other bounded reasons instead of collapsing them", () => {
    expect(riskSignalFailureIdentity(new TypeError("AUTH_RISK_SIGNAL_SCOPE_AMBIGUOUS")))
      .toBe("reason=AUTH_RISK_SIGNAL_SCOPE_AMBIGUOUS category=application-invariant");
    expect(riskSignalFailureIdentity(Object.assign(
      new Error("KEK_UNRESOLVED"), { name: "KekUnresolvedError", code: "KEK_UNRESOLVED" }
    ))).toBe("reason=KEK_UNRESOLVED category=crypto");
    expect(riskSignalFailureIdentity(Object.assign(
      new Error("some driver prose"), { name: "error", code: "23505" }
    ))).toBe("reason=unrecognized-error category=database");
  });

  it("does not accept a message merely SHAPED like a reason constant", () => {
    // The mechanism must be an explicit map of known constants, not a test of the message's
    // shape: an uppercase regex leaves `name` and `code` unsanitised and forwards any
    // constant-shaped text an upstream module or a driver happens to produce
    // (codex sessions-argon2 r1 F2).
    expect(riskSignalFailureIdentity(new TypeError(FAKE_UPPER_SECRET)))
      .toBe("reason=unrecognized-error category=application-invariant");
    expect(riskSignalFailureIdentity(Object.assign(
      new Error("driver prose"), { name: "error", code: FAKE_UPPER_SECRET }
    ))).toBe("reason=unrecognized-error category=database");
  });
});
