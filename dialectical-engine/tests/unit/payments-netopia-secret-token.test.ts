// tests/unit/payments-netopia-secret-token.test.ts
// N2 (spec 2026-10-05 §2.2 rule 5, §2.20.2): a saved card's token never prints its value, and reveal() is the one way to it.
import { createHash } from "node:crypto";
import { format, inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import { createSecretToken } from "@debateai/payments-netopia";

const PLAIN = ["tok", "secret", "abcdef", "0123"].join("-");

describe("N2 — createSecretToken (spec §2.2 rule 5)", () => {
  it("reveals its plaintext only through reveal(), and fingerprints it", () => {
    const token = createSecretToken(PLAIN);
    expect(token.reveal()).toBe(PLAIN);
    expect(token.fingerprint).toBe(createHash("sha256").update(PLAIN, "utf8").digest("hex"));
    expect(createSecretToken(PLAIN).fingerprint).toBe(token.fingerprint);
    expect(createSecretToken(`${PLAIN}x`).fingerprint).not.toBe(token.fingerprint);
  });

  it("prints [token] under String, templates, +, JSON, inspect in every mode, format and Error messages", () => {
    const token = createSecretToken(PLAIN);
    const renderings: string[] = [
      String(token), `${token}`, `prefix ${token} suffix`, "a" + token, token.toString(), JSON.stringify(token),
      JSON.stringify({ card: { token } }), JSON.stringify([token]), inspect(token), inspect({ token }),
      inspect(token, { showHidden: true, depth: null }), inspect(token, { customInspect: false, showHidden: true }),
      inspect({ nested: { token } }, { customInspect: false, depth: null }), format("%s", token), format("%j", { token }),
      format("%o", token), format("%O", { token }), new Error(`charge failed for ${token}`).message, String(new Error(String(token))),
      Object.keys(token).join(","), JSON.stringify(Object.entries(token)), JSON.stringify(structuredClone({ ...token }))
    ];
    for (const rendering of renderings) expect(rendering).not.toContain(PLAIN);
    expect([String(token), JSON.stringify(token), inspect(token)]).toEqual(["[token]", '"[token]"', "[token]"]);
  });

  it("is frozen, and refuses a value that is not a token without echoing it", () => {
    const token = createSecretToken(PLAIN);
    expect(Object.isFrozen(token)).toBe(true);
    expect(() => { (token as { fingerprint: string }).fingerprint = "x"; }).toThrow(TypeError);
    for (const value of ["", "abcd", "x".repeat(1025), "has space", "line\nbreak", "tab\tbreak", "é".repeat(8), 12345, null]) {
      let caught: unknown = null;
      try { createSecretToken(value as string); } catch (error) { caught = error; }
      expect((caught as TypedDomainError).code, String(value).slice(0, 10)).toBe("SECRET_TOKEN_INVALID");
      if (typeof value === "string" && value.length > 0) expect((caught as Error).message).not.toContain(value);
    }
    expect(createSecretToken("abcde").reveal()).toBe("abcde");
    expect(createSecretToken("x".repeat(1024)).reveal()).toHaveLength(1024);
  });
});
