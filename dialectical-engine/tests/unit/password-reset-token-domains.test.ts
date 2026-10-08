import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { hashToken, type TokenKind } from "@debateai/crypto";
it("hashes reset capabilities into separate link/session/CSRF/cancel domains and never accepts a T2 digest", () => {
  const token = "A".repeat(43);
  for (const suffix of ["link", "session", "csrf", "cancel"]) {
    const reset = `password-reset-${suffix}` as TokenKind, recovery = `password-recovery-${suffix}` as TokenKind;
    expect(hashToken(reset, token)).toBe(`sha256:${createHash("sha256").update(`debateai:token:${reset}:v1\0${token}`).digest("hex")}`);
    expect(hashToken(reset, token)).not.toBe(`sha256:${createHash("sha256").update(`debateai:token:${recovery}:v1\0${token}`).digest("hex")}`);
    expect(()=>hashToken(recovery,token)).toThrow("CRYPTO_TOKEN_KIND_INVALID");
  }
});
