import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PRIVACY_SIGN_IN_SWAPS, TERMS_SIGN_IN_SWAPS } from "../support/legalSignIn.js";

/**
 * How you sign in, in the English Terms and Privacy Policy (18 November 2026). The texts named only a password, an
 * authenticator app and recovery codes, and said two-factor authentication is mandatory. The code also has passkeys,
 * which sign you in on their own (apps/api/src/consumer-webauthn.ts), an optional phone number that is never verified
 * and is not a way to sign in (packages/kernel/src/manualPhone.ts), and Google, Apple and X sign-in
 * (apps/api/src/social-providers/provider.ts), advertised only when the sign-in relay is configured. A password, or a
 * Google, Apple or X account, always needs a second step (apps/api/src/sessions.ts, migrations/0178). The translations
 * follow before release: English first.
 */

const root = process.cwd();
const legal = (name: string): string => readFileSync(resolve(root, "apps/ui/legal/en", name), "utf8");

describe("sign-in methods, in the English legal texts", () => {
  const terms = legal("terms-of-service.md");
  const privacy = legal("privacy-policy.md");

  it("each text carries the new sign-in wording, once, and the replaced wording is gone", () => {
    for (const [name, text, swaps] of [["privacy-policy.md", privacy, PRIVACY_SIGN_IN_SWAPS], ["terms-of-service.md", terms, TERMS_SIGN_IN_SWAPS]] as const) {
      for (const [before, after] of swaps) {
        expect(text.split(after), name).toHaveLength(2);
        // A change-history swap only appends a sentence, so its old text lives on inside the new one.
        if (!after.includes(before)) expect(text, `${name}: the old wording is gone`).not.toContain(before);
      }
    }
  });

  it("neither text says flatly that two-factor authentication is mandatory, since a passkey signs you in on its own", () => {
    for (const [name, text] of [["terms-of-service.md", terms], ["privacy-policy.md", privacy]] as const) {
      expect(text, name).not.toMatch(/two-factor authentication[^.]*mandatory/iu);
      expect(text, name).toContain("never enough on its own");
      expect(text, name).toMatch(/passkey/u);
      expect(text, name).toMatch(/face, fingerprint or PIN/u);
    }
  });

  it("both texts name Google, Apple and X sign-in where the sign-in page offers it, and the phone number as no way to sign in", () => {
    for (const [name, text] of [["terms-of-service.md", terms], ["privacy-policy.md", privacy]] as const) {
      expect(text, name).toContain("Google, Apple or X");
      expect(text, name).toContain("where the sign-in page offers it");
      expect(text, name).toMatch(/phone number[^.]*(not a way to sign in|cannot sign in with it)/u);
    }
    expect(privacy).toContain("we send no text messages to it");
    expect(privacy).toContain("X's permission screen also lists reading your posts");
  });

  it("the providers the texts name are the ones the code can offer (Facebook never is)", () => {
    const provider = readFileSync(resolve(root, "apps/api/src/social-providers/provider.ts"), "utf8");
    expect(provider).toContain("z.enum(['google', 'apple', 'facebook', 'x'])");
    expect(provider).toContain("c.provider !== 'facebook'");
    expect(provider).toContain("config.provider === 'x' ? 'tweet.read users.read users.email'");
    for (const text of [terms, privacy]) expect(text).not.toContain("Facebook");
  });

  it("each change history names the sign-in change", () => {
    expect(terms).toContain("Version 2.18 also says how you can sign in:");
    expect(privacy).toContain("Version 3.12 also says how you can sign in and what each way keeps:");
  });
});
