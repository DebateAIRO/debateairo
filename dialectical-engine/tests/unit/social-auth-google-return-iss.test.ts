import { describe, expect, it } from "vitest";
import { SocialAuthService } from "../../apps/api/src/social-auth.js";

/**
 * Google names itself on the way back: its return address carries `iss=https://accounts.google.com`
 * next to `state` and `code` (RFC 9207; Google's published settings say
 * `authorization_response_iss_parameter_supported: true`). Seen on dezbatere.ro on 2026-11-25: the
 * return was refused before the flow was even claimed, because `iss` was not among the fields the
 * API accepts from Google, so every real Google sign-in ended at "Sign-in could not be completed."
 */
const CONFIG = { provider: "google", configuration: "sha256:" + "a".repeat(64), clientId: "client", appScope: "scope", callback: "https://site.example.test/v1/auth/social/google/callback" };
const SOURCE = { ip: "203.0.113.7" };

function service() {
  const seen = { claims: 0, verified: 0, finished: 0 };
  let nonceHash = "";
  const repository = {
    begin: async (input: { nonceHash: string }) => { nonceHash = input.nonceHash; return { expiresAt: new Date(Date.now() + 300_000) }; },
    claim: async () => { seen.claims += 1; return { claimId: "00000000-0000-4000-8000-000000000001", nonceHash, purpose: "LOGIN", next: "/new", expiresAt: new Date(Date.now() + 300_000) }; },
    callback: async () => { seen.finished += 1; return { status: "signup_required", next: "/new" }; }
  };
  const providers = {
    available: async () => [CONFIG],
    verify: async () => { seen.verified += 1; return { provider: "google", issuer: "https://accounts.google.com", subject: "subject-1", email: "person@example.test", name: null, emailTrust: "local" }; }
  };
  const sessions = { admit: async () => ({}), bindingHash: () => "binding" };
  const social = new SocialAuthService(repository as never, providers as never, sessions as never, { registration: {} as never, security: {} as never, authPolicy: {} as never, blindIndexKey: new Uint8Array(32).fill(7) });
  return { social, seen };
}

async function comeBack(extra: Record<string, unknown>) {
  const { social, seen } = service();
  const begun = await social.begin("google", {}, SOURCE as never);
  const state = new URL(begun.authorization_url).searchParams.get("state")!;
  const result = social.callback("google", { state, code: "4/0Abc-def", scope: "email profile openid", authuser: "0", prompt: "consent", ...extra }, begun.flowCookie, SOURCE as never);
  return { result, seen };
}

describe("a return from Google that names its issuer", () => {
  it("is accepted when the issuer is Google's own", async () => {
    const { result, seen } = await comeBack({ iss: "https://accounts.google.com" });
    await expect(result).resolves.toMatchObject({ status: "signup_required", next: "/new" });
    expect(seen).toEqual({ claims: 1, verified: 1, finished: 1 });
  });

  it("is still accepted with no issuer field", async () => {
    const { result, seen } = await comeBack({});
    await expect(result).resolves.toMatchObject({ status: "signup_required" });
    expect(seen.claims).toBe(1);
  });

  it.each([
    ["another issuer", "https://evil.example.test"],
    ["Google's name without https", "accounts.google.com"],
    ["a trailing slash", "https://accounts.google.com/"],
    ["an empty value", ""],
    ["a repeated field", ["https://accounts.google.com", "https://accounts.google.com"]]
  ])("is refused for %s, before the flow is claimed", async (_name, iss) => {
    const { result, seen } = await comeBack({ iss });
    await expect(result).rejects.toMatchObject({ code: "SOCIAL_PROOF_INVALID" });
    expect(seen).toEqual({ claims: 0, verified: 0, finished: 0 });
  });

  it("still refuses a field Google does not send", async () => {
    const { result, seen } = await comeBack({ session_state: "x" });
    await expect(result).rejects.toMatchObject({ code: "SOCIAL_PROOF_INVALID" });
    expect(seen.claims).toBe(0);
  });
});

describe("a return from another company", () => {
  it("is refused when it carries an issuer field", async () => {
    const { social } = service();
    await expect(social.callback("x", { state: "A".repeat(43), code: "c", iss: "https://accounts.google.com" }, "B".repeat(43), SOURCE as never)).rejects.toMatchObject({ code: "SOCIAL_PROOF_INVALID" });
  });
});
