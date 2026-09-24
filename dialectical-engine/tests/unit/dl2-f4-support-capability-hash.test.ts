import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hashToken, type TokenKind } from "../../packages/crypto/src/index.js";
import { hashSupportCapability } from "../../apps/api/src/support/session.js";

/**
 * DL2-F4. Support session and case tokens were hashed with a bare, unkeyed
 * `sha256(token)` and no purpose label — the exact pattern B19 replaced with
 * `hashToken(kind, token)` for every other opaque token in the system. The
 * DEV-SYNC check that looked for surviving callers of the unlabelled digest
 * could not see this parallel copy, because it lives in the support module
 * rather than in `@debateai/crypto`.
 *
 * `apps/api/src/support/**` may not import the identity crypto package
 * (SUP-01's import boundary), so the support module computes the digest itself.
 * These tests are what stops the two constructions drifting: the support digest
 * must be B19's digest for the same purpose label, byte for byte, and the two
 * purpose labels must belong to the one `TokenKind` vocabulary so no other
 * subsystem can reuse them.
 */
const SUPPORT_KINDS = Object.freeze(["support-session", "support-case"] as const);

function capability(): string {
  return randomBytes(32).toString("base64url");
}

describe("DL2-F4 support capabilities hash with a purpose label", () => {
  it("names both support purposes in the one token-kind vocabulary", () => {
    for (const kind of SUPPORT_KINDS) {
      const usable: TokenKind = kind;
      expect(() => hashToken(usable, capability())).not.toThrow();
    }
  });

  it("produces exactly B19's digest for the same purpose, in the column's grammar", () => {
    for (const kind of SUPPORT_KINDS) {
      const token = capability();
      const support = hashSupportCapability(kind, token);
      // `support.session.session_token_sha256` and `support."case".token_sha256`
      // are char(64) CHECKed against `^[0-9a-f]{64}$`, so the shared `sha256:`
      // prefix of the B19 grammar cannot travel with it.
      expect(support).toMatch(/^[0-9a-f]{64}$/u);
      expect(`sha256:${support}`).toBe(hashToken(kind, token));
    }
  });

  it("is no longer the unlabelled digest, and never matches across purposes", () => {
    const token = capability();
    const bare = createHash("sha256").update(token, "utf8").digest("hex");
    const session = hashSupportCapability("support-session", token);
    const supportCase = hashSupportCapability("support-case", token);
    expect(session).not.toBe(bare);
    expect(supportCase).not.toBe(bare);
    // A token presented as a session capability can never match a case row.
    expect(session).not.toBe(supportCase);
  });

  it("still refuses anything outside the 43-character capability grammar", () => {
    for (const malformed of [
      "", "short", `${capability()}=`, `${capability()}a`, capability().slice(0, 42)
    ]) {
      expect(hashSupportCapability("support-session", malformed)).toBeNull();
    }
  });
});
