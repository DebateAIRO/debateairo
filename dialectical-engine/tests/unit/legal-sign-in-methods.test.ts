import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

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

/** Each pair is [the wording that is gone, the wording the text carries now]. */
const PRIVACY_SIGN_IN: readonly (readonly [string, string])[] = [
  [
    "password (stored as a hash, never in clear); your two-factor authentication secret (encrypted); ten recovery codes (stored as hashes); your pseudonym | You, at registration |",
    "password (stored as a hash, never in clear), unless you signed up with Google, Apple or X and have none; your two-factor authentication secret (encrypted), if you use an authenticator app; ten recovery codes (stored as hashes); for each passkey you create, the public key and identifier your device gives us, a count of its uses, whether it can be synced between your devices and is backed up, how your device reaches it, the name you give it, if any, and when it was created, last used or removed (the face, fingerprint or PIN check of a passkey happens on your device, and nothing of it reaches us); if you sign in with Google, Apple or X, which of them and the identifier it gives you there (that company also sends us your name and email address there: we use them only to fill in the sign-up form, keep them in our server's memory for at most 5 minutes and do not store them, and if the email address you give us is one Google or Apple has confirmed, we do not send you a verification email; X's permission screen also lists reading your posts, but we ask X only for your identifier, your name and your confirmed email address; that company learns that you use our service, under its own privacy policy); a phone number, if you choose to give one (stored encrypted, and Settings shows only its last four digits unless you confirm it is you and ask to see the whole number; we do not check that it is yours, it is not a way to sign in, and we send no text messages to it); your pseudonym | You, at registration and in Settings; Google, Apple or X, if you sign in with one of them |"
  ],
  [
    "Passwords are hashed with Argon2id. Two-factor authentication is mandatory.",
    "Passwords are hashed with Argon2id. Signing in always takes two checks. A password is never enough on its own, and neither is a Google, Apple or X account: after it you must also give a code from your authenticator app, use a passkey or enter one of your recovery codes. A passkey signs you in on its own because it makes both checks itself: you must have the device it is on, and unlock it with your face, fingerprint or PIN. Your account must always keep a passkey or an authenticator app."
  ]
];
const TERMS_SIGN_IN: readonly (readonly [string, string])[] = [
  [
    "You register with an email address, a password, a recovery email address and two-factor authentication, which is mandatory. We give you a random **pseudonym**, which is the name shown on anything you publish. It cannot be changed. Keep your password, your authentication app and your recovery codes safe.",
    "You register with an email address, and you may add a recovery email address and a phone number; we do not check that the number is yours, and you cannot sign in with it. You sign in with a passkey, which uses your device's usual face, fingerprint or PIN check, or with your password, or, where the sign-in page offers it, with your Google, Apple or X account. A password, or a Google, Apple or X account, is never enough on its own: you must also give a code from your authentication app, use a passkey or enter one of your recovery codes, and your account must always keep a passkey or an authentication app. If you sign in with Google, Apple or X, that company's own terms also apply between you and it. We give you a random **pseudonym**, which is the name shown on anything you publish. It cannot be changed. Keep your password, your passkeys, your authentication app and your recovery codes safe."
  ]
];
const legal = (name: string): string => readFileSync(resolve(root, "apps/ui/legal/en", name), "utf8");

describe("sign-in methods, in the English legal texts", () => {
  const terms = legal("terms-of-service.md");
  const privacy = legal("privacy-policy.md");

  it("each text carries the new sign-in wording, once, and the replaced wording is gone", () => {
    for (const [name, text, swaps] of [["privacy-policy.md", privacy, PRIVACY_SIGN_IN], ["terms-of-service.md", terms, TERMS_SIGN_IN]] as const) {
      for (const [gone, now] of swaps) {
        expect(text.split(now), name).toHaveLength(2);
        expect(text, `${name}: the old wording is gone`).not.toContain(gone);
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
      expect(text, name).toMatch(/phone number[^.]*(not a way to sign in|cannot sign in with it)/u);
    }
    // The Privacy Policy said "where the sign-in page offers it" only in its 3.13 history entry, which the 1.0 text no
    // longer carries; the Terms say it in section 6.
    expect(terms).toContain("where the sign-in page offers it");
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

  it("no change history says that signing in changed: both texts said how you sign in at launch", () => {
    const history = (text: string): string[] => [...text.matchAll(/(Version|version) \d+\.\d+ replaced/gu)].map((match) => match[0]);
    expect(history(terms)).toEqual(["Version 1.1 replaced"]);
    expect(history(privacy)).toEqual(["Version 1.2 replaced", "Version 1.1 replaced"]);
    // 1.1's summary is about DeepInfra, and says nothing of signing in.
    for (const text of [terms, privacy]) {
      const summary = text.slice(text.indexOf("Version 1.1 replaced"));
      expect(summary.slice(0, summary.indexOf("\n"))).not.toMatch(/sign in|sign-in|passkey|phone/iu);
    }
    // 1.2's summary is about asking for help getting back into an account, not about how you sign in.
    const twelve = privacy.slice(privacy.indexOf("Version 1.2 replaced"), privacy.indexOf("Version 1.1 replaced"));
    expect(twelve).toContain("ask for help getting back into your account");
    expect(twelve).not.toMatch(/sign in|phone/iu);
  });

  it("says the recovery email address is optional, and that Settings shows the whole phone number only after you confirm it is you", () => {
    // Sign-up never asks for a recovery address (apps/api/src/registration.ts: RegisterInput's recoveryEmail is optional,
    // and social sign-up drops it); Settings adds one (apps/ui/components/EmailSettings.tsx).
    expect(terms).toContain("You register with an email address, and you may add a recovery email address and a phone number;");
    expect(terms).not.toContain("You register with an email address and a recovery email address");
    const registration = readFileSync(resolve(root, "apps/api/src/registration.ts"), "utf8");
    expect(registration).toContain("readonly recoveryEmail?: string | null;");
    expect(registration).toContain('export type SocialRegisterInput = Omit<RegisterInput, "password" | "recoveryEmail">;');
    // Settings masks the number to its last four digits (apps/api/src/account-profile.ts) and shows it whole only after a
    // security confirmation (the READ_PHONE_PROFILE step-up in apps/ui/components/PhoneProfileCard.tsx).
    expect(privacy).toContain("Settings shows only its last four digits unless you confirm it is you and ask to see the whole number;");
    expect(readFileSync(resolve(root, "apps/api/src/account-profile.ts"), "utf8")).toContain("phone.slice(-4)");
    expect(readFileSync(resolve(root, "apps/ui/components/PhoneProfileCard.tsx"), "utf8")).toContain("client.revealPhoneProfile(result.step_up_grant.token)");
  });
});
